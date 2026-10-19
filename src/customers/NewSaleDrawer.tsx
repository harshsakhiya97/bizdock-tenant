import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Hint, Label, Select, TextInput } from '@/components/Field'
import { GST_RATES } from '@/masters/types'
import { useTenant } from '@/tenant/useTenant'
import { createSale, customerByPhone } from './api'
import { addMonthsIso, fmtDay, rupees, todayIso } from './labels'
import type { SaleInput } from './types'
import type { SalesData } from './useSalesData'
import { SubBusinessSelect, subOf, useSubBusinesses } from '@/business/SubBusinessSelect'

export type SalePrefill = {
  business_id?: string
  sub_business_id?: string
  customer_id?: string
  customer_name?: string
  lead_id?: string
  customer?: Partial<SaleInput['customer']>
  sales_person_id?: string
  notes?: string
  base_amount?: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** New sale: customer (new, matched by phone, or given) + product + Full / Booking / EMI plan. */
export function NewSaleDrawer({
  data,
  prefill,
  onClose,
  onSaved,
}: {
  data: SalesData
  prefill: SalePrefill
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const { businesses, membership, scope } = useAuth()
  const me = membership?.id ?? ''
  const ownOnly = scope('sales') === 'own'
  const today = todayIso()
  const [f, setF] = useState<SaleInput>(() => ({
    business_id: prefill.business_id ?? (businesses.length === 1 ? businesses[0].id : ''),
    sub_business_id: prefill.sub_business_id ?? '',
    customer_id: prefill.customer_id ?? '',
    lead_id: prefill.lead_id ?? '',
    customer: { full_name: '', phone: '', email: '', city: '', ...prefill.customer },
    sales_person_id: ownOnly ? me : (prefill.sales_person_id ?? me),
    notes: prefill.notes ?? '',
    product_id: '',
    quantity: '1',
    plan: 'full',
    billing_company_id: '',
    payment_mode_id: '',
    reference: '',
    payment_remark: '',
    sale_date: today,
    base_amount: prefill.base_amount ?? '',
    gst_applicable: true,
    gst_rate: '18',
    received_now: '',
    token_amount: '',
    balance_due_on: '',
    down_payment: '',
    emi_count: '3',
    first_emi_on: addMonthsIso(today, 1),
  }))
  const [match, setMatch] = useState<{ id: string; full_name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof SaleInput>(k: K, v: SaleInput[K]) => setF((d) => ({ ...d, [k]: v }))
  const setCust = (k: keyof SaleInput['customer'], v: string) => setF((d) => ({ ...d, customer: { ...d.customer, [k]: v } }))

  const modes = data.modes.filter((m) => m.is_active)
  const subs = useSubBusinesses(f.business_id)

  const base = Number(f.base_amount) || 0
  const gst = f.gst_applicable ? round2((base * Number(f.gst_rate)) / 100) : 0
  const total = round2(base + gst)
  const paidNow =
    f.plan === 'full'
      ? f.received_now.trim() === ''
        ? total
        : Number(f.received_now) || 0
      : f.plan === 'booking'
        ? Number(f.token_amount) || 0
        : Number(f.down_payment) || 0
  const rest = round2(Math.max(0, total - paidNow))
  const n = Math.max(0, Math.floor(Number(f.emi_count) || 0))
  const schedule = useMemo(() => {
    if (f.plan !== 'emi' || n < 1 || !f.first_emi_on || rest <= 0) return []
    const each = Math.floor(rest / n)
    return Array.from({ length: n }, (_, i) => ({
      seq: i + 1,
      due_on: addMonthsIso(f.first_emi_on, i),
      amount: i === n - 1 ? round2(rest - each * (n - 1)) : each,
    }))
  }, [f.plan, f.first_emi_on, n, rest])

  async function checkPhone() {
    if (f.customer_id || !f.business_id || !f.customer.phone.trim()) return setMatch(null)
    setMatch(await customerByPhone(tenant.id, f.business_id, f.customer.phone))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.business_id) return setError('Pick the business.')
    if (!f.customer_id && !match && !f.customer.full_name.trim()) return setError('Enter the customer’s name.')
    if (f.base_amount.trim() === '' || base < 0) return setError('Enter the amount before GST.')
    if (paidNow > total) return setError(`The amount received can’t be more than the total (${rupees(total, true)}).`)
    if (f.plan === 'full' && rest > 0 && !f.balance_due_on) return setError('Enter when the remaining amount will be paid.')
    if (f.plan === 'booking') {
      if (paidNow <= 0) return setError('Enter the token amount received.')
      if (rest <= 0) return setError('The token covers the total. Use Full payment instead.')
      if (!f.balance_due_on) return setError('Enter the date the balance is promised.')
    }
    if (f.plan === 'emi') {
      if (n < 1) return setError('Enter the number of instalments.')
      if (!f.first_emi_on) return setError('Enter the first instalment date.')
      if (rest <= 0) return setError('The down payment covers the total. Use Full payment instead.')
    }
    setBusy(true)
    setError(null)
    try {
      await createSale(tenant.id, { ...f, sub_business_id: subOf(subs, f.sub_business_id), customer_id: f.customer_id || match?.id || '' })
      const who = prefill.customer_name ?? match?.full_name ?? f.customer.full_name.trim()
      onSaved(`Sale saved for ${who}.`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const noMasters = false

  return (
    <Drawer
      open
      width={780}
      onClose={onClose}
      title={prefill.customer_name ? `New sale · ${prefill.customer_name}` : 'New sale'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button type="submit" form="sale-form" disabled={busy || noMasters}>
              {busy ? 'Saving…' : 'Create sale'}
            </Button>
          </div>
        </>
      }
    >
      <form id="sale-form" onSubmit={submit} className="stack">
        {prefill.lead_id && !prefill.customer_id && (
          <div className="alert alert-info">From the won lead. The new customer stays linked to the lead.</div>
        )}

        {!prefill.customer_id && (
          <FormSection title="Customer" description="Existing customers of the business are matched by phone.">
            <div className="form-grid">
              {businesses.length > 1 && !prefill.business_id && (
                <div className="span-2">
                  <Label htmlFor="s-biz" required>
                    Business
                  </Label>
                  <Select
                    id="s-biz"
                    value={f.business_id}
                    onChange={(e) => setF((d) => ({ ...d, business_id: e.target.value, sub_business_id: '', product_id: '' }))}
                  >
                    <option value="">— select —</option>
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {businesses.length > 1 && prefill.business_id && (
                <p className="span-2 muted small">Business: {businesses.find((b) => b.id === f.business_id)?.name}</p>
              )}
              <div>
                <Label htmlFor="s-name" required>
                  Customer full name
                </Label>
                <TextInput id="s-name" value={f.customer.full_name} onChange={(e) => setCust('full_name', e.target.value)} autoFocus />
              </div>
              <div>
                <Label htmlFor="s-phone">Phone</Label>
                <TextInput id="s-phone" value={f.customer.phone} onChange={(e) => setCust('phone', e.target.value)} onBlur={checkPhone} />
                {match && <Hint>Matches {match.full_name}: the sale will be added to this customer.</Hint>}
              </div>
              <div>
                <Label htmlFor="s-email">Email</Label>
                <TextInput id="s-email" type="email" value={f.customer.email} onChange={(e) => setCust('email', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="s-city">City</Label>
                <TextInput id="s-city" value={f.customer.city} onChange={(e) => setCust('city', e.target.value)} />
              </div>
            </div>
          </FormSection>
        )}

        <FormSection title="Sale & payment">
          <div className="form-grid">
            <SubBusinessSelect id="s-sub" className="span-2" businessId={f.business_id} value={f.sub_business_id} onChange={(v) => set('sub_business_id', v)} />
            <div>
              <Label htmlFor="s-person">Sales person</Label>
              <Select id="s-person" value={f.sales_person_id} disabled={ownOnly} onChange={(e) => set('sales_person_id', e.target.value)}>
                {!data.members.some((m) => m.id === me) && <option value={me}>Me</option>}
                {data.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="s-mode">Payment mode</Label>
              <Select id="s-mode" value={f.payment_mode_id} onChange={(e) => set('payment_mode_id', e.target.value)}>
                <option value="">— select —</option>
                {modes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="s-ref">UTR / Razorpay / reference no.</Label>
              <TextInput id="s-ref" value={f.reference} onChange={(e) => set('reference', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="s-date">Sale date</Label>
              <TextInput id="s-date" type="date" value={f.sale_date} max={today} onChange={(e) => set('sale_date', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="s-remark">Payment remark</Label>
              <TextInput id="s-remark" placeholder="For reference only" value={f.payment_remark} onChange={(e) => set('payment_remark', e.target.value)} />
            </div>
          </div>
        </FormSection>

        <FormSection title="Amount">
          <div className="form-grid">
            <div>
              <Label htmlFor="s-base" required>
                Amount before GST (₹)
              </Label>
              <TextInput id="s-base" type="number" min={0} step="0.01" value={f.base_amount} onChange={(e) => set('base_amount', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="s-rate">GST rate</Label>
              <Select id="s-rate" value={f.gst_rate} disabled={!f.gst_applicable} onChange={(e) => set('gst_rate', e.target.value)}>
                {GST_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </Select>
            </div>
            <div className="span-2">
              <Checkbox id="s-gst" checked={f.gst_applicable} onChange={(v) => set('gst_applicable', v)} label="GST applicable" />
            </div>

            {f.plan === 'full' && (
              <>
                <div>
                  <Label htmlFor="s-received">Payment received today (₹)</Label>
                  <TextInput
                    id="s-received"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Leave empty for the full amount"
                    value={f.received_now}
                    onChange={(e) => set('received_now', e.target.value)}
                  />
                </div>
                {rest > 0 && (
                  <div>
                    <Label htmlFor="s-bal" required>
                      Remaining {rupees(rest, true)} due on
                    </Label>
                    <TextInput id="s-bal" type="date" min={f.sale_date} value={f.balance_due_on} onChange={(e) => set('balance_due_on', e.target.value)} />
                  </div>
                )}
              </>
            )}

            {f.plan === 'booking' && (
              <>
                <div>
                  <Label htmlFor="s-token" required>
                    Token received (₹)
                  </Label>
                  <TextInput id="s-token" type="number" min={0} step="0.01" value={f.token_amount} onChange={(e) => set('token_amount', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="s-bal" required>
                    Balance {rest > 0 ? rupees(rest, true) : ''} promised by
                  </Label>
                  <TextInput id="s-bal" type="date" min={f.sale_date} value={f.balance_due_on} onChange={(e) => set('balance_due_on', e.target.value)} />
                </div>
              </>
            )}

            {f.plan === 'emi' && (
              <>
                <div>
                  <Label htmlFor="s-down">Down payment received (₹)</Label>
                  <TextInput id="s-down" type="number" min={0} step="0.01" value={f.down_payment} onChange={(e) => set('down_payment', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="s-n" required>
                    Number of instalments
                  </Label>
                  <TextInput id="s-n" type="number" min={1} max={60} value={f.emi_count} onChange={(e) => set('emi_count', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="s-first" required>
                    First instalment on
                  </Label>
                  <TextInput id="s-first" type="date" min={f.sale_date} value={f.first_emi_on} onChange={(e) => set('first_emi_on', e.target.value)} />
                  <Hint>The rest fall on the same day each month.</Hint>
                </div>
              </>
            )}
          </div>

          <div className="sale-sum">
            <span>
              Before GST <b>{rupees(base, true)}</b>
            </span>
            <span>
              GST <b>{rupees(gst, true)}</b>
            </span>
            <span>
              Total <b>{rupees(total, true)}</b>
            </span>
            <span>
              Received now <b className="text-success">{rupees(Math.min(paidNow, total), true)}</b>
            </span>
            <span>
              Remaining <b className={rest > 0 ? 'text-danger' : undefined}>{rupees(rest, true)}</b>
            </span>
          </div>

          {schedule.length > 0 && (
            <div className="table-wrap emi-preview">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Due on</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((s) => (
                    <tr key={s.seq}>
                      <td>EMI {s.seq}</td>
                      <td>{fmtDay(s.due_on)}</td>
                      <td className="right">{rupees(s.amount, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FormSection>

        <FormSection title="What was sold">
          <TextInput placeholder="e.g. Podcast shoot – 3 hours, edited episode" value={f.notes} onChange={(e) => set('notes', e.target.value)} aria-label="Notes" />
        </FormSection>
      </form>
    </Drawer>
  )
}
