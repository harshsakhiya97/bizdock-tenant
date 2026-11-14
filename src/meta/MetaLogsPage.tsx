import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Megaphone, RefreshCw, X } from 'lucide-react'
import { ConfirmModal, Empty, PageHead, Paged, SearchInput } from '@/components/ui'
import { Flash } from '@/components/Flash'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { disconnectIntegration, listIntegrations, type IntegrationRow } from '@/integrations/api'
import { ago as agoTime } from '@/team/time'
import { connectMeta, listAdAccounts, metaLogs, type AdAccount, type MetaDay, type MetaObj } from './api'
import { MetaSettingsDrawer } from './MetaSettingsDrawer'
import { MetaTokenConnect } from './MetaTokenConnect'
import { AdPreviewDrawer } from './AdPreviewDrawer'

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const inr2 = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = (n: number) => Number(n || 0).toLocaleString('en-IN')
const day = (d: Date) => d.toLocaleDateString('en-CA')
const ago = (n: number) => day(new Date(Date.now() - n * 86400_000))
const PRESETS = [
  { key: 'today', label: 'Today', from: () => ago(0) },
  { key: 'yesterday', label: 'Yesterday', from: () => ago(1), to: () => ago(1) },
  { key: '7', label: 'Last 7 days', from: () => ago(6) },
  { key: '30', label: 'Last 30 days', from: () => ago(29) },
  { key: '90', label: 'Last 90 days', from: () => ago(89) },
  { key: 'month', label: 'This month', from: () => `${day(new Date()).slice(0, 8)}01` },
  { key: 'all', label: 'Everything', from: () => '2020-01-01' },
] as const

/** Facebook's delivery words */
const STATUS: Record<string, [string, string]> = {
  ACTIVE: ['Active', 'badge-success'],
  PAUSED: ['Off', 'badge-muted'],
  CAMPAIGN_PAUSED: ['Campaign off', 'badge-muted'],
  ADSET_PAUSED: ['Ad set off', 'badge-muted'],
  ARCHIVED: ['Archived', 'badge-muted'],
  DELETED: ['Deleted', 'badge-muted'],
  IN_PROCESS: ['In process', 'badge-warning'],
  PENDING_REVIEW: ['In review', 'badge-warning'],
  PREAPPROVED: ['Approved', 'badge-success'],
  DISAPPROVED: ['Rejected', 'badge-danger'],
  WITH_ISSUES: ['With issues', 'badge-danger'],
  PENDING_BILLING_INFO: ['Billing needed', 'badge-danger'],
}
/** account_status: 1 active, 2 disabled, 3 unsettled, 7 pending risk review, 9 in grace period, 100/101 closing/closed */
const ACCOUNT_OFF: Record<number, string> = { 2: 'Account disabled', 3: 'Account unsettled', 7: 'Account in review', 9: 'Grace period', 100: 'Account closing', 101: 'Account closed' }

type Level = 'campaigns' | 'adsets' | 'ads'
type Sums = { spend: number; spend_gst: number; impressions: number; reach: number; clicks: number; link_clicks: number; lpv: number; leads: number; purchases: number }
const zero = (): Sums => ({ spend: 0, spend_gst: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, lpv: 0, leads: 0, purchases: 0 })

