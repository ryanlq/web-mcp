import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Play } from "lucide-react"

export interface ScriptTask {
  name: string
  description?: string
  urlPattern: string
  scriptBody: string
  timeout?: number
  createdAt: number
  updatedAt: number
}

export function defaultScript(): ScriptTask {
  return {
    name: "",
    urlPattern: "",
    scriptBody: "",
    timeout: 30,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export default function ScriptForm({
  script: initial,
  onSave,
  onCancel,
}: {
  script?: ScriptTask
  onSave: (script: ScriptTask) => void
  onCancel: () => void
}) {
  const [script, setScript] = useState<ScriptTask>(initial || defaultScript())
  const [testUrl, setTestUrl] = useState("")
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const update = (patch: Partial<ScriptTask>) => {
    setScript((prev) => ({ ...prev, ...patch }))
  }

  const handleSave = () => {
    if (!script.name || !script.scriptBody) return
    onSave({ ...script, updatedAt: Date.now() })
  }

  const waitTabLoad = (tabId: number) =>
    new Promise<void>((resolve) => {
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

      const timeoutSec = script.timeout || 30
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: (code: string, timeoutSec: number) => {
          return new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error("Script timeout")),
              timeoutSec * 1000
            )
            try {
              const fn = new Function(
                "return (async () => { " + code + " })()"
              )
              fn().then(
                (val: any) => {
                  clearTimeout(timer)
                  resolve(val)
                },
                (err: any) => {
                  clearTimeout(timer)
                  reject(err)
                }
              )
            } catch (e: any) {
              clearTimeout(timer)
              reject(e)
            }
          })
        },
        args: [script.scriptBody, timeoutSec],
      })

      const result = results[0]?.result
      if (result instanceof Error) {
        setTestResult(`Error: ${result.message}`)
      } else {
        setTestResult(JSON.stringify(result, null, 2))
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
          {initial ? "Edit Script" : "Add Script"}
        </h2>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 items-center">
        <label className="text-sm font-medium text-right">Name</label>
        <Input
          value={script.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="my-script"
        />

        <label className="text-sm font-medium text-right">Description</label>
        <Input
          value={script.description || ""}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="What this script extracts"
        />

        <label className="text-sm font-medium text-right">URL Pattern</label>
        <Input
          value={script.urlPattern}
          onChange={(e) => update({ urlPattern: e.target.value })}
          placeholder="https://x.com/*"
        />

        <label className="text-sm font-medium text-right">Timeout</label>
        <Input
          type="number"
          value={script.timeout || 30}
          onChange={(e) => update({ timeout: Number(e.target.value) || 30 })}
          className="w-24"
          placeholder="seconds"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">Script Body</label>
        <textarea
          value={script.scriptBody}
          onChange={(e) => update({ scriptBody: e.target.value })}
          placeholder={`// Return data to extract\nconst items = [];\ndocument.querySelectorAll('article').forEach(el => {\n  items.push({ text: el.textContent.trim() });\n});\nreturn items;`}
          className="w-full min-h-[200px] rounded-md border bg-background p-3 text-sm font-mono leading-relaxed resize-y"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Async/await supported. Must return a value. Runs in page context (MAIN world).
        </p>
      </div>

      <div className="border rounded-md p-3 space-y-2">
        <label className="text-sm font-medium">Test URL</label>
        <div className="flex gap-2">
          <Input
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="https://x.com/username"
            className="flex-1"
          />
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing || !script.scriptBody}
          >
            <Play className="size-3" />
            {testing ? "Testing..." : "Test"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Enter the actual page URL to test your script. Leave empty to use any open tab.
        </p>
      </div>

      {testResult && (
        <div className="border rounded-md p-3 bg-muted">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">Test Result</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTestResult(null)}
            >
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
          disabled={!script.name || !script.scriptBody}
        >
          Save
        </Button>
      </div>
    </div>
  )
}
