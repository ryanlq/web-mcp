import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Download, Upload } from "lucide-react"
import { getLocal, setLocal } from "@/utils/ext"
import type { ScrapeRule } from "./RuleForm"

export default function ImportExport({ onImported }: { onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    const { scrape_rules = [] } = await getLocal<{ scrape_rules: ScrapeRule[] }>("scrape_rules")
    const json = JSON.stringify(scrape_rules, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "scrape-rules.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const imported: ScrapeRule[] = JSON.parse(text)
      if (!Array.isArray(imported)) {
        alert("Invalid format: expected an array of rules")
        return
      }
      const { scrape_rules = [] } = await getLocal<{ scrape_rules: ScrapeRule[] }>("scrape_rules")
      const map = new Map(scrape_rules.map((r) => [r.name, r]))
      for (const rule of imported) {
        if (!rule.name || !rule.urlPattern || !rule.fields) continue
        const existing = map.get(rule.name)
        if (existing) {
          map.set(rule.name, { ...rule, createdAt: existing.createdAt, updatedAt: Date.now() })
        } else {
          map.set(rule.name, { ...rule, createdAt: Date.now(), updatedAt: Date.now() })
        }
      }
      await setLocal({ scrape_rules: Array.from(map.values()) })
      onImported()
    } catch {
      alert("Failed to import: invalid JSON file")
    }
    if (fileRef.current) fileRef.current.value = ""
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleExport}>
        <Download className="size-3" />
        Export
      </Button>
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
        <Upload className="size-3" />
        Import
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        onChange={handleImport}
        className="hidden"
      />
    </div>
  )
}
