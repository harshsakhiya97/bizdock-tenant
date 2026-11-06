import { db } from '@/lib/supabase'

export type WaLogStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'received'
export type WaLog = {
  id: string
  direction: 'out' | 'in'
  phone: string
  lead_id: string | null
  template: string | null
  body: string | null
  source: 'workflow' | 'app' | 'reply'
  workflow_id: string | null
  status: WaLogStatus
  error: string | null
  sent_at: string
  delivered_at: string | null
  read_at: string | null
  leads?: { first_name: string; last_name: string | null } | null
  workflows?: { name: string } | null
}

export const STATUS_META: Record<WaLogStatus, { label: string; cls: string }> = {
  sent: { label: 'Sent', cls: 'badge-muted' },
  delivered: { label: 'Delivered', cls: 'badge-info' },
  read: { label: 'Read', cls: 'badge-success' },
  failed: { label: 'Failed', cls: 'badge-danger' },
  received: { label: 'Reply', cls: 'badge-warning' },
}

/** the newest messages first (at most 5000), between two days (India time) */
export async function listWaLogs(tenantId: string, from: string, to: string): Promise<WaLog[]> {
  let q = db()
    .from('whatsapp_logs')
    .select('id, direction, phone, lead_id, template, body, source, workflow_id, status, error, sent_at, delivered_at, read_at, leads(first_name, last_name), workflows(name)')
    .eq('tenant_id', tenantId)
  if (from) q = q.gte('sent_at', `${from}T00:00:00+05:30`)
  if (to) q = q.lte('sent_at', `${to}T23:59:59+05:30`)
  const { data, error } = await q.order('sent_at', { ascending: false }).limit(5000)
  if (error) throw error
  return (data ?? []) as unknown as WaLog[]
}

/** one number's whole conversation, oldest first */
export async function listChat(tenantId: string, phone: string): Promise<WaLog[]> {
  const { data, error } = await db()
    .from('whatsapp_logs')
    .select('id, direction, phone, lead_id, template, body, source, workflow_id, status, error, sent_at, delivered_at, read_at, leads(first_name, last_name), workflows(name)')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .order('sent_at')
    .limit(1000)
  if (error) throw error
  return (data ?? []) as unknown as WaLog[]
}

/** the workspace's WATI webhook (made the first time) */
export async function waHook(tenantId: string): Promise<{ key: string; last_event_at: string | null }> {
  const { data } = await db().from('whatsapp_hooks').select('key, last_event_at').eq('tenant_id', tenantId).maybeSingle()
  if (data) return data as { key: string; last_event_at: string | null }
  const { data: made, error } = await db().from('whatsapp_hooks').insert({ tenant_id: tenantId }).select('key, last_event_at').single()
  if (error) throw error
  return made as { key: string; last_event_at: string | null }
}
export const waHookUrl = (key: string) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wati-webhook?key=${key}`

/** a template to one number (kept in the logs) */
export async function sendWaTemplate(tenantId: string, p: { phone: string; template: string; params: Record<string, string>; body: string; lead_id: string | null }) {
  const { error } = await db().functions.invoke('whatsapp-templates', { body: { tenant_id: tenantId, action: 'send', ...p } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const body = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(body?.error ?? error.message)
  }
}

export const leadName = (l: WaLog) => [l.leads?.first_name, l.leads?.last_name].filter(Boolean).join(' ')
/** 919876543210 → +91 98765 43210 */
export const nicePhone = (p: string) => (p.length === 12 && p.startsWith('91') ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : `+${p}`)
export const at = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : ''
