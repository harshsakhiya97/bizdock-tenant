import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const [drawer, setDrawer] = useState<{ event: EventRow | null; date: string; time?: string } | null>(null)
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
                className={cn('cal-cell', day.slice(0, 7) !== month && 'is-out', holiday && 'is-holiday', canEdit && 'is-clickable')}
                onClick={() => canEdit && setDrawer({ event: null, date: day })}
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
              <div key={d} className="tg-col" style={{ height: hours.length * HOUR_PX }}>
                {hours.map((h) => (
                  <div
                    key={h}
                    className={cn('tg-slot', canEdit && 'is-clickable')}
                    style={{ height: HOUR_PX }}
                    onClick={() => canEdit && setDrawer({ event: null, date: d, time: `${String(h).padStart(2, '0')}:00` })}
                  />
                ))}
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
      {notice.ok && <div className="alert alert-info">{notice.ok}</div>}

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
          key={drawer.event?.id ?? `${drawer.date}-${drawer.time ?? ''}`}
          event={drawer.event}
          defaultDate={drawer.date}
          defaultTime={drawer.time}
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
