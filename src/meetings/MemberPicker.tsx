import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { clock } from '@/components/SlotCalendar'
import { cn } from '@/lib/cn'
import type { MemberOption } from '@/leads/types'
import type { Busy } from './api'

/**
 * Team members of a meeting (several). Each one shows if they are free at the meeting's time, or busy in another
 * meeting (its time and kind). A busy member can still be added.
 */
export function MemberPicker({
  members,
  value,
  onChange,
  busy,
  checking,
  disabled,
}: {
  members: MemberOption[]
  value: string[]
  onChange: (ids: string[]) => void
  /** null: the time isn't picked yet */
  busy: Busy[] | null
  checking?: boolean
  disabled?: boolean
}) {
  const [q, setQ] = useState('')
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const clash = (id: string) => (busy ?? []).filter((b) => b.member_id === id)
  const list = members.filter((m) => !q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])

  const state = (id: string) => {
    if (busy === null) return null
    const c = clash(id)
    if (checking) return <span className="mp-state muted">Checking…</span>
    if (!c.length) return <span className="mp-state is-free">Available</span>
    return (
      <span className="mp-state is-busy" title={c.map((b) => `${clock(b.start_time)} – ${clock(b.end_time)} · ${b.label}`).join('\n')}>
        Busy · {clock(c[0].start_time)} – {clock(c[0].end_time)} {c[0].label}
        {c.length > 1 ? ` +${c.length - 1}` : ''}
      </span>
    )
  }

  return (
    <div className={cn('mp', disabled && 'is-disabled')}>
      {value.length > 0 && (
        <div className="mp-chips">
          {value.map((id) => {
            const busyNow = busy !== null && clash(id).length > 0
            return (
              <span key={id} className={cn('mp-chip', busyNow && 'is-busy')}>
                {byId.get(id)?.name ?? 'Team member'}
                {!disabled && (
                  <button type="button" aria-label="Remove" onClick={() => toggle(id)}>
                    <X size={12} />
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}
      {!disabled && (
        <>
          <input className="input input-sm" placeholder="Search team members…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mp-list">
            {list.map((m) => (
              <label key={m.id} className={cn('mp-row', value.includes(m.id) && 'is-on')}>
                <input type="checkbox" checked={value.includes(m.id)} onChange={() => toggle(m.id)} />
                <span className="mp-name">{m.name}</span>
                {state(m.id)}
              </label>
            ))}
            {!list.length && <div className="muted small" style={{ padding: 8 }}>No team member matches.</div>}
          </div>
        </>
      )}
    </div>
  )
}
