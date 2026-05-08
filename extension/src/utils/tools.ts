import { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

export function TextResult(text: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: text,
      },
    ],
  }
}

export function ImageResult(base64: string, mimeType: string): CallToolResult {
  return {
    content: [
      {
        type: "image",
        data: base64,
        mimeType,
      },
    ],
  }
}
