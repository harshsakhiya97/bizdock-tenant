import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Mic, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Label, TextInput } from '@/components/Field'
import { PhoneInput } from '@/components/PhoneInput'
import { ConfirmModal, Empty, Paged } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { deleteHost, listHosts, saveHost, type WebinarHost } from '@/webinars/api'

/** Masters → Webinar hosts: who hosts a webinar (name, email, phone). */
export function WebinarHostsTab({ canEdit, onNotice }: { canEdit: boolean; onNotice: (n: { ok?: string; error?: string }) => void }) {
  const tenant = useTenant()
  const [rows, setRows] = useState<WebinarHost[] | null>(null)
  const [drawer, setDrawer] = useState<{ host: WebinarHost | null } | null>(null)
  const [deleting, setDeleting] = useState<WebinarHost | null>(null)

  const load = useCallback(() => {
    listHosts(tenant.id).then(setRows, (e: Error) => onNotice({ error: e.message }))
  }, [tenant.id, onNotice])
  useEffect(load, [load])

  return (
    <>
      <div className="panel-bar">
        <div>
          <b>Webinar hosts</b>
          <div className="muted small">Who hosts a webinar; picked when a webinar is created on the Webinar Calendar.</div>
        </div>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => setDrawer({ host: null })}>
            <Plus size={16} /> Add host
          </button>
        )}
      </div>
      {!rows ? (
        <div className="empty">Loading…</div>
      ) : !rows.length ? (
        <Empty icon={Mic}>No webinar hosts yet.</Empty>
      ) : (
        <Paged rows={rows}>
          {(paged) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Status</th>
                    {canEdit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((h) => (
                    <tr key={h.id} className={canEdit ? 'is-clickable' : undefined} onClick={() => canEdit && setDrawer({ host: h })}>
                      <td>
                        <b>{h.name}</b>
                      </td>
                      <td>{h.email || <span className="muted">—</span>}</td>
                      <td>{h.phone || <span className="muted">—</span>}</td>
                      <td>
                        <span className={cn('badge', h.is_active ? 'badge-success' : 'badge-muted')}>{h.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      {canEdit && (
                        <td className="nowrap" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn btn-ghost btn-icon" title="Edit" onClick={() => setDrawer({ host: h })}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="btn btn-ghost btn-icon danger-text" title="Delete" onClick={() => setDeleting(h)}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Paged>
      )}
      {drawer && (
        <HostDrawer
          host={drawer.host}
          nextOrder={Math.max(0, ...(rows ?? []).map((r) => r.sort_order)) + 1}
          onClose={() => setDrawer(null)}
          onSaved={(_, name) => {
            setDrawer(null)
            onNotice({ ok: `${name} saved.` })
            load()
          }}
        />
      )}
      <ConfirmModal
        open={!!deleting}
        icon={Trash2}
        danger
        title="Delete this host?"
        message={deleting ? `“${deleting.name}” is removed from the list. Webinars hosted by them keep running, without a host.` : ''}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const h = deleting
          setDeleting(null)
          if (!h) return
          try {
            await deleteHost(h.id)
            onNotice({ ok: `${h.name} deleted.` })
            load()
          } catch (e) {
            onNotice({ error: (e as Error).message })
          }
        }}
      />
    </>
  )
}

/** add / edit a webinar host (also "Add new host" while creating a webinar) */
export function HostDrawer({ host, nextOrder = 1, onClose, onSaved }: { host: WebinarHost | null; nextOrder?: number; onClose: () => void; onSaved: (id: string, name: string) => void }) {
  const tenant = useTenant()
  const [f, setF] = useState({ name: host?.name ?? '', email: host?.email ?? '', phone: host?.phone ?? '', is_active: host?.is_active ?? true })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.name.trim()) return setError('Enter the host’s name.')
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setError('Enter a valid email.')
    setBusy(true)
    setError(null)
    try {
      const id = await saveHost(tenant.id, host?.id ?? null, { ...f, sort_order: host ? undefined : nextOrder })
      onSaved(id, f.name.trim())
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      width={480}
      onClose={onClose}
      title={host ? 'Edit host' : 'Add host'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button type="submit" form="host-form" disabled={busy}>
              {busy ? 'Saving…' : host ? 'Save changes' : 'Add host'}
            </Button>
          </div>
        </>
      }
    >
      <form id="host-form" onSubmit={submit} className="stack">
        <FormSection title="Host">
          <div>
            <Label htmlFor="h-name" required>
              Name
            </Label>
            <TextInput id="h-name" value={f.name} maxLength={120} autoFocus onChange={(e) => setF((d) => ({ ...d, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="h-email">Email</Label>
            <TextInput id="h-email" type="email" value={f.email} onChange={(e) => setF((d) => ({ ...d, email: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="h-phone">Phone</Label>
            <PhoneInput id="h-phone" value={f.phone} onChange={(v) => setF((d) => ({ ...d, phone: v }))} />
          </div>
        </FormSection>
        <div className="check-box">
          <Checkbox id="h-active" checked={f.is_active} onChange={(v) => setF((d) => ({ ...d, is_active: v }))} label="Active" description="Inactive hosts can’t be picked for a new webinar." />
        </div>
      </form>
    </Drawer>
  )
}
