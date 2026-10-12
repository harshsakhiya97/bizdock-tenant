import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlarmClock, CalendarCheck, CalendarX, Sparkles } from 'lucide-react'
import { displayName, useAuth } from '@/auth/useAuth'
import { Empty, PageHead, StatCard } from '@/components/ui'
import { CompleteModal } from '@/followups/CompleteModal'
import { DuesCard } from '@/collections/DuesCard'
import { FollowUpTable } from '@/followups/FollowUpTable'
import { dayBounds, modeOf } from '@/followups/labels'
import { ScheduleModal } from '@/followups/ScheduleModal'
import type { FollowUpRow } from '@/followups/types'
import { useFollowUpData } from '@/followups/useFollowUpData'
import { fullName } from '@/leads/labels'
import { cn } from '@/lib/cn'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/** The day's work: overdue and today's follow-ups, the week ahead, leads with no next step, pipeline. */
export function MyDayPage() {
  const { profile, user, membership, can } = useAuth()
  const data = useFollowUpData()
  const navigate = useNavigate()
  const [mine, setMine] = useState(true)
  const [done, setDone] = useState<FollowUpRow | null>(null)
  const [schedule, setSchedule] = useState<{ f: FollowUpRow | null; leadId?: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const me = membership?.id
  const canAct = can('follow_ups', 'add') || can('leads', 'edit')
  const { now, start, end, week } = dayBounds()

  const fus = data.followUps.filter((f) => f.status === 'pending' && (!mine || f.assigned_to === me))
  const overdue = fus.filter((f) => new Date(f.due_at) < now)
  const today = fus.filter((f) => new Date(f.due_at) >= now && new Date(f.due_at) < end)
  const upcoming = fus.filter((f) => new Date(f.due_at) >= end && new Date(f.due_at) < week)
  const myLeads = data.leads.filter((l) => !mine || l.owner_id === me)
  const openLeads = myLeads.filter((l) => data.stageById.get(l.stage_id)?.kind === 'open')
  const noFollowUp = openLeads.filter((l) => !l.next_follow_up_at)
  const stale = noFollowUp.filter((l) => Date.now() - new Date(l.updated_at).getTime() > 7 * 864e5)
  const newToday = myLeads.filter((l) => new Date(l.created_at) >= start)

  const byDay = useMemo(() => {
    const m = new Map<string, FollowUpRow[]>()
    for (const f of [...upcoming].sort((a, b) => a.due_at.localeCompare(b.due_at))) {
      const k = new Date(f.due_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
      m.set(k, [...(m.get(k) ?? []), f])
    }
    return [...m.entries()]
  }, [upcoming])

  const saved = (msg: string) => {
    setDone(null)
    setSchedule(null)
    setNotice(msg)
    data.reload()
  }
  const openFunnel = (funnelId: string) => {
    try {
      localStorage.setItem(`leads.funnel.${data.funnels.find((f) => f.id === funnelId)?.tenant_id}`, funnelId)
    } catch {
      /* storage unavailable */
    }
    navigate('/leads')
  }

  return (
    <>
      <PageHead
        title={`${greeting()}, ${displayName(profile?.full_name, user?.email).split(' ')[0]}`}
        subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <div className="seg">
            <button type="button" className={cn(mine && 'is-active')} onClick={() => setMine(true)}>
              Mine
            </button>
            <button type="button" className={cn(!mine && 'is-active')} onClick={() => setMine(false)}>
              Everyone I can see
            </button>
          </div>
        }
      />
      {notice && <div className="alert alert-info">{notice}</div>}
      {data.error && <div className="alert alert-error">{data.error}</div>}

      <div className="stat-grid">
        <StatCard icon={AlarmClock} tone="danger" value={overdue.length} label="Overdue follow-ups" />
        <StatCard icon={CalendarCheck} tone="warning" value={today.length} label="Follow-ups today" />
        <StatCard
          icon={CalendarX}
          tone="orange"
          value={noFollowUp.length}
          label="No follow-up set"
          hint={stale.length ? `${stale.length} with no action for 7+ days` : 'Open leads without a next step'}
        />
        <StatCard icon={Sparkles} tone="info" value={newToday.length} label="New leads today" />
      </div>

      <div className="myday-grid">
        <div className="stack">
          <div className="panel">
            <div className="panel-bar">
              <b>Today’s follow-ups</b>
              <Link to="/follow-ups" className="link">
                All follow-ups →
              </Link>
            </div>
            {data.loading ? (
              <div className="empty">Loading…</div>
            ) : overdue.length + today.length === 0 ? (
              <Empty icon={CalendarCheck}>Nothing due today. 🎉</Empty>
            ) : (
              <FollowUpTable
                compact
                hideAssigned={mine}
                rows={[...overdue, ...today]}
                stageById={data.stageById}
                members={data.members}
                outcomes={data.outcomes}
                canAct={canAct}
                onDone={setDone}
                onReschedule={(f) => setSchedule({ f })}
              />
            )}
          </div>

          <div className="panel">
            <div className="panel-bar">
              <b>Open leads with no follow-up</b>
              <span className="muted small">{noFollowUp.length} leads</span>
            </div>
            {noFollowUp.length === 0 ? (
              <Empty icon={CalendarCheck}>Every open lead has a next step.</Empty>
            ) : (
              <div className="link-rows" style={{ border: 0, borderRadius: 0 }}>
                {noFollowUp.slice(0, 8).map((l) => {
                  const s = data.stageById.get(l.stage_id)
                  return (
                    <div key={l.id}>
                      <div className="lr-main">
                        <Link to={`/leads?open=${l.id}`} className="link strong">
                          {fullName(l)}
                        </Link>
                        <div className="lr-meta">
                          <span>{l.phone}</span>
                          {s && <span style={{ color: s.color, fontWeight: 600 }}>{s.name}</span>}
                          <span>Updated {new Date(l.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        </div>
                      </div>
                      {canAct && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setSchedule({ f: null, leadId: l.id })}>
                          Schedule
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad stack" style={{ gap: 12 }}>
            <b>Next 7 days</b>
            {byDay.length === 0 ? (
              <span className="muted small">Nothing scheduled.</span>
            ) : (
              byDay.map(([day, items]) => (
                <div key={day} className="day-group">
                  <div className="day-label">{day}</div>
                  {items.map((f) => {
                    const M = modeOf(f.mode)
                    return (
                      <div key={f.id} className="day-item">
                        <M.icon size={14} className="muted" />
                        <span className="nowrap muted small">
                          {new Date(f.due_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <Link to={`/leads?open=${f.lead_id}`} className="link cell-clip">
                          {f.leads ? fullName(f.leads) : 'Lead'}
                        </Link>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
            <Link to="/follow-ups" className="link small">
              Open follow-ups →
            </Link>
          </div>

          {can('collections', 'view') && <DuesCard mine={mine} me={me} />}

          <div className="card card-pad stack" style={{ gap: 12 }}>
            <b>Pipeline</b>
            {data.funnels.length === 0 && <span className="muted small">No funnels yet.</span>}
            {data.funnels.map((f) => (
              <div key={f.id} className="stack" style={{ gap: 8 }}>
                <button type="button" className="link-btn" style={{ justifyContent: 'flex-start' }} onClick={() => openFunnel(f.id)}>
                  {f.name} →
                </button>
                <div className="pipe-tiles">
                  {f.funnel_stages.map((s) => (
                    <div key={s.id} className="pipe-tile" style={{ ['--c' as string]: s.color }}>
                      <small>{s.name}</small>
                      <b>{myLeads.filter((l) => l.stage_id === s.id).length}</b>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {done && <CompleteModal followUp={done} outcomes={data.outcomes} onClose={() => setDone(null)} onSaved={saved} />}
      {schedule && (
        <ScheduleModal
          title={schedule.f ? 'Reschedule follow-up' : 'Schedule follow-up'}
          lead={(() => {
            const l = schedule.f?.leads ?? data.leads.find((x) => x.id === schedule.leadId)
            return l ? { id: l.id, name: fullName(l), owner_id: l.owner_id } : undefined
          })()}
          members={data.members}
          defaults={schedule.f ? { mode: schedule.f.mode, purpose: schedule.f.purpose ?? '', assigned_to: schedule.f.assigned_to ?? '' } : undefined}
          onClose={() => setSchedule(null)}
          onSaved={saved}
        />
      )}
    </>
  )
}
