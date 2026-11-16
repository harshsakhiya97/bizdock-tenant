import { useEffect, useState } from 'react'
import { funnelAdsReport, funnelFlow, type FunnelFlow as Flow } from '@/meta/api'
import { FunnelFlow } from './FunnelFlow'
import { MetaSync } from './MetaSync'
import { DateRangePicker, presetRange, type Range } from '@/components/DateRange'
import { useTenant } from '@/tenant/useTenant'

/** Funnel → Overview: the 3D funnel (Facebook reach → clicks → page views → leads → stages → revenue) and its numbers, for a period */
export function FunnelAdsReport({ funnelId }: { funnelId: string }) {
  const tenant = useTenant()
  // same presets as Facebook Ads Manager (Last 30 days ends yesterday), so the numbers match
  const [range, setRange] = useState<Range>(() => presetRange('last30'))
  const { from, to } = range
  const [reload, setReload] = useState(0)
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
  }, [funnelId, from, to, reload])

  return (
    <section className="card card-pad stack" style={{ gap: 14 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <b>Funnel report</b>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <MetaSync tenantId={tenant.id} onDone={() => setReload((n) => n + 1)} />
          <DateRangePicker value={range} onChange={setRange} />
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
