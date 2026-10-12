import { db } from '@/lib/supabase'
import type { FunnelInput, FunnelRow, StageDraft } from './types'

export async function listFunnels(tenantId: string): Promise<FunnelRow[]> {
  const { data, error } = await db()
    .from('funnels')
    .select('id, tenant_id, business_id, name, type, description, is_active, sort_order, created_at, funnel_stages(id, funnel_id, name, color, kind, note_required, sort_order)')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order')
    .order('created_at')
  if (error) throw error
  return ((data ?? []) as FunnelRow[]).map((f) => ({
    ...f,
    funnel_stages: [...(f.funnel_stages ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }))
}

/** Creates or updates a funnel and replaces its stages with `stages` (in order). */
export async function saveFunnel(tenantId: string, existing: FunnelRow | null, input: FunnelInput, stages: StageDraft[]) {
  const row = {
    business_id: input.business_id,
    name: input.name.trim(),
    type: input.type,
    description: input.description.trim() || null,
  }
  let funnelId = existing?.id
  if (existing) {
    const { error } = await db().from('funnels').update(row).eq('id', existing.id)
    if (error) throw error
  } else {
    const { data, error } = await db()
      .from('funnels')
      .insert({ ...row, tenant_id: tenantId })
      .select('id')
      .single()
    if (error) throw error
    funnelId = data.id
  }

  const keep = new Set(stages.filter((s) => s.id).map((s) => s.id))
  const removed = (existing?.funnel_stages ?? []).filter((s) => !keep.has(s.id)).map((s) => s.id)
  if (removed.length) {
    const { error } = await db().from('funnel_stages').delete().in('id', removed)
    if (error) throw error
  }
  for (const [i, s] of stages.entries()) {
    const values = { name: s.name.trim(), color: s.color, kind: s.kind, note_required: s.note_required, sort_order: i }
    const { error } = s.id
      ? await db().from('funnel_stages').update(values).eq('id', s.id)
      : await db().from('funnel_stages').insert({ ...values, tenant_id: tenantId, funnel_id: funnelId })
    if (error) throw error
  }
}

/** "Delete" in the app: the funnel is archived and kept. */
export async function archiveFunnel(id: string) {
  const { error } = await db()
    .from('funnels')
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
