import type { Edge, Node } from '@xyflow/react'

export type Unit = 'minutes' | 'hours' | 'days'

export type TriggerData = { pages: string[] } // empty = every landing page of the funnel
export type WhatsAppData = { template: string; message: string }
export type EmailData = { subject: string; body: string }
export type CallData = { script: string }
export type WaitData = { amount: number; unit: Unit }
export type WaitEventData = { amount: number; unit: Unit; when: 'before' | 'after' }
export type ConditionField = 'stage' | 'tag' | 'landing_page' | 'utm_source' | 'field_filled' | 'attendance'
export type ConditionData = { field: ConditionField; op: 'is' | 'is_not'; value: string }

export type StepKind = 'trigger' | 'whatsapp' | 'email' | 'call' | 'wait' | 'wait_event' | 'condition'

export type StepData = {
  trigger: TriggerData
  whatsapp: WhatsAppData
  email: EmailData
  call: CallData
  wait: WaitData
  wait_event: WaitEventData
  condition: ConditionData
}

/** a box on the canvas */
export type StepNode = Node<Record<string, unknown>, StepKind>
export type ChainEdge = Edge

export type ChainRow = {
  id: string
  funnel_id: string
  name: string
  is_active: boolean
  nodes: StepNode[]
  edges: ChainEdge[]
  updated_at: string
}

/** what the side panel / boxes need to describe steps */
export type ChainContext = {
  pages: { id: string; name: string }[]
  stages: { id: string; name: string }[]
  tags: string[]
  event: { title: string; date: string; time: string | null } | null
  fieldKeys: string[]
}

export const DEFAULTS: StepData = {
  trigger: { pages: [] },
  whatsapp: { template: '', message: 'Hi {{first_name}}, thanks for registering!' },
  email: { subject: '', body: '' },
  call: { script: '' },
  wait: { amount: 1, unit: 'days' },
  wait_event: { amount: 2, unit: 'hours', when: 'before' },
  condition: { field: 'stage', op: 'is', value: '' },
}

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
