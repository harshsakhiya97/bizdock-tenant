import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ImageUp, Plus, Trash2, X } from 'lucide-react'
import { SUB_BUSINESS_TYPES } from '@/auth/auth-context'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { AddressFields } from '@/components/AddressFields'
import { Checkbox, FormSection, Hint, Label, Select, TextInput } from '@/components/Field'
import { useTenant } from '@/tenant/useTenant'
import { listSubBusinesses, saveBusiness, saveSubBusinesses, type SubBusinessDraft } from './api'
import { isValidEmail, isValidGst, type BusinessInput, type BusinessRow } from './types'

const MAX_LOGO = 2 * 1024 * 1024
const emptyInput: BusinessInput = {
  name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  has_gst: false,
  gst_number: '',
  legal_name: '',
}
/** Create or edit a business, Nothing is saved until "Save". */
export function BusinessDrawer({
  business,
  onClose,
  onSaved,
}: {
  /** null = create a new business */
  business: BusinessRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const tenant = useTenant()
  const [input, setInput] = useState<BusinessInput>(() =>
    business
      ? {
          name: business.name,
          phone: business.phone ?? '',
          email: business.email ?? '',
          address: business.address ?? '',
          city: business.city ?? '',
          state: business.state ?? '',
          has_gst: business.has_gst,
          gst_number: business.gst_number ?? '',
          legal_name: business.legal_name ?? '',
        }
      : emptyInput,
  )
  const [logo, setLogo] = useState<File | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [subs, setSubs] = useState<SubBusinessDraft[]>([])
  const [removedSubs, setRemovedSubs] = useState<string[]>([])
  useEffect(() => {
    if (business) void listSubBusinesses(business.id).then(setSubs, () => setSubs([]))
  }, [business])
  const setSub = (i: number, patch: Partial<SubBusinessDraft>) => setSubs((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  const logoPreview = useMemo(() => {
    if (logo) return URL.createObjectURL(logo)
    if (logo === null) return null
    return business?.logo_url ?? null
  }, [logo, business])
  useEffect(() => () => void (logo && logoPreview && URL.revokeObjectURL(logoPreview)), [logo, logoPreview])

  const set = (k: keyof BusinessInput) => (e: { target: { value: string } }) =>
    setInput((d) => ({ ...d, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const email = (input.email ?? '').trim()
    const gst = (input.gst_number ?? '').trim().toUpperCase()
    if (!input.name.trim()) return setError('Business name is required.')
    if (email && !isValidEmail(email)) return setError('Enter a valid business email.')
    if (input.has_gst && !gst) return setError('Enter the GST number, or untick "Registered for GST?".')
    if (input.has_gst && !isValidGst(gst)) return setError('GST number should be 15 characters, like 24ABCDE1234F1Z5.')
    if (subs.some((s) => !s.name.trim())) return setError('Give every sub-business a name, or remove it.')
    setBusy(true)
    setError(null)
    try {
      const saved = await saveBusiness({ tenantId: tenant.id, existing: business, input, logo })
      await saveSubBusinesses(tenant.id, saved.id, subs, removedSubs)
      onSaved()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      width={640}
      onClose={onClose}
      title={business ? 'Edit Business' : 'Add Business'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button type="submit" form="business-form" disabled={busy}>
              {busy ? 'Saving…' : business ? 'Save changes' : 'Create Business'}
            </Button>
          </div>
        </>
      }
    >
      <form id="business-form" onSubmit={submit} className="stack">
        <FormSection title="Basic details">
          <div className="upload">
            <div className="upload-box">{logoPreview ? <img src={logoPreview} alt="" /> : <ImageUp size={20} />}</div>
            <div>
              <div className="row" style={{ gap: 8 }}>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) return
                    if (f.size > MAX_LOGO) return setError('Logo must be 2 MB or smaller.')
                    setLogo(f)
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                  <ImageUp /> {logoPreview ? 'Replace logo' : 'Upload logo'}
                </Button>
                {logoPreview && (
                  <Button variant="ghost" size="sm" className="danger-text" onClick={() => setLogo(null)}>
                    <Trash2 /> Remove
                  </Button>
                )}
              </div>
              <Hint>PNG, JPG, WEBP or SVG, up to 2 MB.</Hint>
            </div>
          </div>
          <div>
            <Label htmlFor="bz-name" required>
              Business name
            </Label>
            <TextInput id="bz-name" placeholder="e.g. Studio Rental" value={input.name} onChange={set('name')} />
            <Hint>Shown in the business switcher and on every record of this business.</Hint>
          </div>
        </FormSection>

        <FormSection title="Sub-businesses" description="Optional. Split this business into sub-businesses; leads, sales and bookings can then be tagged with one.">
          {subs.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              {subs.map((s, i) => (
                <div key={s.id ?? `new-${i}`} className="sub-biz-row">
                  <TextInput aria-label="Sub-business name" placeholder="e.g. Podcast Studio Rental" value={s.name} onChange={(e) => setSub(i, { name: e.target.value })} />
                  <Select aria-label="Type" value={s.type} onChange={(e) => setSub(i, { type: e.target.value as SubBusinessDraft['type'] })}>
                    {SUB_BUSINESS_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label="Remove"
                    onClick={() => {
                      if (s.id) setRemovedSubs((r) => [...r, s.id!])
                      setSubs((l) => l.filter((_, j) => j !== i))
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div>
            <Button variant="outline" size="sm" onClick={() => setSubs((l) => [...l, { name: '', type: 'editing' }])}>
              <Plus /> Add sub-business
            </Button>
          </div>
          {removedSubs.length > 0 && <Hint>Leads, sales and bookings of a removed sub-business stay in this business.</Hint>}
        </FormSection>

        <FormSection title="Contact" description="How customers and your team reach this business.">
          <div className="form-grid">
            <div>
              <Label htmlFor="bz-phone">Phone</Label>
              <TextInput id="bz-phone" type="tel" value={input.phone ?? ''} onChange={set('phone')} />
            </div>
            <div>
              <Label htmlFor="bz-email">Email</Label>
              <TextInput id="bz-email" type="email" value={input.email ?? ''} onChange={set('email')} />
            </div>
          </div>
        </FormSection>

        <FormSection title="Address">
          <div className="form-grid">
            <AddressFields
              idPrefix="bz"
              value={{ address: input.address ?? '', state: input.state ?? '', city: input.city ?? '' }}
              onChange={(a) => setInput((d) => ({ ...d, ...a }))}
            />
          </div>
        </FormSection>

        <FormSection title="GST / legal details" description="Optional. Used on invoices and receipts later.">
          <div className="check-box">
            <Checkbox
              id="bz-has-gst"
              checked={input.has_gst}
              onChange={(v) => setInput((d) => ({ ...d, has_gst: v }))}
              label="Registered for GST?"
              description="Tick to add the GST number and legal name."
            />
            {input.has_gst && (
              <div className="form-grid">
                <div>
                  <Label htmlFor="bz-legal">Legal name</Label>
                  <TextInput
                    id="bz-legal"
                    placeholder="Registered company name"
                    value={input.legal_name ?? ''}
                    onChange={set('legal_name')}
                  />
                </div>
                <div>
                  <Label htmlFor="bz-gst" required>
                    GST number
                  </Label>
                  <TextInput
                    id="bz-gst"
                    placeholder="e.g. 24ABCDE1234F1Z5"
                    value={input.gst_number ?? ''}
                    onChange={set('gst_number')}
                    className="input-upper"
                  />
                  <Hint>15 characters, e.g. 24ABCDE1234F1Z5.</Hint>
                </div>
              </div>
            )}
          </div>
        </FormSection>
      </form>

    </Drawer>
  )
}
