import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, RefreshCw, TrendingUp } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Empty, PageHead, Paged, SearchInput } from '@/components/ui'
import { money } from '@/leads/labels'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'
import { rpcAll } from '@/lib/fetchAll'
import { useTenant } from '@/tenant/useTenant'
import { useTerm } from '@/tenant/useTerm'

/**
 * Upsell: the course ladder (Masters → Courses, in their order) and, for each step, the people who bought it
 * but not the next course — who to sell to next. Rough first version.
 */
type Course = { id: string; name: string; sort_order: number; price: number; business_id: string }
type Buy = {
  id: string
  lead_id: string
  product_id: string | null
  name: string
  business_id: string
  purchase_date: string
  total_amount: number
  paid_amount: number
  refund_amount: number
  status: string
  leads: { first_name: string; last_name: string | null; phone: string | null; city: string | null } | null
}

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export function UpsellPage() {
  const tenant = useTenant()
  const term = useTerm()
  const navigate = useNavigate()
  const { businesses } = useAuth()
  const { inScope } = useBusiness()
  const [courses, setCourses] = useState<Course[] | null>(null)
  const [buys, setBuys] = useState<Buy[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const load = useCallback(() => {
    setBuys(null)
    setError(null)
    Promise.all([
      db().from('products').select('id, name, sort_order, price, business_id').eq('tenant_id', tenant.id).eq('kind', 'product').eq('is_active', true).order('sort_order'),
      rpcAll<Buy>((offset, limit) => db().rpc('list_purchases', { p_tenant: tenant.id, p_offset: offset, p_limit: limit })).then((rows) => rows.filter((r) => r.status === 'active')),
    ])
      .then(([c, p]) => {
        if (c.error) setError(c.error.message)
        setCourses((c.data ?? []) as Course[])
        setBuys(p)
      })
      .catch((e: Error) => {
        setError(e.message)
        setCourses([])
        setBuys([])
      })
  }, [tenant.id])
  useEffect(load, [load])

  const bizIds = useMemo(() => new Set(businesses.map((b) => b.id)), [businesses])
  const ladder = useMemo(() => (courses ?? []).filter((c) => bizIds.has(c.business_id) && inScope(c.business_id)), [courses, bizIds, inScope])
  // a purchase's course: by its course id, else by the same name
  const courseOf = useMemo(() => {
    const byName = new Map(ladder.map((c) => [c.name.trim().toLowerCase(), c.id]))
    return (b: Buy) => (b.product_id && ladder.some((c) => c.id === b.product_id) ? b.product_id : (byName.get(b.name.trim().toLowerCase()) ?? null))
  }, [ladder])
  // per person: the courses they bought (refunded ones don't count) and their latest purchase of each
  const people = useMemo(() => {
    const m = new Map<string, { lead: Buy['leads']; courses: Map<string, Buy> }>()
    for (const b of buys ?? []) {
      if (!bizIds.has(b.business_id) || !inScope(b.business_id) || Number(b.refund_amount) > 0) continue
      const c = courseOf(b)
      if (!c) continue
      const p = m.get(b.lead_id) ?? { lead: b.leads, courses: new Map<string, Buy>() }
      const prev = p.courses.get(c)
      if (!prev || b.purchase_date > prev.purchase_date) p.courses.set(c, b)
      m.set(b.lead_id, p)
    }
    return m
  }, [buys, courseOf, bizIds, inScope])

  // each step: bought it, but not the next course in the ladder
  const steps = useMemo(
    () =>
      ladder.slice(0, -1).map((c, i) => {
        const next = ladder[i + 1]
        const bought = [...people.entries()].filter(([, p]) => p.courses.has(c.id))
        const targets = bought.filter(([, p]) => !p.courses.has(next.id))
        return { course: c, next, bought: bought.length, targets }
      }),
    [ladder, people],
  )
  const current = steps.find((s) => s.course.id === step) ?? steps[0]
  const rows = useMemo(() => {
    if (!current) return []
    const s = q.trim().toLowerCase()
    return current.targets
      .map(([leadId, p]) => ({ leadId, lead: p.lead, buy: p.courses.get(current.course.id)!, count: p.courses.size }))
      .filter((r) => !s || `${r.lead?.first_name ?? ''} ${r.lead?.last_name ?? ''} ${r.lead?.phone ?? ''} ${r.lead?.city ?? ''}`.toLowerCase().includes(s))
      .sort((a, b) => b.buy.purchase_date.localeCompare(a.buy.purchase_date))
  }, [current, q])

  return (
    <>
      <PageHead
        title="Upsell"
        subtitle={`The ${term('course')} ladder, in the order set in Masters → ${term('Courses')}. Pick a step to see who bought it but not the next ${term('course')} yet.`}
        actions={
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />
      {error && <div className="alert alert-error">{error}</div>}
      {!courses || !buys ? (
        <div className="card empty">Loading…</div>
      ) : ladder.length < 2 ? (
        <div className="card">
          <Empty icon={TrendingUp}>
            Add at least two {term('courses')} in Masters → {term('Courses')} (their order there is the ladder) to see who to sell to next.
          </Empty>
        </div>
      ) : (
        <>
          <div className="upsell-ladder">
            {steps.map((s) => (
              <button key={s.course.id} type="button" className={cn('upsell-step', current?.course.id === s.course.id && 'is-on')} onClick={() => setStep(s.course.id)}>
                <span className="upsell-name">
                  {s.course.name} <ArrowRight size={13} /> {s.next.name}
                </span>
                <b>{s.targets.length.toLocaleString('en-IN')}</b>
                <small>
                  of {s.bought.toLocaleString('en-IN')} who bought {s.course.name}
                </small>
              </button>
            ))}
          </div>
          <section className="panel">
            <div className="panel-bar">
              <div>
                <b>
                  Sell {current.next.name} to these people
                </b>
                <div className="muted small">
                  They bought {current.course.name} but not {current.next.name}
                  {current.next.price ? ` (${money(current.next.price)})` : ''}. Click a row to open the lead.
                </div>
              </div>
              <SearchInput placeholder="Name, phone or city" value={q} onChange={setQ} width={240} />
            </div>
            {!rows.length ? (
              <Empty icon={TrendingUp}>Nobody to show here.</Empty>
            ) : (
              <Paged rows={rows} reset={[current.course.id, q]}>
                {(paged) => (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Person</th>
                          <th>City</th>
                          <th>Bought {current.course.name} on</th>
                          <th className="num">Paid</th>
                          <th className="num">Still due</th>
                          <th className="num">{term('Courses')} bought</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paged.map((r) => {
                          const due = Math.max(0, Number(r.buy.total_amount) - Number(r.buy.paid_amount))
                          return (
                            <tr key={r.leadId} className="is-clickable" onClick={() => navigate(`/leads/${r.leadId}?tab=purchases`)}>
                              <td>
                                <b>{[r.lead?.first_name, r.lead?.last_name].filter(Boolean).join(' ') || '—'}</b>
                                {r.lead?.phone && <div className="muted small">{r.lead.phone}</div>}
                              </td>
                              <td className="small">{r.lead?.city || <span className="muted">—</span>}</td>
                              <td className="nowrap">{fmtDay(r.buy.purchase_date)}</td>
                              <td className="num nowrap">{money(r.buy.paid_amount)}</td>
                              <td className="num nowrap">{due > 0 ? <span className="text-danger">{money(due)}</span> : <span className="muted">—</span>}</td>
                              <td className="num">{r.count}</td>
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
      )}
    </>
  )
}
