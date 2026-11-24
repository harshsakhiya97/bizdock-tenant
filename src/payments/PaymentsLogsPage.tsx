import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { BadgeIndianRupee, CircleX, CreditCard, RefreshCw, Undo2 } from 'lucide-react'
import { Empty, PageHead, Paged, SearchInput, StatCard } from '@/components/ui'
import { ALL_DATES, DateRangePicker, type Range } from '@/components/DateRange'
import { StatRecords, type StatShow } from '@/components/StatRecords'
import { db } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'

/** Payments → History logs: every Razorpay payment (synced every 5 minutes), matched to a lead by phone / email. */
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
  notes: Record<string, unknown>
  amount_refunded: number
  error_description: string | null
  vpa: string | null
  bank: string | null
  wallet: string | null
  paid_at: string
  lead_id: string | null
  leads: { first_name: string; last_name: string | null } | null
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
const nicePhone = (p: string | null) => {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 10 ? `+${d.length === 10 ? '91' : ''}${d.slice(0, -10)} ${d.slice(-10, -5)} ${d.slice(-5)}`.replace('+ ', '+') : (p ?? '')
}
/** the name the payer typed, if the payment page asked for it (in the notes) */
const noteName = (n: Record<string, unknown>) => {
  const k = Object.keys(n ?? {}).find((x) => /name/i.test(x))
  return k ? String(n[k] ?? '').trim() : ''
}

