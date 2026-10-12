import { useState } from 'react'
import { Button } from '@/components/Button'
import { Hint, Label, Select, TextArea } from '@/components/Field'
import { Modal } from '@/components/Modal'
import type { StageRow } from '@/funnels/types'
import type { Option } from './types'

/** Asked when leads move into a stage that needs a note, or into a Lost stage. */
export function StageMoveModal({
  stage,
  count,
  lostReasons,
  onCancel,
  onConfirm,
}: {
  stage: StageRow
  count: number
  lostReasons: Option[]
  onCancel: () => void
  onConfirm: (note: string, lostReasonId: string | null) => void
}) {
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const lost = stage.kind === 'lost'

  function confirm() {
    if (stage.note_required && !note.trim()) return setError('Please write a note for this stage.')
    if (lost && !reason) return setError('Pick a lost reason.')
    onConfirm(note, reason || null)
  }

  return (
    <Modal
      open
      onClose={onCancel}
      width={480}
      title={`Move ${count === 1 ? 'lead' : `${count} leads`} to ${stage.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={confirm}>Move</Button>
          </div>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        {lost && (
          <div>
            <Label htmlFor="sm-reason" required>
              Lost reason
            </Label>
            <Select id="sm-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">— select —</option>
              {lostReasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="sm-note" required={stage.note_required}>
            Note
          </Label>
          <TextArea
            id="sm-note"
            rows={3}
            autoFocus
            placeholder="What happened? e.g. Spoke on call, sending the proposal today."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {stage.note_required && <Hint>A note is required when leads enter {stage.name}.</Hint>}
        </div>
      </div>
    </Modal>
  )
}
