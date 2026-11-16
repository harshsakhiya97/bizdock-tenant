import type { BookingRow, PartDraft } from '@/bookings/types'

/** one planned part of an invoice's payment (Default / Brand Deals) */
export type InvoicePayment = {
  id: string
  invoice_id: string
  amount: number
  label: string | null
  due_on: string | null
  status: 'pending' | 'paid'
  paid_on: string | null
  payment_mode_id: string | null
  reference: string | null
  note: string | null
  received_by: string | null
  created_at: string
}

/** an invoice of one or more orders of one client (Default / Brand Deals) */
export type InvoiceRow = {
  id: string
  tenant_id: string
  business_id: string
  sub_business_id: string | null
  customer_id: string | null
  lead_id: string | null
  client_name: string
  phone: string | null
  billing_company_id: string | null
  invoice_no: string
  invoice_date: string
  gst_applicable: boolean
  gst_rate: number
  amount: number
  gst_amount: number
  total_amount: number
  paid_amount: number
  notes: string | null
  created_by: string | null
  created_at: string
  invoice_payments: InvoicePayment[]
  bookings: BookingRow[]
}

export type InvoiceInput = { billing_company_id: string; gst_applicable: boolean; gst_rate: string; parts: PartDraft[] }

/** fully paid once paid reaches the total */
export const isFullyPaid = (i: Pick<InvoiceRow, 'total_amount' | 'paid_amount'>) => Number(i.total_amount) > 0 && Number(i.paid_amount) >= Number(i.total_amount) - 0.01
