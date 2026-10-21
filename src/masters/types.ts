export type SimpleRow = {
  id: string
  name: string
  is_active: boolean
  sort_order: number
  color?: string
  kind?: string
}

export type ProductRow = {
  id: string
  tenant_id: string
  business_id: string
  sub_business_id: string | null
  name: string
  code: string | null
  description: string | null
  category: string | null
  price: number
  gst_applicable: boolean
  gst_rate: number
  lifetime: boolean
  validity_months: number | null
  is_active: boolean
  sort_order: number
}

export type BillingCompanyRow = {
  id: string
  tenant_id: string
  name: string
  legal_name: string | null
  gst_number: string | null
  address: string | null
  state: string | null
  invoice_prefix: string | null
  is_active: boolean
  sort_order: number
}

/** The simple lists: a name, an order and on/off (stages also have a colour). */
export type SimpleTable =
  | 'customer_stages'
  | 'payment_modes'
  | 'lead_sources'
  | 'lost_reasons'
  | 'follow_up_outcomes'
  | 'event_types'
  | 'webinar_types'

export const EVENT_KINDS = [
  { value: 'event', label: 'Event' },
  { value: 'webinar', label: 'Webinar' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'leave', label: 'Leave / day off' },
]

export const GST_RATES = [0, 5, 12, 18, 28]
