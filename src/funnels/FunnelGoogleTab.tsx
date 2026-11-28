import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChartNoAxesColumn, ChevronRight, RefreshCw } from 'lucide-react'
import { Empty } from '@/components/ui'
import { DateRangePicker, presetRange, type Range } from '@/components/DateRange'
import { freshRange, useKept } from '@/lib/useKept'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { cidText, googleDays, googleStructure, gTone, gWord, listGoogleAccounts, syncGoogle, type GAccount, type GAd, type GAdGroup, type GCampaign, type GDay, type GLink } from '@/google/api'
import { CampaignTags, tagHit } from './CampaignTags'
import { FunnelDaySpend } from './FunnelDaySpend'
import { Collapse } from './FunnelAdsTab'

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const day = (d: Date) => d.toLocaleDateString('en-CA')
const money = (n: number | null | undefined) => (n ? inr(n) : '—')

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
  // spend in the tables and the insights is for these dates
  const [range, setRange] = useKept<Range>(`funnel-google-range:${funnelId}`, () => presetRange('last30'), freshRange)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    Promise.all([listGoogleAccounts(tenant.id), googleStructure(tenant.id), googleDays(tenant.id, 'campaign', range.from, range.to)])
      .then(([a, t, sp]) => {
        const real = a.filter((x) => !x.is_manager)
        setAccounts(real)
        setTree(t)
        const c = new Map<string, number>()
        for (const r of sp) c.set(r.campaign_id, (c.get(r.campaign_id) ?? 0) + Number(r.spend)) // without GST
        setSpend(c)
      })
      .catch((e: Error) => setError(e.message))
  }, [tenant.id, range.from, range.to])
  useEffect(load, [load])

  const accName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name ?? cidText(a.customer_id)])), [accounts])
  const campById = useMemo(() => new Map((tree?.campaigns ?? []).map((c) => [c.campaign_id, c])), [tree])
  const links = useMemo(() => tree?.links ?? [], [tree])
  // only the campaigns whose name has one of the funnel's tags
  const mine = useMemo(() => links.filter((l) => l.funnel_id === funnelId && tagHit(campById.get(l.campaign_id)?.name, tags)), [links, funnelId, campById, tags])
  // every day of these campaigns (all time), per level: spend for the dates and in total
  const idKey = useMemo(() => [...new Set(mine.map((l) => l.campaign_id))].sort().join(','), [mine])
  const [days, setDays] = useState<GDay[] | null>(null)
  useEffect(() => {
    let live = true
    setDays(null)
    const ids = idKey ? idKey.split(',') : []
    const until = day(new Date())
    // each level has its own rows (Performance Max has no ad rows, so a campaign's total comes from its campaign rows)
    Promise.all((['campaign', 'ad_group', 'ad'] as const).map((lv) => googleDays(tenant.id, lv, '2000-01-01', until, ids)))
      .then((d) => live && setDays(d.flat()))
      .catch(() => live && setDays([]))
    return () => {
      live = false
    }
  }, [tenant.id, idKey])

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
        <div className="muted small">Google campaigns whose spend counts for this funnel. Spend is without GST.</div>
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

      <section className="card card-pad row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="muted small">Spend in Campaigns, Ads and the insights is for these dates.</div>
        <DateRangePicker value={range} onChange={setRange} />
      </section>

      <Collapse title="Campaigns" count={mine.length}>
        {!mine.length ? (
          <Empty icon={ChartNoAxesColumn}>No Google campaigns in this funnel yet{canEdit ? ': add a tag above.' : '.'}</Empty>
        ) : (
          <GCampaignTable links={mine} days={days} range={range} campById={campById} groups={tree.groups} ads={tree.ads} accName={accName} spendR={spend} />
        )}
      </Collapse>

      {mine.length > 0 && (
        <Collapse title="Ads" count={tree.ads.filter((a) => mine.some((l) => l.campaign_id === a.campaign_id)).length}>
          <GAdsTable links={mine} days={days} range={range} campById={campById} groups={tree.groups} ads={tree.ads} />
        </Collapse>
      )}

      {mine.length > 0 && (
        <Collapse title="Insights">
          <FunnelDaySpend
            funnelId={funnelId}
            links={mine.map((l) => ({ campaign_id: l.campaign_id, adset_id: null }))}
            accounts={accounts}
            campaigns={tree.campaigns}
            adsets={tree.groups.map((g) => ({ adset_id: g.ad_group_id, name: g.name }))}
            google={{ ads: tree.ads, campaigns: tree.campaigns, customers: new Map(accounts.map((a) => [a.id, a.customer_id])) }}
            range={range}
          />
        </Collapse>
      )}
    </div>
  )
}

