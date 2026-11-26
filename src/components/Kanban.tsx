import { useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type KanbanCol = { key: string; label: string; color: string }

const PAGE = 50

/**
 * A board: one column per step, each card in the column its record has reached. Dragging a card to a later column
 * calls onDrop (which opens that step's popup); a card can't be dragged back. Long columns show 50 cards at a time.
 */
export function Kanban<T>({
  cols,
  items,
  keyOf,
  colOf,
  card,
  canDrop,
  onDrop,
  onOpen,
  emptyText = 'Nothing here',
}: {
  cols: KanbanCol[]
  items: T[]
  keyOf: (x: T) => string
  colOf: (x: T) => string
  card: (x: T) => ReactNode
  /** may this card be dropped on that column (a later one, and the person may do that step) */
  canDrop: (x: T, to: string) => boolean
  onDrop: (x: T, to: string) => void
  onOpen: (x: T) => void
  emptyText?: string
}) {
  const [over, setOver] = useState<string | null>(null)
  const [shown, setShown] = useState<Record<string, number>>({})
  const drag = useRef<T | null>(null)
  const idx = (k: string) => cols.findIndex((c) => c.key === k)
  const allowed = (x: T, to: string) => idx(to) > idx(colOf(x)) && canDrop(x, to)

  return (
    <div className="board">
      {cols.map((c) => {
        const list = items.filter((x) => colOf(x) === c.key)
        const n = shown[c.key] ?? PAGE
        return (
          <section
            key={c.key}
            className={cn('board-col', over === c.key && 'is-over')}
            onDragOver={(e) => {
              if (!drag.current || !allowed(drag.current, c.key)) return
              e.preventDefault()
              setOver(c.key)
            }}
            onDragLeave={() => setOver((o) => (o === c.key ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              const x = drag.current
              drag.current = null
              if (x && allowed(x, c.key)) onDrop(x, c.key)
            }}
          >
            <header className="board-head" style={{ ['--c' as string]: c.color }}>
              <span className="board-title">{c.label}</span>
              <span className="badge badge-muted">{list.length.toLocaleString('en-IN')}</span>
            </header>
            <div className="board-cards">
              {list.slice(0, n).map((x) => (
                <article
                  key={keyOf(x)}
                  className="board-card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', keyOf(x))
                    e.dataTransfer.effectAllowed = 'move'
                    drag.current = x
                  }}
                  onDragEnd={() => {
                    drag.current = null
                    setOver(null)
                  }}
                  onClick={() => onOpen(x)}
                >
                  {card(x)}
                </article>
              ))}
              {list.length > n && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShown((s) => ({ ...s, [c.key]: n + PAGE }))}>
                  Show more ({(list.length - n).toLocaleString('en-IN')})
                </button>
              )}
              {list.length === 0 && <div className="board-empty">{emptyText}</div>}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** List / Board switch, remembered per person (this browser) */
export function useBoardView(key: string): ['list' | 'board', (v: 'list' | 'board') => void] {
  const [v, setV] = useState<'list' | 'board'>(() => {
    try {
      return localStorage.getItem(`view:${key}`) === 'board' ? 'board' : 'list'
    } catch {
      return 'list'
    }
  })
  const set = (x: 'list' | 'board') => {
    setV(x)
    try {
      localStorage.setItem(`view:${key}`, x)
    } catch {
      /* private window: not remembered */
    }
  }
  return [v, set]
}
