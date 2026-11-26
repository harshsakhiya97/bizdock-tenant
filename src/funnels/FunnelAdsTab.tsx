import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Megaphone, RefreshCw } from 'lucide-react'
import { Empty } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { campaignSpend, listAdAccounts, listCampaignTree, syncMeta, type AdAccount, type AdLink, type AdSet, type Campaign } from '@/meta/api'
import { CampaignTags, tagHit } from './CampaignTags'
import { FunnelDaySpend } from './FunnelDaySpend'

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const day = (d: Date) => d.toLocaleDateString('en-CA')
const ACTIVE = new Set(['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW'])
const statusTone = (s: string | null) => (s && ACTIVE.has(s) ? 'badge-success' : s === 'PAUSED' || s === 'CAMPAIGN_PAUSED' || s === 'ADSET_PAUSED' ? 'badge-warning' : 'badge-muted')
const statusLabel = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—')

/**
 * Funnel → Facebook Ads: the campaigns linked to this funnel (their leads and spend count here). Campaigns join by the
 * funnel's tags (any ad account, name contains a tag). A campaign belongs to one funnel.
 */
export function FunnelAdsTab({ funnelId, canEdit, onSaved }: { funnelId: string; canEdit: boolean; onSaved: (msg: string) => void }) {
  const tenant = useTenant()
  const [accounts, setAccounts] = useState<AdAccount[] | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [adsets, setAdsets] = useState<AdSet[]>([])
  const [links, setLinks] = useState<AdLink[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [spend, setSpend] = useState<{ c: Map<string, number>; s: Map<string, number> }>({ c: new Map(), s: new Map() })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    // Last 30 days as Facebook counts it: ending yesterday
    const to = new Date(Date.now() - 86400_000)
    const from = new Date(Date.now() - 30 * 86400_000)
    Promise.all([listAdAccounts(tenant.id), listCampaignTree(tenant.id), campaignSpend(tenant.id, day(from), day(to))])
      .then(([a, t, sp]) => {
        setAccounts(a)
        setCampaigns(t.campaigns)
        setAdsets(t.adsets)
        setLinks(t.links)
        const c = new Map<string, number>()
        const s = new Map<string, number>()
        for (const r of sp) {
          const v = Number(r.spend) // without GST
          c.set(r.campaign_id, (c.get(r.campaign_id) ?? 0) + v)
          s.set(r.adset_id, (s.get(r.adset_id) ?? 0) + v)
        }
        setSpend({ c, s })
      })
      .catch((e: Error) => setError(e.message))
  }, [tenant.id])
  useEffect(load, [load])

  const accName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name ?? a.act_id])), [accounts])
  const campById = useMemo(() => new Map(campaigns.map((c) => [c.campaign_id, c])), [campaigns])
  const setById = useMemo(() => new Map(adsets.map((s) => [s.adset_id, s])), [adsets])
  // only the campaigns whose name has one of the funnel's tags
  const mine = useMemo(() => links.filter((l) => l.funnel_id === funnelId && tagHit(campById.get(l.campaign_id)?.name, tags)), [links, funnelId, campById, tags])

  async function refresh() {
    setBusy(true)
    try {
      await syncMeta(tenant.id)
      onSaved('Bringing in the latest campaigns and numbers from Facebook. Refresh in a minute.')
      window.setTimeout(load, 20000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!accounts) return <div className="empty">Loading…</div>
  if (!accounts.length)
    return (
      <Empty icon={Megaphone}>
        No Facebook ad account is connected yet. <Link to="/integrations" className="link-btn">System Connections → Facebook Ads</Link>
      </Empty>
    )

  return (
    <div className="stack">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="muted small">Campaigns whose leads and spend count for this funnel. Spend is the last 30 days, without GST.</div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void refresh()} title="Bring in the latest campaigns and numbers">
            <RefreshCw size={14} /> Refresh from Facebook
          </button>
        </div>
      </div>

      <CampaignTags
        funnelId={funnelId}
        kind="meta"
        canEdit={canEdit}
        onChange={(t) => {
          const first = !tags.length && !t.length
          setTags(t)
          if (!first) load()
        }}
      />

      {!mine.length ? (
        <Empty icon={Megaphone}>No campaigns in this funnel yet{canEdit ? ': add a tag above.' : '.'}</Empty>
      ) : (
        <div className="camp-chips">
          {[...mine]
            .sort((a, b) => (spend.c.get(b.campaign_id) ?? 0) - (spend.c.get(a.campaign_id) ?? 0))
            .map((l) => {
              const c = campById.get(l.campaign_id)
              const s = l.adset_id ? setById.get(l.adset_id) : null
              const st = s ? s.effective_status : (c?.effective_status ?? null)
              const sp = l.adset_id ? spend.s.get(l.adset_id) : spend.c.get(l.campaign_id)
              const info = [c ? accName.get(c.account_id) : '', s ? `only ad set ${s.name ?? s.adset_id}` : '', c?.objective ? statusLabel(c.objective.replace(/^OUTCOME_/, '')) : '', statusLabel(st), `tag ${tagHit(c?.name, tags) ?? ''}`]
              return (
                <span key={l.id} className="camp-chip" title={info.filter(Boolean).join(' · ')}>
                  <i className={cn('camp-dot', statusTone(st))} />
                  <span className="camp-chip-name">{c?.name ?? l.campaign_id}</span>
                  <b>{sp ? inr(sp) : '—'}</b>
                </span>
              )
            })}
        </div>
      )}

      {mine.length > 0 && <FunnelDaySpend funnelId={funnelId} links={mine} accounts={accounts} campaigns={campaigns} adsets={adsets} />}

    </div>
  )
}
