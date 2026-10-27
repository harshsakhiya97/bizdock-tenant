import { Clock, GitFork, Hourglass, Link2, Mail, MessageCircle, MessagesSquare, PhoneCall, Split, Workflow, Zap, type LucideIcon } from 'lucide-react'
import type { BulkRow, ConditionData, FlowContext, RefData, StepKind, StepNode, SwitchCase, TriggerData, TriggerEvent, Unit } from './types'

export const STEP_META: Record<StepKind, { label: string; hint: string; icon: LucideIcon; color: string }> = {
  trigger: { label: 'Trigger', hint: 'What starts this workflow', icon: Zap, color: '#16a34a' },
  whatsapp: { label: 'WhatsApp', hint: 'Send a WhatsApp message', icon: MessageCircle, color: '#22a35a' },
  bulk_whatsapp: { label: 'Bulk WhatsApp', hint: 'Several templates, each a set time after the trigger', icon: MessagesSquare, color: '#15803d' },
  short_link: { label: 'Short link', hint: 'Make a short link for the lead to use in later messages', icon: Link2, color: '#0369a1' },
  email: { label: 'Email', hint: 'Send an email', icon: Mail, color: '#2563eb' },
  call: { label: 'Call', hint: 'One-way voice call (recorded message)', icon: PhoneCall, color: '#7c3aed' },
  wait: { label: 'Wait', hint: 'Wait some time, then continue', icon: Hourglass, color: '#d97706' },
  wait_event: { label: 'Wait for event', hint: 'Wait until before / after the webinar or event', icon: Clock, color: '#ea580c' },
  condition: { label: 'Condition', hint: 'Go Yes or No depending on the lead', icon: Split, color: '#475569' },
  switch: { label: 'Switch', hint: 'Different paths for different leads (several conditions)', icon: GitFork, color: '#475569' },
  goto: { label: 'Go to workflow', hint: 'Continue in another workflow', icon: Workflow, color: '#0d9488' },
}

/** every trigger, including ones no longer offered (older workflows still use them) */
export const ALL_TRIGGERS: { value: TriggerEvent; label: string; hint: string }[] = [
  { value: 'form_submitted', label: 'Funnel form submitted', hint: 'A lead submits a webhook form of a funnel' },
  { value: 'lead_added', label: 'Lead added', hint: 'A lead is added by hand, by import or by a form' },
  { value: 'stage_changed', label: 'Lead moved to a stage', hint: 'A lead enters a stage of a funnel' },
  { value: 'tag_added', label: 'Tag added', hint: 'A tag is added to a lead' },
  { value: 'before_event', label: 'Before a webinar / event starts', hint: 'Some time before it starts, for its funnel’s leads' },
  { value: 'after_event', label: 'After a webinar / event ends', hint: 'Some time after it ends, for its funnel’s leads' },
]
/** triggers offered for new workflows */
export const TRIGGERS = ALL_TRIGGERS.filter((t) => t.value !== 'stage_changed' && t.value !== 'tag_added')
export const triggerLabel = (e: TriggerEvent | undefined) => ALL_TRIGGERS.find((t) => t.value === e)?.label ?? 'Trigger'

/** the steps that can be dragged onto the canvas */
export const PALETTE: Exclude<StepKind, 'trigger'>[] = ['whatsapp', 'bulk_whatsapp', 'short_link', 'email', 'call', 'wait', 'wait_event', 'switch', 'goto']

export const unitText = (n: number, u: Unit) => `${n} ${n === 1 ? u.replace(/s$/, '') : u}`
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export const CONDITION_FIELDS: { value: ConditionData['field']; label: string }[] = [
  { value: 'stage', label: 'Stage' },
  { value: 'tag', label: 'Tag' },
  { value: 'landing_page', label: 'Form (webhook)' },
  { value: 'utm_source', label: 'UTM source' },
  { value: 'field_filled', label: 'Form field is filled' },
  { value: 'attendance', label: 'Webinar / event attendance' },
]
export const ATTENDANCE = ['Registered', 'Attended', 'Partially attended', 'Not attended']

/** funnel / event / stages / pages this workflow is about, from its trigger */
export function flowContext(ref: RefData, nodes: StepNode[]): FlowContext {
  const t = (nodes.find((n) => n.type === 'trigger')?.data ?? {}) as TriggerData
  const eventTrigger = t.event === 'before_event' || t.event === 'after_event'
  const funnel =
    ref.funnels.find((f) => f.id === t.funnel_id) ??
    (eventTrigger ? (ref.funnels.find((f) => f.event_id && f.event_id === t.event_id) ?? null) : null)
  const eventId = eventTrigger ? t.event_id : funnel?.event_id
  const event = ref.events.find((e) => e.id === eventId) ?? null
  const pages = funnel ? ref.pages.filter((p) => p.funnel_id === funnel.id) : ref.pages
  const stages = funnel ? funnel.stages : []
  const tags = [...new Set([...(funnel ? [funnel] : ref.funnels).flatMap((f) => f.tags), ...(ref.leadTags ?? [])])].sort((a, b) => a.localeCompare(b))
  const fieldKeys = [...new Set(pages.flatMap((p) => p.fields))].filter((k) => k !== 'city')
  const linkVars = nodes
    .filter((n) => n.type === 'short_link')
    .flatMap((n) => {
      const k = linkVarOf(n.data)
      return [k, `${k}_code`]
    })
  return { ...ref, funnel, event, pages, stages, tags, fieldKeys, linkVars }
}