/** spend by campaign / ad group / ad: all time, and for the dates */
function useGAgg(days: GDay[] | null, range: Range) {
  const { from, to } = range
  return useMemo(() => {
    const all = { c: new Map<string, number>(), g: new Map<string, number>(), a: new Map<string, number>() }
    const inR = { g: new Map<string, number>(), a: new Map<string, number>() }
    const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)
    for (const r of days ?? []) {
      const v = Number(r.spend) || 0
      const inside = r.day >= from && r.day <= to
      if (r.level === 'campaign') add(all.c, r.campaign_id, v)
      else if (r.level === 'ad_group') {
        add(all.g, r.ad_group_id, v)
        if (inside) add(inR.g, r.ad_group_id, v)
      } else {
        add(all.a, r.ad_id, v)
        if (inside) add(inR.a, r.ad_id, v)
      }
    }
    return { all, inR }
  }, [days, from, to])
}
function GStatus({ s }: { s: string | null }) {
  return <span className={cn('badge', gTone(s))}>{gWord(s)}</span>
}
function GBudget({ c }: { c?: GCampaign }) {
  if (c?.total_budget) return <>{inr(Number(c.total_budget))}<span className="muted small"> total</span></>
  if (c?.daily_budget) return <>{inr(Number(c.daily_budget))}<span className="muted small"> /day</span></>
  return <span className="muted">—</span>
}
type GProps = { links: GLink[]; days: GDay[] | null; range: Range; campById: Map<string, GCampaign>; groups: GAdGroup[]; ads: GAd[] }
const adName = (a: GAd) => a.name || a.headlines?.[0] || a.ad_id

