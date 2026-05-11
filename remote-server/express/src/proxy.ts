import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"

const SESSION_TTL =
  parseInt(process.env.SESSION_TTL_MS || "") || 24 * 3600 * 1000

interface Session {
  token: string
  startAt: number
  lastActiveAt: number
  webSessionId: string
  sessionId: string
}

export class Proxy {
  private webTransports: Map<string, SSEServerTransport> = new Map()
  private transports: Map<string, SSEServerTransport> = new Map()
  private sessions: Map<string, Session> = new Map()
  // Maps old sessionId → current sessionId (handles SSE reconnections)
  private sessionRedirects: Map<string, string> = new Map()
  private timer: NodeJS.Timeout

  constructor() {
    this.timer = setInterval(() => {
      this.ping()
      this.expireSessions()
    }, 1000 * 10)
  }

  private expireSessions() {
    const now = Date.now()
    for (const [token, session] of this.sessions) {
      if (now - session.lastActiveAt > SESSION_TTL) {
        const clientTransport = this.transports.get(session.sessionId)
        const webTransport = this.webTransports.get(session.webSessionId)
        clientTransport?.onclose?.()
        webTransport?.onclose?.()
        this.transports.delete(session.sessionId)
        this.webTransports.delete(session.webSessionId)
        // Clean up redirects pointing to this session
        for (const [from, to] of this.sessionRedirects) {
          if (to === session.sessionId) this.sessionRedirects.delete(from)
        }
        this.sessions.delete(token)
        console.log(`Session expired: ${token.slice(0, 8)}...`)
      }
    }
  }

  async webConnect(
    token: string,
    transport: SSEServerTransport,
    renewal: boolean
  ) {
    let session = this.sessions.get(token)
    if (!session && !renewal) {
      session = {
        token,
        startAt: Date.now(),
        lastActiveAt: Date.now(),
        webSessionId: transport.sessionId,
        sessionId: "",
      }
      this.sessions.set(token, session)
    }

    if (!session) {
      throw new Error("timeout")
    }

    session.webSessionId = transport.sessionId
    this.sessions.set(token, session)

    const stale = this.webTransports.get(session.webSessionId)
    if (stale) {
      this.webTransports.delete(stale.sessionId)
      stale.onmessage = undefined
      stale.onerror = undefined
    }

    this.webTransports.set(transport.sessionId, transport)
    transport.onclose = () => {
      this.webTransports.delete(transport.sessionId)
    }

    const toClient = this.getTransport(session.sessionId)
    if (toClient) {
      this.proxy(toClient, transport)
    }

    await transport.start()
  }

  async connect(token: string, transport: SSEServerTransport) {
    const session = this.sessions.get(token)
    if (!session) {
      throw new Error("Session not found")
    }

    // Track redirect from old sessionId to new one
    if (session.sessionId && session.sessionId !== transport.sessionId) {
      this.sessionRedirects.set(session.sessionId, transport.sessionId)
      console.log(`Session redirect: ${session.sessionId.slice(0, 8)} → ${transport.sessionId.slice(0, 8)}`)
    }

    const stale = this.transports.get(session.sessionId)
    if (stale) {
      this.transports.delete(stale.sessionId)
      stale.onmessage = undefined
      stale.onerror = undefined
    }
    session.sessionId = transport.sessionId
    this.sessions.set(token, session)

    this.transports.set(transport.sessionId, transport)
    transport.onclose = () => {
      this.transports.delete(transport.sessionId)
    }
    const toWeb = this.getWebTransport(session.webSessionId)
    if (toWeb) {
      this.proxy(transport, toWeb)
    } else {
      console.warn("Web transport not found")
    }

    await transport.start()
  }

  /**
   * Resolve sessionId through redirect chain.
   * Handles the case where SSE reconnects generate new sessionIds
   * but clients still POST with the old sessionId.
   */
  private resolveSessionId(sessionId: string): string {
    const seen = new Set<string>()
    let current = sessionId
    while (this.sessionRedirects.has(current)) {
      if (seen.has(current)) break // prevent infinite loop
      seen.add(current)
      current = this.sessionRedirects.get(current)!
    }
    return current
  }

  getWebTransport(sessionId: string) {
    return this.webTransports.get(sessionId)
  }

  getTransport(sessionId: string) {
    const resolved = this.resolveSessionId(sessionId)
    return this.transports.get(resolved)
  }

  validateToken(token: string) {
    const session = this.sessions.get(token)
    if (session) {
      return true
    }
    return false
  }

  private proxy(client: SSEServerTransport, web: SSEServerTransport) {
    let sessionToken: string | null = null
    for (const [token, session] of this.sessions) {
      if (session.sessionId === client.sessionId || session.webSessionId === web.sessionId) {
        sessionToken = token
        break
      }
    }

    client.onmessage = (message) => {
      console.log("to web", message, web.sessionId)
      if (sessionToken) {
        const session = this.sessions.get(sessionToken)
        if (session) session.lastActiveAt = Date.now()
      }
      web.send(message).catch((err) => {
        console.error("Error sending message to web:", err)
      })
    }
    web.onmessage = (message) => {
      console.log("to client", message, client.sessionId)
      if (sessionToken) {
        const session = this.sessions.get(sessionToken)
        if (session) session.lastActiveAt = Date.now()
      }
      client.send(message).catch((err) => {
        console.error("Error sending message to client:", err)
      })
    }
  }

  private ping() {
    this.webTransports.forEach((transport) => {
      transport.send({
        jsonrpc: "2.0",
        id: 1,
        method: "ping",
      })
    })

    this.transports.forEach((transport) => {
      transport.send({
        jsonrpc: "2.0",
        id: 1,
        method: "ping",
      })
    })
  }
}
