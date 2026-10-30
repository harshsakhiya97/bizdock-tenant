import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ArrowUp, Braces, Plus, Trash2, X } from 'lucide-react'
import { Checkbox, Hint, Label, Select, TextInput } from '@/components/Field'
import { HookTrigger } from './HookTrigger'
import { HookVarsContext, STEP_VAR_LABEL, VarOptions, useVarGroups } from './varGroups'
import { SearchSelect } from '@/components/SearchSelect'
import { TemplateParams, WhatsAppFields, findTemplate, pickTemplate, templateOptions, templateVars, useWatiTemplates } from './WhatsAppFields'
import { ALL_TRIGGERS, STEP_META, anchorText, bulkAnchor, rowDir, rowOffset, meetingHooks, TRIGGERS, casesOf, linkVarOf, problem, rowsOf } from './steps'
import { SHORT_BASE } from './api'
import { LEAD_FIELDS, OP_LABEL, choicesFor, fieldDef, needsValue, normalize, opsFor } from './conditions'
import { TRIGGER_DEFAULTS, VARIABLES, newBulkRow, type BulkRow, type ConditionData, type SwitchCase, type FlowContext, type StepKind, type StepNode, type TriggerData, type TriggerEvent, type Unit, varKey } from './types'

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
  // extra fields + earlier steps' variables (grouped in every variable picker)
  // a webhook-call workflow has only its webhook's fields (no lead, so no lead / extra fields)
  const hookOnly = ctx.triggerEvent === 'webhook_call'
  const hookKeys = hookOnly ? ctx.fieldKeys : null
  const extras = hookOnly
    ? [...new Set([...ctx.fieldKeys, ...ctx.linkVars])]
    : [...new Set(['purpose', ...ctx.fieldKeys, ...(ctx.extraKeys ?? [])].map(varKey)), ...ctx.linkVars].filter((k) => k && !VARIABLES.some(([v]) => v === k))
  const d = node.data
  const meta = STEP_META[kind]
  const Icon = meta.icon
  const set = (k: string, v: unknown) => onChange({ ...d, [k]: v })
  const issue = problem(kind, d, ctx)
  const ro = !canEdit

  return (
    <HookVarsContext.Provider value={hookKeys}>
    <aside className={kind === 'bulk_whatsapp' ? 'cb-panel is-wide' : 'cb-panel'}>
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

        {kind === 'bulk_whatsapp' && (
          <BulkFields
            d={d}
            ctx={ctx}
            onChange={onChange}
            disabled={ro}
            extraFields={extras}
          />
        )}
        {kind === 'generate_link' && <GenerateLinkFields d={d} ctx={ctx} set={set} disabled={ro} />}
        {kind === 'zoom_meeting' && (
          <>
            <ZoomFields d={d} ctx={ctx} set={set} disabled={ro} />
            <MessageField extras={extras} id="cb-zm-topic" label="Meeting topic" value={String(d.topic ?? '')} onChange={(v) => set('topic', v)} disabled={ro} rows={2} />
            <ZoomShortLink d={d} set={set} disabled={ro} />
            <Hint>
              Later steps can use <code>{'{{zoom_link}}'}</code>, <code>{'{{zoom_date_time}}'}</code> (e.g. “29 Oct 2026 5pm-8pm”), <code>{'{{zoom_password}}'}</code>, <code>{'{{zoom_date}}'}</code> and <code>{'{{zoom_time}}'}</code>. The meeting is added to the lead’s Meetings (a test run only creates the Zoom meeting).
            </Hint>
          </>
        )}
        {(kind === 'whatsapp' || kind === 'email') && <RecipientField d={d} ctx={ctx} set={set} disabled={ro} custom={kind === 'whatsapp'} />}
        {kind === 'whatsapp' && (
          <WhatsAppFields
            d={d}
            extraFields={extras}
            set={set}
            onChange={onChange}
            disabled={ro}
            messageField={<MessageField extras={extras} id="cb-wa-m" label="Message" value={String(d.message ?? '')} onChange={(v) => set('message', v)} disabled={ro} rows={6} hint="A free message only reaches leads who messaged you in the last 24 hours." />}
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
            <MessageField extras={extras} id="cb-em-b" label="Message" value={String(d.body ?? '')} onChange={(v) => set('body', v)} disabled={ro} rows={8} />
          </>
        )}

        {kind === 'call' && (
          <MessageField extras={extras} id="cb-call" label="What the call says" value={String(d.script ?? '')} onChange={(v) => set('script', v)} disabled={ro} rows={5} hint="A one-way call plays this message (text-to-speech or a recording) once a calling provider is connected." />
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
        {kind === 'goto' && (
          <GotoFields d={d} set={set} disabled={ro} extras={extras} />
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
    </HookVarsContext.Provider>
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

/** Bulk WhatsApp: a table of templates, each sent a set time after the workflow started; one optional stop condition. */
function BulkFields({
  d,
  ctx,
  onChange,
  disabled,
  extraFields,
}: {
  d: Record<string, unknown>
  ctx: FlowContext
  onChange: (data: Record<string, unknown>) => void
  disabled: boolean
  extraFields: string[]
}) {
  const { list, error, loading, reload } = useWatiTemplates()
  const [open, setOpen] = useState<string | null>(null)
  const rows = rowsOf(d)
  const put = (next: BulkRow[]) => onChange({ ...d, rows: next })
  const setRow = (id: string, patch: Partial<BulkRow>) => put(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const stop = (d.stop ?? { field: 'tag', op: 'is', value: '' }) as ConditionData
  const anchor = bulkAnchor(d)
  // messages go in time order (a "before" one ahead of an "after" one)
  const outOfOrder = rows.some((r, i) => i > 0 && rowOffset(r, d) < rowOffset(rows[i - 1], d))
  // fields a time can come from: only the trigger's webhook / form fields and earlier steps' values (e.g. the Zoom meeting's start)
  const fromSteps = [...new Set(ctx.linkVars)]
  const dateGroups = [
    { label: ctx.triggerEvent === 'webhook_call' ? 'Webhook (trigger)' : 'Form fields (trigger)', items: [...new Set(ctx.fieldKeys.map(varKey))].filter((k) => k && !fromSteps.includes(k)).map((k) => [k, k] as [string, string]) },
    { label: 'From earlier steps', items: fromSteps.map((k) => [k, STEP_VAR_LABEL[k] ?? k] as [string, string]) },
  ].filter((g) => g.items.length)
  const label = (k: string) => STEP_VAR_LABEL[k] ?? dateGroups.flatMap((g) => g.items).find(([v]) => v === k)?.[1] ?? k
  const anchorName = anchorText(d, ctx, label)

  function add() {
    const last = rows[rows.length - 1]
    // the next one a day after the last
    const dir = last ? rowDir(last, d) : 'after'
    put([...rows, { ...(last ? newBulkRow(last.unit === 'days' ? (Number(last.amount) || 0) + 1 : 1, last.unit === 'days' ? 'days' : 'days') : newBulkRow(0, 'minutes')), dir }])
  }

  return (
    <>
      <div>
        <div className="row-between">
          <span className="field-label">Messages</span>
          <button type="button" className="link-btn small" onClick={reload} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'spin' : undefined} /> Refresh templates
          </button>
        </div>
        {error && <Hint>Couldn’t load templates: {error}</Hint>}
        <div className="bulk-anchor">
          <span className="muted small">Times count from</span>
          <select
            className="input input-sm"
            aria-label="Times count from"
            value={anchor === 'var' ? `v:${String(d.anchor_var ?? '')}` : 'start'}
            onChange={(e) => {
              const v = e.target.value
              onChange(v === 'start' ? { ...d, anchor: 'start', anchor_var: '' } : { ...d, anchor: 'var', anchor_var: v.slice(2) })
            }}
            disabled={disabled}
          >
            <option value="start">The start (trigger)</option>
            {anchor === 'var' && !d.anchor_var && <option value="v:">— pick a field —</option>}
            {dateGroups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map(([k, l]) => (
                  <option key={k} value={`v:${k}`}>
                    {l}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="table-wrap bulk-wrap">
          <table className="table bulk-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Send to</th>
                <th>Template</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const vars = templateVars(r as unknown as Record<string, unknown>)
                const picked = findTemplate(list, r as unknown as Record<string, unknown>)
                const missing = vars.filter((v) => !String(r.params?.[v] ?? '').trim()).length
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="muted">{i + 1}</td>
                      <td>
                        <select className="input input-sm" aria-label="Send to" value={r.to} onChange={(e) => setRow(r.id, { to: e.target.value as BulkRow['to'] })} disabled={disabled}>
                          <option value="lead">Lead</option>
                          <option value="team">Team</option>
                          <option value="custom">Custom</option>
                        </select>
                        {r.to === 'team' && (
                          <select className="input input-sm" aria-label="Team member" value={r.member_id} onChange={(e) => setRow(r.id, { member_id: e.target.value })} disabled={disabled}>
                            <option value="">— member —</option>
                            {ctx.members.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {r.to === 'custom' && (
                          <div className="input-prefix input-prefix-sm">
                            <span>+91</span>
                            <input
                              className="input input-sm"
                              inputMode="numeric"
                              maxLength={10}
                              placeholder="10 digits"
                              aria-label="Mobile number"
                              value={r.custom_phone}
                              onChange={(e) => setRow(r.id, { custom_phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                              disabled={disabled}
                            />
                          </div>
                        )}
                      </td>
                      <td>
                        {error ? (
                          <input className="input input-sm" placeholder="Template name" value={r.template} onChange={(e) => setRow(r.id, { template: e.target.value })} disabled={disabled} />
                        ) : (
                          <SearchSelect
                            value={picked ? `${picked.elementName}|${picked.language?.value ?? ''}` : r.template ? '__missing' : ''}
                            onChange={(v) => {
                              if (v === '__missing') return
                              const t = v ? pickTemplate(list, v, r.params ?? {}, extraFields) : null
                              setRow(r.id, t ? { template: t.template, template_language: t.template_language, template_body: t.template_body, params: t.params } : { template: '', template_language: '', template_body: '', params: {} })
                              if (t && Object.keys(t.params).length) setOpen(r.id)
                            }}
                            disabled={disabled || !list}
                            placeholder={list ? '— pick —' : 'Loading…'}
                            searchPlaceholder="Search templates…"
                            emptyText="No template matches"
                            options={templateOptions(list, r.template && !picked ? `${r.template} (not found)` : null, '— pick —')}
                          />
                        )}
                      </td>
                      <td>
                        <div className="bulk-when">
                          <input className="input input-sm" type="number" min={0} aria-label="Amount" value={r.amount} onChange={(e) => setRow(r.id, { amount: Math.max(0, Number(e.target.value) || 0) })} disabled={disabled} />
                          <select className="input input-sm" aria-label="Unit" value={r.unit} onChange={(e) => setRow(r.id, { unit: e.target.value as Unit })} disabled={disabled}>
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                          <select className="input input-sm" aria-label="Before or after" value={rowDir(r, d)} onChange={(e) => setRow(r.id, { dir: e.target.value as 'before' | 'after' })} disabled={disabled || anchor === 'start'}>
                            <option value="after">after</option>
                            {anchor !== 'start' && <option value="before">before</option>}
                          </select>
                        </div>
                        <span className="bulk-when-label">{anchor === 'start' ? 'the start' : anchorName}</span>
                      </td>
                      <td className="nowrap" style={{ textAlign: 'right' }}>
                        {vars.length > 0 && (
                          <button type="button" className={cn('btn btn-ghost btn-sm', missing > 0 && 'danger-text')} title="Template variables" onClick={() => setOpen(open === r.id ? null : r.id)}>
                            <Braces size={14} /> {vars.length}
                          </button>
                        )}
                        {!disabled && (
                          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Remove message ${i + 1}`} onClick={() => put(rows.filter((x) => x.id !== r.id))}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {open === r.id && vars.length > 0 && (
                      <tr className="bulk-vars">
                        <td />
                        <td colSpan={4}>
                          <TemplateParams vars={vars} params={r.params ?? {}} onChange={(p) => setRow(r.id, { params: p })} disabled={disabled} extraFields={extraFields} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && <div className="muted small" style={{ padding: '8px 2px' }}>No messages yet.</div>}
        {!disabled && (
          <button type="button" className="add-chip" style={{ marginTop: 8 }} onClick={add}>
            <Plus size={13} /> Add message
          </button>
        )}
        <Hint>
          {anchor === 'start'
            ? 'Each message goes this long after the workflow started for the lead (0 = right away).'
            : 'Each message goes this long before or after (set on each row) the date-time in the picked field (e.g. 2026-11-02 16:00, India time).'}{' '}
          If a time has already passed, it goes right away. After the last one the workflow carries on to the next step.
        </Hint>
        {outOfOrder && <div className="alert alert-warning small">Messages go in time order, not row order: a row is earlier than the one above it.</div>}
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <label className="check-inline">
          <input type="checkbox" checked={!!d.stop_on} onChange={(e) => onChange({ ...d, stop_on: e.target.checked, stop })} disabled={disabled} /> Stop sending when…
        </label>
        {!!d.stop_on && <CondEditor id="cb-bulk-stop" c={stop} ctx={ctx} disabled={disabled} onChange={(c) => onChange({ ...d, stop: c })} />}
        {!!d.stop_on && <Hint>Checked before every message; once it matches, the rest aren’t sent and the workflow ends for that lead.</Hint>}
      </div>
    </>
  )
}

/** Generate link: a long URL with the lead's fields as {field} → <app>/<code> (new code for every lead), used later as {{generated_link}}. */
const SHORT_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
/** a sample code like the real ones (8 characters, no look-alikes) */
const sampleCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => SHORT_ABC[b % SHORT_ABC.length]).join('')

/** Create Zoom meeting: also make a short link of the Zoom link ({{zoom_short_link}}, {{zoom_short_link_code}}) */
type PassField = { id: string; name: string; value: string }
/** Go to workflow: fields passed to the next workflow (its steps use them as {{name}}) */
function GotoFields({ d, set, disabled, extras }: { d: Record<string, unknown>; set: (k: string, v: unknown) => void; disabled: boolean; extras: string[] }) {
  const groups = useVarGroups(extras)
  const rows = (d.fields ?? []) as PassField[]
  const put = (next: PassField[]) => set('fields', next)
  return (
    <div>
      <span className="field-label">Pass data to the workflow</span>
      <Hint>Name each field and pick the variable it carries (e.g. the Zoom short link); the next workflow’s steps use it as {'{{name}}'}.</Hint>
      <div className="goto-rows">
        {rows.map((r, i) => (
          <div key={r.id} className="goto-row">
            <TextInput
              aria-label="Field name"
              placeholder="Name, e.g. meeting_link"
              value={r.name}
              disabled={disabled}
              onChange={(e) => put(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <select
              className="input"
              aria-label="Variable"
              value={/^\{\{\w+\}\}$/.test(r.value) ? r.value.slice(2, -2) : ''}
              disabled={disabled}
              onChange={(e) => {
                const k = e.target.value
                put(rows.map((x, j) => (j === i ? { ...x, value: k ? `{{${k}}}` : '', name: x.name || k } : x)))
              }}
            >
              <option value="">— variable —</option>
              <VarOptions groups={groups} />
            </select>
            {!disabled && (
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Remove" onClick={() => put(rows.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {!disabled && (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{ marginTop: 6 }}
          onClick={() => put([...rows, { id: `f${Date.now().toString(36)}`, name: '', value: '' }])}
        >
          <Plus size={14} /> Add field
        </button>
      )}
      {rows.some((r) => r.name.trim()) && (
        <Hint>
          The next workflow can use{' '}
          {rows
            .filter((r) => r.name.trim())
            .map((r) => `{{${varKey(r.name)}}}`)
            .join(', ')}
          .
        </Hint>
      )}
    </div>
  )
}

function ZoomShortLink({ d, set, disabled }: { d: Record<string, unknown>; set: (k: string, v: unknown) => void; disabled: boolean }) {
  const [code] = useState(sampleCode)
  return (
    <>
      <Checkbox
        id="cb-zm-short"
        checked={!!d.short_link}
        onChange={(v) => !disabled && set('short_link', v)}
        label="Convert the Zoom link to a short link"
        description="A new code for each lead on your CRM address; it opens the Zoom meeting. Clicks are counted."
      />
      {!!d.short_link && (
        <div className="gl-preview">
          <span className="field-label">Each lead gets a link like</span>
          <code>
            {SHORT_BASE}/{code}
          </code>
          <small className="muted">
            It opens the Zoom meeting link with its passcode. Use <code className="code-chip">{'{{zoom_short_link}}'}</code> for the whole link, or{' '}
            <code className="code-chip">{'{{zoom_short_link_code}}'}</code> for the code only (a template button that already has your domain).
          </small>
        </div>
      )}
    </>
  )
}

function ZoomFields({ d, ctx, set, disabled }: { d: Record<string, unknown>; ctx: FlowContext; set: (k: string, v: unknown) => void; disabled: boolean }) {
  const zooms = ctx.zoomAccounts ?? []
  const members = ((d.meet_members ?? []) as string[]).filter(Boolean)
  // only when the trigger is a meeting webhook: the fields it saves with each post
  const hooks = meetingHooks(ctx)
  const fromForm = hooks.length > 0 || (ctx.hookVars ?? []).length > 0
  // the trigger isn't a meeting webhook (any more): the step uses its own date and time
  useEffect(() => {
    if (!fromForm && d.use_webhook && !disabled) set('use_webhook', false)
  }, [fromForm, d.use_webhook, disabled, set])
  const fieldOpts: [string, string][] = []
  for (const f of hooks.flatMap((p) => p.saved ?? [])) if (!fieldOpts.some(([k]) => k === f.key)) fieldOpts.push([f.key, f.label])
  for (const [k, l] of ctx.hookVars ?? []) if (!fieldOpts.some(([x]) => x === k)) fieldOpts.push([k, l])
  if (!fieldOpts.length) fieldOpts.push(['meeting_start', 'Meeting Start time'], ['meeting_end', 'Meeting End time'])
  return (
    <>
      <div>
        <Label htmlFor="cb-zm-acc">Zoom account</Label>
        <Select id="cb-zm-acc" value={String(d.account ?? '')} onChange={(e) => set('account', e.target.value)} disabled={disabled}>
          <option value="">Default account{zooms.find((z) => z.is_default) ? ` (${zooms.find((z) => z.is_default)!.name})` : ''}</option>
          {zooms.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </Select>
        {!zooms.length && <Hint>No Zoom account yet: add one in System Connections.</Hint>}
      </div>
      {fromForm && (
        <Checkbox
          id="cb-zm-hook"
          checked={!!d.use_webhook}
          onChange={(v) => set('use_webhook', v)}
          label="Use the date & time the webhook sent"
          description="The booking tool’s start (and end) date-time from the form post."
        />
      )}
      {fromForm && d.use_webhook ? (
        <div className="form-grid">
          <div>
            <Label htmlFor="cb-zm-sv">Start date &amp; time</Label>
            <Select id="cb-zm-sv" value={String(d.start_var || 'meeting_start')} onChange={(e) => set('start_var', e.target.value)} disabled={disabled}>
              {fieldOpts.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="cb-zm-ev">End date &amp; time</Label>
            <Select id="cb-zm-ev" value={String(d.end_var ?? 'meeting_end')} onChange={(e) => set('end_var', e.target.value)} disabled={disabled}>
              {fieldOpts.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : (
        <div className="form-grid">
          <div className="span-2">
            <Label htmlFor="cb-zm-date" required>
              Date
            </Label>
            <TextInput id="cb-zm-date" type="date" value={String(d.date ?? '')} onChange={(e) => set('date', e.target.value)} disabled={disabled} />
          </div>
          <div>
            <Label htmlFor="cb-zm-st" required>
              Start time
            </Label>
            <TextInput id="cb-zm-st" type="time" step={900} value={String(d.time ?? '11:00')} onChange={(e) => set('time', e.target.value)} disabled={disabled} />
          </div>
          <div>
            <Label htmlFor="cb-zm-et" required>
              End time
            </Label>
            <TextInput id="cb-zm-et" type="time" step={900} value={String(d.end_time ?? '12:00')} onChange={(e) => set('end_time', e.target.value)} disabled={disabled} />
          </div>
          <div className="span-2">
            <Hint>India time.</Hint>
          </div>
        </div>
      )}
      <div>
        <Label htmlFor="cb-zm-meet">Meet with</Label>
        <Select id="cb-zm-meet" value={String(d.meet_mode ?? 'owner')} onChange={(e) => set('meet_mode', e.target.value)} disabled={disabled}>
          <option value="owner">Owner of the lead</option>
          <option value="single">One person</option>
          <option value="round_robin">Round robin (take turns)</option>
        </Select>
        {(d.meet_mode ?? 'owner') === 'owner' && <Hint>The meeting goes to whoever owns the lead (none if the lead is unassigned).</Hint>}
      </div>
      {d.meet_mode === 'single' && (
        <div>
          <Label htmlFor="cb-zm-one" required>
            Team member
          </Label>
          <Select id="cb-zm-one" value={members[0] ?? ''} onChange={(e) => set('meet_members', e.target.value ? [e.target.value] : [])} disabled={disabled}>
            <option value="">— select —</option>
            {ctx.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      {d.meet_mode === 'round_robin' && (
        <div>
          <span className="field-label">Team members (in turn)</span>
          <div className="check-list">
            {ctx.members.map((m) => (
              <label key={m.id} className="check">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={members.includes(m.id)}
                  onChange={(e) => set('meet_members', e.target.checked ? [...members, m.id] : members.filter((x) => x !== m.id))}
                />
                {m.name}
              </label>
            ))}
          </div>
          <Hint>Each new meeting goes to the next ticked person, in this order. Inactive people are skipped.</Hint>
        </div>
      )}
    </>
  )
}

function GenerateLinkFields({ d, ctx, set, disabled }: { d: Record<string, unknown>; ctx: FlowContext; set: (k: string, v: unknown) => void; disabled: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const url = String(d.url ?? '')
  const name = linkVarOf(d)
  const fields = [
    ['full_name', 'Full name'] as const,
    ...VARIABLES.filter(([k]) => k !== 'name').map(([k, l]) => [k, l] as const),
    ...(ctx.triggerEvent === 'webhook_call' ? [] : [...new Set(['purpose', ...ctx.fieldKeys, ...(ctx.extraKeys ?? [])].map(varKey))].filter((k) => k && !VARIABLES.some(([v]) => v === k)).map((k) => [k, k] as const)),
  ]
  // adds "&field={field}" ("?" for the first one) at the cursor, or at the end
  function insert(k: string) {
    const el = ref.current
    const a = el?.selectionStart ?? url.length
    const b = el?.selectionEnd ?? url.length
    const before = url.slice(0, a)
    const sep = before.includes('?') ? (/[?&]$/.test(before) ? '' : '&') : '?'
    const tag = `${sep}${k}={${k}}`
    set('url', before + tag + url.slice(b))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(a + tag.length, a + tag.length)
    })
  }
  const linkGroups = useVarGroups(fields.slice(VARIABLES.length).map(([k]) => k), fields.slice(0, VARIABLES.length))
  // what a lead would get (a sample code: every lead gets a new one)
  const sample = `${SHORT_BASE}/T7P46LXK`
  return (
    <>
      <div>
        <Label htmlFor="cb-gl-url" required>
          Your URL
        </Label>
        <textarea
          ref={ref}
          id="cb-gl-url"
          className="input"
          rows={3}
          placeholder="https://vsl.viralsakhiya.com/fdf-vsl?fname={full_name}&phone={phone}&email={email}"
          value={url}
          onChange={(e) => set('url', e.target.value)}
          disabled={disabled}
        />
        {!disabled && (
          <select className="input input-sm" style={{ marginTop: 6 }} aria-label="Insert a lead field" value="" onChange={(e) => e.target.value && insert(e.target.value)}>
            <option value="">Insert a field…</option>
            <VarOptions groups={linkGroups} show={(k, l) => `${l} {${k}}`} />
          </select>
        )}
        <Hint>Each {'{field}'} is replaced with the lead’s value (e.g. {'{full_name}'}, {'{phone}'}, {'{email}'}, {'{city}'} or a form field like {'{role}'}).</Hint>
      </div>
      <div className="gl-preview">
        <span className="field-label">Each lead gets a link like</span>
        <code>{sample}</code>
        <small className="muted">A new code for every lead; it opens your URL with their details filled in. Clicks are counted.</small>
      </div>
      <div>
        <Label htmlFor="cb-gl-var">Use it in later steps as</Label>
        <TextInput id="cb-gl-var" placeholder="generated_link" value={String(d.var ?? '')} onChange={(e) => set('var', e.target.value)} disabled={disabled} />
        <Hint>
          <code className="code-chip">{`{{${name}}}`}</code> is the whole link; <code className="code-chip">{`{{${name}_code}}`}</code> is the code only (for a template whose button already has your domain).
          Your URL as filled in: <code className="code-chip">{`{{${name}_full_url}}`}</code> the full URL, <code className="code-chip">{`{{${name}_parameters}}`}</code> only the part after “?” (e.g. fname=Harsh&phone=98…).
        </Hint>
      </div>
    </>
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
  extras = [],
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
  rows: number
  hint?: string
  /** extra fields and earlier steps' variables */
  extras?: string[]
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const groups = useVarGroups(extras)
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
        <select className="input input-sm" style={{ marginTop: 6 }} aria-label="Insert a field" value="" onChange={(e) => e.target.value && insert(e.target.value)}>
          <option value="">Insert a field…</option>
          <VarOptions groups={groups} show={(k, l) => `${l} {{${k}}}`} />
        </select>
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

/** "If the lead's [field] [equals / is empty / > …] [value]" */
function CondEditor({ id, c: raw, ctx, disabled, onChange }: { id: string; c: ConditionData; ctx: FlowContext; disabled: boolean; onChange: (c: ConditionData) => void }) {
  const c = normalize(raw)
  const def = fieldDef(c.field)
  const ops = opsFor(def.kind)
  const choices = choicesFor(c.field, ctx)
  const extras = [...new Set([...ctx.fieldKeys, ...(ctx.extraKeys ?? [])])].filter((k) => k && !LEAD_FIELDS.some((f) => f.value === k)).sort((a, b) => a.localeCompare(b))
  const isExtra = c.field.startsWith('x:')
  const put = (n: Partial<{ field: string; op: string; value: string }>) => onChange({ ...raw, field: c.field, op: c.op, value: c.value, ...n })
  function pickField(f: string) {
    const k = fieldDef(f).kind
    put({ field: f, op: opsFor(k)[0], value: '' })
  }
  return (
    <>
      <div>
        <Label htmlFor={`${id}-f`}>If the lead’s</Label>
        <Select id={`${id}-f`} value={isExtra && !extras.includes(c.field.slice(2)) ? 'x:' : c.field} disabled={disabled} onChange={(e) => pickField(e.target.value)}>
          <optgroup label="Lead">
            {LEAD_FIELDS.filter((f) => f.group === 'Lead').map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Activity">
            {LEAD_FIELDS.filter((f) => f.group === 'Activity').map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
            {c.field === 'attendance' && <option value="attendance">Webinar / event attendance</option>}
          </optgroup>
          <optgroup label="Extra fields (form / sheet)">
            {extras.map((k) => (
              <option key={k} value={`x:${k}`}>
                {k.replace(/_/g, ' ')}
              </option>
            ))}
            <option value="x:">Other field (type its name)…</option>
          </optgroup>
        </Select>
        {isExtra && !extras.includes(c.field.slice(2)) && (
          <TextInput aria-label="Field name" placeholder="e.g. annual_revenue" value={c.field.slice(2)} onChange={(e) => put({ field: `x:${e.target.value.trim()}` })} disabled={disabled} style={{ marginTop: 6 }} />
        )}
      </div>
      <div className="form-grid" style={{ gridTemplateColumns: needsValue(c.op) ? '170px 1fr' : '1fr' }}>
        <Select aria-label="How to compare" value={c.op} onChange={(e) => put({ op: e.target.value })} disabled={disabled}>
          {ops.map((o) => (
            <option key={o} value={o}>
              {def.kind === 'tag' && o === 'eq' ? 'has' : def.kind === 'tag' && o === 'neq' ? 'doesn’t have' : def.kind === 'tag' && o === 'empty' ? 'has no tags' : def.kind === 'tag' && o === 'not_empty' ? 'has any tag' : def.kind === 'presence' ? (o === 'exists' ? (c.field === 'meeting' ? 'has a meeting' : 'has paid / purchased') : c.field === 'meeting' ? 'has no meeting' : 'hasn’t paid') : OP_LABEL[o]}
            </option>
          ))}
        </Select>
        {needsValue(c.op) &&
          (def.kind === 'tag' ? (
            <>
              <TextInput aria-label="Tag" list={`${id}-tags`} placeholder="Pick or type a tag" value={c.value} onChange={(e) => put({ value: e.target.value })} disabled={disabled} />
              <datalist id={`${id}-tags`}>
                {ctx.tags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </>
          ) : choices ? (
            <Select aria-label="Value" value={c.value} onChange={(e) => put({ value: e.target.value })} disabled={disabled}>
              <option value="">— select —</option>
              {choices.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ) : (
            <TextInput
              aria-label="Value"
              type={def.kind === 'date' ? 'date' : 'text'}
              inputMode={def.kind === 'number' && !isExtra ? 'decimal' : undefined}
              placeholder={def.kind === 'number' ? 'e.g. 50000' : 'e.g. Mumbai'}
              value={c.value}
              onChange={(e) => put({ value: e.target.value })}
              disabled={disabled}
            />
          ))}
      </div>
      {c.field === 'meeting' && <Hint>Any meeting of the lead that isn’t cancelled (Meetings, Paid Podcast).</Hint>}
      {c.field === 'payment' && <Hint>A payment received on any of the lead’s bookings, or a purchase logged by a webhook.</Hint>}
      {isExtra && <Hint>Text is compared without case; with &gt; / &lt; the value must be a number.</Hint>}
    </>
  )
}

/** Switch: several paths, each with its own condition, checked top to bottom. */
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
      <Hint>Each lead goes down the first path it matches; a lead matching none, or a path with no line, ends the workflow there.</Hint>
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

      {t.event === 'webhook_call' && (
        <>
          <div>
            <Label htmlFor="tr-used-in">Used in funnel</Label>
            <Select id="tr-used-in" value={t.funnel_id ?? ''} disabled={disabled} onChange={(e) => set({ funnel_id: e.target.value })}>
              <option value="">— not set —</option>
              {ctx.funnels.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
            <Hint>Only to keep things tidy: the workflow shows under this funnel (its Workflows tab). Posts don’t add leads to it.</Hint>
          </div>
          <HookTrigger workflowId={ctx.selfId} disabled={disabled} />
        </>
      )}

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
