import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { PlayRecording } from '@/callyzer/PlayRecording'
import { TranscriptCell, type TranscriptStatus } from '@/callyzer/CallTranscript'
import { Paged } from '@/components/ui'
import { Bot, MessageCircle, PhoneCall, PhoneIncoming, PhoneOutgoing, X } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Hint, Label, Select } from '@/components/Field'
import { clearLeadFollowUps, listOutcomes, scheduleFollowUp } from '@/followups/api'
import { logActivity } from '@/leads/api'
import { setLeadCategory } from '@/leads/CategorySelect'
import { CALL_CATEGORIES, ENDS_FOLLOW_UPS } from '@/leads/labels'
import type { MemberOption, Option, Temperature } from '@/leads/types'
import { db } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { Conversation } from '@/integrations/WaLogsPage'
import { listLeadMessages } from './api'
import type { LeadMessage } from './types'

type Fu = {
  id: string
  due_at: string
  mode: string
  purpose: string | null
  status: string
  outcome_id: string | null
  result_note: string | null
  completed_at: string | null
  completed_by: string | null
  assigned_to: string | null
  created_by: string | null
}

/** a phone call from Callyzer (or the old CRM's Callyzer log): shown, not edited */
type CallRow = {
  id: string
  direction: string
  started_at: string
  duration_sec: number | null
  agent_phone: string | null
  member_id: string | null
  emp_name: string | null
  recording_url: string | null
  recording_path: string | null
  transcript_status?: TranscriptStatus
  call_method: string | null
}
/** a WATI message of the lead */
type WaLog = { id: string; direction: string; template: string | null; body: string | null; status: string; sent_at: string; sent_by: string | null }
const secs = (n: number | null) => (!n ? '0s' : n >= 60 ? `${Math.floor(n / 60)}m ${n % 60}s` : `${n}s`)
const DIR: Record<string, string> = { incoming: 'Incoming', outgoing: 'Outgoing', missed: 'Missed', rejected: 'Rejected', unknown: '—' }

