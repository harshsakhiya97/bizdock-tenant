import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertTriangle, CalendarCheck, CalendarClock, Check, ChevronLeft, ChevronRight, Phone, Plus, RotateCcw, X } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { listBookings } from '@/bookings/api'
import { BookingDrawer } from '@/bookings/BookingDrawer'
import type { BookingRow } from '@/bookings/types'
import { useBookingRefs } from '@/bookings/useBookingRefs'
import { Flash } from '@/components/Flash'
import { clock } from '@/components/SlotCalendar'
import { listFollowUps } from '@/followups/api'
import type { FollowUpRow } from '@/followups/types'
import { listLeads, listMemberOptions } from '@/leads/api'
import { makesCustomer, podcastCheck } from '@/leads/customers'
import { fullName, money } from '@/leads/labels'
import { QuickAddLead } from '@/leads/QuickAddLead'
import type { LeadRow, MemberOption } from '@/leads/types'
import { cn } from '@/lib/cn'
import { listMeetings, setMeetingStatus } from '@/meetings/api'
import { MeetingDrawer } from '@/meetings/MeetingDrawer'
import { MEETING_STATUS, type MeetingRow, type MeetingStatus } from '@/meetings/types'
import { useTenant } from '@/tenant/useTenant'

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00`)
  x.setDate(x.getDate() + n)
  return isoDay(x)
}
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
const shortMonth = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
const dayLabel = (d: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', o)
const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
const DONE: MeetingStatus[] = ['qualified', 'not_qualified']

type SectionId = 'today' | 'funnel' | 'overdue' | 'tasks' | 'recordings'
const HIDE_KEY = 'podcastDash.hidden'

/** Paid Podcast dashboard: meetings with guests, the month's funnel, overdue meetings, tasks and recordings. */
export function PodcastDashboard() {
  const tenant = useTenant()
  const navigate = useNavigate()
  const { can, businesses } = useAuth()
  const { selected, sub, inScope } = useBusiness()
  const refs = useBookingRefs()
  const today = isoDay(new Date())
  const [month, setMonth] = useState(today.slice(0, 7))
  const [day, setDay] = useState(today)
  const [leads, setLeads] = useState<LeadRow[] | null>(null)
  const [fus, setFus] = useState<FollowUpRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [meetings, setMeetings] = useState<MeetingRow[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [adding, setAdding] = useState(false)
  const [book, setBook] = useState<{ lead: LeadRow | null; booking?: BookingRow } | null>(null)
  const [mt, setMt] = useState<{ meeting: MeetingRow | null; lead?: LeadRow } | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const [allTasks, setAllTasks] = useState(false)
  const [hidden, setHidden] = useState<SectionId[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HIDE_KEY) ?? '[]') as SectionId[]
    } catch {
      return []
    }
  })
  const saveHidden = (h: SectionId[]) => {
    setHidden(h)
    try {
      localStorage.setItem(HIDE_KEY, JSON.stringify(h))
    } catch {
      /* storage unavailable */
    }
  }

  const load = useCallback(() => {
    listLeads(tenant.id).then(setLeads, () => setLeads([]))
    listFollowUps(tenant.id).then(setFus, () => setFus([]))
    if (can('bookings', 'view')) listBookings(tenant.id).then(setBookings, () => setBookings([]))
    if (can('meetings', 'view')) listMeetings(tenant.id).then(setMeetings, () => setMeetings([]))
    listMemberOptions(tenant.id).then(setMembers, () => setMembers([]))
  }, [tenant.id, can])
  useEffect(load, [load])

  const d = useMemo(() => {
    const L = (leads ?? []).filter((l) => !l.is_archived && inScope(l.business_id, l.sub_business_id))
    const leadById = new Map(L.map((l) => [l.id, l]))
    const M = meetings.filter((m) => inScope(m.business_id, m.sub_business_id))
    const B = bookings.filter((b) => inScope(b.business_id, b.sub_business_id) && b.status !== 'cancelled')
    const F = fus.filter((f) => leadById.has(f.lead_id))
    const inMonth = (iso: string | null | undefined) => !!iso && iso.slice(0, 7) === month
    const stageKind = new Map(refs.funnels.flatMap((f) => f.funnel_stages.map((s) => [s.id, s.kind] as const)))
    const isPodcast = podcastCheck(businesses)
    const customerIds = new Set(B.filter((b) => makesCustomer(b, isPodcast)).map((b) => b.lead_id).filter(Boolean) as string[])
    const isOpen = (l: LeadRow) => !customerIds.has(l.id) && stageKind.get(l.stage_id ?? '') !== 'lost' && stageKind.get(l.stage_id ?? '') !== 'won'

    // ---- cards ----
    const now = new Date().toISOString()
    const fuDue = F.filter((f) => f.status === 'pending' && f.due_at <= now)
    const monthLeads = L.filter((l) => inMonth(l.created_at))
    const openNow = L.filter(isOpen).length
    const mb = B.filter((b) => b.booking_date.slice(0, 7) === month)
    const paidInMonth = B.flatMap((b) => b.booking_payments).filter((p) => p.status === 'paid' && inMonth(p.paid_on))
    const collected = paidInMonth.reduce((s, p) => s + Number(p.amount), 0)
    const billed = mb.reduce((s, b) => s + Number(b.total_amount), 0)
    const pending = mb.reduce((s, b) => s + Math.max(0, b.total_amount - b.paid_amount), 0)
    const mm = M.filter((m) => m.meeting_date.slice(0, 7) === month)
    const doneM = mm.filter((m) => DONE.includes(m.status))
    const noShow = mm.filter((m) => m.status === 'no_show').length
    // a scheduled meeting whose time + 1 hour has passed, with no result yet
    const endAt = (m: MeetingRow) => new Date(`${m.meeting_date}T${m.end_time.slice(0, 5)}:00`).getTime() + 3600000
    const awaiting = (m: MeetingRow) => m.status === 'scheduled' && endAt(m) < Date.now()
    const overdue = M.filter(awaiting).sort((a, b) => (b.meeting_date + b.start_time).localeCompare(a.meeting_date + a.start_time))
    const clients = new Set(mb.filter((b) => makesCustomer(b, isPodcast)).map((b) => b.lead_id).filter(Boolean)).size

    // ---- funnel (this month) ----
    const contacted = monthLeads.filter((l) => F.some((f) => f.lead_id === l.id && f.status === 'done') || M.some((m) => m.lead_id === l.id)).length
    // each meeting of the month, by how it came about (earlier meetings of the same lead decide)
    const byLead = new Map<string, MeetingRow[]>()
    for (const m of [...M].sort((a, b) => (a.meeting_date + a.start_time).localeCompare(b.meeting_date + b.start_time))) byLead.set(m.lead_id, [...(byLead.get(m.lead_id) ?? []), m])
    const kind = (m: MeetingRow) => {
      const before = (byLead.get(m.lead_id) ?? []).filter((x) => x.id !== m.id && x.meeting_date + x.start_time < m.meeting_date + m.start_time)
      if (before.some((x) => x.status === 'no_show')) return 'reattempt'
      if (before.some((x) => DONE.includes(x.status))) return 'followup'
      if ((m.reschedules ?? []).length) return 'rescheduled'
      return 'team'
    }
    const kinds = { team: 0, rescheduled: 0, reattempt: 0, followup: 0 }
    for (const m of mm) kinds[kind(m)]++
    const closedLeads = new Set(B.filter((b) => inMonth(b.created_at)).map((b) => b.lead_id).filter(Boolean))
    const paidLeads = new Set(B.filter((b) => inMonth(b.created_at) && Number(b.paid_amount) > 0).map((b) => b.lead_id).filter(Boolean))
    const funnel = {
      received: monthLeads.length,
      contacted,
      scheduled: mm.length,
      kinds,
      conducted: doneM.length,
      qualified: mm.filter((m) => m.status === 'qualified').length,
      noShow,
      rescheduled: mm.filter((m) => (m.reschedules ?? []).length).length,
      cancelled: mm.filter((m) => m.status === 'cancelled').length,
      closed: closedLeads.size,
      paid: paidLeads.size,
      awaiting: mm.filter(awaiting).length,
    }

    // ---- meetings on the picked day ----
    const dayMeetings = M.filter((m) => m.meeting_date === day).sort((a, b) => a.start_time.localeCompare(b.start_time))

    // ---- today's tasks: follow-ups due by today on open leads ----
    const tasks = fuDue
      .filter((f) => {
        const l = leadById.get(f.lead_id)
        return l && isOpen(l)
      })
      .sort((a, b) => a.due_at.localeCompare(b.due_at))

    // ---- upcoming recordings ----
    const recordings = B.filter((b) => b.booking_date >= today).sort((a, b) => (a.booking_date + a.start_time).localeCompare(b.booking_date + b.start_time))

    const qualifiedLeads = new Set(M.filter((m) => m.status === 'qualified').map((m) => m.lead_id))
    return { leadById, fuDue, monthLeads, openNow, mb, collected, billed, pending, mm, doneM, noShow, overdue, clients, funnel, dayMeetings, tasks, recordings, qualifiedLeads, awaiting, kind }
  }, [leads, fus, bookings, meetings, refs.funnels, inScope, month, day, today, businesses])

  const shiftMonth = (dir: number) => {
    const [y, m] = month.split('-').map(Number)
    const n = new Date(y, m - 1 + dir, 1)
    setMonth(`${n.getFullYear()}-${pad(n.getMonth() + 1)}`)
  }
  const ml = shortMonth(month)
  const title = sub?.name ?? selected?.name ?? 'Paid Podcast'
  const ownerName = (l: LeadRow | undefined) => (l?.owner_id && members.find((m) => m.id === l.owner_id)?.name) || '—'
  const name = (id: string) => {
    const l = d.leadById.get(id)
    return l ? fullName(l) : 'Guest'
  }

  async function mark(m: MeetingRow, status: MeetingStatus) {
    try {
      await setMeetingStatus(m.id, status)
      setNotice({ ok: `${name(m.lead_id)}: ${MEETING_STATUS[status].label}${status === 'not_qualified' ? ' (lead moved to Lost)' : ''}.` })
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }
  const bookFor = (leadId: string) => {
    const l = d.leadById.get(leadId)
    if (l) setBook({ lead: l })
  }
  const canMeet = can('meetings', 'edit')
  const outcomeButtons = (m: MeetingRow) =>
    canMeet && (
      <span className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
        <button type="button" className="btn btn-outline btn-sm pd-ok" onClick={() => void mark(m, 'qualified')}>
          <Check size={13} /> Qualified
        </button>
        <button type="button" className="btn btn-outline btn-sm pd-no" onClick={() => void mark(m, 'not_qualified')}>
          <X size={13} /> Not qualified
        </button>
        <button type="button" className="btn btn-outline btn-sm pd-no" onClick={() => void mark(m, 'no_show')}>
          No-show
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setMt({ meeting: m })}>
          <RotateCcw size={13} /> Reschedule
        </button>
      </span>
    )

  const SECTIONS: { id: SectionId; label: string; count?: number; tone?: string }[] = [
    { id: 'today', label: day === today ? 'Meetings - Today' : `Meetings - ${dayLabel(day)}`, count: d.dayMeetings.length },
    { id: 'funnel', label: `Funnel - ${monthLabel(month)}` },
    { id: 'overdue', label: 'Meetings Overdue', count: d.overdue.length, tone: d.overdue.length ? 'is-danger' : undefined },
    { id: 'tasks', label: "Today's Tasks", count: d.tasks.length },
    { id: 'recordings', label: 'Upcoming Recordings', count: d.recordings.length },
  ]
  const shown = (id: SectionId) => !hidden.includes(id)
  const head = (id: SectionId, titleNode: ReactNode, extra?: ReactNode) => (
    <div className="db-head pd-head">
      <h3>{titleNode}</h3>
      <span className="row" style={{ gap: 10 }}>
        {extra}
        <button type="button" className="link-btn muted small" onClick={() => saveHidden([...hidden, id])}>
          <X size={12} /> Hide
        </button>
      </span>
    </div>
  )

  if (!leads) return <div className="empty">Loading…</div>

  const f = d.funnel
  const lostPct = (from: number, to: number) => (from ? Math.round(((from - to) / from) * 100) : 0)
  const maxF = Math.max(1, f.received, f.scheduled)
  const bar = (label: string, hint: string, n: number, opts: { tone?: string; lost?: number; indent?: boolean } = {}) => (
    <div className={cn('pd-frow', opts.indent && 'is-sub')}>
      <div className="pd-flabel">
        <b>{opts.indent ? '↳ ' : ''}{label}</b>
        <small>{hint}</small>
      </div>
      <b className="pd-fnum">{n}</b>
      <div className="db-bar pd-fbar">
        <span className={opts.tone} style={{ width: `${(n / maxF) * 100}%` }} />
      </div>
      <span className="pd-flost small">{opts.lost !== undefined ? `↓ ${opts.lost}% lost` : ''}</span>
    </div>
  )

  const taskRows = allTasks ? d.tasks : d.tasks.slice(0, 8)

  return (
    <>
      <div className="db-top">
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-outline btn-icon" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
            <ChevronLeft size={16} />
          </button>
          <input className="input db-month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
          <button type="button" className="btn btn-outline btn-icon" aria-label="Next month" onClick={() => shiftMonth(1)}>
            <ChevronRight size={16} />
          </button>
          <span className="muted">
            {title} · showing <b>{monthLabel(month)}</b>
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {can('leads', 'add') && (
            <button type="button" className="btn btn-outline" onClick={() => setAdding(true)}>
              <Plus size={15} /> New enquiry
            </button>
          )}
          {can('meetings', 'add') && (
            <button type="button" className="btn btn-outline" onClick={() => setMt({ meeting: null })}>
              <CalendarClock size={15} /> Schedule meeting
            </button>
          )}
          {can('bookings', 'add') && (
            <button type="button" className="btn btn-primary" onClick={() => setBook({ lead: null })}>
              <Plus size={15} /> Book podcast
            </button>
          )}
        </div>
      </div>
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      <div className="db-cards pd-cards">
        <Link to="/follow-ups" className="db-card">
          <b className="tone-danger">{d.fuDue.length}</b>
          <span>Follow-ups due</span>
          <small>Right now, including overdue</small>
        </Link>
        <Link to="/leads" className="db-card">
          <b>{d.monthLeads.length}</b>
          <span>Inquiries · {ml}</span>
          <small>{d.openNow} open right now</small>
        </Link>
        <Link to="/bookings" className="db-card">
          <b className="tone-info">{d.mb.length}</b>
          <span>Podcasts booked</span>
          <small>Recording in {ml}</small>
        </Link>
        <Link to="/invoices" className="db-card">
          <b className="tone-success">{money(d.collected)}</b>
          <span>Collected · {ml}</span>
          <small>
            Billed {money(d.billed)} · pending {money(d.pending)}
          </small>
        </Link>
        <Link to="/meetings" className="db-card">
          <b className="tone-success">{d.doneM.length}</b>
          <span>Meetings done</span>
          <small>
            of {d.mm.length} scheduled in {ml} · {d.noShow} no-show · {d.funnel.awaiting} awaiting
          </small>
        </Link>
        <Link to="/customers" className="db-card">
          <b className="tone-success">{d.clients}</b>
          <span>Clients</span>
          <small>Podcast booked and paid · {ml}</small>
        </Link>
      </div>

      <div className="pd-chips card card-pad">
        <span className="muted small">SECTIONS</span>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={cn('pd-chip', s.tone, !shown(s.id) && 'is-off')}
            onClick={() => {
              if (!shown(s.id)) saveHidden(hidden.filter((h) => h !== s.id))
              requestAnimationFrame(() => document.getElementById(`pd-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
            }}
            title={shown(s.id) ? 'Go to this section' : 'Show this section'}
          >
            {s.label}
            {s.count !== undefined ? ` ${s.count}` : ''}
          </button>
        ))}
        {hidden.length > 0 && (
          <button type="button" className="link-btn small" onClick={() => saveHidden([])}>
            Reset
          </button>
        )}
      </div>

      {shown('today') && (
        <section className="card card-pad db-section" id="pd-today">
          {head(
            'today',
            <>
              {SECTIONS[0].label} <span className="badge badge-info">{d.dayMeetings.length}</span>
            </>,
          )}
          <div className="row pd-daybar">
            <button type="button" className="btn btn-outline btn-icon btn-sm" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>
              <ChevronLeft size={15} />
            </button>
            <input className="input input-sm" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Day" />
            <button type="button" className="btn btn-outline btn-icon btn-sm" aria-label="Next day" onClick={() => setDay(addDays(day, 1))}>
              <ChevronRight size={15} />
            </button>
            {[
              ['Yesterday', addDays(today, -1)],
              ['Today', today],
              ['Tomorrow', addDays(today, 1)],
            ].map(([label, v]) => (
              <button key={label} type="button" className={cn('btn btn-sm', day === v ? 'btn-primary' : 'btn-outline')} onClick={() => setDay(v)}>
                {label}
              </button>
            ))}
            <span className="muted small" style={{ marginLeft: 'auto' }}>
              {d.dayMeetings.length} meeting{d.dayMeetings.length === 1 ? '' : 's'} on {dayLabel(day, { day: 'numeric', month: 'short', year: 'numeric' })} · Done{' '}
              {d.dayMeetings.filter((m) => DONE.includes(m.status)).length} · No-show {d.dayMeetings.filter((m) => m.status === 'no_show').length} · Awaiting{' '}
              {d.dayMeetings.filter((m) => m.status === 'scheduled').length}
            </span>
          </div>
          {!d.dayMeetings.length ? (
            <div className="muted small">No meetings on this day.</div>
          ) : (
            <div className="table-wrap">
              <table className="table db-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Meeting with</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {d.dayMeetings.map((m) => {
                    const l = d.leadById.get(m.lead_id)
                    const k = d.kind(m)
                    return (
                      <tr key={m.id}>
                        <td className="nowrap">
                          <b>{clock(m.start_time)}</b>
                        </td>
                        <td>
                          <Link to={`/leads/${m.lead_id}?tab=meetings`} className="db-name">
                            {name(m.lead_id)}
                          </Link>
                          {l?.purpose && <span className="muted small"> · {l.purpose}</span>}
                          <div className="muted small">{l?.phone}</div>
                        </td>
                        <td className="nowrap">
                          <span className={cn('badge', MEETING_STATUS[m.status].tone)}>{MEETING_STATUS[m.status].label}</span>{' '}
                          {k !== 'team' && <span className="badge badge-muted">{k === 'reattempt' ? 'Re-attempt' : k === 'followup' ? 'Follow-up meeting' : 'Rescheduled'}</span>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {m.status === 'qualified' && can('bookings', 'add') ? (
                            <button type="button" className="btn btn-outline btn-sm pd-ok" onClick={() => bookFor(m.lead_id)}>
                              <CalendarCheck size={13} /> Book podcast
                            </button>
                          ) : m.status === 'scheduled' ? (
                            outcomeButtons(m)
                          ) : (
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setMt({ meeting: m })}>
                              Open
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {shown('funnel') && (
        <section className="card card-pad db-section" id="pd-funnel">
          {head('funnel', <>Funnel - {monthLabel(month)}</>)}
          <p className="muted small" style={{ marginTop: -4 }}>
            How many remain at each stage. The biggest drop is where the most is to be gained.
          </p>
          <div className="pd-funnel">
            {bar('Leads received', 'Inquiries that came in', f.received)}
            {bar('Contacted', 'A follow-up logged, or a meeting set', f.contacted, { lost: lostPct(f.received, f.contacted) })}
            {bar('Meetings scheduled', `Every meeting in ${ml}`, f.scheduled, { tone: 'is-orange', lost: lostPct(f.contacted, f.scheduled) })}
            {bar('Booked by team', 'First meeting with the guest', f.kinds.team, { indent: true })}
            {bar('Rescheduled slot', 'Moved to a new date or time', f.kinds.rescheduled, { indent: true })}
            {bar('Re-attempt', 'Booked again after a no-show', f.kinds.reattempt, { indent: true })}
            {bar('Follow-up meeting', 'Another meeting after a done one', f.kinds.followup, { indent: true })}
            {bar('Meetings conducted', 'Marked Qualified or Not qualified', f.conducted)}
            {bar('Qualified', 'Guest fits the podcast', f.qualified, { indent: true, tone: 'is-green' })}
            {bar('No-show', 'Guest did not turn up', f.noShow, { tone: 'is-orange' })}
            {bar('Rescheduled', 'Moved to a new date', f.rescheduled)}
            {bar('Cancelled', 'Dropped, not rebooked', f.cancelled)}
            {bar('Closed (booked)', 'Podcast booked', f.closed, { tone: 'is-orange', lost: lostPct(f.scheduled, f.closed) })}
            {bar('Payment started', 'At least one payment received', f.paid)}
          </div>
          {f.awaiting > 0 && (
            <p className="small tone-danger" style={{ marginTop: 10 }}>
              {f.awaiting} meeting{f.awaiting === 1 ? '' : 's'} in {ml} still awaiting a result — record them on the <Link to="/meetings">Meetings page</Link>, otherwise Meetings conducted stays low.
            </p>
          )}
        </section>
      )}

      {shown('overdue') && (
        <section className={cn('card card-pad db-section', d.overdue.length > 0 && 'pd-overdue')} id="pd-overdue">
          {head(
            'overdue',
            <>
              Meetings overdue <span className={cn('badge', d.overdue.length ? 'badge-danger' : 'badge-muted')}>{d.overdue.length}</span>
            </>,
          )}
          {!d.overdue.length ? (
            <div className="muted small">Every past meeting has a result.</div>
          ) : (
            <>
              <p className="small tone-danger" style={{ marginTop: -4 }}>
                <AlertTriangle size={13} /> The meeting time + 1 hour has passed and no result is marked yet. Please mark it now.
              </p>
              <div className="table-wrap">
                <table className="table db-table">
                  <thead>
                    <tr>
                      <th>Meeting</th>
                      <th>Lead</th>
                      <th>Owner</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.overdue.map((m) => {
                      const l = d.leadById.get(m.lead_id)
                      return (
                        <tr key={m.id}>
                          <td className="nowrap">
                            <b>
                              {dayLabel(m.meeting_date)}, {clock(m.start_time)}
                            </b>
                          </td>
                          <td>
                            <Link to={`/leads/${m.lead_id}?tab=meetings`} className="db-name">
                              {name(m.lead_id)}
                            </Link>
                            <div className="muted small">{l?.phone}</div>
                          </td>
                          <td className="small">{ownerName(l)}</td>
                          <td>{outcomeButtons(m)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {shown('tasks') && (
        <section className="card card-pad db-section" id="pd-tasks">
          {head('tasks', <>Today’s tasks</>, <span className="muted small">{d.tasks.length} follow-ups due</span>)}
          {!d.tasks.length ? (
            <div className="muted small">Nothing due right now.</div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table db-table">
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Date</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {taskRows.map((t) => {
                      const l = d.leadById.get(t.lead_id)
                      const late = daysAgo(t.due_at)
                      return (
                        <tr key={t.id}>
                          <td>
                            <Link to={`/leads/${t.lead_id}`} className="db-name">
                              {name(t.lead_id)}
                            </Link>
                            <div className="muted small">{l?.phone}</div>
                          </td>
                          <td className={cn('small nowrap', late > 0 ? 'tone-danger' : 'tone-warning')} style={{ fontWeight: 600 }}>
                            {dayLabel(t.due_at)}
                            {late > 0 ? ` · Overdue ${late}d` : ' · Today'}
                          </td>
                          <td style={{ textAlign: 'right' }} className="nowrap">
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/leads/${t.lead_id}?tab=followups`)}>
                              <Phone size={13} /> Follow-up
                            </button>{' '}
                            {d.qualifiedLeads.has(t.lead_id) && can('bookings', 'add') ? (
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => bookFor(t.lead_id)}>
                                <CalendarCheck size={13} /> Book podcast
                              </button>
                            ) : (
                              can('meetings', 'add') &&
                              l && (
                                <button type="button" className="btn btn-outline btn-sm" onClick={() => setMt({ meeting: null, lead: l })}>
                                  <CalendarClock size={13} /> Meeting
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {d.tasks.length > 8 && (
                <button type="button" className="link-btn" style={{ marginTop: 10 }} onClick={() => setAllTasks((v) => !v)}>
                  {allTasks ? 'Show fewer' : `View all ${d.tasks.length} →`}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {shown('recordings') && (
        <section className="card card-pad db-section" id="pd-recordings">
          {head('recordings', <>Upcoming recordings</>)}
          {!d.recordings.length ? (
            <div className="muted small">
              No bookings yet. Book from the <Link to="/bookings">calendar</Link>.
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {d.recordings.map((b) => (
                <button key={b.id} type="button" className="db-shoot" onClick={() => setBook({ lead: null, booking: b })}>
                  <b>{b.client_name}</b>
                  <span className="muted small">
                    {dayLabel(b.booking_date, { weekday: 'short', day: 'numeric', month: 'short' })} · {clock(b.start_time)} – {clock(b.end_time)}
                    {b.purpose ? ` · ${b.purpose}` : ''} · {money(b.total_amount)}
                    {b.total_amount - b.paid_amount > 0 ? ` · ${money(b.total_amount - b.paid_amount)} due` : ' · paid'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {adding && (
        <QuickAddLead funnels={refs.funnels} defaultFunnelId={null} sources={refs.sources} onClose={() => setAdding(false)} onAdded={(id) => navigate(`/leads/${id}`)} />
      )}
      {mt && (
        <MeetingDrawer
          key={mt.meeting?.id ?? mt.lead?.id ?? 'new'}
          meeting={mt.meeting}
          lead={mt.lead ?? null}
          leads={mt.lead ? [mt.lead] : (leads ?? []).filter((l) => inScope(l.business_id, l.sub_business_id))}
          members={members}
          onClose={() => setMt(null)}
          onSaved={(msg) => {
            setMt(null)
            setNotice({ ok: msg })
            load()
          }}
          onBook={(l) => {
            setMt(null)
            setBook({ lead: l })
          }}
        />
      )}
      {book && (
        <BookingDrawer
          key={book.booking?.id ?? book.lead?.id ?? 'new'}
          booking={book.booking ?? null}
          lead={
            book.lead
              ? { id: book.lead.id, name: fullName(book.lead), phone: book.lead.phone, purpose: book.lead.purpose, business_id: book.lead.business_id, sub_business_id: book.lead.sub_business_id }
              : null
          }
          leads={book.lead ? undefined : (leads ?? [])}
          refs={refs}
          onClose={() => setBook(null)}
          onSaved={(msg) => {
            setBook(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}
    </>
  )
}
