import { createContext, useContext } from 'react'
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
  for (const st of order) {
    if (st.type === 'trigger') {
      const items = o.hook ? o.hook.map((k) => [k, k] as [string, string]) : [...leadItems, ...fieldItems]
      out.push({ label: `Step ${st.n}: Trigger`, items: [...items, ...st.keys.filter((k) => !items.some(([x]) => x === k)).map((k) => [k, label(k)] as [string, string])] })
    } else if (st.type === 'lead_lookup') {
      // the found lead (a webhook-call workflow; a lead workflow has its lead from the trigger)
      if (o.hook) out.push({ label: `Step ${st.n}: ${st.label}`, items: [...leadItems, ...fieldItems] })
    } else if (st.keys.length) out.push({ label: `Step ${st.n}: ${st.label}`, items: st.keys.map((k) => [k, label(k)] as [string, string]) })
  }
  return out.filter((g) => g.items.length)
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

/** after each date field: its date / time / date & time versions */
function withDateParts(groups: VarGroup[], dates: string[]): VarGroup[] {
  if (!dates.length) return groups
  return groups.map((g) => ({
    ...g,
    items: g.items.flatMap(([k, l]) =>
      dates.includes(k)
        ? [[k, l] as [string, string], ...DATE_PARTS.map(([x, w, eg]) => [`${k}${x}`, `${l === k ? k : l} – ${w} (${eg})`] as [string, string])]
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

/** <optgroup>s for a variable <select> */
export function VarOptions({ groups, show }: { groups: VarGroup[]; show?: (key: string, label: string) => string }) {
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map(([k, l]) => (
            <option key={k} value={k}>
              {show ? show(k, l) : l}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  )
}
