import { useEffect, useState } from 'react'
import { Coffee, LogIn, LogOut, Utensils } from 'lucide-react'
import { useTenant } from '@/tenant/useTenant'
import { breakAction, checkIn, checkOut, clock, hm, mins, workedMinutes, type AttRow, type AttSettings } from './api'

/** Check in / breaks / check out for the person using the app, today. */
export function TodayCard({
  row,
  settings,
  dayNote,
  compact,
  onChanged,
  onError,
}: {
  row: AttRow | undefined
  settings: AttSettings
  /** e.g. "Today is a holiday (Diwali)" */
  dayNote?: string | null
  compact?: boolean
  onChanged: (msg: string) => void
  onError: (msg: string) => void
}) {
  const tenant = useTenant()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  const now = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  const openBreak = row?.attendance_breaks.find((b) => !b.ended_at)
  async function run(fn: () => Promise<void>, msg: string) {
    setBusy(true)
    try {
      await fn()
      setNote('')
      onChanged(msg)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={compact ? 'att-today is-compact' : 'card card-pad att-today'}>
      {!compact && (
        <b>
          Today · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
        </b>
      )}
      <p className="muted small">
        Check-in window: <b>{settings.checkin_start} – {settings.checkin_end}</b>. Check-ins after it are marked <span className="text-danger">late</span>.
        {dayNote ? ` ${dayNote}` : ''}
      </p>

      {!row?.check_in ? (
        <div className="row att-actions">
          <input className="input input-sm" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Check-in note" />
          <button type="button" className="btn btn-success" disabled={busy} onClick={() => run(() => checkIn(tenant.id, note), 'Checked in.')}>
            <LogIn size={16} /> Check in · {now}
          </button>
        </div>
      ) : (
        <>
          <div className="att-facts">
            <span>
              In <b>{clock(row.check_in)}</b>
              {row.is_late && <span className="badge badge-warning">Late {row.late_minutes} min</span>}
            </span>
            {row.check_out && (
              <span>
                Out <b>{clock(row.check_out)}</b>
              </span>
            )}
            <span>
              Worked <b>{hm(workedMinutes(row))}</b>
            </span>
            {openBreak && (
              <span className="text-warning">
                On {openBreak.kind} break · {mins(openBreak.started_at, null)} min
              </span>
            )}
          </div>
          {!row.check_out && (
            <div className="row att-actions">
              {openBreak ? (
                <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(() => breakAction(tenant.id, 'end'), 'Break ended.')}>
                  End break
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(() => breakAction(tenant.id, 'tea'), 'Tea break started.')}>
                    <Coffee size={15} /> Tea break
                  </button>
                  <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(() => breakAction(tenant.id, 'lunch'), 'Lunch break started.')}>
                    <Utensils size={15} /> Lunch
                  </button>
                </>
              )}
              <button type="button" className="btn btn-dark" disabled={busy} onClick={() => run(() => checkOut(tenant.id), 'Checked out. See you tomorrow!')}>
                <LogOut size={15} /> Check out · {now}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
