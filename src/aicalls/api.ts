import { db } from '@/lib/supabase'

/** the hellorix function: AI Calling through HelloRix (the key stays on the server) */
export async function hx<T = Record<string, unknown>>(tenantId: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().functions.invoke('hellorix', { body: { tenant_id: tenantId, ...body } })
  const why = data?.error ?? (error ? await errText(error) : null)
  if (why) throw new Error(String(why))
  return data as T
}

/** a function call's error: its JSON { error } when it answered, else why it couldn't be reached */
export async function errText(error: unknown) {
  const ctx = (error as { context?: unknown } | null)?.context
  const payload = ctx && typeof (ctx as Response).json === 'function' ? await (ctx as Response).json().catch(() => null) : null
  if (payload?.error) return String(payload.error)
  const name = (error as { name?: string } | null)?.name
  if (name === 'FunctionsFetchError' || name === 'FunctionsRelayError') return 'AI Calling’s server function isn’t reachable (not deployed yet?). Try again in a minute.'
  return String((error as Error | null)?.message ?? 'Something went wrong')
}

export type CollectField = { field: string; type: string; required?: boolean; how_to_ask?: string; options?: string | string[] }
export type TemplateForm = {
  name: string
  kind: string
  purpose: string
  ask: string
  scenario: string
  collect: CollectField[]
  if_they_push_back: string
  closing: string
  give_up: string
  voice_id: string
  persona_id: string
  /** Rohan's fixed opening ("Namaste {name} ji…", 2 minutes?) and the Hindi / English question, added on save */
  fixed_opening: boolean
  lang_step: boolean
}
export type TemplateRow = { id: string; name: string; kind: string | null; version: number | null; status: string | null; purpose: string | null; prompt_mode: string | null; collect: CollectField[] | null }

export const KINDS: [string, string][] = [
  ['qualify', 'Qualify a lead'],
  ['outreach', 'Outreach'],
  ['invite', 'Invite to event'],
  ['remind', 'Reminder'],
  ['win_back', 'Win back'],
  ['recover_checkout', 'Recover checkout'],
]
export const kindLabel = (k: string | null | undefined) => KINDS.find((x) => x[0] === k)?.[1] ?? '—'
export const FIELD_TYPES: [string, string][] = [
  ['text', 'Text'],
  ['number', 'Number'],
  ['date', 'Date'],
  ['choice', 'Choice'],
  ['yes_no', 'Yes / No'],
  ['phone', 'Phone'],
  ['email', 'Email'],
]

export type AiCall = {
  id: string
  tenant_id: string
  lead_id: string | null
  business_id: string | null
  member_id: string | null
  workflow_run_id: string | null
  via: 'manual' | 'lead' | 'workflow'
  to_phone: string
  to_name: string | null
  objective_id: string | null
  objective_name: string | null
  hx_call_id: string | null
  status: string
  final: boolean
  outcome: string | null
  summary: string | null
  collected: Record<string, unknown>
  recording_url: string | null
  duration_seconds: number | null
  talk_seconds: number | null
  cost: number | null
  cost_final: boolean
  hangup_party: string | null
  error: string | null
  placed_at: string
  ended_at: string | null
}

const COLS =
  'id, tenant_id, lead_id, business_id, member_id, workflow_run_id, via, to_phone, to_name, objective_id, objective_name, hx_call_id, status, final, outcome, summary, collected, recording_url, duration_seconds, talk_seconds, cost, cost_final, hangup_party, error, placed_at, ended_at'

/** the calls this person can see, newest first (optionally of one lead, or from a date) */
export async function listAiCalls(tenantId: string, f: { leadId?: string; from?: string; to?: string } = {}): Promise<AiCall[]> {
  const out: AiCall[] = []
  for (let a = 0; a < 20000; a += 1000) {
    let q = db().from('ai_calls').select(COLS).eq('tenant_id', tenantId)
    if (f.leadId) q = q.eq('lead_id', f.leadId)
    if (f.from) q = q.gte('placed_at', f.from)
    if (f.to) q = q.lt('placed_at', f.to)
    const { data, error } = await q.order('placed_at', { ascending: false }).range(a, a + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as AiCall[]))
    if ((data ?? []).length < 1000) break
  }
  return out
}

