import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Printer } from 'lucide-react'
import { db } from '@/lib/supabase'
import type { BillingCompanyRow } from '@/masters/types'
import { createBookingInvoice, getBooking } from './api'
import { partState, type BookingRow } from './types'

const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const two = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`)
const three = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', two(n % 100)].filter(Boolean).join(' ')
/** Indian numbering: 12500 → "Twelve Thousand Five Hundred Rupees Only" */
function inWords(amount: number) {
  let n = Math.floor(amount)
  const paise = Math.round((amount - n) * 100)
  if (!n && !paise) return 'Zero Rupees Only'
  const parts: string[] = []
  for (const [size, name] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']] as const) {
    if (n >= size) {
      parts.push(`${three(Math.floor(n / size))} ${name}`)
      n %= size
    }
  }
  if (n) parts.push(three(n))
  return `${parts.join(' ')} Rupees${paise ? ` and ${two(paise)} Paise` : ''} Only`
}

/** Printable invoice for one booking (Print → Save as PDF). */
export function InvoicePage() {
  const { id = '' } = useParams()
  const [b, setB] = useState<BookingRow | null | undefined>(undefined)
  const [co, setCo] = useState<BillingCompanyRow | null>(null)
  const [client, setClient] = useState<{ email: string | null; city: string | null } | null>(null)
  const [modes, setModes] = useState<Map<string, string>>(new Map())
  const [err, setErr] = useState<string | null>(null)
  // without a billing company the invoice shows the business (and sub-business)
  const [biz, setBiz] = useState<{ name: string; legal_name: string | null; address: string | null; city: string | null; state: string | null; gst_number: string | null; sub: string | null } | null>(null)

  useEffect(() => {
    getBooking(id).then(async (first) => {
      let bk = first
      // the invoice number is given the first time the invoice is opened
      if (bk && !bk.invoice_no && bk.status !== 'cancelled') {
        try {
          await createBookingInvoice(bk.id, null)
          bk = await getBooking(id)
        } catch (e) {
          setErr((e as Error).message)
        }
      }
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
      const [{ data: bz }, { data: sb }] = await Promise.all([
        db().from('businesses').select('name, legal_name, address, city, state, gst_number').eq('id', bk.business_id).maybeSingle(),
        bk.sub_business_id ? db().from('sub_businesses').select('name').eq('id', bk.sub_business_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      if (bz) setBiz({ ...(bz as Omit<NonNullable<typeof biz>, 'sub'>), sub: (sb as { name: string } | null)?.name ?? null })
    }, () => setB(null))
  }, [id])

  useEffect(() => {
    if (b?.invoice_no) document.title = `Invoice ${b.invoice_no}`
  }, [b])

  if (b === undefined) return <div className="empty">Loading…</div>
  if (!b) return <div className="empty">This booking isn’t available.</div>
  if (!b.invoice_no) return <div className="empty">{b.status === 'cancelled' ? 'A cancelled booking has no invoice.' : `The invoice couldn’t be created${err ? `: ${err}` : '.'}`}</div>

  const hours = (() => {
    const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
    return (m(b.end_time) - m(b.start_time)) / 60
  })()
  const items = b.booking_items?.length
    ? [...b.booking_items].sort((x, y) => x.sort_order - y.sort_order)
    : [{ id: 'one', name: sellerSubName(), price: b.amount }]
  const parts = [...b.booking_payments].sort((x, y) => (x.due_on ?? x.paid_on ?? '').localeCompare(y.due_on ?? y.paid_on ?? ''))
  const paidParts = parts.filter((p) => p.status === 'paid')
  function sellerSubName() {
    return b!.purpose || 'Studio booking'
  }
  const half = Math.round((b.gst_amount / 2) * 100) / 100
  const balance = Math.max(0, b.total_amount - b.paid_amount)

  const seller = co ? co.legal_name || co.name : biz?.legal_name || biz?.name || 'Invoice'
  const sellerSub = co ? null : biz?.sub
  const sellerLines = co
    ? [co.address, co.state, co.gst_number ? `GSTIN: ${co.gst_number}` : null]
    : [biz?.address, [biz?.city, biz?.state].filter(Boolean).join(', ') || null, biz?.gst_number ? `GSTIN: ${biz.gst_number}` : null]
  const stamp = balance <= 0 ? 'PAID' : b.paid_amount > 0 ? 'PART PAID' : 'DUE'
  const status = b.status.charAt(0).toUpperCase() + b.status.slice(1)
  const longDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  const shortDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const clock = (t: string) => {
    const [h, m] = t.slice(0, 5).split(':').map(Number)
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
  }

  return (
    <div className="inv2-wrap">
      <div className="inv-actions">
        <button type="button" className="btn btn-outline" onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}>
          ← Back to Bookings
        </button>
        <button type="button" className="btn btn-primary inv2-print" onClick={() => window.print()}>
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>
      <article className="inv2">
        <header className="inv2-head">
          <div>
            <h1>{seller}</h1>
            {sellerSub && <div className="inv2-sub">{sellerSub}</div>}
            {sellerLines.filter(Boolean).map((l, i) => (
              <div key={i} className="inv2-sub">
                {l}
              </div>
            ))}
          </div>
          <div className="inv2-title">
            {sellerSub && <div className="inv2-kicker">{sellerSub}</div>}
            <div className="inv2-big">{b.gst_applicable ? 'TAX INVOICE' : 'INVOICE'}</div>
            <span className={`inv2-stamp ${stamp === 'PAID' ? 'is-paid' : 'is-due'}`}>{stamp}</span>
          </div>
        </header>

        <section className="inv2-info">
          <div>
            <div className="inv2-label">Billed to</div>
            <div className="inv2-client">{b.client_name}</div>
            {b.phone && <div>{b.phone}</div>}
            {client?.email && <div>{client.email}</div>}
            {client?.city && <div>{client.city}</div>}
          </div>
          <dl className="inv2-meta">
            <dt>Invoice No.</dt>
            <dd>
              <b>{b.invoice_no}</b>
            </dd>
            <dt>Invoice Date</dt>
            <dd>{b.invoice_date ? shortDay(b.invoice_date) : '—'}</dd>
            <dt>Shoot Date</dt>
            <dd>{longDay(b.booking_date)}</dd>
            <dt>Status</dt>
            <dd>{status}</dd>
          </dl>
        </section>

        <table className="inv2-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id}>
                <td>
                  <b>{it.name}</b>
                  {i === 0 && (
                    <div className="inv2-muted">
                      {b.purpose ? `${b.purpose} · ` : ''}
                      {shortDay(b.booking_date)} · {clock(b.start_time)} - {clock(b.end_time)} · {hours} hr{hours === 1 ? '' : 's'}
                    </div>
                  )}
                </td>
                <td className="r">{inr(it.price)}</td>
              </tr>
            ))}
            {items.length > 1 && (
              <tr className="inv2-tax">
                <td>Sub-total</td>
                <td className="r">{inr(b.amount)}</td>
              </tr>
            )}
            {b.gst_applicable && (
              <>
                <tr className="inv2-tax">
                  <td>CGST {b.gst_rate / 2}%</td>
                  <td className="r">{inr(half)}</td>
                </tr>
                <tr className="inv2-tax">
                  <td>SGST {b.gst_rate / 2}%</td>
                  <td className="r">{inr(b.gst_amount - half)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        <div className="inv2-totals">
          <div className="inv2-total">
            <span>Total</span>
            <span>{inr(b.total_amount)}</span>
          </div>
          {paidParts.length === 1 && parts.length === 1 && (
            <div className="inv2-row">
              <span>
                Received {shortDay(paidParts[0].paid_on ?? b.booking_date)}
                {paidParts[0].payment_mode_id ? ` · ${modes.get(paidParts[0].payment_mode_id) ?? ''}` : ''}
              </span>
              <span>- {inr(paidParts[0].amount)}</span>
            </div>
          )}
          {parts.length > 1 && (
            <div className="inv2-row">
              <span>Received</span>
              <span>- {inr(b.paid_amount)}</span>
            </div>
          )}
          <div className="inv2-row">
            <span>Balance Due</span>
            <span>{inr(balance)}</span>
          </div>
        </div>
        {parts.length > 1 && (
          <section className="inv2-receipts">
            <div className="inv2-label">Receipts</div>
            <table className="inv2-table">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Date</th>
                  <th>Mode</th>
                  <th>Comment</th>
                  <th>Status</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((p) => {
                  const st = partState(p)
                  return (
                    <tr key={p.id}>
                      <td>{p.label || 'Payment'}</td>
                      <td>{st === 'paid' ? shortDay(p.paid_on ?? p.due_on ?? b.booking_date) : p.due_on ? `Due ${shortDay(p.due_on)}` : '—'}</td>
                      <td>{p.payment_mode_id ? (modes.get(p.payment_mode_id) ?? '—') : '—'}</td>
                      <td>{p.note || p.reference || '—'}</td>
                      <td>
                        <span className={`inv2-st is-${st}`}>{st === 'paid' ? 'Paid' : st === 'overdue' ? 'Overdue' : 'Pending'}</span>
                      </td>
                      <td className="r">{inr(p.amount)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )}
        <p className="inv2-words">Amount in words: {inWords(b.total_amount)}</p>
        {b.notes && <p className="inv2-words">{b.notes}</p>}

        <footer className="inv2-foot">
          <div>
            <div>Advance is non-refundable. Balance is payable on or before the shoot date.</div>
            <div>This is a computer-generated invoice.</div>
          </div>
          <div className="inv2-sign">
            <div>Authorised Signatory</div>
            <div>{seller}</div>
          </div>
        </footer>
      </article>
    </div>
  )
}
