import { useCallback, useEffect, useState } from 'react'
import { PhoneOutgoing } from 'lucide-react'
import { Drawer } from '@/components/Drawer'
import { Empty, Paged } from '@/components/ui'
import type { MemberOption } from '@/leads/types'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { listAiCalls, resultOf, rupees, secs, type AiCall } from './api'
import { CallDrawer } from './CallDrawer'
import { CallForm } from './CallForm'

/** Call from AI on a lead: the template, Call now; then the call opens (it follows the call live) */
export function CallFromAiDrawer({ lead, onClose, onPlaced }: { lead: { id: string; name: string; phone: string }; onClose: () => void; onPlaced: (c: AiCall) => void }) {
  return (
    <Drawer open onClose={onClose} width={520} title={`Call from AI · ${lead.name}`}>
      <CallForm lead={lead} onPlaced={onPlaced} />
    </Drawer>
  )
}

/** Lead → AI Calls: the lead's AI calls and their results */
export function LeadAiCalls({ leadId, members, refreshKey, onCount }: { leadId: string; members: MemberOption[]; refreshKey?: number; onCount?: (n: number) => void }) {
  const tenant = useTenant()
  const [calls, setCalls] = useState<AiCall[] | null>(null)
  const [open, setOpen] = useState<AiCall | null>(null)
  const load = useCallback(() => {
    listAiCalls(tenant.id, { leadId }).then(
      (c) => {
        setCalls(c)
        onCount?.(c.length)
      },
      () => setCalls([]),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id, leadId])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [load, refreshKey])
  useEffect(() => {
    if (!calls?.some((c) => !c.final)) return
    const t = window.setInterval(load, 15_000)
    return () => window.clearInterval(t)
  }, [calls, load])

  if (!calls) return <div className="empty">Loading…</div>
  if (!calls.length) return <Empty icon={PhoneOutgoing}>No AI calls yet. Use Call from AI above.</Empty>
  return (
    <>
      <Paged rows={calls}>
        {(paged) => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
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
                      <td className="nowrap">{new Date(c.placed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                      <td className="small">{c.objective_name ?? '—'}</td>
                      <td>
                        <span className={cn('badge', r.tone)}>{r.label}</span>
                      </td>
                      <td className="small" style={{ maxWidth: 360 }}>
                        <div className="cell-clip" title={c.summary ?? ''}>
                          {c.summary ?? c.error ?? <span className="muted">—</span>}
                        </div>
                      </td>
                      <td className="num">{secs(c.talk_seconds)}</td>
                      <td className="num">{rupees(c.cost)}</td>
                      <td className="small">{c.via === 'workflow' ? 'Workflow' : (members.find((m) => m.id === c.member_id)?.name ?? '—')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Paged>
      {open && <CallDrawer key={open.id} call={open} memberName={(id) => members.find((m) => m.id === id)?.name} onClose={() => (setOpen(null), load())} />}
    </>
  )
}