export function PaymentsLogsPage() {
  const tenant = useTenant()
  const navigate = useNavigate()
  const [range, setRange] = useState<Range>(ALL_DATES)
  const { from, to } = range
  const [rows, setRows] = useState<Pay[] | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [method, setMethod] = useState('')
  const [matched, setMatched] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(() => {
    setRows(null)
    setError(null)
    let q = db()
      .from('razorpay_payments')
      .select('id, payment_id, order_id, amount, status, method, email, phone, description, notes, amount_refunded, error_description, vpa, bank, wallet, paid_at, lead_id, leads(first_name, last_name)')
      .eq('tenant_id', tenant.id)
    // All dates: no date limits
    if (from && to) q = q.gte('paid_at', new Date(`${from}T00:00:00`).toISOString()).lte('paid_at', new Date(`${to}T23:59:59.999`).toISOString())
    q.order('paid_at', { ascending: false })
      .limit(10000)
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        setRows((data ?? []) as unknown as Pay[])
      })
  }, [tenant.id, from, to])
  useEffect(load, [load])

  async function sync() {
    setSyncing(true)
    setError(null)
    setNotice(null)
    try {
      const { data, error: e } = await db().functions.invoke('razorpay', { body: { action: 'sync', tenant_id: tenant.id } })
      if (e) {
        const ctx = (e as { context?: Response }).context
        throw new Error((ctx ? await ctx.json().then((j) => j?.error).catch(() => null) : null) || e.message)
      }
      if (data?.error) throw new Error(data.error)
      setNotice(`Synced with Razorpay · ${data?.saved ?? 0} payment${data?.saved === 1 ? '' : 's'} checked.`)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  const name = (p: Pay) => (p.leads ? [p.leads.first_name, p.leads.last_name].filter(Boolean).join(' ') : noteName(p.notes))
  const methods = useMemo(() => [...new Set((rows ?? []).map((r) => r.method).filter(Boolean) as string[])].sort(), [rows])
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (rows ?? []).filter(
      (r) =>
        (!status || r.status === status) &&
        (!method || r.method === method) &&
        (!matched || (matched === 'yes' ? !!r.lead_id : !r.lead_id)) &&
        (!s || `${name(r)} ${r.phone ?? ''} ${r.email ?? ''} ${r.payment_id} ${r.order_id ?? ''} ${r.description ?? ''}`.toLowerCase().includes(s)),
    )
  }, [rows, q, status, method, matched])
  const n = (f: (r: Pay) => boolean) => (rows ?? []).filter(f).length

  // the cards follow the filters
  const captured = shown.filter((r) => r.status === 'captured' || r.status === 'refunded')
  const total = captured.reduce((t, r) => t + Number(r.amount), 0)
  const refunded = shown.reduce((t, r) => t + Number(r.amount_refunded || 0), 0)
  const failed = shown.filter((r) => r.status === 'failed').length
  // a stat card's records: those payments (click one with a lead to open it)
  const [statShow, setStatShow] = useState<StatShow<Pay> | null>(null)
  const showPay = (title: string, f: (r: Pay) => boolean) => () =>
    setStatShow({
      title,
      rows: shown.filter(f),
      cols: [
        { label: 'Paid on', render: (r) => <span className="nowrap">{when(r.paid_at)}</span> },
        {
          label: 'Payer',
          render: (r) => (
            <>
              <b>{name(r) || nicePhone(r.phone) || r.email || '—'}</b>
              {name(r) && r.phone && <div className="muted small">{nicePhone(r.phone)}</div>}
            </>
          ),
        },
        { label: 'Product', render: (r) => r.description || <span className="muted">—</span> },
        { label: 'Amount', num: true, render: (r) => inr(r.amount) },
        { label: 'Refunded', num: true, render: (r) => (Number(r.amount_refunded) > 0 ? inr(r.amount_refunded) : <span className="muted">—</span>) },
        {
          label: 'Status',
          render: (r) => {
            const st = STATUS[r.status ?? ''] ?? { label: r.status ?? '—', cls: 'badge-muted' }
            return <span className={cn('badge', st.cls)}>{st.label}</span>
          },
        },
      ],
    })

  return (
    <>
      <PageHead
        title="History logs"
        subtitle="Every Razorpay payment (checked every 5 minutes), matched to a lead by phone, else email."
        actions={
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void sync()} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? 'spin' : undefined} /> {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        }
      />
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      <div className="stat-grid">
        <StatCard icon={BadgeIndianRupee} tone="success" value={inr(total)} label="Received" hint={`${captured.length} payment${captured.length === 1 ? '' : 's'} captured`} onClick={showPay('Received', (r) => r.status === 'captured' || r.status === 'refunded')} />
        <StatCard icon={CreditCard} tone="info" value={shown.length} label="Payments" hint="All statuses, with these filters" onClick={showPay('Payments', () => true)} />
        <StatCard icon={CircleX} tone="danger" value={failed} label="Failed" onClick={showPay('Failed', (r) => r.status === 'failed')} />
        <StatCard icon={Undo2} tone="warning" value={inr(refunded)} label="Refunded" onClick={showPay('Refunded', (r) => Number(r.amount_refunded) > 0)} />
      </div>
      <StatRecords show={statShow} onClose={() => setStatShow(null)} rowKey={(r) => r.id} onRow={(r) => r.lead_id && navigate(`/leads/${r.lead_id}`)} />
      <section className="panel">
        <div className="panel-filters">
          <SearchInput placeholder="Name, phone, email or payment ID" value={q} onChange={setQ} width={260} />
          <select className="input input-sm filter-select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label} ({n((r) => r.status === k)})
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">All methods</option>
            {methods.map((m) => (
              <option key={m} value={m}>
                {METHOD[m] ?? m} ({n((r) => r.method === m)})
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" aria-label="Lead" value={matched} onChange={(e) => setMatched(e.target.value)}>
            <option value="">Lead: all</option>
            <option value="yes">Matched to a lead ({n((r) => !!r.lead_id)})</option>
            <option value="no">No lead ({n((r) => !r.lead_id)})</option>
          </select>
          <DateRangePicker value={range} onChange={setRange} allDates />
          {(q || status || method || matched) && (
            <button
              type="button"
              className="clear-btn"
              onClick={() => {
                setQ('')
                setStatus('')
                setMethod('')
                setMatched('')
              }}
            >
              Reset
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={load} title="Refresh" aria-label="Refresh" style={{ marginLeft: 'auto' }}>
            <RefreshCw size={14} />
          </button>
        </div>
        {!rows ? (
          <div className="empty">Loading…</div>
        ) : !shown.length ? (
          <Empty icon={CreditCard}>No payments for these filters.</Empty>
        ) : (
          <Paged rows={shown} reset={[from, to, q, status, method, matched]}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Paid on</th>
                      <th>Payer</th>
                      <th className="num">Amount</th>
                      <th>Status</th>
                      <th>Method</th>
                      <th>Payment / order</th>
                      <th>Description / notes</th>
                      <th>Lead</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((r) => {
                      const st = STATUS[r.status ?? ''] ?? { label: r.status ?? '—', cls: 'badge-muted' }
                      const notes = Object.entries(r.notes ?? {}).filter(([, v]) => v != null && String(v).trim())
                      const via = r.vpa || r.bank || r.wallet
                      return (
                        <tr key={r.id} className={cn(r.lead_id && 'is-clickable')} onClick={() => r.lead_id && navigate(`/leads/${r.lead_id}`)} title={r.lead_id ? 'Open the lead' : undefined}>
                          <td className="nowrap">{when(r.paid_at)}</td>
                          <td>
                            <b>{name(r) || nicePhone(r.phone) || r.email || '—'}</b>
                            {name(r) && r.phone && <div className="muted small">{nicePhone(r.phone)}</div>}
                            {r.email && <div className="muted small">{r.email}</div>}
                          </td>
                          <td className="num nowrap">
                            {inr(r.amount)}
                            {Number(r.amount_refunded) > 0 && <div className="muted small">−{inr(r.amount_refunded)} refunded</div>}
                          </td>
                          <td>
                            <span className={cn('badge', st.cls)}>{st.label}</span>
                            {r.status === 'failed' && r.error_description && <div className="muted small">{r.error_description}</div>}
                          </td>
                          <td className="nowrap">
                            {r.method ? (METHOD[r.method] ?? r.method) : '—'}
                            {via && <div className="muted small">{via}</div>}
                          </td>
                          <td className="small nowrap">
                            <code>{r.payment_id}</code>
                            {r.order_id && (
                              <div className="muted">
                                <code>{r.order_id}</code>
                              </div>
                            )}
                          </td>
                          <td className="small">
                            {r.description && <div>{r.description}</div>}
                            {notes.map(([k, v]) => (
                              <div key={k} className="muted">
                                {k}: {String(v)}
                              </div>
                            ))}
                            {!r.description && !notes.length && <span className="muted">—</span>}
                          </td>
                          <td className="small">{r.lead_id ? <span style={{ color: "var(--brand)", fontWeight: 600 }}>{name(r) || "Open lead"}</span> : <span className="muted">—</span>}</td>
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
    </>
  )
}
