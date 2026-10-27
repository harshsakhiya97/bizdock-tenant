import { db } from '@/lib/supabase'
import { listEvents, listEventTypes } from '@/calendar/api'
import { listFunnels } from '@/funnels/api'
import { guessTarget } from '@/funnels/fieldMap'
import { listMemberOptions } from '@/leads/api'
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
export async function createWorkflow(tenantId: string, memberId: string | undefined, name: string, trigger: TriggerEvent, funnelId?: string, pages?: string[]) {
  const data: TriggerData = {
    ...TRIGGER_DEFAULTS[trigger],
    ...(funnelId && trigger !== 'before_event' && trigger !== 'after_event' ? { funnel_id: funnelId } : {}),
    ...(pages?.length ? { pages } : {}),
  }
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

/** funnels, webhook forms and webinars / events to pick from */
export async function loadRefData(tenantId: string): Promise<RefData> {
  const [funnels, pages, events, types, members, workflows, leadTags, leadExtras] = await Promise.all([
    listFunnels(tenantId),
    db().from('funnel_webhooks').select('id, name, funnel_id, field_map, sample').eq('tenant_id', tenantId).order('created_at'),
    listEvents(tenantId),
    listEventTypes(tenantId),
    listMemberOptions(tenantId),
    db().from('workflows').select('id, name, is_active').eq('tenant_id', tenantId).is('archived_at', null).order('name'),
    // tags already given to leads
    db().from('leads').select('tags').eq('tenant_id', tenantId).not('tags', 'eq', '{}').limit(5000),
    // extra fields saved on leads (form / sheet columns kept as "extra")
    db().from('leads').select('extra').eq('tenant_id', tenantId).not('extra', 'is', null).limit(5000),
  ])
  const ok = new Set(types.filter((t) => t.kind === 'webinar' || t.kind === 'event').map((t) => t.id))
  return {
    funnels: funnels.map((f) => ({
      id: f.id,
      name: f.name,
      business_id: f.business_id,
      sub_business_id: f.sub_business_id,
      event_id: f.event_id,
      tags: f.tags,
      stages: f.funnel_stages.map((s) => ({ id: s.id, name: s.name })),
    })),
    // the funnel's webhook forms (kept as `pages` in workflows); fields a lead from it can carry:
    // the standard optional ones + extra fields from its mapping
    pages: ((pages.data ?? []) as { id: string; name: string; funnel_id: string; field_map: Record<string, string> | null; sample: Record<string, string> | null }[]).map((p) => {
      const map: Record<string, string> = p.field_map ?? {}
      const keys = [...new Set([...Object.keys(p.sample ?? {}), ...Object.keys(map)])]
      const extras = keys.filter((k) => (map[k] ?? guessTarget(k)) === 'extra')
      return { id: p.id, name: p.name, funnel_id: p.funnel_id, fields: ['company_name', 'purpose', 'note', ...extras] }
    }),
    events: events
      .filter((e) => ok.has(e.type_id))
      .map((e) => ({ id: e.id, title: e.title, date: e.event_date, time: e.start_time, endTime: e.end_time })),
    members: members.map((m) => ({ id: m.id, name: m.name })),
    workflows: (workflows.data ?? []) as { id: string; name: string; is_active: boolean }[],
    extraKeys: [...new Set(((leadExtras.data ?? []) as { extra: Record<string, unknown> | null }[]).flatMap((l) => Object.keys(l.extra ?? {})))],
    leadTags: [...new Set(((leadTags.data ?? []) as { tags: string[] }[]).flatMap((l) => l.tags ?? []))].sort((a, b) => a.localeCompare(b)),
  }
}

/** the "Form submitted" workflow of one webhook form: the existing one, or a new one (its trigger set to that form) */
export async function workflowForWebhook(tenantId: string, memberId: string | undefined, funnelId: string, hook: { id: string; name: string }) {
  const { data, error } = await db()
    .from('workflows')
    .select('id, nodes')
    .eq('tenant_id', tenantId)
    .eq('trigger_type', 'form_submitted')
    .eq('funnel_id', funnelId)
    .is('archived_at', null)
    .order('created_at')
  if (error) throw error
  const rows = (data ?? []) as { id: string; nodes: StepNode[] }[]
  const pagesOf = (w: { nodes: StepNode[] }) => ((w.nodes.find((n) => n.id === 'trigger')?.data ?? {}) as TriggerData).pages ?? []
  // one made for this form first, then one that includes it
  const mine = rows.find((w) => pagesOf(w).length === 1 && pagesOf(w)[0] === hook.id) ?? rows.find((w) => pagesOf(w).includes(hook.id))
  if (mine) return mine.id
  return createWorkflow(tenantId, memberId, `${hook.name} – workflow`, 'form_submitted', funnelId, [hook.id])
}
