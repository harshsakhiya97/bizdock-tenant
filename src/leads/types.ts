export type Temperature = 'hot' | 'warm' | 'cold' | 'not_interested'

export type LeadRow = {
  id: string
  tenant_id: string
  business_id: string
  funnel_id: string
  stage_id: string
  first_name: string
  last_name: string | null
  phone: string
  whatsapp: string | null
  email: string | null
  city: string | null
  source_id: string | null
  referred_by: string | null
  temperature: Temperature | null
  estimated_amount: number | null
  owner_id: string | null
  tags: string[]
  notes: string | null
  next_follow_up_at: string | null
  lost_reason_id: string | null
  is_archived: boolean
  archive_reason: string | null
  stage_changed_at: string
  created_at: string
  updated_at: string
}

export type ActivityRow = {
  id: string
  kind: 'created' | 'stage' | 'note' | 'assigned' | 'temperature' | 'follow_up' | 'archived' | 'restored'
  from_stage_id: string | null
  to_stage_id: string | null
  note: string | null
  member_id: string | null
  created_at: string
}

export type Option = { id: string; name: string }
export type MemberOption = { id: string; name: string; role_level: number }

export type LeadInput = {
  funnel_id: string
  stage_id: string
  first_name: string
  last_name: string
  phone: string
  whatsapp: string
  email: string
  city: string
  source_id: string
  referred_by: string
  temperature: Temperature | ''
  estimated_amount: string
  owner_id: string
  tags: string
  notes: string
  next_follow_up_at: string
}
