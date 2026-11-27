export type SimpleRow = {
  id: string
  name: string
  is_active: boolean
  sort_order: number
  color?: string
  kind?: string
  /** follow-up outcomes: Comments must be written when it is picked */
  comment_required?: boolean
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
  /** Masters → Services ('service', picked on bookings) or Masters → Products ('product', bought by webinar leads) */
  kind: 'service' | 'product'
  /** the line's name on a GST invoice (else the name) */
  gst_name: string | null
  /** HSN / SAC code on a GST invoice */
  hsn_code: string | null
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
  email: string | null
  state_code: string | null
  cin: string | null
  pan: string | null
  bank_holder: string | null
  bank_name: string | null
  bank_account: string | null
  bank_branch: string | null
  bank_ifsc: string | null
  /** invoice number: {N} 8, {NNNN} 0008, {FY} 26-27, {PREFIX} the prefix */
  number_format: string
  /** the next invoice gets this number */
  next_no: number
}

/** the invoice number a company's format gives for number n (today's financial year) */
export function formatInvoiceNo(format: string, prefix: string | null, n: number, d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  const fy = `${String(y).slice(2)}-${String(y + 1).slice(2)}`
  let f = format.trim() || '{N}'
  if (!f.includes('{N')) f += '{N}'
  return f.replace('{NNNN}', String(n).padStart(4, '0')).replace('{N}', String(n)).replace('{FY}', fy).replace('{PREFIX}', prefix ?? '')
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
  | 'deal_steps'

export const EVENT_KINDS = [
  { value: 'event', label: 'Event' },
  { value: 'webinar', label: 'Webinar' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'leave', label: 'Leave / day off' },
]

export const GST_RATES = [0, 5, 12, 18, 28]
