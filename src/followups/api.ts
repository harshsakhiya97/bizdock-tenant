import { clearLeadsCache } from '@/leads/api'
import { logActivity } from '@/leads/api'
import { rpcAll } from '@/lib/fetchAll'
import { db } from '@/lib/supabase'
import type { Option } from '@/leads/types'
import type { FollowUpRow, ScheduleInput } from './types'

const COLS =
  'id, tenant_id, lead_id, assigned_to, due_at, mode, purpose, status, outcome_id, result_note, completed_at, completed_by, created_at, leads(id, first_name, last_name, phone, whatsapp, business_id, sub_business_id, funnel_id, stage_id, owner_id, purpose, required_on, temperature)'

/** every follow-up of the workspace with its lead (list_follow_ups: the access checked once per call, all pages) */
export async function listFollowUps(tenantId: string): Promise<FollowUpRow[]> {
  return rpcAll<FollowUpRow>((offset, limit) => db().rpc('list_follow_ups', { p_tenant: tenantId, p_offset: offset, p_limit: limit }), 1000, 3)
}

/** an outcome; `comment_required`: Comments must be written when it is picked (Masters → Follow-up outcomes) */
export type Outcome = Option & { comment_required?: boolean }
export async function listOutcomes(tenantId: string): Promise<Outcome[]> {
  const { data } = await db()
    .from('follow_up_outcomes')
    .select('id, name, comment_required')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order')
  return (data ?? []) as Outcome[]
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
  clearLeadsCache()
  if (replace) {
    const { error } = await db()
      .from('follow_ups')
      .update({ status: 'rescheduled' })
      .eq('lead_id', input.lead_id)
      .eq('status', 'pending')
    if (error) throw error
  }
  // the picked date and time are India time, whatever time zone the computer is set to
  const raw = input.due_at.trim()
  const due = new Date(/(z|[+-]\d\d:?\d\d)$/i.test(raw) ? raw : `${raw.length === 16 ? `${raw}:00` : raw}+05:30`)
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
  clearLeadsCache()
  const done = {
    status: 'done' as const,
    outcome_id: result.outcome_id,
    result_note: result.note.trim() || null,
    completed_at: new Date().toISOString(),
    completed_by: memberId ?? null,
  }
  // no follow-up was pending (a call made from the list): recorded as one done now
  const { error } = f.id
    ? await db().from('follow_ups').update(done).eq('id', f.id)
    : await db().from('follow_ups').insert({
        tenant_id: tenantId,
        lead_id: f.lead_id,
        due_at: done.completed_at,
        mode: f.mode,
        // a call made now: it is the caller's
        assigned_to: memberId || f.assigned_to || null,
        created_by: memberId ?? null,
        ...done,
      })
  if (error) throw error
  await logActivity(tenantId, memberId, [f.lead_id], {
    kind: 'note',
    note: `Follow-up done · ${result.outcome_name}${result.note.trim() ? ` · ${result.note.trim()}` : ''}`,
  })
  if (next) await scheduleFollowUp(tenantId, memberId, next, true)
}

export async function cancelFollowUp(id: string) {
  clearLeadsCache()
  const { error } = await db().from('follow_ups').update({ status: 'cancelled' }).eq('id', id)
  if (error) throw error
}

/** Cancels every pending follow-up of a lead (the lead form's date was cleared). */
export async function clearLeadFollowUps(leadId: string) {
  clearLeadsCache()
  const { error } = await db().from('follow_ups').update({ status: 'cancelled' }).eq('lead_id', leadId).eq('status', 'pending')
  if (error) throw error
}

export async function getFollowUp(id: string): Promise<FollowUpRow | null> {
  const { data } = await db().from('follow_ups').select(COLS).eq('id', id).maybeSingle()
  return (data ?? null) as unknown as FollowUpRow | null
}

/** the lead's next pending follow-up (if any) */
export async function pendingFollowUpId(leadId: string): Promise<string | null> {
  const { data } = await db().from('follow_ups').select('id').eq('lead_id', leadId).eq('status', 'pending').order('due_at').limit(1).maybeSingle()
  return (data?.id as string | undefined) ?? null
}
