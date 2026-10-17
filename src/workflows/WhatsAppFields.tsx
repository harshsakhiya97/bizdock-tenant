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

/** WhatsApp step: pick an approved template (its variables filled from the lead) or write a free message. */
export function WhatsAppFields({
  d,
  set,
  onChange,
  disabled,
  messageField,
}: {
  d: Record<string, unknown>
  set: (k: string, v: unknown) => void
  onChange: (data: Record<string, unknown>) => void
  disabled: boolean
  messageField: React.ReactNode
}) {
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

  const name = String(d.template ?? '')
  const picked = list?.find((t) => t.elementName === name && (!d.template_language || t.language?.value === d.template_language)) ?? null
  const body = picked ? picked.bodyOriginal || picked.body || '' : String(d.template_body ?? '')
  const params = (d.params ?? {}) as Record<string, string>
  const vars = name ? varsIn(body) : []

  function pick(key: string) {
    if (!key) return onChange({ ...d, template: '', template_language: '', template_body: '', params: {} })
    const t = list?.find((x) => `${x.elementName}|${x.language?.value ?? ''}` === key)
    if (!t) return
    const b = t.bodyOriginal || t.body || ''
    // template variables that match a lead field are filled from the lead; the rest are typed in
    const next: Record<string, string> = {}
    for (const v of varsIn(b)) next[v] = params[v] ?? (LEAD_VARS.has(v) ? `{{${v}}}` : v === 'name' ? '{{first_name}}' : '')
    onChange({ ...d, template: t.elementName, template_language: t.language?.value ?? '', template_body: b, params: next, message: b })
  }

  return (
    <>
      <div>
        <div className="row-between">
          <Label htmlFor="cb-wa-t">Template</Label>
          <button type="button" className="link-btn small" onClick={() => load(true)} disabled={loading}>
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
        {!error && <Hint>Approved templates from your WhatsApp provider. A template is needed when the lead hasn’t messaged you in the last 24 hours.</Hint>}
      </div>

      {name ? (
        <>
          {vars.length > 0 && (
            <div className="cb-params">
              <span className="field-label">Fill the template’s variables</span>
              {vars.map((v) => (
                <div key={v} className="cb-param">
                  <span className="wa-var">{`{{${v}}}`}</span>
                  <TextInput value={params[v] ?? ''} placeholder="Text or a lead field" onChange={(e) => set('params', { ...params, [v]: e.target.value })} disabled={disabled} />
                  <select className="input input-sm" aria-label="Lead field" value="" onChange={(e) => e.target.value && set('params', { ...params, [v]: `{{${e.target.value}}}` })} disabled={disabled}>
                    <option value="">Lead field…</option>
                    {VARIABLES.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
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
