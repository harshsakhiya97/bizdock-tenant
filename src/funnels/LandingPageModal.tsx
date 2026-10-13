import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Hint, Label, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { useTenant } from '@/tenant/useTenant'
import { saveLandingPage } from './api'
import type { FormField, LandingPage, LandingPageInput } from './types'

const PRESETS = ['City', 'Company name', 'Purpose', 'Message', 'Address', 'Budget']
const BUILT_IN = new Set(['name', 'first_name', 'last_name', 'email', 'phone', 'contact', 'mobile', 'key'])

/** "Company name" → company_name (what the form sends) */
const keyOf = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)

/** Add / edit a landing page: its link, the extra form fields it sends and default UTMs. */
export function LandingPageModal({
  funnelId,
  page,
  onClose,
  onSaved,
}: {
  funnelId: string
  /** null = new page */
  page: LandingPage | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const [input, setInput] = useState<LandingPageInput>({
    name: page?.name ?? '',
    url: page?.url ?? '',
    fields: page?.fields ?? [],
    utm_source: page?.utm_source ?? '',
    utm_medium: page?.utm_medium ?? '',
    utm_campaign: page?.utm_campaign ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof LandingPageInput) => (e: { target: { value: string } }) => setInput((d) => ({ ...d, [k]: e.target.value }))

  const used = new Set(input.fields.map((f) => f.key))
  const addField = (label: string) =>
    setInput((d) => ({ ...d, fields: [...d.fields, { key: keyOf(label), label, required: false }] }))
  const patchField = (i: number, patch: Partial<FormField>) =>
    setInput((d) => ({
      ...d,
      fields: d.fields.map((f, j) => (j === i ? { ...f, ...patch, ...(patch.label != null ? { key: keyOf(patch.label) } : {}) } : f)),
    }))

  async function save() {
    if (!input.name.trim()) return setError('Give the landing page a name.')
    if (input.url.trim() && !/^https?:\/\/\S+\.\S+/.test(input.url.trim())) return setError('The page link should start with https://')
    const keys = input.fields.map((f) => f.key)
    if (input.fields.some((f) => !f.label.trim() || !f.key)) return setError('Every extra field needs a name.')
    if (keys.some((k) => BUILT_IN.has(k))) return setError('Name, email and phone are already included; remove the duplicate field.')
    if (new Set(keys).size !== keys.length) return setError('Two extra fields have the same name.')
    setBusy(true)
    setError(null)
    try {
      await saveLandingPage(tenant.id, funnelId, page, input)
      onSaved(page ? `${input.name.trim()} saved.` : `${input.name.trim()} added. Its webhook URL is ready to copy.`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={640}
      title={page ? 'Edit landing page' : 'Add landing page'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : page ? 'Save changes' : 'Add & create webhook'}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid">
          <div>
            <Label htmlFor="lp-name" required>
              Name
            </Label>
            <TextInput id="lp-name" placeholder="e.g. Webinar registration page" value={input.name} onChange={set('name')} autoFocus />
          </div>
          <div>
            <Label htmlFor="lp-url">Page link</Label>
            <TextInput id="lp-url" type="url" placeholder="https://…" value={input.url} onChange={set('url')} />
          </div>
        </div>

        <div>
          <span className="field-label">Form fields</span>
          <div className="lp-fields">
            {['Name', 'Email', 'Phone'].map((f) => (
              <div key={f} className="lp-field is-fixed">
                <span>{f}</span>
                <code className="code-chip">{f.toLowerCase()}</code>
                <span className="badge badge-muted">Required</span>
                <span />
              </div>
            ))}
            {input.fields.map((f, i) => (
              <div key={i} className="lp-field">
                <input
                  className="input input-sm"
                  aria-label="Field name"
                  placeholder="Field name"
                  value={f.label}
                  onChange={(e) => patchField(i, { label: e.target.value })}
                />
                <code className="code-chip">{f.key || '—'}</code>
                <label className="check-inline">
                  <input type="checkbox" checked={f.required} onChange={(e) => patchField(i, { required: e.target.checked })} /> Required
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon danger-text"
                  aria-label={`Remove ${f.label || 'field'}`}
                  onClick={() => setInput((d) => ({ ...d, fields: d.fields.filter((_, j) => j !== i) }))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="add-chips" style={{ marginTop: 10 }}>
            {PRESETS.filter((p) => !used.has(keyOf(p))).map((p) => (
              <button key={p} type="button" className="add-chip" onClick={() => addField(p)}>
                <Plus size={14} /> {p}
              </button>
            ))}
            <button type="button" className="add-chip" onClick={() => addField('')}>
              <Plus size={14} /> Custom field
            </button>
          </div>
          <Hint>
            Name, email and phone are always included and required. The grey code is what the form must send, e.g.{' '}
            <code>company_name</code>. Fields the form sends that are not listed here are still kept on the lead.
          </Hint>
        </div>

        <div>
          <span className="field-label">Default UTMs</span>
          <div className="form-grid form-grid-3">
            <TextInput aria-label="utm_source" placeholder="utm_source, e.g. website" value={input.utm_source} onChange={set('utm_source')} />
            <TextInput aria-label="utm_medium" placeholder="utm_medium, e.g. organic" value={input.utm_medium} onChange={set('utm_medium')} />
            <TextInput aria-label="utm_campaign" placeholder="utm_campaign" value={input.utm_campaign} onChange={set('utm_campaign')} />
          </div>
          <Hint>Used when a visitor arrives without UTMs in the link (e.g. typed the address). Optional.</Hint>
        </div>
      </div>
    </Modal>
  )
}
