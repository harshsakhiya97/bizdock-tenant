import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertTriangle, Clock, Wallet } from 'lucide-react'
import { useBusiness } from '@/business/useBusiness'
import { ALL_DATES, DateRangePicker, type Range } from '@/components/DateRange'
import { SearchSelect } from '@/components/SearchSelect'
import { Empty, PageHead, Paged, SearchInput, StatCard } from '@/components/ui'
import { cn } from '@/lib/cn'
import { listMemberOptions } from '@/leads/api'
import { money } from '@/leads/labels'
import type { MemberOption } from '@/leads/types'
import { listInvoices } from '@/invoices/api'
import { invoiceAsBooking } from '@/invoices/asBooking'
import { useTenant } from '@/tenant/useTenant'
import { listBookings } from './api'
import { invoiceHref } from './BookingsTab'
import { partState, type BookingRow } from './types'
import { useBookingRefs } from './useBookingRefs'

type State = 'paid' | 'pending' | 'overdue'
const STATE: Record<State, { label: string; tone: string }> = {
  paid: { label: 'Paid', tone: 'badge-success' },
  pending: { label: 'Due', tone: 'badge-warning' },
  overdue: { label: 'Overdue', tone: 'badge-danger' },
}

/** one payment (a part of an invoice's amount) with its invoice */
type Row = {
  id: string
  date: string
  state: State
  amount: number
  label: string | null
  mode: string | null
  reference: string | null
  note: string | null
  receivedBy: string | null
  inv: BookingRow
  /** an invoice of orders (opens in Invoices' side panel), else a booking's invoice page */
  ofOrders: boolean
}

const day = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

