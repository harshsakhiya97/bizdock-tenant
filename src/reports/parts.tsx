import type { ReactNode } from 'react'
import { Award } from 'lucide-react'
import { isoDay } from '@/components/DateRange'
import { cn } from '@/lib/cn'

/** shared by Callyzer → Report and Reports → Team Report: the day picker, the person cards and their boxes */

export const time = (s: string | null | undefined) => (s ? new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—')
export const when = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'
export const dur = (sec: number) => {
  if (!sec) return '0s'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`
}
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
export const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
export const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00`)
  x.setDate(x.getDate() + n)
  return isoDay(x)
}
/** the start and end of a day (Indian time) as ISO, and of the 7 days up to it */
export const dayBounds = (d: string, days = 1) => ({ from: new Date(`${addDays(d, 1 - days)}T00:00:00+05:30`).toISOString(), to: new Date(`${addDays(d, 1)}T00:00:00+05:30`).toISOString() })

/** date + Apply, Today, Yesterday; `children`: the summary line */
export function DayBar({ day, pick, setPick, go, children }: { day: string; pick: string; setPick: (d: string) => void; go: (d: string) => void; children?: ReactNode }) {
  const today = isoDay(new Date())
  const yday = addDays(today, -1)
  return (
    <div className="tr-bar">
      <div className="tr-sum">{children}</div>
      <div className="tr-date">
        <input type="date" className="input input-sm" max={today} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Date" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => pick && go(pick)} disabled={!pick || pick === day}>
          Apply
        </button>
        <button type="button" className={cn('btn btn-sm', day === today ? 'btn-dark' : 'btn-outline')} onClick={() => go(today)}>
          Today
        </button>
        <button type="button" className={cn('btn btn-sm', day === yday ? 'btn-dark' : 'btn-outline')} onClick={() => go(yday)}>
          Yesterday
        </button>
      </div>
    </div>
  )
}

const AV = ['#2b5fe8', '#8b5cf6', '#0d9488', '#ea580c', '#db2777', '#16a34a', '#0891b2', '#b45309']
const avColor = (s: string) => AV[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length]

/** one person's card: name, badges, a line of facts, then the boxes */
export function PersonCard({ name, best, tag, facts, children }: { name: string; best?: boolean; tag?: string | null; facts: ReactNode[]; children: ReactNode }) {
  return (
    <div className={cn('tr-card', best && 'is-best')}>
      <div className="tr-who">
        <span className="tr-av" style={{ background: avColor(name) }}>
          {name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="tr-id">
          <div className="tr-name">
            <b>{name}</b>
            {tag && <span className="badge badge-muted">{tag}</span>}
            {best && (
              <span className="badge badge-warning">
                <Award size={12} /> Best performer
              </span>
            )}
          </div>
          <div className="tr-facts">
            {facts.map((f, i) => (
              <span key={i}>{f}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="tr-boxes">{children}</div>
    </div>
  )
}

/** one number in a card; click: the records behind it */
export function Box({ label, value, tone, onClick }: { label: string; value: number | string; tone?: 'success' | 'danger' | 'warning'; onClick?: () => void }) {
  return (
    <button type="button" className="tr-box" onClick={onClick} disabled={!onClick} title={onClick ? `See ${label.toLowerCase()}` : label}>
      <span>{label}</span>
      <b className={tone ? `tr-${tone}` : undefined}>{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</b>
    </button>
  )
}
