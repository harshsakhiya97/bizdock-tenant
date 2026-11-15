import { useState } from 'react'
import { cn } from '@/lib/cn'
import { logActivity, updateLeads } from './api'
import { TEMPERATURES, tempOf } from './labels'
import type { Temperature } from './types'

/** set a lead's category (New, Hot, Warm, Cold, Not interested, Closed) and log it */
export async function setLeadCategory(tenantId: string, memberId: string | undefined, leadId: string, value: Temperature) {
  await updateLeads([leadId], { temperature: value })
  await logActivity(tenantId, memberId, [leadId], { kind: 'temperature', note: tempOf(value)?.label })
}

/** the lead's category as a coloured pick-list (or a badge when it can't be changed) */
export function CategorySelect({
  tenantId,
  memberId,
  leadId,
  value,
  canEdit,
  onChanged,
}: {
  tenantId: string
  memberId: string | undefined
  leadId: string
  value: Temperature | null
  canEdit: boolean
  onChanged: (v: Temperature) => void
}) {
  const [busy, setBusy] = useState(false)
  const t = tempOf(value)
  // a Closed lead is a customer: its category stays
  if (!canEdit || value === 'closed') return t ? <span className={cn('badge', t.tone)}>{t.label}</span> : null
  return (
    <select
      className={cn('input input-sm cat-select', t?.tone)}
      aria-label="Category"
      title="Category"
      value={value ?? ''}
      disabled={busy}
      onChange={async (e) => {
        const v = e.target.value as Temperature
        setBusy(true)
        try {
          await setLeadCategory(tenantId, memberId, leadId, v)
          onChanged(v)
        } finally {
          setBusy(false)
        }
      }}
    >
      {!value && <option value="">Category</option>}
      {TEMPERATURES.map((x) => (
        <option key={x.value} value={x.value}>
          {x.label}
        </option>
      ))}
    </select>
  )
}
