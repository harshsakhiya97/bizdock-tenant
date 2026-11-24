import {
  Children,
  isValidElement,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { SearchSelect, type SearchOption } from './SearchSelect'

/* Form fields from the theme kit: .field-label, .input-wrap, .input, .input-action */

export function Label({ htmlFor, required, children }: { htmlFor?: string; required?: boolean; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="field-label">
      {children}
      {required && <span className="req">*</span>}
    </label>
  )
}

/** Grey helper text under a field. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="field-hint">{children}</p>
}

/** Grey uppercase group title with an optional one-line description. */
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
    <section className="form-section">
      <div className="form-section-head">
        <h4>{title}</h4>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }

export function TextInput({ icon, className, ...props }: InputProps) {
  return (
    <div className="input-wrap">
      {icon && <span className="input-icon">{icon}</span>}
      <input {...props} className={cn('input', className)} />
    </div>
  )
}

export function TextArea({ className, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} {...props} className={cn('input', className)} />
}

/** an element's text (an <option>'s label can be a mix of text and numbers) */
function textOf(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(n)) return textOf(n.props.children)
  return ''
}
/** the <option>s (and <optgroup>s) written inside a Select, as a searchable list */
function optionsOf(children: ReactNode, group?: string): SearchOption[] {
  const out: SearchOption[] = []
  Children.forEach(children, (c) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; label?: string; disabled?: boolean; hidden?: boolean }>(c)) return
    if (c.type === 'option') {
      if (c.props.hidden) return
      const label = textOf(c.props.children)
      out.push({ value: c.props.value != null ? String(c.props.value) : label, label, group, disabled: c.props.disabled })
    } else if (c.type === 'optgroup') out.push(...optionsOf(c.props.children, c.props.label))
    // a component that renders options (e.g. VarOptions): its output, rendered here (they are plain functions)
    else if (typeof c.type === 'function') out.push(...optionsOf((c.type as (p: unknown) => ReactNode)(c.props), group))
    else out.push(...optionsOf(c.props.children, group))
  })
  return out
}

/**
 * Every dropdown in the app: a searchable list (written like a <select> with <option>s; onChange gets an event-like
 * object with target.value, so existing handlers keep working).
 */
export function Select({ className, children, value, defaultValue, onChange, disabled, id, name, style, title, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = optionsOf(children)
  const [inner, setInner] = useState(defaultValue != null ? String(defaultValue) : (options[0]?.value ?? ''))
  const current = value != null ? String(value) : inner
  const known = options.some((o) => o.value === current)
  return (
    <SearchSelect
      id={id}
      name={name}
      value={known ? current : null}
      // a value not in the list shows the first option, like a <select>
      placeholder={options.find((o) => o.value === '')?.label ?? options[0]?.label ?? 'Select…'}
      options={options}
      disabled={disabled}
      className={cn(className?.replace(/\binput\b/g, '').trim())}
      style={style}
      title={title}
      ariaLabel={rest['aria-label']}
      onChange={(v) => {
        const val = v ?? ''
        if (value == null) setInner(val)
        const target = { value: val, name: name ?? '', id: id ?? '' }
        onChange?.({ target, currentTarget: target, preventDefault() {}, stopPropagation() {} } as unknown as ChangeEvent<HTMLSelectElement>)
      }}
    />
  )
}

export function PasswordInput({ icon, className, ...props }: Omit<InputProps, 'type'>) {
  const [show, setShow] = useState(false)
  return (
    <div className="input-wrap">
      {icon && <span className="input-icon">{icon}</span>}
      <input {...props} type={show ? 'text' : 'password'} className={cn('input has-action', className)} />
      <button
        type="button"
        className="input-action"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
    </div>
  )
}

/** Checkbox with a title and optional grey description, e.g. "Registered for GST?". */
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
    <label htmlFor={id} className="check">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <b>{label}</b>
        {description && <small>{description}</small>}
      </span>
    </label>
  )
}
