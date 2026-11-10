import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarCheck, Pencil, Plus, Presentation, Trash2, Users } from 'lucide-react'
import { BT } from '@/auth/auth-context'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Flash } from '@/components/Flash'
import { SlotCalendar, clock, fmtDay, isoDay } from '@/components/SlotCalendar'
import { ConfirmModal, Empty, PageHead, Paged, StatCard } from '@/components/ui'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'
import { archiveWebinar, listHosts, listWebinarDates, listWebinars, plannedSlots, repeatText, type PlannedSlot, type WebinarDate, type WebinarHost, type WebinarRow } from './api'
import { PlannedDateDrawer } from './PlannedDateDrawer'
import { WebinarDateDrawer } from './WebinarDateDrawer'
import { WebinarDrawer } from './WebinarDrawer'

/** Webinar Calendar (a Webinar business's Booking Calendar): its webinars and their dates; drag over a day to add one. */
export function WebinarCalendarPage() {
  const tenant = useTenant()
  const { can, businesses } = useAuth()
  const { selected } = useBusiness()
  const canAdd = can('bookings', 'add')
  const canEdit = can('bookings', 'edit') || canAdd
  const today = isoDay(new Date())
  const [anchor, setAnchor] = useState(today)
  const [webinars, setWebinars] = useState<WebinarRow[] | null>(null)
  const [dates, setDates] = useState<WebinarDate[] | null>(null)
  const [hosts, setHosts] = useState<WebinarHost[]>([])
  const [regCount, setRegCount] = useState<Record<string, number>>({})
  const [drawer, setDrawer] = useState<{ webinar: WebinarRow | null; date?: string; start?: string; end?: string } | null>(null)
  const [opened, setOpened] = useState<WebinarDate | null>(null)
  const [planned, setPlanned] = useState<{ webinar: WebinarRow; slot: PlannedSlot } | null>(null)
  const [removing, setRemoving] = useState<WebinarRow | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  // the Webinar businesses (or a business's Webinar sub-business… a webinar belongs to the business)
  const webinarBiz = useMemo(() => businesses.filter((b) => b.type === BT.WEBINAR || b.subs.some((x) => x.type === BT.WEBINAR)), [businesses])

  const load = useCallback(() => {
    listWebinars(tenant.id).then(setWebinars, (e: Error) => setNotice({ error: e.message }))
    listWebinarDates(tenant.id).then(setDates, () => setDates([]))
    void db()
      .from('webinar_registrations')
      .select('event_id')
      .eq('tenant_id', tenant.id)
      .limit(10000)
      .then(({ data }) => {
        const m: Record<string, number> = {}
        for (const r of (data ?? []) as { event_id: string }[]) m[r.event_id] = (m[r.event_id] ?? 0) + 1
        setRegCount(m)
      })
  }, [tenant.id])
  useEffect(load, [load])
  useEffect(() => {
    void listHosts(tenant.id).then(setHosts, () => setHosts([]))
  }, [tenant.id])

  const mine = useMemo(() => (webinars ?? []).filter((w) => !selected || w.business_id === selected.id), [webinars, selected])
  const byId = useMemo(() => new Map((webinars ?? []).map((w) => [w.id, w])), [webinars])
  const myDates = useMemo(() => (dates ?? []).filter((d) => mine.some((w) => w.id === d.webinar_id)), [dates, mine])

  // the coming dates not made yet (repeating webinars): scheduled, drawn dotted
  const plannedItems = useMemo(
    () =>
      mine.flatMap((w) =>
        plannedSlots(
          w,
          myDates.filter((d) => d.webinar_id === w.id).map((d) => d.event_date),
          today,
        ).map((s) => ({
          id: `planned:${w.id}:${s.date}`,
          date: s.date,
          start: s.start,
          end: s.end,
          title: w.title,
          detail: s.moved ? 'Scheduled · rescheduled' : 'Scheduled',
          meta: `${clock(s.start)} – ${clock(s.end)} · Scheduled${s.moved ? ' · rescheduled' : ''} (made when the date before it ends)`,
          color: '#8b5cf6',
          planned: true,
        })),
      ),
    [mine, myDates, today],
  )

  const items = useMemo(
    () =>
      dates
        ? [...myDates.map((d) => {
            const end = d.end_time ?? d.start_time
            const past = Date.parse(`${d.event_date}T${end.slice(0, 5)}:00+05:30`) < Date.now()
            const n = regCount[d.id] ?? 0
            return {
              id: d.id,
              date: d.event_date,
              start: d.start_time.slice(0, 5),
              end: end.slice(0, 5),
              title: d.title,
              detail: `${n} registered`,
              meta: `${clock(d.start_time.slice(0, 5))} – ${clock(end.slice(0, 5))} · ${n} registered${d.zoom_error ? ' · Zoom problem' : !d.zoom_webinar_id ? ' · Zoom being made' : ''}`,
              color: d.zoom_error ? '#dc2626' : '#8b5cf6',
              faded: past,
            }
          }), ...plannedItems]
        : null,
    [dates, myDates, regCount, plannedItems],
  )

  const month = anchor.slice(0, 7)
  const stats = useMemo(() => {
    const inMonth = myDates.filter((d) => d.event_date.slice(0, 7) === month)
    return {
      webinars: mine.filter((w) => w.is_active).length,
      dates: inMonth.length,
      registered: inMonth.reduce((n, d) => n + (regCount[d.id] ?? 0), 0),
    }
  }, [myDates, mine, month, regCount])

  const nextDate = (w: WebinarRow) => myDates.filter((d) => d.webinar_id === w.id && d.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date))[0]

  async function toggle(w: WebinarRow) {
    try {
      const { error } = await db().from('webinars').update({ is_active: !w.is_active }).eq('id', w.id)
      if (error) throw error
      setNotice({ ok: `${w.title} ${w.is_active ? 'switched off: no new dates are made' : 'switched on'}.` })
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }

  return (
    <>
      <PageHead
        title="Webinar Calendar"
        subtitle="Webinars and their dates. Each date has its own Zoom meeting; leads from the webinar's funnel are registered for the coming date. Dotted ones are scheduled: each is made when the date before it ends."
        actions={
          canAdd && (
            <button type="button" className="btn btn-primary" onClick={() => setDrawer({ webinar: null, date: anchor >= today ? anchor : today })} disabled={!webinarBiz.length}>
              <Plus size={16} /> New webinar
            </button>
          )
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      <div className="stat-grid">
        <StatCard icon={Presentation} tone="brand" value={stats.webinars} label="Active webinars" />
        <StatCard icon={CalendarCheck} tone="info" value={stats.dates} label={`Dates in ${fmtDay(`${month}-01`, { month: 'short' })}`} />
        <StatCard icon={Users} tone="success" value={stats.registered} label="Registered" hint={`For ${fmtDay(`${month}-01`, { month: 'short' })}'s dates`} />
      </div>

      <SlotCalendar
        items={items}
        anchor={anchor}
        setAnchor={setAnchor}
        storageKey="webinars.view"
        canAdd={canAdd && webinarBiz.length > 0}
        noun="webinars"
        onCreate={(x) => setDrawer({ webinar: null, date: x.date, start: x.start, end: x.end })}
        onOpen={(id) => {
          if (id.startsWith('planned:')) {
            const [, wid, date] = id.split(':')
            const w = byId.get(wid)
            const slot = w ? plannedSlots(w, myDates.filter((d) => d.webinar_id === w.id).map((d) => d.event_date), today).find((x) => x.date === date) : null
            if (w && slot) setPlanned({ webinar: w, slot })
          } else setOpened(myDates.find((d) => d.id === id) ?? null)
        }}
      />

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-bar">
          <div>
            <b>Webinars</b>
            <div className="muted small">Click one to edit it. Its next date is made when the one before ends.</div>
          </div>
        </div>
        {!webinars ? (
          <div className="empty">Loading…</div>
        ) : !mine.length ? (
          <Empty icon={Presentation}>No webinars yet. Create one with New webinar.</Empty>
        ) : (
          <Paged rows={mine}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Webinar</th>
                      <th>When</th>
                      <th>Host</th>
                      <th>Next date</th>
                      <th>Active</th>
                      {canEdit && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((w) => {
                      const nd = nextDate(w)
                      return (
                        <tr key={w.id} className={canEdit ? 'is-clickable' : undefined} onClick={() => canEdit && setDrawer({ webinar: w })}>
                          <td>
                            <b>{w.title}</b>
                            {!selected && <div className="muted small">{businesses.find((b) => b.id === w.business_id)?.name}</div>}
                            <div className="muted small">Created {new Date(w.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                          </td>
                          <td>
                            {repeatText(w)}
                            <div className="muted small">
                              {clock(w.start_time)} – {clock(w.end_time)}
                            </div>
                          </td>
                          <td>{hosts.find((h) => h.id === w.host_id)?.name ?? <span className="muted">—</span>}</td>
                          <td className="nowrap">
                            {nd ? (
                              <button
                                type="button"
                                className="link-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOpened(nd)
                                }}
                              >
                                {fmtDay(nd.event_date, { weekday: 'short', day: 'numeric', month: 'short' })} · {regCount[nd.id] ?? 0} registered
                              </button>
                            ) : (
                              <span className="muted">None coming</span>
                            )}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {canEdit ? (
                              <label className={cn('tgl', w.is_active && 'is-on')} title={w.is_active ? 'Turn off' : 'Turn on'}>
                                <input type="checkbox" role="switch" checked={w.is_active} onChange={() => void toggle(w)} aria-label={`${w.title} active`} />
                                <span className="tgl-track" aria-hidden="true">
                                  <span className="tgl-knob" />
                                </span>
                                {w.is_active ? 'Active' : 'Inactive'}
                              </label>
                            ) : (
                              <span className={cn('badge', w.is_active ? 'badge-success' : 'badge-muted')}>{w.is_active ? 'Active' : 'Inactive'}</span>
                            )}
                          </td>
                          {canEdit && (
                            <td className="nowrap" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                              <button type="button" className="btn btn-ghost btn-icon" title="Edit" onClick={() => setDrawer({ webinar: w })}>
                                <Pencil size={15} />
                              </button>
                              <button type="button" className="btn btn-ghost btn-icon danger-text" title="Delete" onClick={() => setRemoving(w)}>
                                <Trash2 size={15} />
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Paged>
        )}
      </section>

      {drawer && (
        <WebinarDrawer
          key={drawer.webinar?.id ?? 'new'}
          webinar={drawer.webinar}
          businesses={webinarBiz.map((b) => ({ id: b.id, name: b.name }))}
          defaultBusinessId={selected && webinarBiz.some((b) => b.id === selected.id) ? selected.id : null}
          defaults={drawer.webinar ? undefined : { date: drawer.date, start: drawer.start, end: drawer.end }}
          onClose={() => setDrawer(null)}
          onSaved={(msg) => {
            setDrawer(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}
      {opened && (
        <WebinarDateDrawer
          key={opened.id}
          date={opened}
          webinar={byId.get(opened.webinar_id) ?? null}
          siblings={myDates.filter((d) => d.webinar_id === opened.webinar_id)}
          onClose={() => setOpened(null)}
          onEdit={() => {
            const w = byId.get(opened.webinar_id) ?? null
            setOpened(null)
            if (w) setDrawer({ webinar: w })
          }}
          onDeleted={(msg) => {
            setOpened(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}
      {planned && (
        <PlannedDateDrawer
          key={`${planned.webinar.id}:${planned.slot.date}`}
          webinar={planned.webinar}
          slot={planned.slot}
          madeDates={myDates.filter((d) => d.webinar_id === planned.webinar.id).map((d) => d.event_date)}
          canEdit={canEdit}
          onClose={() => setPlanned(null)}
          onEdit={() => {
            const w = planned.webinar
            setPlanned(null)
            setDrawer({ webinar: w })
          }}
          onDeleted={(msg) => {
            setPlanned(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}
      <ConfirmModal
        open={!!removing}
        icon={Trash2}
        danger
        title="Delete this webinar?"
        message={removing ? `“${removing.title}”: its coming dates are called off (and removed from Zoom), and its 3 workflows and its funnel are deleted too. Past dates, registrations and Zoom data stay on the leads.` : ''}
        confirmLabel="Delete"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const w = removing
          setRemoving(null)
          if (!w) return
          try {
            await archiveWebinar(w)
            setNotice({ ok: `${w.title} deleted.` })
            load()
          } catch (e) {
            setNotice({ error: (e as Error).message })
          }
        }}
      />
    </>
  )
}
