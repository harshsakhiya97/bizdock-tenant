import { db } from '@/lib/supabase'

/** an edge function's error text (its JSON { error }) */
async function errText(error: unknown, data: { error?: string } | null) {
  const ctx = (error as { context?: Response } | null)?.context
  const payload = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
  return String(payload?.error ?? data?.error ?? (error as Error | null)?.message ?? 'Something went wrong')
}

/**
 * Continue with Facebook: a popup to Facebook's login (BizDock's Meta app), where the person picks their business and ad
 * accounts and presses Allow. It ends on the app's /meta-connect page; the app waits for the result here.
 */
export function connectMeta(tenantId: string, integrationId?: string | null) {
  let stop = () => {}
  const cancel = () => stop()
  // opened straight from the click, so the browser doesn't block it
  const win = window.open('about:blank', 'bizdock-meta', 'width=620,height=760')
  const done = new Promise<{ ok: boolean; message: string }>((resolve, reject) => {
    if (!win) return reject(new Error('Your browser blocked the Facebook window: allow pop-ups for this site and try again.'))
    let finished = false
    let timer = 0
    const end = (r: { ok: boolean; message: string }) => {
      if (finished) return
      finished = true
      window.clearInterval(timer)
      window.removeEventListener('message', onMsg)
      window.setTimeout(() => {
        try {
          if (!win.closed) win.close()
        } catch {
          // already gone
        }
      }, r.ok ? 1500 : 0)
      resolve(r)
    }
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; ok?: boolean; message?: string } | null
      if (d?.source === 'bizdock-meta') end({ ok: !!d.ok, message: String(d.message ?? '') })
    }
    stop = () => end({ ok: false, message: 'Cancelled.' })
    window.addEventListener('message', onMsg)
    db()
      .functions.invoke('meta-oauth', {
        body: { action: 'start', tenant_id: tenantId, integration_id: integrationId ?? null, back: `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/meta-connect` },
      })
      .then(async ({ data, error }) => {
        if (error || data?.error) throw new Error(await errText(error, data))
        win.location.href = data.url
        const startedAt = Date.now()
        const state = String(data.state)
        timer = window.setInterval(async () => {
          const { data: r } = await db().rpc('meta_oauth_result', { p_state: state })
          const res = r as { ok?: boolean; message?: string } | null
          if (res && typeof res.ok === 'boolean') end({ ok: res.ok, message: String(res.message ?? '') })
          else if (Date.now() - startedAt > 15 * 60_000) end({ ok: false, message: 'This took too long: try again.' })
          else if (win.closed && Date.now() - startedAt > 5000) end({ ok: false, message: 'Cancelled.' })
        }, 2000)
      })
      .catch((e: Error) => {
        finished = true
        window.removeEventListener('message', onMsg)
        try {
          win.close()
        } catch {
          // already gone
        }
        reject(e)
      })
  })
  return { done, cancel }
}

/** pull the ad accounts' numbers now (in the background) */
export async function syncMeta(tenantId: string) {
  const { data, error } = await db().functions.invoke('meta-ads', { body: { action: 'sync', tenant_id: tenantId } })
  if (error || data?.error) throw new Error(await errText(error, data))
}

