import { useCallback, useEffect, useState } from 'react'
import { MessageCircle, PhoneCall, X } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Hint, Label, Select } from '@/components/Field'
import { listOutcomes, scheduleFollowUp } from '@/followups/api'
import { logActivity } from '@/leads/api'
import type { MemberOption, Option } from '@/leads/types'
import { db } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { ago } from '@/team/time'
import { useTenant } from '@/tenant/useTenant'
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
}: {
  leadId: string
  members: MemberOption[]
  canEdit: boolean
  onWhatsApp: () => void
  onChanged: (msg: string) => void
  /** bump to reload (after a WhatsApp is sent from the header) */
  refreshKey: number
}) {
  const tenant = useTenant()
  const { membership } = useAuth()
  const me = membership?.id
  const [tab, setTab] = useState<'calls' | 'whatsapp'>('calls')
  const [fus, setFus] = useState<Fu[] | null>(null)
  const [msgs, setMsgs] = useState<LeadMessage[] | null>(null)
  const [outcomes, setOutcomes] = useState<Option[]>([])
  // the log-a-call form (completing = the pending follow-up being closed)
  const [completing, setCompleting] = useState<Fu | null>(null)
  const [outcome, setOutcome] = useState('')
  const [summary, setSummary] = useState('')
  const [next, setNext] = useState('')
  const [nextTime, setNextTime] = useState('11:00')
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
  }, [leadId])
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

  async function logCall() {
    if (!summary.trim()) return setError('Write what was discussed.')
    if (!outcome) return setError('Pick the call outcome.')
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
      if (next) await scheduleFollowUp(tenant.id, me, { lead_id: leadId, due_at: `${next}T${nextTime || '11:00'}`, mode: 'call', purpose: '', assigned_to: me ?? '' }, true)
      setSummary('')
      setOutcome('')
      setNext('')
      setCompleting(null)
      load()
      onChanged(next ? 'Call logged and next follow-up set.' : 'Call logged.')
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
          <button type="button" className={cn(tab === 'whatsapp' && 'is-active')} onClick={() => setTab('whatsapp')}>
            <MessageCircle size={14} /> WhatsApp <span className="muted small">{msgs?.length ?? 0}</span>
          </button>
        </div>
        {tab === 'whatsapp' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onWhatsApp}>
            <MessageCircle size={14} /> Send WhatsApp
          </button>
        )}
      </div>

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
              <div className="form-grid">
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
                  <Label htmlFor="fc-next">Next follow-up</Label>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input id="fc-next" className="input" type="date" value={next} onChange={(e) => setNext(e.target.value)} />
                    <input className="input" type="time" aria-label="Time" style={{ width: 120 }} value={nextTime} onChange={(e) => setNextTime(e.target.value)} />
                  </div>
                  <div className="quick-links">
                    <button type="button" onClick={() => setNext(dayPlus(1))}>Tomorrow</button>·
                    <button type="button" onClick={() => setNext(dayPlus(3))}>+3 days</button>·
                    <button type="button" onClick={() => setNext(dayPlus(7))}>+7 days</button>
                    {next && (
                      <>
                        ·<button type="button" onClick={() => setNext('')}>None</button>
                      </>
                    )}
                  </div>
                </div>
                <div className="span-2">
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
              <Hint>Setting a next follow-up replaces the pending one, so the lead always has one next date.</Hint>
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
                  {done.map((f) => (
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
        </>
      )}

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
          ) : msgs.length === 0 ? (
            <div className="muted small">No WhatsApp messages yet.</div>
          ) : (
            <ol className="timeline">
              {msgs.map((m) => (
                <li key={m.id}>
                  <span className="tl-dot" />
                  <div>
                    <b>{m.title ?? 'Message'}</b>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p>
                    <small>
                      {name(m.sent_by)} · {ago(m.sent_at)} · {when(m.sent_at)}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
}
