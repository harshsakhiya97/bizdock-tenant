import { useState } from 'react'
import { Button } from '@/components/Button'
import { TextArea } from '@/components/Field'
import { updateLeads } from './api'

/** the lead's one Description (leads.notes): a multi-line box, saved with Save */
export function LeadDescription({ leadId, value, canEdit, onSaved }: { leadId: string; value: string | null; canEdit: boolean; onSaved: (v: string | null) => void }) {
  const [text, setText] = useState(value ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = text.trim() !== (value ?? '').trim()

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const v = text.trim() || null
      await updateLeads([leadId], { notes: v })
      onSaved(v)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!canEdit) return <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{value || <span className="muted">—</span>}</p>
  return (
    <div className="stack" style={{ gap: 6 }}>
      <TextArea rows={4} placeholder="About this lead: what they need, budget, anything useful" value={text} onChange={(e) => setText(e.target.value)} />
      {(changed || error) && (
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" onClick={save} disabled={busy || !changed}>
            {busy ? 'Saving…' : 'Save description'}
          </Button>
          {changed && (
            <Button size="sm" variant="outline" onClick={() => setText(value ?? '')} disabled={busy}>
              Cancel
            </Button>
          )}
          {error && <span className="err-text">{error}</span>}
        </div>
      )}
    </div>
  )
}
