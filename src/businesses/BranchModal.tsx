import { useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { AddressFields } from '@/components/AddressFields'
import { Checkbox, Hint, Label, TextInput } from '@/components/Field'
import { SearchSelect } from '@/components/SearchSelect'
import { Modal } from '@/components/Modal'
import { isValidBranchCode, isValidEmail, isValidGst, type BranchDraft, type ManagerOption } from './types'

/** Add / edit one branch. Changes are kept in the business form until it's saved. */
export function BranchModal({
  branch,
  managers,
  businessHasGst,
  otherCodes,
  onSave,
  onClose,
}: {
  branch: BranchDraft
  managers: ManagerOption[]
  /** whether the business itself is registered for GST */
  businessHasGst: boolean
  /** codes of the other branches in this form, to catch duplicates before saving */
  otherCodes: string[]
  onSave: (b: BranchDraft) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(branch)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof BranchDraft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }))

  function submit(e: FormEvent) {
    e.preventDefault()
    const code = draft.code.trim().toUpperCase()
    if (!code) return setError('Branch code is required.')
    if (!isValidBranchCode(code)) return setError('Branch code: 2–12 capital letters, numbers or dashes (e.g. MUM-01).')
    if (otherCodes.includes(code)) return setError('Another branch already uses this code.')
    if (!draft.name.trim()) return setError('Branch name is required.')
    if (!draft.short_name.trim()) return setError('Short name is required.')
    if (draft.email.trim() && !isValidEmail(draft.email.trim())) return setError('Enter a valid email.')
    if (draft.own_gst) {
      const gst = draft.gst_number.trim().toUpperCase()
      if (!gst) return setError('Enter the branch GST number.')
      if (!isValidGst(gst)) return setError('GST number should be 15 characters, like 24ABCDE1234F1Z5.')
    }
    onSave({ ...draft, code })
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={640}
      title={branch.name ? 'Edit branch' : 'Add branch'}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            {error && <p className="text-right text-sm text-red-600">{error}</p>}
            <Button type="submit" form="branch-form" className="shrink-0">
              {branch.name ? 'Save branch' : 'Add branch'}
            </Button>
          </div>
        </>
      }
    >
      <form id="branch-form" onSubmit={submit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <div>
            <Label htmlFor="br-code" required>
              Branch code
            </Label>
            <TextInput
              id="br-code"
              placeholder="MUM-01"
              maxLength={12}
              value={draft.code}
              onChange={(e) =>
                setDraft((d) => ({ ...d, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') }))
              }
              className="font-mono"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="br-short" required>
              Short name
            </Label>
            <TextInput
              id="br-short"
              placeholder="e.g. Mumbai"
              maxLength={20}
              value={draft.short_name}
              onChange={set('short_name')}
            />
          </div>
        </div>
        <Hint>The code is unique across all your branches. The short name is used where space is tight.</Hint>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <div>
            <Label htmlFor="br-name" required>
              Branch name
            </Label>
            <TextInput id="br-name" placeholder="e.g. Mumbai Studio" value={draft.name} onChange={set('name')} />
          </div>
          <div>
            <Label htmlFor="br-manager">Branch manager</Label>
            <SearchSelect
              id="br-manager"
              value={draft.manager_member_id}
              onChange={(v) => setDraft((d) => ({ ...d, manager_member_id: v }))}
              options={managers.map((m) => ({ value: m.id, label: m.name }))}
              placeholder={managers.length ? 'Not assigned' : 'No team members yet'}
              searchPlaceholder="Search team members"
              disabled={!managers.length}
            />
            {!managers.length && <Hint>You can assign a manager once team members are added.</Hint>}
          </div>
        </div>
        <AddressFields
          idPrefix="br"
          value={{ address: draft.address, state: draft.state, city: draft.city }}
          onChange={(a) => setDraft((d) => ({ ...d, ...a }))}
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <div>
            <Label htmlFor="br-phone">Phone</Label>
            <TextInput id="br-phone" type="tel" value={draft.phone} onChange={set('phone')} />
          </div>
          <div>
            <Label htmlFor="br-email">Email</Label>
            <TextInput id="br-email" type="email" value={draft.email} onChange={set('email')} />
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-gray-200 p-3.5">
          {businessHasGst ? (
            <Checkbox
              id="br-same-gst"
              checked={!draft.own_gst}
              onChange={(v) => setDraft((d) => ({ ...d, own_gst: !v }))}
              label="Use same GST as business"
              description="Untick if this branch has a separate GST registration."
            />
          ) : (
            <Checkbox
              id="br-own-gst"
              checked={draft.own_gst}
              onChange={(v) => setDraft((d) => ({ ...d, own_gst: v }))}
              label="Branch registered for GST?"
              description="The business has no GST. Tick if this branch has its own."
            />
          )}
          {draft.own_gst && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              <div>
                <Label htmlFor="br-legal">Legal name</Label>
                <TextInput
                  id="br-legal"
                  placeholder="Registered name for this branch"
                  value={draft.legal_name}
                  onChange={set('legal_name')}
                />
              </div>
              <div>
                <Label htmlFor="br-gst" required>
                  GST number
                </Label>
                <TextInput
                  id="br-gst"
                  placeholder="e.g. 24ABCDE1234F1Z5"
                  value={draft.gst_number}
                  onChange={set('gst_number')}
                  className="uppercase placeholder:normal-case"
                />
              </div>
            </div>
          )}
        </div>
      </form>
    </Modal>
  )
}
