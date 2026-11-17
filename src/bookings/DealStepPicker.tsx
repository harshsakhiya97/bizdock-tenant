import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { DEAL_STEPS, latestStep, saveDealSteps, toggleStep, type DealStep } from './dealSteps'

/** Brand Deals list → Step: the latest step; click to tick / untick steps right here (saved straight away) */
export function DealStepPicker({
  bookingId,
  steps,
  canTick,
  me,
  onSaved,
  onError,
}: {
  bookingId: string
  steps: DealStep[]
  canTick: boolean
  me: string | null
  onSaved: (steps: DealStep[], msg: string) => void
  onError: (msg: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const ls = latestStep(steps)
  const done = new Map(steps.map((s) => [s.step, s]))

  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => !pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const move = () => setOpen(false)
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', move, true)
    return () => {
      document.removeEventListener('mousedown', out)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', move, true)
    }
  }, [open])

  function toggleOpen() {
    const r = btn.current?.getBoundingClientRect()
    if (r) setPos({ top: Math.min(r.bottom + 6, window.innerHeight - 380), left: Math.min(r.left, window.innerWidth - 300) })
    setOpen((o) => !o)
  }

  async function tick(n: number) {
    const next = toggleStep(steps, n, me)
    setBusy(true)
    try {
      await saveDealSteps(bookingId, next)
      onSaved(next, done.has(n) ? n > 1 ? `Back to step ${n - 1}: ${DEAL_STEPS[n - 2]}.` : 'All steps unticked.' : `Done up to step ${n}: ${DEAL_STEPS[n - 1]}.`)
    } catch (e) {
      onError((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <>
      <button ref={btn} type="button" className="step-cell" onClick={toggleOpen} disabled={!canTick} aria-expanded={open} title={canTick ? 'Tick steps' : undefined}>
        {ls ? (
          <>
            <span className="badge badge-info">
              {ls.step}/{DEAL_STEPS.length}
            </span>{' '}
            <span className="small">{DEAL_STEPS[ls.step - 1]}</span>
            <span className="muted small"> · {new Date(ls.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          </>
        ) : (
          <span className="muted small">No step yet</span>
        )}
        {canTick && <ChevronDown size={13} className="muted" />}
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={pop} className="step-pop" data-popover style={{ top: pos.top, left: pos.left }}>
            <div className="deal-steps">
              {DEAL_STEPS.map((name, i) => {
                const n = i + 1
                const d = done.get(n)
                return (
                  <label key={n} className={cn('deal-step', d && 'is-done', n === (ls?.step ?? 0) + 1 && !d && 'is-next')}>
                    <input type="checkbox" checked={!!d} disabled={busy} onChange={() => void tick(n)} />
                    <span className="deal-step-no">{d ? '✔' : n}</span>
                    <span className="deal-step-name">{name}</span>
                  </label>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
