import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, CalendarDays, Pencil, Tag, Users, Workflow } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Empty } from '@/components/ui'
import { listEvents, type EventRow } from '@/calendar/api'
import { listFunnelLeads, listSources } from '@/leads/api'
import { fullName } from '@/leads/labels'
import type { LeadRow, Option } from '@/leads/types'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { listFunnelSubmissions, listFunnels, listLandingPages } from './api'
import { FunnelDrawer } from './FunnelDrawer'
import { LandingPagesTab } from './LandingPagesTab'
import { typeLabel } from './templates'
import type { FunnelRow, LandingPage, SubmissionRow } from './types'
import type { ChainContext } from './chain/types'

// the canvas library is large: load it only when the Chain tab opens
const ChainBuilder = lazy(() => import('./chain/ChainBuilder').then((m) => ({ default: m.ChainBuilder })))

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'pages', label: 'Landing pages' },
  { key: 'chain', label: 'Chain' },
  { key: 'leads', label: 'Leads' },
] as const
type TabKey = (typeof TABS)[number]['key']

const typeTone = { lead_gen: 'badge-info', webinar: 'badge-purple', vsl: 'badge-warning', custom: 'badge-muted' } as const
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/** One funnel: overview, landing pages (webhooks + UTM links), communication chain and its leads. */
export function FunnelPage() {
  const { id = '' } = useParams()
  const tenant = useTenant()
  const navigate = useNavigate()
  const { can, businesses } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'overview') as TabKey

  const [funnel, setFunnel] = useState<FunnelRow | null | undefined>(undefined)
  const [pages, setPages] = useState<LandingPage[] | null>(null)
  const [subs, setSubs] = useState<SubmissionRow[]>([])
  const [leads, setLeads] = useState<LeadRow[] | null>(null)
  const [sources, setSources] = useState<Option[]>([])
  const [event, setEvent] = useState<EventRow | null>(null)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  const load = useCallback(() => {
    listFunnels(tenant.id)
      .then((all) => {
        const f = all.find((x) => x.id === id) ?? null
        setFunnel(f)
        if (!f) return
        void listEvents(tenant.id).then((ev) => setEvent(ev.find((e) => e.id === f.event_id) ?? null))
      })
      .catch((e: Error) => setNotice({ error: e.message }))
    listLandingPages(id).then(setPages).catch((e: Error) => setNotice({ error: e.message }))
    listFunnelSubmissions(id).then(setSubs).catch(() => setSubs([]))
    listFunnelLeads(id).then(setLeads).catch(() => setLeads([]))
    void listSources(tenant.id).then(setSources)
  }, [id, tenant.id])
  useEffect(load, [load])

  const pageName = useMemo(() => new Map((pages ?? []).map((p) => [p.id, p.name])), [pages])
  const stageOf = useMemo(() => new Map((funnel?.funnel_stages ?? []).map((s) => [s.id, s])), [funnel])
  const businessName = businesses.find((b) => b.id === funnel?.business_id)?.name ?? '—'

  const chainCtx = useMemo<ChainContext>(
    () => ({
      pages: (pages ?? []).map((p) => ({ id: p.id, name: p.name })),
      stages: (funnel?.funnel_stages ?? []).map((st) => ({ id: st.id, name: st.name })),
      tags: [...new Set([...(funnel?.tags ?? []), ...(leads ?? []).flatMap((l) => l.tags)])].sort(),
      event: event ? { title: event.title, date: event.event_date, time: event.start_time } : null,
      fieldKeys: [...new Set((pages ?? []).flatMap((p) => p.fields.map((f) => f.key)))].filter((k) => k !== 'city'),
    }),
    [pages, funnel, leads, event],
  )

  if (funnel === undefined) return <div className="empty">Loading funnel…</div>
  if (!funnel)
    return (
      <Empty icon={Workflow}>
        This funnel doesn’t exist or was deleted. <Link to="/funnels" className="link-btn">Back to funnels</Link>
      </Empty>
    )

  const setTab = (t: TabKey) =>
    setParams(
      (p) => {
        if (t === 'overview') p.delete('tab')
        else p.set('tab', t)
        return p
      },
      { replace: true },
    )
  const openLead = (leadId: string) => {
    try {
      localStorage.setItem(`leads.funnel.${tenant.id}`, funnel.id)
    } catch {
      /* storage unavailable */
    }
    navigate(`/leads?open=${leadId}`)
  }

  const fromPages = (leads ?? []).filter((l) => l.landing_page_id).length
  const won = (leads ?? []).filter((l) => stageOf.get(l.stage_id ?? '')?.kind === 'won').length
  const daysTo = event ? Math.round((new Date(`${event.event_date}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : null

  return (
    <>
      <div className="fp-head">
        <Link to="/funnels" className="link-btn muted small">
          <ArrowLeft size={14} /> All funnels
        </Link>
        <div className="row-between">
          <div className="fp-title">
            <span className="thumb thumb-letter">
              <Workflow size={18} />
            </span>
            <div>
              <h2>{funnel.name}</h2>
              <div className="row small muted" style={{ gap: 8 }}>
                <span>{businessName}</span>
                <span className={cn('badge', typeTone[funnel.type])}>{typeLabel(funnel.type)}</span>
              </div>
            </div>
          </div>
          {can('funnels', 'edit') && (
            <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>
              <Pencil size={15} /> Edit funnel
            </button>
          )}
        </div>
      </div>

      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      {notice.ok && <div className="alert alert-info">{notice.ok}</div>}

      <div className="panel">
        <div className="panel-bar">
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.key} type="button" className={cn('tab', tab === t.key && 'is-active')} onClick={() => setTab(t.key)}>
                {t.label}
                {t.key === 'pages' && pages && <span className="muted small"> {pages.length}</span>}
                {t.key === 'leads' && leads && <span className="muted small"> {leads.length}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="panel-body">
          {tab === 'overview' && (
            <div className="stack">
              <div className="pl-tiles fp-tiles">
                <div className="pl-tile">
                  <div className="pl-tile-label">Leads</div>
                  <div className="pl-tile-value">{leads?.length ?? '—'}</div>
                </div>
                <div className="pl-tile">
                  <div className="pl-tile-label">From landing pages</div>
                  <div className="pl-tile-value">{fromPages}</div>
                </div>
                <div className="pl-tile">
                  <div className="pl-tile-label">Form posts</div>
                  <div className="pl-tile-value">{subs.filter((s) => s.via === 'webhook').length}</div>
                </div>
                <div className="pl-tile">
                  <div className="pl-tile-label">Won</div>
                  <div className="pl-tile-value tone-success">{won}</div>
                </div>
              </div>

              <div className="fp-grid">
                <section className="card card-pad stack" style={{ gap: 12 }}>
                  <b>Details</b>
                  {funnel.description && <p className="muted small" style={{ margin: 0 }}>{funnel.description}</p>}
                  <div className="fp-row">
                    <span className="muted small">
                      <Tag size={13} /> Tags
                    </span>
                    {funnel.tags.length ? (
                      <div className="chip-row">
                        {funnel.tags.map((t) => (
                          <span key={t} className="tag-chip">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="muted small">None</span>
                    )}
                  </div>
                  <div className="fp-row">
                    <span className="muted small">
                      <CalendarDays size={13} /> Webinar / event
                    </span>
                    {event ? (
                      <span className="small">
                        <b>{event.title}</b> · {day(event.event_date)}
                        {event.start_time ? `, ${event.start_time.slice(0, 5)}` : ''}
                        {daysTo != null && (
                          <span className={cn('badge', daysTo < 0 ? 'badge-muted' : 'badge-brand')} style={{ marginLeft: 6 }}>
                            {daysTo < 0 ? 'Over' : daysTo === 0 ? 'Today' : `In ${daysTo} day${daysTo === 1 ? '' : 's'}`}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="muted small">Not connected</span>
                    )}
                  </div>
                </section>

                <section className="card card-pad stack" style={{ gap: 10 }}>
                  <b>Leads by stage</b>
                  {funnel.funnel_stages.map((s) => {
                    const n = (leads ?? []).filter((l) => l.stage_id === s.id).length
                    const max = Math.max(1, ...funnel.funnel_stages.map((x) => (leads ?? []).filter((l) => l.stage_id === x.id).length))
                    return (
                      <div key={s.id} className="fp-stage">
                        <span className="funnel-stage" style={{ ['--c' as string]: s.color }}>
                          {s.name}
                        </span>
                        <div className="fp-bar">
                          <span style={{ width: `${(n / max) * 100}%`, background: s.color }} />
                        </div>
                        <b className="small">{n}</b>
                      </div>
                    )
                  })}
                </section>
              </div>
            </div>
          )}

          {tab === 'pages' && (
            <LandingPagesTab
              funnelId={funnel.id}
              pages={pages}
              submissions={subs}
              canEdit={can('funnels', 'edit')}
              onChanged={(msg) => {
                setNotice({ ok: msg })
                load()
              }}
              onError={(msg) => setNotice({ error: msg })}
            />
          )}

          {tab === 'chain' && (
            <Suspense fallback={<div className="empty">Loading the chain builder…</div>}>
              <ChainBuilder funnelId={funnel.id} ctx={chainCtx} canEdit={can('funnels', 'edit')} />
            </Suspense>
          )}

          {tab === 'leads' &&
            (!leads ? (
              <div className="empty">Loading leads…</div>
            ) : leads.length === 0 ? (
              <Empty icon={Users}>No leads in this funnel yet.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Stage</th>
                      <th>Landing page</th>
                      <th>UTM source / campaign</th>
                      <th>Source</th>
                      <th>Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => {
                      const st = stageOf.get(l.stage_id ?? '')
                      return (
                        <tr key={l.id} className="is-clickable" onClick={() => openLead(l.id)}>
                          <td className="strong">{fullName(l)}</td>
                          <td className="nowrap">{l.phone}</td>
                          <td>
                            {st && (
                              <span className="funnel-stage" style={{ ['--c' as string]: st.color }}>
                                {st.name}
                              </span>
                            )}
                          </td>
                          <td className="muted">{l.landing_page_id ? pageName.get(l.landing_page_id) ?? 'Deleted page' : '—'}</td>
                          <td className="muted small">{[l.utm_source, l.utm_campaign].filter(Boolean).join(' / ') || '—'}</td>
                          <td className="muted">{sources.find((s) => s.id === l.source_id)?.name ?? '—'}</td>
                          <td className="muted nowrap">{new Date(l.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      </div>

      {editing && (
        <FunnelDrawer
          funnel={funnel}
          businesses={businesses}
          defaultBusinessId={funnel.business_id}
          onClose={() => setEditing(false)}
          onSaved={(msg) => {
            setEditing(false)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}
    </>
  )
}
