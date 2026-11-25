import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Layers, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, Hint, Label, Select, TextArea } from '@/components/Field'
import { SearchSelect } from '@/components/SearchSelect'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'
import type { IntegrationRow } from './api'

type Provider = 'gemini' | 'claude'
type Level = { provider: Provider; model: string }
type Feature = 'lead_insight' | 'insights' | 'ai_call_template'
type Route = { feature: Feature; enabled: boolean; levels: Level[]; fail_on: string[]; prompt: string | null }

const FEATURES: { id: Feature; name: string; hint: string }[] = [
  { id: 'lead_insight', name: 'Lead AI Insights', hint: 'Each lead’s summary (lead page → Details → AI Insights)' },
  { id: 'insights', name: 'AI Insights', hint: 'The AI Insights button on every page' },
  { id: 'ai_call_template', name: 'Write with AI', hint: 'AI Calling → Templates → Write with AI' },
]
const PROVIDER_NAME: Record<Provider, string> = { gemini: 'Gemini', claude: 'Claude' }
const FAILS: [string, string, string][] = [
  ['busy', 'Busy', 'Rate limit / “high demand” (Gemini is tried once more after 2–3 seconds first)'],
  ['error', 'Server error or timeout', 'The AI’s side fails or doesn’t answer'],
  ['bad_answer', 'Unreadable answer', 'The reply can’t be used'],
  ['not_connected', 'Not connected', 'No key, or the connection is turned off'],
]
const ALL_FAILS = FAILS.map((f) => f[0])
const MAX_LEVELS = 3
const fresh = (feature: Feature): Route => ({ feature, enabled: true, levels: [{ provider: 'gemini', model: '' }, { provider: 'claude', model: '' }], fail_on: ALL_FAILS, prompt: null })

/** the prompt BizDock uses for lead summaries when none is set (same as the lead-insight edge function) */
export const LEAD_AI_PROMPT = `You are a sales assistant for an Indian business. Below is everything the CRM knows about one lead (a possible customer): the lead's details, follow-up calls and their comments, notes, phone call transcripts (Hindi / English / Hinglish), AI calls (an AI voice agent's calls with their transcripts), meetings, bookings and payments, and WhatsApp messages. The lead's name, phone numbers and emails are hidden ("the lead", [phone], [email]).

Write a short, practical summary for the business's team, in simple English, as JSON:
- summary: 2–3 lines: who the lead is, what they want, where things stand now.
- interest: level "hot" (ready to buy / book soon), "warm" (interested, not decided) or "cold" (not interested, not reachable, or no reply); why: one line.
- needs, budget, timeline: one short line each; "Not mentioned" when nothing says it.
- objections: what holds them back (price, time, trust, …), short items; empty if none.
- next_action: the one best thing the team should do next (what, and when if it's clear).
- risks: what could make this lead go cold or be lost, short items; empty if none.
- asked_for: what the lead asked the business for, in their own words where possible (more details on a product or package, a price list, a call back at a time, a demo, a document on WhatsApp, …), short items, newest first; empty if none.
Use only what the records say; don't invent facts. Dates are in India time.`

type Conns = Partial<Record<Provider, IntegrationRow>>
const modelsOf = (r?: IntegrationRow): { id: string; name: string }[] => {
  try {
    return r?.config.models ? JSON.parse(r.config.models) : []
  } catch {
    return []
  }
}

