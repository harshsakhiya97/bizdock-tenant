import { db } from '@/lib/supabase'

export type AttSettings = {
  tenant_id: string
  timezone: string
  checkin_start: string
  checkin_end: string
  half_day_hours: number
  tea_break_min: number
  lunch_break_min: number
  weekly_off: number[]
}
export type BreakRow = { id: string; kind: 'tea' | 'lunch' | 'other'; started_at: string; ended_at: string | null }
export type AttRow = {
  id: string
  member_id: string
  work_date: string
  check_in: string | null
  check_out: string | null
  is_late: boolean
  late_minutes: number
  note: string | null
  correction_reason: string | null
  attendance_breaks: BreakRow[]
}
export type Person = { id: string; name: string; weekly_off: number[] }
/** a calendar leave / holiday that affects attendance */
export type DayOff = { kind: 'holiday' | 'leave'; title: string; from: string; to: string; members: string[] }

export const DEFAULTS: Omit<AttSettings, 'tenant_id'> = {
  timezone: 'Asia/Kolkata',
  checkin_start: '09:30',
  checkin_end: '09:40',
  half_day_hours: 4,
  tea_break_min: 15,
  lunch_break_min: 30,
  weekly_off: [0],
}
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export async function getSettings(tenantId: string): Promise<AttSettings> {
  const { data } = await db().from('attendance_settings').select('*').eq('tenant_id', tenantId).maybeSingle()
  const s = (data ?? { tenant_id: tenantId, ...DEFAULTS }) as AttSettings
  return { ...s, checkin_start: s.checkin_start.slice(0, 5), checkin_end: s.checkin_end.slice(0, 5), half_day_hours: Number(s.half_day_hours) }
}

export async function saveSettings(s: AttSettings) {
  const { error } = await db().from('attendance_settings').upsert({ ...s, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function listPeople(tenantId: string): Promise<Person[]> {
  const { data, error } = await db().rpc('attendance_people', { p_tenant: tenantId })
  if (error) throw error
  return (data ?? []) as Person[]
}

export async function listAttendance(tenantId: string, from: string, to: string): Promise<AttRow[]> {
  const { data, error } = await db()
    .from('attendance')
    .select('id, member_id, work_date, check_in, check_out, is_late, late_minutes, note, correction_reason, attendance_breaks(id, kind, started_at, ended_at)')
    .eq('tenant_id', tenantId)
    .gte('work_date', from)
    .lte('work_date', to)
    .order('work_date')
  if (error) throw error
  return (data ?? []) as AttRow[]
}

/** holidays and leaves from the calendar overlapping a date range */
export async function listDaysOff(tenantId: string, from: string, to: string): Promise<DayOff[]> {
  const { data, error } = await db()
    .from('events')
    .select('title, event_date, end_date, event_types!inner(kind), event_members(member_id)')
    .eq('tenant_id', tenantId)
    .eq('is_cancelled', false)
    .in('event_types.kind', ['holiday', 'leave'])
    .lte('event_date', to)
  if (error) throw error
  type Raw = { title: string; event_date: string; end_date: string | null; event_types: { kind: 'holiday' | 'leave' }; event_members: { member_id: string }[] }
  return ((data ?? []) as unknown as Raw[])
    .map((e) => ({ kind: e.event_types.kind, title: e.title, from: e.event_date, to: e.end_date ?? e.event_date, members: e.event_members.map((m) => m.member_id) }))
    .filter((e) => e.to >= from)
}

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { error } = await db().rpc(fn, args)
  if (error) throw new Error(error.message)
}
export const checkIn = (tenantId: string, note: string) => rpc('attendance_check_in', { p_tenant: tenantId, p_note: note })
export const checkOut = (tenantId: string) => rpc('attendance_check_out', { p_tenant: tenantId })
export const breakAction = (tenantId: string, kind: 'tea' | 'lunch' | 'end') => rpc('attendance_break', { p_tenant: tenantId, p_kind: kind })
export const correct = (tenantId: string, member: string, date: string, inAt: string | null, outAt: string | null, reason: string) =>
  rpc('attendance_correct', { p_tenant: tenantId, p_member: member, p_date: date, p_in: inAt, p_out: outAt, p_reason: reason })
export const setWeeklyOff = (tenantId: string, member: string, days: number[] | null) =>
  rpc('attendance_set_weekly_off', { p_tenant: tenantId, p_member: member, p_days: days })

// ---------- calculations ----------
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—')
export const mins = (a: string, b: string | null) => Math.max(0, Math.round(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 60000))
export const hm = (m: number) => (m <= 0 ? '—' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`)

export function breakMinutes(r: AttRow) {
  return r.attendance_breaks.reduce((a, b) => a + mins(b.started_at, b.ended_at), 0)
}
/** worked = in → out (or now) minus breaks */
export function workedMinutes(r: AttRow) {
  if (!r.check_in) return 0
  return Math.max(0, mins(r.check_in, r.check_out) - breakMinutes(r))
}
/** a break longer than allowed (+5 min grace) */
export function longBreaks(r: AttRow, s: AttSettings) {
  return r.attendance_breaks.filter((b) => {
    const allowed = b.kind === 'lunch' ? s.lunch_break_min : b.kind === 'tea' ? s.tea_break_min : 30
    return b.ended_at && mins(b.started_at, b.ended_at) > allowed + 5
  }).length
}

export type DayStatus = 'present' | 'late' | 'half' | 'leave' | 'holiday' | 'off' | 'absent' | 'future' | 'in'
export function dayStatus(day: string, today: string, person: Person, row: AttRow | undefined, offs: DayOff[], s: AttSettings): DayStatus {
  const dow = new Date(`${day}T00:00:00`).getDay()
  if (offs.some((o) => o.kind === 'holiday' && o.from <= day && o.to >= day && (!o.members.length || o.members.includes(person.id)))) return 'holiday'
  if (person.weekly_off.includes(dow) && !row) return 'off'
  if (offs.some((o) => o.kind === 'leave' && o.from <= day && o.to >= day && o.members.includes(person.id))) return row?.check_in ? 'present' : 'leave'
  if (row?.check_in) {
    if (!row.check_out && day === today) return 'in'
    if (row.check_out && workedMinutes(row) < s.half_day_hours * 60) return 'half'
    return row.is_late ? 'late' : 'present'
  }
  return day > today ? 'future' : 'absent'
}

export const STATUS_LABEL: Record<DayStatus, { label: string; tone: string }> = {
  present: { label: 'On time', tone: 'badge-success' },
  late: { label: 'Late', tone: 'badge-warning' },
  half: { label: 'Half day', tone: 'badge-purple' },
  leave: { label: 'Leave', tone: 'badge-info' },
  holiday: { label: 'Holiday', tone: 'badge-danger' },
  off: { label: 'Weekly off', tone: 'badge-muted' },
  absent: { label: 'Absent', tone: 'badge-danger' },
  future: { label: '—', tone: 'badge-muted' },
  in: { label: 'Working', tone: 'badge-success' },
}
