import { useCallback, useRef, useState } from 'react'
import { Check, Layers } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { cn } from '@/lib/cn'
import { useClickOutside } from '@/lib/useClickOutside'
import { useBusiness } from './useBusiness'

/** Top-bar picker ("All businesses" or one business), styled as the kit's filled dropdown. */
export function BusinessSwitcher() {
  const { businesses } = useAuth()
  const { selected, select, canSeeAll } = useBusiness()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useClickOutside(ref, open, close)

  if (businesses.length === 0) return null
  const label = selected?.name ?? 'All businesses'

  // Only one business: show it, nothing to switch
  if (!canSeeAll) {
    return (
      <div className="switcher-static">
        <Layers size={14} /> {label}
      </div>
    )
  }

  const options = [{ id: null as string | null, name: 'All businesses' }, ...businesses]

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
            const active = (selected?.id ?? null) === o.id
            return (
              <button
                key={o.id ?? 'all'}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  select(o.id)
                  setOpen(false)
                }}
                className={cn('multi-opt', active && 'is-on', o.id === null && 'is-all')}
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
