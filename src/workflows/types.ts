import type { Edge, Node } from '@xyflow/react'

export type Unit = 'minutes' | 'hours' | 'days'

/** what starts a workflow (the trigger box) */
export type TriggerEvent = 'form_submitted' | 'lead_added' | 'stage_changed' | 'tag_added' | 'before_event' | 'after_event'
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
  /** before_event / after_event */
  event_id?: string
  amount?: number
  unit?: Unit
}

export type ConditionField = 'stage' | 'tag' | 'landing_page' | 'utm_source' | 'field_filled' | 'attendance'
export type ConditionData = { field: ConditionField; op: 'is' | 'is_not'; value: string }

/** one path of a Switch box: leads matching it go down its line (checked top to bottom, else "Otherwise") */
export type SwitchCase = ConditionData & { id: string; label: string }

/** who a WhatsApp / email step goes to */
export type Recipient = 'lead' | 'team' | 'custom'

/** 'condition' (Yes / No) is kept for older workflows; new ones use 'switch' */
export type StepKind = 'trigger' | 'whatsapp' | 'email' | 'call' | 'wait' | 'wait_event' | 'condition' | 'switch' | 'goto'

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
  pages: { id: string; name: string; funnel_id: string; fields: string[] }[]
  events: { id: string; title: string; date: string; time: string | null; endTime: string | null }[]
  /** team members (WhatsApp / email to the team) */
  members: { id: string; name: string }[]
  /** other workflows (Go to workflow) */
  workflows: { id: string; name: string; is_active: boolean }[]
  /** keys of extra fields saved on leads */
  extraKeys?: string[]
  /** tags already used on leads */
  leadTags?: string[]
  /** the workflow being edited */
  selfId?: string
}

/** what the workflow is about, worked out from its trigger */
export type FlowContext = RefData & {
  funnel: RefData['funnels'][number] | null
  event: RefData['events'][number] | null
  /** the funnel's webhook forms / stages (or all, when the trigger has no funnel) */
  pages: RefData['pages']
  stages: { id: string; name: string }[]
  tags: string[]
  fieldKeys: string[]
}

export const STEP_DEFAULTS: Record<Exclude<StepKind, 'trigger'>, Record<string, unknown>> = {
  whatsapp: { to: 'lead', member_id: '', template: '', message: 'Hi {{first_name}}, thanks for registering!' },
  email: { to: 'lead', member_id: '', subject: '', body: '' },
  call: { script: '' },
  wait: { amount: 1, unit: 'days' },
  wait_event: { amount: 2, unit: 'hours', when: 'before' },
  condition: { field: 'stage', op: 'is', value: '' },
  switch: { cases: [{ id: 'c1', label: '', field: 'stage', op: 'is', value: '' }] },
  goto: { workflow_id: '' },
}

export const TRIGGER_DEFAULTS: Record<TriggerEvent, TriggerData> = {
  form_submitted: { event: 'form_submitted', funnel_id: '', pages: [] },
  lead_added: { event: 'lead_added', funnel_id: '', source: 'any' },
  stage_changed: { event: 'stage_changed', funnel_id: '', stage_id: '' },
  tag_added: { event: 'tag_added', tag: '' },
  before_event: { event: 'before_event', event_id: '', amount: 1, unit: 'days' },
  after_event: { event: 'after_event', event_id: '', amount: 1, unit: 'hours' },
}

/** a field name as a message variable: "Company Name" → company_name */
export const varKey = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

export const VARIABLES = [
  ['first_name', 'First name'],
  ['name', 'Full name'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['city', 'City'],
  ['funnel', 'Funnel'],
  ['landing_page', 'Landing page'],
  ['event_title', 'Event title'],
  ['event_date', 'Event date'],
  ['event_time', 'Event time'],
  ['event_link', 'Event link'],
  ['business', 'Business'],
] as const
