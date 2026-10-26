import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, Workflow } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { ConfirmModal, Empty, PageHead, SearchInput } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { Link, useNavigate } from 'react-router'
import { db } from '@/lib/supabase'
import { archiveFunnel, listFunnels } from './api'
import { FunnelDrawer } from './FunnelDrawer'
import { FUNNEL_TYPES, typeLabel } from './templates'
import type { FunnelRow, FunnelType } from './types'
import { Flash } from '@/components/Flash'

const typeTone: Record<FunnelType, string> = {
  lead_gen: 'badge-info',
  webinar: 'badge-purple',
  vsl: 'badge-warning',
  custom: 'badge-muted',
}

type Counts = { total: number; unassigned: number; pipeline: number; closed: number }

export function FunnelsPage() {
  const tenant = useTenant()
  const { can, businesses } = useAuth()
  const { selected, sub } = useBusiness()
  const [funnels, setFunnels] = useState<FunnelRow[] | null>(null)
  const [type, setType] = useState<FunnelType | 'all'>('all')
  const [query, setQuery] = useState('')
  const [drawer, setDrawer] = useState<{ funnel: FunnelRow | null } | null>(null)
  const [deleting, setDeleting] = useState<FunnelRow | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const [leadCount, setLeadCount] = useState<Map<string, Counts>>(new Map())

  const load = useCallback(() => {
    listFunnels(tenant.id)
      .then((f) => {
        setFunnels(f)
        // leads this person can see, counted per funnel: total / unassigned / in pipeline / closed (won or lost)
        const kind = new Map(f.flatMap((x) => x.funnel_stages.map((st) => [st.id, st.kind] as const)))
        void db()
          .from('leads')
          .select('funnel_id, stage_id, owner_id')
          .eq('tenant_id', tenant.id)
          .eq('is_archived', false)
          .then(({ data }) => {
            const m = new Map<string, Counts>()
            for (const l of data ?? []) {
              if (!l.funnel_id) continue
              const c = m.get(l.funnel_id) ?? { total: 0, unassigned: 0, pipeline: 0, closed: 0 }
              c.total++
              if (!l.owner_id) c.unassigned++
              const k = kind.get(l.stage_id)
              if (k === 'won' || k === 'lost') c.closed++
              else c.pipeline++
              m.set(l.funnel_id, c)
            }
            setLeadCount(m)
          })
      })
      .catch((e: Error) => setNotice({ error: e.message }))
  }, [tenant.id])
  useEffect(load, [load])

  const businessName = useMemo(() => new Map(businesses.map((b) => [b.id, b.name])), [businesses])
  const subName = (f: FunnelRow) => businesses.find((b) => b.id === f.business_id)?.subs.find((x) => x.id === f.sub_business_id)?.name
  // follows the business picked in the top bar; otherwise every business this person works in
  const inScope = (funnels ?? []).filter((f) =>
    selected ? f.business_id === selected.id && (!sub || f.sub_business_id === sub.id) : businessName.has(f.business_id),
  )
  const visible = inScope
    .filter((f) => type === 'all' || f.type === type)
    .filter((f) => !query.trim() || f.name.toLowerCase().includes(query.trim().toLowerCase()))
  const count = (t: FunnelType | 'all') => (t === 'all' ? inScope.length : inScope.filter((f) => f.type === t).length)

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try {
      await archiveFunnel(deleting.id)
      setNotice({ ok: `${deleting.name} deleted.` })
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHead
        title="Funnels"
        subtitle={
          selected
            ? `Funnels of ${selected.name}${sub ? ` · ${sub.name}` : ''} and the stages their leads move through.`
            : 'Each business’s funnels and the stages their leads move through.'
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      <div className="panel">
        <div className="panel-bar">
          <div className="tabs">
            {(['all', ...FUNNEL_TYPES.map((t) => t.value).filter((v) => (v !== 'lead_gen' && v !== 'custom') || count(v) > 0)] as const).map((t) => (
              <button key={t} type="button" className={cn('tab', type === t && 'is-active')} onClick={() => setType(t)}>
                {t === 'all' ? 'All' : typeLabel(t)} <span className="muted small">{count(t)}</span>
              </button>
            ))}
          </div>
          <div className="row">
            <SearchInput placeholder="Search funnels" value={query} onChange={setQuery} width={220} />
            {can('funnels', 'add') && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setDrawer({ funnel: null })}
                disabled={!businesses.length}
                title={!businesses.length ? 'Add a business first' : undefined}
              >
                <Plus size={16} /> Add funnel
              </button>
            )}
          </div>
        </div>

        {!funnels ? (
          <div className="empty">Loading funnels…</div>
        ) : visible.length === 0 ? (
          <Empty icon={Workflow}>
            {query || type !== 'all'
              ? 'No funnels match.'
              : businesses.length
                ? 'No funnels yet. Add one: pick a type and its starter stages are created for you.'
                : 'Add a business first, then its funnels.'}
          </Empty>
        ) : (
          <div className="pl-grid">
            {visible.map((f) => {
              const c = leadCount.get(f.id) ?? { total: 0, unassigned: 0, pipeline: 0, closed: 0 }
              return (
                <article
                  key={f.id}
                  className="pl-card funnel-card"
                  role="link"
                  tabIndex={0}
                  onClick={(e) => {
                    // buttons / links inside the card do their own thing
                    if ((e.target as HTMLElement).closest('button, a')) return
                    navigate(`/funnels/${f.id}`)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && navigate(`/funnels/${f.id}`)}
                >
                  <div className="pl-card-head">
                    <span className="thumb thumb-letter">
                      <Workflow size={17} />
                    </span>
                    <div className="pl-card-title">
                      <div className="pl-name">{f.name}</div>
                      <div className="pl-sub muted small">{businessName.get(f.business_id) ?? '—'}
                        {subName(f) ? ` · ${subName(f)}` : ''}</div>
                    </div>
                    <span className={cn('badge', typeTone[f.type])}>{typeLabel(f.type)}</span>
                  </div>
                  {f.description && <p className="muted small funnel-desc">{f.description}</p>}
                  <div className="pl-tiles funnel-tiles">
                    <div className="pl-tile">
                      <div className="pl-tile-label">Total leads</div>
                      <div className="pl-tile-value">{c.total}</div>
                    </div>
                    <div className="pl-tile">
                      <div className="pl-tile-label">Unassigned</div>
                      <div className={cn('pl-tile-value', c.unassigned > 0 && 'tone-warning')}>{c.unassigned}</div>
                    </div>
                    <div className="pl-tile">
                      <div className="pl-tile-label">In pipeline</div>
                      <div className="pl-tile-value">{c.pipeline}</div>
                    </div>
                    <div className="pl-tile">
                      <div className="pl-tile-label">Closed</div>
                      <div className="pl-tile-value tone-success">{c.closed}</div>
                    </div>
                  </div>
                  <div className="pl-auto">
                    <Link to={`/funnels/${f.id}`} className="link">
                      Open funnel →
                    </Link>
                    <Link to="/leads" className="link muted" onClick={() => {
                        try {
                          localStorage.setItem(`leads.funnel.${tenant.id}`, f.id)
                        } catch {
                          /* storage unavailable */
                        }
                      }}>
                      Leads →
                    </Link>
                    <div className="row-actions">
                      {can('funnels', 'edit') && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          title="Edit"
                          aria-label={`Edit ${f.name}`}
                          onClick={() => setDrawer({ funnel: f })}
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {can('funnels', 'delete') && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon danger-text"
                          title="Delete"
                          aria-label={`Delete ${f.name}`}
                          onClick={() => setDeleting(f)}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {drawer && (
        <FunnelDrawer
          funnel={drawer.funnel}
          businesses={businesses}
          defaultBusinessId={selected?.id ?? null}
          defaultSubId={sub?.id ?? null}
          onClose={() => setDrawer(null)}
          onSaved={(msg) => {
            setDrawer(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}

      <ConfirmModal
        open={!!deleting}
        icon={Trash2}
        danger
        title={`Delete ${deleting?.name ?? ''}?`}
        message="It will be removed from the funnel list. Its stages and history are kept, so it can be restored later if needed."
        confirmLabel={busy ? 'Deleting…' : 'Delete'}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </>
  )
}
