import { useCallback, useRef, useState } from 'react'
import { Check, ChevronDown, Layers } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { cn } from '@/lib/cn'
import { useClickOutside } from '@/lib/useClickOutside'
import { useBusiness } from './useBusiness'

/** Top-bar picker: "All businesses" or one business. Every page filters by this. */
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
      <div className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium">
        <Layers className="size-4 text-gray-500" /> {label}
      </div>
    )
  }

  const options = [{ id: null as string | null, name: 'All businesses' }, ...businesses]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-lg bg-navy pr-2.5 pl-3 text-sm font-semibold text-white hover:bg-navy-hover"
      >
        <Layers className="size-4 opacity-80" />
        <span className="max-w-[220px] truncate">{label}</span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute top-11 right-0 z-40 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((o, i) => {
            const active = (selected?.id ?? null) === o.id
            return (
              <li key={o.id ?? 'all'}>
                <button
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    select(o.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between px-3.5 py-2 text-left text-sm hover:bg-gray-50',
                    active && 'font-semibold text-brand',
                    i === 0 && 'border-b border-gray-100',
                  )}
                >
                  {o.name}
                  {active && <Check className="size-4" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
