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
  { value: 'note', label: 'Note' },
  { value: 'utm_source', label: 'utm_source' },
  { value: 'utm_medium', label: 'utm_medium' },
  { value: 'utm_campaign', label: 'utm_campaign' },
  { value: 'utm_term', label: 'utm_term' },
  { value: 'utm_content', label: 'utm_content' },
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
}

/** what a form field name is taken as when it isn't mapped by hand */
export function guessTarget(key: string): string {
  if (key.startsWith('utm_')) return LEAD_TARGETS.some((t) => t.value === key) ? key : 'extra'
  for (const [target, names] of Object.entries(ALIASES)) if (names.includes(key)) return target
  return 'extra'
}

export const targetLabel = (v: string) => LEAD_TARGETS.find((t) => t.value === v)?.label ?? v

/** the field names a webhook understands without any mapping, for the help text */
export const KNOWN_NAMES = ALIASES
