import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useClickOutside } from '@/lib/useClickOutside'

/** `group`: a heading shown above the options that share it · `disabled`: shown, can't be picked */
export type SearchOption = { value: string; label: string; group?: string; disabled?: boolean }

/**
 * Dropdown with a search box: the trigger is a theme-kit .input, the list is the kit's .multi-menu.
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
  className,
  style,
  ariaLabel,
  title,
  name,
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
  /** extra classes on the trigger (e.g. input-sm filter-select) */
  className?: string
  style?: CSSProperties
  ariaLabel?: string
  title?: string
  /** a hidden input with this name carries the value in a form */
  name?: string
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
    // a search matches the label or its group
    const starts = options.filter((o) => o.label.toLowerCase().startsWith(q))
    const contains = options.filter((o) => !o.label.toLowerCase().startsWith(q) && (o.label.toLowerCase().includes(q) || (o.group ?? '').toLowerCase().includes(q)))
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
    if (o.disabled) return
    onChange(o.value)
    close()
  }

  return (
    <div ref={ref} className="ss" style={style?.width ? { width: style.width } : undefined}>
      {name && <input type="hidden" name={name} value={value ?? ''} />}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        title={title}
        style={style}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setActive(0)
          setOpen((o) => !o)
        }}
        className={cn('input ss-trigger', className, open && 'is-open')}
      >
        <span className={cn('ss-value', !label && 'ss-placeholder')}>{label || placeholder}</span>
        <ChevronDown size={15} />
      </button>

      {open && (
        <div data-popover className="multi-menu ss-menu">
          <div className="ss-search">
            <div className="input-wrap">
              <Search size={15} />
              <input
                autoFocus
                className="input input-sm"
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
              />
            </div>
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="ss-list">
            {items.length === 0 ? (
              <li className="ss-empty">{emptyText}</li>
            ) : (
              items.map((o, i) => {
                const isSelected = o.value === value
                const head = o.group && o.group !== items[i - 1]?.group ? o.group : null
                return (
                  <li key={`${o.value}-${i}`} data-index={i} role="option" aria-selected={isSelected} aria-disabled={o.disabled || undefined}>
                    {head && <div className="ss-group">{head}</div>}
                    <button
                      type="button"
                      disabled={o.disabled}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(o)}
                      className={cn('multi-opt', i === active && 'is-active', isSelected && 'is-on')}
                    >
                      <span className="cell-clip">{o.label}</span>
                      {isSelected && <Check size={14} />}
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
