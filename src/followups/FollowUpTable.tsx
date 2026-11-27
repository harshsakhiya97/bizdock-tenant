import { useState } from 'react'
import { Paged } from '@/components/ui'
import { Link } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { WhatsAppModal } from '@/bookings/WhatsAppModal'
import { fmtDay } from '@/leads/LeadPage'
import { CalendarClock, Check, MessageCircle, Phone } from 'lucide-react'
import type { StageRow } from '@/funnels/types'
import { followUp as fmtDue } from '@/leads/labels'
import type { MemberOption, Option } from '@/leads/types'
import { cn } from '@/lib/cn'
import { Act, Acts } from '@/components/Acts'
import { lateBy, modeOf, telHref } from './labels'
import type { FollowUpRow } from './types'

/** Follow-up rows with call / WhatsApp / done / reschedule actions. */
export function FollowUpTable({
  rows,
  stageById,
  members,
  outcomes,
  canAct,
  compact,
  hideAssigned,
  onDone,
  onReschedule,
}: {
  rows: FollowUpRow[]
  stageById: Map<string, StageRow>
  members: MemberOption[]
  outcomes: Option[]
  canAct: boolean
  compact?: boolean
  /** e.g. My Day → Mine: every row is the viewer's own */
  hideAssigned?: boolean
  onDone: (f: FollowUpRow) => void
  onReschedule: (f: FollowUpRow) => void
}) {
  const now = Date.now()
  const { businesses } = useAuth()
  // WhatsApp icon opens the message templates (same as on the lead page)
  const [wa, setWa] = useState<FollowUpRow | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const member = (id: string | null) => members.find((m) => m.id === id)?.name
  const wl = wa?.leads
  const waName = wl ? `${wl.first_name} ${wl.last_name ?? ''}`.trim() : ''
  return (
    <>
    {sent && <div className="alert alert-info">{sent}</div>}
    <Paged rows={rows}>
{(paged) => (
<div className="table-wrap">
      <table className="table fu-table">
        <thead>
          <tr>
            <th>Due</th>
            <th>Lead</th>
            <th>Mode</th>
            <th>Result</th>
            {!compact && <th>Status</th>}
            {!hideAssigned && <th>Assigned to</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {paged.map((f) => {
            const l = f.leads
            const s = l ? stageById.get(l.stage_id) : undefined
            const M = modeOf(f.mode)
            const overdue = f.status === 'pending' && new Date(f.due_at).getTime() < now
            const due = fmtDue(f.due_at)
            return (
              <tr key={f.id}>
                <td className="nowrap">
                  <div className={cn(overdue ? 'fu-overdue' : due.state === 'today' && 'fu-today')}>{due.text}</div>
                  {overdue && <span className="badge badge-danger">{lateBy(f.due_at)}</span>}
                </td>
                <td>
                  {l ? (
                    <>
                      <Link to={`/leads?open=${l.id}`} className="link strong">
                        {[l.first_name, l.last_name].filter(Boolean).join(' ')}
                      </Link>
                      <div className="muted small">
                        {l.phone}
                        {s && (
                          <>
                            {' · '}
                            <span style={{ color: s.color, fontWeight: 600 }}>{s.name}</span>
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="nowrap">
                  <span className="row" style={{ gap: 5 }}>
                    <M.icon size={14} className="muted" /> {M.label}
                  </span>
                </td>
                <td style={{ maxWidth: 320 }}>
                  {f.status === 'done' && (
                    <div className="small">
                      <b className="tone-success">{outcomes.find((o) => o.id === f.outcome_id)?.name ?? 'Done'}</b>
                      {f.result_note && <span className="muted"> · {f.result_note}</span>}
                    </div>
                  )}
                  {f.status !== 'done' && <span className="muted">—</span>}
                </td>
                {!compact && (
                  <td>
                    {f.status === 'pending' ? (
                      overdue ? (
                        <span className="badge badge-danger">Overdue</span>
                      ) : (
                        <span className="badge badge-info">Pending</span>
                      )
                    ) : f.status === 'done' ? (
                      <span className="badge badge-success">Done</span>
                    ) : (
                      <span className="badge badge-muted">{f.status === 'rescheduled' ? 'Rescheduled' : 'Cancelled'}</span>
                    )}
                  </td>
                )}
                {!hideAssigned && <td className="nowrap">{member(f.assigned_to) ?? <span className="muted">—</span>}</td>}
                <td>
                  <Acts>
                    {l && (
                      <>
                        <Act icon={Phone} label={`Call ${l.first_name}`} href={telHref(l.phone)} />
                        <Act icon={MessageCircle} label={`WhatsApp ${l.first_name}`} onClick={() => setWa(f)} />
                      </>
                    )}
                    {canAct && f.status === 'pending' && (
                      <>
                        <Act icon={CalendarClock} label="Reschedule" onClick={() => onReschedule(f)} />
                        <Act main tone="success" icon={Check} label="Done" onClick={() => onDone(f)} />
                      </>
                    )}
                  </Acts>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
)}
</Paged>
    {wa && wl && (
      <WhatsAppModal
        lead={{ id: wl.id, name: waName, phone: wl.phone, whatsapp: wl.whatsapp, subtitle: [wl.purpose, wl.required_on ? fmtDay(wl.required_on) : null].filter(Boolean).join(' · ') }}
        vars={{
          first_name: wl.first_name,
          name: waName,
          purpose: wl.purpose,
          required_on: wl.required_on ? fmtDay(wl.required_on) : null,
          business: businesses.find((b) => b.id === wl.business_id)?.name,
        }}
        defaultCategory="follow_up"
        onClose={() => setWa(null)}
        onSent={(msg) => {
          setWa(null)
          setSent(msg)
          setTimeout(() => setSent(null), 3000)
        }}
      />
    )}
    </>
  )
}
