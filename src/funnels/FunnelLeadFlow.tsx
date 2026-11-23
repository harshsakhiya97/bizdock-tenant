import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { StatRecords, type StatCol, type StatShow } from '@/components/StatRecords'
import { cn } from '@/lib/cn'

export type FlowLead = {
  id: string
  created_at: string
  utm_source?: string | null
  temperature?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  next_follow_up_at?: string | null
}

type Node = { key: string; label: string; color: string; ids: string[] }
type Col = { title: string; nodes: Node[] }

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`
const num = (n: number) => n.toLocaleString('en-IN')
const pctOf = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '0%')
const who = (l: FlowLead) => [l.first_name, l.last_name].filter(Boolean).join(' ') || l.phone || 'Lead'

const W = 1000
const H = 520
const NODE_W = 168
const GAP = 14
const MIN_H = 46

const CAT: { key: string; label: string; color: string }[] = [
  { key: 'hot', label: 'Hot', color: '#ef4444' },
  { key: 'warm', label: 'Warm', color: '#f59e0b' },
  { key: 'new', label: 'New', color: '#818cf8' },
  { key: 'cold', label: 'Cold', color: '#38bdf8' },
  { key: 'not_interested', label: 'Not interested', color: '#94a3b8' },
  { key: 'closed', label: 'Closed', color: '#22c55e' },
]

/**
 * Funnel → Overview → Lead flow: the period's leads from Source (Ads / Organic) → Meeting (showed up / booked, no show /
 * no meeting) → Category → Outcome (paid / follow-up set / no follow-up), as bands between the columns. Hover a box or a
 * band to light up its leads' path; click a box for its leads.
 */
export function FunnelLeadFlow({
  leads,
  isAds,
  booked,
  showed,
  revenue,
}: {
  leads: FlowLead[]
  isAds: (l: FlowLead) => boolean
  booked: Set<string>
  showed: Set<string>
  /** per lead: invoices + Razorpay received */
  revenue: (id: string) => number
}) {
  const navigate = useNavigate()
  const [hover, setHover] = useState<{ col: number; key: string } | { link: string } | null>(null)
  const [show, setShow] = useState<StatShow<FlowLead> | null>(null)
  const byId = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])

  const cols = useMemo<Col[]>(() => {
    const group = (defs: { key: string; label: string; color: string }[], of: (l: FlowLead) => string) =>
      defs.map((d) => ({ ...d, ids: leads.filter((l) => of(l) === d.key).map((l) => l.id) })).filter((n) => n.ids.length)
    return [
      {
        title: 'Source',
        nodes: group(
          [
            { key: 'ads', label: 'Ads', color: '#6366f1' },
            { key: 'organic', label: 'Organic', color: '#22c55e' },
          ],
          (l) => (isAds(l) ? 'ads' : 'organic'),
        ),
      },
      {
        title: 'Meeting',
        nodes: group(
          [
            { key: 'showed', label: 'Showed up', color: '#14b8a6' },
            { key: 'noshow', label: 'Booked, no show', color: '#f97316' },
            { key: 'none', label: 'No meeting', color: '#64748b' },
          ],
          (l) => (showed.has(l.id) ? 'showed' : booked.has(l.id) ? 'noshow' : 'none'),
        ),
      },
      { title: 'Category', nodes: group(CAT, (l) => (CAT.some((c) => c.key === l.temperature) ? String(l.temperature) : 'new')) },
      {
        title: 'Outcome',
        nodes: group(
          [
            { key: 'paid', label: 'Paid', color: '#22c55e' },
            { key: 'fu', label: 'Follow-up set', color: '#a78bfa' },
            { key: 'nofu', label: 'No follow-up', color: '#64748b' },
          ],
          (l) => (revenue(l.id) > 0 ? 'paid' : l.next_follow_up_at ? 'fu' : 'nofu'),
        ),
      },
    ]
  }, [leads, isAds, booked, showed, revenue])

  // boxes: x per column, heights by share (a minimum so small ones stay readable)
  const layout = useMemo(() => {
    const total = leads.length || 1
    const xs = cols.map((_, i) => (i * (W - NODE_W)) / (cols.length - 1))
    const boxes = cols.map((c, ci) => {
      const free = H - GAP * (c.nodes.length - 1) - MIN_H * c.nodes.length
      let y = 0
      return c.nodes.map((n) => {
        const h = MIN_H + (free * n.ids.length) / total
        const b = { ...n, col: ci, x: xs[ci], y, h }
        y += h + GAP
        return b
      })
    })
    // bands between neighbouring columns, stacked in box order on both sides
    const links: { id: string; from: (typeof boxes)[0][0]; to: (typeof boxes)[0][0]; ids: string[]; d: string }[] = []
    for (let ci = 0; ci < boxes.length - 1; ci++) {
      const outY = new Map(boxes[ci].map((b) => [b.key, b.y]))
      const inY = new Map(boxes[ci + 1].map((b) => [b.key, b.y]))
      for (const a of boxes[ci])
        for (const b of boxes[ci + 1]) {
          const set = new Set(b.ids)
          const ids = a.ids.filter((id) => set.has(id))
          if (!ids.length) continue
          const ta = (a.h * ids.length) / a.ids.length
          const tb = (b.h * ids.length) / b.ids.length
          const y0 = outY.get(a.key)!
          const y1 = inY.get(b.key)!
          outY.set(a.key, y0 + ta)
          inY.set(b.key, y1 + tb)
          const x0 = a.x + NODE_W
          const x1 = b.x
          const mx = (x0 + x1) / 2
          const d = `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + tb} C${mx},${y1 + tb} ${mx},${y0 + ta} ${x0},${y0 + ta} Z`
          links.push({ id: `${ci}:${a.key}>${b.key}`, from: a, to: b, ids, d })
        }
    }
    return { boxes, links }
  }, [cols, leads.length])

  // what the hover lights up: the leads of a box or a band, and every band they travel
  const lit = useMemo(() => {
    if (!hover) return null
    if ('link' in hover) return new Set(layout.links.find((l) => l.id === hover.link)?.ids ?? [])
    return new Set(layout.boxes[hover.col]?.find((b) => b.key === hover.key)?.ids ?? [])
  }, [hover, layout])
  const share = (ids: string[]) => (lit ? ids.filter((id) => lit.has(id)).length : ids.length)

  const cols2: StatCol<FlowLead>[] = [
    {
      label: 'Lead',
      render: (l) => (
        <>
          <b>{who(l)}</b>
          {l.phone && <div className="muted small">{l.phone}</div>}
        </>
      ),
    },
    { label: 'Category', render: (l) => CAT.find((c) => c.key === l.temperature)?.label ?? 'New' },
    { label: 'Revenue', num: true, render: (l) => (revenue(l.id) ? inr(revenue(l.id)) : <span className="muted">—</span>) },
    { label: 'Lead date', render: (l) => <span className="nowrap">{new Date(l.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span> },
  ]
  const open = (title: string, ids: string[]) => setShow({ title, rows: ids.map((id) => byId.get(id)!).filter(Boolean), cols: cols2 })

  const total = leads.length
  const nShowed = leads.filter((l) => showed.has(l.id)).length
  const paid = leads.filter((l) => revenue(l.id) > 0)
  const rev = paid.reduce((s, l) => s + revenue(l.id), 0)

  if (!total) return <div className="muted small">No leads in this period.</div>
  return (
    <div className="lf">
      <div className="lf-head">
        <b>Lead flow</b>
        <span>Where the leads come from, who shows up, how warm they are, and who pays. Hover to follow a path; click a box for its leads.</span>
      </div>
      <div className="lf-tiles">
        <div>
          <b>{num(total)}</b>
          <span>Leads</span>
        </div>
        <div>
          <b>{num(nShowed)}</b>
          <span>Showed up · {pctOf(nShowed, total)}</span>
        </div>
        <div>
          <b>{num(paid.length)}</b>
          <span>Paid · {pctOf(paid.length, total)}</span>
        </div>
        <div>
          <b>{inr(rev)}</b>
          <span>Revenue</span>
        </div>
      </div>
      <div className="lf-scroll">
        <div className="lf-chart">
          <div className="lf-titles">
            {cols.map((c, i) => (
              <span key={c.title} style={{ left: `${(i * (W - NODE_W)) / (cols.length - 1) / 10}%`, width: `${NODE_W / 10}%` }}>
                {c.title}
              </span>
            ))}
          </div>
          <div className="lf-area" onMouseLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              {layout.links.map((l) => {
                const on = !lit || l.ids.some((id) => lit.has(id))
                return (
                  <path
                    key={l.id}
                    d={l.d}
                    fill={l.from.color}
                    className={cn('lf-band', lit && (on ? 'is-on' : 'is-off'))}
                    onMouseEnter={() => setHover({ link: l.id })}
                    onClick={() => open(`${l.from.label} → ${l.to.label}`, l.ids)}
                  >
                    <title>{`${l.from.label} → ${l.to.label}: ${num(l.ids.length)}`}</title>
                  </path>
                )
              })}
            </svg>
            {layout.boxes.flat().map((b) => {
              const n = share(b.ids)
              const colTotal = cols[b.col].nodes.reduce((s, x) => s + x.ids.length, 0)
              return (
                <button
                  key={`${b.col}-${b.key}`}
                  type="button"
                  className={cn('lf-box', lit && (n ? 'is-on' : 'is-off'))}
                  style={{ left: `${b.x / 10}%`, top: `${(b.y / H) * 100}%`, width: `${NODE_W / 10}%`, height: `${(b.h / H) * 100}%`, ['--c' as string]: b.color }}
                  onMouseEnter={() => setHover({ col: b.col, key: b.key })}
                  onClick={() => open(b.label, b.ids)}
                >
                  <span className="lf-label">{b.label}</span>
                  <b>{num(lit ? n : b.ids.length)}</b>
                  {b.h >= 70 && <small>{lit && n !== b.ids.length ? `of ${num(b.ids.length)}` : `${pctOf(b.ids.length, colTotal)} of stage`}</small>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <StatRecords show={show} onClose={() => setShow(null)} rowKey={(l) => l.id} onRow={(l) => navigate(`/leads/${l.id}`)} />
    </div>
  )
}
