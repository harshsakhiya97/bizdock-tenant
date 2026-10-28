import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { LEAD_TARGETS } from './fieldMap'

const parentOf = (k: string) => (k.includes('.') ? k.slice(0, k.lastIndexOf('.')) : '')
const leafOf = (k: string) => (k.includes('.') ? k.slice(k.lastIndexOf('.') + 1) : k)
const pathLabel = (p: string) => (p ? p.split('.').join(' › ') : 'Top level')
const clip = (v: string | undefined) => (v == null || v === '' ? '(empty)' : v.length > 40 ? `${v.slice(0, 40)}…` : v)

/**
 * Mapping for a request with objects inside (booking tools, payment gateways): for each lead field,
 * pick the object (dropdown 1) and the field inside it (dropdown 2). Fields not picked are left out.
 */
export function PickPerField({
  keys,
  sample,
  map,
  targets,
  canEdit,
  onChange,
}: {
  keys: string[]
  sample: Record<string, string> | null
  map: Record<string, string>
  /** lead fields this webhook can fill */
  targets: { value: string; label: string }[]
  canEdit: boolean
  onChange: (next: Record<string, string>) => void
}) {
  const parents = useMemo(() => [...new Set(keys.map(parentOf))].sort((a, b) => a.split('.').length - b.split('.').length || a.localeCompare(b)), [keys])
  const sourceOf = (t: string) => keys.find((k) => map[k] === t) ?? null
  // dropdown 1 picked before dropdown 2 (no field chosen yet)
  const [pickedParent, setPickedParent] = useState<Record<string, string>>({})
  const [newExtras, setNewExtras] = useState<string[]>([])

  /** the field `k` (or none) now fills `t`; whatever filled it before is left out */
  function assign(t: string, k: string | null) {
    const next: Record<string, string> = {}
    for (const [key, v] of Object.entries(map)) if (v !== t) next[key] = v
    if (k) next[k] = t
    onChange(next)
  }

  // a plain function (not a component), so the name inputs keep focus while typing
  function row({ id, label, t, extra, onPicked }: { id: string; label: React.ReactNode; t: string; extra?: React.ReactNode; onPicked?: () => void }) {
    const src = sourceOf(t)
    const parent = src != null ? parentOf(src) : (pickedParent[id] ?? '')
    const leaves = keys.filter((k) => parentOf(k) === parent)
    return (
      <tr key={id}>
        <td>
          <div className="ppf-pick">
            <select
              className="input input-sm"
              aria-label={`Object for ${t}`}
              value={parent}
              disabled={!canEdit}
              onChange={(e) => {
                setPickedParent((p) => ({ ...p, [id]: e.target.value }))
                if (src) assign(t, null)
              }}
            >
              {parents.map((p) => (
                <option key={p} value={p}>
                  {pathLabel(p)}
                </option>
              ))}
            </select>
            <select
              className="input input-sm"
              aria-label={`Field for ${t}`}
              value={src ?? ''}
              disabled={!canEdit}
              onChange={(e) => {
                assign(t, e.target.value || null)
                if (e.target.value) onPicked?.()
              }}
            >
              <option value="">— not used —</option>
              {leaves.map((k) => (
                <option key={k} value={k}>
                  {leafOf(k)} · {clip(sample?.[k])}
                </option>
              ))}
            </select>
          </div>
        </td>
        <td className="muted small">
          <span className="cell-clip" style={{ maxWidth: 240 }}>
            {src ? clip(sample?.[src]) : '—'}
          </span>
        </td>
        <td>
          <div className="ppf-target">
            {label}
            {extra}
          </div>
        </td>
      </tr>
    )
  }

  // extra fields picked so far ("extra:<name>"), then rows still being set up
  const extras = Object.entries(map).filter(([, v]) => v === 'extra' || v.startsWith('extra:'))
  const nameOf = (k: string, v: string) => (v.startsWith('extra:') ? v.slice(6) : leafOf(k))

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="table-wrap">
        <table className="table table-compact ppf-table">
          <thead>
            <tr>
              <th>Field sent by the form</th>
              <th>Test value</th>
              <th>Saved on the lead as</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => row({ id: t.value, t: t.value, label: t.label }))}
          </tbody>
        </table>
      </div>

      <div>
        <span className="field-label">Extra fields (saved on the lead under your name)</span>
        <div className="table-wrap">
          <table className="table table-compact ppf-table">
            <tbody>
              {extras.map(([k, v]) =>
                row({
                  id: `x-${k}`,
                  t: v,
                  label: (
                    <input
                      className="input input-sm"
                      aria-label="Extra field name"
                      value={nameOf(k, v)}
                      disabled={!canEdit}
                      onChange={(e) => onChange({ ...map, [k]: `extra:${e.target.value}` })}
                    />
                  ),
                  extra: canEdit && (
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove" onClick={() => assign(v, null)}>
                      <Trash2 size={14} />
                    </button>
                  ),
                }),
              )}
              {newExtras.map((name, i) =>
                row({
                  id: `n-${i}`,
                  t: `extra:${name || `field_${i + 1}`}`,
                  onPicked: () => setNewExtras((l) => l.filter((_, j) => j !== i)),
                  label: (
                    <input
                      className="input input-sm"
                      aria-label="Extra field name"
                      placeholder="e.g. service"
                      value={name}
                      onChange={(e) => setNewExtras((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                  ),
                  extra: (
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove" onClick={() => setNewExtras((l) => l.filter((_, j) => j !== i))}>
                      <Trash2 size={14} />
                    </button>
                  ),
                }),
              )}
            </tbody>
          </table>
        </div>
        {!extras.length && !newExtras.length && <div className="muted small">None. Add one to keep another value on the lead.</div>}
        {canEdit && (
          <button
            type="button"
            className="add-chip"
            style={{ marginTop: 8 }}
            onClick={() => setNewExtras((l) => [...l, ''])}
          >
            <Plus size={13} /> Add extra field
          </button>
        )}
      </div>
    </div>
  )
}

/** the lead fields offered in Pick per field for an action (no Ignore / Extra rows) */
export const pickTargets = (all: typeof LEAD_TARGETS[number][] | readonly { value: string; label: string }[]) =>
  all.filter((t) => t.value !== 'extra' && t.value !== 'ignore' && !t.value.startsWith('utm_'))
