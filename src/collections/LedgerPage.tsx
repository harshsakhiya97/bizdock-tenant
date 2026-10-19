import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { BookOpen, Download, FileText, Printer, Scale, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Empty, PageHead, StatCard } from '@/components/ui'
import { SearchSelect } from '@/components/SearchSelect'
import { fmtDay, planOf, rupees, todayIso } from '@/customers/labels'
import type { PaymentFull, SaleRow } from '@/customers/types'
import { useSalesData } from '@/customers/useSalesData'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { listAllPayments } from './paymentsApi'

type Entry = {
  key: string
  date: string
  type: 'invoice' | 'payment' | 'credit'
  customerId: string
  companyId: string | null
  ref: string
  description: string
  debit: number
  credit: number
  taxable: number
  gst: number
}

/** Indian financial year start (1 April) for a date */
const fyStart = (iso: string) => {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  return `${m >= 4 ? y : y - 1}-04-01`
}
const saleRef = (s: SaleRow) => `S-${s.id.slice(0, 6).toUpperCase()}`
const round2 = (n: number) => Math.round(n * 100) / 100

/** Ledger: invoices (sales) as debits, payments as credits, with a running balance; and a monthly GST summary. */
export function LedgerPage() {
  const tenant = useTenant()
  const data = useSalesData()
  const { can } = useAuth()
  const { selected } = useBusiness()
  const navigate = useNavigate()
  const [payments, setPayments] = useState<PaymentFull[] | null>(null)
  const [tab, setTab] = useState<'ledger' | 'gst'>('ledger')
  const [customer, setCustomer] = useState<string | null>(null)
  const [company, setCompany] = useState('')
  const [from, setFrom] = useState(fyStart(todayIso()))
  const [to, setTo] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    listAllPayments(tenant.id)
      .then(setPayments)
      .catch((e: Error) => setError(e.message))
  }, [tenant.id])
  useEffect(load, [load])

  const saleById = useMemo(() => new Map(data.sales.map((s) => [s.id, s])), [data.sales])
  const custById = useMemo(() => new Map(data.allCustomers.map((c) => [c.id, c])), [data.allCustomers])

  // every ledger entry for the sales this person can see (top-bar business applied by useSalesData)
  const all: Entry[] = useMemo(() => {
    const out: Entry[] = []
    for (const s of data.sales) {
      const product = data.saleTitle(s)
      out.push({
        key: `i-${s.id}`,
        date: s.sale_date,
        type: 'invoice',
        customerId: s.customer_id,
        companyId: s.billing_company_id,
        ref: saleRef(s),
        description: `${planOf(s.plan).short} · ${product}${s.quantity > 1 ? ` × ${s.quantity}` : ''}`,
        debit: Number(s.total_amount),
        credit: 0,
        taxable: Number(s.base_amount),
        gst: Number(s.gst_amount),
      })
      if (s.status === 'cancelled') {
        // the part not paid is written off when the sale is cancelled
        const off = round2(Number(s.total_amount) - Number(s.paid_amount))
        if (off > 0)
          out.push({
            key: `c-${s.id}`,
            date: (s.cancelled_at ?? s.sale_date).slice(0, 10),
            type: 'credit',
            customerId: s.customer_id,
            companyId: s.billing_company_id,
            ref: saleRef(s),
            description: `Sale cancelled${s.cancel_reason ? ` · ${s.cancel_reason}` : ''}`,
            debit: 0,
            credit: off,
            taxable: -round2((off * Number(s.base_amount)) / Number(s.total_amount || 1)),
            gst: -round2((off * Number(s.gst_amount)) / Number(s.total_amount || 1)),
          })
      }
    }
    for (const p of payments ?? []) {
      const s = saleById.get(p.sale_id)
      if (!s || p.status !== 'received') continue
      const amt = Number(p.amount) + Number(p.tds_amount)
      out.push({
        key: `p-${p.id}`,
        date: p.paid_on,
        type: 'payment',
        customerId: p.customer_id,
        companyId: p.billing_company_id ?? s.billing_company_id,
        ref: p.reference ?? saleRef(s),
        description: [
          p.kind === 'initial' ? (s.plan === 'booking' ? 'Booking token' : s.plan === 'emi' ? 'Down payment' : 'Payment at sale') : (p.note ?? 'Payment'),
          data.modeName(p.payment_mode_id),
          Number(p.tds_amount) > 0 ? `incl. TDS ${rupees(p.tds_amount)}` : null,
          p.verified ? null : 'awaiting verification',
        ]
          .filter(Boolean)
          .join(' · '),
        debit: 0,
        credit: amt,
        taxable: 0,
        gst: 0,
      })
    }
    // invoices before payments on the same day
    const order = { invoice: 0, payment: 1, credit: 2 }
    return out.sort((a, b) => a.date.localeCompare(b.date) || order[a.type] - order[b.type])
  }, [data.sales, data.productById, data, payments, saleById])

  const scoped = all.filter((e) => (!customer || e.customerId === customer) && (!company || e.companyId === company))
  const before = scoped.filter((e) => from && e.date < from)
  const inRange = scoped.filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
  const opening = before.reduce((a, e) => a + e.debit - e.credit, 0)
  const invoiced = inRange.reduce((a, e) => a + e.debit, 0)
  const received = inRange.reduce((a, e) => a + e.credit, 0)
  const closing = opening + invoiced - received
  let running = opening
  const rows = inRange.map((e) => {
    running += e.debit - e.credit
    return { ...e, balance: round2(running) }
  })

  // GST summary: invoices (and cancellations) by month and billing company
  const gstRows = useMemo(() => {
    const m = new Map<string, { month: string; company: string | null; count: number; taxable: number; gst: number; total: number }>()
    for (const e of inRange) {
      if (e.type === 'payment') continue
      const k = `${e.date.slice(0, 7)}|${e.companyId}`
      const g = m.get(k) ?? { month: e.date.slice(0, 7), company: e.companyId, count: 0, taxable: 0, gst: 0, total: 0 }
      if (e.type === 'invoice') g.count++
      g.taxable += e.taxable
      g.gst += e.gst
      g.total += e.debit - e.credit
      m.set(k, g)
    }
    return [...m.values()].sort((a, b) => a.month.localeCompare(b.month) || (data.companyName(a.company) ?? '').localeCompare(data.companyName(b.company) ?? ''))
  }, [inRange, data])

  const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  const custName = (id: string) => custById.get(id)?.full_name ?? '—'

  function exportCsv() {
    const lines: (string | number)[][] =
      tab === 'ledger'
        ? [
            ['Date', 'Type', 'Customer', 'Billing company', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'],
            [from, 'Opening balance', '', '', '', '', '', '', round2(opening)],
            ...rows.map((r) => [r.date, r.type, custName(r.customerId), data.companyName(r.companyId) ?? '', r.ref, r.description, r.debit || '', r.credit || '', r.balance]),
            [to, 'Closing balance', '', '', '', '', round2(invoiced), round2(received), round2(closing)],
          ]
        : [
            ['Month', 'Billing company', 'GSTIN', 'Invoices', 'Taxable', 'GST', 'Total'],
            ...gstRows.map((g) => [
              g.month,
              data.companyName(g.company) ?? '',
              data.companies.find((c) => c.id === g.company)?.gst_number ?? '',
              g.count,
              round2(g.taxable),
              round2(g.gst),
              round2(g.total),
            ]),
          ]
    const csv = lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `${tab === 'ledger' ? 'ledger' : 'gst summary'} ${from} to ${to}${customer ? ` - ${custName(customer)}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const typeBadge = { invoice: 'badge-info', payment: 'badge-success', credit: 'badge-warning' } as const
  const typeLabel = { invoice: 'Invoice', payment: 'Payment', credit: 'Credit note' } as const
  const customersWithSales = data.allCustomers.filter((c) => data.salesByCustomer.has(c.id))

  return (
    <>
      <PageHead
        title="Ledger"
        subtitle={
          <>
            Sales as invoices (debit), payments as credits, with a running balance
            {selected ? ` · ${selected.name}` : ''}.
          </>
        }
      />
      {(error || data.error) && <div className="alert alert-error">{error ?? data.error}</div>}

      <div className="panel no-print">
        <div className="panel-filters">
          <div style={{ width: 260 }}>
            <SearchSelect
              value={customer}
              onChange={setCustomer}
              placeholder="All customers"
              searchPlaceholder="Search customers"
              options={[{ value: '', label: 'All customers' }, ...customersWithSales.map((c) => ({ value: c.id, label: c.full_name }))]}
            />
          </div>
          <select className="input input-sm filter-select" value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Billing company">
            <option value="">All billing companies</option>
            {data.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="row date-range">
            <span className="muted small">From</span>
            <input type="date" className="input input-sm" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <span className="muted small">to</span>
            <input type="date" className="input input-sm" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </span>
          <span className="row" style={{ marginLeft: 'auto', gap: 8 }}>
            {can('leads', 'export') && (
              <button type="button" className="btn btn-outline btn-sm" onClick={exportCsv}>
                <Download size={14} /> CSV
              </button>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}>
              <Printer size={14} /> Print
            </button>
          </span>
        </div>
      </div>

      <div className="print-only print-head">
        <b>{tab === 'ledger' ? 'Ledger' : 'GST summary'}</b> · {customer ? custName(customer) : 'All customers'}
        {company ? ` · ${data.companyName(company)}` : ''} · {fmtDay(from)} to {fmtDay(to)}
      </div>

      <div className="stat-grid">
        <StatCard icon={Scale} tone="ink" value={rupees(opening)} label="Opening balance" hint={`before ${fmtDay(from)}`} />
        <StatCard icon={FileText} tone="info" value={rupees(invoiced)} label="Invoiced (debit)" />
        <StatCard icon={Wallet} tone="success" value={rupees(received)} label="Received (credit)" hint="Includes TDS" />
        <StatCard icon={BookOpen} tone="danger" value={rupees(closing)} label="Closing balance" hint="Receivable" />
      </div>

      <div className="seg no-print">
        <button type="button" className={cn(tab === 'ledger' && 'is-active')} onClick={() => setTab('ledger')}>
          Ledger
        </button>
        <button type="button" className={cn(tab === 'gst' && 'is-active')} onClick={() => setTab('gst')}>
          GST summary
        </button>
      </div>

      <div className="panel">
        {!payments || !data.customers ? (
          <div className="empty">Loading…</div>
        ) : tab === 'ledger' ? (
          <div className="table-wrap">
            <table className="table ledger-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  {!customer && <th>Customer</th>}
                  <th>Billing company</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th className="right">Debit</th>
                  <th className="right">Credit</th>
                  <th className="right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="ledger-sum">
                  <td className="nowrap">{fmtDay(from)}</td>
                  <td colSpan={customer ? 5 : 6}>
                    <b>Opening balance</b>
                  </td>
                  <td />
                  <td className="right nowrap">
                    <b>{rupees(opening, true)}</b>
                  </td>
                </tr>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={customer ? 8 : 9} className="muted center">
                      No entries in this period.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="nowrap">{fmtDay(r.date)}</td>
                    <td>
                      <span className={cn('badge', typeBadge[r.type])}>{typeLabel[r.type]}</span>
                    </td>
                    {!customer && (
                      <td>
                        <button type="button" className="link-btn nowrap" onClick={() => navigate(`/customers?open=${r.customerId}`)}>
                          {custName(r.customerId)}
                        </button>
                      </td>
                    )}
                    <td className="nowrap">{data.companyName(r.companyId) ?? '—'}</td>
                    <td className="mono small">{r.ref}</td>
                    <td className="small">{r.description}</td>
                    <td className="right nowrap text-danger">{r.debit ? rupees(r.debit, true) : ''}</td>
                    <td className="right nowrap text-success">{r.credit ? rupees(r.credit, true) : ''}</td>
                    <td className="right nowrap">
                      <b>{rupees(r.balance, true)}</b>
                    </td>
                  </tr>
                ))}
                <tr className="ledger-sum">
                  <td className="nowrap">{fmtDay(to)}</td>
                  <td colSpan={customer ? 3 : 4}>
                    <b>Closing balance</b>
                  </td>
                  <td className="right nowrap">
                    <b>{rupees(invoiced, true)}</b>
                  </td>
                  <td className="right nowrap">
                    <b>{rupees(received, true)}</b>
                  </td>
                  <td className="right nowrap">
                    <b>{rupees(closing, true)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : gstRows.length === 0 ? (
          <Empty icon={FileText}>No invoices in this period.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Billing company</th>
                  <th>GSTIN</th>
                  <th className="right">Invoices</th>
                  <th className="right">Taxable</th>
                  <th className="right">GST</th>
                  <th className="right">Total</th>
                </tr>
              </thead>
              <tbody>
                {gstRows.map((g) => (
                  <tr key={`${g.month}-${g.company}`}>
                    <td className="nowrap">{monthName(g.month)}</td>
                    <td>{data.companyName(g.company) ?? '—'}</td>
                    <td className="mono small">{data.companies.find((c) => c.id === g.company)?.gst_number ?? '—'}</td>
                    <td className="right">{g.count}</td>
                    <td className="right nowrap">{rupees(g.taxable, true)}</td>
                    <td className="right nowrap">{rupees(g.gst, true)}</td>
                    <td className="right nowrap">
                      <b>{rupees(g.total, true)}</b>
                    </td>
                  </tr>
                ))}
                <tr className="ledger-sum">
                  <td colSpan={3}>
                    <b>Total</b>
                  </td>
                  <td className="right">{gstRows.reduce((a, g) => a + g.count, 0)}</td>
                  <td className="right nowrap">
                    <b>{rupees(gstRows.reduce((a, g) => a + g.taxable, 0), true)}</b>
                  </td>
                  <td className="right nowrap">
                    <b>{rupees(gstRows.reduce((a, g) => a + g.gst, 0), true)}</b>
                  </td>
                  <td className="right nowrap">
                    <b>{rupees(gstRows.reduce((a, g) => a + g.total, 0), true)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="muted small no-print">
        GST is on the invoice (sale) date. A cancelled sale gets a credit note for the part that wasn’t paid. Payments waiting for verification are included and marked.
      </p>
    </>
  )
}
