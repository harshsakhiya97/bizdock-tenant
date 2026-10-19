import { db } from '@/lib/supabase'
import type { FunnelInput, FunnelRow, LandingPage, LandingPageInput, StageDraft, SubmissionRow, UtmInput, UtmLink, LandingPageWebhook } from './types'

export async function listFunnels(tenantId: string): Promise<FunnelRow[]> {
  const { data, error } = await db()
    .from('funnels')
    .select('id, tenant_id, business_id, sub_business_id, name, type, description, is_active, sort_order, created_at, tags, event_id, funnel_stages(id, funnel_id, name, color, kind, note_required, sort_order)')
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
    sub_business_id: input.sub_business_id || null,
    name: input.name.trim(),
    type: input.type,
    description: input.description.trim() || null,
    tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
    event_id: input.event_id || null,
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

// ---------- landing pages ----------
const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)

/**
 * On this app's own address; the host passes it on to the Supabase function
 * (dev: vite.config.ts proxy; live: public/api/lead-webhook.php via .htaccess).
 */
export const WEBHOOK_BASE = `${window.location.origin}${import.meta.env.BASE_URL}api/lead-webhook`
export const webhookUrl = (key: string) => `${WEBHOOK_BASE}?key=${key}`

/** the page link with the UTM values added, for ads and posts */
export function utmUrl(pageUrl: string | null, u: Partial<Record<'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_term' | 'utm_content', string | null>>) {
  if (!pageUrl) return ''
  try {
    const url = new URL(pageUrl)
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const) {
      const v = (u[k] ?? '').trim()
      if (v) url.searchParams.set(k, v)
    }
    return url.toString()
  } catch {
    return pageUrl
  }
}

export async function listLandingPages(funnelId: string): Promise<LandingPage[]> {
  const { data, error } = await db()
    .from('landing_pages')
    .select('*, landing_page_utms(*), landing_page_webhooks(*)')
    .eq('funnel_id', funnelId)
    .is('archived_at', null)
    .order('sort_order')
    .order('created_at')
  if (error) throw error
  return ((data ?? []) as LandingPage[]).map((p) => ({
    ...p,
    landing_page_utms: [...(p.landing_page_utms ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    landing_page_webhooks: [...(p.landing_page_webhooks ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }))
}

export async function saveLandingPage(tenantId: string, funnelId: string, existing: LandingPage | null, input: LandingPageInput) {
  const row = {
    name: input.name.trim(),
    url: clean(input.url),
  }
  const { error } = existing
    ? await db().from('landing_pages').update(row).eq('id', existing.id)
    : await db().from('landing_pages').insert({ ...row, tenant_id: tenantId, funnel_id: funnelId })
  if (error) throw error
}

export async function setLandingPageActive(id: string, active: boolean) {
  const { error } = await db().from('landing_pages').update({ is_active: active }).eq('id', id)
  if (error) throw error
}

export async function getWebhook(id: string): Promise<LandingPageWebhook | null> {
  const { data, error } = await db().from('landing_page_webhooks').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as LandingPageWebhook | null) ?? null
}

/** another webhook URL on a landing page (e.g. a second form or a popup) */
export async function addWebhook(tenantId: string, pageId: string, name: string) {
  const { error } = await db().from('landing_page_webhooks').insert({ tenant_id: tenantId, landing_page_id: pageId, name: name.trim() || 'Form' })
  if (error) throw error
}

export async function renameWebhook(id: string, name: string) {
  const { error } = await db().from('landing_page_webhooks').update({ name: name.trim() }).eq('id', id)
  if (error) throw error
}

export async function setWebhookActive(id: string, active: boolean) {
  const { error } = await db().from('landing_page_webhooks').update({ is_active: active }).eq('id', id)
  if (error) throw error
}

export async function deleteWebhook(id: string) {
  const { error } = await db().from('landing_page_webhooks').delete().eq('id', id)
  if (error) throw error
}

/** test mode: for the next 10 minutes the next form post is saved as a sample instead of a lead */
export async function startWebhookTest(id: string) {
  const until = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const { error } = await db().from('landing_page_webhooks').update({ test_mode_until: until }).eq('id', id)
  if (error) throw error
  return until
}

export async function stopWebhookTest(id: string) {
  const { error } = await db().from('landing_page_webhooks').update({ test_mode_until: null }).eq('id', id)
  if (error) throw error
}

export async function saveFieldMap(id: string, map: Record<string, string>) {
  const { error } = await db().from('landing_page_webhooks').update({ field_map: map }).eq('id', id)
  if (error) throw error
}

/** a new secret key: the old webhook URL stops working */
export async function regenerateWebhookKey(id: string) {
  const key = crypto.randomUUID().replace(/-/g, '')
  const { error } = await db().from('landing_page_webhooks').update({ webhook_key: key }).eq('id', id)
  if (error) throw error
}

export async function archiveLandingPage(id: string) {
  const { error } = await db()
    .from('landing_pages')
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function addUtmLink(tenantId: string, pageId: string, u: UtmInput) {
  const { error } = await db()
    .from('landing_page_utms')
    .insert({
      tenant_id: tenantId,
      landing_page_id: pageId,
      label: u.label.trim(),
      utm_source: u.utm_source.trim(),
      utm_medium: clean(u.utm_medium),
      utm_campaign: clean(u.utm_campaign),
      utm_term: clean(u.utm_term),
      utm_content: clean(u.utm_content),
    })
  if (error) throw error
}

export async function deleteUtmLink(id: string) {
  const { error } = await db().from('landing_page_utms').delete().eq('id', id)
  if (error) throw error
}

/** form posts / imports of a funnel's leads the person can see */
export async function listFunnelSubmissions(funnelId: string): Promise<SubmissionRow[]> {
  const { data, error } = await db()
    .from('lead_submissions')
    .select('id, lead_id, landing_page_id, via, is_new, utm_source, utm_medium, utm_campaign, utm_term, utm_content, data, created_at')
    .eq('funnel_id', funnelId)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) throw error
  return (data ?? []) as SubmissionRow[]
}

export async function listLeadSubmissions(leadId: string): Promise<SubmissionRow[]> {
  const { data, error } = await db()
    .from('lead_submissions')
    .select('id, lead_id, landing_page_id, via, is_new, utm_source, utm_medium, utm_campaign, utm_term, utm_content, data, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SubmissionRow[]
}

/** does a submission match a UTM link (same source, and medium / campaign / content when the link sets them)? */
export function matchesUtm(s: Pick<SubmissionRow, 'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content' | 'utm_term'>, u: UtmLink) {
  const eq = (a: string | null, b: string | null) => !b || (a ?? '').toLowerCase() === b.toLowerCase()
  return (
    (s.utm_source ?? '').toLowerCase() === u.utm_source.toLowerCase() &&
    eq(s.utm_medium, u.utm_medium) &&
    eq(s.utm_campaign, u.utm_campaign) &&
    eq(s.utm_term, u.utm_term) &&
    eq(s.utm_content, u.utm_content)
  )
}
