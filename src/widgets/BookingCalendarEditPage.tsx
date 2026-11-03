import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Code2, Save } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { FormSection, Hint, Label, Select, TextArea, TextInput } from '@/components/Field'
import { PageHead } from '@/components/ui'
import { Flash } from '@/components/Flash'
import { listMemberOptions } from '@/leads/api'
import type { MemberOption } from '@/leads/types'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { createWorkflow, listWorkflows } from '@/workflows/api'
import type { WorkflowRow } from '@/workflows/types'
import { createWidget, DAYS, defaultBookingConfig, getWidget, INTERVALS, updateWidget, type BookingConfig, type DayKey, type WidgetRow } from './api'
import { EmbedModal } from './EmbedModal'

type HookChoice = 'new' | 'workflow' | 'url'

/** New / edit a Booking Calendar: slot length, days & hours, team, colour, booking window, webhook and after booking. */
export function BookingCalendarEditPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const tenant = useTenant()
  const { membership, can } = useAuth()
  const navigate = useNavigate()
  const [row, setRow] = useState<WidgetRow | null>(null)
  const [name, setName] = useState('Book a call')
  const [cfg, setCfg] = useState<BookingConfig>(() => defaultBookingConfig(tenant.primary_color))
  const [hook, setHook] = useState<HookChoice>('new')
  const [members, setMembers] = useState<MemberOption[]>([])
  const [flows, setFlows] = useState<WorkflowRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)
  const [embed, setEmbed] = useState(false)
  const canSave = isNew ? can('widgets', 'add') : can('widgets', 'edit')

  useEffect(() => {
    void listMemberOptions(tenant.id).then(setMembers)
    void listWorkflows(tenant.id).then((w) => setFlows(w.filter((x) => x.trigger_type === 'webhook_call')), () => undefined)
  }, [tenant.id])
  useEffect(() => {
    if (isNew) return
    getWidget(id!).then((w) => {
      if (!w) return setMissing(true)
      setRow(w)
      setName(w.name)
      setCfg({ ...defaultBookingConfig(tenant.primary_color), ...w.config })
      setHook(w.config.webhook?.type === 'url' ? 'url' : 'workflow')
    }, (e: Error) => setError(e.message))
  }, [id, isNew, tenant.primary_color])

  const set = <K extends keyof BookingConfig>(k: K, v: BookingConfig[K]) => setCfg((c) => ({ ...c, [k]: v }))
  const setDay = (k: DayKey, patch: Partial<BookingConfig['days'][DayKey]>) => setCfg((c) => ({ ...c, days: { ...c.days, [k]: { ...c.days[k], ...patch } } }))
  const toggleMember = (mid: string) => set('members', cfg.members.includes(mid) ? cfg.members.filter((x) => x !== mid) : [...cfg.members, mid])
  const hookUrl = cfg.webhook.type === 'url' ? cfg.webhook.url : ''
  const hookFlow = cfg.webhook.type === 'workflow' ? cfg.webhook.workflow_id : ''

  function problem(): string | null {
    if (!name.trim()) return 'Give the booking calendar a name.'
    const on = DAYS.filter((d) => cfg.days[d.key]?.on)
    if (!on.length) return 'Turn on at least one day.'
    for (const d of on) if (!(cfg.days[d.key].start < cfg.days[d.key].end)) return `${d.label}: the end time must be after the start time.`
    if (!(cfg.days_ahead >= 1)) return 'Set how many days ahead people can book.'
    if (hook === 'workflow' && !hookFlow) return 'Pick the workflow the bookings go to.'
    if (hook === 'url' && !/^https?:\/\/\S+$/i.test(hookUrl.trim())) return 'Paste the webhook URL (starting with https://).'
    if (cfg.redirect_url.trim() && !/^https?:\/\/\S+$/i.test(cfg.redirect_url.trim())) return 'The page to send them to must start with https://'
    return null
  }

  async function save() {
    setError(null)
    setSaved(undefined)
    const p = problem()
    if (p) return setError(p)
    setBusy(true)
    try {
      let webhook = cfg.webhook
      // a new "On webhook call" workflow for the bookings
      if (hook === 'new') {
        const wf = await createWorkflow(tenant.id, membership?.id, `${name.trim()} – bookings`, 'webhook_call')
        webhook = { type: 'workflow', workflow_id: wf }
      } else if (hook === 'url') webhook = { type: 'url', url: hookUrl.trim() }
      else webhook = { type: 'workflow', workflow_id: hookFlow }
      const config: BookingConfig = { ...cfg, webhook, redirect_url: cfg.redirect_url.trim(), thank_you: cfg.thank_you.trim() }
      if (isNew) {
        const w = await createWidget(tenant.id, membership?.id, name, config)
        navigate(`/widgets/booking-calendar/${w.id}`, { replace: true })
        setSaved('Saved. Copy the embed code and paste it on your page.')
        setEmbed(true)
      } else {
        await updateWidget(id!, { name: name.trim(), config })
        setRow((r) => (r ? { ...r, name: name.trim(), config } : r))
        setCfg(config)
        setHook('workflow' === config.webhook.type ? 'workflow' : 'url')
        setSaved('Saved. The embed shows the changes straight away.')
      }
      if (hook === 'new') void listWorkflows(tenant.id).then((w) => setFlows(w.filter((x) => x.trigger_type === 'webhook_call')))
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  if (missing)
    return (
      <div className="empty">
        This booking calendar doesn’t exist or was deleted. <Link to="/widgets/booking-calendar" className="link-btn">Back to booking calendars</Link>
      </div>
    )

  return (
    <>
      <Link to="/widgets/booking-calendar" className="back-link">
        <ArrowLeft size={14} /> Booking Calendar
      </Link>
      <PageHead
        title={isNew ? 'New booking calendar' : name || 'Booking calendar'}
        subtitle="Visitors pick a free slot and give their name, phone and email; the booking goes to the webhook. All times are India time."
        actions={
          <div className="row" style={{ gap: 8 }}>
            {row && (
              <button type="button" className="btn btn-outline" onClick={() => setEmbed(true)}>
                <Code2 size={16} /> Embed code
              </button>
            )}
            {canSave && (
              <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
                <Save size={16} /> {busy ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        }
      />
      {error && <div className="alert alert-error">{error}</div>}
      <Flash msg={saved} dep={saved} />

      <div className="panel">
        <div className="panel-body stack" style={{ gap: 22, maxWidth: 820 }}>
          <FormSection title="Basics">
            <div className="form-grid">
              <div>
                <Label htmlFor="bc-name" required>
                  Name
                </Label>
                <TextInput id="bc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Podcast strategy call" maxLength={80} />
              </div>
              <div>
                <Label htmlFor="bc-int" required>
                  Time interval (slot length)
                </Label>
                <Select id="bc-int" value={cfg.interval} onChange={(e) => set('interval', Number(e.target.value))}>
                  {INTERVALS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </FormSection>

          <FormSection title="Days & hours" description="The days people can book, and the hours on each (India time). Slots are cut by the time interval.">
            <div className="bc-days">
              {DAYS.map((d) => {
                const h = cfg.days[d.key]
                return (
                  <div key={d.key} className={cn('bc-day', !h.on && 'is-off')}>
                    <label className="check">
                      <input type="checkbox" checked={h.on} onChange={(e) => setDay(d.key, { on: e.target.checked })} />
                      <span>
                        <b>{d.label}</b>
                      </span>
                    </label>
                    {h.on ? (
                      <div className="row" style={{ gap: 8 }}>
                        <TextInput type="time" aria-label={`${d.label} from`} value={h.start} onChange={(e) => setDay(d.key, { start: e.target.value })} />
                        <span className="muted small">to</span>
                        <TextInput type="time" aria-label={`${d.label} to`} value={h.end} onChange={(e) => setDay(d.key, { end: e.target.value })} />
                      </div>
                    ) : (
                      <span className="muted small">Closed</span>
                    )}
                  </div>
                )
              })}
            </div>
          </FormSection>

          <FormSection
            title="Team calendar"
            description="Whose meetings in BizDock make a slot busy. One person: their busy times show as booked. Several: a slot stays open while any of them is free (the booking goes round robin to a free one). No one: every slot is open."
          >
            <div className="bc-members">
              {members.map((m) => (
                <label key={m.id} className={cn('bc-member', cfg.members.includes(m.id) && 'is-on')}>
                  <input type="checkbox" checked={cfg.members.includes(m.id)} onChange={() => toggleMember(m.id)} />
                  <span>{m.name}</span>
                </label>
              ))}
              {!members.length && <span className="muted small">No team members yet.</span>}
            </div>
            <Hint>
              {cfg.members.length === 0
                ? 'No one picked: every slot is open, and no team member is sent with the booking.'
                : `${cfg.members.length} picked. The booking sends the team member’s id, name, email and phone to the webhook.`}
            </Hint>
          </FormSection>

          <FormSection title="Look & booking window">
            <div className="form-grid form-grid-3">
              <div>
                <Label htmlFor="bc-color">Colour</Label>
                <div className="row" style={{ gap: 8 }}>
                  <input id="bc-color" type="color" className="bc-color" value={cfg.color || tenant.primary_color} onChange={(e) => set('color', e.target.value)} />
                  <code className="small">{cfg.color || tenant.primary_color}</code>
                  {cfg.color !== tenant.primary_color && (
                    <button type="button" className="link-btn small" onClick={() => set('color', tenant.primary_color)}>
                      Theme colour
                    </button>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="bc-ahead" required>
                  Book up to (days ahead)
                </Label>
                <TextInput id="bc-ahead" type="number" min={1} max={365} value={cfg.days_ahead} onChange={(e) => set('days_ahead', Math.max(1, Math.min(365, Number(e.target.value) || 1)))} />
              </div>
              <div>
                <Label htmlFor="bc-notice">Notice (hours before)</Label>
                <TextInput id="bc-notice" type="number" min={0} max={168} step={0.5} value={cfg.notice_hours} onChange={(e) => set('notice_hours', Math.max(0, Math.min(168, Number(e.target.value) || 0)))} />
              </div>
            </div>
          </FormSection>

          <FormSection title="Webhook" description="Where each booking is sent: name, phone, email, meeting_start / meeting_end (2026-11-04 15:00), meeting_date, meeting_time, member_id, member_name, member_email, member_phone.">
            <div className="wh-actions">
              {(
                [
                  ['new', 'New BizDock workflow', `Creates an “On webhook call” workflow (“${name.trim() || 'Booking calendar'} – bookings”) and sends the bookings to it.`],
                  ['workflow', 'Existing BizDock workflow', 'One of your “On webhook call” workflows.'],
                  ['url', 'Other webhook URL', 'Any URL (another tool’s webhook).'],
                ] as [HookChoice, string, string][]
              ).map(([v, l, h]) => (
                  <label key={v} className={cn('wh-action', hook === v && 'is-on')}>
                    <input
                      type="radio"
                      name="bc-hook"
                      checked={hook === v}
                      onChange={() => {
                        setHook(v)
                        if (v === 'url') set('webhook', { type: 'url', url: hookUrl })
                        if (v === 'workflow') set('webhook', { type: 'workflow', workflow_id: hookFlow })
                      }}
                    />
                    <span>
                      <b>{l}</b>
                      <small>{h}</small>
                    </span>
                  </label>
                ))}
            </div>
            {hook === 'workflow' && (
              <div style={{ marginTop: 12 }}>
                <Label htmlFor="bc-flow" required>
                  Workflow
                </Label>
                <Select id="bc-flow" value={hookFlow} onChange={(e) => set('webhook', { type: 'workflow', workflow_id: e.target.value })}>
                  <option value="">— select —</option>
                  {flows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {w.is_active ? '' : ' (off)'}
                    </option>
                  ))}
                </Select>
                {hookFlow && (
                  <Hint>
                    <Link to={`/workflows/${hookFlow}`} className="link-btn">
                      Open the workflow
                    </Link>{' '}
                    to add its steps (turn it on so bookings run it). To see the fields there, click “Listen for a test” on its trigger and make a test booking.
                  </Hint>
                )}
              </div>
            )}
            {hook === 'url' && (
              <div style={{ marginTop: 12 }}>
                <Label htmlFor="bc-url" required>
                  Webhook URL
                </Label>
                <TextInput id="bc-url" value={hookUrl} placeholder="https://…" onChange={(e) => set('webhook', { type: 'url', url: e.target.value })} />
                <Hint>Each booking is posted to it as JSON.</Hint>
              </div>
            )}
          </FormSection>

          <FormSection title="After booking">
            <div>
              <Label htmlFor="bc-ty">Thank-you message</Label>
              <TextArea id="bc-ty" rows={3} value={cfg.thank_you} onChange={(e) => set('thank_you', e.target.value)} />
              <Hint>{'{{name}}, {{date}} and {{time}} are filled in, e.g. “4 Nov 2026” and “3:00 pm”.'}</Hint>
            </div>
            <div style={{ marginTop: 12 }}>
              <Label htmlFor="bc-redirect">Or send them to a page (optional)</Label>
              <TextInput id="bc-redirect" value={cfg.redirect_url} placeholder="https://… (e.g. your thank-you page)" onChange={(e) => set('redirect_url', e.target.value)} />
              <Hint>When set, the visitor goes to this page after booking instead of seeing the message.</Hint>
            </div>
          </FormSection>
        </div>
      </div>

      {embed && row && <EmbedModal widget={row} onClose={() => setEmbed(false)} />}
    </>
  )
}
