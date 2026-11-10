import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Clock, Code2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection, Hint, Label, Select, TextInput } from '@/components/Field'
import { Flash } from '@/components/Flash'
import { ConfirmModal, Empty, PageHead, Paged } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { listWebinarDates, listWebinars, type WebinarDate, type WebinarRow } from '@/webinars/api'
import { archiveWidget, listWebinarWidgets, saveWebinarWidget, updateWidget, type WebinarWidget } from './api'
import { currentDate, showText, WebinarDateEmbed } from './WebinarDateEmbed'

const created = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Widgets → Webinar date & time: every widget, its webinar, what it shows now, embed code, on / off, edit and delete. */
export function WebinarDateWidgetsPage() {
  const tenant = useTenant()
  const { can, membership } = useAuth()
  const navigate = useNavigate()
  // /widgets/webinar-date/new or /:id: the add / edit drawer is open
  const { id: openId } = useParams()
  const [rows, setRows] = useState<WebinarWidget[] | null>(null)
  const [webinars, setWebinars] = useState<WebinarRow[]>([])
  const [dates, setDates] = useState<WebinarDate[]>([])
  const [embed, setEmbed] = useState<WebinarWidget | null>(null)
  const [deleting, setDeleting] = useState<WebinarWidget | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  const load = useCallback(() => {
    listWebinarWidgets(tenant.id).then(setRows, (e: Error) => setNotice({ error: e.message }))
  }, [tenant.id])
  useEffect(load, [load])
  useEffect(() => {
    void listWebinars(tenant.id).then(setWebinars, () => setWebinars([]))
    void listWebinarDates(tenant.id).then(setDates, () => setDates([]))
  }, [tenant.id])

  async function toggle(w: WebinarWidget) {
    try {
      await updateWidget(w.id, { is_active: !w.is_active })
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }
  async function remove() {
    if (!deleting) return
    setBusy(true)
    try {
      await archiveWidget(deleting.id)
      setNotice({ ok: `Deleted “${deleting.name}”. Its tags on your pages stay empty from now on.` })
      setDeleting(null)
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
    setBusy(false)
  }
  const webinarName = (id: string) => webinars.find((w) => w.id === id)?.title ?? 'Deleted webinar'
  const editing = openId && openId !== 'new' ? (rows ?? []).find((r) => r.id === openId) : null

  return (
    <>
      <Link to="/widgets" className="back-link">
        <ArrowLeft size={14} /> Widgets
      </Link>
      <PageHead
        title="Webinar date & time"
        subtitle="Show a webinar’s current date, time or a countdown on any page. It moves to the next date by itself."
        actions={
          can('widgets', 'add') && (
            <button type="button" className="btn btn-primary" onClick={() => navigate('/widgets/webinar-date/new')}>
              <Plus size={16} /> Add new
            </button>
          )
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      {!rows ? null : !rows.length ? (
        <Empty icon={Clock}>No webinar date widgets yet. Add one, then paste its code on your page.</Empty>
      ) : (
        <div className="panel">
          <Paged rows={rows}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Webinar</th>
                      <th>Shows now</th>
                      <th>Active</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((w) => {
                      const cur = currentDate(dates, w.config.webinar_id)
                      return (
                        <tr key={w.id} className={can('widgets', 'edit') ? 'is-clickable' : undefined} onClick={() => can('widgets', 'edit') && navigate(`/widgets/webinar-date/${w.id}`)}>
                          <td>
                            <b>{w.name}</b>
                            <div className="muted small">Created {created(w.created_at)}</div>
                          </td>
                          <td>{webinarName(w.config.webinar_id)}</td>
                          <td className="nowrap">{cur ? `${showText(cur, 'date')} · ${showText(cur, 'time-timezone')}` : <span className="muted">No coming date</span>}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {can('widgets', 'edit') ? (
                              <label className={cn('tgl', w.is_active && 'is-on')} title={w.is_active ? 'Turn off' : 'Turn on'}>
                                <input type="checkbox" role="switch" checked={w.is_active} onChange={() => void toggle(w)} aria-label={`${w.name} active`} />
                                <span className="tgl-track" aria-hidden="true">
                                  <span className="tgl-knob" />
                                </span>
                                {w.is_active ? 'Active' : 'Inactive'}
                              </label>
                            ) : (
                              <span className={cn('badge', w.is_active ? 'badge-success' : 'badge-muted')}>{w.is_active ? 'On' : 'Off'}</span>
                            )}
                          </td>
                          <td className="nowrap" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEmbed(w)}>
                              <Code2 size={14} /> Embed code
                            </button>
                            {can('widgets', 'edit') && (
                              <button type="button" className="btn btn-ghost btn-icon" title="Edit" onClick={() => navigate(`/widgets/webinar-date/${w.id}`)}>
                                <Pencil size={15} />
                              </button>
                            )}
                            {can('widgets', 'delete') && (
                              <button type="button" className="btn btn-ghost btn-icon danger-text" title="Delete" onClick={() => setDeleting(w)}>
                                <Trash2 size={15} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Paged>
        </div>
      )}

      {openId && (openId === 'new' || editing) && (
        <WidgetDrawer
          key={openId}
          widget={editing ?? null}
          webinars={webinars}
          onClose={() => navigate('/widgets/webinar-date')}
          onSave={async (v) => {
            const w = await saveWebinarWidget(tenant.id, membership?.id, editing?.id ?? null, v)
            navigate('/widgets/webinar-date')
            load()
            setNotice({ ok: editing ? `Saved “${w.name}”.` : `Created “${w.name}”. Copy its code and paste it on your page.` })
            if (!editing) setEmbed(w)
          }}
        />
      )}
      {embed && <WebinarDateEmbed widget={embed} onClose={() => setEmbed(null)} />}
      <ConfirmModal
        open={!!deleting}
        icon={Trash2}
        danger
        title="Delete this widget?"
        message={deleting ? `“${deleting.name}” is removed; its tags on your pages stay empty from now on.` : ''}
        confirmLabel={busy ? 'Deleting…' : 'Delete'}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </>
  )
}

/** add / edit: its name and its webinar */
function WidgetDrawer({
  widget,
  webinars,
  onClose,
  onSave,
}: {
  widget: WebinarWidget | null
  webinars: WebinarRow[]
  onClose: () => void
  onSave: (v: { name: string; webinar_id: string }) => Promise<void>
}) {
  const [name, setName] = useState(widget?.name ?? '')
  const [webinarId, setWebinarId] = useState(widget?.config.webinar_id ?? (webinars.length === 1 ? webinars[0].id : ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save() {
    if (!webinarId) return setError('Pick the webinar.')
    setBusy(true)
    setError(null)
    try {
      await onSave({ name: name.trim() || webinars.find((w) => w.id === webinarId)?.title || 'Webinar date', webinar_id: webinarId })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      width={520}
      onClose={onClose}
      title={widget ? `Webinar date & time · ${widget.name}` : 'New webinar date & time'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : widget ? 'Save changes' : 'Create widget'}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <FormSection title="Widget">
          <div>
            <Label htmlFor="wd-webinar" required>
              Webinar
            </Label>
            <Select id="wd-webinar" value={webinarId} onChange={(e) => setWebinarId(e.target.value)}>
              <option value="">— pick a webinar —</option>
              {webinars.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </Select>
            <Hint>Its tags show this webinar’s current date (the one on now, else the next one), in India time.</Hint>
          </div>
          <div>
            <Label htmlFor="wd-name">Name</Label>
            <TextInput id="wd-name" value={name} maxLength={120} placeholder="e.g. Landing page date" onChange={(e) => setName(e.target.value)} />
            <Hint>For you, to find it in the list (empty: the webinar’s name).</Hint>
          </div>
        </FormSection>
      </div>
    </Drawer>
  )
}
