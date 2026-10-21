import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, BadgeIndianRupee, Eye, FileText, Wallet } from 'lucide-react'
import { useBusiness } from '@/business/useBusiness'
import { Empty, PageHead, SearchInput, StatCard } from '@/components/ui'
import { cn } from '@/lib/cn'
import { money } from '@/leads/labels'
import { useTenant } from '@/tenant/useTenant'
import { listBookings } from './api'
import { invoiceHref } from './BookingsTab'
import { partState, type BookingRow } from './types'

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

/** Every invoice: one per booking, paid in parts. */
export function InvoicesPage() {
  const tenant = useTenant()
  const { selected, sub, inScope } = useBusiness()
  const [rows, setRows] = useState<BookingRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState({ q: '', state: '', month: '' })

  useEffect(() => {
    listBookings(tenant.id)
      .then((b) => setRows(b.filter((x) => x.status !== 'cancelled' && x.invoice_no)))
      .catch((e: Error) => setError(e.message))
  }, [tenant.id])

  const months = useMemo(() => [...new Set((rows ?? []).map((b) => (b.invoice_date ?? b.booking_date).slice(0, 7)))].sort().reverse(), [rows])

  const scoped = (rows ?? []).filter((b) => inScope(b.business_id, b.sub_business_id))
  const visible = scoped
    .filter((b) => !f.month || (b.invoice_date ?? b.booking_date).startsWith(f.month))
    .filter((b) => !f.state || payState(b) === f.state)
    .filter((b) => {
      const q = f.q.trim().toLowerCase()
      return !q || b.client_name.toLowerCase().includes(q) || (b.invoice_no ?? '').toLowerCase().includes(q) || (b.phone ?? '').includes(q)
    })
    .sort((a, b) => (b.invoice_no ?? '').localeCompare(a.invoice_no ?? ''))

  const billed = visible.reduce((n, b) => n + Number(b.total_amount), 0)
  const received = visible.reduce((n, b) => n + Number(b.paid_amount), 0)
  const overdue = visible.flatMap((b) => b.booking_payments).filter((p) => partState(p) === 'overdue')

  return (
    <>
      <PageHead title="Invoices" subtitle={`One invoice per booking${selected ? ` · ${selected.name}${sub ? ` · ${sub.name}` : ''}` : ''}; the amount is received in parts.`} />
      {error && <div className="alert alert-error">{error}</div>}

      <div className="stat-grid">
        <StatCard icon={FileText} tone="brand" value={visible.length} label="Invoices" />
        <StatCard icon={BadgeIndianRupee} tone="info" value={money(billed)} label="Billed" hint="With GST" />
        <StatCard icon={Wallet} tone="success" value={money(received)} label="Received" hint={`${money(Math.max(0, billed - received))} balance`} />
        <StatCard icon={AlertTriangle} tone="danger" value={money(overdue.reduce((n, p) => n + Number(p.amount), 0))} label="Overdue" hint={`${overdue.length} part${overdue.length === 1 ? '' : 's'}`} />
      </div>

      <div className="panel">
        <div className="panel-filters">
          <SearchInput placeholder="Invoice no., client or phone" value={f.q} onChange={(v) => setF((x) => ({ ...x, q: v }))} width={240} />
          <select className="input input-sm filter-select" value={f.state} onChange={(e) => setF((x) => ({ ...x, state: e.target.value }))} aria-label="Payment status">
            <option value="">Payment status</option>
            {(Object.keys(PAY_META) as PayState[]).map((k) => (
              <option key={k} value={k}>
                {PAY_META[k].label}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={f.month} onChange={(e) => setF((x) => ({ ...x, month: e.target.value }))} aria-label="Month">
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </option>
            ))}
          </select>
          {(f.q || f.state || f.month) && (
            <button type="button" className="clear-btn" onClick={() => setF({ q: '', state: '', month: '' })}>
              Reset
            </button>
          )}
        </div>

        {!rows ? (
          <div className="empty">Loading invoices…</div>
        ) : visible.length === 0 ? (
          <Empty icon={FileText}>{scoped.length ? 'No invoices match these filters.' : 'No invoices yet. Every booking gets one.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Shoot date</th>
                  <th>Receipts</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Received</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => {
                  const st = PAY_META[payState(b)]
                  const paidParts = b.booking_payments.filter((p) => p.status === 'paid').length
                  return (
                    <tr key={b.id}>
                      <td className="nowrap">
                        <b>{b.invoice_no}</b>
                        <div className="muted small">{day(b.invoice_date)}</div>
                      </td>
                      <td>
                        {b.lead_id ? (
                          <Link to={`/customers/${b.lead_id}`} className="strong">
                            {b.client_name}
                          </Link>
                        ) : (
                          <span className="strong">{b.client_name}</span>
                        )}
                        <div className="muted small">{b.phone ?? ''}</div>
                      </td>
                      <td className="nowrap">{day(b.booking_date)}</td>
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
                      <td className="right">
                        <a className="btn btn-outline btn-sm" href={invoiceHref(b.id)} target="_blank" rel="noreferrer">
                          <Eye size={14} /> View
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
