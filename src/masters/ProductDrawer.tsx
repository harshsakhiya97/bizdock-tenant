import { useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Hint, Label, Select, TextArea, TextInput } from '@/components/Field'
import { money } from '@/leads/labels'
import { useTenant } from '@/tenant/useTenant'
import { saveProduct, type ProductInput } from './api'
import { GST_RATES, type ProductRow } from './types'

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

export function ProductDrawer({
  product,
  businesses,
  defaultBusinessId,
  nextOrder,
  onClose,
  onSaved,
}: {
  product: ProductRow | null
  businesses: { id: string; name: string }[]
  defaultBusinessId: string | null
  nextOrder: number
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const [f, setF] = useState({
    business_id: product?.business_id ?? defaultBusinessId ?? (businesses.length === 1 ? businesses[0].id : ''),
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
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((d) => ({ ...d, [k]: v }))

  const price = Number(f.price) || 0
  const gst = f.gst_applicable ? Math.round(price * Number(f.gst_rate)) / 100 : 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.business_id) return setError('Pick a business.')
    if (!f.name.trim()) return setError('Enter the product name.')
    if (f.price.trim() === '' || Number.isNaN(Number(f.price)) || Number(f.price) < 0) return setError('Enter a valid price.')
    if (!f.lifetime && f.validity_months && Number(f.validity_months) < 1) return setError('Validity must be at least 1 month.')
    setBusy(true)
    setError(null)
    const input: ProductInput = {
      business_id: f.business_id,
      name: f.name.trim(),
      code: f.code.trim() || slug(f.name),
      category: f.category.trim() || null,
      description: f.description.trim() || null,
      price: Number(f.price),
      gst_applicable: f.gst_applicable,
      gst_rate: Number(f.gst_rate),
      lifetime: f.lifetime,
      validity_months: f.lifetime || !f.validity_months ? null : Number(f.validity_months),
      is_active: f.is_active,
      sort_order: Number(f.sort_order) || 0,
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
      title={product ? 'Edit product' : 'Add product'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button type="submit" form="product-form" disabled={busy}>
              {busy ? 'Saving…' : product ? 'Save changes' : 'Add product'}
            </Button>
          </div>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="stack">
        <FormSection title="Product">
          <div className="form-grid">
            <div>
              <Label htmlFor="p-biz" required>
                Business
              </Label>
              <Select id="p-biz" value={f.business_id} onChange={(e) => set('business_id', e.target.value)}>
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
            <div>
              <Label htmlFor="p-code">Code</Label>
              <TextInput id="p-code" placeholder={slug(f.name) || 'auto from the name'} value={f.code} onChange={(e) => set('code', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-cat">Category</Label>
              <TextInput id="p-cat" placeholder="e.g. Course, Package, Service" value={f.category} onChange={(e) => set('category', e.target.value)} />
            </div>
            <div className="span-2">
              <Label htmlFor="p-desc">Description</Label>
              <TextArea id="p-desc" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} />
            </div>
          </div>
        </FormSection>

        <FormSection title="Price & GST" description="The default price; it can be changed on each sale.">
          <div className="form-grid">
            <div>
              <Label htmlFor="p-price" required>
                Price before GST (₹)
              </Label>
              <TextInput id="p-price" type="number" min={0} step="0.01" value={f.price} onChange={(e) => set('price', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-rate">GST rate</Label>
              <Select id="p-rate" value={f.gst_rate} disabled={!f.gst_applicable} onChange={(e) => set('gst_rate', e.target.value)}>
                {GST_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </Select>
            </div>
            <div className="span-2">
              <Checkbox id="p-gst" checked={f.gst_applicable} onChange={(v) => set('gst_applicable', v)} label="GST applicable" />
              <Hint>
                {money(price)} + GST {money(gst)} = <b>{money(price + gst)}</b>
              </Hint>
            </div>
          </div>
        </FormSection>

        <FormSection title="Validity" description="How long a customer keeps access after buying.">
          <div className="form-grid">
            <div>
              <Label htmlFor="p-months">Valid for (months)</Label>
              <TextInput
                id="p-months"
                type="number"
                min={1}
                placeholder="Leave empty if it doesn’t expire"
                value={f.lifetime ? '' : f.validity_months}
                disabled={f.lifetime}
                onChange={(e) => set('validity_months', e.target.value)}
              />
            </div>
            <div className="field-center">
              <Checkbox id="p-life" checked={f.lifetime} onChange={(v) => set('lifetime', v)} label="Lifetime access" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Listing">
          <div className="form-grid">
            <div>
              <Label htmlFor="p-order">Order</Label>
              <TextInput id="p-order" type="number" value={f.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
            </div>
            <div className="field-center">
              <Checkbox
                id="p-active"
                checked={f.is_active}
                onChange={(v) => set('is_active', v)}
                label="Active"
                description="Inactive products can’t be picked on a new sale."
              />
            </div>
          </div>
        </FormSection>
      </form>
    </Drawer>
  )
}
