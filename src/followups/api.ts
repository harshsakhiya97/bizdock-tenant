import { logActivity } from '@/leads/api'
import { db } from '@/lib/supabase'
import type { Option } from '@/leads/types'
import type { FollowUpRow, ScheduleInput } from './types'

const COLS =
  'id, tenant_id, lead_id, assigned_to, due_at, mode, purpose, status, outcome_id, result_note, completed_at, completed_by, created_at, leads(id, first_name, last_name, phone, whatsapp, business_id, funnel_id, stage_id, owner_id, purpose, required_on)'

export async function listFollowUps(tenantId: string): Promise<FollowUpRow[]> {
  const { data, error } = await db().from('follow_ups').select(COLS).eq('tenant_id', tenantId).order('due_at')
  if (error) throw error
  return (data ?? []) as unknown as FollowUpRow[]
}

export async function listOutcomes(tenantId: string): Promise<Option[]> {
  const { data } = await db()
    .from('follow_up_outcomes')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order')
  return (data ?? []) as Option[]
}

/**
 * Schedules a follow-up. With `replace`, the lead's other pending follow-ups become "rescheduled",
 * so a lead has one next follow-up.
 */
export async function scheduleFollowUp(
  tenantId: string,
  memberId: string | undefined,
  input: ScheduleInput,
  replace = true,
) {
  if (replace) {
    const { error } = await db()
      .from('follow_ups')
      .update({ status: 'rescheduled' })
      .eq('lead_id', input.lead_id)
      .eq('status', 'pending')
    if (error) throw error
  }
  const due = new Date(input.due_at)
  const { error } = await db()
    .from('follow_ups')
    .insert({
      tenant_id: tenantId,
      lead_id: input.lead_id,
      due_at: due.toISOString(),
      mode: input.mode,
      purpose: input.purpose.trim() || null,
      assigned_to: input.assigned_to || memberId || null,
      created_by: memberId ?? null,
    })
  if (error) throw error
  await logActivity(tenantId, memberId, [input.lead_id], {
    kind: 'follow_up',
    note: `Follow-up set for ${due.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}${input.purpose.trim() ? ` · ${input.purpose.trim()}` : ''}`,
  })
}

export async function completeFollowUp(
  tenantId: string,
  memberId: string | undefined,
  f: FollowUpRow,
  result: { outcome_id: string; outcome_name: string; note: string },
  next: ScheduleInput | null,
) {
  const { error } = await db()
    .from('follow_ups')
    .update({
      status: 'done',
      outcome_id: result.outcome_id,
      result_note: result.note.trim() || null,
      completed_at: new Date().toISOString(),
      completed_by: memberId ?? null,
    })
    .eq('id', f.id)
  if (error) throw error
  await logActivity(tenantId, memberId, [f.lead_id], {
    kind: 'note',
    note: `Follow-up done · ${result.outcome_name}${result.note.trim() ? ` · ${result.note.trim()}` : ''}`,
  })
  if (next) await scheduleFollowUp(tenantId, memberId, next, true)
}

export async function cancelFollowUp(id: string) {
  const { error } = await db().from('follow_ups').update({ status: 'cancelled' }).eq('id', id)
  if (error) throw error
}

/** Cancels every pending follow-up of a lead (the lead form's date was cleared). */
export async function clearLeadFollowUps(leadId: string) {
  const { error } = await db().from('follow_ups').update({ status: 'cancelled' }).eq('lead_id', leadId).eq('status', 'pending')
  if (error) throw error
}
