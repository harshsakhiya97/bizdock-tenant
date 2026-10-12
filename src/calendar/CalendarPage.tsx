import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, List, MapPin, Plus, Video } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Empty, PageHead } from '@/components/ui'
import { listMemberOptions } from '@/leads/api'
import type { MemberOption } from '@/leads/types'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { isoDate, listEvents, listEventTypes, listWebinarTypes, timeText, type EventRow, type EventType, type Option } from './api'
import { EventDrawer } from './EventDrawer'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Calendar & Webinars: a month grid (or list) of company events, webinars, holidays and leaves. */
export function CalendarPage() {
  const tenant = useTenant()
  const { can } = useAuth()
  const { selected } = useBusiness()
  const canEdit = can('calendar', 'add')
  const today = isoDate(new Date())
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [view, setView] = useState<'month' | 'list'>(() => (window.innerWidth < 760 ? 'list' : 'month'))
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [types, setTypes] = useState<EventType[]>([])
  const [webinarTypes, setWebinarTypes] = useState<Option[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [typeFilter, setTypeFilter] = useState('')
  const [person, setPerson] = useState('')
  const [drawer, setDrawer] = useState<{ event: EventRow | null; date: string } | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

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
  const visible = (events ?? [])
    .filter((e) => !selected || !e.business_id || e.business_id === selected.id)
    .filter((e) => !typeFilter || e.type_id === typeFilter)
    .filter((e) => !person || e.event_members.some((m) => m.member_id === person))

  // events on each day (multi-day events on every day they cover)
  const byDay = useMemo(() => {
    const m = new Map<string, EventRow[]>()
    for (const e of visible) {
      const start = new Date(`${e.event_date}T00:00:00`)
      const end = e.end_date ? new Date(`${e.end_date}T00:00:00`) : start
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const k = isoDate(d)
        m.set(k, [...(m.get(k) ?? []), e])
      }
    }
    return m
  }, [visible])

  // 6-week grid starting on the Monday on/before the 1st
  const first = new Date(`${month}-01T00:00:00`)
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return isoDate(d)
  })
  const weeks = cells[35].slice(0, 7) === month ? 6 : 5
  const shift = (n: number) => {
    const d = new Date(`${month}-01T00:00:00`)
    d.setMonth(d.getMonth() + n)
    setMonth(isoDate(d).slice(0, 7))
  }
  const monthLabel = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  // list view: this month from today (or the month's start) onwards
  const listDays = [...byDay.keys()]
    .filter((d) => d.slice(0, 7) === month && (month !== today.slice(0, 7) || d >= today))
    .sort()

  const names = (e: EventRow) =>
    e.event_members
      .map((m) => members.find((x) => x.id === m.member_id)?.name)
      .filter(Boolean)
      .join(', ')

  const chip = (e: EventRow, day: string) => {
    const t = typeById.get(e.type_id)
    return (
      <button
        key={`${e.id}-${day}`}
        type="button"
        className="cal-chip"
        style={{ ['--c' as string]: t?.color ?? '#64748b' }}
        onClick={(ev) => {
          ev.stopPropagation()
          setDrawer({ event: e, date: e.event_date })
        }}
        title={`${e.title} · ${timeText(e)}`}
      >
        {e.start_time && <span className="cal-time">{timeText({ start_time: e.start_time, end_time: null })}</span>}
        {e.title}
      </button>
    )
  }

  return (
    <>
      <PageHead
        title="Calendar & Webinars"
        subtitle="Webinars, shoots, meetings, trainings, holidays and leaves."
        actions={
          canEdit && (
            <button type="button" className="btn btn-primary" onClick={() => setDrawer({ event: null, date: today })}>
              <Plus size={16} /> New event
            </button>
          )
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      {notice.ok && <div className="alert alert-info">{notice.ok}</div>}

      <div className="panel">
        <div className="panel-bar">
          <div className="row">
            <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <b className="cal-month">{monthLabel}</b>
            <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight size={16} />
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setMonth(today.slice(0, 7))}>
              Today
            </button>
          </div>
          <div className="row">
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
            <div className="seg seg-sm">
              <button type="button" className={cn(view === 'month' && 'is-active')} onClick={() => setView('month')}>
                <CalendarDays size={14} /> Month
              </button>
              <button type="button" className={cn(view === 'list' && 'is-active')} onClick={() => setView('list')}>
                <List size={14} /> List
              </button>
            </div>
          </div>
        </div>

        {!events ? (
          <div className="empty">Loading…</div>
        ) : view === 'month' ? (
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
                    <span className={cn('cal-day', day === today && 'is-today')}>{Number(day.slice(8))}</span>
                    {items.slice(0, 3).map((e) => chip(e, day))}
                    {items.length > 3 && (
                      <button
                        type="button"
                        className="cal-more"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setMonth(day.slice(0, 7))
                          setView('list')
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
        ) : listDays.length === 0 ? (
          <Empty icon={CalendarDays}>Nothing on the calendar{month === today.slice(0, 7) ? ' for the rest of this month' : ' this month'}.</Empty>
        ) : (
          <div className="cal-list">
            {listDays.map((day) => (
              <section key={day} className="cal-list-day">
                <div className={cn('day-label', day === today && 'text-success')}>
                  {new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                  {day === today ? ' · Today' : ''}
                </div>
                {(byDay.get(day) ?? []).map((e) => {
                  const t = typeById.get(e.type_id)
                  return (
                    <button key={`${e.id}-${day}`} type="button" className="cal-item" style={{ ['--c' as string]: t?.color ?? '#64748b' }} onClick={() => setDrawer({ event: e, date: e.event_date })}>
                      <span className="cal-bar" />
                      <span className="cal-item-main">
                        <b>{e.title}</b>
                        <span className="muted small">
                          {t?.name} · {timeText(e)}
                          {e.end_date ? ` · until ${new Date(`${e.end_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
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
          key={drawer.event?.id ?? drawer.date}
          event={drawer.event}
          defaultDate={drawer.date}
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
