import { useEffect, useState } from 'react'
import { Eye, Plus, Printer, Unlink } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ORDER_STATUS, STATUS_META } from '@/bookings/types'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection, Hint, Label, Select, TextInput } from '@/components/Field'
import { db } from '@/lib/supabase'
import { money } from '@/leads/labels'
import { useTenant } from '@/tenant/useTenant'
import type { BookingRow, PartDraft } from '@/bookings/types'
import type { BookingRefs } from '@/bookings/useBookingRefs'
import { formatInvoiceNo } from '@/masters/types'
import { createInvoice, invoicePrintHref, refreshInvoiceSeller, saveInvoice } from './api'
import { BuyerFields, buyerError, buyerOfJson, buyerOfLead, emptyBuyer } from './Billing'
import { PaymentPlan, planError } from './PaymentPlan'
import { isFullyPaid, type InvoiceInput, type InvoiceRow } from './types'

const serviceText = (b: BookingRow) =>
  b.booking_items?.length
    ? [...b.booking_items]
        .sort((x, y) => x.sort_order - y.sort_order)
        .map((i) => i.name)
        .join(', ')
    : (b.purpose ?? '—')
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
/** the booking's name in lists: its ORD number, or its date */
export const bookingRef = (b: Pick<BookingRow, 'order_no' | 'booking_date'>) => b.order_no ?? day(b.booking_date)

/** GST goes on top of each booking's amount (rounded on the booking); the invoice adds them up (same as the database) */
export function invoiceTotals(orders: BookingRow[], gst: boolean, rate: number) {
  const live = orders.filter((o) => o.status !== 'cancelled')
  const amount = live.reduce((s, o) => s + Number(o.amount), 0)
  const tax = gst ? live.reduce((s, o) => s + Math.round(Number(o.amount) * rate) / 100, 0) : 0
  return { amount, gst: tax, total: amount + tax }
}

type Links = { company_id: string | null; nongst_company_id: string | null }
/** the company a business (or its sub-business) issues GST / non-GST invoices from */
function companyFor(kind: 'gst' | 'nongst', biz: Links | null, sub: Links | null) {
  const pick = (l: Links | null) => (l?.company_id ? (kind === 'nongst' ? l.nongst_company_id || l.company_id : l.company_id) : '')
  return pick(sub) || pick(biz)
}

/**
 * Generate an invoice for bookings / orders of one client — With GST or Without GST, from a company, to the client's
 * billing details, with the payment plan — or edit an invoice's GST rate, Bill to and payment parts.
 */
