import {
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

/*
 * Form fields in the Muzic Lover style: slim inputs, thin brand-coloured border on focus,
 * grey hints under fields, grey uppercase section titles.
 */

const fieldBase =
  'w-full rounded-lg border border-gray-300 bg-white text-[13px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-brand focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500'

export function Label({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold text-gray-900">
      {children}
      {required && <span className="text-brand">*</span>}
    </label>
  )
}

/** Grey helper text under a field. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-snug text-gray-500">{children}</p>
}

/** Grey uppercase group title with an optional one-line description, e.g. "SONG SUGGESTIONS". */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
      <div className="mt-3 space-y-3.5">{children}</div>
    </section>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }

export function TextInput({ icon, className, ...props }: InputProps) {
  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400 [&_svg]:size-4">
          {icon}
        </span>
      )}
      <input {...props} className={cn(fieldBase, 'h-10 px-3', icon ? 'pl-10' : '', className)} />
    </div>
  )
}

export function TextArea({ className, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} {...props} className={cn(fieldBase, 'block px-3 py-2', className)} />
}

/** Native select with the custom chevron used in Muzic Lover. */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={cn(fieldBase, 'h-10 appearance-none pr-9 pl-3', className)}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-gray-500" />
    </div>
  )
}

export function PasswordInput({ icon, className, ...props }: Omit<InputProps, 'type'>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <TextInput {...props} icon={icon} type={show ? 'text' : 'password'} className={cn('pr-11', className)} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        {show ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </button>
    </div>
  )
}

/** Checkbox with a label and optional grey description, e.g. "Registered for GST?". */
export function Checkbox({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-gray-300 accent-[var(--color-brand)]"
      />
      <span>
        <span className="block text-[13px] font-semibold text-gray-900">{label}</span>
        {description && <span className="block text-xs text-gray-500">{description}</span>}
      </span>
    </label>
  )
}
