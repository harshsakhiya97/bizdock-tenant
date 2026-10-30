import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, CalendarDays, Pencil, Tag, UserCheck, Users, Workflow } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Empty } from '@/components/ui'
import { listEvents, type EventRow } from '@/calendar/api'
import { listFunnelLeads, listMemberOptions, listSources } from '@/leads/api'
import { followUp, fullName, money, tempOf } from '@/leads/labels'
import type { LeadRow, MemberOption, Option } from '@/leads/types'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { listFunnelSubmissions, listFunnels, listLandingPages, listSheets, listWebhooks } from './api'
import { FunnelDrawer } from './FunnelDrawer'
import { LandingPagesTab } from './LandingPagesTab'
import { WebhooksTab } from './WebhooksTab'
import { WhatsAppTab } from './WhatsAppTab'
import { FunnelWorkflowsTab } from './FunnelWorkflowsTab'
import { typeLabel } from './templates'
import type { FunnelRow, FunnelSheet, FunnelWebhook, LandingPage, SubmissionRow } from './types'
import { Flash } from '@/components/Flash'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'pages', label: 'Landing pages' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'leads', label: 'Leads' },
  { key: 'workflows', label: 'Workflows' },
] as const
type TabKey = (typeof TABS)[number]['key']

const typeTone = { lead_gen: 'badge-info', webinar: 'badge-purple', vsl: 'badge-warning', custom: 'badge-muted' } as const
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/** One funnel: overview, landing pages (+ UTM links), webhooks and its leads. */
export function FunnelPage() {
  const { id = '' } = useParams()
  const tenant = useTenant()
  const navigate = useNavigate()
  const { can, businesses } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'overview') as TabKey

  const [funnel, setFunnel] = useState<FunnelRow | null | undefined>(undefined)
  const [pages, setPages] = useState<LandingPage[] | null>(null)
  const [hooks, setHooks] = useState<FunnelWebhook[] | null>(null)
  const [sheets, setSheets] = useState<FunnelSheet[] | null>(null)
  const [subs, setSubs] = useState<SubmissionRow[]>([])
  const [leads, setLeads] = useState<LeadRow[] | null>(null)
  const [sources, setSources] = useState<Option[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
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
    listWebhooks(id).then(setHooks).catch((e: Error) => setNotice({ error: e.message }))
    listSheets(id).then(setSheets).catch((e: Error) => setNotice({ error: e.message }))
    listFunnelSubmissions(id).then(setSubs).catch(() => setSubs([]))
    listFunnelLeads(id).then(setLeads).catch(() => setLeads([]))
    void listSources(tenant.id).then(setSources)
    void listMemberOptions(tenant.id).then(setMembers)
  }, [id, tenant.id])
  useEffect(load, [load])

  const stageOf = useMemo(() => new Map((funnel?.funnel_stages ?? []).map((s) => [s.id, s])), [funnel])
  const biz = businesses.find((b) => b.id === funnel?.business_id)
  const subName = biz?.subs.find((x) => x.id === funnel?.sub_business_id)?.name
  const businessName = biz ? (subName ? `${biz.name} · ${subName}` : biz.name) : '—'

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

  const fromForms = (leads ?? []).filter((l) => l.webhook_id || l.landing_page_id || l.sheet_id).length
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
      <Flash msg={notice.ok} dep={notice} />

      <div className="panel">
        <div className="panel-bar">
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.key} type="button" className={cn('tab', tab === t.key && 'is-active')} onClick={() => setTab(t.key)}>
                {t.label}
                {t.key === 'pages' && pages && <span className="muted small"> {pages.length}</span>}
                {t.key === 'webhooks' && hooks && <span className="muted small"> {hooks.length}</span>}
                {t.key === 'whatsapp' && sheets && <span className="muted small"> {sheets.length}</span>}
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
                  <div className="pl-tile-label">From forms & sheets</div>
                  <div className="pl-tile-value">{fromForms}</div>
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

              <div>
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
                      <UserCheck size={13} /> Lead owner
                    </span>
                    <span className="small">
                      {funnel.assign_mode === 'single'
                        ? (members.find((m) => m.id === funnel.assign_members[0])?.name ?? '—')
                        : funnel.assign_mode === 'round_robin'
                          ? `Round robin · ${funnel.assign_members.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean).join(', ')}`
                          : <span className="muted">Unassigned</span>}
                    </span>
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

          {tab === 'webhooks' && (
            <WebhooksTab
              funnelId={funnel.id}
              hooks={hooks}
              submissions={subs}
              canEdit={can('funnels', 'edit')}
              onChanged={(msg) => {
                setNotice({ ok: msg })
                load()
              }}
              onError={(msg) => setNotice({ error: msg })}
            />
          )}

          {tab === 'whatsapp' && (
            <WhatsAppTab
              funnelId={funnel.id}
              sheets={sheets}
              canEdit={can('funnels', 'edit')}
              onChanged={(msg) => {
                setNotice({ ok: msg })
                load()
              }}
              onError={(msg) => setNotice({ error: msg })}
            />
          )}

          {tab === 'workflows' && <FunnelWorkflowsTab tenantId={tenant.id} funnelId={funnel.id} eventId={funnel.event_id ?? null} />}

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
                      <th>Lead</th>
                      <th>Temp</th>
                      <th>Source</th>
                      <th>Owner</th>
                      <th>Next follow-up</th>
                      <th style={{ textAlign: 'right' }}>Value</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => {
                      const t = tempOf(l.temperature)
                      const fu = followUp(l.next_follow_up_at)
                      return (
                        <tr key={l.id} className="is-clickable" onClick={() => openLead(l.id)}>
                          <td>
                            <span className="strong">{fullName(l)}</span>
                            <div className="muted small">
                              {l.phone}
                              {l.city ? ` · ${l.city}` : ''}
                            </div>
                            {l.tags.length > 0 && (
                              <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                                {l.tags.map((tg) => (
                                  <span key={tg} className="tag-chip tag-chip-sm">
                                    {tg}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td>{t ? <span className={cn('badge', t.tone)}>{t.label}</span> : <span className="muted">—</span>}</td>
                          <td>{sources.find((x) => x.id === l.source_id)?.name ?? <span className="muted">—</span>}</td>
                          <td className="nowrap">{members.find((m) => m.id === l.owner_id)?.name ?? <span className="muted">Unassigned</span>}</td>
                          <td className={cn('nowrap', `fu-${fu.state}`)}>{fu.text}</td>
                          <td className="num" style={{ textAlign: 'right' }}>
                            {money(l.estimated_amount)}
                          </td>
                          <td className="muted nowrap">{new Date(l.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
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
