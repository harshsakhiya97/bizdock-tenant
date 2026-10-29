import { VARIABLES } from './types'

/** variables made by earlier steps, by name */
export const STEP_VAR_LABEL: Record<string, string> = {
  zoom_short_link: 'Zoom short link',
  zoom_short_link_code: 'Zoom short link code',
  zoom_link: 'Zoom link',
  zoom_date_time: 'Zoom date & time (29 Oct 2026 5pm-8pm)',
  zoom_password: 'Zoom passcode',
  zoom_meeting_id: 'Zoom meeting ID',
  zoom_date: 'Zoom meeting date',
  zoom_time: 'Zoom meeting time',
  generated_link: 'Generated link',
  generated_link_code: 'Generated link code',
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
  const steps = rest.filter((k) => STEP_VAR_LABEL[k] || rest.includes(`${k}_code`) || (k.endsWith('_code') && rest.includes(k.slice(0, -5))))
  const fields = rest.filter((k) => !steps.includes(k))
  return [
    { label: 'Lead', items: lead.map(([k, l]) => [k, l] as [string, string]) },
    { label: 'Extra fields', items: fields.map((k) => [k, pretty(k)] as [string, string]) },
    { label: 'From earlier steps', items: steps.map((k) => [k, STEP_VAR_LABEL[k] ?? pretty(k)] as [string, string]) },
  ].filter((g) => g.items.length)
}

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
