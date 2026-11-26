import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { db } from '@/lib/supabase'
import { formatInvoiceNo } from '@/masters/types'
import { createInvoice } from '@/invoices/api'
import { BuyerFields, buyerError, buyerOfLead, emptyBuyer } from '@/invoices/Billing'
import { PaymentPlan, planError } from '@/invoices/PaymentPlan'
import type { InvoiceInput } from '@/invoices/types'
import { BT } from '@/auth/auth-context'
import { cn } from '@/lib/cn'
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
import { saveDealSteps, toggleStep, useDealSteps, type DealStep } from './dealSteps'
import { ORDER_STATUS, STATUS_META, invoiceNo, type PartDraft, type BookingInput, type BookingRow, type BookingStatus, type ItemDraft, type OrderStatus } from './types'
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
  businessChoices,
  defaultBusinessId,
  onClose,
  onSaved,
  onTicked,
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
  /** a new booking from the Studio Schedule: the businesses it can be for (a dropdown), and the one picked first */
  businessChoices?: { id: string; name: string }[]
  defaultBusinessId?: string | null
  onClose: () => void
  onSaved: (msg: string) => void
  /** a Brand Deal step ticked / unticked (saved straight away) */
  onTicked?: (msg: string) => void
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
  const [input, setInput] = useState<BookingInput>(() => ({
    business_id: booking?.business_id ?? lead?.business_id ?? defaultBusinessId ?? selected?.id ?? businesses[0]?.id ?? '',
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
    studio_id: booking?.studio_id ?? copyFrom?.studio_id ?? '',
    notes: booking?.notes ?? copyFrom?.notes ?? '',
  }))
  const set = <K extends keyof BookingInput>(k: K, v: BookingInput[K]) => setInput((p) => ({ ...p, [k]: v }))
  // a Brand Deal (its business or sub-business is Brand Deals): it has steps to tick
  const bizOf = businesses.find((b) => b.id === input.business_id)
  const brandDeal = service && (bizOf?.subs.find((x) => x.id === input.sub_business_id)?.type ?? bizOf?.type) === BT.BRAND_DEALS
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
  // Studio Rental and Paid Podcast bookings take a podcast studio: no two bookings of a studio at the same time
  const bizType = businesses.find((b) => b.id === input.business_id)?.type ?? null
  const studio = isStudioType(input.sub_business_id ? subs.find((x) => x.id === input.sub_business_id)?.type : subs.length ? null : bizType)
  // the default studio until one is picked
  useEffect(() => {
    if (studio && !input.studio_id && refs.defaultStudio) setInput((p) => ({ ...p, studio_id: refs.defaultStudio }))
  }, [studio, input.studio_id, refs.defaultStudio])
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
      ? `${c.studio_name ?? 'Studio'} not available on ${new Date(`${c.booking_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${clockOf(c.start_time)} – ${clockOf(c.end_time)}: booked for ${c.client_name} (${c.sub_name}).`
      : null
  const clashes =
    studio && input.status !== 'cancelled'
      ? [
          studioClash(taken, { id: booking?.id, date: input.booking_date, start: input.start_time, end: input.end_time, studio: input.studio_id }),
        ]
      : []
  const clash = clashes.find(Boolean) ?? null
  // services of this business (and its sub-business, when the service has one)
  const services = refs.products.filter(
    (p) => p.is_active && p.business_id === input.business_id && (!p.sub_business_id || !input.sub_business_id || p.sub_business_id === input.sub_business_id),
  )
  // ---- Invoice & payments: on save the booking gets its invoice and payment plan, unless Pay later ----
  type Links = { company_id: string | null; nongst_company_id: string | null }
  const companyFor = (kind: 'gst' | 'nongst', biz: Links | null, sb: Links | null) => {
    const pick = (l: Links | null) => (l?.company_id ? (kind === 'nongst' ? l.nongst_company_id || l.company_id : l.company_id) : '')
    return pick(sb) || pick(biz)
  }
  // a new one: pay now (unticked); an existing one without an invoice: as it was (pay later) until unticked
  const [payLater, setPayLater] = useState(!!booking)
  const tentative = !service && input.status === 'tentative'
  const cancelled = !service && input.status === 'cancelled'
  const canInvoice = !booking?.invoice_id && !cancelled && !locked
  const invoiceNow = canInvoice && !payLater && !tentative
  const [inv, setInv] = useState<InvoiceInput>({ kind: 'gst', billing_company_id: '', gst_rate: '18', buyer: emptyBuyer, parts: [] as PartDraft[] })
  const [links, setLinks] = useState<{ biz: Links | null; sub: Links | null } | null>(null)
  const leadForBill = fixed ? input.lead_id : pickedLead || null
  useEffect(() => {
    if (!canInvoice || !input.business_id) return
    let live = true
    void Promise.all([
      db().from('businesses').select('company_id, nongst_company_id').eq('id', input.business_id).maybeSingle(),
      input.sub_business_id ? db().from('sub_businesses').select('company_id, nongst_company_id').eq('id', input.sub_business_id).maybeSingle() : Promise.resolve({ data: null }),
      leadForBill ? db().from('leads').select('bill_company, bill_address, bill_state, bill_state_code, bill_gstin').eq('id', leadForBill).maybeSingle() : Promise.resolve({ data: null }),
    ]).then(([b, sb, l]) => {
      if (!live) return
      const L = { biz: b.data as Links | null, sub: sb.data as Links | null }
      setLinks(L)
      setInv((d) => ({ ...d, billing_company_id: companyFor(d.kind, L.biz, L.sub), buyer: buyerOfLead(l.data as Parameters<typeof buyerOfLead>[0]) }))
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canInvoice, input.business_id, input.sub_business_id, leadForBill])
  const invGst = inv.kind === 'gst'
  const invRate = Number(inv.gst_rate) || 0
  const invTax = invGst ? Math.round(amount * invRate) / 100 : 0
  const invTotal = amount + invTax
  const invCompany = refs.companies.find((c) => c.id === inv.billing_company_id) ?? null
  const pickKind = (kind: 'gst' | 'nongst') => setInv((d) => ({ ...d, kind, billing_company_id: links ? companyFor(kind, links.biz, links.sub) || d.billing_company_id : d.billing_company_id }))

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
    if (invoiceNow) {
      if (!(amount > 0)) return setError('Add a service with a price for the invoice, or tick Pay later.')
      const e = planError(inv.parts, invTotal) ?? buyerError(inv.buyer) ?? (invGst && !(invRate > 0) ? 'Enter the GST rate.' : null)
      if (e) return setError(e)
    }
    setBusy(true)
    setError(null)
    try {
      const clean = { ...data, sub_business_id: subOf(subs, data.sub_business_id) }
      const id = await saveBooking(tenant.id, me, booking, clean, null)
      // not Pay later: its invoice and payment plan now
      let invoiced = false
      if (invoiceNow) {
        try {
          await createInvoice([id], inv)
          invoiced = true
        } catch (e) {
          // the booking is saved; the invoice can still be generated from the list
          onSaved(`${booking ? `${service ? noun : 'Booking'} updated` : `${service ? noun : 'Booking'} saved`}, but the invoice wasn’t made: ${(e as Error).message} Generate it from the ${service ? noun : 'Booking'}s list.`)
          return
        }
      }
      const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      const later = invoiced ? ' Its invoice is made.' : ` Generate its invoice from the ${service ? noun : 'Booking'}s list.`
      onSaved(
        service
          ? booking
            ? `${noun} updated.${invoiced ? later : ''}`
            : `New ${word} for ${data.client_name.trim()}: ${input.items.map((i) => i.name).join(', ')}.${later}`
          : booking
          ? `Booking updated.${invoiced ? later : ''}`
          : `Booked ${data.client_name.trim()} on ${day(data.booking_date)}.${tentative ? ' Tentative: invoice it once confirmed.' : later}`,
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
                {busy ? 'Saving…' : booking ? `Save ${word}` : service ? `Save ${word}` : 'Book slot'}
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="stack">
        <FormSection
          title={service ? `${noun} details` : 'Booking details'}
          description={booking ? undefined : service ? `Add the services below. The ${word} gets the next ORD number; its invoice and payments are made below, or later with Pay later.` : 'Pick the lead and the client details fill in. A confirmed booking can’t overlap another confirmed slot on the same date.'}
        >
          <div className="form-grid">
            {!booking && businessChoices && businessChoices.length > 1 && (
              <div className="span-2">
                <Label htmlFor="bk-biz" required>
                  Business
                </Label>
                <Select id="bk-biz" value={input.business_id} disabled={!canEdit} onChange={(e) => setInput((p) => ({ ...p, business_id: e.target.value, sub_business_id: '' }))}>
                  {businessChoices.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
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
            {studio && refs.studios.length > 0 && (
              <div>
                <Label htmlFor="bk-studio" required>
                  Podcast Studio
                </Label>
                <Select id="bk-studio" value={input.studio_id ?? ''} onChange={(e) => set('studio_id', e.target.value)} disabled={!canEdit}>
                  {refs.studios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
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
              <span className="muted small">{service ? noun : 'Booking'} amount (before GST)</span>
              <b>{amount ? money(amount) : '—'}</b>
            </div>
        </FormSection>

        {canEdit && canInvoice && (
          <FormSection title="Invoice & payments" description={tentative ? 'Tentative: no invoice yet. Confirm it to make the invoice here, or later from the list.' : 'The invoice (GST, company, bill to) and its payment plan, made with this ' + word + '.'}>
            <label className="check">
              <input type="checkbox" checked={payLater || tentative} disabled={tentative} onChange={(e) => setPayLater(e.target.checked)} /> Pay later
              <span className="muted small"> · no payment now; generate the invoice later from the {service ? noun : 'Booking'}s list</span>
            </label>
            {invoiceNow && (
              <>
                <div className="form-grid">
                  <div className="span-2">
                    <Label>Type</Label>
                    <div className="seg" role="group" aria-label="Invoice type">
                      <button type="button" className={invGst ? 'is-active' : undefined} onClick={() => pickKind('gst')}>
                        With GST
                      </button>
                      <button type="button" className={!invGst ? 'is-active' : undefined} onClick={() => pickKind('nongst')}>
                        Without GST
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="bk-inv-co">From (company)</Label>
                    <Select id="bk-inv-co" value={inv.billing_company_id} onChange={(e) => setInv((d) => ({ ...d, billing_company_id: e.target.value }))}>
                      <option value="">— the business’s own details —</option>
                      {refs.companies
                        .filter((c) => c.is_active || c.id === inv.billing_company_id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.legal_name || c.name}
                          </option>
                        ))}
                    </Select>
                  </div>
                  {invGst && (
                    <div>
                      <Label htmlFor="bk-inv-rate">GST %</Label>
                      <TextInput id="bk-inv-rate" type="number" min={0} value={inv.gst_rate} onChange={(e) => setInv((d) => ({ ...d, gst_rate: e.target.value }))} />
                    </div>
                  )}
                  <div className="span-2">
                    <Hint>
                      {invCompany
                        ? `Invoice no. ${formatInvoiceNo(invCompany.number_format, invCompany.invoice_prefix, invCompany.next_no)}${invCompany.gst_number ? ` · GSTIN ${invCompany.gst_number}` : ''}`
                        : 'No company picked: the invoice shows the business’s own details and number series.'}
                    </Hint>
                  </div>
                </div>
                <div>
                  <Label>Bill to</Label>
                  <BuyerFields id="bk-inv-b" gst={invGst} value={inv.buyer} onChange={(buyer) => setInv((d) => ({ ...d, buyer }))} />
                </div>
                <div className="bk-total" style={{ alignItems: 'flex-end' }}>
                  <span className="muted small">
                    {money(amount)}
                    {invGst ? ` + GST ${money(invTax)}` : ' · no GST'} · Total
                  </span>
                  <b>{money(invTotal)}</b>
                </div>
                <div>
                  <Label>Payment plan</Label>
                  <Hint>Split the total into parts (advance, balance…); mark a part Paid when the money comes in.</Hint>
                  <PaymentPlan parts={inv.parts} onChange={(parts) => setInv((d) => ({ ...d, parts }))} total={invTotal} canEdit modes={refs.modes} />
                </div>
              </>
            )}
          </FormSection>
        )}

        {booking && brandDeal && <DealStepsSection booking={booking} canTick={can('bookings', 'edit')} me={me ?? null} onChanged={(msg) => onTicked?.(msg)} />}

        {booking && (
          <FormSection title="Invoice">
            <div className="row-between">
              <span className="muted small">
                {booking.invoice_id ? (
                  <>
                    On invoice <b>{invoiceNo(booking)}</b> · paid {money(booking.paid_amount)} · balance {money(Math.max(0, Number(booking.total_amount) - Number(booking.paid_amount)))}
                    {locked ? ' · fully paid, so this ' + word + ' can’t be changed.' : ''}
                  </>
                ) : booking.status === 'cancelled' ? (
                  'Cancelled: not invoiced.'
                ) : (
                  payLater || tentative ? `Not invoiced yet. Untick Pay later above, or tick it in the ${service ? noun : 'Booking'}s list → Generate invoice.` : 'Not invoiced yet: the invoice is made when you save.'
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

/** Brand Deals: tick the deal's steps (saved straight away, even on a fully paid deal) */
function DealStepsSection({ booking, canTick, me, onChanged }: { booking: BookingRow; canTick: boolean; me: string | null; onChanged: (msg: string) => void }) {
  const defs = useDealSteps()
  const [steps, setSteps] = useState<DealStep[]>(booking.deal_steps ?? [])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const done = new Map(steps.map((s) => [s.step_id, s]))

  async function toggle(id: string) {
    const i = defs.findIndex((d) => d.id === id)
    const next = toggleStep(steps, defs, id, me)
    setBusy(id)
    setError(null)
    try {
      await saveDealSteps(booking.id, next)
      setSteps(next)
      onChanged(done.has(id) ? (i > 0 ? `Back to step ${i}: ${defs[i - 1].name}.` : 'All steps unticked.') : `Done up to step ${i + 1}: ${defs[i].name}.`)
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(null)
  }

  return (
    <FormSection title="Steps" description="Tick a step and every step before it is done too; untick one and the steps after it go back. Steps are set in Masters → Brand deal steps.">
      {error && <div className="alert alert-error small">{error}</div>}
      <div className="deal-steps">
        {defs.map((def, i) => {
          const d = done.get(def.id)
          return (
            <label key={def.id} className={cn('deal-step', d && 'is-done')}>
              <input type="checkbox" checked={!!d} disabled={!canTick || busy !== null} onChange={() => void toggle(def.id)} />
              <span className="deal-step-no">{d ? '✔' : i + 1}</span>
              <span className="deal-step-name">{def.name}</span>
              {d && <span className="muted small">{new Date(d.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
            </label>
          )
        })}
      </div>
    </FormSection>
  )
}
