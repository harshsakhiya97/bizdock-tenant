import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection, Label, TextArea, TextInput } from '@/components/Field'
import { updateLeads } from '@/leads/api'

/** a client's billing details (Bill to), all optional */
export type Buyer = { company: string; address: string; state: string; state_code: string; gstin: string }
export const emptyBuyer: Buyer = { company: '', address: '', state: '', state_code: '', gstin: '' }
export const buyerOfLead = (l: { bill_company?: string | null; bill_address?: string | null; bill_state?: string | null; bill_state_code?: string | null; bill_gstin?: string | null } | null | undefined): Buyer => ({
  company: l?.bill_company ?? '',
  address: l?.bill_address ?? '',
  state: l?.bill_state ?? '',
  state_code: l?.bill_state_code ?? '',
  gstin: l?.bill_gstin ?? '',
})
export const buyerOfJson = (b: Record<string, unknown> | null | undefined): Buyer => ({
  company: String(b?.company ?? ''),
  address: String(b?.address ?? ''),
  state: String(b?.state ?? ''),
  state_code: String(b?.state_code ?? ''),
  gstin: String(b?.gstin ?? ''),
})
export function buyerError(b: Buyer) {
  if (b.state_code.trim() && !/^\d{1,2}$/.test(b.state_code.trim())) return 'State code is a number, e.g. 27 for Maharashtra.'
  if (b.gstin.trim() && b.gstin.trim().length !== 15) return 'GSTIN should be 15 characters.'
  return null
}

/** the Bill to fields */
export function BuyerFields({ id, value, onChange, disabled }: { id: string; value: Buyer; onChange: (b: Buyer) => void; disabled?: boolean }) {
  const set = (k: keyof Buyer) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value })
  return (
    <div className="form-grid">
      <div className="span-2">
        <Label htmlFor={`${id}-co`}>Company name</Label>
        <TextInput id={`${id}-co`} placeholder="e.g. Exlytics Private Limited" value={value.company} onChange={set('company')} disabled={disabled} />
      </div>
      <div className="span-2">
        <Label htmlFor={`${id}-addr`}>Address</Label>
        <TextArea id={`${id}-addr`} rows={2} value={value.address} onChange={set('address')} disabled={disabled} />
      </div>
      <div>
        <Label htmlFor={`${id}-st`}>State</Label>
        <TextInput id={`${id}-st`} placeholder="West Bengal" value={value.state} onChange={set('state')} disabled={disabled} />
      </div>
      <div>
        <Label htmlFor={`${id}-sc`}>State code</Label>
        <TextInput id={`${id}-sc`} placeholder="19" value={value.state_code} onChange={set('state_code')} disabled={disabled} />
      </div>
      <div className="span-2">
        <Label htmlFor={`${id}-gst`}>GSTIN</Label>
        <TextInput id={`${id}-gst`} className="input-upper" placeholder="19AAECE5361R1ZY" value={value.gstin} onChange={set('gstin')} disabled={disabled} />
      </div>
    </div>
  )
}

/** Lead / customer → Details: the client's billing details, with Edit */
export function BillingCard({
  lead,
  canEdit,
  onSaved,
  bare,
}: {
  /** inside the lead page's Billing details section: no heading of its own */
  bare?: boolean
  lead: { id: string; bill_company?: string | null; bill_address?: string | null; bill_state?: string | null; bill_state_code?: string | null; bill_gstin?: string | null }
  canEdit: boolean
  onSaved: (b: Buyer) => void
}) {
  const b = buyerOfLead(lead)
  const [open, setOpen] = useState(false)
  const any = Object.values(b).some((v) => v.trim())
  return (
    <div>
      <div className="row-between">
        {bare ? <span className="muted small">Used on invoices.</span> : <span className="field-label">Billing details (for invoices)</span>}
        {canEdit && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
            <Pencil size={13} /> Edit
          </button>
        )}
      </div>
      {any ? (
        <dl className="info-grid">
          <div>
            <dt>Company</dt>
            <dd>{b.company || '—'}</dd>
          </div>
          <div>
            <dt>GSTIN</dt>
            <dd>{b.gstin || '—'}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>{b.state ? `${b.state}${b.state_code ? `, Code: ${b.state_code}` : ''}` : '—'}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd style={{ whiteSpace: 'pre-line' }}>{b.address || '—'}</dd>
          </div>
        </dl>
      ) : (
        <div className="muted small">Not added yet. They’re asked for when an invoice is generated, or add them here.</div>
      )}
      {open && (
        <BillingDrawer
          leadId={lead.id}
          value={b}
          onClose={() => setOpen(false)}
          onSaved={(v) => {
            setOpen(false)
            onSaved(v)
          }}
        />
      )}
    </div>
  )
}

function BillingDrawer({ leadId, value, onClose, onSaved }: { leadId: string; value: Buyer; onClose: () => void; onSaved: (b: Buyer) => void }) {
  const [b, setB] = useState<Buyer>(value)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    const err = buyerError(b)
    if (err) return setError(err)
    setBusy(true)
    const t = (v: string) => v.trim() || null
    try {
      await updateLeads([leadId], { bill_company: t(b.company), bill_address: t(b.address), bill_state: t(b.state), bill_state_code: t(b.state_code), bill_gstin: t(b.gstin.toUpperCase()) })
      onSaved({ ...b, gstin: b.gstin.trim().toUpperCase() })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      width={560}
      title="Billing details"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </>
      }
    >
      <FormSection title="Bill to" description="Printed on this client’s invoices. All optional.">
        <BuyerFields id="lb" value={b} onChange={setB} />
      </FormSection>
    </Drawer>
  )
}
