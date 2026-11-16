import { useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Hint, Label, Select, TextInput } from '@/components/Field'
import { money } from '@/leads/labels'
import { useTenant } from '@/tenant/useTenant'
import type { BookingRow, PartDraft } from '@/bookings/types'
import type { BookingRefs } from '@/bookings/useBookingRefs'
import { createInvoice, saveInvoice } from './api'
import { PaymentPlan, planError } from './PaymentPlan'
import { isFullyPaid, type InvoiceInput, type InvoiceRow } from './types'

const serviceText = (b: BookingRow) =>
  b.booking_items?.length
    ? [...b.booking_items]
        .sort((x, y) => x.sort_order - y.sort_order)
        .map((i) => i.name)
        .join(', ')
    : (b.purpose ?? '—')

/** each order's GST is rounded on the order; the invoice adds them up (same as the database) */
export function invoiceTotals(orders: BookingRow[], gst: boolean, rate: number) {
  const live = orders.filter((o) => o.status !== 'cancelled')
  const amount = live.reduce((s, o) => s + Number(o.amount), 0)
  const tax = gst ? live.reduce((s, o) => s + Math.round(Number(o.amount) * rate) / 100, 0) : 0
  return { amount, gst: tax, total: amount + tax }
}

/**
 * Generate an invoice for orders of one client (GST + payment parts), or edit an invoice's GST and payment parts.
 */
export function InvoiceDrawer({
  orders,
  invoice,
  refs,
  onClose,
  onSaved,
}: {
  /** new invoice: the ticked orders */
  orders?: BookingRow[]
  /** edit: this invoice */
  invoice?: InvoiceRow | null
  refs: BookingRefs
  onClose: () => void
  onSaved: (msg: string, invoiceId: string) => void
}) {
  const tenant = useTenant()
  const { can, membership } = useAuth()
  const list = invoice ? invoice.bookings : (orders ?? [])
  const canEdit = invoice ? can('bookings', 'edit') : can('bookings', 'add') || can('bookings', 'edit')
  const locked = invoice ? isFullyPaid(invoice) : false
  const [input, setInput] = useState<InvoiceInput>(() => ({
    billing_company_id: invoice ? (invoice.billing_company_id ?? '') : (list[0]?.billing_company_id ?? refs.companies[0]?.id ?? ''),
    gst_applicable: invoice?.gst_applicable ?? false,
    gst_rate: String(invoice?.gst_rate ?? 18),
    parts: invoice
      ? [...invoice.invoice_payments]
          .sort((a, b) => (a.due_on ?? a.paid_on ?? '').localeCompare(b.due_on ?? b.paid_on ?? ''))
          .map(
            (p): PartDraft => ({ key: p.id, id: p.id, label: p.label ?? 'Payment', due_on: p.due_on ?? p.paid_on ?? '', amount: String(p.amount), mode: p.payment_mode_id ?? '', note: p.note ?? p.reference ?? '', status: p.status, paid_on: p.paid_on ?? '' }),
          )
      : [],
  }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const t = invoiceTotals(list, input.gst_applicable, Number(input.gst_rate) || 0)

  async function save() {
    const err = planError(input.parts, t.total)
    if (err) return setError(err)
    if (!invoice && !list.length) return setError('Tick at least one order.')
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
        onSaved(`Invoice generated for ${list[0].client_name}: ${list.map((o) => o.order_no).join(', ')}.`, id)
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
      title={invoice ? `Invoice ${invoice.invoice_no} · ${invoice.client_name}` : `Generate invoice · ${list[0]?.client_name ?? ''}`}
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
        <FormSection title={invoice ? 'Orders on this invoice' : 'Orders'} description={invoice ? undefined : 'One invoice for these orders. It gets the next invoice number.'}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Services</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.id}>
                    <td className="nowrap">
                      <b>{o.order_no}</b>
                    </td>
                    <td>{serviceText(o)}</td>
                    <td className="num nowrap">{o.status === 'cancelled' ? <span className="muted">Cancelled</span> : money(o.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FormSection>

        <FormSection title="GST">
          <div className="form-grid">
            {refs.companies.length > 1 && (
              <div className="span-2">
                <Label htmlFor="inv-co">Billing company</Label>
                <Select id="inv-co" value={input.billing_company_id} onChange={(e) => setInput((d) => ({ ...d, billing_company_id: e.target.value }))} disabled={!canEdit || locked}>
                  {refs.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="span-2 bk-gst">
              <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
                <Checkbox id="inv-gst" checked={input.gst_applicable} onChange={(v) => !locked && setInput((d) => ({ ...d, gst_applicable: v }))} label="Add GST on this invoice" />
                {input.gst_applicable && (
                  <TextInput aria-label="GST %" type="number" min={0} style={{ width: 80 }} value={input.gst_rate} onChange={(e) => setInput((d) => ({ ...d, gst_rate: e.target.value }))} disabled={!canEdit || locked} />
                )}
              </div>
              <div className="bk-total">
                <span className="muted small">Orders {money(t.amount)} · Total payable</span>
                <b>{t.amount ? money(t.total) : '—'}</b>
                <span className="muted small">{input.gst_applicable ? `incl. GST ${money(t.gst)}` : 'No GST'}</span>
              </div>
            </div>
            {locked && (
              <div className="span-2">
                <Hint>This invoice is fully paid, so its GST can’t be changed.</Hint>
              </div>
            )}
          </div>
        </FormSection>

        <FormSection title="Payment plan" description="Split the total into parts (advance, after delivery…); mark each Paid when the money comes in.">
          <PaymentPlan parts={input.parts} onChange={(parts) => setInput((d) => ({ ...d, parts }))} total={t.total} canEdit={canEdit} modes={refs.modes} />
        </FormSection>
      </div>
    </Drawer>
  )
}
