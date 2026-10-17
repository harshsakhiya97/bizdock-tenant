import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { TextInput } from '@/components/Field'
import { useAuth } from '@/auth/useAuth'
import { ago } from '@/team/time'
import { useTenant } from '@/tenant/useTenant'
import { listActivities, logActivity } from './api'
import type { ActivityRow, MemberOption } from './types'

/** A lead's history (stage moves, notes, follow-ups, bookings) with "add a note". */
export function ActivityLog({
  leadId,
  stageName,
  members,
  canNote,
  refreshKey = 0,
}: {
  leadId: string
  stageName: Map<string, string>
  members: MemberOption[]
  canNote: boolean
  refreshKey?: number
}) {
  const tenant = useTenant()
  const { membership } = useAuth()
  const [rows, setRows] = useState<ActivityRow[] | null>(null)
  const [note, setNote] = useState('')
  const load = useCallback(() => {
    listActivities(leadId)
      .then(setRows)
      .catch(() => setRows([]))
  }, [leadId])
  useEffect(load, [load, refreshKey])

  const who = (id: string | null) => (id ? (members.find((m) => m.id === id)?.name ?? 'Someone') : 'Webhook')
  const text = (a: ActivityRow) => {
    switch (a.kind) {
      case 'created':
        return `Lead added${a.to_stage_id ? ` in ${stageName.get(a.to_stage_id) ?? 'a stage'}` : ''}${!a.member_id ? ' from a landing page' : ''}`
      case 'stage':
        return `Moved ${stageName.get(a.from_stage_id ?? '') ?? '—'} → ${stageName.get(a.to_stage_id ?? '') ?? '—'}`
      case 'assigned':
        return 'Owner changed'
      case 'temperature':
        return 'Temperature changed'
      case 'follow_up':
        return 'Follow-up scheduled'
      case 'archived':
        return 'Archived'
      case 'restored':
        return 'Restored'
      case 'submission':
        return 'Form submitted again'
      case 'imported':
        return 'Imported'
      default:
        return 'Note'
    }
  }

  async function add() {
    if (!note.trim()) return
    await logActivity(tenant.id, membership?.id, [leadId], { kind: 'note', note: note.trim() })
    setNote('')
    load()
  }

  return (
    <div className="stack">
      {canNote && (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <TextInput placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
          <Button variant="dark" onClick={add} disabled={!note.trim()}>
            Add note
          </Button>
        </div>
      )}
      {!rows ? (
        <div className="muted small">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="muted small">Nothing yet.</div>
      ) : (
        <ol className="timeline">
          {rows.map((a) => (
            <li key={a.id}>
              <span className="tl-dot" />
              <div>
                <b>{text(a)}</b>
                {a.note && <p>{a.note}</p>}
                <small>
                  {who(a.member_id)} · {ago(a.created_at)}
                </small>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
