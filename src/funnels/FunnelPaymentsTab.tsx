import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { CreditCard } from 'lucide-react'
import { Empty, Paged } from '@/components/ui'
import { db } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import type { LeadRow } from '@/leads/types'

/**
 * Funnel → Payments: pick the Razorpay product names (the payment's description) this funnel sells and Save; lists those
 * payments whose phone (last 10 digits) or email matches one of this funnel's leads.
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
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

export function FunnelPaymentsTab({ funnelId, leads, canEdit }: { funnelId: string; leads: LeadRow[] | null; canEdit: boolean }) {
  const tenant = useTenant()
  const navigate = useNavigate()
  const [saved, setSaved] = useState<string[] | undefined>(undefined)
  const [draft, setDraft] = useState<string[]>([])
  const [rows, setRows] = useState<Pay[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    db()
      .from('funnels')
      .select('payment_descriptions')
      .eq('id', funnelId)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        const v = ((data?.payment_descriptions ?? []) as string[]).filter(Boolean)
        setSaved(v)
        setDraft(v)
      })
  }, [funnelId])

  // every Razorpay payment with a description (the product names to pick from, and the list)
  const load = useCallback(() => {
    setRows(null)
    db()
      .from('razorpay_payments')
      .select('id, payment_id, order_id, amount, status, method, email, phone, description, paid_at')
      .eq('tenant_id', tenant.id)
      .not('description', 'is', null)
      .order('paid_at', { ascending: false })
      .limit(10000)
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        setRows((data ?? []) as Pay[])
      })
  }, [tenant.id])
  useEffect(load, [load])

  // product names, most payments first (a saved one stays listed even with no payments now)
  const options = useMemo(() => {
    const n = new Map<string, number>()
    for (const r of rows ?? []) {
      const d = (r.description ?? '').trim()
      if (d) n.set(d, (n.get(d) ?? 0) + 1)
    }
    for (const d of saved ?? []) if (!n.has(d)) n.set(d, 0)
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [rows, saved])

  async function save() {
    setBusy(true)
    setError(null)
    setNotice(null)
    const { error: e } = await db().from('funnels').update({ payment_descriptions: draft }).eq('id', funnelId)
    setBusy(false)
    if (e) return setError(e.message)
    setSaved(draft)
    setNotice(draft.length ? 'Saved.' : 'Cleared.')
  }
  const toggle = (d: string) => setDraft((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))

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
        .filter((p) => (saved ?? []).includes((p.description ?? '').trim()))
        .map((p) => ({ p, lead: byPhone.get(last10(p.phone)) ?? byEmail.get(mail(p.email)) ?? null }))
        .filter((x): x is { p: Pay; lead: LeadRow } => !!x.lead),
    [rows, saved, byPhone, byEmail],
  )

  return (
    <section className="panel">
      <div className="panel-filters" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="muted small" style={{ marginBottom: 6 }}>
            Razorpay product (payment description) this funnel sells — pick one or more
          </div>
          {!rows || saved === undefined ? (
            <span className="muted small">Loading…</span>
          ) : !options.length ? (
            <span className="muted small">No Razorpay payments with a description yet.</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {options.map(([d, c]) => (
                <button
                  key={d}
                  type="button"
                  className={cn('btn btn-sm', draft.includes(d) ? 'btn-primary' : 'btn-outline')}
                  disabled={!canEdit}
                  onClick={() => toggle(d)}
                  title={canEdit ? undefined : 'You can’t edit this funnel'}
                >
                  {d} <span className={draft.includes(d) ? undefined : 'muted'}>({c})</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {canEdit && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={busy || saved === undefined || same(draft, saved)}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      {!!saved?.length && rows && (
        <div className="muted small" style={{ padding: '0 16px 8px' }}>
          {matched.length} payment{matched.length === 1 ? '' : 's'} from this funnel’s leads (matched by phone or email)
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      {saved === undefined || !rows || !leads ? (
        <div className="empty">Loading…</div>
      ) : !saved.length ? (
        <Empty icon={CreditCard}>Pick the Razorpay product this funnel sells and Save — its payments from this funnel’s leads show here.</Empty>
      ) : !matched.length ? (
        <Empty icon={CreditCard}>No payments for {saved.join(', ')} from this funnel’s leads (matched by phone or email).</Empty>
      ) : (
        <Paged rows={matched} reset={[saved.join('|')]}>
          {(paged) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Paid on</th>
                    <th>Lead</th>
                    <th>Phone / email</th>
                    <th>Product</th>
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
                        <td className="small">{p.description}</td>
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
