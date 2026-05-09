import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, HelpCircle, Wand2, Trash2, Pencil } from "lucide-react"
import useStorage from "@/hooks/useStorage"
import { getLocal, setLocal } from "@/utils/ext"
import RuleList from "@/components/rules/RuleList"
import RuleForm from "@/components/rules/RuleForm"
import ImportExport from "@/components/rules/ImportExport"
import TaskForm, { type CrawlTask } from "@/components/tasks/TaskForm"
import type { ScrapeRule } from "@/components/rules/RuleForm"

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
]

async function loadPresets() {
  const { scrape_rules = [] } = await getLocal<{ scrape_rules: ScrapeRule[] }>("scrape_rules")
  const existingNames = new Set(scrape_rules.map((r) => r.name))
  const newRules = presetRules.filter((r) => !existingNames.has(r.name))
  if (newRules.length === 0) return
  await setLocal({ scrape_rules: [...scrape_rules, ...newRules] })
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
    </div>
  )
}
