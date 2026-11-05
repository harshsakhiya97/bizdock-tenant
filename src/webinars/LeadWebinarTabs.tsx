import { useEffect, useMemo, useState } from 'react'
import { ShoppingBag, Trash2 } from 'lucide-react'
import { ConfirmModal, Empty, Paged } from '@/components/ui'
import { money } from '@/leads/labels'
import { CATEGORY_META, deletePurchase, listRegistrations, listZoomData, type Attendance, type Purchase, type Registration, type ZoomComment } from './api'

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const clock = (t: string | null) => (t ? new Date(2000, 0, 1, ...(t.slice(0, 5).split(':').map(Number) as [number, number])).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '')
const at = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—')

/** Lead → Webinars: each webinar date they registered for, how long they attended, their category, Q&A / chat / polls. */
export function LeadWebinarsTab({ leadId }: { leadId: string }) {
  const [regs, setRegs] = useState<Registration[] | null>(null)
  const [zoom, setZoom] = useState<{ attendance: Attendance[]; comments: ZoomComment[] }>({ attendance: [], comments: [] })
  useEffect(() => {
    void listRegistrations({ leadId }).then(setRegs, () => setRegs([]))
    void listZoomData({ leadId }).then(setZoom, () => undefined)
  }, [leadId])
  const byEvent = useMemo(() => {
    const m = new Map<string, { att: Attendance[]; com: ZoomComment[] }>()
    for (const a of zoom.attendance) m.set(a.event_id, { att: [...(m.get(a.event_id)?.att ?? []), a], com: m.get(a.event_id)?.com ?? [] })
    for (const c of zoom.comments) m.set(c.event_id, { att: m.get(c.event_id)?.att ?? [], com: [...(m.get(c.event_id)?.com ?? []), c] })
    return m
  }, [zoom])

  if (!regs) return <div className="muted small">Loading…</div>
  if (!regs.length) return <Empty>Not registered for any webinar yet.</Empty>
  return (
    <div className="stack">
      {regs.map((r) => {
        const ev = r.events
        const z = byEvent.get(r.event_id)
        const mins = (z?.att ?? []).reduce((n, a) => n + (Number(a.minutes) || 0), 0)
        const ended = ev ? Date.parse(`${ev.event_date}T${(ev.end_time ?? ev.start_time).slice(0, 5)}:00+05:30`) < Date.now() : false
        const cat = r.category ? CATEGORY_META[r.category] : null
        return (
          <section key={r.id} className="card card-pad stack" style={{ gap: 8 }}>
            <div className="row-between">
              <div>
                <b>{ev?.title ?? 'Webinar'}</b>
                <div className="muted small">
                  {ev ? `${fmtDay(ev.event_date)}, ${clock(ev.start_time)} – ${clock(ev.end_time)}` : ''} · registered {at(r.created_at)}
                </div>
              </div>
              {cat && (
                <span className="stage-pill" style={{ ['--c' as string]: cat.color }}>
                  {cat.label}
                </span>
              )}
            </div>
            <div className="small">
              {!ended ? (
                <>Coming up{r.short_link || r.join_url ? <> · joining link <a href={r.short_link || r.join_url || '#'} target="_blank" rel="noreferrer">{r.short_link || r.join_url}</a></> : null}</>
              ) : z?.att.length ? (
                <>
                  Attended <b>{mins} min</b>
                  {z.att[0]?.join_time ? ` · joined ${at(z.att.map((a) => a.join_time).filter(Boolean).sort()[0] ?? null)}` : ''}
                  {z.att[0]?.leave_time ? ` · left ${at(z.att.map((a) => a.leave_time).filter(Boolean).sort().at(-1) ?? null)}` : ''}
                </>
              ) : (
                <span className="muted">Didn’t join (or Zoom’s data isn’t in yet)</span>
              )}
            </div>
            {(z?.com.length ?? 0) > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                {z!.com.map((c, i) => (
                  <div key={i} className="small">
                    <span className="badge badge-muted">{c.kind === 'qa' ? 'Q&A' : c.kind === 'poll' ? 'Poll' : 'Chat'}</span> {c.body}
                    {c.answer && <span className="muted"> → {c.answer}</span>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** Lead → Purchases: products they bought (entered by hand), paid in parts. */
export function PurchasesTab({
  purchases,
  canAdd,
  onAdd,
  onOpen,
  onChanged,
}: {
  purchases: Purchase[] | null
  canAdd: boolean
  onAdd: () => void
  onOpen: (p: Purchase) => void
  onChanged: (msg: string) => void
}) {
  const [removing, setRemoving] = useState<Purchase | null>(null)
  const [error, setError] = useState<string | null>(null)
  const live = (purchases ?? []).filter((p) => p.status === 'active')
  const total = live.reduce((s, p) => s + Number(p.total_amount), 0)
  const paid = live.reduce((s, p) => s + Number(p.paid_amount), 0)
  return (
    <div className="stack">
      {error && <div className="alert alert-error small">{error}</div>}
      <div className="row-between">
        <span className="muted small">
          {live.length} purchase{live.length === 1 ? '' : 's'} · {money(total)} · paid {money(paid)} · balance {money(Math.max(0, total - paid))}
        </span>
        {canAdd && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}>
            <ShoppingBag size={14} /> Add purchase
          </button>
        )}
      </div>
      {!purchases ? (
        <div className="muted small">Loading…</div>
      ) : !purchases.length ? (
        <div className="muted small">No purchases yet.</div>
      ) : (
        <Paged rows={purchases}>
          {(paged) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Paid</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                    {canAdd && <th />}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((p) => (
                    <tr key={p.id} className="is-clickable" onClick={() => onOpen(p)}>
                      <td>
                        <b>{p.name}</b>
                        {p.notes && <div className="muted small">{p.notes}</div>}
                      </td>
                      <td className="nowrap">
                        {fmtDay(p.purchase_date)}
                        <div className="muted small">Added {at(p.created_at)}</div>
                      </td>
                      <td className="nowrap" style={{ textAlign: 'right' }}>{money(p.total_amount)}</td>
                      <td className="nowrap" style={{ textAlign: 'right' }}>{money(p.paid_amount)}</td>
                      <td className="nowrap" style={{ textAlign: 'right' }}>{money(Math.max(0, Number(p.total_amount) - Number(p.paid_amount)))}</td>
                      {canAdd && (
                        <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn btn-ghost btn-icon danger-text" title="Delete" onClick={() => setRemoving(p)}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Paged>
      )}
      <ConfirmModal
        open={!!removing}
        icon={Trash2}
        danger
        title="Delete this purchase?"
        message={removing ? `“${removing.name}” and its payments are removed. If it was their only paid purchase, the lead is no longer a customer.` : ''}
        confirmLabel="Delete"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const p = removing
          setRemoving(null)
          if (!p) return
          try {
            await deletePurchase(p.id)
            onChanged(`${p.name} deleted.`)
          } catch (e) {
            setError((e as Error).message)
          }
        }}
      />
    </div>
  )
}
