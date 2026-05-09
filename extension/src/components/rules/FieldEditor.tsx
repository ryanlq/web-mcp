import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, X } from "lucide-react"

export interface ScrapeField {
  key: string
  selector: string
  type: "text" | "html" | "attribute" | "list"
  attribute?: string
  fields?: ScrapeField[]
}

export function defaultField(): ScrapeField {
  return { key: "", selector: "", type: "text" }
}

export function FieldEditor({
  fields,
  onChange,
}: {
  fields: ScrapeField[]
  onChange: (fields: ScrapeField[]) => void
}) {
  const update = (index: number, patch: Partial<ScrapeField>) => {
    const next = [...fields]
    next[index] = { ...next[index], ...patch }
    if (patch.type && patch.type !== "list") {
      delete next[index].fields
    }
    if (patch.type === "list" && !next[index].fields) {
      next[index].fields = [defaultField()]
    }
    if (next[index].type !== "attribute") {
      delete next[index].attribute
    }
    onChange(next)
  }

  const remove = (index: number) => {
    onChange(fields.filter((_, i) => i !== index))
  }

  const add = () => {
    onChange([...fields, defaultField()])
  }

  return (
    <div className="space-y-2">
      {fields.map((field, i) => (
        <div key={i} className="border rounded-md p-3 space-y-2 bg-card">
          <div className="flex items-center gap-2">
            <Input
              placeholder="key"
              value={field.key}
              onChange={(e) => update(i, { key: e.target.value })}
              className="w-28"
            />
            <Input
              placeholder="selector"
              value={field.selector}
              onChange={(e) => update(i, { selector: e.target.value })}
              className="flex-1"
            />
            <select
              value={field.type}
              onChange={(e) =>
                update(i, { type: e.target.value as ScrapeField["type"] })
              }
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="text">text</option>
              <option value="html">html</option>
              <option value="attribute">attribute</option>
              <option value="list">list</option>
            </select>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => remove(i)}
              className="shrink-0"
            >
              <X className="size-4" />
            </Button>
          </div>
          {field.type === "attribute" && (
            <Input
              placeholder="attribute name (e.g. href, src)"
              value={field.attribute || ""}
              onChange={(e) => update(i, { attribute: e.target.value })}
              className="ml-0"
            />
          )}
          {field.type === "list" && field.fields && (
            <div className="ml-4 border-l-2 pl-3">
              <FieldEditor
                fields={field.fields}
                onChange={(subFields) => update(i, { fields: subFields })}
              />
            </div>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="size-3" /> Add Field
      </Button>
    </div>
  )
}
