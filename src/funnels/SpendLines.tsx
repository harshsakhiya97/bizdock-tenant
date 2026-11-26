import { useEffect, useMemo, useRef, useState } from 'react'

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#64748b']
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const short = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `₹${Math.round(n)}`)
const label = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export type Line = { key: string; name: string; values: number[] }

/** A multi-line chart: one line per series over the days; legend toggles lines, hover shows the day's values (₹, or counts). */
export function SpendLines({ days, lines, unit = 'money', labelOf = label }: { days: string[]; lines: Line[]; unit?: 'money' | 'count'; /** x-axis / hover label of a point (default: 26 Nov) */ labelOf?: (d: string) => string }) {
  const full = unit === 'count' ? (n: number) => String(Math.round(n)) : inr
  const axis = unit === 'count' ? (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1)) : short
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [hover, setHover] = useState<number | null>(null)
  // drawn at the box's real width, so text stays the same size on wide and narrow pages (not scaled up)
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(900)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 260
  const P = { l: 56, r: 16, t: 12, b: 28 }
  const shown = lines.filter((l) => !hidden.has(l.key))
  const max = useMemo(() => Math.max(unit === 'count' ? 4 : 1, ...shown.flatMap((l) => l.values)), [shown, unit])
  const nice = (() => {
    // counts: the top is the next multiple of 4, so the 4 steps are whole numbers (24 → 0 6 12 18 24)
    if (unit === 'count') return Math.max(4, Math.ceil(max / 4) * 4)
    const p = 10 ** Math.floor(Math.log10(max))
    const m = max / p
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
  })()
  const x = (i: number) => P.l + (days.length <= 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (days.length - 1))
  const y = (v: number) => P.t + (H - P.t - P.b) * (1 - v / nice)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * nice)
  const every = Math.max(1, Math.ceil(days.length / Math.max(4, Math.floor(W / 110))))
  const color = (k: string) => COLORS[lines.findIndex((l) => l.key === k) % COLORS.length]

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div ref={box} style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Per day" style={{ display: 'block' }} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={P.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
                {axis(t)}
              </text>
            </g>
          ))}
          {days.map((d, i) =>
            i % every === 0 || i === days.length - 1 ? (
              <text key={d} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
                {labelOf(d)}
              </text>
            ) : null,
          )}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="var(--text-muted)" strokeDasharray="3 3" />}
          {shown.map((l) => (
            <g key={l.key}>
              <polyline fill="none" stroke={color(l.key)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={l.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
              {(days.length <= 31 || hover != null) &&
                l.values.map((v, i) => (days.length <= 31 || i === hover ? <circle key={i} cx={x(i)} cy={y(v)} r={i === hover ? 4 : 2.5} fill={color(l.key)} /> : null))}
            </g>
          ))}
          {days.map((d, i) => {
            const half = days.length <= 1 ? W : (W - P.l - P.r) / (days.length - 1) / 2
            return <rect key={d} x={x(i) - half} y={P.t} width={half * 2} height={H - P.t - P.b} fill="transparent" onMouseEnter={() => setHover(i)} />
          })}
        </svg>
        {hover != null && (
          <div className="card card-pad small" style={{ position: 'absolute', top: 8, left: `${Math.min(70, (x(hover) / W) * 100 + 2)}%`, pointerEvents: 'none', minWidth: 180, maxWidth: 300, boxShadow: 'var(--shadow-float)', padding: 10 }}>
            <b>{labelOf(days[hover])}</b>
            {shown
              .map((l) => ({ l, v: l.values[hover] }))
              .filter((r) => r.v > 0)
              .sort((a, b) => b.v - a.v)
              .map(({ l, v }) => (
                <div key={l.key} className="row-between" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <span className="row" style={{ gap: 6, flexWrap: 'nowrap', overflow: 'hidden' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: color(l.key), flex: 'none' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                  </span>
                  <b>{full(v)}</b>
                </div>
              ))}
          </div>
        )}
      </div>
      <div className="row small" style={{ gap: '6px 14px', flexWrap: 'wrap' }}>
        {lines.map((l) => {
          const off = hidden.has(l.key)
          return (
            <button
              key={l.key}
              type="button"
              className="row link-btn"
              style={{ gap: 6, opacity: off ? 0.4 : 1, flexWrap: 'nowrap', color: 'inherit' }}
              title={off ? 'Show this line' : 'Hide this line'}
              onClick={() =>
                setHidden((h) => {
                  const n = new Set(h)
                  if (n.has(l.key)) n.delete(l.key)
                  else n.add(l.key)
                  return n
                })
              }
            >
              <span style={{ width: 10, height: 10, borderRadius: 5, background: color(l.key), flex: 'none' }} />
              {l.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
