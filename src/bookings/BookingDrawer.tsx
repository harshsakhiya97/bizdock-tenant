import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { FileText, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Hint, Label, Select, TextInput } from '@/components/Field'
import { SearchSelect } from '@/components/SearchSelect'
import { fullName, money } from '@/leads/labels'
import type { LeadRow } from '@/leads/types'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { addBookingPayment, createBookingInvoice, deleteBookingPayment, saveBooking } from './api'
import type { BookingRefs } from './useBookingRefs'
import { STATUS_META, type BookingInput, type BookingRow, type BookingStatus } from './types'

const today = () => new Date().toISOString().slice(0, 10)
const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')

/**
 * Add / edit a booking. From a lead or client page the enquiry is fixed; from the calendar it is
 * an existing lead (search) or a new enquiry (name, phone, type), which is added as a lead.
 */
export function BookingDrawer({
  booking,
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
  lead?: { id: string | null; customer_id?: string | null; name: string; phone: string; purpose: string | null; business_id: string } | null
  /** leads to pick from (calendar) */
  leads?: LeadRow[]
  refs: BookingRefs
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const { can, membership, businesses } = useAuth()
  const { selected } = useBusiness()
  const me = membership?.id
  const canEdit = booking ? can('bookings', 'edit') : can('bookings', 'add')
  const fixed = !!lead || !!booking
  const [mode, setMode] = useState<'existing' | 'new'>(leads?.length ? 'existing' : 'new')
  const [pickedLead, setPickedLead] = useState<string | null>(null)
  const [nl, setNl] = useState({ name: '', phone: '', purpose: '', source_id: '' })
  const [input, setInput] = useState<BookingInput>(() => ({
    business_id: booking?.business_id ?? lead?.business_id ?? selected?.id ?? businesses[0]?.id ?? '',
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
    gst_applicable: booking?.gst_applicable ?? true,
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
    () => (leads ?? []).filter((l) => !l.is_archived).map((l) => ({ value: l.id, label: `${fullName(l)} · ${l.phone}` })),
    [leads],
  )
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

  function pickLead(id: string | null) {
    setPickedLead(id)
    const l = leads?.find((x) => x.id === id)
    if (l)
      setInput((p) => ({ ...p, lead_id: l.id, business_id: l.business_id, client_name: fullName(l), phone: l.phone, purpose: l.purpose ?? p.purpose }))
  }

  async function save() {
    let data = input
    if (!fixed) {
      if (mode === 'existing') {
        if (!pickedLead) return setError('Pick the enquiry, or switch to New enquiry.')
      } else {
        if (!nl.name.trim()) return setError('Enter the client name.')
        if (nl.phone.replace(/\D/g, '').length < 10) return setError('Enter a valid phone number (10 digits).')
        data = { ...input, lead_id: null, new_lead: nl, client_name: nl.name, phone: nl.phone, purpose: nl.purpose }
      }
    }
    if (!data.business_id) return setError('Pick the business.')
    if (!data.client_name.trim()) return setError('Client name is required.')
    if (!data.booking_date) return setError('Pick the date.')
    if (hours <= 0) return setError('End time must be after the start time.')
    setBusy(true)
    setError(null)
    try {
      const f = refs.funnels.find((x) => x.business_id === data.business_id)
      await saveBooking(tenant.id, me, booking, data, f ? { id: f.id, stage_id: f.funnel_stages[0]?.id ?? '' } : null)
      onSaved(booking ? 'Booking updated.' : `Booked ${data.client_name.trim()} on ${new Date(`${data.booking_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`)
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
      onSaved('Payment added.')
    } catch (e) {
      setError((e as Error).message)
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
      onClose={onClose}
      width={600}
      title={booking ? `Booking · ${booking.client_name}` : 'New booking'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            {canEdit && (
              <Button onClick={save} disabled={busy}>
                {busy ? 'Saving…' : booking ? 'Save booking' : 'Book slot'}
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="stack">
        <FormSection title="Enquiry">
          {fixed ? (
            <div className="bk-who">
              <b>{input.client_name}</b>
              <span className="muted small">
                {input.phone}
                {input.purpose ? ` · ${input.purpose}` : ''}
              </span>
            </div>
          ) : (
            <>
              <div className="seg seg-sm">
                {leadOptions.length > 0 && (
                  <button type="button" className={cn(mode === 'existing' && 'is-active')} onClick={() => setMode('existing')}>
                    Existing lead
                  </button>
                )}
                <button type="button" className={cn(mode === 'new' && 'is-active')} onClick={() => setMode('new')}>
                  New enquiry
                </button>
              </div>
              {mode === 'existing' ? (
                <div>
                  <Label htmlFor="bk-lead" required>
                    Lead
                  </Label>
                  <SearchSelect id="bk-lead" value={pickedLead} onChange={pickLead} options={leadOptions} placeholder="Search by name or phone" />
                </div>
              ) : (
                <div className="form-grid">
                  <div>
                    <Label htmlFor="bk-name" required>
                      Name
                    </Label>
                    <TextInput id="bk-name" value={nl.name} onChange={(e) => setNl({ ...nl, name: e.target.value })} autoFocus />
                  </div>
                  <div>
                    <Label htmlFor="bk-phone" required>
                      Phone
                    </Label>
                    <TextInput id="bk-phone" type="tel" value={nl.phone} onChange={(e) => setNl({ ...nl, phone: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="bk-type">Type</Label>
                    <TextInput id="bk-type" placeholder="e.g. Podcast, Product shoot" value={nl.purpose} onChange={(e) => setNl({ ...nl, purpose: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="bk-src">Source</Label>
                    <Select id="bk-src" value={nl.source_id} onChange={(e) => setNl({ ...nl, source_id: e.target.value })}>
                      <option value="">— select —</option>
                      {refs.sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {businesses.length > 1 && (
                    <div className="span-2">
                      <Label htmlFor="bk-biz" required>
                        Business
                      </Label>
                      <Select id="bk-biz" value={input.business_id} onChange={(e) => set('business_id', e.target.value)}>
                        {businesses.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>
              )}
              {mode === 'new' && <Hint>The enquiry is added as a lead, so its follow-ups and invoices stay in one place.</Hint>}
            </>
          )}
        </FormSection>

        <FormSection title="Slot">
          <div className="form-grid">
            <div className="span-2">
              <Label htmlFor="bk-date" required>
                Date
              </Label>
              <TextInput id="bk-date" type="date" value={input.booking_date} onChange={(e) => set('booking_date', e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="bk-start" required>
                Start
              </Label>
              <TextInput id="bk-start" type="time" step={900} value={input.start_time} onChange={(e) => set('start_time', e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="bk-end" required>
                End
              </Label>
              <TextInput id="bk-end" type="time" step={900} value={input.end_time} onChange={(e) => set('end_time', e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="bk-status">Status</Label>
              <Select id="bk-status" value={input.status} onChange={(e) => set('status', e.target.value as BookingStatus)} disabled={!canEdit}>
                {(Object.keys(STATUS_META) as BookingStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="bk-hours">
              <span className="muted small">Duration</span>
              <b>{hours ? `${hours} h` : '—'}</b>
            </div>
          </div>
          {fixed && (
            <div>
              <Label htmlFor="bk-purpose">Type</Label>
              <TextInput id="bk-purpose" value={input.purpose} onChange={(e) => set('purpose', e.target.value)} disabled={!canEdit} />
            </div>
          )}
          <Hint>Confirmed bookings can’t overlap. A tentative booking holds the slot without blocking it.</Hint>
        </FormSection>

        <FormSection title="Amount">
          <div className="form-grid">
            <div>
              <Label htmlFor="bk-amt">Amount (before GST)</Label>
              <TextInput id="bk-amt" type="number" min={0} value={input.amount} onChange={(e) => set('amount', e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="bk-co">Billing company</Label>
              <Select id="bk-co" value={input.billing_company_id} onChange={(e) => set('billing_company_id', e.target.value)} disabled={!canEdit || !!booking?.invoice_no}>
                <option value="">— select —</option>
                {refs.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="span-2 row" style={{ alignItems: 'center' }}>
              <Checkbox id="bk-gst" checked={input.gst_applicable} onChange={(v) => set('gst_applicable', v)} label="Add GST" />
              {input.gst_applicable && (
                <TextInput aria-label="GST %" type="number" min={0} style={{ width: 90 }} value={input.gst_rate} onChange={(e) => set('gst_rate', e.target.value)} disabled={!canEdit} />
              )}
              <span className="muted small" style={{ marginLeft: 'auto' }}>
                {input.gst_applicable ? `GST ${money(gst)} · ` : ''}Total <b>{money(total)}</b>
              </span>
            </div>
            {!booking && (
              <>
                <div>
                  <Label htmlFor="bk-adv">Advance received</Label>
                  <TextInput id="bk-adv" type="number" min={0} value={input.advance} onChange={(e) => set('advance', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="bk-advm">Payment mode</Label>
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
            <div className="span-2">
              <Label htmlFor="bk-notes">Notes</Label>
              <textarea id="bk-notes" className="input" rows={2} value={input.notes} onChange={(e) => set('notes', e.target.value)} disabled={!canEdit} placeholder="Setup, guests, equipment…" />
            </div>
          </div>
        </FormSection>

        {booking && (
          <FormSection title="Payments" description={`Paid ${money(booking.paid_amount)} of ${money(booking.total_amount)} · balance ${money(Math.max(0, booking.total_amount - booking.paid_amount))}`}>
            {booking.booking_payments.length > 0 && (
              <table className="table table-compact">
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
                              onClick={() => void deleteBookingPayment(p.id).then(() => onSaved('Payment removed.'), (e: Error) => setError(e.message))}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
            {(canEdit || can('payments', 'add')) && booking.status !== 'cancelled' && (
              <div className="row bk-pay" style={{ flexWrap: 'wrap' }}>
                <TextInput aria-label="Amount" type="number" min={0} placeholder="Amount" style={{ width: 120 }} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                <select className="input" aria-label="Mode" style={{ width: 120 }} value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>
                  {refs.modes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <input className="input" type="date" aria-label="Paid on" style={{ width: 150 }} value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} />
                <TextInput aria-label="Reference" placeholder="Ref / UTR" style={{ width: 120 }} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
                <Button variant="outline" onClick={addPayment} disabled={busy}>
                  Add payment
                </Button>
              </div>
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
