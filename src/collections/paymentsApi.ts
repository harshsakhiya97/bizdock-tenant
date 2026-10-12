import { db } from '@/lib/supabase'
import type { PaymentFull } from '@/customers/types'

export async function listAllPayments(tenantId: string): Promise<PaymentFull[]> {
  const { data, error } = await db()
    .from('payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('paid_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PaymentFull[]
}

export async function verifyPayment(id: string) {
  const { error } = await db().rpc('verify_payment', { p_id: id })
  if (error) throw new Error(error.message)
}

export async function cancelPayment(id: string, reason: string) {
  const { error } = await db().rpc('cancel_payment', { p_id: id, p_reason: reason })
  if (error) throw new Error(error.message)
}
