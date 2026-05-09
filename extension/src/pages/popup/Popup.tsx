import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { msgInvoker } from "@/utils/invoker"
import { Connection, InvokerFunc, type SessionState } from "@/types"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { sessionSubject } from "@/utils/subjects"
import { IconAnythingCopilot, IconGithub } from "@/components/svg"
import Panel from "@/components/connection/Panel"
import Indicator from "@/components/connection/Indicator"
import { ArrowUpRight, Play, Copy, Download } from "lucide-react"
import useStorage from "@/hooks/useStorage"

interface CrawlTask {
  name: string
  ruleName: string
  url: string
}

function CrawlPanel() {
  const { crawl_tasks = [] } = useStorage<{ crawl_tasks: CrawlTask[] }>({ crawl_tasks: [] })
  const [running, setRunning] = useState<string | null>(null)
  const [result, setResult] = useState<{ taskName: string; data: any } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRun = async (task: CrawlTask) => {
    setRunning(task.name)
    setResult(null)
    setError(null)
    try {
      const response = await chrome.runtime.sendMessage({ type: "run_task", taskName: task.name })
      if (response?.error) {
        setError(response.error)
      } else {
        setResult({ taskName: task.name, data: response })
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRunning(null)
    }
  }

  const handleCopy = () => {
    if (!result) return
    navigator.clipboard.writeText(JSON.stringify(result.data, null, 2))
  }

  const handleExport = () => {
    if (!result) return
    const data = result.data?.data || result.data
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${result.taskName}_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (result) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Result: {result.taskName}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              <Copy className="size-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExport}>
              <Download className="size-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
              Close
            </Button>
          </div>
        </div>
        <pre className="text-xs bg-muted p-2 rounded max-h-64 overflow-auto whitespace-pre-wrap">
          {JSON.stringify(result.data?.data || result.data, null, 2).slice(0, 5000)}
        </pre>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-red-500">Error</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>Close</Button>
        </div>
        <p className="text-xs text-red-500">{error}</p>
      </div>
    )
  }

  if (crawl_tasks.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No crawl tasks. Create one in <a href="options.html" target="_blank" className="underline">Options</a>.
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      {crawl_tasks.map((task) => (
        <div key={task.name} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{task.name}</div>
            <div className="text-xs text-muted-foreground truncate">{task.ruleName}</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRun(task)}
            disabled={running !== null}
          >
            <Play className="size-3" />
            {running === task.name ? "Running..." : "Run"}
          </Button>
        </div>
      ))}
    </div>
  )
}

export default function Popup() {
  const [state, setState] = useState(sessionSubject.value)
  const { t } = useTranslation()

  useEffect(() => {
    msgInvoker.add(InvokerFunc.ConnectionState, (value: SessionState) => {
      sessionSubject.next(value)
    })

    msgInvoker.invoke({
      func: InvokerFunc.GetConnectionState,
      reply: false,
    })

    return () => {
      msgInvoker.remove(InvokerFunc.ConnectionState)
    }
  }, [])

  useEffect(() => {
    const subscription = sessionSubject.subscribe((value) => {
      setState(value)
    })
    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return (
    <div className="flex flex-col min-w-[300px] min-h-[460px] w-full p-6">
      <Indicator state={state} />
      <Panel state={state} />

      <div className="border-t mt-3 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">Crawl Tasks</span>
          <a
            className="text-xs underline hover:text-orange-500"
            href="options.html"
            target="_blank"
          >
            Manage
          </a>
        </div>
        <CrawlPanel />
      </div>

      <div className="space-x-3 mt-3">
        <a
          className="inline-flex items-center gap-1 text-xs underline hover:text-orange-500"
          href="https://web-mcp.ziziyi.com/docs"
        >
          <span>{t("viewDocs")}</span>
          <ArrowUpRight className="size-3" />
        </a>
        <a
          className="inline-flex items-center gap-1 text-xs underline hover:text-orange-500"
          href="https://web-mcp.ziziyi.com/inspector"
        >
          <span>{t("onlineInspector")}</span>
          <ArrowUpRight className="size-3" />
        </a>
      </div>

      <div className="flex items-center gap-6 justify-center mt-auto">
        <a
          href="https://github.com/web-mcp/web-mcp"
          target="_blank"
          className="flex items-center gap-1 text-sm"
        >
          <IconGithub className="size-4" />
          GitHub
        </a>
        <a
          href="https://ziziyi.com/anything-copilot"
          target="_blank"
          className="flex items-center gap-1 text-sm"
        >
          <IconAnythingCopilot className="size-4" />
          Anything Copilot
        </a>
      </div>
    </div>
  )
}
