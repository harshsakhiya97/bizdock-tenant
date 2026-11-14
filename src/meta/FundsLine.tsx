import { cn } from '@/lib/cn'
import { fundsLeft, type AdAccount } from './api'

const money = (n: number, cur: string | null) => `${cur === 'INR' || !cur ? '₹' : `${cur} `}${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

/** an ad account's money on Facebook: amount left (prepaid funds, or what's left of its spending limit) and what's due */
export function FundsLine({ a }: { a: AdAccount }) {
  if (!a.funds) return null
  const { left, kind, due } = fundsLeft(a)
  const cur = a.funds.currency ?? a.currency
  const low = left != null && left < 1000
  const parts: string[] = []
  if (kind === 'prepaid' && left != null) parts.push(`Prepaid · ${money(left, cur)} left`)
  else if (kind === 'funds' && left != null) parts.push(`Funds · ${money(left, cur)} left`)
  else if (kind === 'limit' && left != null) parts.push(`Postpaid · ${money(left, cur)} left of ${money(a.funds.cap ?? 0, cur)} limit`)
  else if (a.funds.funds_text && /\*\d{3,}/.test(a.funds.funds_text)) parts.push(`Billed to ${a.funds.funds_text} · no spending limit`)
  else parts.push(a.funds.prepaid ? 'Prepaid · amount left not shared by Facebook' : 'Funds not shared by Facebook · no spending limit')
  if (due) parts.push(`${money(due, cur)} due`)
  return (
    <span className={cn('small', low ? 'tone-danger' : 'muted')} title={`Checked with the numbers${a.funds.spent != null ? ` · spent since the limit was last reset ${money(a.funds.spent, cur)}` : ''}`} style={{ fontWeight: left != null ? 600 : undefined, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' }}>
      {parts.map((t) => (
        <span key={t} style={{ display: 'block', whiteSpace: 'normal', overflow: 'visible' }}>
          {t}
        </span>
      ))}
    </span>
  )
}
