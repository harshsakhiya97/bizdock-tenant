import { db } from '@/lib/supabase'
import { every } from '@/meta/api'

/** an edge function's error text (its JSON { error }) */
async function errText(error: unknown, data: { error?: string } | null) {
  const ctx = (error as { context?: Response } | null)?.context
  const payload = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
  return String(payload?.error ?? data?.error ?? (error as Error | null)?.message ?? 'Something went wrong')
}

/** check the saved keys: log in to Google, list the ad accounts and start the first pull */
export async function testGoogle(id: string): Promise<{ saved: number; problems: string[] }> {
  const { data, error } = await db().functions.invoke('google-ads', { body: { action: 'test', id } })
  if (error || data?.error) throw new Error(await errText(error, data))
  return { saved: Number(data?.saved ?? 0), problems: (data?.problems ?? []) as string[] }
}
/** pull now (in the background) */
export async function syncGoogle(tenantId: string) {
  const { data, error } = await db().functions.invoke('google-ads', { body: { action: 'sync', tenant_id: tenantId } })
  if (error || data?.error) throw new Error(await errText(error, data))
}

export type GAccount = {
  id: string
  integration_id: string | null
  customer_id: string
  name: string | null
  currency: string | null
  is_manager: boolean
  is_enabled: boolean
  gst_rate: number
  synced_until: string | null
  last_sync_at: string | null
  last_error: string | null
}
export async function listGoogleAccounts(tenantId: string): Promise<GAccount[]> {
  const { data, error } = await db()
    .from('google_ad_accounts')
    .select('id, integration_id, customer_id, name, currency, is_manager, is_enabled, gst_rate, synced_until, last_sync_at, last_error')
    .eq('tenant_id', tenantId)
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as GAccount[]
}
export async function updateGoogleAccount(id: string, patch: { is_enabled?: boolean; gst_rate?: number }) {
  const { error } = await db().from('google_ad_accounts').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}
/** 123-456-7890 */
export const cidText = (c: string) => (c.length === 10 ? `${c.slice(0, 3)}-${c.slice(3, 6)}-${c.slice(6)}` : c)

export type GCampaign = { campaign_id: string; account_id: string; name: string | null; status: string | null; channel: string | null }
export type GAdGroup = { ad_group_id: string; campaign_id: string; account_id: string; name: string | null; status: string | null }
export type GAd = {
  ad_id: string
  ad_group_id: string
  campaign_id: string
  account_id: string
  name: string | null
  type: string | null
  status: string | null
  final_urls: string[]
  headlines: string[]
  descriptions: string[]
}
export type GLink = { id: string; funnel_id: string; campaign_id: string }
export type GDay = { level: 'campaign' | 'ad_group' | 'ad'; day: string; account_id: string; campaign_id: string; ad_group_id: string; ad_id: string; spend: number; impressions: number | null; clicks: number | null; conversions: number | null }

/** every campaign, ad group and ad of the workspace's Google Ads accounts */
export async function googleStructure(tenantId: string) {
  const [campaigns, groups, ads, links] = await Promise.all([
    every<GCampaign>((a, b) => db().from('google_campaigns').select('campaign_id, account_id, name, status, channel').eq('tenant_id', tenantId).order('name').range(a, b)),
    every<GAdGroup>((a, b) => db().from('google_ad_groups').select('ad_group_id, campaign_id, account_id, name, status').eq('tenant_id', tenantId).order('name').range(a, b)),
    every<GAd>((a, b) => db().from('google_ads').select('ad_id, ad_group_id, campaign_id, account_id, name, type, status, final_urls, headlines, descriptions').eq('tenant_id', tenantId).order('ad_id').range(a, b)),
    every<GLink>((a, b) => db().from('funnel_google_links').select('id, funnel_id, campaign_id').eq('tenant_id', tenantId).range(a, b)),
  ])
  return { campaigns, groups, ads, links }
}

/** numbers per day at one level, over a date range (optionally only some campaigns) */
export async function googleDays(tenantId: string, level: GDay['level'], from: string, to: string, campaignIds?: string[]): Promise<GDay[]> {
  if (campaignIds && !campaignIds.length) return []
  return every<GDay>((a, b) => {
    let q = db()
      .from('google_insights')
      .select('level, day, account_id, campaign_id, ad_group_id, ad_id, spend, impressions, clicks, conversions')
      .eq('tenant_id', tenantId)
      .eq('level', level)
      .gte('day', from)
      .lte('day', to)
    if (campaignIds) q = q.in('campaign_id', campaignIds)
    return q.order('day').order('campaign_id').order('ad_group_id').order('ad_id').range(a, b)
  })
}

