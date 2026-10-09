import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useClickOutside } from '@/lib/useClickOutside'

export type SearchOption = { value: string; label: string }

/**
 * Dropdown with a search box. Looks like the other fields (slim, thin brand border on focus).
 * - `allowCustom`: if nothing matches, offer to use what was typed (e.g. a small town not in the list)
 */
export function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  disabled,
  allowCustom,
  emptyText = 'No matches',
}: {
  id?: string
  value: string | null
  onChange: (value: string | null) => void
  options: SearchOption[]
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  allowCustom?: boolean
  emptyText?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])
  useClickOutside(ref, open, close)

  const selected = options.find((o) => o.value === value)
  const label = selected?.label ?? value ?? ''

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    const starts = options.filter((o) => o.label.toLowerCase().startsWith(q))
    const contains = options.filter((o) => !o.label.toLowerCase().startsWith(q) && o.label.toLowerCase().includes(q))
    return [...starts, ...contains]
  }, [options, query])

  const custom =
    allowCustom && query.trim() && !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase())
  const items: SearchOption[] = custom
    ? [...filtered, { value: query.trim(), label: `Use “${query.trim()}”` }]
    : filtered

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function pick(o: SearchOption) {
    onChange(o.value)
    close()
  }

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setActive(0)
          setOpen((o) => !o)
        }}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white pr-3 pl-3 text-left text-[13px] outline-none transition-colors',
          'focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand disabled:cursor-not-allowed disabled:bg-gray-50',
          open && 'border-brand ring-1 ring-brand',
        )}
      >
        <span className={cn('truncate', label ? 'text-gray-900' : 'text-gray-400')}>{label || placeholder}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-gray-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          data-popover
          className="absolute top-11 right-0 left-0 z-50 rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          <div className="relative border-b border-gray-100 p-2">
            <Search className="pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={query}
              placeholder={searchPlaceholder}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActive((a) => Math.min(a + 1, items.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActive((a) => Math.max(a - 1, 0))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  if (items[active]) pick(items[active])
                } else if (e.key === 'Escape') {
                  // close only this dropdown, not the panel / pop-up it sits in
                  e.preventDefault()
                  e.stopPropagation()
                  close()
                }
              }}
              className="h-8 w-full rounded-md border border-gray-200 pr-2 pl-8 text-[13px] outline-none focus:border-brand"
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {items.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-gray-500">{emptyText}</li>
            ) : (
              items.map((o, i) => {
                const isSelected = o.value === value
                return (
                  <li key={`${o.value}-${i}`} data-index={i} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(o)}
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px]',
                        i === active && 'bg-gray-50',
                        isSelected && 'font-semibold text-brand',
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {isSelected && <Check className="size-4 shrink-0" />}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
