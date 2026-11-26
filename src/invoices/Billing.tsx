import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { FormSection, Hint, Label, TextArea, TextInput } from '@/components/Field'
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
/** GST state codes (the first 2 digits of a GSTIN) → state */
const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh', '24': 'Gujarat', '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
  '28': 'Andhra Pradesh (old)', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction',
}
/** the state and its code, from a GSTIN's first 2 digits (null: not a known code) */
export const stateOfGstin = (gstin: string) => {
  const code = gstin.trim().slice(0, 2)
  return /^\d{2}$/.test(code) && GST_STATES[code] ? { state: GST_STATES[code], state_code: code } : null
}

export function buyerError(b: Buyer) {
  if (b.gstin.trim() && b.gstin.trim().length !== 15) return 'GSTIN should be 15 characters.'
  if (b.gstin.trim() && !stateOfGstin(b.gstin)) return 'GSTIN should start with the 2-digit state code, e.g. 27 for Maharashtra.'
  return null
}

/** the Bill to fields: company name, address and (with GST) the GSTIN — its first 2 digits give the state and state code */
export function BuyerFields({ id, value, onChange, disabled, gst = true }: { id: string; value: Buyer; onChange: (b: Buyer) => void; disabled?: boolean; gst?: boolean }) {
  const set = (k: keyof Buyer) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value })
  const st = stateOfGstin(value.gstin)
  return (
    <div className="form-grid">
      <div className="span-2">
        <Label htmlFor={`${id}-co`}>Company name</Label>
        <TextInput id={`${id}-co`} placeholder="e.g. Exlytics Private Limited" value={value.company} onChange={set('company')} disabled={disabled} />
      </div>
      <div className="span-2">
        <Label htmlFor={`${id}-addr`}>Address</Label>
        <TextArea id={`${id}-addr`} rows={3} value={value.address} onChange={set('address')} disabled={disabled} />
      </div>
      {gst && (
        <div className="span-2">
          <Label htmlFor={`${id}-gst`}>GST No.</Label>
          <TextInput
            id={`${id}-gst`}
            className="input-upper"
            placeholder="19AAECE5361R1ZY"
            maxLength={15}
            value={value.gstin}
            onChange={(e) => {
              const gstin = e.target.value.toUpperCase().replace(/\s/g, '')
              const s2 = stateOfGstin(gstin)
              onChange({ ...value, gstin, state: s2?.state ?? '', state_code: s2?.state_code ?? '' })
            }}
            disabled={disabled}
          />
          {st && (
            <Hint>
              State: {st.state} · Code {st.state_code}
            </Hint>
          )}
        </div>
      )}
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
