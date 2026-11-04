import { useState } from 'react'
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from 'lucide-react'
import { FormSection, Hint, Select, TextInput } from '@/components/Field'
import { ConfirmModal } from '@/components/ui'
import { varKey } from '@/workflows/types'
import { FIELD_TYPES, type ProfileField, type ProfileFieldType } from './api'

/** always asked (they find or add the lead) */
const FIXED: [string, string, string][] = [
  ['name', 'Full name', 'Text'],
  ['phone', 'Phone', 'Phone'],
  ['email', 'Email', 'Email'],
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
        {FIXED.map(([k, l, t]) => (
          <div key={k} className="pf-row is-fixed">
            <span className="pf-fixed-name">
              <Lock size={13} /> {l}
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
            {(f.type === 'select' || f.type === 'multiselect') && (
              <div className="pf-options">
                <TextInput
                  aria-label={`${f.label || 'Field'} options`}
                  placeholder="Options, separated by commas (e.g. Coach, Entrepreneur, Creator)"
                  value={(f.options ?? []).join(', ')}
                  onChange={(e) => put(i, { options: e.target.value.split(',').map((o) => o.trimStart()) })}
                />
              </div>
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
