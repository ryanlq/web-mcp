import { z } from "zod"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { TextResult, ImageResult } from "@/utils/tools"
import { msgInvoker } from "@/utils/invoker"
import { InvokerFunc } from "@/types"
import { contentScript, contentMainScript } from "@/manifest"

export function registerBrowserTools(server: McpServer) {
  server.tool("switch-tab", { id: z.number() }, async ({ id }) => {
    const tab = await chrome.tabs.update(id, {
      active: true,
      selected: true,
    })
    return TextResult(`Success: ${tab.title}`)
  })

  server.tool("get-tabs", async () => {
    const tabs = await chrome.tabs.query({})
    const text = tabs
      .map((t) => `ID: ${t.id}\nTitle: ${t.title}\nURL: ${t.url}`)
      .join("\n\n")
    return TextResult(text)
  })

  server.tool("new-tab", { url: z.string() }, async ({ url }) => {
    const tab = await chrome.tabs.create({
      url,
    })
    await tabReady()
    return msgInvoker.invoke({
      tabId: tab.id,
      func: InvokerFunc.CallTools,
      args: ["page_snapshot", {}],
    })
  })

  server.tool("remove-tab", { ids: z.array(z.number()) }, async ({ ids }) => {
    await chrome.tabs.remove(ids)
    return TextResult("Done")
  })

  server.tool("wait", { seconds: z.number() }, async ({ seconds }) => {
    await new Promise((r) => setTimeout(r, seconds * 1000))
    return TextResult("Done")
  })

  server.tool(
    "screenshot",
    "Capture a screenshot of the current tab",
    {
      format: z.enum(["png", "jpeg"]).optional().describe("Image format (default: png)"),
      quality: z.number().min(1).max(100).optional().describe("Image quality for jpeg (1-100)"),
    },
    async ({ format, quality }) => {
      const tab = await tabReady()
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId!, {
        format: format || "png",
        quality,
      })
      const base64 = dataUrl.split(",")[1]
      return ImageResult(base64, `image/${format || "png"}`)
    }
  )
}

export function registerPageTools(server: McpServer) {
  const elementSchema = {
    element: z
      .string()
      .describe(
        "Human-readable element description used to obtain permission to interact with the element"
      ),
    ref: z.string().describe("Exact target element id from the page snapshot"),
  }

  server.tool(
    "page_snapshot",
    "Capture accessibility snapshot of the current page",
    async () => {
      const tab = await tabReady()
      return msgInvoker.invoke({
        tabId: tab.id,
        func: InvokerFunc.CallTools,
        args: ["page_snapshot", {}],
      })
    }
  )
  server.tool(
    "click",
    "Perform click on a web page",
    elementSchema,
    async ({ element, ref }) => {
      const tab = await tabReady()
      return msgInvoker.invoke({
        tabId: tab.id,
        func: InvokerFunc.CallTools,
        args: ["click", { element, ref }],
      })
    }
  )
  server.tool("dbclick", elementSchema, async ({ element, ref }) => {
    const tab = await tabReady()
    return msgInvoker.invoke({
      tabId: tab.id,
      func: InvokerFunc.CallTools,
      args: ["dbclick", { element, ref }],
    })
  })

  const typeSchema = {
    ...elementSchema,
    text: z.string().describe("Text to type into the element"),
  }

  server.tool(
    "type",
    "Type text into editable element",
    typeSchema,
    async ({ element, ref, text }) => {
      const tab = await tabReady()
      return msgInvoker.invoke({
        tabId: tab.id,
        func: InvokerFunc.CallTools,
        args: ["type", { element, ref, text }],
      })
    }
  )

  const keySchema = {
    ...elementSchema,
    key: z.string().describe("Key to press"),
  }

  server.tool("press_key", keySchema, async ({ element, ref, key }) => {
    const tab = await tabReady()
    return msgInvoker.invoke({
      tabId: tab.id,
      func: InvokerFunc.CallTools,
      args: ["press_key", { element, ref, key }],
    })
  })

  server.tool(
    "execute_js",
    "Execute JavaScript code in the current page and return the result",
    {
      script: z.string().describe("JavaScript code to execute"),
      world: z
        .enum(["ISOLATED", "MAIN"])
        .optional()
        .describe(
          "Execution world: ISOLATED (extension context, no page CSP) or MAIN (page context, may be blocked by CSP). Default: ISOLATED"
        ),
    },
    async ({ script, world }) => {
      const tab = await tabReady()
      const worldValue =
        world === "MAIN" ? ("MAIN" as const) : ("ISOLATED" as const)
      if (worldValue === "ISOLATED") {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          world: "ISOLATED",
          func: (code: string) => {
            try {
              const fn = new Function("return (" + code + ")")
              return { ok: fn() }
            } catch (e: any) {
              return { error: e.message }
            }
          },
          args: [script],
        })
        return TextResult(JSON.stringify(results[0]?.result, null, 2))
      }
      // MAIN world: inject via script element to bypass CSP eval restriction
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        world: "MAIN",
        func: (code: string) => {
          try {
            const el = document.createElement("script")
            const id = "__mcp_exec_" + Math.random().toString(36).slice(2)
            el.textContent = `
              try {
                document.currentScript.dataset.${id} = JSON.stringify({ok: (${code})});
              } catch(e) {
                document.currentScript.dataset.${id} = JSON.stringify({error: e.message});
              }
            `
            document.head.appendChild(el)
            const result = JSON.parse(el.dataset[id] || '{"error":"no result"}')
            el.remove()
            return result
          } catch (e: any) {
            return { error: e.message }
          }
        },
        args: [script],
      })
      return TextResult(JSON.stringify(results[0]?.result, null, 2))
    }
  )

  server.tool(
    "scroll",
    "Scroll the page or scroll an element into view",
    {
      direction: z
        .enum(["up", "down", "left", "right"])
        .optional()
        .describe("Scroll direction (default: down)"),
      amount: z
        .number()
        .default(3)
        .describe("Scroll amount in viewport units"),
      ref: z
        .string()
        .optional()
        .describe("Element ref to scroll into view (overrides direction/amount)"),
    },
    async (params) => {
      const tab = await tabReady()
      return msgInvoker.invoke({
        tabId: tab.id,
        func: InvokerFunc.CallTools,
        args: ["scroll", params],
      })
    }
  )

  server.tool(
    "hover",
    "Hover over an element on the page",
    elementSchema,
    async ({ element, ref }) => {
      const tab = await tabReady()
      return msgInvoker.invoke({
        tabId: tab.id,
        func: InvokerFunc.CallTools,
        args: ["hover", { element, ref }],
      })
    }
  )

  const scrapeFieldSchema: z.ZodTypeAny = z.lazy(() =>
    z.object({
      key: z.string().describe("Output field name"),
      selector: z
        .string()
        .describe("CSS selector to locate the element(s)"),
      type: z
        .enum(["text", "html", "attribute", "list"])
        .default("text")
        .describe(
          "text=textContent, html=innerHTML, attribute=specific attr, list=repeated items with sub-fields"
        ),
      attribute: z
        .string()
        .optional()
        .describe("Attribute name when type=attribute (e.g. href, src)"),
      fields: z
        .array(scrapeFieldSchema)
        .optional()
        .describe("Sub-fields when type=list"),
    })
  )

  server.tool(
    "scrape",
    "Extract structured data from the current page using CSS selectors",
    {
      fields: z
        .array(scrapeFieldSchema)
        .describe("Array of field definitions describing what to extract"),
    },
    async ({ fields }) => {
      const tab = await tabReady()
      return msgInvoker.invoke({
        tabId: tab.id,
        func: InvokerFunc.CallTools,
        args: ["scrape", { fields: JSON.stringify(fields) }],
      })
    }
  )
}

