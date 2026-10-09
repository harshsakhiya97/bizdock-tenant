import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * Centered pop-up.
 * - With `title`: sticky header (title + close), scrolling body, sticky `footer`.
 * - Without `title`: a simple box (e.g. "Ready to leave?").
 */
export function Modal({
  open,
  onClose,
  children,
  width = 384,
  title,
  footer,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** max width in px (default 384) */
  width?: number
  title?: string
  footer?: ReactNode
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
        aria-label={title}
        className={
          title
            ? 'flex max-h-[90svh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl'
            : 'max-h-[90svh] w-full overflow-y-auto rounded-xl bg-white p-6 shadow-xl'
        }
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title ? (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:bg-gray-100">
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-6 py-3.5">
                {footer}
              </div>
            )}
          </>
        ) : (
          children
        )}
      </div>
    </div>,
    document.body,
  )
}
