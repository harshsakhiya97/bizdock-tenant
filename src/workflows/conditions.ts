import type { ConditionData, FlowContext } from './types'
import { STEP_VAR_LABEL } from './varGroups'

/**
 * What a Switch path / Yes-No / Bulk WhatsApp stop condition can check.
 * text / select fields: equals, not equals, is empty, is not empty;
 * number and date fields also >, >=, <, <=; Meeting / Payment: has or hasn't.
 * Extra fields (form / sheet columns) are "x:<key>".
 */
export type CondKind = 'text' | 'number' | 'date' | 'select' | 'tag' | 'presence'
export type CondOp = 'eq' | 'neq' | 'empty' | 'not_empty' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'not_exists' | 'in' | 'starts' | 'ends'

type FieldDef = { value: string; label: string; kind: CondKind; group: 'Lead' | 'Activity' | 'Extra fields' }

export const LEAD_FIELDS: FieldDef[] = [
  { value: 'name', label: 'Full name', kind: 'text', group: 'Lead' },
  { value: 'first_name', label: 'First name', kind: 'text', group: 'Lead' },
  { value: 'last_name', label: 'Last name', kind: 'text', group: 'Lead' },
  { value: 'phone', label: 'Phone', kind: 'text', group: 'Lead' },
  { value: 'email', label: 'Email', kind: 'text', group: 'Lead' },
  { value: 'city', label: 'City', kind: 'text', group: 'Lead' },
  { value: 'purpose', label: 'Purpose', kind: 'text', group: 'Lead' },
  { value: 'notes', label: 'Notes', kind: 'text', group: 'Lead' },
  { value: 'stage', label: 'Stage', kind: 'select', group: 'Lead' },
  { value: 'source', label: 'Source', kind: 'select', group: 'Lead' },
  { value: 'owner', label: 'Owner', kind: 'select', group: 'Lead' },
  { value: 'temperature', label: 'Temperature', kind: 'select', group: 'Lead' },
  { value: 'tag', label: 'Tags', kind: 'tag', group: 'Lead' },
  { value: 'landing_page', label: 'Form (webhook)', kind: 'select', group: 'Lead' },
  { value: 'estimated_amount', label: 'Estimated amount', kind: 'number', group: 'Lead' },
  { value: 'required_hours', label: 'Hours required', kind: 'number', group: 'Lead' },
  { value: 'required_on', label: 'Required on (date)', kind: 'date', group: 'Lead' },
  { value: 'created_at', label: 'Created on (date)', kind: 'date', group: 'Lead' },
  { value: 'utm_source', label: 'UTM source', kind: 'text', group: 'Lead' },
  { value: 'utm_medium', label: 'UTM medium', kind: 'text', group: 'Lead' },
  { value: 'utm_campaign', label: 'UTM campaign', kind: 'text', group: 'Lead' },
  { value: 'utm_term', label: 'UTM term', kind: 'text', group: 'Lead' },
  { value: 'utm_content', label: 'UTM content', kind: 'text', group: 'Lead' },
  { value: 'meeting', label: 'Meeting (Paid Podcast)', kind: 'presence', group: 'Activity' },
  { value: 'payment', label: 'Payment / purchase', kind: 'presence', group: 'Activity' },
]

export const TEMPERATURES = [
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
  { value: 'not_interested', label: 'Not interested' },
]

export const OP_LABEL: Record<CondOp, string> = {
  eq: 'equals',
  neq: 'not equals',
  empty: 'is empty',
  not_empty: 'is not empty',
  gt: 'greater than (>)',
  gte: 'greater than or equal (>=)',
  lt: 'less than (<)',
  lte: 'less than or equal (<=)',
  exists: 'has',
  not_exists: 'has none',
  in: 'includes any of',
  starts: 'starts with',
  ends: 'ends with',
}
const SHORT_OP: Record<CondOp, string> = { eq: '=', neq: '≠', empty: 'is empty', not_empty: 'is not empty', gt: '>', gte: '≥', lt: '<', lte: '≤', exists: 'has', not_exists: 'has none', in: 'includes', starts: 'starts with', ends: 'ends with' }

const PRESENCE_LABEL: Record<string, [string, string]> = {
  meeting: ['Has a meeting', 'Has no meeting'],
  payment: ['Has paid / purchased', 'Hasn’t paid'],
}

/** the field's definition (extra fields: "x:<key>", compared as text or number) */
export function fieldDef(field: string): FieldDef {
  // a value of the run: a webhook field or an earlier step's (e.g. {{submitted_at}}) — "v:<key>"
  if (field.startsWith('v:')) return { value: field, label: STEP_VAR_LABEL[field.slice(2)] ?? field.slice(2).replace(/_/g, ' '), kind: 'number', group: 'Extra fields' }
  if (field.startsWith('x:')) return { value: field, label: field.slice(2).replace(/_/g, ' '), kind: 'number', group: 'Extra fields' }
  // older conditions
  if (field === 'field_filled') return { value: field, label: 'Form field', kind: 'text', group: 'Lead' }
  if (field === 'attendance') return { value: field, label: 'Webinar / event attendance', kind: 'select', group: 'Activity' }
  return LEAD_FIELDS.find((f) => f.value === field) ?? { value: field, label: field, kind: 'text', group: 'Lead' }
}

