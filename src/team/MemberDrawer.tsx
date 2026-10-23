import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Hint, Label, Select, TextInput } from '@/components/Field'
import { useAuth } from '@/auth/useAuth'
import { useTenant } from '@/tenant/useTenant'
import { addMember, updateMember } from './api'
import type { BusinessOption, MemberInput, MemberRow, RoleRow } from './types'

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

/** Add or edit a team member: login details, role, reporting and which businesses they work in. */
export function MemberDrawer({
  member,
  roles,
  members,
  businesses,
  defaultPassword,
  onClose,
  onSaved,
}: {
  /** null = add a new person */
  member: MemberRow | null
  roles: RoleRow[]
  members: MemberRow[]
  businesses: BusinessOption[]
  defaultPassword: string
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const tenant = useTenant()
  const { level } = useAuth()
  const [input, setInput] = useState<MemberInput>(() => ({
    full_name: member?.name ?? '',
    email: member?.email ?? '',
    phone: member?.phone ?? '',
    role_id: member?.role_id ?? '',
    reports_to: member?.reports_to ?? null,
    department: member?.department ?? '',
    designation: member?.designation ?? '',
    joined_on: member?.joined_on ?? '',
    all_businesses: member?.all_businesses ?? businesses.length <= 1,
    businesses: member?.member_businesses ?? [],
  }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // only roles below my own level can be given
  const roleOptions = useMemo(() => roles.filter((r) => !r.is_system && r.level > level), [roles, level])
  const reportOptions = members.filter((m) => m.id !== member?.id && m.status === 'active')
  const set = (k: keyof MemberInput) => (e: { target: { value: string } }) =>
    setInput((d) => ({ ...d, [k]: e.target.value }))

  const picked = (id: string) => input.businesses.find((b) => b.business_id === id)
  function toggleBusiness(id: string, on: boolean) {
    setInput((d) => ({
      ...d,
      businesses: on
        ? [...d.businesses, { business_id: id, branch_id: null, sub_business_ids: null }]
        : d.businesses.filter((b) => b.business_id !== id),
    }))
  }
  /** sub-business access inside a picked business: none ticked = all of them */
  function toggleSub(bizId: string, subId: string, on: boolean) {
    setInput((d) => ({
      ...d,
      businesses: d.businesses.map((b) => {
        if (b.business_id !== bizId) return b
        const cur = b.sub_business_ids ?? []
        const next = on ? [...cur, subId] : cur.filter((x) => x !== subId)
        return { ...b, sub_business_ids: next.length ? next : null }
      }),
    }))
  }
  const setAllSubs = (bizId: string) =>
    setInput((d) => ({ ...d, businesses: d.businesses.map((b) => (b.business_id === bizId ? { ...b, sub_business_ids: null } : b)) }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!input.full_name.trim()) return setError('Name is required.')
    if (!member && !emailOk(input.email.trim())) return setError('Enter a valid email.')
    if (!input.role_id) return setError('Pick a role.')
    if (!input.all_businesses) {
      if (!input.businesses.length) return setError('Pick at least one business, or tick All businesses.')
    }
    if (!member && !defaultPassword) return setError('Set the default password for new logins first (below the team list).')

    setBusy(true)
    setError(null)
    try {
      if (member) {
        await updateMember(tenant.id, member, input)
        onSaved(`${input.full_name.trim()} updated.`)
      } else {
        const res = await addMember(tenant.id, input)
        onSaved(
          res.new_login
            ? `${input.full_name.trim()} added. They log in with ${input.email.trim()} and the default password.`
            : `${input.full_name.trim()} added. They already had a login, so they use their existing password.`,
        )
      }
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
      title={member ? 'Edit team member' : 'Add team member'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button type="submit" form="member-form" disabled={busy}>
              {busy ? 'Saving…' : member ? 'Save changes' : 'Add member'}
            </Button>
          </div>
        </>
      }
    >
      <form id="member-form" onSubmit={submit} className="stack">
        <FormSection title="Login">
          <div className="form-grid">
            <div>
              <Label htmlFor="m-name" required>
                Full name
              </Label>
              <TextInput id="m-name" value={input.full_name} onChange={set('full_name')} autoFocus={!member} />
            </div>
            <div>
              <Label htmlFor="m-phone">Phone</Label>
              <TextInput id="m-phone" type="tel" value={input.phone} onChange={set('phone')} />
            </div>
            <div className="span-2">
              <Label htmlFor="m-email" required>
                Email (login ID)
              </Label>
              <TextInput
                id="m-email"
                type="email"
                value={input.email}
                onChange={set('email')}
                disabled={!!member}
                placeholder="name@example.com"
              />
              <Hint>
                {member
                  ? 'The login email can’t be changed here.'
                  : defaultPassword
                    ? 'They log in with this email and the default password, then change it on My Profile. If they already have a login (e.g. in another workspace), they keep their password.'
                    : 'Set the default password for new logins (below the team list) before adding people.'}
              </Hint>
            </div>
          </div>
        </FormSection>

        <FormSection title="Role & reporting">
          <div className="form-grid">
            <div>
              <Label htmlFor="m-role" required>
                Role
              </Label>
              <Select id="m-role" value={input.role_id} onChange={set('role_id')}>
                <option value="">— select —</option>
                {roleOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · level {r.level}
                  </option>
                ))}
              </Select>
              <Hint>Their access starts as the role’s. Fine-tune it per person in Access Control.</Hint>
            </div>
            <div>
              <Label htmlFor="m-reports">Reports to</Label>
              <Select
                id="m-reports"
                value={input.reports_to ?? ''}
                onChange={(e) => setInput((d) => ({ ...d, reports_to: e.target.value || null }))}
              >
                <option value="">— nobody —</option>
                {reportOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
              <Hint>“Team” access = their own records plus the people who report to them.</Hint>
            </div>
            <div>
              <Label htmlFor="m-dept">Department</Label>
              <TextInput id="m-dept" placeholder="e.g. Sales" value={input.department} onChange={set('department')} />
            </div>
            <div>
              <Label htmlFor="m-desig">Designation</Label>
              <TextInput
                id="m-desig"
                placeholder="e.g. Telecaller"
                value={input.designation}
                onChange={set('designation')}
              />
            </div>
            <div>
              <Label htmlFor="m-joined">Joining date</Label>
              <TextInput id="m-joined" type="date" value={input.joined_on} onChange={set('joined_on')} />
            </div>
          </div>
        </FormSection>

        <FormSection title="Businesses" description="Which businesses this person works in.">
          <div className="check-box">
            <Checkbox
              id="m-all"
              checked={input.all_businesses}
              onChange={(v) => setInput((d) => ({ ...d, all_businesses: v }))}
              label="All businesses"
              description="Includes businesses added later."
            />
          </div>
          {!input.all_businesses &&
            (businesses.length === 0 ? (
              <div className="empty-box">No businesses yet. Add one in Businesses first.</div>
            ) : (
              <div className="link-rows">
                {businesses.map((b) => {
                  const p = picked(b.id)
                  return (
                    <div key={b.id} className="biz-pick">
                      <label className="check" style={{ alignItems: 'center' }}>
                        <input type="checkbox" checked={!!p} onChange={(e) => toggleBusiness(b.id, e.target.checked)} />
                        <b>{b.name}</b>
                      </label>
                      {p && b.subs.length > 0 && (
                        <div className="sub-picks">
                          <span className="muted small">Sub-businesses</span>
                          <label className="check">
                            <input type="checkbox" checked={!p.sub_business_ids?.length} onChange={() => setAllSubs(b.id)} />
                            All sub-businesses
                          </label>
                          {b.subs.map((s) => (
                            <label key={s.id} className="check">
                              <input type="checkbox" checked={!!p.sub_business_ids?.includes(s.id)} onChange={(e) => toggleSub(b.id, s.id, e.target.checked)} />
                              {s.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
        </FormSection>
      </form>
    </Drawer>
  )
}
