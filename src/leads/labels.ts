import type { Temperature } from './types'

export const TEMPERATURES: { value: Temperature; label: string; tone: string }[] = [
  { value: 'hot', label: 'Hot', tone: 'badge-danger' },
  { value: 'warm', label: 'Warm', tone: 'badge-warning' },
  { value: 'cold', label: 'Cold', tone: 'badge-info' },
  { value: 'not_interested', label: 'Not interested', tone: 'badge-muted' },
]
export const tempOf = (t: Temperature | null) => TEMPERATURES.find((x) => x.value === t)

export const fullName = (l: { first_name: string; last_name: string | null }) =>
  [l.first_name, l.last_name].filter(Boolean).join(' ')

export const money = (n: number | null) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

/** "Today, 11:00 AM", "Tomorrow, …", "15 Oct, 11:00 AM" + whether it is overdue / today */
export function followUp(iso: string | null): { text: string; state: 'none' | 'overdue' | 'today' | 'later' } {
  if (!iso) return { text: '—', state: 'none' }
  const d = new Date(iso)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startTomorrow = new Date(startToday.getTime() + 864e5)
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  const day =
    d >= startToday && d < startTomorrow
      ? 'Today'
      : d >= startTomorrow && d < new Date(startTomorrow.getTime() + 864e5)
        ? 'Tomorrow'
        : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const state = d < now ? 'overdue' : d < startTomorrow ? 'today' : 'later'
  return { text: `${day}, ${time}`, state }
}

/** ISO -> value for <input type="datetime-local"> */
export function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
