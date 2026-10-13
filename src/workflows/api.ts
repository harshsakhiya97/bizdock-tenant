import { db } from '@/lib/supabase'
import { listEvents, listEventTypes } from '@/calendar/api'
import { listFunnels } from '@/funnels/api'
import type { FlowEdge, RefData, StepNode, TriggerData, TriggerEvent, WorkflowRow } from './types'
import { TRIGGER_DEFAULTS } from './types'

const COLS = 'id, tenant_id, name, is_active, trigger_type, funnel_id, event_id, nodes, edges, updated_at, created_at'

export async function listWorkflows(tenantId: string): Promise<WorkflowRow[]> {
  const { data, error } = await db()
    .from('workflows')
    .select(COLS)
    .eq('tenant_id', tenantId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as WorkflowRow[]
}

export async function getWorkflow(id: string): Promise<WorkflowRow | null> {
  const { data, error } = await db().from('workflows').select(COLS).eq('id', id).is('archived_at', null).maybeSingle()
  if (error) throw error
  return (data as WorkflowRow | null) ?? null
}

/** a new workflow: just its trigger box, settings filled in on the canvas */
export async function createWorkflow(tenantId: string, memberId: string | undefined, name: string, trigger: TriggerEvent, funnelId?: string) {
  const data: TriggerData = { ...TRIGGER_DEFAULTS[trigger], ...(funnelId && trigger !== 'before_event' && trigger !== 'after_event' ? { funnel_id: funnelId } : {}) }
  const id = crypto.randomUUID()
  const { error } = await db()
    .from('workflows')
    .insert({
      id,
      tenant_id: tenantId,
      name: name.trim() || 'Workflow',
      trigger_type: trigger,
      funnel_id: data.funnel_id || null,
      nodes: [{ id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data }],
      edges: [],
      updated_by: memberId ?? null,
    })
  if (error) throw error
  return id
}

/** keep only what the canvas needs to come back the same */
const slimNodes = (nodes: StepNode[]) => nodes.map(({ id, type, position, data }) => ({ id, type, position, data }))
const slimEdges = (edges: FlowEdge[]) =>
  edges.map(({ id, source, target, sourceHandle, label }) => ({ id, source, target, sourceHandle: sourceHandle ?? null, label }))

export async function saveWorkflow(
  id: string,
  memberId: string | undefined,
  w: { name: string; is_active: boolean; nodes: StepNode[]; edges: FlowEdge[] },
) {
  const t = (w.nodes.find((n) => n.type === 'trigger')?.data ?? {}) as TriggerData
  const eventTrigger = t.event === 'before_event' || t.event === 'after_event'
  const { error } = await db()
    .from('workflows')
    .update({
      name: w.name.trim() || 'Workflow',
      is_active: w.is_active,
      trigger_type: t.event ?? 'form_submitted',
      funnel_id: !eventTrigger && t.funnel_id ? t.funnel_id : null,
      event_id: eventTrigger && t.event_id ? t.event_id : null,
      nodes: slimNodes(w.nodes),
      edges: slimEdges(w.edges),
      updated_by: memberId ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function setWorkflowActive(id: string, active: boolean) {
  const { error } = await db().from('workflows').update({ is_active: active }).eq('id', id)
  if (error) throw error
}

/** "Delete" in the app: archived and kept */
export async function archiveWorkflow(id: string) {
  const { error } = await db().from('workflows').update({ is_active: false, archived_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

/** funnels, landing pages and webinars / events to pick from */
export async function loadRefData(tenantId: string): Promise<RefData> {
  const [funnels, pages, events, types] = await Promise.all([
    listFunnels(tenantId),
    db().from('landing_pages').select('id, name, funnel_id, fields').eq('tenant_id', tenantId).is('archived_at', null),
    listEvents(tenantId),
    listEventTypes(tenantId),
  ])
  const ok = new Set(types.filter((t) => t.kind === 'webinar' || t.kind === 'event').map((t) => t.id))
  return {
    funnels: funnels.map((f) => ({
      id: f.id,
      name: f.name,
      business_id: f.business_id,
      event_id: f.event_id,
      tags: f.tags,
      stages: f.funnel_stages.map((s) => ({ id: s.id, name: s.name })),
    })),
    pages: ((pages.data ?? []) as { id: string; name: string; funnel_id: string; fields: { key: string }[] }[]).map((p) => ({
      id: p.id,
      name: p.name,
      funnel_id: p.funnel_id,
      fields: (p.fields ?? []).map((f) => f.key),
    })),
    events: events
      .filter((e) => ok.has(e.type_id))
      .map((e) => ({ id: e.id, title: e.title, date: e.event_date, time: e.start_time, endTime: e.end_time })),
  }
}
