import { useCallback, useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { Empty, Paged } from '@/components/ui'
import { cn } from '@/lib/cn'
import { money } from '@/leads/labels'
import { useTenant } from '@/tenant/useTenant'
import { listBookings } from '@/bookings/api'
import { invoiceHref } from '@/bookings/BookingsTab'
import { partState, type BookingRow } from '@/bookings/types'
import type { BookingRefs } from '@/bookings/useBookingRefs'
import { listInvoices } from './api'
import { invoiceAsBooking } from './asBooking'
import { InvoicePanel } from './InvoicePanel'

type PayState = 'paid' | 'part' | 'due' | 'overdue'
const PAY_META: Record<PayState, { label: string; tone: string }> = {
  paid: { label: 'Paid', tone: 'badge-success' },
  part: { label: 'Part paid', tone: 'badge-info' },
  due: { label: 'Due', tone: 'badge-warning' },
  overdue: { label: 'Overdue', tone: 'badge-danger' },
}
const day = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
function payState(b: BookingRow): PayState {
  if (b.total_amount - b.paid_amount <= 0.01) return 'paid'
  if (b.booking_payments.some((p) => partState(p) === 'overdue')) return 'overdue'
  return b.paid_amount > 0 ? 'part' : 'due'
}

/** Lead / customer → Payments → Invoice: this lead's invoices, as on the Invoices page (one per booking, or one per group of orders) */
export function LeadInvoices({ leadId, refs, onChanged }: { leadId: string; refs: BookingRefs; onChanged?: (msg: string) => void }) {
  const tenant = useTenant()
  const [rows, setRows] = useState<BookingRow[] | null>(null)
  const [orderNos, setOrderNos] = useState<Map<string, string>>(new Map())
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([listBookings(tenant.id, { leadId }), listInvoices(tenant.id, { leadId })])
      .then(([b, inv]) => {
        setOrderNos(new Map(inv.map((i) => [i.id, i.bookings.filter((o) => o.status !== 'cancelled').map((o) => o.order_no ?? day(o.booking_date)).sort().join(', ')])))
        setRows(
          [...b.filter((x) => x.status !== 'cancelled' && x.invoice_no && !x.invoice_id && !x.order_no), ...inv.map((i) => invoiceAsBooking(i).b)].sort((x, y) =>
            (y.invoice_no ?? '').localeCompare(x.invoice_no ?? ''),
          ),
        )
      })
      .catch((e: Error) => {
        setError(e.message)
        setRows([])
      })
  }, [tenant.id, leadId])
  useEffect(load, [load])

  if (error) return <div className="alert alert-error">{error}</div>
  if (!rows) return <div className="empty">Loading invoices…</div>
  if (!rows.length) return <Empty icon={FileText}>No invoices for this lead yet.</Empty>
  return (
    <>
      <Paged rows={rows}>
        {(paged) => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Shoot date / orders</th>
                  <th>Receipts</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Received</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((b) => {
                  const st = PAY_META[payState(b)]
                  const paidParts = b.booking_payments.filter((p) => p.status === 'paid').length
                  return (
                    <tr key={b.id} className="is-clickable" onClick={() => (orderNos.has(b.id) ? setOpen(b.id) : window.open(invoiceHref(b.id), '_blank', 'noopener'))}>
                      <td className="nowrap">
                        <b>{b.invoice_no}</b>
                        <div className="muted small">{day(b.invoice_date)}</div>
                      </td>
                      <td className="nowrap">{orderNos.has(b.id) ? orderNos.get(b.id) || '—' : day(b.booking_date)}</td>
                      <td className="muted nowrap">{b.booking_payments.length ? `${paidParts} of ${b.booking_payments.length} paid` : '—'}</td>
                      <td className="num nowrap" style={{ textAlign: 'right' }}>
                        {money(b.total_amount)}
                      </td>
                      <td className="num nowrap" style={{ textAlign: 'right' }}>
                        {money(b.paid_amount)}
                      </td>
                      <td className="num nowrap" style={{ textAlign: 'right' }}>
                        {money(Math.max(0, b.total_amount - b.paid_amount))}
                      </td>
                      <td>
                        <span className={cn('badge', st.tone)}>{st.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Paged>
      {open && (
        <InvoicePanel
          key={open}
          invoiceId={open}
          refs={refs}
          onClose={() => setOpen(null)}
          onChanged={(msg) => {
            onChanged?.(msg)
            load()
          }}
        />
      )}
    </>
  )
}
