import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Archive, Ban, Plus } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection, Label, Select, TextArea, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { cn } from '@/lib/cn'
import { cancelSale, listPayments, updateCustomer } from './api'
import { fmtDay, planOf, remainingOf, rupees } from './labels'
import type { CustomerRow, PaymentRow, SaleRow } from './types'
import type { SalesData } from './useSalesData'

/** One customer: details, journey stage, owner, and every product they bought with its dues and payments. */
export function CustomerDrawer({
  customer,
  data,
  onClose,
  onNewSale,
  onSaved,
}: {
  customer: CustomerRow
  data: SalesData
  onClose: () => void
  onNewSale: () => void
  onSaved: (msg: string, close?: boolean) => void
}) {
  const { can, businesses } = useAuth()
  const canEdit = can('customers', 'edit')
  const [f, setF] = useState({
    full_name: customer.full_name,
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    city: customer.city ?? '',
    stage_id: customer.stage_id ?? '',
    owner_id: customer.owner_id ?? '',
    notes: customer.notes ?? '',
  })
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [cancelling, setCancelling] = useState<SaleRow | null>(null)
  const [reason, setReason] = useState('')
  const [archiving, setArchiving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((d) => ({ ...d, [k]: v }))

  const sales = data.salesByCustomer.get(customer.id) ?? []
  const saleIds = sales.map((s) => s.id).join(',')
  useEffect(() => {
    void listPayments(saleIds ? saleIds.split(',') : []).then(setPayments)
  }, [saleIds])

  const active = sales.filter((s) => s.status === 'active')
  const lifetime = active.reduce((a, s) => a + Number(s.total_amount), 0)
  const paid = active.reduce((a, s) => a + Number(s.paid_amount), 0)
  const remaining = active.reduce((a, s) => a + remainingOf(s), 0)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!f.full_name.trim()) return setError('A name is required.')
    setBusy(true)
    setError(null)
    try {
      await updateCustomer(customer.id, {
        full_name: f.full_name.trim(),
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        city: f.city.trim() || null,
        stage_id: f.stage_id || null,
        owner_id: f.owner_id || null,
        notes: f.notes.trim() || null,
      })
      onSaved(`${f.full_name.trim()} saved.`, true)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  async function doCancel() {
    if (!cancelling || !reason.trim()) return
    setBusy(true)
    try {
      await cancelSale(cancelling.id, reason)
      setCancelling(null)
      setReason('')
      onSaved('Sale cancelled. Its pending dues were cancelled too.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function doArchive() {
    setBusy(true)
    try {
      await updateCustomer(customer.id, { is_archived: !customer.is_archived, archived_at: customer.is_archived ? null : new Date().toISOString() } as Partial<CustomerRow>)
      onSaved(customer.is_archived ? `${customer.full_name} restored.` : `${customer.full_name} deleted. You can restore them from “Deleted”.`, true)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      width={760}
      onClose={onClose}
      title={customer.full_name}
      footer={
        <>
          <div className="row">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {canEdit && (
              <Button variant="ghost" onClick={() => setArchiving(true)}>
                <Archive size={15} /> {customer.is_archived ? 'Restore' : 'Delete'}
              </Button>
            )}
          </div>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            {canEdit && (
              <Button type="submit" form="cust-form" disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="stack">
        <div className="mini-stats">
          <div>
            <small>Lifetime value</small>
            <b>{rupees(lifetime)}</b>
          </div>
          <div>
            <small>Paid</small>
            <b className="text-success">{rupees(paid)}</b>
          </div>
          <div>
            <small>Remaining</small>
            <b className={remaining > 0 ? 'text-danger' : undefined}>{rupees(remaining)}</b>
          </div>
          <div>
            <small>Customer since</small>
            <b>{fmtDay(customer.created_at)}</b>
          </div>
        </div>

        <form id="cust-form" onSubmit={save} className="stack">
          <FormSection title="Customer">
            <div className="form-grid">
              <div>
                <Label htmlFor="c-name" required>
                  Full name
                </Label>
                <TextInput id="c-name" value={f.full_name} disabled={!canEdit} onChange={(e) => set('full_name', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="c-phone">Phone</Label>
                <TextInput id="c-phone" value={f.phone} disabled={!canEdit} onChange={(e) => set('phone', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="c-email">Email</Label>
                <TextInput id="c-email" value={f.email} disabled={!canEdit} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="c-city">City</Label>
                <TextInput id="c-city" value={f.city} disabled={!canEdit} onChange={(e) => set('city', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="c-stage">Journey stage</Label>
                <Select id="c-stage" value={f.stage_id} disabled={!canEdit} onChange={(e) => set('stage_id', e.target.value)}>
                  <option value="">—</option>
                  {data.stages
                    .filter((s) => s.is_active || s.id === customer.stage_id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="c-owner">Owner</Label>
                <Select id="c-owner" value={f.owner_id} disabled={!canEdit} onChange={(e) => set('owner_id', e.target.value)}>
                  <option value="">Unassigned</option>
                  {data.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="span-2">
                <Label htmlFor="c-notes">Notes</Label>
                <TextArea id="c-notes" rows={2} value={f.notes} disabled={!canEdit} onChange={(e) => set('notes', e.target.value)} />
              </div>
            </div>
            <p className="muted small">
              {businesses.find((b) => b.id === customer.business_id)?.name}
              {customer.lead_id && (
                <>
                  {' · '}
                  <Link to={`/leads?open=${customer.lead_id}`}>Open the lead</Link>
                </>
              )}
            </p>
          </FormSection>
        </form>

        <section className="form-section">
          <div className="form-section-head row-between">
            <h4>Products bought ({sales.length})</h4>
            {can('deals', 'add') && !customer.is_archived && (
              <Button size="sm" onClick={onNewSale}>
                <Plus size={14} /> New sale
              </Button>
            )}
          </div>
          {sales.length === 0 ? (
            <p className="muted small">No sales yet.</p>
          ) : (
            <div className="stack">
              {sales.map((s) => {
                const plan = planOf(s.plan)
                const p = data.productById.get(s.product_id)
                const sp = payments.filter((x) => x.sale_id === s.id && x.status === 'received')
                return (
                  <article key={s.id} className={cn('sale-card', s.status === 'cancelled' && 'is-cancelled')}>
                    <div className="row-between">
                      <div>
                        <b>
                          {p?.name ?? 'Product'}
                          {s.quantity > 1 ? ` × ${s.quantity}` : ''}
                        </b>{' '}
                        <span className={cn('badge', plan.tone)}>{plan.short}</span>
                        {s.status === 'cancelled' && <span className="badge badge-danger">Cancelled</span>}
                        <div className="muted small">
                          {fmtDay(s.sale_date)} · {data.companyName(s.billing_company_id)} · by {data.memberName(s.sales_person_id) ?? '—'}
                          {s.valid_until ? ` · valid until ${fmtDay(s.valid_until)}` : p?.lifetime ? ' · lifetime' : ''}
                        </div>
                      </div>
                      {can('deals', 'edit') && s.status === 'active' && (
                        <Button variant="ghost" size="sm" onClick={() => setCancelling(s)}>
                          <Ban size={14} /> Cancel sale
                        </Button>
                      )}
                    </div>
                    <div className="sale-figures">
                      <span>
                        Total <b>{rupees(s.total_amount, true)}</b>
                        <small>GST {rupees(s.gst_amount, true)}</small>
                      </span>
                      <span>
                        Paid <b className="text-success">{rupees(s.paid_amount, true)}</b>
                      </span>
                      <span>
                        Remaining <b className={remainingOf(s) > 0 ? 'text-danger' : undefined}>{rupees(remainingOf(s), true)}</b>
                      </span>
                    </div>
                    {s.sale_dues.length > 0 && (
                      <table className="table table-compact">
                        <thead>
                          <tr>
                            <th>Due</th>
                            <th>On</th>
                            <th className="right">Amount</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.sale_dues.map((d) => {
                            const late = d.status === 'pending' && d.due_on < new Date().toISOString().slice(0, 10)
                            return (
                              <tr key={d.id}>
                                <td>{d.kind === 'emi' ? `EMI ${d.seq}` : 'Balance'}</td>
                                <td className={late ? 'text-danger' : undefined}>{fmtDay(d.due_on)}</td>
                                <td className="right">{rupees(d.amount, true)}</td>
                                <td>
                                  <span className={cn('badge', d.status === 'paid' ? 'badge-success' : d.status === 'cancelled' ? 'badge-muted' : late ? 'badge-danger' : 'badge-warning')}>
                                    {d.status === 'pending' ? (late ? 'Overdue' : 'Pending') : d.status === 'paid' ? 'Paid' : 'Cancelled'}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                    {sp.length > 0 && (
                      <div className="muted small">
                        Payments:{' '}
                        {sp.map((x) => `${rupees(x.amount, true)} on ${fmtDay(x.paid_on)}${data.modeName(x.payment_mode_id) ? ` (${data.modeName(x.payment_mode_id)})` : ''}${x.note ? ` · ${x.note}` : ''}`).join('; ')}
                      </div>
                    )}
                    {s.status === 'cancelled' && s.cancel_reason && <div className="muted small">Reason: {s.cancel_reason}</div>}
                    {s.notes && <div className="muted small">Note: {s.notes}</div>}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Cancel this sale?"
        width={460}
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelling(null)}>
              Keep it
            </Button>
            <Button variant="danger" disabled={!reason.trim() || busy} onClick={doCancel}>
              Cancel sale
            </Button>
          </>
        }
      >
        <p className="muted">Its pending dues are cancelled. Payments already received stay recorded.</p>
        <Label htmlFor="cancel-reason" required>
          Reason
        </Label>
        <TextInput id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Modal>

      <Modal
        open={archiving}
        onClose={() => setArchiving(false)}
        title={customer.is_archived ? 'Restore this customer?' : 'Delete this customer?'}
        width={440}
        footer={
          <>
            <Button variant="outline" onClick={() => setArchiving(false)}>
              Cancel
            </Button>
            <Button variant={customer.is_archived ? 'primary' : 'danger'} disabled={busy} onClick={doArchive}>
              {customer.is_archived ? 'Restore' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="muted">
          {customer.is_archived
            ? 'They come back to the customer list.'
            : 'They leave the customer list but nothing is lost: their sales and payments stay, and you can restore them any time.'}
        </p>
      </Modal>
    </Drawer>
  )
}
