import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChartNoAxesColumn, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Label } from '@/components/Field'
import { ConfirmModal, Empty, SearchInput } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { cidText, googleDays, googleStructure, gTone, gWord, listGoogleAccounts, saveGoogleLinks, syncGoogle, type GAccount, type GCampaign, type GLink } from '@/google/api'
import { listFunnels } from './api'
import { FunnelDaySpend } from './FunnelDaySpend'

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const day = (d: Date) => d.toLocaleDateString('en-CA')

/**
 * Funnel → Google Ads: the Google campaigns linked to this funnel (their spend counts here). Add more: pick an ad account,
 * tick its campaigns (not the ones already here) and Add. A campaign belongs to one funnel.
 */
export function FunnelGoogleTab({ funnelId, canEdit, onSaved }: { funnelId: string; canEdit: boolean; onSaved: (msg: string) => void }) {
  const tenant = useTenant()
  const [accounts, setAccounts] = useState<GAccount[] | null>(null)
  const [tree, setTree] = useState<Awaited<ReturnType<typeof googleStructure>> | null>(null)
  const [funnelNames, setFunnelNames] = useState<Map<string, string>>(new Map())
  const [spend, setSpend] = useState<Map<string, number>>(new Map())
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<GLink | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    // Last 30 days, ending yesterday
    const to = new Date(Date.now() - 86400_000)
    const from = new Date(Date.now() - 30 * 86400_000)
    Promise.all([listGoogleAccounts(tenant.id), googleStructure(tenant.id), listFunnels(tenant.id), googleDays(tenant.id, 'campaign', day(from), day(to))])
      .then(([a, t, fs, sp]) => {
        const real = a.filter((x) => !x.is_manager)
        setAccounts(real)
        setTree(t)
        setFunnelNames(new Map(fs.map((f) => [f.id, f.name])))
        const gst = new Map(real.map((x) => [x.id, Number(x.gst_rate)]))
        const c = new Map<string, number>()
        for (const r of sp) c.set(r.campaign_id, (c.get(r.campaign_id) ?? 0) + Number(r.spend) * (1 + (gst.get(r.account_id) ?? 18) / 100))
        setSpend(c)
      })
      .catch((e: Error) => setError(e.message))
  }, [tenant.id])
  useEffect(load, [load])

  const accName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name ?? cidText(a.customer_id)])), [accounts])
  const campById = useMemo(() => new Map((tree?.campaigns ?? []).map((c) => [c.campaign_id, c])), [tree])
  const links = useMemo(() => tree?.links ?? [], [tree])
  const mine = useMemo(() => links.filter((l) => l.funnel_id === funnelId), [links, funnelId])

  async function save(want: string[], msg: string) {
    setBusy(true)
    setError(null)
    try {
      await saveGoogleLinks(tenant.id, funnelId, links, want)
      onSaved(msg)
      load()
    } catch (e) {
      setError((e as Error).message.includes('duplicate') ? 'That campaign is already in another funnel.' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
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
        <div className="muted small">Google campaigns whose spend counts for this funnel. Spend is the last 30 days, with GST.</div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void refresh()} title="Bring in the latest campaigns and numbers">
            <RefreshCw size={14} /> Refresh from Google
          </button>
          {canEdit && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
              <Plus size={14} /> Add more
            </button>
          )}
        </div>
      </div>

      {!mine.length ? (
        <Empty icon={ChartNoAxesColumn}>No Google campaigns added to this funnel yet{canEdit ? ': press Add more.' : '.'}</Empty>
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
                  <span className={cn('badge', gTone(c?.status ?? null))}>{gWord(c?.status ?? null)}</span>
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

      {mine.length > 0 && (
        <FunnelDaySpend
          links={mine.map((l) => ({ campaign_id: l.campaign_id, adset_id: null }))}
          accounts={accounts}
          campaigns={tree.campaigns}
          adsets={tree.groups.map((g) => ({ adset_id: g.ad_group_id, name: g.name }))}
          google={{ ads: tree.ads }}
        />
      )}

      {adding && (
        <AddCampaigns
          accounts={accounts}
          campaigns={tree.campaigns}
          links={links}
          funnelId={funnelId}
          funnelNames={funnelNames}
          spend={spend}
          busy={busy}
          onClose={() => setAdding(false)}
          onAdd={async (ids) => {
            await save([...mine.map((l) => l.campaign_id), ...ids], `${ids.length} Google campaign${ids.length === 1 ? '' : 's'} added to this funnel.`)
            setAdding(false)
          }}
        />
      )}
      {removing && (
        <ConfirmModal
          open
          title="Remove from this funnel?"
          message={`${campById.get(removing.campaign_id)?.name ?? 'This campaign'} stops counting for this funnel. Its Google numbers stay, and you can add it again.`}
          confirmLabel="Remove"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const r = removing
            setRemoving(null)
            await save(mine.filter((l) => l.id !== r.id).map((l) => l.campaign_id), 'Removed from this funnel.')
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
  accounts: GAccount[]
  campaigns: GCampaign[]
  links: GLink[]
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
  const elsewhere = useMemo(() => new Map(links.filter((x) => x.funnel_id !== funnelId).map((l) => [l.campaign_id, funnelNames.get(l.funnel_id) ?? 'another funnel'])), [links, funnelId, funnelNames])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return campaigns
      .filter((c) => c.account_id === acc && !here.has(c.campaign_id) && (!s || (c.name ?? '').toLowerCase().includes(s)))
      .sort((a, b) => (spend.get(b.campaign_id) ?? 0) - (spend.get(a.campaign_id) ?? 0))
  }, [campaigns, acc, here, q, spend])

  return (
    <Drawer
      open
      onClose={onClose}
      width={560}
      title="Add Google campaigns"
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
          <Label htmlFor="g-add-acc" required>
            Ad account
          </Label>
          <select id="g-add-acc" className="input" value={acc} onChange={(e) => (setAcc(e.target.value), setSel(new Set()))}>
            <option value="">Choose an ad account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name ?? cidText(a.customer_id)}
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
                        <span className="muted small">{taken ? `In ${taken}` : c.channel ? gWord(c.channel) : ''}</span>
                      </div>
                      <span className={cn('badge', gTone(c.status))}>{gWord(c.status)}</span>
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
