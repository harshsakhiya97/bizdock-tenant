import { orderNoun } from '@/business/activeType'
import { BT, isOrderType } from '@/auth/auth-context'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, CalendarClock, ChevronDown, ClipboardList, GraduationCap, Handshake, History, Package, Route, UserRound, Video, Pencil, Receipt, Star, Trash2, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { listBookings } from '@/bookings/api'
import { listInvoices, withInvoicePayments } from '@/invoices/api'
import { BookingDrawer } from '@/bookings/BookingDrawer'
import { BookingsTab, slotText } from '@/bookings/BookingsTab'
import { FollowUpsTab } from '@/bookings/FollowUpsTab'
import { useBookingRefs } from '@/bookings/useBookingRefs'
import { WhatsAppModal } from '@/bookings/WhatsAppModal'
import type { BookingRow } from '@/bookings/types'
import { ConfirmModal, Empty } from '@/components/ui'
import { cn } from '@/lib/cn'
import { ago } from '@/team/time'
import { useTenant } from '@/tenant/useTenant'
import { ActivityLog } from './ActivityLog'
import { CategorySelect } from './CategorySelect'
import { LeadDescription } from './LeadDescription'
import { deleteLeads, getLead, listLostReasons, listMemberOptions } from './api'
import { LeadDrawer } from './LeadDrawer'
import { ExtraFields, extraOf, LeadOrigin } from './LeadOrigin'
import { LeadGlance } from './LeadGlance'
import { LeadInsightCard } from './LeadInsightCard'
import { Modal } from '@/components/Modal'
import { BillingCard } from '@/invoices/Billing'
import { fullName, money } from './labels'
import type { LeadRow, MemberOption, Option } from './types'
import { Flash } from '@/components/Flash'
import { listMeetings } from '@/meetings/api'
import { MeetingDrawer } from '@/meetings/MeetingDrawer'
import { MeetingsTab } from '@/meetings/MeetingsTab'
import type { MeetingRow } from '@/meetings/types'
import { makesCustomer, podcastCheck } from './customers'
import { listPurchases, type Purchase } from '@/webinars/api'
import { LeadWebinarsTab, PurchasesTab } from '@/webinars/LeadWebinarTabs'
import { PurchaseDrawer } from '@/webinars/PurchaseDrawer'
import { LeadPaymentsTab, listLeadPayments, type LeadPay } from '@/payments/LeadPaymentsTab'
import { LeadInvoices, countLeadInvoices } from '@/invoices/LeadInvoices'
import { db } from '@/lib/supabase'
import { CallFromAiDrawer, LeadAiCalls } from '@/aicalls/LeadAiCalls'
import { listAiCalls } from '@/aicalls/api'
import { useAiNames } from '@/ai/insights'
import { JourneyTab, ProfileTab } from './ParticipantTabs'

type Tab = 'details' | 'followups' | 'meetings' | 'bookings' | 'webinars' | 'purchases' | 'payments' | 'ai_calls' | 'profile' | 'journey'

