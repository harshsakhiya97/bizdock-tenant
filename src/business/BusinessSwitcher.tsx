import { useCallback, useRef, useState } from 'react'
import { Check, Layers } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { cn } from '@/lib/cn'
import { useClickOutside } from '@/lib/useClickOutside'
import { useBusiness } from './useBusiness'

/** Top-bar picker ("All businesses" or one business), styled as the kit's filled dropdown. */
export function BusinessSwitcher() {
  const { businesses } = useAuth()
  const { selected, sub, select, canSeeAll } = useBusiness()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useClickOutside(ref, open, close)

  if (businesses.length === 0) return null
  const label = sub ? `${selected?.name} · ${sub.name}` : (selected?.name ?? 'All businesses')
  // nothing to switch: one business with no sub-business or just one
  const single = !canSeeAll && businesses[0].subs.length <= 1

  if (single) {
    return (
      <div className="switcher-static">
        <Layers size={14} /> {label}
      </div>
    )
  }

  // businesses, each followed by its sub-businesses (indented)
  type Opt = { key: string; id: string | null; subId: string | null; name: string; isSub?: boolean }
  const options: Opt[] = [
    ...(canSeeAll ? [{ key: 'all', id: null, subId: null, name: 'All businesses' }] : []),
    ...businesses.flatMap((b): Opt[] =>
      // one sub-business: just that (the business "(all)" would be the same)
      b.subs.length === 1
        ? [{ key: b.subs[0].id, id: b.id, subId: b.subs[0].id, name: `${b.name} · ${b.subs[0].name}` }]
        : [
            { key: b.id, id: b.id, subId: null, name: b.subs.length ? `${b.name} (all)` : b.name },
            ...b.subs.map((s) => ({ key: s.id, id: b.id, subId: s.id, name: s.name, isSub: true })),
          ],
    ),
  ]

  return (
    <div ref={ref} className="switcher">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn('select-filled switcher-btn', selected && 'is-set')}
      >
        <Layers size={14} />
        <span>{label}</span>
      </button>
      {open && (
        <div role="listbox" className="multi-menu">
          {options.map((o) => {
            const active = (selected?.id ?? null) === o.id && (sub?.id ?? null) === o.subId
            return (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  select(o.id, o.subId)
                  setOpen(false)
                }}
                className={cn('multi-opt', active && 'is-on', o.id === null && 'is-all', o.isSub && 'is-sub')}
              >
                <span className="cell-clip">{o.name}</span>
                {active && <Check size={14} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
