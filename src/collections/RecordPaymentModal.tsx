import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Checkbox, Hint, Label, Select, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { SearchSelect } from '@/components/SearchSelect'
import { fmtDay, remainingOf, rupees, todayIso } from '@/customers/labels'
import type { SalesData } from '@/customers/useSalesData'
import { dueLabel, dueLeft, recordPayment, type PaymentInput } from './api'

/** Record a payment on a sale (from Collect on a due, or picked here). */
export function RecordPaymentModal({
  data,
  saleId,
  dueId,
  onClose,
  onSaved,
}: {
  data: SalesData
  saleId?: string
  dueId?: string
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const { can, membership } = useAuth()
  const canVerify = can('payments', 'verify')
  const custById = useMemo(() => new Map(data.allCustomers.map((c) => [c.id, c])), [data.allCustomers])
  const open = data.sales.filter((s) => s.status === 'active' && remainingOf(s) > 0)
  const firstDue = (sid: string) => data.sales.find((s) => s.id === sid)?.sale_dues.find((d) => d.status === 'pending')

  const [f, setF] = useState<PaymentInput>(() => {
    const due = dueId ? data.sales.flatMap((s) => s.sale_dues).find((d) => d.id === dueId) : saleId ? firstDue(saleId) : undefined
    return {
      sale_id: saleId ?? '',
      due_id: due?.id ?? '',
      amount: due ? String(dueLeft(due)) : '',
      before_gst: false,
      paid_on: todayIso(),
      payment_mode_id: '',
      reference: '',
      gateway_order_id: '',
      billing_company_id: '',
      verified: true,
      gateway_charge: '',
      tds_amount: '',
      received_by: membership?.id ?? '',
      remark: '',
      note: '',
    }
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof PaymentInput>(k: K, v: PaymentInput[K]) => setF((d) => ({ ...d, [k]: v }))

  const sale = data.sales.find((s) => s.id === f.sale_id)
  const cust = sale ? custById.get(sale.customer_id) : undefined
  const pending = sale?.sale_dues.filter((d) => d.status === 'pending') ?? []
  const mode = data.modes.find((m) => m.id === f.payment_mode_id)
  const needsRef = !!mode && /bank|razorpay|neft|imps|rtgs/i.test(mode.name)
  const raw = Number(f.amount) || 0
  const amount = f.before_gst && sale ? Math.round(raw * (100 + Number(sale.gst_rate))) / 100 : raw
  const settles = amount + (Number(f.tds_amount) || 0)
  const left = sale ? remainingOf(sale) : 0

  function pickSale(id: string | null) {
    const due = id ? firstDue(id) : undefined
    setF((d) => ({ ...d, sale_id: id ?? '', due_id: due?.id ?? '', amount: due ? String(dueLeft(due)) : '' }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!sale) return setError('Pick the sale this payment is for.')
    if (amount <= 0) return setError('Enter the amount received.')
    if (!f.paid_on) return setError('Enter the date it was paid.')
    if (!f.payment_mode_id) return setError('Pick the payment mode.')
    if (needsRef && !f.reference.trim()) return setError(`Enter the UTR / transaction no. for ${mode?.name}.`)
    if (settles > left + 0.009) return setError(`That is more than what is still due (${rupees(left, true)}).`)
    setBusy(true)
    setError(null)
    try {
      await recordPayment(f, Number(sale.gst_rate))
      onSaved(`${rupees(amount, true)} recorded for ${cust?.full_name ?? 'the customer'}.`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={720}
      title={cust ? `Record payment · ${cust.full_name}` : 'Record payment'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button type="submit" form="pay-form" disabled={busy}>
              {busy ? 'Saving…' : 'Save payment'}
            </Button>
          </div>
        </>
      }
    >
      <form id="pay-form" onSubmit={submit} className="stack">
        <div className="form-grid">
          {!saleId && (
            <div className="span-2">
              <Label htmlFor="pay-sale" required>
                Sale
              </Label>
              <SearchSelect
                id="pay-sale"
                value={f.sale_id || null}
                onChange={pickSale}
                placeholder="Search customer or product"
                options={open.map((s) => ({
                  value: s.id,
                  label: `${custById.get(s.customer_id)?.full_name ?? 'Customer'} · ${data.productById.get(s.product_id)?.name ?? 'Product'} · ${rupees(remainingOf(s))} due`,
                }))}
                emptyText="No sales with money still due"
              />
            </div>
          )}
          {sale && (
            <div className="span-2 pay-sale-box">
              <b>{data.productById.get(sale.product_id)?.name}</b>
              <span className="muted small">
                Total {rupees(sale.total_amount, true)} · paid {rupees(sale.paid_amount, true)} · <b className="text-danger">{rupees(left, true)} due</b>
              </span>
            </div>
          )}
          {pending.length > 1 && (
            <div className="span-2">
              <Label htmlFor="pay-due">Paying for</Label>
              <Select
                id="pay-due"
                value={f.due_id}
                onChange={(e) => {
                  const d = pending.find((x) => x.id === e.target.value)
                  setF((x) => ({ ...x, due_id: e.target.value, amount: d ? String(dueLeft(d)) : x.amount }))
                }}
              >
                {pending.map((d) => (
                  <option key={d.id} value={d.id}>
                    {dueLabel(d)} · {rupees(dueLeft(d), true)} · due {fmtDay(d.due_on)}
                  </option>
                ))}
              </Select>
              <Hint>Anything more than this due is applied to the next ones.</Hint>
            </div>
          )}
          <div>
            <Label htmlFor="pay-amt" required>
              Amount (₹)
            </Label>
            <TextInput id="pay-amt" type="number" min={0} step="0.01" value={f.amount} onChange={(e) => set('amount', e.target.value)} />
            {sale && sale.gst_applicable && Number(sale.gst_rate) > 0 && (
              <Checkbox
                id="pay-before"
                checked={f.before_gst}
                onChange={(v) => set('before_gst', v)}
                label={`Amount is before GST (adds ${Number(sale.gst_rate)}%)`}
              />
            )}
            {f.before_gst && <Hint>Recorded as {rupees(amount, true)}</Hint>}
          </div>
          <div>
            <Label htmlFor="pay-on" required>
              Paid on
            </Label>
            <TextInput id="pay-on" type="date" max={todayIso()} value={f.paid_on} onChange={(e) => set('paid_on', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pay-mode" required>
              Mode
            </Label>
            <Select id="pay-mode" value={f.payment_mode_id} onChange={(e) => set('payment_mode_id', e.target.value)}>
              <option value="">— select —</option>
              {data.modes
                .filter((m) => m.is_active)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="pay-ref" required={needsRef}>
              UTR / transaction no.
            </Label>
            <TextInput id="pay-ref" value={f.reference} onChange={(e) => set('reference', e.target.value)} />
            <Hint>Required for bank transfer and Razorpay.</Hint>
          </div>
          <div>
            <Label htmlFor="pay-order">Razorpay / gateway order ID</Label>
            <TextInput id="pay-order" value={f.gateway_order_id} onChange={(e) => set('gateway_order_id', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pay-bc">Billing company</Label>
            <Select id="pay-bc" value={f.billing_company_id} onChange={(e) => set('billing_company_id', e.target.value)}>
              <option value="">{sale ? `Same as the sale (${data.companyName(sale.billing_company_id)})` : 'Same as the sale'}</option>
              {data.companies
                .filter((c) => c.is_active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="pay-charge">Gateway charge (₹)</Label>
            <TextInput id="pay-charge" type="number" min={0} step="0.01" value={f.gateway_charge} onChange={(e) => set('gateway_charge', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pay-tds">TDS deducted by customer (₹)</Label>
            <TextInput id="pay-tds" type="number" min={0} step="0.01" value={f.tds_amount} onChange={(e) => set('tds_amount', e.target.value)} />
            <Hint>Counts towards the balance.</Hint>
          </div>
          <div>
            <Label htmlFor="pay-by">Received by</Label>
            <Select id="pay-by" value={f.received_by} onChange={(e) => set('received_by', e.target.value)}>
              {!data.members.some((m) => m.id === membership?.id) && <option value={membership?.id ?? ''}>Me</option>}
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="pay-status">Status</Label>
            <Select
              id="pay-status"
              value={canVerify && f.verified ? 'verified' : 'pending'}
              disabled={!canVerify}
              onChange={(e) => set('verified', e.target.value === 'verified')}
            >
              <option value="verified">Verified</option>
              <option value="pending">Waiting for verification</option>
            </Select>
            {!canVerify && <Hint>Someone who can verify payments will confirm it.</Hint>}
          </div>
          <div className="span-2">
            <Label htmlFor="pay-remark">Remark</Label>
            <TextInput id="pay-remark" value={f.remark} onChange={(e) => set('remark', e.target.value)} />
          </div>
        </div>
        {sale && (
          <div className="sale-sum">
            <span>
              Settles <b>{rupees(settles, true)}</b>
            </span>
            <span>
              Still due after this <b className={left - settles > 0.009 ? 'text-danger' : 'text-success'}>{rupees(Math.max(0, left - settles), true)}</b>
            </span>
          </div>
        )}
      </form>
    </Modal>
  )
}
