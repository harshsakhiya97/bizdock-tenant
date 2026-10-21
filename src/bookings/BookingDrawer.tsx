import { useMemo, useState } from 'react'
import { Link } from 'react-router'
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
import { addBookingPayment, createBookingInvoice, deleteBookingPayment, getBooking, saveBooking } from './api'
import type { BookingRefs } from './useBookingRefs'
import { STATUS_META, type BookingInput, type BookingRow, type BookingStatus } from './types'

const today = () => new Date().toISOString().slice(0, 10)
const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')

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
  // payments are added / removed in place; the page reloads when the drawer closes
  const [booking, setBooking] = useState(initial)
  const [paid, setPaid] = useState(false)
  const close = () => (paid ? onSaved('Payments updated.') : onClose())
  async function refresh() {
    if (!booking) return
    const b = await getBooking(booking.id)
    if (b) setBooking(b)
    setPaid(true)
  }
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
    gst_applicable: booking?.gst_applicable ?? false,
    gst_rate: booking ? String(booking.gst_rate) : '18',
    status: booking?.status ?? 'confirmed',
    billing_company_id: booking?.billing_company_id ?? refs.companies[0]?.id ?? '',
    notes: booking?.notes ?? '',
    advance: '',
    advance_mode_id: refs.modes[0]?.id ?? '',
  }))
  const set = <K extends keyof BookingInput>(k: K, v: BookingInput[K]) => setInput((p) => ({ ...p, [k]: v }))
  const [pay, setPay] = useState({ amount: '', mode: refs.modes[0]?.id ?? '', reference: '', paid_on: '' })
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
  const amount = Number(input.amount) || 0
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
  function pickLead(id: string | null) {
    setPickedLead(id ?? '')
    const l = leads?.find((x) => x.id === id)
    if (l)
      setInput((p) => ({ ...p, lead_id: l.id, business_id: l.business_id, sub_business_id: l.sub_business_id ?? '', client_name: fullName(l), phone: l.phone, purpose: l.purpose ?? p.purpose }))
    else setInput((p) => ({ ...p, lead_id: null, sub_business_id: sub?.id ?? '' }))
  }

  async function save() {
    const data: BookingInput = { ...input, new_lead: null, lead_id: fixed ? input.lead_id : pickedLead || null }
    if (!data.business_id) return setError('Pick the business.')
    if (!data.client_name.trim()) return setError('Client name is required.')
    if (!data.booking_date) return setError('Pick the date.')
    if (hours <= 0) return setError('End time must be after the start time.')
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
      for (const x of extra) await saveBooking(tenant.id, me, null, { ...clean, booking_date: x.date, start_time: x.start, end_time: x.end, amount: x.amount, advance: '' }, null)
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

  async function addPayment() {
    if (!booking) return
    if (!(Number(pay.amount) > 0)) return setError('Enter the amount received.')
    setBusy(true)
    try {
      await addBookingPayment(tenant.id, me, booking.id, pay)
      await refresh()
      setPay({ amount: '', mode: pay.mode, reference: '', paid_on: '' })
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function invoice() {
    if (!booking) return
    setBusy(true)
    try {
      const no = await createBookingInvoice(booking.id, input.billing_company_id || null)
      onSaved(`Invoice ${no} created.`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      onClose={close}
      width={600}
      title={booking ? `Booking · ${booking.client_name}` : 'New booking'}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            {canEdit && !paid ? 'Cancel' : 'Close'}
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
              <Label htmlFor="bk-amt">Booking amount (₹)</Label>
              <TextInput id="bk-amt" type="number" min={0} placeholder="Charge before GST" value={input.amount} onChange={(e) => set('amount', e.target.value)} disabled={!canEdit} />
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
            {!booking && (
              <>
                <div>
                  <Label htmlFor="bk-adv">Advance received (₹)</Label>
                  <TextInput id="bk-adv" type="number" min={0} placeholder="Optional" value={input.advance} onChange={(e) => set('advance', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="bk-advm">Advance mode</Label>
                  <Select id="bk-advm" value={input.advance_mode_id} onChange={(e) => set('advance_mode_id', e.target.value)}>
                    {refs.modes.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}
            <div className="span-2 bk-gst">
              <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
                <Checkbox id="bk-gst" checked={input.gst_applicable} onChange={(v) => set('gst_applicable', v)} label="Add GST on this booking" />
                {input.gst_applicable && (
                  <TextInput aria-label="GST %" type="number" min={0} style={{ width: 80 }} value={input.gst_rate} onChange={(e) => set('gst_rate', e.target.value)} disabled={!canEdit} />
                )}
              </div>
              <div className="bk-total">
                <span className="muted small">Total payable</span>
                <b>{amount ? money(total) : '—'}</b>
                <span className="muted small">{input.gst_applicable ? `incl. GST ${money(gst)}` : 'No GST'}</span>
              </div>
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
                    setExtra((l) => [...l, { date: iso, start: input.start_time, end: input.end_time, amount: input.amount }])
                  }}
                >
                  <Plus /> Add another date
                </Button>
                <Hint>For multi-day shoots: each date is saved as a separate booking for this client. GST, status and note are copied; the advance is recorded on the first date.</Hint>
              </div>
            </div>
          )}
        </FormSection>

        {booking && (
          <FormSection title="Payments" description={`Paid ${money(booking.paid_amount)} of ${money(booking.total_amount)} · balance ${money(Math.max(0, booking.total_amount - booking.paid_amount))}`}>
            {(booking.booking_payments.length > 0 || ((canEdit || can('payments', 'add')) && booking.status !== 'cancelled')) && (
              <table className="table table-compact bk-pay-table">
                <colgroup>
                  <col style={{ width: 150 }} />
                  <col style={{ width: 110 }} />
                  <col />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 64 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Mode</th>
                    <th>Reference</th>
                    <th className="num">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...booking.booking_payments]
                    .sort((a, b) => a.paid_on.localeCompare(b.paid_on))
                    .map((p) => (
                      <tr key={p.id}>
                        <td className="nowrap">{new Date(`${p.paid_on}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                        <td>{refs.modeName(p.payment_mode_id) ?? '—'}</td>
                        <td className="muted">{p.reference ?? ''}</td>
                        <td className="num">{money(p.amount)}</td>
                        <td className="num">
                          {canEdit && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon btn-sm"
                              aria-label="Remove payment"
                              onClick={() => void deleteBookingPayment(p.id).then(refresh, (e: Error) => setError(e.message))}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
                {(canEdit || can('payments', 'add')) && booking.status !== 'cancelled' && (
                  <tfoot>
                    <tr className="bk-pay-row">
                      <td>
                        <input className="input" type="date" aria-label="Paid on" value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} />
                      </td>
                      <td>
                        <select className="input" aria-label="Mode" value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>
                          {refs.modes.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input className="input" aria-label="Reference" placeholder="Ref / UTR" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
                      </td>
                      <td>
                        <input className="input num" aria-label="Amount" type="number" min={0} placeholder="Amount" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                      </td>
                      <td className="num">
                        <Button variant="outline" onClick={addPayment} disabled={busy}>
                          Add
                        </Button>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </FormSection>
        )}

        {booking && booking.status !== 'cancelled' && (
          <FormSection title="Invoice">
            {booking.invoice_no ? (
              <div className="row-between">
                <span>
                  <b>{booking.invoice_no}</b> <span className="muted small">· {refs.companyName(booking.billing_company_id)}</span>
                </span>
                <Link className="btn btn-outline btn-sm" to={`/bookings/${booking.id}/invoice`} target="_blank">
                  <FileText size={14} /> View / print
                </Link>
              </div>
            ) : can('bookings', 'edit') ? (
              <div className="row-between">
                <span className="muted small">Numbered per billing company, e.g. {(refs.companies.find((c) => c.id === input.billing_company_id)?.invoice_prefix || 'INV')}/26-27/0001.</span>
                <Button variant="outline" onClick={invoice} disabled={busy || !input.billing_company_id}>
                  <FileText size={14} /> Create invoice
                </Button>
              </div>
            ) : (
              <span className="muted small">No invoice yet.</span>
            )}
          </FormSection>
        )}
      </div>
    </Drawer>
  )
}
