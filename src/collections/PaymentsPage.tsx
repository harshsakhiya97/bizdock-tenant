import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { BadgeCheck, Ban, Download, IndianRupee, Landmark, Percent, Plus, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Label, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { Empty, PageHead, SearchInput, StatCard } from '@/components/ui'
import { fmtDay, rupees, todayIso } from '@/customers/labels'
import type { PaymentFull } from '@/customers/types'
import { useSalesData } from '@/customers/useSalesData'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { cancelPayment, listAllPayments, verifyPayment } from './paymentsApi'
import { RecordPaymentModal } from './RecordPaymentModal'
import { Flash } from '@/components/Flash'

const monthStart = () => `${todayIso().slice(0, 8)}01`
const round2 = (n: number) => Math.round(n * 100) / 100

type Status = 'live' | 'verified' | 'pending' | 'cancelled'

/** Every payment received: totals, split by mode and billing company, verify and cancel. */
export function PaymentsPage() {
  const tenant = useTenant()
  const data = useSalesData()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [payments, setPayments] = useState<PaymentFull[] | null>(null)
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayIso())
  const [mode, setMode] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState<Status>('live')
  const [by, setBy] = useState('')
  const [q, setQ] = useState('')
  const [recording, setRecording] = useState(false)
  const [cancelling, setCancelling] = useState<PaymentFull | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  const loadPayments = useCallback(() => {
    listAllPayments(tenant.id)
      .then(setPayments)
      .catch((e: Error) => setNotice({ error: e.message }))
  }, [tenant.id])
  useEffect(loadPayments, [loadPayments])
  const reload = () => {
    loadPayments()
    data.load()
  }

  // payments of sales this person can see, in the business picked in the top bar
  const saleById = useMemo(() => new Map(data.sales.map((s) => [s.id, s])), [data.sales])
  const custById = useMemo(() => new Map(data.allCustomers.map((c) => [c.id, c])), [data.allCustomers])

  const rows = (payments ?? [])
    .filter((p) => saleById.has(p.sale_id))
    .filter((p) => (!from || p.paid_on >= from) && (!to || p.paid_on <= to))
    .filter((p) =>
      status === 'live'
        ? p.status === 'received'
        : status === 'verified'
          ? p.status === 'received' && p.verified
          : status === 'pending'
            ? p.status === 'received' && !p.verified
            : p.status === 'cancelled',
    )
    .filter((p) => !mode || p.payment_mode_id === mode)
    .filter((p) => !company || (p.billing_company_id ?? saleById.get(p.sale_id)?.billing_company_id) === company)
    .filter((p) => !by || p.received_by === by)
    .filter((p) => {
      const t = q.trim().toLowerCase()
      if (!t) return true
      return (
        (custById.get(p.customer_id)?.full_name ?? '').toLowerCase().includes(t) ||
        (p.reference ?? '').toLowerCase().includes(t) ||
        (p.gateway_order_id ?? '').toLowerCase().includes(t)
      )
    })

  const gstOf = (p: PaymentFull) => {
    const s = saleById.get(p.sale_id)
    const rate = s?.gst_applicable ? Number(s.gst_rate) : 0
    return round2(Number(p.amount) - Number(p.amount) / (1 + rate / 100))
  }
  const companyOf = (p: PaymentFull) => p.billing_company_id ?? saleById.get(p.sale_id)?.billing_company_id ?? null
  const counted = rows.filter((p) => p.status === 'received')
  const total = counted.reduce((a, p) => a + Number(p.amount), 0)
  const gst = counted.reduce((a, p) => a + gstOf(p), 0)
  const charges = counted.reduce((a, p) => a + Number(p.gateway_charge), 0)
  const pendingCount = (payments ?? []).filter((p) => saleById.has(p.sale_id) && p.status === 'received' && !p.verified).length

  const group = (key: (p: PaymentFull) => string | null, name: (k: string | null) => string) => {
    const m = new Map<string | null, { n: number; total: number; gst: number }>()
    for (const p of counted) {
      const k = key(p)
      const g = m.get(k) ?? { n: 0, total: 0, gst: 0 }
      g.n++
      g.total += Number(p.amount)
      g.gst += gstOf(p)
      m.set(k, g)
    }
    return [...m.entries()].map(([k, v]) => ({ name: name(k), ...v })).sort((a, b) => b.total - a.total)
  }
  const byMode = group((p) => p.payment_mode_id, (k) => data.modeName(k) ?? 'Not set')
  const byCompany = group(companyOf, (k) => data.companyName(k) ?? 'Not set')

  async function verify(p: PaymentFull) {
    try {
      await verifyPayment(p.id)
      setNotice({ ok: `${rupees(p.amount, true)} from ${custById.get(p.customer_id)?.full_name ?? 'customer'} verified.` })
      reload()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }

  async function doCancel() {
    if (!cancelling || !reason.trim()) return
    setBusy(true)
    try {
      await cancelPayment(cancelling.id, reason)
      setNotice({ ok: 'Payment cancelled. Its amount is due again.' })
      setCancelling(null)
      setReason('')
      reload()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  function exportCsv() {
    const out = [
      ['Paid on', 'Customer', 'Product', 'Amount', 'Taxable', 'GST', 'TDS', 'Gateway charge', 'Mode', 'UTR / reference', 'Gateway order', 'Billing company', 'Status', 'Verified', 'Received by', 'Remark'],
      ...rows.map((p) => {
        const s = saleById.get(p.sale_id)
        return [
          p.paid_on,
          custById.get(p.customer_id)?.full_name ?? '',
          s ? (data.saleTitle(s)) : '',
          p.amount,
          round2(Number(p.amount) - gstOf(p)),
          gstOf(p),
          p.tds_amount,
          p.gateway_charge,
          data.modeName(p.payment_mode_id) ?? '',
          p.reference ?? '',
          p.gateway_order_id ?? '',
          data.companyName(companyOf(p)) ?? '',
          p.status,
          p.verified ? 'yes' : 'no',
          data.memberName(p.received_by) ?? '',
          p.remark ?? '',
        ]
      }),
    ]
    const csv = out.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `payments ${from || 'all'} to ${to || 'today'}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const canCancel = can('payments', 'verify') || can('deals', 'edit')

  return (
    <>
      <PageHead
        title="Payments"
        subtitle="Every payment received, with GST and gateway charges. Only verified payments count as revenue."
        actions={
          can('payments', 'add') && (
            <button type="button" className="btn btn-success" onClick={() => setRecording(true)}>
              <Plus size={16} /> Record payment
            </button>
          )
        }
      />
      {(notice.error || data.error) && <div className="alert alert-error">{notice.error ?? data.error}</div>}
      <Flash msg={notice.ok} dep={notice} />
      {pendingCount > 0 && status !== 'pending' && (
        <div className="alert alert-warning row-between">
          <span>
            {pendingCount} payment{pendingCount > 1 ? 's are' : ' is'} waiting for verification.
          </span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setStatus('pending')}>
            Show them
          </button>
        </div>
      )}

      <div className="panel">
        <div className="panel-filters">
          <span className="row date-range">
            <input type="date" className="input input-sm" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <span className="muted small">to</span>
            <input type="date" className="input input-sm" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </span>
          <select className="input input-sm filter-select" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode">
            <option value="">Mode</option>
            {data.modes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Billing company">
            <option value="">Billing company</option>
            {data.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={status} onChange={(e) => setStatus(e.target.value as Status)} aria-label="Status">
            <option value="live">Verified + waiting</option>
            <option value="verified">Verified</option>
            <option value="pending">Waiting for verification</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select className="input input-sm filter-select" value={by} onChange={(e) => setBy(e.target.value)} aria-label="Received by">
            <option value="">Received by</option>
            {data.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <SearchInput placeholder="UTR, order ID, customer" value={q} onChange={setQ} width={200} />
          {can('leads', 'export') && (
            <button type="button" className="btn btn-outline btn-sm" onClick={exportCsv} disabled={!rows.length}>
              <Download size={14} /> Export CSV
            </button>
          )}
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon={Wallet} tone="success" value={rupees(total)} label={`Collected (${counted.length})`} />
        <StatCard icon={IndianRupee} tone="info" value={rupees(total - gst)} label="Base (taxable)" />
        <StatCard icon={Percent} tone="purple" value={rupees(gst)} label="GST" />
        <StatCard icon={Landmark} tone="warning" value={rupees(charges)} label="Gateway charges" />
      </div>

      <div className="panel">
          {!payments || !data.customers ? (
            <div className="empty">Loading payments…</div>
          ) : rows.length === 0 ? (
            <Empty icon={Wallet}>No payments in this period.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table pay-table">
                <thead>
                  <tr>
                    <th>Paid on</th>
                    <th>Customer</th>
                    <th>Product</th>
                    <th className="right">Amount</th>
                    <th className="right">GST</th>
                    <th>Mode</th>
                    <th>UTR / order</th>
                    <th>Company</th>
                    <th>Status</th>
                    <th>By</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const s = saleById.get(p.sale_id)
                    return (
                      <tr key={p.id} className={p.status === 'cancelled' ? 'is-off' : undefined}>
                        <td className="nowrap">{fmtDay(p.paid_on)}</td>
                        <td>
                          <button type="button" className="link-btn nowrap" onClick={() => navigate(`/customers?open=${p.customer_id}`)}>
                            {custById.get(p.customer_id)?.full_name ?? '—'}
                          </button>
                          <div className="muted small">{p.kind === 'initial' ? 'At sale' : (p.note ?? 'Collection')}</div>
                        </td>
                        <td>{s ? data.saleTitle(s) : '—'}</td>
                        <td className="right nowrap">
                          <b>{rupees(p.amount, true)}</b>
                          {Number(p.tds_amount) > 0 && <div className="muted small">+ TDS {rupees(p.tds_amount)}</div>}
                        </td>
                        <td className="right nowrap muted">{rupees(gstOf(p))}</td>
                        <td className="nowrap">{data.modeName(p.payment_mode_id) ?? '—'}</td>
                        <td className="mono small">
                          {p.reference ?? '—'}
                          {p.gateway_order_id && <div className="muted">{p.gateway_order_id}</div>}
                        </td>
                        <td className="nowrap">{data.companyName(companyOf(p)) ?? '—'}</td>
                        <td>
                          {p.status === 'cancelled' ? (
                            <span className="badge badge-danger" title={p.cancel_reason ?? undefined}>
                              Cancelled
                            </span>
                          ) : p.verified ? (
                            <span className="badge badge-success">Verified</span>
                          ) : (
                            <span className="badge badge-warning">Waiting</span>
                          )}
                        </td>
                        <td className="nowrap">{data.memberName(p.received_by) ?? '—'}</td>
                        <td className="nowrap right">
                          <span className="row-actions">
                            {p.status === 'received' && !p.verified && can('payments', 'verify') && (
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => verify(p)}>
                                <BadgeCheck size={14} /> Verify
                              </button>
                            )}
                            {p.status === 'received' && p.kind === 'collection' && canCancel && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label="Cancel payment"
                                title="Cancel payment"
                                onClick={() => setCancelling(p)}
                              >
                                <Ban size={15} />
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <div className="split-grid">
          <div className="panel">
            <div className="panel-bar">
              <b>By mode</b>
            </div>
            <SplitTable rows={byMode} />
          </div>
          <div className="panel">
            <div className="panel-bar">
              <b>By billing company</b>
            </div>
            <SplitTable rows={byCompany} showGst />
          </div>
      </div>

      {recording && (
        <RecordPaymentModal
          data={data}
          onClose={() => setRecording(false)}
          onSaved={(msg) => {
            setRecording(false)
            setNotice({ ok: msg })
            reload()
          }}
        />
      )}

      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Cancel this payment?"
        width={460}
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelling(null)}>
              Keep it
            </Button>
            <Button variant="danger" disabled={!reason.trim() || busy} onClick={doCancel}>
              Cancel payment
            </Button>
          </>
        }
      >
        <p className="muted">
          {cancelling && `${rupees(cancelling.amount, true)} on ${fmtDay(cancelling.paid_on)}. `}The amount becomes due again on the customer’s instalments. The
          payment stays in the list as cancelled.
        </p>
        <Label htmlFor="pc-reason" required>
          Reason
        </Label>
        <TextInput id="pc-reason" placeholder="e.g. Cheque bounced, entered twice" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Modal>
    </>
  )
}

function SplitTable({ rows, showGst }: { rows: { name: string; n: number; total: number; gst: number }[]; showGst?: boolean }) {
  if (!rows.length) return <div className="empty small">Nothing yet.</div>
  return (
    <table className="table table-split">
      <thead>
        <tr>
          <th>{showGst ? 'Company' : 'Mode'}</th>
          <th className="right">Total</th>
          {showGst && <th className="right">GST</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td>
              {r.name} <span className="muted small">({r.n})</span>
            </td>
            <td className={cn('right nowrap')}>{rupees(r.total)}</td>
            {showGst && <td className="right nowrap muted">{rupees(r.gst)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
