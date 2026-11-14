import { cn } from '@/lib/cn'
import { fundsLeft, type AdAccount } from './api'

const money = (n: number, cur: string | null) => `${cur === 'INR' || !cur ? '₹' : `${cur} `}${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

/** an ad account's money on Facebook: amount left (prepaid funds, or what's left of its spending limit) and what's due */
export function FundsLine({ a }: { a: AdAccount }) {
  if (!a.funds) return null
  const { left, kind, due } = fundsLeft(a)
  const cur = a.funds.currency ?? a.currency
  const gst = 1 + Number(a.gst_rate ?? 18) / 100
  // prepaid: what Ads Manager shows as Available funds includes GST
  const shown = kind === 'prepaid' && left != null ? left * gst : left
  const low = shown != null && shown < 1000
  const card = !!a.funds.funds_text && /\*\d{3,}/.test(a.funds.funds_text)
  const parts: string[] = []
  let title = 'Checked with the numbers'
  if (kind === 'prepaid' && left != null) {
    parts.push(`${money(left * gst, cur)} left`)
    title = `${money(left, cur)} + GST ${money(left * gst - left, cur)} = ${money(left * gst, cur)}`
  } else if (kind === 'limit' && left != null) {
    parts.push(`${money(left, cur)} left of ${money(a.funds.cap ?? 0, cur)} limit`)
    if (due) parts.push(`${money(due, cur)} due`)
  } else if (card) {
    parts.push(`Billed to ${a.funds.funds_text} · no spending limit`)
    if (due) parts.push(`${money(due, cur)} due`)
  } else if (a.funds.prepaid) {
    parts.push('Amount left not shared by Facebook')
  } else {
    // funds added in Ads Manager pay the balance: what's left after today's spend, and today's spend
    parts.push(kind === 'funds' && left != null ? `Balance till now: ${money(left - (due ?? 0), cur)}` : 'Balance till now: not shared by Facebook')
    parts.push(`Today’s spend: ${money(due ?? 0, cur)}`)
    title = 'Today’s spend is the balance not yet taken from the funds (without tax).'
  }
  // the account's type, on its own line after the account number
  const type = a.funds.prepaid ? 'Prepaid' : kind === 'limit' || card ? 'Postpaid' : 'Wallet'
  return (
    <>
      <span className="muted small" style={{ display: 'block' }}>
        {type}
      </span>
      <span
        className={cn('small', low ? 'tone-danger' : 'muted')}
        title={title}
        style={{ fontWeight: shown != null ? 600 : undefined, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' }}
      >
        {parts.map((t) => (
          <span key={t} style={{ display: 'block', whiteSpace: 'normal', overflow: 'visible' }}>
            {t}
          </span>
        ))}
      </span>
    </>
  )
}
