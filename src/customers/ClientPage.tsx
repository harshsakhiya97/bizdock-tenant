import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, CalendarPlus, MessageCircle, Pencil, PhoneCall } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { createBookingInvoice, listBookings } from '@/bookings/api'
import { BookingDrawer } from '@/bookings/BookingDrawer'
import { BookingsTab, InvoicesTab, slotText } from '@/bookings/BookingsTab'
import { FollowUpsTab } from '@/bookings/FollowUpsTab'
import { useBookingRefs } from '@/bookings/useBookingRefs'
import { WhatsAppModal } from '@/bookings/WhatsAppModal'
import type { BookingRow } from '@/bookings/types'
import { RecordPaymentModal } from '@/collections/RecordPaymentModal'
import { Empty } from '@/components/ui'
import { ActivityLog } from '@/leads/ActivityLog'
import { getLead } from '@/leads/api'
import { fmtDay } from '@/leads/LeadPage'
import { money } from '@/leads/labels'
import type { LeadRow } from '@/leads/types'
import { cn } from '@/lib/cn'
import { ago } from '@/team/time'
import { useTenant } from '@/tenant/useTenant'
import { CustomerDrawer } from './CustomerDrawer'
import { NewSaleDrawer, type SalePrefill } from './NewSaleDrawer'
import { useSalesData } from './useSalesData'

type Tab = 'details' | 'followups' | 'bookings' | 'invoices'

