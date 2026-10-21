import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarCheck, ChevronLeft, ChevronRight, Clock3, IndianRupee, Plus, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Empty, PageHead, StatCard } from '@/components/ui'
import { listLeads } from '@/leads/api'
import { money } from '@/leads/labels'
import type { LeadRow } from '@/leads/types'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { listBookings } from './api'
import { BookingDrawer } from './BookingDrawer'
import { slotText } from './BookingsTab'
import { useBookingRefs } from './useBookingRefs'
import { STATUS_META, type BookingRow, type BookingStatus } from './types'
import { Flash } from '@/components/Flash'

type View = 'list' | 'day' | 'week' | 'month'
const VIEWS: { id: View; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOUR_PX = 48

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (d: string) => new Date(`${d}T00:00:00`)
const addDays = (d: string, n: number) => {
  const x = parse(d)
  x.setDate(x.getDate() + n)
  return iso(x)
}
const mondayOf = (d: string) => addDays(d, -((parse(d).getDay() + 6) % 7))
const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => parse(d).toLocaleDateString('en-IN', o)
const clock = (t: string) => new Date(2000, 0, 1, ...(t.split(':').map(Number) as [number, number])).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

/** Booking calendar: day / week / month; drag over free time to book it. */
export function BookingCalendarPage() {
  const tenant = useTenant()
  const { can } = useAuth()
  const { inScope } = useBusiness()
  const refs = useBookingRefs()
  const canAdd = can('bookings', 'add')
  const today = iso(new Date())
  const [anchor, setAnchor] = useState(today)
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem('bookings.view') as View | null
      if (v && VIEWS.some((x) => x.id === v)) return v
    } catch {
      /* storage unavailable */
    }
    return window.innerWidth < 760 ? 'list' : 'week'
  })
  const [bookings, setBookings] = useState<BookingRow[] | null>(null)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [status, setStatus] = useState<'' | BookingStatus>('')
  const [drawer, setDrawer] = useState<{ booking: BookingRow | null; date?: string; start?: string; end?: string } | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const [sel, setSel] = useState<{ day: string; a: number; b: number } | null>(null)
  const drag = useRef<{ top: number; from: number; day: string; a: number; b: number } | null>(null)

  const pickView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem('bookings.view', v)
    } catch {
      /* storage unavailable */
    }
  }

  const load = useCallback(() => {
    listBookings(tenant.id)
      .then(setBookings)
      .catch((e: Error) => setNotice({ error: e.message }))
  }, [tenant.id])
  useEffect(load, [load])
  useEffect(() => {
    if (canAdd) void listLeads(tenant.id).then(setLeads, () => setLeads([]))
  }, [tenant.id, canAdd])

  // drag inside one day column picks the slot; releasing opens New booking
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
      setDrawer({ booking: null, date: d.day, start: hhmm(s), end: hhmm(Math.min(end, 23 * 60 + 45)) })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  const visible = useMemo(
    () =>
      (bookings ?? [])
        .filter((b) => inScope(b.business_id, b.sub_business_id))
        .filter((b) => (status ? b.status === status : b.status !== 'cancelled')),
    [bookings, inScope, status],
  )
  const byDay = useMemo(() => {
    const m = new Map<string, BookingRow[]>()
    for (const b of [...visible].sort((x, y) => x.start_time.localeCompare(y.start_time))) m.set(b.booking_date, [...(m.get(b.booking_date) ?? []), b])
    return m
  }, [visible])
  const scopedLeads = useMemo(() => leads.filter((l) => inScope(l.business_id, l.sub_business_id)), [leads, inScope])

  // ---- stats for the month on screen ----
  const month = anchor.slice(0, 7)
  const stats = useMemo(() => {
    const inMonth = (bookings ?? []).filter((b) => inScope(b.business_id, b.sub_business_id) && b.status !== 'cancelled' && b.booking_date.slice(0, 7) === month)
    const hours = inMonth.reduce((a, b) => a + (minutes(b.end_time) - minutes(b.start_time)) / 60, 0)
    const value = inMonth.reduce((a, b) => a + Number(b.total_amount), 0)
    const paid = inMonth.reduce((a, b) => a + Number(b.paid_amount), 0)
    const todays = (bookings ?? []).filter((b) => inScope(b.business_id, b.sub_business_id) && b.status !== 'cancelled' && b.booking_date === today)
    return { count: inMonth.length, tentative: inMonth.filter((b) => b.status === 'tentative').length, hours, value, due: Math.max(0, value - paid), todays: todays.length }
  }, [bookings, inScope, month, today])

  const weekStart = mondayOf(anchor)
  function shift(dir: -1 | 1) {
    if (view === 'day') return setAnchor(addDays(anchor, dir))
    if (view === 'week') return setAnchor(addDays(anchor, 7 * dir))
    const d = parse(`${month}-01`)
    d.setMonth(d.getMonth() + dir)
    setAnchor(iso(d))
  }
  const label =
    view === 'day'
      ? fmt(anchor, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
      : view === 'week'
        ? `${fmt(weekStart, { day: 'numeric', month: 'short' })} – ${fmt(addDays(weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`
        : fmt(`${month}-01`, { month: 'long', year: 'numeric' })

  const color = (b: BookingRow) => STATUS_META[b.status].color
  const open = (b: BookingRow) => setDrawer({ booking: b })

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
            const items = byDay.get(day) ?? []
            return (
              <div
                key={day}
                className={cn('cal-cell', day.slice(0, 7) !== month && 'is-out', canAdd && 'is-clickable')}
                onClick={(ev) => {
                  if (!canAdd || (ev.target as HTMLElement).closest('button')) return
                  setDrawer({ booking: null, date: day })
                }}
              >
                <button
                  type="button"
                  className={cn('cal-day', day === today && 'is-today')}
                  onClick={() => {
                    setAnchor(day)
                    pickView('day')
                  }}
                  title="Open this day"
                >
                  {Number(day.slice(8))}
                </button>
                {items.slice(0, 3).map((b) => (
                  <button key={b.id} type="button" className="cal-chip" style={{ ['--c' as string]: color(b) }} onClick={() => open(b)} title={`${b.client_name} · ${slotText(b)}`}>
                    <span className="cal-time">{clock(b.start_time)}</span>
                    {b.client_name}
                  </button>
                ))}
                {items.length > 3 && (
                  <button
                    type="button"
                    className="cal-more"
                    onClick={() => {
                      setAnchor(day)
                      pickView('day')
                    }}
                  >
                    +{items.length - 3} more
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
    const from = Math.min(8, ...timed.map((b) => Math.floor(minutes(b.start_time) / 60)))
    const to = Math.max(22, ...timed.map((b) => Math.ceil(minutes(b.end_time) / 60)))
    const hours = Array.from({ length: to - from }, (_, i) => from + i)
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    const cols = `56px repeat(${days.length}, minmax(${days.length > 1 ? 110 : 200}px, 1fr))`
    return (
      <div className="cal-wrap">
        <div className="tg" style={{ minWidth: days.length > 1 ? 56 + 7 * 110 : undefined }}>
          <div className="tg-row tg-head" style={{ gridTemplateColumns: cols }}>
            <div />
            {days.map((d) => (
              <button
                key={d}
                type="button"
                className={cn('tg-dayhead', d === today && 'is-today')}
                onClick={() => {
                  setAnchor(d)
                  pickView('day')
                }}
              >
                <small>{fmt(d, { weekday: 'short' })}</small>
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
                  const s = minutes(b.start_time)
                  const end = Math.max(minutes(b.end_time), s + 20)
                  const overl = arr.filter((o) => minutes(o.start_time) < end && minutes(o.end_time) > s)
                  const idx = overl.indexOf(b)
                  const short = ((end - s) / 60) * HOUR_PX < 44
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className={cn('tg-event', short && 'is-short', b.status === 'tentative' && 'is-tentative')}
                      style={{
                        ['--c' as string]: color(b),
                        top: ((s - from * 60) / 60) * HOUR_PX,
                        height: ((end - s) / 60) * HOUR_PX - 2,
                        left: `calc(${(idx / overl.length) * 100}% + 2px)`,
                        width: `calc(${100 / overl.length}% - 4px)`,
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        open(b)
                      }}
                      title={`${b.client_name} · ${slotText(b)}`}
                    >
                      {short ? (
                        <span className="tg-line">
                          <b>{b.client_name}</b> · {clock(b.start_time)}
                        </span>
                      ) : (
                        <>
                          <b>{b.client_name}</b>
                          <span>
                            {clock(b.start_time)} – {clock(b.end_time)}
                          </span>
                          {b.purpose && <span>{b.purpose}</span>}
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
    if (!days.length) return <Empty icon={CalendarCheck}>No bookings{month === today.slice(0, 7) ? ' for the rest of this month' : ' this month'}.</Empty>
    return (
      <div className="cal-list">
        {days.map((day) => (
          <section key={day} className="cal-list-day">
            <div className={cn('day-label', day === today && 'text-success')}>
              {fmt(day, { weekday: 'long', day: 'numeric', month: 'short' })}
              {day === today ? ' · Today' : ''}
            </div>
            {(byDay.get(day) ?? []).map((b) => (
              <button key={b.id} type="button" className="cal-item" style={{ ['--c' as string]: color(b) }} onClick={() => open(b)}>
                <span className="cal-bar" />
                <span className="cal-item-main">
                  <b>{b.client_name}</b>
                  <span className="muted small">
                    {clock(b.start_time)} – {clock(b.end_time)}
                    {b.purpose ? ` · ${b.purpose}` : ''} · {STATUS_META[b.status].label}
                  </span>
                </span>
                <span className="cal-item-side small">
                  {money(b.total_amount)}
                  {b.total_amount - b.paid_amount > 0 && <span className="text-danger"> · {money(b.total_amount - b.paid_amount)} due</span>}
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
    )
  }

  return (
    <>
      <PageHead
        title="Booking Calendar"
        subtitle="Drag over free time to book a slot. Click a booking to edit it, add payments or invoice it."
        actions={
          canAdd && (
            <button type="button" className="btn btn-primary" onClick={() => setDrawer({ booking: null, date: view === 'day' ? anchor : today })}>
              <Plus size={16} /> New booking
            </button>
          )
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      <div className="stat-grid">
        <StatCard icon={CalendarCheck} tone="brand" value={stats.count} label={`Bookings in ${fmt(`${month}-01`, { month: 'short' })}`} hint={stats.tentative ? `${stats.tentative} tentative` : undefined} />
        <StatCard icon={Clock3} tone="info" value={`${Math.round(stats.hours * 10) / 10} h`} label="Hours booked" hint={`${stats.todays} today`} />
        <StatCard icon={IndianRupee} tone="success" value={money(stats.value)} label="Booked value" hint="incl. GST" />
        <StatCard icon={Wallet} tone="danger" value={money(stats.due)} label="Balance to collect" />
      </div>

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
            <select className="input input-sm filter-select" value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | '')} aria-label="Status">
              <option value="">All but cancelled</option>
              {(Object.keys(STATUS_META) as BookingStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
            <div className="seg">
              {VIEWS.map((v) => (
                <button key={v.id} type="button" className={cn(view === v.id && 'is-active')} onClick={() => pickView(v.id)}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!bookings ? (
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

      <div className="cal-legend">
        {(Object.keys(STATUS_META) as BookingStatus[]).map((s) => (
          <span key={s} className="stage-pill" style={{ ['--c' as string]: STATUS_META[s].color }}>
            {STATUS_META[s].label}
          </span>
        ))}
      </div>

      {drawer && (
        <BookingDrawer
          key={drawer.booking?.id ?? `${drawer.date}-${drawer.start ?? ''}-${drawer.end ?? ''}`}
          booking={drawer.booking}
          defaults={{ date: drawer.date, start: drawer.start, end: drawer.end }}
          leads={scopedLeads}
          refs={refs}
          onClose={() => setDrawer(null)}
          onSaved={(msg) => {
            setDrawer(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}
    </>
  )
}
