import { BT, type Business, type SubBusiness, type SubBusinessType } from '@/auth/auth-context'

/** the type of what is picked in the top bar: the sub-business, or a business without sub-businesses */
export function activeType(selected: Business | null, sub: SubBusiness | null): SubBusinessType | null {
  if (sub) return sub.type
  if (selected && !selected.subs.length) return selected.type
  return null
}

/** Paid Podcast: the booking calendar is the shoot calendar */
export const calendarName = (t: SubBusinessType | null) => (t === BT.WEBINAR ? 'Webinar Calendar' : 'Studio Schedule')

/** Studio Rental and Paid Podcast share one studio */
export const isStudioType = (t: SubBusinessType | null | undefined) => t === BT.STUDIO_RENTAL || t === BT.PAID_PODCAST

/** what an order is called: Brand Deals call it a brand deal */
export const orderNoun = (t: SubBusinessType | null | undefined) => (t === BT.BRAND_DEALS ? { one: 'Brand Deal', many: 'Brand Deals' } : { one: 'Order', many: 'Orders' })
