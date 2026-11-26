import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChartNoAxesColumn, RefreshCw } from 'lucide-react'
import { Empty } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { cidText, googleDays, googleStructure, gTone, gWord, listGoogleAccounts, syncGoogle, type GAccount } from '@/google/api'
import { CampaignTags, tagHit } from './CampaignTags'
import { FunnelDaySpend } from './FunnelDaySpend'

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const day = (d: Date) => d.toLocaleDateString('en-CA')

/**
 * Funnel → Google Ads: the Google campaigns linked to this funnel (their spend counts here). Campaigns join by the
 * funnel's tags (any ad account, name contains a tag). A campaign belongs to one funnel.
 */
export function FunnelGoogleTab({ funnelId, canEdit, onSaved }: { funnelId: string; canEdit: boolean; onSaved: (msg: string) => void }) {
  const tenant = useTenant()
  const [accounts, setAccounts] = useState<GAccount[] | null>(null)
  const [tree, setTree] = useState<Awaited<ReturnType<typeof googleStructure>> | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [spend, setSpend] = useState<Map<string, number>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    // Last 30 days, ending yesterday
    const to = new Date(Date.now() - 86400_000)
    const from = new Date(Date.now() - 30 * 86400_000)
    Promise.all([listGoogleAccounts(tenant.id), googleStructure(tenant.id), googleDays(tenant.id, 'campaign', day(from), day(to))])
      .then(([a, t, sp]) => {
        const real = a.filter((x) => !x.is_manager)
        setAccounts(real)
        setTree(t)
        const c = new Map<string, number>()
        for (const r of sp) c.set(r.campaign_id, (c.get(r.campaign_id) ?? 0) + Number(r.spend)) // without GST
        setSpend(c)
      })
      .catch((e: Error) => setError(e.message))
  }, [tenant.id])
  useEffect(load, [load])

  const accName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name ?? cidText(a.customer_id)])), [accounts])
  const campById = useMemo(() => new Map((tree?.campaigns ?? []).map((c) => [c.campaign_id, c])), [tree])
  const links = useMemo(() => tree?.links ?? [], [tree])
  const mine = useMemo(() => links.filter((l) => l.funnel_id === funnelId), [links, funnelId])

  async function refresh() {
    setBusy(true)
    try {
      await syncGoogle(tenant.id)
      onSaved('Bringing in the latest campaigns and numbers from Google Ads. Refresh in a minute.')
      window.setTimeout(load, 20000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!accounts || !tree) return error ? <div className="alert alert-error">{error}</div> : <div className="empty">Loading…</div>
  if (!accounts.length)
    return (
      <Empty icon={ChartNoAxesColumn}>
        No Google Ads account is connected yet. <Link to="/integrations" className="link-btn">System Connections → Google Ads</Link>
      </Empty>
    )

  return (
    <div className="stack">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="muted small">Google campaigns whose spend counts for this funnel. Spend is the last 30 days, without GST.</div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void refresh()} title="Bring in the latest campaigns and numbers">
            <RefreshCw size={14} /> Refresh from Google
          </button>
        </div>
      </div>

      <CampaignTags
        funnelId={funnelId}
        kind="google"
        canEdit={canEdit}
        onChange={(t) => {
          const first = !tags.length && !t.length
          setTags(t)
          if (!first) load()
        }}
      />

      {!mine.length ? (
        <Empty icon={ChartNoAxesColumn}>No Google campaigns in this funnel yet{canEdit ? ': add a tag above.' : '.'}</Empty>
      ) : (
        <div className="card ad-tree">
          {mine.map((l) => {
            const c = campById.get(l.campaign_id)
            const sp = spend.get(l.campaign_id)
            return (
              <div key={l.id} className="ad-tree-item">
                <div className="ad-tree-row">
                  <div className="ad-tree-main">
                    <b>{c?.name ?? l.campaign_id}</b>
                    <span className="muted small">
                      {c ? accName.get(c.account_id) : ''}
                      {c?.channel ? ` · ${gWord(c.channel)}` : ''}
                    </span>
                  </div>
                  {tagHit(c?.name, tags) && <span className="tag-chip ad-tree-tag" title="Matched tag">{tagHit(c?.name, tags)}</span>}
                  <span className={cn('badge', gTone(c?.status ?? null))}>{gWord(c?.status ?? null)}</span>
                  <span className="num ad-tree-spend">{sp ? inr(sp) : '—'}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {mine.length > 0 && (
        <FunnelDaySpend
          links={mine.map((l) => ({ campaign_id: l.campaign_id, adset_id: null }))}
          accounts={accounts}
          campaigns={tree.campaigns}
          adsets={tree.groups.map((g) => ({ adset_id: g.ad_group_id, name: g.name }))}
          google={{ ads: tree.ads, campaigns: tree.campaigns, customers: new Map(accounts.map((a) => [a.id, a.customer_id])) }}
        />
      )}

    </div>
  )
}
