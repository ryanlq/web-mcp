import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Plus, HelpCircle, Wand2, Trash2, Pencil, Settings } from "lucide-react"
import useStorage from "@/hooks/useStorage"
import { getLocal, setLocal } from "@/utils/ext"
import RuleList from "@/components/rules/RuleList"
import RuleForm from "@/components/rules/RuleForm"
import ImportExport from "@/components/rules/ImportExport"
import TaskForm, { type CrawlTask } from "@/components/tasks/TaskForm"
import type { ScrapeRule } from "@/components/rules/RuleForm"
import { clearDetailCache, getCacheStats } from "@/bg/tools"
import { type ToolSettings, defaultToolSettings } from "@/bg/mcp"

const presetRules: ScrapeRule[] = [
  {
    name: "hn-top",
    urlPattern: "https://news.ycombinator.com/*",
    fields: [
      {
        key: "items",
        selector: ".titleline",
        type: "list",
        fields: [
          { key: "title", selector: "a", type: "text" },
          { key: "link", selector: "a", type: "attribute", attribute: "href" },
        ],
      },
    ],
    nextPageSelector: ".morelink",
    maxPages: 5,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "hn-comments",
    urlPattern: "https://news.ycombinator.com/item*",
    fields: [
      {
        key: "comments",
        selector: ".comtr",
        type: "list",
        fields: [
          { key: "user", selector: ".hnuser", type: "text" },
          { key: "text", selector: ".commtext", type: "text" },
          { key: "time", selector: ".age", type: "attribute", attribute: "title" },
        ],
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "github-repo-info",
    urlPattern: "https://github.com/*/*",
    fields: [
      { key: "name", selector: "strong.mr-2", type: "text" },
      { key: "description", selector: "p.f4.my-3", type: "text" },
      { key: "stars", selector: "#repo-stars-counter-star", type: "text" },
      { key: "forks", selector: "#repo-network-counter", type: "text" },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  // --- Stock Investment Rules ---
  {
    name: "cls-telegraph",
    urlPattern: "https://www.cls.cn/telegraph*",
    fields: [
      {
        key: "items",
        selector: ".p-t-20.p-b-20.b-b-w-1",
        type: "list",
        fields: [
          { key: "time", selector: ".telegraph-time-box", type: "text" },
          { key: "title", selector: "strong", type: "text" },
          { key: "content", selector: ".c-34304b div", type: "text" },
        ],
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "eastmoney-lhb",
    urlPattern: "https://stock.eastmoney.com/a/clhbjd*.html",
    fields: [
      {
        key: "items",
        selector: "div.text",
        type: "list",
        fields: [
          { key: "title", selector: "p.title a", type: "text" },
          { key: "link", selector: "p.title a", type: "attribute", attribute: "href" },
          { key: "summary", selector: "p.info", type: "text" },
          { key: "date", selector: "p.time", type: "text" },
        ],
      },
    ],
    nextPageSelector: "a[href*='clhbjd_']",
    maxPages: 3,
    enableCache: true,
    cacheTTL: 86400,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "eastmoney-report",
    urlPattern: "https://data.eastmoney.com/report/*",
    fields: [
      {
        key: "reports",
        selector: "table.table-model tbody tr",
        type: "list",
        fields: [
          { key: "code", selector: "td:nth-child(2)", type: "text" },
          { key: "name", selector: "td:nth-child(3)", type: "text" },
          { key: "title", selector: "td:nth-child(5) a", type: "text" },
          { key: "link", selector: "td:nth-child(5) a", type: "attribute", attribute: "href" },
          { key: "rating", selector: "td:nth-child(6)", type: "text" },
          { key: "ratingChange", selector: "td:nth-child(7)", type: "text" },
          { key: "broker", selector: "td:nth-child(8)", type: "text" },
          { key: "industry", selector: "td:nth-child(13)", type: "text" },
          { key: "date", selector: "td:nth-child(14)", type: "text" },
        ],
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "stcn-news",
    urlPattern: "https://www.stcn.com/article/list/*.html",
    fields: [
      {
        key: "items",
        selector: "div.content",
        type: "list",
        fields: [
          { key: "title", selector: "div.tt a", type: "text" },
          { key: "link", selector: "div.tt a", type: "attribute", attribute: "href" },
          { key: "summary", selector: "div.text.ellipsis-2", type: "text" },
          { key: "tags", selector: "div.tags a", type: "list", fields: [
            { key: "tag", selector: "a", type: "text" },
          ]},
          { key: "source", selector: "div.info", type: "text" },
        ],
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "x-tweets",
    urlPattern: "https://x.com/*",
    fields: [
      {
        key: "tweets",
        selector: 'article[data-testid="tweet"]',
        type: "list",
        fields: [
          { key: "text", selector: '[data-testid="tweetText"]', type: "text" },
          { key: "time", selector: "time", type: "attribute", attribute: "datetime" },
          { key: "link", selector: 'a[href*="/status/"]', type: "attribute", attribute: "href" },
        ],
      },
    ],
    maxItems: 10,
    waitForSelector: 'article[data-testid="tweet"]',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

const presetTasks: CrawlTask[] = [
  {
    name: "财联社电报",
    description: "抓取财联社7x24小时实时电报快讯，包括新闻标题、正文和时间。适用于用户想了解最新金融市场快讯、实时资讯时调用。",
    ruleName: "cls-telegraph",
    url: "https://www.cls.cn/telegraph",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "东方财富-龙虎榜解读",
    description: "抓取东方财富网龙虎榜解读文章，包括文章标题、摘要和日期。适用于用户想了解龙虎榜数据、游资动向、主力资金分析时调用。",
    ruleName: "eastmoney-lhb",
    url: "https://stock.eastmoney.com/a/clhbjd.html",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "东方财富-研报速递",
    description: "抓取东方财富网最新券商研报列表，包括股票代码、研报标题、评级、券商名称、行业和日期。适用于用户想了解最新券商研报、机构观点、个股评级变动时调用。",
    ruleName: "eastmoney-report",
    url: "https://data.eastmoney.com/report/",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "证券时报-要闻",
    description: "抓取证券时报网要闻栏目最新新闻，包括新闻标题、摘要、来源和标签。适用于用户想了解最新财经要闻、宏观政策、市场动态时调用。",
    ruleName: "stcn-news",
    url: "https://www.stcn.com/article/list/yw.html",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "STOCK调研公社推文",
    description: "抓取推特博主@STOCK6688的最新推文，包括推文正文、发布时间和链接。适用于用户想了解STOCK调研公社的最新投资观点、行业分析、概念整理时调用。",
    ruleName: "x-tweets",
    url: "https://x.com/STOCK6688",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

async function loadPresets() {
  const { scrape_rules = [] } = await getLocal<{ scrape_rules: ScrapeRule[] }>("scrape_rules")
  const existingRuleNames = new Set(scrape_rules.map((r) => r.name))
  const newRules = presetRules.filter((r) => !existingRuleNames.has(r.name))
  if (newRules.length > 0) {
    await setLocal({ scrape_rules: [...scrape_rules, ...newRules] })
  }

  const { crawl_tasks = [] } = await getLocal<{ crawl_tasks: CrawlTask[] }>("crawl_tasks")
  const existingTaskNames = new Set(crawl_tasks.map((t) => t.name))
  const newTasks = presetTasks.filter((t) => !existingTaskNames.has(t.name))
  if (newTasks.length > 0) {
    await setLocal({ crawl_tasks: [...crawl_tasks, ...newTasks] })
  }
}

function HelpPanel() {
  return (
    <details className="border rounded-md p-4 text-sm text-muted-foreground space-y-3">
      <summary className="flex items-center gap-1.5 font-medium text-foreground cursor-pointer">
        <HelpCircle className="size-4" />
        How to create a scrape rule
      </summary>
      <div className="mt-3 space-y-3">
        <div>
          <h4 className="font-medium text-foreground">1. Basic fields</h4>
          <ul className="list-disc ml-4 mt-1 space-y-1">
            <li><strong>Name</strong> — Unique identifier for the rule</li>
            <li><strong>URL Pattern</strong> — Which pages this rule applies to. Supports wildcards: <code className="bg-muted px-1 rounded">https://news.ycombinator.com/*</code></li>
          </ul>
        </div>
        <div>
          <h4 className="font-medium text-foreground">2. Field definitions</h4>
          <p>Each field maps a CSS selector to an output key:</p>
          <ul className="list-disc ml-4 mt-1 space-y-1">
            <li><strong>key</strong> — Output field name (e.g. <code className="bg-muted px-1 rounded">title</code>)</li>
            <li><strong>selector</strong> — CSS selector targeting the element (e.g. <code className="bg-muted px-1 rounded">.titleline &gt; a</code>)</li>
            <li><strong>type</strong> — Extraction method:
              <ul className="list-disc ml-4 mt-0.5">
                <li><code>text</code> — Element text content</li>
                <li><code>html</code> — Element inner HTML</li>
                <li><code>attribute</code> — Specific attribute value (e.g. href, src)</li>
                <li><code>list</code> — Repeated items with sub-fields (for tables, lists, grids)</li>
              </ul>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="font-medium text-foreground">3. Pagination (optional)</h4>
          <p>CSS selector for the "next page" button. The crawler will click it and continue scraping up to <strong>max pages</strong>.</p>
        </div>
        <div>
          <h4 className="font-medium text-foreground">4. How to find selectors</h4>
          <ul className="list-disc ml-4 mt-1 space-y-1">
            <li>Right-click the target element on a webpage → <strong>Inspect</strong></li>
            <li>In DevTools, right-click the highlighted element → <strong>Copy → Copy selector</strong></li>
            <li>Paste the selector into the field. You may need to simplify it (e.g. remove auto-generated classes)</li>
          </ul>
        </div>
        <div>
          <h4 className="font-medium text-foreground">5. Testing</h4>
          <p>Open the target webpage in another tab, then click <strong>Test</strong> in the form. It will run the scrape on that page and show the results.</p>
        </div>
        <div className="border-t pt-2">
          <h4 className="font-medium text-foreground">Example: Hacker News</h4>
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto mt-1">
{`Name: hn-top
URL Pattern: https://news.ycombinator.com/*

Fields:
  - key: items, selector: .titleline, type: list
    sub-fields:
      - key: title, selector: a, type: text
      - key: link,  selector: a, type: attribute (href)

Pagination:
  Next selector: .morelink
  Max pages: 5`}
          </pre>
        </div>
      </div>
    </details>
  )
}

export default function Options() {
  const { scrape_rules = [] } = useStorage<{ scrape_rules: ScrapeRule[] }>({
    scrape_rules: [],
  })
  const { crawl_tasks = [] } = useStorage<{ crawl_tasks: CrawlTask[] }>({
    crawl_tasks: [],
  })
  const [editingRule, setEditingRule] = useState<ScrapeRule | null | "new">(null)
  const [editingTask, setEditingTask] = useState<CrawlTask | null | "new">(null)
  const [cacheStats, setCacheStats] = useState<{ count: number; oldestAt: number | null }>({ count: 0, oldestAt: null })
  const { tool_settings: rawToolSettings } = useStorage<{ tool_settings: Partial<ToolSettings> }>({
    tool_settings: defaultToolSettings,
  })
  const toolSettings: ToolSettings = { ...defaultToolSettings, ...rawToolSettings }

  useEffect(() => {
    getCacheStats().then(setCacheStats)
  }, [])

  const toggleToolGroup = async (key: keyof ToolSettings) => {
    const updated = { ...toolSettings, [key]: !toolSettings[key] }
    await setLocal({ tool_settings: updated })
  }

  const handleClearCache = async () => {
    await clearDetailCache()
    setCacheStats({ count: 0, oldestAt: null })
  }

  const handleSaveRule = async (rule: ScrapeRule) => {
    const { scrape_rules: existing = [] } = await getLocal<{ scrape_rules: ScrapeRule[] }>("scrape_rules")
    const idx = existing.findIndex((r) => r.name === rule.name)
    if (idx >= 0) {
      rule.createdAt = existing[idx].createdAt
      existing[idx] = rule
    } else {
      existing.push(rule)
    }
    await setLocal({ scrape_rules: existing })
    setEditingRule(null)
  }

  const handleDeleteRule = async (name: string) => {
    const { scrape_rules: existing = [] } = await getLocal<{ scrape_rules: ScrapeRule[] }>("scrape_rules")
    await setLocal({ scrape_rules: existing.filter((r) => r.name !== name) })
  }

  const handleSaveTask = async (task: CrawlTask) => {
    const { crawl_tasks: existing = [] } = await getLocal<{ crawl_tasks: CrawlTask[] }>("crawl_tasks")
    const idx = existing.findIndex((t) => t.name === task.name)
    if (idx >= 0) {
      task.createdAt = existing[idx].createdAt
      existing[idx] = task
    } else {
      existing.push(task)
    }
    await setLocal({ crawl_tasks: existing })
    setEditingTask(null)
  }

  const handleDeleteTask = async (name: string) => {
    const { crawl_tasks: existing = [] } = await getLocal<{ crawl_tasks: CrawlTask[] }>("crawl_tasks")
    await setLocal({ crawl_tasks: existing.filter((t) => t.name !== name) })
  }

  if (editingRule !== null) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <RuleForm
          rule={editingRule === "new" ? undefined : editingRule}
          onSave={handleSaveRule}
          onCancel={() => setEditingRule(null)}
        />
      </div>
    )
  }

  if (editingTask !== null) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <TaskForm
          task={editingTask === "new" ? undefined : editingTask}
          rules={scrape_rules}
          onSave={handleSaveTask}
          onCancel={() => setEditingTask(null)}
        />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-semibold">Scrape Rules</h1>
          <div className="flex items-center gap-2">
            <ImportExport onImported={() => setEditingRule(null)} />
            <Button variant="outline" size="sm" onClick={loadPresets}>
              <Wand2 className="size-3" />
              Presets
            </Button>
            <Button size="sm" onClick={() => setEditingRule("new")}>
              <Plus className="size-3" />
              Add Rule
            </Button>
          </div>
        </div>
        <HelpPanel />
        <RuleList
          rules={scrape_rules}
          onEdit={(rule) => setEditingRule(rule)}
          onDelete={handleDeleteRule}
        />
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-semibold">Crawl Tasks</h1>
          <Button size="sm" onClick={() => setEditingTask("new")}>
            <Plus className="size-3" />
            Add Task
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Tasks combine a rule with a target URL. Run them from the popup or via MCP with one click.
        </p>
        {crawl_tasks.length === 0 && (
          <p className="text-sm text-muted-foreground">No tasks yet. Create one to get started.</p>
        )}
        <div className="space-y-2">
          {crawl_tasks.map((task) => (
            <div
              key={task.name}
              className="flex items-center gap-3 border rounded-md p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{task.name}</div>
                {task.description && (
                  <div className="text-xs text-muted-foreground truncate">{task.description}</div>
                )}
                <div className="text-xs text-muted-foreground truncate">
                  Rule: {task.ruleName} | {task.url}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditingTask(task)}>
                <Pencil className="size-3" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleDeleteTask(task.name)}>
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="size-4" />
          <h1 className="text-xl font-semibold">MCP Tool Settings</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Control which tool groups are exposed via MCP. Changes take effect on next MCP connection.
        </p>
        <div className="space-y-2">
          {([
            { key: "task" as const, label: "Task Tools", desc: "crawl_task_run, crawl_task_list, scrape_crawl, scrape, export_data, screenshot (default: on)" },
            { key: "page" as const, label: "Page Interaction", desc: "page_snapshot, click, type, press_key, scroll, hover, wait_for" },
            { key: "browser" as const, label: "Browser", desc: "switch-tab, get-tabs, new-tab, remove-tab, wait" },
            { key: "rule" as const, label: "Rule Management", desc: "scrape_rule_add, scrape_rule_list, scrape_rule_remove" },
          ]).map(({ key, label, desc }) => (
            <label
              key={key}
              className="flex items-start gap-3 border rounded-md p-3 cursor-pointer hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={toolSettings[key]}
                onChange={() => toggleToolGroup(key)}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-semibold">Detail Page Cache</h1>
          <Button variant="outline" size="sm" onClick={handleClearCache} disabled={cacheStats.count === 0}>
            <Trash2 className="size-3" />
            Clear Cache
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {cacheStats.count > 0
            ? `${cacheStats.count} cached page${cacheStats.count > 1 ? "s" : ""}${cacheStats.oldestAt ? ` (oldest: ${new Date(cacheStats.oldestAt).toLocaleDateString()})` : ""}`
            : "No cached pages"}
        </p>
      </div>
    </div>
  )
}
