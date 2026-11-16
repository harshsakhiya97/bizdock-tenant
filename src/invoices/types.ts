import type { BookingRow, PartDraft } from '@/bookings/types'
import type { Buyer } from './Billing'

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
  /** With GST (Tax Invoice) or Without GST (Invoice) */
  kind: 'gst' | 'nongst'
  /** the company's details as they were when the invoice was made */
  seller: Seller
  /** the client's billing details as they were (Bill to) */
  buyer: Record<string, string | null>
  created_by: string | null
  created_at: string
  invoice_payments: InvoicePayment[]
  bookings: BookingRow[]
}

export type Seller = {
  company_id?: string
  name?: string | null
  address?: string | null
  email?: string | null
  gstin?: string | null
  state?: string | null
  state_code?: string | null
  cin?: string | null
  pan?: string | null
  bank_holder?: string | null
  bank_name?: string | null
  bank_account?: string | null
  bank_branch?: string | null
  bank_ifsc?: string | null
}

export type InvoiceInput = { kind: 'gst' | 'nongst'; billing_company_id: string; gst_rate: string; buyer: Buyer; parts: PartDraft[] }

/** fully paid once paid reaches the total */
export const isFullyPaid = (i: Pick<InvoiceRow, 'total_amount' | 'paid_amount'>) => Number(i.total_amount) > 0 && Number(i.paid_amount) >= Number(i.total_amount) - 0.01
