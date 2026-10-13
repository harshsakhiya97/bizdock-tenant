import { db } from '@/lib/supabase'
import type { ChainEdge, ChainRow, StepNode } from './types'

export const START_NODES: StepNode[] = [{ id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { pages: [] } }]

export async function getChain(funnelId: string): Promise<ChainRow | null> {
  const { data, error } = await db()
    .from('funnel_chains')
    .select('id, funnel_id, name, is_active, nodes, edges, updated_at')
    .eq('funnel_id', funnelId)
    .maybeSingle()
  if (error) throw error
  return (data as ChainRow | null) ?? null
}

/** keep only what the canvas needs to come back the same */
const slimNodes = (nodes: StepNode[]) => nodes.map(({ id, type, position, data }) => ({ id, type, position, data }))
const slimEdges = (edges: ChainEdge[]) =>
  edges.map(({ id, source, target, sourceHandle, label }) => ({ id, source, target, sourceHandle: sourceHandle ?? null, label }))

export async function saveChain(
  tenantId: string,
  funnelId: string,
  memberId: string | undefined,
  chain: { name: string; is_active: boolean; nodes: StepNode[]; edges: ChainEdge[] },
) {
  const row = {
    tenant_id: tenantId,
    funnel_id: funnelId,
    name: chain.name.trim() || 'Automation',
    is_active: chain.is_active,
    nodes: slimNodes(chain.nodes),
    edges: slimEdges(chain.edges),
    updated_by: memberId ?? null,
  }
  const { error } = await db().from('funnel_chains').upsert(row, { onConflict: 'funnel_id' })
  if (error) throw error
}
