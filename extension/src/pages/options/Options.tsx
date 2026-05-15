import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  Wand2,
  Trash2,
  Pencil,
  Settings,
  ListChecks,
  BookOpen,
  Code2,
  FileText,
} from "lucide-react"
import useStorage from "@/hooks/useStorage"
import { getLocal, setLocal } from "@/utils/ext"
import RuleList from "@/components/rules/RuleList"
import RuleForm from "@/components/rules/RuleForm"
import ScriptForm, { type ScriptTask } from "@/components/scripts/ScriptForm"
import ImportExport from "@/components/rules/ImportExport"
import TaskForm, { type CrawlTask } from "@/components/tasks/TaskForm"
import type { ScrapeRule } from "@/components/rules/RuleForm"
import { clearDetailCache, getCacheStats } from "@/bg/tools"
import { type ToolSettings, defaultToolSettings } from "@/bg/mcp"
import { version } from "@/manifest"

// ─── Preset Data ────────────────────────────────────────────

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
          {
            key: "time",
            selector: ".age",
            type: "attribute",
            attribute: "title",
          },
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
          {
            key: "link",
            selector: "p.title a",
            type: "attribute",
            attribute: "href",
          },
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
          {
            key: "link",
            selector: "td:nth-child(5) a",
            type: "attribute",
            attribute: "href",
          },
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
          {
            key: "link",
            selector: "div.tt a",
            type: "attribute",
            attribute: "href",
          },
          { key: "summary", selector: "div.text.ellipsis-2", type: "text" },
          {
            key: "tags",
            selector: "div.tags a",
            type: "list",
            fields: [{ key: "tag", selector: "a", type: "text" }],
          },
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
          {
            key: "time",
            selector: "time",
            type: "attribute",
            attribute: "datetime",
          },
          {
            key: "link",
            selector: 'a[href*="/status/"]',
            type: "attribute",
            attribute: "href",
          },
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
    description:
      "抓取财联社7x24小时实时电报快讯，包括新闻标题、正文和时间。适用于用户想了解最新金融市场快讯、实时资讯时调用。",
    ruleName: "cls-telegraph",
    url: "https://www.cls.cn/telegraph",
    exposeToMcp: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "东方财富-龙虎榜解读",
    description:
      "抓取东方财富网龙虎榜解读文章，包括文章标题、摘要和日期。适用于用户想了解龙虎榜数据、游资动向、主力资金分析时调用。",
    ruleName: "eastmoney-lhb",
    url: "https://stock.eastmoney.com/a/clhbjd.html",
    exposeToMcp: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "东方财富-研报速递",
    description:
      "抓取东方财富网最新券商研报列表，包括股票代码、研报标题、评级、券商名称、行业和日期。适用于用户想了解最新券商研报、机构观点、个股评级变动时调用。",
    ruleName: "eastmoney-report",
    url: "https://data.eastmoney.com/report/",
    exposeToMcp: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "证券时报-要闻",
    description:
      "抓取证券时报网要闻栏目最新新闻，包括新闻标题、摘要、来源和标签。适用于用户想了解最新财经要闻、宏观政策、市场动态时调用。",
    ruleName: "stcn-news",
    url: "https://www.stcn.com/article/list/yw.html",
    exposeToMcp: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "STOCK调研公社推文",
    description:
      "抓取推特博主@STOCK6688的最新推文，包括推文正文、发布时间和链接。适用于用户想了解STOCK调研公社的最新投资观点、行业分析、概念整理时调用。",
    ruleName: "x-tweets",
    url: "https://x.com/STOCK6688",
    exposeToMcp: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "Twitter/X Timeline",
    description:
      "抓取Twitter/X任意用户的最新推文，使用脚本自动滚动加载。适用于用户想了解某推特博主的最新动态时调用。",
    scriptName: "x-timeline",
    url: "https://x.com/",
    exposeToMcp: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "Reddit Posts",
    description:
      "抓取Reddit帖子列表。适用于用户想了解某个subreddit的热门帖子时调用。",
    scriptName: "reddit-posts",
    url: "https://www.reddit.com/",
    exposeToMcp: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "Hacker News Stories",
    description:
      "抓取Hacker News首页故事。使用脚本提取标题、链接、分数和评论数。",
    scriptName: "hn-stories",
    url: "https://news.ycombinator.com/",
    exposeToMcp: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

