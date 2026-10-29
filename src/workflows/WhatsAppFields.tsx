import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Hint, Label, Select, TextInput } from '@/components/Field'
import { WaBubble } from '@/integrations/WaBubble'
import { listWatiTemplates, type WatiTemplate } from '@/integrations/watiApi'
import { useTenant } from '@/tenant/useTenant'
import { VARIABLES } from './types'

// approved templates, fetched once per page visit
let cache: { tenant: string; list: WatiTemplate[] } | null = null
const varsIn = (s: string) => [...new Set([...s.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]))]
const LEAD_VARS = new Set<string>(VARIABLES.map(([k]) => k))

/** approved WATI templates of this workspace */
export function useWatiTemplates(): { list: WatiTemplate[] | null; error: string | null; loading: boolean; reload: () => void } {
  const tenant = useTenant()
  const [list, setList] = useState<WatiTemplate[] | null>(cache?.tenant === tenant.id ? cache.list : null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  function load(force = false) {
    if (!force && cache?.tenant === tenant.id) return setList(cache.list)
    setLoading(true)
    setError(null)
    listWatiTemplates(tenant.id)
      .then((all) => {
        const ok = all.filter((t) => (t.status ?? '').toUpperCase() === 'APPROVED')
        cache = { tenant: tenant.id, list: ok }
        setList(ok)
      }, (e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => load(), [tenant.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return { list, error, loading, reload: () => load(true) }
}

/** the template picked in a list ("name|language"): name, language, body and its variables (filled from the lead where they match) */
export function pickTemplate(list: WatiTemplate[] | null, key: string, oldParams: Record<string, string>, extraFields: string[]) {
  const t = list?.find((x) => `${x.elementName}|${x.language?.value ?? ''}` === key)
  if (!t) return null
  const b = t.bodyOriginal || t.body || ''
  const params: Record<string, string> = {}
  for (const v of varsIn(b)) params[v] = oldParams[v] ?? (LEAD_VARS.has(v) || extraFields.includes(v) ? `{{${v}}}` : v === 'name' ? '{{first_name}}' : '')
  return { template: t.elementName, template_language: t.language?.value ?? '', template_body: b, params, message: b }
}
export const findTemplate = (list: WatiTemplate[] | null, d: Record<string, unknown>) =>
  list?.find((t) => t.elementName === d.template && (!d.template_language || t.language?.value === d.template_language)) ?? null
export const templateVars = (d: Record<string, unknown>) => (d.template ? varsIn(String(d.template_body ?? '')) : [])

/** "{{var}}  [text or a lead field]" for each variable of a template */
/** variables made by earlier steps, by name */
const STEP_VAR_LABEL: Record<string, string> = {
  zoom_short_link: 'Zoom short link',
  zoom_short_link_code: 'Zoom short link code',
  zoom_link: 'Zoom link',
  zoom_password: 'Zoom passcode',
  zoom_meeting_id: 'Zoom meeting ID',
  zoom_date: 'Zoom meeting date',
  zoom_time: 'Zoom meeting time',
  generated_link: 'Generated link',
  generated_link_code: 'Generated link code',
}

export function TemplateParams({
  vars,
  params,
  onChange,
  disabled,
  extraFields = [],
}: {
  vars: string[]
  params: Record<string, string>
  onChange: (p: Record<string, string>) => void
  disabled: boolean
  extraFields?: string[]
}) {
  return (
    <div className="cb-params">
      <span className="field-label">Fill the template’s variables</span>
      {vars.map((v) => (
        <div key={v} className="cb-param">
          <span className="wa-var">{`{{${v}}}`}</span>
          <TextInput value={params[v] ?? ''} placeholder="Text or a lead field" onChange={(e) => onChange({ ...params, [v]: e.target.value })} disabled={disabled} />
          <select className="input input-sm" aria-label="Lead field" value="" onChange={(e) => e.target.value && onChange({ ...params, [v]: `{{${e.target.value}}}` })} disabled={disabled}>
            <option value="">Lead field…</option>
            <optgroup label="Lead">
              {VARIABLES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </optgroup>
            {extraFields.some((k) => STEP_VAR_LABEL[k]) && (
              <optgroup label="From earlier steps">
                {extraFields
                  .filter((k) => STEP_VAR_LABEL[k])
                  .map((k) => (
                    <option key={k} value={k}>
                      {STEP_VAR_LABEL[k]}
                    </option>
                  ))}
              </optgroup>
            )}
            {extraFields.some((k) => !STEP_VAR_LABEL[k]) && (
              <optgroup label="Extra fields">
                {extraFields
                  .filter((k) => !STEP_VAR_LABEL[k])
                  .map((k) => (
                    <option key={k} value={k}>
                      {k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </div>
      ))}
    </div>
  )
}

/** WhatsApp step: pick an approved template (its variables filled from the lead) or write a free message. */
export function WhatsAppFields({
  d,
  set,
  onChange,
  disabled,
  messageField,
  extraFields = [],
}: {
  d: Record<string, unknown>
  set: (k: string, v: unknown) => void
  onChange: (data: Record<string, unknown>) => void
  disabled: boolean
  messageField: React.ReactNode
  /** extra lead fields (purpose, company, form / sheet columns) */
  extraFields?: string[]
}) {
  const { list, error, loading, reload } = useWatiTemplates()
  const name = String(d.template ?? '')
  const picked = findTemplate(list, d)
  const body = picked ? picked.bodyOriginal || picked.body || '' : String(d.template_body ?? '')
  const params = (d.params ?? {}) as Record<string, string>
  const vars = name ? varsIn(body) : []

  function pick(key: string) {
    if (!key) return onChange({ ...d, template: '', template_language: '', template_body: '', params: {} })
    const t = pickTemplate(list, key, params, extraFields)
    if (t) onChange({ ...d, ...t })
  }

  return (
    <>
      <div>
        <div className="row-between">
          <Label htmlFor="cb-wa-t">Template</Label>
          <button type="button" className="link-btn small" onClick={reload} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'spin' : undefined} /> Refresh
          </button>
        </div>
        {error ? (
          <>
            <TextInput id="cb-wa-t" placeholder="Template name (approved in WhatsApp)" value={name} onChange={(e) => set('template', e.target.value)} disabled={disabled} />
            <Hint>Couldn’t load templates: {error}</Hint>
          </>
        ) : (
          <Select id="cb-wa-t" value={picked ? `${picked.elementName}|${picked.language?.value ?? ''}` : name ? '__missing' : ''} onChange={(e) => pick(e.target.value)} disabled={disabled || !list}>
            <option value="">{list ? '— No template: free message —' : 'Loading templates…'}</option>
            {name && !picked && list && <option value="__missing">{name} (not approved / not found)</option>}
            {(list ?? []).map((t) => (
              <option key={t.id} value={`${t.elementName}|${t.language?.value ?? ''}`}>
                {t.elementName} · {t.language?.text ?? t.language?.value} · {(t.category ?? '').toLowerCase()}
              </option>
            ))}
          </Select>
        )}
        {!error && <Hint>Approved templates from your WhatsApp provider. Workflows send templates only: a free message can’t reach a lead who hasn’t written to you in the last 24 hours.</Hint>}
      </div>

      {name ? (
        <>
          {vars.length > 0 && <TemplateParams vars={vars} params={params} onChange={(p) => set('params', p)} disabled={disabled} extraFields={extraFields} />}
          {picked && (
            <div className="wa-phone">
              <WaBubble
                headerType={picked.header?.typeString ?? picked.header?.headerTypeString ?? 'none'}
                headerText={picked.header?.text ?? null}
                body={body}
                footer={picked.footer}
                buttons={(picked.buttons ?? []).map((b) => ({ type: b.type, text: b.parameter?.text ?? '' }))}
              />
            </div>
          )}
        </>
      ) : (
        messageField
      )}
    </>
  )
}
