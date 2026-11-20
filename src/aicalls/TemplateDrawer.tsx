import { useState } from 'react'
import { Plus, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Hint, Label, TextArea, TextInput } from '@/components/Field'
import { SearchSelect } from '@/components/SearchSelect'
import { useTenant } from '@/tenant/useTenant'
import { FIELD_TYPES, hx, KINDS, type CollectField, type TemplateForm } from './api'

type Opt = { id: string; label: string }
export const emptyForm = (): TemplateForm => ({ name: '', kind: 'qualify', purpose: '', ask: '', scenario: '', collect: [], if_they_push_back: '', closing: '', give_up: '', voice_id: '', persona_id: '', fixed_opening: true, lang_step: true })

/**
 * Add / edit an AI calling template (a HelloRix script): Guided form (opening & purpose, what to ask, the information
 * to collect, push-back, closing, give-up) or a Full call prompt; voice and persona; Write with AI (Gemini).
 */
export function TemplateDrawer({
  objectiveId,
  initial,
  business,
  voices,
  personas,
  onClose,
  onSaved,
}: {
  /** editing a saved template */
  objectiveId: string | null
  initial: TemplateForm
  /** for Write with AI */
  business: string
  voices: Opt[]
  personas: Opt[]
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const [f, setF] = useState<TemplateForm>(initial)
  const [mode, setMode] = useState<'guided' | 'raw'>(initial.scenario ? 'raw' : 'guided')
  const [lang, setLang] = useState<'English' | 'Hinglish'>('English')
  const [goal, setGoal] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => setF((d) => ({ ...d, [k]: v }))
  const setField = (i: number, patch: Partial<CollectField>) => setF((d) => ({ ...d, collect: d.collect.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))

  async function write() {
    setDrafting(true)
    setError(null)
    try {
      const d = await hx<{ draft: Partial<TemplateForm> & { collect?: CollectField[] } }>(tenant.id, { action: 'draft', language: lang, goal, business })
      const x = d.draft ?? {}
      setF((cur) => ({
        ...cur,
        name: x.name || cur.name,
        purpose: x.purpose || cur.purpose,
        ask: x.ask || cur.ask,
        collect: (x.collect ?? []).map((c) => ({ ...c, options: Array.isArray(c.options) ? c.options.join(', ') : c.options })),
        if_they_push_back: x.if_they_push_back || cur.if_they_push_back,
        closing: x.closing || cur.closing,
        give_up: x.give_up || cur.give_up,
        scenario: '',
      }))
      setMode('guided')
    } catch (e) {
      setError((e as Error).message)
    }
    setDrafting(false)
  }

  async function save() {
    setError(null)
    if (!f.name.trim()) return setError('Give the template a name.')
    if (mode === 'guided' && (!f.purpose.trim() || !f.ask.trim())) return setError('Write the opening & purpose and what to ask.')
    if (mode === 'raw' && !f.scenario.trim()) return setError('Write the full call prompt.')
    if (f.collect.some((c) => !c.field.trim())) return setError('Give every field to collect a name, or remove it.')
    setBusy(true)
    try {
      const form = mode === 'raw' ? { ...f, purpose: '' } : { ...f, scenario: '' }
      await hx(tenant.id, { action: 'template_save', objective_id: objectiveId, form })
      onSaved(`${f.name.trim()} saved.`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={760}
      title={objectiveId ? 'Edit template' : 'New template'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : objectiveId ? 'Save changes' : 'Create template'}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <div className="ac-ai">
          <b>Write it with AI</b>
          <div className="muted small">Gemini drafts the script from the goal; you can change everything after.</div>
          <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <select className="input input-sm" style={{ width: 120 }} value={lang} onChange={(e) => setLang(e.target.value as 'English' | 'Hinglish')} aria-label="Language">
              <option>English</option>
              <option>Hinglish</option>
            </select>
            <input className="input input-sm" style={{ flex: '1 1 240px' }} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="The goal, e.g. book a free demo class" />
            <Button size="sm" onClick={() => void write()} disabled={drafting}>
              <Sparkles size={14} /> {drafting ? 'Writing…' : 'Write script'}
            </Button>
          </div>
        </div>

        <FormSection title="Template">
          <div className="form-grid">
            <div>
              <Label htmlFor="at-name" required>
                Name
              </Label>
              <TextInput id="at-name" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Pride lead qualifier" />
            </div>
            <div>
              <Label htmlFor="at-kind">Type</Label>
              <SearchSelect id="at-kind" value={f.kind} onChange={(v) => set('kind', v ?? 'qualify')} options={KINDS.map(([k, l]) => ({ value: k, label: l }))} searchPlaceholder="Search types…" />
            </div>
          </div>
          <div className="seg" role="radiogroup" aria-label="Script">
            <button type="button" role="radio" aria-checked={mode === 'guided'} className={mode === 'guided' ? 'is-active' : ''} onClick={() => setMode('guided')}>
              Guided form
            </button>
            <button type="button" role="radio" aria-checked={mode === 'raw'} className={mode === 'raw' ? 'is-active' : ''} onClick={() => setMode('raw')}>
              Full prompt
            </button>
          </div>
          {mode === 'guided' ? (
            <>
              <div>
                <Label htmlFor="at-purpose" required>
                  Opening and purpose
                </Label>
                <TextArea id="at-purpose" rows={4} value={f.purpose} onChange={(e) => set('purpose', e.target.value)} />
                <Hint>Who the AI is and why it is calling. Use {'{customer_name}'} for the person’s name.</Hint>
              </div>
              <div>
                <Label htmlFor="at-ask" required>
                  What to ask
                </Label>
                <TextArea id="at-ask" rows={3} value={f.ask} onChange={(e) => set('ask', e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="at-scenario" required>
                  Full call prompt
                </Label>
                <TextArea id="at-scenario" rows={10} value={f.scenario} onChange={(e) => set('scenario', e.target.value)} />
                <Hint>The whole call in one text. Use {'{customer_name}'} for the person’s name.</Hint>
              </div>
              <div>
                <Label htmlFor="at-goal">Goal (optional)</Label>
                <TextInput id="at-goal" value={f.ask} onChange={(e) => set('ask', e.target.value)} placeholder="Leave empty to follow the prompt above" />
              </div>
            </>
          )}
        </FormSection>

        <FormSection title={`Information to collect (${f.collect.length}/20)`} description="What the AI asks and saves from the call (the answers show on the call, in Call history and on the lead).">
          {f.collect.map((c, i) => (
            <div key={i} className="ac-field">
              <TextInput aria-label="Field name" value={c.field} onChange={(e) => setField(i, { field: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_') })} placeholder="field_name" />
              <SearchSelect value={c.type} onChange={(v) => setField(i, { type: v ?? 'text' })} options={FIELD_TYPES.map(([k, l]) => ({ value: k, label: l }))} searchPlaceholder="Search…" />
              <TextInput aria-label="How to ask" value={c.how_to_ask ?? ''} onChange={(e) => setField(i, { how_to_ask: e.target.value })} placeholder="How to ask" />
              <Checkbox id={`at-req-${i}`} checked={!!c.required} onChange={(v) => setField(i, { required: v })} label="Required" />
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove" onClick={() => setF((d) => ({ ...d, collect: d.collect.filter((_, j) => j !== i) }))}>
                <X size={15} />
              </button>
              {c.type === 'choice' && (
                <TextInput
                  aria-label="Options"
                  className="ac-field-opts"
                  value={Array.isArray(c.options) ? c.options.join(', ') : (c.options ?? '')}
                  onChange={(e) => setField(i, { options: e.target.value })}
                  placeholder="Options, comma separated"
                />
              )}
            </div>
          ))}
          {f.collect.length < 20 && (
            <div>
              <Button variant="outline" size="sm" onClick={() => setF((d) => ({ ...d, collect: [...d.collect, { field: '', type: 'text', required: false, how_to_ask: '' }] }))}>
                <Plus size={14} /> Add field
              </Button>
            </div>
          )}
        </FormSection>

        <FormSection title="Objections and ending">
          <div>
            <Label htmlFor="at-push">If they push back</Label>
            <TextArea id="at-push" rows={3} value={f.if_they_push_back} onChange={(e) => set('if_they_push_back', e.target.value)} />
          </div>
          <div className="form-grid">
            <div>
              <Label htmlFor="at-close">Closing</Label>
              <TextArea id="at-close" rows={3} value={f.closing} onChange={(e) => set('closing', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="at-give">If busy or not interested</Label>
              <TextArea id="at-give" rows={3} value={f.give_up} onChange={(e) => set('give_up', e.target.value)} />
            </div>
          </div>
        </FormSection>

        <FormSection title="Voice">
          <div className="form-grid">
            <div>
              <Label htmlFor="at-voice">Voice</Label>
              <SearchSelect id="at-voice" value={f.voice_id || null} onChange={(v) => set('voice_id', v ?? '')} options={[{ value: '', label: 'Default' }, ...voices.map((v) => ({ value: v.id, label: v.label }))]} placeholder="Default" searchPlaceholder="Search voices…" />
            </div>
            <div>
              <Label htmlFor="at-persona">Persona</Label>
              <SearchSelect id="at-persona" value={f.persona_id || null} onChange={(v) => set('persona_id', v ?? '')} options={[{ value: '', label: 'Default' }, ...personas.map((v) => ({ value: v.id, label: v.label }))]} placeholder="Default" searchPlaceholder="Search personas…" />
            </div>
          </div>
        </FormSection>
        <FormSection title="Opening and language">
          <div className="check-box">
            <Checkbox
              id="at-open"
              checked={f.fixed_opening}
              onChange={(v) => set('fixed_opening', v)}
              label="Fixed opening"
              description="Never “Hello”: starts with “Namaste {name} ji”, the company, that they had sent an enquiry, and “Kya aapke paas 2 minute hain?”; if they are busy it asks when to call back (saved as callback time). You don’t write the greeting yourself."
            />
          </div>
          <div className="check-box">
            <Checkbox
              id="at-lang"
              checked={f.lang_step}
              onChange={(v) => set('lang_step', v)}
              label="Ask Hindi or English first"
              description="After the opening it asks which language they prefer and goes on in it; the answers are saved in English."
            />
          </div>
          <Hint>Never put prices here that you don’t want quoted.</Hint>
        </FormSection>
      </div>
    </Drawer>
  )
}
