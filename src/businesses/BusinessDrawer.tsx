import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Archive, ImageUp, MapPin, Pencil, Plus, Trash2, User } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection, Hint, Label, TextArea, TextInput } from '@/components/Field'
import { cn } from '@/lib/cn'
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
  gst_number: '',
  legal_name: '',
  has_branches: false,
}
let tempKey = 0
const newBranch = (): BranchDraft => ({
  key: `new-${++tempKey}`,
  name: '',
  city: '',
  address: '',
  phone: '',
  email: '',
  manager_member_id: null,
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
            name: r.name,
            city: r.city ?? '',
            address: r.address ?? '',
            phone: r.phone ?? '',
            email: r.email ?? '',
            manager_member_id: r.manager_member_id,
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
    if (gst && !isValidGst(gst)) return setError('GST number should be 15 characters, like 24ABCDE1234F1Z5.')
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
      width={480}
      onClose={onClose}
      title={business ? 'Edit Business' : 'Add Business'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            {error && <p className="text-right text-sm text-red-600">{error}</p>}
            <Button type="submit" form="business-form" disabled={busy || !branchesLoaded} className="shrink-0">
              {busy ? 'Saving…' : business ? 'Save changes' : 'Create Business'}
            </Button>
          </div>
        </>
      }
    >
      <form id="business-form" onSubmit={submit} className="space-y-6">
        <FormSection title="Basic details">
          <div className="flex items-center gap-4">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50">
              {logoPreview ? (
                <img src={logoPreview} alt="" className="size-full object-contain" />
              ) : (
                <ImageUp className="size-5 text-gray-400" />
              )}
            </div>
            <div>
              <div className="flex gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) return
                    if (f.size > MAX_LOGO) return setError('Logo must be 2 MB or smaller.')
                    setLogo(f)
                  }}
                />
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                  <ImageUp /> {logoPreview ? 'Replace logo' : 'Upload logo'}
                </Button>
                {logoPreview && (
                  <Button type="button" variant="ghost" className="text-red-600" onClick={() => setLogo(null)}>
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
          <div className="grid grid-cols-2 gap-3">
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
          <div>
            <Label htmlFor="bz-address">Full address</Label>
            <TextArea
              id="bz-address"
              rows={2}
              placeholder="Optional"
              value={input.address ?? ''}
              onChange={set('address')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bz-city">City</Label>
              <TextInput id="bz-city" value={input.city ?? ''} onChange={set('city')} />
            </div>
            <div>
              <Label htmlFor="bz-state">State</Label>
              <TextInput id="bz-state" value={input.state ?? ''} onChange={set('state')} />
            </div>
          </div>
        </FormSection>

        <FormSection title="GST / legal details" description="Used on invoices and receipts later.">
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
            <Label htmlFor="bz-gst">GST number</Label>
            <TextInput
              id="bz-gst"
              placeholder="e.g. 24ABCDE1234F1Z5"
              value={input.gst_number ?? ''}
              onChange={set('gst_number')}
              className="uppercase placeholder:normal-case"
            />
            <Hint>15 characters, e.g. 24ABCDE1234F1Z5.</Hint>
          </div>
        </FormSection>

        <FormSection title="Branches" description="For businesses that run from more than one location.">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-gray-200 px-4 py-3">
            <div>
              <div className="text-[13px] font-semibold">Has multiple branches?</div>
              <div className="text-xs text-gray-500">
                When on, team members added to this business must be given a branch.
              </div>
            </div>
            <input
              type="checkbox"
              className="peer sr-only"
              checked={input.has_branches}
              onChange={(e) => setInput((d) => ({ ...d, has_branches: e.target.checked }))}
            />
            <span
              aria-hidden
              className={cn(
                'relative h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40',
                input.has_branches ? 'bg-brand' : 'bg-gray-300',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform',
                  input.has_branches && 'translate-x-5',
                )}
              />
            </span>
          </label>

          {input.has_branches && (
            <div>
              {branches.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                  {branchesLoaded ? 'No branches yet.' : 'Loading branches…'}
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {branches.map((b) => (
                    <li key={b.key} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold">{b.name}</div>
                        <div className="flex flex-wrap gap-x-3 text-xs text-gray-500">
                          {b.city && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3" /> {b.city}
                            </span>
                          )}
                          {managerName(b.manager_member_id) && (
                            <span className="inline-flex items-center gap-1">
                              <User className="size-3" /> {managerName(b.manager_member_id)}
                            </span>
                          )}
                          {!b.id && <span className="text-brand">New</span>}
                        </div>
                      </div>
                      {canEditBranches && (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setEditing(b)}
                            aria-label={`Edit ${b.name}`}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-red-600"
                            aria-label={`Remove ${b.name}`}
                            onClick={() => setBranches((list) => list.filter((x) => x.key !== b.key))}
                          >
                            {b.id ? <Archive /> : <Trash2 />}
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canEditBranches && (
                <Button type="button" variant="outline" className="mt-3" onClick={() => setEditing(newBranch())}>
                  <Plus /> Add branch
                </Button>
              )}
              {business && savedBranchIds.some((id) => !branches.find((b) => b.id === id)) && (
                <p className="mt-2 text-xs text-amber-700">
                  Removed branches are archived when you save. Their data is kept.
                </p>
              )}
            </div>
          )}
        </FormSection>
      </form>

      {editing && (
        <BranchModal
          branch={editing}
          managers={managers}
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