async function tabReady() {
  const tabs = await chrome.tabs.query({ active: true })
  const tab = tabs[0]
  const url = tab.pendingUrl || tab.url
  if (!tab || !url.startsWith("http")) {
    throw Error(
      "The current tab is unavailable, Please open or switch to the target tab first"
    )
  }
  if (tab.status !== "complete") {
    await new Promise<chrome.tabs.Tab>((r) => {
      const handleUpdated = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
        if (tabId == tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(handleUpdated)
          r(tab)
        }
      }
      chrome.tabs.onUpdated.addListener(handleUpdated)
    })
  }

  // Ensure content script is injected and ready
  for (let i = 0; i < 5; i++) {
    try {
      await msgInvoker.invoke({
        tabId: tab.id!,
        func: InvokerFunc.PingContent,
        timeout: 500,
      })
      break
    } catch {
      if (i === 0) {
        await chrome.scripting.executeScript({
          files: contentScript.js,
          target: { tabId: tab.id! },
        })
        await chrome.scripting.executeScript({
          files: contentMainScript.js,
          target: { tabId: tab.id! },
          world: "MAIN",
        })
      }
      await new Promise((r) => setTimeout(r, 200 * (i + 1)))
    }
  }

  return tab
}

export function insiderTools(server: McpServer) {
  server.tool("google_search", { q: z.string() }, async ({ q }) => {
    await chrome.search.query({
      disposition: "NEW_TAB",
      text: q,
    })
    return TextResult("")
  })

  server.tool(
    "send-notification",
    {
      id: z.string(),
      title: z.string().optional(),
      message: z.string().optional(),
    },
    async ({ id, title, message }) => {
      await chrome.notifications.create(id, {
        iconUrl: "/logo.png",
        type: "basic",
        title,
        message,
      })
      return TextResult("")
    }
  )

  server.tool(
    "download",
    { url: z.string(), filename: z.string().optional() },
    async ({ filename, url }) => {
      await chrome.downloads.download({
        url,
        filename,
      })
      return TextResult("started download")
    }
  )
}
