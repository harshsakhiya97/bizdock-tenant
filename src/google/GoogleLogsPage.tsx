import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, RefreshCw, X } from 'lucide-react'
import { DateRangePicker, presetRange, type Range } from '@/components/DateRange'
import { Empty, PageHead, Paged, SearchInput } from '@/components/ui'
import { Flash } from '@/components/Flash'
import { cn } from '@/lib/cn'
import { ago } from '@/team/time'
import { useTenant } from '@/tenant/useTenant'
import { cidText, googleDays, googleStructure, gTone, gWord, listGoogleAccounts, syncGoogle, type GAccount, type GAd, type GDay } from './api'
import { GoogleAdDrawer } from './GoogleAdDrawer'

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = (n: number) => Number(n || 0).toLocaleString('en-IN')

type Level = 'campaigns' | 'groups' | 'ads'
type Obj = { key: string; id: string; account_id: string; campaign_id: string; ad_group_id: string | null; name: string; status: string | null; kind: string | null; ad?: GAd }
type Sums = { spend: number; gst: number; impressions: number; clicks: number; conversions: number }
const zero = (): Sums => ({ spend: 0, gst: 0, impressions: 0, clicks: 0, conversions: 0 })

/** System Connections → Google Ads → Logs: every Google Ads account's campaigns, ad groups and ads with their numbers. */
export function GoogleLogsPage() {
  const tenant = useTenant()
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const [accounts, setAccounts] = useState<GAccount[]>([])
  const [tree, setTree] = useState<Awaited<ReturnType<typeof googleStructure>> | null>(null)
  const [days, setDays] = useState<Record<Level, GDay[]> | null>(null)
  const [range, setRange] = useState<Range>(() => presetRange('last30'))
  const { from, to } = range
  const [account, setAccount] = useState('')
  const [level, setLevel] = useState<Level>('campaigns')
  const [campaign, setCampaign] = useState<Obj | null>(null)
  const [group, setGroup] = useState<Obj | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [hadDelivery, setHadDelivery] = useState(true)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ ad: GAd; sub: string } | null>(null)

  const loadTree = useCallback(() => {
    listGoogleAccounts(tenant.id).then(setAccounts, () => setAccounts([]))
    googleStructure(tenant.id).then(setTree, (e: Error) => setNotice({ error: e.message }))
  }, [tenant.id])
  useEffect(loadTree, [loadTree])
  useEffect(() => {
    setDays(null)
    Promise.all([googleDays(tenant.id, 'campaign', from, to), googleDays(tenant.id, 'ad_group', from, to), googleDays(tenant.id, 'ad', from, to)]).then(
      ([campaigns, groups, ads]) => setDays({ campaigns, groups, ads }),
      (e: Error) => setNotice({ error: e.message }),
    )
  }, [tenant.id, from, to])

  async function sync() {
    setBusy(true)
    try {
      await syncGoogle(tenant.id)
      setNotice({ ok: 'Bringing in the latest from Google Ads. Refresh in a minute.' })
      window.setTimeout(loadTree, 20000)
    } catch (e) {
      setNotice({ error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const campName = useMemo(() => new Map((tree?.campaigns ?? []).map((c) => [c.campaign_id, c.name ?? c.campaign_id])), [tree])
  const groupName = useMemo(() => new Map((tree?.groups ?? []).map((g) => [g.ad_group_id, g.name ?? g.ad_group_id])), [tree])
  const objs = useMemo(() => {
    const t = tree
    if (!t) return null
    return {
      campaigns: t.campaigns.map((c): Obj => ({ key: c.campaign_id, id: c.campaign_id, account_id: c.account_id, campaign_id: c.campaign_id, ad_group_id: null, name: c.name ?? c.campaign_id, status: c.status, kind: c.channel })),
      groups: t.groups.map((g): Obj => ({ key: g.ad_group_id, id: g.ad_group_id, account_id: g.account_id, campaign_id: g.campaign_id, ad_group_id: g.ad_group_id, name: g.name ?? g.ad_group_id, status: g.status, kind: null })),
      ads: t.ads.map((d): Obj => ({ key: `${d.ad_group_id}|${d.ad_id}`, id: d.ad_id, account_id: d.account_id, campaign_id: d.campaign_id, ad_group_id: d.ad_group_id, name: d.name || d.headlines[0] || `Ad ${d.ad_id}`, status: d.status, kind: d.type, ad: d })),
    }
  }, [tree])
  // sums per object over the dates, with GST from its ad account
  const sums = useMemo(() => {
    const by: Record<Level, Map<string, Sums>> = { campaigns: new Map(), groups: new Map(), ads: new Map() }
    for (const l of ['campaigns', 'groups', 'ads'] as Level[]) {
      for (const d of days?.[l] ?? []) {
        const k = l === 'campaigns' ? d.campaign_id : l === 'groups' ? d.ad_group_id : `${d.ad_group_id}|${d.ad_id}`
        const s = by[l].get(k) ?? zero()
        const sp = Number(d.spend || 0)
        s.spend += sp
        s.gst += sp * (1 + Number(accById.get(d.account_id)?.gst_rate ?? 18) / 100)
        s.impressions += Number(d.impressions || 0)
        s.clicks += Number(d.clicks || 0)
        s.conversions += Number(d.conversions || 0)
        by[l].set(k, s)
      }
    }
    return by
  }, [days, accById])
  const scoped = useCallback(
    (l: Level) => (objs?.[l] ?? []).filter((o) => (!account || o.account_id === account) && (!campaign || l === 'campaigns' || o.campaign_id === campaign.id) && (!group || l !== 'ads' || o.ad_group_id === group.id)),
    [objs, account, campaign, group],
  )
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return scoped(level)
      .filter((o) => (!status || o.status === status) && (!hadDelivery || (sums[level].get(o.key)?.impressions ?? 0) > 0 || (sums[level].get(o.key)?.spend ?? 0) > 0) && (!s || o.name.toLowerCase().includes(s)))
      .sort((a, b) => (sums[level].get(b.key)?.spend ?? 0) - (sums[level].get(a.key)?.spend ?? 0))
  }, [scoped, level, q, status, hadDelivery, sums])
  const count = (l: Level) => scoped(l).length
  const synced = accounts.map((a) => a.last_sync_at).filter(Boolean).sort().at(-1)

  const open = (o: Obj) => {
    if (level === 'campaigns') {
      setCampaign(o)
      setGroup(null)
      setLevel('groups')
    } else if (level === 'groups') {
      setGroup(o)
      setLevel('ads')
    } else if (o.ad) setPreview({ ad: o.ad, sub: [accById.get(o.account_id)?.name, campName.get(o.campaign_id), o.ad_group_id ? groupName.get(o.ad_group_id) : null].filter(Boolean).join(' · ') })
  }

  return (
    <>
      <Link to="/integrations" className="back-link">
        <ArrowLeft size={14} /> System Connections
      </Link>
      <PageHead
        title="Google Ads logs"
        subtitle={`Every Google Ads account’s campaigns, ad groups and ads with their numbers.${synced ? ` Numbers ${ago(synced)}.` : ''}`}
        actions={
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void sync()}>
            <RefreshCw size={14} className={busy ? 'spin' : undefined} /> {busy ? 'Starting…' : 'Sync now'}
          </button>
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />
      {accounts.some((a) => a.last_error) && (
        <div className="alert alert-error">
          {accounts
            .filter((a) => a.last_error)
            .map((a) => `${a.name ?? cidText(a.customer_id)}: ${a.last_error}`)
            .join(' · ')}
        </div>
      )}
      <section className="panel">
        <div className="tabs" style={{ padding: '10px 14px 0' }}>
          {(
            [
              ['campaigns', 'Campaigns'],
              ['groups', 'Ad groups'],
              ['ads', 'Ads'],
            ] as [Level, string][]
          ).map(([k, label]) => (
            <button key={k} type="button" className={cn('tab', level === k && 'is-active')} onClick={() => setLevel(k)}>
              {label} ({count(k)})
            </button>
          ))}
        </div>
        <div className="panel-filters">
          <select className="input input-sm filter-select" aria-label="Ad account" value={account} onChange={(e) => (setAccount(e.target.value), setCampaign(null), setGroup(null))}>
            <option value="">All ad accounts</option>
            {accounts
              .filter((a) => !a.is_manager)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name ?? cidText(a.customer_id)}
                </option>
              ))}
          </select>
          <SearchInput placeholder={`Search ${level === 'groups' ? 'ad groups' : level}`} value={q} onChange={setQ} width={220} />
          <select className="input input-sm filter-select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="ENABLED">Enabled</option>
            <option value="PAUSED">Paused</option>
          </select>
          <label className="check">
            <input type="checkbox" checked={hadDelivery} onChange={(e) => setHadDelivery(e.target.checked)} /> Had delivery
          </label>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
        {(campaign || group) && (
          <div className="panel-filters" style={{ paddingTop: 0, gap: 8, flexWrap: 'wrap' }}>
            {campaign && (
              <span className="ml-chip">
                Campaign: {campaign.name}
                <button type="button" className="ml-chip-x" aria-label="Clear campaign" onClick={() => (setCampaign(null), setGroup(null))}>
                  <X size={12} />
                </button>
              </span>
            )}
            {group && (
              <span className="ml-chip">
                Ad group: {group.name}
                <button type="button" className="ml-chip-x" aria-label="Clear ad group" onClick={() => setGroup(null)}>
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
        )}
        {!objs || !days ? (
          <div className="empty">Loading…</div>
        ) : !list.length ? (
          <Empty>{accounts.length ? 'Nothing here for these filters and dates.' : 'No Google Ads account yet: System Connections → Google Ads.'}</Empty>
        ) : (
          <Paged rows={list} reset={[level, account, campaign?.id, group?.id, q, status, hadDelivery, from, to]}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{level === 'campaigns' ? 'Campaign' : level === 'groups' ? 'Ad group' : 'Ad'}</th>
                      <th>Status</th>
                      <th className="num">Spend</th>
                      <th className="num">Impressions</th>
                      <th className="num">Clicks</th>
                      <th className="num">CTR</th>
                      <th className="num">Avg CPC</th>
                      <th className="num">Conversions</th>
                      <th className="num">Cost / conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((o) => {
                      const s = sums[level].get(o.key) ?? zero()
                      return (
                        <tr key={o.key} className="is-clickable" onClick={() => open(o)} title={level === 'ads' ? 'See the ad' : 'See what’s in it'}>
                          <td>
                            <b>{o.name}</b>
                            <div className="muted small">
                              {[accById.get(o.account_id)?.name, level !== 'campaigns' ? campName.get(o.campaign_id) : null, level === 'ads' && o.ad_group_id ? groupName.get(o.ad_group_id) : null, o.kind ? gWord(o.kind) : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          </td>
                          <td>
                            <span className={cn('badge', gTone(o.status))}>{gWord(o.status)}</span>
                          </td>
                          <td className="num nowrap">
                            <span className="gst-hover" title={`${inr(s.spend)} + GST ${inr(s.gst - s.spend)}`}>
                              {inr(s.gst)}
                            </span>
                          </td>
                          <td className="num">{num(s.impressions)}</td>
                          <td className="num">{num(s.clicks)}</td>
                          <td className="num">{s.impressions ? `${((s.clicks / s.impressions) * 100).toFixed(2)}%` : '—'}</td>
                          <td className="num nowrap">{s.clicks ? inr(s.gst / s.clicks) : '—'}</td>
                          <td className="num">{s.conversions ? Number(s.conversions.toFixed(2)) : '—'}</td>
                          <td className="num nowrap">{s.conversions ? inr(s.gst / s.conversions) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Paged>
        )}
      </section>
      {preview && <GoogleAdDrawer ad={preview.ad} sub={preview.sub} customerId={accById.get(preview.ad.account_id)?.customer_id} onClose={() => setPreview(null)} />}
    </>
  )
}
