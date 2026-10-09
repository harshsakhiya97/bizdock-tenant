import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/** Right-side panel, like Muzic Lover's "Add Playlist". */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = 440,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      // a pop-up open on top of the drawer handles Esc itself
      if (e.key === 'Escape' && !document.querySelector('[data-modal], [data-popover]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-full flex-col bg-white shadow-xl"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:bg-gray-100">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-3.5">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}