/** the funnel's Google campaigns: campaign → ad group → ad, with status, budget, spend for the dates and all time */
function GCampaignTable({ links, days, range, campById, groups, ads, accName, spendR }: GProps & { accName: Map<string, string>; spendR: Map<string, number> }) {
  const agg = useGAgg(days, range)
  const [openC, setOpenC] = useState<Set<string>>(new Set())
  const [openG, setOpenG] = useState<Set<string>>(new Set())
  const flip = (set: Set<string>, put: (s: Set<string>) => void, id: string) => {
    const n = new Set(set)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    put(n)
  }
  const rows = [...links].sort((a, b) => (spendR.get(b.campaign_id) ?? 0) - (spendR.get(a.campaign_id) ?? 0))
  const totR = rows.reduce((t, l) => t + (spendR.get(l.campaign_id) ?? 0), 0)
  const totAll = rows.reduce((t, l) => t + (agg.all.c.get(l.campaign_id) ?? 0), 0)
  return (
    <div className="table-wrap">
      <table className="table camp-tree">
        <thead>
          <tr>
            <th>Campaign / ad group / ad</th>
            <th>Status</th>
            <th className="num">Daily budget</th>
            <th className="num">Spend</th>
            <th className="num">Total spend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const c = campById.get(l.campaign_id)
            const gs = groups.filter((g) => g.campaign_id === l.campaign_id)
            const cOpen = openC.has(l.id)
            return (
              <Fragment key={l.id}>
                <tr className="camp-tree-c" onClick={() => flip(openC, setOpenC, l.id)}>
                  <td>
                    <span className="camp-tree-name">
                      <ChevronRight size={14} className={cn('fat-chev', cOpen && 'is-open')} />
                      <span>
                        <b>{c?.name ?? l.campaign_id}</b>
                        <span className="muted small">
                          {' '}
                          · {c ? accName.get(c.account_id) : ''}
                          {c?.channel ? ` · ${gWord(c.channel)}` : ''} · {gs.length} ad group{gs.length === 1 ? '' : 's'}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <GStatus s={c?.status ?? null} />
                  </td>
                  <td className="num nowrap">
                    <GBudget c={c} />
                  </td>
                  <td className="num nowrap">{money(spendR.get(l.campaign_id))}</td>
                  <td className="num nowrap">{days ? money(agg.all.c.get(l.campaign_id)) : '…'}</td>
                </tr>
                {cOpen &&
                  gs.map((g) => {
                    const gOpen = openG.has(g.ad_group_id)
                    const list = ads.filter((a) => a.ad_group_id === g.ad_group_id)
                    return (
                      <Fragment key={g.ad_group_id}>
                        <tr className="camp-tree-s" onClick={() => flip(openG, setOpenG, g.ad_group_id)}>
                          <td>
                            <span className="camp-tree-name">
                              <ChevronRight size={14} className={cn('fat-chev', gOpen && 'is-open')} />
                              <span>
                                {g.name ?? g.ad_group_id}
                                <span className="muted small"> · {list.length} ad{list.length === 1 ? '' : 's'}</span>
                              </span>
                            </span>
                          </td>
                          <td>
                            <GStatus s={g.status} />
                          </td>
                          <td className="num muted">—</td>
                          <td className="num nowrap">{days ? money(agg.inR.g.get(g.ad_group_id)) : '…'}</td>
                          <td className="num nowrap">{days ? money(agg.all.g.get(g.ad_group_id)) : '…'}</td>
                        </tr>
                        {gOpen &&
                          (list.length ? (
                            [...list]
                              .sort((a, b) => (agg.all.a.get(b.ad_id) ?? 0) - (agg.all.a.get(a.ad_id) ?? 0))
                              .map((a) => (
                                <tr key={a.ad_id} className="camp-tree-a">
                                  <td>
                                    <span className="camp-tree-name">{adName(a)}</span>
                                  </td>
                                  <td>
                                    <GStatus s={a.status} />
                                  </td>
                                  <td className="num muted">—</td>
                                  <td className="num nowrap">{money(agg.inR.a.get(a.ad_id))}</td>
                                  <td className="num nowrap">{money(agg.all.a.get(a.ad_id))}</td>
                                </tr>
                              ))
                          ) : (
                            <tr className="camp-tree-a">
                              <td colSpan={5} className="muted small">
                                No ads.
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
            <th className="num">{money(totR)}</th>
            <th className="num">{days ? money(totAll) : '…'}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** every ad of the funnel's Google campaigns, with its campaign / ad group, status and spend */
function GAdsTable({ links, days, range, campById, groups, ads }: GProps) {
  const agg = useGAgg(days, range)
  const groupName = useMemo(() => new Map(groups.map((g) => [g.ad_group_id, g.name])), [groups])
  if (!days) return <div className="muted small">Loading…</div>
  const ids = new Set(links.map((l) => l.campaign_id))
  const list = ads.filter((a) => ids.has(a.campaign_id)).sort((a, b) => (agg.all.a.get(b.ad_id) ?? 0) - (agg.all.a.get(a.ad_id) ?? 0))
  if (!list.length) return <div className="muted small">No ads yet.</div>
  const tR = list.reduce((t, a) => t + (agg.inR.a.get(a.ad_id) ?? 0), 0)
  const tAll = list.reduce((t, a) => t + (agg.all.a.get(a.ad_id) ?? 0), 0)
  return (
    <div className="table-wrap">
      <table className="table camp-tree">
        <thead>
          <tr>
            <th>Ad</th>
            <th>Campaign · ad group</th>
            <th>Status</th>
            <th className="num">Spend</th>
            <th className="num">Total spend</th>
          </tr>
        </thead>
        <tbody>
          {list.map((a) => (
            <tr key={a.ad_id}>
              <td>
                <b>{adName(a)}</b>
                {a.type && <span className="muted small"> · {gWord(a.type)}</span>}
              </td>
              <td className="muted small">
                {campById.get(a.campaign_id)?.name ?? a.campaign_id} · {groupName.get(a.ad_group_id) ?? a.ad_group_id}
              </td>
              <td>
                <GStatus s={a.status} />
              </td>
              <td className="num nowrap">{money(agg.inR.a.get(a.ad_id))}</td>
              <td className="num nowrap">{money(agg.all.a.get(a.ad_id))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={3}>Total</th>
            <th className="num">{money(tR)}</th>
            <th className="num">{money(tAll)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
