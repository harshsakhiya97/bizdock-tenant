import type { Business, SubBusiness, SubBusinessType } from '@/auth/auth-context'

/** the type of what is picked in the top bar: the sub-business, or a business without sub-businesses */
export function activeType(selected: Business | null, sub: SubBusiness | null): SubBusinessType | null {
  if (sub) return sub.type
  if (selected && !selected.subs.length) return selected.type
  return null
}

/** Paid Podcast: the booking calendar is the shoot calendar */
export const calendarName = (t: SubBusinessType | null) => (t === 'podcast' ? 'Shoot / Podcast Calendar' : 'Booking Calendar')

/** Studio Rental and Paid Podcast share one studio */
export const isStudioType = (t: SubBusinessType | null | undefined) => t === 'studio_rental' || t === 'podcast'