export const fmtDay = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/** One lead: details, follow-ups (calls / WhatsApp) and bookings. */
export function LeadPage() {
  const { id = '' } = useParams()
  const tenant = useTenant()
  const navigate = useNavigate()
  const { can, businesses, membership } = useAuth()
  const refs = useBookingRefs()
  const [lead, setLead] = useState<LeadRow | null | undefined>(undefined)
  // AI Insights: hide the lead's name too
  useAiNames([lead ? fullName(lead) : null])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [lostReasons, setLostReasons] = useState<Option[]>([])
  const [bookings, setBookings] = useState<BookingRow[] | null>(null)
  // ?tab=followups / bookings opens that tab (e.g. from the dashboard)
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    // ?tab=ai_calls: AI Calls is inside Follow-ups now
    if (t === 'ai_calls') return 'followups'
    return t === 'followups' || t === 'bookings' || t === 'meetings' || t === 'webinars' || t === 'purchases' || t === 'payments' || t === 'profile' || t === 'journey' ? t : 'details'
  })
  const [editing, setEditing] = useState(false)
  const [bk, setBk] = useState<{ booking: BookingRow | null; copy?: BookingRow } | null>(null)
  const [meetings, setMeetings] = useState<MeetingRow[] | null>(null)
  const [mt, setMt] = useState<{ meeting: MeetingRow | null } | null>(null)
  const [purchases, setPurchases] = useState<Purchase[] | null>(null)
  const [pu, setPu] = useState<{ purchase: Purchase | null } | null>(null)
  // Razorpay payments with this lead's phone / email (Role access → Payments → view)
  const [payments, setPayments] = useState<LeadPay[] | null>(null)
  const [payError, setPayError] = useState<string | null>(null)
  const [paySub, setPaySub] = useState<'invoice' | 'direct'>('invoice')
  // tab counts: calls (pending + done, as the Calls list) and invoices
  const [fuCount, setFuCount] = useState<number | null>(null)
  const [invCount, setInvCount] = useState<number | null>(null)
  const [removing, setRemoving] = useState(false)
  // the activity timeline, in a pop-up (header → History)
  const [history, setHistory] = useState(false)
  const [wa, setWa] = useState(false)
  // AI Calling: Call from AI (the drawer) and the AI Calls tab's count
  const [aiCall, setAiCall] = useState(false)
  const [aiCount, setAiCount] = useState<number | null>(null)
  // bump: Follow-ups opens on its AI Calls sub-tab (?tab=ai_calls, or a call just placed)
  const [openAi, setOpenAi] = useState(() => (new URLSearchParams(window.location.search).get('tab') === 'ai_calls' ? 1 : 0))
  const [refresh, setRefresh] = useState(0)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  const load = useCallback(() => {
    listAiCalls(tenant.id, { leadId: id }).then((c) => setAiCount(c.length), () => setAiCount(null))
    getLead(id)
      .then(setLead)
      .catch((e: Error) => {
        setLead(null)
        setNotice({ error: e.message })
      })
    // payments are on invoices: put them on each invoice's first booking for the totals here
    Promise.all([listBookings(tenant.id, { leadId: id }), listInvoices(tenant.id, { leadId: id }).catch(() => [])])
      .then(([b, inv]) => setBookings(withInvoicePayments(b, inv)))
      .catch(() => setBookings([]))
    listPurchases({ leadId: id })
      .then(setPurchases)
      .catch(() => setPurchases([]))
    listMeetings(tenant.id, { leadId: id })
      .then(setMeetings)
      .catch(() => setMeetings([]))
  }, [id, tenant.id, can])
  useEffect(load, [load])
  const canPay = can('payments', 'view')
  // Payments tab: Invoice (with Bookings) and Direct payments (Razorpay)
  const canInv = can('bookings', 'view')
  useEffect(() => {
    if (!id) return
    db()
      .from('follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', id)
      .eq('mode', 'call')
      .in('status', ['pending', 'done'])
      .then(({ count }) => setFuCount(count ?? 0))
    if (canInv) countLeadInvoices(tenant.id, id).then(setInvCount, () => setInvCount(null))
  }, [id, tenant.id, canInv, refresh])
  const directCount = (payments ?? []).filter((p) => p.status === 'captured' || p.status === 'refunded').length
  const payPhone = lead?.phone ?? null
  const payEmail = lead?.email ?? null
  const hasLead = !!lead
  useEffect(() => {
    if (!canPay || !hasLead) return
    setPayError(null)
    listLeadPayments(tenant.id, { phone: payPhone, email: payEmail })
      .then(setPayments)
      .catch((e: Error) => {
        setPayments([])
        setPayError(e.message)
      })
  }, [canPay, hasLead, tenant.id, payPhone, payEmail])
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
  // Paid Podcast lead: Meetings and Podcasts tabs instead of Bookings
  const leadType = lead.sub_business_id ? bizRow?.subs.find((x) => x.id === lead.sub_business_id)?.type : !bizRow?.subs.length ? bizRow?.type : null
  const isPodcast = leadType === BT.PAID_PODCAST
  // Webinar lead: Webinars and Purchases tabs
  const isWebinar = leadType === BT.WEBINAR
  // Default lead: Services (service bookings, each with its invoice) instead of the calendar bookings
  const isDefault = isOrderType(leadType)
  // a confirmed / completed booking makes the lead a customer (Paid Podcast: any payment received)
  const podcastBk = podcastCheck(businesses)
  const won = (bookings ?? []).filter((b) => makesCustomer(b, podcastBk))
  // the money cards open the records: Payments → Invoice (else the bookings tab)
  const toMoneyTab = () => {
    if (canInv) {
      setPaySub('invoice')
      setTab('payments')
    } else setTab('bookings')
  }
  // …or a purchase with a paid part
  const bought = (purchases ?? []).filter((p) => p.status === 'active' && Number(p.paid_amount) > 0)
  const isCustomer = won.length > 0 || bought.length > 0
  const billed = won.reduce((n, b) => n + Number(b.total_amount), 0) + bought.reduce((n, p) => n + Number(p.total_amount), 0)
  const received = won.reduce((n, b) => n + Number(b.paid_amount), 0) + bought.reduce((n, p) => n + Number(p.paid_amount), 0)
  const today = new Date().toISOString().slice(0, 10)
  const overdue = [...won.flatMap((b) => b.booking_payments), ...bought.flatMap((p) => p.purchase_payments)].filter((p) => p.status !== 'paid' && p.due_on && p.due_on < today)
  const sourceName = refs.sources.find((s) => s.id === lead.source_id)?.name
  const ownerName = members.find((m) => m.id === lead.owner_id)?.name ?? null

  const vars = {
    first_name: lead.first_name,
    name,
    purpose: lead.purpose ?? nextBooking?.purpose,
    required_on: lead.required_on ? fmtDay(lead.required_on) : null,
    business: biz,
    booking_date: nextBooking ? fmtDay(nextBooking.booking_date) : null,
    booking_time: nextBooking ? slotText(nextBooking).split(' · ')[1] : null,
  }

  // same fields as Add / Edit lead
  const info: [string, React.ReactNode][] = [
    ['Phone', lead.phone],
    ['Email', lead.email || '—'],
    ['City', lead.city || '—'],
    ['Source', sourceName ?? '—'],
    ['Purpose', lead.purpose || '—'],
    ...(lead.webinar_category ? ([['Webinar category', lead.webinar_category]] as [string, React.ReactNode][]) : []),
    [
      'Tags',
      lead.tags.length ? (
        <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
          {lead.tags.map((t) => (
            <span key={t} className="tag-chip">
              {t}
            </span>
          ))}
        </span>
      ) : (
        '—'
      ),
    ],
    ['Business', biz ? (subName ? `${biz} · ${subName}` : biz) : '—'],
    ['Owner', ownerName ?? '—'],
  ]
  // Details → More fields (the less used ones and the form's own fields)
  const more: [string, React.ReactNode][] = [
    ...(lead.estimated_amount ? ([['Estimated amount', money(lead.estimated_amount)]] as [string, React.ReactNode][]) : []),
    ...(lead.required_on ? ([['Required on', fmtDay(lead.required_on)]] as [string, React.ReactNode][]) : []),
    ...(lead.referred_by ? ([['Referred by', lead.referred_by]] as [string, React.ReactNode][]) : []),
    ...(lead.whatsapp && lead.whatsapp !== lead.phone ? ([['WhatsApp', lead.whatsapp]] as [string, React.ReactNode][]) : []),
  ]
  const hasMore = more.length > 0 || extraOf(lead).length > 0

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'details', label: 'Details' },
    { id: 'followups', label: 'Follow-ups', count: fuCount ?? undefined },
    { id: 'meetings' as Tab, label: 'Meetings', count: (meetings ?? []).length },
    ...(isWebinar
      ? [
          { id: 'webinars' as Tab, label: 'Webinars' },
          { id: 'purchases' as Tab, label: 'Purchases', count: (purchases ?? []).filter((p) => p.status === 'active').length },
          // course workspaces (opt-in): the participant's profile and journey
          ...(tenant.extra_pages?.includes('participant-profile')
            ? [
                { id: 'profile' as Tab, label: 'Profile' },
                { id: 'journey' as Tab, label: 'Journey' },
              ]
            : []),
        ]
      : can('bookings', 'view')
        ? [{ id: 'bookings' as Tab, label: isPodcast ? 'Podcasts' : isDefault ? orderNoun(leadType).many : 'Bookings', count: (bookings ?? []).filter((b) => b.status !== 'cancelled').length }]
        : []),
    ...(canPay || canInv ? [{ id: 'payments' as Tab, label: 'Payments', count: (canInv ? (invCount ?? 0) : 0) + (canPay ? directCount : 0) }] : []),
  ]

  // each tab's icon
  const TAB_ICON: Partial<Record<Tab, typeof Star>> = {
    details: ClipboardList,
    followups: CalendarClock,
    meetings: Handshake,
    webinars: Video,
    purchases: GraduationCap,
    profile: UserRound,
    journey: Route,
    bookings: Package,
    payments: Wallet,
  }

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
            <CategorySelect
              tenantId={tenant.id}
              memberId={membership?.id}
              leadId={lead.id}
              value={lead.temperature}
              canEdit={canEdit}
              onChanged={(v) => {
                setLead({ ...lead, temperature: v })
                setRefresh((r) => r + 1)
              }}
            />
            {isCustomer && (
              <span className="badge badge-success">
                <Star size={12} /> Customer
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
          <button type="button" className="btn btn-outline btn-icon" onClick={() => setHistory(true)} title="History (activity)" aria-label="History">
            <History size={16} />
          </button>
          {can('leads', 'delete') && (
            <button type="button" className="btn btn-outline danger-text" onClick={() => setRemoving(true)}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          {canEdit && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
              <Pencil size={15} /> Edit
            </button>
          )}
        </div>
      </section>


      <div className="rec-tabs" role="tablist">
        {TABS.map((t) => {
          const Icon = TAB_ICON[t.id]
          return (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={cn('rec-tab', tab === t.id && 'is-active')} onClick={() => setTab(t.id)}>
              {Icon && <Icon size={16} />}
              {t.label}
              {t.count ? <span className="rec-tab-count">{t.count}</span> : null}
            </button>
          )
        })}
      </div>

      <section className="card card-pad">
        {tab === 'details' && (
          <div className="stack">
            <LeadInsightCard leadId={lead.id} refreshKey={refresh} />
            <div className="lead-split">
            <div className="stack lead-main">
              <dl className="info-grid">
                {info.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <span className="field-label">Description</span>
                <LeadDescription key={lead.id} leadId={lead.id} value={lead.notes} canEdit={canEdit} onSaved={(v) => setLead({ ...lead, notes: v })} />
              </div>
              <div className="acc-list">
                <Acc title="Billing details">
                  <BillingCard bare lead={lead} canEdit={canEdit} onSaved={(b) => setLead({ ...lead, bill_company: b.company || null, bill_address: b.address || null, bill_state: b.state || null, bill_state_code: b.state_code || null, bill_gstin: b.gstin || null })} />
                </Acc>
                <Acc title="Source & form submissions">
                  <LeadOrigin lead={lead} part="source" />
                </Acc>
                {hasMore && (
                  <Acc title="More fields">
                    <div className="stack">
                      {more.length > 0 && (
                        <dl className="info-grid">
                          {more.map(([k, v]) => (
                            <div key={k}>
                              <dt>{k}</dt>
                              <dd>{v}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      <ExtraFields lead={lead} />
                    </div>
                  </Acc>
                )}
              </div>
            </div>
            <aside className="stack lead-side">
              <LeadGlance
                leadId={lead.id}
                temperature={lead.temperature}
                createdAt={lead.created_at}
                owner={ownerName}
                billing={{
                  billed,
                  received,
                  overdue: overdue.reduce((n, p) => n + Number(p.amount), 0),
                  invoices: canInv ? invCount : null,
                  company: lead.bill_company ?? null,
                  gstin: lead.bill_gstin ?? null,
                }}
                onBilling={canInv || canPay ? toMoneyTab : undefined}
                refreshKey={refresh}
              />
            </aside>
            </div>
          </div>
        )}
        {tab === 'followups' && (
          <FollowUpsTab
            leadId={lead.id}
            members={members}
            canEdit={canFollow}
            onWhatsApp={() => setWa(true)}
            onChanged={done}
            refreshKey={refresh}
            ai={can('ai_calling', 'view') || aiCount ? { count: aiCount, onCall: can('ai_calling', 'view') ? () => setAiCall(true) : undefined, node: <LeadAiCalls leadId={lead.id} members={members} refreshKey={refresh} onCount={setAiCount} /> } : undefined}
            openAi={openAi}
          />
        )}
        {tab === 'meetings' && (
          <MeetingsTab meetings={meetings} members={members} canAdd onAdd={() => setMt({ meeting: null })} onOpen={(m) => setMt({ meeting: m })} />
        )}
        {tab === 'webinars' && isWebinar && <LeadWebinarsTab leadId={lead.id} />}
        {tab === 'payments' && (canPay || canInv) && (
          <div className="stack">
            {isCustomer && (
              <div className="flow-cards pay-cards">
                {(
                  [
                    isWebinar
                      ? [String(bought.length), 'Purchases', `Last on ${fmtDay(bought.map((p) => p.purchase_date).sort().at(-1) ?? null)}`, '#6366f1', () => setTab('purchases')]
                      : [String(won.length), isPodcast ? 'Podcasts' : 'Bookings', `Last on ${fmtDay(won.map((b) => b.booking_date).sort().at(-1) ?? null)}`, '#6366f1', () => setTab('bookings')],
                    [money(billed), 'Revenue', 'Billed, with GST', '#0ea5e9', toMoneyTab],
                    [money(received), 'Received', billed ? `${Math.round((received / billed) * 100)}% of the billed amount` : 'Payments received', '#22c55e', toMoneyTab],
                    [
                      money(Math.max(0, billed - received)),
                      'Balance',
                      overdue.length ? `${money(overdue.reduce((n, p) => n + Number(p.amount), 0))} overdue` : billed - received > 0 ? 'Still to be paid' : 'Nothing pending',
                      overdue.length ? '#ef4444' : '#f59e0b',
                      toMoneyTab,
                    ],
                  ] as [string, string, string, string, () => void][]
                ).map(([v, l, sub, c, go]) => (
                  <button key={l} type="button" className="flow-card" style={{ ['--c' as string]: c }} onClick={go}>
                    <b>{v}</b>
                    <span>{l}</span>
                    <small className="muted">{sub}</small>
                  </button>
                ))}
              </div>
            )}
            {canPay && canInv && (
              <div className="row-between">
                <div className="seg seg-sm" role="group" aria-label="Payments">
                  <button type="button" className={paySub === 'invoice' ? 'is-active' : undefined} onClick={() => setPaySub('invoice')}>
                    <Receipt size={14} /> Invoice <span className="muted small">{invCount ?? 0}</span>
                  </button>
                  <button type="button" className={paySub === 'direct' ? 'is-active' : undefined} onClick={() => setPaySub('direct')}>
                    <Wallet size={14} /> Direct Payments <span className="muted small">{payments ? directCount : 0}</span>
                  </button>
                </div>
              </div>
            )}
            {canInv && (!canPay || paySub === 'invoice') ? <LeadInvoices leadId={lead.id} refs={refs} onChanged={done} /> : <LeadPaymentsTab payments={payments} error={payError} />}
          </div>
        )}
        {tab === 'profile' && isWebinar && <ProfileTab key={lead.updated_at} lead={lead} canEdit={canEdit} onSaved={done} />}
        {tab === 'journey' && isWebinar && <JourneyTab lead={lead} purchases={purchases} />}
        {tab === 'purchases' && isWebinar && (
          <PurchasesTab purchases={purchases} canAdd={canEdit} onAdd={() => setPu({ purchase: null })} onOpen={(p) => setPu({ purchase: p })} onChanged={done} />
        )}
        {tab === 'bookings' && !isWebinar && (
          <BookingsTab
            bookings={bookings}
            podcast={isPodcast}
            service={isDefault}
            noun={orderNoun(leadType).one}
            canAdd={canBook}
            onAdd={() => setBk({ booking: null })}
            onOpen={(b) => setBk({ booking: b })}
            onRepeat={(b) => setBk({ booking: null, copy: b })}
          />
        )}
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
      {aiCall && (
        <CallFromAiDrawer
          lead={{ id: lead.id, name, phone: lead.phone }}
          onClose={() => setAiCall(false)}
          onPlaced={(c) => {
            setAiCall(false)
            setNotice({ ok: `Calling ${c.to_name || c.to_phone} now: the result shows in AI Calls.` })
            setTab('followups')
            setOpenAi((n) => n + 1)
            setRefresh((r) => r + 1)
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
      {mt && (
        <MeetingDrawer
          key={mt.meeting?.id ?? 'new'}
          meeting={mt.meeting}
          lead={lead}
          leads={[lead]}
          members={members}
          onClose={() => setMt(null)}
          onSaved={(msg) => {
            setMt(null)
            done(msg)
          }}
          onBook={
            isPodcast
              ? () => {
                  setMt(null)
                  setTab('bookings')
                  setBk({ booking: null })
                }
              : undefined
          }
        />
      )}
      {pu && (
        <PurchaseDrawer
          key={pu.purchase?.id ?? 'new'}
          purchase={pu.purchase}
          lead={{ id: lead.id, name, business_id: lead.business_id }}
          refs={refs}
          onClose={() => setPu(null)}
          onSaved={(msg) => {
            setPu(null)
            done(msg)
          }}
        />
      )}
      {bk && (
        <BookingDrawer
          key={bk.booking?.id ?? bk.copy?.id ?? 'new'}
          booking={bk.booking}
          service={isDefault}
          noun={orderNoun(leadType).one}
          copyFrom={bk.copy ?? null}
          lead={{ id: lead.id, name, phone: lead.phone, purpose: lead.purpose, business_id: lead.business_id, sub_business_id: lead.sub_business_id }}
          refs={refs}
          onClose={() => setBk(null)}
          onSaved={(msg) => {
            setBk(null)
            done(msg)
          }}
        />
      )}
      <Modal open={history} onClose={() => setHistory(false)} title="History" width={720}>
        <ActivityLog leadId={lead.id} stageName={stageName} members={members} canNote={false} refreshKey={refresh} />
      </Modal>
      <ConfirmModal
        open={removing}
        danger
        icon={Trash2}
        title={`Delete ${name}?`}
        message="The lead is removed for good, with its follow-ups, activity and form submissions, and its bookings / orders / brand deals with those invoices and payments. This can’t be undone."
        confirmLabel="Delete"
        onCancel={() => setRemoving(false)}
        onConfirm={async () => {
          setRemoving(false)
          try {
            await deleteLeads([lead.id])
            navigate(isCustomer ? '/customers' : '/leads', { replace: true })
          } catch (e) {
            setNotice({ error: (e as Error).message })
          }
        }}
      />
    </>
  )
}

/** a closed-by-default section of the Details tab */
function Acc({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="acc">
      <summary>
        <span>{title}</span>
        <ChevronDown size={16} className="acc-chev" />
      </summary>
      <div className="acc-body">{children}</div>
    </details>
  )
}
