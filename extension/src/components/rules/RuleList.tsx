import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Play, Pencil, Trash2 } from "lucide-react"
import type { ScrapeRule } from "./RuleForm"

export default function RuleList({
  rules,
  onEdit,
  onDelete,
}: {
  rules: ScrapeRule[]
  onEdit: (rule: ScrapeRule) => void
  onDelete: (name: string) => void
}) {
  if (!rules.length) {
    return (
      <div className="text-center text-muted-foreground py-12">
        No rules yet. Click "Add Rule" to create one.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {rules.map((rule) => (
        <div
          key={rule.name}
          className="border rounded-md p-4 space-y-2 hover:bg-accent/30 transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-medium truncate">{rule.name}</h3>
              <p className="text-sm text-muted-foreground truncate">
                {rule.urlPattern}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" onClick={() => onEdit(rule)}>
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm(`Delete rule "${rule.name}"?`)) {
                    onDelete(rule.name)
                  }
                }}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {rule.fields.map((f) => (
              <Badge key={f.key} variant="secondary">
                {f.key}
                <span className="text-muted-foreground ml-1">{f.type}</span>
              </Badge>
            ))}
          </div>
          {(rule.nextPageSelector || rule.detailLinkSelector) && (
            <div className="flex gap-3 text-xs text-muted-foreground">
              {rule.nextPageSelector && (
                <span>
                  Pagination: <code>{rule.nextPageSelector}</code>
                  {rule.maxPages && ` (max ${rule.maxPages})`}
                </span>
              )}
              {rule.detailLinkSelector && (
                <span>
                  Detail: <code>{rule.detailLinkSelector}</code>
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
