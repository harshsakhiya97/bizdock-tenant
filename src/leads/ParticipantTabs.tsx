import { useEffect, useMemo, useState } from 'react'
import { Briefcase, CalendarCheck, GraduationCap, Pencil, Sparkles, Undo2, UserPlus, Video } from 'lucide-react'
import { Button } from '@/components/Button'
import { TextInput } from '@/components/Field'
import { Empty } from '@/components/ui'
import { money } from '@/leads/labels'
import { db } from '@/lib/supabase'
import type { Purchase } from '@/webinars/api'
import type { LeadRow } from './types'

/**
 * Participant profile and journey (course workspaces, opt-in). Rough first version: the profile lives in leads.extra
 * under these keys, so nothing new is needed in the database; the journey is read from what is already there.
 */
export const PROFILE_GROUPS: { title: string; fields: { key: string; label: string; type?: 'date' }[] }[] = [
  {
    title: 'Business',
    fields: [
      { key: 'business_name', label: 'Business name' },
      { key: 'industry', label: 'Industry' },
      { key: 'what_they_sell', label: 'What they sell' },
      { key: 'designation', label: 'Designation' },
      { key: 'turnover', label: 'Annual turnover' },
      { key: 'team_size', label: 'Team size' },
      { key: 'years_in_business', label: 'Years in business' },
      { key: 'pan', label: 'PAN' },
    ],
  },
  {
    title: 'Personal',
    fields: [
      { key: 'participant_id', label: 'Participant ID' },
      { key: 'dob', label: 'Date of birth', type: 'date' },
      { key: 'anniversary', label: 'Anniversary', type: 'date' },
      { key: 'preferred_language', label: 'Preferred language' },
      { key: 'address', label: 'Address' },
      { key: 'state', label: 'State' },
      { key: 'pincode', label: 'Pincode' },
      { key: 'alt_phone', label: 'Alternate mobile' },
    ],
  },
  {
    title: 'Batch & pod',
    fields: [
      { key: 'current_program', label: 'Current programme' },
      { key: 'batch', label: 'Batch' },
      { key: 'group', label: 'Group / pod' },
      { key: 'enrollment_date', label: 'Enrolled on', type: 'date' },
      { key: 'dominator', label: 'Dominator' },
      { key: 'crm_leader', label: 'CRM Leader' },
      { key: 'pod_captain', label: 'Pod Captain' },
      { key: 'portal_access', label: 'MDM Portal access' },
      { key: 'digitalorix_access', label: 'app.digitalorix access' },
    ],
  },
  {
    title: 'Implementer & family',
    fields: [
      { key: 'implementer_name', label: 'Implementer' },
      { key: 'implementer_mobile', label: 'Implementer mobile' },
      { key: 'implementer_email', label: 'Implementer email' },
      { key: 'family_name', label: 'Family member' },
      { key: 'family_mobile', label: 'Family mobile' },
      { key: 'family_relation', label: 'Relation' },
    ],
  },
  {
    title: 'Webinars & Zoom',
    fields: [
      { key: 'webinar_events', label: 'Webinars registered' },
      { key: 'zoom_sessions', label: 'Zoom sessions attended' },
      { key: 'zoom_minutes', label: 'Total minutes on Zoom' },
      { key: 'zoom_first', label: 'First attended', type: 'date' },
      { key: 'zoom_last', label: 'Last attended', type: 'date' },
      { key: 'zoom_attended', label: 'Sessions they sat in' },
      { key: 'chat_count', label: 'Chat messages' },
      { key: 'chat_text', label: 'What they wrote in the chat' },
    ],
  },
  {
    title: 'Form answers',
    fields: [
      { key: 'challenges', label: '3 biggest challenges' },
      { key: 'question', label: 'Main question (VIP form)' },
      { key: 'website', label: 'Website / LinkedIn' },
      { key: 'gst', label: 'Has GST?' },
    ],
  },
  {
    title: 'CRM',
    fields: [
      { key: 'assigned_to', label: 'Assigned to (from the sheet)' },
      { key: 'lead_status', label: 'Lead status (from the sheet)' },
      { key: 'lead_score', label: 'Lead score' },
      { key: 'next_best_action', label: 'Next best action' },
      { key: 'objection', label: 'Objection / blocker' },
    ],
  },
]

const fmtDay = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

