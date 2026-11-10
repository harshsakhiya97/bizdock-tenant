import { db } from '@/lib/supabase'
import { newBulkRow } from '@/workflows/types'
import { DEFAULT_CATEGORIES, type WebinarCategory } from './api'

const nid = (p: string) => `${p}_${crypto.randomUUID().slice(0, 8)}`
const edge = (source: string, target: string, sourceHandle?: string) => ({ id: `e_${source}_${target}`, source, target, sourceHandle: sourceHandle ?? null })

async function insertWorkflow(
  tenantId: string,
  memberId: string | undefined,
  w: { name: string; trigger: string; funnelId: string | null; webinarId: string; nodes: unknown[]; edges: unknown[] },
) {
  const { data, error } = await db()
    .from('workflows')
    .insert({
      tenant_id: tenantId,
      name: w.name,
      trigger_type: w.trigger,
      funnel_id: w.funnelId,
      webinar_id: w.webinarId,
      nodes: w.nodes,
      edges: w.edges,
      updated_by: memberId ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return String(data.id)
}

/**
 * A new webinar's three workflows (off until their WhatsApp templates are picked and they're switched on):
 *  1. Registration: the webinar's registration form (its funnel webhook) → Register for webinar → WhatsApp with the joining (short) link
 *  2. Reminders: when the lead is registered (until it starts) → Bulk WhatsApp 1 day / 1 hour / 10 minutes before Webinar start (ones already past are skipped)
 *  3. After the webinar: when it ends → Wait until Zoom data is in → Get webinar analytics → Switch on the category →
 *     a Bulk WhatsApp per category (the webinar's Lead categories), stopping once the lead has paid
 * They run for every date of the webinar (one-time, several dates or weekly), and all three are linked to the webinar's funnel.
 */
export async function createWebinarWorkflows(
  tenantId: string,
  memberId: string | undefined,
  w: { id: string; title: string; funnel_id: string | null; webhook_id?: string | null; categories?: WebinarCategory[] },
) {
  const title = w.title.trim() || 'Webinar'
  // 1. registration
  const reg = nid('register')
  const wa = nid('whatsapp')
  await insertWorkflow(tenantId, memberId, {
    name: `${title} – registration`,
    trigger: 'form_submitted',
    funnelId: w.funnel_id,
    webinarId: w.id,
    nodes: [
      { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { event: 'form_submitted', funnel_id: w.funnel_id ?? '', pages: w.webhook_id ? [w.webhook_id] : [] } },
      { id: reg, type: 'register_webinar', position: { x: 0, y: 170 }, data: { webinar_id: w.id, short_link: true } },
      { id: wa, type: 'whatsapp', position: { x: 0, y: 340 }, data: { name: 'Joining link', to: 'lead', member_id: '', template: '', message: '' } },
    ],
    edges: [edge('trigger', reg), edge(reg, wa)],
  })

  // 2. reminders
  const bulk = nid('bulk')
  const before = (amount: number, unit: 'days' | 'hours' | 'minutes') => ({ ...newBulkRow(amount, unit), dir: 'before' as const })
  await insertWorkflow(tenantId, memberId, {
    name: `${title} – reminders`,
    trigger: 'before_event',
    funnelId: w.funnel_id,
    webinarId: w.id,
    nodes: [
      { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { event: 'before_event', webinar_id: w.id, funnel_id: w.funnel_id ?? '', event_id: '' } },
      {
        id: bulk,
        type: 'bulk_whatsapp',
        position: { x: 0, y: 170 },
        data: {
          name: 'Reminders',
          anchor: 'var',
          anchor_var: 'webinar_start',
          skip_past: true,
          rows: [before(1, 'days'), before(1, 'hours'), before(10, 'minutes')],
          stop_on: false,
          stop: { field: 'tag', op: 'is', value: '' },
        },
      },
    ],
    edges: [edge('trigger', bulk)],
  })

  // 3. after the webinar
  const wait = nid('waitzoom')
  const stats = nid('analytics')
  const sw = nid('switch')
  const cats = w.categories?.length ? w.categories : DEFAULT_CATEGORIES
  const cases = cats.map(caseOf)
  const msgs = cats.map((c, i) => messageNode(c, (i - (cats.length - 1) / 2) * 380))
  await insertWorkflow(tenantId, memberId, {
    name: `${title} – after webinar`,
    trigger: 'after_event',
    funnelId: w.funnel_id,
    webinarId: w.id,
    nodes: [
      { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { event: 'after_event', webinar_id: w.id, funnel_id: w.funnel_id ?? '', event_id: '', amount: 0, unit: 'minutes' } },
      { id: wait, type: 'wait_zoom', position: { x: 0, y: 170 }, data: {} },
      { id: stats, type: 'webinar_analytics', position: { x: 0, y: 340 }, data: {} },
      { id: sw, type: 'switch', position: { x: 0, y: 510 }, data: { name: 'Category', cases } },
      ...msgs,
    ],
    edges: [edge('trigger', wait), edge(wait, stats), edge(stats, sw), ...msgs.map((m, i) => edge(sw, m.id, cases[i].id))],
  })
}

/** the webinar's funnel changed: its workflows follow (on the row and on their trigger) */
export async function setWebinarWorkflowsFunnel(webinarId: string, funnelId: string | null) {
  const { data, error } = await db().from('workflows').select('id, nodes').eq('webinar_id', webinarId).is('archived_at', null)
  if (error) throw new Error(error.message)
  for (const w of (data ?? []) as { id: string; nodes: { id: string; data: Record<string, unknown> }[] }[]) {
    const nodes = (w.nodes ?? []).map((n) => (n.id === 'trigger' ? { ...n, data: { ...n.data, funnel_id: funnelId ?? '' } } : n))
    const { error: e } = await db().from('workflows').update({ funnel_id: funnelId, nodes }).eq('id', w.id)
    if (e) throw new Error(e.message)
  }
}

// ---------------- the after-webinar workflow follows the webinar's lead categories ----------------
type Case = { id: string; label: string; field: string; op: string; value: string; cat_key?: string }
type WfNode = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }
type WfEdge = { id: string; source: string; target: string; sourceHandle?: string | null }
/** a Switch path for a category: "Webinar category equals Super Hot" (the lead's), with its key kept so a rename keeps the path */
const caseOf = (c: WebinarCategory): Case => ({ id: `cat_${c.key}`, label: c.name, field: 'webinar_category', op: 'eq', value: c.name, cat_key: c.key })
/** a category's message: Bulk WhatsApp (template to pick), stopping once the lead has paid */
const messageNode = (c: WebinarCategory, x: number): WfNode => ({
  id: nid('bulk'),
  type: 'bulk_whatsapp',
  position: { x, y: 680 },
  data: { name: `${c.name} message`, anchor: 'start', anchor_var: '', rows: [newBulkRow(0, 'minutes')], stop_on: true, stop: { field: 'payment', op: 'exists', value: '' } },
})
/** older paths compared the name ("Super Hot"): their category key */
const LEGACY: Record<string, string> = { 'Super Hot': 'super_hot', Hot: 'hot', Warm: 'warm', Cold: 'cold', 'Not joined': 'not_joined' }
const keyOfCase = (c: Case) =>
  c.cat_key ?? (c.id.startsWith('cat_') ? c.id.slice(4) : c.field === 'v:webinar_category_key' ? c.value : (LEGACY[c.value] ?? null))
const isCategorySwitch = (n: WfNode) =>
  n.type === 'switch' && ((n.data.cases ?? []) as Case[]).some((c) => c.cat_key || c.field === 'webinar_category' || String(c.field).startsWith('v:webinar_category'))

/**
 * The webinar's lead categories changed: its after-webinar workflow's Switch gets one path per category (same order).
 * A renamed category keeps its path (and message); a new one gets a path with an empty message; a removed one loses its
 * path (its message step stays, unlinked, so a template set on it isn't lost).
 */
export async function syncCategoryPaths(webinarId: string, cats: WebinarCategory[]) {
  const { data, error } = await db().from('workflows').select('id, nodes, edges').eq('webinar_id', webinarId).eq('trigger_type', 'after_event').is('archived_at', null)
  if (error) throw new Error(error.message)
  for (const wf of (data ?? []) as { id: string; nodes: WfNode[]; edges: WfEdge[] }[]) {
    const nodes = [...(wf.nodes ?? [])]
    let edges = [...(wf.edges ?? [])]
    const sw = nodes.find(isCategorySwitch)
    if (!sw) continue
    const old = (sw.data.cases ?? []) as Case[]
    const msgOf = (caseId: string) => {
      const e = edges.find((x) => x.source === sw.id && x.sourceHandle === caseId)
      return e ? nodes.find((n) => n.id === e.target) : undefined
    }
    const cases: Case[] = []
    cats.forEach((c, i) => {
      const prev = old.find((o) => keyOfCase(o) === c.key)
      if (prev) {
        // renamed: the path and (if still its default name) its message follow
        const m = msgOf(prev.id)
        if (m && m.data.name === `${prev.label} message`) m.data = { ...m.data, name: `${c.name} message` }
        cases.push({ ...prev, label: c.name, field: 'webinar_category', op: 'eq', value: c.name, cat_key: c.key })
        return
      }
      const add = caseOf(c)
      const m = messageNode(c, sw.position.x + (i - (cats.length - 1) / 2) * 380)
      m.position.y = sw.position.y + 170
      nodes.push(m)
      edges.push({ id: `e_${sw.id}_${m.id}`, source: sw.id, target: m.id, sourceHandle: add.id })
      cases.push(add)
    })
    // removed categories: their paths go (the message steps stay)
    const kept = new Set(cases.map((c) => c.id))
    edges = edges.filter((e) => e.source !== sw.id || !e.sourceHandle || kept.has(e.sourceHandle))
    sw.data = { ...sw.data, cases }
    const { error: e } = await db().from('workflows').update({ nodes, edges }).eq('id', wf.id)
    if (e) throw new Error(e.message)
  }
}