export function InvoiceDrawer({
  orders,
  invoice,
  refs,
  noun = 'Booking',
  onViewBooking,
  onRemoveBooking,
  onAddBooking,
  outerError,
  onClose,
  onSaved,
}: {
  /** new invoice: the ticked bookings / orders */
  orders?: BookingRow[]
  /** edit: this invoice */
  invoice?: InvoiceRow | null
  refs: BookingRefs
  /** Booking, Order or Brand Deal */
  noun?: string
  /** the invoice panel: a booking's View / Remove and Add booking */
  onViewBooking?: (b: BookingRow) => void
  onRemoveBooking?: (b: BookingRow) => void
  onAddBooking?: () => void
  /** a message from the panel (e.g. a booking couldn't be removed) */
  outerError?: string | null
  onClose: () => void
  onSaved: (msg: string, invoiceId: string) => void
}) {
  const tenant = useTenant()
  const { can, membership } = useAuth()
  const list = invoice ? invoice.bookings : (orders ?? [])
  const first = list[0]
  const canEdit = invoice ? can('bookings', 'edit') : can('bookings', 'add') || can('bookings', 'edit')
  const locked = invoice ? isFullyPaid(invoice) : false
  const [input, setInput] = useState<InvoiceInput>(() => ({
    kind: invoice?.kind ?? 'gst',
    billing_company_id: invoice?.billing_company_id ?? '',
    gst_rate: String(invoice?.gst_rate ?? 18),
    buyer: invoice ? buyerOfJson(invoice.buyer) : emptyBuyer,
    parts: invoice
      ? [...invoice.invoice_payments]
          .sort((a, b) => (a.due_on ?? a.paid_on ?? '').localeCompare(b.due_on ?? b.paid_on ?? ''))
          .map(
            (p): PartDraft => ({ key: p.id, id: p.id, label: p.label ?? 'Payment', due_on: p.due_on ?? p.paid_on ?? '', amount: String(p.amount), mode: p.payment_mode_id ?? '', note: p.note ?? p.reference ?? '', status: p.status, paid_on: p.paid_on ?? '' }),
          )
      : [],
  }))
  const [links, setLinks] = useState<{ biz: Links | null; sub: Links | null } | null>(null)
  // edit: the invoice number can be changed (must stay unique in the workspace)
  const [invNo, setInvNo] = useState(invoice?.invoice_no ?? '')
  async function saveNumber() {
    if (!invoice) return
    const no = invNo.trim()
    if (no === invoice.invoice_no) return
    if (!no) throw new Error('Enter the invoice number.')
    const { data: same, error: e1 } = await db().from('invoices').select('id').eq('tenant_id', tenant.id).eq('invoice_no', no).neq('id', invoice.id).limit(1)
    if (e1) throw new Error(e1.message)
    if (same?.length) throw new Error(`Invoice number ${no} is already used by another invoice.`)
    const { error } = await db().from('invoices').update({ invoice_no: no }).eq('id', invoice.id)
    if (error) throw new Error(error.message)
  }
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // a new invoice: the client's saved billing details and the business's companies
  useEffect(() => {
    if (invoice || !first) return
    let live = true
    void Promise.all([
      first.lead_id ? db().from('leads').select('bill_company, bill_address, bill_state, bill_state_code, bill_gstin').eq('id', first.lead_id).maybeSingle() : Promise.resolve({ data: null }),
      db().from('businesses').select('company_id, nongst_company_id').eq('id', first.business_id).maybeSingle(),
      first.sub_business_id ? db().from('sub_businesses').select('company_id, nongst_company_id').eq('id', first.sub_business_id).maybeSingle() : Promise.resolve({ data: null }),
    ]).then(([l, b, s]) => {
      if (!live) return
      const L = { biz: b.data as Links | null, sub: s.data as Links | null }
      setLinks(L)
      setInput((d) => ({ ...d, buyer: buyerOfLead(l.data as Parameters<typeof buyerOfLead>[0]), billing_company_id: companyFor(d.kind, L.biz, L.sub) }))
    })
    return () => {
      live = false
    }
  }, [invoice, first])

  const gst = input.kind === 'gst'
  const t = invoiceTotals(list, gst, Number(input.gst_rate) || 0)
  const company = refs.companies.find((c) => c.id === input.billing_company_id) ?? null
  const companyOptions = refs.companies.filter((c) => c.is_active || c.id === input.billing_company_id)

  function pickKind(kind: 'gst' | 'nongst') {
    setInput((d) => ({ ...d, kind, billing_company_id: links ? companyFor(kind, links.biz, links.sub) || d.billing_company_id : d.billing_company_id }))
  }

  /**
   * Print / PDF regenerates the invoice first: what's in the drawer is saved (Bill to, GST, payment parts) and the
   * company details are taken again from Masters; then the PDF opens. Without edit rights it just opens.
   */
  async function printNow() {
    if (!invoice) return
    // the tab opens now (on the click), so the browser doesn't block it; it gets the PDF once saved
    const tab = window.open('', '_blank')
    const href = invoicePrintHref(invoice.id)
    if (canEdit) {
      const err = planError(input.parts, t.total) ?? buyerError(input.buyer) ?? (gst && !(Number(input.gst_rate) > 0) ? 'Enter the GST rate.' : null)
      if (err) {
        tab?.close()
        return setError(err)
      }
      setBusy(true)
      setError(null)
      try {
        await saveNumber()
        await saveInvoice(tenant.id, membership?.id, invoice, input)
        await refreshInvoiceSeller(invoice.id)
      } catch (e) {
        tab?.close()
        setError((e as Error).message)
        setBusy(false)
        return
      }
    }
    if (tab) tab.location.href = href
    else window.open(href, '_blank')
    if (canEdit) onSaved(`Invoice ${invoice.invoice_no} regenerated with the latest details.`, invoice.id)
  }

  async function save() {
    const err = planError(input.parts, t.total) ?? buyerError(input.buyer)
    if (err) return setError(err)
    if (!invoice && !list.length) return setError('Tick at least one booking.')
    if (gst && !(Number(input.gst_rate) > 0)) return setError('Enter the GST rate.')
    setBusy(true)
    setError(null)
    try {
      if (invoice) {
        await saveNumber()
        await saveInvoice(tenant.id, membership?.id, invoice, input)
        onSaved(`Invoice ${invNo.trim() || invoice.invoice_no} updated.`, invoice.id)
      } else {
        const id = await createInvoice(
          list.map((o) => o.id),
          input,
        )
        onSaved(`Invoice generated for ${first.client_name}: ${list.map(bookingRef).join(', ')}.`, id)
      }
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={720}
      title={invoice ? `Invoice ${invoice.invoice_no} · ${invoice.client_name}` : `Generate invoice · ${first?.client_name ?? ''}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          <div className="foot-end">
            {(error || outerError) && <p className="err-text">{error || outerError}</p>}
            {invoice && (
              <Button variant="outline" onClick={printNow} disabled={busy} title={canEdit ? 'Saves this invoice, takes the company details again from Masters, then opens the PDF' : undefined}>
                <Printer size={15} /> {busy ? 'Regenerating…' : 'Print / PDF'}
              </Button>
            )}
            {canEdit && (
              <Button onClick={save} disabled={busy}>
                {busy ? 'Saving…' : invoice ? 'Save invoice' : 'Generate invoice'}
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="stack">
        {invoice && (
          <div className="inv-sum">
            <span className={cn('badge', locked ? 'badge-success' : Number(invoice.paid_amount) > 0 ? 'badge-warning' : 'badge-muted')}>
              {locked ? 'Fully paid' : Number(invoice.paid_amount) > 0 ? 'Part paid' : 'Unpaid'}
            </span>
            <span>
              Total <b>{money(invoice.total_amount)}</b>
            </span>
            <span>
              Received <b className="tone-success">{money(invoice.paid_amount)}</b>
            </span>
            <span>
              Balance <b className={Number(invoice.total_amount) - Number(invoice.paid_amount) > 0.01 ? 'tone-danger' : undefined}>{money(Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount)))}</b>
            </span>
            <span className="muted">
              {new Date(`${invoice.invoice_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        )}
        <FormSection title="Invoice">
          <div className="form-grid">
            {invoice && (
              <div>
                <Label htmlFor="inv-no" required>
                  Invoice no.
                </Label>
                <TextInput id="inv-no" value={invNo} onChange={(e) => setInvNo(e.target.value)} disabled={!canEdit} />
              </div>
            )}
            {invoice && <div />}
            <div className="span-2">
              <Label>Type</Label>
              {invoice ? (
                <div>
                  <b>{gst ? 'With GST (Tax Invoice)' : 'Without GST (Invoice)'}</b>
                </div>
              ) : (
                <div className="seg" role="group" aria-label="Invoice type">
                  <button type="button" className={gst ? 'is-active' : undefined} onClick={() => pickKind('gst')}>
                    With GST
                  </button>
                  <button type="button" className={!gst ? 'is-active' : undefined} onClick={() => pickKind('nongst')}>
                    Without GST
                  </button>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="inv-co">From (company)</Label>
              {invoice ? (
                <div>
                  <b>{invoice.seller?.name ?? '—'}</b>
                </div>
              ) : (
                <Select id="inv-co" value={input.billing_company_id} onChange={(e) => setInput((d) => ({ ...d, billing_company_id: e.target.value }))}>
                  <option value="">— the business’s own details —</option>
                  {companyOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.legal_name || c.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            {gst && (
              <div>
                <Label htmlFor="inv-rate">GST %</Label>
                <TextInput id="inv-rate" type="number" min={0} value={input.gst_rate} onChange={(e) => setInput((d) => ({ ...d, gst_rate: e.target.value }))} disabled={!canEdit || locked} />
              </div>
            )}
            {!invoice && (
              <div className="span-2">
                <Hint>
                  {company
                    ? `Invoice no. ${formatInvoiceNo(company.number_format, company.invoice_prefix, company.next_no)} · ${[company.gst_number ? `GSTIN ${company.gst_number}` : null, company.state ? `${company.state}${company.state_code ? ` (${company.state_code})` : ''}` : null].filter(Boolean).join(' · ') || 'add its details in Masters → Company Master'}`
                    : 'No company picked: the invoice shows the business’s own details and number series. Set a company on the business (Businesses → edit).'}
                </Hint>
              </div>
            )}
          </div>
        </FormSection>

        <FormSection title="Bill to" description={`${first?.client_name ?? ''}${first?.phone ? ` · ${first.phone}` : ''}. Optional; saved on the client for next time.`}>
          <BuyerFields id="inv-b" value={input.buyer} onChange={(buyer) => setInput((d) => ({ ...d, buyer }))} disabled={!canEdit} />
        </FormSection>

        <FormSection title={`${noun}s on this invoice`}>
          {invoice && onAddBooking && canEdit && !locked && (
            <div>
              <Button variant="outline" size="sm" onClick={onAddBooking}>
                <Plus /> Add {noun.toLowerCase()}
              </Button>
            </div>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{noun}</th>
                  <th>Services</th>
                  {invoice && <th>Status</th>}
                  <th className="num">Amount</th>
                  {invoice && <th />}
                </tr>
              </thead>
              <tbody>
                {list.map((o) => {
                  const st = o.order_no ? (o.order_status ? ORDER_STATUS[o.order_status] : null) : STATUS_META[o.status]
                  return (
                  <tr key={o.id}>
                    <td className="nowrap">
                      <b>{bookingRef(o)}</b>
                    </td>
                    <td>{serviceText(o)}</td>
                    {invoice && <td>{st && <span className={`badge ${st.tone}`}>{st.label}</span>}</td>}
                    <td className="num nowrap">{o.status === 'cancelled' ? <span className="muted">Cancelled</span> : money(o.amount)}</td>
                    {invoice && (
                      <td className="nowrap" style={{ textAlign: 'right' }}>
                        {onViewBooking && (
                          <button type="button" className="btn btn-ghost btn-icon btn-sm" title={`Open this ${noun.toLowerCase()}`} aria-label="Open" onClick={() => onViewBooking(o)}>
                            <Eye size={15} />
                          </button>
                        )}
                        {onRemoveBooking && canEdit && list.length > 1 && (
                          <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Take it off this invoice" aria-label="Remove from invoice" onClick={() => onRemoveBooking(o)}>
                            <Unlink size={15} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="bk-total" style={{ alignItems: 'flex-end' }}>
            <span className="muted small">
              {money(t.amount)}
              {gst ? ` + GST ${money(t.gst)}` : ' · no GST'} · Total
            </span>
            <b>{money(t.total)}</b>
          </div>
        </FormSection>

        <FormSection title="Payment plan" description="Split the total into parts (advance, after delivery…); mark each Paid when the money comes in.">
          <PaymentPlan parts={input.parts} onChange={(parts) => setInput((d) => ({ ...d, parts }))} total={t.total} canEdit={canEdit} modes={refs.modes} />
        </FormSection>
      </div>
    </Drawer>
  )
}
