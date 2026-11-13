import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ChevronRight, Megaphone, RefreshCw } from 'lucide-react'
import { Empty, SearchInput } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { campaignSpend, listAdAccounts, listCampaignTree, saveFunnelLinks, syncMeta, type AdAccount, type AdLink, type AdSet, type Campaign } from '@/meta/api'
import { listFunnels } from './api'
import { AdSpendCompare } from './AdSpendCompare'

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const day = (d: Date) => d.toLocaleDateString('en-CA')
const ACTIVE = new Set(['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW'])
const statusTone = (s: string | null) => (s && ACTIVE.has(s) ? 'badge-success' : s === 'PAUSED' || s === 'CAMPAIGN_PAUSED' || s === 'ADSET_PAUSED' ? 'badge-warning' : 'badge-muted')
const statusLabel = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—')

/** what this funnel takes: per campaign, the whole campaign ('all') or some of its ad sets */
type Pick = Map<string, 'all' | Set<string>>

/**
 * Funnel → Facebook Ads: pick the campaigns (whole, with ad sets added later) or only some of their ad sets that bring
 * this funnel's leads, like Access Control's business / sub-business picker. An ad set belongs to one funnel.
 */
export function FunnelAdsTab({ funnelId, canEdit, onSaved }: { funnelId: string; canEdit: boolean; onSaved: (msg: string) => void }) {
  const tenant = useTenant()
  const [accounts, setAccounts] = useState<AdAccount[] | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [adsets, setAdsets] = useState<AdSet[]>([])
  const [links, setLinks] = useState<AdLink[]>([])
  const [funnelNames, setFunnelNames] = useState<Map<string, string>>(new Map())
  const [spend, setSpend] = useState<{ c: Map<string, number>; s: Map<string, number> }>({ c: new Map(), s: new Map() })
  const [pick, setPick] = useState<Pick>(new Map())
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [acc, setAcc] = useState('')
  const [onlyActive, setOnlyActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    const to = new Date()
    const from = new Date(Date.now() - 29 * 86400_000)
    Promise.all([listAdAccounts(tenant.id), listCampaignTree(tenant.id), listFunnels(tenant.id), campaignSpend(tenant.id, day(from), day(to))])
      .then(([a, t, fs, sp]) => {
        setAccounts(a)
        setCampaigns(t.campaigns)
        setAdsets(t.adsets)
        setLinks(t.links)
        setFunnelNames(new Map(fs.map((f) => [f.id, f.name])))
        const gst = new Map(a.map((x) => [x.id, Number(x.gst_rate)]))
        const c = new Map<string, number>()
        const s = new Map<string, number>()
        for (const r of sp) {
          const v = Number(r.spend) * (1 + (gst.get(r.account_id) ?? 18) / 100)
          c.set(r.campaign_id, (c.get(r.campaign_id) ?? 0) + v)
          s.set(r.adset_id, (s.get(r.adset_id) ?? 0) + v)
        }
        setSpend({ c, s })
        // this funnel's links → the picks
        const p: Pick = new Map()
        for (const l of t.links.filter((x) => x.funnel_id === funnelId)) {
          if (!l.adset_id) p.set(l.campaign_id, 'all')
          else {
            const cur = p.get(l.campaign_id)
            if (cur !== 'all') p.set(l.campaign_id, new Set([...(cur ?? []), l.adset_id]))
          }
        }
        setPick(p)
      })
      .catch((e: Error) => setError(e.message))
  }, [tenant.id, funnelId])
  useEffect(load, [load])

  const accName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name ?? a.act_id])), [accounts])
  const setsOf = useMemo(() => {
    const m = new Map<string, AdSet[]>()
    for (const s of adsets) m.set(s.campaign_id, [...(m.get(s.campaign_id) ?? []), s])
    return m
  }, [adsets])
  // taken by another funnel: the whole campaign, or some ad sets
  const other = useMemo(() => {
    const whole = new Map<string, string>()
    const sets = new Map<string, string>()
    for (const l of links.filter((x) => x.funnel_id !== funnelId)) {
      const name = funnelNames.get(l.funnel_id) ?? 'another funnel'
      if (l.adset_id) sets.set(l.adset_id, name)
      else whole.set(l.campaign_id, name)
    }
    return { whole, sets }
  }, [links, funnelId, funnelNames])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return campaigns.filter(
      (c) =>
        (!acc || c.account_id === acc) &&
        (!onlyActive || ACTIVE.has(c.effective_status ?? '') || pick.has(c.campaign_id)) &&
        (!s || (c.name ?? '').toLowerCase().includes(s) || (setsOf.get(c.campaign_id) ?? []).some((x) => (x.name ?? '').toLowerCase().includes(s))),
    )
  }, [campaigns, q, acc, onlyActive, pick, setsOf])

  const toggleCampaign = (c: Campaign) => {
    setPick((p) => {
      const n = new Map(p)
      if (n.has(c.campaign_id)) n.delete(c.campaign_id)
      else {
        const takenSets = (setsOf.get(c.campaign_id) ?? []).filter((s) => other.sets.has(s.adset_id))
        // some ad sets are another funnel's: only the free ones
        n.set(c.campaign_id, takenSets.length ? new Set((setsOf.get(c.campaign_id) ?? []).filter((s) => !other.sets.has(s.adset_id)).map((s) => s.adset_id)) : 'all')
      }
      return n
    })
  }
  const toggleSet = (c: Campaign, s: AdSet) => {
    setPick((p) => {
      const n = new Map(p)
      const all = (setsOf.get(c.campaign_id) ?? []).map((x) => x.adset_id)
      const cur = n.get(c.campaign_id)
      const sel = cur === 'all' ? new Set(all) : new Set(cur ?? [])
      if (sel.has(s.adset_id)) sel.delete(s.adset_id)
      else sel.add(s.adset_id)
      if (!sel.size) n.delete(c.campaign_id)
      else if (all.every((x) => sel.has(x)) && !all.some((x) => other.sets.has(x))) n.set(c.campaign_id, 'all')
      else n.set(c.campaign_id, sel)
      return n
    })
  }

  const dirty = useMemo(() => {
    const mine = links.filter((x) => x.funnel_id === funnelId)
    const want = [...pick].flatMap(([cid, v]) => (v === 'all' ? [`${cid}|`] : [...v].map((s) => `${cid}|${s}`)))
    const have = mine.map((x) => `${x.campaign_id}|${x.adset_id ?? ''}`)
    return want.length !== have.length || want.some((k) => !have.includes(k))
  }, [pick, links, funnelId])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      type Want = { campaign_id: string; adset_id: string | null }
      const want = [...pick].flatMap(([cid, v]): Want[] => (v === 'all' ? [{ campaign_id: cid, adset_id: null }] : [...v].map((s) => ({ campaign_id: cid, adset_id: s }))))
      await saveFunnelLinks(tenant.id, funnelId, links, want)
      onSaved('Facebook campaigns saved for this funnel.')
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
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
        No Facebook ad account is connected yet. <Link to="/integrations" className="link-btn">System Connections → Facebook Ads → Continue with Facebook</Link>
      </Empty>
    )

  const picked = [...pick.values()].reduce((n, v) => n + (v === 'all' ? 1 : 0), 0)
  const pickedSets = [...pick.values()].reduce((n, v) => n + (v === 'all' ? 0 : v.size), 0)

  return (
    <div className="stack">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="panel-filters" style={{ padding: 0 }}>
        <SearchInput placeholder="Campaign or ad set" value={q} onChange={setQ} width={240} />
        {accounts.length > 1 && (
          <select className="input input-sm filter-select" aria-label="Ad account" value={acc} onChange={(e) => setAcc(e.target.value)}>
            <option value="">All ad accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name ?? a.act_id}
              </option>
            ))}
          </select>
        )}
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> Active only
        </label>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void refresh()} title="Bring in the latest campaigns and numbers" style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh from Facebook
        </button>
      </div>
      <div className="muted small">
        Tick a campaign to take all of it (ad sets added later too), or open it and tick only some ad sets. An ad set belongs to one funnel. Spend is the last 30 days, with GST.
      </div>

      {!shown.length ? (
        <Empty icon={Megaphone}>{campaigns.length ? 'No campaigns for these filters.' : 'No campaigns yet: Facebook’s first pull may still be running. Refresh in a minute.'}</Empty>
      ) : (
        <div className="card ad-tree">
          {shown.map((c) => {
            const sets = setsOf.get(c.campaign_id) ?? []
            const v = pick.get(c.campaign_id)
            const takenWhole = other.whole.get(c.campaign_id)
            const some = v && v !== 'all'
            const isOpen = open.has(c.campaign_id) || !!some
            return (
              <div key={c.campaign_id} className="ad-tree-item">
                <div className="ad-tree-row">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label={isOpen ? 'Hide ad sets' : 'Show ad sets'}
                    disabled={!sets.length}
                    onClick={() => setOpen((o) => {
                      const n = new Set(o)
                      if (n.has(c.campaign_id)) n.delete(c.campaign_id)
                      else n.add(c.campaign_id)
                      return n
                    })}
                  >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <input
                    type="checkbox"
                    aria-label={`Link ${c.name ?? c.campaign_id}`}
                    checked={v === 'all'}
                    ref={(el) => {
                      if (el) el.indeterminate = !!some
                    }}
                    disabled={!canEdit || !!takenWhole}
                    onChange={() => toggleCampaign(c)}
                  />
                  <div className="ad-tree-main">
                    <b>{c.name ?? c.campaign_id}</b>
                    <span className="muted small">
                      {accName.get(c.account_id)} · {sets.length} ad set{sets.length === 1 ? '' : 's'}
                      {c.objective ? ` · ${statusLabel(c.objective.replace(/^OUTCOME_/, ''))}` : ''}
                      {takenWhole ? ` · In ${takenWhole}` : ''}
                    </span>
                  </div>
                  <span className={cn('badge', statusTone(c.effective_status))}>{statusLabel(c.effective_status)}</span>
                  <span className="num ad-tree-spend">{spend.c.get(c.campaign_id) ? inr(spend.c.get(c.campaign_id)!) : '—'}</span>
                </div>
                {isOpen &&
                  sets.map((s) => {
                    const taken = takenWhole ?? other.sets.get(s.adset_id)
                    const on = v === 'all' || (some && v.has(s.adset_id))
                    return (
                      <label key={s.adset_id} className={cn('ad-tree-row ad-tree-sub', taken && 'is-taken')}>
                        <input type="checkbox" checked={!!on} disabled={!canEdit || !!taken} onChange={() => toggleSet(c, s)} />
                        <div className="ad-tree-main">
                          <span>{s.name ?? s.adset_id}</span>
                          {taken && <span className="muted small">In {taken}</span>}
                        </div>
                        <span className={cn('badge', statusTone(s.effective_status))}>{statusLabel(s.effective_status)}</span>
                        <span className="num ad-tree-spend">{spend.s.get(s.adset_id) ? inr(spend.s.get(s.adset_id)!) : '—'}</span>
                      </label>
                    )
                  })}
              </div>
            )
          })}
        </div>
      )}
      {pick.size > 0 && !dirty && <AdSpendCompare funnelId={funnelId} canEdit={canEdit} onDone={onSaved} />}
      {canEdit && (
        <div className="row-between">
          <span className="muted small">
            {picked} whole campaign{picked === 1 ? '' : 's'}
            {pickedSets ? ` · ${pickedSets} ad set${pickedSets === 1 ? '' : 's'}` : ''} linked to this funnel
          </span>
          <div className="row">
            {dirty && (
              <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={load}>
                Cancel
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
