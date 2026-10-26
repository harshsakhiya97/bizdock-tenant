import { useRef, type ReactNode } from 'react'
import { ArrowUp, Plus, Trash2, X } from 'lucide-react'
import { Hint, Label, Select, TextInput } from '@/components/Field'
import { WhatsAppFields } from './WhatsAppFields'
import { ALL_TRIGGERS, ATTENDANCE, CONDITION_FIELDS, STEP_META, TRIGGERS, casesOf, problem } from './steps'
import { TRIGGER_DEFAULTS, VARIABLES, type ConditionData, type SwitchCase, type FlowContext, type StepKind, type StepNode, type TriggerData, type TriggerEvent, type Unit, varKey } from './types'

const UNITS: Unit[] = ['minutes', 'hours', 'days']

/** Settings of the selected box (right side of the builder). */
export function StepPanel({
  node,
  ctx,
  canEdit,
  onChange,
  onDelete,
  onClose,
}: {
  node: StepNode
  ctx: FlowContext
  canEdit: boolean
  onChange: (data: Record<string, unknown>) => void
  onDelete: () => void
  onClose: () => void
}) {
  const kind = node.type as StepKind
  const d = node.data
  const meta = STEP_META[kind]
  const Icon = meta.icon
  const set = (k: string, v: unknown) => onChange({ ...d, [k]: v })
  const issue = problem(kind, d, ctx)
  const ro = !canEdit

  return (
    <aside className="cb-panel">
      <div className="cb-panel-head">
        <span className="cb-icon" style={{ ['--c' as string]: meta.color }}>
          <Icon size={16} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <b>{kind === 'trigger' ? 'Trigger' : meta.label}</b>
          <div className="muted small">{meta.hint}</div>
        </div>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="cb-panel-body">
        <div>
          <Label htmlFor="cb-name">
            Name <span className="muted small">(optional)</span>
          </Label>
          <TextInput id="cb-name" value={String(d.name ?? '')} onChange={(e) => set('name', e.target.value)} placeholder={kind === 'trigger' ? 'e.g. New webinar signup' : `e.g. ${meta.label} – welcome`} maxLength={60} disabled={ro} />
        </div>
        {kind === 'trigger' && <TriggerFields t={d as unknown as TriggerData} ctx={ctx} onChange={onChange} disabled={ro} />}

        {(kind === 'whatsapp' || kind === 'email') && <RecipientField d={d} ctx={ctx} set={set} disabled={ro} custom={kind === 'whatsapp'} />}
        {kind === 'whatsapp' && (
          <WhatsAppFields
            d={d}
            extraFields={[...new Set(['purpose', ...ctx.fieldKeys, ...(ctx.extraKeys ?? [])].map(varKey))].filter((k) => k && !VARIABLES.some(([v]) => v === k))}
            set={set}
            onChange={onChange}
            disabled={ro}
            messageField={<MessageField id="cb-wa-m" label="Message" value={String(d.message ?? '')} onChange={(v) => set('message', v)} disabled={ro} rows={6} hint="A free message only reaches leads who messaged you in the last 24 hours." />}
          />
        )}

        {kind === 'email' && (
          <>
            <div>
              <Label htmlFor="cb-em-s" required>
                Subject
              </Label>
              <TextInput id="cb-em-s" value={String(d.subject ?? '')} onChange={(e) => set('subject', e.target.value)} disabled={ro} />
            </div>
            <MessageField id="cb-em-b" label="Message" value={String(d.body ?? '')} onChange={(v) => set('body', v)} disabled={ro} rows={8} />
          </>
        )}

        {kind === 'call' && (
          <MessageField id="cb-call" label="What the call says" value={String(d.script ?? '')} onChange={(v) => set('script', v)} disabled={ro} rows={5} hint="A one-way call plays this message (text-to-speech or a recording) once a calling provider is connected." />
        )}

        {(kind === 'wait' || kind === 'wait_event') && (
          <>
            <div>
              <span className="field-label">{kind === 'wait' ? 'Wait for' : 'Continue'}</span>
              <TimeRow
                amount={Number(d.amount) || 0}
                unit={d.unit as Unit}
                onAmount={(v) => set('amount', v)}
                onUnit={(v) => set('unit', v)}
                disabled={ro}
                extra={
                  kind === 'wait_event' && (
                    <Select aria-label="Before or after" value={String(d.when)} onChange={(e) => set('when', e.target.value)} disabled={ro}>
                      <option value="before">before</option>
                      <option value="after">after</option>
                    </Select>
                  )
                }
              />
            </div>
            {kind === 'wait_event' && (
              <Hint>
                {ctx.event
                  ? `${ctx.event.title} · ${new Date(`${ctx.event.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${ctx.event.time ? `, ${ctx.event.time.slice(0, 5)}` : ''}. Leads who arrive after this moment skip the wait.`
                  : 'This workflow has no webinar / event: use a webinar trigger, or link one to the trigger’s funnel.'}
              </Hint>
            )}
          </>
        )}

        {kind === 'condition' && <ConditionFields d={d} ctx={ctx} set={set} disabled={ro} />}
        {kind === 'switch' && <SwitchFields d={d} ctx={ctx} set={set} disabled={ro} />}
        {kind === 'goto' && (
          <div>
            <Label htmlFor="cb-goto" required>
              Workflow
            </Label>
            <Select id="cb-goto" value={String(d.workflow_id ?? '')} onChange={(e) => set('workflow_id', e.target.value)} disabled={ro}>
              <option value="">— select —</option>
              {ctx.workflows
                .filter((w) => w.id !== ctx.selfId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.is_active ? '' : ' (off)'}
                  </option>
                ))}
            </Select>
            <Hint>The lead leaves this workflow here and starts the chosen one from its first step (its trigger is skipped).</Hint>
          </div>
        )}

        {issue && <div className="alert alert-warning small">{issue}</div>}
      </div>

      {canEdit && kind !== 'trigger' && (
        <div className="cb-panel-foot">
          <button type="button" className="btn btn-ghost danger-text" onClick={onDelete}>
            <Trash2 size={15} /> Delete step
          </button>
        </div>
      )}
    </aside>
  )
}

function RecipientField({ d, ctx, set, disabled, custom }: { d: Record<string, unknown>; ctx: FlowContext; set: (k: string, v: unknown) => void; disabled: boolean; custom?: boolean }) {
  const to = (d.to as string) || 'lead'
  return (
    <div className="form-grid" style={{ gridTemplateColumns: to === 'team' || to === 'custom' ? '120px 1fr' : '1fr' }}>
      <div>
        <Label htmlFor="cb-to">Send to</Label>
        <Select id="cb-to" value={to} onChange={(e) => set('to', e.target.value)} disabled={disabled}>
          <option value="lead">Lead</option>
          <option value="team">Team</option>
          {(custom || to === 'custom') && <option value="custom">Custom</option>}
        </Select>
      </div>
      {to === 'team' && (
        <div>
          <Label htmlFor="cb-member" required>
            Team member
          </Label>
          <Select id="cb-member" value={String(d.member_id ?? '')} onChange={(e) => set('member_id', e.target.value)} disabled={disabled}>
            <option value="">— select —</option>
            {ctx.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      {to === 'custom' && (
        <div>
          <Label htmlFor="cb-custom" required>
            Mobile number
          </Label>
          <div className="input-prefix">
            <span>+91</span>
            <TextInput
              id="cb-custom"
              inputMode="numeric"
              maxLength={10}
              placeholder="10 digits"
              value={String(d.custom_phone ?? '')}
              onChange={(e) => set('custom_phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function MessageField({
  id,
  label,
  value,
  onChange,
  disabled,
  rows,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
  rows: number
  hint?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  function insert(v: string) {
    const el = ref.current
    const tag = `{{${v}}}`
    if (!el) return onChange(value + tag)
    const a = el.selectionStart ?? value.length
    const b = el.selectionEnd ?? value.length
    onChange(value.slice(0, a) + tag + value.slice(b))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(a + tag.length, a + tag.length)
    })
  }
  return (
    <div>
      <Label htmlFor={id} required>
        {label}
      </Label>
      <textarea ref={ref} id={id} className="input" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      {!disabled && (
        <div className="cb-vars">
          {VARIABLES.map(([k, l]) => (
            <button key={k} type="button" onClick={() => insert(k)} title={`Insert ${l}`}>
              {`{{${k}}}`}
            </button>
          ))}
        </div>
      )}
      {hint && <Hint>{hint}</Hint>}
    </div>
  )
}

function ConditionFields({
  d,
  ctx,
  set,
  disabled,
}: {
  d: Record<string, unknown>
  ctx: FlowContext
  set: (k: string, v: unknown) => void
  disabled: boolean
}) {
  return (
    <>
      <CondEditor id="cb-c" c={d as unknown as ConditionData} ctx={ctx} disabled={disabled} onChange={(c) => (set('field', c.field), set('op', c.op), set('value', c.value))} />
      <Hint>Leads that match go down the Yes line, the rest down the No line. A line left empty ends the workflow for them.</Hint>
    </>
  )
}

/** "If the lead's [field] [is / is not] [value]" */
function CondEditor({ id, c, ctx, disabled, onChange }: { id: string; c: ConditionData; ctx: FlowContext; disabled: boolean; onChange: (c: ConditionData) => void }) {
  const field = c.field
  const options: { value: string; label: string }[] | null =
    field === 'stage'
      ? ctx.stages.map((s) => ({ value: s.id, label: s.name }))
      : field === 'landing_page'
        ? ctx.pages.map((p) => ({ value: p.id, label: p.name }))
        : field === 'tag'
          ? ctx.tags.map((t) => ({ value: t, label: t }))
          : field === 'field_filled'
            ? ['email', 'city', ...ctx.fieldKeys].map((k) => ({ value: k, label: k }))
            : field === 'attendance'
              ? ATTENDANCE.map((a) => ({ value: a, label: a }))
              : null
  return (
    <>
      <div>
        <Label htmlFor={`${id}-f`}>If the lead’s</Label>
        <Select id={`${id}-f`} value={field} disabled={disabled} onChange={(e) => onChange({ ...c, field: e.target.value as ConditionData['field'], value: '' })}>
          {CONDITION_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="form-grid" style={{ gridTemplateColumns: '120px 1fr' }}>
        <Select aria-label="is / is not" value={String(c.op)} onChange={(e) => onChange({ ...c, op: e.target.value as ConditionData['op'] })} disabled={disabled}>
          <option value="is">{field === 'field_filled' ? 'is filled' : field === 'tag' ? 'has' : 'is'}</option>
          <option value="is_not">{field === 'field_filled' ? 'is empty' : field === 'tag' ? 'doesn’t have' : 'is not'}</option>
        </Select>
        {field === 'tag' ? (
          <>
            <TextInput aria-label="Tag" list={`${id}-tags`} placeholder="Pick or type a tag" value={String(c.value ?? '')} onChange={(e) => onChange({ ...c, value: e.target.value })} disabled={disabled} />
            <datalist id={`${id}-tags`}>
              {ctx.tags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </>
        ) : options ? (
          <Select aria-label="Value" value={String(c.value ?? '')} onChange={(e) => onChange({ ...c, value: e.target.value })} disabled={disabled}>
            <option value="">— select —</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : (
          <TextInput aria-label="Value" placeholder="e.g. facebook" value={String(c.value ?? '')} onChange={(e) => onChange({ ...c, value: e.target.value })} disabled={disabled} />
        )}
      </div>
      {field === 'attendance' && <Hint>Attendance is filled in once webinar tracking is connected.</Hint>}
    </>
  )
}

/** Switch: several paths, each with its own condition, checked top to bottom; the rest go "Otherwise". */
function SwitchFields({ d, ctx, set, disabled }: { d: Record<string, unknown>; ctx: FlowContext; set: (k: string, v: unknown) => void; disabled: boolean }) {
  const cases = casesOf(d)
  const put = (next: SwitchCase[]) => set('cases', next)
  return (
    <>
      {cases.map((c, i) => (
        <div key={c.id} className="cb-case">
          <div className="row-between">
            <b className="small">Path {i + 1}</b>
            <div className="row" style={{ gap: 2 }}>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Move up" disabled={disabled || i === 0} onClick={() => put(cases.map((x, j) => (j === i - 1 ? cases[i] : j === i ? cases[i - 1] : x)))}>
                <ArrowUp size={13} />
              </button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm danger-text" aria-label="Remove path" disabled={disabled || cases.length <= 1} onClick={() => put(cases.filter((x) => x.id !== c.id))}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          <TextInput aria-label="Path name" placeholder={`Name (optional), e.g. ${i === 0 ? 'Hot leads' : 'From Facebook'}`} value={c.label} onChange={(e) => put(cases.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)))} disabled={disabled} />
          <CondEditor id={`cb-${c.id}`} c={c} ctx={ctx} disabled={disabled} onChange={(n) => put(cases.map((x) => (x.id === c.id ? { ...x, ...n } : x)))} />
        </div>
      ))}
      {!disabled && (
        <button type="button" className="add-chip" style={{ alignSelf: 'flex-start' }} onClick={() => put([...cases, { id: `c${Date.now().toString(36)}`, label: '', field: 'stage', op: 'is', value: '' }])}>
          <Plus size={14} /> Add path
        </button>
      )}
      <Hint>Each lead goes down the first path it matches; leads matching none go down “Otherwise”. A path with no line ends the workflow for those leads.</Hint>
    </>
  )
}

function TimeRow({
  amount,
  unit,
  onAmount,
  onUnit,
  disabled,
  extra,
}: {
  amount: number
  unit: Unit
  onAmount: (v: number) => void
  onUnit: (v: Unit) => void
  disabled: boolean
  extra?: ReactNode
}) {
  return (
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <input
        className="input"
        type="number"
        min={0}
        style={{ width: 90 }}
        aria-label="Amount"
        value={Number.isFinite(amount) ? amount : ''}
        disabled={disabled}
        onChange={(e) => onAmount(Math.max(0, Number(e.target.value)))}
      />
      <Select aria-label="Unit" value={unit} onChange={(e) => onUnit(e.target.value as Unit)} disabled={disabled}>
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </Select>
      {extra}
    </div>
  )
}

/** what starts the workflow, and its settings */
function TriggerFields({
  t,
  ctx,
  onChange,
  disabled,
}: {
  t: TriggerData
  ctx: FlowContext
  onChange: (data: Record<string, unknown>) => void
  disabled: boolean
}) {
  const set = (patch: Partial<TriggerData>) => onChange({ ...t, ...patch })
  const funnel = ctx.funnels.find((f) => f.id === t.funnel_id)
  const pages = ctx.pages.filter((p) => p.funnel_id === t.funnel_id)
  const ev = ctx.events.find((e) => e.id === t.event_id)
  const linkedFunnels = ctx.funnels.filter((f) => f.event_id && f.event_id === t.event_id)
  const funnelSelect = (optional: boolean) => (
    <div>
      <Label htmlFor="tr-funnel" required={!optional}>
        Funnel
      </Label>
      <Select id="tr-funnel" value={t.funnel_id ?? ''} disabled={disabled} onChange={(e) => set({ funnel_id: e.target.value, pages: [], stage_id: '' })}>
        <option value="">{optional ? 'Any funnel' : '— select —'}</option>
        {ctx.funnels.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </Select>
    </div>
  )

  return (
    <>
      <div>
        <Label htmlFor="tr-event" required>
          Start this workflow when
        </Label>
        <Select
          id="tr-event"
          value={t.event}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value as TriggerEvent
            // keep the funnel when switching between funnel triggers
            onChange({ ...TRIGGER_DEFAULTS[next], ...(t.name ? { name: t.name } : {}), ...(next !== 'before_event' && next !== 'after_event' && t.funnel_id ? { funnel_id: t.funnel_id } : {}) })
          }}
        >
          {ALL_TRIGGERS.filter((x) => TRIGGERS.includes(x) || x.value === t.event).map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </Select>
        <Hint>{ALL_TRIGGERS.find((x) => x.value === t.event)?.hint}</Hint>
      </div>

      {t.event === 'form_submitted' && (
        <>
          {funnelSelect(false)}
          {funnel && (
            <div className="stack" style={{ gap: 8 }}>
              <span className="field-label">Forms (webhooks)</span>
              <label className="check-inline">
                <input type="checkbox" disabled={disabled} checked={!(t.pages ?? []).length} onChange={() => set({ pages: [] })} /> Any form
              </label>
              {pages.map((p) => {
                const on = (t.pages ?? []).includes(p.id)
                return (
                  <label key={p.id} className="check-inline">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={on}
                      onChange={() => set({ pages: on ? (t.pages ?? []).filter((x) => x !== p.id) : [...(t.pages ?? []), p.id] })}
                    />{' '}
                    {p.name}
                  </label>
                )
              })}
              {!pages.length && <Hint>This funnel has no webhooks yet.</Hint>}
            </div>
          )}
        </>
      )}

      {t.event === 'lead_added' && (
        <>
          {funnelSelect(true)}
          <div>
            <Label htmlFor="tr-source">Added</Label>
            <Select id="tr-source" value={t.source ?? 'any'} disabled={disabled} onChange={(e) => set({ source: e.target.value as TriggerData['source'] })}>
              <option value="any">Any way</option>
              <option value="manual">By hand (Add lead)</option>
              <option value="import">By import</option>
              <option value="form">By a webhook form</option>
            </Select>
          </div>
        </>
      )}

      {t.event === 'stage_changed' && (
        <>
          {funnelSelect(false)}
          {funnel && (
            <div>
              <Label htmlFor="tr-stage" required>
                Stage
              </Label>
              <Select id="tr-stage" value={t.stage_id ?? ''} disabled={disabled} onChange={(e) => set({ stage_id: e.target.value })}>
                <option value="">— select —</option>
                {funnel.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </>
      )}

      {t.event === 'tag_added' && (
        <div>
          <Label htmlFor="tr-tag" required>
            Tag
          </Label>
          <TextInput id="tr-tag" list="tr-tags" placeholder="e.g. Hot lead" value={t.tag ?? ''} disabled={disabled} onChange={(e) => set({ tag: e.target.value })} />
          <datalist id="tr-tags">
            {ctx.tags.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </div>
      )}

      {(t.event === 'before_event' || t.event === 'after_event') && (
        <>
          <div>
            <Label htmlFor="tr-ev" required>
              Webinar / event
            </Label>
            <Select id="tr-ev" value={t.event_id ?? ''} disabled={disabled} onChange={(e) => set({ event_id: e.target.value })}>
              <option value="">— select —</option>
              {ctx.events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} · {new Date(`${e.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  {e.time ? `, ${e.time.slice(0, 5)}` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <span className="field-label">{t.event === 'before_event' ? 'How long before it starts' : 'How long after it ends'}</span>
            <TimeRow
              amount={Number(t.amount) || 0}
              unit={t.unit ?? 'hours'}
              onAmount={(v) => set({ amount: v })}
              onUnit={(v) => set({ unit: v })}
              disabled={disabled}
            />
          </div>
          {ev && (
            <Hint>
              {linkedFunnels.length
                ? `Runs for the leads of ${linkedFunnels.map((f) => f.name).join(', ')} (the funnel${linkedFunnels.length > 1 ? 's' : ''} linked to this ${'event'}).`
                : 'No funnel is linked to this webinar / event yet: link one in Funnels → Edit funnel so the workflow knows whose leads to message.'}
            </Hint>
          )}
        </>
      )}
    </>
  )
}
