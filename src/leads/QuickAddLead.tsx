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
import { SubBusinessSelect, subOf, useSubBusinesses } from '@/business/SubBusinessSelect'

/** Add lead: name, phone, city, source, purpose and sub-business. */
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
  const { selected, sub } = useBusiness()
  const me = membership?.id
  // the funnel picked on the Leads page (if any); otherwise the lead belongs to a business only
  const funnelId = defaultFunnelId ?? ''
  const [businessId, setBusinessId] = useState(selected?.id ?? businesses[0]?.id ?? '')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [source, setSource] = useState('')
  const [purpose, setPurpose] = useState('')
  const [city, setCity] = useState('')
  const [subId, setSubId] = useState(sub?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const funnel = funnels.find((f) => f.id === funnelId)
  const bizId = funnel?.business_id ?? businessId
  const subs = useSubBusinesses(bizId)

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
        city: city.trim(),
        source_id: source,
        referred_by: '',
        temperature: '',
        estimated_amount: '',
        owner_id: me ?? '',
        tags: '',
        notes: '',
        next_follow_up_at: '',
        purpose,
        required_on: '',
        required_hours: '',
        sub_business_id: subOf(subs, subId),
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
            <Label htmlFor="q-city">City</Label>
            <TextInput id="q-city" value={city} onChange={(e) => setCity(e.target.value)} />
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
          <SubBusinessSelect id="q-sub" businessId={bizId} value={subId} onChange={setSubId} />
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
        {funnel && <Hint>The lead is added to {funnel.name}.</Hint>}
      </div>
    </Modal>
  )
}
