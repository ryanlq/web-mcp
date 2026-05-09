import { createSyn } from "@web-mcp/syn"
import { queryRef, snapshot } from "./snapshot"
import { TextResult } from "@/utils/tools"

let syn: ReturnType<typeof createSyn>
export function getSyn(): typeof syn {
  if (!syn) {
    syn = createSyn()
  }
  return syn
}

export async function page_snapshot(ref?: string) {
  const el = queryRef(ref) || document.body
  const html = await snapshot(el)
  return TextResult(html)
}

export async function click(ref: string) {
  const syn = getSyn()
  const el = queryRef(ref)
  syn.click(el)
  return TextResult("done")
}

export async function dblclick(ref: string) {
  const syn = getSyn()
  const el = queryRef(ref)
  syn.dblclick(el)
  return TextResult("done")
}

export async function type(ref: string, text: string) {
  const syn = getSyn()
  const el = queryRef(ref)

  let node = el as HTMLElement
  // while (node.childElementCount == 1) {
  //   const child = node.firstElementChild as HTMLElement
  //   if (child.isContentEditable && child.nodeName !== "BR") {
  //     node = child
  //     continue
  //   }
  //   break
  // }

  // const value = node.contentEditable
  // node.contentEditable = "true"
  syn.type(node, text)
  // node.contentEditable = value
  return TextResult("done")
}

export async function press_key(ref: string, key: string) {
  const syn = getSyn()
  const el = queryRef(ref)
  syn.key(el, key)
  return TextResult("done")
}

export async function scroll(ref: string | null, direction: string, amount: number) {
  if (ref) {
    queryRef(ref).scrollIntoView({ behavior: "smooth", block: "center" })
  } else {
    const delta = amount * 300
    const map: Record<string, [number, number]> = {
      down: [0, delta],
      up: [0, -delta],
      right: [delta, 0],
      left: [-delta, 0],
    }
    const [x, y] = map[direction || "down"]
    window.scrollBy(x, y)
  }
  return TextResult("done")
}

export async function hover(ref: string) {
  const el = queryRef(ref)
  el.dispatchEvent(
    new MouseEvent("mouseover", { bubbles: true, cancelable: true })
  )
  el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
  return TextResult("done")
}

export interface ScrapeField {
  key: string
  selector: string
  type: "text" | "html" | "attribute" | "list"
  attribute?: string
  fields?: ScrapeField[]
}

function extractValue(el: Element | null, field: ScrapeField): any {
  if (!el) return null
  switch (field.type) {
    case "text":
      return el.textContent?.trim() || ""
    case "html":
      return el.innerHTML
    case "attribute":
      return field.attribute ? el.getAttribute(field.attribute) : null
    default:
      return el.textContent?.trim() || ""
  }
}

export async function scrape(fields: ScrapeField[]) {
  const result: Record<string, any> = {}

  for (const field of fields) {
    const els = document.querySelectorAll(field.selector)

    if (field.type === "list") {
      result[field.key] = Array.from(els).map((el) => {
        const item: Record<string, any> = {}
        for (const sub of field.fields || []) {
          const subEl = el.matches(sub.selector) ? el : el.querySelector(sub.selector)
          item[sub.key] = extractValue(subEl, sub)
        }
        return item
      })
    } else if (els.length > 1) {
      result[field.key] = Array.from(els).map((el) => extractValue(el, field))
    } else {
      result[field.key] = extractValue(els[0], field)
    }
  }

  return TextResult(JSON.stringify(result, null, 2))
}

export async function scrape_next_page(selector: string) {
  const nextBtn = document.querySelector(selector) as HTMLElement | null
  if (!nextBtn) return TextResult(JSON.stringify({ hasNext: false }))
  nextBtn.click()
  return TextResult(JSON.stringify({ hasNext: true }))
}
