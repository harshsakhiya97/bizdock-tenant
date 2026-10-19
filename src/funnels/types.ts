export type FunnelType = 'lead_gen' | 'webinar' | 'vsl' | 'custom'
export type StageKind = 'open' | 'won' | 'lost'

export type StageRow = {
  id: string
  funnel_id: string
  name: string
  color: string
  kind: StageKind
  note_required: boolean
  sort_order: number
}

export type FunnelRow = {
  id: string
  tenant_id: string
  business_id: string
  name: string
  type: FunnelType
  description: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  /** added to every lead that comes in through this funnel */
  tags: string[]
  /** the calendar webinar / event this funnel leads to */
  event_id: string | null
  funnel_stages: StageRow[]
}

/** Stage as edited in the form; `id` missing = not saved yet */
export type StageDraft = {
  key: string
  id?: string
  name: string
  color: string
  kind: StageKind
  note_required: boolean
}

export type FunnelInput = {
  business_id: string
  name: string
  type: FunnelType
  description: string
  tags: string[]
  event_id: string
}

/** an extra field a landing page form sends (name, email and phone are always required) */
export type FormField = { key: string; label: string; required: boolean }

export type UtmLink = {
  id: string
  landing_page_id: string
  label: string
  utm_source: string
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  created_at: string
}

export type LandingPage = {
  id: string
  tenant_id: string
  funnel_id: string
  name: string
  url: string | null
  webhook_key: string
  /** old fixed form fields (no longer used) */
  fields: FormField[]
  /** incoming form field → lead field ("phone", "email", … "extra", "ignore") */
  field_map: Record<string, string>
  /** test mode: the next form post is saved as `sample` (no lead) until this time */
  test_mode_until: string | null
  sample: Record<string, string> | null
  sample_at: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  landing_page_utms: UtmLink[]
  landing_page_webhooks: LandingPageWebhook[]
}

/** One webhook URL of a landing page (a page can have several forms, each with its own URL and field mapping). */
export type LandingPageWebhook = {
  id: string
  tenant_id: string
  landing_page_id: string
  name: string
  webhook_key: string
  /** incoming form field → lead field ("phone", "email", … "extra", "ignore") */
  field_map: Record<string, string>
  /** test mode: the next form post is saved as `sample` (no lead) until this time */
  test_mode_until: string | null
  sample: Record<string, string> | null
  sample_at: string | null
  is_active: boolean
  created_at: string
}

export type LandingPageInput = {
  name: string
  url: string
}

export type UtmInput = { label: string; utm_source: string; utm_medium: string; utm_campaign: string; utm_term: string; utm_content: string }

/** one form post / import row (for counts and the lead's log) */
export type SubmissionRow = {
  id: string
  lead_id: string
  landing_page_id: string | null
  via: 'webhook' | 'import'
  is_new: boolean
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  data: Record<string, string>
  created_at: string
}
