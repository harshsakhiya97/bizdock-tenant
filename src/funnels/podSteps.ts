import { db } from '@/lib/supabase'

/** what a Paid Podcast lead did after the opt-in form: the VSL form (Webhooks → Form step: VSL) and its meetings */
export type PodFacts = { vsl: boolean; booked: boolean; done: boolean; noshow: boolean }
type PodLead = { id: string; temperature?: string | null; stage_id?: string | null }
export type PodStep = { key: string; label: string; pick: (l: PodLead, f: PodFacts | undefined, won: Set<string>) => boolean }

/**
 * Paid Podcast's funnel steps — one list for Funnel → Scorecard (its Funnel rows) and Leads (the Funnel step filter),
 * so a change here shows in both.
 */
export const POD_STEPS: PodStep[] = [
  { key: 'optin', label: 'Opt-in form filled', pick: () => true },
  // nothing after the opt-in: no VSL form, no meeting, not closed, not marked not interested
  {
    key: 'only',
    label: 'Only opted in (no next step)',
    pick: (l, f, won) => !f?.vsl && !f?.booked && !f?.noshow && l.temperature !== 'closed' && !won.has(l.stage_id ?? '') && l.temperature !== 'not_interested',
  },
  { key: 'vsl', label: 'VSL form filled', pick: (_, f) => !!f?.vsl },
  { key: 'booked', label: 'Meeting booked', pick: (_, f) => !!f?.booked },
  { key: 'done', label: 'Meeting done', pick: (_, f) => !!f?.done },
  { key: 'noshow', label: 'Meeting no-show', pick: (_, f) => !!f?.noshow && !f?.done },
  { key: 'closed', label: 'Closed', pick: (l, _, won) => l.temperature === 'closed' || won.has(l.stage_id ?? '') },
  { key: 'not_interested', label: 'Not interested', pick: (l) => l.temperature === 'not_interested' },
]

/** Creative Studio (Studio Rental) funnels: the same steps without the meeting ones */
export const STUDIO_STEPS: PodStep[] = POD_STEPS.filter((s) => !['booked', 'done', 'noshow'].includes(s.key))

/** every lead's VSL form / meetings (the caller's leads) */
export async function listPodFacts(tenantId: string): Promise<Map<string, PodFacts>> {
  const { data, error } = await db().rpc('lead_pod_steps', { p_tenant: tenantId })
  if (error) throw error
  return new Map(((data ?? []) as (PodFacts & { lead_id: string })[]).map((r) => [r.lead_id, { vsl: r.vsl, booked: r.booked, done: r.done, noshow: r.noshow }]))
}

/** Paid Podcast board: per lead — follow-up calls done, meetings (booked / done / no-show, its date), the shoot and its money */
export type PodBoardFacts = {
  fu_done: number
  last_fu_at: string | null
  last_fu_outcome: string | null
  m_booked: boolean
  m_done: boolean
  m_noshow: boolean
  /** the meeting shown: the next one, else the latest */
  meeting_on: string | null
  meeting_at: string | null
  meeting_status: string | null
  shoot: boolean
  shoot_on: string | null
  billed: number
  paid: number
}
export async function listPodBoard(tenantId: string): Promise<Map<string, PodBoardFacts>> {
  const { data, error } = await db().rpc('pod_board', { p_tenant: tenantId })
  if (error) throw error
  return new Map(((data ?? []) as (PodBoardFacts & { lead_id: string })[]).map(({ lead_id, ...f }) => [lead_id, { ...f, billed: Number(f.billed), paid: Number(f.paid) }]))
}
