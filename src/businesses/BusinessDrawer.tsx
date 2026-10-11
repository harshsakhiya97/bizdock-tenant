import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Archive, ImageUp, MapPin, Pencil, Plus, Trash2, User } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { AddressFields } from '@/components/AddressFields'
import { Checkbox, FormSection, Hint, Label, TextInput } from '@/components/Field'
import { useTenant } from '@/tenant/useTenant'
import { listBranches, listManagerOptions, saveBusiness } from './api'
import { BranchModal } from './BranchModal'
import {
  isValidEmail,
  isValidGst,
  type BranchDraft,
  type BusinessInput,
  type BusinessRow,
  type ManagerOption,
} from './types'

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
  has_branches: false,
}
let tempKey = 0
const newBranch = (): BranchDraft => ({
  key: `new-${++tempKey}`,
  code: '',
  name: '',
  short_name: '',
  city: '',
  state: '',
  address: '',
  phone: '',
  email: '',
  manager_member_id: null,
  own_gst: false,
  legal_name: '',
  gst_number: '',
})

/** Create or edit a business, including its branches. Nothing is saved until "Save". */
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
  const { can } = useAuth()
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
          has_branches: business.has_branches,
        }
      : emptyInput,
  )
  const [branches, setBranches] = useState<BranchDraft[]>([])
  const [savedBranchIds, setSavedBranchIds] = useState<string[]>([])
  const [branchesLoaded, setBranchesLoaded] = useState(!business)
  const [managers, setManagers] = useState<ManagerOption[]>([])
  const [editing, setEditing] = useState<BranchDraft | null>(null)
  const [logo, setLogo] = useState<File | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void listManagerOptions(tenant.id).then(setManagers)
    if (!business) return
    listBranches(business.id)
      .then((rows) => {
        setBranches(
          rows.map((r) => ({
            key: r.id,
            id: r.id,
            code: r.code,
            name: r.name,
            short_name: r.short_name,
            city: r.city ?? '',
            state: r.state ?? '',
            address: r.address ?? '',
            phone: r.phone ?? '',
            email: r.email ?? '',
            manager_member_id: r.manager_member_id,
            own_gst: r.own_gst,
            legal_name: r.legal_name ?? '',
            gst_number: r.gst_number ?? '',
          })),
        )
        setSavedBranchIds(rows.map((r) => r.id))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBranchesLoaded(true))
  }, [business, tenant.id])

  const logoPreview = useMemo(() => {
    if (logo) return URL.createObjectURL(logo)
    if (logo === null) return null
    return business?.logo_url ?? null
  }, [logo, business])
  useEffect(() => () => void (logo && logoPreview && URL.revokeObjectURL(logoPreview)), [logo, logoPreview])

  const set = (k: keyof BusinessInput) => (e: { target: { value: string } }) =>
    setInput((d) => ({ ...d, [k]: e.target.value }))
  const managerName = (id: string | null) => managers.find((m) => m.id === id)?.name

  async function submit(e: FormEvent) {
    e.preventDefault()
    const email = (input.email ?? '').trim()
    const gst = (input.gst_number ?? '').trim().toUpperCase()
    if (!input.name.trim()) return setError('Business name is required.')
    if (email && !isValidEmail(email)) return setError('Enter a valid business email.')
    if (input.has_gst && !gst) return setError('Enter the GST number, or untick "Registered for GST?".')
    if (input.has_gst && !isValidGst(gst)) return setError('GST number should be 15 characters, like 24ABCDE1234F1Z5.')
    if (input.has_branches && branches.length === 0)
      return setError('Add at least one branch, or turn off "Has multiple branches?".')
    if (!input.has_branches && business?.has_branches && savedBranchIds.length > 0)
      return setError('This business still has branches. Remove them first, then turn off "Has multiple branches?".')

    setBusy(true)
    setError(null)
    try {
      await saveBusiness({ tenantId: tenant.id, existing: business, input, branches, savedBranchIds, logo })
      onSaved()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const canEditBranches = business ? can('businesses', 'edit') : can('businesses', 'add')

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
            <Button type="submit" form="business-form" disabled={busy || !branchesLoaded}>
              {busy ? 'Saving…' : business ? 'Save changes' : 'Create Business'}
            </Button>
          </div>
        </>
      }
    >
      <form id="business-form" onSubmit={submit} className="stack" style={{ gap: 24 }}>
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

        <FormSection title="Branches" description="For businesses that run from more than one location.">
          <div className="check-box">
            <Checkbox
              id="bz-has-branches"
              checked={input.has_branches}
              onChange={(v) => setInput((d) => ({ ...d, has_branches: v }))}
              label="Has multiple branches?"
              description="When on, team members added to this business must be given a branch."
            />
          </div>

          {input.has_branches && (
            <>
              {branches.length === 0 ? (
                <div className="empty-box">{branchesLoaded ? 'No branches yet.' : 'Loading branches…'}</div>
              ) : (
                <div className="link-rows">
                  {branches.map((b) => (
                    <div key={b.key}>
                      <div className="lr-main">
                        <div className="lr-title">
                          <span className="code-chip">{b.code}</span>
                          <span className="cell-clip">{b.name}</span>
                          <span className="muted small nowrap">({b.short_name})</span>
                          {!b.id && <span className="badge badge-brand">New</span>}
                        </div>
                        <div className="lr-meta">
                          {b.city && (
                            <span>
                              <MapPin size={12} /> {b.city}
                            </span>
                          )}
                          {managerName(b.manager_member_id) && (
                            <span>
                              <User size={12} /> {managerName(b.manager_member_id)}
                            </span>
                          )}
                          {b.own_gst && <span>Own GST</span>}
                        </div>
                      </div>
                      {canEditBranches && (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            title="Edit"
                            aria-label={`Edit ${b.name}`}
                            onClick={() => setEditing(b)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon danger-text"
                            title={b.id ? 'Archive' : 'Remove'}
                            aria-label={`Remove ${b.name}`}
                            onClick={() => setBranches((list) => list.filter((x) => x.key !== b.key))}
                          >
                            {b.id ? <Archive size={15} /> : <Trash2 size={15} />}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {canEditBranches && (
                <div className="add-chips">
                  <button type="button" className="add-chip" onClick={() => setEditing(newBranch())}>
                    <Plus size={14} /> Add branch
                  </button>
                </div>
              )}
              {business && savedBranchIds.some((id) => !branches.find((b) => b.id === id)) && (
                <div className="alert alert-warning">Removed branches are archived when you save. Their data is kept.</div>
              )}
            </>
          )}
        </FormSection>
      </form>

      {editing && (
        <BranchModal
          branch={editing}
          managers={managers}
          businessHasGst={input.has_gst}
          otherCodes={branches.filter((x) => x.key !== editing.key).map((x) => x.code)}
          onClose={() => setEditing(null)}
          onSave={(b) => {
            setBranches((list) =>
              list.some((x) => x.key === b.key) ? list.map((x) => (x.key === b.key ? b : x)) : [...list, b],
            )
            setEditing(null)
          }}
        />
      )}
    </Drawer>
  )
}
