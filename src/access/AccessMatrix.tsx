import type { ReactNode } from 'react'
import { ACTION_GROUPS, FULL_ACCESS, SCOPES, SCOPE_AREAS, getAction, getScope, setAction, setScope, type Permissions, type Scope } from './catalog'

export type MatrixColumn = {
  id: string
  head: ReactNode
  perms: Permissions
  /** locked columns (Owner) always show full access */
  locked?: boolean
  editable: boolean
}

/** The Happy OS style grid: data visibility (All / Team / Own / None) then one checkbox per action. */
export function AccessMatrix({
  columns,
  onChange,
}: {
  columns: MatrixColumn[]
  onChange: (id: string, perms: Permissions) => void
}) {
  const span = columns.length + 1
  return (
    <div className="table-wrap">
      <table className="table access-matrix">
        <thead>
          <tr>
            <th style={{ minWidth: 240 }} />
            {columns.map((c) => (
              <th key={c.id} className="am-col">
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="am-section">
            <td colSpan={span}>Data visibility</td>
          </tr>
          {SCOPE_AREAS.map((a) => (
            <tr key={a.key}>
              <td>
                <b>{a.label}</b>
                <small>{a.hint}</small>
              </td>
              {columns.map((c) => {
                const p = c.locked ? FULL_ACCESS : c.perms
                return (
                  <td key={c.id} className="am-col">
                    <select
                      className="input input-sm am-select"
                      aria-label={`${a.label}`}
                      value={getScope(p, a.key)}
                      disabled={!c.editable || c.locked}
                      onChange={(e) => onChange(c.id, setScope(c.perms, a.key, e.target.value as Scope))}
                    >
                      {SCOPES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                )
              })}
            </tr>
          ))}
          {ACTION_GROUPS.map((g) => (
            <GroupRows key={g.title} group={g} columns={columns} span={span} onChange={onChange} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({
  group,
  columns,
  span,
  onChange,
}: {
  group: (typeof ACTION_GROUPS)[number]
  columns: MatrixColumn[]
  span: number
  onChange: (id: string, perms: Permissions) => void
}) {
  return (
    <>
      <tr className="am-section">
        <td colSpan={span}>{group.title}</td>
      </tr>
      {group.rows.map((r) => (
        <tr key={`${r.module}.${r.action}`}>
          <td>
            <b>{r.label}</b>
            {r.hint && <small>{r.hint}</small>}
          </td>
          {columns.map((c) => {
            const p = c.locked ? FULL_ACCESS : c.perms
            return (
              <td key={c.id} className="am-col">
                <input
                  type="checkbox"
                  className="am-check"
                  aria-label={r.label}
                  checked={getAction(p, r.module, r.action)}
                  disabled={!c.editable || c.locked}
                  onChange={(e) => onChange(c.id, setAction(c.perms, r.module, r.action, e.target.checked))}
                />
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
