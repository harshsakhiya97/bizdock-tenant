import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { BadgeIndianRupee, GraduationCap, RefreshCw, Undo2, Users, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { ALL_DATES, DateRangePicker, type Range } from '@/components/DateRange'
import { SearchSelect } from '@/components/SearchSelect'
import { Empty, PageHead, Paged, SearchInput, StatCard } from '@/components/ui'
import { money } from '@/leads/labels'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'
import { rpcAll } from '@/lib/fetchAll'
import { useTenant } from '@/tenant/useTenant'
import { useTerm } from '@/tenant/useTerm'
import type { Purchase } from '@/webinars/api'

/** Enrolled Courses: every course purchase (entered on the lead → Purchases), with what is paid and still due. */
type Row = Purchase & { leads: { first_name: string; last_name: string | null; phone: string | null; email: string | null } | null }

type Pay = 'paid' | 'part' | 'unpaid' | 'refunded' | 'cancelled'
const PAY: Record<Pay, { label: string; cls: string }> = {
  paid: { label: 'Fully paid', cls: 'badge-success' },
  part: { label: 'Part paid', cls: 'badge-warning' },
  unpaid: { label: 'Unpaid', cls: 'badge-muted' },
  refunded: { label: 'Refunded', cls: 'badge-info' },
  cancelled: { label: 'Cancelled', cls: 'badge-danger' },
}
const payState = (r: Row): Pay =>
  r.status === 'cancelled' ? 'cancelled' : Number(r.refund_amount) > 0 ? 'refunded' : Number(r.total_amount) - Number(r.paid_amount) <= 0.01 ? 'paid' : Number(r.paid_amount) > 0 ? 'part' : 'unpaid'
const due = (r: Row) => (r.status === 'cancelled' || Number(r.refund_amount) > 0 ? 0 : Math.max(0, Number(r.total_amount) - Number(r.paid_amount)))
const fmtDay = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const person = (r: Row) => (r.leads ? [r.leads.first_name, r.leads.last_name].filter(Boolean).join(' ') : '—')
/** how old an unpaid balance is, counted from the purchase date */
const AGES = [
  { value: '0-30', label: 'Under 30 days', min: 0, max: 30 },
  { value: '30-60', label: '30–60 days', min: 30, max: 60 },
  { value: '60-90', label: '60–90 days', min: 60, max: 90 },
  { value: '90-180', label: '90–180 days', min: 90, max: 180 },
  { value: '180+', label: 'Over 180 days', min: 180, max: Infinity },
]
const ageDays = (r: Row) => Math.floor((Date.now() - new Date(`${r.purchase_date}T00:00:00`).getTime()) / 86400000)
const inAge = (r: Row, k: string) => {
  const a = AGES.find((x) => x.value === k)
  return !!a && due(r) > 0 && ageDays(r) >= a.min && ageDays(r) < a.max
}
/** the next part still to be paid */
const nextPart = (r: Row) =>
  [...(r.purchase_payments ?? [])].filter((p) => p.status !== 'paid').sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'))[0] ?? null

export function EnrolledCoursesPage() {
  const tenant = useTenant()
  const term = useTerm()
  const navigate = useNavigate()
  const { businesses } = useAuth()
  const { inScope } = useBusiness()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [course, setCourse] = useState<string | null>(null)
  const [pay, setPay] = useState<string | null>(null)
  const [age, setAge] = useState<string | null>(null)
  const [range, setRange] = useState<Range>(ALL_DATES)

  const load = useCallback(() => {
    setRows(null)
    setError(null)
    rpcAll<Row>((offset, limit) => db().rpc('list_purchases', { p_tenant: tenant.id, p_offset: offset, p_limit: limit }))
      .then(setRows)
      .catch((e: Error) => {
        setError(e.message)
        setRows([])
      })
  }, [tenant.id])
  useEffect(load, [load])

  const bizName = useMemo(() => new Map(businesses.map((b) => [b.id, b.name])), [businesses])
  // the business picked in the top bar (and only businesses this person can see)
  const mine = useMemo(() => (rows ?? []).filter((r) => bizName.has(r.business_id) && inScope(r.business_id)), [rows, bizName, inScope])
  const courses = useMemo(() => [...new Set(mine.map((r) => r.name))].sort((a, b) => a.localeCompare(b)), [mine])
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return mine.filter(
      (r) =>
        (!course || r.name === course) &&
        (!pay || payState(r) === pay) &&
        (!age || inAge(r, age)) &&
        (!range.from || r.purchase_date >= range.from) &&
        (!range.to || r.purchase_date <= range.to) &&
        (!s || `${person(r)} ${r.leads?.phone ?? ''} ${r.leads?.email ?? ''} ${r.name}`.toLowerCase().includes(s)),
    )
  }, [mine, q, course, pay, age, range])

  // the cards follow the filters (cancelled ones aren't counted)
  const live = shown.filter((r) => r.status !== 'cancelled')
  const billed = live.reduce((t, r) => t + Number(r.total_amount), 0)
  const received = live.reduce((t, r) => t + Number(r.paid_amount), 0)
  const pending = live.reduce((t, r) => t + due(r), 0)
  const people = new Set(live.map((r) => r.lead_id)).size
  const refunded = shown.reduce((t, r) => t + Number(r.refund_amount || 0), 0)

  return (
    <>
      <PageHead title="Enrolled Courses" subtitle={`Every ${term('course')} bought, with what is paid and still due. Add one on the lead → Purchases.`} />
      {error && <div className="alert alert-error">{error}</div>}
      <div className="stat-grid">
        <StatCard icon={GraduationCap} tone="info" value={live.length} label="Enrollments" hint={`${people} ${people === 1 ? 'person' : 'people'}`} />
        <StatCard icon={BadgeIndianRupee} tone="ink" value={money(billed)} label="Billed" hint="Price with GST" />
        <StatCard icon={Wallet} tone="success" value={money(received)} label="Received" />
        <StatCard icon={Users} tone="warning" value={money(pending)} label="Due" hint={`${live.filter((r) => due(r) > 0).length} with an amount due`} />
        <StatCard icon={Undo2} tone="danger" value={money(refunded)} label="Refunded" hint={`${shown.filter((r) => Number(r.refund_amount) > 0).length} refunds`} onClick={() => setPay('refunded')} />
      </div>
      <section className="panel">
        <div className="panel-filters">
          <SearchInput placeholder={`Name, phone, email or ${term('course')}`} value={q} onChange={setQ} width={260} />
          <div style={{ width: 220 }}>
            <SearchSelect value={course} onChange={setCourse} placeholder={`All ${term('courses')}`} options={courses.map((c) => ({ value: c, label: c }))} />
          </div>
          <div style={{ width: 180 }}>
            <SearchSelect
              value={pay}
              onChange={setPay}
              placeholder="All payments"
              options={(Object.keys(PAY) as Pay[]).map((k) => ({ value: k, label: `${PAY[k].label} (${mine.filter((r) => payState(r) === k).length})` }))}
            />
          </div>
          <div style={{ width: 180 }}>
            <SearchSelect
              value={age}
              onChange={setAge}
              placeholder="Balance: any age"
              options={AGES.map((a) => ({ value: a.value, label: `${a.label} (${mine.filter((r) => inAge(r, a.value)).length})` }))}
            />
          </div>
          <DateRangePicker value={range} onChange={setRange} />
          {(q || course || pay || age || range.key !== 'all') && (
            <button
              type="button"
              className="clear-btn"
              onClick={() => {
                setQ('')
                setCourse(null)
                setPay(null)
                setAge(null)
                setRange(ALL_DATES)
              }}
            >
              Reset
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={load} title="Refresh" aria-label="Refresh" style={{ marginLeft: 'auto' }}>
            <RefreshCw size={14} />
          </button>
        </div>
        {!rows ? (
          <div className="empty">Loading…</div>
        ) : !shown.length ? (
          <Empty icon={GraduationCap}>{mine.length ? 'No enrollments for these filters.' : `No ${term('courses')} bought yet. Add a purchase on the lead → Purchases.`}</Empty>
        ) : (
          <Paged rows={shown} reset={[q, course, pay, age, range.from, range.to]}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Enrolled on</th>
                      <th>Person</th>
                      <th>{term('Course')}</th>
                      <th className="num">Total</th>
                      <th className="num">Paid</th>
                      <th className="num">Due</th>
                      <th>Payment</th>
                      <th>Next part</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((r) => {
                      const st = PAY[payState(r)]
                      const next = r.status === 'cancelled' ? null : nextPart(r)
                      const late = !!next?.due_on && next.due_on < new Date().toLocaleDateString('en-CA')
                      return (
                        <tr key={r.id} className="is-clickable" onClick={() => navigate(`/leads/${r.lead_id}?tab=purchases`)} title="Open the lead's purchases">
                          <td className="nowrap">{fmtDay(r.purchase_date)}</td>
                          <td>
                            <b>{person(r)}</b>
                            {r.leads?.phone && <div className="muted small">{r.leads.phone}</div>}
                          </td>
                          <td>
                            {r.name}
                            {businesses.length > 1 && <div className="muted small">{bizName.get(r.business_id)}</div>}
                          </td>
                          <td className="num nowrap">{money(r.total_amount)}</td>
                          <td className="num nowrap">{money(r.paid_amount)}</td>
                          <td className="num nowrap">{due(r) > 0 ? money(due(r)) : <span className="muted">—</span>}</td>
                          <td>
                            <span className={cn('badge', st.cls)}>{st.label}</span>
                            {Number(r.refund_amount) > 0 && <div className="muted small">{money(r.refund_amount)} back{r.refund_reason ? ` · ${r.refund_reason}` : ''}</div>}
                          </td>
                          <td className="small nowrap">
                            {next ? (
                              <>
                                {money(next.amount)}
                                <div className={cn('small', late ? 'text-danger' : 'muted')}>{next.due_on ? `${late ? 'Overdue · ' : 'Due '}${fmtDay(next.due_on)}` : 'No due date'}</div>
                              </>
                            ) : (
                              <span className="muted">—</span>
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
      </section>
    </>
  )
}
