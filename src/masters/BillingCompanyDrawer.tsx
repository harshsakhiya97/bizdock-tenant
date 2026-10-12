import { useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Hint, Label, TextArea, TextInput } from '@/components/Field'
import { useTenant } from '@/tenant/useTenant'
import { saveBillingCompany, type BillingCompanyInput } from './api'
import type { BillingCompanyRow } from './types'

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

export function BillingCompanyDrawer({
  company,
  nextOrder,
  onClose,
  onSaved,
}: {
  company: BillingCompanyRow | null
  nextOrder: number
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const [f, setF] = useState({
    name: company?.name ?? '',
    legal_name: company?.legal_name ?? '',
    gst_number: company?.gst_number ?? '',
    address: company?.address ?? '',
    state: company?.state ?? '',
    invoice_prefix: company?.invoice_prefix ?? '',
    is_active: company?.is_active ?? true,
    sort_order: String(company?.sort_order ?? nextOrder),
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((d) => ({ ...d, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.name.trim()) return setError('Enter a short name.')
    const gst = f.gst_number.trim().toUpperCase()
    if (gst && !GSTIN.test(gst)) return setError('That GSTIN doesn’t look right (15 characters, e.g. 24ABCDE1234F1Z5).')
    setBusy(true)
    setError(null)
    const input: BillingCompanyInput = {
      name: f.name.trim(),
      legal_name: f.legal_name.trim() || null,
      gst_number: gst || null,
      address: f.address.trim() || null,
      state: f.state.trim() || null,
      invoice_prefix: f.invoice_prefix.trim().toUpperCase() || null,
      is_active: f.is_active,
      sort_order: Number(f.sort_order) || 0,
    }
    try {
      await saveBillingCompany(tenant.id, company?.id ?? null, input)
      onSaved(`${input.name} ${company ? 'saved' : 'added'}.`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      width={600}
      onClose={onClose}
      title={company ? 'Edit billing company' : 'Add billing company'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button type="submit" form="bc-form" disabled={busy}>
              {busy ? 'Saving…' : company ? 'Save changes' : 'Add company'}
            </Button>
          </div>
        </>
      }
    >
      <form id="bc-form" onSubmit={submit} className="stack">
        <FormSection title="Company" description="The legal entity that bills the customer. Each sale picks one.">
          <div className="form-grid">
            <div>
              <Label htmlFor="bc-name" required>
                Short name
              </Label>
              <TextInput id="bc-name" placeholder="e.g. Viral Studios" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus={!company} />
            </div>
            <div>
              <Label htmlFor="bc-legal">Legal name</Label>
              <TextInput id="bc-legal" placeholder="As on the GST certificate" value={f.legal_name} onChange={(e) => set('legal_name', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bc-gst">GSTIN</Label>
              <TextInput id="bc-gst" maxLength={15} value={f.gst_number} onChange={(e) => set('gst_number', e.target.value.toUpperCase())} />
            </div>
            <div>
              <Label htmlFor="bc-state">State</Label>
              <TextInput id="bc-state" value={f.state} onChange={(e) => set('state', e.target.value)} />
            </div>
            <div className="span-2">
              <Label htmlFor="bc-address">Address</Label>
              <TextArea id="bc-address" rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bc-prefix">Invoice prefix</Label>
              <TextInput id="bc-prefix" placeholder="e.g. VS" maxLength={8} value={f.invoice_prefix} onChange={(e) => set('invoice_prefix', e.target.value)} />
              <Hint>Used for invoice numbers later (VS-0001).</Hint>
            </div>
            <div>
              <Label htmlFor="bc-order">Order</Label>
              <TextInput id="bc-order" type="number" value={f.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
            </div>
            <div className="span-2">
              <Checkbox id="bc-active" checked={f.is_active} onChange={(v) => set('is_active', v)} label="Active" description="Inactive companies can’t be picked on a new sale." />
            </div>
          </div>
        </FormSection>
      </form>
    </Drawer>
  )
}
