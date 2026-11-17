import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { subOf, useSubBusinesses } from '@/business/SubBusinessSelect'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection, Hint, Label, Select, TextArea, TextInput } from '@/components/Field'
import { SearchSelect } from '@/components/SearchSelect'
import { fullName, money } from '@/leads/labels'
import type { LeadRow, MemberOption } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { saveBooking, studioBusy, studioClash, type BusySlot } from './api'
import { isStudioType } from '@/business/activeType'
import type { BookingRefs } from './useBookingRefs'
import { ORDER_STATUS, STATUS_META, invoiceNo, type BookingInput, type BookingRow, type BookingStatus, type ItemDraft, type OrderStatus } from './types'
import { listMemberOptions } from '@/leads/api'

const today = () => new Date().toISOString().slice(0, 10)
const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')
const key = () => Math.random().toString(36).slice(2)
const num = (v: string) => Math.max(0, Number(v) || 0)

/**
 * Add / edit a booking. From a lead or client page the enquiry is fixed; from the calendar it is
 * an existing lead (search) or a new enquiry (name, phone, type), which is added as a lead.
 */
export function BookingDrawer({
  booking: initial,
  service = false,
  noun = 'Order',
  copyFrom,
  locked = false,
  defaults,
  lead,
  leads,
  refs,
  onClose,
  onSaved,
}: {
  booking: BookingRow | null
  /** Default business: a service purchase (no calendar slot, no time) */
  service?: boolean
  /** what a service booking is called: Order, or Brand Deal */
  noun?: string
  /** Repeat: a new booking with this one's services, GST and note */
  copyFrom?: BookingRow | null
  /** an order whose invoice is fully paid: shown, not editable */
  locked?: boolean
  defaults?: { date?: string; start?: string; end?: string }
  /** fixed enquiry (lead / client page) */
  lead?: { id: string | null; customer_id?: string | null; name: string; phone: string; purpose: string | null; business_id: string; sub_business_id?: string | null } | null
  /** leads to pick from (calendar) */
  leads?: LeadRow[]
  refs: BookingRefs
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const { can, membership, businesses } = useAuth()
  const { selected, sub } = useBusiness()
  const me = membership?.id
  const booking = initial
  const close = onClose
  const canEdit = !locked && (booking ? can('bookings', 'edit') : can('bookings', 'add'))
  const fixed = !!lead || !!booking
  // calendar: a lead to link, or '' for a direct booking (no enquiry)
  const [pickedLead, setPickedLead] = useState<string>('')
  // multi-day: more dates for the same client (saved as separate bookings)
  const [extra, setExtra] = useState<{ date: string; start: string; end: string; amount: string }[]>([])
  const [input, setInput] = useState<BookingInput>(() => ({
    business_id: booking?.business_id ?? lead?.business_id ?? selected?.id ?? businesses[0]?.id ?? '',
    sub_business_id: booking ? (booking.sub_business_id ?? '') : (lead ? (lead.sub_business_id ?? '') : (sub?.id ?? '')),
    product_id: booking?.product_id ?? '',
    lead_id: booking?.lead_id ?? lead?.id ?? null,
    customer_id: booking ? undefined : (lead?.customer_id ?? null),
    new_lead: null,
    client_name: booking?.client_name ?? lead?.name ?? '',
    phone: booking?.phone ?? lead?.phone ?? '',
    purpose: booking?.purpose ?? lead?.purpose ?? '',
    booking_date: booking?.booking_date ?? defaults?.date ?? today(),
    start_time: service ? '00:00' : hm(booking?.start_time) || defaults?.start || '10:00',
    end_time: service ? '00:00' : hm(booking?.end_time) || defaults?.end || '12:00',
    amount: booking ? String(booking.amount) : '',
    items: booking
      ? booking.booking_items?.length
        ? [...booking.booking_items].sort((a, b) => a.sort_order - b.sort_order).map((i) => ({ key: i.id, product_id: i.product_id ?? '', name: i.name, price: String(i.price) }))
        : Number(booking.amount) > 0
          ? [{ key: key(), product_id: '', name: booking.purpose || 'Booking', price: String(booking.amount) }]
          : []
      : copyFrom?.booking_items?.length
        ? [...copyFrom.booking_items].sort((a, b) => a.sort_order - b.sort_order).map((i) => ({ key: key(), product_id: i.product_id ?? '', name: i.name, price: String(i.price) }))
        : [],
    parts: booking
      ? [...booking.booking_payments]
          .sort((a, b) => (a.due_on ?? a.paid_on ?? '').localeCompare(b.due_on ?? b.paid_on ?? ''))
          .map((p) => ({ key: p.id, id: p.id, label: p.label ?? 'Payment', due_on: p.due_on ?? p.paid_on ?? '', amount: String(p.amount), mode: p.payment_mode_id ?? '', note: p.note ?? p.reference ?? '', status: p.status, paid_on: p.paid_on ?? '' }))
      : [],
    gst_applicable: booking?.gst_applicable ?? copyFrom?.gst_applicable ?? false,
    gst_rate: booking ? String(booking.gst_rate) : copyFrom ? String(copyFrom.gst_rate) : '18',
    status: booking?.status ?? 'confirmed',
    ...(service ? { order_status: booking?.order_status ?? 'not_started', owner_id: booking?.owner_id ?? membership?.id ?? '' } : {}),
    billing_company_id: booking?.billing_company_id ?? copyFrom?.billing_company_id ?? refs.companies[0]?.id ?? '',
    notes: booking?.notes ?? copyFrom?.notes ?? '',
  }))
  const set = <K extends keyof BookingInput>(k: K, v: BookingInput[K]) => setInput((p) => ({ ...p, [k]: v }))
  const setItem = (k: string, patch: Partial<ItemDraft>) => setInput((d) => ({ ...d, items: d.items.map((i) => (i.key === k ? { ...i, ...patch } : i)) }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // an order: the team member who took it
  const [members, setMembers] = useState<MemberOption[]>([])
  useEffect(() => {
    if (service) void listMemberOptions(tenant.id).then(setMembers)
  }, [service, tenant.id])
  const word = service ? noun.toLowerCase() : 'booking'

  const leadOptions = useMemo(
    () => [
      { value: '', label: '— Direct booking (not from a lead) —' },
      ...(leads ?? []).filter((l) => !l.is_archived).map((l) => ({ value: l.id, label: `${fullName(l)} · ${l.phone}` })),
    ],
    [leads],
  )
  const minutes = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  // the booking amount is the sum of its services
  const amount = input.items.reduce((s2, i) => s2 + num(i.price), 0)
  const hours = (() => {
    const [a, b] = [input.start_time, input.end_time].map((t) => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    })
    return b > a ? (b - a) / 60 : 0
  })()

  const subs = useSubBusinesses(input.business_id)
  // Studio Rental and Paid Podcast share one studio: no two of their bookings at the same time
  const bizType = businesses.find((b) => b.id === input.business_id)?.type ?? null
  const studio = isStudioType(input.sub_business_id ? subs.find((x) => x.id === input.sub_business_id)?.type : subs.length ? null : bizType)
  const [taken, setTaken] = useState<BusySlot[]>([])
  useEffect(() => {
    if (!studio || !input.business_id) return
    let live = true
    studioBusy(input.business_id).then(
      (b) => live && setTaken(b),
      () => live && setTaken([]),
    )
    return () => {
      live = false
    }
  }, [studio, input.business_id])
  const clockOf = (t: string) => new Date(2000, 0, 1, ...(t.split(':').map(Number) as [number, number])).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  const clashText = (c: BusySlot | null) =>
    c
      ? `Studio not available on ${new Date(`${c.booking_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${clockOf(c.start_time)} – ${clockOf(c.end_time)}: booked for ${c.client_name} (${c.sub_name}).`
      : null
  const clashes =
    studio && input.status !== 'cancelled'
      ? [
          studioClash(taken, { id: booking?.id, date: input.booking_date, start: input.start_time, end: input.end_time }),
          ...extra.map((x) => (x.date && x.start && x.end ? studioClash(taken, { date: x.date, start: x.start, end: x.end }) : null)),
        ]
      : []
  const clash = clashes.find(Boolean) ?? null
  // services of this business (and its sub-business, when the service has one)
  const services = refs.products.filter(
    (p) => p.is_active && p.business_id === input.business_id && (!p.sub_business_id || !input.sub_business_id || p.sub_business_id === input.sub_business_id),
  )
  function pickLead(id: string | null) {
    setPickedLead(id ?? '')
    const l = leads?.find((x) => x.id === id)
    if (l)
      setInput((p) => ({ ...p, lead_id: l.id, business_id: l.business_id, sub_business_id: l.sub_business_id ?? '', client_name: fullName(l), phone: l.phone, purpose: l.purpose ?? p.purpose }))
    else setInput((p) => ({ ...p, lead_id: null, sub_business_id: sub?.id ?? '' }))
  }

  async function save() {
    // an order (Default / Brand Deals) has no GST or payments of its own: they're on its invoice
    const data: BookingInput = { ...input, gst_applicable: false, parts: [], amount: String(amount), new_lead: null, lead_id: fixed ? input.lead_id : pickedLead || null }
    if (!data.business_id) return setError('Pick the business.')
    if (!data.client_name.trim()) return setError('Client name is required.')
    if (!data.booking_date) return setError('Pick the date.')
    if (!service && hours <= 0) return setError('End time must be after the start time.')
    if (service && !input.items.length) return setError('Add at least one service.')
    if (clash) return setError(clashText(clash))
    if (input.items.some((i) => !i.name.trim())) return setError('Pick or name every service, or remove it.')
    for (const x of extra) {
      if (!x.date) return setError('Pick a date for every extra day, or remove it.')
      if (!x.start || !x.end || minutes(x.end) <= minutes(x.start)) return setError(`On ${x.date} the end time must be after the start time.`)
    }
    setBusy(true)
    setError(null)
    try {
      const clean = { ...data, sub_business_id: subOf(subs, data.sub_business_id) }
      await saveBooking(tenant.id, me, booking, clean, null)
      // extra dates: same client, GST, status and note; the advance stays on the first date
      // extra dates: the same services (or one line with that date's amount); payment parts stay on the first date
      for (const x of extra) {
        const same = Math.abs(num(x.amount) - amount) < 0.01
        const items = same ? clean.items : [{ key: key(), product_id: '', name: clean.items.map((i) => i.name).join(' + ') || clean.purpose || 'Booking', price: x.amount }]
        await saveBooking(tenant.id, me, null, { ...clean, booking_date: x.date, start_time: x.start, end_time: x.end, amount: x.amount, items, parts: [] }, null)
      }
      const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      onSaved(
        service
          ? booking
            ? `${noun} updated.`
            : `New ${word} for ${data.client_name.trim()}: ${input.items.map((i) => i.name).join(', ')}. Generate its invoice from the ${noun}s list.`
          : booking
          ? 'Booking updated.'
          : `Booked ${data.client_name.trim()} on ${[data.booking_date, ...extra.map((x) => x.date)].map(day).join(', ')}.`,
      )
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      onClose={close}
      width={720}
      title={
        service
          ? booking
            ? `${noun} ${booking.order_no ?? ''} · ${booking.client_name}`
            : copyFrom
              ? `New ${word} (repeat)`
              : `New ${word}`
          : booking
            ? `Booking · ${booking.client_name}`
            : 'New booking'
      }
      footer={
        <>
          <Button variant="outline" onClick={close}>
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            {canEdit && (
              <Button onClick={save} disabled={busy || !!clash}>
                {busy ? 'Saving…' : booking ? `Save ${word}` : service ? `Save ${word}` : extra.length ? `Save ${extra.length + 1} bookings` : 'Book slot'}
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="stack">
        <FormSection
          title={service ? `${noun} details` : 'Booking details'}
          description={booking ? undefined : service ? `Add the services below. The ${word} gets the next ORD number; GST, payments and the invoice come later, from the ${noun}s list → Generate invoice.` : 'Pick the lead and the client details fill in. A confirmed booking can’t overlap another confirmed slot on the same date.'}
        >
          <div className="form-grid">
            <div className="span-2">
              <Label htmlFor="bk-lead">Linked lead</Label>
              {fixed ? (
                <div className="bk-who">
                  <b>{input.lead_id ? (lead?.name ?? input.client_name) : 'Direct booking (not from a lead)'}</b>
                </div>
              ) : (
                <SearchSelect id="bk-lead" value={pickedLead} onChange={pickLead} options={leadOptions} placeholder="— Direct booking (not from a lead) —" />
              )}
            </div>
            <div>
              <Label htmlFor="bk-name" required>
                Client name
              </Label>
              <TextInput id="bk-name" value={input.client_name} onChange={(e) => set('client_name', e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="bk-phone">Phone</Label>
              <TextInput id="bk-phone" type="tel" value={input.phone} onChange={(e) => set('phone', e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="bk-date" required>
                {service ? `${noun} date` : 'Date'}
              </Label>
              <TextInput id="bk-date" type="date" value={input.booking_date} onChange={(e) => set('booking_date', e.target.value)} disabled={!canEdit} />
            </div>
            {service ? (
              <div>
                <Label htmlFor="bk-owner">Team member</Label>
                <Select id="bk-owner" value={input.owner_id ?? ''} onChange={(e) => set('owner_id', e.target.value)} disabled={!canEdit}>
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div>
                <Label htmlFor="bk-purpose">Purpose</Label>
                <TextInput id="bk-purpose" placeholder="e.g. Podcast" value={input.purpose} onChange={(e) => set('purpose', e.target.value)} disabled={!canEdit} />
              </div>
            )}
            {!service && (
            <>
            <div>
              <Label htmlFor="bk-start" required>
                Start time
              </Label>
              <TextInput id="bk-start" type="time" step={900} value={input.start_time} onChange={(e) => set('start_time', e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="bk-end" required>
                End time
              </Label>
              <TextInput id="bk-end" type="time" step={900} value={input.end_time} onChange={(e) => set('end_time', e.target.value)} disabled={!canEdit} />
            </div>
            </>
            )}
            {clashes[0] && <div className="span-2 alert alert-error small">{clashText(clashes[0])}</div>}
            <div>
              <Label htmlFor="bk-status">Status</Label>
              {service ? (
                <Select id="bk-status" value={input.order_status ?? 'not_started'} onChange={(e) => set('order_status', e.target.value as OrderStatus)} disabled={!canEdit}>
                  {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {ORDER_STATUS[st].label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Select id="bk-status" value={input.status} onChange={(e) => set('status', e.target.value as BookingStatus)} disabled={!canEdit}>
                  {(Object.keys(STATUS_META) as BookingStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {STATUS_META[st].label}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div className="span-2">
              <Label htmlFor="bk-notes">{service ? 'Description' : 'Note'}</Label>
              {service ? (
                <TextArea id="bk-notes" rows={4} placeholder={`What’s in this ${word}: deliverables, timelines, payment terms…`} value={input.notes} onChange={(e) => set('notes', e.target.value)} disabled={!canEdit} />
              ) : (
                <TextInput id="bk-notes" placeholder="Setup requirements, payment terms, anything useful" value={input.notes} onChange={(e) => set('notes', e.target.value)} disabled={!canEdit} />
              )}
            </div>
          </div>

          {!booking && !service && (
            <div className="stack" style={{ gap: 8 }}>
              {extra.map((x, i) => {
                const upd = (k: 'date' | 'start' | 'end' | 'amount', v: string) => setExtra((l) => l.map((y, j) => (j === i ? { ...y, [k]: v } : y)))
                return (
                  <div key={i} className="stack" style={{ gap: 6 }}>
                  <div className="bk-extra">
                    <div>
                      <Label htmlFor={`bx-d-${i}`} required>
                        Date
                      </Label>
                      <TextInput id={`bx-d-${i}`} type="date" value={x.date} onChange={(e) => upd('date', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor={`bx-s-${i}`} required>
                        Start time
                      </Label>
                      <TextInput id={`bx-s-${i}`} type="time" step={900} value={x.start} onChange={(e) => upd('start', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor={`bx-e-${i}`} required>
                        End time
                      </Label>
                      <TextInput id={`bx-e-${i}`} type="time" step={900} value={x.end} onChange={(e) => upd('end', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor={`bx-a-${i}`}>Amount (₹)</Label>
                      <TextInput id={`bx-a-${i}`} type="number" min={0} placeholder="Charge before GST" value={x.amount} onChange={(e) => upd('amount', e.target.value)} />
                    </div>
                    <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove this date" onClick={() => setExtra((l) => l.filter((_, j) => j !== i))}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {clashes[i + 1] && <div className="alert alert-error small">{clashText(clashes[i + 1])}</div>}
                  </div>
                )
              })}
              <div className="row" style={{ gap: 10 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const last = extra[extra.length - 1]?.date || input.booking_date
                    // the day after the last date (local date, no time-zone shift)
                    const [y, m, d] = last.split('-').map(Number)
                    const next = new Date(y, m - 1, d + 1)
                    const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
                    setExtra((l) => [...l, { date: iso, start: input.start_time, end: input.end_time, amount: String(amount) }])
                  }}
                >
                  <Plus /> Add another date
                </Button>
                <Hint>For multi-day shoots: each date is saved as a separate booking for this client. Services, status and note are copied. GST and payments go on the invoice (Bookings list → Generate invoice).</Hint>
              </div>
            </div>
          )}
        </FormSection>

        <FormSection title="Services" description="Pick the services for this booking; the price comes from Masters → Services and can be changed here.">
          {input.items.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              {input.items.map((i) => (
                <div key={i.key} className="bk-item">
                  <Select
                    aria-label="Service"
                    value={i.product_id}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const p = services.find((x) => x.id === e.target.value)
                      setItem(i.key, p ? { product_id: p.id, name: p.name, price: String(Number(p.price)) } : { product_id: '' })
                    }}
                  >
                    <option value="">Other (type a name)</option>
                    {services.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {money(p.price)}
                      </option>
                    ))}
                  </Select>
                  <TextInput aria-label="Service name" placeholder="Service" value={i.name} onChange={(e) => setItem(i.key, { name: e.target.value })} disabled={!canEdit || !!i.product_id} />
                  <TextInput aria-label="Price" type="number" min={0} placeholder="Price" value={i.price} onChange={(e) => setItem(i.key, { price: e.target.value })} disabled={!canEdit} />
                  {canEdit && (
                    <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove service" onClick={() => setInput((d) => ({ ...d, items: d.items.filter((x) => x.key !== i.key) }))}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = services.find((p) => !input.items.some((i) => i.product_id === p.id))
                  setInput((d) => ({ ...d, items: [...d.items, next ? { key: key(), product_id: next.id, name: next.name, price: String(Number(next.price)) } : { key: key(), product_id: '', name: '', price: '' }] }))
                }}
              >
                <Plus /> Add service
              </Button>
              {!services.length && <Hint>No services in Masters yet; type a name and price, or add them in Masters → Services.</Hint>}
            </div>
          )}
            <div className="bk-total" style={{ alignItems: 'flex-end' }}>
              <span className="muted small">{service ? noun : 'Booking'} amount (before GST · GST and payments are on its invoice)</span>
              <b>{amount ? money(amount) : '—'}</b>
            </div>
        </FormSection>

        {booking && (
          <FormSection title="Invoice">
            <div className="row-between">
              <span className="muted small">
                {booking.invoice_id ? (
                  <>
                    On invoice <b>{invoiceNo(booking)}</b>
                    {locked ? ' · fully paid, so this ' + word + ' can’t be changed.' : ' · GST and payments are on the invoice.'}
                  </>
                ) : booking.status === 'cancelled' ? (
                  'Cancelled: not invoiced.'
                ) : (
                  `Not invoiced yet. Tick it in the ${service ? noun : 'Booking'}s list → Generate invoice.`
                )}
              </span>
              {booking.invoice_id && (
                <Link className="btn btn-outline btn-sm" to={`/invoices/${booking.invoice_id}`} onClick={close}>
                  <FileText size={14} /> Open invoice
                </Link>
              )}
            </div>
          </FormSection>
        )}

      </div>
    </Drawer>
  )
}
