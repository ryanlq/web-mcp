import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldEditor, defaultField, type ScrapeField } from "./FieldEditor"
import { ArrowLeft, Play } from "lucide-react"

export interface ScrapeRule {
  name: string
  urlPattern: string
  fields: ScrapeField[]
  nextPageSelector?: string
  detailLinkSelector?: string
  detailFields?: ScrapeField[]
  maxPages?: number
  createdAt: number
  updatedAt: number
}

export function defaultRule(): ScrapeRule {
  return {
    name: "",
    urlPattern: "",
    fields: [defaultField()],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export default function RuleForm({
  rule: initial,
  onSave,
  onCancel,
}: {
  rule?: ScrapeRule
  onSave: (rule: ScrapeRule) => void
  onCancel: () => void
}) {
  const [rule, setRule] = useState<ScrapeRule>(initial || defaultRule())
  const [testUrl, setTestUrl] = useState("")
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const update = (patch: Partial<ScrapeRule>) => {
    setRule((prev) => ({ ...prev, ...patch }))
  }

  const handleSave = () => {
    if (!rule.name || !rule.urlPattern || !rule.fields.length) return
    onSave({ ...rule, updatedAt: Date.now() })
  }

  const scrapeFn = (fieldsJson: string) => {
    const fields = JSON.parse(fieldsJson)
    const result: Record<string, any> = {}
    for (const field of fields) {
      const els = document.querySelectorAll(field.selector)
      if (field.type === "list") {
        result[field.key] = Array.from(els).map((el) => {
          const item: Record<string, any> = {}
          for (const sub of field.fields || []) {
            const subEl = el.matches(sub.selector) ? el : el.querySelector(sub.selector)
            if (!subEl) { item[sub.key] = null; continue }
            if (sub.type === "attribute") item[sub.key] = subEl.getAttribute(sub.attribute || "")
            else item[sub.key] = subEl.textContent?.trim() || ""
          }
          return item
        })
      } else if (els.length > 1) {
        result[field.key] = Array.from(els).map((el) => {
          if (field.type === "attribute") return el.getAttribute(field.attribute || "")
          if (field.type === "html") return el.innerHTML
          return el.textContent?.trim() || ""
        })
      } else {
        const el = els[0]
        if (!el) { result[field.key] = null; continue }
        if (field.type === "attribute") result[field.key] = el.getAttribute(field.attribute || "")
        else if (field.type === "html") result[field.key] = el.innerHTML
        else result[field.key] = el.textContent?.trim() || ""
      }
    }
    return result
  }

  const waitTabLoad = (tabId: number) => new Promise<void>((resolve) => {
    const handler = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(handler)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(handler)
  })

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      let tabId: number | undefined

      if (testUrl) {
        const tabs = await chrome.tabs.query({})
        const existing = tabs.find((t) => t.url === testUrl || t.pendingUrl === testUrl)
        if (existing?.id) {
          tabId = existing.id
        } else {
          const newTab = await chrome.tabs.create({ url: testUrl, active: false })
          tabId = newTab.id
          await waitTabLoad(tabId)
        }
      } else {
        const tabs = await chrome.tabs.query({})
        const tab = tabs.find((t) => (t.url || "").startsWith("http"))
        if (!tab?.id) {
          setTestResult("Error: Enter a test URL above, or open a target webpage first.")
          setTesting(false)
          return
        }
        tabId = tab.id
      }

      // 1. Scrape listing page
      const listResults = await chrome.scripting.executeScript({
        target: { tabId },
        world: "ISOLATED",
        func: scrapeFn,
        args: [JSON.stringify(rule.fields)],
      })
      const listData = listResults[0]?.result
      if (!listData) {
        setTestResult("Error: No data extracted from listing page")
        setTesting(false)
        return
      }

      // 2. If detail extraction configured, test first detail page
      if (rule.detailLinkSelector && rule.detailFields?.length) {
        const linkResults = await chrome.scripting.executeScript({
          target: { tabId },
          world: "ISOLATED",
          func: (selector: string) => {
            const el = document.querySelector(selector)
            if (!el) return null
            const a = el.closest("a") || el.querySelector("a")
            return a ? a.getAttribute("href") : null
          },
          args: [rule.detailLinkSelector],
        })
        const detailUrl = linkResults[0]?.result as string | null
        if (!detailUrl) {
          setTestResult(JSON.stringify({
            _warning: "Detail link not found, showing listing page only",
            ...listData,
          }, null, 2))
          setTesting(false)
          return
        }

        // Resolve relative URLs
        const tab = await chrome.tabs.get(tabId)
        const fullUrl = detailUrl.startsWith("http")
          ? detailUrl
          : new URL(detailUrl, tab.url).href

        const detailTab = await chrome.tabs.create({ url: fullUrl, active: false })
        await waitTabLoad(detailTab.id!)

        const detailResults = await chrome.scripting.executeScript({
          target: { tabId: detailTab.id! },
          world: "ISOLATED",
          func: scrapeFn,
          args: [JSON.stringify(rule.detailFields)],
        })
        const detailData = detailResults[0]?.result
        await chrome.tabs.remove(detailTab.id!)

        // Merge detail into first list item
        const listItems = Object.values(listData).find((v) => Array.isArray(v)) as any[] | undefined
        if (listItems?.length && detailData) {
          Object.assign(listItems[0], { _detail: detailData })
        }

        setTestResult(JSON.stringify(listData, null, 2))
      } else {
        setTestResult(JSON.stringify(listData, null, 2))
      }
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="text-lg font-semibold">
          {initial ? "Edit Rule" : "Add Rule"}
        </h2>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 items-center">
        <label className="text-sm font-medium text-right">Name</label>
        <Input
          value={rule.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="my-rule"
        />

        <label className="text-sm font-medium text-right">URL Pattern</label>
        <Input
          value={rule.urlPattern}
          onChange={(e) => update({ urlPattern: e.target.value })}
          placeholder="https://example.com/*"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">Fields</label>
        <FieldEditor
          fields={rule.fields}
          onChange={(fields) => update({ fields })}
        />
      </div>

      <details className="border rounded-md p-3">
        <summary className="text-sm font-medium cursor-pointer">
          Pagination (optional)
        </summary>
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 items-center">
          <label className="text-sm text-right">Next selector</label>
          <Input
            value={rule.nextPageSelector || ""}
            onChange={(e) => update({ nextPageSelector: e.target.value })}
            placeholder=".next-page-btn"
          />
          <label className="text-sm text-right">Max pages</label>
          <Input
            type="number"
            value={rule.maxPages || 5}
            onChange={(e) => update({ maxPages: Number(e.target.value) || 5 })}
            className="w-24"
          />
        </div>
      </details>

      <details className="border rounded-md p-3">
        <summary className="text-sm font-medium cursor-pointer">
          Detail Pages (optional)
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-[auto_1fr] gap-x-4 items-center">
            <label className="text-sm text-right">Link selector</label>
            <Input
              value={rule.detailLinkSelector || ""}
              onChange={(e) => update({ detailLinkSelector: e.target.value })}
              placeholder="a.detail-link"
            />
          </div>
          {rule.detailFields && (
            <FieldEditor
              fields={rule.detailFields}
              onChange={(detailFields) => update({ detailFields })}
            />
          )}
          {!rule.detailFields && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => update({ detailFields: [defaultField()] })}
            >
              Add Detail Fields
            </Button>
          )}
        </div>
      </details>

      <div className="border rounded-md p-3 space-y-2">
        <label className="text-sm font-medium">Test URL</label>
        <div className="flex gap-2">
          <Input
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="https://stock.stockstar.com/SS2026050900004434.shtml"
            className="flex-1"
          />
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing || !rule.fields.length}
          >
            <Play className="size-3" />
            {testing ? "Testing..." : "Test"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Enter the actual page URL to test your rule against. Leave empty to use any open tab.
        </p>
      </div>

      {testResult && (
        <div className="border rounded-md p-3 bg-muted">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">Test Result</span>
            <Button variant="ghost" size="sm" onClick={() => setTestResult(null)}>
              Close
            </Button>
          </div>
          <pre className="text-xs overflow-auto max-h-64 whitespace-pre-wrap">
            {testResult}
          </pre>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1" />
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!rule.name || !rule.urlPattern || !rule.fields.length}
        >
          Save
        </Button>
      </div>
    </div>
  )
}
