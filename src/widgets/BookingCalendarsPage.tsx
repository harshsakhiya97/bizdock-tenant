import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, CalendarDays, Code2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { ConfirmModal, Empty, PageHead, Paged } from '@/components/ui'
import { Flash } from '@/components/Flash'
import { listMemberOptions } from '@/leads/api'
import type { MemberOption } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { archiveWorkflow, listWorkflows } from '@/workflows/api'
import { archiveWidget, countBookings, DAYS, INTERVALS, listWidgets, updateWidget, type WidgetRow } from './api'
import { BookingCalendarDrawer } from './BookingCalendarDrawer'
import { EmbedModal } from './EmbedModal'

const intervalText = (n: number) => INTERVALS.find(([v]) => v === n)?.[1] ?? `${n} minutes`
/** "Mon–Sat" / "Mon, Wed, Fri" */
function daysText(w: WidgetRow) {
  const on = DAYS.filter((d) => w.config.days?.[d.key]?.on)
  if (!on.length) return 'No days'
  const idx = on.map((d) => DAYS.indexOf(d))
  const run = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  return run && on.length > 2 ? `${on[0].short}–${on[on.length - 1].short}` : on.map((d) => d.short).join(', ')
}

/** Widgets → Booking Calendar: every booking calendar, its embed code, on / off, edit and delete. */
export function BookingCalendarsPage() {
  const tenant = useTenant()
  const { can } = useAuth()
  const navigate = useNavigate()
  // /widgets/booking-calendar/new or /:id: the add / edit drawer is open (a workflow's "Back" comes here too)
  const { id: openId } = useParams()
  const [rows, setRows] = useState<WidgetRow[] | null>(null)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [flows, setFlows] = useState<Map<string, string>>(new Map())
  const [booked, setBooked] = useState<Record<string, number>>({})
  const [embed, setEmbed] = useState<WidgetRow | null>(null)
  const [deleting, setDeleting] = useState<WidgetRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  const load = useCallback(() => {
    listWidgets(tenant.id).then((r) => setRows(r.filter((w) => w.kind === 'booking_calendar')), (e: Error) => setNotice({ error: e.message }))
    void countBookings(tenant.id).then(setBooked)
  }, [tenant.id])
  useEffect(load, [load])
  useEffect(() => {
    void listMemberOptions(tenant.id).then(setMembers)
    void listWorkflows(tenant.id).then((w) => setFlows(new Map(w.map((x) => [x.id, x.name]))), () => undefined)
  }, [tenant.id])

  async function toggle(w: WidgetRow) {
    try {
      await updateWidget(w.id, { is_active: !w.is_active })
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }
  async function remove() {
    if (!deleting) return
    setBusy(true)
    try {
      await archiveWidget(deleting.id)
      // its own workflow goes with it
      const wf = deleting.config.webhook?.type === 'workflow' ? deleting.config.webhook.workflow_id : ''
      if (wf) await archiveWorkflow(wf)
      setNotice({ ok: `Deleted “${deleting.name}”${wf ? ' and its workflow' : ''}. Its embed stops showing on your pages.` })
      setDeleting(null)
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
    setBusy(false)
  }

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? 'Removed member'
  const hookText = (w: WidgetRow) => {
    const h = w.config.webhook
    if (h?.type === 'workflow') return h.workflow_id ? (flows.get(h.workflow_id) ?? 'Deleted workflow') : 'No workflow'
    if (h?.type === 'url') {
      try {
        return new URL(h.url).host
      } catch {
        return 'No URL'
      }
    }
    return 'None'
  }

  return (
    <>
      <Link to="/widgets" className="back-link">
        <ArrowLeft size={14} /> Widgets
      </Link>
      <PageHead
        title="Booking Calendar"
        subtitle="Calendars of free slots to embed on your pages. Each booking goes to the widget’s webhook."
        actions={
          can('widgets', 'add') && (
            <button type="button" className="btn btn-primary" onClick={() => navigate('/widgets/booking-calendar/new')}>
              <Plus size={16} /> New booking calendar
            </button>
          )
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      {!rows ? null : !rows.length ? (
        <Empty icon={CalendarDays}>No booking calendars yet. Create one, then paste its embed code on your page.</Empty>
      ) : (
        <div className="panel">
          <Paged rows={rows}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Slots</th>
                      <th>Team</th>
                      <th>Webhook</th>
                      <th>Bookings</th>
                      <th>Active</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((w) => (
                      <tr key={w.id}>
                        <td>
                          <span className="row" style={{ gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: w.config.color || tenant.primary_color, flexShrink: 0 }} />
                            <b>{w.name}</b>
                          </span>
                        </td>
                        <td className="nowrap">
                          {intervalText(w.config.interval)} · {daysText(w)}
                        </td>
                        <td>{w.config.members?.length ? w.config.members.map(memberName).join(', ') : <span className="muted">No one (always open)</span>}</td>
                        <td className="nowrap">{hookText(w)}</td>
                        <td>{booked[w.id] ?? 0}</td>
                        <td>
                          <label className="switch" title={w.is_active ? 'Turn off' : 'Turn on'}>
                            <input type="checkbox" checked={w.is_active} disabled={!can('widgets', 'edit')} onChange={() => void toggle(w)} />
                          </label>
                        </td>
                        <td className="nowrap" style={{ textAlign: 'right' }}>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setEmbed(w)}>
                            <Code2 size={14} /> Embed code
                          </button>
                          {can('widgets', 'edit') && (
                            <button type="button" className="btn btn-ghost btn-icon" title="Edit" onClick={() => navigate(`/widgets/booking-calendar/${w.id}`)}>
                              <Pencil size={15} />
                            </button>
                          )}
                          {can('widgets', 'delete') && (
                            <button type="button" className="btn btn-ghost btn-icon danger-text" title="Delete" onClick={() => setDeleting(w)}>
                              <Trash2 size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Paged>
        </div>
      )}

      {openId && (
        <BookingCalendarDrawer
          key={openId}
          id={openId}
          onClose={() => navigate('/widgets/booking-calendar')}
          onSaved={(w, isNew) => {
            navigate('/widgets/booking-calendar')
            load()
            setNotice({ ok: isNew ? `Created “${w.name}”. Copy its embed code and paste it on your page.` : `Saved “${w.name}”. The embed shows the changes straight away.` })
            if (isNew) setEmbed(w)
          }}
        />
      )}
      {embed && <EmbedModal widget={embed} onClose={() => setEmbed(null)} />}
      <ConfirmModal
        open={!!deleting}
        icon={Trash2}
        danger
        title="Delete this booking calendar?"
        message={
          deleting
            ? `“${deleting.name}” is removed and its embed stops showing on your pages.${deleting.config.webhook?.type === 'workflow' && deleting.config.webhook.workflow_id ? ` Its workflow “${flows.get(deleting.config.webhook.workflow_id) ?? 'its workflow'}” is deleted too.` : ''} Bookings already made are kept.`
            : ''
        }
        confirmLabel={busy ? 'Deleting…' : 'Delete'}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </>
  )
}
