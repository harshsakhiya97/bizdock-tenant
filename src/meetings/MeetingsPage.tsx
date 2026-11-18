import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CalendarClock, CircleCheck, Handshake, Plus, UserX } from 'lucide-react'
import { BT } from '@/auth/auth-context'
import { useAuth } from '@/auth/useAuth'
import { activeType } from '@/business/activeType'
import { BookingDrawer } from '@/bookings/BookingDrawer'
import { useBookingRefs } from '@/bookings/useBookingRefs'
import { useBusiness } from '@/business/useBusiness'
import { Flash } from '@/components/Flash'
import { SlotCalendar, clock, fmtDay, isoDay } from '@/components/SlotCalendar'
import { PageHead, StatCard } from '@/components/ui'
import { listLeads, listMemberOptions } from '@/leads/api'
import { fullName, TEMPERATURES } from '@/leads/labels'
import type { LeadRow, MemberOption } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { listMeetings } from './api'
import { db } from '@/lib/supabase'
import { listWidgets, type WidgetRow } from '@/widgets/api'
import { MeetingDrawer } from './MeetingDrawer'
import { KIND_LABEL, MEETING_STATUS, MODE_LABEL, TEAM_COLOR, type MeetingKind, type MeetingRow, type MeetingStatus } from './types'

/** Meetings: like a personal calendar, each person sees the meetings they are in (or added): with leads of the
 *  business picked in the header, and team (internal, company-level) meetings. Calendar like the shoot calendar. */
