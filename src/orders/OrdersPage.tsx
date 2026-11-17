import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, BadgeIndianRupee, FileText, PackageCheck, Plus, Repeat, Trash2, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { activeType, orderNoun } from '@/business/activeType'
import { ConfirmModal, Empty, PageHead, Paged, SearchInput, StatCard } from '@/components/ui'
import { Flash } from '@/components/Flash'
import { listLeads, listMemberOptions } from '@/leads/api'
import { money } from '@/leads/labels'
import type { LeadRow, MemberOption } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { deleteBooking, listBookings } from '@/bookings/api'
import { BookingDrawer } from '@/bookings/BookingDrawer'
import { useBookingRefs } from '@/bookings/useBookingRefs'
import { ORDER_STATUS, STATUS_META, invoiceNo, partState, type BookingRow, type BookingStatus, type OrderStatus } from '@/bookings/types'
import { slotText } from '@/bookings/BookingsTab'
import { bookingRef } from '@/invoices/InvoiceDrawer'
import { listInvoices } from '@/invoices/api'
import { InvoicePanel } from '@/invoices/InvoicePanel'
import { InvoiceDrawer } from '@/invoices/InvoiceDrawer'
import { isFullyPaid, type InvoicePayment, type InvoiceRow } from '@/invoices/types'

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
/** the first part of the invoice still to be paid */
const nextDue = (i: InvoiceRow | undefined): InvoicePayment | null =>
  [...(i?.invoice_payments ?? [])].filter((p) => p.status !== 'paid').sort((x, y) => (x.due_on ?? '9999').localeCompare(y.due_on ?? '9999'))[0] ?? null
/** one client: the same customer, else the same lead, else the same name + phone */
const clientKey = (b: BookingRow) => b.customer_id ?? b.lead_id ?? `${b.client_name.trim().toLowerCase()}|${b.phone ?? ''}`

/**
 * Orders (Default / Brand Deals) or Bookings (every other business): ORD number or date and time, services, status, team member
 * and its invoice. Tick orders / bookings of one client → Generate invoice.
 */
