import { Fragment, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Printer } from 'lucide-react'
import { db } from '@/lib/supabase'
import { inWords } from '@/bookings/InvoicePage'
import { getInvoice } from './api'
import type { InvoiceRow } from './types'

const amt = (n: number) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const short = (d: string) => {
  const x = new Date(`${d}T00:00:00`)
  return `${String(x.getDate()).padStart(2, '0')}-${MONTHS[x.getMonth()]}-${String(x.getFullYear()).slice(2)}`
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const r2 = (n: number) => Math.round(n * 100) / 100

type Line = { key: string; date: string | null; name: string; hsn: string | null; amount: number }

/** Printable invoice in the Tally layout: Tax Invoice (With GST: CGST + SGST in the same state, else IGST) or Invoice (Without GST). */
export function InvoicePrint() {
  const { id = '' } = useParams()
  const [inv, setInv] = useState<InvoiceRow | null | undefined>(undefined)
  const [products, setProducts] = useState<Map<string, { gst_name: string | null; hsn_code: string | null }>>(new Map())

  useEffect(() => {
    getInvoice(id).then(
      async (i) => {
        setInv(i)
        const ids = [...new Set((i?.bookings ?? []).flatMap((b) => (b.booking_items ?? []).map((x) => x.product_id)).filter(Boolean))] as string[]
        if (ids.length) {
          const { data } = await db().from('products').select('id, gst_name, hsn_code').in('id', ids)
          setProducts(new Map(((data ?? []) as { id: string; gst_name: string | null; hsn_code: string | null }[]).map((p) => [p.id, p])))
        }
      },
      () => setInv(null),
    )
  }, [id])
  useEffect(() => {
    if (inv) document.title = `Invoice ${inv.invoice_no}`
  }, [inv])

  if (inv === undefined) return <div className="empty">Loading…</div>
  if (!inv) return <div className="empty">This invoice isn’t available.</div>

  const gst = inv.kind === 'gst'
  const s = inv.seller ?? {}
  const b = inv.buyer ?? {}
  const live = inv.bookings.filter((o) => o.status !== 'cancelled').sort((x, y) => x.booking_date.localeCompare(y.booking_date) || (x.order_no ?? '').localeCompare(y.order_no ?? ''))
  const dated = live.length > 1
  const lines: Line[] = live.flatMap((o) => {
    const items = o.booking_items?.length
      ? [...o.booking_items].sort((x, y) => x.sort_order - y.sort_order)
      : [{ id: o.id, product_id: null, name: o.purpose || o.order_no || 'Service', price: Number(o.amount) }]
    return items.map((it, n) => {
      const p = it.product_id ? products.get(it.product_id) : undefined
      return { key: `${o.id}-${it.id}`, date: dated && n === 0 ? o.booking_date : null, name: (gst && p?.gst_name) || it.name, hsn: p?.hsn_code ?? null, amount: Number(it.price) }
    })
  })
  const taxable = Number(inv.amount)
  const tax = Number(inv.gst_amount)
  const rate = Number(inv.gst_rate)
  // same state (or the client's state not given): CGST + SGST; another state: IGST
  const inter = !!(s.state_code && b.state_code && String(s.state_code).trim() !== String(b.state_code).trim())
  const cgst = r2(tax / 2)
  const sgst = r2(tax - cgst)
  // tax summary per HSN / SAC (the last row takes the rounding so the total matches)
  const groups = [...lines.reduce((m, l) => m.set(l.hsn ?? '', (m.get(l.hsn ?? '') ?? 0) + l.amount), new Map<string, number>())]
  let left = tax
  const summary = groups.map(([hsn, val], i) => {
    const t = i === groups.length - 1 ? r2(left) : r2((val * rate) / 100)
    left -= t
    return { hsn, val, tax: t }
  })
  const buyerName = b.company || b.name || inv.client_name
  const seller = s.name || 'Invoice'

  return (
    <div className="tinv-wrap">
      <div className="inv-actions">
        <button type="button" className="btn btn-outline" onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}>
          ← Back
        </button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>
      <article className="tinv">
        <h1>{gst ? 'Tax Invoice' : 'INVOICE'}</h1>
        <table className="tinv-top">
          <tbody>
            <tr>
              <td className="tinv-party" rowSpan={1}>
                <b className="tinv-big">{seller}</b>
                {s.address && <div className="tinv-pre">{s.address}</div>}
                {s.gstin && <div>GSTIN/UIN: {s.gstin}</div>}
                {s.state && (
                  <div>
                    State Name : {s.state}
                    {s.state_code ? `, Code : ${s.state_code}` : ''}
                  </div>
                )}
                {s.cin && <div>CIN: {s.cin}</div>}
                {!gst && s.pan && <div>PAN NO- {s.pan}</div>}
                {s.email && <div>E-Mail : {s.email}</div>}
              </td>
              <td className="tinv-boxes" rowSpan={2}>
                <table>
                  <tbody>
                    <tr>
                      <td>
                        Invoice No.
                        <b>{inv.invoice_no}</b>
                      </td>
                      <td>
                        Dated
                        <b>{short(inv.invoice_date)}</b>
                      </td>
                    </tr>
                    {[
                      ['Delivery Note', 'Mode/Terms of Payment'],
                      ['Reference No. & Date.', 'Other References'],
                      ['Buyer’s Order No.', 'Dated'],
                      ['Dispatch Doc No.', 'Delivery Note Date'],
                      ['Dispatched through', 'Destination'],
                    ].map(([a, c]) => (
                      <tr key={a}>
                        <td>{a}</td>
                        <td>{c}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={2} className="tinv-terms">
                        Terms of Delivery
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
            <tr>
              <td className="tinv-party">
                <div className="tinv-muted">Buyer (Bill to)</div>
                <b>{buyerName}</b>
                {b.company && b.name && b.company !== b.name && <div>{b.name}</div>}
                {b.address && <div className="tinv-pre">{b.address}</div>}
                {b.gstin && <div>GSTIN/UIN : {b.gstin}</div>}
                {b.state && (
                  <div>
                    State Name : {b.state}
                    {b.state_code ? `, Code : ${b.state_code}` : ''}
                  </div>
                )}
                {!b.address && !b.gstin && b.phone && <div>{b.phone}</div>}
              </td>
            </tr>
          </tbody>
        </table>

        <table className="tinv-lines">
          <thead>
            <tr>
              <th className="tinv-sl">Sl No.</th>
              <th>Particulars</th>
              {gst && <th className="tinv-hsn">HSN/SAC</th>}
              <th className="tinv-amt">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key} className="tinv-line">
                <td className="tinv-sl">{i + 1}</td>
                <td>
                  {l.date && <b className="tinv-date">{short(l.date)}</b>}
                  <b>{l.name}</b>
                </td>
                {gst && <td className="tinv-hsn">{l.hsn ?? ''}</td>}
                <td className="tinv-amt">{amt(l.amount)}</td>
              </tr>
            ))}
            {gst && (
              <>
                <tr className="tinv-line">
                  <td />
                  <td className="tinv-taxname">{inter ? `Output IGST @ ${rate}%` : `Output CGST @ ${rate / 2}%`}</td>
                  <td />
                  <td className="tinv-amt tinv-sub">{amt(inter ? tax : cgst)}</td>
                </tr>
                {!inter && (
                  <tr className="tinv-line">
                    <td />
                    <td className="tinv-taxname">Output SGST @ {rate / 2}%</td>
                    <td />
                    <td className="tinv-amt">{amt(sgst)}</td>
                  </tr>
                )}
              </>
            )}
            <tr className="tinv-fill">
              <td />
              <td />
              {gst && <td />}
              <td />
            </tr>
            <tr className="tinv-total">
              <td />
              <td className="tinv-right">Total</td>
              {gst && <td />}
              <td className="tinv-amt">
                <b>₹ {amt(Number(inv.total_amount))}</b>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="tinv-words">
          <div className="row-between">
            <span className="tinv-muted">Amount Chargeable (in words)</span>
            <i className="tinv-muted">E. &amp; O.E</i>
          </div>
          <b>INR {inWords(Number(inv.total_amount)).replace(' Rupees', '')}</b>
        </div>

        {gst && (
          <>
            <table className="tinv-tax">
              <thead>
                <tr>
                  <th rowSpan={2}>HSN/SAC</th>
                  <th rowSpan={2}>Taxable Value</th>
                  {inter ? (
                    <th colSpan={2}>IGST</th>
                  ) : (
                    <>
                      <th colSpan={2}>CGST</th>
                      <th colSpan={2}>SGST</th>
                    </>
                  )}
                  <th rowSpan={2}>Total Tax Amount</th>
                </tr>
                <tr>
                  {(inter ? ['IGST'] : ['CGST', 'SGST']).map((k) => (
                    <Fragment key={k}>
                      <th>Rate</th>
                      <th>Amount</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.map((g) => {
                  const c = r2(g.tax / 2)
                  return (
                    <tr key={g.hsn || 'none'}>
                      <td>{g.hsn}</td>
                      <td className="tinv-amt">{amt(g.val)}</td>
                      {inter ? (
                        <>
                          <td className="tinv-c">{rate}%</td>
                          <td className="tinv-amt">{amt(g.tax)}</td>
                        </>
                      ) : (
                        <>
                          <td className="tinv-c">{rate / 2}%</td>
                          <td className="tinv-amt">{amt(c)}</td>
                          <td className="tinv-c">{rate / 2}%</td>
                          <td className="tinv-amt">{amt(g.tax - c)}</td>
                        </>
                      )}
                      <td className="tinv-amt">{amt(g.tax)}</td>
                    </tr>
                  )
                })}
                <tr className="tinv-total">
                  <td className="tinv-right">Total:</td>
                  <td className="tinv-amt">{amt(taxable)}</td>
                  {inter ? (
                    <>
                      <td />
                      <td className="tinv-amt">{amt(tax)}</td>
                    </>
                  ) : (
                    <>
                      <td />
                      <td className="tinv-amt">{amt(cgst)}</td>
                      <td />
                      <td className="tinv-amt">{amt(sgst)}</td>
                    </>
                  )}
                  <td className="tinv-amt">{amt(tax)}</td>
                </tr>
              </tbody>
            </table>
            <div className="tinv-words">
              <span className="tinv-muted">Tax Amount (in words) : </span>
              <b>INR {inWords(tax).replace(' Rupees', '')}</b>
            </div>
          </>
        )}

        <table className="tinv-foot">
          <tbody>
            <tr>
              <td className="tinv-foot-l">{gst && s.pan && <div>Company’s PAN : <b>{s.pan}</b></div>}</td>
              <td className="tinv-foot-r">
                <div className="tinv-muted">Company’s Bank Details</div>
                <dl>
                  <dt>A/c Holder’s Name</dt>
                  <dd>: {s.bank_holder || seller}</dd>
                  <dt>Bank Name</dt>
                  <dd>: {s.bank_name || ''}</dd>
                  <dt>A/c No.</dt>
                  <dd>: {s.bank_account || ''}</dd>
                  <dt>Branch &amp; IFS Code</dt>
                  <dd>: {[s.bank_branch, s.bank_ifsc].filter(Boolean).join(' & ')}</dd>
                </dl>
                <div className="tinv-sign">
                  <b>for {seller}</b>
                  <span>Authorised Signatory</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="tinv-gen">This is a Computer Generated Invoice</p>
      </article>
    </div>
  )
}
