import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Mic, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Label, TextInput } from '@/components/Field'
import { ConfirmModal, Empty, Paged } from '@/components/ui'
import { useTenant } from '@/tenant/useTenant'
import { deleteStudio, listStudios, saveStudio, type PodcastStudio } from './api'

/** Masters → Podcast Studios: where Paid Podcast and Studio Rental bookings take place; one is the default. */
export function PodcastStudiosTab({ canEdit, onNotice }: { canEdit: boolean; onNotice: (n: { ok?: string; error?: string }) => void }) {
  const tenant = useTenant()
  const [rows, setRows] = useState<PodcastStudio[] | null>(null)
  const [drawer, setDrawer] = useState<{ studio: PodcastStudio | null } | null>(null)
  const [deleting, setDeleting] = useState<PodcastStudio | null>(null)

  const load = useCallback(() => {
    listStudios(tenant.id).then(setRows, (e: Error) => onNotice({ error: e.message }))
  }, [tenant.id, onNotice])
  useEffect(load, [load])

  return (
    <>
      <div className="panel-bar">
        <div>
          <b>Podcast Studios</b>
          <div className="muted small">Where Paid Podcast and Studio Rental bookings take place; the default one is picked on a new booking.</div>
        </div>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => setDrawer({ studio: null })}>
            <Plus size={16} /> Add studio
          </button>
        )}
      </div>
      {!rows ? (
        <div className="empty">Loading…</div>
      ) : !rows.length ? (
        <Empty icon={Mic}>No podcast studios yet.</Empty>
      ) : (
        <Paged rows={rows}>
          {(paged) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Studio name</th>
                    <th>Default</th>
                    {canEdit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((s) => (
                    <tr key={s.id} className={canEdit ? 'is-clickable' : undefined} onClick={() => canEdit && setDrawer({ studio: s })}>
                      <td>
                        <b>{s.name}</b>
                      </td>
                      <td>{s.is_default ? <span className="badge badge-success">Default</span> : <span className="muted">—</span>}</td>
                      {canEdit && (
                        <td className="nowrap" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn btn-ghost btn-icon" title="Edit" onClick={() => setDrawer({ studio: s })}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="btn btn-ghost btn-icon danger-text" title="Delete" onClick={() => setDeleting(s)}>
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
        <StudioDrawer
          studio={drawer.studio}
          first={!rows?.length}
          nextOrder={Math.max(0, ...(rows ?? []).map((r) => r.sort_order)) + 1}
          onClose={() => setDrawer(null)}
          onSaved={(name) => {
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
        title="Delete this studio?"
        message={deleting ? `“${deleting.name}” is removed from the list. A studio with bookings can’t be deleted.` : ''}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const s = deleting
          setDeleting(null)
          if (!s) return
          try {
            await deleteStudio(s.id)
            onNotice({ ok: `${s.name} deleted.` })
            load()
          } catch (e) {
            onNotice({ error: (e as Error).message })
          }
        }}
      />
    </>
  )
}

function StudioDrawer({ studio, first, nextOrder, onClose, onSaved }: { studio: PodcastStudio | null; first: boolean; nextOrder: number; onClose: () => void; onSaved: (name: string) => void }) {
  const tenant = useTenant()
  const [f, setF] = useState({ name: studio?.name ?? '', is_default: studio?.is_default ?? first })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.name.trim()) return setError('Enter the studio name.')
    setBusy(true)
    setError(null)
    try {
      await saveStudio(tenant.id, studio?.id ?? null, { ...f, sort_order: studio ? undefined : nextOrder })
      onSaved(f.name.trim())
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
      title={studio ? 'Edit studio' : 'Add studio'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button type="submit" form="studio-form" disabled={busy}>
              {busy ? 'Saving…' : studio ? 'Save changes' : 'Add studio'}
            </Button>
          </div>
        </>
      }
    >
      <form id="studio-form" onSubmit={submit} className="stack">
        <FormSection title="Studio">
          <div>
            <Label htmlFor="ps-name" required>
              Studio name
            </Label>
            <TextInput id="ps-name" value={f.name} maxLength={120} autoFocus placeholder="e.g. Podcast Studio - Vakola" onChange={(e) => setF((d) => ({ ...d, name: e.target.value }))} />
          </div>
        </FormSection>
        <div className="check-box">
          <Checkbox
            id="ps-default"
            checked={f.is_default}
            // the default stays ticked until another studio is made the default
            onChange={(v) => !(studio?.is_default && !v) && setF((d) => ({ ...d, is_default: v }))}
            label="Default"
            description={studio?.is_default ? 'This is the default studio; tick another studio to make it the default.' : 'Picked on a new booking. Ticking it unticks the current default.'}
          />
        </div>
      </form>
    </Drawer>
  )
}
