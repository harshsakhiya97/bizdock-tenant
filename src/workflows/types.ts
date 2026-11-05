import type { Edge, Node } from '@xyflow/react'

export type Unit = 'minutes' | 'hours' | 'days'

/** what starts a workflow (the trigger box) */
export type TriggerEvent = 'form_submitted' | 'lead_added' | 'stage_changed' | 'tag_added' | 'before_event' | 'after_event' | 'webhook_call'
export type TriggerData = {
  event: TriggerEvent
  /** optional box name shown on the canvas */
  name?: string
  /** form_submitted / stage_changed (required), lead_added (optional = any funnel) */
  funnel_id?: string
  /** form_submitted: only these webhook forms (empty = all) */
  pages?: string[]
  /** stage_changed */
  stage_id?: string
  /** tag_added */
  tag?: string
  /** lead_added: how the lead came in */
  source?: 'any' | 'manual' | 'import' | 'form'
  /** before_event / after_event: the webinar (every date of it, for the leads registered on each) */
  webinar_id?: string
  /** before_event / after_event (older workflows): one calendar event */
  event_id?: string
  amount?: number
  unit?: Unit
}

/** a lead field ("stage", "email", "x:<extra field>", "meeting", "payment"…), how it's compared, and the value (see conditions.ts) */
export type ConditionData = { field: string; op: string; value: string }

/** one path of a Switch box: leads matching it go down its line (checked top to bottom) */
export type SwitchCase = ConditionData & { id: string; label: string }

/** one message of a Bulk WhatsApp step: sent this long after the trigger */
export type BulkRow = {
  id: string
  to: Recipient
  member_id: string
  custom_phone: string
  template: string
  template_language: string
  template_body: string
  /** all its variables (message, header, button links) */
  template_vars?: string[]
  params: Record<string, string>
  amount: number
  unit: Unit
  /** before / after the moment the times count from (only "after" for the start) */
  dir?: 'before' | 'after'
}
export const newBulkRow = (amount = 0, unit: Unit = 'minutes'): BulkRow => ({
  id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
  to: 'lead',
  member_id: '',
  custom_phone: '',
  template: '',
  template_language: '',
  template_body: '',
  params: {},
  amount,
  unit,
})

/** who a WhatsApp / email step goes to */
export type Recipient = 'lead' | 'team' | 'custom'

/** 'condition' (Yes / No) is kept for older workflows; new ones use 'switch' */
export type StepKind =
  | 'trigger' | 'whatsapp' | 'bulk_whatsapp' | 'generate_link' | 'zoom_meeting' | 'lead_lookup' | 'email' | 'call' | 'wait' | 'wait_event' | 'condition' | 'switch' | 'goto'
  // Webinar businesses
  | 'register_webinar' | 'wait_zoom' | 'webinar_analytics'

/** a box on the canvas */
export type StepNode = Node<Record<string, unknown>, StepKind>
export type FlowEdge = Edge

export type WorkflowRow = {
  id: string
  tenant_id: string
  name: string
  is_active: boolean
  trigger_type: TriggerEvent
  funnel_id: string | null
  event_id: string | null
  nodes: StepNode[]
  edges: FlowEdge[]
  updated_at: string
  created_at: string
}

/** everything the boxes / side panel need to describe and pick things */
export type RefData = {
  funnels: { id: string; name: string; business_id: string; sub_business_id: string | null; event_id: string | null; tags: string[]; stages: { id: string; name: string }[] }[]
  pages: { id: string; name: string; funnel_id: string; fields: string[]; saved?: { key: string; label: string }[]; action?: string }[]
  events: { id: string; title: string; date: string; time: string | null; endTime: string | null }[]
  /** lead sources (conditions) */
  sources?: { id: string; name: string }[]
  /** team members (WhatsApp / email to the team) */
  members: { id: string; name: string }[]
  /** other workflows (Go to workflow) */
  workflows: { id: string; name: string; is_active: boolean }[]
  /** keys of extra fields saved on the leads of this workflow's funnel */
  extraKeys?: string[]
  /** keys of extra fields saved on leads, per funnel */
  extraKeysByFunnel?: Record<string, string[]>
  /** tags already used on leads */
  leadTags?: string[]
  /** the workflow being edited */
  selfId?: string
  /** its funnel (Used in funnel) */
  selfFunnelId?: string | null
  /** the workflows' own webhooks ("On webhook call") */
  hooks?: WorkflowHook[]
  /** Zoom accounts (Create Zoom meeting) */
  zoomAccounts?: { id: string; name: string; is_default: boolean }[]
  /** webinars of Webinar businesses (Register for webinar, Before / After webinar) */
  webinars?: { id: string; title: string; business_id: string; funnel_id: string | null }[]
}

