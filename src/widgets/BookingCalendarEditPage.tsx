import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Code2, Network, Save } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { FormSection, Hint, Label, Select, TextInput } from '@/components/Field'
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

/** a BizDock workflow (made on save if not yet) or another tool's webhook URL */
type HookChoice = 'workflow' | 'url'

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
  const [hook, setHook] = useState<HookChoice>('workflow')
  // the workflow already linked to this widget (kept when switching to a URL and back)
  const [linked, setLinked] = useState('')
  const [url, setUrl] = useState('')
  const [team, setTeam] = useState(false)
  // after booking: show a message, or send them to a page
  const [after, setAfter] = useState<'message' | 'redirect'>('message')
  const tyRef = useRef<HTMLTextAreaElement>(null)
  // the message's fields: the booked slot (and the team member it went to)
  const msgFields: [string, string][] = [
    ['date', 'Date (4 Nov 2026)'],
    ['time', 'Start time (3:00 pm)'],
    ['end_time', 'End time (3:30 pm)'],
    ...(team ? ([['member_name', 'Team member’s name']] as [string, string][]) : []),
  ]
  function insertField(k: string) {
    const el = tyRef.current
    const tag = `{{${k}}}`
    const at = el ? el.selectionStart : cfg.thank_you.length
    const end = el ? el.selectionEnd : at
    set('thank_you', cfg.thank_you.slice(0, at) + tag + cfg.thank_you.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + tag.length, at + tag.length)
    })
  }
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
      setLinked(w.config.webhook?.type === 'workflow' ? w.config.webhook.workflow_id : '')
      setUrl(w.config.webhook?.type === 'url' ? w.config.webhook.url : '')
      setTeam((w.config.members ?? []).length > 0)
      setAfter(w.config.redirect_url?.trim() ? 'redirect' : 'message')
    }, (e: Error) => setError(e.message))
  }, [id, isNew, tenant.primary_color])

  const set = <K extends keyof BookingConfig>(k: K, v: BookingConfig[K]) => setCfg((c) => ({ ...c, [k]: v }))
  const setDay = (k: DayKey, patch: Partial<BookingConfig['days'][DayKey]>) => setCfg((c) => ({ ...c, days: { ...c.days, [k]: { ...c.days[k], ...patch } } }))
  const toggleMember = (mid: string) => set('members', cfg.members.includes(mid) ? cfg.members.filter((x) => x !== mid) : [...cfg.members, mid])
  const linkedFlow = flows.find((f) => f.id === linked)

  function problem(): string | null {
    if (!name.trim()) return 'Give the booking calendar a name.'
    const on = DAYS.filter((d) => cfg.days[d.key]?.on)
    if (!on.length) return 'Turn on at least one day.'
    for (const d of on) if (!(cfg.days[d.key].start < cfg.days[d.key].end)) return `${d.label}: the end time must be after the start time.`
    if (!(cfg.days_ahead >= 1)) return 'Set how many days ahead people can book.'
    if (team && !cfg.members.length) return 'Pick at least one team member, or untick “Connect with the team’s calendar”.'
    if (hook === 'url' && !/^https?:\/\/\S+$/i.test(url.trim())) return 'Paste the webhook URL (starting with https://).'
    if (after === 'message' && !cfg.thank_you.trim()) return 'Write the message shown after booking.'
    if (after === 'redirect' && !/^https?:\/\/\S+$/i.test(cfg.redirect_url.trim())) return 'Give the page to send them to (starting with https://).'
    return null
  }

  async function save() {
    setError(null)
    setSaved(undefined)
    const p = problem()
    if (p) return setError(p)
    setBusy(true)
    try {
      let webhook: BookingConfig['webhook']
      if (hook === 'url') webhook = { type: 'url', url: url.trim() }
      else {
        // its own "On webhook call" workflow: made once, then kept
        let wf = linked
        if (!wf) {
          wf = await createWorkflow(tenant.id, membership?.id, `${name.trim()} – bookings`, 'webhook_call')
          setLinked(wf)
        }
        webhook = { type: 'workflow', workflow_id: wf }
      }
      const config: BookingConfig = { ...cfg, members: team ? cfg.members : [], webhook, redirect_url: after === 'redirect' ? cfg.redirect_url.trim() : '', thank_you: cfg.thank_you.trim() }
      const made = hook === 'workflow' && webhook.type === 'workflow' && webhook.workflow_id !== linked
      if (isNew) {
        const w = await createWidget(tenant.id, membership?.id, name, config)
        navigate(`/widgets/booking-calendar/${w.id}`, { replace: true })
        setSaved('Saved. Copy the embed code and paste it on your page.')
        setEmbed(true)
      } else {
        await updateWidget(id!, { name: name.trim(), config })
        setRow((r) => (r ? { ...r, name: name.trim(), config } : r))
        setCfg(config)
        setSaved('Saved. The embed shows the changes straight away.')
      }
      if (made || hook === 'workflow') void listWorkflows(tenant.id).then((w) => setFlows(w.filter((x) => x.trigger_type === 'webhook_call')))
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
        subtitle="Visitors pick a free slot and submit; the booking goes to the webhook. All times are India time."
        actions={
          <div className="row" style={{ gap: 8 }}>
            {row && hook === 'workflow' && linked && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => navigate(`/workflows/${linked}`, { state: { back: { to: `/widgets/booking-calendar/${row.id}`, label: `Back to ${row.name}`, afterSave: true } } })}
              >
                <Network size={16} /> Workflow
              </button>
            )}
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
                      <div className="bc-times">
                        <input type="time" className="input" aria-label={`${d.label} from`} value={h.start} onChange={(e) => setDay(d.key, { start: e.target.value })} />
                        <span className="muted small">to</span>
                        <input type="time" className="input" aria-label={`${d.label} to`} value={h.end} onChange={(e) => setDay(d.key, { end: e.target.value })} />
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
          >
            <label className="check">
              <input type="checkbox" checked={team} onChange={(e) => setTeam(e.target.checked)} />
              <span>
                <b>Connect with the team’s calendar</b>
                <small>Their meetings in BizDock make slots busy; each booking goes to one of them.</small>
              </span>
            </label>
            {team && (
            <div className="bc-members" style={{ marginTop: 10 }}>
              {members.map((m) => (
                <label key={m.id} className={cn('bc-member', cfg.members.includes(m.id) && 'is-on')}>
                  <input type="checkbox" checked={cfg.members.includes(m.id)} onChange={() => toggleMember(m.id)} />
                  <span>{m.name}</span>
                </label>
              ))}
              {!members.length && <span className="muted small">No team members yet.</span>}
            </div>
            )}
            <Hint>
              {!team
                ? 'Not connected: every slot is open, and no team member is sent with the booking.'
                : !cfg.members.length
                  ? 'Tick the team members whose calendar it follows.'
                  : cfg.members.length === 1
                    ? 'Their busy times show as booked. The booking sends their id, name, email and phone to the webhook.'
                    : `${cfg.members.length} picked: a slot stays open while any of them is free and goes round robin to a free one. The booking sends that member’s id, name, email and phone.`}
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

          <FormSection title="Webhook" description="Where each booking is sent: meeting_start / meeting_end (2026-11-04 15:00), meeting_date, meeting_time, member_id, member_name, member_email, member_phone and booking_id.">
            <div className="wh-actions">
              {(
                [
                  ['workflow', linked ? 'BizDock workflow' : 'Create a new workflow & connect', linked ? `Connected to “${linkedFlow?.name ?? 'its workflow'}”.` : `Creates an “On webhook call” workflow (“${name.trim() || 'Booking calendar'} – bookings”) when you save, and sends the bookings to it.`],
                  ['url', 'Other webhook URL', 'Another tool’s webhook; each booking is posted to it as JSON.'],
                ] as [HookChoice, string, string][]
              ).map(([v, l, h]) => (
                <label key={v} className={cn('wh-action', hook === v && 'is-on')}>
                  <input type="radio" name="bc-hook" checked={hook === v} onChange={() => setHook(v)} />
                  <span>
                    <b>{l}</b>
                    <small>{h}</small>
                  </span>
                </label>
              ))}
            </div>
            {hook === 'workflow' && linked && (
              <Hint>
                <Link to={`/workflows/${linked}`} state={{ back: { to: `/widgets/booking-calendar/${id}`, label: `Back to ${name || 'the booking calendar'}`, afterSave: true } }} className="link-btn">
                  Open the workflow
                </Link>{' '}
                to add its steps (turn it on so bookings run it). To see the fields there, click “Listen for a test” on its trigger and make a test booking.
              </Hint>
            )}
            {hook === 'url' && (
              <div style={{ marginTop: 12 }}>
                <Label htmlFor="bc-url" required>
                  Webhook URL
                </Label>
                <TextInput id="bc-url" value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
              </div>
            )}
          </FormSection>

          <FormSection title="After booking" description="What the visitor sees once the booking is made.">
            <div className="wh-actions">
              {(
                [
                  ['message', 'Show a message', 'A thank-you message in the calendar.'],
                  ['redirect', 'Redirect to a page', 'Send them to your page, e.g. a thank-you page.'],
                ] as ['message' | 'redirect', string, string][]
              ).map(([v, l, h]) => (
                <label key={v} className={cn('wh-action', after === v && 'is-on')}>
                  <input type="radio" name="bc-after" checked={after === v} onChange={() => setAfter(v)} />
                  <span>
                    <b>{l}</b>
                    <small>{h}</small>
                  </span>
                </label>
              ))}
            </div>
            {after === 'message' ? (
              <div style={{ marginTop: 12 }}>
                <Label htmlFor="bc-ty" required>
                  Message
                </Label>
                <textarea id="bc-ty" ref={tyRef} className="input" rows={3} value={cfg.thank_you} onChange={(e) => set('thank_you', e.target.value)} />
                <Select
                  aria-label="Insert a field"
                  value=""
                  style={{ marginTop: 8, maxWidth: 280 }}
                  onChange={(e) => e.target.value && insertField(e.target.value)}
                >
                  <option value="">Insert a field…</option>
                  {msgFields.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <Label htmlFor="bc-redirect" required>
                  Page URL
                </Label>
                <TextInput id="bc-redirect" value={cfg.redirect_url} placeholder="https://… (e.g. your thank-you page)" onChange={(e) => set('redirect_url', e.target.value)} />
              </div>
            )}
          </FormSection>
        </div>
      </div>

      {embed && row && <EmbedModal widget={row} onClose={() => setEmbed(false)} />}
    </>
  )
}
