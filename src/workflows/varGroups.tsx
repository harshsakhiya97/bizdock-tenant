import { createContext, useContext } from 'react'
import { shortBase } from './api'
import { VARIABLES, type UpstreamStep } from './types'

/** variables made by earlier steps, by name */
export const STEP_VAR_LABEL: Record<string, string> = {
  // from the trigger: when this workflow started (the form post), India time: 2026-10-30 10:59
  submitted_at: 'Form submitted (date & time)',
  zoom_short_link: 'Zoom short link',
  zoom_short_link_code: 'Zoom short link code',
  zoom_link: 'Zoom link',
  zoom_date_time: 'Zoom date & time (29 Oct 2026 5pm-8pm)',
  zoom_password: 'Zoom passcode',
  zoom_meeting_id: 'Zoom meeting ID',
  zoom_date: 'Zoom meeting date',
  zoom_time: 'Zoom meeting time',
  zoom_start: 'Zoom meeting start',
  member_name: 'Team member name',
  member_phone: 'Team member phone',
  generated_link: 'Generated link',
  generated_link_code: 'Generated link code',
  generated_link_full_url: 'Generated link – full URL',
  generated_link_parameters: 'Generated link – parameters only',
  // a webinar date (Register for webinar / Before / After webinar)
  webinar_title: 'Webinar title',
  webinar_start: 'Webinar start',
  webinar_end: 'Webinar end',
  webinar_date_time: 'Webinar date & time (29 Oct 2026 7pm-8:30pm)',
  webinar_date: 'Webinar date',
  webinar_time: 'Webinar time',
  webinar_short_link: 'Webinar joining short link',
  webinar_short_link_code: 'Webinar joining short link code',
  webinar_join_link: 'Webinar joining link (Zoom)',
  webinar_group_link: 'WhatsApp group joining link',
  // Get webinar analytics
  webinar_category: 'Webinar category',
  webinar_attended: 'Attended the webinar (Yes / No)',
  webinar_minutes: 'Minutes attended',
  webinar_attended_percent: 'Attended (% of the webinar)',
  webinar_questions: 'Questions asked (Q&A)',
  webinar_chats: 'Chat messages',
  webinar_polls: 'Poll answers',
  webinar_joined_at: 'Joined at',
}

const pretty = (k: string) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export type VarGroup = { label: string; items: [string, string][] }

/** the Create Zoom meeting step's variables, in the order they're listed */
const ZOOM_ORDER = ['zoom_start', 'zoom_date_time', 'zoom_date', 'zoom_time', 'zoom_link', 'zoom_short_link', 'zoom_short_link_code', 'zoom_meeting_id', 'zoom_password']
const isZoom = (k: string) => k.startsWith('zoom_')

/** earlier steps' variables: the Zoom meeting's under their own heading, the rest under From earlier steps */
export function stepGroups(keys: string[], label: (k: string) => string = (k) => STEP_VAR_LABEL[k] ?? pretty(k)): VarGroup[] {
  const rank = (k: string) => (ZOOM_ORDER.includes(k) ? ZOOM_ORDER.indexOf(k) : ZOOM_ORDER.length)
  const zoom = keys.filter(isZoom).sort((a, b) => rank(a) - rank(b))
  return [
    { label: 'Zoom meeting', items: zoom.map((k) => [k, label(k)] as [string, string]) },
    { label: 'From earlier steps', items: keys.filter((k) => !isZoom(k)).map((k) => [k, label(k)] as [string, string]) },
  ].filter((g) => g.items.length)
}

/**
 * The variables a step can use, grouped the same way everywhere in the builder:
 * Lead (its standard fields), Extra fields (form / sheet / webhook fields), From earlier steps (Zoom, links…).
 * `extra` = the extra field keys plus the earlier steps' variables (as the panel collects them).
 */
export function varGroups(extra: string[], lead: readonly (readonly [string, string])[] = VARIABLES): VarGroup[] {
  const known = new Set(lead.map(([k]) => k))
  const rest = [...new Set(extra)].filter((k) => k && !known.has(k))
  // a Generate link step named "x" makes {{x}} and {{x_code}}
  const base = (k: string) => ['_code', '_full_url', '_parameters'].map((x) => (k.endsWith(x) ? k.slice(0, -x.length) : '')).find((b) => b && rest.includes(`${b}_code`))
  const steps = rest.filter((k) => STEP_VAR_LABEL[k] || rest.includes(`${k}_code`) || !!base(k))
  const fields = rest.filter((k) => !steps.includes(k))
  return [
    { label: 'Lead', items: lead.map(([k, l]) => [k, l] as [string, string]) },
    { label: 'Extra fields', items: fields.map((k) => [k, pretty(k)] as [string, string]) },
    ...stepGroups(steps),
  ].filter((g) => g.items.length)
}

