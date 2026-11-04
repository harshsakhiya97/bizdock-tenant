import { useState } from 'react'
import { ArrowDown, ArrowUp, Lock, Plus, Trash2, X } from 'lucide-react'
import { FormSection, Hint, Select, TextInput } from '@/components/Field'
import { ConfirmModal } from '@/components/ui'
import { varKey } from '@/workflows/types'
import { FIELD_TYPES, type ProfileField, type ProfileFieldType } from './api'

/** a dropdown's / multi-select's options as chips: type one, then Enter, Tab or Add option (an option may have commas) */
function OptionsEditor({
  label,
  options,
  onChange,
  placeholder = 'Type an option, then Enter or Tab',
  addLabel = 'Add option',
  clean = (v: string) => v.trim(),
  fixed,
}: {
  label: string
  options: string[]
  onChange: (o: string[]) => void
  placeholder?: string
  addLabel?: string
  clean?: (v: string) => string
  /** a chip that's always there (can't be removed) */
  fixed?: string
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = clean(draft)
    if (!v) return false
    if (v !== fixed && !options.some((o) => o.toLowerCase() === v.toLowerCase())) onChange([...options, v])
    setDraft('')
    return true
  }
  return (
    <div className="pf-options">
      {(options.length > 0 || !!fixed) && (
        <div className="pf-chips">
          {fixed && <span className="pf-chip is-fixed" title="Always (the field's own name)">{fixed}</span>}
          {options.map((o) => (
            <span key={o} className="pf-chip">
              {o}
              <button type="button" aria-label={`Remove ${o}`} title="Remove" onClick={() => onChange(options.filter((x) => x !== o))}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="pf-option-add">
        <TextInput
          aria-label={`${label || 'Field'}: ${addLabel.toLowerCase()}`}
          placeholder={placeholder}
          value={draft}
          maxLength={120}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && draft.trim())) {
              e.preventDefault()
              add()
            }
          }}
        />
        <button type="button" className="btn btn-outline btn-sm" onClick={add} disabled={!draft.trim()}>
          <Plus size={14} /> {addLabel}
        </button>
      </div>
    </div>
  )
}

/** always asked (they find or add the lead), and the page-address names each one is filled from */
const FIXED: [string, string, string, string][] = [
  ['name', 'Full name', 'Text', 'name, full_name, fullname, or first_name / fname + last_name / lname'],
  ['phone', 'Phone', 'Phone', 'phone, mobile, whatsapp, number'],
  ['email', 'Email', 'Email', 'email, mail'],
]

/**
 * Booking Calendar → User profile fields: name, phone and email (always, required), then the widget's own fields —
 * a name, a type, required or not (a dropdown: its options). The embed asks them in Your Details; each booking sends
 * them to the workflow under the field's name ("Company name" → {{company_name}}).
 */
export function ProfileFieldsEditor({ fields, onChange }: { fields: ProfileField[]; onChange: (f: ProfileField[]) => void }) {
  const [removing, setRemoving] = useState<number | null>(null)
  const put = (i: number, patch: Partial<ProfileField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const move = (i: number, by: number) => {
    const next = [...fields]
    const [f] = next.splice(i, 1)
    next.splice(i + by, 0, f)
    onChange(next)
  }

  return (
    <FormSection title="User profile fields" description="What visitors fill in under Your Details before picking a time. Each booking sends every field to the workflow.">
      <div className="pf-list">
        <div className="pf-row pf-headrow">
          <span>Field name</span>
          <span>Type</span>
          <span>Required</span>
          <span />
        </div>
        {FIXED.map(([k, l, t, from]) => (
          <div key={k} className="pf-row is-fixed">
            <span className="pf-fixed-name">
              <Lock size={13} /> {l}
              <small className="muted pf-from">From the page address: {from}</small>
            </span>
            <span className="muted">{t}</span>
            <span className="muted small">Always</span>
            <span />
          </div>
        ))}
        {fields.map((f, i) => (
          <div key={i} className="pf-row-wrap">
            <div className="pf-row">
              <span>
                <TextInput aria-label={`Field ${i + 4} name`} value={f.label} placeholder="e.g. Company name" maxLength={60} onChange={(e) => put(i, { label: e.target.value, key: varKey(e.target.value) })} />
              </span>
              <Select aria-label={`Field ${i + 4} type`} value={f.type} onChange={(e) => put(i, { type: e.target.value as ProfileFieldType })}>
                {FIELD_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
              <label className="pf-req">
                <input type="checkbox" checked={f.required} onChange={(e) => put(i, { required: e.target.checked })} /> Required
              </label>
              <span className="pf-actions">
                <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={14} />
                </button>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Move down" aria-label="Move down" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown size={14} />
                </button>
                <button type="button" className="btn btn-ghost btn-icon btn-sm danger-text" title="Remove" aria-label="Remove" onClick={() => setRemoving(i)}>
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
            <div className="pf-from-row">
              <span className="muted small">From the page address (e.g. ?{f.key || 'company_name'}=…)</span>
              <OptionsEditor
                label={f.label}
                options={f.params ?? []}
                onChange={(params) => put(i, { params })}
                placeholder="Another name for it in the address, then Enter or Tab"
                addLabel="Add name"
                clean={varKey}
                fixed={f.key || undefined}
              />
            </div>
            {(f.type === 'select' || f.type === 'multiselect') && (
              <OptionsEditor label={f.label} options={f.options ?? []} onChange={(options) => put(i, { options })} />
            )}
          </div>
        ))}
      </div>
      <div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange([...fields, { key: '', label: '', type: 'text', required: false }])}>
          <Plus size={14} /> Add field
        </button>
      </div>
      <Hint>Name, phone and email are always asked: they find the lead (or add it). Your fields come after them, in this order.</Hint>
      <ConfirmModal
        open={removing !== null}
        icon={Trash2}
        danger
        title="Remove this field?"
        message={removing !== null ? `“${fields[removing]?.label || 'This field'}” is no longer asked in the calendar or sent with bookings (once you save).` : ''}
        confirmLabel="Remove"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing !== null) onChange(fields.filter((_, j) => j !== removing))
          setRemoving(null)
        }}
      />
    </FormSection>
  )
}
