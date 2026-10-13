import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection, Hint, Label, Select, TextArea, TextInput } from '@/components/Field'
import { TagInput } from '@/components/TagInput'
import { listEvents, listEventTypes, type EventRow } from '@/calendar/api'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { saveFunnel } from './api'
import { FUNNEL_TYPES, KIND_LABEL, STAGE_COLORS, newKey, templateStages } from './templates'
import type { FunnelInput, FunnelRow, FunnelType, StageDraft, StageKind } from './types'

/** Create a funnel (from a type's starter stages) or edit one, including its stages. */
export function FunnelDrawer({
  funnel,
  businesses,
  defaultBusinessId,
  onClose,
  onSaved,
}: {
  /** null = new funnel */
  funnel: FunnelRow | null
  businesses: { id: string; name: string }[]
  defaultBusinessId: string | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const [input, setInput] = useState<FunnelInput>(() => ({
    business_id: funnel?.business_id ?? defaultBusinessId ?? (businesses.length === 1 ? businesses[0].id : ''),
    name: funnel?.name ?? '',
    type: funnel?.type ?? 'lead_gen',
    description: funnel?.description ?? '',
    tags: funnel?.tags ?? [],
    event_id: funnel?.event_id ?? '',
  }))
  const [linked, setLinked] = useState(!!funnel?.event_id)
  const [events, setEvents] = useState<EventRow[] | null>(null)
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
      : templateStages('lead_gen'),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function pickType(type: FunnelType) {
    setInput((d) => ({ ...d, type }))
    // a new funnel starts with that type's stages; an existing funnel keeps its own
    if (!funnel) setStages(templateStages(type))
  }

  const update = (key: string, patch: Partial<StageDraft>) =>
    setStages((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  function move(i: number, dir: -1 | 1) {
    setStages((list) => {
      const next = [...list]
      const j = i + dir
      if (j < 0 || j >= next.length) return list
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function addStage() {
    // new stages go before the first won/lost stage
    setStages((list) => {
      const at = list.findIndex((s) => s.kind !== 'open')
      const stage: StageDraft = {
        key: newKey(),
        name: '',
        color: STAGE_COLORS[list.length % STAGE_COLORS.length],
        kind: 'open',
        note_required: false,
      }
      return at === -1 ? [...list, stage] : [...list.slice(0, at), stage, ...list.slice(at)]
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!input.business_id) return setError('Pick a business.')
    if (!input.name.trim()) return setError('Funnel name is required.')
    if (stages.some((s) => !s.name.trim())) return setError('Every stage needs a name.')
    const names = stages.map((s) => s.name.trim().toLowerCase())
    if (new Set(names).size !== names.length) return setError('Two stages have the same name.')
    if (!stages.some((s) => s.kind === 'open')) return setError('Add at least one in-progress stage.')
    if (!stages.some((s) => s.kind === 'won')) return setError('Add at least one Won stage.')
    if (linked && !input.event_id) return setError('Pick the webinar or event, or answer No.')
    setBusy(true)
    setError(null)
    try {
      await saveFunnel(tenant.id, funnel, { ...input, event_id: linked ? input.event_id : '' }, stages)
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
                onChange={(e) => setInput((d) => ({ ...d, business_id: e.target.value }))}
              >
                <option value="">— select —</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
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
              <div className="choice-grid choice-grid-4">
                {FUNNEL_TYPES.map((t) => (
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
              <Hint>
                {funnel
                  ? 'Changing the type keeps the stages below.'
                  : 'Each type starts with its own stages. You can rename, reorder, add or remove them below.'}
              </Hint>
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

        <FormSection title="Webinar / event" description="Is this funnel connected with a webinar or event from the Calendar?">
          <div className="seg seg-sm" style={{ alignSelf: 'flex-start' }}>
            <button type="button" className={cn(!linked && 'is-active')} onClick={() => setLinked(false)}>
              No
            </button>
            <button type="button" className={cn(linked && 'is-active')} onClick={() => setLinked(true)}>
              Yes
            </button>
          </div>
          {linked && (
            <div>
              <Label htmlFor="f-event" required>
                Webinar or event
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
                  ? 'No upcoming webinar or event for this business. Add it in Calendar & Webinars first.'
                  : 'Its date is used for messages sent before the webinar / event.'}
              </Hint>
            </div>
          )}
        </FormSection>

        <FormSection
          title="Stages"
          description="In the order leads move through them. Won and Lost stages close the lead."
        >
          <div className="stage-list">
            <div className="stage-row stage-head">
              <span />
              <span>Name</span>
              <span>Closes as</span>
              <span>Note required</span>
              <span />
            </div>
            {stages.map((s, i) => (
              <div key={s.key} className="stage-row">
                <input
                  type="color"
                  className="stage-color"
                  aria-label={`Colour of ${s.name || 'stage'}`}
                  value={s.color}
                  onChange={(e) => update(s.key, { color: e.target.value })}
                />
                <input
                  className="input input-sm"
                  aria-label="Stage name"
                  placeholder="Stage name"
                  value={s.name}
                  onChange={(e) => update(s.key, { name: e.target.value })}
                />
                <select
                  className="input input-sm"
                  aria-label="Stage kind"
                  value={s.kind}
                  onChange={(e) => update(s.key, { kind: e.target.value as StageKind })}
                >
                  {(Object.keys(KIND_LABEL) as StageKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                <label className="stage-note">
                  <input
                    type="checkbox"
                    checked={s.note_required}
                    onChange={(e) => update(s.key, { note_required: e.target.checked })}
                  />
                  <span className="sr-only">Note required</span>
                </label>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    title="Move up"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    title="Move down"
                    aria-label="Move down"
                    disabled={i === stages.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon danger-text"
                    title="Delete stage"
                    aria-label={`Delete ${s.name || 'stage'}`}
                    disabled={stages.length <= 1}
                    onClick={() => setStages((list) => list.filter((x) => x.key !== s.key))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="add-chips">
            <button type="button" className="add-chip" onClick={addStage}>
              <Plus size={14} /> Add stage
            </button>
          </div>
          <Hint>“Note required”: when a lead is moved into this stage, the person must write a note.</Hint>
        </FormSection>
      </form>
    </Drawer>
  )
}
