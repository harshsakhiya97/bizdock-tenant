import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertTriangle, ArrowDown, ArrowUp, Bell, CalendarClock, ChevronRight, CalendarDays, CircleAlert, IndianRupee, PhoneCall, Users, Video } from 'lucide-react'
import { DateRangePicker, presetRange, type Range } from '@/components/DateRange'
import { PageHead } from '@/components/ui'
import { StatRecords, type StatShow } from '@/components/StatRecords'
import { TEMPERATURES, tempOf } from '@/leads/labels'
import type { Temperature } from '@/leads/types'
import { useBusiness } from '@/business/useBusiness'
import { db } from '@/lib/supabase'
import { freshRange, useKept } from '@/lib/useKept'
import { useTenant } from '@/tenant/useTenant'

// ---------- data (owner_dashboard) ----------
type Kpi = {
  revenue: number
  revenue_prev: number
  ad_spend: number
  ad_spend_prev: number
  expenses: number
  expenses_prev: number
  expense_rows: number
  leads: number
  leads_prev: number
  closed: number
  due: number
  overdue: number
  overdue_parts: number
}
type Biz = {
  id: string | null
  name: string
  revenue: number
  ad_spend: number
  expenses: number
  leads: number
  closed: number
  trend: number[]
  revenue_prev: number
  ad_spend_prev: number
  expenses_prev: number
  leads_prev: number
}
type Day = { day: string; revenue: number; spend: number; leads: number }
type Fun = { id: string; name: string; business: string; leads: number; contacted: number; met: number; closed: number; lost: number; leads_prev: number }
/** the leads behind a number (owner_dash_leads) */
type LeadItem = { id: string; name: string | null; phone: string | null; created_at: string; temperature: string | null; stage: string | null; funnel: string | null; source: string | null; owner: string | null }
type LeadQuery = { p_business?: string | null; p_funnel?: string; p_source?: string; p_campaign?: string; p_ad?: string; p_step?: string }
type Ad = { name: string; adset: string | null; spend: number; leads: number }
type Camp = { platform: 'meta' | 'google'; campaign_id: string; name: string; spend: number; leads: number }
type Member = { id: string; name: string; role: string | null; fu_done: number; overdue: number; meetings: number; leads: number; closed: number }
type Caller = { emp_number: string; name: string | null; calls: number; connected: number; talk_sec: number }
/** a live alert (owner_alerts) */
type Alert = { level: 'bad' | 'warn'; kind: string; text: string; to: string }

type Data = {
  kpi: Kpi
  businesses: Biz[]
  daily: Day[]
  funnels: Fun[]
  sources: { name: string; n: number }[]
  campaigns: Camp[]
  team: Member[]
  callers: Caller[]
  attention: { overdue_fu: number; due_today: number; first_call_pending: number; no_follow_up: number }
  next: {
    meetings: { id: string; meeting_date: string; start_time: string; who: string; lead_id: string | null; zoom: boolean }[]
    bookings: { id: string; booking_date: string; start_time: string; who: string | null; total_amount: number | null }[]
    dues: { id: string; amount: number; due_on: string; invoice_no: string | null; who: string | null; invoice_id: string }[]
  }
}

const num = (v: unknown) => Number(v) || 0
const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`
/** ₹1.2L / ₹45.3K / ₹900 */
const short = (v: number) => {
  const a = Math.abs(v)
  const s = a >= 1e7 ? `${(a / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(1)}L` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : `${Math.round(a)}`
  return `${v < 0 ? '−' : ''}₹${s}`
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const dayLabel = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const clock = (t: string | null) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}
const hours = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${Math.round(s / 60)}m`)

/** callers shown before Show all */
const TOP = 6

const C = { revenue: '#16a34a', spend: '#6366f1', expense: '#f59e0b', leads: '#0ea5e9', profit: '#16a34a', loss: '#dc2626' }

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600))
    ro.observe(el)
    setW(el.clientWidth || 600)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/**
 * Dashboard for the owner / admins: everything at a glance for the dates — money (revenue, ad spend, expenses,
 * profit, money due), each business, the funnels, marketing, the team and the callers, and what's next.
 * The business switcher narrows it to one business.
 */
