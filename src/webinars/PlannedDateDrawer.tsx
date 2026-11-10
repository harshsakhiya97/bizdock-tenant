import { useState } from 'react'
import { CalendarClock, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection } from '@/components/Field'
import { ConfirmModal } from '@/components/ui'
import { deletePlanned, repeatText, type PlannedSlot, type WebinarRow } from './api'
import { RescheduleDrawer } from './RescheduleDrawer'

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const clock = (t: string) => new Date(2000, 0, 1, ...(t.slice(0, 5).split(':').map(Number) as [number, number])).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

/**
 * A scheduled date of a repeating webinar (not made yet): it is made, with its Zoom meeting, when the date before it ends.
 * Delete: only this date, or this and every scheduled date after it.
 */
export function PlannedDateDrawer({
  webinar,
  slot,
  madeDates,
  canEdit,
  onClose,
  onEdit,
  onDeleted,
}: {
  webinar: WebinarRow
  slot: PlannedSlot
  /** the webinar's made dates (not called off) */
  madeDates: string[]
  canEdit: boolean
  onClose: () => void
  onEdit: () => void
  /** deleted or rescheduled */
  onDeleted: (msg: string) => void
}) {
  const date = slot.date
  const [removing, setRemoving] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [scope, setScope] = useState<'one' | 'after'>('one')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Drawer
      open
      width={560}
      onClose={onClose}
      title={`${webinar.title} · ${fmtDay(date)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {canEdit && (
            <div className="foot-end">
              <Button
                variant="ghost"
                className="danger-text"
                onClick={() => {
                  setScope('one')
                  setRemoving(true)
                }}
              >
                <Trash2 size={14} /> Delete
              </Button>
              <Button variant="outline" onClick={() => setRescheduling(true)}>
                <CalendarClock size={14} /> Reschedule
              </Button>
              <Button variant="outline" onClick={onEdit}>
                <Pencil size={14} /> Edit webinar
              </Button>
            </div>
          )}
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert alert-error small">{error}</div>}
        <FormSection title="Scheduled">
          <dl className="info-grid">
            <div>
              <dt>When</dt>
              <dd>
                {fmtDay(date)}, {clock(slot.start)} – {clock(slot.end)}
              </dd>
            </div>
            {slot.moved && slot.from && slot.from !== date && (
              <div>
                <dt>Rescheduled</dt>
                <dd>From {fmtDay(slot.from)}</dd>
              </div>
            )}
            <div>
              <dt>Repeats</dt>
              <dd>{repeatText(webinar)}</dd>
            </div>
          </dl>
          <div className="note" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <CalendarClock size={16} style={{ flex: 'none', marginTop: 1 }} />
            <span>Not made yet. This date, with its Zoom meeting, is made when the date before it ends; registrations for it start then.</span>
          </div>
        </FormSection>
      </div>

      {rescheduling && (
        <RescheduleDrawer
          webinar={webinar}
          from={{ date, start: slot.start, end: slot.end }}
          madeDates={madeDates}
          registered={0}
          onClose={() => setRescheduling(false)}
          onDone={onDeleted}
        />
      )}
      <ConfirmModal
        open={removing}
        icon={Trash2}
        danger
        busy={busy}
        title="Delete scheduled date?"
        message={
          <span style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', gap: 10 }}>
            <label className="radio-row">
              <input type="radio" checked={scope === 'one'} onChange={() => setScope('one')} />
              <span>
                <b>Only this date</b> ({fmtDay(date)}): it won’t be made; the dates after it stay.
              </span>
            </label>
            <label className="radio-row">
              <input type="radio" checked={scope === 'after'} onChange={() => setScope('after')} />
              <span>
                <b>This and all scheduled dates after it</b>: {webinar.repeat === 'weekly' ? 'the webinar stops before this date.' : 'none of these dates are made.'}
              </span>
            </label>
          </span>
        }
        confirmLabel="Delete"
        onCancel={() => setRemoving(false)}
        onConfirm={async () => {
          setBusy(true)
          try {
            await deletePlanned(webinar, date, scope)
            onDeleted(scope === 'one' ? `${webinar.title} · ${fmtDay(date)} deleted.` : `${webinar.title}: ${fmtDay(date)} and the dates after it deleted.`)
          } catch (e) {
            setRemoving(false)
            setError((e as Error).message)
          }
          setBusy(false)
        }}
      />
    </Drawer>
  )
}
