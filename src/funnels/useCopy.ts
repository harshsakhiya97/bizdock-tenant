import { useCallback, useRef, useState } from 'react'

/** copy text to the clipboard; `copied` holds the id of what was copied for ~1.5 s */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const copy = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(id)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(null), 1500)
  }, [])
  return { copied, copy }
}
