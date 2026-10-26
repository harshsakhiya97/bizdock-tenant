import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarCheck, Clock3, IndianRupee, Plus, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { PageHead, StatCard } from '@/components/ui'
import { SlotCalendar, clock, fmtDay as fmt, isoDay as iso, minutesOf as minutes } from '@/components/SlotCalendar'
import { activeType, calendarName, isStudioType } from '@/business/activeType'
import { Modal } from '@/components/Modal'
import { listLeads } from '@/leads/api'
import { money } from '@/leads/labels'
import type { LeadRow } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { listBookings, studioBusy, type BusySlot } from './api'
import { BookingDrawer } from './BookingDrawer'
import { invoiceHref } from './BookingsTab'
import { useBookingRefs } from './useBookingRefs'
import { STATUS_META, type BookingRow, type BookingStatus } from './types'
import { Flash } from '@/components/Flash'

/** Booking calendar: day / week / month; drag over free time to book it. */
export function BookingCalendarPage() {
  const tenant = useTenant()
  const { can } = useAuth()
  const { inScope, selected, sub } = useBusiness()
  const type = activeType(selected, sub)
  const title = calendarName(type)
  // one studio for Studio Rental and Paid Podcast: the other one's bookings show here, view only
  const [others, setOthers] = useState<BusySlot[]>([])
  const [viewing, setViewing] = useState<BusySlot | null>(null)
  const refs = useBookingRefs()
  const canAdd = can('bookings', 'add')
  const today = iso(new Date())
  const [anchor, setAnchor] = useState(today)
  const [bookings, setBookings] = useState<BookingRow[] | null>(null)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [status, setStatus] = useState<'' | BookingStatus>('')
  const [drawer, setDrawer] = useState<{ booking: BookingRow | null; date?: string; start?: string; end?: string } | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const shared = !!selected && isStudioType(type)
  const load = useCallback(() => {
    listBookings(tenant.id)
      .then(setBookings)
      .catch((e: Error) => setNotice({ error: e.message }))
    if (shared && selected) studioBusy(selected.id).then(setOthers, () => setOthers([]))
    else setOthers([])
  }, [tenant.id, shared, selected])
  useEffect(load, [load])
  useEffect(() => {
    if (canAdd) void listLeads(tenant.id).then(setLeads, () => setLeads([]))
  }, [tenant.id, canAdd])

  const visible = useMemo(
    () =>
      (bookings ?? [])
        .filter((b) => inScope(b.business_id, b.sub_business_id))
        .filter((b) => (status ? b.status === status : b.status !== 'cancelled')),
    [bookings, inScope, status],
  )
  const scopedLeads = useMemo(() => leads.filter((l) => inScope(l.business_id, l.sub_business_id)), [leads, inScope])

  // ---- stats for the month on screen ----
  const month = anchor.slice(0, 7)
  const stats = useMemo(() => {
    const inMonth = (bookings ?? []).filter((b) => inScope(b.business_id, b.sub_business_id) && b.status !== 'cancelled' && b.booking_date.slice(0, 7) === month)
    const hours = inMonth.reduce((a, b) => a + (minutes(b.end_time) - minutes(b.start_time)) / 60, 0)
    const value = inMonth.reduce((a, b) => a + Number(b.total_amount), 0)
    const paid = inMonth.reduce((a, b) => a + Number(b.paid_amount), 0)
    const todays = (bookings ?? []).filter((b) => inScope(b.business_id, b.sub_business_id) && b.status !== 'cancelled' && b.booking_date === today)
    return { count: inMonth.length, tentative: inMonth.filter((b) => b.status === 'tentative').length, hours, value, due: Math.max(0, value - paid), todays: todays.length }
  }, [bookings, inScope, month, today])

  const open = (id: string) => {
    const b = bookings?.find((x) => x.id === id)
    const o = others.find((x) => x.id === id)
    if (o && (!b || !inScope(b.business_id, b.sub_business_id))) return setViewing(o)
    if (b) setDrawer({ booking: b })
  }
  const items = useMemo(
    () =>
      bookings
        ? visible.map((b) => ({
            id: b.id,
            date: b.booking_date,
            start: b.start_time,
            end: b.end_time,
            title: b.client_name,
            detail: b.purpose,
            meta: `${clock(b.start_time)} – ${clock(b.end_time)}${b.purpose ? ` · ${b.purpose}` : ''} · ${STATUS_META[b.status].label}`,
            color: STATUS_META[b.status].color,
            faded: b.status === 'tentative',
            side: (
              <>
                {money(b.total_amount)}
                {b.total_amount - b.paid_amount > 0 && <span className="text-danger"> · {money(b.total_amount - b.paid_amount)} due</span>}
              </>
            ),
            actions: (
              <>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setDrawer({ booking: b })}>
                  Edit
                </button>
                {b.status !== 'cancelled' && (
                  <a className="btn btn-outline btn-sm" href={invoiceHref(b.id)} target="_blank" rel="noreferrer">
                    Invoice
                  </a>
                )}
              </>
            ),
          }))
        : null,
    [bookings, visible],
  )
  const otherItems = useMemo(() => {
    const mine = new Set(visible.map((b) => b.id))
    return others
      .filter((o) => !mine.has(o.id) && o.sub_business_id !== sub?.id && (!status || o.status === status))
      .map((o) => ({
        id: o.id,
        date: o.booking_date,
        start: o.start_time,
        end: o.end_time,
        title: `${o.client_name} · ${o.sub_name}`,
        detail: 'Studio booked · view only',
        meta: `${clock(o.start_time)} – ${clock(o.end_time)} · Studio booked by ${o.sub_name} · view only`,
        color: '#64748b',
        faded: true,
      }))
  }, [others, visible, sub, status])
  const allItems = useMemo(() => (items ? [...items, ...otherItems] : null), [items, otherItems])

  return (
    <>
      <PageHead
        title={title}
        subtitle="Drag over free time to book a slot. Click a booking to edit it, add payments or invoice it."
        actions={
          canAdd && (
            <button type="button" className="btn btn-primary" onClick={() => setDrawer({ booking: null, date: anchor })}>
              <Plus size={16} /> New booking
            </button>
          )
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      <div className="stat-grid">
        <StatCard icon={CalendarCheck} tone="brand" value={stats.count} label={`Bookings in ${fmt(`${month}-01`, { month: 'short' })}`} hint={stats.tentative ? `${stats.tentative} tentative` : undefined} />
        <StatCard icon={Clock3} tone="info" value={`${Math.round(stats.hours * 10) / 10} h`} label="Hours booked" hint={`${stats.todays} today`} />
        <StatCard icon={IndianRupee} tone="success" value={money(stats.value)} label="Booked value" hint="incl. GST" />
        <StatCard icon={Wallet} tone="danger" value={money(stats.due)} label="Balance to collect" />
      </div>

      <SlotCalendar
        items={allItems}
        anchor={anchor}
        setAnchor={setAnchor}
        storageKey="bookings.view"
        canAdd={canAdd}
        noun="bookings"
        onCreate={(x) => setDrawer({ booking: null, date: x.date, start: x.start, end: x.end })}
        onOpen={open}
        filters={
          <select className="input input-sm filter-select" value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | '')} aria-label="Status">
            <option value="">All but cancelled</option>
            {(Object.keys(STATUS_META) as BookingStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
        }
      />

      <div className="cal-legend">
        {(Object.keys(STATUS_META) as BookingStatus[]).map((s) => (
          <span key={s} className="stage-pill" style={{ ['--c' as string]: STATUS_META[s].color }}>
            {STATUS_META[s].label}
          </span>
        ))}
      </div>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Studio booked" width={460} footer={<button type="button" className="btn btn-outline" onClick={() => setViewing(null)}>Close</button>}>
        {viewing && (
          <dl className="info-grid">
            <div>
              <dt>Booked by</dt>
              <dd>{viewing.sub_name}</dd>
            </div>
            <div>
              <dt>Client</dt>
              <dd>{viewing.client_name}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{fmt(viewing.booking_date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>
                {clock(viewing.start_time)} – {clock(viewing.end_time)}
              </dd>
            </div>
            <div>
              <dt>Purpose</dt>
              <dd>{viewing.purpose || '—'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{STATUS_META[viewing.status as BookingStatus]?.label ?? viewing.status}</dd>
            </div>
          </dl>
        )}
      </Modal>

      {drawer && (
        <BookingDrawer
          key={drawer.booking?.id ?? `${drawer.date}-${drawer.start ?? ''}-${drawer.end ?? ''}`}
          booking={drawer.booking}
          defaults={{ date: drawer.date, start: drawer.start, end: drawer.end }}
          leads={scopedLeads}
          refs={refs}
          onClose={() => setDrawer(null)}
          onSaved={(msg) => {
            setDrawer(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}
    </>
  )
}
