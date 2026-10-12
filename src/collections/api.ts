import { db } from '@/lib/supabase'

export type PaymentInput = {
  sale_id: string
  due_id: string
  amount: string
  before_gst: boolean
  paid_on: string
  payment_mode_id: string
  reference: string
  gateway_order_id: string
  billing_company_id: string
  verified: boolean
  gateway_charge: string
  tds_amount: string
  received_by: string
  remark: string
  note: string
}

/** Records a payment; the server spreads it over the sale's pending dues (the picked one first). */
export async function recordPayment(input: PaymentInput, gstRate: number) {
  const raw = Number(input.amount) || 0
  const amount = input.before_gst ? Math.round(raw * (100 + gstRate)) / 100 : raw
  const { error } = await db().rpc('record_payment', {
    p: {
      sale_id: input.sale_id,
      due_id: input.due_id || null,
      amount,
      paid_on: input.paid_on,
      payment_mode_id: input.payment_mode_id || null,
      reference: input.reference,
      gateway_order_id: input.gateway_order_id,
      billing_company_id: input.billing_company_id || null,
      verified: input.verified,
      gateway_charge: Number(input.gateway_charge) || 0,
      tds_amount: Number(input.tds_amount) || 0,
      received_by: input.received_by || null,
      remark: input.remark,
      note: input.note,
    },
  })
  if (error) throw new Error(error.message)
}

/** Reminders list → Done */
export async function markReminded(dueId: string, memberId: string | undefined) {
  const { error } = await db()
    .from('sale_dues')
    .update({ reminded_at: new Date().toISOString(), reminded_by: memberId ?? null })
    .eq('id', dueId)
  if (error) throw error
}

/** "EMI 2" / "Balance" */
export const dueLabel = (d: { kind: 'balance' | 'emi'; seq: number }) => (d.kind === 'emi' ? `EMI ${d.seq}` : 'Balance')

export const dueLeft = (d: { amount: number; paid_amount: number }) => Math.max(0, Number(d.amount) - Number(d.paid_amount))
