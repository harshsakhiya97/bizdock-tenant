import { useState } from 'react'
import { Button } from '@/components/Button'
import { Hint, Label, Select, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import type { FunnelRow } from '@/funnels/types'
import { useTenant } from '@/tenant/useTenant'
import { createLead, phoneExists } from './api'
import type { LeadInput, Option } from './types'

/** Add lead: just name, phone, source, purpose and required on. Everything else is on the lead's page. */
export function QuickAddLead({
  funnels,
  defaultFunnelId,
  sources,
  onClose,
  onAdded,
}: {
  funnels: FunnelRow[]
  defaultFunnelId: string | null
  sources: Option[]
  onClose: () => void
  onAdded: (leadId: string, name: string) => void
}) {
  const tenant = useTenant()
  const { membership, businesses } = useAuth()
  const { selected } = useBusiness()
  const me = membership?.id
  // '' = no funnel: the lead belongs to a business only
  const [funnelId, setFunnelId] = useState(defaultFunnelId ?? funnels[0]?.id ?? '')
  const [businessId, setBusinessId] = useState(selected?.id ?? businesses[0]?.id ?? '')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [source, setSource] = useState('')
  const [purpose, setPurpose] = useState('')
  const [reqOn, setReqOn] = useState('')
  const [hours, setHours] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const funnel = funnels.find((f) => f.id === funnelId)
  const bizId = funnel?.business_id ?? businessId

  async function save() {
    if (!bizId) return setError('Pick the business.')
    if (!name.trim()) return setError('Name is required.')
    if (phone.replace(/\D/g, '').length < 10) return setError('Enter a valid phone number (10 digits).')
    setBusy(true)
    setError(null)
    try {
      if (await phoneExists(bizId, phone)) {
        setBusy(false)
        return setError('A lead with this phone number already exists in this business.')
      }
      const first = name.trim().split(/\s+/)[0]
      const input: LeadInput = {
        funnel_id: funnel?.id ?? '',
        stage_id: funnel?.funnel_stages[0]?.id ?? '',
        first_name: first,
        last_name: name.trim().slice(first.length).trim(),
        phone,
        whatsapp: '',
        email: '',
        city: '',
        source_id: source,
        referred_by: '',
        temperature: '',
        estimated_amount: '',
        owner_id: me ?? '',
        tags: '',
        notes: '',
        next_follow_up_at: '',
        purpose,
        required_on: reqOn,
        required_hours: hours,
      }
      const id = await createLead(tenant.id, bizId, me, input)
      onAdded(id, name.trim())
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title="Add lead"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={save} disabled={busy}>
              {busy ? 'Adding…' : 'Add lead'}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid">
          <div>
            <Label htmlFor="q-name" required>
              Name
            </Label>
            <TextInput id="q-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label htmlFor="q-phone" required>
              Phone
            </Label>
            <TextInput id="q-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="q-source">Source</Label>
            <Select id="q-source" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">— select —</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="q-purpose">Purpose</Label>
            <TextInput id="q-purpose" placeholder="e.g. Podcast, Product shoot" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          <div className="span-2">
            <Label htmlFor="q-req">Required on</Label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <TextInput id="q-req" type="date" value={reqOn} onChange={(e) => setReqOn(e.target.value)} />
              <TextInput aria-label="Hours" type="number" min={0} step={0.5} placeholder="Hours" style={{ width: 110 }} value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
          </div>
          <div className={funnel || businesses.length < 2 ? 'span-2' : undefined}>
            <Label htmlFor="q-funnel">Funnel</Label>
            <Select id="q-funnel" value={funnelId} onChange={(e) => setFunnelId(e.target.value)}>
              <option value="">No funnel</option>
              {funnels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
              ))}
            </Select>
          </div>
          {!funnel && businesses.length > 1 && (
            <div>
              <Label htmlFor="q-biz" required>
                Business
              </Label>
              <Select id="q-biz" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
        <Hint>
          {funnel
            ? `The lead starts in ${funnel.name} → ${funnel.funnel_stages[0]?.name ?? 'first stage'}, owned by you.`
            : 'The lead is saved without a funnel, owned by you; you can put it in a funnel later.'}{' '}
          Add the rest on its page.
        </Hint>
      </div>
    </Modal>
  )
}
