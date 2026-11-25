import { db } from '@/lib/supabase'

/** Gemini's summary of a lead (lead_insights.content) */
export type LeadInsight = {
  summary: string
  interest: { level: 'hot' | 'warm' | 'cold'; why: string }
  needs: string
  budget: string
  timeline: string
  objections: string[]
  next_action: string
  risks: string[]
  /** what the lead asked the business for (newer summaries) */
  asked_for?: string[]
}
export type InsightRow = { content: LeadInsight | null; generated_at: string | null; stale: boolean; error: string | null; tries: number }

export async function getLeadInsight(leadId: string): Promise<InsightRow | null> {
  const { data, error } = await db().from('lead_insights').select('content, generated_at, stale, error, tries').eq('lead_id', leadId).maybeSingle()
  if (error) throw error
  return data as InsightRow | null
}

/** write it again now (Gemini) */
export async function refreshLeadInsight(leadId: string): Promise<{ content: LeadInsight; generated_at: string }> {
  const { data, error } = await db().functions.invoke('lead-insight', { body: { action: 'refresh', lead_id: leadId } })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}

/** Lead page → At a glance */
export type Glance = {
  category_since: string | null
  next_follow_up: { due_at: string; mode: string | null; purpose: string | null } | null
  overdue: number
  last_follow_up: { at: string | null; mode: string | null; outcome: string | null; note: string | null } | null
  calls: { total: number; connected: number }
  last_call: { at: string | null; direction: string | null; duration: number | null; outcome: string | null; by: string | null } | null
  next_meeting: { date: string; start: string | null; mode: string | null; status: string | null } | null
  last_meeting: { date: string; start: string | null; mode: string | null; status: string | null } | null
  whatsapp: { at: string | null; direction: string | null; status: string | null; template: string | null } | null
}
export async function getLeadGlance(leadId: string): Promise<Glance | null> {
  const { data, error } = await db().rpc('lead_glance', { p_lead: leadId })
  if (error) throw error
  return data as Glance | null
}

export type InsightStatus = {
  missing: number
  done: number
  failed: number
  gemini: boolean
  sync: { active: boolean; started_at: string | null; finished_at: string | null; total: number; note: string | null } | null
}
