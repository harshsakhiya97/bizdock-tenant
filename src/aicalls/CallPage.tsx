import { useCallback, useEffect, useMemo, useState } from 'react'
import { PhoneOutgoing } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Flash } from '@/components/Flash'
import { Empty, PageHead } from '@/components/ui'
import { listLeads, listMemberOptions } from '@/leads/api'
import { fullName } from '@/leads/labels'
import type { LeadRow, MemberOption } from '@/leads/types'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { listAiCalls, resultOf, rupees, secs, type AiCall } from './api'
import { CallDrawer } from './CallDrawer'
import { CallForm } from './CallForm'

/** AI Calling → Individual call: pick a lead (or type a number) and a template, Call now; the latest calls on the side */
export function AiCallPage() {
  const tenant = useTenant()
  const { membership } = useAuth()
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [calls, setCalls] = useState<AiCall[] | null>(null)
  const [open, setOpen] = useState<AiCall | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const load = useCallback(() => {
    const since = new Date(Date.now() - 7 * 86400_000).toISOString()
    listAiCalls(tenant.id, { from: since }).then((c) => setCalls(c.filter((x) => x.member_id === membership?.id).slice(0, 15)), () => setCalls([]))
  }, [tenant.id, membership?.id])
  useEffect(load, [load])
  useEffect(() => {
    void listLeads(tenant.id).then(setLeads, () => setLeads([]))
    void listMemberOptions(tenant.id).then(setMembers, () => setMembers([]))
  }, [tenant.id])
  // a call still running: the list follows it
  useEffect(() => {
    if (!calls?.some((c) => !c.final)) return
    const t = window.setInterval(load, 15_000)
    return () => window.clearInterval(t)
  }, [calls, load])
  const leadOpts = useMemo(() => leads.filter((l) => !l.is_archived).map((l) => ({ id: l.id, name: fullName(l), phone: l.phone })), [leads])

  return (
    <>
      <PageHead title="Individual call" subtitle="Pick a lead (or type a number) and a template; the AI calls now and the result comes back here, on the lead and in Call history." />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />
      <div className="ac-grid">
        <section className="card card-pad">
          <CallForm
            leads={leadOpts}
            onPlaced={(c) => {
              setNotice({ ok: `Calling ${c.to_name || c.to_phone} now.` })
              setOpen(c)
              load()
            }}
          />
        </section>
        <section className="card">
          <div className="card-pad" style={{ paddingBottom: 8 }}>
            <b>My calls · last 7 days</b>
          </div>
          {!calls ? (
            <div className="empty">Loading…</div>
          ) : !calls.length ? (
            <Empty icon={PhoneOutgoing}>No calls yet.</Empty>
          ) : (
            <div className="ac-recent">
              {calls.map((c) => {
                const r = resultOf(c)
                return (
                  <button key={c.id} type="button" className="ac-recent-row" onClick={() => setOpen(c)}>
                    <span>
                      <b>{c.to_name || c.to_phone}</b>
                      <small className="muted">
                        {new Date(c.placed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {c.objective_name ?? 'Template'} · {secs(c.talk_seconds)} · {rupees(c.cost)}
                      </small>
                    </span>
                    <span className={cn('badge', r.tone)}>{r.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </div>
      {open && (
        <CallDrawer
          key={open.id}
          call={open}
          memberName={(id) => members.find((m) => m.id === id)?.name}
          onClose={() => {
            setOpen(null)
            load()
          }}
        />
      )}
    </>
  )
}
