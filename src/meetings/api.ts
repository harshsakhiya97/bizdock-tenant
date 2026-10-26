import { db } from '@/lib/supabase'
import type { MeetingMode, MeetingRow, MeetingStatus, Reschedule } from './types'

export async function listMeetings(tenantId: string, f: { leadId?: string } = {}): Promise<MeetingRow[]> {
  let q = db().from('meetings').select('*').eq('tenant_id', tenantId)
  if (f.leadId) q = q.eq('lead_id', f.leadId)
  const { data, error } = await q.order('meeting_date', { ascending: false }).order('start_time')
  if (error) throw error
  return (data ?? []) as MeetingRow[]
}

export type MeetingInput = {
  lead_id: string
  business_id: string
  sub_business_id: string | null
  meeting_date: string
  start_time: string
  end_time: string
  mode: MeetingMode
  link: string
  location: string
  status: MeetingStatus
  outcome_note: string
}

const clean = (v: string) => v.trim() || null

/** Adds or updates a meeting. A changed date or time on a saved meeting is a reschedule: the old slot is kept in its history. */
export async function saveMeeting(tenantId: string, memberId: string | undefined, existing: MeetingRow | null, input: MeetingInput, reason: string) {
  const row = {
    lead_id: input.lead_id,
    business_id: input.business_id,
    sub_business_id: input.sub_business_id,
    meeting_date: input.meeting_date,
    start_time: input.start_time,
    end_time: input.end_time,
    mode: input.mode,
    link: input.mode === 'online' ? clean(input.link) : null,
    location: input.mode === 'in_person' ? clean(input.location) : null,
    status: input.status,
    outcome_note: clean(input.outcome_note),
  }
  if (!existing) {
    const { error } = await db().from('meetings').insert({ ...row, tenant_id: tenantId, created_by: memberId ?? null })
    if (error) throw error
    return
  }
  const moved =
    existing.meeting_date !== input.meeting_date || existing.start_time.slice(0, 5) !== input.start_time.slice(0, 5) || existing.end_time.slice(0, 5) !== input.end_time.slice(0, 5)
  const reschedules: Reschedule[] = moved
    ? [
        ...(existing.reschedules ?? []),
        { date: existing.meeting_date, start: existing.start_time.slice(0, 5), end: existing.end_time.slice(0, 5), reason: clean(reason), at: new Date().toISOString(), by: memberId ?? null },
      ]
    : existing.reschedules
  const { error } = await db().from('meetings').update({ ...row, reschedules }).eq('id', existing.id)
  if (error) throw error
}

export async function deleteMeeting(id: string) {
  const { error } = await db().from('meetings').delete().eq('id', id)
  if (error) throw error
}
