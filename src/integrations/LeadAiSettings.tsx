import { Checkbox, Hint, Label, Select, TextArea } from '@/components/Field'
import { SearchSelect } from '@/components/SearchSelect'

/** System Connections: the Lead AI Insights settings kept on the Gemini AI / Claude API connections */
export const LEAD_AI_KEYS: Record<string, string[]> = { gemini: ['li_on', 'li_prompt', 'li_fallback', 'li_when'], claude: ['li_model'] }

/** the prompt BizDock uses when li_prompt is empty (same as the lead-insight edge function) */
export const LEAD_AI_PROMPT = `You are a sales assistant for an Indian business. Below is everything the CRM knows about one lead (a possible customer): the lead's details, follow-up calls and their comments, notes, phone call transcripts (Hindi / English / Hinglish), meetings, bookings and payments, and WhatsApp messages. The lead's name, phone numbers and emails are hidden ("the lead", [phone], [email]).

Write a short, practical summary for the business's team, in simple English, as JSON:
- summary: 2–3 lines: who the lead is, what they want, where things stand now.
- interest: level "hot" (ready to buy / book soon), "warm" (interested, not decided) or "cold" (not interested, not reachable, or no reply); why: one line.
- needs, budget, timeline: one short line each; "Not mentioned" when nothing says it.
- objections: what holds them back (price, time, trust, …), short items; empty if none.
- next_action: the one best thing the team should do next (what, and when if it's clear).
- risks: what could make this lead go cold or be lost, short items; empty if none.
Use only what the records say; don't invent facts. Dates are in India time.`

const WHEN: [string, string, string][] = [
  ['busy', 'Gemini is busy', 'Rate limit / “high demand” (tried once more after 2–3 seconds first)'],
  ['error', 'Server error or timeout', 'Google’s side fails or doesn’t answer'],
  ['bad_answer', 'Unreadable answer', 'Gemini’s reply can’t be used'],
  ['not_connected', 'Gemini not connected', 'No Gemini key, or the connection is turned off'],
]

type Props = { values: Record<string, string>; setValues: (v: Record<string, string>) => void }

/** Gemini AI → Prompt & steps → Lead AI Insights */
export function GeminiLeadAi({ values, setValues }: Props) {
  const set = (k: string, v: string) => setValues({ ...values, [k]: v })
  const when = new Set((values.li_when ?? WHEN.map((w) => w[0]).join(',')).split(',').filter(Boolean))
  const fallback = values.li_fallback !== 'off'
  return (
    <div className="int-guide stack" style={{ gap: 12 }}>
      <b>Lead AI Insights</b>
      <p className="muted small" style={{ margin: 0 }}>
        The AI summary on each lead’s page (Details → AI Insights). It’s written again a minute after the lead changes; names and phone numbers are hidden from the AI. Press Save to keep changes.
      </p>
      <div>
        <Label htmlFor="li-on">Lead summaries</Label>
        <Select id="li-on" value={values.li_on === 'off' ? 'off' : 'on'} onChange={(e) => set('li_on', e.target.value)}>
          <option value="on">On</option>
          <option value="off">Off</option>
        </Select>
      </div>
      <div>
        <div className="row-between">
          <Label htmlFor="li-prompt">Prompt</Label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('li_prompt', LEAD_AI_PROMPT)}>
            Fill in the default
          </button>
        </div>
        <TextArea id="li-prompt" rows={8} value={values.li_prompt ?? ''} placeholder="Empty: BizDock’s default prompt (press Fill in the default to see and change it)" onChange={(e) => set('li_prompt', e.target.value)} />
        <Hint>What the AI is told. The answer’s fields (summary, interest, needs, budget, timeline, objections, next action, risks) stay the same.</Hint>
      </div>
      <Checkbox id="li-fallback" checked={fallback} onChange={(on) => set('li_fallback', on ? 'on' : 'off')} label="If Gemini fails, use Claude" description="Uses System Connections → Claude API (its model for lead summaries is set there)." />
      {fallback && (
        <div className="stack" style={{ gap: 6, paddingLeft: 26 }}>
          <span className="field-label">Fails means</span>
          {WHEN.map(([k, label, hint]) => (
            <Checkbox
              key={k}
              id={`li-when-${k}`}
              checked={when.has(k)}
              label={label}
              description={hint}
              onChange={(on) => {
                const n = new Set(when)
                if (on) n.add(k)
                else n.delete(k)
                set('li_when', [...n].join(','))
              }}
            />
          ))}
          <Hint>Claude’s cost counts in the same monthly AI limit (Keys tab); once it’s used up, both stop.</Hint>
        </div>
      )}
    </div>
  )
}

/** Claude API → Prompt & steps → the model for lead summaries */
export function ClaudeLeadAi({ values, setValues, models }: Props & { models: { id: string; name: string }[] | null }) {
  return (
    <div className="int-guide stack" style={{ gap: 10 }}>
      <b>Lead AI Insights (when Gemini fails)</b>
      <p className="muted small" style={{ margin: 0 }}>
        Claude writes a lead’s summary only when Gemini fails (turned on in Gemini AI → Prompt &amp; steps). Only text: call recordings stay with Gemini.
      </p>
      <div>
        <Label htmlFor="li-model">Model for lead summaries</Label>
        <SearchSelect
          id="li-model"
          value={values.li_model || null}
          disabled={!models?.length}
          placeholder={models?.length ? 'Default: the cheapest Haiku' : 'Save the key first to list the models'}
          searchPlaceholder="Search models…"
          options={[{ value: '', label: 'Default: the cheapest Haiku' }, ...(models ?? []).map((m) => ({ value: m.id, label: m.name === m.id ? m.id : `${m.name} (${m.id})` }))]}
          onChange={(v) => setValues({ ...values, li_model: v ?? '' })}
        />
        <Hint>Haiku is fast and cheap (about ₹0.3–0.5 a lead); Sonnet writes a little better and costs a few times more.</Hint>
      </div>
    </div>
  )
}
