import { db } from '@/lib/supabase'
import type { BranchDraft, BranchRow, BusinessInput, BusinessListRow, BusinessRow, ManagerOption } from './types'

const BUCKET = 'business-logos'

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message)
}

export async function listBusinesses(tenantId: string) {
  const { data, error } = await db()
    .from('businesses')
    .select('*, branches(id, is_active)')
    .eq('tenant_id', tenantId)
    .order('sort_order')
    .order('created_at')
  fail(error)
  return (data ?? []) as BusinessListRow[]
}

export async function listBranches(businessId: string) {
  const { data, error } = await db()
    .from('branches')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('sort_order')
    .order('created_at')
  fail(error)
  return (data ?? []) as BranchRow[]
}

/** Team members who can be picked as branch manager (Tech Support Team is hidden). */
export async function listManagerOptions(tenantId: string): Promise<ManagerOption[]> {
  const { data: members } = await db()
    .from('tenant_members')
    .select('id, user_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .eq('is_support', false)
  if (!members?.length) return []
  const { data: profiles } = await db()
    .from('profiles')
    .select('id, full_name, email')
    .in(
      'id',
      members.map((m) => m.user_id),
    )
  const byId = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || 'Team member']))
  return members.map((m) => ({ id: m.id, name: byId.get(m.user_id) ?? 'Team member' }))
}

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)

/**
 * Saves a business and its branches in one go.
 * - branches missing from `branches` but saved before are archived (kept, hidden)
 * - logo: a File uploads a new logo, null removes it, undefined leaves it unchanged
 */
export async function saveBusiness(opts: {
  tenantId: string
  existing: BusinessRow | null
  input: BusinessInput
  branches: BranchDraft[]
  savedBranchIds: string[]
  logo: File | null | undefined
}) {
  const { tenantId, existing, input, branches, savedBranchIds, logo } = opts
  const fields = {
    name: input.name.trim(),
    phone: clean(input.phone),
    email: clean(input.email),
    address: clean(input.address),
    city: clean(input.city),
    state: clean(input.state),
    gst_number: clean(input.gst_number)?.toUpperCase() ?? null,
    legal_name: clean(input.legal_name),
    has_branches: input.has_branches,
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

  // 3. branches (only when the business has branches; otherwise leave any old ones untouched)
  if (input.has_branches) {
    const keep = new Set<string>()
    for (const [i, b] of branches.entries()) {
      const row = {
        name: b.name.trim(),
        city: clean(b.city),
        address: clean(b.address),
        phone: clean(b.phone),
        email: clean(b.email),
        manager_member_id: b.manager_member_id,
        sort_order: i,
      }
      if (b.id) {
        keep.add(b.id)
        const { error } = await db().from('branches').update(row).eq('id', b.id)
        fail(error)
      } else {
        const { error } = await db()
          .from('branches')
          .insert({ ...row, tenant_id: tenantId, business_id: business.id })
        fail(error)
      }
    }
    const removed = savedBranchIds.filter((id) => !keep.has(id))
    if (removed.length) {
      const { error } = await db()
        .from('branches')
        .update({ is_active: false, archived_at: new Date().toISOString() })
        .in('id', removed)
      fail(error)
    }
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
