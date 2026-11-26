import { useNavigate } from 'react-router'
import { Act, Acts } from '@/components/Acts'
import { Paged } from '@/components/ui'
import { CalendarPlus, FileText, Pencil, Plus, Repeat } from 'lucide-react'
import { money } from '@/leads/labels'
import type { BookingRefs } from './useBookingRefs'
import { ORDER_STATUS, STATUS_META, invoiceNo, type BookingRow } from './types'

export const slotText = (b: Pick<BookingRow, 'booking_date' | 'start_time' | 'end_time'>) => {
  const t = (x: string) => {
    const [h, m] = x.split(':').map(Number)
    return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  }
  const day = new Date(`${b.booking_date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  // a service booking (Default) has no time
  if (b.start_time.slice(0, 5) === b.end_time.slice(0, 5)) return day
  return `${day} · ${t(b.start_time)} – ${t(b.end_time)}`
}

/** Bookings of one lead / client. */
/** the booking's invoice page, opened in a new tab */
export const invoiceHref = (id: string) => `${import.meta.env.BASE_URL}bookings/${id}/invoice`

export function BookingsTab({
  bookings,
  canAdd,
  onAdd,
  onOpen,
  onRepeat,
  podcast = false,
  service = false,
  noun = 'Order',
}: {
  bookings: BookingRow[] | null
  canAdd: boolean
  onAdd: () => void
  onOpen: (b: BookingRow) => void
  /** Default business: a new booking with the same services */
  onRepeat?: (b: BookingRow) => void
  /** Paid Podcast: shown as podcasts */
  podcast?: boolean
  /** Default business: service purchases (no slot), each with its invoice */
  service?: boolean
  /** what a service booking is called: Order, or Brand Deal */
  noun?: string
}) {
  const navigate = useNavigate()
  const one = service ? noun.toLowerCase() : podcast ? 'podcast' : 'booking'
  const live = (bookings ?? []).filter((b) => b.status !== 'cancelled')
  const total = live.reduce((s, b) => s + Number(b.total_amount), 0)
  const paid = live.reduce((s, b) => s + Number(b.paid_amount), 0)
  return (
    <div className="stack">
      <div className="row-between">
        <span className="muted small">
          {live.length} {one}{live.length === 1 ? '' : 's'} · {money(total)} · paid {money(paid)} · balance {money(Math.max(0, total - paid))}
        </span>
        {canAdd && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}>
            {service ? <Plus size={14} /> : <CalendarPlus size={14} />} {service ? `New ${one}` : podcast ? 'Book podcast' : 'Book slot'}
          </button>
        )}
      </div>
      {!bookings ? (
        <div className="muted small">Loading…</div>
      ) : bookings.length === 0 ? (
        <div className="muted small">No {one}s yet.</div>
      ) : (
        <Paged rows={bookings}>
{(paged) => (
<div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {service && <th>{noun}</th>}
                <th>{service ? 'Date' : podcast ? 'Shoot' : 'Slot'}</th>
                <th>{service ? 'Services' : 'Type'}</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th className="num">Paid</th>
                <th className="num">Balance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {paged.map((b) => (
                <tr key={b.id} className="is-clickable" onClick={() => onOpen(b)}>
                  {service && (
                    <td className="nowrap">
                      <b>{b.order_no ?? '—'}</b>
                      {invoiceNo(b) && <div className="muted small">{invoiceNo(b)}</div>}
                    </td>
                  )}
                  <td className="nowrap">{slotText(b)}</td>
                  <td>{service ? (b.booking_items?.length ? [...b.booking_items].sort((x, y) => x.sort_order - y.sort_order).map((i) => i.name).join(', ') : (b.purpose ?? '—')) : (b.purpose ?? '—')}</td>
                  <td>
                    {service && b.order_status ? (
                      <span className={`badge ${ORDER_STATUS[b.order_status].tone}`}>{ORDER_STATUS[b.order_status].label}</span>
                    ) : (
                      <span className={`badge ${STATUS_META[b.status].tone}`}>{STATUS_META[b.status].label}</span>
                    )}
                  </td>
                  <td className="num">{money(b.total_amount)}</td>
                  <td className="num">{money(b.paid_amount)}</td>
                  <td className="num">{b.status === 'cancelled' ? '—' : money(Math.max(0, b.total_amount - b.paid_amount))}</td>
                  <td className="nowrap">
                    <Acts>
                      <Act icon={Pencil} label="Edit" onClick={() => onOpen(b)} />
                      {b.invoice_id && <Act icon={FileText} label={`Invoice ${invoiceNo(b) ?? ''}`.trim()} onClick={() => navigate(`/invoices/${b.invoice_id}`)} />}
                      {service && onRepeat && canAdd && <Act icon={Repeat} label={`Repeat: a new ${one} with the same services`} onClick={() => onRepeat(b)} />}
                    </Acts>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
)}
</Paged>
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
        <Paged rows={done}>
{(paged) => (
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
              {paged.map((b) => (
                <tr key={b.id}>
                  <td>
                    <b>{b.invoice_no}</b>
                  </td>
                  <td className="nowrap">{b.invoice_date ? new Date(`${b.invoice_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td>{refs.companyName(b.billing_company_id) ?? '—'}</td>
                  <td className="muted">{slotText(b)}</td>
                  <td className="num">{money(b.total_amount)}</td>
                  <td className="num">{money(Math.max(0, b.total_amount - b.paid_amount))}</td>
                  <td className="nowrap">
                    <Acts>
                      <Act icon={FileText} label="View invoice" to={`/bookings/${b.id}/invoice`} target="_blank" />
                    </Acts>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
)}
</Paged>
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
