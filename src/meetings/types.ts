/** scheduled = Upcoming; cancelled: team meetings */
export type MeetingStatus = 'scheduled' | 'done' | 'no_show' | 'cancelled'
/** lead: with a lead (in a business); team: internal, company level (no lead, no business) */
export type MeetingKind = 'lead' | 'team'
export type MeetingMode = 'online' | 'in_person'

/** an earlier slot of a rescheduled meeting */
export type Reschedule = { date: string; start: string; end: string; reason: string | null; at: string; by: string | null }

export type MeetingRow = {
  id: string
  tenant_id: string
  kind: MeetingKind
  /** team meeting: what it is about */
  title: string | null
  /** optional: what the meeting is about */
  agenda: string | null
  business_id: string | null
  sub_business_id: string | null
  lead_id: string | null
  meeting_date: string
  start_time: string
  end_time: string
  mode: MeetingMode
  link: string | null
  location: string | null
  status: MeetingStatus
  outcome_note: string | null
  reschedules: Reschedule[]
  /** the team members in it (the first one is also assigned_to) */
  members: string[]
  /** the first team member */
  assigned_to: string | null
  /** Zoom: the account it is created on, and what Zoom gave back */
  zoom_account_id: string | null
  zoom_meeting_id: string | null
  zoom_start_url: string | null
  zoom_password: string | null
  zoom_error: string | null
  zoom_pulled_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const MEETING_STATUS: Record<MeetingStatus, { label: string; tone: string; color: string }> = {
  scheduled: { label: 'Upcoming', tone: 'badge-info', color: '#2563eb' },
  done: { label: 'Done', tone: 'badge-success', color: '#16a34a' },
  no_show: { label: 'No-show', tone: 'badge-warning', color: '#d97706' },
  cancelled: { label: 'Cancelled', tone: 'badge-muted', color: '#94a3b8' },
}

export const KIND_LABEL: Record<MeetingKind, string> = { lead: 'Lead meeting', team: 'Team meeting' }
/** team meetings on the calendar */
export const TEAM_COLOR = '#7c3aed'

export const MODE_LABEL: Record<MeetingMode, string> = { online: 'Online', in_person: 'In person' }
