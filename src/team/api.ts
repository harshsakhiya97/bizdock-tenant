import { db } from '@/lib/supabase'
import type { BusinessOption, MemberInput, MemberRow, RoleRow } from './types'

export async function listRoles(tenantId: string): Promise<RoleRow[]> {
  const { data, error } = await db()
    .from('roles')
    .select('id, name, description, level, is_system, permissions')
    .eq('tenant_id', tenantId)
    .order('level')
    .order('name')
  if (error) throw error
  return (data ?? []) as RoleRow[]
}

/** Everyone in the workspace except the hidden Tech Support Team. */
export async function listMembers(tenantId: string): Promise<MemberRow[]> {
  const { data, error } = await db()
    .from('tenant_members')
    .select(
      'id, user_id, role_id, status, is_support, all_businesses, reports_to, department, designation, joined_on, permissions, created_at, member_businesses(business_id, branch_id)',
    )
    .eq('tenant_id', tenantId)
    .eq('is_support', false)
    .order('created_at')
  if (error) throw error
  const rows = data ?? []
  if (!rows.length) return []
  const ids = rows.map((r) => r.user_id)
  const [{ data: profiles }, { data: logins }] = await Promise.all([
    db().from('profiles').select('id, full_name, email, phone').in('id', ids),
    db().rpc('team_last_logins', { p_tenant: tenantId }),
  ])
  const prof = new Map((profiles ?? []).map((p) => [p.id, p]))
  const last = new Map(((logins ?? []) as { user_id: string; last_sign_in_at: string | null }[]).map((l) => [l.user_id, l.last_sign_in_at]))
  return rows.map((r) => {
    const p = prof.get(r.user_id)
    return {
      ...(r as Omit<MemberRow, 'name' | 'email' | 'phone' | 'last_login'>),
      name: p?.full_name || p?.email?.split('@')[0] || 'Team member',
      email: p?.email ?? '',
      phone: p?.phone ?? null,
      last_login: last.get(r.user_id) ?? null,
    }
  })
}

export async function listBusinessOptions(tenantId: string): Promise<BusinessOption[]> {
  const { data, error } = await db()
    .from('businesses')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
  }))
}

async function callTeamFunction(body: Record<string, unknown>) {
  const { data, error } = await db().functions.invoke('team-member', { body })
  if (error) {
    // the function sends { error } with a 4xx; surface that message
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const payload = await ctx.json().catch(() => null)
      if (payload?.error) throw new Error(payload.error)
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export async function addMember(tenantId: string, input: MemberInput) {
  return callTeamFunction({
    action: 'create',
    tenant_id: tenantId,
    ...input,
    joined_on: input.joined_on || null,
    businesses: input.all_businesses ? [] : input.businesses,
  }) as Promise<{ member_id: string; new_login: boolean }>
}

export async function updateMember(tenantId: string, member: MemberRow, input: MemberInput) {
  if (input.full_name.trim() !== member.name || (input.phone.trim() || null) !== member.phone) {
    await callTeamFunction({
      action: 'update_profile',
      tenant_id: tenantId,
      member_id: member.id,
      full_name: input.full_name,
      phone: input.phone,
    })
  }
  const { error } = await db()
    .from('tenant_members')
    .update({
      role_id: input.role_id,
      reports_to: input.reports_to,
      department: input.department.trim() || null,
      designation: input.designation.trim() || null,
      joined_on: input.joined_on || null,
      all_businesses: input.all_businesses,
    })
    .eq('id', member.id)
  if (error) throw error

  // replace business access
  const { error: delError } = await db().from('member_businesses').delete().eq('member_id', member.id)
  if (delError) throw delError
  if (!input.all_businesses && input.businesses.length) {
    const { error: insError } = await db()
      .from('member_businesses')
      .insert(input.businesses.map((b) => ({ ...b, member_id: member.id, tenant_id: tenantId })))
    if (insError) throw insError
  }
}

export async function setMemberStatus(memberId: string, status: 'active' | 'disabled') {
  const { error } = await db().from('tenant_members').update({ status }).eq('id', memberId)
  if (error) throw error
}

export async function resetMemberPassword(tenantId: string, memberId: string) {
  await callTeamFunction({ action: 'reset_password', tenant_id: tenantId, member_id: memberId })
}

export async function getDefaultPassword(tenantId: string): Promise<string> {
  const { data } = await db().from('tenant_settings').select('default_password').eq('tenant_id', tenantId).maybeSingle()
  return data?.default_password ?? ''
}

export async function saveDefaultPassword(tenantId: string, password: string) {
  const { error } = await db()
    .from('tenant_settings')
    .upsert({ tenant_id: tenantId, default_password: password }, { onConflict: 'tenant_id' })
  if (error) throw error
}

/** Change what a person can see/do: null = follow their role */
export async function setMemberAccess(memberId: string, patch: { role_id?: string; reports_to?: string | null; permissions: unknown }) {
  const { error } = await db().from('tenant_members').update(patch).eq('id', memberId)
  if (error) throw error
}

export async function saveRole(role: Pick<RoleRow, 'id' | 'name' | 'description' | 'level' | 'permissions'>) {
  const { error } = await db()
    .from('roles')
    .update({ name: role.name, description: role.description, level: role.level, permissions: role.permissions })
    .eq('id', role.id)
  if (error) throw error
}

export async function createRole(tenantId: string, role: Pick<RoleRow, 'name' | 'level' | 'permissions'>) {
  const { error } = await db()
    .from('roles')
    .insert({ tenant_id: tenantId, name: role.name, level: role.level, permissions: role.permissions })
  if (error) throw error
}

export async function deleteRole(roleId: string) {
  const { error } = await db().from('roles').delete().eq('id', roleId)
  if (error) throw error
}