/** System Connections → AI order: which AI each feature tries first, then next when it fails */
export function AiOrderCard({ conns, canEdit }: { conns: Conns; canEdit: boolean }) {
  const tenant = useTenant()
  const [routes, setRoutes] = useState<Route[] | null>(null)
  const [open, setOpen] = useState(false)
  const load = useCallback(() => {
    db()
      .from('ai_routes')
      .select('feature, enabled, levels, fail_on, prompt')
      .eq('tenant_id', tenant.id)
      .then(({ data }) => setRoutes(FEATURES.map((f) => ((data ?? []) as Route[]).find((r) => r.feature === f.id) ?? fresh(f.id))))
  }, [tenant.id])
  useEffect(load, [load])
  const levelText = (l: Level) => `${PROVIDER_NAME[l.provider]}${l.model ? ` · ${l.model}` : ''}${conns[l.provider]?.is_enabled ? '' : ' (not connected)'}`

  return (
    <section className="card int-card">
      <div className="int-top">
        <div className="int-icon" style={{ ['--c' as string]: '#6366f1' }}>
          <Layers size={20} />
        </div>
        <div className="int-title">
          <b>AI order</b>
          <span className="badge badge-brand">Level 1 → 2 → 3</span>
        </div>
      </div>
      <p className="int-desc">Which AI each feature uses first, and which one takes over when it fails. Change the order here any time: it works that way straight away.</p>
      <div className="int-summary ai-order-list" style={{ cursor: 'default' }}>
        {(routes ?? []).map((r) => {
          const f = FEATURES.find((x) => x.id === r.feature)!
          return (
            <div key={r.feature} className="ai-order-row">
              <b>{f.name}</b>
              {r.enabled ? (
                <span className="muted small">
                  {r.levels.map((l, i) => (
                    <span key={i}>
                      {i ? ' → ' : ''}
                      <span className="ai-order-lvl">L{i + 1}</span> {levelText(l)}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="muted small">Off</span>
              )}
            </div>
          )
        })}
        <div className="muted small">Call transcripts stay with Gemini (they send the recording; Claude can’t take audio).</div>
      </div>
      <div className="int-foot">
        <span className="muted small">One monthly AI limit for every AI (Gemini AI → Settings)</span>
        {canEdit && (
          <Button variant="outline" onClick={() => setOpen(true)} disabled={!routes}>
            Settings
          </Button>
        )}
      </div>
      {open && routes && (
        <AiOrderDrawer
          routes={routes}
          conns={conns}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            load()
          }}
        />
      )}
    </section>
  )
}

function AiOrderDrawer({ routes, conns, onClose, onSaved }: { routes: Route[]; conns: Conns; onClose: () => void; onSaved: () => void }) {
  const tenant = useTenant()
  const [draft, setDraft] = useState<Route[]>(() => routes.map((r) => ({ ...r, levels: r.levels.map((l) => ({ ...l })), fail_on: [...r.fail_on] })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (i: number, r: Partial<Route>) => setDraft((d) => d.map((x, k) => (k === i ? { ...x, ...r } : x)))

  async function save() {
    for (const r of draft) if (r.enabled && !r.levels.length) return setError(`${FEATURES.find((f) => f.id === r.feature)!.name}: add at least one level.`)
    setBusy(true)
    setError(null)
    const { error: e } = await db()
      .from('ai_routes')
      .upsert(draft.map((r) => ({ tenant_id: tenant.id, feature: r.feature, enabled: r.enabled, levels: r.levels, fail_on: r.fail_on, prompt: r.prompt?.trim() || null, updated_at: new Date().toISOString() })))
    setBusy(false)
    if (e) return setError(e.message)
    onSaved()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={600}
      title="AI order"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <p className="muted small" style={{ margin: 0 }}>
          Level 1 is tried first. When it fails in one of the ticked ways, Level 2 is tried, then Level 3. An empty model uses the connection’s own model (System Connections → that AI → Settings).
        </p>
        {draft.map((r, i) => {
          const f = FEATURES.find((x) => x.id === r.feature)!
          return (
            <section key={r.feature} className="ai-order-box">
              <div className="row-between">
                <div>
                  <b>{f.name}</b>
                  <div className="muted small">{f.hint}</div>
                </div>
                <label className="switch" title={r.enabled ? 'Turn off' : 'Turn on'}>
                  <input type="checkbox" checked={r.enabled} onChange={() => set(i, { enabled: !r.enabled })} />
                </label>
              </div>
              {r.enabled && (
                <>
                  <div className="stack" style={{ gap: 8 }}>
                    {r.levels.map((l, k) => {
                      const models = modelsOf(conns[l.provider])
                      const move = (to: number) => {
                        const lv = [...r.levels]
                        ;[lv[k], lv[to]] = [lv[to], lv[k]]
                        set(i, { levels: lv })
                      }
                      return (
                        <div key={k} className="ai-level">
                          <span className="ai-order-lvl">L{k + 1}</span>
                          <Select
                            aria-label={`Level ${k + 1} AI`}
                            value={l.provider}
                            onChange={(e) => set(i, { levels: r.levels.map((x, n) => (n === k ? { provider: e.target.value as Provider, model: '' } : x)) })}
                          >
                            <option value="gemini">Gemini{conns.gemini?.is_enabled ? '' : ' (not connected)'}</option>
                            <option value="claude">Claude{conns.claude?.is_enabled ? '' : ' (not connected)'}</option>
                          </Select>
                          <SearchSelect
                            ariaLabel={`Level ${k + 1} model`}
                            value={l.model || ''}
                            placeholder="Connection’s model"
                            searchPlaceholder="Search models…"
                            options={[{ value: '', label: `Connection’s model${conns[l.provider]?.config.model ? ` (${conns[l.provider]!.config.model})` : ''}` }, ...models.map((m) => ({ value: m.id, label: m.name === m.id ? m.id : `${m.name} (${m.id})` }))]}
                            onChange={(v) => set(i, { levels: r.levels.map((x, n) => (n === k ? { ...x, model: v ?? '' } : x)) })}
                          />
                          <div className="row" style={{ gap: 2 }}>
                            <button type="button" className="btn btn-ghost btn-icon" title="Up" disabled={k === 0} onClick={() => move(k - 1)}>
                              <ArrowUp size={15} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-icon" title="Down" disabled={k === r.levels.length - 1} onClick={() => move(k + 1)}>
                              <ArrowDown size={15} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-icon danger-text" title="Remove" disabled={r.levels.length === 1} onClick={() => set(i, { levels: r.levels.filter((_, n) => n !== k) })}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {r.levels.length < MAX_LEVELS && (
                      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set(i, { levels: [...r.levels, { provider: r.levels.at(-1)?.provider === 'gemini' ? 'claude' : 'gemini', model: '' }] })}>
                        <Plus size={14} /> Add level {r.levels.length + 1}
                      </button>
                    )}
                  </div>
                  {r.levels.length > 1 && (
                    <div className="stack" style={{ gap: 6 }}>
                      <span className="field-label">Move to the next level when it’s</span>
                      {FAILS.map(([k, label, hint]) => (
                        <Checkbox
                          key={k}
                          id={`fail-${r.feature}-${k}`}
                          checked={r.fail_on.includes(k)}
                          label={label}
                          description={hint}
                          onChange={(on) => set(i, { fail_on: on ? [...r.fail_on, k] : r.fail_on.filter((x) => x !== k) })}
                        />
                      ))}
                    </div>
                  )}
                  {r.feature === 'lead_insight' && (
                    <div>
                      <div className="row-between">
                        <Label htmlFor="li-prompt">Prompt</Label>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => set(i, { prompt: LEAD_AI_PROMPT })}>
                          Fill in the default
                        </button>
                      </div>
                      <TextArea id="li-prompt" rows={7} value={r.prompt ?? ''} placeholder="Empty: BizDock’s default prompt (press Fill in the default to see and change it)" onChange={(e) => set(i, { prompt: e.target.value })} />
                      <Hint>What the AI is told. The answer’s fields (summary, interest, needs, budget, timeline, objections, next action, risks) stay the same. Names and phone numbers are hidden from it.</Hint>
                    </div>
                  )}
                </>
              )}
            </section>
          )
        })}
      </div>
    </Drawer>
  )
}
