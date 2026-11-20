import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, IndianRupee, MessageSquare, Phone, PhoneOutgoing, RefreshCw, Star } from 'lucide-react'
import { DateRangePicker, presetRange, type Range } from '@/components/DateRange'
import { Flash } from '@/components/Flash'
import { StatRecords, type StatShow } from '@/components/StatRecords'
import { Empty, PageHead, Paged, StatCard } from '@/components/ui'
import { listMemberOptions } from '@/leads/api'
import type { MemberOption } from '@/leads/types'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { fieldLabel, hx, listAiCalls, OUTCOME, resultOf, rupees, secs, type AiCall } from './api'
import { CallDrawer } from './CallDrawer'

const ist = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** AI Calling → Call history: the numbers (calls, answered, interested, talk time, cost), outcomes, what people said, calls per day, and every call */
export function AiHistoryPage() {
  const tenant = useTenant()
  const [range, setRange] = useState<Range>(() => presetRange('thisMonth'))
  const [calls, setCalls] = useState<AiCall[] | null>(null)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [outcomeF, setOutcomeF] = useState('')
  const [tplF, setTplF] = useState('')
  const [memberF, setMemberF] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<AiCall | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const load = useCallback(() => {
    listAiCalls(tenant.id).then(setCalls, (e: Error) => setNotice({ error: e.message }))
  }, [tenant.id])
  useEffect(load, [load])
  useEffect(() => {
    void listMemberOptions(tenant.id).then(setMembers, () => setMembers([]))
  }, [tenant.id])
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (calls ?? []).filter((c) => {
      const d = ist(c.placed_at)
      if (d < range.from || d > range.to) return false
      if (outcomeF && resultOf(c).key !== outcomeF) return false
      if (tplF && c.objective_id !== tplF) return false
      if (memberF === 'workflow' ? c.via !== 'workflow' : memberF && c.member_id !== memberF) return false
      if (s && !`${c.to_name ?? ''} ${c.to_phone} ${c.summary ?? ''}`.toLowerCase().includes(s)) return false
      return true
    })
  }, [calls, range, outcomeF, tplF, memberF, q])
  const templates = useMemo(() => [...new Map((calls ?? []).filter((c) => c.objective_id).map((c) => [c.objective_id!, c.objective_name ?? c.objective_id!])).entries()], [calls])

  // ---- the numbers ----
  const answeredOf = (c: AiCall) => Number(c.talk_seconds) > 0
  const st = useMemo(() => {
    const answered = rows.filter(answeredOf)
    const talk = answered.reduce((t, c) => t + Number(c.talk_seconds ?? 0), 0)
    return {
      total: rows.length,
      answered: answered.length,
      interested: rows.filter((c) => c.outcome === 'interested').length,
      avg: answered.length ? talk / answered.length : 0,
      minutes: talk / 60,
      cost: rows.reduce((t, c) => t + Number(c.cost ?? 0), 0),
    }
  }, [rows])
  const outcomes = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of rows) m.set(resultOf(c).key, (m.get(resultOf(c).key) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])
  // what people told the AI: each collected field with its answers and how many said each
  const said = useMemo(() => {
    const m = new Map<string, Map<string, number>>()
    for (const c of rows)
      for (const [k, v] of Object.entries(c.collected ?? {})) {
        if (v === null || v === '' || typeof v === 'object') continue
        const a = m.get(k) ?? new Map<string, number>()
        const val = String(v).trim().slice(0, 60)
        a.set(val, (a.get(val) ?? 0) + 1)
        m.set(k, a)
      }
    return [...m.entries()].map(([k, a]) => [k, [...a.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6)] as const)
  }, [rows])
  const perDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of rows) m.set(ist(c.placed_at), (m.get(ist(c.placed_at)) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])
  const maxDay = Math.max(1, ...perDay.map(([, n]) => n))
  const maxOut = Math.max(1, ...outcomes.map(([, n]) => n))

  const [show, setShow] = useState<StatShow<AiCall> | null>(null)
  const list = (title: string, f: (c: AiCall) => boolean) => () =>
    setShow({
      title,
      rows: rows.filter(f),
      cols: [
        { label: 'When', render: (c) => <span className="nowrap">{when(c.placed_at)}</span> },
        { label: 'Called', render: (c) => <b>{c.to_name || c.to_phone}</b> },
        { label: 'Result', render: (c) => <span className={cn('badge', resultOf(c).tone)}>{resultOf(c).label}</span> },
        { label: 'Talk', num: true, render: (c) => secs(c.talk_seconds) },
        { label: 'Cost', num: true, render: (c) => rupees(c.cost) },
      ],
    })

  async function refresh() {
    setBusy(true)
    try {
      await hx(tenant.id, { action: 'sync' })
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
    setBusy(false)
  }

  return (
    <>
      <PageHead
        title="Call history"
        subtitle="Every AI call with its result and cost (HelloRix’s price). Results come in by themselves after each call ends."
        actions={
          <button type="button" className="btn btn-outline" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw size={15} className={busy ? 'spin' : undefined} /> Refresh
          </button>
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <div className="stat-grid ac-stats">
        <StatCard icon={Phone} tone="brand" value={st.total} label="Total calls" onClick={list('Total calls', () => true)} />
        <StatCard icon={CheckCircle2} tone="success" value={`${st.answered}${st.total ? ` (${Math.round((st.answered / st.total) * 100)}%)` : ''}`} label="Answered" onClick={list('Answered', answeredOf)} />
        <StatCard icon={Star} tone="warning" value={st.interested} label="Interested" onClick={list('Interested', (c) => c.outcome === 'interested')} />
        <StatCard icon={Clock3} tone="info" value={secs(st.avg)} label="Avg talk time" onClick={list('Answered', answeredOf)} />
        <StatCard icon={MessageSquare} tone="info" value={st.minutes.toFixed(1)} label="Talk minutes" onClick={list('Answered', answeredOf)} />
        <StatCard icon={IndianRupee} tone="danger" value={rupees(st.cost)} label="Cost" onClick={list('Calls with a cost', (c) => Number(c.cost) > 0)} />
      </div>
      <StatRecords show={show} onClose={() => setShow(null)} rowKey={(c) => c.id} onRow={(c) => setOpen(c)} />

      <div className="ac-panels">
        <section className="card card-pad">
          <b>Call outcomes</b>
          {!outcomes.length ? (
            <div className="muted small" style={{ marginTop: 8 }}>
              No calls in this period.
            </div>
          ) : (
            <div className="stack" style={{ gap: 8, marginTop: 10 }}>
              {outcomes.map(([k, n]) => {
                const o = k === 'live' ? { label: 'Calling now', color: '#7c3aed' } : OUTCOME[k]
                return (
                  <button key={k} type="button" className="db-src ac-bar" onClick={() => setOutcomeF(outcomeF === k ? '' : k)} title="Show only these">
                    <span className="small">{o?.label ?? k}</span>
                    <div className="db-bar">
                      <span style={{ width: `${(n / maxOut) * 100}%`, background: o?.color }} />
                    </div>
                    <b className="small">{n}</b>
                  </button>
                )
              })}
            </div>
          )}
        </section>
        <section className="card card-pad">
          <b>What people told the AI</b>
          {!said.length ? (
            <div className="muted small" style={{ marginTop: 8 }}>
              Answers collected on the calls show here.
            </div>
          ) : (
            <div className="stack" style={{ gap: 10, marginTop: 10 }}>
              {said.map(([k, vals]) => (
                <div key={k}>
                  <div className="ac-label">{fieldLabel(k)}</div>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {vals.map(([v, n]) => (
                      <span key={v} className="badge badge-muted">
                        {v} · {n}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card card-pad">
          <b>Calls per day</b>
          {!perDay.length ? (
            <div className="muted small" style={{ marginTop: 8 }}>
              No calls in this period.
            </div>
          ) : (
            <div className="ac-days">
              {perDay.map(([d, n]) => (
                <div key={d} className="ac-day" title={`${new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}: ${n} call${n === 1 ? '' : 's'}`}>
                  <span style={{ height: `${(n / maxDay) * 100}%` }} />
                  <small>{Number(d.slice(8))}</small>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-bar">
          <b>Calls</b>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input className="input input-sm" style={{ width: 200 }} placeholder="Name, phone or summary" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input input-sm filter-select" value={outcomeF} onChange={(e) => setOutcomeF(e.target.value)} aria-label="Result">
              <option value="">All results</option>
              <option value="live">Calling now</option>
              {Object.entries(OUTCOME).map(([k, o]) => (
                <option key={k} value={k}>
                  {o.label}
                </option>
              ))}
            </select>
            <select className="input input-sm filter-select" value={tplF} onChange={(e) => setTplF(e.target.value)} aria-label="Template">
              <option value="">All templates</option>
              {templates.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select className="input input-sm filter-select" value={memberF} onChange={(e) => setMemberF(e.target.value)} aria-label="Team member">
              <option value="">Everyone</option>
              <option value="workflow">Workflows</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!calls ? (
          <div className="empty">Loading…</div>
        ) : !rows.length ? (
          <Empty icon={PhoneOutgoing}>No calls in this period.</Empty>
        ) : (
          <Paged rows={rows} reset={[range, outcomeF, tplF, memberF, q]}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Called</th>
                      <th>Template</th>
                      <th>Result</th>
                      <th>Summary</th>
                      <th className="num">Talk</th>
                      <th className="num">Cost</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((c) => {
                      const r = resultOf(c)
                      return (
                        <tr key={c.id} className="is-clickable" onClick={() => setOpen(c)}>
                          <td className="nowrap">{when(c.placed_at)}</td>
                          <td>
                            <b>{c.to_name || '—'}</b>
                            <div className="muted small">{c.to_phone}</div>
                          </td>
                          <td className="small">{c.objective_name ?? '—'}</td>
                          <td>
                            <span className={cn('badge', r.tone)}>{r.label}</span>
                          </td>
                          <td className="small" style={{ maxWidth: 360 }}>
                            <div className="cell-clip" title={c.summary ?? c.error ?? ''}>
                              {c.summary ?? c.error ?? <span className="muted">—</span>}
                            </div>
                          </td>
                          <td className="num">{secs(c.talk_seconds)}</td>
                          <td className="num">{rupees(c.cost)}</td>
                          <td className="small">{c.via === 'workflow' ? 'Workflow' : (memberName(c.member_id) ?? '—')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5}>Total · {rows.length} calls</td>
                      <td className="num">{secs(rows.reduce((t, c) => t + Number(c.talk_seconds ?? 0), 0))}</td>
                      <td className="num">{rupees(st.cost)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Paged>
        )}
      </section>

      {open && (
        <CallDrawer
          key={open.id}
          call={open}
          memberName={memberName}
          onClose={() => setOpen(null)}
          onChanged={(c) => setCalls((all) => (all ?? []).map((x) => (x.id === c.id ? { ...x, ...c } : x)))}
        />
      )}
    </>
  )
}
