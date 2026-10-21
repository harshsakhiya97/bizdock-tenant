import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection, Label, Select, TextInput } from '@/components/Field'
import type { FunnelRow } from '@/funnels/types'
import { useTenant } from '@/tenant/useTenant'
import { ago } from '@/team/time'
import { clearLeadFollowUps, scheduleFollowUp } from '@/followups/api'
import { createLead, listActivities, logActivity, phoneExists, updateLead } from './api'
import { toLocalInput } from './labels'
import { LeadOrigin } from './LeadOrigin'
import type { ActivityRow, LeadInput, LeadRow, MemberOption, Option } from './types'
import { SubBusinessSelect, subOf, useSubBusinesses } from '@/business/SubBusinessSelect'

const phoneOk = (v: string) => v.replace(/\D/g, '').length >= 10

export function LeadDrawer({
  lead,
  funnels,
  sources,
  members,
  defaultFunnelId,
  onClose,
  onSaved,
}: {
  /** null = add a new lead */
  lead: LeadRow | null
  funnels: FunnelRow[]
  sources: Option[]
  lostReasons: Option[]
  members: MemberOption[]
  defaultFunnelId: string | null
  onClose: () => void
  /** `wonLeadId`: the lead was just moved into (or added in) a Won stage */
  onSaved: (msg: string, wonLeadId?: string) => void
}) {
  const tenant = useTenant()
  const { can, membership } = useAuth()
  const me = membership?.id
  // a lead imported without a funnel can stay without one, or be put into a funnel of its business
  const noFunnelLead = !!lead && !lead.funnel_id
  const firstFunnel = noFunnelLead ? undefined : (funnels.find((f) => f.id === (lead?.funnel_id ?? defaultFunnelId)) ?? funnels[0])
  const [input, setInput] = useState<LeadInput>(() => ({
    funnel_id: noFunnelLead ? '' : (lead?.funnel_id ?? firstFunnel?.id ?? ''),
    stage_id: noFunnelLead ? '' : (lead?.stage_id ?? firstFunnel?.funnel_stages[0]?.id ?? ''),
    first_name: lead?.first_name ?? '',
    last_name: lead?.last_name ?? '',
    phone: lead?.phone ?? '',
    whatsapp: lead?.whatsapp ?? '',
    email: lead?.email ?? '',
    city: lead?.city ?? '',
    source_id: lead?.source_id ?? '',
    referred_by: lead?.referred_by ?? '',
    temperature: lead?.temperature ?? '',
    estimated_amount: lead?.estimated_amount != null ? String(lead.estimated_amount) : '',
    owner_id: lead ? (lead.owner_id ?? '') : (me && members.some((m) => m.id === me) ? me : ''),
    tags: (lead?.tags ?? []).join(', '),
    notes: lead?.notes ?? '',
    next_follow_up_at: toLocalInput(lead?.next_follow_up_at ?? null),
    purpose: lead?.purpose ?? '',
    required_on: lead?.required_on ?? '',
    required_hours: lead?.required_hours != null ? String(lead.required_hours) : '',
    sub_business_id: lead?.sub_business_id ?? '',
  }))
  // stage / lost reason are no longer changed here
  const stageNote = ''
  const [name, setName] = useState(() => `${lead?.first_name ?? ''} ${lead?.last_name ?? ''}`.trim())
  const lostReason = ''
  const [activities, setActivities] = useState<ActivityRow[] | null>(null)
  const [newNote, setNewNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const canEdit = lead ? can('leads', 'edit') : can('leads', 'add')
  const canAssign = can('leads', 'assign')
  const canFollowUp = canEdit || can('follow_ups', 'add')

  const funnel = funnels.find((f) => f.id === input.funnel_id)
  const stage = funnel?.funnel_stages.find((s) => s.id === input.stage_id)
  const bizId = funnel?.business_id ?? lead?.business_id
  const subs = useSubBusinesses(bizId)
  const stageChanged = !!lead && !!lead.stage_id && input.stage_id !== lead.stage_id
  const needsNote = stageChanged && !!stage && (stage.note_required || stage.kind === 'lost')
  const stageName = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of funnels) for (const s of f.funnel_stages) m.set(s.id, s.name)
    return m
  }, [funnels])
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Someone'

  useEffect(() => {
    if (!lead) return
    listActivities(lead.id)
      .then(setActivities)
      .catch(() => setActivities([]))
  }, [lead])

  const set = (k: keyof LeadInput) => (e: { target: { value: string } }) =>
    setInput((d) => ({ ...d, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const keepNoFunnel = noFunnelLead && !input.funnel_id
    if (!keepNoFunnel && (!funnel || !stage)) return setError('Pick a funnel and stage.')
    if (!input.first_name.trim()) return setError('Name is required.')
    if (!phoneOk(input.phone)) return setError('Enter a valid phone number (10 digits).')
    if (input.estimated_amount.trim() && Number.isNaN(Number(input.estimated_amount))) return setError('Estimated amount must be a number.')
    if (needsNote && stage.note_required && !stageNote.trim()) return setError(`A note is required when moving to ${stage.name}.`)
    if (needsNote && stage.kind === 'lost' && !lostReason) return setError('Pick a lost reason.')
    setBusy(true)
    setError(null)
    try {
      const businessId = funnel?.business_id ?? lead!.business_id
      // a sub-business only stays when it belongs to the lead's business
      const clean = { ...input, sub_business_id: subOf(subs, input.sub_business_id) }
      if (!lead || businessId !== lead.business_id || input.phone !== lead.phone) {
        if (await phoneExists(businessId, input.phone, lead?.id)) {
          setBusy(false)
          return setError('A lead with this phone number already exists in this business.')
        }
      }
      const leadId = lead
        ? (await updateLead(tenant.id, me, lead, clean, { note: stageNote, lost_reason_id: lostReason || null }), lead.id)
        : await createLead(tenant.id, businessId, me, clean)
      // the follow-up date lives in Follow-ups: a new date schedules one, clearing it cancels the pending one
      const before = toLocalInput(lead?.next_follow_up_at ?? null)
      if (canFollowUp && input.next_follow_up_at !== before) {
        if (input.next_follow_up_at)
          await scheduleFollowUp(tenant.id, me, {
            lead_id: leadId,
            due_at: input.next_follow_up_at,
            mode: 'call',
            purpose: '',
            assigned_to: input.owner_id,
          })
        else if (lead) await clearLeadFollowUps(lead.id)
      }
      const won = stage?.kind === 'won' && (!lead || stageChanged)
      onSaved(`${input.first_name.trim()} ${lead ? 'saved' : 'added'}.`, won ? leadId : undefined)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  async function addNote() {
    if (!lead || !newNote.trim()) return
    await logActivity(tenant.id, me, [lead.id], { kind: 'note', note: newNote.trim() })
    setNewNote('')
    setActivities(await listActivities(lead.id))
  }

  function activityText(a: ActivityRow) {
    switch (a.kind) {
      case 'created':
        return `Lead added${a.to_stage_id ? ` in ${stageName.get(a.to_stage_id) ?? 'a stage'}` : ''}${!a.member_id ? ' from a landing page' : ''}`
      case 'stage':
        return `Moved ${stageName.get(a.from_stage_id ?? '') ?? '—'} → ${stageName.get(a.to_stage_id ?? '') ?? '—'}`
      case 'assigned':
        return 'Owner changed'
      case 'temperature':
        return 'Temperature changed'
      case 'follow_up':
        return 'Follow-up scheduled'
      case 'archived':
        return 'Archived'
      case 'restored':
        return 'Restored'
      case 'submission':
        return 'Form submitted again'
      case 'imported':
        return 'Imported'
      default:
        return 'Note'
    }
  }

  return (
    <Drawer
      open
      width={720}
      onClose={onClose}
      title={lead ? `${lead.first_name} ${lead.last_name ?? ''}`.trim() : 'Add lead'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {canEdit || canFollowUp ? 'Cancel' : 'Close'}
          </Button>
          {(canEdit || canFollowUp || canAssign) && (
            <div className="foot-end">
              {error && <p className="err-text">{error}</p>}
              <Button type="submit" form="lead-form" disabled={busy}>
                {busy ? 'Saving…' : lead ? 'Save changes' : 'Create lead'}
              </Button>
            </div>
          )}
        </>
      }
    >
      <form id="lead-form" onSubmit={submit} className="stack">
        {lead?.is_archived && (
          <div className="alert alert-warning">Archived{lead.archive_reason ? `: ${lead.archive_reason}` : ''}.</div>
        )}
        <FormSection title="Lead details">
          <div className="form-grid">
            <div>
              <Label htmlFor="l-name" required>
                Name
              </Label>
              <TextInput
                id="l-name"
                value={name}
                onChange={(e) => {
                  // the full name is kept as first name + the rest
                  const v = e.target.value
                  setName(v)
                  const first = v.trim().split(/\s+/)[0] ?? ''
                  setInput((d) => ({ ...d, first_name: first, last_name: v.trim().slice(first.length).trim() }))
                }}
                disabled={!canEdit}
                autoFocus={!lead}
              />
            </div>
            <div>
              <Label htmlFor="l-phone" required>
                Phone
              </Label>
              <TextInput id="l-phone" type="tel" placeholder="10 digit / +91…" value={input.phone} onChange={set('phone')} disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="l-city">City</Label>
              <TextInput id="l-city" value={input.city} onChange={set('city')} disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="l-source">Source</Label>
              <Select id="l-source" value={input.source_id} onChange={set('source_id')} disabled={!canEdit}>
                <option value="">— select —</option>
                {sources.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="l-purpose">Purpose</Label>
              <TextInput id="l-purpose" placeholder="e.g. Podcast" value={input.purpose} onChange={set('purpose')} disabled={!canEdit} />
            </div>
            <SubBusinessSelect id="l-sub" businessId={bizId} value={input.sub_business_id} onChange={(v) => setInput((d) => ({ ...d, sub_business_id: v }))} disabled={!canEdit} />
          </div>
        </FormSection>

        {lead && <LeadOrigin lead={lead} />}

        {lead && (
          <FormSection title="Activity">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <TextInput placeholder="Add a note (call outcome, next step…)" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
              <Button variant="dark" onClick={addNote} disabled={!newNote.trim()}>
                Add note
              </Button>
            </div>
            {!activities ? (
              <div className="muted small">Loading…</div>
            ) : activities.length === 0 ? (
              <div className="muted small">Nothing yet.</div>
            ) : (
              <ol className="timeline">
                {activities.map((a) => (
                  <li key={a.id}>
                    <span className="tl-dot" />
                    <div>
                      <b>{activityText(a)}</b>
                      {a.note && a.kind !== 'note' ? <p>{a.note}</p> : a.kind === 'note' ? <p>{a.note}</p> : null}
                      <small>
                        {a.member_id ? memberName(a.member_id) : 'Webhook'} · {ago(a.created_at)}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </FormSection>
        )}
      </form>
    </Drawer>
  )
}
