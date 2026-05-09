import { TextResult } from "@/utils/tools"
import { page_snapshot, click, dblclick, type, press_key, scroll, hover, scrape, scrape_next_page } from "./operate"

export const tools = {
  page_snapshot,
  click,
  dblclick,
  type,
  press_key,
  scroll,
  hover,
  scrape,
  scrape_next_page,
}

export async function handleToolCall(
  name: string,
  params: Record<string, string>
) {
  try {
    switch (name) {
      case "page_snapshot":
        return await tools.page_snapshot(params.ref)
      case "click":
        return await tools.click(params.ref)
      case "dbclick":
        return await tools.dblclick(params.ref)
      case "type":
        return await tools.type(params.ref, params.text)
      case "press_key":
        return await tools.press_key(params.ref, params.key)
      case "scroll":
        return await tools.scroll(params.ref || null, params.direction, Number(params.amount) || 3)
      case "hover":
        return await tools.hover(params.ref)
      case "scrape":
        return await tools.scrape(JSON.parse(params.fields))
      case "scrape_next_page":
        return await tools.scrape_next_page(params.selector)
    }
  } catch (err) {
    return TextResult(`Error: ${err?.message || err}`)
  }
}
