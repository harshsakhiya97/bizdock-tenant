import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Empty } from '@/components/ui'
import { money } from '@/leads/labels'
import { listBookings } from '@/bookings/api'
import type { BookingRow } from '@/bookings/types'
import { addInvoiceOrders } from './api'
import { bookingRef } from './InvoiceDrawer'
import type { InvoiceRow } from './types'

const day = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const services = (b: BookingRow) =>
  b.booking_items?.length
    ? [...b.booking_items]
        .sort((x, y) => x.sort_order - y.sort_order)
        .map((i) => i.name)
        .join(', ')
    : (b.purpose ?? '—')

/** the client's orders not on an invoice yet, ticked to add */
export function AddOrdersDrawer({
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
      (b) => setRows(b.filter((x) => !!x.order_no === !!inv.bookings[0]?.order_no && !x.invoice_id && x.status !== 'cancelled' && x.business_id === inv.business_id)),
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
                    <b>{bookingRef(o)}</b>
                    {o.order_no && <div className="muted small">{day(o.booking_date)}</div>}
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
