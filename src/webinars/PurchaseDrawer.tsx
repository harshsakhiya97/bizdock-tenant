import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { partState } from '@/bookings/types'
import type { BookingRefs } from '@/bookings/useBookingRefs'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Hint, Label, Select, TextArea, TextInput } from '@/components/Field'
import { money } from '@/leads/labels'
import { useTenant } from '@/tenant/useTenant'
import { savePurchase, type PartDraft, type Purchase } from './api'

const today = () => new Date().toLocaleDateString('en-CA')
let seq = 0
const key = () => `p${++seq}`
const num = (v: string) => Number(String(v).replace(/[,\s₹]/g, '')) || 0
const PART_LABELS = ['Advance', 'Second payment', 'Final payment']

/** A lead's purchase of a product (Masters → Products), entered by hand, paid in parts. The first paid part makes them a customer. */
export function PurchaseDrawer({
  purchase,
  lead,
  refs,
  onClose,
  onSaved,
}: {
  purchase: Purchase | null
  lead: { id: string; name: string; business_id: string }
  refs: BookingRefs
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const { membership, can } = useAuth()
  const canEdit = can('leads', 'edit')
  const products = refs.goods.filter((p) => p.business_id === lead.business_id && (p.is_active || p.id === purchase?.product_id))
  const [f, setF] = useState(() => ({
    product_id: purchase?.product_id ?? '',
    name: purchase?.name ?? '',
    price: purchase ? String(purchase.price) : '',
    gst_applicable: purchase?.gst_applicable ?? false,
    gst_rate: String(purchase?.gst_rate ?? 18),
    purchase_date: purchase?.purchase_date ?? today(),
    notes: purchase?.notes ?? '',
    parts: (purchase?.purchase_payments ?? [])
      .slice()
      .sort((a, b) => (a.due_on ?? a.paid_on ?? '').localeCompare(b.due_on ?? b.paid_on ?? ''))
      .map<PartDraft>((p) => ({ key: p.id, id: p.id, label: p.label ?? 'Payment', due_on: p.due_on ?? p.paid_on ?? '', amount: String(p.amount), mode: p.payment_mode_id ?? '', note: p.note ?? '', status: p.status, paid_on: p.paid_on ?? '' })),
  }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((d) => ({ ...d, [k]: v }))
  const setPart = (k: string, patch: Partial<PartDraft>) => setF((d) => ({ ...d, parts: d.parts.map((p) => (p.key === k ? { ...p, ...patch } : p)) }))

  const price = num(f.price)
  const gst = f.gst_applicable ? Math.round(price * (Number(f.gst_rate) || 0)) / 100 : 0
  const total = price + gst
  const planned = f.parts.reduce((s, p) => s + num(p.amount), 0)
  const paid = f.parts.filter((p) => p.status === 'paid').reduce((s, p) => s + num(p.amount), 0)

  function pickProduct(id: string) {
    const p = products.find((x) => x.id === id)
    setF((d) => (p ? { ...d, product_id: id, name: p.name, price: String(p.price), gst_applicable: p.gst_applicable, gst_rate: String(p.gst_rate) } : { ...d, product_id: '' }))
  }
  function addPart() {
    const left = Math.max(0, Math.round((total - planned) * 100) / 100)
    const used = new Set(f.parts.map((p) => p.label))
    setF((d) => ({
      ...d,
      parts: [...d.parts, { key: key(), label: PART_LABELS.find((l) => !used.has(l)) ?? 'Payment', due_on: today(), amount: left ? String(left) : '', mode: '', note: '', status: 'pending', paid_on: '' }],
    }))
  }

  async function save() {
    if (!f.name.trim()) return setError('Pick the product (or type its name).')
    if (f.price.trim() === '' || price < 0) return setError('Enter the price.')
    if (f.parts.some((p) => !(num(p.amount) > 0))) return setError('Enter an amount for every payment part, or remove it.')
    if (planned > total + 0.01) return setError(`The payment parts add up to ${money(planned)}, more than the total ${money(total)}.`)
    setBusy(true)
    setError(null)
    try {
      await savePurchase(tenant.id, membership?.id, purchase, {
        business_id: lead.business_id,
        lead_id: lead.id,
        product_id: f.product_id,
        name: f.name,
        price,
        gst_applicable: f.gst_applicable,
        gst_rate: Number(f.gst_rate) || 0,
        purchase_date: f.purchase_date || today(),
        notes: f.notes,
        parts: f.parts,
      })
      onSaved(purchase ? 'Purchase saved.' : `${f.name.trim()} added for ${lead.name}.${paid > 0 ? ' They’re a customer now.' : ''}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      width={720}
      onClose={onClose}
      title={purchase ? `Purchase · ${purchase.name}` : 'New purchase'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            {canEdit && (
              <Button onClick={() => void save()} disabled={busy}>
                {busy ? 'Saving…' : purchase ? 'Save purchase' : 'Add purchase'}
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="stack">
        <FormSection title="Purchase" description={`What ${lead.name} bought. No payment gateway: enter it by hand once they pay.`}>
          <div className="form-grid">
            <div>
              <Label htmlFor="pu-product" required>
                Product
              </Label>
              <Select id="pu-product" value={f.product_id} disabled={!canEdit} onChange={(e) => pickProduct(e.target.value)}>
                <option value="">— select —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {money(p.price)}
                  </option>
                ))}
              </Select>
              {!products.length && <Hint>No products yet: add them in Masters → Products.</Hint>}
            </div>
            <div>
              <Label htmlFor="pu-date" required>
                Purchase date
              </Label>
              <TextInput id="pu-date" type="date" value={f.purchase_date} disabled={!canEdit} onChange={(e) => set('purchase_date', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pu-name" required>
                Name on the purchase
              </Label>
              <TextInput id="pu-name" value={f.name} disabled={!canEdit} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pu-price" required>
                Price before GST (₹)
              </Label>
              <TextInput id="pu-price" type="number" min={0} step="0.01" value={f.price} disabled={!canEdit} onChange={(e) => set('price', e.target.value)} />
            </div>
            <div className="span-2 bk-gst">
              <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
                <Checkbox id="pu-gst" checked={f.gst_applicable} onChange={(v) => canEdit && set('gst_applicable', v)} label="Add GST" />
                {f.gst_applicable && <TextInput aria-label="GST %" type="number" min={0} style={{ width: 80 }} value={f.gst_rate} disabled={!canEdit} onChange={(e) => set('gst_rate', e.target.value)} />}
              </div>
              <div className="bk-total">
                <span className="muted small">Price {money(price)} · Total payable</span>
                <b>{price ? money(total) : '—'}</b>
                <span className="muted small">{f.gst_applicable ? `incl. GST ${money(gst)}` : 'No GST'}</span>
              </div>
            </div>
            <div className="span-2">
              <Label htmlFor="pu-notes">Notes</Label>
              <TextArea id="pu-notes" rows={2} value={f.notes} disabled={!canEdit} placeholder="e.g. access given on 5 Nov" onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>
        </FormSection>

        <FormSection title="Payment plan" description="Split the amount into parts; mark each Paid when the money comes in. The first paid part makes the lead a customer.">
          {f.parts.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              {f.parts.map((p) => {
                const st = partState({ status: p.status, due_on: p.due_on || null })
                return (
                  <div key={p.key} className={`bk-part is-${st}`}>
                    <div className="bk-part-row">
                      <label className="bk-cell">
                        <span>Part</span>
                        <TextInput placeholder="e.g. Advance" value={p.label} disabled={!canEdit} onChange={(e) => setPart(p.key, { label: e.target.value })} />
                      </label>
                      <label className="bk-cell">
                        <span>Due date</span>
                        <TextInput type="date" value={p.due_on} disabled={!canEdit} onChange={(e) => setPart(p.key, { due_on: e.target.value })} />
                      </label>
                      <label className="bk-cell">
                        <span>Amount (₹)</span>
                        <TextInput type="number" min={0} value={p.amount} disabled={!canEdit} onChange={(e) => setPart(p.key, { amount: e.target.value })} />
                      </label>
                      <label className="bk-cell">
                        <span>Status</span>
                        <Select
                          className={st === 'overdue' ? 'is-overdue' : undefined}
                          value={p.status}
                          disabled={!canEdit}
                          onChange={(e) => {
                            const v = e.target.value as PartDraft['status']
                            setPart(p.key, v === 'paid' ? { status: v, paid_on: p.paid_on || today(), mode: p.mode || refs.modes[0]?.id || '' } : { status: v, paid_on: '', mode: '' })
                          }}
                        >
                          <option value="pending">{st === 'overdue' ? 'Overdue' : 'Pending'}</option>
                          <option value="paid">Paid</option>
                        </Select>
                      </label>
                      {canEdit ? (
                        <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove part" onClick={() => setF((d) => ({ ...d, parts: d.parts.filter((x) => x.key !== p.key) }))}>
                          <Trash2 size={15} />
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                    {p.status === 'paid' ? (
                      <div className="bk-part-row2">
                        <label className="bk-cell">
                          <span>Received on</span>
                          <TextInput type="date" value={p.paid_on} disabled={!canEdit} onChange={(e) => setPart(p.key, { paid_on: e.target.value })} />
                        </label>
                        <label className="bk-cell">
                          <span>Mode</span>
                          <Select value={p.mode} disabled={!canEdit} onChange={(e) => setPart(p.key, { mode: e.target.value })}>
                            <option value="">—</option>
                            {refs.modes.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label className="bk-cell">
                          <span>Comment</span>
                          <TextInput placeholder="UTR, who paid…" value={p.note} disabled={!canEdit} onChange={(e) => setPart(p.key, { note: e.target.value })} />
                        </label>
                      </div>
                    ) : (
                      <label className="bk-cell">
                        <span>Comment</span>
                        <TextInput placeholder="e.g. after the course starts" value={p.note} disabled={!canEdit} onChange={(e) => setPart(p.key, { note: e.target.value })} />
                      </label>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <div className="row-between">
            {canEdit ? (
              <Button variant="outline" size="sm" onClick={addPart}>
                <Plus /> Add payment part
              </Button>
            ) : (
              <span />
            )}
            <span className="small muted">
              Planned {money(planned)} of {money(total)} · paid <b className="tone-success">{money(paid)}</b> · balance <b>{money(Math.max(0, total - paid))}</b>
              {total - planned > 0.01 && f.parts.length > 0 && <span className="tone-warning"> · {money(total - planned)} not planned yet</span>}
            </span>
          </div>
        </FormSection>
      </div>
    </Drawer>
  )
}
