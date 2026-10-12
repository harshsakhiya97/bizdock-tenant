import { Link } from 'react-router'
import { CalendarClock, Check, MessageCircle, Phone } from 'lucide-react'
import type { StageRow } from '@/funnels/types'
import { followUp as fmtDue } from '@/leads/labels'
import type { MemberOption, Option } from '@/leads/types'
import { cn } from '@/lib/cn'
import { lateBy, modeOf, telHref, waHref } from './labels'
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
  const member = (id: string | null) => members.find((m) => m.id === id)?.name
  return (
    <div className="table-wrap">
      <table className="table fu-table">
        <thead>
          <tr>
            <th>Due</th>
            <th>Lead</th>
            <th>Mode</th>
            <th>{compact ? 'Purpose' : 'Purpose / result'}</th>
            {!compact && <th>Status</th>}
            {!hideAssigned && <th>Assigned to</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
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
                  {f.purpose && <div>{f.purpose}</div>}
                  {f.status === 'done' && (
                    <div className="small">
                      <b className="tone-success">{outcomes.find((o) => o.id === f.outcome_id)?.name ?? 'Done'}</b>
                      {f.result_note && <span className="muted"> · {f.result_note}</span>}
                    </div>
                  )}
                  {!f.purpose && f.status !== 'done' && <span className="muted">—</span>}
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
                  <div className="row-actions" style={{ alignItems: 'center', gap: 4 }}>
                    {l && (
                      <>
                        <a className="btn btn-ghost btn-icon" href={telHref(l.phone)} title="Call" aria-label={`Call ${l.first_name}`}>
                          <Phone size={15} />
                        </a>
                        <a
                          className="btn btn-ghost btn-icon"
                          href={waHref(l.whatsapp || l.phone)}
                          target="_blank"
                          rel="noreferrer"
                          title="WhatsApp"
                          aria-label={`WhatsApp ${l.first_name}`}
                        >
                          <MessageCircle size={15} />
                        </a>
                      </>
                    )}
                    {canAct && f.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          title="Reschedule"
                          aria-label="Reschedule"
                          onClick={() => onReschedule(f)}
                        >
                          <CalendarClock size={15} />
                        </button>
                        <button type="button" className="btn btn-sm btn-success" onClick={() => onDone(f)}>
                          <Check size={14} /> Done
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
