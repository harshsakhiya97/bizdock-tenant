import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Megaphone, RefreshCw } from 'lucide-react'
import { Empty } from '@/components/ui'
import { DateRangePicker, presetRange, type Range } from '@/components/DateRange'
import { freshRange, useKept } from '@/lib/useKept'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { campaignSpend, campaignTreeSpend, listAdAccounts, listCampaignTree, syncMeta, type AdAccount, type AdLink, type AdSet, type Campaign } from '@/meta/api'
import { CampaignTags, tagHit } from './CampaignTags'
import { FunnelDaySpend } from './FunnelDaySpend'

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
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
  // same presets as Facebook Ads Manager (Last 30 days ends yesterday); spend in the tables and the report is for these dates
  const [range, setRange] = useKept<Range>(`funnel-ads-range:${funnelId}`, () => presetRange('last30'), freshRange)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    Promise.all([listAdAccounts(tenant.id), listCampaignTree(tenant.id), campaignSpend(tenant.id, range.from, range.to)])
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
  }, [tenant.id, range.from, range.to])
  useEffect(load, [load])

  const accName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name ?? a.act_id])), [accounts])
  const campById = useMemo(() => new Map(campaigns.map((c) => [c.campaign_id, c])), [campaigns])
  // only the campaigns whose name has one of the funnel's tags
  const mine = useMemo(() => links.filter((l) => l.funnel_id === funnelId && tagHit(campById.get(l.campaign_id)?.name, tags)), [links, funnelId, campById, tags])
  const ids = useMemo(() => [...new Set(mine.map((l) => l.campaign_id))].sort(), [mine])
  const idKey = ids.join(',')
  const [tree, setTree] = useState<Tree | null>(null)
  useEffect(() => {
    let live = true
    setTree(null)
    campaignTreeSpend(tenant.id, idKey ? idKey.split(',') : [])
      .then((t) => live && setTree(t))
      .catch(() => live && setTree({ ads: [], days: [] }))
    return () => {
      live = false
    }
  }, [tenant.id, idKey])

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
        <div className="muted small">Campaigns whose leads and spend count for this funnel. Spend is without GST.</div>
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

      <section className="card card-pad row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="muted small">Spend in Campaigns, Ads and the report is for these dates.</div>
        <DateRangePicker value={range} onChange={setRange} />
      </section>

      <Collapse title="Campaigns" count={mine.length}>
        {!mine.length ? (
          <Empty icon={Megaphone}>No campaigns in this funnel yet{canEdit ? ': add a tag above.' : '.'}</Empty>
        ) : (
          <CampaignTable links={mine} tree={tree} campById={campById} adsets={adsets} accName={accName} spend30={spend} range={range} />
        )}
      </Collapse>

      {mine.length > 0 && (
        <Collapse title="Ads" count={tree ? adsIn(mine, tree.ads).length : undefined}>
          <AdsTable links={mine} tree={tree} campById={campById} adsets={adsets} range={range} />
        </Collapse>
      )}

      {mine.length > 0 && (
        <Collapse title="Insights">
          <FunnelDaySpend funnelId={funnelId} links={mine} accounts={accounts} campaigns={campaigns} adsets={adsets} range={range} />
        </Collapse>
      )}

    </div>
  )
}

type Sp = { c: Map<string, number>; s: Map<string, number> }
const money = (n: number | null | undefined) => (n ? inr(n) : '—')
function Budget({ daily, life }: { daily?: number | null; life?: number | null }) {
  if (daily) return <>{inr(Number(daily))}<span className="muted small"> /day</span></>
  if (life) return <>{inr(Number(life))}<span className="muted small"> lifetime</span></>
  return <span className="muted">—</span>
}
function Status({ s }: { s: string | null }) {
  return <span className={cn('badge', statusTone(s))}>{statusLabel(s)}</span>
}

