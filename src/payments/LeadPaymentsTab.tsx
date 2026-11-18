import { CreditCard } from 'lucide-react'
import { Empty, Paged } from '@/components/ui'
import { db } from '@/lib/supabase'
import { cn } from '@/lib/cn'

/** Lead / customer → Payments: the Razorpay payments whose phone (last 10 digits) or email matches this lead. */
export type LeadPay = {
  id: string
  payment_id: string
  order_id: string | null
  amount: number
  status: string | null
  method: string | null
  email: string | null
  phone: string | null
  description: string | null
  amount_refunded: number
  error_description: string | null
  paid_at: string
}

const last10 = (p: string | null | undefined) => {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : ''
}
const mail = (e: string | null | undefined) => (e ?? '').trim().toLowerCase()

export async function listLeadPayments(tenantId: string, lead: { phone: string | null; email: string | null }): Promise<LeadPay[]> {
  const p = last10(lead.phone)
  const m = mail(lead.email)
  const or = [p && `phone.ilike.%${p}`, m && `email.ilike."${m.replace(/"/g, '')}"`].filter(Boolean).join(',')
  if (!or) return []
  const { data, error } = await db()
    .from('razorpay_payments')
    .select('id, payment_id, order_id, amount, status, method, email, phone, description, amount_refunded, error_description, paid_at')
    .eq('tenant_id', tenantId)
    .or(or)
    .order('paid_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  // exact: same last 10 digits, or the same email
  return ((data ?? []) as LeadPay[]).filter((r) => (p && last10(r.phone) === p) || (m && mail(r.email) === m))
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

export function LeadPaymentsTab({ payments, error }: { payments: LeadPay[] | null; error?: string | null }) {
  if (error) return <div className="alert alert-error">{error}</div>
  if (!payments) return <div className="empty">Loading…</div>
  if (!payments.length) return <Empty icon={CreditCard}>No Razorpay payments for this lead’s phone or email.</Empty>
  return (
    <Paged rows={payments}>
      {(paged) => (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Paid on</th>
                <th>Product</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th>Method</th>
                <th>Phone / email</th>
                <th>Payment / order</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => {
                const st = STATUS[p.status ?? ''] ?? { label: p.status ?? '—', cls: 'badge-muted' }
                return (
                  <tr key={p.id}>
                    <td className="nowrap">{when(p.paid_at)}</td>
                    <td className="small">{p.description || <span className="muted">—</span>}</td>
                    <td className="num nowrap">
                      {inr(p.amount)}
                      {Number(p.amount_refunded) > 0 && <div className="muted small">−{inr(p.amount_refunded)} refunded</div>}
                    </td>
                    <td>
                      <span className={cn('badge', st.cls)}>{st.label}</span>
                      {p.status === 'failed' && p.error_description && <div className="muted small">{p.error_description}</div>}
                    </td>
                    <td className="nowrap">{p.method ? (METHOD[p.method] ?? p.method) : '—'}</td>
                    <td className="small">
                      {p.phone && <div>{p.phone}</div>}
                      {p.email && <div className="muted">{p.email}</div>}
                    </td>
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
  )
}
