import { useEffect, useState } from 'react'
import { funnelAdsReport, funnelFlow, type FunnelFlow as Flow } from '@/meta/api'
import { FunnelFlow } from './FunnelFlow'

const day = (d: Date) => d.toLocaleDateString('en-CA')
const ago = (n: number) => day(new Date(Date.now() - n * 86400_000))
const PRESETS = [
  { key: '7', label: 'Last 7 days', from: () => ago(6) },
  { key: '30', label: 'Last 30 days', from: () => ago(29) },
  { key: '90', label: 'Last 90 days', from: () => ago(89) },
  { key: 'month', label: 'This month', from: () => `${day(new Date()).slice(0, 8)}01` },
  { key: 'all', label: 'Everything', from: () => '2020-01-01' },
] as const

/** Funnel → Overview: the 3D funnel (Facebook reach → clicks → page views → leads → stages → revenue) and its numbers, for a period */
export function FunnelAdsReport({ funnelId }: { funnelId: string }) {
  const [preset, setPreset] = useState<string>('30')
  const [from, setFrom] = useState(ago(29))
  const [to, setTo] = useState(day(new Date()))
  const [flow, setFlow] = useState<Flow | null | undefined>(undefined)
  // with GST ÷ without, from Facebook's days (each ad account has its own GST %)
  const [gst, setGst] = useState(1.18)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setFlow(undefined)
    setError(null)
    funnelFlow(funnelId, from, to).then(setFlow, (e: Error) => setError(e.message))
    funnelAdsReport(funnelId, from, to).then(
      (r) => {
        const days = (r?.days ?? []).filter((d) => d.meta)
        const ex = days.reduce((t, d) => t + Number(d.spend), 0)
        const inc = days.reduce((t, d) => t + Number(d.spend_gst), 0)
        setGst(ex ? inc / ex : 1.18)
      },
      () => setGst(1.18),
    )
  }, [funnelId, from, to])

  const pickPreset = (k: string) => {
    setPreset(k)
    const p = PRESETS.find((x) => x.key === k)
    if (p) {
      setFrom(p.from())
      setTo(day(new Date()))
    }
  }

  return (
    <section className="card card-pad stack" style={{ gap: 14 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <b>Funnel report</b>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <select className="input input-sm filter-select" aria-label="Period" value={preset} onChange={(e) => pickPreset(e.target.value)}>
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom dates</option>
          </select>
          {preset === 'custom' && (
            <>
              <input className="input input-sm filter-select" type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <input className="input input-sm filter-select" type="date" aria-label="To" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {flow === undefined && !error && <div className="muted small">Loading…</div>}
      {flow === null && <div className="muted small">You can’t see this funnel’s report.</div>}
      {flow && (
        <>
          {!flow.linked && <div className="muted small">No Facebook campaigns are added to this funnel yet (Facebook Ads tab), so there’s no ad reach or spend.</div>}
          <FunnelFlow f={flow} gst={gst} />
        </>
      )}
    </section>
  )
}
