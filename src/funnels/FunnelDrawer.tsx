import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection, Hint, Label, Select, TextArea, TextInput } from '@/components/Field'
import { TagInput } from '@/components/TagInput'
import { listEvents, listEventTypes, type EventRow } from '@/calendar/api'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { SubBusinessSelect, useSubBusinesses } from '@/business/SubBusinessSelect'
import { saveFunnel } from './api'
import { listMemberOptions } from '@/leads/api'
import type { MemberOption } from '@/leads/types'
import { FUNNEL_TYPES, templateStages } from './templates'
import type { FunnelInput, FunnelRow, FunnelType, StageDraft } from './types'

/** Create a funnel (from a type's starter stages) or edit one, including its stages. */
export function FunnelDrawer({
  funnel,
  businesses,
  defaultBusinessId,
  defaultSubId = null,
  onClose,
  onSaved,
}: {
  /** null = new funnel */
  funnel: FunnelRow | null
  businesses: { id: string; name: string }[]
  defaultBusinessId: string | null
  defaultSubId?: string | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const [input, setInput] = useState<FunnelInput>(() => ({
    business_id: funnel?.business_id ?? defaultBusinessId ?? (businesses.length === 1 ? businesses[0].id : ''),
    sub_business_id: funnel ? (funnel.sub_business_id ?? '') : (defaultSubId ?? ''),
    name: funnel?.name ?? '',
    type: funnel?.type ?? 'webinar',
    description: funnel?.description ?? '',
    tags: funnel?.tags ?? [],
    event_id: funnel?.event_id ?? '',
    assign_mode: funnel?.assign_mode ?? 'none',
    assign_members: funnel?.assign_members ?? [],
  }))
  const [members, setMembers] = useState<MemberOption[]>([])
  useEffect(() => {
    void listMemberOptions(tenant.id).then(setMembers)
  }, [tenant.id])
  const toggleMember = (id: string, on: boolean) =>
    setInput((d) => ({ ...d, assign_members: on ? [...d.assign_members, id] : d.assign_members.filter((x) => x !== id) }))
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const subs = useSubBusinesses(input.business_id)
  const hasSubs = subs.length > 0
  const subOk = subs.some((x) => x.id === input.sub_business_id)
  useEffect(() => {
    Promise.all([listEvents(tenant.id), listEventTypes(tenant.id)])
      .then(([ev, types]) => {
        const ok = new Set(types.filter((t) => t.kind === 'webinar' || t.kind === 'event').map((t) => t.id))
        setEvents(ev.filter((e) => ok.has(e.type_id)))
      })
      .catch(() => setEvents([]))
  }, [tenant.id])
  // upcoming webinars / events of this business (or for all businesses), plus the one already linked
  const today = new Date().toISOString().slice(0, 10)
  const eventOptions = useMemo(
    () =>
      (events ?? []).filter(
        (e) =>
          e.id === input.event_id ||
          ((!e.business_id || e.business_id === input.business_id) && (e.end_date ?? e.event_date) >= today),
      ),
    [events, input.event_id, input.business_id, today],
  )
  const eventLabel = (e: EventRow) =>
    `${e.title} · ${new Date(`${e.event_date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}${e.start_time ? `, ${e.start_time.slice(0, 5)}` : ''}`
  const [stages, setStages] = useState<StageDraft[]>(() =>
    funnel
      ? funnel.funnel_stages.map((s) => ({
          key: s.id,
          id: s.id,
          name: s.name,
          color: s.color,
          kind: s.kind,
          note_required: s.note_required,
        }))
      : templateStages('webinar'),
  )
  // a webinar funnel always belongs to a webinar from the Calendar; a VSL has none
  const linked = input.type === 'webinar'
  // only Webinar and VSL are offered; an older funnel keeps its own type
  const types = FUNNEL_TYPES.filter((t) => t.value === 'webinar' || t.value === 'vsl' || t.value === funnel?.type)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function pickType(type: FunnelType) {
    setInput((d) => ({ ...d, type }))
    // a new funnel starts with that type's stages; an existing funnel keeps its own
    if (!funnel) setStages(templateStages(type))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!input.business_id) return setError('Pick a business.')
    if (!input.name.trim()) return setError('Funnel name is required.')
    if (input.assign_mode === 'single' && !input.assign_members.length) return setError('Pick who new leads go to.')
    if (input.assign_mode === 'round_robin' && input.assign_members.length < 2) return setError('Tick at least two people for round robin.')
    if (linked && !input.event_id) return setError('Pick the webinar.')
    setBusy(true)
    setError(null)
    try {
      await saveFunnel(tenant.id, funnel, { ...input, sub_business_id: subOk ? input.sub_business_id : '', event_id: linked ? input.event_id : '' }, stages)
      onSaved(funnel ? `${input.name.trim()} saved.` : `${input.name.trim()} created.`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      width={680}
      onClose={onClose}
      title={funnel ? 'Edit funnel' : 'Add funnel'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button type="submit" form="funnel-form" disabled={busy}>
              {busy ? 'Saving…' : funnel ? 'Save changes' : 'Create funnel'}
            </Button>
          </div>
        </>
      }
    >
      <form id="funnel-form" onSubmit={submit} className="stack">
        <FormSection title="Funnel">
          <div className="form-grid">
            <div>
              <Label htmlFor="f-business" required>
                Business
              </Label>
              <Select
                id="f-business"
                value={input.business_id}
                onChange={(e) => setInput((d) => ({ ...d, business_id: e.target.value, sub_business_id: '' }))}
              >
                <option value="">— select —</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <SubBusinessSelect id="f-sub" businessId={input.business_id} value={input.sub_business_id} onChange={(v) => setInput((d) => ({ ...d, sub_business_id: v }))} />
            <div className={cn(hasSubs && 'span-2')}>
              <Label htmlFor="f-name" required>
                Funnel name
              </Label>
              <TextInput
                id="f-name"
                placeholder="e.g. Diamond Membership – Webinar"
                value={input.name}
                onChange={(e) => setInput((d) => ({ ...d, name: e.target.value }))}
                autoFocus={!funnel}
              />
            </div>
            <div className="span-2">
              <span className="field-label">Type</span>
              <div className="choice-grid">
                {types.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={cn('choice', input.type === t.value && 'is-active')}
                    onClick={() => pickType(t.value)}
                  >
                    <b>{t.label}</b>
                    <small>{t.hint}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="span-2">
              <Label htmlFor="f-desc">Description</Label>
              <TextArea
                id="f-desc"
                rows={2}
                placeholder="Optional: what this funnel is for, which product or campaign"
                value={input.description}
                onChange={(e) => setInput((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
            <div className="span-2">
              <Label htmlFor="f-tags">Tags</Label>
              <TagInput id="f-tags" value={input.tags} onChange={(tags) => setInput((d) => ({ ...d, tags }))} placeholder="e.g. Diwali offer, FB ads — press Enter after each" />
              <Hint>Added to every lead that comes in through this funnel (landing page forms and funnel imports).</Hint>
            </div>
          </div>
        </FormSection>

        <FormSection title="Lead owner" description="Who new leads from this funnel (forms, sheets, imports) are assigned to.">
          <div>
            <Label htmlFor="f-assign">Assign new leads to</Label>
            <Select id="f-assign" value={input.assign_mode} onChange={(e) => setInput((d) => ({ ...d, assign_mode: e.target.value as FunnelInput['assign_mode'] }))}>
              <option value="none">Nobody (unassigned)</option>
              <option value="single">One person</option>
              <option value="round_robin">Round robin (take turns)</option>
            </Select>
          </div>
          {input.assign_mode === 'single' && (
            <div>
              <Label htmlFor="f-owner" required>
                Team member
              </Label>
              <Select id="f-owner" value={input.assign_members[0] ?? ''} onChange={(e) => setInput((d) => ({ ...d, assign_members: e.target.value ? [e.target.value] : [] }))}>
                <option value="">— select —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {input.assign_mode === 'round_robin' && (
            <div>
              <span className="field-label">Team members (in turn)</span>
              <div className="check-list">
                {members.map((m) => (
                  <label key={m.id} className="check">
                    <input type="checkbox" checked={input.assign_members.includes(m.id)} onChange={(e) => toggleMember(m.id, e.target.checked)} />
                    {m.name}
                  </label>
                ))}
              </div>
              <Hint>Each new lead goes to the next ticked person, in this order. Inactive people are skipped.</Hint>
            </div>
          )}
        </FormSection>

        {linked && (
          <FormSection title="Webinar" description="The webinar from Calendar & Webinars that this funnel registers people for.">
            <div>
              <Label htmlFor="f-event" required>
                Webinar
              </Label>
              <Select id="f-event" value={input.event_id} onChange={(e) => setInput((d) => ({ ...d, event_id: e.target.value }))}>
                <option value="">{events ? '— select —' : 'Loading…'}</option>
                {eventOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {eventLabel(e)}
                  </option>
                ))}
              </Select>
              <Hint>
                {events && !eventOptions.length
                  ? 'No upcoming webinar for this business. Add it in Calendar & Webinars first.'
                  : 'Its date is used for messages sent before the webinar.'}
              </Hint>
            </div>
          </FormSection>
        )}
      </form>
    </Drawer>
  )
}
