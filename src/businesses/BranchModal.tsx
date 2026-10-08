import { useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { Label, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { isValidEmail, type BranchDraft, type ManagerOption } from './types'

/** Add / edit one branch. Changes are kept in the business form until it's saved. */
export function BranchModal({
  branch,
  managers,
  onSave,
  onClose,
}: {
  branch: BranchDraft
  managers: ManagerOption[]
  onSave: (b: BranchDraft) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(branch)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof BranchDraft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }))

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft.name.trim()) return setError('Branch name is required.')
    if (draft.email.trim() && !isValidEmail(draft.email.trim())) return setError('Enter a valid email.')
    onSave(draft)
  }

  return (
    <Modal open onClose={onClose}>
      <h2 className="text-lg font-bold">{branch.name ? 'Edit branch' : 'Add branch'}</h2>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          <Label htmlFor="br-name" required>
            Branch name
          </Label>
          <TextInput
            id="br-name"
            placeholder="e.g. Mumbai Studio"
            value={draft.name}
            onChange={set('name')}
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="br-city">City</Label>
          <TextInput id="br-city" placeholder="e.g. Mumbai" value={draft.city} onChange={set('city')} />
        </div>
        <div>
          <Label htmlFor="br-address">Full address</Label>
          <textarea
            id="br-address"
            rows={2}
            value={draft.address}
            onChange={set('address')}
            className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="br-phone">Phone</Label>
            <TextInput id="br-phone" type="tel" value={draft.phone} onChange={set('phone')} />
          </div>
          <div>
            <Label htmlFor="br-email">Email</Label>
            <TextInput id="br-email" type="email" value={draft.email} onChange={set('email')} />
          </div>
        </div>
        <div>
          <Label htmlFor="br-manager">Branch manager</Label>
          <select
            id="br-manager"
            value={draft.manager_member_id ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, manager_member_id: e.target.value || null }))}
            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          >
            <option value="">{managers.length ? 'Not assigned' : 'No team members yet'}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {!managers.length && (
            <p className="mt-1 text-xs text-gray-500">You can assign a manager once team members are added.</p>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Done</Button>
        </div>
      </form>
    </Modal>
  )
}
