import { useCallback, useEffect, useMemo, useState } from 'react'
import { Columns3, Download, List, Plus, RotateCcw, Users } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Empty, PageHead, SearchInput } from '@/components/ui'
import { listFunnels } from '@/funnels/api'
import type { FunnelRow, StageRow } from '@/funnels/types'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { listLeads, listLostReasons, listMemberOptions, listSources, logActivity, updateLeads } from './api'
import { LeadBoard } from './LeadBoard'
import { LeadDrawer } from './LeadDrawer'
import { TEMPERATURES, followUp, fullName, money, tempOf } from './labels'
import { StageMoveModal } from './StageMoveModal'
import type { LeadRow, MemberOption, Option, Temperature } from './types'

const FUNNEL_KEY = (t: string) => `leads.funnel.${t}`
const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* storage unavailable */
  }
}

type Filters = { q: string; source: string; temp: string; owner: string; followUp: string; archived: boolean; sort: string }
const EMPTY: Filters = { q: '', source: '', temp: '', owner: '', followUp: '', archived: false, sort: 'newest' }

type PendingMove = { ids: string[]; stage: StageRow }

export function LeadsPage() {
  const tenant = useTenant()
  const { can, scope, membership } = useAuth()
  const { selected } = useBusiness()
  const me = membership?.id

  const [leads, setLeads] = useState<LeadRow[] | null>(null)
  const [funnels, setFunnels] = useState<FunnelRow[]>([])
  const [sources, setSources] = useState<Option[]>([])
  const [lostReasons, setLostReasons] = useState<Option[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [funnelId, setFunnelId] = useState<string>(() => read(FUNNEL_KEY(tenant.id)) ?? 'all')
  const [view, setView] = useState<'list' | 'board'>('list')
  const [stageTab, setStageTab] = useState<string>('all')
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [drawer, setDrawer] = useState<{ lead: LeadRow | null } | null>(null)
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [bulk, setBulk] = useState({ owner: '', temp: '', followUp: '', stage: '', reason: '' })
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  const load = useCallback(() => {
    Promise.all([listLeads(tenant.id), listFunnels(tenant.id), listSources(tenant.id), listLostReasons(tenant.id), listMemberOptions(tenant.id)])
      .then(([l, f, s, r, m]) => {
        setLeads(l)
        setFunnels(f)
        setSources(s)
        setLostReasons(r)
        setMembers(m)
      })
      .catch((e: Error) => setNotice({ error: e.message }))
  }, [tenant.id])
  useEffect(load, [load])

  // funnels of the business picked in the top bar (or all businesses)
  const scopedFunnels = useMemo(
    () => funnels.filter((f) => !selected || f.business_id === selected.id),
    [funnels, selected],
  )
  const funnel = scopedFunnels.find((f) => f.id === funnelId) ?? null
  const stageById = useMemo(() => {
    const m = new Map<string, StageRow>()
    for (const f of funnels) for (const s of f.funnel_stages) m.set(s.id, s)
    return m
  }, [funnels])
  const funnelName = (id: string) => funnels.find((f) => f.id === id)?.name ?? '—'
  const sourceName = (id: string | null) => sources.find((s) => s.id === id)?.name
  const ownerName = (id: string | null) => members.find((m) => m.id === id)?.name

  function pickFunnel(id: string) {
    setFunnelId(id)
    write(FUNNEL_KEY(tenant.id), id)
    setStageTab('all')
    setPicked(new Set())
    if (id === 'all') setView('list')
  }

  // leads before the stage tab (for tab counts)
  const base = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    const now = new Date()
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const scopedIds = new Set(scopedFunnels.map((f) => f.id))
    return (leads ?? [])
      .filter((l) => l.is_archived === filters.archived)
      .filter((l) => (funnel ? l.funnel_id === funnel.id : scopedIds.has(l.funnel_id)))
      .filter(
        (l) =>
          !q ||
          fullName(l).toLowerCase().includes(q) ||
          l.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '¤') ||
          (l.email ?? '').toLowerCase().includes(q) ||
          (l.city ?? '').toLowerCase().includes(q),
      )
      .filter((l) => !filters.source || l.source_id === filters.source)
      .filter((l) => !filters.temp || l.temperature === filters.temp)
      .filter((l) => !filters.owner || (filters.owner === 'none' ? !l.owner_id : l.owner_id === filters.owner))
      .filter((l) => {
        if (!filters.followUp) return true
        const d = l.next_follow_up_at ? new Date(l.next_follow_up_at) : null
        if (filters.followUp === 'none') return !d
        if (!d) return false
        if (filters.followUp === 'overdue') return d < now
        if (filters.followUp === 'today') return d >= now && d < endToday
        return d >= endToday
      })
      .sort((a, b) => {
        if (filters.sort === 'name') return fullName(a).localeCompare(fullName(b))
        if (filters.sort === 'updated') return b.updated_at.localeCompare(a.updated_at)
        if (filters.sort === 'follow_up')
          return (a.next_follow_up_at ?? '9999').localeCompare(b.next_follow_up_at ?? '9999')
        return b.created_at.localeCompare(a.created_at)
      })
  }, [leads, filters, funnel, scopedFunnels])

  const kindOf = (l: LeadRow) => stageById.get(l.stage_id)?.kind ?? 'open'
  const visible =
    stageTab === 'all'
      ? base
      : funnel
        ? base.filter((l) => l.stage_id === stageTab)
        : base.filter((l) => kindOf(l) === stageTab)
  const tabs: { id: string; label: string; count: number }[] = funnel
    ? [
        { id: 'all', label: 'All', count: base.length },
        ...funnel.funnel_stages.map((s) => ({ id: s.id, label: s.name, count: base.filter((l) => l.stage_id === s.id).length })),
      ]
    : [
        { id: 'all', label: 'All', count: base.length },
        { id: 'open', label: 'In progress', count: base.filter((l) => kindOf(l) === 'open').length },
        { id: 'won', label: 'Won', count: base.filter((l) => kindOf(l) === 'won').length },
        { id: 'lost', label: 'Lost', count: base.filter((l) => kindOf(l) === 'lost').length },
      ]

  const pickedIds = visible.filter((l) => picked.has(l.id)).map((l) => l.id)
  const allPicked = visible.length > 0 && pickedIds.length === visible.length
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  async function run(fn: () => Promise<void>, ok: string) {
    try {
      await fn()
      setNotice({ ok })
      setPicked(new Set())
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }

  /** move leads; asks for a note / lost reason first when the stage needs one */
  function requestMove(ids: string[], stage: StageRow) {
    if (stage.note_required || stage.kind === 'lost') setPendingMove({ ids, stage })
    else void doMove(ids, stage, '', null)
  }
  async function doMove(ids: string[], stage: StageRow, note: string, lostReasonId: string | null) {
    const from = new Map((leads ?? []).map((l) => [l.id, l.stage_id]))
    await run(async () => {
      await updateLeads(ids, { stage_id: stage.id, lost_reason_id: stage.kind === 'lost' ? lostReasonId : null })
      for (const id of ids)
        await logActivity(tenant.id, me, [id], { kind: 'stage', from_stage_id: from.get(id) ?? null, to_stage_id: stage.id, note: note.trim() || null })
    }, `${ids.length === 1 ? 'Lead' : `${ids.length} leads`} moved to ${stage.name}.`)
  }

  function exportCsv() {
    const rows = [
      ['Name', 'Phone', 'WhatsApp', 'Email', 'City', 'Funnel', 'Stage', 'Temperature', 'Source', 'Owner', 'Estimated amount', 'Next follow-up', 'Tags', 'Created'],
      ...visible.map((l) => [
        fullName(l),
        l.phone,
        l.whatsapp ?? '',
        l.email ?? '',
        l.city ?? '',
        funnelName(l.funnel_id),
        stageById.get(l.stage_id)?.name ?? '',
        tempOf(l.temperature)?.label ?? '',
        sourceName(l.source_id) ?? '',
        ownerName(l.owner_id) ?? '',
        l.estimated_amount ?? '',
        l.next_follow_up_at ? new Date(l.next_follow_up_at).toLocaleString('en-IN') : '',
        l.tags.join('; '),
        new Date(l.created_at).toLocaleDateString('en-IN'),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `leads${funnel ? ` - ${funnel.name}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const setF = (k: keyof Filters, v: string | boolean) => {
    setFilters((f) => ({ ...f, [k]: v }))
    setPicked(new Set())
  }
  const scopeText = { all: 'all leads', team: 'your and your team’s leads', own: 'your own leads', none: 'no leads' }[scope('leads')]

  return (
    <>
      <PageHead
        title="Leads"
        subtitle={`Showing ${scopeText}${selected ? ` in ${selected.name}` : ''}.`}
        actions={
          <>
            {can('leads', 'export') && (
              <button type="button" className="btn btn-outline" onClick={exportCsv} disabled={!visible.length}>
                <Download size={15} /> Export CSV
              </button>
            )}
            {can('leads', 'add') && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setDrawer({ lead: null })}
                disabled={!scopedFunnels.length}
                title={!scopedFunnels.length ? 'Add a funnel first' : undefined}
              >
                <Plus size={16} /> Add lead
              </button>
            )}
          </>
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      {notice.ok && <div className="alert alert-info">{notice.ok}</div>}

      <div className="panel">
        <div className="panel-bar">
          <div className="row">
            <select className="select-filled" value={funnel ? funnel.id : 'all'} onChange={(e) => pickFunnel(e.target.value)} aria-label="Funnel">
              <option value="all">All funnels</option>
              {scopedFunnels.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <div className="seg seg-sm">
              <button type="button" className={cn(view === 'list' && 'is-active')} onClick={() => setView('list')}>
                <List size={14} /> List
              </button>
              <button
                type="button"
                className={cn(view === 'board' && 'is-active')}
                onClick={() => setView('board')}
                disabled={!funnel}
                title={!funnel ? 'Pick a funnel to see its board' : undefined}
              >
                <Columns3 size={14} /> Board
              </button>
            </div>
          </div>
          {view === 'list' && (
            <div className="tabs">
              {tabs.map((t) => (
                <button key={t.id} type="button" className={cn('tab', stageTab === t.id && 'is-active')} onClick={() => setStageTab(t.id)}>
                  {t.label} <span className="muted small">{t.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="panel-filters">
          <SearchInput placeholder="Name, phone, email or city" value={filters.q} onChange={(v) => setF('q', v)} width={230} />
          <select className="input input-sm filter-select" value={filters.temp} onChange={(e) => setF('temp', e.target.value)} aria-label="Temperature">
            <option value="">Temperature</option>
            {TEMPERATURES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={filters.source} onChange={(e) => setF('source', e.target.value)} aria-label="Source">
            <option value="">Source</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={filters.owner} onChange={(e) => setF('owner', e.target.value)} aria-label="Owner">
            <option value="">Owner</option>
            <option value="none">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={filters.followUp} onChange={(e) => setF('followUp', e.target.value)} aria-label="Follow-up">
            <option value="">Follow-up</option>
            <option value="overdue">Overdue</option>
            <option value="today">Today</option>
            <option value="upcoming">Upcoming</option>
            <option value="none">No follow-up set</option>
          </select>
          <select className="input input-sm filter-select" value={filters.sort} onChange={(e) => setF('sort', e.target.value)} aria-label="Sort">
            <option value="newest">Newest</option>
            <option value="follow_up">Follow-up date</option>
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
          </select>
          <label className="toggle" style={{ height: 34 }}>
            <input type="checkbox" checked={filters.archived} onChange={(e) => setF('archived', e.target.checked)} /> Archived
          </label>
          {JSON.stringify({ ...filters, sort: 'newest' }) !== JSON.stringify(EMPTY) && (
            <button type="button" className="clear-btn" onClick={() => setFilters(EMPTY)}>
              Reset
            </button>
          )}
        </div>

        {pickedIds.length > 0 && view === 'list' && (
          <div className="bulk-bar">
            <b>{pickedIds.length} selected</b>
            {can('leads', 'assign') && (
              <span className="bulk-group">
                <select className="input input-sm" value={bulk.owner} onChange={(e) => setBulk((b) => ({ ...b, owner: e.target.value }))} aria-label="Assign to">
                  <option value="">Assign to…</option>
                  <option value="none">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={!bulk.owner}
                  onClick={() =>
                    run(async () => {
                      await updateLeads(pickedIds, { owner_id: bulk.owner === 'none' ? null : bulk.owner })
                      await logActivity(tenant.id, me, pickedIds, { kind: 'assigned' })
                    }, 'Owner updated.')
                  }
                >
                  Assign
                </button>
              </span>
            )}
            {can('leads', 'edit') && (
              <span className="bulk-group">
                <select className="input input-sm" value={bulk.temp} onChange={(e) => setBulk((b) => ({ ...b, temp: e.target.value }))} aria-label="Temperature">
                  <option value="">Temperature…</option>
                  {TEMPERATURES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={!bulk.temp}
                  onClick={() =>
                    run(async () => {
                      await updateLeads(pickedIds, { temperature: bulk.temp as Temperature })
                      await logActivity(tenant.id, me, pickedIds, { kind: 'temperature', note: tempOf(bulk.temp as Temperature)?.label })
                    }, 'Temperature updated.')
                  }
                >
                  Set
                </button>
              </span>
            )}
            {(can('follow_ups', 'add') || can('leads', 'edit')) && (
              <span className="bulk-group">
                <input
                  type="datetime-local"
                  className="input input-sm"
                  value={bulk.followUp}
                  onChange={(e) => setBulk((b) => ({ ...b, followUp: e.target.value }))}
                  aria-label="Follow-up date and time"
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={!bulk.followUp}
                  onClick={() =>
                    run(async () => {
                      await updateLeads(pickedIds, { next_follow_up_at: new Date(bulk.followUp).toISOString() })
                      await logActivity(tenant.id, me, pickedIds, { kind: 'follow_up', note: new Date(bulk.followUp).toLocaleString('en-IN') })
                    }, 'Follow-up scheduled.')
                  }
                >
                  Schedule follow-up
                </button>
              </span>
            )}
            {funnel && can('leads', 'edit') && (
              <span className="bulk-group">
                <select className="input input-sm" value={bulk.stage} onChange={(e) => setBulk((b) => ({ ...b, stage: e.target.value }))} aria-label="Move to stage">
                  <option value="">Move to…</option>
                  {funnel.funnel_stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={!bulk.stage}
                  onClick={() => {
                    const s = stageById.get(bulk.stage)
                    if (s) requestMove(pickedIds, s)
                  }}
                >
                  Move
                </button>
              </span>
            )}
            {can('leads', 'delete') &&
              (filters.archived ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() =>
                    run(async () => {
                      await updateLeads(pickedIds, { is_archived: false, archive_reason: null, archived_at: null })
                      await logActivity(tenant.id, me, pickedIds, { kind: 'restored' })
                    }, 'Leads restored.')
                  }
                >
                  <RotateCcw size={14} /> Restore
                </button>
              ) : (
                <span className="bulk-group">
                  <input
                    className="input input-sm"
                    placeholder="Archive reason"
                    value={bulk.reason}
                    onChange={(e) => setBulk((b) => ({ ...b, reason: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="btn btn-outline btn-sm danger-text"
                    disabled={!bulk.reason.trim()}
                    onClick={() =>
                      run(async () => {
                        await updateLeads(pickedIds, { is_archived: true, archive_reason: bulk.reason.trim(), archived_at: new Date().toISOString() })
                        await logActivity(tenant.id, me, pickedIds, { kind: 'archived', note: bulk.reason.trim() })
                      }, 'Leads archived.')
                    }
                  >
                    Archive
                  </button>
                </span>
              ))}
          </div>
        )}

        {!leads ? (
          <div className="empty">Loading leads…</div>
        ) : scope('leads') === 'none' ? (
          <Empty icon={Users}>Your access doesn’t include leads.</Empty>
        ) : !scopedFunnels.length ? (
          <Empty icon={Users}>No funnels yet. Add a funnel first; leads sit in a funnel stage.</Empty>
        ) : view === 'board' && funnel ? (
          <LeadBoard
            funnel={funnel}
            leads={base}
            members={members}
            canMove={can('leads', 'edit')}
            onOpen={(l) => setDrawer({ lead: l })}
            onMove={(l, s) => requestMove([l.id], s)}
          />
        ) : visible.length === 0 ? (
          <Empty icon={Users}>{filters.archived ? 'No archived leads.' : 'No leads here yet.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      className="am-check"
                      aria-label="Select all"
                      checked={allPicked}
                      onChange={() => setPicked(allPicked ? new Set() : new Set(visible.map((l) => l.id)))}
                    />
                  </th>
                  <th>Lead</th>
                  <th>Stage</th>
                  <th>Temp</th>
                  <th>Source</th>
                  {!funnel && <th>Funnel</th>}
                  <th>Owner</th>
                  <th>Next follow-up</th>
                  <th style={{ textAlign: 'right' }}>Value</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => {
                  const s = stageById.get(l.stage_id)
                  const t = tempOf(l.temperature)
                  const fu = followUp(l.next_follow_up_at)
                  return (
                    <tr key={l.id} className="is-clickable" onClick={() => setDrawer({ lead: l })}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="am-check" aria-label={`Select ${fullName(l)}`} checked={picked.has(l.id)} onChange={() => toggle(l.id)} />
                      </td>
                      <td>
                        <span className="strong">{fullName(l)}</span>
                        <div className="muted small">
                          {l.phone}
                          {l.city ? ` · ${l.city}` : ''}
                        </div>
                      </td>
                      <td>
                        {s && (
                          <span className={cn('funnel-stage', s.kind !== 'open' && 'is-closed')} style={{ ['--c' as string]: s.color }}>
                            {s.name}
                          </span>
                        )}
                      </td>
                      <td>{t ? <span className={cn('badge', t.tone)}>{t.label}</span> : <span className="muted">—</span>}</td>
                      <td>{sourceName(l.source_id) ?? <span className="muted">—</span>}</td>
                      {!funnel && <td className="muted">{funnelName(l.funnel_id)}</td>}
                      <td className="nowrap">{ownerName(l.owner_id) ?? <span className="muted">Unassigned</span>}</td>
                      <td className={cn('nowrap', `fu-${fu.state}`)}>{fu.text}</td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {money(l.estimated_amount)}
                      </td>
                      <td className="muted nowrap">
                        {new Date(l.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawer && (
        <LeadDrawer
          lead={drawer.lead}
          funnels={scopedFunnels.length ? scopedFunnels : funnels}
          sources={sources}
          lostReasons={lostReasons}
          members={members}
          defaultFunnelId={funnel?.id ?? null}
          onClose={() => setDrawer(null)}
          onSaved={(msg) => {
            setDrawer(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}

      {pendingMove && (
        <StageMoveModal
          stage={pendingMove.stage}
          count={pendingMove.ids.length}
          lostReasons={lostReasons}
          onCancel={() => setPendingMove(null)}
          onConfirm={(note, reason) => {
            const m = pendingMove
            setPendingMove(null)
            void doMove(m.ids, m.stage, note, reason)
          }}
        />
      )}
    </>
  )
}