/** what the workflow is about, worked out from its trigger */
export type FlowContext = RefData & {
  funnel: RefData['funnels'][number] | null
  event: RefData['events'][number] | null
  /** the webinar the workflow is about (its Before / After webinar trigger, or its Register for webinar step) */
  webinar?: NonNullable<RefData['webinars']>[number] | null
  /** the funnel's webhook forms / stages (or all, when the trigger has no funnel) */
  pages: RefData['pages']
  stages: { id: string; name: string }[]
  tags: string[]
  fieldKeys: string[]
  /** variables made by Generate link steps ({{generated_link}}, {{generated_link_code}}) */
  linkVars: string[]
  /** what starts the workflow */
  triggerEvent?: TriggerEvent
  /** the webhooks picked in a "form submitted" trigger (none = any of the funnel's) */
  triggerPages?: string[]
  /** "On webhook call": the post's fields as [key in the run, label] */
  hookVars?: [string, string][]
  /** fields holding a date / time (they also give _date, _time, _datetime) */
  dateVars?: string[]
  /** a Get lead details step is in the workflow: later steps have the lead's fields */
  leadLookup?: boolean
  /** extra fields saved on the leads of the workflow's sub-business (what Get lead details gives) */
  lookupExtraKeys?: string[]
  /** the stages of that sub-business's funnels */
  lookupStages?: { id: string; name: string }[]
  /** the open step's earlier steps, in order (Step 1 = the trigger): their numbers and the values they make */
  upstream?: UpstreamStep[]
}
export type UpstreamStep = { n: number; id: string; type: StepKind; label: string; keys: string[] }

export const STEP_DEFAULTS: Record<Exclude<StepKind, 'trigger'>, Record<string, unknown>> = {
  whatsapp: { to: 'lead', member_id: '', template: '', message: 'Hi {{first_name}}, thanks for registering!' },
  bulk_whatsapp: { rows: [], stop_on: false, stop: { field: 'tag', op: 'is', value: '' } },
  generate_link: { url: '', var: 'generated_link' },
  zoom_meeting: {
    account: '',
    topic: 'Meeting with {{name}}',
    use_webhook: false,
    start_var: 'meeting_start',
    end_var: 'meeting_end',
    when: 'fixed',
    date: '',
    time: '11:00',
    end_time: '12:00',
    meet_mode: 'owner',
    meet_members: [],
    short_link: false,
  },
  lead_lookup: { match: 'phone', value_var: '' },
  email: { to: 'lead', member_id: '', subject: '', body: '' },
  call: { script: '' },
  wait: { amount: 1, unit: 'days' },
  wait_event: { amount: 2, unit: 'hours', when: 'before', anchor: 'var', anchor_var: '' },
  condition: { field: 'stage', op: 'is', value: '' },
  switch: { cases: [{ id: 'c1', label: '', field: 'stage', op: 'is', value: '' }] },
  goto: { workflow_id: '' },
  register_webinar: { webinar_id: '', short_link: true },
  wait_zoom: {},
  webinar_analytics: {},
}

export const TRIGGER_DEFAULTS: Record<TriggerEvent, TriggerData> = {
  form_submitted: { event: 'form_submitted', funnel_id: '', pages: [] },
  lead_added: { event: 'lead_added', funnel_id: '', source: 'any' },
  stage_changed: { event: 'stage_changed', funnel_id: '', stage_id: '' },
  tag_added: { event: 'tag_added', tag: '' },
  before_event: { event: 'before_event', webinar_id: '', event_id: '', amount: 1, unit: 'days' },
  after_event: { event: 'after_event', webinar_id: '', event_id: '', amount: 0, unit: 'minutes' },
  webhook_call: { event: 'webhook_call' },
}

/** the own webhook of an "On webhook call" workflow */
export type WorkflowHook = {
  id: string
  workflow_id: string
  webhook_key: string
  /** post field → variable name (empty = every field) */
  field_map: Record<string, string>
  test_mode_until: string | null
  sample: Record<string, unknown> | null
  sample_at: string | null
}

/** a field name as a message variable: "Company Name" → company_name */
export const varKey = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

export const VARIABLES = [
  ['first_name', 'First name'],
  ['name', 'Full name'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['city', 'City'],
  ['lead_date', 'Lead date (29 Oct 2026)'],
  ['lead_datetime', 'Lead date & time (29 Oct 2026, 4:00 pm)'],
  ['funnel', 'Funnel'],
  ['landing_page', 'Landing page'],
  ['event_title', 'Event title'],
  ['event_date', 'Event date'],
  ['event_time', 'Event time'],
  ['event_link', 'Event link'],
  ['business', 'Business'],
] as const
