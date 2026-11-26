import { useEffect, useState, type ReactNode } from 'react'
import { CalendarClock, ChartColumnBig, ChevronRight, Handshake, MessageCircle, PhoneCall, Receipt, Tag, UserRound, Wallet } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ago } from '@/team/time'
import { money, tempOf } from './labels'
import type { Temperature } from './types'
import { getLeadGlance, type Glance } from './insights'

const at = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'
const day = (d: string | null | undefined, t?: string | null) =>
  d
    ? `${new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${t ? `, ${new Date(`2000-01-01T${t}`).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''}`
    : '—'
const dur = (s: number | null) => (s ? (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`) : '')
const cap = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '')

function Item({ icon: Icon, label, children, tone, onClick }: { icon: typeof Tag; label: string; children: ReactNode; tone?: 'danger' | 'success'; onClick?: () => void }) {
  return (
    <div className={cn('glance-item', tone && `is-${tone}`, onClick && 'is-link')} onClick={onClick} role={onClick ? 'button' : undefined}>
      <span className="glance-ic">
        <Icon size={15} />
      </span>
      <div className="glance-text">
        <span className="glance-label">{label}</span>
        <div className="glance-val">{children}</div>
      </div>
      {onClick && <ChevronRight size={15} className="glance-go" />}
    </div>
  )
}

/** Lead page → At a glance: where the lead stands, in one look. */
export function LeadGlance({
  leadId,
  temperature,
  createdAt,
  owner,
  billing: m,
  onBilling,
  onBillTo,
  refreshKey,
}: {
  leadId: string
  temperature: Temperature | null
  createdAt: string
  owner: string | null
  /** billed / received / overdue (bookings & purchases), invoices count, billing details */
  billing: { billed: number; received: number; overdue: number; invoices: number | null; company: string | null; gstin: string | null }
  /** opens Payments */
  onBilling?: () => void
  /** edits the billing details (Bill to) */
  onBillTo?: () => void
  refreshKey?: number
}) {
  const [g, setG] = useState<Glance | null>(null)
  useEffect(() => {
    getLeadGlance(leadId).then(setG, () => setG(null))
  }, [leadId, refreshKey])
  const t = tempOf(temperature)
  const nf = g?.next_follow_up
  const late = !!nf && new Date(nf.due_at).getTime() < Date.now()
  const lf = g?.last_follow_up
  const lc = g?.last_call

  return (
    <div className="glance-card">
      <span className="glance-title">
        <ChartColumnBig size={17} /> At a glance
      </span>
      <Item icon={Tag} label="Category">
        {t ? <span className={cn('badge', t.tone)}>{t.label}</span> : '—'}
        {g?.category_since && <span className="muted small"> · since {at(g.category_since)}</span>}
      </Item>
      <Item icon={CalendarClock} label="Next follow-up" tone={late ? 'danger' : undefined}>
        {nf ? (
          <>
            <b>{at(nf.due_at)}</b>
            {late && <span className="small"> · overdue{g && g.overdue > 1 ? ` (${g.overdue})` : ''}</span>}
            {nf.purpose && <div className="muted small">{nf.purpose}</div>}
          </>
        ) : (
          <span className="muted">None set</span>
        )}
        {lf && (
          <div className="muted small">
            Last: {at(lf.at)}
            {lf.outcome ? ` · ${lf.outcome}` : ''}
          </div>
        )}
      </Item>
      <Item icon={PhoneCall} label="Calls">
        {g?.calls.total ? (
          <>
            <b>{g.calls.total}</b> total · <b>{g.calls.connected}</b> connected
            {lc && (
              <div className="muted small">
                Last: {at(lc.at)} · {cap(lc.direction)}
                {lc.outcome ? ` · ${lc.outcome}` : ''}
                {lc.duration ? ` · ${dur(lc.duration)}` : ''}
              </div>
            )}
          </>
        ) : (
          <span className="muted">No calls yet</span>
        )}
      </Item>
      <Item icon={Handshake} label="Meetings">
        {g?.next_meeting || g?.last_meeting ? (
          <>
            {g.next_meeting && (
              <div>
                Next: <b>{day(g.next_meeting.date, g.next_meeting.start)}</b>
                {g.next_meeting.mode ? <span className="muted small"> · {cap(g.next_meeting.mode)}</span> : null}
              </div>
            )}
            {g.last_meeting && (
              <div className="muted small">
                Last: {day(g.last_meeting.date, g.last_meeting.start)}
                {g.last_meeting.status ? ` · ${cap(g.last_meeting.status)}` : ''}
              </div>
            )}
          </>
        ) : (
          <span className="muted">None</span>
        )}
      </Item>
      <Item icon={Wallet} label="Billing" tone={m.overdue > 0 ? 'danger' : m.billed > 0 && m.billed <= m.received ? 'success' : undefined} onClick={onBilling}>
        {m.billed > 0 ? (
          <>
            <div className="glance-money">
              <span>
                <small>Billed</small>
                <b>{money(m.billed)}</b>
              </span>
              <span>
                <small>Paid</small>
                <b className="success-text">{money(m.received)}</b>
              </span>
              <span>
                <small>Due</small>
                <b className={m.billed - m.received > 0 ? 'danger-text' : undefined}>{money(Math.max(0, m.billed - m.received))}</b>
              </span>
            </div>
            {m.overdue > 0 && <div className="small danger-text">{money(m.overdue)} overdue</div>}
          </>
        ) : (
          <span className="muted">Nothing billed yet</span>
        )}
        {m.invoices ? <div className="muted small">{m.invoices} invoice{m.invoices === 1 ? '' : 's'}</div> : null}
      </Item>
      <Item icon={Receipt} label="Bill to" onClick={onBillTo}>
        {m.company || m.gstin ? (
          <>
            {m.company || '—'}
            {m.gstin && <div className="muted small">GSTIN {m.gstin}</div>}
          </>
        ) : (
          <span className="muted">Billing details not added</span>
        )}
      </Item>
      <Item icon={MessageCircle} label="WhatsApp">
        {g?.whatsapp ? (
          <>
            {g.whatsapp.direction === 'in' ? 'Received' : cap(g.whatsapp.status) || 'Sent'} · {at(g.whatsapp.at)}
            {g.whatsapp.template && <div className="muted small">{g.whatsapp.template}</div>}
          </>
        ) : (
          <span className="muted">No messages</span>
        )}
      </Item>
      <Item icon={UserRound} label="Age · Owner">
        {ago(createdAt).replace(' ago', '')} · {owner ?? <span className="muted">Unassigned</span>}
      </Item>
    </div>
  )
}
