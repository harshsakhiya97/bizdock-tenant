import type { MouseEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'

/**
 * A list row's actions, the same everywhere: one line at the end of the row, 32px buttons. Each action is an icon
 * with its name as a tooltip; the row's main action (at most one) is a small labelled button; delete is red.
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
  /** the row's main action: a small labelled button */
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
  const cls = cn(main ? 'act-main' : 'act', tone && `is-${tone}`)
  const inner = (
    <>
      <Icon size={main ? 14 : 16} className={cn(spin && 'spin')} />
      {main && <span>{label}</span>}
    </>
  )
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
