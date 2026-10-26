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
  /** leads added through the funnel get this sub-business */
  sub_business_id: string | null
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
  /** owner of new leads: nobody, one person, or round robin over assign_members */
  assign_mode: AssignMode
  assign_members: string[]
  funnel_stages: StageRow[]
}

export type AssignMode = 'none' | 'single' | 'round_robin'

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
  sub_business_id: string
  name: string
  type: FunnelType
  description: string
  tags: string[]
  event_id: string
  assign_mode: AssignMode
  assign_members: string[]
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
}

/** One webhook URL of a funnel (a funnel can have several, each with its own URL and field mapping; not tied to a landing page). */
export type FunnelWebhook = {
  id: string
  tenant_id: string
  funnel_id: string
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
  webhook_id: string | null
  sheet_id: string | null
  via: 'webhook' | 'import' | 'sheet'
  is_new: boolean
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  data: Record<string, string>
  created_at: string
}

/** A Google Sheet link on a funnel's WhatsApp tab: new rows become leads (synced every minute). */
export type FunnelSheet = {
  id: string
  tenant_id: string
  funnel_id: string
  name: string
  sheet_url: string
  spreadsheet_id: string
  gid: string | null
  /** rows already in the sheet are imported on the first sync */
  import_existing: boolean
  /** sheet column → lead field */
  field_map: Record<string, string>
  headers: string[] | null
  sample: Record<string, string> | null
  /** data rows already handled (null = first sync not done yet) */
  synced_rows: number | null
  last_synced_at: string | null
  last_error: string | null
  leads_added: number
  leads_updated: number
  rows_skipped: number
  /** Perisclaw setup: example lead message + which part goes to which sheet column */
  perisclaw: { example: string; map: Record<string, string> } | null
  is_active: boolean
  created_at: string
}

export type SheetInput = { name: string; sheet_url: string; import_existing: boolean }
