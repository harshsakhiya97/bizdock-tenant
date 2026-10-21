export type Temperature = 'hot' | 'warm' | 'cold' | 'not_interested'

export type LeadRow = {
  id: string
  tenant_id: string
  business_id: string
  sub_business_id: string | null
  /** null = imported without a funnel (belongs to the business only) */
  funnel_id: string | null
  stage_id: string | null
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
  landing_page_id: string | null
  webhook_id: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  /** extra form fields (company, purpose…) */
  extra: Record<string, string>
  purpose: string | null
  /** the date (and hours) the lead needs the service / slot */
  required_on: string | null
  required_hours: number | null
}

export type ActivityRow = {
  id: string
  kind: 'created' | 'stage' | 'note' | 'assigned' | 'temperature' | 'follow_up' | 'archived' | 'restored' | 'submission' | 'imported'
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
  purpose: string
  required_on: string
  required_hours: string
  sub_business_id: string
}
