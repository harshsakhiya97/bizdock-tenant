import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ImageUp, Trash2 } from 'lucide-react'
import { BT, typeCode } from '@/auth/auth-context'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { AddressFields } from '@/components/AddressFields'
import { FormSection, Hint, Label, Select, TextInput } from '@/components/Field'
import { useTenant } from '@/tenant/useTenant'
import { saveBusiness } from './api'
import { CompanyPick } from './CompanyPick'
import { listBillingCompanies } from '@/masters/api'
import type { BillingCompanyRow } from '@/masters/types'
import { isValidEmail, type BusinessInput, type BusinessRow } from './types'

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
  has_sub_businesses: false,
  type: BT.DEFAULT,
  company_id: null,
  nongst_company_id: null,
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
  const { businessTypes } = useAuth()
  // the active types, plus the one already set (even if it's switched off since)
  const typeOptions = (current: string | null | undefined) => businessTypes.filter((t) => t.is_active || t.code === current)
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
          has_sub_businesses: business.has_sub_businesses,
          type: typeCode(business.type) ?? BT.DEFAULT,
          company_id: business.company_id ?? null,
          nongst_company_id: business.nongst_company_id ?? null,
        }
      : emptyInput,
  )
  const [logo, setLogo] = useState<File | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [companies, setCompanies] = useState<BillingCompanyRow[]>([])
  useEffect(() => {
    void listBillingCompanies(tenant.id).then(setCompanies, () => setCompanies([]))
  }, [tenant.id])

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
    if (!input.name.trim()) return setError('Business name is required.')
    if (email && !isValidEmail(email)) return setError('Enter a valid business email.')
    setBusy(true)
    setError(null)
    try {
      await saveBusiness({ tenantId: tenant.id, existing: business, input: { ...input, has_sub_businesses: false }, logo })
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

        <FormSection title="Business type" description="What this business does; the app works according to it.">
            <div>
              <Label htmlFor="bz-type" required>
                Type
              </Label>
              <Select id="bz-type" value={input.type ?? ''} onChange={(e) => setInput((d) => ({ ...d, type: e.target.value }))}>
                {typeOptions(input.type).map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
        </FormSection>

        <FormSection title="Invoices" description="The company invoices are issued from (Masters → Company Master); invoice numbers come from the company.">
          {companies.length ? (
            <CompanyPick
              id="bz"
              companies={companies}
              company={input.company_id ?? ''}
              nongst={input.nongst_company_id ?? ''}
              onChange={(v) => setInput((d) => ({ ...d, company_id: v.company || null, nongst_company_id: v.nongst || null }))}
            />
          ) : (
            <Hint>No companies yet: add them in Masters → Company Master.</Hint>
          )}
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

      </form>

    </Drawer>
  )
}