const dayPlus = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** Follow-ups of one lead: Calls (log a call + next follow-up) and WhatsApp (messages sent). */
export function FollowUpsTab({
  leadId,
  members,
  canEdit,
  onWhatsApp,
  onChanged,
  refreshKey,
  ai,
  openAi,
}: {
  leadId: string
  members: MemberOption[]
  canEdit: boolean
  onWhatsApp: () => void
  onChanged: (msg: string) => void
  /** bump to reload (after a WhatsApp is sent from the header) */
  refreshKey: number
  /** the AI Calls sub-tab (the lead page's AI calls list and its count) */
  ai?: { count: number | null; node: ReactNode; onCall?: () => void }
  /** bump to open the AI Calls sub-tab (after a call is placed) */
  openAi?: number
}) {
  const tenant = useTenant()
  const { membership } = useAuth()
  const me = membership?.id
  const [tab, setTab] = useState<'calls' | 'callyzer' | 'whatsapp' | 'ai'>(() => (openAi && ai ? 'ai' : 'calls'))
  useEffect(() => {
    if (openAi && ai) setTab('ai')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAi])
  const [phoneCalls, setPhoneCalls] = useState<CallRow[] | null>(null)
  const [wati, setWati] = useState<WaLog[]>([])
  const [fus, setFus] = useState<Fu[] | null>(null)
  const [msgs, setMsgs] = useState<LeadMessage[] | null>(null)
  const [leadPhone, setLeadPhone] = useState('')
  const [outcomes, setOutcomes] = useState<Option[]>([])
  // the log-a-call form (completing = the pending follow-up being closed)
  const [completing, setCompleting] = useState<Fu | null>(null)
  const [outcome, setOutcome] = useState('')
  const [summary, setSummary] = useState('')
  const [next, setNext] = useState('')
  const [nextTime, setNextTime] = useState('11:00')
  // the lead's category with the call: Hot / Warm / Cold need the next call; Not interested / Closed end the follow-ups
  const [leadCat, setLeadCat] = useState<Temperature | null>(null)
  const [cat, setCat] = useState<Temperature | ''>('')
  const ends = !!cat && ENDS_FOLLOW_UPS.includes(cat)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    db()
      .from('follow_ups')
      .select('id, due_at, mode, purpose, status, outcome_id, result_note, completed_at, completed_by, assigned_to, created_by')
      .eq('lead_id', leadId)
      .order('due_at', { ascending: false })
      .then(({ data }) => setFus((data ?? []) as Fu[]))
    listLeadMessages(leadId).then(setMsgs).catch(() => setMsgs([]))
    // Callyzer calls: every call with the lead's number
    void (async () => {
      const { data: l } = await db().from('leads').select('phone, temperature').eq('id', leadId).maybeSingle()
      const t = (l?.temperature ?? null) as Temperature | null
      setLeadCat(t)
      setCat(t && CALL_CATEGORIES.some((c) => c.value === t) ? t : '')
      const ph = String(l?.phone ?? '').replace(/\D/g, '').slice(-10)
      setLeadPhone(ph.length === 10 ? ph : '')
      if (ph.length < 10) return setPhoneCalls([])
      // WhatsApp (WATI) messages: every message with the lead's number
      db()
        .from('whatsapp_logs')
        .select('id, direction, template, body, status, sent_at, sent_by')
        .eq('tenant_id', tenant.id)
        .in('phone', [ph, `91${ph}`])
        .order('sent_at', { ascending: false })
        .then(({ data }) => setWati((data ?? []) as WaLog[]))
      const { data } = await db()
        .from('calls')
        .select('id, direction, started_at, duration_sec, agent_phone, member_id, emp_name, recording_url, recording_path, call_method, transcript_status')
        .eq('tenant_id', tenant.id)
        .eq('phone', ph)
        .order('started_at', { ascending: false })
      setPhoneCalls((data ?? []) as CallRow[])
    })()

  }, [leadId, tenant.id])
  useEffect(load, [load, refreshKey])
  useEffect(() => {
    void listOutcomes(tenant.id).then(setOutcomes)
  }, [tenant.id])

  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? '—'
  const outcomeName = (id: string | null) => outcomes.find((o) => o.id === id)?.name
  const calls = (fus ?? []).filter((f) => f.mode === 'call' && f.status !== 'rescheduled' && f.status !== 'cancelled')
  const pending = calls.filter((f) => f.status === 'pending').sort((a, b) => a.due_at.localeCompare(b.due_at))
  const done = calls.filter((f) => f.status === 'done')
  const waPending = (fus ?? []).filter((f) => f.mode === 'whatsapp' && f.status === 'pending')
  // a workflow's WhatsApp is kept twice (WATI's log and a copy on the lead): show it once
  const ownMsgs = (msgs ?? []).filter(
    (m) => !wati.some((w) => w.direction === 'out' && w.template && w.template === m.title && Math.abs(new Date(w.sent_at).getTime() - new Date(m.sent_at).getTime()) < 120_000),
  )

  async function logCall() {
    if (!summary.trim()) return setError('Write what was discussed.')
    if (!outcome) return setError('Pick the call outcome.')
    if (!cat) return setError('Pick the lead’s category.')
    if (!ends && !next) return setError('Pick the next call date.')
    setBusy(true)
    setError(null)
    try {
      const now = new Date().toISOString()
      const patch = { status: 'done', outcome_id: outcome, result_note: summary.trim(), completed_at: now, completed_by: me ?? null }
      const { error: e } = completing
        ? await db().from('follow_ups').update(patch).eq('id', completing.id)
        : await db().from('follow_ups').insert({ ...patch, tenant_id: tenant.id, lead_id: leadId, due_at: now, mode: 'call', assigned_to: me ?? null, created_by: me ?? null })
      if (e) throw new Error(e.message)
      await logActivity(tenant.id, me, [leadId], { kind: 'note', note: `Call · ${outcomeName(outcome) ?? ''} · ${summary.trim()}` })
      if (!ends) await scheduleFollowUp(tenant.id, me, { lead_id: leadId, due_at: `${next}T${nextTime || '11:00'}`, mode: 'call', purpose: '', assigned_to: me ?? '' }, true)
      if (cat !== leadCat) await setLeadCategory(tenant.id, me, leadId, cat)
      // Not interested / Closed: no more follow-ups
      if (ends) await clearLeadFollowUps(leadId)
      setSummary('')
      setOutcome('')
      setNext('')
      setCompleting(null)
      load()
      onChanged(ends ? 'Call logged; no more follow-ups for this lead.' : 'Call logged and next follow-up set.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function cancel(f: Fu) {
    await db().from('follow_ups').update({ status: 'cancelled' }).eq('id', f.id)
    load()
  }

  return (
    <div className="stack">
      <div className="row-between">
        <div className="seg seg-sm">
          <button type="button" className={cn(tab === 'calls' && 'is-active')} onClick={() => setTab('calls')}>
            <PhoneCall size={14} /> Calls <span className="muted small">{done.length + pending.length}</span>
          </button>
          <button type="button" className={cn(tab === 'callyzer' && 'is-active')} onClick={() => setTab('callyzer')}>
            <PhoneIncoming size={14} /> Callyzer <span className="muted small">{phoneCalls?.length ?? 0}</span>
          </button>
          <button type="button" className={cn(tab === 'whatsapp' && 'is-active')} onClick={() => setTab('whatsapp')}>
            <MessageCircle size={14} /> WhatsApp <span className="muted small">{ownMsgs.length + wati.length}</span>
          </button>
          {ai && (
            <button type="button" className={cn(tab === 'ai' && 'is-active')} onClick={() => setTab('ai')}>
              <Bot size={14} /> AI Calls <span className="muted small">{ai.count ?? 0}</span>
            </button>
          )}
        </div>
        {tab === 'ai' && ai?.onCall && (
          <button type="button" className="btn btn-primary btn-sm" onClick={ai.onCall}>
            <PhoneOutgoing size={14} /> Call from AI
          </button>
        )}
        {tab === 'whatsapp' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onWhatsApp}>
            <MessageCircle size={14} /> Send WhatsApp
          </button>
        )}
      </div>

      {tab === 'ai' && ai?.node}
      {tab === 'calls' && (
        <>
          {canEdit && (
            <section className="card card-pad stack" style={{ gap: 12 }}>
              <div className="row-between">
                <b>{completing ? `Close the follow-up due ${when(completing.due_at)}` : 'Log a call'}</b>
                {completing && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCompleting(null)}>
                    <X size={14} /> Not this one
                  </button>
                )}
              </div>
              <div className="form-grid fc-grid">
                <div>
                  <Label htmlFor="fc-out" required>
                    Outcome
                  </Label>
                  <Select id="fc-out" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                    <option value="">— select —</option>
                    {outcomes.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="fc-cat" required>
                    Lead category
                  </Label>
                  <Select id="fc-cat" value={cat} onChange={(e) => setCat(e.target.value as Temperature | '')}>
                    <option value="">— select —</option>
                    {CALL_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </div>
                {ends ? (
                  <div className="span-2 muted small" style={{ alignSelf: 'center' }}>
                    No next call is needed; any pending follow-up for this lead is cancelled.
                  </div>
                ) : (
                  <>
                    <div>
                      <Label htmlFor="fc-next" required>
                        Next call date
                      </Label>
                      <input id="fc-next" className="input" type="date" value={next} onChange={(e) => setNext(e.target.value)} />
                      <div className="quick-links">
                        <button type="button" onClick={() => setNext(dayPlus(1))}>Tomorrow</button>·
                        <button type="button" onClick={() => setNext(dayPlus(3))}>+3 days</button>·
                        <button type="button" onClick={() => setNext(dayPlus(7))}>+7 days</button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="fc-time" required>
                        Time
                      </Label>
                      <input id="fc-time" className="input" type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} />
                    </div>
                  </>
                )}
                <div className="fc-full">
                  <Label htmlFor="fc-sum" required>
                    Conversation summary
                  </Label>
                  <textarea id="fc-sum" className="input" rows={2} placeholder="What was discussed, rate quoted, client response" value={summary} onChange={(e) => setSummary(e.target.value)} />
                </div>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                {error && <span className="err-text">{error}</span>}
                <button type="button" className="btn btn-primary" onClick={logCall} disabled={busy}>
                  {busy ? 'Saving…' : 'Save call'}
                </button>
              </div>
              <Hint>Hot / Warm / Cold need the next call date (it replaces the pending one, so the lead always has one next date). Not interested / Closed end the follow-ups.</Hint>
            </section>
          )}

          {pending.length > 0 && (
            <div className="fu-list">
              {pending.map((f) => {
                const overdue = new Date(f.due_at) < new Date()
                return (
                  <div key={f.id} className="fu-item is-pending">
                    <div>
                      <b className={cn(overdue && 'text-danger')}>
                        Next call {when(f.due_at)}
                        {overdue ? ' · overdue' : ''}
                      </b>
                      <div className="muted small">
                        {f.purpose ? `${f.purpose} · ` : ''}for {name(f.assigned_to)}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="row">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setCompleting(f)}>
                          Done
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cancel(f)}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!fus ? (
            <div className="muted small">Loading…</div>
          ) : done.length === 0 ? (
            <div className="muted small">No calls logged yet.</div>
          ) : (
            <Paged rows={done}>
{(paged) => (
<div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Outcome</th>
                    <th>Conversation</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((f) => (
                    <tr key={f.id}>
                      <td className="nowrap">{when(f.completed_at ?? f.due_at)}</td>
                      <td>{outcomeName(f.outcome_id) ?? '—'}</td>
                      <td>{f.result_note ?? '—'}</td>
                      <td className="muted nowrap">{name(f.completed_by)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
)}
</Paged>
          )}
        </>
      )}

      {tab === 'callyzer' &&
        (!phoneCalls ? (
          <div className="muted small">Loading…</div>
        ) : phoneCalls.length === 0 ? (
          <div className="muted small">No calls from Callyzer yet.</div>
        ) : (
          <Paged rows={phoneCalls}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Call</th>
                      <th>Type</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th>By</th>
                      <th>Recording</th>
                      <th>Transcript</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((c) => (
                      <tr key={c.id}>
                        <td className="nowrap">{when(c.started_at)}</td>
                        <td className="nowrap">
                          {c.call_method === 'WhatsAppCall' ? <span className="badge badge-success">WhatsApp call</span> : <span className="badge badge-muted">Normal call</span>}
                        </td>
                        <td>{DIR[c.direction] ?? c.direction}</td>
                        <td className="num">{secs(c.duration_sec)}</td>
                        <td>
                          <span className={cn('badge', (c.duration_sec ?? 0) > 0 ? 'badge-success' : 'badge-muted')}>{(c.duration_sec ?? 0) > 0 ? 'Connected' : 'Not connected'}</span>
                        </td>
                        <td className="muted nowrap">{c.member_id ? name(c.member_id) : (c.emp_name ?? c.agent_phone ?? '—')}</td>
                        <td>
                          <PlayRecording path={c.recording_path} url={c.recording_url} />
                        </td>
                        <td>
                          <TranscriptCell call={{ ...c, title: when(c.started_at) }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Paged>
        ))}

      {tab === 'whatsapp' && (
        <>
          {waPending.map((f) => (
            <div key={f.id} className="fu-item is-pending">
              <div>
                <b>WhatsApp due {when(f.due_at)}</b>
                <div className="muted small">{f.purpose ?? 'Follow-up'}</div>
              </div>
            </div>
          ))}
          {!msgs ? (
            <div className="muted small">Loading…</div>
          ) : !leadPhone ? (
            <div className="muted small">This lead has no mobile number.</div>
          ) : (
            // the chat as on WhatsApp → Individual chat: WATI's messages and the ones sent from here, then Send a template
            <div className="wa-chat-pane lead-wa">
              <Conversation
                tenantId={tenant.id}
                phone={`91${leadPhone}`}
                phones={[leadPhone, `91${leadPhone}`, `+91${leadPhone}`]}
                leadId={leadId}
                hideHead
                extra={ownMsgs.map((m) => ({ id: m.id, at: m.sent_at, title: m.title ?? null, body: m.body, by: name(m.sent_by) }))}
                onSent={() => undefined}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