export function triggerSummary(t: TriggerData, ctx: FlowContext): string {
  const funnel = ctx.funnels.find((f) => f.id === t.funnel_id)?.name
  const ev = ctx.events.find((e) => e.id === t.event_id)
  switch (t.event) {
    case 'form_submitted': {
      if (!funnel) return 'Pick the funnel'
      const pages = (t.pages ?? []).map((id) => ctx.pages.find((p) => p.id === id)?.name ?? 'Deleted webhook')
      return `${funnel} · ${pages.length ? pages.join(', ') : 'any form'}`
    }
    case 'lead_added':
      return `${funnel ?? 'Any funnel'} · ${{ any: 'any way', manual: 'added by hand', import: 'imported', form: 'from a form' }[t.source ?? 'any']}`
    case 'stage_changed': {
      const st = ctx.funnels.find((f) => f.id === t.funnel_id)?.stages.find((s) => s.id === t.stage_id)?.name
      return funnel && st ? `${funnel} → ${st}` : 'Pick the funnel and stage'
    }
    case 'tag_added':
      return t.tag ? `Tag “${t.tag}”` : 'Pick the tag'
    case 'before_event':
    case 'after_event':
      return ev
        ? `${unitText(Number(t.amount) || 0, t.unit ?? 'hours')} ${t.event === 'before_event' ? 'before' : 'after'} ${ev.title} (${day(ev.date)})`
        : 'Pick the webinar / event'
    default:
      return 'Pick what starts the workflow'
  }
}