/** Finance → Payments: every payment of every invoice (paid on, or due on, in the range), newest first */
export function InvoicePaymentsPage() {
  const tenant = useTenant()
  const { selected, inScope } = useBusiness()
  const refs = useBookingRefs()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [error, setError] = useState<string | null>(null)
  // default: all dates
  const [range, setRange] = useState<Range>(ALL_DATES)
  const [f, setF] = useState({ q: '', state: '', mode: '', by: '' })

  const load = useCallback(() => {
    Promise.all([listBookings(tenant.id), listInvoices(tenant.id)])
      .then(([b, inv]) => {
        const ofOrders = new Set(inv.map((i) => i.id))
        const invoices = [...b.filter((x) => x.status !== 'cancelled' && x.invoice_no && !x.invoice_id && !x.order_no), ...inv.map((i) => invoiceAsBooking(i).b)]
        setRows(
          invoices.flatMap((x) =>
            x.booking_payments.map((p) => {
              const s = partState(p) as State
              return {
                id: p.id,
                // paid: the day it was received; still due: its due date
                date: (s === 'paid' ? (p.paid_on ?? p.created_at) : (p.due_on ?? p.created_at)).slice(0, 10),
                state: s,
                amount: Number(p.amount),
                label: p.label,
                mode: p.payment_mode_id,
                reference: p.reference,
                note: p.note,
                receivedBy: p.received_by,
                inv: x,
                ofOrders: ofOrders.has(x.id),
              }
            }),
          ),
        )
      })
      .catch((e: Error) => setError(e.message))
    listMemberOptions(tenant.id).then(setMembers, () => setMembers([]))
  }, [tenant.id])
  useEffect(load, [load])

  const scoped = useMemo(() => (rows ?? []).filter((r) => inScope(r.inv.business_id, r.inv.sub_business_id)), [rows, inScope])
  const inRange = range.key === 'all' ? scoped : scoped.filter((r) => r.date >= range.from && r.date <= range.to)
  const visible = inRange
    .filter((r) => !f.state || r.state === f.state)
    .filter((r) => !f.mode || r.mode === f.mode)
    .filter((r) => !f.by || r.receivedBy === f.by)
    .filter((r) => {
      const q = f.q.trim().toLowerCase()
      return !q || r.inv.client_name.toLowerCase().includes(q) || (r.inv.invoice_no ?? '').toLowerCase().includes(q) || (r.inv.phone ?? '').includes(q) || (r.reference ?? '').toLowerCase().includes(q)
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount)

  const sum = (s: State) => visible.filter((r) => r.state === s)
  const paid = sum('paid')
  const due = sum('pending')
  const overdue = sum('overdue')
  const total = (l: Row[]) => l.reduce((n, r) => n + r.amount, 0)
  const memberName = (id: string | null) => (id ? (members.find((m) => m.id === id)?.name ?? '—') : '—')
  // an invoice of orders opens in Invoices' side panel; a booking's invoice in a new tab (as on Invoices)
  const open = (r: Row) => (r.ofOrders ? navigate(`/invoices?open=${r.inv.id}`) : window.open(invoiceHref(r.inv.id), '_blank', 'noopener'))

  return (
    <>
      <PageHead title="Payments" subtitle={`Every payment of every invoice${selected ? ` · ${selected.name}` : ''}: received on the day it was paid, still due on its due date.`} />
      {error && <div className="alert alert-error">{error}</div>}

      <div className="stat-grid">
        <StatCard icon={Wallet} tone="success" value={money(total(paid))} label="Received" hint={`${paid.length} payment${paid.length === 1 ? '' : 's'}`} onClick={() => setF((x) => ({ ...x, state: x.state === 'paid' ? '' : 'paid' }))} />
        <StatCard icon={Clock} tone="warning" value={money(total(due))} label="Due" hint={`${due.length} part${due.length === 1 ? '' : 's'}`} onClick={() => setF((x) => ({ ...x, state: x.state === 'pending' ? '' : 'pending' }))} />
        <StatCard icon={AlertTriangle} tone="danger" value={money(total(overdue))} label="Overdue" hint={`${overdue.length} part${overdue.length === 1 ? '' : 's'}`} onClick={() => setF((x) => ({ ...x, state: x.state === 'overdue' ? '' : 'overdue' }))} />
      </div>

      <div className="panel">
        <div className="panel-filters">
          <SearchInput placeholder="Client, invoice no., phone or reference" value={f.q} onChange={(v) => setF((x) => ({ ...x, q: v }))} width={260} />
          <div className="filter-ss">
            <SearchSelect
              value={f.state || null}
              onChange={(v) => setF((x) => ({ ...x, state: v ?? '' }))}
              options={[{ value: '', label: 'All statuses' }, ...(Object.keys(STATE) as State[]).map((k) => ({ value: k, label: STATE[k].label }))]}
              placeholder="All statuses"
              searchPlaceholder="Search…"
            />
          </div>
          <div className="filter-ss">
            <SearchSelect value={f.mode || null} onChange={(v) => setF((x) => ({ ...x, mode: v ?? '' }))} options={[{ value: '', label: 'All modes' }, ...refs.modes.map((m) => ({ value: m.id, label: m.name }))]} placeholder="All modes" searchPlaceholder="Search modes…" />
          </div>
          <div className="filter-ss">
            <SearchSelect value={f.by || null} onChange={(v) => setF((x) => ({ ...x, by: v ?? '' }))} options={[{ value: '', label: 'Anyone' }, ...members.map((m) => ({ value: m.id, label: m.name }))]} placeholder="Received by" searchPlaceholder="Search team…" />
          </div>
          {(f.q || f.state || f.mode || f.by) && (
            <button type="button" className="clear-btn" onClick={() => setF({ q: '', state: '', mode: '', by: '' })}>
              Reset
            </button>
          )}
          <DateRangePicker value={range} onChange={setRange} allDates future />
        </div>

        {!rows ? (
          <div className="empty">Loading payments…</div>
        ) : visible.length === 0 ? (
          <Empty icon={Wallet}>{inRange.length ? 'No payments match these filters.' : 'No payments in this date range.'}</Empty>
        ) : (
          <Paged rows={visible}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Client</th>
                      <th>Invoice</th>
                      <th>Payment</th>
                      <th>Mode</th>
                      <th>Reference</th>
                      <th>Received by</th>
                      <th className="num">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((r) => {
                      const st = STATE[r.state]
                      return (
                        <tr key={r.id} className="is-clickable" title="Open the invoice" onClick={() => open(r)}>
                          <td className="nowrap">{day(r.date)}</td>
                          <td>
                            {r.inv.lead_id ? (
                              <Link to={`/customers/${r.inv.lead_id}`} className="strong" onClick={(e) => e.stopPropagation()}>
                                {r.inv.client_name}
                              </Link>
                            ) : (
                              <span className="strong">{r.inv.client_name}</span>
                            )}
                            <div className="muted small">{r.inv.phone ?? ''}</div>
                          </td>
                          <td className="nowrap">
                            <b>{r.inv.invoice_no ?? '—'}</b>
                            <div className="muted small">{day(r.inv.invoice_date ?? r.inv.booking_date)}</div>
                          </td>
                          <td className="small">
                            {r.label || '—'}
                            {r.note && (
                              <div className="muted cell-clip" title={r.note}>
                                {r.note}
                              </div>
                            )}
                          </td>
                          <td className="nowrap">{r.state === 'paid' ? (refs.modeName(r.mode) ?? '—') : <span className="muted">—</span>}</td>
                          <td className="small">{r.reference || <span className="muted">—</span>}</td>
                          <td className="nowrap">{r.state === 'paid' ? memberName(r.receivedBy) : <span className="muted">—</span>}</td>
                          <td className="num nowrap">
                            <b>{money(r.amount)}</b>
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
        )}
      </div>
    </>
  )
}
