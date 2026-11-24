import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CalendarClock, CircleCheck, Handshake, Pencil, Plus, Presentation, Trash2, UserX } from 'lucide-react'
import { BT } from '@/auth/auth-context'
import { useAuth } from '@/auth/useAuth'
import { BookingDrawer } from '@/bookings/BookingDrawer'
import { useBookingRefs } from '@/bookings/useBookingRefs'
import { useBusiness } from '@/business/useBusiness'
import { Flash } from '@/components/Flash'
import { SlotCalendar, clock, fmtDay, isoDay } from '@/components/SlotCalendar'
import { ConfirmModal, Empty, PageHead, Paged, StatCard } from '@/components/ui'
import { StatRecords, type StatShow } from '@/components/StatRecords'
import { listLeads, listMemberOptions } from '@/leads/api'
import { fullName, TEMPERATURES } from '@/leads/labels'
import type { LeadRow, MemberOption } from '@/leads/types'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'
import { archiveWebinar, listWebinarDates, listWebinars, plannedSlots, repeatText, type PlannedSlot, type WebinarDate, type WebinarRow } from '@/webinars/api'
import { PlannedDateDrawer } from '@/webinars/PlannedDateDrawer'
import { WebinarDateDrawer } from '@/webinars/WebinarDateDrawer'
import { WebinarDrawer } from '@/webinars/WebinarDrawer'
import { listMeetings } from './api'
import { MeetingDrawer } from './MeetingDrawer'
import { KIND_LABEL, MEETING_STATUS, MODE_LABEL, TEAM_COLOR, type MeetingKind, type MeetingRow, type MeetingStatus } from './types'
import { Select } from '@/components/Field'

const WEBINAR_COLOR = '#8b5cf6'
type TypeF = '' | MeetingKind | 'webinar'
/** one thing on the calendar, for the cards and their lists */
type Entry = { id: string; date: string; start: string; title: string; type: string; status: MeetingStatus; open: () => void }

/**
 * My Calendar: a person's schedule: the meetings they are in (with leads of the business picked in the header, and team
 * meetings) and the webinars they host. People who may see others pick a team member (or all). Schedule (or drag over
 * free time) adds a Lead / Team (internal) meeting or a Webinar.
 */