/** System Connections → Facebook Ads → Logs: the Facebook connections, and every ad account's campaigns, ad sets and ads with their numbers, like Ads Manager. */
export function MetaLogsPage() {
  const tenant = useTenant()
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const [conns, setConns] = useState<IntegrationRow[]>([])
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const [data, setData] = useState<Awaited<ReturnType<typeof metaLogs>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<string>('30')
  const [from, setFrom] = useState(ago(29))
  const [to, setTo] = useState(day(new Date()))
  const [account, setAccount] = useState('')
  const [level, setLevel] = useState<Level>('campaigns')
  const [campaign, setCampaign] = useState<MetaObj | null>(null)
  const [adset, setAdset] = useState<MetaObj | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [hadDelivery, setHadDelivery] = useState(false)

  // connection actions
  const [tokenFor, setTokenFor] = useState<IntegrationRow | null>(null)
  const [settingsFor, setSettingsFor] = useState<IntegrationRow | null>(null)
  const [removing, setRemoving] = useState<IntegrationRow | null>(null)
  const [preview, setPreview] = useState<{ id: string; name: string | null; sub: string } | null>(null)
  const [fbWait, setFbWait] = useState<{ cancel: () => void } | null>(null)

  const loadConns = useCallback(() => {
    listIntegrations(tenant.id).then((r) => setConns(r.filter((x) => x.provider === 'facebook_ads')), (e: Error) => setNotice({ error: e.message }))
    listAdAccounts(tenant.id).then(setAccounts, () => setAccounts([]))
  }, [tenant.id])
  useEffect(loadConns, [loadConns])

  const load = useCallback(() => {
    setData(null)
    setError(null)
    metaLogs(tenant.id, from, to).then(setData, (e: Error) => setError(e.message))
  }, [tenant.id, from, to])
  useEffect(load, [load])

  function pickPreset(k: string) {
    setPreset(k)
    const p = PRESETS.find((x) => x.key === k)
    if (p) {
      setFrom(p.from())
      setTo('to' in p ? p.to() : day(new Date()))
    }
  }
  function reconnect(id: string) {
    try {
      const c = connectMeta(tenant.id, id)
      setFbWait({ cancel: c.cancel })
      c.done
        .then((r) => setNotice(r.ok ? { ok: `${r.message} Its numbers are being brought in.` } : r.message === 'Cancelled.' ? {} : { error: r.message }))
        .catch((e: Error) => setNotice({ error: e.message }))
        .finally(() => {
          setFbWait(null)
          loadConns()
        })
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }

  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const names = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of [...(data?.campaigns ?? []), ...(data?.adsets ?? [])]) m.set(o.id, o.name ?? o.id)
    return m
  }, [data])

  // sums per campaign / ad set / ad over the dates
  const sums = useMemo(() => {
    const by: Record<Level, Map<string, Sums>> = { campaigns: new Map(), adsets: new Map(), ads: new Map() }
    const add = (m: Map<string, Sums>, k: string, d: MetaDay, gst: number) => {
      const s = m.get(k) ?? zero()
      const sp = Number(d.spend || 0)
      s.spend += sp
      s.spend_gst += sp * (1 + gst / 100)
      s.impressions += Number(d.impressions || 0)
      s.reach += Number(d.reach || 0)
      s.clicks += Number(d.clicks || 0)
      s.link_clicks += Number(d.link_clicks || 0)
      s.lpv += Number(d.landing_page_views || 0)
      s.leads += Number(d.leads || 0)
      s.purchases += Number(d.purchases || 0)
      m.set(k, s)
    }
    for (const d of data?.days ?? []) {
      const gst = Number(accById.get(d.account_id)?.gst_rate ?? 18)
      add(by.campaigns, d.campaign_id, d, gst)
      add(by.adsets, d.adset_id, d, gst)
      add(by.ads, d.ad_id, d, gst)
    }
    return by
  }, [data, accById])

  const all = useMemo(() => (data ? { campaigns: data.campaigns, adsets: data.adsets, ads: data.ads } : null), [data])
  /** what the account / campaign / ad set picks leave at a level (before search and status) */
  const scoped = useCallback(
    (l: Level) =>
      (all?.[l] ?? []).filter(
        (o) => (!account || o.account_id === account) && (!campaign || l === 'campaigns' || o.campaign_id === campaign.id) && (!adset || l !== 'ads' || o.adset_id === adset.id),
      ),
    [all, account, campaign, adset],
  )
  const delivery = (o: MetaObj): [string, string] => {
    const acc = accById.get(o.account_id)
    if (acc?.account_status && ACCOUNT_OFF[acc.account_status]) return [ACCOUNT_OFF[acc.account_status], 'badge-danger']
    const st = o.effective_status ?? o.status ?? ''
    return STATUS[st] ?? [st ? st.toLowerCase().replace(/_/g, ' ') : '—', 'badge-muted']
  }
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return scoped(level)
      .map((o) => ({ o, n: sums[level].get(o.id) ?? zero() }))
      .filter(
        ({ o, n }) =>
          (!s || `${o.name ?? ''} ${o.id}`.toLowerCase().includes(s)) &&
          (!status || (status === 'active' ? delivery(o)[0] === 'Active' : delivery(o)[0] !== 'Active')) &&
          (!hadDelivery || n.impressions > 0 || n.spend > 0),
      )
      .sort((a, b) => b.n.spend - a.n.spend || (a.o.name ?? '').localeCompare(b.o.name ?? ''))
  }, [scoped, level, sums, q, status, hadDelivery, accById])
  const total = useMemo(() => rows.reduce((t, { n }) => {
    for (const k of Object.keys(t) as (keyof Sums)[]) t[k] += n[k]
    return t
  }, zero()), [rows])

  function open(o: MetaObj) {
    if (level === 'campaigns') {
      setCampaign(o)
      setAdset(null)
      setLevel('adsets')
    } else if (level === 'adsets') {
      setAdset(o)
      if (!campaign) setCampaign(data?.campaigns.find((c) => c.id === o.campaign_id) ?? null)
      setLevel('ads')
    } else {
      setPreview({ id: o.id, name: o.name, sub: `${accById.get(o.account_id)?.name ?? ''} · ${names.get(o.campaign_id) ?? o.campaign_id}${o.adset_id ? ` · ${names.get(o.adset_id) ?? o.adset_id}` : ''}` })
      return
    }
    setQ('')
  }

  const ctr = (n: Sums) => (n.impressions ? `${((n.link_clicks / n.impressions) * 100).toFixed(2)}%` : '—')
  const per = (n: Sums, d: number) => (d ? inr2(n.spend / d) : '—')
  const cells = (n: Sums) => (
    <>
      <td className="num nowrap">
        {n.spend ? (
          <span className="gst-hover" title={`${inr2(n.spend)} + GST ${inr2(n.spend_gst - n.spend)} = ${inr2(n.spend_gst)}`}>
            {inr(n.spend_gst)}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="num">{n.impressions ? num(n.impressions) : '—'}</td>
      <td className="num">{n.reach ? num(n.reach) : '—'}</td>
      <td className="num">{n.reach ? (n.impressions / n.reach).toFixed(2) : '—'}</td>
      <td className="num">{n.clicks ? num(n.clicks) : '—'}</td>
      <td className="num">{n.link_clicks ? num(n.link_clicks) : '—'}</td>
      <td className="num">{ctr(n)}</td>
      <td className="num nowrap">{per(n, n.link_clicks)}</td>
      <td className="num nowrap">{n.impressions ? inr2((n.spend / n.impressions) * 1000) : '—'}</td>
      <td className="num">{n.lpv ? num(n.lpv) : '—'}</td>
      <td className="num">{n.leads ? num(n.leads) : '—'}</td>
      <td className="num nowrap">{per(n, n.leads)}</td>
      <td className="num">{n.purchases ? num(n.purchases) : '—'}</td>
      <td className="num nowrap">{per(n, n.purchases)}</td>
    </>
  )
  const LEVELS: [Level, string][] = [
    ['campaigns', 'Campaigns'],
    ['adsets', 'Ad sets'],
    ['ads', 'Ads'],
  ]

  return (
    <>
      <PageHead
        title="Facebook Ads logs"
        subtitle="Your Facebook connections, and every campaign, ad set and ad of the connected ad accounts with their numbers."
        actions={
          <Link to="/integrations" className="btn btn-outline">
            <ArrowLeft size={16} /> System Connections
          </Link>
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      {/* the connections (a Facebook login or a pasted token each) */}
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-filters">
          <b>Connections</b>
          {fbWait && (
            <span className="muted small row" style={{ gap: 6, marginLeft: 'auto' }}>
              Waiting for Facebook…
              <button type="button" className="btn btn-ghost btn-sm" onClick={fbWait.cancel}>
                Cancel
              </button>
            </span>
          )}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Connection</th>
                <th>Connected with</th>
                <th>Ad accounts</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {conns.map((c) => {
                const mine = accounts.filter((a) => a.integration_id === c.id)
                return (
                  <tr key={c.id}>
                    <td>
                      <b>{c.label || 'Facebook'}</b>
                      {c.config.fb_name && <div className="muted small">{c.config.fb_name}</div>}
                    </td>
                    <td>{c.config.auth === 'token' ? 'A token (Add with keys)' : 'Facebook login'}</td>
                    <td className="small">{mine.map((a) => a.name || a.act_id).join(', ') || '—'}</td>
                    <td>
                      {c.status === 'error' ? (
                        <span className="badge badge-danger" title={c.last_error ?? ''}>
                          Needs attention
                        </span>
                      ) : (
                        <span className="badge badge-success">Connected</span>
                      )}
                      {c.status === 'error' && c.last_error && <div className="muted small">{c.last_error}</div>}
                      {c.updated_at && <div className="muted small">Updated {agoTime(c.updated_at)}</div>}
                    </td>
                    <td className="nowrap" style={{ textAlign: 'right' }}>
                      {c.config.auth === 'token' ? (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTokenFor(c)}>
                          New token
                        </button>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={!!fbWait} onClick={() => reconnect(c.id)}>
                          Reconnect
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSettingsFor(c)}>
                        Settings
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(c)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!conns.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    No Facebook connection yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {error && <div className="alert alert-error">{error}</div>}
      <section className="panel">
        <div className="tabs" style={{ padding: '0 12px' }}>
          {LEVELS.map(([k, label]) => (
            <button key={k} type="button" className={cn('tab', level === k && 'is-active')} onClick={() => setLevel(k)}>
              {label}
              {all && <span className="muted small"> ({scoped(k).length})</span>}
            </button>
          ))}
        </div>
        <div className="panel-filters">
          <select className="input input-sm filter-select" aria-label="Ad account" value={account} onChange={(e) => (setAccount(e.target.value), setCampaign(null), setAdset(null))}>
            <option value="">All ad accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.act_id}
              </option>
            ))}
          </select>
          <SearchInput placeholder={`Search ${LEVELS.find((l) => l[0] === level)?.[1].toLowerCase()}`} value={q} onChange={setQ} width={220} />
          <select className="input input-sm filter-select" aria-label="Delivery" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All delivery</option>
            <option value="active">Active</option>
            <option value="off">Not active</option>
          </select>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={hadDelivery} onChange={(e) => setHadDelivery(e.target.checked)} /> Had delivery
          </label>
          <select className="input input-sm filter-select" aria-label="Period" value={preset} onChange={(e) => pickPreset(e.target.value)}>
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom dates</option>
          </select>
          {preset === 'custom' && (
            <>
              <input className="input input-sm filter-select" type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <input className="input input-sm filter-select" type="date" aria-label="To" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={load} title="Refresh" aria-label="Refresh" style={{ marginLeft: 'auto' }}>
            <RefreshCw size={14} />
          </button>
        </div>
        {(campaign || adset) && (
          <div className="panel-filters" style={{ paddingTop: 0, gap: 8, flexWrap: 'wrap' }}>
            {campaign && (
              <span className="ml-chip">
                Campaign: {campaign.name ?? campaign.id}
                <button type="button" className="ml-chip-x" aria-label="Clear campaign" onClick={() => (setCampaign(null), setAdset(null))}>
                  <X size={12} />
                </button>
              </span>
            )}
            {adset && (
              <span className="ml-chip">
                Ad set: {adset.name ?? adset.id}
                <button type="button" className="ml-chip-x" aria-label="Clear ad set" onClick={() => setAdset(null)}>
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
        )}
        {!data ? (
          <div className="empty">Loading…</div>
        ) : !rows.length ? (
          <Empty icon={Megaphone}>Nothing for these filters.</Empty>
        ) : (
          <Paged rows={rows} reset={[level, account, campaign?.id, adset?.id]}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 340 }}>{LEVELS.find((l) => l[0] === level)?.[1].replace(/s$/, '')}</th>
                      <th>Delivery</th>
                      <th className="num" title="With GST (hover: without GST + GST)">
                        Spend
                      </th>
                      <th className="num">Impressions</th>
                      <th className="num" title="Facebook's reach per day, added up over the days">
                        Reach
                      </th>
                      <th className="num">Frequency</th>
                      <th className="num">Clicks (all)</th>
                      <th className="num">Link clicks</th>
                      <th className="num" title="Link clicks ÷ impressions">
                        CTR
                      </th>
                      <th className="num" title="Spend (without GST) per link click">
                        CPC
                      </th>
                      <th className="num" title="Spend (without GST) per 1,000 impressions">
                        CPM
                      </th>
                      <th className="num">Landing page views</th>
                      <th className="num">Leads</th>
                      <th className="num" title="Spend (without GST) per lead">
                        Cost / lead
                      </th>
                      <th className="num">Purchases</th>
                      <th className="num" title="Spend (without GST) per purchase">
                        Cost / purchase
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map(({ o, n }) => {
                      const [label, tone] = delivery(o)
                      const acc = accById.get(o.account_id)
                      return (
                        <tr key={o.id} className="is-clickable" onClick={() => open(o)} title={level === 'campaigns' ? 'Open its ad sets' : level === 'adsets' ? 'Open its ads' : 'See the ad’s preview'}>
                          <td style={{ minWidth: 340, maxWidth: 440 }}>
                            <b>{o.name ?? o.id}</b>
                            <div className="muted small">
                              {acc?.name ?? ''}
                              {level !== 'campaigns' && ` · ${names.get(o.campaign_id) ?? o.campaign_id}`}
                              {level === 'ads' && o.adset_id && ` · ${names.get(o.adset_id) ?? o.adset_id}`}
                            </div>
                          </td>
                          <td className="nowrap">
                            <span className={cn('badge', tone)}>{label}</span>
                          </td>
                          {cells(n)}
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>
                        <b>Results from {rows.length}</b>
                      </td>
                      <td />
                      {cells(total)}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Paged>
        )}
      </section>

      {preview && <AdPreviewDrawer ad={preview} onClose={() => setPreview(null)} />}
      {tokenFor && (
        <MetaTokenConnect
          integrationId={tokenFor.id}
          label={tokenFor.label}
          onClose={() => setTokenFor(null)}
          onDone={(msg) => {
            setTokenFor(null)
            setNotice({ ok: msg })
            loadConns()
            window.setTimeout(load, 20000)
          }}
        />
      )}
      {settingsFor && (
        <MetaSettingsDrawer
          row={settingsFor}
          accounts={accounts.filter((x) => x.integration_id === settingsFor.id)}
          onClose={() => setSettingsFor(null)}
          onSaved={(msg) => {
            setSettingsFor(null)
            setNotice({ ok: msg })
            loadConns()
          }}
        />
      )}
      {removing && (
        <ConfirmModal
          open
          title={`Remove ${removing.label || 'this Facebook connection'}?`}
          message="BizDock stops bringing in this connection’s ad numbers. The numbers already brought in, and the funnels’ campaign links, stay."
          confirmLabel="Remove"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const r = removing
            setRemoving(null)
            try {
              await disconnectIntegration(r.id)
              setNotice({ ok: 'Removed.' })
              loadConns()
            } catch (e) {
              setNotice({ error: (e as Error).message })
            }
          }}
        />
      )}
    </>
  )
}
