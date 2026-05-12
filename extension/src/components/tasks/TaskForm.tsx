import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft } from "lucide-react"
import type { ScrapeRule } from "@/components/rules/RuleForm"
import type { ScriptTask } from "@/components/scripts/ScriptForm"

export interface CrawlTask {
  name: string
  description?: string
  ruleName?: string
  scriptName?: string
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
  scripts,
  onSave,
  onCancel,
}: {
  task?: CrawlTask
  rules: ScrapeRule[]
  scripts: ScriptTask[]
  onSave: (task: CrawlTask) => void
  onCancel: () => void
}) {
  const [task, setTask] = useState<CrawlTask>(initial || defaultTask())

  const update = (patch: Partial<CrawlTask>) => {
    setTask((prev) => ({ ...prev, ...patch }))
  }

  const handleSelect = (value: string) => {
    if (value.startsWith("rule:")) {
      update({ ruleName: value.slice(5), scriptName: undefined })
    } else if (value.startsWith("script:")) {
      update({ scriptName: value.slice(7), ruleName: undefined })
    } else {
      update({ ruleName: undefined, scriptName: undefined })
    }
  }

  const selectedValue = task.ruleName
    ? `rule:${task.ruleName}`
    : task.scriptName
      ? `script:${task.scriptName}`
      : ""

  const canSave = task.name && task.url && (task.ruleName || task.scriptName)

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

        <label className="text-sm font-medium text-right">Rule / Script</label>
        <select
          value={selectedValue}
          onChange={(e) => handleSelect(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Select a rule or script...</option>
          {rules.length > 0 && (
            <optgroup label="Rules">
              {rules.map((r) => (
                <option key={r.name} value={`rule:${r.name}`}>{r.name}</option>
              ))}
            </optgroup>
          )}
          {scripts.length > 0 && (
            <optgroup label="Scripts">
              {scripts.map((s) => (
                <option key={s.name} value={`script:${s.name}`}>{s.name}</option>
              ))}
            </optgroup>
          )}
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
        <Button onClick={() => onSave({ ...task, updatedAt: Date.now() })} disabled={!canSave}>
          Save
        </Button>
      </div>
    </div>
  )
}