/** "Stage is Hot", "email is filled" … */
export function conditionText(c: ConditionData, ctx: FlowContext): string {
  const field = CONDITION_FIELDS.find((f) => f.value === c.field)?.label ?? 'Field'
  const value =
    c.field === 'stage'
      ? ctx.funnels.flatMap((f) => f.stages).find((s) => s.id === c.value)?.name
      : c.field === 'landing_page'
        ? ctx.pages.find((p) => p.id === c.value)?.name
        : c.value
  if (c.field === 'field_filled') return value ? `${value} ${c.op === 'is' ? 'is filled' : 'is empty'}` : 'Pick a field'
  if (c.field === 'tag') return value ? `${c.op === 'is' ? 'Has' : 'Doesn’t have'} tag ${value}` : 'Pick a tag'
  return value ? `${field} ${c.op === 'is' ? 'is' : 'is not'} ${value}` : `Pick a ${field.toLowerCase()}`
}
export const casesOf = (d: Record<string, unknown>) => ((d.cases ?? []) as SwitchCase[])
/** the variable a Short link step fills ("short_link" unless named) */
export const linkVarOf = (d: Record<string, unknown>) =>
  String(d.var ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'short_link'
export const rowsOf = (d: Record<string, unknown>) => ((d.rows ?? []) as BulkRow[])
const UNIT_MIN = { minutes: 1, hours: 60, days: 1440 } as const
/** minutes after the trigger */
export const rowMinutes = (r: Pick<BulkRow, 'amount' | 'unit'>) => (Number(r.amount) || 0) * (UNIT_MIN[r.unit] ?? 1)
export const caseLabel = (c: SwitchCase, i: number, ctx: FlowContext) => c.label.trim() || (c.value ? conditionText(c, ctx) : `Path ${i + 1}`)
const toWho = (d: Record<string, unknown>, ctx: FlowContext) =>
  d.to === 'team'
    ? `To ${ctx.members.find((m) => m.id === d.member_id)?.name ?? 'team'} · `
    : d.to === 'custom'
      ? `To ${d.custom_phone ? `+91 ${String(d.custom_phone)}` : 'a number'} · `
      : ''

/** one-line summary shown inside a box */
export function summary(kind: StepKind, d: Record<string, unknown>, ctx: FlowContext): string {
  switch (kind) {
    case 'trigger':
      return triggerSummary(d as unknown as TriggerData, ctx)
    case 'whatsapp':
      return toWho(d, ctx) + ((d.template as string) || (d.message as string) || 'No message yet')
    case 'bulk_whatsapp': {
      const rows = rowsOf(d)
      if (!rows.length) return 'No messages yet'
      const last = rows[rows.length - 1]
      const stop = d.stop_on ? ` · stops if ${conditionText(d.stop as ConditionData, ctx).replace(/^\w/, (c) => c.toLowerCase())}` : ''
      return `${rows.length} message${rows.length === 1 ? '' : 's'} · last ${unitText(Number(last.amount) || 0, last.unit)} after the start${stop}`
    }
    case 'short_link':
      return d.url ? `{{${linkVarOf(d)}}} → ${String(d.url)}` : 'No URL yet'
    case 'email':
      return toWho(d, ctx) + ((d.subject as string) || 'No subject yet')
    case 'call':
      return (d.script as string) || 'No script yet'
    case 'wait':
      return `Wait ${unitText(Number(d.amount) || 0, d.unit as Unit)}`
    case 'wait_event':
      if (!ctx.event) return 'No webinar / event for this workflow'
      return `${unitText(Number(d.amount) || 0, d.unit as Unit)} ${d.when} ${ctx.event.title}`
    case 'condition':
      return conditionText(d as unknown as ConditionData, ctx)
    case 'switch': {
      const n = casesOf(d).length
      return `${n} path${n === 1 ? '' : 's'} + otherwise`
    }
    case 'goto':
      return ctx.workflows.find((w) => w.id === d.workflow_id)?.name ?? 'Pick the workflow'
  }
}

/** a problem that keeps the workflow from being turned on */
export function problem(kind: StepKind, d: Record<string, unknown>, ctx: FlowContext): string | null {
  switch (kind) {
    case 'trigger': {
      const t = d as unknown as TriggerData
      if (!t.event) return 'Pick what starts the workflow'
      if ((t.event === 'form_submitted' || t.event === 'stage_changed') && !t.funnel_id) return 'Pick the funnel'
      if (t.event === 'stage_changed' && !t.stage_id) return 'Pick the stage'
      if (t.event === 'tag_added' && !String(t.tag ?? '').trim()) return 'Pick the tag'
      if ((t.event === 'before_event' || t.event === 'after_event') && !t.event_id) return 'Pick the webinar / event'
      if ((t.event === 'before_event' || t.event === 'after_event') && !(Number(t.amount) >= 0)) return 'Set the time'
      return null
    }
    case 'whatsapp': {
      if (d.to === 'team' && !d.member_id) return 'Pick the team member'
      if (d.to === 'custom' && !/^\d{10}$/.test(String(d.custom_phone ?? ''))) return 'Enter the 10-digit number'
      if (!String(d.message ?? '').trim() && !String(d.template ?? '').trim()) return 'Write the message or pick a template'
      const params = (d.params ?? {}) as Record<string, string>
      if (d.template && Object.values(params).some((v) => !String(v ?? '').trim())) return 'Fill every template variable'
      return null
    }
    case 'bulk_whatsapp': {
      const rows = rowsOf(d)
      if (!rows.length) return 'Add at least one message'
      for (const [i, r] of rows.entries()) {
        if (r.to === 'team' && !r.member_id) return `Message ${i + 1}: pick the team member`
        if (r.to === 'custom' && !/^\d{10}$/.test(r.custom_phone ?? '')) return `Message ${i + 1}: enter the 10-digit number`
        if (!r.template) return `Message ${i + 1}: pick a template`
        if (Object.values(r.params ?? {}).some((v) => !String(v ?? '').trim())) return `Message ${i + 1}: fill every template variable`
        if (!(Number(r.amount) >= 0)) return `Message ${i + 1}: set when it goes`
      }
      if (d.stop_on && !String((d.stop as ConditionData | undefined)?.value ?? '').trim()) return 'Finish the stop condition'
      return null
    }
    case 'short_link': {
      const u = String(d.url ?? '').trim()
      if (!u) return 'Enter the URL'
      return /^(https?:\/\/|\{\{)/i.test(u) ? null : 'The URL must start with https://'
    }
    case 'email':
      if (d.to === 'team' && !d.member_id) return 'Pick the team member'
      return !String(d.subject ?? '').trim() || !String(d.body ?? '').trim() ? 'Add the subject and the message' : null
    case 'call':
      return !String(d.script ?? '').trim() ? 'Write what the call says' : null
    case 'wait':
    case 'wait_event':
      if (kind === 'wait_event' && !ctx.event) return 'This workflow has no webinar / event (trigger or funnel)'
      return !(Number(d.amount) > 0) ? 'Set how long to wait' : null
    case 'condition':
      return !String(d.value ?? '').trim() ? 'Finish the condition' : null
    case 'switch':
      if (!casesOf(d).length) return 'Add at least one path'
      return casesOf(d).some((c) => !String(c.value ?? '').trim()) ? 'Finish every path’s condition' : null
    case 'goto':
      if (!d.workflow_id) return 'Pick the workflow'
      return d.workflow_id === ctx.selfId ? 'Pick another workflow' : null
  }
}
