import { TextInput } from './Field'

/** the 10-digit mobile number of a stored phone (+91…, 91…, 0… or plain) */
export const localPhone = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '').slice(-10)
/** stored as +91 and the 10 digits (same as numbers from forms) */
export const fullPhone = (digits: string) => `+91${digits.replace(/\D/g, '').slice(-10)}`
export const phoneValid = (digits: string) => /^[6-9]\d{9}$/.test(digits)

/** Indian mobile number: +91 prefix and 10 digits. */
export function PhoneInput({ id, value, onChange, disabled }: { id?: string; value: string; onChange: (digits: string) => void; disabled?: boolean }) {
  return (
    <div className="input-prefix">
      <span>+91</span>
      <TextInput
        id={id}
        type="tel"
        inputMode="numeric"
        maxLength={10}
        placeholder="10 digits"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
      />
    </div>
  )
}