export function MeetingsPage() {
  const tenant = useTenant()
  const { membership } = useAuth()
  // the team member / booking calendar filters: Owner and Tech Support only
  const isAdmin = !!membership && (membership.is_support || membership.role.level <= 1)
  const { inScope, selected, sub } = useBusiness()
  // Paid Podcast: a done meeting can book the podcast
  const podcast = activeType(selected, sub) === BT.PAID_PODCAST
  const refs = useBookingRefs()
  // anyone in the team can add a meeting
  const canAdd = true
  const today = isoDay(new Date())
  const [anchor, setAnchor] = useState(today)
  const [meetings, setMeetings] = useState<MeetingRow[] | null>(null)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [status, setStatus] = useState<'' | MeetingStatus>('')
  const [kindF, setKindF] = useState<'' | MeetingKind>('')
  // 'mine' (my calendar), '' (every team member's, admins), or one team member's id
  const [memberF, setMemberF] = useState('mine')
  const [catF, setCatF] = useState('')
  const [widgetF, setWidgetF] = useState('')
  const [widgets, setWidgets] = useState<WidgetRow[]>([])
  // booking calendar → its booked slots ("member|2026-11-05 10:30"), to tell which meetings came from it
  const [booked, setBooked] = useState<Map<string, Set<string>>>(new Map())
  const [drawer, setDrawer] = useState<{ meeting: MeetingRow | null; date?: string; start?: string; end?: string } | null>(null)
  const [book, setBook] = useState<LeadRow | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  const load = useCallback(() => {
    listMeetings(tenant.id)
      .then(setMeetings)
      .catch((e: Error) => setNotice({ error: e.message }))
  }, [tenant.id])
  useEffect(load, [load])
  useEffect(() => {
    void listLeads(tenant.id).then(setLeads, () => setLeads([]))
    void listMemberOptions(tenant.id).then(setMembers, () => setMembers([]))
  }, [tenant.id])
  useEffect(() => {
    if (!isAdmin) return
    listWidgets(tenant.id).then((w) => setWidgets(w.filter((x) => x.kind === 'booking_calendar' && x.is_active)), () => setWidgets([]))
    void db()
      .from('widget_bookings')
      .select('widget_id, member_id, starts_at')
      .eq('tenant_id', tenant.id)
      .eq('status', 'booked')
      .then(({ data }) => {
        const m = new Map<string, Set<string>>()
        for (const b of (data ?? []) as { widget_id: string; member_id: string | null; starts_at: string }[]) {
          if (!b.member_id) continue
          const ist = new Date(Date.parse(b.starts_at) + 330 * 60_000).toISOString()
          const set = m.get(b.widget_id) ?? new Set<string>()
          set.add(`${b.member_id}|${ist.slice(0, 10)} ${ist.slice(11, 16)}`)
          m.set(b.widget_id, set)
        }
        setBooked(m)
      })
  }, [tenant.id, isAdmin])

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])
  const name = useCallback(
    (m: MeetingRow) => {
      if (m.kind === 'team') return m.title || 'Team meeting'
      const l = m.lead_id ? leadById.get(m.lead_id) : null
      return l ? fullName(l) : 'Lead'
    },
    [leadById],
  )
  const me = membership?.id
  // my calendar: the meetings I am in or added; owner / support can also see every team member's (or one person's) calendar.
  // Lead meetings of the business in the header, team meetings always.
  const mineOnly = !isAdmin || memberF === 'mine'
  const scoped = useMemo(
    () =>
      (meetings ?? []).filter(
        (m) =>
          !!me &&
          (!mineOnly || m.members.includes(me) || m.created_by === me) &&
          (m.kind === 'team' || inScope(m.business_id ?? '', m.sub_business_id)),
      ),
    [meetings, inScope, me, mineOnly],
  )
  const visible = useMemo(
    () =>
      scoped.filter(
        (m) =>
          (!status || m.status === status) &&
          (!kindF || m.kind === kindF) &&
          (!memberF || memberF === 'mine' || m.members.includes(memberF)) &&
          (!catF || (!!m.lead_id && leadById.get(m.lead_id)?.temperature === catF)) &&
          (!widgetF || !!booked.get(widgetF)?.has(`${m.assigned_to}|${m.meeting_date} ${String(m.start_time ?? '').slice(0, 5)}`)),
      ),
    [scoped, status, kindF, memberF, catF, leadById, widgetF, booked],
  )
  const scopedLeads = useMemo(() => leads.filter((l) => inScope(l.business_id, l.sub_business_id)), [leads, inScope])

  // ---- stats for the month on screen ----
  const month = anchor.slice(0, 7)
  const stats = useMemo(() => {
    // the cards follow the filters (team member, booking calendar, category, status)
    const inMonth = visible.filter((m) => m.meeting_date.slice(0, 7) === month)
    const done = inMonth.filter((m) => m.status === 'done').length
    const noShow = inMonth.filter((m) => m.status === 'no_show').length
    const decided = done + noShow
    const upcoming = visible.filter((m) => m.status === 'scheduled' && m.meeting_date >= today).length
    const rescheduled = inMonth.filter((m) => (m.reschedules ?? []).length > 0).length
    return { count: inMonth.length, done, noShow, rate: decided ? Math.round((done / decided) * 100) : 0, upcoming, todays: visible.filter((m) => m.status === 'scheduled' && m.meeting_date === today).length, rescheduled }
  }, [visible, month, today])

  const items = useMemo(
    () =>
      meetings
        ? visible.map((m) => {
            const l = m.lead_id ? leadById.get(m.lead_id) : null
            const team = m.kind === 'team'
            const where = m.mode === 'online' ? MODE_LABEL.online : m.location ? `In person · ${m.location}` : MODE_LABEL.in_person
            const moved = (m.reschedules ?? []).length
            const names = m.members.map((id) => members.find((x) => x.id === id)?.name).filter(Boolean)
            const host = names.length ? (names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ')) : null
            return {
              id: m.id,
              date: m.meeting_date,
              start: m.start_time,
              end: m.end_time,
              title: team ? `${name(m)} · Team` : name(m),
              detail: where,
              meta: `${KIND_LABEL[m.kind]} · ${clock(m.start_time)} – ${clock(m.end_time)} · ${where} · ${MEETING_STATUS[m.status].label}${host ? ` · with ${host}` : ''}${moved ? ` · rescheduled ${moved}×` : ''}`,
              color: team && m.status === 'scheduled' ? TEAM_COLOR : MEETING_STATUS[m.status].color,
              faded: m.status === 'cancelled',
              side: l?.phone,
              actions: (
                <>
                  {m.mode === 'online' && m.link?.startsWith('http') && (
                    <a className="btn btn-outline btn-sm" href={m.link} target="_blank" rel="noreferrer">
                      Join
                    </a>
                  )}
                  {m.lead_id && (
                    <Link className="btn btn-outline btn-sm" to={`/leads/${m.lead_id}`}>
                      Lead
                    </Link>
                  )}
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setDrawer({ meeting: m })}>
                    {m.status === 'scheduled' ? (team ? 'Done / Reschedule / Cancel' : 'Done / Reschedule / No-show') : 'Open'}
                  </button>
                </>
              ),
            }
          })
        : null,
    [meetings, visible, leadById, name, members],
  )

  return (
    <>
      <PageHead
        title="Meetings"
        subtitle="Your meetings: with leads and team (internal) meetings. Upcoming, then Done (with a comment), No-show or Cancelled; Reschedule moves the same meeting. Drag over free time to schedule one."
        actions={
          canAdd && (
            <button type="button" className="btn btn-primary" onClick={() => setDrawer({ meeting: null, date: anchor })}>
              <Plus size={16} /> Schedule meeting
            </button>
          )
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      <div className="stat-grid">
        <StatCard icon={Handshake} tone="brand" value={stats.count} label={`Meetings in ${fmtDay(`${month}-01`, { month: 'short' })}`} hint={stats.rescheduled ? `${stats.rescheduled} rescheduled` : undefined} />
        <StatCard icon={CalendarClock} tone="info" value={stats.upcoming} label="Upcoming" hint={`${stats.todays} today`} />
        <StatCard icon={CircleCheck} tone="success" value={stats.done} label="Done" hint={stats.done + stats.noShow ? `${stats.rate}% showed up` : undefined} />
        <StatCard icon={UserX} tone="danger" value={stats.noShow} label="No-show" />
      </div>

      <SlotCalendar
        items={items}
        anchor={anchor}
        setAnchor={setAnchor}
        storageKey="meetings.view"
        canAdd={canAdd}
        noun="meetings"
        onCreate={(x) => setDrawer({ meeting: null, date: x.date, start: x.start, end: x.end })}
        onOpen={(id) => {
          const m = meetings?.find((x) => x.id === id)
          if (m) setDrawer({ meeting: m })
        }}
        filters={
          <>
            {isAdmin && (
              <select className="input input-sm filter-select" value={memberF} onChange={(e) => setMemberF(e.target.value)} aria-label="Team member">
                <option value="mine">My meetings</option>
                <option value="">All team members</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
            {isAdmin && widgets.length > 0 && (
              <select className="input input-sm filter-select" value={widgetF} onChange={(e) => setWidgetF(e.target.value)} aria-label="Booking calendar">
                <option value="">All bookings</option>
                {widgets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
            <select className="input input-sm filter-select" value={kindF} onChange={(e) => setKindF(e.target.value as MeetingKind | '')} aria-label="Lead or team">
              <option value="">Lead &amp; team</option>
              <option value="lead">Lead meetings</option>
              <option value="team">Team meetings</option>
            </select>
            <select className="input input-sm filter-select" value={catF} onChange={(e) => setCatF(e.target.value)} aria-label="Lead category">
              <option value="">All categories</option>
              {TEMPERATURES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select className="input input-sm filter-select" value={status} onChange={(e) => setStatus(e.target.value as MeetingStatus | '')} aria-label="Status">
              <option value="">All statuses</option>
              {(Object.keys(MEETING_STATUS) as MeetingStatus[]).map((s) => (
                <option key={s} value={s}>
                  {MEETING_STATUS[s].label}
                </option>
              ))}
            </select>
          </>
        }
      />

      <div className="cal-legend">
        {(Object.keys(MEETING_STATUS) as MeetingStatus[]).map((s) => (
          <span key={s} className="stage-pill" style={{ ['--c' as string]: MEETING_STATUS[s].color }}>
            {MEETING_STATUS[s].label}
          </span>
        ))}
        <span className="stage-pill" style={{ ['--c' as string]: TEAM_COLOR }}>
          Team meeting (upcoming)
        </span>
      </div>

      {drawer && (
        <MeetingDrawer
          key={drawer.meeting?.id ?? `${drawer.date}-${drawer.start ?? ''}-${drawer.end ?? ''}`}
          meeting={drawer.meeting}
          defaults={{ date: drawer.date, start: drawer.start, end: drawer.end }}
          leads={drawer.meeting ? leads : scopedLeads}
          members={members}
          onClose={() => setDrawer(null)}
          onSaved={(msg) => {
            setDrawer(null)
            setNotice({ ok: msg })
            load()
          }}
          onBook={
            podcast
              ? (l) => {
                  setDrawer(null)
                  setBook(l)
                }
              : undefined
          }
        />
      )}

      {book && (
        <BookingDrawer
          booking={null}
          lead={{ id: book.id, name: fullName(book), phone: book.phone, purpose: book.purpose, business_id: book.business_id, sub_business_id: book.sub_business_id }}
          refs={refs}
          onClose={() => setBook(null)}
          onSaved={(msg) => {
            setBook(null)
            setNotice({ ok: msg })
          }}
        />
      )}
    </>
  )
}
