import { guessTarget } from './fieldMap'

/** The sheet columns we ask Perisclaw to fill (row 1, in this order) and the lead field each one is saved to. */
export const SHEET_COLUMNS = [
  { name: 'Sr No', target: 'ignore', hint: '1, 2, 3…' },
  { name: 'Name', target: 'name' },
  { name: 'Email', target: 'email' },
  { name: 'Contact No', target: 'phone' },
  { name: 'City', target: 'city' },
  { name: 'Purpose', target: 'purpose' },
  { name: 'Reason', target: 'note' },
] as const

/** column → lead field, used as the sheet's mapping */
export const SHEET_FIELD_MAP: Record<string, string> = Object.fromEntries(SHEET_COLUMNS.map((c) => [c.name, c.target]))

export type PerisclawSetup = { example: string; map: Record<string, string> }
export type MessagePart = { label: string; value: string }

const norm = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

/** "Name: Rahul" / "*Mobile* - 98250…" lines of an example lead message → { label, value } */
export function parseExample(text: string): MessagePart[] {
  const out: MessagePart[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[*_~`]/g, '').replace(/^[\s•●▪\-–>]+/, '').trim()
    const m = line.match(/^([^:=]{1,40}?)\s*(?::|=|\s[-–]\s)\s*(.+)$/)
    if (m && m[1].trim() && m[2].trim() && !out.some((p) => p.label === m[1].trim())) out.push({ label: m[1].trim(), value: m[2].trim() })
  }
  return out
}

/** which of our columns a label from the message most likely is ('' = leave out) */
export function guessColumn(label: string): string {
  const k = norm(label)
  if (/^(sr|s)_?no$|^serial/.test(k)) return 'Sr No'
  if (k.includes('reason')) return 'Reason'
  const t = guessTarget(k)
  return SHEET_COLUMNS.find((c) => c.target === t && c.target !== 'ignore')?.name ?? ''
}

/** the message the user sends to Perisclaw so it saves every lead into the sheet with our columns */
export function perisclawMessage(sheetUrl: string, parts: MessagePart[], map: Record<string, string>, example: string) {
  const from = (col: string) => parts.filter((p) => map[p.label] === col).map((p) => `"${p.label}"`)
  const lines = SHEET_COLUMNS.map((c) => {
    if (c.name === 'Sr No') return `- Sr No: the next number (1, 2, 3…)`
    const src = from(c.name)
    return `- ${c.name}: ${src.length ? `${src.join(' + ')} from the message` : 'leave empty'}`
  })
  return [
    'Hi Perisclaw, please save every new lead message I get on WhatsApp (like the example below) as a new row in this Google Sheet:',
    sheetUrl,
    '',
    `Row 1 has these column names, in this order: ${SHEET_COLUMNS.map((c) => c.name).join(' | ')}`,
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
