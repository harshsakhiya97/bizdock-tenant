import { useCallback, useEffect, useState } from 'react'
import { useKept } from '@/lib/useKept'
import { Act, Acts } from '@/components/Acts'
import { Link, useSearchParams } from 'react-router'
import { AlertTriangle, BadgeIndianRupee, FileText, Printer, Wallet } from 'lucide-react'
import { useBusiness } from '@/business/useBusiness'
import { ALL_DATES, DateRangePicker, type Range } from '@/components/DateRange'
import { Empty, PageHead, SearchInput, StatCard, Paged } from '@/components/ui'
import { cn } from '@/lib/cn'
import { money } from '@/leads/labels'
import { useTenant } from '@/tenant/useTenant'
import { listBookings } from './api'
import { invoiceHref } from './BookingsTab'
import { partState, type BookingRow } from './types'
import { invoicePrintHref, listInvoices, refreshInvoiceSeller } from '@/invoices/api'
import { invoiceAsBooking } from '@/invoices/asBooking'
import { InvoicePanel } from '@/invoices/InvoicePanel'
import { useBookingRefs } from './useBookingRefs'
import { Flash } from '@/components/Flash'
import { StatRecords, type StatShow, type StatCol } from '@/components/StatRecords'
import { Select } from '@/components/Field'

type PayState = 'paid' | 'part' | 'due' | 'overdue'
const PAY_META: Record<PayState, { label: string; tone: string }> = {
  paid: { label: 'Paid', tone: 'badge-success' },
  part: { label: 'Part paid', tone: 'badge-info' },
  due: { label: 'Due', tone: 'badge-warning' },
  overdue: { label: 'Overdue', tone: 'badge-danger' },
}

const day = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

/** what's left on a booking and whether any planned part is past its due date */
function payState(b: BookingRow): PayState {
  if (b.total_amount - b.paid_amount <= 0.01) return 'paid'
  if (b.booking_payments.some((p) => partState(p) === 'overdue')) return 'overdue'
  return b.paid_amount > 0 ? 'part' : 'due'
}

