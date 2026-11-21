import { useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Hint, Label, Select, TextArea, TextInput } from '@/components/Field'
import { money } from '@/leads/labels'
import { useTenant } from '@/tenant/useTenant'
import { useTerm } from '@/tenant/useTerm'
import { SubBusinessSelect } from '@/business/SubBusinessSelect'
import { saveProduct, type ProductInput } from './api'
import type { ProductRow } from './types'

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

export function ProductDrawer({
  product,
  kind = 'service',
  businesses,
  defaultBusinessId,
  nextOrder,
  onClose,
  onSaved,
}: {
  product: ProductRow | null
  /** a service (bookings) or a product (bought by webinar leads) */
  kind?: ProductRow['kind']
  businesses: { id: string; name: string }[]
  defaultBusinessId: string | null
  nextOrder: number
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const [f, setF] = useState({
    business_id: product?.business_id ?? defaultBusinessId ?? (businesses.length === 1 ? businesses[0].id : ''),
    sub_business_id: product?.sub_business_id ?? '',
    name: product?.name ?? '',
    code: product?.code ?? '',
    category: product?.category ?? '',
    description: product?.description ?? '',
    price: product ? String(product.price) : '',
    gst_applicable: product?.gst_applicable ?? true,
    gst_rate: String(product?.gst_rate ?? 18),
    lifetime: product?.lifetime ?? false,
    validity_months: product?.validity_months ? String(product.validity_months) : '',
    is_active: product?.is_active ?? true,
    sort_order: String(product?.sort_order ?? nextOrder),
    gst_name: product?.gst_name ?? '',
    hsn_code: product?.hsn_code ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((d) => ({ ...d, [k]: v }))

  const term = useTerm()
  const isProduct = (product?.kind ?? kind) === 'product'
  const word = isProduct ? term('product') : 'service'
  const Word = isProduct ? term('Product') : 'Service'
  const price = Number(f.price) || 0
  const gst = f.gst_applicable ? Math.round(price * Number(f.gst_rate)) / 100 : 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.business_id) return setError('Pick a business.')
    if (!f.name.trim()) return setError(`Enter the ${word} name.`)
    if (f.price.trim() === '' || Number.isNaN(Number(f.price)) || Number(f.price) < 0) return setError('Enter a valid price.')
    const rate = Number(f.gst_rate)
    if (f.gst_applicable && (f.gst_rate.trim() === '' || Number.isNaN(rate) || rate < 0 || rate > 100)) return setError('Enter a GST rate between 0 and 100.')
    setBusy(true)
    setError(null)
    const input: ProductInput = {
      business_id: f.business_id,
      sub_business_id: f.sub_business_id || null,
      name: f.name.trim(),
      // code and category are no longer asked; an existing product keeps its own
      code: f.code.trim() || slug(f.name),
      category: f.category.trim() || null,
      description: f.description.trim() || null,
      price: Number(f.price),
      gst_applicable: f.gst_applicable,
      gst_rate: f.gst_applicable ? rate : Number(product?.gst_rate ?? 18),
      lifetime: f.lifetime,
      validity_months: f.lifetime || !f.validity_months ? null : Number(f.validity_months),
      is_active: f.is_active,
      sort_order: Number(f.sort_order) || 0,
      kind: product?.kind ?? kind,
      gst_name: f.gst_name.trim() || null,
      hsn_code: f.hsn_code.trim() || null,
    }
    try {
      await saveProduct(tenant.id, product?.id ?? null, input)
      onSaved(`${input.name} ${product ? 'saved' : 'added'}.`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      width={640}
      onClose={onClose}
      title={product ? `Edit ${word}` : `Add ${word}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button type="submit" form="product-form" disabled={busy}>
              {busy ? 'Saving…' : product ? 'Save changes' : `Add ${word}`}
            </Button>
          </div>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="stack">
        <FormSection title={Word}>
          <div className="form-grid">
            <div>
              <Label htmlFor="p-biz" required>
                Business
              </Label>
              <Select id="p-biz" value={f.business_id} onChange={(e) => setF((d) => ({ ...d, business_id: e.target.value, sub_business_id: '' }))}>
                <option value="">— select —</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="p-name" required>
                Name
              </Label>
              <TextInput id="p-name" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus={!product} />
            </div>
            <SubBusinessSelect id="p-sub" businessId={f.business_id} value={f.sub_business_id} onChange={(v) => set('sub_business_id', v)} />
            {isProduct && (
              <div>
                <Label htmlFor="p-order">Order in the ladder</Label>
                <TextInput id="p-order" type="number" min={0} value={f.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
                <Hint>1 = the first {word} people buy, then 2, 3… Upsell follows this order.</Hint>
              </div>
            )}
            <div className="span-2">
              <Label htmlFor="p-desc">Description</Label>
              <TextArea id="p-desc" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} />
            </div>
          </div>
        </FormSection>

        <FormSection title="Price & GST" description={isProduct ? 'The default price; it can be changed on each purchase.' : 'The default price; it can be changed on each booking.'}>
          <div className="form-grid">
            <div>
              <Label htmlFor="p-price" required>
                Price before GST (₹)
              </Label>
              <TextInput id="p-price" type="number" min={0} step="0.01" value={f.price} onChange={(e) => set('price', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-rate">GST rate (%)</Label>
              <TextInput id="p-rate" type="number" min={0} max={100} step="0.01" value={f.gst_rate} disabled={!f.gst_applicable} onChange={(e) => set('gst_rate', e.target.value)} />
            </div>
            <div className="span-2">
              <Checkbox id="p-gst" checked={f.gst_applicable} onChange={(v) => set('gst_applicable', v)} label="GST applicable" />
              <Hint>
                {money(price)} + GST {money(gst)} = <b>{money(price + gst)}</b>
              </Hint>
            </div>
          </div>
        </FormSection>

        <FormSection title="On a GST invoice" description="Optional: the name and HSN / SAC code printed on GST invoices (else the name above).">
          <div className="form-grid">
            <div>
              <Label htmlFor="p-gstname">Name on GST bill</Label>
              <TextInput id="p-gstname" placeholder="e.g. Consultancy Fees" value={f.gst_name} onChange={(e) => set('gst_name', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-hsn">HSN / SAC code</Label>
              <TextInput id="p-hsn" placeholder="e.g. 999293" value={f.hsn_code} onChange={(e) => set('hsn_code', e.target.value)} />
            </div>
          </div>
        </FormSection>

        <div className="check-box">
          <Checkbox id="p-active" checked={f.is_active} onChange={(v) => set('is_active', v)} label="Active" description={isProduct ? `Inactive ${term('products')} can’t be picked on a new purchase.` : 'Inactive services can’t be picked on a new booking.'} />
        </div>
      </form>
    </Drawer>
  )
}
