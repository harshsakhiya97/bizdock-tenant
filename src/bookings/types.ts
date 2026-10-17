export type BookingStatus = 'tentative' | 'confirmed' | 'completed' | 'cancelled'

export type BookingPayment = {
  id: string
  booking_id: string
  amount: number
  paid_on: string
  payment_mode_id: string | null
  reference: string | null
  note: string | null
  received_by: string | null
  created_at: string
}

export type BookingRow = {
  id: string
  tenant_id: string
  business_id: string
  lead_id: string | null
  customer_id: string | null
  client_name: string
  phone: string | null
  purpose: string | null
  booking_date: string
  start_time: string
  end_time: string
  amount: number
  gst_applicable: boolean
  gst_rate: number
  gst_amount: number
  total_amount: number
  paid_amount: number
  status: BookingStatus
  billing_company_id: string | null
  invoice_no: string | null
  invoice_date: string | null
  notes: string | null
  owner_id: string | null
  created_by: string | null
  created_at: string
  booking_payments: BookingPayment[]
}

export type BookingInput = {
  business_id: string
  lead_id: string | null
  /** a client added without a lead */
  customer_id?: string | null
  /** new enquiry made with the booking (calendar) */
  new_lead: { name: string; phone: string; purpose: string; source_id: string } | null
  client_name: string
  phone: string
  purpose: string
  booking_date: string
  start_time: string
  end_time: string
  amount: string
  gst_applicable: boolean
  gst_rate: string
  status: BookingStatus
  billing_company_id: string
  notes: string
  advance: string
  advance_mode_id: string
}

export type TemplateCategory = 'call_not_received' | 'booking' | 'follow_up' | 'other'
export type MessageTemplate = {
  id: string
  business_id: string | null
  channel: 'whatsapp' | 'email' | 'sms'
  category: TemplateCategory
  title: string
  body: string
  is_active: boolean
  sort_order: number
}

export type LeadMessage = {
  id: string
  lead_id: string
  channel: string
  template_id: string | null
  title: string | null
  body: string
  via: string
  sent_by: string | null
  sent_at: string
}

export const STATUS_META: Record<BookingStatus, { label: string; tone: string; color: string }> = {
  tentative: { label: 'Tentative', tone: 'badge-warning', color: '#d97706' },
  confirmed: { label: 'Confirmed', tone: 'badge-info', color: '#2563eb' },
  completed: { label: 'Completed', tone: 'badge-success', color: '#16a34a' },
  cancelled: { label: 'Cancelled', tone: 'badge-muted', color: '#94a3b8' },
}

export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  call_not_received: 'Call not received',
  booking: 'Booking',
  follow_up: 'Follow-up',
  other: 'Other',
}
