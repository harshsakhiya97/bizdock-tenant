import { db } from '@/lib/supabase'
import type { BillingCompanyRow, ProductRow, SimpleRow, SimpleTable } from './types'

export async function listSimple(table: SimpleTable, tenantId: string): Promise<SimpleRow[]> {
  const cols =
    table === 'customer_stages'
      ? 'id, name, is_active, sort_order, color'
      : table === 'event_types'
        ? 'id, name, is_active, sort_order, color, kind'
        : table === 'follow_up_outcomes'
          ? 'id, name, is_active, sort_order, comment_required'
          : 'id, name, is_active, sort_order'
  const { data, error } = await db().from(table).select(cols).eq('tenant_id', tenantId).order('sort_order').order('name')
  if (error) throw error
  return (data ?? []) as unknown as SimpleRow[]
}

export async function saveSimple(table: SimpleTable, tenantId: string, row: Omit<SimpleRow, 'id'> & { id?: string }) {
  const body: Record<string, unknown> = {
    name: row.name.trim(),
    is_active: row.is_active,
    sort_order: row.sort_order,
  }
  if (table === 'customer_stages' || table === 'event_types') body.color = row.color ?? '#64748b'
  if (table === 'event_types') body.kind = row.kind ?? 'event'
  if (table === 'follow_up_outcomes') body.comment_required = !!row.comment_required
  const q = row.id
    ? db().from(table).update(body).eq('id', row.id)
    : db().from(table).insert({ ...body, tenant_id: tenantId })
  const { error } = await q
  if (error) throw new Error(error.code === '23505' ? `“${row.name.trim()}” is already in this list.` : error.message)
}

export async function listProducts(tenantId: string): Promise<ProductRow[]> {
  const { data, error } = await db().from('products').select('*').eq('tenant_id', tenantId).order('sort_order').order('name')
  if (error) throw error
  return (data ?? []) as ProductRow[]
}

export type ProductInput = Omit<ProductRow, 'id' | 'tenant_id'>

export async function saveProduct(tenantId: string, id: string | null, input: ProductInput) {
  const q = id ? db().from('products').update(input).eq('id', id) : db().from('products').insert({ ...input, tenant_id: tenantId })
  const { error } = await q
  if (error) throw error
}

export async function listBillingCompanies(tenantId: string): Promise<BillingCompanyRow[]> {
  const { data, error } = await db()
    .from('billing_companies')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order')
    .order('name')
  if (error) throw error
  return (data ?? []) as BillingCompanyRow[]
}

export type BillingCompanyInput = Omit<BillingCompanyRow, 'id' | 'tenant_id'>

export async function saveBillingCompany(tenantId: string, id: string | null, input: BillingCompanyInput) {
  const q = id
    ? db().from('billing_companies').update(input).eq('id', id)
    : db().from('billing_companies').insert({ ...input, tenant_id: tenantId })
  const { error } = await q
  if (error) throw error
}

/** "12 months", "Lifetime", "—" */
export const validityText = (p: { lifetime: boolean; validity_months: number | null }) =>
  p.lifetime ? 'Lifetime' : p.validity_months ? `${p.validity_months} month${p.validity_months > 1 ? 's' : ''}` : '—'

// ---------------- Masters → Podcast Studios ----------------
export type PodcastStudio = { id: string; name: string; is_default: boolean; sort_order: number }
export async function listStudios(tenantId: string): Promise<PodcastStudio[]> {
  const { data, error } = await db().from('podcast_studios').select('id, name, is_default, sort_order').eq('tenant_id', tenantId).order('sort_order').order('name')
  if (error) throw error
  return (data ?? []) as PodcastStudio[]
}
export async function saveStudio(tenantId: string, id: string | null, s: { name: string; is_default: boolean; sort_order?: number }) {
  const row = { name: s.name.trim(), is_default: s.is_default, ...(s.sort_order !== undefined ? { sort_order: s.sort_order } : {}) }
  const { error } = id ? await db().from('podcast_studios').update(row).eq('id', id) : await db().from('podcast_studios').insert({ ...row, tenant_id: tenantId })
  if (error) throw new Error(error.message)
}
export async function deleteStudio(id: string) {
  const { error } = await db().from('podcast_studios').delete().eq('id', id)
  if (error) throw new Error(error.code === '23503' ? 'This studio has bookings, so it can’t be deleted.' : error.message)
}
