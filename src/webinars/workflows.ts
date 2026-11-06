import { db } from '@/lib/supabase'
import { newBulkRow } from '@/workflows/types'

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
 *  1. Registration: the funnel's form → Register for webinar → WhatsApp with the joining (short) link
 *  2. Reminders: when the lead is registered (until it starts) → Bulk WhatsApp 1 day / 1 hour / 10 minutes before Webinar start (ones already past are skipped)
 *  3. After the webinar: when it ends → Wait until Zoom data is in → Get webinar analytics → Switch on the category →
 *     a Bulk WhatsApp per category (Super Hot / Hot / Warm / Cold), stopping once the lead becomes a customer
 * They run for every date of the webinar (one-time, several dates or weekly), and all three are linked to the webinar's funnel.
 */
export async function createWebinarWorkflows(tenantId: string, memberId: string | undefined, w: { id: string; title: string; funnel_id: string | null }) {
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
      { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { event: 'form_submitted', funnel_id: w.funnel_id ?? '', pages: [] } },
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
  const cats = ['Super Hot', 'Hot', 'Warm', 'Cold']
  const cases = cats.map((c, i) => ({ id: `c${i + 1}`, label: c, field: 'v:webinar_category', op: 'eq', value: c }))
  const msgs = cats.map((c, i) => ({
    id: nid(`bulk${i + 1}`),
    type: 'bulk_whatsapp',
    position: { x: (i - 1.5) * 380, y: 680 },
    data: {
      name: `${c} message`,
      anchor: 'start',
      anchor_var: '',
      rows: [newBulkRow(0, 'minutes')],
      stop_on: true,
      stop: { field: 'payment', op: 'exists', value: '' },
    },
  }))
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
