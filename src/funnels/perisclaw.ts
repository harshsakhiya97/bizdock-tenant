import { guessTarget } from './fieldMap'

/** Lead fields a part of the lead message can go to, with the sheet column name used for it (in sheet order). */
export const LEAD_FIELDS = [
  { value: 'name', label: 'Full name', column: 'Name' },
  { value: 'email', label: 'Email', column: 'Email' },
  { value: 'phone', label: 'Phone', column: 'Contact No' },
  { value: 'city', label: 'City', column: 'City' },
  { value: 'company_name', label: 'Company name', column: 'Company' },
  { value: 'purpose', label: 'Purpose', column: 'Purpose' },
  { value: 'note', label: 'Note', column: 'Note' },
] as const

/** a new sheet starts with these columns until its Perisclaw setup is saved */
export const SHEET_FIELD_MAP: Record<string, string> = {
  'Sr No': 'ignore',
  Name: 'name',
  Email: 'email',
  'Contact No': 'phone',
  City: 'city',
  Purpose: 'purpose',
  Reason: 'note',
}

/** message part → lead field value, or "extra:<column name>" for an extra field shown on the lead ('' = leave out) */
export type PerisclawSetup = { example: string; map: Record<string, string> }
export type MessagePart = { label: string; value: string }
export const isExtra = (v: string) => v.startsWith('extra:')
export const extraName = (v: string) => v.slice(6).trim()

const norm = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

/** "Name: Rahul" / "*Mobile* - 98250…" lines of an example lead message → { label, value } */
export function parseExample(text: string): MessagePart[] {
  const out: MessagePart[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[*_~`]/g, '').replace(/^[\s•●▪\-–>]+/, '').trim()
    const m = line.match(/^([^:=]{1,60}?)\s*(?::|=|\s[-–]\s)\s*(.+)$/)
    if (m && m[1].trim() && m[2].trim() && !out.some((p) => p.label === m[1].trim())) out.push({ label: m[1].trim(), value: m[2].trim() })
  }
  return out
}

// setups saved before lead fields were offered stored our old column names
const OLD: Record<string, string> = { Name: 'name', Email: 'email', 'Contact No': 'phone', City: 'city', Purpose: 'purpose', Reason: 'note' }
export const fromSaved = (v: string) => OLD[v] ?? v

/** which lead field a label from the message most likely is ('' = leave out) */
export function guessField(label: string): string {
  const t = guessTarget(norm(label))
  return LEAD_FIELDS.some((f) => f.value === t) ? t : ''
}

/** the sheet columns (row 1) for a mapping: Sr No, the lead fields used (fixed order), then the extra fields */
export function sheetColumns(map: Record<string, string>) {
  const used = new Set(Object.values(map))
  const extras = [...new Set(Object.values(map).filter(isExtra).map(extraName).filter(Boolean))]
  return [
    { name: 'Sr No', target: 'ignore' },
    ...LEAD_FIELDS.filter((f) => used.has(f.value)).map((f) => ({ name: f.column, target: f.value as string })),
    ...extras.map((e) => ({ name: e, target: 'extra' })),
  ]
}

/** sheet column → lead field, saved as the sheet's mapping */
export const fieldMapFor = (map: Record<string, string>) => Object.fromEntries(sheetColumns(map).map((c) => [c.name, c.target]))

/** the message the user sends to Perisclaw so it saves every lead into the sheet with these columns */
export function perisclawMessage(sheetUrl: string, parts: MessagePart[], map: Record<string, string>, example: string) {
  const cols = sheetColumns(map)
  const lines = cols.map((c) => {
    if (c.name === 'Sr No') return '- Sr No: the next number (1, 2, 3…)'
    const src = parts.filter((p) => (c.target === 'extra' ? extraName(map[p.label] ?? '') === c.name : map[p.label] === c.target)).map((p) => `"${p.label}"`)
    return `- ${c.name}: ${src.join(' + ')} from the message`
  })
  return [
    'Hi Perisclaw, please save every new lead message I get on WhatsApp (like the example below) as a new row in this Google Sheet:',
    sheetUrl,
    '',
    `Row 1 has these column names, in this order: ${cols.map((c) => c.name).join(' | ')}`,
    'Don’t rename, reorder or add columns. One lead = one new row at the bottom; don’t change rows already there.',
    '',
    'Fill the columns like this:',
    ...lines,
    'If a value isn’t in the message, leave that cell empty. Write the phone number with digits only.',
    '',
    'Example lead message:',
    example.trim(),
  ].join('\n')
}
