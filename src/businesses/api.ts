import { db } from '@/lib/supabase'
import type { SubBusiness, SubBusinessType } from '@/auth/auth-context'
import type { BusinessInput, BusinessListRow, BusinessRow } from './types'

const BUCKET = 'business-logos'

function fail(error: { message: string } | null): asserts error is null {
  if (!error) return
  throw new Error(error.message)
}

export async function listBusinesses(tenantId: string) {
  const { data, error } = await db()
    .from('businesses')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order')
    .order('created_at')
  fail(error)
  return (data ?? []) as BusinessListRow[]
}

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)

/**
 * Saves a business.
 * - logo: a File uploads a new logo, null removes it, undefined leaves it unchanged
 */
export async function saveBusiness(opts: {
  tenantId: string
  existing: BusinessRow | null
  input: BusinessInput
  logo: File | null | undefined
}) {
  const { tenantId, existing, input, logo } = opts
  const fields = {
    name: input.name.trim(),
    phone: clean(input.phone),
    email: clean(input.email),
    address: clean(input.address),
    city: clean(input.city),
    state: clean(input.state),
    has_gst: input.has_gst,
    gst_number: input.has_gst ? (clean(input.gst_number)?.toUpperCase() ?? null) : null,
    legal_name: input.has_gst ? clean(input.legal_name) : null,
    has_branches: false,
    has_sub_businesses: input.has_sub_businesses,
    type: input.has_sub_businesses ? null : input.type || null,
  }

  // 1. business
  let business: BusinessRow
  if (existing) {
    const { data, error } = await db().from('businesses').update(fields).eq('id', existing.id).select('*').single()
    fail(error)
    business = data as BusinessRow
  } else {
    const { data, error } = await db()
      .from('businesses')
      .insert({ ...fields, tenant_id: tenantId })
      .select('*')
      .single()
    fail(error)
    business = data as BusinessRow
  }

  // 2. logo
  if (logo !== undefined) {
    const oldPath = pathInBucket(business.logo_url)
    let url: string | null = null
    if (logo) {
      const ext = (logo.name.split('.').pop() || 'png').toLowerCase()
      const path = `${tenantId}/${business.id}/logo-${Date.now()}.${ext}`
      const { error } = await db().storage.from(BUCKET).upload(path, logo, { contentType: logo.type })
      fail(error)
      url = db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    }
    const { data, error } = await db()
      .from('businesses')
      .update({ logo_url: url })
      .eq('id', business.id)
      .select('*')
      .single()
    fail(error)
    business = data as BusinessRow
    if (oldPath) await db().storage.from(BUCKET).remove([oldPath])
  }

  return business
}

export async function setBusinessArchived(id: string, archived: boolean) {
  const { error } = await db()
    .from('businesses')
    .update({ is_active: !archived, archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  fail(error)
}

function pathInBucket(url: string | null) {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  return url && url.includes(marker) ? url.split(marker)[1] : null
}

export type SubBusinessDraft = { id?: string; name: string; type: SubBusinessType }

export async function listSubBusinesses(businessId: string) {
  const { data, error } = await db()
    .from('sub_businesses')
    .select('id, business_id, name, type')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('sort_order')
    .order('created_at')
  fail(error)
  return (data ?? []) as SubBusiness[]
}

/** Saves the sub-business list of a business: updates, adds and removes (records keep their business). */
export async function saveSubBusinesses(tenantId: string, businessId: string, rows: SubBusinessDraft[], removed: string[]) {
  if (removed.length) {
    const { error } = await db().from('sub_businesses').delete().in('id', removed)
    fail(error)
  }
  for (const [i, r] of rows.entries()) {
    const fields = { name: r.name.trim(), type: r.type, sort_order: i + 1 }
    const { error } = r.id
      ? await db().from('sub_businesses').update(fields).eq('id', r.id)
      : await db().from('sub_businesses').insert({ ...fields, tenant_id: tenantId, business_id: businessId })
    fail(error)
  }
}
