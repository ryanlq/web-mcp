import express from "express"
import cors from "cors"
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"
import { Proxy } from "./proxy"

const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || "") || 100
const RATE_WINDOW = 60_000

const rateLimits = new Map<string, { count: number; resetAt: number }>()

// Periodic cleanup of stale rate limit entries
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(key)
  }
}, RATE_WINDOW)

const app = express()
app.use(cors())

app.use((req, res, next) => {
  const key = req.ip || "unknown"
  const now = Date.now()
  const entry = rateLimits.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_WINDOW })
    return next()
  }
  if (entry.count >= RATE_LIMIT) {
    res.status(429).end("Rate limit exceeded")
    return
  }
  entry.count++
  next()
})

const proxy = new Proxy()

app.get("/web/sse", async (req, res) => {
  try {
    const token = req.query.token
    const renewal = req.query.renewal

    if (!token || typeof token !== "string") {
      res.status(400).end("Token is required")
      return
    }

    const transport = new SSEServerTransport("/web/message", res)
    proxy.webConnect(token, transport, !!renewal)

    console.log("/web/sse", transport.sessionId)
  } catch (error) {
    console.error("Error in /server/sse route:", error)
    res.status(500).json(error)
  }
})

app.post("/web/message", async (req, res) => {
  try {
    const sessionId = req.query.sessionId as string
    const transport = proxy.getWebTransport(sessionId)
    if (!transport) {
      res.status(404).end("Session not found")
      return
    }
    await transport.handlePostMessage(req, res)
  } catch (error) {
    console.error("Error in /server/message route:", error)
    res.status(500).json(error)
  }
})

app.get(["/sse", "/sse/:token"], async (req, res) => {
  try {
    const token = req.query.token || req.params.token
    if (!token || typeof token !== "string") {
      res.status(400).end("Token is required")
      return
    }

    if (!proxy.validateToken(token)) {
      res.status(400).end("Token is invalid")
      return
    }

    const transport = new SSEServerTransport("/message", res)
    proxy.connect(token, transport)

    // console.log("/sse", transport.sessionId)
  } catch (error) {
    console.error("Error in /sse route:", error)
    res.status(500).json(error)
  }
})

app.post("/message", async (req, res) => {
  try {
    const sessionId = req.query.sessionId as string
    console.log(`Received message for sessionId ${sessionId}`)
    const transport = proxy.getTransport(sessionId)
    if (!transport) {
      res.status(404).end("Session not found")
      return
    }
    await transport.handlePostMessage(req, res)
  } catch (error) {
    console.error("Error in /message route:", error)
    res.status(500).json(error)
  }
})

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
  })
})

app.get("/test", async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  })

  const relativeUrlWithSession = "/message?"
  res.write(`event: endpoint\ndata: ${relativeUrlWithSession}\n\n`)
})

const PORT = process.env.PORT || 6288

const server = app.listen(PORT)
server.on("listening", () => {
  console.log(`⚙️ Proxy server listening on port ${PORT}`)
})
server.on("error", (err) => {
  if (err.message.includes(`EADDRINUSE`)) {
    console.error(`❌  Proxy Server PORT IS IN USE at port ${PORT} ❌ `)
  } else {
    console.error(err.message)
  }
  process.exit(1)
})
