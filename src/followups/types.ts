export type FollowUpMode = 'call' | 'whatsapp' | 'meeting' | 'email' | 'visit' | 'other'
export type FollowUpStatus = 'pending' | 'done' | 'rescheduled' | 'cancelled'

export type FollowUpLead = {
  id: string
  first_name: string
  last_name: string | null
  phone: string
  whatsapp: string | null
  business_id: string
  funnel_id: string
  stage_id: string
  owner_id: string | null
}

export type FollowUpRow = {
  id: string
  tenant_id: string
  lead_id: string
  assigned_to: string | null
  due_at: string
  mode: FollowUpMode
  purpose: string | null
  status: FollowUpStatus
  outcome_id: string | null
  result_note: string | null
  completed_at: string | null
  completed_by: string | null
  created_at: string
  leads: FollowUpLead | null
}

export type ScheduleInput = {
  lead_id: string
  due_at: string // datetime-local value
  mode: FollowUpMode
  purpose: string
  assigned_to: string
}