/** "Mumbai\nPune" → ["Mumbai", "Pune"]: the values of "includes any of" */
export const listValues = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean)

/** the comparisons a field offers (extra fields: as text and as numbers) */
export function opsFor(kind: CondKind, field = ''): CondOp[] {
  if (kind === 'presence') return ['exists', 'not_exists']
  if (field.startsWith('x:') || field.startsWith('v:')) return ['eq', 'neq', 'in', 'starts', 'ends', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty']
  if (kind === 'number' || kind === 'date') return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty']
  if (kind === 'select') return ['eq', 'neq', 'in', 'empty', 'not_empty']
  if (kind === 'text') return ['eq', 'neq', 'in', 'starts', 'ends', 'empty', 'not_empty']
  return ['eq', 'neq', 'empty', 'not_empty']
}

/** older saved conditions ("is" / "is not", "Form field is filled") in today's terms */
export function normalize(c: Partial<ConditionData> | undefined): { field: string; op: CondOp; value: string } {
  const field = String(c?.field ?? 'stage')
  const op = String(c?.op ?? 'eq')
  if (field === 'field_filled') return { field: `x:${c?.value ?? ''}`, op: op === 'is_not' ? 'empty' : 'not_empty', value: '' }
  const o: CondOp = op === 'is' ? 'eq' : op === 'is_not' ? 'neq' : (op as CondOp)
  const ops = opsFor(fieldDef(field).kind, field)
  return { field, op: ops.includes(o) ? o : ops[0], value: String(c?.value ?? '') }
}

export const needsValue = (op: CondOp) => !['empty', 'not_empty', 'exists', 'not_exists'].includes(op)

/** the choices of a select field */
export function choicesFor(field: string, ctx: FlowContext): { value: string; label: string }[] | null {
  if (field === 'stage') return (ctx.stages.length ? ctx.stages : ctx.funnels.flatMap((f) => f.stages)).map((s) => ({ value: s.id, label: s.name }))
  if (field === 'source') return (ctx.sources ?? []).map((s) => ({ value: s.id, label: s.name }))
  if (field === 'owner') return ctx.members.map((m) => ({ value: m.id, label: m.name }))
  if (field === 'temperature') return TEMPERATURES
  if (field === 'landing_page') return ctx.pages.map((p) => ({ value: p.id, label: p.name }))
  if (field === 'attendance') return ['Registered', 'Attended', 'Partially attended', 'Not attended'].map((a) => ({ value: a, label: a }))
  return null
}

/** "Stage = Hot", "Email is empty", "Has a meeting", "role = Coach" */
export function conditionText(raw: ConditionData, ctx: FlowContext): string {
  const c = normalize(raw)
  const def = fieldDef(c.field)
  if (def.kind === 'presence') return PRESENCE_LABEL[c.field]?.[c.op === 'exists' ? 0 : 1] ?? def.label
  if (c.field.startsWith('x:') && !c.field.slice(2)) return 'Pick a field'
  if (!needsValue(c.op)) return `${def.label} ${SHORT_OP[c.op]}`
  if (!c.value.trim()) return `Finish: ${def.label}`
  const choices = choicesFor(c.field, ctx)
  if (c.op === 'in') return `${def.label} includes ${listValues(c.value).map((v) => choices?.find((o) => o.value === v)?.label ?? v).join(', ')}`
  const shown = choices?.find((o) => o.value === c.value)?.label ?? c.value
  if (def.kind === 'tag') return `${c.op === 'eq' ? 'Has' : 'Doesn’t have'} tag ${shown}`
  return `${def.label} ${SHORT_OP[c.op]} ${shown}`
}

/** a problem with the condition, or null */
export function conditionProblem(raw: ConditionData | undefined): string | null {
  const c = normalize(raw)
  if ((c.field.startsWith('x:') || c.field.startsWith('v:')) && !c.field.slice(2)) return 'Pick the field'
  if (c.op === 'in' && !listValues(c.value).length) return 'Add at least one value'
  if (needsValue(c.op) && !c.value.trim()) return 'Enter the value'
  const kind = fieldDef(c.field).kind
  if (needsValue(c.op) && ['gt', 'gte', 'lt', 'lte'].includes(c.op)) {
    if (kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(c.value.trim())) return 'Pick a date'
    // a run value (v:) may be a number or a date-time
    if (kind !== 'date' && !c.field.startsWith('v:') && Number.isNaN(Number(c.value))) return 'Enter a number'
  }
  return null
}
