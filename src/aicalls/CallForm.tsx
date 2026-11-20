import { useEffect, useMemo, useState } from 'react'
import { PhoneOutgoing } from 'lucide-react'
import { Button } from '@/components/Button'
import { Hint, Label, Select, TextInput } from '@/components/Field'
import { PhoneInput, phoneValid } from '@/components/PhoneInput'
import { SearchSelect } from '@/components/SearchSelect'
import { useTenant } from '@/tenant/useTenant'
import { hx, type AiCall, type TemplateRow } from './api'

type LeadOpt = { id: string; name: string; phone: string }

/**
 * Call from AI: a lead (or a typed number) and a template → Call now. With `lead` the lead is fixed (lead page).
 * Templates come from HelloRix; the default one (System Connections → AI Calling) is picked first.
 */
export function CallForm({ lead, leads, onPlaced }: { lead?: LeadOpt | null; leads?: LeadOpt[]; onPlaced: (c: AiCall) => void }) {
  const tenant = useTenant()
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null)
  const [tplMsg, setTplMsg] = useState('Loading templates…')
  const [objective, setObjective] = useState('')
  const [mode, setMode] = useState<'lead' | 'number'>('lead')
  const [leadId, setLeadId] = useState(lead?.id ?? '')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    hx<{ templates: TemplateRow[]; default: string | null }>(tenant.id, { action: 'templates' }).then(
      (d) => {
        setTemplates(d.templates)
        setObjective((o) => o || (d.default && d.templates.some((t) => t.id === d.default) ? d.default : (d.templates[0]?.id ?? '')))
        if (!d.templates.length) setTplMsg('No templates yet: make one in AI Calling → Templates.')
      },
      (e: Error) => {
        setTemplates([])
        setTplMsg(e.message)
      },
    )
  }, [tenant.id])

  const leadOptions = useMemo(() => (leads ?? []).filter((l) => l.phone).map((l) => ({ value: l.id, label: `${l.name} · ${l.phone}` })), [leads])
  const picked = lead ?? (leads ?? []).find((l) => l.id === leadId) ?? null

  async function call() {
    setError(null)
    if (!objective) return setError('Pick the template.')
    let to = ''
    if (mode === 'lead' || lead) {
      if (!picked) return setError('Pick the lead.')
      if (!picked.phone) return setError('This lead has no phone number.')
      to = picked.phone
    } else {
      if (!phoneValid(phone)) return setError('Enter a valid 10-digit mobile number.')
      to = phone
    }
    setBusy(true)
    try {
      const d = await hx<{ call: AiCall }>(tenant.id, {
        action: 'call',
        objective_id: objective,
        to,
        ...(picked && (mode === 'lead' || lead) ? { lead_id: picked.id, name: picked.name } : { name: name.trim() || null }),
      })
      onPlaced(d.call)
      setBusy(false)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      {!lead && (
        <div>
          <Label>Call</Label>
          <div className="seg" role="radiogroup" aria-label="Call">
            <button type="button" role="radio" aria-checked={mode === 'lead'} className={mode === 'lead' ? 'is-active' : ''} onClick={() => setMode('lead')}>
              A lead
            </button>
            <button type="button" role="radio" aria-checked={mode === 'number'} className={mode === 'number' ? 'is-active' : ''} onClick={() => setMode('number')}>
              A number
            </button>
          </div>
        </div>
      )}
      {lead ? (
        <div className="muted small">
          Calls <b>{lead.name}</b> on {lead.phone || 'no phone number'}. The result updates the lead’s category and adds a note.
        </div>
      ) : mode === 'lead' ? (
        <div>
          <Label htmlFor="ac-lead" required>
            Lead
          </Label>
          <SearchSelect id="ac-lead" value={leadId || null} onChange={(v) => setLeadId(v ?? '')} options={leadOptions} placeholder="Search a lead…" searchPlaceholder="Name or phone…" />
          <Hint>The result updates the lead’s category (Interested → Hot, Call back → Warm, Not interested → Cold) and adds a note.</Hint>
        </div>
      ) : (
        <div className="form-grid">
          <div>
            <Label htmlFor="ac-phone" required>
              Mobile number
            </Label>
            <PhoneInput id="ac-phone" value={phone} onChange={setPhone} />
          </div>
          <div>
            <Label htmlFor="ac-name">Name</Label>
            <TextInput id="ac-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="What the AI calls them" />
          </div>
        </div>
      )}
      <div>
        <Label htmlFor="ac-tpl" required>
          Template
        </Label>
        <Select id="ac-tpl" value={objective} onChange={(e) => setObjective(e.target.value)} disabled={!templates?.length}>
          {!templates?.length && <option value="">{tplMsg}</option>}
          {(templates ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div>
        <Button onClick={() => void call()} disabled={busy || !templates?.length}>
          <PhoneOutgoing size={15} /> {busy ? 'Calling…' : 'Call now'}
        </Button>
      </div>
    </div>
  )
}