/** what a step's value looks like (shown after its name in the lists) */
const ZOOM_EXAMPLE: Record<string, string> = {
  zoom_link: 'https://us06web.zoom.us/j/81234567890?pwd=Ab12Cd34',
  zoom_date: '2026-10-29',
  zoom_time: '17:00',
  zoom_meeting_id: '81234567890',
  zoom_password: 'Ab12Cd34',
  zoom_short_link_code: 'UCTPZW46',
  member_phone: '9876543210',
  webinar_join_link: 'https://us06web.zoom.us/w/81234567890?tk=…',
  webinar_date: '2026-10-29',
  webinar_time: '19:00',
  webinar_short_link_code: 'K7M2QX9P',
  webinar_category: 'Hot',
  webinar_attended: 'Yes',
  webinar_minutes: '52',
  webinar_attended_percent: '58',
}
function stepExample(st: UpstreamStep, k: string): string {
  if (st.type === 'generate_link') {
    const base = st.keys[0]
    if (k === base) return `${shortBase()}/T7P46LXK`
    if (k === `${base}_code`) return 'T7P46LXK'
    if (k === `${base}_full_url`) return 'https://your-site.com/page?fname=Harsh&phone=9876543210'
    if (k === `${base}_parameters`) return 'fname=Harsh&phone=9876543210'
  }
  if (k === 'zoom_short_link') return `${shortBase()}/UCTPZW46`
  if (k === 'webinar_short_link') return `${shortBase()}/K7M2QX9P`
  if (k === 'webinar_group_link') return `${shortBase()}/ai-income-wa`
  return ZOOM_EXAMPLE[k] ?? ''
}

/** the open step's earlier steps in order (Step 1 = the trigger): field lists are grouped by them */
export const StepOrderContext = createContext<UpstreamStep[] | null>(null)

/** the extra keys that are earlier steps' values (Zoom, a Generate link's), and the rest (form / webhook / lead fields) */
function splitStepVars(rest: string[]) {
  const base = (k: string) => ['_code', '_full_url', '_parameters'].map((x) => (k.endsWith(x) ? k.slice(0, -x.length) : '')).find((b) => b && rest.includes(`${b}_code`))
  const steps = rest.filter((k) => STEP_VAR_LABEL[k] || rest.includes(`${k}_code`) || !!base(k))
  return { steps, fields: rest.filter((k) => !steps.includes(k)) }
}

/**
 * Field lists by step, in workflow order: "Step 1: Trigger" (the webhook's fields, or the lead's and the form's),
 * then each earlier step that gives values — "Step 2: Get lead details" (the found lead's fields and extra fields),
 * "Step 3: Generate link" (its link), "Step 4: Create Zoom meeting" (the meeting's)…
 */
export function orderedGroups(
  order: UpstreamStep[],
  o: { hook: string[] | null; lead: readonly (readonly [string, string])[]; fields: string[]; label?: (k: string) => string },
): VarGroup[] {
  const label = o.label ?? ((k: string) => STEP_VAR_LABEL[k] ?? pretty(k))
  const leadItems = o.lead.map(([k, l]) => [k, l] as [string, string])
  const fieldItems = o.fields.map((k) => [k, pretty(k)] as [string, string])
  const out: VarGroup[] = []
  // a Before / After webinar workflow: Step 1 Webinar fields, Step 2 Lead fields, then the steps (numbered in this order)
  const webinarFlow = order.some((st) => st.type === 'trigger' && st.keys.includes('webinar_title'))
  for (const st of order) {
    if (st.type === 'trigger' && webinarFlow && !o.hook) {
      const web = st.keys.filter((k) => k.startsWith('webinar_')).map((k) => [k, label(k)] as [string, string])
      const lead = [...leadItems, ...fieldItems]
      out.push({ label: 'Webinar fields', items: web })
      out.push({ label: 'Lead fields', items: [...lead, ...st.keys.filter((k) => !k.startsWith('webinar_') && !lead.some(([x]) => x === k)).map((k) => [k, label(k)] as [string, string])] })
    } else if (st.type === 'trigger') {
      const items = o.hook ? o.hook.map((k) => [k, k] as [string, string]) : [...leadItems, ...fieldItems]
      out.push({ label: `Step ${st.n}: Trigger`, items: [...items, ...st.keys.filter((k) => !items.some(([x]) => x === k)).map((k) => [k, label(k)] as [string, string])] })
    } else if (st.type === 'lead_lookup') {
      // the found lead (a webhook-call workflow; a lead workflow has its lead from the trigger)
      if (o.hook) out.push({ label: `Step ${st.n}: ${st.label}`, items: [...leadItems, ...fieldItems] })
    } else if (st.keys.length)
      out.push({
        label: webinarFlow ? (st.type === 'webinar_analytics' ? 'Zoom’s analytics' : st.label) : `Step ${st.n}: ${st.label}`,
        items: st.keys.map((k) => {
          const eg = stepExample(st, k)
          return [k, eg ? `${label(k)} (${eg})` : label(k)] as [string, string]
        }),
      })
  }
  const groups = out.filter((g) => g.items.length)
  return webinarFlow ? groups.map((g, i) => ({ ...g, label: `Step ${i + 1}: ${g.label}` })) : groups
}

/** "On webhook call" workflows: the webhook's fields (the only fields there are; no lead) */
export const HookVarsContext = createContext<string[] | null>(null)

