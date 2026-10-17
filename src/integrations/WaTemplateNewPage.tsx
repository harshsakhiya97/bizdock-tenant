import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, Bold, Italic, Plus, Strikethrough, Trash2 } from 'lucide-react'
import { Hint, Label, Select, TextInput } from '@/components/Field'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { WaBubble } from './WaBubble'
import { createWatiTemplate, type WatiTemplateInput } from './watiApi'

const CATEGORIES = [
  { value: 'MARKETING', label: 'Marketing', hint: 'Offers, reminders to book, announcements' },
  { value: 'UTILITY', label: 'Utility', hint: 'Booking confirmations, payment receipts, updates' },
  { value: 'AUTHENTICATION', label: 'Authentication', hint: 'One-time passwords' },
]
const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'en_GB', label: 'English (UK)' },
  { value: 'hi', label: 'Hindi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'mr', label: 'Marathi' },
]
const HEADERS = ['none', 'text', 'image', 'video', 'document'] as const
type HeaderType = (typeof HEADERS)[number]
const SUGGESTED_VARS = ['name', 'purpose', 'booking_date', 'booking_time', 'business', 'amount']

type BtnKind = 'url' | 'call' | 'copy_offer_code' | 'quick_reply'
type Btn = { kind: BtnKind; text: string; value: string }
const BTN: Record<BtnKind, { label: string; valueLabel?: string; placeholder?: string; max: number }> = {
  url: { label: 'Visit website', valueLabel: 'Website URL', placeholder: 'https://', max: 2 },
  call: { label: 'Call phone number', valueLabel: 'Phone number', placeholder: '+91 98765 43210', max: 1 },
  copy_offer_code: { label: 'Copy offer code', valueLabel: 'Offer code', placeholder: 'STUDIO10', max: 1 },
  quick_reply: { label: 'Quick reply', max: 10 },
}

const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+/, '').slice(0, 512)
const varsIn = (s: string) => [...new Set([...s.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]))]

