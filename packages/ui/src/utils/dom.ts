export function getDocumentBody(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.body
}

export function getDocumentElement(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.documentElement
}
