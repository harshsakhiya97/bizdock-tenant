import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { CreditCard } from 'lucide-react'
import { Empty, Paged } from '@/components/ui'
import { db } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import type { LeadRow } from '@/leads/types'

/**
 * Funnel → Payments: save the funnel's price; lists the Razorpay payments of exactly that amount whose phone (last 10
 * digits) or email matches one of this funnel's leads.
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
  paid_at: string
}

const STATUS: Record<string, { label: string; cls: string }> = {
  captured: { label: 'Captured', cls: 'badge-success' },
  authorized: { label: 'Authorized', cls: 'badge-info' },
  created: { label: 'Created', cls: 'badge-muted' },
  failed: { label: 'Failed', cls: 'badge-danger' },
  refunded: { label: 'Refunded', cls: 'badge-warning' },
}
const METHOD: Record<string, string> = { upi: 'UPI', card: 'Card', netbanking: 'Netbanking', wallet: 'Wallet', emi: 'EMI', cardless_emi: 'Cardless EMI', paylater: 'Pay later', bank_transfer: 'Bank transfer' }
const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const last10 = (p: string | null | undefined) => {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : ''
}
const mail = (e: string | null | undefined) => (e ?? '').trim().toLowerCase()

export function FunnelPaymentsTab({ funnelId, leads, canEdit }: { funnelId: string; leads: LeadRow[] | null; canEdit: boolean }) {
  const tenant = useTenant()
  const navigate = useNavigate()
  const [saved, setSaved] = useState<number | null | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [rows, setRows] = useState<Pay[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    db()
      .from('funnels')
      .select('payment_amount')
      .eq('id', funnelId)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        const v = data?.payment_amount == null ? null : Number(data.payment_amount)
        setSaved(v)
        setDraft(v == null ? '' : String(v))
      })
  }, [funnelId])

  const load = useCallback(() => {
    if (saved == null) {
      setRows([])
      return
    }
    setRows(null)
    db()
      .from('razorpay_payments')
      .select('id, payment_id, order_id, amount, status, method, email, phone, paid_at')
      .eq('tenant_id', tenant.id)
      .eq('amount', saved)
      .order('paid_at', { ascending: false })
      .limit(10000)
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        setRows((data ?? []) as Pay[])
      })
  }, [tenant.id, saved])
  useEffect(load, [load])

  async function save() {
    const v = draft.trim() === '' ? null : Number(draft)
    if (v != null && (!Number.isFinite(v) || v <= 0)) {
      setError('Enter an amount in ₹, more than 0.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    const { error: e } = await db().from('funnels').update({ payment_amount: v }).eq('id', funnelId)
    setBusy(false)
    if (e) return setError(e.message)
    setSaved(v)
    setNotice(v == null ? 'Amount cleared.' : `Saved · showing payments of ${inr(v)}.`)
  }

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

  return (
    <section className="panel">
      <div className="panel-filters">
        <label className="muted small" htmlFor="funnel-pay-amount">
          Amount (₹)
        </label>
        <input
          id="funnel-pay-amount"
          className="input input-sm"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="e.g. 999"
          style={{ width: 140 }}
          value={draft}
          disabled={!canEdit || saved === undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canEdit && void save()}
        />
        {canEdit && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={busy || saved === undefined || draft.trim() === (saved == null ? '' : String(saved))}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        )}
        {saved != null && rows && (
          <span className="muted small" style={{ marginLeft: 'auto' }}>
            {matched.length} payment{matched.length === 1 ? '' : 's'} of {inr(saved)} from this funnel’s leads
          </span>
        )}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      {saved === undefined || (saved != null && (!rows || !leads)) ? (
        <div className="empty">Loading…</div>
      ) : saved == null ? (
        <Empty icon={CreditCard}>Add the amount this funnel sells at and Save — its Razorpay payments of that amount, from this funnel’s leads, show here.</Empty>
      ) : !matched.length ? (
        <Empty icon={CreditCard}>No Razorpay payments of {inr(saved)} from this funnel’s leads (matched by phone or email).</Empty>
      ) : (
        <Paged rows={matched} reset={[saved]}>
          {(paged) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Paid on</th>
                    <th>Lead</th>
                    <th>Phone / email</th>
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
                      <tr key={p.id} className={cn('is-clickable')} onClick={() => navigate(`/leads/${lead.id}`)} title="Open the lead">
                        <td className="nowrap">{when(p.paid_at)}</td>
                        <td>
                          <b>{[lead.first_name, lead.last_name].filter(Boolean).join(' ')}</b>
                        </td>
                        <td className="small">
                          {p.phone && <div>{p.phone}</div>}
                          {p.email && <div className="muted">{p.email}</div>}
                        </td>
                        <td className="num nowrap">{inr(p.amount)}</td>
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
  )
}
