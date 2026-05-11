import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft } from "lucide-react"
import type { ScrapeRule } from "@/components/rules/RuleForm"

export interface CrawlTask {
  name: string
  description?: string
  ruleName: string
  url: string
  createdAt: number
  updatedAt: number
}

export function defaultTask(): CrawlTask {
  return {
    name: "",
    description: "",
    ruleName: "",
    url: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export default function TaskForm({
  task: initial,
  rules,
  onSave,
  onCancel,
}: {
  task?: CrawlTask
  rules: ScrapeRule[]
  onSave: (task: CrawlTask) => void
  onCancel: () => void
}) {
  const [task, setTask] = useState<CrawlTask>(initial || defaultTask())

  const update = (patch: Partial<CrawlTask>) => {
    setTask((prev) => ({ ...prev, ...patch }))
  }

  const handleSave = () => {
    if (!task.name || !task.ruleName || !task.url) return
    onSave({ ...task, updatedAt: Date.now() })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="text-lg font-semibold">
          {initial ? "Edit Task" : "Add Task"}
        </h2>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 items-center">
        <label className="text-sm font-medium text-right">Name</label>
        <Input
          value={task.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="My crawl task"
        />

        <label className="text-sm font-medium text-right">Description</label>
        <Input
          value={task.description || ""}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Describe what this task does (shown to AI assistants)"
        />

        <label className="text-sm font-medium text-right">Rule</label>
        <select
          value={task.ruleName}
          onChange={(e) => update({ ruleName: e.target.value })}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Select a rule...</option>
          {rules.map((r) => (
            <option key={r.name} value={r.name}>{r.name}</option>
          ))}
        </select>

        <label className="text-sm font-medium text-right">URL</label>
        <Input
          value={task.url}
          onChange={(e) => update({ url: e.target.value })}
          placeholder="https://example.com/page"
        />
      </div>

      <div className="flex items-center gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button
          onClick={handleSave}
          disabled={!task.name || !task.ruleName || !task.url}
        >
          Save
        </Button>
      </div>
    </div>
  )
}