/** New WhatsApp template (WATI): same parts as WATI's own form, with a live preview. */
export function WaTemplateNewPage() {
  const tenant = useTenant()
  const navigate = useNavigate()
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('MARKETING')
  const [language, setLanguage] = useState('en')
  const [headerType, setHeaderType] = useState<HeaderType>('none')
  const [headerText, setHeaderText] = useState('')
  const [headerLink, setHeaderLink] = useState('')
  const [body, setBody] = useState('')
  const [samples, setSamples] = useState<Record<string, string>>({})
  const [footer, setFooter] = useState('')
  const [buttons, setButtons] = useState<Btn[]>([])
  const [newVar, setNewVar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const vars = useMemo(() => varsIn(body), [body])
  const quick = buttons.filter((b) => b.kind === 'quick_reply').length
  const cta = buttons.length - quick

  function wrap(mark: string) {
    const el = bodyRef.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b } = el
    const sel = body.slice(a, b) || 'text'
    const next = `${body.slice(0, a)}${mark}${sel}${mark}${body.slice(b)}`
    setBody(next.slice(0, 1024))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(a + 1, a + 1 + sel.length)
    })
  }
  function insertVar(v: string) {
    const key = slug(v)
    if (!key) return
    const el = bodyRef.current
    const at = el ? el.selectionStart : body.length
    const token = `{{${key}}}`
    setBody(`${body.slice(0, at)}${token}${body.slice(at)}`.slice(0, 1024))
    setNewVar('')
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + token.length, at + token.length)
    })
  }
  const canAdd = (k: BtnKind) => buttons.length < 10 && buttons.filter((b) => b.kind === k).length < BTN[k].max
  const setBtn = (i: number, patch: Partial<Btn>) => setButtons((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)))

  async function submit() {
    setError(null)
    const element = slug(name)
    if (!element) return setError('Give the template a name (lowercase letters, numbers and _).')
    if (!body.trim()) return setError('Write the message body.')
    if (headerType === 'text' && !headerText.trim()) return setError('Write the header text, or pick None.')
    if (['image', 'video', 'document'].includes(headerType) && !/^https?:\/\//.test(headerLink.trim()))
      return setError('Give a sample file link (https://…) for the header.')
    const missing = vars.find((v) => !samples[v]?.trim())
    if (missing) return setError(`Give a sample value for {{${missing}}} — Meta needs it to review the template.`)
    for (const b of buttons) {
      if (b.kind !== 'copy_offer_code' && !b.text.trim()) return setError('Every button needs its text.')
      if (BTN[b.kind].valueLabel && !b.value.trim()) return setError(`${BTN[b.kind].valueLabel} is missing on a button.`)
    }
    const template: WatiTemplateInput = {
      type: 'template',
      category,
      subCategory: 'STANDARD',
      buttonsType: !buttons.length ? 'NONE' : quick && cta ? 'quick_reply_and_call_to_action' : quick ? 'quick_reply' : 'call_to_action',
      buttons: buttons.map((b): { type: string; parameter: Record<string, string> } =>
        b.kind === 'url'
          ? { type: 'url', parameter: { text: b.text.trim(), phoneNumber: '', url: b.value.trim(), urlType: 'static' } }
          : b.kind === 'call'
            ? { type: 'call', parameter: { text: b.text.trim(), phoneNumber: b.value.replace(/[^\d+]/g, ''), url: '', urlType: 'none' } }
            : b.kind === 'copy_offer_code'
              ? { type: 'copy_offer_code', parameter: { text: 'Copy offer code', phoneNumber: '', copyOfferCode: b.value.trim(), url: '', urlType: 'none' } }
              : { type: 'quick_reply', parameter: { text: b.text.trim(), urlType: 'none' } },
      ),
      footer: footer.trim(),
      elementName: element,
      language,
      header: {
        type: headerType,
        ...(headerType === 'text' ? { text: headerText.trim() } : {}),
        link: headerType === 'none' || headerType === 'text' ? '' : headerLink.trim(),
        mediaFromPC: '',
        mediaHeaderId: '',
      },
      body: body.trim(),
      customParams: vars.map((v) => ({ paramName: v, paramValue: samples[v].trim() })),
      creationMethod: 0,
    }
    setBusy(true)
    try {
      await createWatiTemplate(tenant.id, template)
      navigate('/integrations/whatsapp/templates', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <Link to="/integrations/whatsapp/templates" className="back-link">
        <ArrowLeft size={15} /> WhatsApp templates
      </Link>
      <div className="row-between page-top">
        <div className="page-head">
          <h2>New template</h2>
          <p>Submitted to WATI and sent to Meta for approval. Approval usually takes a few minutes to a day.</p>
        </div>
        <div className="row page-actions">
          {error && <span className="err-text">{error}</span>}
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Submitting…' : 'Save and submit'}
          </button>
        </div>
      </div>

      <div className="tpl-editor">
        <div className="card card-pad stack" style={{ gap: 22 }}>
          <div className="form-grid tpl-top-grid">
            <div>
              <Label htmlFor="t-name" required>
                Template name
              </Label>
              <TextInput id="t-name" placeholder="booking_confirmed" value={name} onChange={(e) => setName(slug(e.target.value))} />
            </div>
            <div>
              <Label htmlFor="t-cat" required>
                Category
              </Label>
              <Select id="t-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="t-lang" required>
                Language
              </Label>
              <Select id="t-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Hint>{CATEGORIES.find((c) => c.value === category)?.hint}. Name: lowercase letters, numbers and _ only.</Hint>

          <section className="tpl-sec">
            <b>
              Header <span className="muted">(optional)</span>
            </b>
            <p className="muted small">Highlight your brand here; use an image, video or document to stand out.</p>
            <div className="row" style={{ gap: 16 }}>
              {HEADERS.map((h) => (
                <label key={h} className="radio">
                  <input type="radio" name="hdr" checked={headerType === h} onChange={() => setHeaderType(h)} /> {h.charAt(0).toUpperCase() + h.slice(1)}
                </label>
              ))}
            </div>
            {headerType === 'text' && (
              <div className="counted">
                <TextInput placeholder="Header text" maxLength={60} value={headerText} onChange={(e) => setHeaderText(e.target.value)} />
                <span>{headerText.length}/60</span>
              </div>
            )}
            {['image', 'video', 'document'].includes(headerType) && (
              <>
                <TextInput placeholder={`Sample ${headerType} link (https://…)`} value={headerLink} onChange={(e) => setHeaderLink(e.target.value)} />
                <Hint>A public link to a sample {headerType}, used by Meta to review. The real file is chosen when sending.</Hint>
              </>
            )}
          </section>

          <section className="tpl-sec">
            <div className="row-between">
              <b>Body</b>
              <div className="row" style={{ gap: 6 }}>
                <select className="input input-sm" style={{ width: 150 }} value="" onChange={(e) => e.target.value && insertVar(e.target.value)} aria-label="Add variable">
                  <option value="">+ Add variable</option>
                  {SUGGESTED_VARS.map((v) => (
                    <option key={v} value={v}>
                      {`{{${v}}}`}
                    </option>
                  ))}
                </select>
                <input className="input input-sm" style={{ width: 120 }} placeholder="custom_name" value={newVar} onChange={(e) => setNewVar(slug(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && insertVar(newVar)} />
                <button type="button" className="btn btn-outline btn-sm" onClick={() => insertVar(newVar)} disabled={!newVar}>
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <p className="muted small">Make it personal with variables like {'{{name}}'} — they’re filled in when the message is sent.</p>
            <div className="tpl-body">
              <div className="tpl-tools">
                <button type="button" onClick={() => wrap('*')} aria-label="Bold">
                  <Bold size={15} />
                </button>
                <button type="button" onClick={() => wrap('_')} aria-label="Italic">
                  <Italic size={15} />
                </button>
                <button type="button" onClick={() => wrap('~')} aria-label="Strikethrough">
                  <Strikethrough size={15} />
                </button>
                <span className="muted small" style={{ marginLeft: 'auto' }}>
                  {body.length}/1024
                </span>
              </div>
              <textarea ref={bodyRef} className="input" rows={6} maxLength={1024} placeholder="Template message…" value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            {vars.length > 0 && (
              <div className="tpl-samples">
                <span className="field-label">Sample values (for Meta’s review)</span>
                {vars.map((v) => (
                  <div key={v} className="row" style={{ flexWrap: 'nowrap' }}>
                    <span className="wa-var" style={{ minWidth: 140 }}>{`{{${v}}}`}</span>
                    <TextInput placeholder={v === 'name' ? 'Rahul' : 'Sample value'} value={samples[v] ?? ''} onChange={(e) => setSamples({ ...samples, [v]: e.target.value })} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="tpl-sec">
            <b>
              Footer <span className="muted">(optional)</span>
            </b>
            <p className="muted small">Good for a disclaimer or a short sign-off.</p>
            <div className="counted">
              <TextInput placeholder="e.g. Viral Studios · Reply STOP to opt out" maxLength={60} value={footer} onChange={(e) => setFooter(e.target.value)} />
              <span>{footer.length}/60</span>
            </div>
          </section>

          <section className="tpl-sec">
            <b>
              Buttons <span className="muted">(recommended)</span>
            </b>
            <p className="muted small">Let customers act on the message. Up to 10 buttons.</p>
            {buttons.map((b, i) => (
              <div key={i} className="tpl-btn-row">
                <span className="tpl-btn-kind">{BTN[b.kind].label}</span>
                {b.kind !== 'copy_offer_code' && (
                  <TextInput placeholder="Button text" maxLength={25} value={b.text} onChange={(e) => setBtn(i, { text: e.target.value })} />
                )}
                {BTN[b.kind].valueLabel && (
                  <TextInput placeholder={BTN[b.kind].placeholder} value={b.value} onChange={(e) => setBtn(i, { value: e.target.value })} />
                )}
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove button" onClick={() => setButtons((bs) => bs.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div className="row" style={{ gap: 8 }}>
              {(Object.keys(BTN) as BtnKind[]).map((k) => (
                <button key={k} type="button" className="btn btn-outline btn-sm" disabled={!canAdd(k)} onClick={() => setButtons((bs) => [...bs, { kind: k, text: '', value: '' }])}>
                  <Plus size={14} /> {BTN[k].label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="tpl-side">
          <div className="field-label" style={{ textAlign: 'center' }}>
            Preview
          </div>
          <div className="wa-phone">
            <WaBubble
              headerType={headerType}
              headerText={headerText}
              body={body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, v: string) => samples[v]?.trim() || m)}
              footer={footer}
              buttons={buttons.map((b) => ({ type: b.kind, text: b.kind === 'copy_offer_code' ? 'Copy offer code' : b.text }))}
            />
          </div>
          <p className={cn('muted small')} style={{ textAlign: 'center' }}>
            Variables show your sample values.
          </p>
        </aside>
      </div>
    </>
  )
}
