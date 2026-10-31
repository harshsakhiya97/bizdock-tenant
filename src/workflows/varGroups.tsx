import { createContext, useContext } from 'react'
import { VARIABLES } from './types'

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
  generated_link: 'Generated link',
  generated_link_code: 'Generated link code',
  generated_link_full_url: 'Generated link – full URL',
  generated_link_parameters: 'Generated link – parameters only',
}

const pretty = (k: string) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export type VarGroup = { label: string; items: [string, string][] }

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
    { label: 'From earlier steps', items: steps.map((k) => [k, STEP_VAR_LABEL[k] ?? pretty(k)] as [string, string]) },
  ].filter((g) => g.items.length)
}

/** "On webhook call" workflows: the webhook's fields (the only fields there are; no lead) */
export const HookVarsContext = createContext<string[] | null>(null)

/** varGroups, but for a webhook-call workflow: its webhook's fields, then the earlier steps' variables */
export function useVarGroups(extra: string[], lead: readonly (readonly [string, string])[] = VARIABLES): VarGroup[] {
  const hook = useContext(HookVarsContext)
  const dates = useContext(DateVarsContext)
  if (!hook) return withDateParts(varGroups(extra, lead), dates)
  const steps = [...new Set(extra)].filter((k) => k && !hook.includes(k))
  return withDateParts(
    [
      { label: 'Webhook fields', items: hook.map((k) => [k, k] as [string, string]) },
      { label: 'From earlier steps', items: steps.map((k) => [k, STEP_VAR_LABEL[k] ?? pretty(k)] as [string, string]) },
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
