import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, BadgeIndianRupee, PackageCheck, Repeat, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Empty, PageHead, Paged, SearchInput, StatCard } from '@/components/ui'
import { Flash } from '@/components/Flash'
import { listMemberOptions } from '@/leads/api'
import { money } from '@/leads/labels'
import type { MemberOption } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { listBookings } from '@/bookings/api'
import { BookingDrawer } from '@/bookings/BookingDrawer'
import { invoiceHref } from '@/bookings/BookingsTab'
import { useBookingRefs } from '@/bookings/useBookingRefs'
import { ORDER_STATUS, partState, type BookingRow, type OrderStatus } from '@/bookings/types'

type PayState = 'paid' | 'part' | 'unpaid'
const PAY: Record<PayState, string> = { paid: 'Fully paid', part: 'Part paid', unpaid: 'Unpaid' }
const payState = (b: BookingRow): PayState => (Number(b.total_amount) - Number(b.paid_amount) <= 0.01 ? 'paid' : Number(b.paid_amount) > 0 ? 'part' : 'unpaid')
const day = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const services = (b: BookingRow) =>
  b.booking_items?.length
    ? [...b.booking_items]
        .sort((x, y) => x.sort_order - y.sort_order)
        .map((i) => i.name)
        .join(', ')
    : (b.purpose ?? '—')
/** the first part still to be paid */
const nextDue = (b: BookingRow) =>
  [...b.booking_payments].filter((p) => p.status !== 'paid').sort((x, y) => (x.due_on ?? '9999').localeCompare(y.due_on ?? '9999'))[0] ?? null

