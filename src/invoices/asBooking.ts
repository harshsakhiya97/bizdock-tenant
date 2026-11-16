import type { BookingRow } from '@/bookings/types'
import type { InvoiceRow } from './types'

/** an invoice of orders (Default / Brand Deals) in the shape the printable invoice reads; each order's services are its lines */
export function invoiceAsBooking(i: InvoiceRow): { b: BookingRow; subs: Map<string, string> } {
  const orders = i.bookings.filter((o) => o.status !== 'cancelled').sort((x, y) => (x.order_no ?? '').localeCompare(y.order_no ?? ''))
  const subs = new Map<string, string>()
  const items: BookingRow['booking_items'] = []
  for (const o of orders) {
    const its = o.booking_items?.length
      ? [...o.booking_items].sort((x, y) => x.sort_order - y.sort_order)
      : [{ id: o.id, booking_id: o.id, product_id: null, name: o.purpose || o.order_no || 'Order', price: Number(o.amount), sort_order: 0 }]
    its.forEach((it, n) => {
      if (n === 0) subs.set(it.id, `${o.order_no ?? ''} · ${new Date(`${o.booking_date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`)
      items.push({ ...it, sort_order: items.length })
    })
  }
  return {
    subs,
    b: {
      id: i.id,
      tenant_id: i.tenant_id,
      business_id: i.business_id,
      sub_business_id: i.sub_business_id,
      product_id: null,
      lead_id: i.lead_id,
      customer_id: i.customer_id,
      client_name: i.client_name,
      phone: i.phone,
      purpose: null,
      booking_date: i.invoice_date,
      start_time: '00:00',
      end_time: '00:00',
      amount: Number(i.amount),
      gst_applicable: i.gst_applicable,
      gst_rate: Number(i.gst_rate),
      gst_amount: Number(i.gst_amount),
      total_amount: Number(i.total_amount),
      paid_amount: Number(i.paid_amount),
      status: 'confirmed',
      billing_company_id: i.billing_company_id,
      invoice_no: i.invoice_no,
      invoice_date: i.invoice_date,
      notes: i.notes,
      owner_id: null,
      order_no: null,
      order_status: null,
      invoice_id: null,
      created_by: i.created_by,
      created_at: i.created_at,
      booking_payments: i.invoice_payments.map((p) => ({ ...p, booking_id: i.id })),
      booking_items: items,
    },
  }
}
