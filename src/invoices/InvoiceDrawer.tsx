import { useEffect, useState } from 'react'
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
import { createInvoice, saveInvoice } from './api'
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

  async function save() {
    const err = planError(input.parts, t.total) ?? buyerError(input.buyer)
    if (err) return setError(err)
    if (!invoice && !list.length) return setError('Tick at least one booking.')
    if (gst && !(Number(input.gst_rate) > 0)) return setError('Enter the GST rate.')
    setBusy(true)
    setError(null)
    try {
      if (invoice) {
        await saveInvoice(tenant.id, membership?.id, invoice, input)
        onSaved(`Invoice ${invoice.invoice_no} updated.`, invoice.id)
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
            {error && <p className="err-text">{error}</p>}
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
        <FormSection title="Invoice">
          <div className="form-grid">
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
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{noun}</th>
                  <th>Services</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.id}>
                    <td className="nowrap">
                      <b>{bookingRef(o)}</b>
                    </td>
                    <td>{serviceText(o)}</td>
                    <td className="num nowrap">{o.status === 'cancelled' ? <span className="muted">Cancelled</span> : money(o.amount)}</td>
                  </tr>
                ))}
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
