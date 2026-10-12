import { Mail, MapPin, MessageCircle, MoreHorizontal, Phone, Users, type LucideIcon } from 'lucide-react'
import type { FollowUpMode } from './types'

export const MODES: { value: FollowUpMode; label: string; icon: LucideIcon }[] = [
  { value: 'call', label: 'Call', icon: Phone },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'meeting', label: 'Meeting', icon: Users },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'visit', label: 'Visit', icon: MapPin },
  { value: 'other', label: 'Other', icon: MoreHorizontal },
]
export const modeOf = (m: FollowUpMode) => MODES.find((x) => x.value === m) ?? MODES[0]

/** tel: and wa.me links from a stored phone */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
export function waHref(phone: string) {
  const d = phone.replace(/\D/g, '')
  return `https://wa.me/${d.length === 10 ? `91${d}` : d}`
}

/** days late, e.g. "Overdue 2 d" */
export function lateBy(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5)
  return days >= 1 ? `Overdue ${days} d` : 'Overdue'
}

/** tomorrow 11:00 as a datetime-local value */
export function tomorrowAt11() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(11, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T11:00`
}

export function dayBounds() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 864e5)
  const week = new Date(start.getTime() + 8 * 864e5)
  return { now, start, end, week }
}
