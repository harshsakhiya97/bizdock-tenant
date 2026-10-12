import { useRef, useState } from 'react'
import type { FunnelRow, StageRow } from '@/funnels/types'
import { cn } from '@/lib/cn'
import { followUp, fullName, money, tempOf } from './labels'
import type { LeadRow, MemberOption } from './types'

/** Kanban: one column per stage; drag a card to another column to move it. */
export function LeadBoard({
  funnel,
  leads,
  members,
  canMove,
  onOpen,
  onMove,
}: {
  funnel: FunnelRow
  leads: LeadRow[]
  members: MemberOption[]
  canMove: boolean
  onOpen: (l: LeadRow) => void
  onMove: (l: LeadRow, stage: StageRow) => void
}) {
  const [over, setOver] = useState<string | null>(null)
  const dragId = useRef<string | null>(null)
  const owner = (id: string | null) => members.find((m) => m.id === id)?.name

  return (
    <div className="board">
      {funnel.funnel_stages.map((s) => {
        const items = leads.filter((l) => l.stage_id === s.id)
        const total = items.reduce((sum, l) => sum + (Number(l.estimated_amount) || 0), 0)
        return (
          <section
            key={s.id}
            className={cn('board-col', over === s.id && 'is-over')}
            onDragOver={(e) => {
              if (!canMove) return
              e.preventDefault()
              setOver(s.id)
            }}
            onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              const id = dragId.current ?? e.dataTransfer.getData('text/plain')
              dragId.current = null
              const lead = leads.find((l) => l.id === id)
              if (lead && lead.stage_id !== s.id) onMove(lead, s)
            }}
          >
            <header className="board-head" style={{ ['--c' as string]: s.color }}>
              <span className="board-title">{s.name}</span>
              <span className="badge badge-muted">{items.length}</span>
              {total > 0 && <small>{money(total)}</small>}
            </header>
            <div className="board-cards">
              {items.map((l) => {
                const t = tempOf(l.temperature)
                const fu = followUp(l.next_follow_up_at)
                return (
                  <article
                    key={l.id}
                    className="board-card"
                    draggable={canMove}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', l.id)
                      e.dataTransfer.effectAllowed = 'move'
                      dragId.current = l.id
                    }}
                    onDragEnd={() => (dragId.current = null)}
                    onClick={() => onOpen(l)}
                  >
                    <div className="row-between" style={{ gap: 6 }}>
                      <b className="cell-clip">{fullName(l)}</b>
                      {t && <span className={cn('badge', t.tone)}>{t.label}</span>}
                    </div>
                    <small className="muted">
                      {l.phone}
                      {l.city ? ` · ${l.city}` : ''}
                    </small>
                    <div className="row-between small" style={{ gap: 6 }}>
                      <span className="muted cell-clip">{owner(l.owner_id) ?? 'Unassigned'}</span>
                      {l.estimated_amount != null && <span className="num">{money(l.estimated_amount)}</span>}
                    </div>
                    {fu.state !== 'none' && (
                      <span className={cn('small fu', `fu-${fu.state}`)}>Follow-up {fu.text}</span>
                    )}
                  </article>
                )
              })}
              {items.length === 0 && <div className="board-empty">Drop leads here</div>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
