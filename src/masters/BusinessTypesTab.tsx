import { useState, type FormEvent } from 'react'
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import type { BusinessType } from '@/auth/auth-context'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Hint, Label, TextInput } from '@/components/Field'
import { ConfirmModal, Paged } from '@/components/ui'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'

/** "Paid podcast" → PAID-PODCAST */
const toCode = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
const CODE_RE = /^[A-Z0-9]+(-[A-Z0-9]+)*$/

const message = (e: { code?: string; message: string }, code: string) => (e.code === '23505' ? `The code ${code} is already used.` : e.message)

/**
 * Masters → Business types: the name (shown everywhere, can be changed) and the code (set when it's added, never
 * changed: the app works by it). Built-in types can't be deleted; a type in use can't either.
 */
export function BusinessTypesTab({ canEdit, onNotice }: { canEdit: boolean; onNotice: (n: { ok?: string; error?: string }) => void }) {
  const { businessTypes, businesses, refreshProfile } = useAuth()
  const [drawer, setDrawer] = useState<{ row: BusinessType | null } | null>(null)
  const [deleting, setDeleting] = useState<BusinessType | null>(null)
  const [busy, setBusy] = useState(false)

  // how many businesses / sub-businesses (this user sees) are of each type
  const used = (code: string) => businesses.reduce((n, b) => n + (b.subs.length ? b.subs.filter((s) => s.type === code).length : b.type === code ? 1 : 0), 0)

  async function toggle(t: BusinessType) {
    const { error } = await db().from('business_types').update({ is_active: !t.is_active }).eq('id', t.id)
    if (error) return onNotice({ error: error.message })
    onNotice({ ok: `${t.name} ${t.is_active ? 'switched off' : 'switched on'}.` })
    await refreshProfile()
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    const { error } = await db().from('business_types').delete().eq('id', deleting.id)
    setBusy(false)
    if (error) onNotice({ error: error.message })
    else onNotice({ ok: `${deleting.name} deleted.` })
    setDeleting(null)
    await refreshProfile()
  }

  return (
    <>
      <div className="panel-bar">
        <div>
          <b>Business types</b>
          <div className="muted small">What a business or sub-business does. The name is what everyone sees; the code is fixed and the app works by it.</div>
        </div>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => setDrawer({ row: null })}>
            <Plus size={16} /> Add business type
          </button>
        )}
      </div>
      <Paged rows={businessTypes}>
        {(paged) => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Used by</th>
                  <th>Active</th>
                  {canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {paged.map((t) => (
                  <tr key={t.id} className={canEdit ? 'is-clickable' : undefined} onClick={() => canEdit && setDrawer({ row: t })}>
                    <td>
                      <b>{t.name}</b>
                      {t.is_system && <div className="muted small">Built-in</div>}
                    </td>
                    <td>
                      <code>{t.code}</code>
                    </td>
                    <td>{used(t.code) || <span className="muted">—</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <label className={cn('tgl', t.is_active && 'is-on')} title={t.is_active ? 'Turn off' : 'Turn on'}>
                          <input type="checkbox" role="switch" checked={t.is_active} onChange={() => void toggle(t)} aria-label={`${t.name} active`} />
                          <span className="tgl-track" aria-hidden="true">
                            <span className="tgl-knob" />
                          </span>
                          {t.is_active ? 'Active' : 'Inactive'}
                        </label>
                      ) : (
                        <span className={cn('badge', t.is_active ? 'badge-success' : 'badge-muted')}>{t.is_active ? 'Active' : 'Inactive'}</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="nowrap" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn btn-ghost btn-icon" title="Edit" onClick={() => setDrawer({ row: t })}>
                          <Pencil size={15} />
                        </button>
                        {!t.is_system && (
                          <button type="button" className="btn btn-ghost btn-icon danger-text" title="Delete" onClick={() => setDeleting(t)}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Paged>
      {drawer && (
        <BusinessTypeDrawer
          row={drawer.row}
          nextOrder={Math.max(0, ...businessTypes.map((t) => t.sort_order)) + 1}
          onClose={() => setDrawer(null)}
          onSaved={async (msg) => {
            setDrawer(null)
            onNotice({ ok: msg })
            await refreshProfile()
          }}
        />
      )}
      <ConfirmModal
        open={!!deleting}
        icon={Trash2}
        danger
        busy={busy}
        title="Delete this business type?"
        message={deleting ? `“${deleting.name}” (${deleting.code}) is removed from the list. A type that a business still uses can’t be deleted.` : ''}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </>
  )
}

function BusinessTypeDrawer({ row, nextOrder, onClose, onSaved }: { row: BusinessType | null; nextOrder: number; onClose: () => void; onSaved: (msg: string) => void }) {
  const tenant = useTenant()
  const [name, setName] = useState(row?.name ?? '')
  const [code, setCode] = useState(row?.code ?? '')
  // the code follows the name until it's typed in
  const [codeTyped, setCodeTyped] = useState(false)
  const [active, setActive] = useState(row?.is_active ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Enter the name.')
    const c = row ? row.code : toCode(code)
    if (!row && !CODE_RE.test(c)) return setError('Enter a code: capital letters and numbers, words joined by “-” (e.g. PAID-PODCAST).')
    setBusy(true)
    setError(null)
    const { error: err } = row
      ? await db().from('business_types').update({ name: name.trim(), is_active: active }).eq('id', row.id)
      : await db().from('business_types').insert({ tenant_id: tenant.id, code: c, name: name.trim(), is_active: active, sort_order: nextOrder })
    if (err) {
      setError(message(err, c))
      setBusy(false)
      return
    }
    onSaved(`${name.trim()} ${row ? 'saved' : 'added'}.`)
  }

  return (
    <Drawer
      open
      width={520}
      onClose={onClose}
      title={row ? 'Edit business type' : 'Add business type'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button type="submit" form="bt-form" disabled={busy}>
              {busy ? 'Saving…' : row ? 'Save changes' : 'Add business type'}
            </Button>
          </div>
        </>
      }
    >
      <form id="bt-form" onSubmit={submit} className="stack">
        <FormSection title="Business type">
          <div>
            <Label htmlFor="bt-name" required>
              Name
            </Label>
            <TextInput
              id="bt-name"
              value={name}
              maxLength={80}
              autoFocus
              placeholder="e.g. Webinar"
              onChange={(e) => {
                setName(e.target.value)
                if (!row && !codeTyped) setCode(toCode(e.target.value))
              }}
            />
            <Hint>Shown everywhere: the top bar, business forms, cards. It can be changed any time.</Hint>
          </div>
          <div>
            <Label htmlFor="bt-code" required={!row}>
              Code
            </Label>
            {row ? (
              <div className="row" style={{ gap: 6 }}>
                <Lock size={14} className="muted" />
                <code>{row.code}</code>
              </div>
            ) : (
              <TextInput
                id="bt-code"
                value={code}
                maxLength={40}
                placeholder="e.g. WEBINAR"
                onChange={(e) => {
                  setCodeTyped(true)
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '-'))
                }}
              />
            )}
            <Hint>{row ? 'The code never changes: the app works by it.' : 'Capital letters and numbers, words joined by “-”. It can’t be changed once added.'}</Hint>
          </div>
        </FormSection>
        <div className="check-box">
          <Checkbox id="bt-active" checked={active} onChange={setActive} label="Active" description="Inactive types can’t be picked for a new business." />
        </div>
      </form>
    </Drawer>
  )
}