/** varGroups, but for a webhook-call workflow: its webhook's fields, then the earlier steps' variables */
/** the workflow (or its funnel) has an event / webinar: only then do Event title / date / time / link have a value */
export const HasEventContext = createContext(true)

/** a Get lead details step is in the workflow: a webhook-call workflow also has the lead's fields */
export const LeadLookupContext = createContext(false)

export function useVarGroups(extra: string[], leadVars: readonly (readonly [string, string])[] = VARIABLES): VarGroup[] {
  const hook = useContext(HookVarsContext)
  const dates = useContext(DateVarsContext)
  const hasEvent = useContext(HasEventContext)
  const lookup = useContext(LeadLookupContext)
  const order = useContext(StepOrderContext)
  const lead = hasEvent ? leadVars : leadVars.filter(([k]) => !k.startsWith('event_'))
  // by step: Step 1: Trigger, Step 2: Get lead details, Step 3: Generate link…
  if (order?.length) {
    const known = new Set(lead.map(([k]) => k))
    const rest = [...new Set(extra)].filter((k) => k && !known.has(k) && !(hook ?? []).includes(k))
    const { fields } = splitStepVars(rest)
    return withDateParts(orderedGroups(order, { hook, lead, fields }), dates)
  }
  if (!hook) return withDateParts(varGroups(extra, lead), dates)
  // webhook fields, then the found lead's fields (Lead, Extra fields) and the earlier steps'
  if (lookup) {
    const hookGroup = { label: 'Webhook fields', items: hook.map((k) => [k, k] as [string, string]) }
    return withDateParts([hookGroup, ...varGroups([...new Set(extra)].filter((k) => k && !hook.includes(k)), lead)].filter((g) => g.items.length), dates)
  }
  const steps = [...new Set(extra)].filter((k) => k && !hook.includes(k))
  return withDateParts(
    [
      { label: 'Webhook fields', items: hook.map((k) => [k, k] as [string, string]) },
      ...stepGroups(steps),
    ].filter((g) => g.items.length),
    dates,
  )
}

/** the fields holding a date / date-time / time (each also gives {{x_date}}, {{x_time}}, {{x_datetime}}) */
export const DateVarsContext = createContext<string[]>([])

/** the ready-made formats of a date field, as the runner fills them (India time) */
export const DATE_PARTS = [
  ['_date', 'date', '29 Oct 2026'],
  ['_time', 'time', '4:00 pm'],
  ['_datetime', 'date & time', '29 Oct 2026, 4:00 pm'],
] as const

/** a date field as its date / time / date & time versions (instead of the raw value) */
function withDateParts(groups: VarGroup[], dates: string[]): VarGroup[] {
  if (!dates.length) return groups
  // a meeting starts and ends on the same day: meeting_end's date is meeting_start's (one "date" for both)
  // a webinar's start / end: its date is Webinar date (no separate start / end date)
  const sameDay = (k: string, x: string) => x === '_date' && ((k === 'meeting_end' && dates.includes('meeting_start')) || k === 'webinar_start' || k === 'webinar_end')
  return groups.map((g) => ({
    ...g,
    items: g.items.flatMap(([k, l]) =>
      dates.includes(k)
        ? // only its ready formats (date / time / date & time), not the raw "2026-11-04 15:00"
          DATE_PARTS.filter(([x]) => !sameDay(k, x)).map(([x, w, eg]) => [`${k}${x}`, `${l === k ? k : l} – ${w} (${eg})`] as [string, string])
        : [[k, l] as [string, string]],
    ),
  }))
}

/** a value that reads as a date, a date-time or a time: 2026-10-29 / 2026-10-29 16:00 / 29/10/2026 / 4:00 pm */
export const looksLikeWhen = (v: unknown) => {
  const s = String(v ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}([ T]\d{1,2}:\d{2}.*)?$/.test(s) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}( .*)?$/.test(s) || /^\d{1,2}:\d{2}(:\d{2})?\s*([ap]\.?m\.?)?$/i.test(s)
}
/** a field named like a date (when there is no sample value to go by) */
export const namedLikeWhen = (k: string) => /(date|time|_at$|^when)/i.test(k)

/**
 * A field's name as shown in the lists, in Title Case with spaces: meeting_end → Meeting End,
 * "meeting_start – date (29 Oct 2026)" → "Meeting Start – Date (29 Oct 2026)" (examples in brackets — dates, links — kept as they are)
 */
export function fieldLabel(label: string): string {
  return label
    .replace(/_/g, ' ')
    .split(/(\([^)]*\))/)
    .map((part) => (part.startsWith('(') && (/\d/.test(part) || part.includes('://')) ? part : part.replace(/\b([a-z])([a-z]*)/gi, (_, a: string, b: string) => a.toUpperCase() + b)))
    .join('')
}

/** <optgroup>s for a variable <select> */
export function VarOptions({ groups, show }: { groups: VarGroup[]; show?: (key: string, label: string) => string }) {
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map(([k, l]) => (
            <option key={k} value={k}>
              {show ? show(k, l) : fieldLabel(l)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  )
}
