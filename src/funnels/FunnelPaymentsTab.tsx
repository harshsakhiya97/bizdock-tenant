import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { CreditCard } from 'lucide-react'
import { SearchSelect } from '@/components/SearchSelect'
import { Empty, Paged } from '@/components/ui'
import { db } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import type { LeadRow } from '@/leads/types'

/**
 * Funnel → Payments: every Razorpay payment (all accounts) whose phone (last 10 digits) or email matches one of this
 * funnel's leads — nothing to set up. Filter by account and status; totals on top.
 */
type Pay = {
  id: string
  payment_id: string
  order_id: string | null
  amount: number
  status: string | null
  method: string | null
  email: string | null
  phone: string | null
  description: string | null
  paid_at: string
  amount_refunded: number
  integration_id: string | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  captured: { label: 'Captured', cls: 'badge-success' },
  authorized: { label: 'Authorized', cls: 'badge-info' },
  created: { label: 'Created', cls: 'badge-muted' },
  failed: { label: 'Failed', cls: 'badge-danger' },
  refunded: { label: 'Refunded', cls: 'badge-warning' },
}
const METHOD: Record<string, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Netbanking',
  wallet: 'Wallet',
  emi: 'EMI',
  cardless_emi: 'Cardless EMI',
  paylater: 'Pay later',
  bank_transfer: 'Bank transfer',
}
const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
const last10 = (p: string | null | undefined) => {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : ''
}
const mail = (e: string | null | undefined) => (e ?? '').trim().toLowerCase()

export function FunnelPaymentsTab({ leads }: { funnelId: string; leads: LeadRow[] | null; canEdit: boolean }) {
  const tenant = useTenant()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Pay[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([])
  const [account, setAccount] = useState('')
  const [status, setStatus] = useState('')

  const load = useCallback(() => {
    setRows(null)
    db()
      .from('razorpay_payments')
      .select('id, payment_id, order_id, amount, amount_refunded, status, method, email, phone, description, paid_at, integration_id')
      .eq('tenant_id', tenant.id)
      .order('paid_at', { ascending: false })
      .limit(20000)
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        setRows((data ?? []) as Pay[])
      })
    db()
      .rpc('razorpay_accounts', { p_tenant: tenant.id })
      .then(({ data }) => setAccounts((data ?? []) as { id: string; label: string }[]))
  }, [tenant.id])
  useEffect(load, [load])
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.label ?? (id ? 'Razorpay' : 'Removed account')

  // this funnel's leads by phone (last 10 digits) and email
  const { byPhone, byEmail } = useMemo(() => {
    const byPhone = new Map<string, LeadRow>()
    const byEmail = new Map<string, LeadRow>()
    for (const l of leads ?? []) {
      const p = last10(l.phone)
      if (p && !byPhone.has(p)) byPhone.set(p, l)
      const m = mail(l.email)
      if (m && !byEmail.has(m)) byEmail.set(m, l)
    }
    return { byPhone, byEmail }
  }, [leads])
  const matched = useMemo(
    () =>
      (rows ?? [])
        .map((p) => ({ p, lead: byPhone.get(last10(p.phone)) ?? byEmail.get(mail(p.email)) ?? null }))
        .filter((x): x is { p: Pay; lead: LeadRow } => !!x.lead),
    [rows, byPhone, byEmail],
  )
  const shown = useMemo(() => matched.filter(({ p }) => (!account || p.integration_id === account) && (!status || p.status === status)), [matched, account, status])
  const paid = shown.filter(({ p }) => p.status === 'captured' || p.status === 'refunded')
  const received = paid.reduce((t, { p }) => t + Number(p.amount) - Number(p.amount_refunded || 0), 0)
  const payers = new Set(paid.map(({ lead }) => lead.id)).size

  return (
    <div className="stack">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="muted small">Every Razorpay payment (all accounts) whose phone or email matches a lead of this funnel.</div>
      {!rows || !leads ? (
        <div className="empty">Loading…</div>
      ) : !matched.length ? (
        <Empty icon={CreditCard}>No Razorpay payments from this funnel’s leads yet (matched by phone or email).</Empty>
      ) : (
        <section className="panel">
          <div className="panel-filters">
            <span className="small">
              <b>{inr(received)}</b> received · <b>{paid.length}</b> paid payment{paid.length === 1 ? '' : 's'} from <b>{payers}</b> lead{payers === 1 ? '' : 's'} · {shown.length} in all
            </span>
            <div className="filter-ss">
              <SearchSelect
                value={account || null}
                onChange={(v) => setAccount(v ?? '')}
                options={[{ value: '', label: 'All accounts' }, ...accounts.map((a) => ({ value: a.id, label: `${a.label} (${matched.filter(({ p }) => p.integration_id === a.id).length})` }))]}
                placeholder="Account"
                searchPlaceholder="Search accounts…"
                ariaLabel="Razorpay account"
              />
            </div>
            <div className="filter-ss">
              <SearchSelect
                value={status || null}
                onChange={(v) => setStatus(v ?? '')}
                options={[{ value: '', label: 'All statuses' }, ...Object.entries(STATUS).map(([k, v]) => ({ value: k, label: `${v.label} (${matched.filter(({ p }) => p.status === k).length})` }))]}
                placeholder="Status"
                searchPlaceholder="Search…"
                ariaLabel="Status"
              />
            </div>
          </div>
          {!shown.length ? (
            <Empty icon={CreditCard}>No payments for these filters.</Empty>
          ) : (
            <Paged rows={shown} reset={[account, status]}>
              {(paged) => (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Paid on</th>
                        <th>Account</th>
                        <th>Lead</th>
                        <th>Phone / email</th>
                        <th>Description</th>
                        <th className="num">Amount</th>
                        <th>Status</th>
                        <th>Method</th>
                        <th>Payment / order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map(({ p, lead }) => {
                        const st = STATUS[p.status ?? ''] ?? { label: p.status ?? '—', cls: 'badge-muted' }
                        return (
                          <tr key={p.id} className="is-clickable" onClick={() => navigate(`/leads/${lead.id}`)} title="Open the lead">
                            <td className="nowrap">{when(p.paid_at)}</td>
                            <td className="nowrap">{accountName(p.integration_id)}</td>
                            <td>
                              <b>{[lead.first_name, lead.last_name].filter(Boolean).join(' ')}</b>
                            </td>
                            <td className="small">
                              {p.phone && <div>{p.phone}</div>}
                              {p.email && <div className="muted">{p.email}</div>}
                            </td>
                            <td className="small">{p.description || '—'}</td>
                            <td className="num nowrap">
                              {inr(p.amount)}
                              {Number(p.amount_refunded) > 0 && <div className="muted small">−{inr(p.amount_refunded)} refunded</div>}
                            </td>
                            <td>
                              <span className={cn('badge', st.cls)}>{st.label}</span>
                            </td>
                            <td className="nowrap">{p.method ? (METHOD[p.method] ?? p.method) : '—'}</td>
                            <td className="small nowrap">
                              <code>{p.payment_id}</code>
                              {p.order_id && (
                                <div className="muted">
                                  <code>{p.order_id}</code>
                                </div>
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
        </section>
      )}
    </div>
  )
}
