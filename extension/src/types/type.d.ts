interface Element {
  __a11y?: {
    id: string
    inaccessible: boolean
    subtreeInaccessible: boolean
    role: string | undefined
    name: string
    disabled: boolean
    rect?: { x: number; y: number; width: number; height: number }
    visible?: boolean
  }
}

declare module "syn" {
  const click: (el: Element) => void
  const dblclick: (el: Element) => void
  const type: (el: Element, text: string) => void
  const key: (el: Element, key: string) => void
}

declare interface Window {
  syn?: {
    config?: Record<string, number | boolean | string>
  }
}