export function OrdersPage({ bookings = false }: { bookings?: boolean }) {
  const tenant = useTenant()
  const { can } = useAuth()
  const { selected, sub, inScope } = useBusiness()
  const refs = useBookingRefs()
  const noun = bookings ? { one: 'Booking', many: 'Bookings' } : orderNoun(activeType(selected, sub))
  const cancelled = (b: BookingRow) => b.status === 'cancelled'
  const one = noun.one.toLowerCase()
  const [rows, setRows] = useState<BookingRow[] | null>(null)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [f, setF] = useState({ q: '', status: '', pay: '', overdue: false, member: '', from: '', to: '' })
  const [open, setOpen] = useState<{ booking: BookingRow | null; copy?: BookingRow } | null>(null)
  const [invoices, setInvoices] = useState<Map<string, InvoiceRow>>(new Map())
  // orders ticked for one invoice
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [invoicing, setInvoicing] = useState<BookingRow[] | null>(null)
  const [removing, setRemoving] = useState<BookingRow | null>(null)
  const [busy, setBusy] = useState(false)
  // the invoice side panel
  const [invoiceOpen, setInvoiceOpen] = useState<string | null>(null)
  // New booking / order: pick the client (a lead or customer) from this list
  const [leads, setLeads] = useState<LeadRow[] | null>(null)
  function newOne() {
    setOpen({ booking: null })
    if (!leads) listLeads(tenant.id).then(setLeads, () => setLeads([]))
  }

  const load = useCallback(() => {
    listBookings(tenant.id)
      .then((b) => setRows(b.filter((x) => (bookings ? !x.order_no : !!x.order_no))))
      .catch((e: Error) => setError(e.message))
    listInvoices(tenant.id).then(
      (l) => setInvoices(new Map(l.map((i) => [i.id, i]))),
      () => setInvoices(new Map()),
    )
  }, [tenant.id, bookings])
  useEffect(load, [load])
  useEffect(() => {
    void listMemberOptions(tenant.id).then(setMembers)
  }, [tenant.id])
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? '—'

  const scoped = useMemo(() => (rows ?? []).filter((b) => inScope(b.business_id, b.sub_business_id)), [rows, inScope])
  const visible = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    return scoped
      .filter((b) => !f.status || (bookings ? b.status : b.order_status) === f.status)
      .filter((b) => !f.pay || payState(b) === f.pay)
      .filter((b) => !f.overdue || !!invoices.get(b.invoice_id ?? '')?.invoice_payments.some((p) => partState(p) === 'overdue'))
      .filter((b) => !f.member || b.owner_id === f.member)
      .filter((b) => !f.from || b.booking_date >= f.from)
      .filter((b) => !f.to || b.booking_date <= f.to)
      .filter((b) => !q || `${b.order_no ?? ''} ${invoiceNo(b) ?? ''} ${b.client_name} ${b.phone ?? ''} ${services(b)}`.toLowerCase().includes(q))
      .sort((a, b) => b.booking_date.localeCompare(a.booking_date) || (b.order_no ?? '').localeCompare(a.order_no ?? ''))
  }, [scoped, f, invoices, bookings])

  // the cards follow the filters: the rows in the list (cancelled ones not counted), worth, collected and still due
  const live = visible.filter((b) => !cancelled(b))
  const value = live.reduce((n, b) => n + Number(b.total_amount), 0)
  const collected = live.reduce((n, b) => n + Number(b.paid_amount), 0)
  const due = live.reduce((n, b) => n + Math.max(0, Number(b.total_amount) - Number(b.paid_amount)), 0)
  const liveInvoices = [...new Set(live.map((b) => b.invoice_id).filter(Boolean))].map((id) => invoices.get(id!)).filter(Boolean) as InvoiceRow[]
  const overdueParts = liveInvoices.flatMap((i) => i.invoice_payments).filter((p) => partState(p) === 'overdue')
  const canInvoice = can('bookings', 'add') || can('bookings', 'edit')
  const pickable = (b: BookingRow) => canInvoice && !b.invoice_id && !cancelled(b)
  const pickedRows = scoped.filter((b) => picked.has(b.id) && pickable(b))
  const toggle = (id: string) =>
    setPicked((s0) => {
      const n = new Set(s0)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  function generate() {
    if (!pickedRows.length) return
    const first = pickedRows[0]
    const other = pickedRows.find((b) => clientKey(b) !== clientKey(first) || b.business_id !== first.business_id)
    if (other) {
      setError(`Pick ${one}s of one client only: ${bookingRef(first)} is for ${first.client_name}, ${bookingRef(other)} is for ${other.client_name}.`)
      return
    }
    setError(null)
    setInvoicing(pickedRows)
  }
  const filtered = f.q || f.status || f.pay || f.overdue || f.member || f.from || f.to

  return (
    <>
      <PageHead
        title={noun.many}
        subtitle={`Every ${one}: its services, status and invoice. Tick ${one}s of one client → Generate invoice${selected ? ` · ${selected.name}${sub ? ` · ${sub.name}` : ''}` : ''}.`}
        actions={
          can('bookings', 'add') && (
            <button type="button" className="btn btn-primary" onClick={newOne}>
              <Plus size={16} /> New {one}
            </button>
          )
        }
      />
      {error && <div className="alert alert-error">{error}</div>}
      <Flash msg={notice} dep={notice} />

      <div className="stat-grid">
        <StatCard icon={PackageCheck} tone="brand" value={live.length} label={noun.many} hint={filtered ? 'Matching the filters' : 'All, not cancelled'} />
        <StatCard icon={BadgeIndianRupee} tone="info" value={money(value)} label={`${noun.one} value`} hint="With GST" />
        <StatCard icon={Wallet} tone="success" value={money(collected)} label="Collected" hint={value ? `${Math.round((collected / value) * 100)}% of the value` : undefined} />
        <StatCard icon={AlertTriangle} tone="danger" value={money(due)} label="Still due" hint={`${overdueParts.length} part${overdueParts.length === 1 ? '' : 's'} overdue`} />
      </div>

      <div className="panel">
        <div className="panel-filters">
          <SearchInput placeholder={`${noun.one}, invoice, customer, phone or service`} value={f.q} onChange={(v) => setF((x) => ({ ...x, q: v }))} width={260} />
          <select className="input input-sm filter-select" value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))} aria-label="Status">
            <option value="">Status</option>
            {bookings
              ? (Object.keys(STATUS_META) as BookingStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {STATUS_META[k].label}
                  </option>
                ))
              : (Object.keys(ORDER_STATUS) as OrderStatus[]).map((k) => (
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

        {pickedRows.length > 0 && (
          <div className="bulk-bar">
            <b>{pickedRows.length} selected</b>
            <span className="muted">{money(pickedRows.reduce((n, b) => n + Number(b.amount), 0))} before GST</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={generate}>
              <FileText size={14} /> Generate invoice
            </button>
            <button type="button" className="clear-btn" onClick={() => setPicked(new Set())}>
              Clear
            </button>
          </div>
        )}

        {!rows ? (
          <div className="empty">Loading {one}s…</div>
        ) : visible.length === 0 ? (
          <Empty icon={PackageCheck}>{scoped.length ? `No ${one}s match these filters.` : `No ${one}s yet. Add one with New ${one}.`}</Empty>
        ) : (
          <Paged rows={visible} reset={[f]}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>
                        {canInvoice && (
                          <input
                            type="checkbox"
                            aria-label="Pick all on this page"
                            checked={paged.some(pickable) && paged.filter(pickable).every((b) => picked.has(b.id))}
                            onChange={(e) =>
                              setPicked((s0) => {
                                const n = new Set(s0)
                                for (const b of paged.filter(pickable)) {
                                  if (e.target.checked) n.add(b.id)
                                  else n.delete(b.id)
                                }
                                return n
                              })
                            }
                          />
                        )}
                      </th>
                      <th>{noun.one}</th>
                      <th>Customer</th>
                      <th>Services</th>
                      <th>Team member</th>
                      <th>Status</th>
                      <th className="num">Total</th>
                      <th className="num">Paid</th>
                      <th className="num">Balance</th>
                      <th>Invoice</th>
                      <th>Next due</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((b) => {
                      const st = bookings ? STATUS_META[b.status] : b.order_status ? ORDER_STATUS[b.order_status] : null
                      const inv = invoices.get(b.invoice_id ?? '')
                      const nd = nextDue(inv)
                      const late = nd && partState(nd) === 'overdue'
                      return (
                        <tr key={b.id} className="is-clickable" onClick={() => setOpen({ booking: b })}>
                          <td onClick={(e) => e.stopPropagation()}>
                            {pickable(b) && <input type="checkbox" aria-label={`Pick ${bookingRef(b)}`} checked={picked.has(b.id)} onChange={() => toggle(b.id)} />}
                          </td>
                          <td className="nowrap">
                            {bookings ? (
                              // date, then the time under it
                              (() => {
                                const [d, time] = slotText(b).split(' · ')
                                return (
                                  <>
                                    <b>{d}</b>
                                    {time && <div className="muted small">{time}</div>}
                                  </>
                                )
                              })()
                            ) : (
                              <>
                                <b>{b.order_no}</b>
                                <div className="muted small">{day(b.booking_date)}</div>
                              </>
                            )}
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
                          <td className="num nowrap">{cancelled(b) ? '—' : money(Math.max(0, Number(b.total_amount) - Number(b.paid_amount)))}</td>
                          <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                            {b.invoice_id ? (
                              <button type="button" className="link-btn strong" onClick={() => setInvoiceOpen(b.invoice_id)}>
                                {invoiceNo(b) ?? 'Invoice'}
                              </button>
                            ) : cancelled(b) ? (
                              <span className="muted">—</span>
                            ) : (
                              <span className="muted small">Not invoiced</span>
                            )}
                          </td>
                          <td className="nowrap">
                            {nd && !cancelled(b) ? (
                              <span className={late ? 'tone-danger' : undefined}>
                                {money(nd.amount)} · {nd.due_on ? day(nd.due_on) : 'no date'}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="nowrap" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            {can('bookings', 'add') && (
                              <button type="button" className="btn btn-outline btn-sm" title={`A new ${one} with the same services`} onClick={() => setOpen({ booking: null, copy: b })}>
                                <Repeat size={13} /> Repeat
                              </button>
                            )}
                            {can('bookings', 'delete') && (
                              <button type="button" className="btn btn-ghost btn-sm btn-icon" title={`Delete this ${one}`} aria-label={`Delete ${bookingRef(b)}`} onClick={() => setRemoving(b)}>
                                <Trash2 size={14} />
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
          service={!bookings}
          noun={noun.one}
          copyFrom={open.copy ?? null}
          locked={!!open.booking?.invoice_id && !!invoices.get(open.booking.invoice_id) && isFullyPaid(invoices.get(open.booking.invoice_id)!)}
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
          leads={(leads ?? []).filter((l) => !l.is_archived && inScope(l.business_id, l.sub_business_id))}
          refs={refs}
          onClose={() => setOpen(null)}
          onSaved={(msg) => {
            setOpen(null)
            setNotice(msg)
            load()
          }}
        />
      )}

      {invoiceOpen && (
        <InvoicePanel
          key={invoiceOpen}
          invoiceId={invoiceOpen}
          refs={refs}
          onClose={() => setInvoiceOpen(null)}
          onChanged={(msg) => {
            setNotice(msg)
            load()
          }}
        />
      )}

      {invoicing && (
        <InvoiceDrawer
          orders={invoicing}
          refs={refs}
          noun={noun.one}
          onClose={() => setInvoicing(null)}
          onSaved={(msg, id) => {
            setInvoicing(null)
            setPicked(new Set())
            setNotice(msg)
            load()
            setInvoiceOpen(id)
          }}
        />
      )}
      <ConfirmModal
        open={!!removing}
        icon={Trash2}
        danger
        title={`Delete ${removing ? bookingRef(removing) : ''}?`}
        message={
          removing?.invoice_id
            ? (rows ?? []).some((x) => x.invoice_id === removing.invoice_id && x.id !== removing.id)
              ? `It comes off invoice ${invoiceNo(removing) ?? ''} (the invoice total drops), then it’s deleted with its services. This can’t be undone.`
              : `Its invoice ${invoiceNo(removing) ?? ''} and that invoice’s payments are deleted too. This can’t be undone.`
            : 'It’s deleted with its services and payments. This can’t be undone.'
        }
        confirmLabel="Delete"
        busy={busy}
        onConfirm={async () => {
          if (!removing) return
          setBusy(true)
          try {
            await deleteBooking(removing.id)
            setNotice(`${bookingRef(removing)} deleted.`)
            setRemoving(null)
            load()
          } catch (e) {
            setError((e as Error).message)
            setRemoving(null)
          }
          setBusy(false)
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  )
}