/** a funnel's Google campaigns become exactly these */
export async function saveGoogleLinks(tenantId: string, funnelId: string, current: GLink[], want: string[]) {
  const mine = current.filter((x) => x.funnel_id === funnelId)
  const gone = mine.filter((x) => !want.includes(x.campaign_id))
  const add = want.filter((id) => !mine.some((x) => x.campaign_id === id))
  if (gone.length) {
    const { error } = await db().from('funnel_google_links').delete().in('id', gone.map((x) => x.id))
    if (error) throw new Error(error.message)
  }
  if (add.length) {
    const { error } = await db().from('funnel_google_links').insert(add.map((campaign_id) => ({ tenant_id: tenantId, funnel_id: funnelId, campaign_id })))
    if (error) throw new Error(error.message)
  }
}

/** a funnel's Google spend per day (with GST and without): its linked campaigns, campaign level */
export async function funnelGoogleDays(tenantId: string, funnelId: string, from: string, to: string) {
  const { data: l, error } = await db().from('funnel_google_links').select('campaign_id').eq('funnel_id', funnelId)
  if (error) throw new Error(error.message)
  const ids = (l ?? []).map((x: { campaign_id: string }) => x.campaign_id)
  if (!ids.length) return { linked: 0, days: [] as { day: string; spend: number; spend_gst: number }[] }
  const [rows, accs] = await Promise.all([googleDays(tenantId, 'campaign', from, to, ids), listGoogleAccounts(tenantId)])
  const gst = new Map(accs.map((a) => [a.id, Number(a.gst_rate)]))
  const by = new Map<string, { day: string; spend: number; spend_gst: number }>()
  for (const r of rows) {
    const d = by.get(r.day) ?? { day: r.day, spend: 0, spend_gst: 0 }
    d.spend += Number(r.spend || 0)
    d.spend_gst += Number(r.spend || 0) * (1 + (gst.get(r.account_id) ?? 18) / 100)
    by.set(r.day, d)
  }
  return { linked: ids.length, days: [...by.values()] }
}

/** Google words → plain words */
/** Google Ads, opened on that account's campaign (or ad group's ads) — __e picks the account */
export function googleAdsUrl(customerId: string | null | undefined, campaignId: string, adGroupId?: string | null) {
  const q = new URLSearchParams()
  if (customerId) q.set('__e', customerId.replace(/\D/g, ''))
  q.set('campaignId', campaignId)
  if (adGroupId) q.set('adGroupId', adGroupId)
  return `https://ads.google.com/aw/${adGroupId ? 'ads' : 'overview'}?${q}`
}

export const gWord = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—')
export const gTone = (s: string | null) => (s === 'ENABLED' ? 'badge-success' : s === 'PAUSED' ? 'badge-warning' : 'badge-muted')

/**
 * a funnel's Google spend per day and ad, shaped like Facebook's (Funnel → Google Ads → Spend per day): ad level, plus a
 * "not by ad" row for the rest of a campaign's spend (Performance Max has no ads)
 */
export async function funnelGoogleAdDays(tenantId: string, campaignIds: string[], from: string, to: string, ads: GAd[], campaignNames: Map<string, string>) {
  const [camp, ad] = await Promise.all([googleDays(tenantId, 'campaign', from, to, campaignIds), googleDays(tenantId, 'ad', from, to, campaignIds)])
  const names = new Map<string, string>()
  const objs = new Map<string, GAd>()
  for (const a of ads) {
    const k = `${a.ad_group_id}|${a.ad_id}`
    names.set(k, a.name || a.headlines[0] || `Ad ${a.ad_id}`)
    objs.set(k, a)
  }
  const days = ad.map((r) => ({ day: r.day, account_id: r.account_id, campaign_id: r.campaign_id, adset_id: r.ad_group_id, ad_id: `${r.ad_group_id}|${r.ad_id}`, spend: Number(r.spend || 0) }))
  const byAd = new Map<string, number>()
  for (const r of days) byAd.set(`${r.day}|${r.campaign_id}`, (byAd.get(`${r.day}|${r.campaign_id}`) ?? 0) + r.spend)
  for (const c of camp) {
    const rest = Number(c.spend || 0) - (byAd.get(`${c.day}|${c.campaign_id}`) ?? 0)
    if (rest > 0.01) {
      const k = `campaign|${c.campaign_id}`
      names.set(k, `${campaignNames.get(c.campaign_id) ?? c.campaign_id} · not by ad`)
      days.push({ day: c.day, account_id: c.account_id, campaign_id: c.campaign_id, adset_id: '', ad_id: k, spend: Math.round(rest * 100) / 100 })
    }
  }
  return { days, ads: names, objs }
}
