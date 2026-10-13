import { Clock, Hourglass, Mail, MessageCircle, PhoneCall, Split, Zap, type LucideIcon } from 'lucide-react'
import type { ChainContext, ConditionData, StepKind, Unit } from './types'

export const STEP_META: Record<StepKind, { label: string; hint: string; icon: LucideIcon; color: string }> = {
  trigger: { label: 'Form submitted', hint: 'Starts when a lead submits a landing page form', icon: Zap, color: '#16a34a' },
  whatsapp: { label: 'WhatsApp', hint: 'Send a WhatsApp message', icon: MessageCircle, color: '#22a35a' },
  email: { label: 'Email', hint: 'Send an email', icon: Mail, color: '#2563eb' },
  call: { label: 'Call', hint: 'One-way voice call (recorded message)', icon: PhoneCall, color: '#7c3aed' },
  wait: { label: 'Wait', hint: 'Wait some time, then continue', icon: Hourglass, color: '#d97706' },
  wait_event: { label: 'Wait for event', hint: 'Wait until before / after the webinar or event', icon: Clock, color: '#ea580c' },
  condition: { label: 'Condition', hint: 'Go Yes or No depending on the lead', icon: Split, color: '#475569' },
}

/** the steps that can be dragged onto the canvas */
export const PALETTE: StepKind[] = ['whatsapp', 'email', 'call', 'wait', 'wait_event', 'condition']

const unitText = (n: number, u: Unit) => `${n} ${n === 1 ? u.replace(/s$/, '') : u}`

export const CONDITION_FIELDS: { value: ConditionData['field']; label: string }[] = [
  { value: 'stage', label: 'Stage' },
  { value: 'tag', label: 'Tag' },
  { value: 'landing_page', label: 'Landing page' },
  { value: 'utm_source', label: 'UTM source' },
  { value: 'field_filled', label: 'Form field is filled' },
  { value: 'attendance', label: 'Webinar / event attendance' },
]
export const ATTENDANCE = ['Registered', 'Attended', 'Partially attended', 'Not attended']

/** one-line summary shown inside a box */
export function summary(kind: StepKind, d: Record<string, unknown>, ctx: ChainContext): string {
  switch (kind) {
    case 'trigger': {
      const pages = (d.pages as string[]) ?? []
      if (!pages.length) return ctx.pages.length ? 'Any landing page of this funnel' : 'Any landing page (none added yet)'
      return pages.map((id) => ctx.pages.find((p) => p.id === id)?.name ?? 'Deleted page').join(', ')
    }
    case 'whatsapp':
      return (d.template as string) || (d.message as string) || 'No message yet'
    case 'email':
      return (d.subject as string) || 'No subject yet'
    case 'call':
      return (d.script as string) || 'No script yet'
    case 'wait':
      return `Wait ${unitText(Number(d.amount) || 0, d.unit as Unit)}`
    case 'wait_event':
      if (!ctx.event) return 'No webinar / event linked to this funnel'
      return `${unitText(Number(d.amount) || 0, d.unit as Unit)} ${d.when} ${ctx.event.title}`
    case 'condition': {
      const c = d as unknown as ConditionData
      const field = CONDITION_FIELDS.find((f) => f.value === c.field)?.label ?? 'Field'
      const value =
        c.field === 'stage'
          ? ctx.stages.find((s) => s.id === c.value)?.name
          : c.field === 'landing_page'
            ? ctx.pages.find((p) => p.id === c.value)?.name
            : c.value
      if (c.field === 'field_filled') return value ? `${value} ${c.op === 'is' ? 'is filled' : 'is empty'}` : 'Pick a field'
      return value ? `${field} ${c.op === 'is' ? 'is' : 'is not'} ${value}` : `Pick a ${field.toLowerCase()}`
    }
  }
}

/** a problem that keeps the chain from being turned on */
export function problem(kind: StepKind, d: Record<string, unknown>, ctx: ChainContext): string | null {
  switch (kind) {
    case 'whatsapp':
      return !String(d.message ?? '').trim() && !String(d.template ?? '').trim() ? 'Write the message or pick a template' : null
    case 'email':
      return !String(d.subject ?? '').trim() || !String(d.body ?? '').trim() ? 'Add the subject and the message' : null
    case 'call':
      return !String(d.script ?? '').trim() ? 'Write what the call says' : null
    case 'wait':
    case 'wait_event':
      if (kind === 'wait_event' && !ctx.event) return 'Link a webinar / event to the funnel first'
      return !(Number(d.amount) > 0) ? 'Set how long to wait' : null
    case 'condition':
      return !String(d.value ?? '').trim() ? 'Finish the condition' : null
    default:
      return null
  }
}
