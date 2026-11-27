import { useCallback, useEffect, useMemo, useState } from 'react'
import { useKept } from '@/lib/useKept'
import { Link } from 'react-router'
import { Ban, CheckCheck, Eye, Megaphone, MessageCircleReply, Plus, RefreshCw, Send, XCircle } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Drawer } from '@/components/Drawer'
import { Flash } from '@/components/Flash'
import { StatRecords, type StatShow } from '@/components/StatRecords'
import { ConfirmModal, Empty, PageHead, Paged, SearchInput, StatCard } from '@/components/ui'
import { listMemberOptions } from '@/leads/api'
import type { MemberOption } from '@/leads/types'
import { at, nicePhone } from '@/integrations/waLogs'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import {
  AUDIENCE_LABEL,
  CAMPAIGN_STATUS,
  PERSON_STATE,
  campaignPeople,
  campaignStats,
  cancelCampaign,
  listCampaigns,
  pct,
  type Campaign,
  type CampaignPerson,
  type CampaignStats,
  type PersonState,
} from './api'
import { NewCampaignDrawer } from './NewCampaignDrawer'
import { Select } from '@/components/Field'

const EMPTY_STATS = (c: Campaign): CampaignStats => ({ campaign_id: c.id, total: c.total, queued: 0, sent: 0, delivered: 0, seen: 0, replied: 0, failed: 0, cancelled: 0 })

