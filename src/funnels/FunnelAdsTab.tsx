import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Megaphone, RefreshCw } from 'lucide-react'
import { Empty } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { campaignSpend, campaignTreeSpend, listAdAccounts, listCampaignTree, syncMeta, type AdAccount, type AdLink, type AdSet, type Campaign } from '@/meta/api'
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

      <Collapse title="Campaigns" count={mine.length}>
        {!mine.length ? (
          <Empty icon={Megaphone}>No campaigns in this funnel yet{canEdit ? ': add a tag above.' : '.'}</Empty>
        ) : (
          <CampaignTable links={mine} campById={campById} adsets={adsets} accName={accName} spend30={spend} />
        )}
      </Collapse>

      {mine.length > 0 && (
        <Collapse title="Ads">
          <FunnelDaySpend funnelId={funnelId} links={mine} accounts={accounts} campaigns={campaigns} adsets={adsets} />
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
function CampaignTable({ links, campById, adsets, accName, spend30 }: { links: AdLink[]; campById: Map<string, Campaign>; adsets: AdSet[]; accName: Map<string, string>; spend30: Sp }) {
  const tenant = useTenant()
  const ids = useMemo(() => [...new Set(links.map((l) => l.campaign_id))], [links])
  const [tree, setTree] = useState<Awaited<ReturnType<typeof campaignTreeSpend>> | null>(null)
  const [openC, setOpenC] = useState<Set<string>>(new Set())
  const [openS, setOpenS] = useState<Set<string>>(new Set())
  useEffect(() => {
    let live = true
    campaignTreeSpend(tenant.id, ids)
      .then((t) => live && setTree(t))
      .catch(() => live && setTree({ ads: [], days: [] }))
    return () => {
      live = false
    }
  }, [tenant.id, ids])

  // spend: ad → 30 days / all time
  const from30 = day(new Date(Date.now() - 30 * 86400_000))
  const agg = useMemo(() => {
    const all = { c: new Map<string, number>(), s: new Map<string, number>(), a: new Map<string, number>() }
    const d30 = new Map<string, number>()
    for (const r of tree?.days ?? []) {
      const v = Number(r.spend) || 0
      all.c.set(r.campaign_id, (all.c.get(r.campaign_id) ?? 0) + v)
      all.s.set(r.adset_id, (all.s.get(r.adset_id) ?? 0) + v)
      all.a.set(r.ad_id, (all.a.get(r.ad_id) ?? 0) + v)
      if (r.day >= from30) d30.set(r.ad_id, (d30.get(r.ad_id) ?? 0) + v)
    }
    return { all, d30 }
  }, [tree, from30])

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
            <th className="num">Spend · 30 days</th>
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
