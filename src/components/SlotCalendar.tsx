import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { Empty } from '@/components/ui'
import { cn } from '@/lib/cn'

/** one thing on the calendar (a booking, a meeting…) */
export type SlotItem = {
  id: string
  date: string
  start: string
  end: string
  title: string
  /** second line in the time grid (e.g. purpose) */
  detail?: string | null
  /** list view: the line under the title */
  meta: string
  color: string
  /** drawn lighter (e.g. tentative) */
  faded?: boolean
  /** list view: right-hand side text and buttons */
  side?: ReactNode
  actions?: ReactNode
}

type View = 'list' | 'day' | 'week' | 'month'
const VIEWS: { id: View; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOUR_PX = 48

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (d: string) => new Date(`${d}T00:00:00`)
const addDays = (d: string, n: number) => {
  const x = parse(d)
  x.setDate(x.getDate() + n)
  return isoDay(x)
}
const mondayOf = (d: string) => addDays(d, -((parse(d).getDay() + 6) % 7))
export const minutesOf = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export const fmtDay = (d: string, o: Intl.DateTimeFormatOptions) => parse(d).toLocaleDateString('en-IN', o)
export const clock = (t: string) => new Date(2000, 0, 1, ...(t.split(':').map(Number) as [number, number])).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

/**
 * List / day / week / month calendar of time slots. Drag over free time (day, week) or click a day
 * (month) to add one; click an item to open it. The page keeps the date on screen (`anchor`).
 */
export function SlotCalendar({
  items,
  anchor,
  setAnchor,
  storageKey,
  canAdd,
  onCreate,
  onOpen,
  filters,
  noun,
}: {
  items: SlotItem[] | null
  anchor: string
  setAnchor: (d: string) => void
  /** remembers the picked view */
  storageKey: string
  canAdd: boolean
  onCreate: (slot: { date: string; start?: string; end?: string }) => void
  onOpen: (id: string) => void
  /** extra controls next to the view switch */
  filters?: ReactNode
  /** plural, for "No bookings this month." */
  noun: string
}) {
  const today = isoDay(new Date())
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem(storageKey) as View | null
      if (v && VIEWS.some((x) => x.id === v)) return v
    } catch {
      /* storage unavailable */
    }
    return window.innerWidth < 760 ? 'list' : 'week'
  })
  const [sel, setSel] = useState<{ day: string; a: number; b: number } | null>(null)
  const drag = useRef<{ top: number; from: number; day: string; a: number; b: number } | null>(null)
  const create = useRef(onCreate)
  useEffect(() => {
    create.current = onCreate
  })

  const pickView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(storageKey, v)
    } catch {
      /* storage unavailable */
    }
  }

  // drag inside one day column picks the slot; releasing opens the add form
  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const m = Math.max(0, Math.min(24 * 60 - 15, d.from * 60 + Math.floor(((ev.clientY - d.top) / HOUR_PX) * 4) * 15))
      if (m !== d.b) {
        d.b = m
        setSel({ day: d.day, a: d.a, b: m })
      }
    }
    const up = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      const [s, e] = d.a <= d.b ? [d.a, d.b] : [d.b, d.a]
      const end = s === e ? s + 60 : e + 15
      setSel(null)
      create.current({ date: d.day, start: hhmm(s), end: hhmm(Math.min(end, 23 * 60 + 45)) })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  const byDay = useMemo(() => {
    const m = new Map<string, SlotItem[]>()
    for (const b of [...(items ?? [])].sort((x, y) => x.start.localeCompare(y.start))) m.set(b.date, [...(m.get(b.date) ?? []), b])
    return m
  }, [items])

  const month = anchor.slice(0, 7)
  const weekStart = mondayOf(anchor)
  function shift(dir: -1 | 1) {
    if (view === 'day') return setAnchor(addDays(anchor, dir))
    if (view === 'week') return setAnchor(addDays(anchor, 7 * dir))
    const d = parse(`${month}-01`)
    d.setMonth(d.getMonth() + dir)
    setAnchor(isoDay(d))
  }
  const label =
    view === 'day'
      ? fmtDay(anchor, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
      : view === 'week'
        ? `${fmtDay(weekStart, { day: 'numeric', month: 'short' })} – ${fmtDay(addDays(weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`
        : fmtDay(`${month}-01`, { month: 'long', year: 'numeric' })

  const openDay = (day: string) => {
    setAnchor(day)
    pickView('day')
  }

  function monthView() {
    const gridStart = mondayOf(`${month}-01`)
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
    const weeks = cells[35].slice(0, 7) === month ? 6 : 5
    return (
      <div className="cal-wrap">
        <div className="cal-grid">
          {WEEKDAYS.map((d) => (
            <div key={d} className="cal-head">
              {d}
            </div>
          ))}
          {cells.slice(0, weeks * 7).map((day) => {
            const list = byDay.get(day) ?? []
            return (
              <div
                key={day}
                className={cn('cal-cell', day.slice(0, 7) !== month && 'is-out', canAdd && 'is-clickable')}
                onClick={(ev) => {
                  if (!canAdd || (ev.target as HTMLElement).closest('button')) return
                  onCreate({ date: day })
                }}
              >
                <button type="button" className={cn('cal-day', day === today && 'is-today')} onClick={() => openDay(day)} title="Open this day">
                  {Number(day.slice(8))}
                </button>
                {list.slice(0, 3).map((b) => (
                  <button key={b.id} type="button" className="cal-chip" style={{ ['--c' as string]: b.color }} onClick={() => onOpen(b.id)} title={`${b.title} · ${clock(b.start)} – ${clock(b.end)}`}>
                    <span className="cal-time">{clock(b.start)}</span>
                    {b.title}
                  </button>
                ))}
                {list.length > 3 && (
                  <button type="button" className="cal-more" onClick={() => openDay(day)}>
                    +{list.length - 3} more
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function timeGrid(days: string[]) {
    const timed = days.flatMap((d) => byDay.get(d) ?? [])
    const from = Math.min(8, ...timed.map((b) => Math.floor(minutesOf(b.start) / 60)))
    const to = Math.max(22, ...timed.map((b) => Math.ceil(minutesOf(b.end) / 60)))
    const hours = Array.from({ length: to - from }, (_, i) => from + i)
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    const cols = `56px repeat(${days.length}, minmax(${days.length > 1 ? 110 : 200}px, 1fr))`
    return (
      <div className="cal-wrap">
        <div className="tg" style={{ minWidth: days.length > 1 ? 56 + 7 * 110 : undefined }}>
          <div className="tg-row tg-head" style={{ gridTemplateColumns: cols }}>
            <div />
            {days.map((d) => (
              <button key={d} type="button" className={cn('tg-dayhead', d === today && 'is-today')} onClick={() => openDay(d)}>
                <small>{fmtDay(d, { weekday: 'short' })}</small>
                <b>{Number(d.slice(8))}</b>
              </button>
            ))}
          </div>
          <div className="tg-row tg-body" style={{ gridTemplateColumns: cols }}>
            <div className="tg-hours">
              {hours.map((h) => (
                <div key={h} className="tg-hour-label" style={{ height: HOUR_PX }}>
                  {new Date(2000, 0, 1, h).toLocaleTimeString('en-IN', { hour: 'numeric' })}
                </div>
              ))}
            </div>
            {days.map((d) => (
              <div
                key={d}
                data-day={d}
                className={cn('tg-col', canAdd && 'is-clickable')}
                style={{ height: hours.length * HOUR_PX }}
                onPointerDown={(ev) => {
                  if (!canAdd || ev.button !== 0 || (ev.target as HTMLElement).closest('.tg-event')) return
                  ev.preventDefault()
                  const top = ev.currentTarget.getBoundingClientRect().top
                  const m = from * 60 + Math.floor(((ev.clientY - top) / HOUR_PX) * 4) * 15
                  drag.current = { top, from, day: d, a: m, b: m }
                  setSel({ day: d, a: m, b: m })
                }}
              >
                {hours.map((h) => (
                  <div key={h} className="tg-slot" style={{ height: HOUR_PX }} />
                ))}
                {sel &&
                  sel.day === d &&
                  (() => {
                    const [s, e] = sel.a <= sel.b ? [sel.a, sel.b] : [sel.b, sel.a]
                    return (
                      <div className="tg-select" style={{ top: ((s - from * 60) / 60) * HOUR_PX, height: ((e + 15 - s) / 60) * HOUR_PX }}>
                        {clock(hhmm(s))} – {clock(hhmm(e + 15))}
                      </div>
                    )
                  })()}
                {d === today && nowMin >= from * 60 && nowMin <= to * 60 && <div className="tg-now" style={{ top: ((nowMin - from * 60) / 60) * HOUR_PX }} />}
                {(byDay.get(d) ?? []).map((b, _i, arr) => {
                  const s = minutesOf(b.start)
                  const end = Math.max(minutesOf(b.end), s + 20)
                  const overl = arr.filter((o) => minutesOf(o.start) < end && minutesOf(o.end) > s)
                  const idx = overl.indexOf(b)
                  const short = ((end - s) / 60) * HOUR_PX < 44
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className={cn('tg-event', short && 'is-short', b.faded && 'is-tentative')}
                      style={{
                        ['--c' as string]: b.color,
                        top: ((s - from * 60) / 60) * HOUR_PX,
                        height: ((end - s) / 60) * HOUR_PX - 2,
                        left: `calc(${(idx / overl.length) * 100}% + 2px)`,
                        width: `calc(${100 / overl.length}% - 4px)`,
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onOpen(b.id)
                      }}
                      title={`${b.title} · ${clock(b.start)} – ${clock(b.end)}`}
                    >
                      {short ? (
                        <span className="tg-line">
                          <b>{b.title}</b> · {clock(b.start)}
                        </span>
                      ) : (
                        <>
                          <b>{b.title}</b>
                          <span>
                            {clock(b.start)} – {clock(b.end)}
                          </span>
                          {b.detail && <span>{b.detail}</span>}
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  function listView() {
    const days = [...byDay.keys()].filter((d) => d.slice(0, 7) === month && (month !== today.slice(0, 7) || d >= today)).sort()
    if (!days.length)
      return (
        <Empty icon={CalendarCheck}>
          No {noun}
          {month === today.slice(0, 7) ? ' for the rest of this month' : ' this month'}.
        </Empty>
      )
    return (
      <div className="cal-list">
        {days.map((day) => (
          <section key={day} className="cal-list-day">
            <div className={cn('day-label', day === today && 'text-success')}>
              {fmtDay(day, { weekday: 'long', day: 'numeric', month: 'short' })}
              {day === today ? ' · Today' : ''}
            </div>
            {(byDay.get(day) ?? []).map((b) => (
              <div key={b.id} role="button" tabIndex={0} className="cal-item" style={{ ['--c' as string]: b.color }} onClick={() => onOpen(b.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(b.id)}>
                <span className="cal-bar" />
                <span className="cal-item-main">
                  <b>{b.title}</b>
                  <span className="muted small">{b.meta}</span>
                </span>
                {b.side && <span className="cal-item-side small">{b.side}</span>}
                {b.actions && (
                  <span className="cal-item-acts" onClick={(e) => e.stopPropagation()}>
                    {b.actions}
                  </span>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-bar">
        <div className="row cal-nav">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setAnchor(today)}>
            Today
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => shift(-1)} aria-label="Previous">
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => shift(1)} aria-label="Next">
            <ChevronRight size={18} />
          </button>
          <b className="cal-label">{label}</b>
        </div>
        <div className="row">
          {filters}
          <div className="seg">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" className={cn(view === v.id && 'is-active')} onClick={() => pickView(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!items ? (
        <div className="empty">Loading…</div>
      ) : view === 'month' ? (
        monthView()
      ) : view === 'week' ? (
        timeGrid(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)))
      ) : view === 'day' ? (
        timeGrid([anchor])
      ) : (
        listView()
      )}
    </div>
  )
}
