import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CalendarClock, CircleCheck, CircleX, Handshake, Plus } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { BookingDrawer } from '@/bookings/BookingDrawer'
import { useBookingRefs } from '@/bookings/useBookingRefs'
import { useBusiness } from '@/business/useBusiness'
import { Flash } from '@/components/Flash'
import { SlotCalendar, clock, fmtDay, isoDay } from '@/components/SlotCalendar'
import { PageHead, StatCard } from '@/components/ui'
import { listLeads, listMemberOptions } from '@/leads/api'
import { fullName } from '@/leads/labels'
import type { LeadRow, MemberOption } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { listMeetings } from './api'
import { MeetingDrawer } from './MeetingDrawer'
import { MEETING_STATUS, MODE_LABEL, type MeetingRow, type MeetingStatus } from './types'

/** Paid Podcast: meetings with guests to decide if they qualify. Calendar like the shoot calendar. */
export function MeetingsPage() {
  const tenant = useTenant()
  const { can } = useAuth()
  const { inScope } = useBusiness()
  const refs = useBookingRefs()
  const canAdd = can('meetings', 'add')
  const today = isoDay(new Date())
  const [anchor, setAnchor] = useState(today)
  const [meetings, setMeetings] = useState<MeetingRow[] | null>(null)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [status, setStatus] = useState<'' | MeetingStatus>('')
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

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])
  const name = useCallback((m: MeetingRow) => {
    const l = leadById.get(m.lead_id)
    return l ? fullName(l) : 'Guest'
  }, [leadById])
  const scoped = useMemo(() => (meetings ?? []).filter((m) => inScope(m.business_id, m.sub_business_id)), [meetings, inScope])
  const visible = useMemo(() => scoped.filter((m) => !status || m.status === status), [scoped, status])
  const scopedLeads = useMemo(() => leads.filter((l) => inScope(l.business_id, l.sub_business_id)), [leads, inScope])

  // ---- stats for the month on screen ----
  const month = anchor.slice(0, 7)
  const stats = useMemo(() => {
    const inMonth = scoped.filter((m) => m.status !== 'cancelled' && m.meeting_date.slice(0, 7) === month)
    const qualified = inMonth.filter((m) => m.status === 'qualified').length
    const notQ = inMonth.filter((m) => m.status === 'not_qualified').length
    const decided = qualified + notQ
    const upcoming = scoped.filter((m) => m.status === 'scheduled' && m.meeting_date >= today).length
    const rescheduled = inMonth.filter((m) => (m.reschedules ?? []).length > 0).length
    return { count: inMonth.length, qualified, notQ, rate: decided ? Math.round((qualified / decided) * 100) : 0, upcoming, todays: scoped.filter((m) => m.status === 'scheduled' && m.meeting_date === today).length, rescheduled }
  }, [scoped, month, today])

  const items = useMemo(
    () =>
      meetings
        ? visible.map((m) => {
            const l = leadById.get(m.lead_id)
            const where = m.mode === 'online' ? MODE_LABEL.online : m.location ? `In person · ${m.location}` : MODE_LABEL.in_person
            const moved = (m.reschedules ?? []).length
            return {
              id: m.id,
              date: m.meeting_date,
              start: m.start_time,
              end: m.end_time,
              title: name(m),
              detail: where,
              meta: `${clock(m.start_time)} – ${clock(m.end_time)} · ${where} · ${MEETING_STATUS[m.status].label}${moved ? ` · rescheduled ${moved}×` : ''}`,
              color: MEETING_STATUS[m.status].color,
              side: l?.phone,
              actions: (
                <>
                  {m.mode === 'online' && m.link?.startsWith('http') && (
                    <a className="btn btn-outline btn-sm" href={m.link} target="_blank" rel="noreferrer">
                      Join
                    </a>
                  )}
                  <Link className="btn btn-outline btn-sm" to={`/leads/${m.lead_id}`}>
                    Lead
                  </Link>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setDrawer({ meeting: m })}>
                    {m.status === 'scheduled' ? 'Reschedule / outcome' : 'Open'}
                  </button>
                </>
              ),
            }
          })
        : null,
    [meetings, visible, leadById, name],
  )

  return (
    <>
      <PageHead
        title="Meetings"
        subtitle="Meetings with guests: qualified guests get their podcast booked, the rest are dropped. Drag over free time to schedule one."
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
        <StatCard icon={CircleCheck} tone="success" value={stats.qualified} label="Qualified" hint={stats.qualified + stats.notQ ? `${stats.rate}% of decided` : undefined} />
        <StatCard icon={CircleX} tone="danger" value={stats.notQ} label="Not qualified" hint="Leads dropped" />
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
          <select className="input input-sm filter-select" value={status} onChange={(e) => setStatus(e.target.value as MeetingStatus | '')} aria-label="Status">
            <option value="">All</option>
            {(Object.keys(MEETING_STATUS) as MeetingStatus[]).map((s) => (
              <option key={s} value={s}>
                {MEETING_STATUS[s].label}
              </option>
            ))}
          </select>
        }
      />

      <div className="cal-legend">
        {(Object.keys(MEETING_STATUS) as MeetingStatus[]).map((s) => (
          <span key={s} className="stage-pill" style={{ ['--c' as string]: MEETING_STATUS[s].color }}>
            {MEETING_STATUS[s].label}
          </span>
        ))}
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
          onBook={(l) => {
            setDrawer(null)
            setBook(l)
          }}
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
