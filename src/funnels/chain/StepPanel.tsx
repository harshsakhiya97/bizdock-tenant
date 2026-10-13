import { useRef } from 'react'
import { Trash2, X } from 'lucide-react'
import { Hint, Label, Select, TextInput } from '@/components/Field'
import { ATTENDANCE, CONDITION_FIELDS, STEP_META, problem } from './steps'
import { VARIABLES, type ChainContext, type StepKind, type StepNode, type Unit } from './types'

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
  ctx: ChainContext
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
        {kind === 'trigger' && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="field-label">Start for leads from</span>
            <label className="check-inline">
              <input
                type="checkbox"
                disabled={ro}
                checked={!(d.pages as string[]).length}
                onChange={() => set('pages', [])}
              />{' '}
              Any landing page of this funnel
            </label>
            {ctx.pages.map((p) => {
              const on = (d.pages as string[]).includes(p.id)
              return (
                <label key={p.id} className="check-inline">
                  <input
                    type="checkbox"
                    disabled={ro}
                    checked={on}
                    onChange={() => set('pages', on ? (d.pages as string[]).filter((x) => x !== p.id) : [...(d.pages as string[]), p.id])}
                  />{' '}
                  {p.name}
                </label>
              )
            })}
            <Hint>Imported or hand-added leads don’t start the automation.</Hint>
          </div>
        )}

        {kind === 'whatsapp' && (
          <>
            <div>
              <Label htmlFor="cb-wa-t">Template name</Label>
              <TextInput id="cb-wa-t" placeholder="e.g. webinar_welcome (approved template)" value={String(d.template ?? '')} onChange={(e) => set('template', e.target.value)} disabled={ro} />
              <Hint>Needed for messages outside the 24-hour window. Templates come from the WhatsApp provider once connected.</Hint>
            </div>
            <MessageField id="cb-wa-m" label="Message" value={String(d.message ?? '')} onChange={(v) => set('message', v)} disabled={ro} rows={6} />
          </>
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
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  className="input"
                  type="number"
                  min={1}
                  style={{ width: 90 }}
                  aria-label="Amount"
                  value={Number(d.amount) || ''}
                  disabled={ro}
                  onChange={(e) => set('amount', Math.max(0, Number(e.target.value)))}
                />
                <Select aria-label="Unit" value={String(d.unit)} onChange={(e) => set('unit', e.target.value)} disabled={ro}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Select>
                {kind === 'wait_event' && (
                  <Select aria-label="Before or after" value={String(d.when)} onChange={(e) => set('when', e.target.value)} disabled={ro}>
                    <option value="before">before</option>
                    <option value="after">after</option>
                  </Select>
                )}
              </div>
            </div>
            {kind === 'wait_event' && (
              <Hint>
                {ctx.event
                  ? `${ctx.event.title} · ${new Date(`${ctx.event.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${ctx.event.time ? `, ${ctx.event.time.slice(0, 5)}` : ''}. Leads who arrive after this moment skip the wait.`
                  : 'This funnel has no webinar / event linked. Link one in Edit funnel.'}
              </Hint>
            )}
          </>
        )}

        {kind === 'condition' && <ConditionFields d={d} ctx={ctx} set={set} disabled={ro} />}

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
  ctx: ChainContext
  set: (k: string, v: unknown) => void
  disabled: boolean
}) {
  const field = d.field as string
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
        <Label htmlFor="cb-c-f">If the lead’s</Label>
        <Select
          id="cb-c-f"
          value={field}
          disabled={disabled}
          onChange={(e) => {
            set('field', e.target.value)
            set('value', '')
          }}
        >
          {CONDITION_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="form-grid" style={{ gridTemplateColumns: '120px 1fr' }}>
        <Select aria-label="is / is not" value={String(d.op)} onChange={(e) => set('op', e.target.value)} disabled={disabled}>
          <option value="is">{field === 'field_filled' ? 'is filled' : field === 'tag' ? 'has' : 'is'}</option>
          <option value="is_not">{field === 'field_filled' ? 'is empty' : field === 'tag' ? 'doesn’t have' : 'is not'}</option>
        </Select>
        {options ? (
          <Select aria-label="Value" value={String(d.value ?? '')} onChange={(e) => set('value', e.target.value)} disabled={disabled}>
            <option value="">— select —</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : (
          <TextInput aria-label="Value" placeholder="e.g. facebook" value={String(d.value ?? '')} onChange={(e) => set('value', e.target.value)} disabled={disabled} />
        )}
      </div>
      <Hint>Leads that match go down the Yes line, the rest down the No line. A line left empty ends the automation for them.</Hint>
      {field === 'attendance' && <Hint>Attendance is filled in once webinar tracking is connected.</Hint>}
    </>
  )
}
