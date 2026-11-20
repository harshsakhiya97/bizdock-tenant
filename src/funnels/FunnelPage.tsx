import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, CalendarDays, ChartLine, List, Pencil, Tag, UserCheck, Users, Workflow } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Empty } from '@/components/ui'
import { listEvents, type EventRow } from '@/calendar/api'
import { listFunnelLeads, listMemberOptions, listSources } from '@/leads/api'
import type { LeadRow, MemberOption, Option } from '@/leads/types'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { listFunnelSubmissions, listFunnels, listLandingPages, listSheets, listWebhooks } from './api'
import { FunnelDrawer } from './FunnelDrawer'
import { FunnelLeadsTable } from './FunnelLeadsTable'
import { activeType } from '@/business/activeType'
import { LandingPagesTab } from './LandingPagesTab'
import { WebhooksTab } from './WebhooksTab'
import { WhatsAppTab } from './WhatsAppTab'
import { FunnelWorkflowsTab } from './FunnelWorkflowsTab'
import { FunnelAdsTab } from './FunnelAdsTab'
import { FunnelGoogleTab } from './FunnelGoogleTab'
import { StatRecords, type StatShow } from '@/components/StatRecords'
import { leadCols } from '@/leads/statCols'
import { db } from '@/lib/supabase'
import { FunnelPaymentsTab } from './FunnelPaymentsTab'
import { FunnelAdsReport, fromSrc, leadDay, type Src } from './FunnelAdsReport'
import { listWorkflows } from '@/workflows/api'
import { funnelCampaignCount } from '@/meta/api'
import { typeLabel } from './templates'
import type { FunnelRow, FunnelSheet, FunnelWebhook, LandingPage, SubmissionRow } from './types'
import { Flash } from '@/components/Flash'
import { DateRangePicker, isoDay, presetRange, rangeLabel, type Range } from '@/components/DateRange'
import { SpendLines, type Line } from './SpendLines'
import { TEMPERATURES } from '@/leads/labels'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'leads', label: 'Leads' },
  { key: 'ads', label: 'Facebook Ads' },
  { key: 'google', label: 'Google Ads' },
  { key: 'payments', label: 'Payments' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'workflows', label: 'Workflows' },
  { key: 'pages', label: 'Landing pages' },
  { key: 'whatsapp', label: 'WhatsApp' },
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
  // Overview: the funnel report's period and source (Overall / Facebook / Google); the tiles above it follow them too.
  // Same presets as Facebook Ads Manager (Last 30 days ends yesterday), so the numbers match
  const [repRange, setRepRange] = useState<Range>(() => presetRange('last30'))
  const [repSrc, setRepSrc] = useState<Src>('all')
  // Leads tab: a date range (lead date), and Graph (leads per day, a line per category) or List
  const [leadRange, setLeadRange] = useState<Range>(() => presetRange('last30'))
  const [leadView, setLeadView] = useState<'graph' | 'list'>('graph')
  const [leadTemp, setLeadTemp] = useState('')
  const rangedLeads = useMemo(
    () =>
      (leads ?? []).filter((l) => {
        const d = isoDay(new Date(l.created_at))
        return d >= leadRange.from && d <= leadRange.to && (!leadTemp || (leadTemp === 'none' ? !l.temperature : l.temperature === leadTemp))
      }),
    [leads, leadRange, leadTemp],
  )
  const leadChart = useMemo(() => {
    if (!rangedLeads.length) return { days: [] as string[], lines: [] as Line[] }
    const first = rangedLeads.reduce((m, l) => (isoDay(new Date(l.created_at)) < m ? isoDay(new Date(l.created_at)) : m), leadRange.to)
    const days: string[] = []
    for (let d = new Date(`${first > leadRange.from ? first : leadRange.from}T00:00:00`); isoDay(d) <= leadRange.to; d.setDate(d.getDate() + 1)) days.push(isoDay(d))
    const at = new Map(days.map((d, i) => [d, i]))
    const count = (keep: (l: LeadRow) => boolean) => {
      const v = days.map(() => 0)
      for (const l of rangedLeads) if (keep(l)) { const i = at.get(isoDay(new Date(l.created_at))); if (i != null) v[i]++ }
      return v
    }
    const lines: Line[] = [{ key: 'all', name: 'All leads', values: count(() => true) }]
    for (const t of TEMPERATURES) if (rangedLeads.some((l) => l.temperature === t.value)) lines.push({ key: t.value, name: t.label, values: count((l) => l.temperature === t.value) })
    if (rangedLeads.some((l) => !l.temperature)) lines.push({ key: 'none', name: 'No category', values: count((l) => !l.temperature) })
    return { days, lines }
  }, [rangedLeads, leadRange])
  const [flowCount, setFlowCount] = useState<number | null>(null)
  // Facebook campaigns added to this funnel
  const [adCount, setAdCount] = useState<number | null>(null)
  // Google campaigns added to this funnel
  const [gCount, setGCount] = useState<number | null>(null)
  const loadAds = useCallback(() => {
    funnelCampaignCount(id).then(setAdCount, () => setAdCount(null))
    db()
      .from('funnel_google_links')
      .select('id', { count: 'exact', head: true })
      .eq('funnel_id', id)
      .then(({ count }) => setGCount(count ?? 0))
  }, [id])
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
        // same as its Workflows tab: the funnel's, or started by its webinar / event
        void listWorkflows(tenant.id).then((ws) => setFlowCount(ws.filter((w) => w.funnel_id === f.id || (!!f.event_id && w.event_id === f.event_id)).length))
      })
      .catch((e: Error) => setNotice({ error: e.message }))
    listLandingPages(id).then(setPages).catch((e: Error) => setNotice({ error: e.message }))
    listWebhooks(id).then(setHooks).catch((e: Error) => setNotice({ error: e.message }))
    listSheets(id).then(setSheets).catch((e: Error) => setNotice({ error: e.message }))
    listFunnelSubmissions(id).then(setSubs).catch(() => setSubs([]))
    listFunnelLeads(id).then(setLeads).catch(() => setLeads([]))
    loadAds()
    void listSources(tenant.id).then(setSources)
    void listMemberOptions(tenant.id).then(setMembers)
  }, [id, tenant.id, loadAds])
  useEffect(load, [load])

  const stageOf = useMemo(() => new Map((funnel?.funnel_stages ?? []).map((s) => [s.id, s])), [funnel])
  const biz = businesses.find((b) => b.id === funnel?.business_id)
  const subName = biz?.subs.find((x) => x.id === funnel?.sub_business_id)?.name
  const businessName = biz ? (subName ? `${biz.name} · ${subName}` : biz.name) : '—'

  // overview tiles: their records in a modal
  const [leadShow, setLeadShow] = useState<StatShow<LeadRow> | null>(null)
  const [subShow, setSubShow] = useState<StatShow<SubmissionRow> | null>(null)
  const leadName = useMemo(() => new Map((leads ?? []).map((l) => [l.id, [l.first_name, l.last_name].filter(Boolean).join(' ')])), [leads])
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

  // the tiles: the leads created in the report's period, from its source (and their form posts)
  const inRep = (ts: string) => {
    const d = leadDay(ts)
    return d >= repRange.from && d <= repRange.to
  }
  const tileLeads = (leads ?? []).filter((l) => inRep(l.created_at) && fromSrc(l, repSrc))
  const leadOf = new Map((leads ?? []).map((l) => [l.id, l]))
  const tilePosts = subs.filter((x) => x.via === 'webhook' && inRep(x.created_at) && (repSrc === 'all' || (!!x.lead_id && !!leadOf.get(x.lead_id) && fromSrc(leadOf.get(x.lead_id)!, repSrc))))
  const fromForms = tileLeads.filter((l) => l.webhook_id || l.landing_page_id || l.sheet_id).length
  const won = tileLeads.filter((l) => stageOf.get(l.stage_id ?? '')?.kind === 'won').length
  // the tiles open their records: leads, or the form posts
  const showLeads = (title: string, f: (l: LeadRow) => boolean) => setLeadShow({ title, rows: tileLeads.filter(f), cols: leadCols(members) })
  const showPosts = () =>
    setSubShow({
      title: 'Form posts',
      rows: tilePosts,
      cols: [
        { label: 'Received', render: (x) => <span className="nowrap">{new Date(x.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span> },
        { label: 'Lead', render: (x) => (x.lead_id ? <b>{leadName.get(x.lead_id) || 'Lead'}</b> : <span className="muted">—</span>) },
        { label: 'New / existing', render: (x) => (x.is_new ? <span className="badge badge-success">New lead</span> : <span className="badge badge-muted">Existing lead</span>) },
        { label: 'Result', render: (x) => x.result || x.action || <span className="muted">—</span> },
        { label: 'UTM', render: (x) => <span className="small">{[x.utm_source, x.utm_campaign].filter(Boolean).join(' · ') || '—'}</span> },
      ],
    })
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
            {TABS.filter((t) => t.key !== 'payments' || can('payments', 'view')).map((t) => (
              <button key={t.key} type="button" className={cn('tab', tab === t.key && 'is-active')} onClick={() => setTab(t.key)}>
                {t.label}
                {t.key === 'pages' && pages && <span className="muted small"> {pages.length}</span>}
                {t.key === 'webhooks' && hooks && <span className="muted small"> {hooks.length}</span>}
                {t.key === 'whatsapp' && sheets && <span className="muted small"> {sheets.length}</span>}
                {t.key === 'leads' && leads && <span className="muted small"> {leads.length}</span>}
                {t.key === 'ads' && adCount != null && <span className="muted small"> {adCount}</span>}
                {t.key === 'google' && gCount != null && <span className="muted small"> {gCount}</span>}
                {t.key === 'workflows' && flowCount != null && <span className="muted small"> {flowCount}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="panel-body">
          {tab === 'overview' && (
            <div className="stack">
              <div className="muted small">
                {rangeLabel(repRange)} · {repSrc === 'all' ? 'Overall (Facebook + Google)' : repSrc === 'fb' ? 'Facebook' : 'Google'}: the Funnel report’s period and source (change them below).
              </div>
              <div className="pl-tiles fp-tiles">
                <div className="pl-tile is-clickable" role="button" tabIndex={0} title="See the leads" onClick={() => showLeads('Leads', () => true)}>
                  <div className="pl-tile-label">Leads</div>
                  <div className="pl-tile-value">{leads ? tileLeads.length : '—'}</div>
                </div>
                <div className="pl-tile is-clickable" role="button" tabIndex={0} title="See the leads" onClick={() => showLeads('From forms & sheets', (l) => !!(l.webhook_id || l.landing_page_id || l.sheet_id))}>
                  <div className="pl-tile-label">From forms & sheets</div>
                  <div className="pl-tile-value">{fromForms}</div>
                </div>
                <div className="pl-tile is-clickable" role="button" tabIndex={0} title="See the form posts" onClick={showPosts}>
                  <div className="pl-tile-label">Form posts</div>
                  <div className="pl-tile-value">{tilePosts.length}</div>
                </div>
                <div className="pl-tile is-clickable" role="button" tabIndex={0} title="See the leads" onClick={() => showLeads('Won', (l) => stageOf.get(l.stage_id ?? '')?.kind === 'won')}>
                  <div className="pl-tile-label">Won</div>
                  <div className="pl-tile-value tone-success">{won}</div>
                </div>
              </div>
              <StatRecords show={leadShow} onClose={() => setLeadShow(null)} rowKey={(l) => l.id} onRow={(l) => navigate(`/leads/${l.id}`)} />
              <StatRecords show={subShow} onClose={() => setSubShow(null)} rowKey={(x) => x.id} onRow={(x) => x.lead_id && navigate(`/leads/${x.lead_id}`)} />

              <FunnelAdsReport funnelId={funnel.id} leads={leads} range={repRange} setRange={setRepRange} src={repSrc} setSrc={setRepSrc} />

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

          {tab === 'ads' && <FunnelAdsTab funnelId={funnel.id} canEdit={can('funnels', 'edit')} onSaved={(msg) => {
                setNotice({ ok: msg })
                loadAds()
              }} />}
          {tab === 'google' && (
            <FunnelGoogleTab
              funnelId={funnel.id}
              canEdit={can('funnels', 'edit')}
              onSaved={(msg) => {
                setNotice({ ok: msg })
                loadAds()
              }}
            />
          )}
          {tab === 'payments' && can('payments', 'view') && <FunnelPaymentsTab funnelId={funnel.id} leads={leads} canEdit={can('funnels', 'edit')} />}
          {tab === 'workflows' && <FunnelWorkflowsTab funnelId={funnel.id} eventId={funnel.event_id ?? null} />}

          {tab === 'leads' && leads && leads.length > 0 && (
            <div className="row-between" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <span className="muted small">
                {rangedLeads.length} lead{rangedLeads.length === 1 ? '' : 's'}{leadTemp ? ` (${TEMPERATURES.find((t) => t.value === leadTemp)?.label})` : ''} in these dates (lead date)
              </span>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                <select className="input input-sm filter-select" value={leadTemp} onChange={(e) => setLeadTemp(e.target.value)} aria-label="Category">
                  <option value="">Category</option>
                  {TEMPERATURES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <DateRangePicker value={leadRange} onChange={setLeadRange} />
                <div className="seg" role="group" aria-label="View">
                  <button type="button" className={leadView === 'graph' ? 'is-active' : undefined} onClick={() => setLeadView('graph')} title="Graph">
                    <ChartLine size={15} /> Graph
                  </button>
                  <button type="button" className={leadView === 'list' ? 'is-active' : undefined} onClick={() => setLeadView('list')} title="List">
                    <List size={15} /> List
                  </button>
                </div>
              </div>
            </div>
          )}
          {tab === 'leads' &&
            (!leads ? (
              <div className="empty">Loading leads…</div>
            ) : leads.length === 0 ? (
              <Empty icon={Users}>No leads in this funnel yet.</Empty>
            ) : rangedLeads.length === 0 ? (
              <Empty icon={Users}>No leads in these dates{leadTemp ? ' in this category' : ''}.</Empty>
            ) : leadView === 'graph' ? (
              <div className="stack" style={{ gap: 8 }}>
                <span className="muted small">Leads per day, and by category (each lead’s category now) · click a name below to hide / show its line</span>
                <SpendLines key={`${leadRange.from}|${leadRange.to}`} days={leadChart.days} lines={leadChart.lines} unit="count" />
              </div>
            ) : (
              <FunnelLeadsTable
                funnel={funnel}
                type={activeType(biz ?? null, biz?.subs.find((x) => x.id === funnel.sub_business_id) ?? null)}
                leads={rangedLeads}
                sources={sources}
                members={members}
                resetKey={[leadRange, leadTemp]}
                onOpen={openLead}
                onChanged={() => listFunnelLeads(funnel.id).then(setLeads)}
              />
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
