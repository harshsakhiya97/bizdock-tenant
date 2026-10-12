import { useState } from 'react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, Hint, Label, Select } from '@/components/Field'
import { setMemberAccess } from '@/team/api'
import type { MemberRow, RoleRow } from '@/team/types'
import { AccessMatrix } from './AccessMatrix'
import type { Permissions } from './catalog'

/** One person's role, reporting line and (optional) custom access. */
export function PersonAccessDrawer({
  member,
  roles,
  members,
  onClose,
  onSaved,
}: {
  member: MemberRow
  roles: RoleRow[]
  members: MemberRow[]
  onClose: () => void
  onSaved: () => void
}) {
  const [roleId, setRoleId] = useState(member.role_id)
  const [reportsTo, setReportsTo] = useState<string | null>(member.reports_to)
  const [custom, setCustom] = useState<Permissions | null>(member.permissions)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const role = roles.find((r) => r.id === roleId)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await setMemberAccess(member.id, { role_id: roleId, reports_to: reportsTo, permissions: custom })
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      width={720}
      onClose={onClose}
      title={`Access · ${member.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save access'}
            </Button>
          </div>
        </>
      }
    >
      <div className="form-grid">
        <div>
          <Label htmlFor="pa-role" required>
            Role
          </Label>
          <Select id="pa-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · level {r.level}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="pa-reports">Reports to</Label>
          <Select id="pa-reports" value={reportsTo ?? ''} onChange={(e) => setReportsTo(e.target.value || null)}>
            <option value="">— nobody —</option>
            {members
              .filter((m) => m.id !== member.id && m.status === 'active')
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </Select>
        </div>
      </div>
      <div className="check-box">
        <Checkbox
          id="pa-custom"
          checked={!!custom}
          onChange={(v) => setCustom(v ? structuredClone(role?.permissions ?? {}) : null)}
          label="Custom access for this person"
          description="Starts as a copy of the role. Untick to go back to the role’s access."
        />
      </div>
      {custom && (
        <div className="row-between">
          <Hint>Changing the role later does not change custom access.</Hint>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCustom(structuredClone(role?.permissions ?? {}))}
          >
            Copy role again
          </Button>
        </div>
      )}
      <div className="card" style={{ overflow: 'hidden' }}>
        <AccessMatrix
          columns={[
            {
              id: 'me',
              head: (
                <div className="am-head">
                  <b>{custom ? 'Custom' : (role?.name ?? 'Role')}</b>
                  <small>{custom ? 'this person only' : 'from the role'}</small>
                </div>
              ),
              perms: custom ?? role?.permissions ?? {},
              editable: !!custom,
            },
          ]}
          onChange={(_, p) => setCustom(p)}
        />
      </div>
    </Drawer>
  )
}

/* ------------------------------------------------------------------ Roles */
