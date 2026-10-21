import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus, Video } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Empty, PageHead } from '@/components/ui'
import { listMemberOptions } from '@/leads/api'
import type { MemberOption } from '@/leads/types'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { isoDate, listEvents, listEventTypes, listWebinarTypes, timeText, type EventRow, type EventType, type Option } from './api'
import { EventDrawer } from './EventDrawer'
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

const parse = (d: string) => new Date(`${d}T00:00:00`)
const addDays = (d: string, n: number) => {
  const x = parse(d)
  x.setDate(x.getDate() + n)
  return isoDate(x)
}
const mondayOf = (d: string) => addDays(d, -((parse(d).getDay() + 6) % 7))
const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => parse(d).toLocaleDateString('en-IN', o)

/** Calendar & Webinars: list, day, week and month views of events, webinars, holidays and leaves. */
export function CalendarPage() {
  const tenant = useTenant()
  const { can } = useAuth()
  const { selected } = useBusiness()
  const canEdit = can('calendar', 'add')
  const today = isoDate(new Date())
  const [anchor, setAnchor] = useState(today)
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem('calendar.view') as View | null
      if (v && VIEWS.some((x) => x.id === v)) return v
    } catch {
      /* storage unavailable */
    }
    return window.innerWidth < 760 ? 'list' : 'month'
  })
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [types, setTypes] = useState<EventType[]>([])
  const [webinarTypes, setWebinarTypes] = useState<Option[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [typeFilter, setTypeFilter] = useState('')
  const [person, setPerson] = useState('')
  const [drawer, setDrawer] = useState<{ event: EventRow | null; date: string; endDate?: string; time?: string; endTime?: string } | null>(null)
  // drag to pick a time range (day / week) or a date range (month); releasing opens New event
  // a = where the drag started, b = where the pointer is (day + minute); can cross days in week view
  const [timeSel, setTimeSel] = useState<{ aDay: string; a: number; bDay: string; b: number } | null>(null)
  const [daySel, setDaySel] = useState<{ a: string; b: string } | null>(null)
  const drag = useRef<
    { kind: 'time'; top: number; from: number; aDay: string; a: number; bDay: string; b: number } | { kind: 'day'; a: string; b: string } | null
  >(null)
  /** the drag's start and end in time order */
  const orderSel = (x: { aDay: string; a: number; bDay: string; b: number }) => {
    const p1 = { day: x.aDay, m: x.a }
    const p2 = { day: x.bDay, m: x.b }
    return p1.day < p2.day || (p1.day === p2.day && p1.m <= p2.m) ? [p1, p2] : [p2, p1]
  }
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d || d.kind !== 'time') return
      const col = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('.tg-col')
      const bDay = col?.dataset.day ?? d.bDay
      const m = Math.max(0, Math.min(24 * 60 - 15, d.from * 60 + Math.floor(((ev.clientY - d.top) / HOUR_PX) * 4) * 15))
      if (m !== d.b || bDay !== d.bDay) {
        d.b = m
        d.bDay = bDay
        setTimeSel({ aDay: d.aDay, a: d.a, bDay, b: m })
      }
    }
    const up = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      if (d.kind === 'time') {
        const [s1, s2] = orderSel(d)
        const end = s1.day === s2.day && s1.m === s2.m ? s1.m + 60 : s2.m + 15
        setTimeSel(null)
        setDrawer({
          event: null,
          date: s1.day,
          endDate: s2.day,
          time: hhmm(s1.m),
          endTime: hhmm(Math.min(end, 23 * 60 + 59)),
        })
      } else {
        const [x, y] = d.a <= d.b ? [d.a, d.b] : [d.b, d.a]
        setDaySel(null)
        setDrawer({ event: null, date: x, endDate: y })
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  const pickView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem('calendar.view', v)
    } catch {
      /* storage unavailable */
    }
  }

  const load = useCallback(() => {
    Promise.all([listEvents(tenant.id), listEventTypes(tenant.id), listWebinarTypes(tenant.id), listMemberOptions(tenant.id)])
      .then(([e, t, w, m]) => {
        setEvents(e)
        setTypes(t)
        setWebinarTypes(w)
        setMembers(m)
      })
      .catch((e: Error) => setNotice({ error: e.message }))
  }, [tenant.id])
  useEffect(load, [load])

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types])
  const visible = useMemo(
    () =>
      (events ?? [])
        .filter((e) => !selected || !e.business_id || e.business_id === selected.id)
        .filter((e) => !typeFilter || e.type_id === typeFilter)
        .filter((e) => !person || e.event_members.some((m) => m.member_id === person)),
    [events, selected, typeFilter, person],
  )

  // events on each day (multi-day events on every day they cover)
  const byDay = useMemo(() => {
    const m = new Map<string, EventRow[]>()
    for (const e of visible) {
      for (let d = e.event_date; d <= (e.end_date ?? e.event_date); d = addDays(d, 1)) m.set(d, [...(m.get(d) ?? []), e])
    }
    return m
  }, [visible])

  // ---- the range shown, and moving through it ----
  const month = anchor.slice(0, 7)
  const weekStart = mondayOf(anchor)
  function shift(dir: -1 | 1) {
    if (view === 'day') return setAnchor(addDays(anchor, dir))
    if (view === 'week') return setAnchor(addDays(anchor, 7 * dir))
    const d = parse(`${month}-01`)
    d.setMonth(d.getMonth() + dir)
    setAnchor(isoDate(d))
  }
  const label =
    view === 'day'
      ? fmt(anchor, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
      : view === 'week'
        ? `${fmt(weekStart, { day: 'numeric', month: 'short' })} – ${fmt(addDays(weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`
        : fmt(`${month}-01`, { month: 'long', year: 'numeric' })

  const names = (e: EventRow) =>
    e.event_members
      .map((m) => members.find((x) => x.id === m.member_id)?.name)
      .filter(Boolean)
      .join(', ')
  const open = (e: EventRow) => setDrawer({ event: e, date: e.event_date })
  const color = (e: EventRow) => typeById.get(e.type_id)?.color ?? '#64748b'

  const chip = (e: EventRow, day: string) => (
    <button
      key={`${e.id}-${day}`}
      type="button"
      className="cal-chip"
      style={{ ['--c' as string]: color(e) }}
      onClick={(ev) => {
        ev.stopPropagation()
        open(e)
      }}
      title={`${e.title} · ${timeText(e)}`}
    >
      {e.start_time && <span className="cal-time">{timeText({ start_time: e.start_time, end_time: null })}</span>}
      {e.title}
    </button>
  )

  // ---------- month ----------
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
            const holiday = items.some((e) => typeById.get(e.type_id)?.kind === 'holiday')
            return (
              <div
                key={day}
                className={cn(
                  'cal-cell',
                  day.slice(0, 7) !== month && 'is-out',
                  holiday && 'is-holiday',
                  canEdit && 'is-clickable',
                  daySel && day >= (daySel.a < daySel.b ? daySel.a : daySel.b) && day <= (daySel.a < daySel.b ? daySel.b : daySel.a) && 'is-selecting',
                )}
                onPointerDown={(ev) => {
                  if (!canEdit || ev.button !== 0 || (ev.target as HTMLElement).closest('button')) return
                  ev.preventDefault()
                  drag.current = { kind: 'day', a: day, b: day }
                  setDaySel({ a: day, b: day })
                }}
                onPointerEnter={() => {
                  const d = drag.current
                  if (d?.kind === 'day' && d.b !== day) {
                    d.b = day
                    setDaySel({ a: d.a, b: day })
                  }
                }}
              >
                <button
                  type="button"
                  className={cn('cal-day', day === today && 'is-today')}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    setAnchor(day)
                    pickView('day')
                  }}
                  title="Open this day"
                >
                  {Number(day.slice(8))}
                </button>
                {items.slice(0, 3).map((e) => chip(e, day))}
                {items.length > 3 && (
                  <button
                    type="button"
                    className="cal-more"
                    onClick={(ev) => {
                      ev.stopPropagation()
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

  // ---------- day / week (time grid) ----------
  function timeGrid(days: string[]) {
    const timed = days.flatMap((d) => (byDay.get(d) ?? []).filter((e) => e.start_time && e.event_date === d))
    const from = Math.min(8, ...timed.map((e) => Math.floor(minutes(e.start_time!) / 60)))
    const to = Math.max(20, ...timed.map((e) => Math.ceil(minutes(e.end_time ?? e.start_time!) / 60) + (e.end_time ? 0 : 1)))
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
          <div className="tg-row tg-allday" style={{ gridTemplateColumns: cols }}>
            <div className="tg-label">All day</div>
            {days.map((d) => (
              <div key={d} className="tg-allday-cell">
                {(byDay.get(d) ?? []).filter((e) => !e.start_time || e.event_date !== d).map((e) => chip(e, d))}
              </div>
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
                className={cn('tg-col', canEdit && 'is-clickable')}
                style={{ height: hours.length * HOUR_PX }}
                onPointerDown={(ev) => {
                  if (!canEdit || ev.button !== 0 || (ev.target as HTMLElement).closest('.tg-event')) return
                  ev.preventDefault()
                  const top = ev.currentTarget.getBoundingClientRect().top
                  const m = from * 60 + Math.floor(((ev.clientY - top) / HOUR_PX) * 4) * 15
                  drag.current = { kind: 'time', top, from, aDay: d, a: m, bDay: d, b: m }
                  setTimeSel({ aDay: d, a: m, bDay: d, b: m })
                }}
              >
                {hours.map((h) => (
                  <div key={h} className="tg-slot" style={{ height: HOUR_PX }} />
                ))}
                {timeSel &&
                  (() => {
                    const [p1, p2] = orderSel(timeSel)
                    if (d < p1.day || d > p2.day) return null
                    const top = d === p1.day ? p1.m : from * 60
                    const bottom = d === p2.day ? p2.m + 15 : to * 60
                    return (
                      <div
                        className="tg-select"
                        style={{ top: ((top - from * 60) / 60) * HOUR_PX, height: ((bottom - top) / 60) * HOUR_PX }}
                      >
                        {d === p1.day &&
                          (p1.day === p2.day
                            ? timeText({ start_time: hhmm(p1.m), end_time: hhmm(p2.m + 15) })
                            : `${timeText({ start_time: hhmm(p1.m), end_time: null })} → ${fmt(p2.day, { day: 'numeric', month: 'short' })} ${timeText({ start_time: hhmm(p2.m + 15), end_time: null })}`)}
                      </div>
                    )
                  })()}
                {d === today && nowMin >= from * 60 && nowMin <= to * 60 && (
                  <div className="tg-now" style={{ top: ((nowMin - from * 60) / 60) * HOUR_PX }} />
                )}
                {(byDay.get(d) ?? [])
                  .filter((e) => e.start_time && e.event_date === d)
                  .map((e, _i, arr) => {
                    const s = minutes(e.start_time!)
                    const end = e.end_time ? Math.max(minutes(e.end_time), s + 20) : s + 60
                    // events that overlap sit side by side
                    const overl = arr.filter((o) => {
                      const os = minutes(o.start_time!)
                      const oe = o.end_time ? minutes(o.end_time) : os + 60
                      return os < end && oe > s
                    })
                    const idx = overl.indexOf(e)
                    const short = ((end - s) / 60) * HOUR_PX < 44
                    return (
                      <button
                        key={e.id}
                        type="button"
                        className={cn('tg-event', short && 'is-short')}
                        style={{
                          ['--c' as string]: color(e),
                          top: ((s - from * 60) / 60) * HOUR_PX,
                          height: ((end - s) / 60) * HOUR_PX - 2,
                          left: `calc(${(idx / overl.length) * 100}% + 2px)`,
                          width: `calc(${100 / overl.length}% - 4px)`,
                        }}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          open(e)
                        }}
                        title={`${e.title} · ${timeText(e)}`}
                      >
                        {short ? (
                          <span className="tg-line">
                            <b>{e.title}</b> · {timeText({ start_time: e.start_time, end_time: null })}
                          </span>
                        ) : (
                          <>
                            <b>{e.title}</b>
                            <span>{timeText(e)}</span>
                            {days.length === 1 && (e.location || names(e)) && <span>{[e.location, names(e)].filter(Boolean).join(' · ')}</span>}
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

  // ---------- list ----------
  function listView() {
    const days = [...byDay.keys()].filter((d) => d.slice(0, 7) === month && (month !== today.slice(0, 7) || d >= today)).sort()
    if (!days.length)
      return <Empty icon={CalendarDays}>Nothing on the calendar{month === today.slice(0, 7) ? ' for the rest of this month' : ' this month'}.</Empty>
    return (
      <div className="cal-list">
        {days.map((day) => (
          <section key={day} className="cal-list-day">
            <div className={cn('day-label', day === today && 'text-success')}>
              {fmt(day, { weekday: 'long', day: 'numeric', month: 'short' })}
              {day === today ? ' · Today' : ''}
            </div>
            {(byDay.get(day) ?? []).map((e) => {
              const t = typeById.get(e.type_id)
              return (
                <button key={`${e.id}-${day}`} type="button" className="cal-item" style={{ ['--c' as string]: color(e) }} onClick={() => open(e)}>
                  <span className="cal-bar" />
                  <span className="cal-item-main">
                    <b>{e.title}</b>
                    <span className="muted small">
                      {t?.name} · {timeText(e)}
                      {e.end_date ? ` · until ${fmt(e.end_date, { day: 'numeric', month: 'short' })}` : ''}
                      {names(e) ? ` · ${names(e)}` : ''}
                    </span>
                  </span>
                  <span className="cal-item-side muted small">
                    {e.meeting_link && <Video size={14} />}
                    {e.location && (
                      <>
                        <MapPin size={14} /> {e.location}
                      </>
                    )}
                  </span>
                </button>
              )
            })}
          </section>
        ))}
      </div>
    )
  }

  return (
    <>
      <PageHead
        title="Calendar & Webinars"
        subtitle="Webinars, shoots, meetings, trainings, holidays and leaves."
        actions={
          canEdit && (
            <button type="button" className="btn btn-primary" onClick={() => setDrawer({ event: null, date: view === 'day' ? anchor : today })}>
              <Plus size={16} /> New event
            </button>
          )
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

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
          <div className="seg">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" className={cn(view === v.id && 'is-active')} onClick={() => pickView(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-filters">
          <select className="input input-sm filter-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Event type">
            <option value="">All event types</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person">
            <option value="">Everyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {!events ? (
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
        {types
          .filter((t) => t.is_active)
          .map((t) => (
            <span key={t.id} className="stage-pill" style={{ ['--c' as string]: t.color }}>
              {t.name}
            </span>
          ))}
      </div>

      {drawer && (
        <EventDrawer
          key={drawer.event?.id ?? `${drawer.date}-${drawer.endDate ?? ''}-${drawer.time ?? ''}-${drawer.endTime ?? ''}`}
          event={drawer.event}
          defaultDate={drawer.date}
          defaultEndDate={drawer.endDate}
          defaultTime={drawer.time}
          defaultEndTime={drawer.endTime}
          types={types}
          webinarTypes={webinarTypes}
          members={members}
          canEdit={canEdit}
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
