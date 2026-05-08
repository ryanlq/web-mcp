import { TextResult } from "@/utils/tools"
import { page_snapshot, click, dblclick, type, press_key, scroll, hover } from "./operate"

export const tools = {
  page_snapshot,
  click,
  dblclick,
  type,
  press_key,
  scroll,
  hover,
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
    }
  } catch (err) {
    return TextResult(`Error: ${err?.message || err}`)
  }
}
