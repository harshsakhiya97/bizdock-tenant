export type Plan = 'full' | 'booking' | 'emi'

export type CustomerRow = {
  id: string
  tenant_id: string
  business_id: string
  lead_id: string | null
  full_name: string
  phone: string | null
  email: string | null
  city: string | null
  stage_id: string | null
  owner_id: string | null
  notes: string | null
  is_archived: boolean
  created_at: string
}

export type DueRow = {
  id: string
  kind: 'balance' | 'emi'
  seq: number
  due_on: string
  amount: number
  paid_amount: number
  status: 'pending' | 'paid' | 'cancelled'
  reminded_at: string | null
}

export type SaleRow = {
  id: string
  tenant_id: string
  business_id: string
  customer_id: string
  lead_id: string | null
  product_id: string
  billing_company_id: string
  quantity: number
  plan: Plan
  base_amount: number
  gst_applicable: boolean
  gst_rate: number
  gst_amount: number
  total_amount: number
  paid_amount: number
  sale_date: string
  valid_until: string | null
  sales_person_id: string | null
  payment_mode_id: string | null
  reference: string | null
  payment_remark: string | null
  notes: string | null
  status: 'active' | 'cancelled'
  cancel_reason: string | null
  created_at: string
  sale_dues: DueRow[]
}

export type PaymentRow = {
  id: string
  sale_id: string
  amount: number
  paid_on: string
  payment_mode_id: string | null
  reference: string | null
  note: string | null
  status: 'received' | 'cancelled'
  received_by: string | null
  due_id: string | null
  tds_amount: number
  gateway_charge: number
  verified: boolean
}

/** What the New sale form sends to create_sale(). */
export type SaleInput = {
  business_id: string
  customer_id: string
  lead_id: string
  customer: { full_name: string; phone: string; email: string; city: string }
  sales_person_id: string
  notes: string
  product_id: string
  quantity: string
  plan: Plan
  billing_company_id: string
  payment_mode_id: string
  reference: string
  payment_remark: string
  sale_date: string
  base_amount: string
  gst_applicable: boolean
  gst_rate: string
  received_now: string
  token_amount: string
  balance_due_on: string
  down_payment: string
  emi_count: string
  first_emi_on: string
}
