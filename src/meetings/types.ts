export type MeetingStatus = 'scheduled' | 'qualified' | 'not_qualified' | 'no_show' | 'cancelled'
export type MeetingMode = 'online' | 'in_person'

/** an earlier slot of a rescheduled meeting */
export type Reschedule = { date: string; start: string; end: string; reason: string | null; at: string; by: string | null }

export type MeetingRow = {
  id: string
  tenant_id: string
  business_id: string
  sub_business_id: string | null
  lead_id: string
  meeting_date: string
  start_time: string
  end_time: string
  mode: MeetingMode
  link: string | null
  location: string | null
  status: MeetingStatus
  outcome_note: string | null
  reschedules: Reschedule[]
  /** the team member who takes it */
  assigned_to: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const MEETING_STATUS: Record<MeetingStatus, { label: string; tone: string; color: string }> = {
  scheduled: { label: 'Scheduled', tone: 'badge-info', color: '#2563eb' },
  qualified: { label: 'Qualified', tone: 'badge-success', color: '#16a34a' },
  not_qualified: { label: 'Not qualified', tone: 'badge-danger', color: '#dc2626' },
  no_show: { label: 'No-show', tone: 'badge-warning', color: '#d97706' },
  cancelled: { label: 'Cancelled', tone: 'badge-muted', color: '#94a3b8' },
}

export const MODE_LABEL: Record<MeetingMode, string> = { online: 'Online', in_person: 'In person' }
