import { Clock, GitFork, Hourglass, Link2, Mail, MessageCircle, MessagesSquare, PhoneCall, Split, Video, Workflow, Zap, type LucideIcon } from 'lucide-react'
import { conditionProblem, conditionText } from './conditions'
import type { BulkRow, ConditionData, FlowContext, RefData, StepKind, StepNode, SwitchCase, TriggerData, TriggerEvent, Unit } from './types'

export const STEP_META: Record<StepKind, { label: string; hint: string; icon: LucideIcon; color: string }> = {
  trigger: { label: 'Trigger', hint: 'What starts this workflow', icon: Zap, color: '#16a34a' },
  whatsapp: { label: 'WhatsApp', hint: 'Send a WhatsApp message', icon: MessageCircle, color: '#22a35a' },
  bulk_whatsapp: { label: 'Bulk WhatsApp', hint: 'Several templates, each a set time after the trigger', icon: MessagesSquare, color: '#15803d' },
  generate_link: { label: 'Generate link', hint: 'A short link for the lead (their fields filled into your URL) for later messages', icon: Link2, color: '#0369a1' },
  zoom_meeting: { label: 'Create Zoom meeting', hint: 'Books the meeting for the lead with a Zoom link; later messages use {{zoom_link}}', icon: Video, color: '#0b5cff' },
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
  { value: 'webhook_call', label: 'On webhook call', hint: 'A post to this workflow’s own webhook URL; not tied to a funnel, nothing is saved on leads' },
]
/** triggers offered for new workflows */
export const TRIGGERS = ALL_TRIGGERS.filter((t) => t.value !== 'stage_changed' && t.value !== 'tag_added')
export const triggerLabel = (e: TriggerEvent | undefined) => ALL_TRIGGERS.find((t) => t.value === e)?.label ?? 'Trigger'

/** the steps that can be dragged onto the canvas */
export const PALETTE: Exclude<StepKind, 'trigger'>[] = ['whatsapp', 'bulk_whatsapp', 'generate_link', 'zoom_meeting', 'email', 'call', 'wait', 'wait_event', 'switch', 'goto']

export const unitText = (n: number, u: Unit) => `${n} ${n === 1 ? u.replace(/s$/, '') : u}`
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

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
  const linkVars = [
    // the trigger's: when the workflow started (the form post)
    'submitted_at',
    ...nodes
      .filter((n) => n.type === 'generate_link')
      .flatMap((n) => {
        const k = linkVarOf(n.data)
        return [k, `${k}_code`, `${k}_full_url`, `${k}_parameters`]
      }),
    ...(nodes.some((n) => n.type === 'zoom_meeting' && n.data.short_link) ? ['zoom_short_link', 'zoom_short_link_code'] : []),
    ...(nodes.some((n) => n.type === 'zoom_meeting') ? ZOOM_VARS : []),
  ]
  // "On webhook call": the picked fields under their names (none picked: every field of the test post)
  const hook = t.event === 'webhook_call' ? (ref.hooks ?? []).find((h) => h.workflow_id === ref.selfId) : undefined
  const hookVars: [string, string][] = hook
    ? Object.keys(hook.field_map ?? {}).length
      ? Object.values(hook.field_map).filter(Boolean).map((v) => [v, v] as [string, string])
      : Object.keys(hook.sample ?? {}).map((k) => [k, k] as [string, string])
    : []
  return {
    ...ref,
    funnel: hook ? null : funnel,
    event,
    pages: hook || t.event === 'webhook_call' ? [] : pages,
    stages,
    tags,
    fieldKeys: t.event === 'webhook_call' ? hookVars.map(([k]) => k) : fieldKeys,
    linkVars,
    triggerEvent: t.event,
    triggerPages: t.pages ?? [],
    hookVars,
  }
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
    case 'webhook_call':
      return 'Own webhook URL · not tied to a funnel'
    case 'before_event':
    case 'after_event':
      return ev
        ? `${unitText(Number(t.amount) || 0, t.unit ?? 'hours')} ${t.event === 'before_event' ? 'before' : 'after'} ${ev.title} (${day(ev.date)})`
        : 'Pick the webinar / event'
    default:
      return 'Pick what starts the workflow'
  }
}

