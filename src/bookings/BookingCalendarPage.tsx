import { useCallback, useEffect, useMemo, useState } from 'react'
import { Act, Acts } from '@/components/Acts'
import { useNavigate } from 'react-router'
import { CalendarCheck, Clock3, FileText, IndianRupee, Pencil, Plus, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { PageHead, StatCard } from '@/components/ui'
import { SlotCalendar, clock, fmtDay as fmt, isoDay as iso, minutesOf as minutes } from '@/components/SlotCalendar'
import { isStudioType } from '@/business/activeType'
import { Modal } from '@/components/Modal'
import { listLeads } from '@/leads/api'
import { money } from '@/leads/labels'
import type { LeadRow } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { listBookings, studioBusy, type BusySlot } from './api'
import { BookingDrawer } from './BookingDrawer'
import { useBookingRefs } from './useBookingRefs'
import { STATUS_META, type BookingRow, type BookingStatus } from './types'
import { Flash } from '@/components/Flash'
import { StatRecords, type StatShow } from '@/components/StatRecords'
import { Select } from '@/components/Field'
/**
 * Studio Schedule: the studio's own schedule, whatever business is picked in the top bar: every Paid Podcast and Studio
 * Rental booking (all podcast studios, or one). Day / week / month; drag over free time to book it.
 */
export function BookingCalendarPage() {
  const tenant = useTenant()
  const navigate = useNavigate()
  const { can, businesses } = useAuth()
  const { selected } = useBusiness()
  const title = 'Studio Schedule'
  // the studio businesses this person works in (a new booking is for one of them)
  const studioBiz = useMemo(() => businesses.filter((b) => isStudioType(b.type)), [businesses])
  const defaultBiz = selected && studioBiz.some((b) => b.id === selected.id) ? selected.id : (studioBiz[0]?.id ?? null)
  // bookings of studio businesses this person isn't in show here too, view only
  const [others, setOthers] = useState<BusySlot[]>([])
  const [viewing, setViewing] = useState<BusySlot | null>(null)
  const refs = useBookingRefs()
  const studioName = (id: string) => refs.studios.find((x) => x.id === id)?.name ?? 'Studio'
  const canAdd = can('bookings', 'add')
  const today = iso(new Date())
  const [anchor, setAnchor] = useState(today)
  const [bookings, setBookings] = useState<BookingRow[] | null>(null)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [status, setStatus] = useState<'' | BookingStatus>('')
  // Studio Rental / Paid Podcast: one podcast studio, or all
  const [studioF, setStudioF] = useState('')
  const [drawer, setDrawer] = useState<{ booking: BookingRow | null; date?: string; start?: string; end?: string } | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const shared = true
  const anyStudio = studioBiz[0]?.id
  const load = useCallback(() => {
    listBookings(tenant.id)
      .then(setBookings)
      .catch((e: Error) => setNotice({ error: e.message }))
    if (anyStudio) studioBusy(anyStudio).then(setOthers, () => setOthers([]))
    else setOthers([])
  }, [tenant.id, anyStudio])
  useEffect(load, [load])
  useEffect(() => {
    if (canAdd) void listLeads(tenant.id, undefined, { cached: true }).then(setLeads, () => setLeads([]))
  }, [tenant.id, canAdd])

  const visible = useMemo(
    () =>
      (bookings ?? [])
        .filter((b) => studioBiz.some((x) => x.id === b.business_id))
        .filter((b) => (status ? b.status === status : b.status !== 'cancelled'))
        .filter((b) => !studioF || b.studio_id === studioF),
    [bookings, studioBiz, status, studioF],
  )
  const scopedLeads = useMemo(() => leads.filter((l) => studioBiz.some((x) => x.id === l.business_id)), [leads, studioBiz])

  // ---- stats for the month on screen ----
  const month = anchor.slice(0, 7)
  const stats = useMemo(() => {
    // the cards follow the status filter (cancelled ones only when that's picked)
    const inMonth = visible.filter((b) => b.booking_date.slice(0, 7) === month)
    const hours = inMonth.reduce((a, b) => a + (minutes(b.end_time) - minutes(b.start_time)) / 60, 0)
    const value = inMonth.reduce((a, b) => a + Number(b.total_amount), 0)
    const paid = inMonth.reduce((a, b) => a + Number(b.paid_amount), 0)
    const todays = visible.filter((b) => b.booking_date === today)
    return { count: inMonth.length, hours, value, due: Math.max(0, value - paid), todays: todays.length }
  }, [visible, month, today])

  // a stat card's records: those bookings (click one to open it)
  const [statShow, setStatShow] = useState<StatShow<BookingRow> | null>(null)
  const showBk = (title: string, f: (b: BookingRow) => boolean) => () =>
    setStatShow({
      title,
      rows: visible.filter(f).sort((a, b) => (a.booking_date + a.start_time).localeCompare(b.booking_date + b.start_time)),
      cols: [
        { label: 'When', render: (b) => <span className="nowrap">{`${fmt(b.booking_date, { day: 'numeric', month: 'short', year: 'numeric' })} · ${clock(b.start_time)} – ${clock(b.end_time)}`}</span> },
        { label: 'Client', render: (b) => <b>{b.client_name}</b> },
        { label: 'Status', render: (b) => <span className={`badge ${STATUS_META[b.status].tone}`}>{STATUS_META[b.status].label}</span> },
        { label: 'Hours', num: true, render: (b) => Math.round(((minutes(b.end_time) - minutes(b.start_time)) / 60) * 10) / 10 },
        { label: 'Value', num: true, render: (b) => money(b.total_amount) },
        { label: 'Balance', num: true, render: (b) => money(Math.max(0, Number(b.total_amount) - Number(b.paid_amount))) },
      ],
    })
  const inMon = (b: BookingRow) => b.booking_date.slice(0, 7) === month
  const open = (id: string) => {
    const b = bookings?.find((x) => x.id === id)
    const o = others.find((x) => x.id === id)
    if (o && (!b || !studioBiz.some((x) => x.id === b.business_id))) return setViewing(o)
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
            meta: `${clock(b.start_time)} – ${clock(b.end_time)}${b.purpose ? ` · ${b.purpose}` : ''}${shared && b.studio_id ? ` · ${studioName(b.studio_id)}` : ''} · ${STATUS_META[b.status].label}`,
            color: STATUS_META[b.status].color,
            side: (
              <>
                {money(b.total_amount)}
                {b.total_amount - b.paid_amount > 0 && <span className="text-danger"> · {money(b.total_amount - b.paid_amount)} due</span>}
              </>
            ),
            actions: (
              <Acts>
                <Act icon={Pencil} label="Edit" onClick={() => setDrawer({ booking: b })} />
                {b.invoice_id && <Act icon={FileText} label="Invoice" onClick={() => navigate(`/invoices/${b.invoice_id}`)} />}
              </Acts>
            ),
          }))
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, visible, shared, refs.studios],
  )
  const otherItems = useMemo(() => {
    const mine = new Set(visible.map((b) => b.id))
    return others
      .filter((o) => !mine.has(o.id) && (!status || o.status === status) && (!studioF || o.studio_id === studioF))
      .map((o) => ({
        id: o.id,
        date: o.booking_date,
        start: o.start_time,
        end: o.end_time,
        title: `${o.client_name} · ${o.sub_name}`,
        detail: 'Studio booked · view only',
        meta: `${clock(o.start_time)} – ${clock(o.end_time)} · ${o.studio_name ?? 'Studio'} booked by ${o.sub_name} · view only`,
        color: '#64748b',
        faded: true,
      }))
  }, [others, visible, status, studioF])
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
        <StatCard icon={CalendarCheck} tone="brand" value={stats.count} label={`Bookings in ${fmt(`${month}-01`, { month: 'short' })}`} onClick={showBk(`Bookings in ${fmt(`${month}-01`, { month: 'short' })}`, inMon)} />
        <StatCard icon={Clock3} tone="info" value={`${Math.round(stats.hours * 10) / 10} h`} label="Hours booked" hint={`${stats.todays} today`} onClick={showBk('Hours booked', inMon)} />
        <StatCard icon={IndianRupee} tone="success" value={money(stats.value)} label="Booked value" hint="incl. GST" onClick={showBk('Booked value', (b) => inMon(b) && Number(b.total_amount) > 0)} />
        <StatCard icon={Wallet} tone="danger" value={money(stats.due)} label="Balance to collect" onClick={showBk('Balance to collect', (b) => inMon(b) && Number(b.total_amount) - Number(b.paid_amount) > 0.01)} />
      </div>
      <StatRecords show={statShow} onClose={() => setStatShow(null)} rowKey={(b) => b.id} onRow={(b) => setDrawer({ booking: b })} />

      <SlotCalendar
        items={allItems}
        anchor={anchor}
        setAnchor={setAnchor}
        storageKey="bookings.view"
        canAdd={canAdd}
        noun="bookings"
        filtersRow
        onCreate={(x) => setDrawer({ booking: null, date: x.date, start: x.start, end: x.end })}
        onOpen={open}
        filters={
          <>
          {shared && refs.studios.length > 0 && (
            <Select className="input input-sm filter-select" value={studioF} onChange={(e) => setStudioF(e.target.value)} aria-label="Podcast studio">
              <option value="">All studios</option>
              {refs.studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
          <Select className="input input-sm filter-select" value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | '')} aria-label="Status">
            <option value="">All but cancelled</option>
            {(Object.keys(STATUS_META) as BookingStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
          </>
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
          businessChoices={drawer.booking ? undefined : studioBiz.map((b) => ({ id: b.id, name: b.name }))}
          defaultBusinessId={defaultBiz}
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
