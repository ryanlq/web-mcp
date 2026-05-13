import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Play, CheckCircle } from "lucide-react"

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

function highlightJson(json: string): React.ReactNode[] {
  const lines = json.split("\n")
  return lines.map((line, i) => {
    const parts: React.ReactNode[] = []
    let remaining = line
    let key = 0

    while (remaining.length > 0) {
      // key: "value"
      const kvMatch = remaining.match(/^(\s*)"([^"]+)":\s*/)
      if (kvMatch) {
        parts.push(<span key={key++}>{kvMatch[1]}</span>)
        parts.push(<span key={key++} className="text-sky-400">"{kvMatch[2]}"</span>)
        parts.push(<span key={key++}>{kvMatch[0].slice(kvMatch[1].length + kvMatch[2].length + 3)}</span>)
        remaining = remaining.slice(kvMatch[0].length)
        continue
      }
      // string value
      const strMatch = remaining.match(/^:?\s*"([^"]*)"(,?)\s*(.*)/)
      if (strMatch) {
        parts.push(<span key={key++}>{strMatch[0].startsWith(":") ? ": " : ""}</span>)
        parts.push(<span key={key++} className="text-amber-300">"{strMatch[1]}"</span>)
        parts.push(<span key={key++}>{strMatch[2]}</span>)
        remaining = strMatch[3]
        continue
      }
      // number
      const numMatch = remaining.match(/^:?\s*(\d+\.?\d*)(,?)\s*(.*)/)
      if (numMatch) {
        parts.push(<span key={key++}>{numMatch[0].startsWith(":") ? ": " : ""}</span>)
        parts.push(<span key={key++} className="text-purple-400">{numMatch[1]}</span>)
        parts.push(<span key={key++}>{numMatch[2]}</span>)
        remaining = numMatch[3]
        continue
      }
      // boolean / null
      const boolMatch = remaining.match(/^:?\s*(true|false|null)(,?)\s*(.*)/)
      if (boolMatch) {
        parts.push(<span key={key++}>{boolMatch[0].startsWith(":") ? ": " : ""}</span>)
        parts.push(<span key={key++} className="text-orange-400">{boolMatch[1]}</span>)
        parts.push(<span key={key++}>{boolMatch[2]}</span>)
        remaining = boolMatch[3]
        continue
      }
      // brackets, commas, whitespace
      parts.push(<span key={key++}>{remaining}</span>)
      break
    }
    return <div key={i} className="leading-relaxed">{parts}</div>
  })
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
  const [testError, setTestError] = useState(false)
  const [testing, setTesting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const update = (patch: Partial<ScriptTask>) => {
    setScript((prev) => ({ ...prev, ...patch }))
  }

  const handleSave = () => {
    if (!script.name || !script.scriptBody) return
    onSave({ ...script, updatedAt: Date.now() })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return
    e.preventDefault()
    const textarea = e.currentTarget
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const value = script.scriptBody
    update({ scriptBody: value.substring(0, start) + "  " + value.substring(end) })
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + 2
    })
  }

  const lineCount = script.scriptBody.split("\n").length

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
    setTestError(false)
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
          setTestError(true)
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
        setTestError(true)
      } else {
        setTestResult(JSON.stringify(result, null, 2))
        setTestError(false)
      }
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`)
      setTestError(true)
    } finally {
      setTesting(false)
    }
  }

  let resultNode: React.ReactNode = null
  if (testResult) {
    if (testError) {
      resultNode = <span className="text-red-400 whitespace-pre-wrap">{testResult}</span>
    } else {
      try {
        JSON.parse(testResult)
        resultNode = highlightJson(testResult)
      } catch {
        resultNode = <span>{testResult}</span>
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="text-lg font-semibold">
          {initial ? "Edit Script" : "Add Script"}
        </h2>
      </div>

      <div className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-3 items-center">
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
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={script.timeout || 30}
            onChange={(e) => update({ timeout: Number(e.target.value) || 30 })}
            className="w-24"
            placeholder="seconds"
          />
          <span className="text-sm text-muted-foreground">sec</span>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">Script Body</label>
        <div className="rounded-md overflow-hidden border border-zinc-700">
          <div className="flex">
            <div
              className="shrink-0 bg-zinc-800 text-zinc-500 text-right pr-2 pl-3 py-3 select-none text-xs font-mono leading-relaxed overflow-hidden"
              style={{ width: `${Math.max(3, String(lineCount).length) * 0.65 + 1.5}rem` }}
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              value={script.scriptBody}
              onChange={(e) => update({ scriptBody: e.target.value })}
              onKeyDown={handleKeyDown}
              placeholder={`// Return data to extract\nconst items = [];\ndocument.querySelectorAll('article').forEach(el => {\n  items.push({ text: el.textContent.trim() });\n});\nreturn items;`}
              className="flex-1 bg-zinc-900 text-emerald-400 p-3 text-sm font-mono leading-relaxed resize-y min-h-[300px] outline-none placeholder:text-zinc-600"
              spellCheck={false}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          Async/await supported. Must return a value. Runs in page context (MAIN world). Tab key inserts spaces.
        </p>
      </div>

      <div className="rounded-md border border-border p-3 space-y-2">
        <label className="text-sm font-medium">Test</label>
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
            {testing ? "Running..." : "Run"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Enter the actual page URL to test. Leave empty to use any open tab.
        </p>
      </div>

      {testResult && (
        <div className="rounded-md overflow-hidden border border-border">
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-800">
            <span className="text-xs font-medium text-zinc-300">
              Result
              {!testError && <CheckCircle className="size-3 ml-1.5 inline text-emerald-400" />}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTestResult(null)}
              className="text-zinc-400 hover:text-zinc-200 h-6"
            >
              Close
            </Button>
          </div>
          <pre className="bg-zinc-900 p-3 text-xs overflow-auto max-h-72 font-mono">
            {resultNode}
          </pre>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
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
