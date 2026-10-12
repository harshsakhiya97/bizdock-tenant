import { useMemo, useState } from 'react'
import { Lock, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Hint, Label, Select, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { ConfirmModal } from '@/components/ui'
import { createRole, deleteRole, saveRole } from '@/team/api'
import type { MemberRow, RoleRow } from '@/team/types'
import { AccessMatrix } from './AccessMatrix'
import { FULL_ACCESS, type Permissions } from './catalog'

export function RolesTab({
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
