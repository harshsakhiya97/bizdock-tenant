// Shared building blocks from the theme kit.
import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Inbox, Search, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Modal } from './Modal'

export function PageHead({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="row-between page-top">
      <div className="page-head">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row page-actions">{actions}</div>}
    </div>
  )
}

export type Tone = 'ink' | 'brand' | 'info' | 'warning' | 'success' | 'danger' | 'teal' | 'purple' | 'orange'
const TONES: Record<Tone, [string, string]> = {
  ink: ['var(--ink)', '#fff'],
  brand: ['var(--brand-soft)', 'var(--brand)'],
  info: ['var(--info-soft)', 'var(--info)'],
  warning: ['var(--warning-soft)', 'var(--warning)'],
  success: ['var(--success-soft)', 'var(--success)'],
  danger: ['var(--danger-soft)', 'var(--danger)'],
  teal: ['var(--teal-soft)', 'var(--teal)'],
  purple: ['var(--purple-soft)', 'var(--purple)'],
  orange: ['var(--orange-soft)', 'var(--orange)'],
}

export function StatCard({
  icon: Icon,
  value,
  label,
  hint,
  tone = 'ink',
}: {
  icon: LucideIcon
  value: ReactNode
  label: string
  hint?: string
  tone?: Tone
}) {
  const [bg, fg] = TONES[tone]
  return (
    <div className="stat">
      <div className="stat-icon" style={{ background: bg, color: fg }}>
        <Icon size={16} strokeWidth={2} />
      </div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  )
}

export function Tabs({
  tabs,
  value,
  onChange,
  count,
}: {
  tabs: string[]
  value: string
  onChange?: (t: string) => void
  count?: ReactNode
}) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t} type="button" className={cn('tab', value === t && 'is-active')} onClick={() => onChange?.(t)}>
          {t}
        </button>
      ))}
      {count != null && <span className="badge badge-brand">{count}</span>}
    </div>
  )
}

export function SearchInput({
  placeholder = 'Search',
  value,
  onChange,
  width = 240,
}: {
  placeholder?: string
  value: string
  onChange: (v: string) => void
  width?: number
}) {
  return (
    <div className="input-wrap" style={{ width }}>
      <Search size={15} />
      <input
        className="input input-sm"
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function Empty({ icon: Icon = Inbox, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="empty">
      <Icon size={28} />
      <div>{children}</div>
    </div>
  )
}

export type Column<T> = { key: string; label: string; render: (row: T) => ReactNode; align?: 'right' }

/** Table with the kit's "Showing x–y of n" footer and pager. `bare`: no card around it (inside a .panel). */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty = 'Nothing here yet.',
  pageSize = 20,
  onRowClick,
  bare,
}: {
  columns: Column<T>[]
  rows: T[]
  empty?: ReactNode
  pageSize?: number
  onRowClick?: (row: T) => void
  bare?: boolean
}) {
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(pageSize)
  const pages = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(page, pages)
  const slice = rows.slice((current - 1) * perPage, current * perPage)
  return (
    <div className={bare ? undefined : 'card'}>
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} style={c.align ? { textAlign: c.align } : undefined}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => (
                  <tr
                    key={r.id}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={onRowClick ? 'is-clickable' : undefined}
                  >
                    {columns.map((c) => (
                      <td key={c.key} style={c.align ? { textAlign: c.align } : undefined}>
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PageFoot
            total={rows.length}
            page={current}
            perPage={perPage}
            onPage={setPage}
            onPerPage={(n) => {
              setPerPage(n)
              setPage(1)
            }}
          />
        </>
      )}
    </div>
  )
}

/** Small centred confirm box ("Ready to leave?"). */
export function ConfirmModal({
  open,
  icon: Icon,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  icon?: LucideIcon
  title: ReactNode
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel}>
      {Icon && (
        <div
          className="modal-icon"
          style={danger ? { background: 'var(--danger-soft)', color: 'var(--danger)' } : undefined}
        >
          <Icon size={22} />
        </div>
      )}
      <h3>{title}</h3>
      <p>{message}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={cn('btn', danger ? 'btn-danger' : 'btn-primary')}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

/** the page numbers to show: all when few, else first, last and the ones around the current page (… between) */
function pageList(current: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const from = Math.max(2, current - 1)
  const to = Math.min(pages - 1, current + 1)
  if (from > 2) out.push('…')
  for (let n = from; n <= to; n++) out.push(n)
  if (to < pages - 1) out.push('…')
  out.push(pages)
  return out
}

/** Under a list: "Showing 1–20 of 79", rows per page, and the pages. */
export function PageFoot({
  total,
  page,
  perPage,
  onPage,
  onPerPage,
  sizes = [10, 20, 50, 100],
}: {
  total: number
  page: number
  perPage: number
  onPage: (n: number) => void
  onPerPage: (n: number) => void
  sizes?: number[]
}) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  const current = Math.min(page, pages)
  return (
    <div className="table-foot">
      <span className="page-foot-info">
        Showing {total === 0 ? 0 : (current - 1) * perPage + 1}–{Math.min(current * perPage, total)} of {total}
        <label className="page-size">
          Rows
          <select className="input input-sm" value={perPage} onChange={(e) => onPerPage(Number(e.target.value))} aria-label="Rows per page">
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </span>
      {pages > 1 && (
        <div className="pager">
          <button type="button" onClick={() => onPage(Math.max(1, current - 1))} disabled={current === 1} aria-label="Previous">
            <ChevronLeft size={14} />
          </button>
          {pageList(current, pages).map((n, i) =>
            n === '…' ? (
              <span key={`gap${i}`} className="pager-gap">
                …
              </span>
            ) : (
              <button key={n} type="button" className={n === current ? 'is-active' : ''} onClick={() => onPage(n)}>
                {n}
              </button>
            ),
          )}
          <button type="button" onClick={() => onPage(Math.min(pages, current + 1))} disabled={current === pages} aria-label="Next">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The standard list paging: 20 a page, a Rows dropdown and the pages under the list.
 * `children` gets the rows of the current page; back to page 1 when the list's length or `reset` changes.
 */
export function Paged<T>({ rows, reset, children }: { rows: T[]; reset?: unknown; children: (rows: T[]) => ReactNode }) {
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const key = `${rows.length}|${typeof reset === 'object' ? JSON.stringify(reset) : String(reset ?? '')}`
  const [seen, setSeen] = useState(key)
  if (key !== seen) {
    setSeen(key)
    setPage(1)
  }
  const pages = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(page, pages)
  return (
    <>
      {children(rows.slice((current - 1) * perPage, current * perPage))}
      <PageFoot
        total={rows.length}
        page={current}
        perPage={perPage}
        onPage={setPage}
        onPerPage={(n) => {
          setPerPage(n)
          setPage(1)
        }}
      />
    </>
  )
}
