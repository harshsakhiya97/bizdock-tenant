import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { db } from '@/lib/supabase'

/**
 * Play a call recording: Play opens a small floating audio player next to it (our copy in call-recordings, a 1-hour
 * link; Callyzer's link until it's copied). Closes on Esc, a click outside, or ×.
 */
export function PlayRecording({ path, url }: { path: string | null | undefined; url: string | null | undefined }) {
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [src, setSrc] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: MouseEvent) => {
      if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  if (!path && !url) return <span className="muted">—</span>

  async function toggle() {
    if (open) return setOpen(false)
    const r = btn.current?.getBoundingClientRect()
    if (r) {
      const w = 340
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))
      const below = r.bottom + 8
      setPos({ top: below + 80 > window.innerHeight ? r.top - 72 : below, left })
    }
    setOpen(true)
    if (src) return
    setBusy(true)
    let href = url ?? ''
    if (path) {
      const { data } = await db().storage.from('call-recordings').createSignedUrl(path, 3600)
      if (data?.signedUrl) href = data.signedUrl
    }
    setSrc(href || null)
    setBusy(false)
  }

  return (
    <>
      <button ref={btn} type="button" className="link-btn" onClick={(e) => (e.stopPropagation(), void toggle())} title={path ? 'Our copy' : 'On Callyzer (not copied yet)'}>
        {open ? 'Close' : 'Play'}
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="rec-pop" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()} data-popover>
            {busy ? <span className="muted small">Loading…</span> : src ? <audio src={src} controls autoPlay preload="auto" /> : <span className="muted small">Recording not found.</span>}
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Close" onClick={() => setOpen(false)}>
              <X size={14} />
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}
