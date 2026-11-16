import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, BadgeIndianRupee, FileText, Pencil, Plus, Printer, Unlink, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { orderNoun } from '@/business/activeType'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Flash } from '@/components/Flash'
import { ConfirmModal, Empty, StatCard } from '@/components/ui'
import { db } from '@/lib/supabase'
import { money } from '@/leads/labels'
import { useTenant } from '@/tenant/useTenant'
import { listBookings } from '@/bookings/api'
import { BookingDrawer } from '@/bookings/BookingDrawer'
import { useBookingRefs } from '@/bookings/useBookingRefs'
import { ORDER_STATUS, partState, type BookingRow } from '@/bookings/types'
import { addInvoiceOrders, getInvoice, invoicePrintHref, removeInvoiceOrder } from './api'
import { InvoiceDrawer } from './InvoiceDrawer'
import { isFullyPaid, type InvoiceRow } from './types'

const day = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const services = (b: BookingRow) =>
  b.booking_items?.length
    ? [...b.booking_items]
        .sort((x, y) => x.sort_order - y.sort_order)
        .map((i) => i.name)
        .join(', ')
    : (b.purpose ?? '—')

/** One invoice (Default / Brand Deals): the client, its orders and its payment parts. */
export function InvoiceDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const tenant = useTenant()
  const { can, businesses } = useAuth()
  const refs = useBookingRefs()
  const [inv, setInv] = useState<InvoiceRow | null | undefined>(undefined)
  const [client, setClient] = useState<{ email: string | null; city: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editPay, setEditPay] = useState(false)
  const [adding, setAdding] = useState(false)
  const [order, setOrder] = useState<BookingRow | null>(null)
  const [removing, setRemoving] = useState<BookingRow | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    getInvoice(id).then(
      (i) => {
        setInv(i)
        if (i?.lead_id)
          void db()
            .from('leads')
            .select('email, city')
            .eq('id', i.lead_id)
            .maybeSingle()
            .then(({ data }) => setClient(data as { email: string | null; city: string | null } | null))
      },
      (e: Error) => setError(e.message),
    )
  }, [id])
  useEffect(load, [load])

  const biz = businesses.find((b) => b.id === inv?.business_id)
  const type = biz ? (biz.subs.find((s) => s.id === inv?.sub_business_id)?.type ?? biz.type) : null
  const noun = orderNoun(type)
  const one = noun.one.toLowerCase()
  const orders = useMemo(() => [...(inv?.bookings ?? [])].sort((a, b) => (a.order_no ?? '').localeCompare(b.order_no ?? '')), [inv])
  const parts = useMemo(() => [...(inv?.invoice_payments ?? [])].sort((a, b) => (a.due_on ?? a.paid_on ?? '').localeCompare(b.due_on ?? b.paid_on ?? '')), [inv])
  const modeName = (m: string | null) => refs.modes.find((x) => x.id === m)?.name ?? '—'

  if (inv === undefined) return error ? <div className="alert alert-error">{error}</div> : <div className="empty">Loading…</div>
  if (!inv) return <div className="empty">This invoice isn’t available. <Link to="/invoices">Back to invoices</Link></div>

  const paid = isFullyPaid(inv)
  const balance = Math.max(0, Number(inv.total_amount) - Number(inv.paid_amount))
  const overdue = parts.filter((p) => partState(p) === 'overdue')
  const canEdit = can('bookings', 'edit')

  async function remove() {
    if (!removing) return
    setBusy(true)
    try {
      await removeInvoiceOrder(removing.id)
      setNotice(`${removing.order_no} removed from ${inv!.invoice_no}.`)
      setError(null)
      load()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
    setRemoving(null)
  }

  return (
    <>
      <div className="row page-top" style={{ gap: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} /> Back
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <Flash msg={notice} dep={notice} />

      <section className="card card-pad row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="stack" style={{ gap: 4 }}>
          <div className="row" style={{ gap: 8 }}>
            <h2 style={{ margin: 0 }}>Invoice {inv.invoice_no}</h2>
            <span className={`badge ${paid ? 'badge-success' : Number(inv.paid_amount) > 0 ? 'badge-warning' : 'badge-muted'}`}>{paid ? 'Fully paid' : Number(inv.paid_amount) > 0 ? 'Part paid' : 'Unpaid'}</span>
          </div>
          <div className="muted small">
            {day(inv.invoice_date)} · {inv.gst_applicable ? `GST ${Number(inv.gst_rate)}%` : 'No GST'}
            {biz ? ` · ${biz.name}` : ''}
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <a className="btn btn-outline btn-sm" href={invoicePrintHref(inv.id)} target="_blank" rel="noreferrer">
            <Printer size={14} /> Print / PDF
          </a>
          {canEdit && (
            <Button size="sm" onClick={() => setEditPay(true)}>
              <Wallet size={14} /> Payments & GST
            </Button>
          )}
        </div>
      </section>

      <div className="stat-grid">
        <StatCard icon={FileText} tone="brand" value={money(inv.total_amount)} label="Total" hint={inv.gst_applicable ? `incl. GST ${money(inv.gst_amount)}` : 'No GST'} />
        <StatCard icon={Wallet} tone="success" value={money(inv.paid_amount)} label="Received" />
        <StatCard icon={BadgeIndianRupee} tone={balance > 0 ? 'danger' : 'success'} value={money(balance)} label="Balance" hint={overdue.length ? `${overdue.length} part${overdue.length === 1 ? '' : 's'} overdue` : undefined} />
      </div>

      <section className="card card-pad stack" style={{ gap: 6 }}>
        <b>Client</b>
        <div>
          {inv.lead_id ? (
            <Link to={`/customers/${inv.lead_id}`} className="strong">
              {inv.client_name}
            </Link>
          ) : (
            <span className="strong">{inv.client_name}</span>
          )}
        </div>
        <div className="muted small">{[inv.phone, client?.email, client?.city].filter(Boolean).join(' · ') || '—'}</div>
      </section>

      <div className="panel">
        <div className="row-between" style={{ padding: '12px 16px' }}>
          <b>{noun.many}</b>
          {canEdit && !paid && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus /> Add {one}
            </Button>
          )}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{noun.one}</th>
                <th>Services</th>
                <th>Status</th>
                <th className="num">Amount</th>
                <th className="num">GST</th>
                <th className="num">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const st = o.order_status ? ORDER_STATUS[o.order_status] : null
                return (
                  <tr key={o.id} className="is-clickable" onClick={() => setOrder(o)}>
                    <td className="nowrap">
                      <b>{o.order_no}</b>
                      <div className="muted small">{day(o.booking_date)}</div>
                    </td>
                    <td style={{ maxWidth: 300 }}>{services(o)}</td>
                    <td>{st && <span className={`badge ${st.tone}`}>{st.label}</span>}</td>
                    <td className="num nowrap">{money(o.amount)}</td>
                    <td className="num nowrap">{o.status === 'cancelled' ? '—' : money(o.gst_amount)}</td>
                    <td className="num nowrap">{o.status === 'cancelled' ? <span className="muted">Not counted</span> : money(o.total_amount)}</td>
                    <td className="nowrap" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setOrder(o)}>
                        <Pencil size={13} /> {paid ? 'View' : 'Edit'}
                      </button>{' '}
                      {canEdit && orders.length > 1 && (
                        <button type="button" className="btn btn-outline btn-sm" title="Take this order off the invoice" onClick={() => setRemoving(o)}>
                          <Unlink size={13} /> Remove
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="row-between" style={{ padding: '12px 16px' }}>
          <b>Part payments</b>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditPay(true)}>
              <Wallet size={14} /> Record / edit payments
            </Button>
          )}
        </div>
        {parts.length === 0 ? (
          <Empty icon={Wallet}>No payment parts yet. Add them with Record / edit payments.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th>Received on</th>
                  <th>Mode</th>
                  <th>Comment</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((p) => {
                  const st = partState(p)
                  return (
                    <tr key={p.id}>
                      <td className="strong">{p.label || 'Payment'}</td>
                      <td className="nowrap">{day(p.due_on)}</td>
                      <td>
                        <span className={`badge ${st === 'paid' ? 'badge-success' : st === 'overdue' ? 'badge-danger' : 'badge-muted'}`}>{st === 'paid' ? 'Paid' : st === 'overdue' ? 'Overdue' : 'Pending'}</span>
                      </td>
                      <td className="nowrap">{p.status === 'paid' ? day(p.paid_on) : '—'}</td>
                      <td>{p.status === 'paid' ? modeName(p.payment_mode_id) : '—'}</td>
                      <td className="muted">{p.note || p.reference || '—'}</td>
                      <td className="num nowrap">{money(p.amount)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editPay && (
        <InvoiceDrawer
          invoice={inv}
          refs={refs}
          onClose={() => setEditPay(false)}
          onSaved={(msg) => {
            setEditPay(false)
            setNotice(msg)
            setError(null)
            load()
          }}
        />
      )}

      {adding && (
        <AddOrdersDrawer
          tenantId={tenant.id}
          inv={inv}
          noun={noun}
          onClose={() => setAdding(false)}
          onSaved={(msg) => {
            setAdding(false)
            setNotice(msg)
            setError(null)
            load()
          }}
        />
      )}

      {order && (
        <BookingDrawer
          key={order.id}
          booking={order}
          service
          noun={noun.one}
          lead={{ id: order.lead_id, customer_id: order.customer_id, name: order.client_name, phone: order.phone ?? '', purpose: null, business_id: order.business_id, sub_business_id: order.sub_business_id }}
          refs={refs}
          locked={paid}
          onClose={() => setOrder(null)}
          onSaved={(msg) => {
            setOrder(null)
            setNotice(msg)
            setError(null)
            load()
          }}
        />
      )}

      <ConfirmModal
        open={!!removing}
        icon={Unlink}
        danger
        title={`Remove ${removing?.order_no ?? ''} from this invoice?`}
        message={`The ${one} stays, but goes back to “not invoiced” and the invoice total drops by ${money(removing?.total_amount ?? 0)}. The last unpaid part is lowered to match.`}
        confirmLabel="Remove"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </>
  )
}

/** the client's orders not on an invoice yet, ticked to add */
function AddOrdersDrawer({
  tenantId,
  inv,
  noun,
  onClose,
  onSaved,
}: {
  tenantId: string
  inv: InvoiceRow
  noun: { one: string; many: string }
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [rows, setRows] = useState<BookingRow[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const one = noun.one.toLowerCase()
  useEffect(() => {
    listBookings(tenantId, { leadId: inv.lead_id ?? undefined, customerId: inv.customer_id ?? undefined }).then(
      (b) => setRows(b.filter((x) => x.order_no && !x.invoice_id && x.status !== 'cancelled' && x.business_id === inv.business_id)),
      (e: Error) => setError(e.message),
    )
  }, [tenantId, inv])
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  async function save() {
    if (!picked.size) return setError(`Tick at least one ${one}.`)
    setBusy(true)
    setError(null)
    try {
      await addInvoiceOrders(inv.id, [...picked])
      onSaved(`${picked.size} ${picked.size === 1 ? one : noun.many.toLowerCase()} added to ${inv.invoice_no}.`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={620}
      title={`Add ${one} · ${inv.invoice_no}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={save} disabled={busy || !picked.size}>
              {busy ? 'Adding…' : `Add ${picked.size || ''} to invoice`}
            </Button>
          </div>
        </>
      }
    >
      <p className="muted small">
        {inv.client_name}’s {noun.many.toLowerCase()} that aren’t on an invoice yet. The invoice total goes up; the last unpaid part takes the difference.
      </p>
      {!rows ? (
        <div className="empty">Loading…</div>
      ) : rows.length === 0 ? (
        <Empty icon={FileText}>No other {noun.many.toLowerCase()} of {inv.client_name} to invoice.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th />
                <th>{noun.one}</th>
                <th>Services</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="is-clickable" onClick={() => toggle(o.id)}>
                  <td>
                    <input type="checkbox" aria-label={`Pick ${o.order_no}`} checked={picked.has(o.id)} onChange={() => toggle(o.id)} onClick={(e) => e.stopPropagation()} />
                  </td>
                  <td className="nowrap">
                    <b>{o.order_no}</b>
                    <div className="muted small">{day(o.booking_date)}</div>
                  </td>
                  <td>{services(o)}</td>
                  <td className="num nowrap">{money(o.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  )
}