/** One client (booked at least once, or bought): details, follow-ups, bookings and invoices. */
export function ClientPage() {
  const { id = '' } = useParams()
  const tenant = useTenant()
  const navigate = useNavigate()
  const { can, businesses } = useAuth()
  const data = useSalesData()
  const refs = useBookingRefs()
  const [lead, setLead] = useState<LeadRow | null>(null)
  const [bookings, setBookings] = useState<BookingRow[] | null>(null)
  const [tab, setTab] = useState<Tab>('details')
  const [editing, setEditing] = useState(false)
  const [sale, setSale] = useState<SalePrefill | null>(null)
  const [collect, setCollect] = useState<string | null>(null)
  const [wa, setWa] = useState(false)
  const [bk, setBk] = useState<{ booking: BookingRow | null } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  const client = data.allCustomers.find((c) => c.id === id)
  const leadId = client?.lead_id ?? null

  const loadBookings = useCallback(() => {
    if (!client) return
    listBookings(tenant.id, { customerId: client.id, leadId: client.lead_id ?? undefined })
      .then(setBookings)
      .catch(() => setBookings([]))
  }, [tenant.id, client])
  useEffect(loadBookings, [loadBookings])
  useEffect(() => {
    if (leadId) void getLead(leadId).then(setLead)
  }, [leadId, refresh])

  const stageName = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of refs.funnels) for (const s of f.funnel_stages) m.set(s.id, s.name)
    return m
  }, [refs.funnels])

  const done = (msg: string) => {
    setNotice({ ok: msg })
    setRefresh((r) => r + 1)
    loadBookings()
    data.load()
  }

  if (!data.customers) return <div className="empty">Loading…</div>
  if (!client)
    return (
      <Empty>
        This client isn’t available. <Link to="/customers">Back to clients</Link>
      </Empty>
    )

  const canBook = can('bookings', 'add')
  const canFollow = can('leads', 'edit') || can('follow_ups', 'add')
  const st = data.stageOf(client.stage_id)
  const biz = businesses.find((b) => b.id === client.business_id)?.name
  const live = (bookings ?? []).filter((b) => b.status !== 'cancelled')
  const total = live.reduce((s, b) => s + Number(b.total_amount), 0)
  const paid = live.reduce((s, b) => s + Number(b.paid_amount), 0)
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = live.filter((b) => b.booking_date >= today).sort((a, b) => (a.booking_date + a.start_time).localeCompare(b.booking_date + b.start_time))
  const last = live.filter((b) => b.booking_date < today).sort((a, b) => b.booking_date.localeCompare(a.booking_date))[0]
  const sales = (data.salesByCustomer.get(client.id) ?? []).filter((s) => s.status === 'active')
  const first = client.full_name.split(/\s+/)[0]

  const info: [string, React.ReactNode][] = [
    ['Phone', client.phone || '—'],
    ['Email', client.email || '—'],
    ['City', client.city || '—'],
    ['Business', biz ?? '—'],
    ['Stage', st ? <span className="stage-pill" style={{ ['--c' as string]: st.color }}>{st.name}</span> : '—'],
    ['Owner', data.memberName(client.owner_id) ?? 'Unassigned'],
    ['Client since', fmtDay(client.created_at)],
    ['Purpose', lead?.purpose || upcoming[0]?.purpose || last?.purpose || '—'],
    ['Bookings', `${live.length}`],
    ['Booked value', money(total)],
    ['Paid', money(paid)],
    ['Balance', <span className={cn(total - paid > 0 && 'text-danger')}>{money(Math.max(0, total - paid))}</span>],
    ['Next booking', upcoming[0] ? slotText(upcoming[0]) : '—'],
    ['Last booking', last ? slotText(last) : '—'],
  ]
  const vars = {
    first_name: first,
    name: client.full_name,
    purpose: lead?.purpose ?? upcoming[0]?.purpose,
    required_on: lead?.required_on ? fmtDay(lead.required_on) : null,
    business: biz,
    booking_date: upcoming[0] ? fmtDay(upcoming[0].booking_date) : null,
    booking_time: upcoming[0] ? slotText(upcoming[0]).split(' · ')[1] : null,
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'details', label: 'Details' },
    { id: 'followups', label: 'Follow-ups' },
    { id: 'bookings', label: 'Bookings', count: live.length },
    { id: 'invoices', label: 'Invoices', count: live.filter((b) => b.invoice_no).length },
  ]

  return (
    <>
      <div className="row page-top">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} /> Back
        </button>
      </div>
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      {notice.ok && <div className="alert alert-info">{notice.ok}</div>}

      <section className="card card-pad rec-head">
        <div className="rec-avatar is-client">{client.full_name.slice(0, 1).toUpperCase()}</div>
        <div className="rec-main">
          <div className="row" style={{ gap: 8 }}>
            <h2>{client.full_name}</h2>
            {st && (
              <span className="stage-pill" style={{ ['--c' as string]: st.color }}>
                {st.name}
              </span>
            )}
          </div>
          <div className="muted small">
            {client.phone ?? 'No phone'} · {live.length} booking{live.length === 1 ? '' : 's'} · {money(total)} · client since {ago(client.created_at)}
            {leadId && (
              <>
                {' · '}
                <Link to={`/leads/${leadId}`}>lead</Link>
              </>
            )}
          </div>
        </div>
        <div className="row rec-actions">
          {leadId && client.phone && (
            <button type="button" className="btn btn-outline" onClick={() => setWa(true)}>
              <MessageCircle size={15} /> WhatsApp
            </button>
          )}
          {leadId && canFollow && (
            <button type="button" className="btn btn-outline" onClick={() => setTab('followups')}>
              <PhoneCall size={15} /> Log call
            </button>
          )}
          {canBook && (
            <button type="button" className="btn btn-outline" onClick={() => setBk({ booking: null })}>
              <CalendarPlus size={15} /> Book
            </button>
          )}
          {can('customers', 'edit') && (
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
            {sales.length > 0 && (
              <div>
                <span className="field-label">Products bought</span>
                {sales.map((s) => (
                  <div key={s.id} className="small">
                    {data.productById.get(s.product_id)?.name ?? 'Product'} · {money(s.total_amount)} · {fmtDay(s.sale_date)}
                  </div>
                ))}
              </div>
            )}
            {client.notes && (
              <div>
                <span className="field-label">Notes</span>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{client.notes}</p>
              </div>
            )}
            {leadId && (
              <div>
                <span className="field-label">Activity</span>
                <ActivityLog leadId={leadId} stageName={stageName} members={data.members} canNote={canFollow} refreshKey={refresh} />
              </div>
            )}
          </div>
        )}
        {tab === 'followups' &&
          (leadId ? (
            <FollowUpsTab leadId={leadId} members={data.members} canEdit={canFollow} onWhatsApp={() => setWa(true)} onChanged={done} refreshKey={refresh} />
          ) : (
            <div className="muted small">This client was added directly, without a lead, so there are no follow-ups to show.</div>
          ))}
        {tab === 'bookings' && <BookingsTab bookings={bookings} canAdd={canBook} onAdd={() => setBk({ booking: null })} onOpen={(b) => setBk({ booking: b })} />}
        {tab === 'invoices' && (
          <InvoicesTab
            bookings={bookings}
            refs={refs}
            canCreate={can('bookings', 'edit')}
            onCreate={(b) =>
              void createBookingInvoice(b.id, b.billing_company_id).then(
                (no) => done(`Invoice ${no} created.`),
                (e: Error) => setNotice({ error: e.message }),
              )
            }
          />
        )}
      </section>

      {editing && !sale && (
        <CustomerDrawer
          customer={client}
          data={data}
          onClose={() => setEditing(false)}
          onNewSale={() => setSale({ business_id: client.business_id, customer_id: client.id, customer_name: client.full_name })}
          onCollect={setCollect}
          onSaved={(msg, close) => {
            if (close) setEditing(false)
            done(msg)
          }}
        />
      )}
      {sale && (
        <NewSaleDrawer
          data={data}
          prefill={sale}
          onClose={() => setSale(null)}
          onSaved={(msg) => {
            setSale(null)
            done(msg)
          }}
        />
      )}
      {collect && (
        <RecordPaymentModal
          data={data}
          saleId={collect}
          onClose={() => setCollect(null)}
          onSaved={(msg) => {
            setCollect(null)
            done(msg)
          }}
        />
      )}
      {wa && leadId && (
        <WhatsAppModal
          lead={{ id: leadId, name: client.full_name, phone: client.phone ?? '', whatsapp: lead?.whatsapp, subtitle: vars.purpose ?? undefined }}
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
          lead={{ id: leadId, customer_id: client.id, name: client.full_name, phone: client.phone ?? '', purpose: lead?.purpose ?? null, business_id: client.business_id }}
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