/** what a call came to: the outcome, else how it ended */
export const OUTCOME: Record<string, { label: string; tone: string; color: string }> = {
  interested: { label: 'Interested', tone: 'badge-success', color: '#16a34a' },
  callback: { label: 'Call back', tone: 'badge-warning', color: '#d97706' },
  deferred: { label: 'Later', tone: 'badge-warning', color: '#f59e0b' },
  declined: { label: 'Not interested', tone: 'badge-danger', color: '#dc2626' },
  completed: { label: 'Completed', tone: 'badge-info', color: '#2563eb' },
  no_answer: { label: 'Not answered', tone: 'badge-muted', color: '#94a3b8' },
  busy: { label: 'Busy', tone: 'badge-muted', color: '#64748b' },
  failed: { label: 'Failed', tone: 'badge-danger', color: '#b91c1c' },
  cancelled: { label: 'Cancelled', tone: 'badge-muted', color: '#94a3b8' },
  expired: { label: 'No result', tone: 'badge-muted', color: '#94a3b8' },
}
export const LIVE: Record<string, string> = { queued: 'Queued', ringing: 'Ringing', in_progress: 'On the call' }
/** a call's result for the lists: live status while it runs, then its outcome */
export function resultOf(c: Pick<AiCall, 'final' | 'status' | 'outcome'>) {
  if (!c.final) return { label: LIVE[c.status] ?? 'Calling…', tone: 'badge-brand', color: '#7c3aed', key: 'live' }
  const k = c.outcome && OUTCOME[c.outcome] ? c.outcome : OUTCOME[c.status] ? c.status : 'completed'
  return { ...OUTCOME[k], key: k }
}
export const secs = (s: number | null | undefined) => {
  const n = Math.round(Number(s ?? 0))
  return n ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : '—'
}
export const rupees = (n: number | null | undefined) => `₹${Number(n ?? 0).toFixed(2)}`
export const fieldLabel = (k: string) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/** ready-made templates (from Rohan), filled with the business name; checked in the editor before saving */
export function readyMade(co: string) {
  const push = `If they ask the price or fees: say our team will share the exact details and offers on call or WhatsApp; never quote a price yourself. If they say "send details on WhatsApp": agree, confirm this is their WhatsApp number, and say the ${co} team will send it today. If they are busy: ask for a good time to call back.`
  const t = (f: Partial<TemplateForm>): TemplateForm => ({ name: '', kind: 'qualify', purpose: '', ask: '', scenario: '', collect: [], if_they_push_back: push, closing: '', give_up: 'Thank them politely and end the call.', voice_id: '', persona_id: '', fixed_opening: true, lang_step: true, ...f })
  return [
    {
      id: 'qualify',
      title: 'New enquiry: qualify the lead',
      use: 'Call people who just filled a form or sent an enquiry. Finds what they need and how serious they are.',
      form: t({
        name: `${co} - new enquiry qualifier`,
        kind: 'qualify',
        purpose: `You are calling on behalf of ${co}. The person recently sent an enquiry, and you are calling to understand what they need so the right person from our team can help them.`,
        ask: 'Find out what they are looking for (which product, service or course), why they need it, when they want to start, their city or area, and the best time for our team to call them back.',
        collect: [
          { field: 'requirement', type: 'text', required: true, how_to_ask: 'What are you looking for?' },
          { field: 'interest_level', type: 'choice', required: true, options: 'Ready to start now, Within a month, Just exploring', how_to_ask: 'How soon do you want to start?' },
          { field: 'start_time', type: 'text', required: false, how_to_ask: 'When would you like to start?' },
          { field: 'city', type: 'text', required: false, how_to_ask: 'Which area do you stay in?' },
        ],
        closing: `Thank them, say a ${co} team member will contact them soon with full details, and wish them a good day.`,
      }),
    },
    {
      id: 'invite',
      title: 'Invite to a free demo or webinar',
      use: 'Invite leads to a demo class, webinar or open session, and confirm if they will attend.',
      form: t({
        name: `${co} - demo / webinar invite`,
        kind: 'invite',
        purpose: `You are calling on behalf of ${co}. You are inviting the person to a free demo session or webinar so they can see how ${co} can help them.`,
        ask: 'Tell them about the free demo session or webinar in one or two lines, ask if they would like to join, find the slot that suits them, and confirm their WhatsApp number for the joining details.',
        collect: [
          { field: 'will_attend', type: 'yes_no', required: true, how_to_ask: 'Would you like to join?' },
          { field: 'preferred_slot', type: 'text', required: false, how_to_ask: 'Which day and time suits you?' },
          { field: 'whatsapp_ok', type: 'yes_no', required: false, how_to_ask: 'Can we send the details on this WhatsApp number?' },
        ],
        closing: 'Confirm the slot, say the joining details will come on WhatsApp, and thank them.',
      }),
    },
    {
      id: 'win_back',
      title: 'Follow up old enquiries',
      use: 'Call people who enquired earlier but did not join. Finds out if they are still interested and what stopped them.',
      form: t({
        name: `${co} - old enquiry follow-up`,
        kind: 'win_back',
        purpose: `You are calling on behalf of ${co}. This person enquired with us some time ago but did not go ahead. You are checking if they still need help.`,
        ask: 'Ask if they are still looking for what they enquired about, what stopped them from going ahead earlier, and if they would like to visit or talk to our team now.',
        collect: [
          { field: 'still_interested', type: 'choice', required: true, options: 'Yes still interested, Maybe later, Not interested', how_to_ask: 'Are you still looking for this?' },
          { field: 'reason_not_joined', type: 'text', required: false, how_to_ask: 'What stopped you earlier?' },
          { field: 'visit_time', type: 'text', required: false, how_to_ask: 'When can you visit or talk to our team?' },
        ],
        closing: `Thank them for their time and say the ${co} team will reach out with the next step.`,
      }),
    },
    {
      id: 'remind',
      title: 'Visit or demo reminder',
      use: 'Remind leads about a visit, counselling or demo they booked, and confirm or reschedule it.',
      form: t({
        name: `${co} - visit reminder`,
        kind: 'remind',
        purpose: `You are calling on behalf of ${co}. The person has booked a visit, counselling session or demo with us, and you are calling to remind them and confirm.`,
        ask: 'Remind them about their booked visit or session, confirm if they are coming, and if not, find a new time that suits them.',
        collect: [
          { field: 'confirmed', type: 'yes_no', required: true, how_to_ask: 'Will you be able to come?' },
          { field: 'new_time', type: 'text', required: false, how_to_ask: 'If not, which day and time suits you?' },
        ],
        closing: 'Confirm the time, share that the team is looking forward to meeting them, and thank them.',
      }),
    },
  ]
}
