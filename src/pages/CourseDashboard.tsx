import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { RefreshCw } from 'lucide-react'
import { ALL_DATES, DateRangePicker, type Range } from '@/components/DateRange'
import { PageHead } from '@/components/ui'
import { useBusiness } from '@/business/useBusiness'
import { money } from '@/leads/labels'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'
import { useTerm } from '@/tenant/useTerm'

/** Course businesses (opt-in per workspace): sales, collections, net profit, comparisons, course and team performance. Rough first version. */
type Month = { m: string; collected: number; sold: number; leads: number; converted: number; expenses: number }
type Data = {
  leads: number
  converted: number
  sold: number
  enrollments: number
  collected: number
  pending_all: number
  refunded: number
  expenses: number
  months: Month[]
  courses: { name: string; enrollments: number; sold: number; collected: number }[]
  team: { name: string; leads: number; converted: number; collected: number; outstanding: number }[]
}

const short = (n: number) => {
  const a = Math.abs(n)
  const s = a >= 1e7 ? `₹${(a / 1e7).toFixed(2)}Cr` : a >= 1e5 ? `₹${(a / 1e5).toFixed(2)}L` : money(a)
  return n < 0 ? `−${s}` : s
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)
const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })

export function CourseDashboard() {
  const tenant = useTenant()
  const term = useTerm()
  const { selected } = useBusiness()
  const [range, setRange] = useState<Range>(ALL_DATES)
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setD(null)
    setError(null)
    db()
      .rpc('course_dashboard', { p_tenant: tenant.id, p_business: selected?.id ?? null, p_from: range.from || null, p_to: range.to || null })
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        else setD(data as Data)
      })
  }, [tenant.id, selected?.id, range.from, range.to, tick])

  const months = d?.months ?? []
  const cur = months.at(-1)
  const prev = months.at(-2)
  // this year vs last year: Jan … this month, against the same months a year earlier
  const nowM = new Date().getMonth() + 1
  const ytd = (back: number) => {
    const y = String(new Date().getFullYear() - back)
    const ms = months.filter((m) => m.m.startsWith(y) && Number(m.m.slice(5)) <= nowM)
    return { collected: sum(ms, 'collected'), sold: sum(ms, 'sold'), leads: sum(ms, 'leads'), converted: sum(ms, 'converted') }
  }
  const thisYear = ytd(0)
  const lastYear = ytd(1)
  const net = d ? d.collected - d.expenses - d.refunded : 0
  const last12 = months.slice(-12)
  const maxBar = Math.max(1, ...last12.map((m) => m.collected))
  const courseTotal = (d?.courses ?? []).reduce((t, c) => t + Number(c.enrollments), 0)

  return (
    <>
      <PageHead
        title="Overview"
        subtitle={`${selected ? selected.name : 'All businesses'}: leads, ${term('course')} sales, money collected and what is still due.`}
        actions={
          <div className="row">
            <DateRangePicker value={range} onChange={setRange} allDates />
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setTick((t) => t + 1)} title="Refresh" aria-label="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        }
      />
      {error && <div className="alert alert-error">{error}</div>}
      {!d ? (
        <div className="card empty">Loading…</div>
      ) : (
        <>
          <div className="db-cards">
            <Link to="/leads" className="db-card">
              <b>{d.leads.toLocaleString('en-IN')}</b>
              <span>Leads</span>
              <small>{range.key === 'all' ? 'All time' : 'In this period'}</small>
            </Link>
            <Link to="/enrolled-courses" className="db-card">
              <b>{d.converted.toLocaleString('en-IN')}</b>
              <span>Converted</span>
              <small>
                {pct(d.converted, d.leads)}% of leads · {d.enrollments.toLocaleString('en-IN')} enrollments
              </small>
            </Link>
            <Link to="/enrolled-courses" className="db-card">
              <b>{short(d.sold)}</b>
              <span>Sold</span>
              <small>Value of {term('courses')} bought, with GST</small>
            </Link>
            <Link to="/enrolled-courses" className="db-card">
              <b className="tone-success">{short(d.collected)}</b>
              <span>Collected</span>
              <small>Money actually received</small>
            </Link>
            <Link to="/enrolled-courses" className="db-card">
              <b className="text-danger">{short(d.pending_all)}</b>
              <span>Pending</span>
              <small>All-time balance still due</small>
            </Link>
            <Link to="/expenses" className="db-card">
              <b>{short(d.expenses)}</b>
              <span>Expenses</span>
              <small>In this period</small>
            </Link>
            <div className="db-card">
              <b className={net >= 0 ? 'tone-success' : 'text-danger'}>{short(net)}</b>
              <span>Net profit</span>
              <small>Collected − expenses − refunds</small>
            </div>
            <Link to="/enrolled-courses" className="db-card">
              <b>{short(d.refunded)}</b>
              <span>Refunded</span>
              <small>In this period</small>
            </Link>
          </div>

          <div className="cd-grid">
            <section className="card card-pad db-section">
              <div className="db-head">
                <h3>
                  This month vs last month{' '}
                  <span className="muted small">
                    · {cur ? monthName(cur.m) : ''} (to date) against {prev ? monthName(prev.m) : ''}
                  </span>
                </h3>
              </div>
              {cur && prev && (
                <div className="cd-compare">
                  <Compare label="Collected" a={cur.collected} b={prev.collected} money />
                  <Compare label="Sold" a={cur.sold} b={prev.sold} money />
                  <Compare label="New leads" a={cur.leads} b={prev.leads} />
                  <Compare label="Conversions" a={cur.converted} b={prev.converted} />
                </div>
              )}
            </section>
            <section className="card card-pad db-section">
              <div className="db-head">
                <h3>
                  This year vs last year <span className="muted small">· Jan to this month, against the same months last year</span>
                </h3>
              </div>
              <div className="cd-compare">
                <Compare label="Collected" a={thisYear.collected} b={lastYear.collected} money />
                <Compare label="Sold" a={thisYear.sold} b={lastYear.sold} money />
                <Compare label="New leads" a={thisYear.leads} b={lastYear.leads} />
                <Compare label="Conversions" a={thisYear.converted} b={lastYear.converted} />
              </div>
            </section>
          </div>

          <section className="card card-pad db-section">
            <div className="db-head">
              <h3>
                Collected by month <span className="muted small">· last 12 months</span>
              </h3>
            </div>
            <div className="cd-bars">
              {last12.map((m) => (
                <div key={m.m} className="cd-bar" title={`${monthName(m.m)}: ${money(m.collected)} collected · ${money(m.sold)} sold`}>
                  <span className="cd-bar-val">{m.collected ? short(m.collected) : ''}</span>
                  <i style={{ height: `${Math.max(2, (m.collected / maxBar) * 100)}%` }} />
                  <small>{monthName(m.m).split(' ')[0]}</small>
                </div>
              ))}
            </div>
          </section>

          <div className="cd-grid">
            <section className="card db-section">
              <div className="db-head card-pad">
                <h3>
                  {term('Course')} performance <span className="muted small">· in this period, in ladder order</span>
                </h3>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{term('Course')}</th>
                      <th className="num">Enrollments</th>
                      <th className="num">Share</th>
                      <th className="num">Sold</th>
                      <th className="num">Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.courses.map((c) => (
                      <tr key={c.name}>
                        <td>
                          <b>{c.name}</b>
                        </td>
                        <td className="num">{Number(c.enrollments).toLocaleString('en-IN')}</td>
                        <td className="num">{pct(Number(c.enrollments), courseTotal)}%</td>
                        <td className="num nowrap">{short(Number(c.sold))}</td>
                        <td className="num nowrap">{short(Number(c.collected))}</td>
                      </tr>
                    ))}
                    {!d.courses.length && (
                      <tr>
                        <td colSpan={5} className="muted">
                          No {term('courses')} bought in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="card db-section">
              <div className="db-head card-pad">
                <h3>
                  Team performance <span className="muted small">· leads and conversions in this period; outstanding is all-time</span>
                </h3>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th className="num">Leads</th>
                      <th className="num">Converted</th>
                      <th className="num">Rate</th>
                      <th className="num">Collected</th>
                      <th className="num">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.team.map((t) => (
                      <tr key={t.name}>
                        <td>
                          <b className={cn(t.name === 'Unassigned' && 'muted')}>{t.name}</b>
                        </td>
                        <td className="num">{Number(t.leads).toLocaleString('en-IN')}</td>
                        <td className="num">{Number(t.converted).toLocaleString('en-IN')}</td>
                        <td className="num">{pct(Number(t.converted), Number(t.leads))}%</td>
                        <td className="num nowrap">{short(Number(t.collected))}</td>
                        <td className="num nowrap">{Number(t.outstanding) > 0 ? <span className="text-danger">{short(Number(t.outstanding))}</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  )
}

const sum = (ms: Month[], k: keyof Omit<Month, 'm'>) => ms.reduce((t, m) => t + Number(m[k]), 0)

function Compare({ label, a, b, money: isMoney }: { label: string; a: number; b: number; money?: boolean }) {
  const max = Math.max(1, a, b)
  const change = b ? Math.round(((a - b) / b) * 1000) / 10 : null
  const fmt = (n: number) => (isMoney ? short(n) : n.toLocaleString('en-IN'))
  return (
    <div className="cd-cmp">
      <div className="cd-cmp-head">
        <b>{label}</b>
        {change !== null && <span className={cn('badge', change >= 0 ? 'badge-success' : 'badge-danger')}>{`${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}%`}</span>}
      </div>
      <div className="cd-cmp-row">
        <span>Now</span>
        <div className="cd-track">
          <i style={{ width: `${(a / max) * 100}%` }} />
        </div>
        <b>{fmt(a)}</b>
      </div>
      <div className="cd-cmp-row is-prev">
        <span>Before</span>
        <div className="cd-track">
          <i style={{ width: `${(b / max) * 100}%` }} />
        </div>
        <b>{fmt(b)}</b>
      </div>
    </div>
  )
}