/** the funnel's campaigns as a table: campaign → ad sets → ads, with status, budget, spend for 30 days and all time */
function CampaignTable({ links, tree, campById, adsets, accName, spend30, range }: { links: AdLink[]; tree: Tree | null; campById: Map<string, Campaign>; adsets: AdSet[]; accName: Map<string, string>; spend30: Sp; range: Range }) {
  const [openC, setOpenC] = useState<Set<string>>(new Set())
  const [openS, setOpenS] = useState<Set<string>>(new Set())
  const agg = useAgg(tree, range)

  const toggle = (set: Set<string>, put: (s: Set<string>) => void, id: string) => {
    const n = new Set(set)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    put(n)
  }
  const rows = [...links].sort((a, b) => (spend30.c.get(b.campaign_id) ?? 0) - (spend30.c.get(a.campaign_id) ?? 0))
  const tot30 = rows.reduce((t, l) => t + ((l.adset_id ? spend30.s.get(l.adset_id) : spend30.c.get(l.campaign_id)) ?? 0), 0)
  const totAll = rows.reduce((t, l) => t + ((l.adset_id ? agg.all.s.get(l.adset_id) : agg.all.c.get(l.campaign_id)) ?? 0), 0)

  return (
    <div className="table-wrap">
      <table className="table camp-tree">
        <thead>
          <tr>
            <th>Campaign / ad set / ad</th>
            <th>Status</th>
            <th className="num">Daily budget</th>
            <th className="num">Spend</th>
            <th className="num">Total spend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const c = campById.get(l.campaign_id)
            const sets = adsets.filter((s) => s.campaign_id === l.campaign_id && (!l.adset_id || s.adset_id === l.adset_id))
            const cOpen = openC.has(l.id)
            const sp30 = l.adset_id ? spend30.s.get(l.adset_id) : spend30.c.get(l.campaign_id)
            const spAll = l.adset_id ? agg.all.s.get(l.adset_id) : agg.all.c.get(l.campaign_id)
            return (
              <Fragment key={l.id}>
                <tr className="camp-tree-c" onClick={() => toggle(openC, setOpenC, l.id)}>
                  <td>
                    <span className="camp-tree-name">
                      <ChevronRight size={14} className={cn('fat-chev', cOpen && 'is-open')} />
                      <span>
                        <b>{c?.name ?? l.campaign_id}</b>
                        <span className="muted small">
                          {' '}
                          · {c ? accName.get(c.account_id) : ''} · {sets.length} ad set{sets.length === 1 ? '' : 's'}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <Status s={c?.effective_status ?? null} />
                  </td>
                  <td className="num nowrap">
                    <Budget daily={c?.daily_budget} life={c?.lifetime_budget} />
                  </td>
                  <td className="num nowrap">{money(sp30)}</td>
                  <td className="num nowrap">{tree ? money(spAll) : '…'}</td>
                </tr>
                {cOpen &&
                  sets.map((s) => {
                    const sOpen = openS.has(s.adset_id)
                    const ads = (tree?.ads ?? []).filter((a) => a.adset_id === s.adset_id)
                    return (
                      <Fragment key={s.adset_id}>
                        <tr className="camp-tree-s" onClick={() => toggle(openS, setOpenS, s.adset_id)}>
                          <td>
                            <span className="camp-tree-name">
                              <ChevronRight size={14} className={cn('fat-chev', sOpen && 'is-open')} />
                              <span>
                                {s.name ?? s.adset_id}
                                <span className="muted small"> · {ads.length} ad{ads.length === 1 ? '' : 's'}</span>
                              </span>
                            </span>
                          </td>
                          <td>
                            <Status s={s.effective_status} />
                          </td>
                          <td className="num nowrap">
                            <Budget daily={s.daily_budget} life={s.lifetime_budget} />
                          </td>
                          <td className="num nowrap">{money(spend30.s.get(s.adset_id))}</td>
                          <td className="num nowrap">{tree ? money(agg.all.s.get(s.adset_id)) : '…'}</td>
                        </tr>
                        {sOpen &&
                          (ads.length ? (
                            [...ads]
                              .sort((a, b) => (agg.all.a.get(b.ad_id) ?? 0) - (agg.all.a.get(a.ad_id) ?? 0))
                              .map((a) => (
                                <tr key={a.ad_id} className="camp-tree-a">
                                  <td>
                                    <span className="camp-tree-name">{a.name ?? a.ad_id}</span>
                                  </td>
                                  <td>
                                    <Status s={a.effective_status} />
                                  </td>
                                  <td className="num muted">—</td>
                                  <td className="num nowrap">{money(agg.d30.get(a.ad_id))}</td>
                                  <td className="num nowrap">{money(agg.all.a.get(a.ad_id))}</td>
                                </tr>
                              ))
                          ) : (
                            <tr className="camp-tree-a">
                              <td colSpan={5} className="muted small">
                                {tree ? 'No ads.' : 'Loading…'}
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    )
                  })}
              </Fragment>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={3}>Total</th>
            <th className="num">{money(tot30)}</th>
            <th className="num">{tree ? money(totAll) : '…'}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** a section that opens / closes from its header */
function Collapse({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="card fat-card">
      <button type="button" className="fat-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronRight size={16} className={cn('fat-chev', open && 'is-open')} />
        <b>{title}</b>
        {count != null && <span className="tab-count">{count}</span>}
      </button>
      {open && <div className="stack fat-body">{children}</div>}
    </section>
  )
}

type Tree = Awaited<ReturnType<typeof campaignTreeSpend>>
/** spend by campaign / ad set / ad, all time, and by ad for the last 30 days */
function useAgg(tree: Tree | null, range: Range) {
  const { from, to } = range
  return useMemo(() => {
    const all = { c: new Map<string, number>(), s: new Map<string, number>(), a: new Map<string, number>() }
    const d30 = new Map<string, number>()
    for (const r of tree?.days ?? []) {
      const v = Number(r.spend) || 0
      all.c.set(r.campaign_id, (all.c.get(r.campaign_id) ?? 0) + v)
      all.s.set(r.adset_id, (all.s.get(r.adset_id) ?? 0) + v)
      all.a.set(r.ad_id, (all.a.get(r.ad_id) ?? 0) + v)
      if (r.day >= from && r.day <= to) d30.set(r.ad_id, (d30.get(r.ad_id) ?? 0) + v)
    }
    return { all, d30 }
  }, [tree, from, to])
}
/** the ads that count for these links (whole campaigns, or one ad set) */
function adsIn(links: AdLink[], ads: Tree['ads']) {
  const whole = new Set(links.filter((l) => !l.adset_id).map((l) => l.campaign_id))
  const sets = new Set(links.filter((l) => l.adset_id).map((l) => l.adset_id as string))
  return ads.filter((a) => whole.has(a.campaign_id) || sets.has(a.adset_id))
}

/** every ad of the funnel's campaigns, with its campaign / ad set, status and spend */
function AdsTable({ links, tree, campById, adsets, range }: { links: AdLink[]; tree: Tree | null; campById: Map<string, Campaign>; adsets: AdSet[]; range: Range }) {
  const agg = useAgg(tree, range)
  const setName = useMemo(() => new Map(adsets.map((s) => [s.adset_id, s.name])), [adsets])
  if (!tree) return <div className="muted small">Loading…</div>
  const ads = adsIn(links, tree.ads).sort((a, b) => (agg.all.a.get(b.ad_id) ?? 0) - (agg.all.a.get(a.ad_id) ?? 0))
  if (!ads.length) return <div className="muted small">No ads yet.</div>
  const t30 = ads.reduce((t, a) => t + (agg.d30.get(a.ad_id) ?? 0), 0)
  const tAll = ads.reduce((t, a) => t + (agg.all.a.get(a.ad_id) ?? 0), 0)
  return (
    <div className="table-wrap">
      <table className="table camp-tree">
        <thead>
          <tr>
            <th>Ad</th>
            <th>Campaign · ad set</th>
            <th>Status</th>
            <th className="num">Spend</th>
            <th className="num">Total spend</th>
          </tr>
        </thead>
        <tbody>
          {ads.map((a) => (
            <tr key={a.ad_id}>
              <td>
                <b>{a.name ?? a.ad_id}</b>
              </td>
              <td className="muted small">
                {campById.get(a.campaign_id)?.name ?? a.campaign_id} · {setName.get(a.adset_id) ?? a.adset_id}
              </td>
              <td>
                <Status s={a.effective_status} />
              </td>
              <td className="num nowrap">{money(agg.d30.get(a.ad_id))}</td>
              <td className="num nowrap">{money(agg.all.a.get(a.ad_id))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={3}>Total</th>
            <th className="num">{money(t30)}</th>
            <th className="num">{money(tAll)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