export function OwnerDashboard({ toggle }: { toggle?: React.ReactNode }) {
  const tenant = useTenant()
  const { selected, select: selectBiz } = useBusiness()
  const [range, setRange] = useKept<Range>(`owner-dash.${tenant.id}.range`, () => presetRange('thisMonth'), freshRange)
  const [data, setData] = useState<Data | null>(null)
  // View details: back to the top once the picked business has loaded (the page height changes while it loads)
  const toTop = useRef(false)
  const goTop = () => {
    // the page scrolls inside #root (html / body / #root are height 100% with overflow-x hidden)
    for (const el of [document.getElementById('root'), document.body, document.documentElement]) if (el) el.scrollTop = 0
  }
  useLayoutEffect(() => {
    if (toTop.current) goTop()
  })
  const pickBiz = (id: string | null) => {
    toTop.current = true
    goTop()
    selectBiz(id)
    window.setTimeout(() => (toTop.current = false), 1500)
  }
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  // a number's leads, in a modal
  const [show, setShow] = useState<StatShow<LeadItem> | null>(null)
  const openLeads = useCallback(
    async (title: string, q: LeadQuery) => {
      const { data: d, error: e } = await db().rpc('owner_dash_leads', {
        p_tenant: tenant.id,
        p_from: range.from,
        p_to: range.to,
        p_business: q.p_business ?? selected?.id ?? null,
        p_funnel: q.p_funnel ?? null,
        p_source: q.p_source ?? null,
        p_campaign: q.p_campaign ?? null,
        p_ad: q.p_ad ?? null,
        p_step: q.p_step ?? null,
      })
      if (e) return setError(e.message)
      setShow({ title, rows: (d ?? []) as LeadItem[], cols: LEAD_COLS })
    },
    [tenant.id, range.from, range.to, selected?.id],
  )
  // follow-ups, meetings, calls, leads to call and overdue payments behind a number
  const [recs, setRecs] = useState<StatShow<Rec> | null>(null)
  const openRecords = useCallback(
    async (title: string, kind: string, o: { p_member?: string; p_emp?: string } = {}) => {
      const { data: d, error: e } = await db().rpc('owner_dash_records', {
        p_tenant: tenant.id,
        p_from: range.from,
        p_to: range.to,
        p_kind: kind,
        p_member: o.p_member ?? null,
        p_emp: o.p_emp ?? null,
        p_business: selected?.id ?? null,
      })
      if (e) return setError(e.message)
      setRecs({ title, rows: (d ?? []) as Rec[], cols: recCols(kind) })
    },
    [tenant.id, range.from, range.to, selected?.id],
  )
  // Top campaigns: the opened one's ads
  const [openCamp, setOpenCamp] = useState<string | null>(null)
  const [ads, setAds] = useState<Record<string, Ad[] | 'loading'>>({})
  async function toggleCamp(c: Camp) {
    const key = `${c.platform}${c.campaign_id}`
    if (openCamp === key) return setOpenCamp(null)
    setOpenCamp(key)
    if (ads[key] && ads[key] !== 'loading') return
    setAds((m) => ({ ...m, [key]: 'loading' }))
    const { data: d } = await db().rpc('owner_campaign_ads', { p_tenant: tenant.id, p_platform: c.platform, p_campaign: c.campaign_id, p_from: range.from, p_to: range.to })
    setAds((m) => ({ ...m, [key]: (d ?? []) as Ad[] }))
  }
  useEffect(() => setAds({}), [range.from, range.to])
  // Calls: the top callers (as many rows as the Team card), the rest on Show all
  const [allCallers, setAllCallers] = useState(false)

  const load = useCallback(() => {
    setError(null)
    db()
      .rpc('owner_dashboard', { p_tenant: tenant.id, p_from: range.from, p_to: range.to, p_business: selected?.id ?? null })
      .then(({ data: d, error: e }) => {
        if (e) return setError(e.message)
        if (!d) return setError('Only the owner and admins can see this dashboard.')
        setData(d as Data)
      })
  }, [tenant.id, range.from, range.to, selected?.id])
  useEffect(load, [load])

  // Alerts (live, whatever the dates): connections with an error, quiet team members / callers, leads waiting, ads
  // with no leads, failed WhatsApp messages, Zoom problems — looked at again every 5 minutes
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const loadAlerts = useCallback(() => {
    db()
      .rpc('owner_alerts', { p_tenant: tenant.id, p_business: selected?.id ?? null })
      .then(({ data: d }) => setAlerts((d ?? []) as Alert[]))
  }, [tenant.id, selected?.id])
  useEffect(() => {
    loadAlerts()
    const t = window.setInterval(loadAlerts, 5 * 60_000)
    return () => window.clearInterval(t)
  }, [loadAlerts])

  const k = data?.kpi
  const revenue = num(k?.revenue)
  const spend = num(k?.ad_spend)
  const expenses = num(k?.expenses)
  const profit = revenue - spend - expenses
  const profitPrev = num(k?.revenue_prev) - num(k?.ad_spend_prev) - num(k?.expenses_prev)

  const bizCard = (b: Biz, solo = false) => {
    const p = num(b.revenue) - num(b.ad_spend) - num(b.expenses)
    return (
      <div key={b.id ?? 'none'} className={solo ? 'od-biz-solo' : 'od-biz-card'}>
        <div className="row-between">
          <b>{b.name}</b>
          <Spark values={(b.trend ?? []).map(num)} />
        </div>
        <div className={`od-biz-profit ${p < 0 ? 'is-loss' : ''}`}>{short(p)}</div>
        <div className="od-biz-rows">
          <span>Revenue</span>
          <b>{short(num(b.revenue))}</b>
          <span>Ad spend</span>
          <b>{short(num(b.ad_spend))}</b>
          {num(b.expenses) > 0 && (
            <>
              <span>Expenses</span>
              <b>{short(num(b.expenses))}</b>
            </>
          )}
          <span>Leads</span>
          <b>
            <N n={num(b.leads)} onClick={() => void openLeads(`Leads · ${b.name}`, { p_business: b.id })} />
            {num(b.leads) > 0 && num(b.ad_spend) > 0 && <span className="muted"> · {short(num(b.ad_spend) / num(b.leads))}/lead</span>}
          </b>
          <span>Closed</span>
          <b>
            <N n={num(b.closed)} onClick={() => void openLeads(`Closed · ${b.name}`, { p_business: b.id, p_step: 'closed' })} />
          </b>
        </div>
        {b.id && !solo && (
          <button type="button" className="link-btn small od-more" onClick={() => pickBiz(b.id)}>
            View details <ChevronRight size={13} />
          </button>
        )}
        {solo && (
          <button type="button" className="link-btn small od-more" onClick={() => pickBiz(null)}>
            All businesses <ChevronRight size={13} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="stack od">
      <PageHead title="Dashboard" subtitle={`Everything at a glance${selected ? ` · ${selected.name}` : ' · all businesses'}`} />
      <div className="adsd-head">
        {toggle ?? <span />}
        <DateRangePicker value={range} onChange={setRange} />
      </div>
      {error && <div className="alert alert-error small">{error}</div>}
      {!data ? (
        !error && <div className="muted small">Loading…</div>
      ) : (
        <>
          {/* 1. money */}
          <div className="adsd-kpis od-kpis">
            <Tile label="Revenue" value={short(revenue)} now={revenue} was={num(k!.revenue_prev)} good="up" tone={C.revenue} hint="collected" />
            <Tile label="Ad spend" value={short(spend)} now={spend} was={num(k!.ad_spend_prev)} good="down" tone={C.spend} hint="with GST" />
            <Tile
              label="Expenses"
              value={short(expenses)}
              now={expenses}
              was={num(k!.expenses_prev)}
              good="down"
              tone={C.expense}
              hint={k!.expense_rows ? undefined : 'none entered'}
              to={k!.expense_rows ? undefined : '/expenses'}
            />
            <Tile
              label="Profit"
              value={short(profit)}
              now={profit}
              was={profitPrev}
              good="up"
              tone={profit >= 0 ? C.profit : C.loss}
              hint={revenue ? `${pct(profit, revenue)}% margin` : undefined}
            />
            <Tile label="Leads" value={num(k!.leads).toLocaleString('en-IN')} now={num(k!.leads)} was={num(k!.leads_prev)} good="up" tone={C.leads} hint={num(k!.leads) ? `${short(spend / num(k!.leads))} / lead` : undefined} onClick={() => void openLeads('Leads', {})} />
            <Tile
              label="Money due"
              value={short(num(k!.due))}
              now={0}
              was={null}
              good="down"
              tone={num(k!.overdue) ? C.loss : '#64748b'}
              hint={num(k!.overdue) ? `${short(num(k!.overdue))} overdue` : 'nothing overdue'}
              to="/invoices"
            />
          </div>
          {!k!.expense_rows && (
            <div className="muted small">
              No expenses entered yet — profit is revenue minus ad spend. Add them in <Link to="/expenses">Expenses</Link>.
            </div>
          )}

          {/* 2. trend + businesses */}
          <div className="od-grid">
            <Card title="Revenue, ad spend and leads" icon={IndianRupee}>
              <DailyChart rows={data.daily} />
            </Card>
            <Card title="Needs attention" icon={AlertTriangle}>
              <div className="od-attn">
                <Attn n={data.attention.overdue_fu} label="Overdue follow-ups" tone="bad" onClick={() => void openRecords('Overdue follow-ups', 'overdue')} />
                <Attn n={data.attention.due_today} label="Follow-ups due today" onClick={() => void openRecords('Follow-ups due today', 'due_today')} />
                <Attn n={data.attention.first_call_pending} label="First call pending" tone="warn" onClick={() => void openRecords('First call pending', 'first_call_pending')} />
                <Attn
                  n={data.attention.no_follow_up}
                  label="Open leads with no follow-up date"
                  tone="warn"
                  onClick={() => void openRecords('No follow-up date', 'no_follow_up')}
                />
                <Attn
                  n={num(k!.overdue_parts)}
                  label={`Overdue payments${num(k!.overdue) ? ` · ${inr(num(k!.overdue))}` : ''}`}
                  tone="bad"
                  onClick={() => void openRecords('Overdue payments', 'overdue_payments')}
                />
              </div>
            </Card>
          </div>

          {/* live alerts: connections, quiet team / callers, leads waiting, ads with no leads, WhatsApp, Zoom */}
          {alerts && alerts.length > 0 && (
            <Card title={`Alerts · ${alerts.length}`} icon={Bell}>
              <div className="od-alert-grid">
                {alerts.map((al, i) => (
                  <Link key={i} to={al.to} className={`od-attn-row od-alert is-${al.level === 'bad' ? 'bad' : 'warn'}`}>
                    <CircleAlert size={16} />
                    <span>{al.text}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* one business picked: more about it */}
          {selected && (
            <BusinessFocus tenantId={tenant.id} businessId={selected.id} from={range.from} to={range.to} onLeads={openLeads}>
              {data.businesses
                .filter((b) => b.id === selected.id)
                .map((b) => (
                  <Card key="profit" title="Profit" icon={CalendarDays}>
                    {bizCard(b, true)}
                  </Card>
                ))}
            </BusinessFocus>
          )}

          {!selected && (
            <Card title="Profit by business" icon={CalendarDays}>
              <div className="od-biz">{data.businesses.map((b) => bizCard(b))}</div>
              <div className="muted small">Ad spend counts for the business of the funnel its campaign is linked to.</div>
            </Card>
          )}

          {/* 3. funnels + sources */}
          <div className="od-grid">
            <Card title="Funnels" icon={Users}>
              {data.funnels.length ? <FunnelBars rows={data.funnels} onOpen={(f, step, label) => void openLeads(`${label} · ${f.name}`, { p_funnel: f.id, p_step: step })} /> : <div className="muted small">No leads in these dates.</div>}
            </Card>
            <Card title="Leads by source" icon={Users}>
              <Share rows={data.sources.map((s) => ({ name: s.name, v: num(s.n) }))} onOpen={(name) => void openLeads(`Leads · ${name}`, { p_source: name })} />
            </Card>
          </div>

          {/* 4. campaigns */}
          <Card title="Top campaigns by spend" icon={IndianRupee}>
            {data.campaigns.length ? (
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th className="num">Spend</th>
                      <th className="num">Leads</th>
                      <th className="num">Per lead</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.campaigns.map((c) => {
                      const key = `${c.platform}${c.campaign_id}`
                      const open = openCamp === key
                      const list = ads[key]
                      return (
                        <Fragment key={key}>
                          <tr className="is-clickable" onClick={() => void toggleCamp(c)}>
                            <td>
                              <span className="od-camp">
                                <ChevronRight size={14} className={`od-chev${open ? ' is-open' : ''}`} />
                                <span className={`od-plat is-${c.platform}`}>{c.platform === 'meta' ? 'FB' : 'G'}</span>
                                <span>{c.name}</span>
                              </span>
                            </td>
                            <td className="num">{inr(num(c.spend))}</td>
                            <td className="num" onClick={(e) => e.stopPropagation()}>
                              <N n={num(c.leads)} onClick={() => void openLeads(`Leads · ${c.name}`, { p_campaign: c.name })} />
                            </td>
                            <td className="num">{num(c.leads) ? inr(num(c.spend) / num(c.leads)) : <span className="muted">—</span>}</td>
                          </tr>
                          {open &&
                            (list === 'loading' || !list ? (
                              <tr className="od-sub">
                                <td colSpan={4} className="muted small">
                                  Loading the ads…
                                </td>
                              </tr>
                            ) : !list.length ? (
                              <tr className="od-sub">
                                <td colSpan={4} className="muted small">
                                  No ad-level spend for this campaign.
                                </td>
                              </tr>
                            ) : (
                              list.map((a) => (
                                <tr key={`${key}-${a.name}-${a.adset}`} className="od-sub">
                                  <td>
                                    {a.name}
                                    {a.adset && <div className="muted small">{a.adset}</div>}
                                  </td>
                                  <td className="num">{inr(num(a.spend))}</td>
                                  <td className="num">
                                    <N n={num(a.leads)} onClick={() => void openLeads(`Leads · ${a.name}`, { p_ad: a.name })} />
                                  </td>
                                  <td className="num">{num(a.leads) ? inr(num(a.spend) / num(a.leads)) : <span className="muted">—</span>}</td>
                                </tr>
                              ))
                            ))}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted small">No ad spend in these dates.</div>
            )}
          </Card>

          {/* 5. team + callers */}
          <div className="od-grid od-grid-even">
            <Card title="Team" icon={Users} link={{ to: '/reports/team', label: 'Team Report' }}>
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th className="num">Follow-ups</th>
                      <th className="num">Overdue</th>
                      <th className="num">Meetings</th>
                      <th className="num">New leads</th>
                      <th className="num">Closed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.team.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <b>{m.name}</b>
                          {m.role && <span className="muted small"> · {m.role}</span>}
                        </td>
                        <td className="num">
                          <N n={num(m.fu_done)} onClick={() => void openRecords(`Follow-ups · ${m.name}`, 'fu_done', { p_member: m.id })} />
                        </td>
                        <td className={`num ${num(m.overdue) ? 'od-bad' : ''}`}>
                          <N n={num(m.overdue)} onClick={() => void openRecords(`Overdue · ${m.name}`, 'overdue', { p_member: m.id })} />
                        </td>
                        <td className="num">
                          <N n={num(m.meetings)} onClick={() => void openRecords(`Meetings · ${m.name}`, 'meetings', { p_member: m.id })} />
                        </td>
                        <td className="num">
                          <N n={num(m.leads)} onClick={() => void openRecords(`New leads · ${m.name}`, 'leads', { p_member: m.id })} />
                        </td>
                        <td className="num">
                          <N n={num(m.closed)} onClick={() => void openRecords(`Closed · ${m.name}`, 'closed', { p_member: m.id })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Calls (Callyzer)" icon={PhoneCall} link={{ to: '/callyzer/report', label: 'Callyzer report' }}>
              {data.callers.length ? (
                <div className="table-wrap">
                  <table className="table table-compact">
                    <thead>
                      <tr>
                        <th>Caller</th>
                        <th className="num">Calls</th>
                        <th className="num">Connected</th>
                        <th className="num">Talk time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(allCallers ? data.callers : data.callers.slice(0, TOP)).map((c) => (
                        <tr key={c.emp_number}>
                          <td>{c.name || c.emp_number}</td>
                          <td className="num">
                            <N n={num(c.calls)} onClick={() => void openRecords(`Calls · ${c.name || c.emp_number}`, 'calls', { p_emp: c.emp_number })} />
                          </td>
                          <td className="num">
                            <N n={num(c.connected)} onClick={() => void openRecords(`Connected · ${c.name || c.emp_number}`, 'connected', { p_emp: c.emp_number })} />{' '}
                            <span className="muted small">{pct(num(c.connected), num(c.calls))}%</span>
                          </td>
                          <td className="num">{hours(num(c.talk_sec))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {data.callers.length > TOP && (
                <button type="button" className="link-btn small od-more" onClick={() => setAllCallers((v) => !v)}>
                  {allCallers ? 'Show fewer' : `Show all ${data.callers.length} callers`}
                </button>
              )}
              {!data.callers.length && (
                <div className="muted small">No calls in these dates.</div>
              )}
            </Card>
          </div>

          {/* 6. what's next */}
          <div className="od-next">
            <Card title="Upcoming meetings" icon={Video} link={{ to: '/meetings', label: 'Meetings' }}>
              <NextList
                empty="No meetings coming up."
                rows={data.next.meetings.map((m) => ({
                  key: m.id,
                  when: `${dayLabel(m.meeting_date)}, ${clock(m.start_time)}`,
                  what: m.who,
                  extra: m.zoom ? 'Zoom' : '',
                  to: m.lead_id ? `/leads/${m.lead_id}` : undefined,
                }))}
              />
            </Card>
            <Card title="Studio bookings" icon={CalendarClock} link={{ to: '/bookings', label: 'Schedule' }}>
              <NextList
                empty="No bookings coming up."
                rows={data.next.bookings.map((b) => ({
                  key: b.id,
                  when: `${dayLabel(b.booking_date)}, ${clock(b.start_time)}`,
                  what: b.who || 'Booking',
                  extra: b.total_amount ? inr(num(b.total_amount)) : '',
                }))}
              />
            </Card>
            <Card title="Payments due (7 days)" icon={IndianRupee} link={{ to: '/invoices', label: 'Invoices' }}>
              <NextList
                empty="Nothing due this week."
                rows={data.next.dues.map((d) => ({
                  key: d.id,
                  when: dayLabel(d.due_on),
                  what: [d.who, d.invoice_no].filter(Boolean).join(' · ') || 'Invoice',
                  extra: inr(num(d.amount)),
                  bad: d.due_on < new Date().toISOString().slice(0, 10),
                }))}
              />
            </Card>
          </div>
        </>
      )}
      <StatRecords show={show} onClose={() => setShow(null)} rowKey={(r) => r.id} onRow={(r) => navigate(`/leads/${r.id}`)} />
      <StatRecords show={recs} onClose={() => setRecs(null)} rowKey={(r) => r.key} onRow={(r) => r.lead_id && navigate(`/leads/${r.lead_id}`)} />
    </div>
  )
}

const when = (s: string) => new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const LEAD_COLS: StatShow<LeadItem>['cols'] = [
  {
    label: 'Lead',
    render: (r) => (
      <>
        <b>{r.name ?? 'Lead'}</b>
        {r.phone && <div className="muted small">{r.phone}</div>}
      </>
    ),
  },
  { label: 'Funnel', render: (r) => r.funnel ?? <span className="muted">—</span> },
  { label: 'Source', render: (r) => r.source ?? <span className="muted">—</span> },
  { label: 'Stage', render: (r) => r.stage ?? <span className="muted">—</span> },
  { label: 'Category', render: (r) => tempOf(r.temperature as Temperature)?.label ?? <span className="muted">—</span> },
  { label: 'Owner', render: (r) => r.owner ?? <span className="muted">—</span> },
  { label: 'Came in', render: (r) => <span className="nowrap">{when(r.created_at)}</span> },
]

/** a row behind a Team / Calls / Needs attention number (owner_dash_records) */
type Rec = { key: string; lead_id: string | null; name: string | null; phone: string | null; at: string | null; what: string | null; note: string | null; extra: string | null }
const recCols = (kind: string): StatShow<Rec>['cols'] => [
  {
    label: kind === 'calls' || kind === 'connected' ? 'Number' : kind === 'overdue_payments' ? 'Client' : 'Lead',
    render: (r) => (
      <>
        <b>{r.name ?? r.phone ?? '—'}</b>
        {r.name && r.phone && <div className="muted small">{r.phone}</div>}
      </>
    ),
  },
  {
    label:
      kind === 'fu_done' ? 'Outcome' : kind === 'calls' || kind === 'connected' ? 'Call' : kind === 'overdue_payments' ? 'Invoice' : kind === 'meetings' ? 'Meeting' : 'Stage',
    render: (r) => r.what ?? <span className="muted">—</span>,
  },
  ...(kind === 'fu_done' || kind === 'meetings'
    ? [{ label: 'Comments', render: (r: Rec) => (r.note ? <span className="cell-clip">{r.note}</span> : <span className="muted">—</span>) }]
    : kind === 'calls' || kind === 'connected'
      ? [{ label: 'Talk time', render: (r: Rec) => r.note ?? '' }]
      : kind === 'overdue_payments'
        ? [{ label: 'Amount', num: true, render: (r: Rec) => r.note ?? '' }]
        : kind === 'leads' || kind === 'closed'
          ? [{ label: 'Category', render: (r: Rec) => tempOf(r.extra as Temperature)?.label ?? <span className="muted">—</span> }]
          : [{ label: kind === 'overdue' || kind === 'due_today' ? 'Assigned to' : 'Owner', render: (r: Rec) => r.extra ?? <span className="muted">—</span> }]),
  {
    label: kind === 'fu_done' ? 'Logged' : kind === 'overdue' || kind === 'due_today' || kind === 'overdue_payments' ? 'Due' : kind === 'meetings' ? 'When' : kind === 'calls' || kind === 'connected' ? 'When' : 'Came in',
    render: (r) => (r.at ? <span className="nowrap">{when(r.at)}</span> : ''),
  },
]

// ---------- pieces ----------
/** a number that opens its records (0: nothing to open) */
function N({ n, onClick }: { n: number; onClick: () => void }) {
  if (!n) return <span className="muted">0</span>
  return (
    <button type="button" className="adsd-n" onClick={onClick} title="See the leads">
      {n.toLocaleString('en-IN')}
    </button>
  )
}

function Tile({
  label,
  value,
  now,
  was,
  good,
  hint,
  tone,
  to,
  onClick,
}: {
  label: string
  value: string
  now: number
  was: number | null
  good: 'up' | 'down'
  hint?: string
  tone: string
  to?: string
  onClick?: () => void
}) {
  const ch = was != null && was !== 0 ? ((now - was) / Math.abs(was)) * 100 : null
  const better = ch == null ? null : good === 'up' ? ch > 0 : ch < 0
  const body = (
    <>
      <span className="adsd-kpi-label">{label}</span>
      <span className="adsd-kpi-value">{value}</span>
      <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {ch != null && Math.abs(ch) >= 0.5 ? (
          <span className={`adsd-delta ${better ? 'is-good' : 'is-bad'}`} title="vs the previous period of the same length">
            {ch > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            {Math.abs(ch) > 999 ? '999+' : Math.abs(ch).toFixed(0)}%
          </span>
        ) : null}
        {hint && <span className="muted small">{hint}</span>}
      </span>
    </>
  )
  return onClick ? (
    <button type="button" className="adsd-kpi od-tile-link od-tile-btn" style={{ ['--tone' as string]: tone }} onClick={onClick}>
      {body}
    </button>
  ) : to ? (
    <Link to={to} className="adsd-kpi od-tile-link" style={{ ['--tone' as string]: tone }}>
      {body}
    </Link>
  ) : (
    <div className="adsd-kpi" style={{ ['--tone' as string]: tone }}>
      {body}
    </div>
  )
}

function Card({ title, icon: Icon, link, children }: { title: string; icon: typeof Users; link?: { to: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="od-card">
      <div className="row-between">
        <h3 className="od-card-title">
          <Icon size={16} /> {title}
        </h3>
        {link && (
          <Link to={link.to} className="small">
            {link.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function Attn({ n, label, tone, onClick }: { n: number; label: string; tone?: 'bad' | 'warn'; onClick: () => void }) {
  return (
    <button type="button" className={`od-attn-row ${n && tone ? `is-${tone}` : ''}`} onClick={onClick} disabled={!n}>
      <b>{n.toLocaleString('en-IN')}</b>
      <span>{label}</span>
    </button>
  )
}

function NextList({ rows, empty }: { rows: { key: string; when: string; what: string; extra?: string; to?: string; bad?: boolean }[]; empty: string }) {
  if (!rows.length) return <div className="muted small">{empty}</div>
  return (
    <ul className="od-next-list">
      {rows.map((r) => (
        <li key={r.key} className={r.bad ? 'is-bad' : undefined}>
          <span className="od-when">{r.when}</span>
          {r.to ? <Link to={r.to}>{r.what}</Link> : <span>{r.what}</span>}
          {r.extra && <span className="muted small">{r.extra}</span>}
        </li>
      ))}
    </ul>
  )
}

/** a tiny weekly revenue line */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2 || !values.some((v) => v)) return null
  const W = 70
  const H = 22
  const max = Math.max(...values, 1)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * W},${H - 2 - (v / max) * (H - 4)}`).join(' ')
  return (
    <svg width={W} height={H} aria-hidden>
      <path d={d} fill="none" stroke={C.revenue} strokeWidth={2} />
    </svg>
  )
}

/** daily revenue (green) and ad spend (indigo) bars, leads (blue line) */
function DailyChart({ rows }: { rows: Day[] }) {
  const [ref, W] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  // the legend turns each series on / off (the scale follows what is shown)
  const [show, setShow] = useState({ revenue: true, spend: true, leads: true })
  const flip = (k: keyof typeof show) => setShow((v) => ({ ...v, [k]: !v[k] }))
  const H = 240
  const P = { l: 50, r: 34, t: 12, b: 26 }
  const n = rows.length
  const maxM = Math.max(1, ...rows.map((r) => Math.max(show.revenue ? num(r.revenue) : 0, show.spend ? num(r.spend) : 0)))
  const maxL = Math.max(4, ...rows.map((r) => num(r.leads)))
  const bw = (W - P.l - P.r) / Math.max(1, n)
  const x = (i: number) => P.l + bw * i + bw / 2
  const yM = (v: number) => P.t + (H - P.t - P.b) * (1 - v / maxM)
  const yL = (v: number) => P.t + (H - P.t - P.b) * (1 - v / maxL)
  const every = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(W / 70))))
  const bar = Math.max(2, Math.min(12, bw * 0.36))
  const h = hover != null ? rows[hover] : null
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="adsd-legend od-legend">
        <button type="button" className={show.revenue ? undefined : 'is-off'} aria-pressed={show.revenue} onClick={() => flip('revenue')}>
          <i style={{ background: C.revenue }} /> Revenue
        </button>
        <button type="button" className={show.spend ? undefined : 'is-off'} aria-pressed={show.spend} onClick={() => flip('spend')}>
          <i style={{ background: C.spend }} /> Ad spend
        </button>
        <button type="button" className={show.leads ? undefined : 'is-off'} aria-pressed={show.leads} onClick={() => flip('leads')}>
          <i className="is-line" style={{ background: C.leads }} /> Leads
        </button>
      </div>
      <div ref={ref} style={{ position: 'relative' }}>
        <svg width={W} height={H} style={{ display: 'block' }} onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={P.l} x2={W - P.r} y1={yM(f * maxM)} y2={yM(f * maxM)} stroke="var(--line)" />
              {(show.revenue || show.spend) && (
                <text x={P.l - 6} y={yM(f * maxM) + 4} textAnchor="end" fontSize={10.5} fill="var(--text-muted)">
                  {short(f * maxM)}
                </text>
              )}
              {show.leads && (
                <text x={W - P.r + 6} y={yL(f * maxL) + 4} fontSize={10.5} fill={C.leads}>
                  {Math.round(f * maxL)}
                </text>
              )}
            </g>
          ))}
          {rows.map((r, i) => (
            <g key={r.day} opacity={hover == null || hover === i ? 1 : 0.4}>
              {show.revenue && (
                <rect x={show.spend ? x(i) - bar - 1 : x(i) - bar / 2} y={yM(num(r.revenue))} width={bar} height={Math.max(0, H - P.b - yM(num(r.revenue)))} rx={2} fill={C.revenue} />
              )}
              {show.spend && (
                <rect x={show.revenue ? x(i) + 1 : x(i) - bar / 2} y={yM(num(r.spend))} width={bar} height={Math.max(0, H - P.b - yM(num(r.spend)))} rx={2} fill={C.spend} />
              )}
            </g>
          ))}
          {show.leads && <path d={rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${yL(num(r.leads))}`).join(' ')} fill="none" stroke={C.leads} strokeWidth={2} />}
          {rows.map((r, i) =>
            i % every === 0 || i === n - 1 ? (
              <text key={r.day} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10.5} fill="var(--text-muted)">
                {dayLabel(r.day)}
              </text>
            ) : null,
          )}
          {rows.map((r, i) => (
            <rect key={`h${r.day}`} x={P.l + bw * i} y={P.t} width={bw} height={H - P.t - P.b} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {h && (
          <div className="adsd-tip" style={{ left: Math.min(W - 200, Math.max(0, x(hover!) - 100)), top: 4 }}>
            <b>{dayLabel(h.day)}</b>
            <span>Revenue {inr(num(h.revenue))}</span>
            <span>Ad spend {inr(num(h.spend))}</span>
            <span>
              Leads {num(h.leads)}
              {num(h.leads) ? ` · ${inr(num(h.spend) / num(h.leads))}/lead` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/** each funnel: leads → contacted → meeting → closed (and not interested), as bars of the funnel's leads */
function FunnelBars({ rows, onOpen }: { rows: Fun[]; onOpen: (f: Fun, step: string, label: string) => void }) {
  const steps: { key: 'leads' | 'contacted' | 'met' | 'closed' | 'lost'; label: string; color: string }[] = [
    { key: 'leads', label: 'Leads', color: '#94a3b8' },
    { key: 'contacted', label: 'Contacted', color: '#0ea5e9' },
    { key: 'met', label: 'Meeting', color: '#6366f1' },
    { key: 'closed', label: 'Closed', color: '#16a34a' },
    { key: 'lost', label: 'Not interested', color: '#dc2626' },
  ]
  return (
    <div className="stack" style={{ gap: 14 }}>
      {rows.map((f) => (
        <div key={f.id} className="od-fun">
          <div className="row-between">
            <span className="row" style={{ gap: 8, alignItems: 'baseline' }}>
              <b>{f.name}</b>
              <span className="muted small">{f.business}</span>
            </span>
            <Link to={`/funnels/${f.id}`} className="small od-link">
              View details <ChevronRight size={13} />
            </Link>
          </div>
          {steps.map((s) => {
            const v = num(f[s.key])
            return (
              <div key={s.key} className="od-fun-row">
                <span className="small">{s.label}</span>
                <span className="od-bar">
                  <i style={{ width: `${pct(v, num(f.leads))}%`, background: s.color }} />
                </span>
                <span className="small num">
                  <N n={v} onClick={() => onOpen(f, s.key === 'leads' ? '' : s.key, s.label)} />{' '}
                  {s.key !== 'leads' && <span className="muted">{pct(v, num(f.leads))}%</span>}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** share of a total, as bars */
function Share({ rows, onOpen }: { rows: { name: string; v: number }[]; onOpen?: (name: string) => void }) {
  const total = rows.reduce((s, r) => s + r.v, 0)
  if (!total) return <div className="muted small">No leads in these dates.</div>
  const colors = ['#6366f1', '#0ea5e9', '#16a34a', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#64748b']
  return (
    <div className="stack" style={{ gap: 8 }}>
      {rows.slice(0, 8).map((r, i) => (
        <div key={r.name} className="od-fun-row">
          <span className="small">{r.name}</span>
          <span className="od-bar">
            <i style={{ width: `${pct(r.v, total)}%`, background: colors[i % colors.length] }} />
          </span>
          <span className="small num">
            {onOpen ? <N n={r.v} onClick={() => onOpen(r.name)} /> : r.v} <span className="muted">{pct(r.v, total)}%</span>
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------- one business ----------
type Focus = {
  categories: Partial<Record<Temperature, number>>
  first_touch: { median_min: number | null; within_1h: number; touched: number; leads: number }
  outcomes: { name: string; n: number }[]
  invoices: { count: number; total: number; paid: number; top: { name: string; total: number; paid: number }[] }
  meetings: { booked: number; done: number; no_show: number; cancelled: number; upcoming: number }
  bookings: { count: number; cancelled: number; hours: number; value: number }
  orders: Record<string, number>
}
const TEMP_COLOR: Record<Temperature, string> = { new: '#6366f1', hot: '#dc2626', warm: '#f59e0b', cold: '#0ea5e9', not_interested: '#94a3b8', closed: '#16a34a' }
const ORDER_LABEL: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', review: 'In review', delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled' }
const ago = (min: number | null) => (min == null ? '—' : min < 60 ? `${min} min` : min < 60 * 48 ? `${(min / 60).toFixed(1)} h` : `${(min / 1440).toFixed(1)} days`)

/** the picked business: lead quality, speed to the first call, call outcomes, meetings, billing, bookings / orders */
function BusinessFocus({
  tenantId,
  businessId,
  from,
  to,
  onLeads,
  children,
}: {
  tenantId: string
  businessId: string
  from: string
  to: string
  onLeads: (title: string, q: LeadQuery) => Promise<void>
  children?: React.ReactNode
}) {
  const [f, setF] = useState<Focus | null>(null)
  useEffect(() => {
    setF(null)
    db()
      .rpc('owner_business_focus', { p_tenant: tenantId, p_business: businessId, p_from: from, p_to: to })
      .then(({ data }) => setF((data ?? null) as Focus | null))
  }, [tenantId, businessId, from, to])
  if (!f) return null
  const cats = TEMPERATURES.map((t) => ({ ...t, n: num(f.categories[t.value]) }))
  const totalLeads = cats.reduce((a, c) => a + c.n, 0)
  const m = f.meetings
  const showUp = m.done + m.no_show ? pct(m.done, m.done + m.no_show) : null
  const ft = f.first_touch
  const orders = Object.entries(f.orders ?? {})
  return (
    <div className="od-focus">
      {children}
      <Card title="Lead quality" icon={Users}>
        {totalLeads ? (
          <>
            <div className="od-stack-bar">
              {cats
                .filter((c) => c.n)
                .map((c) => (
                  <i key={c.value} style={{ width: `${pct(c.n, totalLeads)}%`, background: TEMP_COLOR[c.value] }} title={`${c.label} ${c.n}`} />
                ))}
            </div>
            <div className="od-chips">
              {cats
                .filter((c) => c.n)
                .map((c) => (
                  <span key={c.value} className="od-chip">
                    <i style={{ background: TEMP_COLOR[c.value] }} /> {c.label}{' '}
                    <N n={c.n} onClick={() => void onLeads(`${c.label} leads`, { p_business: businessId, p_step: `temp:${c.value}` })} />
                    <span className="muted">{pct(c.n, totalLeads)}%</span>
                  </span>
                ))}
            </div>
          </>
        ) : (
          <div className="muted small">No leads in these dates.</div>
        )}
        <div className="od-mini">
          <div>
            <b>{ago(ft.median_min)}</b>
            <span>typical time to the first call</span>
          </div>
          <div>
            <b>{ft.leads ? `${pct(ft.within_1h, ft.leads)}%` : '—'}</b>
            <span>called within 1 hour</span>
          </div>
          <div>
            <b>{ft.leads ? `${pct(ft.touched, ft.leads)}%` : '—'}</b>
            <span>contacted at all</span>
          </div>
        </div>
      </Card>

      <Card title="Call outcomes" icon={PhoneCall}>
        <Share rows={f.outcomes.map((o) => ({ name: o.name, v: num(o.n) }))} />
      </Card>

      <Card title="Meetings" icon={Video}>
        <div className="od-mini">
          <div>
            <b>{m.booked}</b>
            <span>booked</span>
          </div>
          <div>
            <b>{m.done}</b>
            <span>held</span>
          </div>
          <div>
            <b className={m.no_show ? 'od-bad' : undefined}>{m.no_show}</b>
            <span>no-show</span>
          </div>
          <div>
            <b>{showUp == null ? '—' : `${showUp}%`}</b>
            <span>show-up rate</span>
          </div>
          {m.upcoming > 0 && (
            <div>
              <b>{m.upcoming}</b>
              <span>still to come</span>
            </div>
          )}
          {m.cancelled > 0 && (
            <div>
              <b>{m.cancelled}</b>
              <span>cancelled</span>
            </div>
          )}
        </div>
      </Card>

      <Card title="Billing" icon={IndianRupee}>
        <div className="od-mini">
          <div>
            <b>{f.invoices.count}</b>
            <span>invoices</span>
          </div>
          <div>
            <b>{short(num(f.invoices.total))}</b>
            <span>billed</span>
          </div>
          <div>
            <b>{short(num(f.invoices.paid))}</b>
            <span>collected</span>
          </div>
          <div>
            <b className={num(f.invoices.total) - num(f.invoices.paid) > 0 ? 'od-bad' : undefined}>{short(num(f.invoices.total) - num(f.invoices.paid))}</b>
            <span>pending</span>
          </div>
          <div>
            <b>{f.invoices.count ? short(num(f.invoices.total) / f.invoices.count) : '—'}</b>
            <span>average invoice</span>
          </div>
        </div>
        {f.invoices.top.length > 0 && (
          <ul className="od-next-list">
            {f.invoices.top.map((t) => (
              <li key={t.name}>
                <span>{t.name}</span>
                <span className="muted small">{num(t.paid) < num(t.total) ? `${short(num(t.paid))} paid` : 'paid'}</span>
                <b>{inr(num(t.total))}</b>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(f.bookings.count > 0 || f.bookings.cancelled > 0) && (
        <Card title="Studio bookings" icon={CalendarClock}>
          <div className="od-mini">
            <div>
              <b>{f.bookings.count}</b>
              <span>bookings</span>
            </div>
            <div>
              <b>{num(f.bookings.hours)} h</b>
              <span>hours booked</span>
            </div>
            <div>
              <b>{short(num(f.bookings.value))}</b>
              <span>booked value</span>
            </div>
            <div>
              <b>{f.bookings.count ? short(num(f.bookings.value) / f.bookings.count) : '—'}</b>
              <span>per booking</span>
            </div>
            {f.bookings.cancelled > 0 && (
              <div>
                <b>{f.bookings.cancelled}</b>
                <span>cancelled</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {orders.length > 0 && (
        <Card title="Orders" icon={CalendarDays}>
          <div className="od-mini">
            {orders.map(([k, n]) => (
              <div key={k}>
                <b>{n}</b>
                <span>{ORDER_LABEL[k] ?? k}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
