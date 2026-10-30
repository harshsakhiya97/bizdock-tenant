/** Lead fields a landing page form field can go into (same list as private.map_lead_fields). */
export const LEAD_TARGETS = [
  { value: 'name', label: 'Full name' },
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'city', label: 'City' },
  { value: 'company_name', label: 'Company name' },
  { value: 'purpose', label: 'Purpose' },
  { value: 'lead_source', label: 'Lead source (by name)' },
  { value: 'note', label: 'Note' },
  { value: 'tags', label: 'Tags (each value a tag)' },
  { value: 'utm_source', label: 'utm_source' },
  { value: 'utm_medium', label: 'utm_medium' },
  { value: 'utm_campaign', label: 'utm_campaign' },
  { value: 'utm_term', label: 'utm_term' },
  { value: 'utm_content', label: 'utm_content' },
  { value: 'meeting_start', label: 'Meeting Start time' },
  { value: 'meeting_end', label: 'Meeting End time' },
  { value: 'meeting_duration', label: 'Meeting length (minutes)' },
  { value: 'meeting_link', label: 'Meeting link' },
  { value: 'meeting_team_member', label: 'Team member (name)' },
  { value: 'amount', label: 'Amount paid' },
  { value: 'product', label: 'Product / service' },
  { value: 'payment_id', label: 'Payment ID' },
  { value: 'extra', label: 'Keep as extra field' },
  { value: 'ignore', label: 'Ignore' },
] as const

const ALIASES: Record<string, string[]> = {
  name: ['name', 'full_name', 'fullname', 'your_name', 'customer_name', 'lead_name'],
  first_name: ['first_name', 'firstname', 'fname', 'given_name'],
  last_name: ['last_name', 'lastname', 'lname', 'surname', 'family_name'],
  phone: ['phone', 'contact', 'contact_no', 'contact_number', 'mobile', 'mobileno', 'mobile_no', 'mobile_number', 'phone_no', 'phone_number', 'whatsapp', 'whatsapp_no', 'whatsapp_number', 'number'],
  email: ['email', 'email_id', 'emailid', 'email_address', 'mail', 'e_mail'],
  city: ['city', 'town', 'location'],
  company_name: ['company', 'company_name', 'business', 'business_name', 'organization', 'organisation', 'firm'],
  purpose: ['purpose', 'reason', 'requirement', 'interest', 'interested_in', 'service'],
  note: ['note', 'notes', 'remark', 'remarks', 'message', 'comment', 'comments', 'query'],
  tags: ['tags', 'tag', 'labels'],
  meeting_start: ['meeting_start', 'booking_start', 'start_date_time', 'start_datetime', 'booking_start_time'],
  meeting_end: ['meeting_end', 'booking_end', 'end_date_time', 'end_datetime', 'booking_end_time'],
  meeting_team_member: ['meeting_team_member', 'team_member', 'employee', 'employee_name', 'staff', 'staff_name', 'host'],
}

const ACTION_ONLY: Record<string, string> = {
  meeting_start: 'create_meeting',
  meeting_end: 'create_meeting',
  meeting_duration: 'create_meeting',
  meeting_link: 'create_meeting',
  meeting_team_member: 'create_meeting',
  amount: 'purchase',
  product: 'purchase',
  payment_id: 'purchase',
}
/** the targets offered for a webhook that does `action` */
/** a meeting webhook uses only these: who (phone / email), when, and the team member who takes it */
const MEETING_TARGETS = new Set(['phone', 'email', 'meeting_start', 'meeting_end', 'meeting_team_member', 'extra', 'ignore'])
export const targetsFor = (action: string) =>
  action === 'create_meeting'
    ? LEAD_TARGETS.filter((t) => MEETING_TARGETS.has(t.value))
    : LEAD_TARGETS.filter((t) => !ACTION_ONLY[t.value] || ACTION_ONLY[t.value] === action)

/** what a form field name is taken as when it isn't mapped by hand */
export function guessTarget(key: string, action = 'create_lead'): string {
  if (key.startsWith('utm_')) return LEAD_TARGETS.some((t) => t.value === key) ? key : 'extra'
  for (const [target, names] of Object.entries(ALIASES))
    if (names.includes(key) && (!ACTION_ONLY[target] || ACTION_ONLY[target] === action)) return target
  return 'extra'
}

export const targetLabel = (v: string) => LEAD_TARGETS.find((t) => t.value === v)?.label ?? v

/** the field names a webhook understands without any mapping, for the help text */
export const KNOWN_NAMES = ALIASES