export type AdAccount = {
  id: string
  integration_id: string
  act_id: string
  name: string | null
  currency: string | null
  business_name: string | null
  is_enabled: boolean
  gst_rate: number
  synced_until: string | null
  backfill_from: string | null
  last_sync_at: string | null
  last_error: string | null
}
export async function listAdAccounts(tenantId: string): Promise<AdAccount[]> {
  const { data, error } = await db()
    .from('meta_ad_accounts')
    .select('id, integration_id, act_id, name, currency, business_name, is_enabled, gst_rate, synced_until, backfill_from, last_sync_at, last_error')
    .eq('tenant_id', tenantId)
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as AdAccount[]
}
export async function updateAdAccount(id: string, patch: { is_enabled?: boolean; gst_rate?: number }) {
  const { error } = await db().from('meta_ad_accounts').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export type Campaign = { campaign_id: string; account_id: string; name: string | null; status: string | null; effective_status: string | null; objective: string | null; created_time: string | null }
export type AdSet = { adset_id: string; campaign_id: string; name: string | null; effective_status: string | null }
export type AdLink = { id: string; funnel_id: string; campaign_id: string; adset_id: string | null }

/** every campaign and ad set of the workspace's ad accounts, and every funnel's links */
export async function listCampaignTree(tenantId: string) {
  const [c, s, l] = await Promise.all([
    db().from('meta_campaigns').select('campaign_id, account_id, name, status, effective_status, objective, created_time').eq('tenant_id', tenantId).order('created_time', { ascending: false }),
    db().from('meta_adsets').select('adset_id, campaign_id, name, effective_status').eq('tenant_id', tenantId).order('name'),
    db().from('funnel_ad_links').select('id, funnel_id, campaign_id, adset_id').eq('tenant_id', tenantId),
  ])
  const err = c.error ?? s.error ?? l.error
  if (err) throw new Error(err.message)
  return { campaigns: (c.data ?? []) as Campaign[], adsets: (s.data ?? []) as AdSet[], links: (l.data ?? []) as AdLink[] }
}

/** a funnel's links become exactly these (whole campaigns: adset_id null) */
export async function saveFunnelLinks(tenantId: string, funnelId: string, current: AdLink[], want: { campaign_id: string; adset_id: string | null }[]) {
  const key = (x: { campaign_id: string; adset_id: string | null }) => `${x.campaign_id}|${x.adset_id ?? ''}`
  const wantKeys = new Set(want.map(key))
  const gone = current.filter((x) => x.funnel_id === funnelId && !wantKeys.has(key(x)))
  const haveKeys = new Set(current.filter((x) => x.funnel_id === funnelId).map(key))
  const add = want.filter((x) => !haveKeys.has(key(x)))
  if (gone.length) {
    const { error } = await db().from('funnel_ad_links').delete().in('id', gone.map((x) => x.id))
    if (error) throw new Error(error.message)
  }
  if (add.length) {
    const { error } = await db().from('funnel_ad_links').insert(add.map((x) => ({ ...x, tenant_id: tenantId, funnel_id: funnelId })))
    if (error) throw new Error(error.message)
  }
}

/** spend per campaign / ad set (with GST) over a date range */
export async function campaignSpend(tenantId: string, from: string, to: string) {
  const { data, error } = await db()
    .from('meta_insights')
    .select('campaign_id, adset_id, spend, account_id, leads, impressions, link_clicks')
    .eq('tenant_id', tenantId)
    .gte('day', from)
    .lte('day', to)
    .limit(50000)
  if (error) throw new Error(error.message)
  return (data ?? []) as { campaign_id: string; adset_id: string; spend: number; account_id: string; leads: number | null; impressions: number | null; link_clicks: number | null }[]
}

export type AdsReport = {
  spend: number
  spend_gst: number
  old_days: number
  impressions: number
  clicks: number
  meta_leads: number
  leads: number
  won: number
  lost: number
  revenue: number
  collected: number
  linked: number
  stages: { name: string; kind: string; n: number }[]
  days: { day: string; spend: number; spend_gst: number; meta: boolean; leads: number }[]
  ads: {
    campaign_id: string
    adset_id: string
    ad_id: string
    campaign_name: string | null
    adset_name: string | null
    ad_name: string | null
    effective_status: string | null
    spend: number
    spend_gst: number
    impressions: number | null
    link_clicks: number | null
    meta_leads: number | null
    leads: number
    won: number
    revenue: number
  }[]
}
export async function funnelAdsReport(funnelId: string, from: string, to: string): Promise<AdsReport | null> {
  const { data, error } = await db().rpc('funnel_ads_report', { p_funnel: funnelId, p_from: from, p_to: to })
  if (error) throw new Error(error.message)
  return (data ?? null) as AdsReport | null
}

/** the funnel's saved day-wise spend next to Facebook's (without GST) */
export async function adSpendCompare(funnelId: string) {
  const { data, error } = await db().rpc('ad_spend_compare', { p_funnel: funnelId })
  if (error) throw new Error(error.message)
  return (data ?? []) as { day: string; saved: number; meta: number | null; source: string }[]
}
/** the saved days Facebook has numbers for take Facebook's spend */
export async function adSpendReplace(funnelId: string): Promise<number> {
  const { data, error } = await db().rpc('ad_spend_replace', { p_funnel: funnelId })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}
