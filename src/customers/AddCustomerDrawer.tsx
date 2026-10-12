import { useState, type FormEvent } from 'react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection, Label, Select, TextArea, TextInput } from '@/components/Field'
import { useTenant } from '@/tenant/useTenant'
import { addCustomer, customerByPhone } from './api'
import type { SalesData } from './useSalesData'

/** A customer without a sale yet (e.g. moved over from another system). */
export function AddCustomerDrawer({
  data,
  defaultBusinessId,
  onClose,
  onSaved,
}: {
  data: SalesData
  defaultBusinessId: string | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const { businesses, membership } = useAuth()
  const firstStage = data.stages.find((s) => s.is_active)?.id ?? ''
  const [f, setF] = useState({
    business_id: defaultBusinessId ?? (businesses.length === 1 ? businesses[0].id : ''),
    full_name: '',
    phone: '',
    email: '',
    city: '',
    stage_id: firstStage,
    owner_id: membership?.id ?? '',
    notes: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((d) => ({ ...d, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.business_id) return setError('Pick the business.')
    if (!f.full_name.trim()) return setError('Enter the customer’s name.')
    setBusy(true)
    setError(null)
    try {
      if (f.phone.trim()) {
        const dup = await customerByPhone(tenant.id, f.business_id, f.phone)
        if (dup) {
          setBusy(false)
          return setError(`${dup.full_name} already has this phone number in this business.`)
        }
      }
      await addCustomer(tenant.id, {
        business_id: f.business_id,
        full_name: f.full_name.trim(),
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        city: f.city.trim() || null,
        stage_id: f.stage_id || null,
        owner_id: f.owner_id || null,
        notes: f.notes.trim() || null,
        created_by: membership?.id ?? null,
      })
      onSaved(`${f.full_name.trim()} added.`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      width={600}
      onClose={onClose}
      title="New customer"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button type="submit" form="add-cust-form" disabled={busy}>
              {busy ? 'Saving…' : 'Add customer'}
            </Button>
          </div>
        </>
      }
    >
      <form id="add-cust-form" onSubmit={submit} className="stack">
        <FormSection title="Customer" description="To record what they bought, use New sale instead; it creates the customer too.">
          <div className="form-grid">
            {businesses.length > 1 && (
              <div className="span-2">
                <Label htmlFor="ac-biz" required>
                  Business
                </Label>
                <Select id="ac-biz" value={f.business_id} onChange={(e) => set('business_id', e.target.value)}>
                  <option value="">— select —</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="ac-name" required>
                Full name
              </Label>
              <TextInput id="ac-name" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} autoFocus />
            </div>
            <div>
              <Label htmlFor="ac-phone">Phone</Label>
              <TextInput id="ac-phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ac-email">Email</Label>
              <TextInput id="ac-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ac-city">City</Label>
              <TextInput id="ac-city" value={f.city} onChange={(e) => set('city', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ac-stage">Journey stage</Label>
              <Select id="ac-stage" value={f.stage_id} onChange={(e) => set('stage_id', e.target.value)}>
                {data.stages
                  .filter((s) => s.is_active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ac-owner">Owner</Label>
              <Select id="ac-owner" value={f.owner_id} onChange={(e) => set('owner_id', e.target.value)}>
                <option value="">Unassigned</option>
                {data.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="span-2">
              <Label htmlFor="ac-notes">Notes</Label>
              <TextArea id="ac-notes" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>
        </FormSection>
      </form>
    </Drawer>
  )
}