export function MeetingsPage() {
  const tenant = useTenant()
  const { membership, can, businesses } = useAuth()
  // the business picked on top only presets a new webinar's business; meetings go by team member
  const { selected } = useBusiness()
  const isAdmin = !!membership && (membership.is_support || membership.role.level <= 1)
  // the team member dropdown: whoever may see team members' calendars
  const canSeeOthers = isAdmin || can('meetings', 'view')
  const canWebinar = can('webinars', 'edit')
  // a done meeting with a Paid Podcast lead can book the podcast
  const isPodcastBiz = (id: string | null | undefined) => businesses.find((b) => b.id === id)?.type === BT.PAID_PODCAST
  const refs = useBookingRefs()
  const today = isoDay(new Date())
  const me = membership?.id ?? ''
  const [anchor, setAnchor] = useState(today)
  const [meetings, setMeetings] = useState<MeetingRow[] | null>(null)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  // filters: team member (me; '' = all team members) → type → category (lead meetings) → status
  const [memberF, setMemberF] = useState(me)
  const [typeF, setTypeF] = useState<TypeF>('')
  const [catF, setCatF] = useState('')
  const [status, setStatus] = useState<'' | MeetingStatus>('')
  const [drawer, setDrawer] = useState<{ meeting: MeetingRow | null; date?: string; start?: string; end?: string; kind?: MeetingKind } | null>(null)
  const [book, setBook] = useState<LeadRow | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  // webinars
  const [webinars, setWebinars] = useState<WebinarRow[] | null>(null)
  const [dates, setDates] = useState<WebinarDate[]>([])
  const [regCount, setRegCount] = useState<Record<string, number>>({})
  const [wDrawer, setWDrawer] = useState<{ webinar: WebinarRow | null; date?: string; start?: string; end?: string; schedule?: boolean } | null>(null)
  const [opened, setOpened] = useState<WebinarDate | null>(null)
  const [planned, setPlanned] = useState<{ webinar: WebinarRow; slot: PlannedSlot } | null>(null)
  const [removing, setRemoving] = useState<WebinarRow | null>(null)
  const webinarBiz = useMemo(() => businesses.filter((b) => b.type === BT.WEBINAR), [businesses])

  const load = useCallback(() => {
    listMeetings(tenant.id)
      .then(setMeetings)
      .catch((e: Error) => setNotice({ error: e.message }))
    listWebinars(tenant.id).then(setWebinars, () => setWebinars([]))
    listWebinarDates(tenant.id).then(setDates, () => setDates([]))
    void db()
      .from('webinar_registrations')
      .select('event_id')
      .eq('tenant_id', tenant.id)
      .limit(10000)
      .then(({ data }) => {
        const m: Record<string, number> = {}
        for (const r of (data ?? []) as { event_id: string }[]) m[r.event_id] = (m[r.event_id] ?? 0) + 1
        setRegCount(m)
      })
  }, [tenant.id])
  useEffect(load, [load])
  useEffect(() => {
    void listLeads(tenant.id, undefined, { cached: true }).then(setLeads, () => setLeads([]))
    void listMemberOptions(tenant.id).then(setMembers, () => setMembers([]))
  }, [tenant.id])

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])
  const name = useCallback(
    (m: MeetingRow) => {
      if (m.kind === 'team') return m.title || 'Team meeting'
      const l = m.lead_id ? leadById.get(m.lead_id) : null
      return l ? fullName(l) : 'Lead'
    },
    [leadById],
  )
  // whose calendar: mine, unless this person may pick another team member (or all)
  const who = canSeeOthers ? memberF : me
  const memberName = (id: string | null | undefined) => members.find((x) => x.id === id)?.name

  // ---- meetings ----
  const visible = useMemo(
    () =>
      typeF === 'webinar'
        ? []
        : (meetings ?? []).filter(
            (m) =>
              !!me &&
              (!who || m.members.includes(who) || m.created_by === who) &&
              (!typeF || m.kind === typeF) &&
              (typeF !== 'lead' || !catF || (!!m.lead_id && leadById.get(m.lead_id)?.temperature === catF)) &&
              (!status || m.status === status),
          ),
    [meetings, me, who, typeF, catF, leadById, status],
  )

  // ---- webinars: the ones this team member hosts (all, for All team members) ----
  const myWebinars = useMemo(
    () => (webinars ?? []).filter((w) => !who || w.host_member_id === who),
    [webinars, who],
  )
  const byId = useMemo(() => new Map((webinars ?? []).map((w) => [w.id, w])), [webinars])
  const showWebinars = typeF === '' || typeF === 'webinar'
  const dateStatus = (d: WebinarDate): MeetingStatus => {
    const end = (d.end_time ?? d.start_time).slice(0, 5)
    return Date.parse(`${d.event_date}T${end}:00+05:30`) < Date.now() ? 'done' : 'scheduled'
  }
  const myDates = useMemo(
    () => (showWebinars ? dates.filter((d) => myWebinars.some((w) => w.id === d.webinar_id)).filter((d) => !status || dateStatus(d) === status) : []),
    [showWebinars, dates, myWebinars, status],
  )
  const plannedList = useMemo(
    () =>
      showWebinars && (!status || status === 'scheduled')
        ? myWebinars.flatMap((w) =>
            plannedSlots(
              w,
              dates.filter((d) => d.webinar_id === w.id).map((d) => d.event_date),
              today,
            ).map((s) => ({ w, s })),
          )
        : [],
    [showWebinars, status, myWebinars, dates, today],
  )

  // ---- the calendar ----
  const items = useMemo(() => {
    if (!meetings) return null
    const ms = visible.map((m) => {
      const l = m.lead_id ? leadById.get(m.lead_id) : null
      const team = m.kind === 'team'
      const where = m.mode === 'online' ? MODE_LABEL.online : m.location ? `In person · ${m.location}` : MODE_LABEL.in_person
      const moved = (m.reschedules ?? []).length
      const names = m.members.map((id) => memberName(id)).filter(Boolean)
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
    const ws = myDates.map((d) => {
      const end = (d.end_time ?? d.start_time).slice(0, 5)
      const n = regCount[d.id] ?? 0
      const host = memberName(byId.get(d.webinar_id)?.host_member_id)
      return {
        id: `w:${d.id}`,
        date: d.event_date,
        start: d.start_time.slice(0, 5),
        end,
        title: `${d.title} · Webinar`,
        detail: `${n} registered`,
        meta: `Webinar · ${clock(d.start_time.slice(0, 5))} – ${clock(end)} · ${n} registered${host ? ` · host ${host}` : ''}${d.zoom_error ? ' · Zoom problem' : !d.zoom_webinar_id ? ' · Zoom being made' : ''}`,
        color: d.zoom_error ? '#dc2626' : WEBINAR_COLOR,
        faded: dateStatus(d) === 'done',
      }
    })
    const ps = plannedList.map(({ w, s }) => ({
      id: `planned:${w.id}:${s.date}`,
      date: s.date,
      start: s.start,
      end: s.end,
      title: `${w.title} · Webinar`,
      detail: s.moved ? 'Scheduled · rescheduled' : 'Scheduled',
      meta: `Webinar · ${clock(s.start)} – ${clock(s.end)} · Scheduled${s.moved ? ' · rescheduled' : ''} (made when the date before it ends)`,
      color: WEBINAR_COLOR,
      planned: true,
    }))
    return [...ms, ...ws, ...ps]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, visible, myDates, plannedList, leadById, name, members, regCount, byId])

  // ---- the cards (they follow the filters) ----
  const month = anchor.slice(0, 7)
  const entries = useMemo<Entry[]>(
    () => [
      ...visible.map((m) => ({ id: m.id, date: m.meeting_date, start: m.start_time, title: name(m), type: KIND_LABEL[m.kind], status: m.status, open: () => setDrawer({ meeting: m }) })),
      ...myDates.map((d) => ({ id: `w:${d.id}`, date: d.event_date, start: d.start_time, title: d.title, type: 'Webinar', status: dateStatus(d), open: () => setOpened(d) })),
      ...plannedList.map(({ w, s }) => ({ id: `planned:${w.id}:${s.date}`, date: s.date, start: s.start, title: w.title, type: 'Webinar', status: 'scheduled' as MeetingStatus, open: () => setPlanned({ webinar: w, slot: s }) })),
    ],
    [visible, myDates, plannedList, name],
  )
  const stats = useMemo(() => {
    const inMonth = entries.filter((e) => e.date.slice(0, 7) === month)
    const done = inMonth.filter((e) => e.status === 'done').length
    const noShow = inMonth.filter((e) => e.status === 'no_show').length
    const decided = done + noShow
    const upcoming = entries.filter((e) => e.status === 'scheduled' && e.date >= today)
    return { count: inMonth.length, done, noShow, rate: decided ? Math.round((done / decided) * 100) : 0, upcoming: upcoming.length, todays: upcoming.filter((e) => e.date === today).length }
  }, [entries, month, today])
  const [statShow, setStatShow] = useState<StatShow<Entry> | null>(null)
  const showList = (title: string, f: (e: Entry) => boolean) => () =>
    setStatShow({
      title,
      rows: entries.filter(f).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
      cols: [
        { label: 'When', render: (e) => <span className="nowrap">{`${fmtDay(e.date, { day: 'numeric', month: 'short', year: 'numeric' })} · ${clock(e.start.slice(0, 5))}`}</span> },
        { label: 'What', render: (e) => <b>{e.title}</b> },
        { label: 'Type', render: (e) => e.type },
        { label: 'Status', render: (e) => <span className={`badge ${MEETING_STATUS[e.status].tone}`}>{MEETING_STATUS[e.status].label}</span> },
      ],
    })
  const mon = fmtDay(`${month}-01`, { month: 'short' })

  // ---- the webinars list (Type: Webinar) ----
  const nextDate = (w: WebinarRow) => dates.filter((d) => d.webinar_id === w.id && d.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date))[0]
  async function toggle(w: WebinarRow) {
    try {
      const { error } = await db().from('webinars').update({ is_active: !w.is_active }).eq('id', w.id)
      if (error) throw error
      setNotice({ ok: `${w.title} ${w.is_active ? 'switched off: no new dates are made' : 'switched on'}.` })
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }

  const statusOptions: MeetingStatus[] = typeF === 'webinar' ? ['scheduled', 'done'] : typeF === 'team' ? ['scheduled', 'done', 'cancelled'] : ['scheduled', 'done', 'no_show', 'cancelled']
  const hostFor = who || me
  const schedule = (d: { date?: string; start?: string; end?: string }) =>
    typeF === 'webinar' && canWebinar && webinarBiz.length ? setWDrawer({ webinar: null, ...d, schedule: true }) : setDrawer({ meeting: null, ...d, kind: typeF === 'team' ? 'team' : undefined })

  return (
    <>
      <PageHead
        title="My Calendar"
        subtitle="Meetings with leads, team (internal) meetings and the webinars hosted. Schedule, or drag over free time, to add a meeting or a webinar."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => schedule({ date: anchor >= today ? anchor : today })}>
            <Plus size={16} /> Schedule
          </button>
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      <div className="stat-grid">
        <StatCard icon={Handshake} tone="brand" value={stats.count} label={`In ${mon}`} onClick={showList(`In ${mon}`, (e) => e.date.slice(0, 7) === month)} />
        <StatCard icon={CalendarClock} tone="info" value={stats.upcoming} label="Upcoming" hint={`${stats.todays} today`} onClick={showList('Upcoming', (e) => e.status === 'scheduled' && e.date >= today)} />
        <StatCard icon={CircleCheck} tone="success" value={stats.done} label="Done" hint={stats.done + stats.noShow ? `${stats.rate}% showed up` : undefined} onClick={showList('Done', (e) => e.date.slice(0, 7) === month && e.status === 'done')} />
        <StatCard icon={UserX} tone="danger" value={stats.noShow} label="No-show" onClick={showList('No-show', (e) => e.date.slice(0, 7) === month && e.status === 'no_show')} />
      </div>
      <StatRecords show={statShow} onClose={() => setStatShow(null)} rowKey={(e) => e.id} onRow={(e) => e.open()} />

      <SlotCalendar
        items={items}
        anchor={anchor}
        setAnchor={setAnchor}
        storageKey="meetings.view"
        canAdd
        noun="meetings"
        filtersRow
        onCreate={(x) => schedule({ date: x.date, start: x.start, end: x.end })}
        onOpen={(id) => {
          if (id.startsWith('planned:')) {
            const [, wid, date] = id.split(':')
            const hit = plannedList.find((p) => p.w.id === wid && p.s.date === date)
            if (hit) setPlanned({ webinar: hit.w, slot: hit.s })
          } else if (id.startsWith('w:')) setOpened(dates.find((d) => d.id === id.slice(2)) ?? null)
          else {
            const m = meetings?.find((x) => x.id === id)
            if (m) setDrawer({ meeting: m })
          }
        }}
        filters={
          <>
            {canSeeOthers && (
              <Select className="input input-sm filter-select cal-filter" value={memberF} onChange={(e) => setMemberF(e.target.value)} aria-label="Team member">
                <option value={me}>My calendar</option>
                <option value="">All team members</option>
                {members
                  .filter((m) => m.id !== me)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </Select>
            )}
            <Select
              className="input input-sm filter-select cal-filter"
              value={typeF}
              onChange={(e) => {
                setTypeF(e.target.value as TypeF)
                setCatF('')
                setStatus('')
              }}
              aria-label="Type"
            >
              <option value="">All types</option>
              <option value="lead">Lead meetings</option>
              <option value="team">Team meetings</option>
              <option value="webinar">Webinars</option>
            </Select>
            {typeF === 'lead' && (
              <Select className="input input-sm filter-select cal-filter" value={catF} onChange={(e) => setCatF(e.target.value)} aria-label="Lead category">
                <option value="">All categories</option>
                {TEMPERATURES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
            <Select className="input input-sm filter-select cal-filter" value={status} onChange={(e) => setStatus(e.target.value as MeetingStatus | '')} aria-label="Status">
              <option value="">All statuses</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {MEETING_STATUS[s].label}
                </option>
              ))}
            </Select>
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
        <span className="stage-pill" style={{ ['--c' as string]: WEBINAR_COLOR }}>
          Webinar
        </span>
      </div>

      {typeF === 'webinar' && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="panel-bar">
            <div>
              <b>Webinars</b>
              <div className="muted small">{who ? `Hosted by ${who === me ? 'me' : memberName(who) ?? 'this team member'}.` : 'Every host.'} Click one to edit it; its next date is made when the one before ends.</div>
            </div>
          </div>
          {!webinars ? (
            <div className="empty">Loading…</div>
          ) : !myWebinars.length ? (
            <Empty icon={Presentation}>No webinars yet. Add one with Schedule → Webinar.</Empty>
          ) : (
            <Paged rows={myWebinars}>
              {(paged) => (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Webinar</th>
                        <th>When</th>
                        <th>Host</th>
                        <th>Next date</th>
                        <th>Active</th>
                        {canWebinar && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((w) => {
                        const nd = nextDate(w)
                        return (
                          <tr key={w.id} className="is-clickable" onClick={() => setWDrawer({ webinar: w })}>
                            <td>
                              <b>{w.title}</b>
                              <div className="muted small">{businesses.find((b) => b.id === w.business_id)?.name}</div>
                            </td>
                            <td>
                              {repeatText(w)}
                              <div className="muted small">
                                {clock(w.start_time)} – {clock(w.end_time)}
                              </div>
                            </td>
                            <td>{memberName(w.host_member_id) ?? <span className="muted">—</span>}</td>
                            <td className="nowrap">
                              {nd ? (
                                <button
                                  type="button"
                                  className="link-btn"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpened(nd)
                                  }}
                                >
                                  {fmtDay(nd.event_date, { weekday: 'short', day: 'numeric', month: 'short' })} · {regCount[nd.id] ?? 0} registered
                                </button>
                              ) : (
                                <span className="muted">None coming</span>
                              )}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {canWebinar ? (
                                <label className={cn('tgl', w.is_active && 'is-on')} title={w.is_active ? 'Turn off' : 'Turn on'}>
                                  <input type="checkbox" role="switch" checked={w.is_active} onChange={() => void toggle(w)} aria-label={`${w.title} active`} />
                                  <span className="tgl-track" aria-hidden="true">
                                    <span className="tgl-knob" />
                                  </span>
                                  {w.is_active ? 'Active' : 'Inactive'}
                                </label>
                              ) : (
                                <span className={cn('badge', w.is_active ? 'badge-success' : 'badge-muted')}>{w.is_active ? 'Active' : 'Inactive'}</span>
                              )}
                            </td>
                            {canWebinar && (
                              <td className="nowrap" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                                <button type="button" className="btn btn-ghost btn-icon" title="Edit" onClick={() => setWDrawer({ webinar: w })}>
                                  <Pencil size={15} />
                                </button>
                                <button type="button" className="btn btn-ghost btn-icon danger-text" title="Delete" onClick={() => setRemoving(w)}>
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Paged>
          )}
        </section>
      )}

      {drawer && (
        <MeetingDrawer
          key={drawer.meeting?.id ?? `${drawer.date}-${drawer.start ?? ''}-${drawer.end ?? ''}-${drawer.kind ?? ''}`}
          meeting={drawer.meeting}
          initialKind={drawer.kind}
          defaults={{ date: drawer.date, start: drawer.start, end: drawer.end }}
          leads={leads}
          members={members}
          onClose={() => setDrawer(null)}
          onSaved={(msg) => {
            setDrawer(null)
            setNotice({ ok: msg })
            load()
          }}
          onBook={
            drawer.meeting && isPodcastBiz(drawer.meeting.business_id)
              ? (l) => {
                  setDrawer(null)
                  setBook(l)
                }
              : undefined
          }
          onWebinar={
            canWebinar && webinarBiz.length
              ? (d) => {
                  setDrawer(null)
                  setWDrawer({ webinar: null, ...d, schedule: true })
                }
              : undefined
          }
        />
      )}

      {wDrawer && (
        <WebinarDrawer
          key={wDrawer.webinar?.id ?? `new-${wDrawer.date ?? ''}-${wDrawer.start ?? ''}`}
          webinar={wDrawer.webinar}
          businesses={webinarBiz.map((b) => ({ id: b.id, name: b.name }))}
          defaultBusinessId={selected && webinarBiz.some((b) => b.id === selected.id) ? selected.id : null}
          defaultHostId={hostFor}
          defaults={wDrawer.webinar ? undefined : { date: wDrawer.date, start: wDrawer.start, end: wDrawer.end }}
          onSwitch={
            wDrawer.schedule
              ? (kind) => {
                  const d = wDrawer
                  setWDrawer(null)
                  setDrawer({ meeting: null, date: d.date, start: d.start, end: d.end, kind })
                }
              : undefined
          }
          onClose={() => setWDrawer(null)}
          onSaved={(msg) => {
            setWDrawer(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}
      {opened && (
        <WebinarDateDrawer
          key={opened.id}
          date={opened}
          webinar={byId.get(opened.webinar_id) ?? null}
          siblings={dates.filter((d) => d.webinar_id === opened.webinar_id)}
          onClose={() => setOpened(null)}
          onEdit={() => {
            const w = byId.get(opened.webinar_id) ?? null
            setOpened(null)
            if (w) setWDrawer({ webinar: w })
          }}
          onDeleted={(msg) => {
            setOpened(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}
      {planned && (
        <PlannedDateDrawer
          key={`${planned.webinar.id}:${planned.slot.date}`}
          webinar={planned.webinar}
          slot={planned.slot}
          madeDates={dates.filter((d) => d.webinar_id === planned.webinar.id).map((d) => d.event_date)}
          canEdit={canWebinar}
          onClose={() => setPlanned(null)}
          onEdit={() => {
            const w = planned.webinar
            setPlanned(null)
            setWDrawer({ webinar: w })
          }}
          onDeleted={(msg) => {
            setPlanned(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}
      <ConfirmModal
        open={!!removing}
        icon={Trash2}
        danger
        title="Delete this webinar?"
        message={removing ? `“${removing.title}”: its coming dates are called off (and removed from Zoom), and its 3 workflows and its funnel are deleted too. Past dates, registrations and Zoom data stay on the leads.` : ''}
        confirmLabel="Delete"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const w = removing
          setRemoving(null)
          if (!w) return
          try {
            await archiveWebinar(w)
            setNotice({ ok: `${w.title} deleted.` })
            load()
          } catch (e) {
            setNotice({ error: (e as Error).message })
          }
        }}
      />

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
