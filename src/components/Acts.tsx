import type { MouseEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'

/**
 * A list row's actions, the same everywhere: one line at the end of the row, 32px icon buttons, each with its name as a
 * tooltip; the row's main action (at most one) is filled in the brand colour; delete is red.
 * Clicks don't open the row.
 */
export function Acts({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('acts', className)} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  )
}

type ActProps = {
  icon: LucideIcon
  /** the action's name: tooltip and screen-reader label (and the text of a main action) */
  label: string
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  tone?: 'danger' | 'success'
  /** the row's main action: filled in the brand colour */
  main?: boolean
  /** spinning icon (busy) */
  spin?: boolean
  /** an app page (router link) */
  to?: string
  /** an outside link (tel:, https:) */
  href?: string
  target?: string
}

export function Act({ icon: Icon, label, onClick, disabled, tone, main, spin, to, href, target }: ActProps) {
  // every action the same: a 32px icon button with its name as a tooltip; the row's main action is filled (brand colour)
  const cls = cn('act', main ? 'is-main' : tone && `is-${tone}`)
  const inner = <Icon size={16} className={cn(spin && 'spin')} />
  if (to)
    return (
      <Link className={cls} to={to} target={target} title={label} aria-label={label} onClick={(e) => e.stopPropagation()}>
        {inner}
      </Link>
    )
  if (href)
    return (
      <a className={cls} href={href} target={target} rel={target ? 'noreferrer' : undefined} title={label} aria-label={label} onClick={(e) => e.stopPropagation()}>
        {inner}
      </a>
    )
  return (
    <button type="button" className={cls} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      {inner}
    </button>
  )
}
