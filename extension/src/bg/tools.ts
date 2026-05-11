import { z } from "zod"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { TextResult, ImageResult } from "@/utils/tools"
import { getLocal, setLocal } from "@/utils/ext"
import { msgInvoker } from "@/utils/invoker"
import { InvokerFunc } from "@/types"
import { contentScript, contentMainScript } from "@/manifest"

interface ScrapeRule {
  name: string
  urlPattern: string
  fields: any[]
  nextPageSelector?: string
  detailLinkSelector?: string
  detailFields?: any[]
  maxPages?: number
  maxItems?: number
  enableCache?: boolean
  cacheTTL?: number
  createdAt: number
  updatedAt: number
}

interface CrawlTask {
  name: string
  description?: string
  ruleName: string
  url: string
  createdAt: number
  updatedAt: number
}

function matchUrl(url: string, pattern: string): boolean {
  try {
    return new URLPattern(pattern).test(url)
  } catch {
    return url.includes(pattern)
  }
}

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

  server.tool(
    "export_data",
    "Export data as a file download (JSON or CSV)",
    {
      data: z.string().describe("Data to export (JSON string)"),
      filename: z.string().describe("Output filename (e.g. results.json, data.csv)"),
      format: z.enum(["json", "csv"]).default("json").describe("Export format"),
    },
    async ({ data, filename, format }) => {
      let content: string
      let mimeType: string

      if (format === "csv") {
        const parsed = JSON.parse(data)
        if (!Array.isArray(parsed)) return TextResult("Error: CSV export requires a JSON array")
        if (parsed.length === 0) return TextResult("Error: empty array, nothing to export")
        const keys = Object.keys(parsed[0])
        const rows = [keys.join(",")]
        for (const item of parsed) {
          rows.push(
            keys
              .map((k) => {
                const val = String(item[k] ?? "")
                return val.includes(",") || val.includes('"')
                  ? `"${val.replace(/"/g, '""')}"`
                  : val
              })
              .join(",")
          )
        }
        content = rows.join("\n")
        mimeType = "text/csv"
      } else {
        content = data
        mimeType = "application/json"
      }

      const dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`
      await chrome.downloads.download({ url: dataUrl, filename })
      return TextResult(`Exported ${filename}`)
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

  server.tool(
    "wait_for",
    "Wait for an element matching a CSS selector to appear on the page",
    {
      selector: z.string().describe("CSS selector to wait for"),
      text: z
        .string()
        .optional()
        .describe("Wait for element containing this text"),
      timeout: z
        .number()
        .default(30)
        .describe("Maximum wait time in seconds (default: 30)"),
    },
    async ({ selector, text, timeout }) => {
      const tab = await tabReady()
      return msgInvoker.invoke({
        tabId: tab.id,
        func: InvokerFunc.CallTools,
        args: [
          "wait_for",
          { selector, text: text || "", timeout: String(timeout) },
        ],
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
        .optional()
        .describe("Array of field definitions describing what to extract"),
      rule: z
        .string()
        .optional()
        .describe("Use a saved rule by name"),
      auto_match: z
        .boolean()
        .optional()
        .describe("Auto-match a saved rule by current page URL"),
    },
    async ({ fields, rule, auto_match }) => {
      let resolvedFields = fields

      if (rule) {
        const { scrape_rules = [] } = await getLocal<{ scrape_rules: ScrapeRule[] }>("scrape_rules")
        const found = scrape_rules.find((r) => r.name === rule)
        if (!found) return TextResult(`Rule "${rule}" not found`)
        resolvedFields = found.fields
      } else if (auto_match) {
        const tab = await tabReady()
        const url = tab.url || ""
        const { scrape_rules = [] } = await getLocal<{ scrape_rules: ScrapeRule[] }>("scrape_rules")
        const matched = scrape_rules.find((r) => matchUrl(url, r.urlPattern))
        if (!matched) return TextResult(`No matching rule for ${url}`)
        resolvedFields = matched.fields
      }

      if (!resolvedFields?.length) {
        return TextResult("Error: provide fields, rule name, or set auto_match=true")
      }

      const tab = await tabReady()
      return msgInvoker.invoke({
        tabId: tab.id,
        func: InvokerFunc.CallTools,
        args: ["scrape", { fields: JSON.stringify(resolvedFields) }],
      })
    }
  )
}

export function registerCrawlTools(server: McpServer) {
  const crawlFieldSchema: z.ZodTypeAny = z.lazy(() =>
    z.object({
      key: z.string().describe("Output field name"),
      selector: z.string().describe("CSS selector"),
      type: z
        .enum(["text", "html", "attribute", "list"])
        .default("text"),
      attribute: z.string().optional(),
      fields: z.array(crawlFieldSchema).optional(),
    })
  )

  server.tool(
    "scrape_crawl",
    "Crawl multiple pages with pagination and extract detail pages. Use when the user wants to scrape a list page with pagination, or extract linked detail pages. Can reference a saved rule by name or accept inline field definitions. Optionally opens a target URL in a background tab.",
    {
      fields: z
        .array(crawlFieldSchema)
        .optional()
        .describe("Field definitions for list page extraction"),
      nextPageSelector: z
        .string()
        .optional()
        .describe("CSS selector for the 'next page' button/link"),
      maxPages: z
        .number()
        .default(5)
        .describe("Maximum pages to crawl"),
      detailLinkSelector: z
        .string()
        .optional()
        .describe("Selector for detail page link within each list item"),
      detailFields: z
        .array(crawlFieldSchema)
        .optional()
        .describe("Fields to extract from detail pages"),
      rule: z
        .string()
        .optional()
        .describe("Use a saved rule by name (overrides fields)"),
      url: z
        .string()
        .optional()
        .describe("Target URL to crawl (opens new background tab). If omitted, uses current active tab."),
    },
    async ({ fields, nextPageSelector, maxPages, detailLinkSelector, detailFields, rule, url }) => {
      let resolvedFields = fields
      let resolvedNextPageSelector = nextPageSelector
      let resolvedDetailLinkSelector = detailLinkSelector
      let resolvedDetailFields = detailFields
      let resolvedMaxPages = maxPages
      let resolvedMaxItems: number | undefined
      let resolvedCacheTTL = 0

      if (rule) {
        const { scrape_rules = [] } = await getLocal<{ scrape_rules: ScrapeRule[] }>("scrape_rules")
        const found = scrape_rules.find((r) => r.name === rule)
        if (!found) return TextResult(`Rule "${rule}" not found`)
        resolvedFields = found.fields
        resolvedNextPageSelector = found.nextPageSelector || nextPageSelector
        resolvedDetailLinkSelector = found.detailLinkSelector || detailLinkSelector
        resolvedDetailFields = found.detailFields || detailFields
        resolvedMaxPages = found.maxPages || maxPages
        resolvedMaxItems = found.maxItems
        resolvedCacheTTL = found.enableCache ? (found.cacheTTL || 86400) : 0
      }

      if (!resolvedFields?.length) {
        return TextResult("Error: provide fields and nextPageSelector (or use rule)")
      }

      return executeCrawl({
        url: url || undefined,
        fields: resolvedFields,
        nextPageSelector: resolvedNextPageSelector,
        maxPages: resolvedMaxPages,
        maxItems: resolvedMaxItems,
        detailLinkSelector: resolvedDetailLinkSelector,
        detailFields: resolvedDetailFields,
        cacheTTL: resolvedCacheTTL,
      })
    }
  )
}

interface DetailCache {
  [normalizedUrl: string]: {
    data: any
    fetchedAt: number
    ttl: number
  }
}

const CACHE_MAX = 500

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ""
    u.searchParams.delete("utm_source")
    u.searchParams.delete("utm_medium")
    u.searchParams.delete("utm_campaign")
    u.searchParams.delete("ref")
    return u.href.replace(/\/+$/, "")
  } catch {
    return url
  }
}

async function getCache(): Promise<DetailCache> {
  const { detail_cache = {} } = await getLocal<{ detail_cache: DetailCache }>("detail_cache")
  return detail_cache
}

async function getCachedDetail(url: string, ttl: number): Promise<any | null> {
  const cache = await getCache()
  const key = normalizeUrl(url)
  const entry = cache[key]
  if (!entry) return null
  if (Date.now() - entry.fetchedAt > ttl * 1000) {
    delete cache[key]
    await setLocal({ detail_cache: cache })
    return null
  }
  return entry.data
}

async function setCachedDetail(url: string, data: any, ttl: number): Promise<void> {
  const cache = await getCache()
  const key = normalizeUrl(url)
  cache[key] = { data, fetchedAt: Date.now(), ttl }
  const entries = Object.entries(cache)
  if (entries.length > CACHE_MAX) {
    entries.sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)
    for (const [k] of entries.slice(0, entries.length - CACHE_MAX)) delete cache[k]
  }
  await setLocal({ detail_cache: cache })
}

export async function clearDetailCache(): Promise<number> {
  const { detail_cache = {} } = await getLocal<{ detail_cache: DetailCache }>("detail_cache")
  const count = Object.keys(detail_cache).length
  await setLocal({ detail_cache: {} })
  return count
}

export async function getCacheStats(): Promise<{ count: number; oldestAt: number | null }> {
  const cache = await getCache()
  const entries = Object.values(cache)
  return {
    count: entries.length,
    oldestAt: entries.length ? Math.min(...entries.map((e) => e.fetchedAt)) : null,
  }
}

async function executeCrawl(opts: {
  url?: string
  fields: any[]
  nextPageSelector?: string
  maxPages?: number
  maxItems?: number
  detailLinkSelector?: string
  detailFields?: any[]
  cacheTTL?: number
  onProgress?: (msg: string) => void
}): Promise<any> {
  const progress = (msg: string) => opts.onProgress?.(msg)
  let ownTab = false
  let tabId: number

  if (opts.url) {
    progress(`opening ${opts.url}`)
    const tab = await chrome.tabs.create({ url: opts.url, active: false })
    tabId = tab.id!
    ownTab = true
    await tabReadyForTab(tabId)
  } else {
    const tab = await tabReady()
    tabId = tab.id!
  }

  try {
    const allResults: any[] = []
    let pageCount = 0
    const maxPages = opts.maxPages || 1

    for (let page = 0; page < maxPages; page++) {
      pageCount++
      progress(`scraping page ${pageCount}/${maxPages}`)

      // 1. Scrape current page
      const scrapeResult = await msgInvoker.invoke({
        tabId,
        func: InvokerFunc.CallTools,
        args: ["scrape", { fields: JSON.stringify(opts.fields) }],
      })
      let pageData: any
      try {
        pageData = JSON.parse(scrapeResult.content?.[0]?.text || "{}")
      } catch {
        return { error: `Error parsing scrape result on page ${page + 1}` }
      }

      // 2. Detail extraction if configured
      if (opts.detailLinkSelector && opts.detailFields) {
        progress("extracting detail links")
        const linksResult = await msgInvoker.invoke({
          tabId,
          func: InvokerFunc.CallTools,
          args: [
            "scrape",
            {
              fields: JSON.stringify([
                {
                  key: "_links",
                  selector: opts.detailLinkSelector,
                  type: "attribute",
                  attribute: "href",
                },
              ]),
            },
          ],
        })
        try {
          const linkData = JSON.parse(linksResult.content?.[0]?.text || "{}")
          const urls: string[] = Array.isArray(linkData._links)
            ? linkData._links.filter(Boolean)
            : linkData._links
              ? [linkData._links]
              : []

          let listItems: any[] = []
          for (const key of Object.keys(pageData)) {
            if (Array.isArray(pageData[key])) {
              listItems = pageData[key]
              break
            }
          }

          // maxItems: limit detail pages to open
          if (opts.maxItems) {
            if (urls.length > opts.maxItems) urls.length = opts.maxItems
            if (listItems.length > opts.maxItems) listItems.length = opts.maxItems
          }

          const cacheTTL = opts.cacheTTL || 0
          for (let i = 0; i < urls.length; i++) {
            const url = urls[i]
            if (!url) continue
            progress(`detail ${i + 1}/${urls.length}: ${url.slice(0, 60)}`)

            if (cacheTTL > 0) {
              const cached = await getCachedDetail(url, cacheTTL)
              if (cached) {
                progress(`detail ${i + 1}/${urls.length}: cached`)
                if (listItems[i]) Object.assign(listItems[i], cached)
                continue
              }
            }

            try {
              const newTab = await chrome.tabs.create({ url, active: false })
              await tabReadyForTab(newTab.id!)
              const detail = await msgInvoker.invoke({
                tabId: newTab.id!,
                func: InvokerFunc.CallTools,
                args: ["scrape", { fields: JSON.stringify(opts.detailFields) }],
              })
              try {
                const detailData = JSON.parse(detail.content?.[0]?.text || "{}")
                if (listItems[i]) {
                  Object.assign(listItems[i], detailData)
                }
                if (cacheTTL > 0 && detailData) {
                  await setCachedDetail(url, detailData, cacheTTL)
                }
              } catch { /* skip detail parse error */ }
              await chrome.tabs.remove(newTab.id!)
            } catch { /* skip failed detail page */ }
          }
        } catch { /* skip detail extraction error */ }
      }

      // 3. Collect results
      for (const key of Object.keys(pageData)) {
        if (Array.isArray(pageData[key])) {
          allResults.push(...pageData[key])
        }
      }
      if (allResults.length === 0 && !Array.isArray(pageData)) {
        allResults.push(pageData)
      }

      // maxItems: truncate and stop early
      if (opts.maxItems && allResults.length >= opts.maxItems) {
        allResults.length = opts.maxItems
        break
      }

      // 4. Try next page (only if nextPageSelector provided)
      if (!opts.nextPageSelector) break
      const nextResult = await msgInvoker.invoke({
        tabId,
        func: InvokerFunc.CallTools,
        args: ["scrape_next_page", { selector: opts.nextPageSelector }],
      })
      try {
        const { hasNext } = JSON.parse(nextResult.content?.[0]?.text || "{}")
        if (!hasNext) break
      } catch {
        break
      }
      await new Promise((r) => setTimeout(r, 2000))
      await tabReadyForTab(tabId)
    }

    progress(`done: ${allResults.length} items from ${pageCount} pages`)
    return { totalItems: allResults.length, pages: pageCount, data: allResults }
  } finally {
    if (ownTab) {
      try { await chrome.tabs.remove(tabId) } catch { /* tab already closed */ }
    }
  }
}

interface TaskExecution {
  taskId: string
  taskName: string
  status: "running" | "completed" | "failed"
  progress: string
  startedAt: number
  completedAt?: number
  result?: any
  error?: string
}

const executions = new Map<string, TaskExecution>()

export async function runCrawlTask(taskName: string, waitForCompletion = false): Promise<any> {
  const { crawl_tasks = [] } = await getLocal<{ crawl_tasks: CrawlTask[] }>("crawl_tasks")
  const task = crawl_tasks.find((t) => t.name === taskName)
  if (!task) throw new Error(`Task "${taskName}" not found`)

  const { scrape_rules = [] } = await getLocal<{ scrape_rules: ScrapeRule[] }>("scrape_rules")
  const rule = scrape_rules.find((r) => r.name === task.ruleName)
  if (!rule) throw new Error(`Rule "${task.ruleName}" not found`)

  const taskId = `task_${Date.now().toString(36)}`
  const execution: TaskExecution = {
    taskId,
    taskName,
    status: "running",
    progress: "starting...",
    startedAt: Date.now(),
  }
  executions.set(taskId, execution)

  // Run crawl in background
  executeCrawl({
    url: task.url,
    fields: rule.fields,
    nextPageSelector: rule.nextPageSelector,
    maxPages: rule.maxPages || 1,
    maxItems: rule.maxItems,
    detailLinkSelector: rule.detailLinkSelector,
    detailFields: rule.detailFields,
    cacheTTL: rule.enableCache ? (rule.cacheTTL || 86400) : 0,
    onProgress: (msg) => {
      execution.progress = msg
    },
  }).then((result) => {
    execution.status = "completed"
    execution.progress = "done"
    execution.completedAt = Date.now()
    execution.result = result
  }).catch((e: any) => {
    execution.status = "failed"
    execution.progress = "failed"
    execution.completedAt = Date.now()
    execution.error = e.message
  })

  if (waitForCompletion) {
    while (execution.status === "running") {
      await new Promise((r) => setTimeout(r, 1000))
    }
    if (execution.status === "failed") throw new Error(execution.error)
    return execution.result
  }

  return { taskId }
}

export async function registerCrawlTaskTools(server: McpServer) {
  // Build dynamic description with current task list
  const { crawl_tasks: tasks = [] } = await getLocal<{ crawl_tasks: CrawlTask[] }>("crawl_tasks")
  const taskListStr = tasks.length
    ? "\n\nAvailable tasks:\n" + tasks.map((t) =>
        `- "${t.name}": ${t.description || `Scrape ${t.url} using rule "${t.ruleName}"`}`
      ).join("\n")
    : "\n\nNo tasks configured yet. Use crawl_task_list after creating tasks."

  server.tool(
    "crawl_task_run",
    `Execute a pre-configured web scraping task by name. Use this when the user wants to scrape, crawl, extract data from a website, fetch news/articles, or collect web content. Returns immediately with a taskId — use crawl_task_status to check progress, then crawl_task_result to get data.${taskListStr}`,
    { task: z.string().describe("Task name to run (must match exactly)") },
    async ({ task }) => {
      const { taskId } = await runCrawlTask(task)
      return TextResult(JSON.stringify({ taskId, status: "running" }))
    }
  )

  server.tool(
    "crawl_task_list",
    "List all saved crawl tasks with their names, descriptions, and target URLs. Use when the user wants to see what scraping tasks are available.",
    async () => {
      const { crawl_tasks = [] } = await getLocal<{ crawl_tasks: CrawlTask[] }>("crawl_tasks")
      if (!crawl_tasks.length) return TextResult("No tasks saved")
      const text = crawl_tasks
        .map((t) => `Name: ${t.name}\n${t.description ? `Description: ${t.description}\n` : ""}Rule: ${t.ruleName}\nURL: ${t.url}`)
        .join("\n\n")
      return TextResult(text)
    }
  )

  server.tool(
    "crawl_task_status",
    "Check progress of a running crawl task. Returns status (running/completed/failed), progress message, elapsed time. Poll this after crawl_task_run until status is completed or failed.",
    { taskId: z.string().describe("Task ID from crawl_task_run") },
    async ({ taskId }) => {
      const exec = executions.get(taskId)
      if (!exec) return TextResult(`Task ${taskId} not found`)
      const elapsed = Math.round((Date.now() - exec.startedAt) / 1000)
      const info: Record<string, any> = {
        taskId: exec.taskId,
        taskName: exec.taskName,
        status: exec.status,
        progress: exec.progress,
        elapsed: `${elapsed}s`,
      }
      if (exec.error) info.error = exec.error
      if (exec.result) {
        const totalItems = exec.result.totalItems || 0
        const pages = exec.result.pages || 0
        info.totalItems = totalItems
        info.pages = pages
      }
      return TextResult(JSON.stringify(info, null, 2))
    }
  )

  server.tool(
    "crawl_task_result",
    "Get the scraped data from a completed crawl task. Call this after crawl_task_status shows status=completed. Returns all extracted items as JSON.",
    { taskId: z.string().describe("Task ID from crawl_task_run") },
    async ({ taskId }) => {
      const exec = executions.get(taskId)
      if (!exec) return TextResult(`Task ${taskId} not found`)
      if (exec.status === "running") return TextResult(`Task still running: ${exec.progress}`)
      if (exec.status === "failed") return TextResult(`Task failed: ${exec.error}`)
      return TextResult(JSON.stringify(exec.result, null, 2))
    }
  )

  // Core tools always available with task group
  server.tool(
    "scrape",
    "Extract structured data from the current active browser tab using CSS selectors. Use when you need to quickly scrape the page the user is currently viewing. Provide fields array with CSS selectors, or reference a saved rule by name, or set auto_match=true to auto-detect a rule matching the current URL.",
    {
      fields: z
        .array(z.lazy(() =>
          z.object({
            key: z.string().describe("Output field name"),
            selector: z.string().describe("CSS selector"),
            type: z.enum(["text", "html", "attribute", "list"]).default("text"),
            attribute: z.string().optional(),
            fields: z.array(z.lazy(() => z.any())).optional(),
          })
        ))
        .optional()
        .describe("Field definitions"),
      rule: z.string().optional().describe("Use a saved rule by name"),
      auto_match: z.boolean().optional().describe("Auto-match a saved rule by current page URL"),
    },
    async ({ fields, rule, auto_match }) => {
      let resolvedFields = fields
      if (rule) {
        const { scrape_rules = [] } = await getLocal<{ scrape_rules: ScrapeRule[] }>("scrape_rules")
        const found = scrape_rules.find((r) => r.name === rule)
        if (!found) return TextResult(`Rule "${rule}" not found`)
        resolvedFields = found.fields
      } else if (auto_match) {
        const tab = await tabReady()
        const url = tab.url || ""
        const { scrape_rules = [] } = await getLocal<{ scrape_rules: ScrapeRule[] }>("scrape_rules")
        const matched = scrape_rules.find((r) => matchUrl(url, r.urlPattern))
        if (!matched) return TextResult(`No matching rule for ${url}`)
        resolvedFields = matched.fields
      }
      if (!resolvedFields?.length) {
        return TextResult("Error: provide fields, rule name, or set auto_match=true")
      }
      const tab = await tabReady()
      return msgInvoker.invoke({
        tabId: tab.id,
        func: InvokerFunc.CallTools,
        args: ["scrape", { fields: JSON.stringify(resolvedFields) }],
      })
    }
  )

  server.tool(
    "export_data",
    "Download data as a file (JSON or CSV) to the user's browser. Use when the user wants to save/export/download scrape results or any JSON data as a file.",
    {
      data: z.string().describe("Data to export (JSON string)"),
      filename: z.string().describe("Output filename"),
      format: z.enum(["json", "csv"]).default("json").describe("Export format"),
    },
    async ({ data, filename, format }) => {
      let content: string
      let mimeType: string
      if (format === "csv") {
        const parsed = JSON.parse(data)
        if (!Array.isArray(parsed)) return TextResult("Error: CSV export requires a JSON array")
        const keys = Object.keys(parsed[0])
        const rows = [keys.join(",")]
        for (const item of parsed) {
          rows.push(keys.map((k) => {
            const val = String(item[k] ?? "")
            return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val
          }).join(","))
        }
        content = rows.join("\n")
        mimeType = "text/csv"
      } else {
        content = data
        mimeType = "application/json"
      }
      const dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`
      await chrome.downloads.download({ url: dataUrl, filename })
      return TextResult(`Exported ${filename}`)
    }
  )

  server.tool(
    "screenshot",
    "Take a screenshot of the current browser tab. Use when the user wants to see what's on the page or capture a visual snapshot.",
    {
      format: z.enum(["png", "jpeg"]).optional().describe("Image format (default: png)"),
      quality: z.number().min(1).max(100).optional().describe("Image quality for jpeg"),
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

export function registerScrapeRuleTools(server: McpServer) {
  const scrapeFieldSchema: z.ZodTypeAny = z.lazy(() =>
    z.object({
      key: z.string().describe("Output field name"),
      selector: z.string().describe("CSS selector"),
      type: z
        .enum(["text", "html", "attribute", "list"])
        .default("text"),
      attribute: z.string().optional(),
      fields: z.array(scrapeFieldSchema).optional(),
    })
  )

  server.tool(
    "scrape_rule_add",
    "Save a scrape rule for reuse",
    {
      name: z.string().describe("Unique rule name"),
      urlPattern: z
        .string()
        .describe("URL pattern to auto-match (e.g. https://github.com/*)"),
      fields: z
        .array(scrapeFieldSchema)
        .describe("Field definitions"),
      nextPageSelector: z
        .string()
        .optional()
        .describe("CSS selector for the next page button (for scrape_crawl)"),
      detailLinkSelector: z
        .string()
        .optional()
        .describe("Selector for detail page link within list items"),
      detailFields: z
        .array(scrapeFieldSchema)
        .optional()
        .describe("Fields to extract from detail pages"),
      maxPages: z
        .number()
        .optional()
        .describe("Maximum pages to crawl (default: 5)"),
    },
    async ({ name, urlPattern, fields, nextPageSelector, detailLinkSelector, detailFields, maxPages }) => {
      const { scrape_rules = [] } = await getLocal<{
        scrape_rules: ScrapeRule[]
      }>("scrape_rules")
      const now = Date.now()
      const idx = scrape_rules.findIndex((r) => r.name === name)
      const rule: ScrapeRule = {
        name,
        urlPattern,
        fields,
        nextPageSelector,
        detailLinkSelector,
        detailFields,
        maxPages,
        createdAt: now,
        updatedAt: now,
      }
      if (idx >= 0) {
        rule.createdAt = scrape_rules[idx].createdAt
        scrape_rules[idx] = rule
      } else {
        scrape_rules.push(rule)
      }
      await setLocal({ scrape_rules })
      return TextResult(`Rule "${name}" saved`)
    }
  )

  server.tool("scrape_rule_list", "List all saved scrape rules", async () => {
    const { scrape_rules = [] } = await getLocal<{
      scrape_rules: ScrapeRule[]
    }>("scrape_rules")
    if (!scrape_rules.length) return TextResult("No rules saved")
    const text = scrape_rules
      .map(
        (r) =>
          `Name: ${r.name}\nPattern: ${r.urlPattern}\nFields: ${r.fields.map((f) => f.key).join(", ")}`
      )
      .join("\n\n")
    return TextResult(text)
  })

  server.tool(
    "scrape_rule_remove",
    "Remove a saved scrape rule",
    {
      name: z.string().describe("Rule name to remove"),
    },
    async ({ name }) => {
      const { scrape_rules = [] } = await getLocal<{
        scrape_rules: ScrapeRule[]
      }>("scrape_rules")
      const filtered = scrape_rules.filter((r) => r.name !== name)
      if (filtered.length === scrape_rules.length) {
        return TextResult(`Rule "${name}" not found`)
      }
      await setLocal({ scrape_rules: filtered })
      return TextResult(`Rule "${name}" removed`)
    }
  )
}

async function tabReadyForTab(tabId: number) {
  const tab = await chrome.tabs.get(tabId)
  if (tab.status !== "complete") {
    await new Promise<void>((r) => {
      const handleUpdated = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(handleUpdated)
          r()
        }
      }
      chrome.tabs.onUpdated.addListener(handleUpdated)
    })
  }

  for (let i = 0; i < 5; i++) {
    try {
      await msgInvoker.invoke({
        tabId,
        func: InvokerFunc.PingContent,
        timeout: 500,
      })
      break
    } catch {
      if (i === 0) {
        await chrome.scripting.executeScript({
          files: contentScript.js,
          target: { tabId },
        })
        await chrome.scripting.executeScript({
          files: contentMainScript.js,
          target: { tabId },
          world: "MAIN",
        })
      }
      await new Promise((r) => setTimeout(r, 200 * (i + 1)))
    }
  }
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
  await tabReadyForTab(tab.id!)
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
