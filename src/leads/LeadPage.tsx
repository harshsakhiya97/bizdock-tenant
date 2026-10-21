import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, MessageCircle, Pencil, PhoneCall, Star } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { listBookings } from '@/bookings/api'
import { BookingDrawer } from '@/bookings/BookingDrawer'
import { BookingsTab, slotText } from '@/bookings/BookingsTab'
import { FollowUpsTab } from '@/bookings/FollowUpsTab'
import { useBookingRefs } from '@/bookings/useBookingRefs'
import { WhatsAppModal } from '@/bookings/WhatsAppModal'
import type { BookingRow } from '@/bookings/types'
import { Empty } from '@/components/ui'
import { db } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { ago } from '@/team/time'
import { useTenant } from '@/tenant/useTenant'
import { ActivityLog } from './ActivityLog'
import { getLead, listLostReasons, listMemberOptions } from './api'
import { LeadDrawer } from './LeadDrawer'
import { LeadOrigin } from './LeadOrigin'
import { followUp, fullName, money, tempOf } from './labels'
import type { LeadRow, MemberOption, Option } from './types'
import { Flash } from '@/components/Flash'

type Tab = 'details' | 'followups' | 'bookings'

export const fmtDay = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/** One lead: details, follow-ups (calls / WhatsApp) and bookings. */
export function LeadPage() {
  const { id = '' } = useParams()
  const tenant = useTenant()
  const navigate = useNavigate()
  const { can, businesses } = useAuth()
  const refs = useBookingRefs()
  const [lead, setLead] = useState<LeadRow | null | undefined>(undefined)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [lostReasons, setLostReasons] = useState<Option[]>([])
  const [bookings, setBookings] = useState<BookingRow[] | null>(null)
  const [client, setClient] = useState<{ id: string } | null>(null)
  // ?tab=followups / bookings opens that tab (e.g. from the dashboard)
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    return t === 'followups' || t === 'bookings' ? t : 'details'
  })
  const [editing, setEditing] = useState(false)
  const [bk, setBk] = useState<{ booking: BookingRow | null } | null>(null)
  const [wa, setWa] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  const load = useCallback(() => {
    getLead(id)
      .then(setLead)
      .catch((e: Error) => {
        setLead(null)
        setNotice({ error: e.message })
      })
    listBookings(tenant.id, { leadId: id })
      .then(setBookings)
      .catch(() => setBookings([]))
    void db()
      .from('customers')
      .select('id')
      .eq('lead_id', id)
      .eq('is_archived', false)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setClient(data as { id: string } | null))
  }, [id, tenant.id])
  useEffect(load, [load])
  useEffect(() => {
    void Promise.all([listMemberOptions(tenant.id), listLostReasons(tenant.id)]).then(([m, r]) => {
      setMembers(m)
      setLostReasons(r)
    })
  }, [tenant.id])

  const stageName = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of refs.funnels) for (const s of f.funnel_stages) m.set(s.id, s.name)
    return m
  }, [refs.funnels])

  const done = (msg: string) => {
    setNotice({ ok: msg })
    setRefresh((r) => r + 1)
    load()
  }

  if (lead === undefined) return <div className="empty">Loading…</div>
  if (!lead)
    return (
      <Empty>
        This lead isn’t available. <Link to="/leads">Back to leads</Link>
      </Empty>
    )

  const funnel = refs.funnels.find((f) => f.id === lead.funnel_id)
  const stage = funnel?.funnel_stages.find((s) => s.id === lead.stage_id)
  const name = fullName(lead)
  const canEdit = can('leads', 'edit')
  const canFollow = canEdit || can('follow_ups', 'add')
  const canBook = can('bookings', 'add')
  const bizRow = businesses.find((b) => b.id === lead.business_id)
  const biz = bizRow?.name
  const subName = bizRow?.subs.find((x) => x.id === lead.sub_business_id)?.name
  const nextBooking = (bookings ?? [])
    .filter((b) => b.status !== 'cancelled' && b.booking_date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => (a.booking_date + a.start_time).localeCompare(b.booking_date + b.start_time))[0]
  const fu = followUp(lead.next_follow_up_at)
  const temp = tempOf(lead.temperature)
  const sourceName = refs.sources.find((s) => s.id === lead.source_id)?.name
  const owner = members.find((m) => m.id === lead.owner_id)?.name

  const vars = {
    first_name: lead.first_name,
    name,
    purpose: lead.purpose ?? nextBooking?.purpose,
    required_on: lead.required_on ? fmtDay(lead.required_on) : null,
    business: biz,
    booking_date: nextBooking ? fmtDay(nextBooking.booking_date) : null,
    booking_time: nextBooking ? slotText(nextBooking).split(' · ')[1] : null,
  }

  const info: [string, React.ReactNode][] = [
    ['Phone', lead.phone],
    ['WhatsApp', lead.whatsapp || '—'],
    ['Email', lead.email || '—'],
    ['City', lead.city || '—'],
    ['Purpose', lead.purpose || '—'],
    ['Required on', lead.required_on ? `${fmtDay(lead.required_on)}${lead.required_hours ? ` · ${lead.required_hours} h` : ''}` : '—'],
    ['Source', sourceName ?? '—'],
    ['Referred by', lead.referred_by || '—'],
    ['Funnel', funnel ? `${funnel.name} → ${stage?.name ?? '—'}` : 'No funnel'],
    ['Owner', owner ?? 'Unassigned'],
    ['Temperature', temp ? <span className={`badge ${temp.tone}`}>{temp.label}</span> : '—'],
    ['Estimated amount', money(lead.estimated_amount)],
    ['Next follow-up', <span className={cn(fu.state === 'overdue' && 'text-danger')}>{fu.text}</span>],
    ['Tags', lead.tags.length ? lead.tags.join(', ') : '—'],
    ['Received', `${new Date(lead.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ${ago(lead.created_at)}`],
    ['Business', biz ? (subName ? `${biz} · ${subName}` : biz) : '—'],
  ]

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'details', label: 'Details' },
    { id: 'followups', label: 'Follow-ups' },
    ...(can('bookings', 'view') ? [{ id: 'bookings' as Tab, label: 'Bookings', count: (bookings ?? []).filter((b) => b.status !== 'cancelled').length }] : []),
  ]

  return (
    <>
      <div className="row page-top" style={{ gap: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} /> Back
        </button>
      </div>
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      <section className="card card-pad rec-head">
        <div className="rec-avatar">{lead.first_name.slice(0, 1).toUpperCase()}</div>
        <div className="rec-main">
          <div className="row" style={{ gap: 8 }}>
            <h2>{name}</h2>
            {stage && (
              <span className="stage-pill" style={{ ['--c' as string]: stage.color }}>
                {stage.name}
              </span>
            )}
            {client && (
              <span className="badge badge-success">
                <Star size={12} /> Client
              </span>
            )}
          </div>
          <div className="muted small">
            {lead.phone}
            {sourceName ? ` · ${sourceName}` : ''}
            {lead.purpose ? ` · ${lead.purpose}` : ''} · received {ago(lead.created_at)}
          </div>
        </div>
        <div className="row rec-actions">
          <button type="button" className="btn btn-outline" onClick={() => setWa(true)}>
            <MessageCircle size={15} /> WhatsApp
          </button>
          {canFollow && (
            <button type="button" className="btn btn-outline" onClick={() => setTab('followups')}>
              <PhoneCall size={15} /> Log call
            </button>
          )}
          {canEdit && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
              <Pencil size={15} /> Edit
            </button>
          )}
        </div>
      </section>

      <div className="tabs rec-tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={cn('tab', tab === t.id && 'is-active')} onClick={() => setTab(t.id)}>
            {t.label}
            {t.count ? <span className="muted small"> {t.count}</span> : null}
          </button>
        ))}
      </div>

      <section className="card card-pad">
        {tab === 'details' && (
          <div className="stack">
            <dl className="info-grid">
              {info.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {lead.notes && (
              <div>
                <span className="field-label">Notes</span>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{lead.notes}</p>
              </div>
            )}
            <LeadOrigin lead={lead} />
            <div>
              <span className="field-label">Activity</span>
              <ActivityLog leadId={lead.id} stageName={stageName} members={members} canNote={canFollow} refreshKey={refresh} />
            </div>
          </div>
        )}
        {tab === 'followups' && (
          <FollowUpsTab leadId={lead.id} members={members} canEdit={canFollow} onWhatsApp={() => setWa(true)} onChanged={done} refreshKey={refresh} />
        )}
        {tab === 'bookings' && <BookingsTab bookings={bookings} canAdd={canBook} onAdd={() => setBk({ booking: null })} onOpen={(b) => setBk({ booking: b })} />}
      </section>

      {editing && (
        <LeadDrawer
          lead={lead}
          funnels={refs.funnels}
          sources={refs.sources}
          lostReasons={lostReasons}
          members={members}
          defaultFunnelId={lead.funnel_id}
          onClose={() => setEditing(false)}
          onSaved={(msg) => {
            setEditing(false)
            done(msg)
          }}
        />
      )}
      {wa && (
        <WhatsAppModal
          lead={{ id: lead.id, name, phone: lead.phone, whatsapp: lead.whatsapp, subtitle: [lead.purpose, vars.required_on].filter(Boolean).join(' · ') }}
          vars={vars}
          onClose={() => setWa(false)}
          onSent={(msg) => {
            setWa(false)
            done(msg)
          }}
        />
      )}
      {bk && (
        <BookingDrawer
          key={bk.booking?.id ?? 'new'}
          booking={bk.booking}
          lead={{ id: lead.id, name, phone: lead.phone, purpose: lead.purpose, business_id: lead.business_id, sub_business_id: lead.sub_business_id }}
          refs={refs}
          onClose={() => setBk(null)}
          onSaved={(msg) => {
            setBk(null)
            done(msg)
          }}
        />
      )}
    </>
  )
}
