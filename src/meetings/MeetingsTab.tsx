import { CalendarPlus } from 'lucide-react'
import { clock, fmtDay } from '@/components/SlotCalendar'
import { MEETING_STATUS, MODE_LABEL, type MeetingRow } from './types'

/** Meetings of one lead (Paid Podcast guest). */
export function MeetingsTab({
  meetings,
  members = [],
  canAdd,
  onAdd,
  onOpen,
}: {
  meetings: MeetingRow[] | null
  members?: { id: string; name: string }[]
  canAdd: boolean
  onAdd: () => void
  onOpen: (m: MeetingRow) => void
}) {
  const sorted = [...(meetings ?? [])].sort((a, b) => (b.meeting_date + b.start_time).localeCompare(a.meeting_date + a.start_time))
  const live = sorted.filter((m) => m.status !== 'cancelled')
  return (
    <div className="stack">
      <div className="row-between">
        <span className="muted small">
          {live.length} meeting{live.length === 1 ? '' : 's'}
          {live.some((m) => m.status === 'qualified') ? ' · qualified' : live.some((m) => m.status === 'not_qualified') ? ' · not qualified' : ''}
        </span>
        {canAdd && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}>
            <CalendarPlus size={14} /> Add meeting
          </button>
        )}
      </div>
      {!meetings ? (
        <div className="muted small">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="muted small">No meetings yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Outcome</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => {
                const moved = (m.reschedules ?? []).length
                return (
                  <tr key={m.id} className="is-clickable" onClick={() => onOpen(m)}>
                    <td className="nowrap">
                      {fmtDay(m.meeting_date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {clock(m.start_time)} – {clock(m.end_time)}
                      {m.assigned_to && <div className="muted small">With {members.find((x) => x.id === m.assigned_to)?.name ?? 'a team member'}</div>}
                      {moved > 0 && <div className="muted small">Rescheduled {moved}×</div>}
                    </td>
                    <td>
                      {MODE_LABEL[m.mode]}
                      {m.mode === 'in_person' && m.location && <div className="muted small">{m.location}</div>}
                    </td>
                    <td>
                      <span className={`badge ${MEETING_STATUS[m.status].tone}`}>{MEETING_STATUS[m.status].label}</span>
                    </td>
                    <td className="muted small">{m.outcome_note ?? '—'}</td>
                    <td className="nowrap" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      {m.mode === 'online' && m.link?.startsWith('http') && (
                        <a className="btn btn-outline btn-sm" href={m.link} target="_blank" rel="noreferrer">
                          Join
                        </a>
                      )}{' '}
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => onOpen(m)}>
                        Open
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
