import type { Temperature } from './types'

/** the lead's category: New, Hot, Warm, Cold, Not interested, Closed (Won → Closed, Lost → Not interested, automatically) */
export const TEMPERATURES: { value: Temperature; label: string; tone: string }[] = [
  { value: 'new', label: 'New', tone: 'badge-brand' },
  { value: 'hot', label: 'Hot', tone: 'badge-danger' },
  { value: 'warm', label: 'Warm', tone: 'badge-warning' },
  { value: 'cold', label: 'Cold', tone: 'badge-info' },
  { value: 'not_interested', label: 'Not interested', tone: 'badge-muted' },
  { value: 'closed', label: 'Closed', tone: 'badge-success' },
]
export const tempOf = (t: Temperature | null) => TEMPERATURES.find((x) => x.value === t)
/** picked when a call / follow-up is logged */
export const CALL_CATEGORIES = TEMPERATURES.filter((t) => t.value !== 'new')
/** these end the follow-ups: no next call needed (any pending one is cancelled) */
export const ENDS_FOLLOW_UPS: Temperature[] = ['not_interested', 'closed']

export const fullName = (l: { first_name: string; last_name: string | null }) =>
  [l.first_name, l.last_name].filter(Boolean).join(' ')

export const money = (n: number | null) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

/** "Today, 11:00 AM", "Tomorrow, …", "15 Oct, 11:00 AM" + whether it is overdue / today */
/** a follow-up picked by date only is kept at 11:59 pm India time: due all that day, overdue from the next day */
export const DAY_ONLY_TIME = '23:59'
export const isDayOnly = (iso: string | null | undefined) =>
  !!iso && new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) === DAY_ONLY_TIME
/** a follow-up's due: "28 Nov" for a date-only one, else "28 Nov, 11:00 am" */
export const dueText = (iso: string | null | undefined) =>
  !iso
    ? '—'
    : isDayOnly(iso)
      ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
      : new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
/** today + n days as yyyy-mm-dd (this computer's date) */
export function dayFromToday(n = 0) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

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
  return { text: isDayOnly(iso) ? day : `${day}, ${time}`, state }
}

/** ISO -> value for <input type="datetime-local"> */
export function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** a lead's source; from a Google Sheet: “Google Sheet · <sheet name>” */
export const leadSource = (source: string | undefined, sheet: string | undefined) => (sheet ? `Google Sheet · ${sheet}` : source)
