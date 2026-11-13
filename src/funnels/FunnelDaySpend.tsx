import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Paged } from '@/components/ui'
import { useTenant } from '@/tenant/useTenant'
import { funnelDaySpend, type AdAccount, type AdSet, type Campaign } from '@/meta/api'

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (d: Date) => d.toLocaleDateString('en-CA')
const ago = (n: number) => day(new Date(Date.now() - n * 86400_000))
const PRESETS = [
  { key: '7', label: 'Last 7 days', from: () => ago(6) },
  { key: '30', label: 'Last 30 days', from: () => ago(29) },
  { key: '90', label: 'Last 90 days', from: () => ago(89) },
  { key: 'month', label: 'This month', from: () => `${day(new Date()).slice(0, 8)}01` },
  { key: 'all', label: 'Everything', from: () => '2020-01-01' },
] as const

type Ad = { ad_id: string; name: string; campaign: string; adset: string; spend: number; gst: number }
type Day = { day: string; spend: number; gst: number; ads: Ad[] }

/** Funnel → Facebook Ads: the linked campaigns' spend per day (with GST, hover without), and each day's ads with their spend. */
export function FunnelDaySpend({
  links,
  accounts,
  campaigns,
  adsets,
}: {
  links: { campaign_id: string; adset_id: string | null }[]
  accounts: AdAccount[]
  campaigns: Campaign[]
  adsets: AdSet[]
}) {
  const tenant = useTenant()
  const [preset, setPreset] = useState('30')
  const [from, setFrom] = useState(ago(29))
  const [to, setTo] = useState(day(new Date()))
  const [data, setData] = useState<Awaited<ReturnType<typeof funnelDaySpend>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const key = JSON.stringify(links)

  useEffect(() => {
    setData(null)
    setError(null)
    funnelDaySpend(tenant.id, JSON.parse(key), from, to).then(setData, (e: Error) => setError(e.message))
  }, [tenant.id, key, from, to])

  const days = useMemo(() => {
    const gst = new Map(accounts.map((a) => [a.id, Number(a.gst_rate)]))
    const cName = new Map(campaigns.map((c) => [c.campaign_id, c.name ?? c.campaign_id]))
    const sName = new Map(adsets.map((s) => [s.adset_id, s.name ?? s.adset_id]))
    const byDay = new Map<string, Day>()
    for (const r of data?.days ?? []) {
      const sp = Number(r.spend || 0)
      const g = sp * (1 + (gst.get(r.account_id) ?? 18) / 100)
      const d = byDay.get(r.day) ?? { day: r.day, spend: 0, gst: 0, ads: [] }
      d.spend += sp
      d.gst += g
      const ad = d.ads.find((a) => a.ad_id === r.ad_id)
      if (ad) {
        ad.spend += sp
        ad.gst += g
      } else d.ads.push({ ad_id: r.ad_id, name: data?.ads.get(r.ad_id) ?? r.ad_id, campaign: cName.get(r.campaign_id) ?? r.campaign_id, adset: sName.get(r.adset_id) ?? r.adset_id, spend: sp, gst: g })
      byDay.set(r.day, d)
    }
    return [...byDay.values()].filter((d) => d.spend > 0).map((d) => ({ ...d, ads: d.ads.filter((a) => a.spend > 0).sort((a, b) => b.spend - a.spend) })).sort((a, b) => b.day.localeCompare(a.day))
  }, [data, accounts, campaigns, adsets])
  const total = days.reduce((t, d) => ({ spend: t.spend + d.spend, gst: t.gst + d.gst }), { spend: 0, gst: 0 })
  const money = (ex: number, inc: number) => (
    <span className="gst-hover" title={`${inr(ex)} + GST ${inr(inc - ex)} = ${inr(inc)}`}>
      {inr(inc)}
    </span>
  )

  function pickPreset(k: string) {
    setPreset(k)
    const p = PRESETS.find((x) => x.key === k)
    if (p) {
      setFrom(p.from())
      setTo(day(new Date()))
    }
  }

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <b>Spend per day</b>
          <div className="muted small">
            The linked campaigns’ Facebook spend, with GST (hover: without GST + GST).{days.length ? ` ${days.length} day${days.length === 1 ? '' : 's'} · ` : ' '}
            {days.length ? <>total {money(total.spend, total.gst)}</> : null}
          </div>
        </div>
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
      {!data && !error ? (
        <div className="muted small">Loading…</div>
      ) : !days.length ? (
        <div className="muted small">No spend on the linked campaigns in these dates.</div>
      ) : (
        <Paged rows={days} reset={[from, to]}>
          {(rows) => (
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th style={{ width: 170 }}>Day</th>
                    <th>Ads</th>
                    <th className="num" style={{ width: 160 }}>
                      Spend
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const isOpen = open.has(d.day)
                    return (
                      <Fragment key={d.day}>
                        <tr
                          className="is-clickable"
                          onClick={() =>
                            setOpen((o) => {
                              const n = new Set(o)
                              if (n.has(d.day)) n.delete(d.day)
                              else n.add(d.day)
                              return n
                            })
                          }
                        >
                          <td className="nowrap">
                            <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <b>{d.day}</b>
                            </span>
                          </td>
                          <td className="muted small">
                            {d.ads.length} ad{d.ads.length === 1 ? '' : 's'}
                          </td>
                          <td className="num nowrap">
                            <b>{money(d.spend, d.gst)}</b>
                          </td>
                        </tr>
                        {isOpen &&
                          d.ads.map((a) => (
                            <tr key={`${d.day}-${a.ad_id}`}>
                              <td />
                              <td>
                                {a.name}
                                <div className="muted small">
                                  {a.campaign} · {a.adset}
                                </div>
                              </td>
                              <td className="num nowrap">{money(a.spend, a.gst)}</td>
                            </tr>
                          ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Paged>
      )}
    </section>
  )
}
