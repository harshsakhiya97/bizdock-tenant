import type { Plan, SaleRow } from './types'

export const PLANS: { value: Plan; label: string; short: string; tone: string; hint: string }[] = [
  { value: 'full', label: 'Full payment (one-time)', short: 'Full', tone: 'badge-success', hint: 'Paid in one go (or the rest by a date).' },
  { value: 'booking', label: 'Booking (token + balance)', short: 'Booking', tone: 'badge-warning', hint: 'A token now, the balance by a promised date.' },
  { value: 'emi', label: 'EMI (instalments)', short: 'EMI', tone: 'badge-purple', hint: 'Down payment now, the rest in monthly instalments.' },
]
export const planOf = (p: Plan) => PLANS.find((x) => x.value === p)!

export const rupees = (n: number | null | undefined, decimals = false) =>
  n == null
    ? '—'
    : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: decimals ? 2 : 0 })}`

export const fmtDay = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export const todayIso = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const addMonthsIso = (iso: string, months: number) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setMonth(d.getMonth() + months)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** money still to come on a sale (0 for cancelled sales) */
export const remainingOf = (s: SaleRow) => (s.status === 'cancelled' ? 0 : Math.max(0, Number(s.total_amount) - Number(s.paid_amount)))
export const pendingDues = (s: SaleRow) => (s.status === 'cancelled' ? [] : s.sale_dues.filter((d) => d.status === 'pending'))
export const emisLeft = (s: SaleRow) => pendingDues(s).filter((d) => d.kind === 'emi')
export const nextDue = (s: SaleRow) => pendingDues(s)[0] ?? null
