import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

/** a local date as YYYY-MM-DD */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const long = (s: string) => parse(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export type RangeKey = 'today' | 'yesterday' | 'last7' | 'last14' | 'last28' | 'last30' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'lastQuarter' | 'max' | 'custom'
export type Range = { key: RangeKey; from: string; to: string }

/** the same presets as Facebook Ads Manager: "Last N days" ends yesterday (today isn't over yet) */
const PRESETS: { key: Exclude<RangeKey, 'custom'>; label: string; range: (t: Date) => [Date, Date] }[] = [
  { key: 'today', label: 'Today', range: (t) => [t, t] },
  { key: 'yesterday', label: 'Yesterday', range: (t) => [add(t, -1), add(t, -1)] },
  { key: 'last7', label: 'Last 7 days', range: (t) => [add(t, -7), add(t, -1)] },
  { key: 'last14', label: 'Last 14 days', range: (t) => [add(t, -14), add(t, -1)] },
  { key: 'last28', label: 'Last 28 days', range: (t) => [add(t, -28), add(t, -1)] },
  { key: 'last30', label: 'Last 30 days', range: (t) => [add(t, -30), add(t, -1)] },
  { key: 'thisWeek', label: 'This week', range: (t) => [add(t, -t.getDay()), t] },
  { key: 'lastWeek', label: 'Last week', range: (t) => [add(t, -t.getDay() - 7), add(t, -t.getDay() - 1)] },
  { key: 'thisMonth', label: 'This month', range: (t) => [new Date(t.getFullYear(), t.getMonth(), 1), t] },
  { key: 'lastMonth', label: 'Last month', range: (t) => [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)] },
  { key: 'thisQuarter', label: 'This quarter', range: (t) => [new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1), t] },
  {
    key: 'lastQuarter',
    label: 'Last quarter',
    range: (t) => {
      const q = Math.floor(t.getMonth() / 3) * 3
      return [new Date(t.getFullYear(), q - 3, 1), new Date(t.getFullYear(), q, 0)]
    },
  },
  { key: 'max', label: 'Maximum', range: (t) => [new Date(2020, 0, 1), t] },
]

/** a preset's dates as of today */
export function presetRange(key: Exclude<RangeKey, 'custom'>): Range {
  const t = new Date()
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  const [a, b] = PRESETS.find((p) => p.key === key)!.range(today)
  return { key, from: isoDay(a), to: isoDay(b) }
}

export function rangeLabel(r: Range) {
  const name = r.key === 'custom' ? 'Custom' : PRESETS.find((p) => p.key === r.key)!.label
  if (r.key === 'max') return name
  return `${name}: ${r.from === r.to ? long(r.from) : `${long(r.from)} – ${long(r.to)}`}`
}

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Month({ first, from, to, hover, onPick, onHover }: { first: Date; from: string; to: string | null; hover: string | null; onPick: (d: string) => void; onHover: (d: string | null) => void }) {
  const today = isoDay(new Date())
  const cells: (string | null)[] = []
  for (let i = 0; i < first.getDay(); i++) cells.push(null)
  for (let d = 1; d <= new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(); d++) cells.push(isoDay(new Date(first.getFullYear(), first.getMonth(), d)))
  const end = to ?? hover ?? from
  const [lo, hi] = from <= end ? [from, end] : [end, from]
  return (
    <div className="dr-month">
      <div className="dr-month-name">{first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>
      <div className="dr-grid">
        {WEEK.map((w) => (
          <span key={w} className="dr-wd">
            {w}
          </span>
        ))}
        {cells.map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              disabled={d > today}
              className={cn('dr-day', d >= lo && d <= hi && 'is-in', (d === lo || d === hi) && 'is-end', d === today && 'is-today')}
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover(d)}
            >
              {Number(d.slice(8))}
            </button>
          ) : (
            <span key={`e${i}`} />
          ),
        )}
      </div>
    </div>
  )
}

/** Facebook-style date range: presets on the left, a two-month calendar on the right; the button shows the dates picked. */
export function DateRangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<{ from: string; to: string | null }>({ from: value.from, to: value.to })
  const [hover, setHover] = useState<string | null>(null)
  const [month, setMonth] = useState(() => {
    const t = parse(value.to)
    return new Date(t.getFullYear(), t.getMonth() - 1, 1)
  })
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', out)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  function toggle() {
    if (!open) {
      setDraft({ from: value.from, to: value.to })
      const t = parse(value.to)
      setMonth(new Date(t.getFullYear(), t.getMonth() - 1, 1))
    }
    setOpen((o) => !o)
  }
  function pick(d: string) {
    // first click: the start; second click: the end (either order)
    if (draft.to !== null) return setDraft({ from: d, to: null })
    const [a, b] = d < draft.from ? [d, draft.from] : [draft.from, d]
    setDraft({ from: a, to: b })
    onChange({ key: 'custom', from: a, to: b })
    setOpen(false)
  }

  return (
    <div className="dr-wrap" ref={box}>
      <button type="button" className="input input-sm dr-btn" onClick={toggle} aria-expanded={open}>
        <CalendarDays size={14} />
        <span>{rangeLabel(value)}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="dr-pop" data-popover>
          <div className="dr-presets">
            {PRESETS.map((p) => (
              <label key={p.key} className="dr-preset">
                <input
                  type="radio"
                  name="dr-preset"
                  checked={value.key === p.key}
                  onChange={() => {
                    onChange(presetRange(p.key))
                    setOpen(false)
                  }}
                />
                {p.label}
              </label>
            ))}
            <label className="dr-preset">
              <input type="radio" name="dr-preset" checked={value.key === 'custom'} readOnly onClick={() => setDraft({ from: value.from, to: null })} />
              Custom
            </label>
          </div>
          <div className="dr-cal" onMouseLeave={() => setHover(null)}>
            <div className="dr-nav">
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Earlier months" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
                <ChevronLeft size={16} />
              </button>
              <span className="muted small">{draft.to === null ? 'Pick the end date' : 'Click a date to start a custom range'}</span>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Later months" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="dr-months">
              <Month first={month} from={draft.from} to={draft.to} hover={hover} onPick={pick} onHover={setHover} />
              <Month first={new Date(month.getFullYear(), month.getMonth() + 1, 1)} from={draft.from} to={draft.to} hover={hover} onPick={pick} onHover={setHover} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