/** Orders (Default businesses): every order — ORD number, services, status, team member, invoice and payment parts. */
export function OrdersPage() {
  const tenant = useTenant()
  const { can } = useAuth()
  const { selected, sub, inScope } = useBusiness()
  const refs = useBookingRefs()
  const [rows, setRows] = useState<BookingRow[] | null>(null)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [f, setF] = useState({ q: '', status: '', pay: '', overdue: false, member: '', from: '', to: '' })
  const [open, setOpen] = useState<{ booking: BookingRow | null; copy?: BookingRow } | null>(null)

  const load = useCallback(() => {
    listBookings(tenant.id)
      .then((b) => setRows(b.filter((x) => x.order_no)))
      .catch((e: Error) => setError(e.message))
  }, [tenant.id])
  useEffect(load, [load])
  useEffect(() => {
    void listMemberOptions(tenant.id).then(setMembers)
  }, [tenant.id])
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? '—'

  const scoped = useMemo(() => (rows ?? []).filter((b) => inScope(b.business_id, b.sub_business_id)), [rows, inScope])
  const visible = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    return scoped
      .filter((b) => !f.status || b.order_status === f.status)
      .filter((b) => !f.pay || payState(b) === f.pay)
      .filter((b) => !f.overdue || b.booking_payments.some((p) => partState(p) === 'overdue'))
      .filter((b) => !f.member || b.owner_id === f.member)
      .filter((b) => !f.from || b.booking_date >= f.from)
      .filter((b) => !f.to || b.booking_date <= f.to)
      .filter((b) => !q || `${b.order_no} ${b.invoice_no ?? ''} ${b.client_name} ${b.phone ?? ''} ${services(b)}`.toLowerCase().includes(q))
      .sort((a, b) => b.booking_date.localeCompare(a.booking_date) || (b.order_no ?? '').localeCompare(a.order_no ?? ''))
  }, [scoped, f])

  // this month: orders dated this month (not cancelled), what they're worth, collected and still due
  const month = new Date().toISOString().slice(0, 7)
  const thisMonth = scoped.filter((b) => b.order_status !== 'cancelled' && b.booking_date.startsWith(month))
  const value = thisMonth.reduce((n, b) => n + Number(b.total_amount), 0)
  const collected = thisMonth.reduce((n, b) => n + Number(b.paid_amount), 0)
  const live = scoped.filter((b) => b.order_status !== 'cancelled')
  const due = live.reduce((n, b) => n + Math.max(0, Number(b.total_amount) - Number(b.paid_amount)), 0)
  const overdueParts = live.flatMap((b) => b.booking_payments).filter((p) => partState(p) === 'overdue')
  const filtered = f.q || f.status || f.pay || f.overdue || f.member || f.from || f.to

  return (
    <>
      <PageHead title="Orders" subtitle={`Every order: its services, status, invoice and payment parts${selected ? ` · ${selected.name}${sub ? ` · ${sub.name}` : ''}` : ''}. New orders are added from the customer’s page.`} />
      {error && <div className="alert alert-error">{error}</div>}
      <Flash msg={notice} dep={notice} />

      <div className="stat-grid">
        <StatCard icon={PackageCheck} tone="brand" value={thisMonth.length} label="Orders this month" />
        <StatCard icon={BadgeIndianRupee} tone="info" value={money(value)} label="Order value" hint="This month, with GST" />
        <StatCard icon={Wallet} tone="success" value={money(collected)} label="Collected" hint="On this month’s orders" />
        <StatCard icon={AlertTriangle} tone="danger" value={money(due)} label="Still due" hint={`All open orders · ${overdueParts.length} part${overdueParts.length === 1 ? '' : 's'} overdue`} />
      </div>

      <div className="panel">
        <div className="panel-filters">
          <SearchInput placeholder="Order, invoice, customer, phone or service" value={f.q} onChange={(v) => setF((x) => ({ ...x, q: v }))} width={260} />
          <select className="input input-sm filter-select" value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))} aria-label="Status">
            <option value="">Status</option>
            {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((k) => (
              <option key={k} value={k}>
                {ORDER_STATUS[k].label}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={f.pay} onChange={(e) => setF((x) => ({ ...x, pay: e.target.value }))} aria-label="Payment">
            <option value="">Payment</option>
            {(Object.keys(PAY) as PayState[]).map((k) => (
              <option key={k} value={k}>
                {PAY[k]}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={f.member} onChange={(e) => setF((x) => ({ ...x, member: e.target.value }))} aria-label="Team member">
            <option value="">Team member</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={f.overdue} onChange={(e) => setF((x) => ({ ...x, overdue: e.target.checked }))} /> Overdue parts
          </label>
          <span className="row muted small" style={{ gap: 6 }}>
            From
            <input className="input input-sm filter-select" type="date" aria-label="From" value={f.from} max={f.to || undefined} onChange={(e) => setF((x) => ({ ...x, from: e.target.value }))} />
            to
            <input className="input input-sm filter-select" type="date" aria-label="To" value={f.to} min={f.from || undefined} onChange={(e) => setF((x) => ({ ...x, to: e.target.value }))} />
          </span>
          {filtered && (
            <button type="button" className="clear-btn" onClick={() => setF({ q: '', status: '', pay: '', overdue: false, member: '', from: '', to: '' })}>
              Reset
            </button>
          )}
        </div>

        {!rows ? (
          <div className="empty">Loading orders…</div>
        ) : visible.length === 0 ? (
          <Empty icon={PackageCheck}>{scoped.length ? 'No orders match these filters.' : 'No orders yet. Add one from a customer’s page → Orders → New order.'}</Empty>
        ) : (
          <Paged rows={visible} reset={[f]}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Services</th>
                      <th>Team member</th>
                      <th>Status</th>
                      <th className="num">Total</th>
                      <th className="num">Paid</th>
                      <th className="num">Balance</th>
                      <th>Next due</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((b) => {
                      const st = b.order_status ? ORDER_STATUS[b.order_status] : null
                      const nd = nextDue(b)
                      const late = nd && partState(nd) === 'overdue'
                      return (
                        <tr key={b.id} className="is-clickable" onClick={() => setOpen({ booking: b })}>
                          <td className="nowrap">
                            <b>{b.order_no}</b>
                            <div className="muted small">{day(b.booking_date)}</div>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {b.lead_id ? (
                              <Link to={`/customers/${b.lead_id}`} className="strong">
                                {b.client_name}
                              </Link>
                            ) : (
                              <span className="strong">{b.client_name}</span>
                            )}
                            <div className="muted small">{b.phone ?? ''}</div>
                          </td>
                          <td style={{ maxWidth: 260 }}>{services(b)}</td>
                          <td className="nowrap">{memberName(b.owner_id)}</td>
                          <td>{st && <span className={`badge ${st.tone}`}>{st.label}</span>}</td>
                          <td className="num nowrap">{money(b.total_amount)}</td>
                          <td className="num nowrap">{money(b.paid_amount)}</td>
                          <td className="num nowrap">{b.order_status === 'cancelled' ? '—' : money(Math.max(0, Number(b.total_amount) - Number(b.paid_amount)))}</td>
                          <td className="nowrap">
                            {nd && b.order_status !== 'cancelled' ? (
                              <span className={late ? 'tone-danger' : undefined}>
                                {money(nd.amount)} · {nd.due_on ? day(nd.due_on) : 'no date'}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="nowrap" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            {b.order_status !== 'cancelled' && b.invoice_no && (
                              <a className="btn btn-outline btn-sm" href={invoiceHref(b.id)} target="_blank" rel="noreferrer">
                                Invoice
                              </a>
                            )}{' '}
                            {can('bookings', 'add') && (
                              <button type="button" className="btn btn-outline btn-sm" title="A new order with the same services" onClick={() => setOpen({ booking: null, copy: b })}>
                                <Repeat size={13} /> Repeat
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
          </Paged>
        )}
      </div>

      {open && (
        <BookingDrawer
          key={open.booking?.id ?? `copy-${open.copy?.id}`}
          booking={open.booking}
          service
          copyFrom={open.copy ?? null}
          lead={
            (open.booking ?? open.copy)
              ? {
                  id: (open.booking ?? open.copy)!.lead_id,
                  customer_id: (open.booking ?? open.copy)!.customer_id,
                  name: (open.booking ?? open.copy)!.client_name,
                  phone: (open.booking ?? open.copy)!.phone ?? '',
                  purpose: null,
                  business_id: (open.booking ?? open.copy)!.business_id,
                  sub_business_id: (open.booking ?? open.copy)!.sub_business_id,
                }
              : null
          }
          refs={refs}
          onClose={() => setOpen(null)}
          onSaved={(msg) => {
            setOpen(null)
            setNotice(msg)
            load()
          }}
        />
      )}
    </>
  )
}
