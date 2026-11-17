import { useCallback, useEffect, useState } from 'react'
import { Paged } from '@/components/ui'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { useTenant } from '@/tenant/useTenant'
import { listSimple, saveSimple } from './api'
import { EVENT_KINDS, type SimpleRow, type SimpleTable } from './types'

type Draft = SimpleRow & { dirty?: boolean }

/** A master list edited in place: order, name, (colour), active. Entries are switched off, never deleted. */
export function SimpleList({
  table,
  title,
  description,
  canEdit,
  onNotice,
  reorder = false,
}: {
  table: SimpleTable
  title: string
  description: string
  canEdit: boolean
  onNotice: (n: { ok?: string; error?: string }) => void
  /** ↑ ↓ buttons instead of an order number (saved straight away) */
  reorder?: boolean
}) {
  const tenant = useTenant()
  const [rows, setRows] = useState<Draft[] | null>(null)
  const [adding, setAdding] = useState({ name: '', color: '#64748b', kind: 'event' })
  const [busy, setBusy] = useState<string | null>(null)
  const hasColor = table === 'customer_stages' || table === 'event_types'
  const hasKind = table === 'event_types'

  const load = useCallback(() => {
    listSimple(table, tenant.id)
      .then(setRows)
      .catch((e: Error) => onNotice({ error: e.message }))
  }, [table, tenant.id, onNotice])
  useEffect(load, [load])

  const edit = (id: string, patch: Partial<SimpleRow>) =>
    setRows((list) => (list ?? []).map((r) => (r.id === id ? { ...r, ...patch, dirty: true } : r)))

  async function save(r: Draft) {
    if (!r.name.trim()) return onNotice({ error: 'A name is required.' })
    setBusy(r.id)
    try {
      await saveSimple(table, tenant.id, r)
      onNotice({ ok: `${r.name.trim()} saved.` })
      load()
    } catch (e) {
      onNotice({ error: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  /** move a row up / down: it swaps places with its neighbour (the order is renumbered 1, 2, 3…) */
  async function move(r: Draft, dir: -1 | 1) {
    const list = [...(rows ?? [])]
    const i = list.findIndex((x) => x.id === r.id)
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    setBusy(r.id)
    try {
      await Promise.all(list.map((x, k) => (x.sort_order === k + 1 ? null : saveSimple(table, tenant.id, { ...x, sort_order: k + 1 }))))
      load()
    } catch (e) {
      onNotice({ error: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function add() {
    if (!adding.name.trim()) return
    setBusy('new')
    try {
      const next = Math.max(0, ...(rows ?? []).map((r) => r.sort_order)) + 1
      await saveSimple(table, tenant.id, { name: adding.name, color: adding.color, kind: adding.kind, is_active: true, sort_order: next })
      onNotice({ ok: `${adding.name.trim()} added.` })
      setAdding({ name: '', color: '#64748b', kind: 'event' })
      load()
    } catch (e) {
      onNotice({ error: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="panel-bar">
        <div>
          <b>{title}</b>
          <div className="muted small">{description} Switch an entry off instead of deleting it; past records keep it.</div>
        </div>
      </div>
      {!rows ? (
        <div className="empty">Loading…</div>
      ) : (
        <Paged rows={rows}>
{(paged) => (
<div className="table-wrap">
          <table className="table master-table">
            <thead>
              <tr>
                <th style={{ width: reorder ? 110 : 80 }}>Order</th>
                <th>Name</th>
                {hasKind && <th style={{ width: 170 }}>Kind</th>}
                {hasColor && <th style={{ width: 80 }}>Colour</th>}
                <th style={{ width: 80 }}>Active</th>
                {canEdit && <th style={{ width: 100 }} />}
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={r.id} className={r.is_active ? undefined : 'is-off'}>
                  <td>
                    {reorder ? (
                      <div className="row nowrap" style={{ gap: 2 }}>
                        <span className="muted small" style={{ width: 18 }}>{(rows ?? []).indexOf(r) + 1}</span>
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Move up" disabled={!canEdit || busy !== null || (rows ?? [])[0]?.id === r.id} onClick={() => void move(r, -1)}>
                          <ArrowUp size={14} />
                        </button>
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Move down" disabled={!canEdit || busy !== null || (rows ?? []).at(-1)?.id === r.id} onClick={() => void move(r, 1)}>
                          <ArrowDown size={14} />
                        </button>
                      </div>
                    ) : (
                    <input
                      className="input input-sm"
                      type="number"
                      value={r.sort_order}
                      disabled={!canEdit}
                      onChange={(e) => edit(r.id, { sort_order: Number(e.target.value) })}
                      aria-label={`Order of ${r.name}`}
                    />
                    )}
                  </td>
                  <td>
                    <input
                      className="input input-sm"
                      value={r.name}
                      disabled={!canEdit}
                      onChange={(e) => edit(r.id, { name: e.target.value })}
                      aria-label="Name"
                    />
                  </td>
                  {hasKind && (
                    <td>
                      <select className="input input-sm" value={r.kind ?? 'event'} disabled={!canEdit} onChange={(e) => edit(r.id, { kind: e.target.value })} aria-label={`Kind of ${r.name}`}>
                        {EVENT_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  {hasColor && (
                    <td>
                      <input
                        type="color"
                        className="color-input"
                        value={r.color ?? '#64748b'}
                        disabled={!canEdit}
                        onChange={(e) => edit(r.id, { color: e.target.value })}
                        aria-label={`Colour of ${r.name}`}
                      />
                    </td>
                  )}
                  <td>
                    <input
                      type="checkbox"
                      className="am-check"
                      checked={r.is_active}
                      disabled={!canEdit}
                      onChange={(e) => edit(r.id, { is_active: e.target.checked })}
                      aria-label={`${r.name} active`}
                    />
                  </td>
                  {canEdit && (
                    <td className="right">
                      {r.dirty && (
                        <button type="button" className="btn btn-primary btn-sm" disabled={busy === r.id} onClick={() => save(r)}>
                          Save
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {canEdit && (
                <tr className="master-add">
                  <td />
                  <td>
                    <input
                      className="input input-sm"
                      placeholder="New entry"
                      value={adding.name}
                      onChange={(e) => setAdding((a) => ({ ...a, name: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && add()}
                      aria-label="New entry"
                    />
                  </td>
                  {hasKind && (
                    <td>
                      <select className="input input-sm" value={adding.kind} onChange={(e) => setAdding((a) => ({ ...a, kind: e.target.value }))} aria-label="Kind of the new entry">
                        {EVENT_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  {hasColor && (
                    <td>
                      <input
                        type="color"
                        className="color-input"
                        value={adding.color}
                        onChange={(e) => setAdding((a) => ({ ...a, color: e.target.value }))}
                        aria-label="Colour of the new entry"
                      />
                    </td>
                  )}
                  <td />
                  <td className="right">
                    <button type="button" className="btn btn-outline btn-sm" disabled={!adding.name.trim() || busy === 'new'} onClick={add}>
                      <Plus size={14} /> Add
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
)}
</Paged>
      )}
    </>
  )
}
