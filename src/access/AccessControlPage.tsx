import { useCallback, useEffect, useMemo, useState } from 'react'
import { Lock, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, Hint, Label, Select, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { ConfirmModal, PageHead } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { createRole, deleteRole, listMembers, listRoles, saveRole, setMemberAccess } from '@/team/api'
import type { MemberRow, RoleRow } from '@/team/types'
import { AccessMatrix } from './AccessMatrix'
import { FULL_ACCESS, SCOPE_AREAS, getScope, scopeTone, type Permissions } from './catalog'

type Tab = 'people' | 'roles'

export function AccessControlPage() {
  const tenant = useTenant()
  const { level, membership } = useAuth()
  const [tab, setTab] = useState<Tab>('people')
  const [roles, setRoles] = useState<RoleRow[] | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  const load = useCallback(() => {
    Promise.all([listRoles(tenant.id), listMembers(tenant.id)])
      .then(([r, m]) => {
        setRoles(r.filter((x) => !x.is_system))
        setMembers(m)
      })
      .catch((e: Error) => setNotice({ error: e.message }))
  }, [tenant.id])
  useEffect(load, [load])

  return (
    <>
      <PageHead
        title="Access Control"
        subtitle="Who sees what. Own = records they own · Team = theirs + people who report to them · All = everyone’s."
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      {notice.ok && <div className="alert alert-info">{notice.ok}</div>}

      <div className="panel">
        <div className="panel-bar">
          <div className="tabs">
            <button type="button" className={cn('tab', tab === 'people' && 'is-active')} onClick={() => setTab('people')}>
              People
            </button>
            <button type="button" className={cn('tab', tab === 'roles' && 'is-active')} onClick={() => setTab('roles')}>
              Roles
            </button>
          </div>
          <span className="muted small">
            You can change roles and people below your level ({level === 0 ? 'Tech Support' : `level ${level}`}).
          </span>
        </div>
        {!roles ? (
          <div className="empty">Loading…</div>
        ) : tab === 'people' ? (
          <PeopleTab
            roles={roles}
            members={members}
            myLevel={level}
            myMemberId={membership?.id}
            onSaved={(msg) => {
              setNotice({ ok: msg })
              load()
            }}
          />
        ) : (
          <RolesTab
            roles={roles}
            members={members}
            myLevel={level}
            tenantId={tenant.id}
            onSaved={(msg) => {
              setNotice({ ok: msg })
              load()
            }}
            onError={(msg) => setNotice({ error: msg })}
          />
        )}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ People */

function PeopleTab({
  roles,
  members,
  myLevel,
  myMemberId,
  onSaved,
}: {
  roles: RoleRow[]
  members: MemberRow[]
  myLevel: number
  myMemberId?: string
  onSaved: (msg: string) => void
}) {
  const [editing, setEditing] = useState<MemberRow | null>(null)
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const byId = new Map(members.map((m) => [m.id, m]))

  if (!members.length) return <div className="empty">No team members yet. Add people on the Team page.</div>

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Reports to</th>
              {SCOPE_AREAS.map((a) => (
                <th key={a.key}>{a.label.split(',')[0]}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const role = roleById.get(m.role_id)
              const owner = (role?.level ?? 9) <= 1
              const p = owner ? FULL_ACCESS : (m.permissions ?? role?.permissions ?? {})
              const manageable = m.id !== myMemberId && (role?.level ?? 0) > myLevel
              return (
                <tr key={m.id}>
                  <td>
                    <div className="cell-main">
                      <Avatar name={m.name} size={30} />
                      <div>
                        <span className="strong">{m.name}</span>
                        <small>{m.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="nowrap">{role?.name ?? '—'}</div>
                    {owner ? (
                      <span className="chip-tag badge-purple" style={{ marginLeft: 0 }}>
                        Full access
                      </span>
                    ) : m.permissions ? (
                      <span className="chip-tag badge-warning" style={{ marginLeft: 0 }}>
                        Custom access
                      </span>
                    ) : (
                      <span className="muted small">Role access</span>
                    )}
                  </td>
                  <td className="nowrap">{m.reports_to ? (byId.get(m.reports_to)?.name ?? '—') : <span className="muted">—</span>}</td>
                  {SCOPE_AREAS.map((a) => {
                    const s = getScope(p, a.key)
                    return (
                      <td key={a.key}>
                        <span className={cn('badge', scopeTone[s])}>{s === 'none' ? 'None' : s[0].toUpperCase() + s.slice(1)}</span>
                      </td>
                    )
                  })}
                  <td style={{ textAlign: 'right' }}>
                    {manageable ? (
                      <Button variant="outline" size="sm" onClick={() => setEditing(m)}>
                        Edit
                      </Button>
                    ) : (
                      <span className="muted" title="Above or at your level">
                        <Lock size={14} />
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {editing && (
        <PersonAccessDrawer
          member={editing}
          roles={roles.filter((r) => r.level > myLevel)}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onSaved(`${editing.name}'s access saved.`)
          }}
        />
      )}
    </>
  )
}

function PersonAccessDrawer({
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

function RolesTab({
  roles,
  members,
  myLevel,
  tenantId,
  onSaved,
  onError,
}: {
  roles: RoleRow[]
  members: MemberRow[]
  myLevel: number
  tenantId: string
  onSaved: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, Permissions>>({})
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<RoleRow | null>(null)
  const [newName, setNewName] = useState('')
  const [startFrom, setStartFrom] = useState('')
  const [newLevel, setNewLevel] = useState(Math.max(3, myLevel + 1))

  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const m of members) c.set(m.role_id, (c.get(m.role_id) ?? 0) + 1)
    return c
  }, [members])
  const dirty = Object.keys(drafts)

  async function saveAll() {
    setBusy(true)
    try {
      for (const id of dirty) {
        const r = roles.find((x) => x.id === id)
        if (r) await saveRole({ ...r, permissions: drafts[id] })
      }
      setDrafts({})
      onSaved('Role access saved.')
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    const name = newName.trim()
    if (!name) return onError('Enter a name for the new role.')
    if (newLevel < 3 || newLevel <= myLevel) return onError(`New roles start from level ${Math.max(3, myLevel + 1)}.`)
    const from = roles.find((r) => r.id === startFrom)
    try {
      await createRole(tenantId, {
        name,
        level: newLevel,
        permissions: from ? (from.level <= 1 ? FULL_ACCESS : from.permissions) : {},
      })
      setNewName('')
      onSaved(`Role “${name}” created.`)
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <>
      <div className="card" style={{ border: 0, borderRadius: 0, boxShadow: 'none' }}>
        <AccessMatrix
          columns={roles.map((r) => {
            const owner = r.level <= 1
            const editable = !owner && r.level > myLevel
            return {
              id: r.id,
              locked: owner,
              editable,
              perms: drafts[r.id] ?? r.permissions,
              head: (
                <div className="am-head">
                  <b>{r.name}</b>
                  <small>
                    Level {r.level} · {counts.get(r.id) ?? 0} {counts.get(r.id) === 1 ? 'person' : 'people'}
                  </small>
                  {owner ? (
                    <span className="badge badge-purple" style={{ marginTop: 2 }}>
                      Fixed
                    </span>
                  ) : editable ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(r)}>
                      <Pencil size={13} /> Edit
                    </button>
                  ) : (
                    <Lock size={13} className="muted" />
                  )}
                </div>
              ),
            }
          })}
          onChange={(id, p) => setDrafts((d) => ({ ...d, [id]: p }))}
        />
      </div>
      <div className="table-foot">
        <span>The Owner always has full access. “Team” = the person plus everyone who reports to them.</span>
        <div className="row">
          {dirty.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setDrafts({})}>
              Discard changes
            </Button>
          )}
          <Button onClick={saveAll} disabled={busy || !dirty.length}>
            {busy ? 'Saving…' : dirty.length ? `Save role access (${dirty.length})` : 'Save role access'}
          </Button>
        </div>
      </div>

      <div className="panel-filters" style={{ borderTop: '1px solid var(--line)', borderBottom: 0, alignItems: 'flex-end' }}>
        <div>
          <Label htmlFor="nr-name">New role</Label>
          <TextInput id="nr-name" placeholder="e.g. Branch Manager" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <div style={{ minWidth: 200 }}>
          <Label htmlFor="nr-from">Start from</Label>
          <Select id="nr-from" value={startFrom} onChange={(e) => setStartFrom(e.target.value)}>
            <option value="">Nothing ticked</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div style={{ width: 110 }}>
          <Label htmlFor="nr-level">Level</Label>
          <TextInput
            id="nr-level"
            type="number"
            min={Math.max(3, myLevel + 1)}
            value={newLevel}
            onChange={(e) => setNewLevel(Number(e.target.value))}
          />
        </div>
        <Button onClick={create}>Create role</Button>
      </div>

      {editing && (
        <RoleModal
          role={editing}
          people={counts.get(editing.id) ?? 0}
          minLevel={Math.max(2, myLevel + 1)}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            setEditing(null)
            onSaved(msg)
          }}
        />
      )}
    </>
  )
}

function RoleModal({
  role,
  people,
  minLevel,
  onClose,
  onDone,
}: {
  role: RoleRow
  people: number
  minLevel: number
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [name, setName] = useState(role.name)
  const [description, setDescription] = useState(role.description ?? '')
  const [level, setLevel] = useState(role.level)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save() {
    if (!name.trim()) return setError('Name is required.')
    if (level < minLevel) return setError(`Level must be ${minLevel} or more.`)
    try {
      await saveRole({ ...role, name: name.trim(), description: description.trim() || null, level })
      onDone('Role saved.')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function remove() {
    try {
      await deleteRole(role.id)
      onDone(`Role “${role.name}” deleted.`)
    } catch (e) {
      setConfirmDelete(false)
      setError((e as Error).message)
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        width={520}
        title="Edit role"
        footer={
          <>
            <Button
              variant="ghost"
              className="danger-text"
              disabled={people > 0}
              title={people > 0 ? 'Give its people another role first' : undefined}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 /> Delete role
            </Button>
            <div className="foot-end">
              {error && <p className="err-text">{error}</p>}
              <Button onClick={save}>Save</Button>
            </div>
          </>
        }
      >
        <div className="form-grid">
          <div>
            <Label htmlFor="rm-name" required>
              Name
            </Label>
            <TextInput id="rm-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rm-level" required>
              Level
            </Label>
            <TextInput
              id="rm-level"
              type="number"
              min={minLevel}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
            />
          </div>
          <div className="span-2">
            <Label htmlFor="rm-desc">Description</Label>
            <TextInput id="rm-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Hint>
              Lower level = more senior. People can only give roles below their own level.
              {people > 0 && ` ${people} ${people === 1 ? 'person has' : 'people have'} this role.`}
            </Hint>
          </div>
        </div>
      </Modal>
      <ConfirmModal
        open={confirmDelete}
        icon={Trash2}
        danger
        title={`Delete ${role.name}?`}
        message="This role will be removed. No one has it right now."
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </>
  )
}