export function ProfileTab({ lead, canEdit, onSaved }: { lead: LeadRow; canEdit: boolean; onSaved: (msg: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState<Record<string, string>>(() => ({ ...(lead.extra ?? {}) }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const filled = PROFILE_GROUPS.flatMap((g) => g.fields).filter((x) => (lead.extra ?? {})[x.key]).length

  async function save() {
    setBusy(true)
    setError(null)
    const extra = { ...(lead.extra ?? {}) }
    for (const g of PROFILE_GROUPS) for (const x of g.fields) {
      const v = (f[x.key] ?? '').trim()
      if (v) extra[x.key] = v
      else delete extra[x.key]
    }
    const { error: e } = await db().from('leads').update({ extra }).eq('id', lead.id)
    setBusy(false)
    if (e) return setError(e.message)
    setEditing(false)
    onSaved('Profile saved.')
  }

  return (
    <div className="stack">
      <div className="row-between">
        <span className="muted small">{filled ? `${filled} details filled in.` : 'Nothing filled in yet.'}</span>
        {canEdit &&
          (editing ? (
            <div className="row">
              {error && <span className="err-text">{error}</span>}
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={busy}>
                {busy ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Edit profile
            </Button>
          ))}
      </div>
      {PROFILE_GROUPS.map((g) => (
        <section key={g.title} className="card card-pad">
          <h4 className="pf-title">{g.title}</h4>
          <div className="pf-grid">
            {g.fields.map((x) => (
              <div key={x.key} className="pf-item">
                <span>{x.label}</span>
                {editing ? (
                  <TextInput type={x.type ?? 'text'} value={f[x.key] ?? ''} onChange={(e) => setF((d) => ({ ...d, [x.key]: e.target.value }))} />
                ) : (
                  <b>{(lead.extra ?? {})[x.key] ? (x.type === 'date' ? fmtDay(lead.extra[x.key]) : lead.extra[x.key]) : <span className="muted">—</span>}</b>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

type Step = { at: string; icon: typeof Video; title: string; detail?: string; tone?: 'success' | 'danger' | 'info' }

export function JourneyTab({ lead, purchases }: { lead: LeadRow; purchases: Purchase[] | null }) {
  const [regs, setRegs] = useState<{ created_at: string; attended_minutes: number | null; category_name: string | null; events: { title: string; event_date: string } | null; webinars: { title: string } | null }[]>([])
  useEffect(() => {
    db()
      .from('webinar_registrations')
      .select('created_at, attended_minutes, category_name, events(title, event_date), webinars(title)')
      .eq('lead_id', lead.id)
      .then(({ data }) => setRegs((data ?? []) as never))
  }, [lead.id])

  const steps = useMemo(() => {
    const out: Step[] = []
    const x = lead.extra ?? {}
    out.push({ at: x.first_seen || lead.created_at, icon: UserPlus, title: 'Became a lead', detail: [x.lead_source || null, lead.utm_campaign ? `campaign ${lead.utm_campaign}` : null].filter(Boolean).join(' · ') || undefined })
    if (x.zoom_first)
      out.push({
        at: x.zoom_first,
        icon: Video,
        title: `Attended ${x.zoom_sessions || 'some'} Zoom session${x.zoom_sessions === '1' ? '' : 's'}${x.zoom_minutes ? ` · ${Math.round(Number(x.zoom_minutes))} min` : ''}`,
        detail: [x.zoom_attended, x.zoom_last && x.zoom_last !== x.zoom_first ? `last on ${fmtDay(x.zoom_last)}` : null].filter(Boolean).join(' · ') || undefined,
        tone: 'info',
      })
    if (x.webinar_events)
      out.push({ at: x.webinar_registered_on || x.first_seen || lead.created_at, icon: Video, title: 'Registered for webinars', detail: x.webinar_events })
    else if (x.webinar_names || x.webinar_registered_on)
      out.push({
        at: x.webinar_registered_on || lead.created_at,
        icon: Video,
        title: 'Webinars (from the sheet)',
        detail: [x.webinar_names, x.webinar_attended ? `attended: ${x.webinar_attended}` : null, x.sessions_attended ? `${x.sessions_attended} sessions` : null].filter(Boolean).join(' · '),
      })
    for (const r of regs)
      out.push({
        at: r.events?.event_date ?? r.created_at,
        icon: Video,
        title: `Registered for ${r.events?.title ?? r.webinars?.title ?? 'a webinar'}`,
        detail: r.attended_minutes ? `Attended ${r.attended_minutes} min${r.category_name ? ` · ${r.category_name}` : ''}` : 'Did not attend',
        tone: r.attended_minutes ? 'info' : undefined,
      })
    for (const p of purchases ?? []) {
      const due = Math.max(0, Number(p.total_amount) - Number(p.paid_amount))
      out.push({
        at: p.purchase_date,
        icon: GraduationCap,
        title: `Bought ${p.name}`,
        detail: `${money(p.total_amount)} · paid ${money(p.paid_amount)}${due > 0 ? ` · ${money(due)} due` : ''}${p.status === 'cancelled' ? ' · cancelled' : ''}`,
        tone: 'success',
      })
      for (const pay of p.purchase_payments ?? [])
        if (pay.status === 'paid' && pay.paid_on && pay.paid_on !== p.purchase_date) out.push({ at: pay.paid_on, icon: CalendarCheck, title: `Paid ${money(pay.amount)} for ${p.name}`, detail: pay.label ?? undefined })
      if (Number(p.refund_amount) > 0)
        out.push({ at: p.refunded_on ?? p.purchase_date, icon: Undo2, title: `Refunded ${money(p.refund_amount)} on ${p.name}`, detail: p.refund_reason ?? undefined, tone: 'danger' })
    }
    if (x.next_best_action) out.push({ at: '9999-12-31', icon: Sparkles, title: `Next: ${x.next_best_action}`, detail: x.objection ? `Blocker: ${x.objection}` : undefined })
    if (x.business_name) out.push({ at: '0000-01-01', icon: Briefcase, title: x.business_name, detail: [x.industry, x.turnover].filter(Boolean).join(' · ') || undefined })
    return out.sort((a, b) => a.at.localeCompare(b.at))
  }, [lead, purchases, regs])

  if (!steps.length) return <Empty>No journey yet.</Empty>
  return (
    <div className="card card-pad">
      <ol className="jr-list">
        {steps.map((s, i) => {
          const I = s.icon
          return (
            <li key={i} className={s.tone ? `is-${s.tone}` : undefined}>
              <span className="jr-dot">
                <I size={14} />
              </span>
              <div>
                <b>{s.title}</b>
                {s.detail && <div className="muted small">{s.detail}</div>}
              </div>
              <span className="muted small nowrap">{s.at.startsWith('9999') ? 'Next' : s.at.startsWith('0000') ? 'Profile' : fmtDay(s.at)}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
