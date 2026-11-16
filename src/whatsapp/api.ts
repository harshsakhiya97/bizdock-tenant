import { db } from '@/lib/supabase'

export type AudienceKind = 'leads' | 'customers' | 'team' | 'csv' | 'paste'
export const AUDIENCE_LABEL: Record<AudienceKind, string> = {
  leads: 'Leads',
  customers: 'Customers',
  team: 'Team',
  csv: 'CSV upload',
  paste: 'Pasted numbers',
}

export type CampaignStatus = 'scheduled' | 'sending' | 'done' | 'cancelled'
export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; cls: string }> = {
  scheduled: { label: 'Scheduled', cls: 'badge-info' },
  sending: { label: 'Sending', cls: 'badge-warning' },
  done: { label: 'Done', cls: 'badge-success' },
  cancelled: { label: 'Cancelled', cls: 'badge-muted' },
}

export type Campaign = {
  id: string
  name: string
  template: string
  template_language: string | null
  template_body: string | null
  audience: { kind?: AudienceKind; label?: string }
  total: number
  status: CampaignStatus
  scheduled_at: string
  started_at: string | null
  finished_at: string | null
  created_by: string | null
  created_at: string
}

export type CampaignStats = {
  campaign_id: string
  total: number
  queued: number
  sent: number
  delivered: number
  seen: number
  replied: number
  failed: number
  cancelled: number
}

/** a recipient's state: still to go, cancelled, failed, or how far it got */
export type PersonState = 'queued' | 'cancelled' | 'failed' | 'sent' | 'delivered' | 'read'
export const PERSON_STATE: Record<PersonState, { label: string; cls: string }> = {
  queued: { label: 'Queued', cls: 'badge-muted' },
  cancelled: { label: 'Cancelled', cls: 'badge-muted' },
  failed: { label: 'Failed', cls: 'badge-danger' },
  sent: { label: 'Not delivered', cls: 'badge-warning' },
  delivered: { label: 'Delivered', cls: 'badge-info' },
  read: { label: 'Seen', cls: 'badge-success' },
}
export type CampaignPerson = {
  id: string
  campaign_id: string
  phone: string
  name: string | null
  lead_id: string | null
  state: PersonState
  error: string | null
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  replied_at: string | null
}

export type NewRecipient = { phone: string; name: string; lead_id: string | null; params: Record<string, string> }

export async function listCampaigns(tenantId: string): Promise<Campaign[]> {
  const { data, error } = await db()
    .from('wa_campaigns')
    .select('id, name, template, template_language, template_body, audience, total, status, scheduled_at, started_at, finished_at, created_by, created_at')
    .eq('tenant_id', tenantId)
    .order('scheduled_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return (data ?? []) as Campaign[]
}

export async function campaignStats(tenantId: string, ids: string[]): Promise<Map<string, CampaignStats>> {
  const out = new Map<string, CampaignStats>()
  if (!ids.length) return out
  const { data, error } = await db().rpc('wa_campaign_stats', { p_tenant: tenantId, p_ids: ids })
  if (error) throw error
  for (const s of (data ?? []) as CampaignStats[]) out.set(s.campaign_id, s)
  return out
}

export async function campaignPeople(tenantId: string, id: string): Promise<CampaignPerson[]> {
  const { data, error } = await db().rpc('wa_campaign_people', { p_tenant: tenantId, p_ids: [id] })
  if (error) throw error
  return (data ?? []) as CampaignPerson[]
}

export async function createCampaign(
  tenantId: string,
  c: { name: string; template: string; template_language: string; template_body: string; audience: Campaign['audience']; scheduled_at: string | null },
  recipients: NewRecipient[],
): Promise<string> {
  const { data, error } = await db().rpc('wa_campaign_create', { p_tenant: tenantId, p_campaign: c, p_recipients: recipients })
  if (error) throw error
  return data as string
}

export async function cancelCampaign(id: string) {
  const { error } = await db().rpc('wa_campaign_cancel', { p_id: id })
  if (error) throw error
}

/** 98XXXXXXXX / +91 98XXX XXXXX / 091… → 9198XXXXXXXX ('' when it isn't a number) */
export function waNumber(raw: string | null | undefined) {
  let d = (raw ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 10) d = `91${d}`
  return d.length >= 11 && d.length <= 15 ? d : ''
}

export const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—')
