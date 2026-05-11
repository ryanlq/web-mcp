import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"
import { registerBrowserTools, registerPageTools, registerScrapeRuleTools, registerCrawlTools, registerCrawlTaskTools, insiderTools } from "./tools"
import { getLocal } from "@/utils/ext"
import { Subject } from "rxjs"
import { version } from "@/manifest"

export interface ToolSettings {
  task: boolean
  page: boolean
  browser: boolean
  rule: boolean
}

export const defaultToolSettings: ToolSettings = {
  task: true,
  page: false,
  browser: false,
  rule: false,
}

export class ObservableMcpServer extends McpServer {
  private readonly _receivedMessage$ = new Subject<JSONRPCMessage>()
  public readonly receivedMessage$ = this._receivedMessage$.asObservable()

  private readonly _error$ = new Subject<Error>()
  public readonly error$ = this._error$.asObservable()

  private readonly _sentMessage$ = new Subject<JSONRPCMessage>()
  public readonly sentMessage$ = this._sentMessage$.asObservable()

  async connect(transport: Transport): Promise<void> {
    await super.connect(transport)
    this.hookTransportEvents(transport)
  }

  async close() {
    this._receivedMessage$.complete()
    this._error$.complete()
    this._sentMessage$.complete()
    await super.close()
  }

  private hookTransportEvents(transport: Transport) {
    const { onmessage, onclose, onerror, send: originalSend } = transport
    const boundSend = originalSend.bind(transport)

    transport.onmessage = (message) => {
      onmessage?.(message)
      this._receivedMessage$.next(message)
    }

    transport.onerror = (error) => {
      onerror?.(error)
      this._error$.next(error)
    }

    transport.onclose = () => {
      onclose?.()
    }

    transport.send = async (message) => {
      await boundSend(message)
      this._sentMessage$.next(message)
    }
  }
}

export async function createMCPServer() {
  const { tool_settings = {} } = await getLocal<{ tool_settings: Partial<ToolSettings> }>("tool_settings")
  const settings: ToolSettings = { ...defaultToolSettings, ...tool_settings }

  const server = new ObservableMcpServer({
    name: "Web MCP",
    version: "0.0.1",
  })

  if (settings.task) {
    registerCrawlTools(server)
    await registerCrawlTaskTools(server)
  }
  if (settings.page) {
    registerPageTools(server)
  }
  if (settings.browser) {
    registerBrowserTools(server)
  }
  if (settings.rule) {
    registerScrapeRuleTools(server)
  }

  if (version == "0.0.0") {
    insiderTools(server)
  }

  return server
}
