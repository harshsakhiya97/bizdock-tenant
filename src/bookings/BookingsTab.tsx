import { Link } from 'react-router'
import { CalendarPlus, FileText } from 'lucide-react'
import { money } from '@/leads/labels'
import type { BookingRefs } from './useBookingRefs'
import { STATUS_META, type BookingRow } from './types'

export const slotText = (b: Pick<BookingRow, 'booking_date' | 'start_time' | 'end_time'>) => {
  const t = (x: string) => {
    const [h, m] = x.split(':').map(Number)
    return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  }
  return `${new Date(`${b.booking_date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${t(b.start_time)} – ${t(b.end_time)}`
}

/** Bookings of one lead / client. */
/** the booking's invoice page, opened in a new tab */
export const invoiceHref = (id: string) => `${import.meta.env.BASE_URL}bookings/${id}/invoice`

export function BookingsTab({
  bookings,
  canAdd,
  onAdd,
  onOpen,
}: {
  bookings: BookingRow[] | null
  canAdd: boolean
  onAdd: () => void
  onOpen: (b: BookingRow) => void
}) {
  const live = (bookings ?? []).filter((b) => b.status !== 'cancelled')
  const total = live.reduce((s, b) => s + Number(b.total_amount), 0)
  const paid = live.reduce((s, b) => s + Number(b.paid_amount), 0)
  return (
    <div className="stack">
      <div className="row-between">
        <span className="muted small">
          {live.length} booking{live.length === 1 ? '' : 's'} · {money(total)} · paid {money(paid)} · balance {money(Math.max(0, total - paid))}
        </span>
        {canAdd && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}>
            <CalendarPlus size={14} /> Book slot
          </button>
        )}
      </div>
      {!bookings ? (
        <div className="muted small">Loading…</div>
      ) : bookings.length === 0 ? (
        <div className="muted small">No bookings yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Type</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th className="num">Paid</th>
                <th className="num">Balance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="is-clickable" onClick={() => onOpen(b)}>
                  <td className="nowrap">{slotText(b)}</td>
                  <td>{b.purpose ?? '—'}</td>
                  <td>
                    <span className={`badge ${STATUS_META[b.status].tone}`}>{STATUS_META[b.status].label}</span>
                  </td>
                  <td className="num">{money(b.total_amount)}</td>
                  <td className="num">{money(b.paid_amount)}</td>
                  <td className="num">{b.status === 'cancelled' ? '—' : money(Math.max(0, b.total_amount - b.paid_amount))}</td>
                  <td className="nowrap" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => onOpen(b)}>
                      Edit
                    </button>{' '}
                    {b.status !== 'cancelled' && (
                      <a className="btn btn-outline btn-sm" href={invoiceHref(b.id)} target="_blank" rel="noreferrer">
                        Invoice
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Invoices of one lead / client: bookings that have an invoice, and the ones that can get one. */
export function InvoicesTab({
  bookings,
  refs,
  canCreate,
  onCreate,
}: {
  bookings: BookingRow[] | null
  refs: BookingRefs
  canCreate: boolean
  onCreate: (b: BookingRow) => void
}) {
  const live = (bookings ?? []).filter((b) => b.status !== 'cancelled')
  const done = live.filter((b) => b.invoice_no)
  const todo = live.filter((b) => !b.invoice_no)
  if (!bookings) return <div className="muted small">Loading…</div>
  return (
    <div className="stack">
      {done.length === 0 ? (
        <div className="muted small">No invoices yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Billed by</th>
                <th>For</th>
                <th className="num">Total</th>
                <th className="num">Balance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {done.map((b) => (
                <tr key={b.id}>
                  <td>
                    <b>{b.invoice_no}</b>
                  </td>
                  <td className="nowrap">{b.invoice_date ? new Date(`${b.invoice_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td>{refs.companyName(b.billing_company_id) ?? '—'}</td>
                  <td className="muted">{slotText(b)}</td>
                  <td className="num">{money(b.total_amount)}</td>
                  <td className="num">{money(Math.max(0, b.total_amount - b.paid_amount))}</td>
                  <td className="num">
                    <Link className="btn btn-outline btn-sm" to={`/bookings/${b.id}/invoice`} target="_blank">
                      <FileText size={14} /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canCreate && todo.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <b className="small">Bookings without an invoice</b>
          {todo.map((b) => (
            <div key={b.id} className="fu-item">
              <div>
                <b>{slotText(b)}</b>
                <div className="muted small">
                  {b.purpose ?? 'Booking'} · {money(b.total_amount)} · {refs.companyName(b.billing_company_id) ?? 'no billing company'}
                </div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onCreate(b)}>
                <FileText size={14} /> Create invoice
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