export { conditionText }
export const casesOf = (d: Record<string, unknown>) => ((d.cases ?? []) as SwitchCase[])
/** the variable a Generate link step fills ("generated_link" unless named) */
export const linkVarOf = (d: Record<string, unknown>) =>
  String(d.var ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'generated_link'
/** what a Create Zoom meeting step gives later steps */
export const ZOOM_VARS = ['zoom_link', 'zoom_date_time', 'zoom_meeting_id', 'zoom_password', 'zoom_date', 'zoom_time', 'zoom_start']
/** Bulk WhatsApp: what the times count from, and before or after it */
export type BulkAnchor = 'start' | 'var'
export const bulkAnchor = (d: Record<string, unknown>): BulkAnchor => (d.anchor === 'var' ? 'var' : 'start')
export const bulkBefore = (d: Record<string, unknown>) => bulkAnchor(d) !== 'start' && d.direction === 'before'
/** a message's own before / after (older steps: the step's one setting) */
export const rowDir = (r: Pick<BulkRow, 'dir'>, d: Record<string, unknown>): 'before' | 'after' =>
  bulkAnchor(d) === 'start' ? 'after' : (r.dir ?? (bulkBefore(d) ? 'before' : 'after'))
/** minutes from the moment the times count from: negative = before it */
export const rowOffset = (r: BulkRow, d: Record<string, unknown>) => (rowDir(r, d) === 'before' ? -1 : 1) * rowMinutes(r)
/** "the start" / the picked field ("Zoom meeting start") */
export function anchorText(d: Record<string, unknown>, _ctx: FlowContext, label?: (k: string) => string) {
  const a = bulkAnchor(d)
  if (a === 'var') return d.anchor_var ? (label ? label(String(d.anchor_var)) : `{{${String(d.anchor_var)}}}`) : 'a field'
  return 'the start'
}
/** the meeting webhooks the trigger listens to (a funnel form trigger: its picked webhooks, or all of the funnel's) */
export function meetingHooks(ctx: FlowContext) {
  if (ctx.triggerEvent === 'webhook_call') return []
  if (ctx.triggerEvent !== 'form_submitted' || !ctx.funnel) return []
  const hooks = ctx.triggerPages?.length ? ctx.pages.filter((p) => ctx.triggerPages!.includes(p.id)) : ctx.pages
  return hooks.filter((p) => p.action === 'create_meeting')
}
/** the step takes its time from the webhook (only when the trigger is a meeting webhook) */
export const zoomFromHook = (d: Record<string, unknown>, ctx: FlowContext) => !!d.use_webhook && (meetingHooks(ctx).length > 0 || (ctx.hookVars ?? []).length > 0)

export function zoomWhen(d: Record<string, unknown>) {
  if (!d.date) return 'Pick the date'
  return `${day(String(d.date))}, ${String(d.time || '11:00')} – ${String(d.end_time || '12:00')}`
}
export const rowsOf = (d: Record<string, unknown>) => ((d.rows ?? []) as BulkRow[])
const UNIT_MIN = { minutes: 1, hours: 60, days: 1440 } as const
/** minutes after the trigger */
export const rowMinutes = (r: Pick<BulkRow, 'amount' | 'unit'>) => (Number(r.amount) || 0) * (UNIT_MIN[r.unit] ?? 1)
export const caseLabel = (c: SwitchCase, i: number, ctx: FlowContext) => c.label.trim() || (conditionProblem(c) ? `Path ${i + 1}` : conditionText(c, ctx))
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
      // one line per message: template · 10 minutes before / after
      const from = anchorText(d, ctx)
      const lines = rows.map((r) => `${r.template || 'No template'} · ${unitText(Number(r.amount) || 0, r.unit)} ${rowDir(r, d)} ${from}`)
      const stop = d.stop_on ? [`Stops if ${conditionText(d.stop as ConditionData, ctx).replace(/^\w/, (c) => c.toLowerCase())}`] : []
      return [...lines, ...stop].join('\n')
    }
    case 'generate_link':
      return d.url ? `{{${linkVarOf(d)}}} → ${String(d.url)}` : 'No URL yet'
    case 'zoom_meeting': {
      const acc = ctx.zoomAccounts?.find((z) => z.id === d.account)?.name ?? 'default Zoom'
      const when = zoomFromHook(d, ctx) ? 'Time from the webhook' : zoomWhen(d)
      const mm = (d.meet_members ?? []) as string[]
      const who =
        d.meet_mode === 'single'
          ? (ctx.members.find((m) => m.id === mm[0])?.name ?? 'pick who')
          : d.meet_mode === 'round_robin'
            ? `round robin (${mm.length})`
            : 'lead owner'
      return `${when} · with ${who} · ${acc}`
    }
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
      return `${n} path${n === 1 ? '' : 's'}`
    }
    case 'goto': {
      const name = ctx.workflows.find((w) => w.id === d.workflow_id)?.name ?? 'Pick the workflow'
      const n = ((d.fields ?? []) as { name: string }[]).filter((f) => f.name?.trim()).length
      return n ? `${name} · passes ${n} field${n === 1 ? '' : 's'}` : name
    }
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
      if (bulkAnchor(d) === 'var' && !d.anchor_var) return 'Pick the field the times count from'
      for (const [i, r] of rows.entries()) {
        if (r.to === 'team' && !r.member_id) return `Message ${i + 1}: pick the team member`
        if (r.to === 'custom' && !/^\d{10}$/.test(r.custom_phone ?? '')) return `Message ${i + 1}: enter the 10-digit number`
        if (!r.template) return `Message ${i + 1}: pick a template`
        if (Object.values(r.params ?? {}).some((v) => !String(v ?? '').trim())) return `Message ${i + 1}: fill every template variable`
        if (!(Number(r.amount) >= 0)) return `Message ${i + 1}: set when it goes`
      }
      const stopIssue = d.stop_on ? conditionProblem(d.stop as ConditionData | undefined) : null
      if (stopIssue) return `Stop condition: ${stopIssue.toLowerCase()}`
      return null
    }
    case 'generate_link': {
      const u = String(d.url ?? '').trim()
      if (!u) return 'Enter the URL'
      return /^(https?:\/\/|\{)/i.test(u) ? null : 'The URL must start with https://'
    }
    case 'zoom_meeting':
      if (!ctx.zoomAccounts?.length) return 'Connect a Zoom account (System Connections)'
      if (d.meet_mode === 'single' && !((d.meet_members ?? []) as string[]).length) return 'Pick who the meeting is with'
      if (d.meet_mode === 'round_robin' && ((d.meet_members ?? []) as string[]).length < 2) return 'Tick at least two people for round robin'
      if (zoomFromHook(d, ctx)) return null
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date ?? ''))) return 'Pick the date'
      if (!/^\d{2}:\d{2}$/.test(String(d.time ?? '')) || !/^\d{2}:\d{2}$/.test(String(d.end_time ?? ''))) return 'Set the start and end time'
      if (String(d.end_time) <= String(d.time)) return 'The end time must be after the start time'
      return null
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
      return conditionProblem(d as unknown as ConditionData) ? 'Finish the condition' : null
    case 'switch':
      if (!casesOf(d).length) return 'Add at least one path'
      return casesOf(d).some((c) => conditionProblem(c)) ? 'Finish every path’s condition' : null
    case 'goto':
      if (!d.workflow_id) return 'Pick the workflow'
      if (d.workflow_id === ctx.selfId) return 'Pick another workflow'
      return ((d.fields ?? []) as { name: string; value: string }[]).some((f) => !f.name?.trim() || !f.value?.trim()) ? 'Give every passed field a name and a variable' : null
  }
}
