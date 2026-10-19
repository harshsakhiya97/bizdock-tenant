import { useAuth } from '@/auth/useAuth'
import { Label, Select } from '@/components/Field'

/** sub-businesses of a business (empty when it has none) */
export function useSubBusinesses(businessId: string | null | undefined) {
  const { businesses } = useAuth()
  return businesses.find((b) => b.id === businessId)?.subs ?? []
}

/** keeps a sub-business id only when it belongs to the business */
export function subOf(subs: { id: string }[], id: string | null | undefined) {
  return id && subs.some((s) => s.id === id) ? id : ''
}

/** "Sub-business" picker; shows nothing when the business has no sub-businesses. */
export function SubBusinessSelect({
  id,
  businessId,
  value,
  onChange,
  disabled,
  className,
}: {
  id: string
  businessId: string | null | undefined
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  className?: string
}) {
  const subs = useSubBusinesses(businessId)
  if (!subs.length) return null
  return (
    <div className={className}>
      <Label htmlFor={id}>Sub-business</Label>
      <Select id={id} value={subOf(subs, value)} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">— none —</option>
        {subs.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
    </div>
  )
}
