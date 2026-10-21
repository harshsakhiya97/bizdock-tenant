import { Fragment, type ReactNode } from 'react'
import { FULL_ACCESS, MODE_ROW, MODULE_SECTIONS, SCOPES, getAction, getScope, setAction, setScope, type ActionRow, type ModuleDef, type Permissions, type Scope } from './catalog'

export type MatrixColumn = {
  id: string
  head: ReactNode
  perms: Permissions
  /** locked columns (Owner) always show full access */
  locked?: boolean
  editable: boolean
}

/** Access grid in side-menu order: for each page who can open it (visibility or a checkbox), then what they can do there. */
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
          {MODULE_SECTIONS.map((sec) => (
            <Fragment key={sec.title}>
              <tr className="am-section">
                <td colSpan={span}>{sec.title}</td>
              </tr>
              {sec.modules.map((m) => (
                <ModuleRows key={m.key} mod={m} columns={columns} onChange={onChange} />
              ))}
            </Fragment>
          ))}
          <tr className="am-section">
            <td colSpan={span}>Mode</td>
          </tr>
          <CheckRow row={MODE_ROW} columns={columns} onChange={onChange} />
        </tbody>
      </table>
    </div>
  )
}

type RowProps = { columns: MatrixColumn[]; onChange: (id: string, perms: Permissions) => void }

function ScopeCell({ c, area, label, onChange }: { c: MatrixColumn; area: string; label: string; onChange: RowProps['onChange'] }) {
  const p = c.locked ? FULL_ACCESS : c.perms
  return (
    <td className="am-col">
      <select
        className="input input-sm am-select"
        aria-label={label}
        value={getScope(p, area)}
        disabled={!c.editable || c.locked}
        onChange={(e) => onChange(c.id, setScope(c.perms, area, e.target.value as Scope))}
      >
        {SCOPES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </td>
  )
}

function CheckCell({ c, module, action, label, onChange }: { c: MatrixColumn; module: string; action: string; label: string; onChange: RowProps['onChange'] }) {
  const p = c.locked ? FULL_ACCESS : c.perms
  return (
    <td className="am-col">
      <input
        type="checkbox"
        className="am-check"
        aria-label={label}
        checked={getAction(p, module, action)}
        disabled={!c.editable || c.locked}
        onChange={(e) => onChange(c.id, setAction(c.perms, module, action, e.target.checked))}
      />
    </td>
  )
}

/** one side-menu page: who can open it, extra visibility, then its actions (indented) */
function ModuleRows({ mod, columns, onChange }: { mod: ModuleDef } & RowProps) {
  const o = mod.open
  return (
    <>
      <tr className="am-module">
        <td>
          <b>{mod.label}</b>
          <small>{o.kind === 'scope' ? `${o.hint} · None hides it` : o.kind === 'action' ? (o.hint ?? 'Can open this page') : o.note === 'Everyone' ? 'Everyone can open it' : 'Opens for people who can see Leads'}</small>
        </td>
        {columns.map((c) =>
          o.kind === 'scope' ? (
            <ScopeCell key={c.id} c={c} area={o.area} label={mod.label} onChange={onChange} />
          ) : o.kind === 'action' ? (
            <CheckCell key={c.id} c={c} module={o.module} action={o.action} label={`Open ${mod.label}`} onChange={onChange} />
          ) : (
            <td key={c.id} className="am-col muted small">
              {o.note}
            </td>
          ),
        )}
      </tr>
      {(mod.extraScopes ?? []).map((x) => (
        <tr key={x.area} className="am-sub">
          <td>
            <b>{x.label}</b>
            <small>{x.hint}</small>
          </td>
          {columns.map((c) => (
            <ScopeCell key={c.id} c={c} area={x.area} label={x.label} onChange={onChange} />
          ))}
        </tr>
      ))}
      {mod.actions.map((r) => (
        <CheckRow key={`${r.module}.${r.action}`} row={r} columns={columns} onChange={onChange} sub />
      ))}
    </>
  )
}

function CheckRow({ row, columns, onChange, sub }: { row: ActionRow; sub?: boolean } & RowProps) {
  return (
    <tr className={sub ? 'am-sub' : undefined}>
      <td>
        <b>{row.label}</b>
        {row.hint && <small>{row.hint}</small>}
      </td>
      {columns.map((c) => (
        <CheckCell key={c.id} c={c} module={row.module} action={row.action} label={row.label} onChange={onChange} />
      ))}
    </tr>
  )
}
