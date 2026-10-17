import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Printer } from 'lucide-react'
import { db } from '@/lib/supabase'
import type { BillingCompanyRow } from '@/masters/types'
import { getBooking } from './api'
import { slotText } from './BookingsTab'
import type { BookingRow } from './types'

const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/** Printable invoice for one booking (Print → Save as PDF). */
export function InvoicePage() {
  const { id = '' } = useParams()
  const [b, setB] = useState<BookingRow | null | undefined>(undefined)
  const [co, setCo] = useState<BillingCompanyRow | null>(null)
  const [client, setClient] = useState<{ email: string | null; city: string | null } | null>(null)
  const [modes, setModes] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    getBooking(id).then(async (bk) => {
      setB(bk)
      if (!bk) return
      const [c, m, l] = await Promise.all([
        bk.billing_company_id ? db().from('billing_companies').select('*').eq('id', bk.billing_company_id).maybeSingle() : Promise.resolve({ data: null }),
        db().from('payment_modes').select('id, name').eq('tenant_id', bk.tenant_id),
        bk.lead_id ? db().from('leads').select('email, city').eq('id', bk.lead_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      setCo(c.data as BillingCompanyRow | null)
      setModes(new Map(((m.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])))
      setClient(l.data as { email: string | null; city: string | null } | null)
    }, () => setB(null))
  }, [id])

  useEffect(() => {
    if (b?.invoice_no) document.title = `Invoice ${b.invoice_no}`
  }, [b])

  if (b === undefined) return <div className="empty">Loading…</div>
  if (!b) return <div className="empty">This booking isn’t available.</div>
  if (!b.invoice_no) return <div className="empty">This booking has no invoice yet.</div>

  const hours = (() => {
    const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
    return (m(b.end_time) - m(b.start_time)) / 60
  })()
  const half = Math.round((b.gst_amount / 2) * 100) / 100
  const balance = Math.max(0, b.total_amount - b.paid_amount)

  return (
    <>
      <div className="inv-actions">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>
      <article className="inv-page">
        <div className="inv-top">
          <div>
            <h1>{co?.legal_name || co?.name || 'Invoice'}</h1>
            <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {co?.address}
              {co?.state ? `\n${co.state}` : ''}
              {co?.gst_number ? `\nGSTIN: ${co.gst_number}` : ''}
            </div>
          </div>
          <div className="inv-meta">
            <b style={{ fontSize: 16 }}>{b.gst_applicable ? 'TAX INVOICE' : 'INVOICE'}</b>
            <div>
              No. <b>{b.invoice_no}</b>
            </div>
            <div>Date {b.invoice_date ? day(b.invoice_date) : '—'}</div>
          </div>
        </div>

        <div className="inv-parties">
          <div>
            <h4>Bill to</h4>
            <b>{b.client_name}</b>
            <div>{b.phone}</div>
            {client?.email && <div>{client.email}</div>}
            {client?.city && <div>{client.city}</div>}
          </div>
          <div>
            <h4>Booking</h4>
            <div>{slotText(b)}</div>
            <div>
              {hours} hour{hours === 1 ? '' : 's'}
              {b.purpose ? ` · ${b.purpose}` : ''}
            </div>
          </div>
        </div>

        <table className="inv-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="r">Hours</th>
              <th className="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {b.purpose ? `${b.purpose} — studio booking` : 'Studio booking'}
                <div style={{ fontSize: 12, color: '#6b7280' }}>{slotText(b)}</div>
              </td>
              <td className="r">{hours}</td>
              <td className="r">{inr(b.amount)}</td>
            </tr>
            {b.gst_applicable && (
              <>
                <tr>
                  <td colSpan={2} className="r">
                    CGST {b.gst_rate / 2}%
                  </td>
                  <td className="r">{inr(half)}</td>
                </tr>
                <tr>
                  <td colSpan={2} className="r">
                    SGST {b.gst_rate / 2}%
                  </td>
                  <td className="r">{inr(b.gst_amount - half)}</td>
                </tr>
              </>
            )}
            <tr className="inv-total">
              <td colSpan={2} className="r">
                Total
              </td>
              <td className="r">{inr(b.total_amount)}</td>
            </tr>
            {b.booking_payments.map((p) => (
              <tr key={p.id}>
                <td colSpan={2} className="r" style={{ color: '#6b7280' }}>
                  Received {day(p.paid_on)}
                  {p.payment_mode_id ? ` · ${modes.get(p.payment_mode_id) ?? ''}` : ''}
                  {p.reference ? ` · ${p.reference}` : ''}
                </td>
                <td className="r">− {inr(p.amount)}</td>
              </tr>
            ))}
            <tr className="inv-total">
              <td colSpan={2} className="r">
                Balance due
              </td>
              <td className="r">{inr(balance)}</td>
            </tr>
          </tbody>
        </table>

        {b.notes && <p style={{ fontSize: 13, marginTop: 20 }}>{b.notes}</p>}
        <div className="inv-foot">This is a computer-generated invoice.</div>
      </article>
    </>
  )
}