const presetScripts: ScriptTask[] = [
  {
    name: "x-timeline",
    description: "Twitter/X 推文提取（自动滚动加载）",
    urlPattern: "https://x.com/*",
    scriptBody: `const tweets = [];
const seen = new Set();
const maxTweets = 20;
let noNew = 0;

while (tweets.length < maxTweets && noNew < 5) {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  let added = 0;
  for (const art of articles) {
    const linkEl = art.querySelector('a[href*="/status/"]');
    const href = linkEl?.getAttribute('href') || '';
    if (seen.has(href)) continue;
    seen.add(href);
    added++;
    tweets.push({
      text: art.querySelector('[data-testid="tweetText"]')?.textContent?.trim() || '',
      time: art.querySelector('time')?.getAttribute('datetime') || '',
      link: href,
    });
  }
  if (tweets.length >= maxTweets) break;
  if (added === 0) { noNew++; } else { noNew = 0; }
  window.scrollBy(0, 800);
  await new Promise(r => setTimeout(r, 1500));
}

return tweets.slice(0, maxTweets);`,
    timeout: 60,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "reddit-posts",
    description: "Reddit 帖子提取",
    urlPattern: "https://www.reddit.com/*",
    scriptBody: `const posts = [];
const seen = new Set();

for (let i = 0; i < 3; i++) {
  const items = document.querySelectorAll('shreddit-post');
  items.forEach(el => {
    const id = el.getAttribute('id') || el.getAttribute('thingid') || '';
    if (seen.has(id)) return;
    seen.add(id);
    posts.push({
      title: el.getAttribute('post-title') || '',
      author: el.getAttribute('author') || '',
      score: el.getAttribute('score') || '',
      url: el.getAttribute('permalink') || '',
      comments: el.getAttribute('comment-count') || '',
    });
  });
  if (posts.length >= 20) break;
  window.scrollBy(0, 800);
  await new Promise(r => setTimeout(r, 1500));
}

return posts.slice(0, 20);`,
    timeout: 30,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    name: "hn-stories",
    description: "Hacker News 故事提取",
    urlPattern: "https://news.ycombinator.com/*",
    scriptBody: `const rows = document.querySelectorAll('tr.athing');
const stories = [];
rows.forEach(row => {
  const titleEl = row.querySelector('.titleline > a');
  const subtext = row.nextElementSibling;
  const score = subtext?.querySelector('.score')?.textContent || '';
  const comments = subtext?.querySelector('a[href*="item"]')?.textContent?.match(/\\d+/)?.[0] || '';
  if (titleEl) {
    stories.push({
      title: titleEl.textContent.trim(),
      url: titleEl.getAttribute('href'),
      score,
      comments,
    });
  }
});
return stories;`,
    timeout: 15,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

async function loadPresets() {
  const { scrape_rules = [] } = await getLocal<{ scrape_rules: ScrapeRule[] }>(
    "scrape_rules"
  )
  const existingRuleNames = new Set(scrape_rules.map((r) => r.name))
  const newRules = presetRules.filter((r) => !existingRuleNames.has(r.name))
  if (newRules.length > 0) {
    await setLocal({ scrape_rules: [...scrape_rules, ...newRules] })
  }

  const { script_tasks = [] } = await getLocal<{ script_tasks: ScriptTask[] }>(
    "script_tasks"
  )
  const existingScriptNames = new Set(script_tasks.map((s) => s.name))
  const newScripts = presetScripts.filter(
    (s) => !existingScriptNames.has(s.name)
  )
  if (newScripts.length > 0) {
    await setLocal({ script_tasks: [...script_tasks, ...newScripts] })
  }

  const { crawl_tasks = [] } = await getLocal<{ crawl_tasks: CrawlTask[] }>(
    "crawl_tasks"
  )
  const existingTaskNames = new Set(crawl_tasks.map((t) => t.name))
  const newTasks = presetTasks.filter((t) => !existingTaskNames.has(t.name))
  if (newTasks.length > 0) {
    await setLocal({ crawl_tasks: [...crawl_tasks, ...newTasks] })
  }
}

// ─── Sidebar Navigation ────────────────────────────────────

type Tab = "tasks" | "library" | "settings"
type EditingView = "rule" | "script" | "task" | null

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-primary/90 text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Help Panel ─────────────────────────────────────────────

function HelpPanel() {
  return (
    <details className="border rounded-md p-4 text-sm text-muted-foreground space-y-3">
      <summary className="flex items-center gap-1.5 font-medium text-foreground cursor-pointer">
        How to create a scrape rule
      </summary>
      <div className="mt-3 space-y-3">
        <div>
          <h4 className="font-medium text-foreground">1. Basic fields</h4>
          <ul className="list-disc ml-4 mt-1 space-y-1">
            <li>
              <strong>Name</strong> — Unique identifier for the rule
            </li>
            <li>
              <strong>URL Pattern</strong> — Which pages this rule applies to.
              Supports wildcards:{" "}
              <code className="bg-muted px-1 rounded">
                https://news.ycombinator.com/*
              </code>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="font-medium text-foreground">2. Field definitions</h4>
          <p>Each field maps a CSS selector to an output key:</p>
          <ul className="list-disc ml-4 mt-1 space-y-1">
            <li>
              <strong>key</strong> — Output field name (e.g.{" "}
              <code className="bg-muted px-1 rounded">title</code>)
            </li>
            <li>
              <strong>selector</strong> — CSS selector targeting the element
            </li>
            <li>
              <strong>type</strong> — <code>text</code>, <code>html</code>,{" "}
              <code>attribute</code>, or <code>list</code> (for repeated items
              with sub-fields)
            </li>
          </ul>
        </div>
        <div>
          <h4 className="font-medium text-foreground">
            3. Pagination (optional)
          </h4>
          <p>
            CSS selector for the "next page" button. The crawler will click it
            and continue scraping up to <strong>max pages</strong>.
          </p>
        </div>
        <div>
          <h4 className="font-medium text-foreground">
            4. How to find selectors
          </h4>
          <ul className="list-disc ml-4 mt-1 space-y-1">
            <li>
              Right-click the target element → <strong>Inspect</strong>
            </li>
            <li>
              In DevTools, right-click the highlighted element →{" "}
              <strong>Copy → Copy selector</strong>
            </li>
          </ul>
        </div>
      </div>
    </details>
  )
}

// ─── Tab Panels ─────────────────────────────────────────────

function TasksPanel({
  tasks,
  onAdd,
  onEdit,
  onDelete,
  onToggleMcp,
}: {
  tasks: CrawlTask[]
  onAdd: () => void
  onEdit: (task: CrawlTask) => void
  onDelete: (name: string) => void
  onToggleMcp: (name: string) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Crawl Tasks</h2>
        <Button size="sm" onClick={onAdd}>
          <Plus className="size-3" />
          Add Task
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Tasks combine a rule or script with a target URL. Run them from the
        popup or via MCP.
      </p>
      {tasks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ListChecks className="size-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No tasks yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.name}
              className="flex items-center gap-3 border rounded-md p-3 hover:bg-accent/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{task.name}</div>
                {task.description && (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {task.description}
                  </div>
                )}
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {task.url}
                </div>
              </div>
              <Badge variant={task.scriptName ? "default" : "outline"}>
                {task.scriptName ? (
                  <>
                    <Code2 className="size-3" /> {task.scriptName}
                  </>
                ) : (
                  <>
                    <FileText className="size-3" /> {task.ruleName}
                  </>
                )}
              </Badge>
              <label
                className="flex items-center gap-1 cursor-pointer"
                title={task.exposeToMcp !== false ? "Exposed to MCP" : "Hidden from MCP"}
                onClick={(e) => { e.stopPropagation(); onToggleMcp(task.name) }}
              >
                <div className={`w-8 h-4 rounded-full transition-colors relative ${task.exposeToMcp !== false ? "bg-emerald-500" : "bg-zinc-600"}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${task.exposeToMcp !== false ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
              </label>
              <Button variant="ghost" size="icon" onClick={() => onEdit(task)}>
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm(`Delete task "${task.name}"?`))
                    onDelete(task.name)
                }}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LibraryPanel({
  rules,
  scripts,
  onAddRule,
  onEditRule,
  onDeleteRule,
  onAddScript,
  onEditScript,
  onDeleteScript,
  onLoadPresets,
}: {
  rules: ScrapeRule[]
  scripts: ScriptTask[]
  onAddRule: () => void
  onEditRule: (rule: ScrapeRule) => void
  onDeleteRule: (name: string) => void
  onAddScript: () => void
  onEditScript: (script: ScriptTask) => void
  onDeleteScript: (name: string) => void
  onLoadPresets: () => void
}) {
  const [subTab, setSubTab] = useState<"rules" | "scripts">("rules")

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 border rounded-md p-0.5">
          <button
            onClick={() => setSubTab("rules")}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              subTab === "rules"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Rules
          </button>
          <button
            onClick={() => setSubTab("scripts")}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              subTab === "scripts"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Scripts
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onLoadPresets}>
            <Wand2 className="size-3" />
            Presets
          </Button>
          {subTab === "rules" && (
            <>
              <ImportExport onImported={() => {}} />
              <Button size="sm" onClick={onAddRule}>
                <Plus className="size-3" />
                Add Rule
              </Button>
            </>
          )}
          {subTab === "scripts" && (
            <Button size="sm" onClick={onAddScript}>
              <Plus className="size-3" />
              Add Script
            </Button>
          )}
        </div>
      </div>

      {subTab === "rules" && (
        <>
          <HelpPanel />
          <div className="mt-4">
            <RuleList
              rules={rules}
              onEdit={onEditRule}
              onDelete={onDeleteRule}
            />
          </div>
        </>
      )}

      {subTab === "scripts" && (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            Custom JavaScript scripts for SPA sites. Runs in page context with
            async/await.
          </p>
          {scripts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Code2 className="size-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">
                No scripts yet. Click Presets to load defaults.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {scripts.map((script) => (
                <div
                  key={script.name}
                  className="flex items-center gap-3 border rounded-md p-3 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{script.name}</div>
                    {script.description && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {script.description}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {script.urlPattern} &middot; {script.timeout || 30}s
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEditScript(script)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Delete script "${script.name}"?`))
                        onDeleteScript(script.name)
                    }}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SettingsPanel({
  toolSettings,
  onToggleTool,
  cacheStats,
  onClearCache,
}: {
  toolSettings: ToolSettings
  onToggleTool: (key: keyof ToolSettings) => void
  cacheStats: { count: number; oldestAt: number | null }
  onClearCache: () => void
}) {
  const toolGroups = [
    {
      key: "task" as const,
      label: "Task Tools",
      desc: "crawl_task_run, crawl_task_list, crawl_task_status, crawl_task_result, scrape_crawl",
    },
    {
      key: "scrape" as const,
      label: "Scrape Tools",
      desc: "scrape, export_data, screenshot",
    },
    {
      key: "script" as const,
      label: "Script Tools",
      desc: "script_task_add, script_task_list, script_task_remove",
    },
    {
      key: "page" as const,
      label: "Page Interaction",
      desc: "page_snapshot, click, type, scroll, hover, wait_for",
    },
    {
      key: "browser" as const,
      label: "Browser",
      desc: "switch-tab, get-tabs, new-tab, remove-tab",
    },
    {
      key: "rule" as const,
      label: "Rule Management",
      desc: "scrape_rule_add, scrape_rule_list, scrape_rule_remove",
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Settings className="size-4" />
          <h2 className="text-lg font-semibold">MCP Tool Settings</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Control which tool groups are exposed via MCP. Changes take effect on
          next connection.
        </p>
        <div className="space-y-2">
          {toolGroups.map(({ key, label, desc }) => (
            <label
              key={key}
              className="flex items-start gap-3 border rounded-md p-3 cursor-pointer hover:bg-accent/30 transition-colors"
            >
              <input
                type="checkbox"
                checked={toolSettings[key]}
                onChange={() => onToggleTool(key)}
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

      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Detail Page Cache</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={onClearCache}
            disabled={cacheStats.count === 0}
          >
            <Trash2 className="size-3" />
            Clear
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {cacheStats.count > 0
            ? `${cacheStats.count} cached page${
                cacheStats.count > 1 ? "s" : ""
              }${
                cacheStats.oldestAt
                  ? ` (oldest: ${new Date(
                      cacheStats.oldestAt
                    ).toLocaleDateString()})`
                  : ""
              }`
            : "No cached pages"}
        </p>
      </div>
    </div>
  )
}

// ─── Main Options Layout ────────────────────────────────────

export default function Options() {
  const { scrape_rules = [] } = useStorage<{ scrape_rules: ScrapeRule[] }>({
    scrape_rules: [],
  })
  const { crawl_tasks = [] } = useStorage<{ crawl_tasks: CrawlTask[] }>({
    crawl_tasks: [],
  })
  const { script_tasks = [] } = useStorage<{ script_tasks: ScriptTask[] }>({
    script_tasks: [],
  })
  const { tool_settings: rawToolSettings } = useStorage<{
    tool_settings: Partial<ToolSettings>
  }>({
    tool_settings: defaultToolSettings,
  })
  const toolSettings: ToolSettings = {
    ...defaultToolSettings,
    ...rawToolSettings,
  }

  const [tab, setTab] = useState<Tab>("tasks")
  const [editingView, setEditingView] = useState<EditingView>(null)
  const [editingData, setEditingData] = useState<
    ScrapeRule | ScriptTask | CrawlTask | null
  >(null)
  const [cacheStats, setCacheStats] = useState<{
    count: number
    oldestAt: number | null
  }>({ count: 0, oldestAt: null })

  useEffect(() => {
    getCacheStats().then(setCacheStats)
  }, [])

  // ─── Handlers ───

  const toggleToolGroup = async (key: keyof ToolSettings) => {
    const updated = { ...toolSettings, [key]: !toolSettings[key] }
    await setLocal({ tool_settings: updated })
  }

  const handleClearCache = async () => {
    await clearDetailCache()
    setCacheStats({ count: 0, oldestAt: null })
  }

  const startEdit = (
    view: EditingView,
    data?: ScrapeRule | ScriptTask | CrawlTask
  ) => {
    setEditingView(view)
    setEditingData(data || null)
  }

  const cancelEdit = () => {
    setEditingView(null)
    setEditingData(null)
  }

  const handleSaveRule = async (rule: ScrapeRule) => {
    const { scrape_rules: existing = [] } = await getLocal<{
      scrape_rules: ScrapeRule[]
    }>("scrape_rules")
    const idx = existing.findIndex((r) => r.name === rule.name)
    if (idx >= 0) {
      rule.createdAt = existing[idx].createdAt
      existing[idx] = rule
    } else {
      existing.push(rule)
    }
    await setLocal({ scrape_rules: existing })
    cancelEdit()
  }

  const handleDeleteRule = async (name: string) => {
    const { scrape_rules: existing = [] } = await getLocal<{
      scrape_rules: ScrapeRule[]
    }>("scrape_rules")
    await setLocal({ scrape_rules: existing.filter((r) => r.name !== name) })
  }

  const handleSaveTask = async (task: CrawlTask) => {
    const { crawl_tasks: existing = [] } = await getLocal<{
      crawl_tasks: CrawlTask[]
    }>("crawl_tasks")
    const idx = existing.findIndex((t) => t.name === task.name)
    if (idx >= 0) {
      task.createdAt = existing[idx].createdAt
      existing[idx] = task
    } else {
      existing.push(task)
    }
    await setLocal({ crawl_tasks: existing })
    cancelEdit()
  }

  const handleDeleteTask = async (name: string) => {
    const { crawl_tasks: existing = [] } = await getLocal<{
      crawl_tasks: CrawlTask[]
    }>("crawl_tasks")
    await setLocal({ crawl_tasks: existing.filter((t) => t.name !== name) })
  }

  const handleToggleMcp = async (name: string) => {
    const { crawl_tasks: existing = [] } = await getLocal<{
      crawl_tasks: CrawlTask[]
    }>("crawl_tasks")
    const idx = existing.findIndex((t) => t.name === name)
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], exposeToMcp: existing[idx].exposeToMcp === false }
      await setLocal({ crawl_tasks: existing })
    }
  }

  const handleSaveScript = async (script: ScriptTask) => {
    const { script_tasks: existing = [] } = await getLocal<{
      script_tasks: ScriptTask[]
    }>("script_tasks")
    const idx = existing.findIndex((s) => s.name === script.name)
    if (idx >= 0) {
      script.createdAt = existing[idx].createdAt
      existing[idx] = script
    } else {
      existing.push(script)
    }
    await setLocal({ script_tasks: existing })
    cancelEdit()
  }

  const handleDeleteScript = async (name: string) => {
    const { script_tasks: existing = [] } = await getLocal<{
      script_tasks: ScriptTask[]
    }>("script_tasks")
    await setLocal({ script_tasks: existing.filter((s) => s.name !== name) })
  }

  // ─── Render ───

  const editingRuleData =
    editingView === "rule" ? (editingData as ScrapeRule | null) : undefined
  const editingScriptData =
    editingView === "script" ? (editingData as ScriptTask | null) : undefined
  const editingTaskData =
    editingView === "task" ? (editingData as CrawlTask | null) : undefined

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <nav className="w-48 shrink-0 border-r bg-muted/30 flex flex-col">
        <div className="p-4 pb-2">
          <div className="text-base font-bold">Web MCP</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            v{version}
          </div>
        </div>
        <div className="px-3 py-2 space-y-1 flex-1">
          <NavItem
            icon={<ListChecks className="size-4" />}
            label="Tasks"
            active={tab === "tasks" && !editingView}
            onClick={() => {
              setTab("tasks")
              cancelEdit()
            }}
          />
          <NavItem
            icon={<BookOpen className="size-4" />}
            label="Library"
            active={tab === "library" && !editingView}
            onClick={() => {
              setTab("library")
              cancelEdit()
            }}
          />
          <NavItem
            icon={<Settings className="size-4" />}
            label="Settings"
            active={tab === "settings" && !editingView}
            onClick={() => {
              setTab("settings")
              cancelEdit()
            }}
          />
        </div>
        <div className="p-4 pt-2 border-t">
          <a
            href="https://web-mcp.ziziyi.com/docs"
            target="_blank"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Docs & Help
          </a>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-3xl mx-auto">
          {editingView === "rule" && (
            <RuleForm
              rule={editingRuleData || undefined}
              onSave={handleSaveRule}
              onCancel={cancelEdit}
            />
          )}
          {editingView === "script" && (
            <ScriptForm
              script={editingScriptData || undefined}
              onSave={handleSaveScript}
              onCancel={cancelEdit}
            />
          )}
          {editingView === "task" && (
            <TaskForm
              task={editingTaskData || undefined}
              rules={scrape_rules}
              scripts={script_tasks}
              onSave={handleSaveTask}
              onCancel={cancelEdit}
            />
          )}
          {!editingView && tab === "tasks" && (
            <TasksPanel
              tasks={crawl_tasks}
              onAdd={() => startEdit("task")}
              onEdit={(task) => startEdit("task", task)}
              onDelete={handleDeleteTask}
              onToggleMcp={handleToggleMcp}
            />
          )}
          {!editingView && tab === "library" && (
            <LibraryPanel
              rules={scrape_rules}
              scripts={script_tasks}
              onAddRule={() => startEdit("rule")}
              onEditRule={(rule) => startEdit("rule", rule)}
              onDeleteRule={handleDeleteRule}
              onAddScript={() => startEdit("script")}
              onEditScript={(script) => startEdit("script", script)}
              onDeleteScript={handleDeleteScript}
              onLoadPresets={loadPresets}
            />
          )}
          {!editingView && tab === "settings" && (
            <SettingsPanel
              toolSettings={toolSettings}
              onToggleTool={toggleToolGroup}
              cacheStats={cacheStats}
              onClearCache={handleClearCache}
            />
          )}
        </div>
      </main>
    </div>
  )
}
