import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Megaphone, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Label } from '@/components/Field'
import { ConfirmModal, Empty, SearchInput } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { campaignSpend, listAdAccounts, listCampaignTree, saveFunnelLinks, syncMeta, type AdAccount, type AdLink, type AdSet, type Campaign } from '@/meta/api'
import { listFunnels } from './api'
import { FunnelDaySpend } from './FunnelDaySpend'

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const day = (d: Date) => d.toLocaleDateString('en-CA')
const ACTIVE = new Set(['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW'])
const statusTone = (s: string | null) => (s && ACTIVE.has(s) ? 'badge-success' : s === 'PAUSED' || s === 'CAMPAIGN_PAUSED' || s === 'ADSET_PAUSED' ? 'badge-warning' : 'badge-muted')
const statusLabel = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—')

/**
 * Funnel → Facebook Ads: the campaigns linked to this funnel (their leads and spend count here). Add more: pick an ad
 * account, tick its campaigns (not the ones already here) and Add. A campaign belongs to one funnel.
 */
export function FunnelAdsTab({ funnelId, canEdit, onSaved }: { funnelId: string; canEdit: boolean; onSaved: (msg: string) => void }) {
  const tenant = useTenant()
  const [accounts, setAccounts] = useState<AdAccount[] | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [adsets, setAdsets] = useState<AdSet[]>([])
  const [links, setLinks] = useState<AdLink[]>([])
  const [funnelNames, setFunnelNames] = useState<Map<string, string>>(new Map())
  const [spend, setSpend] = useState<{ c: Map<string, number>; s: Map<string, number> }>({ c: new Map(), s: new Map() })
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<AdLink | null>(null)
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
      })
      .catch((e: Error) => setError(e.message))
  }, [tenant.id])
  useEffect(load, [load])

  const accName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name ?? a.act_id])), [accounts])
  const campById = useMemo(() => new Map(campaigns.map((c) => [c.campaign_id, c])), [campaigns])
  const setById = useMemo(() => new Map(adsets.map((s) => [s.adset_id, s])), [adsets])
  const mine = useMemo(() => links.filter((l) => l.funnel_id === funnelId), [links, funnelId])

  async function save(want: { campaign_id: string; adset_id: string | null }[], msg: string) {
    setBusy(true)
    setError(null)
    try {
      await saveFunnelLinks(tenant.id, funnelId, links, want)
      onSaved(msg)
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
        No Facebook ad account is connected yet. <Link to="/integrations" className="link-btn">System Connections → Facebook Ads</Link>
      </Empty>
    )

  const keep = (except: AdLink) => mine.filter((l) => l.id !== except.id).map((l) => ({ campaign_id: l.campaign_id, adset_id: l.adset_id }))

  return (
    <div className="stack">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="muted small">Campaigns whose leads and spend count for this funnel. Spend is the last 30 days, with GST.</div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void refresh()} title="Bring in the latest campaigns and numbers">
            <RefreshCw size={14} /> Refresh from Facebook
          </button>
          {canEdit && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
              <Plus size={14} /> Add more
            </button>
          )}
        </div>
      </div>

      {!mine.length ? (
        <Empty icon={Megaphone}>No campaigns added to this funnel yet{canEdit ? ': press Add more.' : '.'}</Empty>
      ) : (
        <div className="card ad-tree">
          {mine.map((l) => {
            const c = campById.get(l.campaign_id)
            const s = l.adset_id ? setById.get(l.adset_id) : null
            const st = s ? s.effective_status : (c?.effective_status ?? null)
            const sp = l.adset_id ? spend.s.get(l.adset_id) : spend.c.get(l.campaign_id)
            return (
              <div key={l.id} className="ad-tree-item">
                <div className="ad-tree-row">
                  <div className="ad-tree-main">
                    <b>{c?.name ?? l.campaign_id}</b>
                    <span className="muted small">
                      {c ? accName.get(c.account_id) : ''}
                      {s ? ` · only ad set ${s.name ?? s.adset_id}` : ''}
                      {c?.objective ? ` · ${statusLabel(c.objective.replace(/^OUTCOME_/, ''))}` : ''}
                    </span>
                  </div>
                  <span className={cn('badge', statusTone(st))}>{statusLabel(st)}</span>
                  <span className="num ad-tree-spend">{sp ? inr(sp) : '—'}</span>
                  {canEdit && (
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove from this funnel" title="Remove from this funnel" disabled={busy} onClick={() => setRemoving(l)}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {mine.length > 0 && <FunnelDaySpend links={mine} accounts={accounts} campaigns={campaigns} adsets={adsets} />}

      {adding && (
        <AddCampaigns
          accounts={accounts}
          campaigns={campaigns}
          links={links}
          funnelId={funnelId}
          funnelNames={funnelNames}
          spend={spend.c}
          busy={busy}
          onClose={() => setAdding(false)}
          onAdd={async (ids) => {
            await save([...mine.map((l) => ({ campaign_id: l.campaign_id, adset_id: l.adset_id })), ...ids.map((id) => ({ campaign_id: id, adset_id: null }))], `${ids.length} campaign${ids.length === 1 ? '' : 's'} added to this funnel.`)
            setAdding(false)
          }}
        />
      )}
      {removing && (
        <ConfirmModal
          open
          title="Remove from this funnel?"
          message={`${campById.get(removing.campaign_id)?.name ?? 'This campaign'} stops counting for this funnel. Its Facebook numbers stay, and you can add it again.`}
          confirmLabel="Remove"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const r = removing
            setRemoving(null)
            await save(keep(r), 'Removed from this funnel.')
          }}
        />
      )}
    </div>
  )
}

/** Add more: an ad account, then its campaigns not already in this funnel (ticked, several), then Add */
function AddCampaigns({
  accounts,
  campaigns,
  links,
  funnelId,
  funnelNames,
  spend,
  busy,
  onClose,
  onAdd,
}: {
  accounts: AdAccount[]
  campaigns: Campaign[]
  links: AdLink[]
  funnelId: string
  funnelNames: Map<string, string>
  spend: Map<string, number>
  busy: boolean
  onClose: () => void
  onAdd: (ids: string[]) => Promise<void>
}) {
  const [acc, setAcc] = useState(accounts.length === 1 ? accounts[0].id : '')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const here = useMemo(() => new Set(links.filter((l) => l.funnel_id === funnelId).map((l) => l.campaign_id)), [links, funnelId])
  // a campaign (or some of its ad sets) already in another funnel
  const elsewhere = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of links.filter((x) => x.funnel_id !== funnelId)) m.set(l.campaign_id, funnelNames.get(l.funnel_id) ?? 'another funnel')
    return m
  }, [links, funnelId, funnelNames])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return campaigns.filter((c) => c.account_id === acc && !here.has(c.campaign_id) && (!s || (c.name ?? '').toLowerCase().includes(s)))
  }, [campaigns, acc, here, q])

  return (
    <Drawer
      open
      onClose={onClose}
      width={560}
      title="Add campaigns"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            <Button onClick={() => void onAdd([...sel])} disabled={busy || !sel.size}>
              {busy ? 'Adding…' : `Add${sel.size ? ` ${sel.size}` : ''}`}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <div>
          <Label htmlFor="add-acc" required>
            Ad account
          </Label>
          <select id="add-acc" className="input" value={acc} onChange={(e) => (setAcc(e.target.value), setSel(new Set()))}>
            <option value="">Choose an ad account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name ?? a.act_id}
              </option>
            ))}
          </select>
        </div>
        {acc && (
          <>
            <SearchInput placeholder="Search campaigns" value={q} onChange={setQ} />
            {!list.length ? (
              <div className="muted small">No more campaigns in this ad account.</div>
            ) : (
              <div className="card ad-tree">
                {list.map((c) => {
                  const taken = elsewhere.get(c.campaign_id)
                  return (
                    <label key={c.campaign_id} className={cn('ad-tree-row', taken && 'is-taken')} title={taken ? `Already in ${taken}` : undefined}>
                      <input
                        type="checkbox"
                        disabled={!!taken}
                        checked={sel.has(c.campaign_id)}
                        onChange={() =>
                          setSel((p) => {
                            const n = new Set(p)
                            if (n.has(c.campaign_id)) n.delete(c.campaign_id)
                            else n.add(c.campaign_id)
                            return n
                          })
                        }
                      />
                      <div className="ad-tree-main">
                        <b>{c.name ?? c.campaign_id}</b>
                        <span className="muted small">{taken ? `In ${taken}` : c.objective ? statusLabel(c.objective.replace(/^OUTCOME_/, '')) : ''}</span>
                      </div>
                      <span className={cn('badge', statusTone(c.effective_status))}>{statusLabel(c.effective_status)}</span>
                      <span className="num ad-tree-spend">{spend.get(c.campaign_id) ? inr(spend.get(c.campaign_id)!) : '—'}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  )
}