/** WhatsApp → Campaign: the campaigns sent (with WATI-style counts), a report per campaign, and Send new campaign. */
export function CampaignsPage() {
  const tenant = useTenant()
  const [rows, setRows] = useState<Campaign[] | null>(null)
  const [stats, setStats] = useState<Map<string, CampaignStats>>(new Map())
  const [members, setMembers] = useState<MemberOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [f, setF] = useKept(`wa-campaigns.${tenant.id}`, { q: '', status: '' })
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<Campaign | null>(null)
  const [cancelling, setCancelling] = useState<Campaign | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setError(null)
    listCampaigns(tenant.id)
      .then(async (list) => {
        setRows(list)
        setStats(await campaignStats(tenant.id, list.map((c) => c.id)))
      })
      .catch((e: Error) => setError(e.message))
  }, [tenant.id])
  useEffect(load, [load])
  useEffect(() => {
    listMemberOptions(tenant.id).then(setMembers, () => setMembers([]))
  }, [tenant.id])
  // while one is going out (or due), the counts refresh every 15 seconds
  const live = (rows ?? []).some((c) => c.status === 'sending' || (c.status === 'scheduled' && new Date(c.scheduled_at).getTime() < Date.now() + 60_000))
  useEffect(() => {
    if (!live) return
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [live, load])

  const visible = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    return (rows ?? []).filter((c) => (!f.status || c.status === f.status) && (!q || `${c.name} ${c.template}`.toLowerCase().includes(q)))
  }, [rows, f])

  const totals = useMemo(() => {
    // the cards follow the filters
    const all = visible.map((c) => stats.get(c.id) ?? EMPTY_STATS(c))
    const sum = (k: keyof Omit<CampaignStats, 'campaign_id'>) => all.reduce((n, s) => n + s[k], 0)
    return { sent: sum('sent'), delivered: sum('delivered'), seen: sum('seen'), replied: sum('replied'), failed: sum('failed') }
  }, [visible, stats])

  // a stat card's records: the campaigns with that count (click one for its report)
  type K = 'sent' | 'delivered' | 'seen' | 'replied' | 'failed'
  const [statShow, setStatShow] = useState<StatShow<Campaign> | null>(null)
  const st = (c: Campaign) => stats.get(c.id) ?? EMPTY_STATS(c)
  const showCamps = (title: string, k: K) => () =>
    setStatShow({
      title,
      rows: visible.filter((c) => st(c)[k] > 0).sort((a, b) => st(b)[k] - st(a)[k]),
      cols: [
        {
          label: 'Campaign',
          render: (c) => (
            <>
              <b>{c.name}</b>
              <div className="muted small">{c.template}</div>
            </>
          ),
        },
        { label: 'Sent on', render: (c) => <span className="nowrap">{at(c.scheduled_at)}</span> },
        { label: 'Sent', num: true, render: (c: Campaign) => st(c).sent },
        ...(k === 'sent'
          ? []
          : [
              { label: title, num: true, render: (c: Campaign) => <b>{st(c)[k]}</b> },
              { label: '%', num: true, render: (c: Campaign) => pct(st(c)[k], st(c).sent) },
            ]),
      ],
    })
  const { membership } = useAuth()
  // Tech Support isn't in the team list
  const byName = (id: string | null) => (!id ? '—' : (members.find((m) => m.id === id)?.name ?? (id === membership?.id ? 'You' : 'Tech Support')))

  async function cancel() {
    if (!cancelling) return
    setBusy(true)
    try {
      await cancelCampaign(cancelling.id)
      setNotice(`${cancelling.name} cancelled.`)
      setCancelling(null)
      load()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <>
      <PageHead
        title="Campaigns"
        subtitle="Send an approved template to many numbers at once: leads, customers, your team, a CSV or pasted numbers."
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={load}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus size={16} /> Send new campaign
            </button>
          </>
        }
      />
      {error && <div className="alert alert-error">{error}</div>}
      <Flash msg={notice} dep={notice} />

      <div className="stat-grid">
        <StatCard icon={Send} tone="brand" value={totals.sent} label="Sent" hint={`${visible.length} campaign${visible.length === 1 ? '' : 's'}`} onClick={showCamps('Sent', 'sent')} />
        <StatCard icon={CheckCheck} tone="info" value={totals.delivered} label="Delivered" hint={pct(totals.delivered, totals.sent)} onClick={showCamps('Delivered', 'delivered')} />
        <StatCard icon={Eye} tone="success" value={totals.seen} label="Seen" hint={pct(totals.seen, totals.sent)} onClick={showCamps('Seen', 'seen')} />
        <StatCard icon={MessageCircleReply} tone="purple" value={totals.replied} label="Replied" hint={pct(totals.replied, totals.sent)} onClick={showCamps('Replied', 'replied')} />
        <StatCard icon={XCircle} tone="danger" value={totals.failed} label="Failed" onClick={showCamps('Failed', 'failed')} />
      </div>
      <StatRecords show={statShow} onClose={() => setStatShow(null)} rowKey={(c) => c.id} onRow={(c) => setOpen(c)} />

      <div className="panel">
        <div className="panel-filters">
          <SearchInput placeholder="Campaign or template" value={f.q} onChange={(v) => setF((x) => ({ ...x, q: v }))} width={240} />
          <Select className="input input-sm filter-select" value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))} aria-label="Status">
            <option value="">All statuses</option>
            {Object.entries(CAMPAIGN_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          {(f.q || f.status) && (
            <button type="button" className="clear-btn" onClick={() => setF({ q: '', status: '' })}>
              Reset
            </button>
          )}
        </div>

        {!rows ? (
          <div className="empty">Loading campaigns…</div>
        ) : !visible.length ? (
          <Empty icon={Megaphone}>{rows.length ? 'No campaigns match these filters.' : 'No campaigns yet. Send your first one with “Send new campaign”.'}</Empty>
        ) : (
          <Paged rows={visible} reset={f}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date &amp; time</th>
                      <th>Campaign</th>
                      <th>Audience</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th style={{ textAlign: 'right' }}>Sent</th>
                      <th style={{ textAlign: 'right' }}>Delivered</th>
                      <th style={{ textAlign: 'right' }}>Seen</th>
                      <th style={{ textAlign: 'right' }}>Replied</th>
                      <th style={{ textAlign: 'right' }}>Not delivered</th>
                      <th style={{ textAlign: 'right' }}>Failed</th>
                      <th style={{ textAlign: 'right' }}>% seen</th>
                      <th>By</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((c) => {
                      const s = stats.get(c.id) ?? EMPTY_STATS(c)
                      const st = CAMPAIGN_STATUS[c.status]
                      return (
                        <tr key={c.id} className="is-clickable" onClick={() => setOpen(c)}>
                          <td className="small nowrap">{at(c.scheduled_at)}</td>
                          <td>
                            <b>{c.name}</b>
                            <div className="muted small">{c.template}</div>
                          </td>
                          <td className="small">{c.audience.label ?? (c.audience.kind ? AUDIENCE_LABEL[c.audience.kind] : '—')}</td>
                          <td style={{ textAlign: 'right' }}>{c.total}</td>
                          <td style={{ textAlign: 'right' }}>{s.sent}</td>
                          <td style={{ textAlign: 'right' }}>{s.delivered}</td>
                          <td style={{ textAlign: 'right' }}>{s.seen}</td>
                          <td style={{ textAlign: 'right' }}>{s.replied}</td>
                          <td style={{ textAlign: 'right' }}>{s.sent - s.delivered}</td>
                          <td style={{ textAlign: 'right' }} className={cn(s.failed > 0 && 'danger-text')}>
                            {s.failed}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <b>{pct(s.seen, s.sent)}</b>
                          </td>
                          <td className="small">{byName(c.created_by)}</td>
                          <td>
                            <span className={cn('badge', st.cls)}>{st.label}</span>
                            {c.status === 'sending' && s.queued > 0 && <div className="muted small">{s.queued} to go</div>}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {(c.status === 'scheduled' || c.status === 'sending') && (
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCancelling(c)}>
                                <Ban size={14} /> Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Paged>
        )}
      </div>

      {adding && (
        <NewCampaignDrawer
          onClose={() => setAdding(false)}
          onDone={(msg) => {
            setAdding(false)
            setNotice(msg)
            load()
          }}
        />
      )}
      {open && <CampaignReport campaign={open} stats={stats.get(open.id) ?? EMPTY_STATS(open)} by={byName(open.created_by)} onClose={() => setOpen(null)} />}
      <ConfirmModal
        open={!!cancelling}
        icon={Ban}
        danger
        title={`Cancel ${cancelling?.name ?? ''}?`}
        message={cancelling?.status === 'sending' ? 'Messages already sent stay sent; the numbers still waiting won’t get it.' : 'It won’t be sent. This can’t be undone.'}
        confirmLabel="Cancel campaign"
        busy={busy}
        onConfirm={() => void cancel()}
        onCancel={() => setCancelling(null)}
      />
    </>
  )
}

type Filter = '' | PersonState | 'replied' | 'notdelivered'
const FILTERS: { id: Filter; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'notdelivered', label: 'Not delivered' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'read', label: 'Seen' },
  { id: 'replied', label: 'Replied' },
  { id: 'failed', label: 'Failed' },
  { id: 'queued', label: 'Queued' },
  { id: 'cancelled', label: 'Cancelled' },
]

/** a campaign's report: the counts and every number with its status */
function CampaignReport({ campaign: c, stats: s, by, onClose }: { campaign: Campaign; stats: CampaignStats; by: string; onClose: () => void }) {
  const tenant = useTenant()
  const [people, setPeople] = useState<CampaignPerson[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('')
  const [q, setQ] = useState('')

  useEffect(() => {
    campaignPeople(tenant.id, c.id).then(setPeople, (e: Error) => setError(e.message))
  }, [tenant.id, c.id])

  const match = (p: CampaignPerson, x: Filter) =>
    !x ||
    (x === 'replied' ? !!p.replied_at : x === 'notdelivered' ? p.state === 'sent' : x === 'delivered' ? p.state === 'delivered' || p.state === 'read' : p.state === x)
  const count = (x: Filter) => (people ?? []).filter((p) => match(p, x)).length
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    const d = t.replace(/\D/g, '')
    return (people ?? []).filter((p) => match(p, filter) && (!t || (p.name ?? '').toLowerCase().includes(t) || (d.length >= 3 && p.phone.includes(d))))
  }, [people, filter, q]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Drawer open onClose={onClose} title={c.name} width={860}>
      <div className="stack" style={{ gap: 14 }}>
        <div className="muted small">
          Template <b>{c.template}</b> · {c.audience.label ?? '—'} · {c.status === 'scheduled' ? 'Scheduled for' : 'Sent'} {at(c.scheduled_at)} · By {by}
        </div>
        <div className="stat-grid">
          <StatCard icon={Send} tone="brand" value={s.sent} label="Sent" hint={`of ${c.total}`} onClick={() => setFilter('')} />
          <StatCard icon={CheckCheck} tone="info" value={s.delivered} label="Delivered" hint={pct(s.delivered, s.sent)} onClick={() => setFilter('delivered')} />
          <StatCard icon={Eye} tone="success" value={s.seen} label="Seen" hint={pct(s.seen, s.sent)} onClick={() => setFilter('read')} />
          <StatCard icon={MessageCircleReply} tone="purple" value={s.replied} label="Replied" hint={pct(s.replied, s.sent)} onClick={() => setFilter('replied')} />
          <StatCard icon={XCircle} tone="danger" value={s.failed} label="Failed" hint={`${s.sent - s.delivered} not delivered`} onClick={() => setFilter('failed')} />
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="tabs" role="tablist">
          {FILTERS.filter((x) => !x.id || count(x.id) > 0).map((x) => (
            <button key={x.id || 'all'} type="button" role="tab" className={cn('tab', filter === x.id && 'is-active')} onClick={() => setFilter(x.id)}>
              {x.label} <span className="muted small">{count(x.id)}</span>
            </button>
          ))}
        </div>
        <SearchInput placeholder="Name or number" value={q} onChange={setQ} width={240} />
        {!people ? (
          <div className="empty">Loading…</div>
        ) : !shown.length ? (
          <Empty icon={Megaphone}>No numbers here.</Empty>
        ) : (
          <Paged rows={shown} reset={`${filter}|${q}`}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Number</th>
                      <th>Status</th>
                      <th>Sent</th>
                      <th>Delivered</th>
                      <th>Seen</th>
                      <th>Replied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((p) => (
                      <tr key={p.id}>
                        <td>{p.lead_id ? <Link to={`/leads/${p.lead_id}`}>{p.name || 'Lead'}</Link> : p.name || <span className="muted">—</span>}</td>
                        <td className="nowrap">
                          <Link to={`/whatsapp/chats?phone=${p.phone}`}>{nicePhone(p.phone)}</Link>
                        </td>
                        <td>
                          <span className={cn('badge', PERSON_STATE[p.state].cls)}>{PERSON_STATE[p.state].label}</span>
                          {p.error && <div className="small danger-text">{p.error}</div>}
                        </td>
                        <td className="small nowrap">{at(p.sent_at)}</td>
                        <td className="small nowrap">{at(p.delivered_at)}</td>
                        <td className="small nowrap">{at(p.read_at)}</td>
                        <td className="small nowrap">{at(p.replied_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Paged>
        )}
      </div>
    </Drawer>
  )
}
