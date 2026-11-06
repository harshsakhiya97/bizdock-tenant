import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Hint, Label, Select, TextArea, TextInput } from '@/components/Field'
import { addWebhook, saveFunnel } from '@/funnels/api'
import { templateStages } from '@/funnels/templates'
import { cn } from '@/lib/cn'
import { HostDrawer } from '@/masters/WebinarHostsTab'
import { useTenant } from '@/tenant/useTenant'
import { listZoomOptions, type ZoomOption } from '@/zoom/api'
import { listHosts, saveWebinar, WEEKDAYS, type WebinarHost, type WebinarInput, type WebinarRepeat, type WebinarRow } from './api'
import { createWebinarWorkflows } from './workflows'

const NEW_FUNNEL = '__new'
const today = () => new Date().toLocaleDateString('en-CA')
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Add / edit a webinar: one-time, several dates or every week on some days (never stops, or until a date), its time, host,
 * description and Zoom account, and the funnel its leads come from. Each date gets its own Zoom webinar (the next one when
 * the one before ends). A new webinar also gets its registration, reminder and after-webinar workflows.
 */
export function WebinarDrawer({
  webinar,
  businesses,
  defaultBusinessId,
  defaults,
  onClose,
  onSaved,
}: {
  webinar: WebinarRow | null
  /** the Webinar businesses this person can use */
  businesses: { id: string; name: string }[]
  defaultBusinessId: string | null
  /** a new one from the calendar: the day / time dragged over */
  defaults?: { date?: string; start?: string; end?: string }
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const { membership, can } = useAuth()
  const canEdit = webinar ? can('bookings', 'edit') || can('bookings', 'add') : can('bookings', 'add')
  const [f, setF] = useState<WebinarInput>(() => ({
    business_id: webinar?.business_id ?? defaultBusinessId ?? (businesses.length === 1 ? businesses[0].id : ''),
    title: webinar?.title ?? '',
    description: webinar?.description ?? '',
    host_id: webinar?.host_id ?? '',
    zoom_account_id: webinar?.zoom_account_id ?? '',
    funnel_id: webinar?.funnel_id ?? NEW_FUNNEL,
    repeat: webinar?.repeat ?? 'once',
    first_date: webinar?.first_date ?? defaults?.date ?? today(),
    dates: webinar?.dates ?? [],
    weekdays: webinar?.weekdays ?? [],
    stop_date: webinar?.stop_date ?? null,
    start_time: webinar?.start_time ?? defaults?.start ?? '19:00',
    end_time: webinar?.end_time ?? defaults?.end ?? '20:30',
    is_active: webinar?.is_active ?? true,
  }))
  const set = <K extends keyof WebinarInput>(k: K, v: WebinarInput[K]) => setF((d) => ({ ...d, [k]: v }))
  const [stops, setStops] = useState<'never' | 'on'>(webinar?.stop_date ? 'on' : 'never')
  const [newDate, setNewDate] = useState('')
  const [hosts, setHosts] = useState<WebinarHost[]>([])
  const [zooms, setZooms] = useState<ZoomOption[]>([])
  const [addingHost, setAddingHost] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void listHosts(tenant.id).then(setHosts, () => setHosts([]))
    void listZoomOptions(tenant.id).then(
      (z) => {
        setZooms(z)
        // a new webinar: the default Zoom account
        if (!webinar) setF((d) => (d.zoom_account_id ? d : { ...d, zoom_account_id: (z.find((x) => x.is_default) ?? z[0])?.id ?? '' }))
      },
      () => setZooms([]),
    )
  }, [tenant.id, webinar])


  async function save() {
    if (!f.business_id) return setError('Pick the business.')
    if (!f.title.trim()) return setError('Enter the webinar’s title.')
    if (!f.host_id) return setError('Pick the host (or add one).')
    if (!f.zoom_account_id) return setError('Pick the Zoom account the webinars are made on.')
    if (!/^\d{2}:\d{2}$/.test(f.start_time) || !/^\d{2}:\d{2}$/.test(f.end_time) || f.end_time <= f.start_time) return setError('The end time must be after the start time.')
    if (f.repeat === 'once' && !f.first_date) return setError('Pick the date.')
    if (f.repeat === 'dates' && !f.dates.length) return setError('Add at least one date.')
    if (f.repeat === 'weekly') {
      if (!f.weekdays.length) return setError('Pick the day(s) of the week.')
      if (!f.first_date) return setError('Pick the date it starts from.')
      if (stops === 'on' && (!f.stop_date || f.stop_date < f.first_date)) return setError('Pick the day it stops (after it starts).')
    }
    setBusy(true)
    setError(null)
    try {
      let funnelId = f.funnel_id
      let webhookId: string | null = null
      // a new webinar always gets its own funnel (Webinar stages), named after it; its leads come in through its webhook
      if (!funnelId || funnelId === NEW_FUNNEL) {
        funnelId = await saveFunnel(
          tenant.id,
          null,
          { business_id: f.business_id, sub_business_id: '', name: f.title.trim(), type: 'webinar', description: '', tags: [], event_id: '', assign_mode: 'none', assign_members: [] },
          templateStages('webinar'),
        )
        // and the registration form's webhook in it: each post adds the lead, and the registration workflow starts from it
        webhookId = await addWebhook(tenant.id, funnelId, { name: `${f.title.trim()} – registration form`, action: 'create_lead', match_by: 'phone' })
      }
      const input = { ...f, funnel_id: funnelId, stop_date: f.repeat === 'weekly' && stops === 'on' ? f.stop_date : null, host_id: f.host_id || null, zoom_account_id: f.zoom_account_id || null }
      const id = await saveWebinar(tenant.id, membership?.id, webinar?.id ?? null, input)
      if (webinar) return onSaved(`${input.title.trim()} saved. Its coming date follows the changes.`)
      // the webinar is saved: a problem with its workflows is told, not retried (that would add the webinar twice)
      let wfError = ''
      try {
        await createWebinarWorkflows(tenant.id, membership?.id, { id, title: input.title, funnel_id: funnelId, webhook_id: webhookId })
      } catch (e) {
        wfError = (e as Error).message
      }
      onSaved(
        wfError
          ? `${input.title.trim()} added, but its workflows couldn’t be made: ${wfError}`
          : `${input.title.trim()} added with its funnel and workflows (registration, reminders, after webinar). Pick their WhatsApp templates and switch them on in Workflows.`,
      )
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const REPEATS: [WebinarRepeat, string][] = [
    ['once', 'One time'],
    ['dates', 'Several dates'],
    ['weekly', 'Every week'],
  ]

  return (
    <>
      <Drawer
        open
        width={640}
        onClose={onClose}
        title={webinar ? `Webinar · ${webinar.title}` : 'New webinar'}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              {canEdit ? 'Cancel' : 'Close'}
            </Button>
            <div className="foot-end">
              {error && <p className="err-text">{error}</p>}
              {canEdit && (
                <Button onClick={() => void save()} disabled={busy}>
                  {busy ? 'Saving…' : webinar ? 'Save changes' : 'Create webinar'}
                </Button>
              )}
            </div>
          </>
        }
      >
        <div className="stack">
          <FormSection title="Webinar">
            <div className="form-grid">
              {businesses.length > 1 && (
                <div className="span-2">
                  <Label htmlFor="wb-biz" required>
                    Business
                  </Label>
                  <Select id="wb-biz" value={f.business_id} disabled={!canEdit || !!webinar} onChange={(e) => set('business_id', e.target.value)}>
                    <option value="">— select —</option>
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="span-2">
                <Label htmlFor="wb-title" required>
                  Title
                </Label>
                <TextInput id="wb-title" value={f.title} maxLength={200} autoFocus={!webinar} disabled={!canEdit} placeholder="e.g. AI Income Masterclass" onChange={(e) => set('title', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="wb-host" required>
                  Host
                </Label>
                <Select
                  id="wb-host"
                  value={f.host_id ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => (e.target.value === NEW_FUNNEL ? setAddingHost(true) : set('host_id', e.target.value))}
                >
                  <option value="">— select —</option>
                  {hosts
                    .filter((h) => h.is_active || h.id === f.host_id)
                    .map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  <option value={NEW_FUNNEL}>+ Add new host</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="wb-zoom" required>
                  Zoom account
                </Label>
                <Select id="wb-zoom" value={f.zoom_account_id ?? ''} disabled={!canEdit} onChange={(e) => set('zoom_account_id', e.target.value)}>
                  <option value="">— select —</option>
                  {zooms.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                      {z.is_default ? ' (default)' : ''}
                    </option>
                  ))}
                </Select>
                {!zooms.length && <Hint>No Zoom account yet: add one in System Connections.</Hint>}
              </div>
              <div className="span-2">
                <Label htmlFor="wb-desc">Description</Label>
                <TextArea id="wb-desc" rows={3} value={f.description ?? ''} disabled={!canEdit} onChange={(e) => set('description', e.target.value)} />
              </div>
            </div>
          </FormSection>

          <FormSection title="When" description="Each date gets its own Zoom webinar; the next date is made when the one before ends.">
            <div className="seg">
              {REPEATS.map(([v, l]) => (
                <button key={v} type="button" className={cn(f.repeat === v && 'is-active')} disabled={!canEdit} onClick={() => set('repeat', v)}>
                  {l}
                </button>
              ))}
            </div>
            <div className="form-grid">
              {f.repeat === 'once' && (
                <div className="span-2">
                  <Label htmlFor="wb-date" required>
                    Date
                  </Label>
                  <TextInput id="wb-date" type="date" value={f.first_date} disabled={!canEdit} onChange={(e) => set('first_date', e.target.value)} />
                </div>
              )}
              {f.repeat === 'dates' && (
                <div className="span-2 stack" style={{ gap: 8 }}>
                  <Label htmlFor="wb-add-date" required>
                    Dates
                  </Label>
                  {f.dates.length > 0 && (
                    <div className="pf-chips">
                      {[...f.dates].sort().map((d) => (
                        <span key={d} className="pf-chip">
                          {day(d)}
                          {canEdit && (
                            <button type="button" aria-label={`Remove ${d}`} onClick={() => set('dates', f.dates.filter((x) => x !== d))}>
                              <X size={12} />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <div className="pf-option-add">
                      <TextInput id="wb-add-date" type="date" value={newDate} min={today()} onChange={(e) => setNewDate(e.target.value)} />
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={!newDate}
                        onClick={() => {
                          if (newDate && !f.dates.includes(newDate)) set('dates', [...f.dates, newDate])
                          setNewDate('')
                        }}
                      >
                        <Plus size={14} /> Add date
                      </button>
                    </div>
                  )}
                </div>
              )}
              {f.repeat === 'weekly' && (
                <>
                  <div className="span-2">
                    <span className="field-label">Every</span>
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {WEEKDAYS.map((w, i) => {
                        const on = f.weekdays.includes(i)
                        return (
                          <button
                            key={w}
                            type="button"
                            className={cn('btn btn-sm', on ? 'btn-primary' : 'btn-outline')}
                            disabled={!canEdit}
                            aria-pressed={on}
                            onClick={() => set('weekdays', on ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i])}
                          >
                            {w}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="wb-from" required>
                      Starts from
                    </Label>
                    <TextInput id="wb-from" type="date" value={f.first_date} disabled={!canEdit} onChange={(e) => set('first_date', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="wb-stops">Stops</Label>
                    <Select id="wb-stops" value={stops} disabled={!canEdit} onChange={(e) => setStops(e.target.value as 'never' | 'on')}>
                      <option value="never">Never</option>
                      <option value="on">On a date</option>
                    </Select>
                  </div>
                  {stops === 'on' && (
                    <div>
                      <Label htmlFor="wb-stop" required>
                        Last day
                      </Label>
                      <TextInput id="wb-stop" type="date" value={f.stop_date ?? ''} min={f.first_date} disabled={!canEdit} onChange={(e) => set('stop_date', e.target.value || null)} />
                    </div>
                  )}
                </>
              )}
              <div>
                <Label htmlFor="wb-start" required>
                  Start time
                </Label>
                <TextInput id="wb-start" type="time" value={f.start_time} disabled={!canEdit} onChange={(e) => set('start_time', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="wb-end" required>
                  End time
                </Label>
                <TextInput id="wb-end" type="time" value={f.end_time} disabled={!canEdit} onChange={(e) => set('end_time', e.target.value)} />
              </div>
            </div>
            <Hint>India time. Every date has the same start and end time.</Hint>
          </FormSection>

          {webinar && (
            <div className="check-box">
              <Checkbox
                id="wb-active"
                checked={f.is_active}
                onChange={(v) => set('is_active', v)}
                label="Active"
                description="Off: no new dates are made (a date already coming up stays)."
              />
            </div>
          )}
        </div>
      </Drawer>
      {addingHost && (
        <HostDrawer
          host={null}
          nextOrder={Math.max(0, ...hosts.map((h) => h.sort_order)) + 1}
          onClose={() => setAddingHost(false)}
          onSaved={(id) => {
            setAddingHost(false)
            void listHosts(tenant.id).then(setHosts)
            set('host_id', id)
          }}
        />
      )}
    </>
  )
}
