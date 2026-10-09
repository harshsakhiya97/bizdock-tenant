import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Modal({
  open,
  onClose,
  children,
  width = 384,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** max width in px (default 384) */
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      // an open search dropdown handles Esc itself
      if (e.key === 'Escape' && !document.querySelector('[data-popover]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  // Rendered into <body> so no parent (sticky sidebar, cards) can sit on top of it.
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        data-modal
        aria-modal="true"
        className="max-h-[90svh] w-full overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
