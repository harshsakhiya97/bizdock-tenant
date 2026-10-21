import { useMemo, useState } from 'react'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { subOf, useSubBusinesses } from '@/business/SubBusinessSelect'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Hint, Label, Select, TextInput } from '@/components/Field'
import { SearchSelect } from '@/components/SearchSelect'
import { fullName, money } from '@/leads/labels'
import type { LeadRow } from '@/leads/types'
import { useTenant } from '@/tenant/useTenant'
import { saveBooking } from './api'
import { invoiceHref } from './BookingsTab'
import type { BookingRefs } from './useBookingRefs'
import { STATUS_META, partState, type BookingInput, type BookingRow, type BookingStatus, type ItemDraft, type PartDraft } from './types'

const today = () => new Date().toISOString().slice(0, 10)
const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')
const key = () => Math.random().toString(36).slice(2)
const num = (v: string) => Math.max(0, Number(v) || 0)
/** payment parts offered as labels (any text can be typed) */
const PART_LABELS = ['Advance', 'Pre-shoot', 'After shoot', 'After service', 'Final payment']

/**
 * Add / edit a booking. From a lead or client page the enquiry is fixed; from the calendar it is
 * an existing lead (search) or a new enquiry (name, phone, type), which is added as a lead.
 */
export function BookingDrawer({
  booking: initial,
  defaults,
  lead,
  leads,
  refs,
  onClose,
  onSaved,
}: {
  booking: BookingRow | null
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
  const canEdit = booking ? can('bookings', 'edit') : can('bookings', 'add')
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
    start_time: hm(booking?.start_time) || defaults?.start || '10:00',
    end_time: hm(booking?.end_time) || defaults?.end || '12:00',
    amount: booking ? String(booking.amount) : '',
    items: booking
      ? booking.booking_items?.length
        ? [...booking.booking_items].sort((a, b) => a.sort_order - b.sort_order).map((i) => ({ key: i.id, product_id: i.product_id ?? '', name: i.name, price: String(i.price) }))
        : Number(booking.amount) > 0
          ? [{ key: key(), product_id: '', name: booking.purpose || 'Booking', price: String(booking.amount) }]
          : []
      : [],
    parts: booking
      ? [...booking.booking_payments]
          .sort((a, b) => (a.due_on ?? a.paid_on ?? '').localeCompare(b.due_on ?? b.paid_on ?? ''))
          .map((p) => ({ key: p.id, id: p.id, label: p.label ?? 'Payment', due_on: p.due_on ?? p.paid_on ?? '', amount: String(p.amount), mode: p.payment_mode_id ?? '', note: p.note ?? p.reference ?? '', status: p.status, paid_on: p.paid_on ?? '' }))
      : [],
    gst_applicable: booking?.gst_applicable ?? false,
    gst_rate: booking ? String(booking.gst_rate) : '18',
    status: booking?.status ?? 'confirmed',
    billing_company_id: booking?.billing_company_id ?? refs.companies[0]?.id ?? '',
    notes: booking?.notes ?? '',
  }))
  const set = <K extends keyof BookingInput>(k: K, v: BookingInput[K]) => setInput((p) => ({ ...p, [k]: v }))
  const setItem = (k: string, patch: Partial<ItemDraft>) => setInput((d) => ({ ...d, items: d.items.map((i) => (i.key === k ? { ...i, ...patch } : i)) }))
  const setPart = (k: string, patch: Partial<PartDraft>) => setInput((d) => ({ ...d, parts: d.parts.map((p) => (p.key === k ? { ...p, ...patch } : p)) }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const leadOptions = useMemo(
    () => [
      { value: '', label: '— Direct booking (not from an enquiry) —' },
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
  const gst = input.gst_applicable ? Math.round(amount * (Number(input.gst_rate) || 0)) / 100 : 0
  const total = amount + gst
  const hours = (() => {
    const [a, b] = [input.start_time, input.end_time].map((t) => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    })
    return b > a ? (b - a) / 60 : 0
  })()

  const subs = useSubBusinesses(input.business_id)
  // services of this business (and its sub-business, when the service has one)
  const services = refs.products.filter(
    (p) => p.is_active && p.business_id === input.business_id && (!p.sub_business_id || !input.sub_business_id || p.sub_business_id === input.sub_business_id),
  )
  const planned = input.parts.reduce((s2, p) => s2 + num(p.amount), 0)
  const paidSum = input.parts.filter((p) => p.status === 'paid').reduce((s2, p) => s2 + num(p.amount), 0)
  function addPart() {
    const left = Math.max(0, Math.round((total - planned) * 100) / 100)
    const used = new Set(input.parts.map((p) => p.label))
    setInput((d) => ({
      ...d,
      parts: [
        ...d.parts,
        { key: key(), label: PART_LABELS.find((l) => !used.has(l)) ?? 'Payment', due_on: d.booking_date, amount: left ? String(left) : '', mode: '', note: '', status: 'pending', paid_on: '' },
      ],
    }))
  }
  function pickLead(id: string | null) {
    setPickedLead(id ?? '')
    const l = leads?.find((x) => x.id === id)
    if (l)
      setInput((p) => ({ ...p, lead_id: l.id, business_id: l.business_id, sub_business_id: l.sub_business_id ?? '', client_name: fullName(l), phone: l.phone, purpose: l.purpose ?? p.purpose }))
    else setInput((p) => ({ ...p, lead_id: null, sub_business_id: sub?.id ?? '' }))
  }

  async function save() {
    const data: BookingInput = { ...input, amount: String(amount), new_lead: null, lead_id: fixed ? input.lead_id : pickedLead || null }
    if (!data.business_id) return setError('Pick the business.')
    if (!data.client_name.trim()) return setError('Client name is required.')
    if (!data.booking_date) return setError('Pick the date.')
    if (hours <= 0) return setError('End time must be after the start time.')
    if (input.items.some((i) => !i.name.trim())) return setError('Pick or name every service, or remove it.')
    if (input.parts.some((p) => !(num(p.amount) > 0))) return setError('Enter an amount for every payment part, or remove it.')
    if (planned > total + 0.01) return setError(`The payment parts add up to ${money(planned)}, more than the total ${money(total)}.`)
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
        booking
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
      title={booking ? `Booking · ${booking.client_name}` : 'New booking'}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            {canEdit && (
              <Button onClick={save} disabled={busy}>
                {busy ? 'Saving…' : booking ? 'Save booking' : extra.length ? `Save ${extra.length + 1} bookings` : 'Book slot'}
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="stack">
        <FormSection title="Booking details" description={booking ? undefined : 'Pick the enquiry and the client details fill in. A confirmed booking can’t overlap another confirmed slot on the same date.'}>
          <div className="form-grid">
            <div className="span-2">
              <Label htmlFor="bk-lead">Linked enquiry</Label>
              {fixed ? (
                <div className="bk-who">
                  <b>{input.lead_id ? (lead?.name ?? input.client_name) : 'Direct booking (not from an enquiry)'}</b>
                </div>
              ) : (
                <SearchSelect id="bk-lead" value={pickedLead} onChange={pickLead} options={leadOptions} placeholder="— Direct booking (not from an enquiry) —" />
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
                Date
              </Label>
              <TextInput id="bk-date" type="date" value={input.booking_date} onChange={(e) => set('booking_date', e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="bk-purpose">Purpose</Label>
              <TextInput id="bk-purpose" placeholder="e.g. Podcast" value={input.purpose} onChange={(e) => set('purpose', e.target.value)} disabled={!canEdit} />
            </div>
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
            <div>
              <Label htmlFor="bk-status">Status</Label>
              <Select id="bk-status" value={input.status} onChange={(e) => set('status', e.target.value as BookingStatus)} disabled={!canEdit}>
                {(Object.keys(STATUS_META) as BookingStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {STATUS_META[st].label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="span-2">
              <Label htmlFor="bk-notes">Note</Label>
              <TextInput id="bk-notes" placeholder="Setup requirements, payment terms, anything useful" value={input.notes} onChange={(e) => set('notes', e.target.value)} disabled={!canEdit} />
            </div>
          </div>

          {!booking && (
            <div className="stack" style={{ gap: 8 }}>
              {extra.map((x, i) => {
                const upd = (k: 'date' | 'start' | 'end' | 'amount', v: string) => setExtra((l) => l.map((y, j) => (j === i ? { ...y, [k]: v } : y)))
                return (
                  <div key={i} className="bk-extra">
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
                <Hint>For multi-day shoots: each date is saved as a separate booking for this client. Services, GST, status and note are copied; the payment plan stays on the first date.</Hint>
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
            <div className="span-2 bk-gst">
              <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
                <Checkbox id="bk-gst" checked={input.gst_applicable} onChange={(v) => set('gst_applicable', v)} label="Add GST on this booking" />
                {input.gst_applicable && (
                  <TextInput aria-label="GST %" type="number" min={0} style={{ width: 80 }} value={input.gst_rate} onChange={(e) => set('gst_rate', e.target.value)} disabled={!canEdit} />
                )}
              </div>
              <div className="bk-total">
                <span className="muted small">Booking amount {money(amount)} · Total payable</span>
                <b>{amount ? money(total) : '—'}</b>
                <span className="muted small">{input.gst_applicable ? `incl. GST ${money(gst)}` : 'No GST'}</span>
              </div>
            </div>
        </FormSection>

        <FormSection title="Payment plan" description="Split the amount into parts (advance, pre-shoot, after shoot…); mark each Paid when the money comes in.">
          {input.parts.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              {input.parts.map((p) => {
                const st = partState({ status: p.status, due_on: p.due_on || null })
                return (
                  <div key={p.key} className={`bk-part is-${st}`}>
                    <div className="bk-part-row">
                      <label className="bk-cell">
                        <span>Part</span>
                        <TextInput placeholder="e.g. Advance" value={p.label} onChange={(e) => setPart(p.key, { label: e.target.value })} disabled={!canEdit} />
                      </label>
                      <label className="bk-cell">
                        <span>Due date</span>
                        <TextInput type="date" value={p.due_on} onChange={(e) => setPart(p.key, { due_on: e.target.value })} disabled={!canEdit} />
                      </label>
                      <label className="bk-cell">
                        <span>Amount (₹)</span>
                        <TextInput type="number" min={0} placeholder="Amount" value={p.amount} onChange={(e) => setPart(p.key, { amount: e.target.value })} disabled={!canEdit} />
                      </label>
                      <label className="bk-cell">
                        <span>Status</span>
                        <Select
                          className={st === 'overdue' ? 'is-overdue' : undefined}
                          value={p.status}
                          disabled={!canEdit}
                          onChange={(e) => {
                            const v = e.target.value as PartDraft['status']
                            setPart(p.key, v === 'paid' ? { status: v, paid_on: p.paid_on || today(), mode: p.mode || refs.modes[0]?.id || '' } : { status: v, paid_on: '', mode: '' })
                          }}
                        >
                          <option value="pending">{st === 'overdue' ? 'Overdue' : 'Pending'}</option>
                          <option value="paid">Paid</option>
                        </Select>
                      </label>
                      {canEdit ? (
                        <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove part" onClick={() => setInput((d) => ({ ...d, parts: d.parts.filter((x) => x.key !== p.key) }))}>
                          <Trash2 size={15} />
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                    {p.status === 'paid' ? (
                      <div className="bk-part-row2">
                        <label className="bk-cell">
                          <span>Received on</span>
                          <TextInput type="date" value={p.paid_on} onChange={(e) => setPart(p.key, { paid_on: e.target.value })} disabled={!canEdit} />
                        </label>
                        <label className="bk-cell">
                          <span>Mode</span>
                          <Select value={p.mode} onChange={(e) => setPart(p.key, { mode: e.target.value })} disabled={!canEdit}>
                            <option value="">—</option>
                            {refs.modes.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label className="bk-cell">
                          <span>Comment</span>
                          <TextInput placeholder="UTR, who paid…" value={p.note} onChange={(e) => setPart(p.key, { note: e.target.value })} disabled={!canEdit} />
                        </label>
                      </div>
                    ) : (
                      <label className="bk-cell">
                        <span>Comment</span>
                        <TextInput placeholder="e.g. after reels are delivered" value={p.note} onChange={(e) => setPart(p.key, { note: e.target.value })} disabled={!canEdit} />
                      </label>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <div className="row-between">
            {canEdit ? (
              <Button variant="outline" size="sm" onClick={addPart}>
                <Plus /> Add payment part
              </Button>
            ) : (
              <span />
            )}
            <span className="small muted">
              Planned {money(planned)} of {money(total)} · paid <b className="tone-success">{money(paidSum)}</b> · balance <b>{money(Math.max(0, total - paidSum))}</b>
              {total - planned > 0.01 && input.parts.length > 0 && <span className="tone-warning"> · {money(total - planned)} not planned yet</span>}
            </span>
          </div>
        </FormSection>

        {booking && booking.status !== 'cancelled' && (
          <FormSection title="Invoice">
            <div className="row-between">
              <span className="muted small">{booking.invoice_no ? <b>{booking.invoice_no}</b> : 'No invoice number yet.'}</span>
              <a className="btn btn-outline btn-sm" href={invoiceHref(booking.id)} target="_blank" rel="noreferrer">
                <FileText size={14} /> Invoice
              </a>
            </div>
          </FormSection>
        )}
      </div>
    </Drawer>
  )
}