/** Every invoice: one per booking, or (Default / Brand Deals) one per group of orders of a client; paid in parts. */
export function InvoicesPage() {
  const tenant = useTenant()
  const { selected, sub, inScope } = useBusiness()
  const [rows, setRows] = useState<BookingRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useKept(`invoices.${tenant.id}`, { q: '', state: '' })
  // the invoice date (or the booking's date before an invoice no.); All dates by default
  const [range, setRange] = useState<Range>(ALL_DATES)
  // invoices of orders (Default / Brand Deals): their order numbers, by invoice id
  const [orderNos, setOrderNos] = useState<Map<string, string>>(new Map())
  // Print: the company details again from Masters (as the invoice's Print / PDF), then the print page in a new tab
  async function print(id: string) {
    if (!orderNos.has(id)) return void window.open(invoiceHref(id), '_blank', 'noopener')
    const tab = window.open('about:blank', '_blank')
    try {
      await refreshInvoiceSeller(id)
    } catch {
      // no edit access: print as saved
    }
    if (tab) tab.location.href = invoicePrintHref(id)
    else window.open(invoicePrintHref(id), '_blank')
  }

  const refs = useBookingRefs()
  // the invoice side panel (?open=<id>, e.g. from a booking)
  const [params, setParams] = useSearchParams()
  const openId = params.get('open')
  const setOpen = (id: string | null) => setParams(id ? { open: id } : {}, { replace: true })
  const [notice, setNotice] = useState<string | null>(null)
  const load = useCallback(() => {
    Promise.all([listBookings(tenant.id), listInvoices(tenant.id)])
      .then(([b, inv]) => {
        setOrderNos(new Map(inv.map((i) => [i.id, i.bookings.filter((o) => o.status !== 'cancelled').map((o) => o.order_no ?? new Date(`${o.booking_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })).sort().join(', ')])))
        setRows([...b.filter((x) => x.status !== 'cancelled' && x.invoice_no && !x.invoice_id && !x.order_no), ...inv.map((i) => invoiceAsBooking(i).b)])
      })
      .catch((e: Error) => setError(e.message))
  }, [tenant.id])
  useEffect(load, [load])

  const scoped = (rows ?? []).filter((b) => inScope(b.business_id, b.sub_business_id))
  const visible = scoped
    .filter((b) => {
      if (range.key === 'all') return true
      const d = (b.invoice_date ?? b.booking_date).slice(0, 10)
      return d >= range.from && d <= range.to
    })
    .filter((b) => !f.state || payState(b) === f.state)
    .filter((b) => {
      const q = f.q.trim().toLowerCase()
      return !q || b.client_name.toLowerCase().includes(q) || (b.invoice_no ?? '').toLowerCase().includes(q) || (b.phone ?? '').includes(q) || (orderNos.get(b.id) ?? '').toLowerCase().includes(q)
    })
    // newest first: by when it was created (then the invoice number)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || (b.invoice_no ?? '').localeCompare(a.invoice_no ?? ''))

  const billed = visible.reduce((n, b) => n + Number(b.total_amount), 0)
  const received = visible.reduce((n, b) => n + Number(b.paid_amount), 0)
  const overdue = visible.flatMap((b) => b.booking_payments).filter((p) => partState(p) === 'overdue')
  // a stat card's records: those invoices (click one to open it)
  const [statShow, setStatShow] = useState<StatShow<BookingRow> | null>(null)
  const invCols: StatCol<BookingRow>[] = [
    {
      label: 'Invoice',
      render: (b) => (
        <>
          <b>{b.invoice_no}</b>
          <div className="muted small">{b.invoice_date ? new Date(`${b.invoice_date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</div>
        </>
      ),
    },
    { label: 'Client', render: (b) => b.client_name },
    { label: 'Total', num: true, render: (b) => money(b.total_amount) },
    { label: 'Received', num: true, render: (b) => money(b.paid_amount) },
    { label: 'Balance', num: true, render: (b) => money(Math.max(0, b.total_amount - b.paid_amount)) },
    {
      label: 'Overdue',
      num: true,
      render: (b) => {
        const o = b.booking_payments.filter((p) => partState(p) === 'overdue').reduce((n, p) => n + Number(p.amount), 0)
        return o ? <b style={{ color: 'var(--danger)' }}>{money(o)}</b> : <span className="muted">—</span>
      },
    },
  ]
  const showInv = (title: string, f: (b: BookingRow) => boolean) => () => setStatShow({ title, rows: visible.filter(f), cols: invCols })

  return (
    <>
      <PageHead title="Invoices" subtitle={`One invoice per booking, or per group of orders${selected ? ` · ${selected.name}${sub ? ` · ${sub.name}` : ''}` : ''}; the amount is received in parts.`} />
      {error && <div className="alert alert-error">{error}</div>}
      <Flash msg={notice} dep={notice} />

      <div className="stat-grid">
        <StatCard icon={FileText} tone="brand" value={visible.length} label="Invoices" onClick={showInv('Invoices', () => true)} />
        <StatCard icon={BadgeIndianRupee} tone="info" value={money(billed)} label="Billed" hint="With GST" onClick={showInv('Billed', (b) => Number(b.total_amount) > 0)} />
        <StatCard icon={Wallet} tone="success" value={money(received)} label="Received" hint={`${money(Math.max(0, billed - received))} balance`} onClick={showInv('Received', (b) => Number(b.paid_amount) > 0)} />
        <StatCard icon={AlertTriangle} tone="danger" value={money(overdue.reduce((n, p) => n + Number(p.amount), 0))} label="Overdue" hint={`${overdue.length} part${overdue.length === 1 ? '' : 's'}`} onClick={showInv('Overdue', (b) => b.booking_payments.some((p) => partState(p) === 'overdue'))} />
      </div>
      <StatRecords show={statShow} onClose={() => setStatShow(null)} rowKey={(b) => b.id} onRow={(b) => (orderNos.has(b.id) ? setOpen(b.id) : window.open(invoiceHref(b.id), '_blank', 'noopener'))} />

      <div className="panel">
        <div className="panel-filters">
          <SearchInput placeholder="Invoice no., client or phone" value={f.q} onChange={(v) => setF((x) => ({ ...x, q: v }))} width={240} />
          <Select className="input input-sm filter-select" value={f.state} onChange={(e) => setF((x) => ({ ...x, state: e.target.value }))} aria-label="Payment status">
            <option value="">Payment status</option>
            {(Object.keys(PAY_META) as PayState[]).map((k) => (
              <option key={k} value={k}>
                {PAY_META[k].label}
              </option>
            ))}
          </Select>
          <DateRangePicker value={range} onChange={setRange} allDates />
          {(f.q || f.state || range.key !== 'all') && (
            <button
              type="button"
              className="clear-btn"
              onClick={() => {
                setF({ q: '', state: '' })
                setRange(ALL_DATES)
              }}
            >
              Reset
            </button>
          )}
        </div>

        {!rows ? (
          <div className="empty">Loading invoices…</div>
        ) : visible.length === 0 ? (
          <Empty icon={FileText}>{scoped.length ? 'No invoices match these filters.' : 'No invoices yet. Every booking gets one.'}</Empty>
        ) : (
          <Paged rows={visible}>
{(paged) => (
<div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Shoot date / orders</th>
                  <th>Receipts</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Received</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                  <th>Status</th>
                  <th />
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
                      <td>
                        {b.lead_id ? (
                          <Link to={`/customers/${b.lead_id}`} className="strong" onClick={(e) => e.stopPropagation()}>
                            {b.client_name}
                          </Link>
                        ) : (
                          <span className="strong">{b.client_name}</span>
                        )}
                        <div className="muted small">{b.phone ?? ''}</div>
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
                      <td>
                        <Acts>
                          <Act icon={Printer} label="Print / PDF with the latest company details" onClick={() => void print(b.id)} />
                        </Acts>
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

      {openId && (
        <InvoicePanel
          key={openId}
          invoiceId={openId}
          refs={refs}
          onClose={() => setOpen(null)}
          onChanged={(msg) => {
            setNotice(msg)
            load()
          }}
        />
      )}
    </>
  )
}
