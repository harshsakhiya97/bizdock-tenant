import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Building2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, FormSection, Hint, Label, TextArea, TextInput } from '@/components/Field'
import { Empty, Paged } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { listBillingCompanies, saveBillingCompany, type BillingCompanyInput } from './api'
import { formatInvoiceNo, type BillingCompanyRow } from './types'

/** Masters → Company Master: who an invoice is from — address, GST, CIN, PAN, bank details and the invoice number series. */
export function CompaniesTab({ canEdit, onNotice }: { canEdit: boolean; onNotice: (n: { ok?: string; error?: string }) => void }) {
  const tenant = useTenant()
  const [rows, setRows] = useState<BillingCompanyRow[] | null>(null)
  const [open, setOpen] = useState<{ c: BillingCompanyRow | null } | null>(null)
  const load = useCallback(() => {
    listBillingCompanies(tenant.id).then(setRows, (e: Error) => onNotice({ error: e.message }))
  }, [tenant.id, onNotice])
  useEffect(load, [load])

  return (
    <>
      <div className="panel-bar">
        <div>
          <b>Company Master</b>
          <div className="muted small">The companies invoices are issued from: address, GSTIN, state, CIN, PAN, bank details and their own invoice numbers. Pick them on each business (Businesses → edit).</div>
        </div>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => setOpen({ c: null })}>
            <Plus size={16} /> Add company
          </button>
        )}
      </div>
      {!rows ? (
        <div className="empty">Loading…</div>
      ) : rows.length === 0 ? (
        <Empty icon={Building2}>No companies yet. Add the company your invoices are issued from.</Empty>
      ) : (
        <Paged rows={rows}>
          {(paged) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>GSTIN</th>
                    <th>State</th>
                    <th>Bank</th>
                    <th>Next invoice no.</th>
                    <th>Status</th>
                    {canEdit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((c) => (
                    <tr key={c.id} className={canEdit ? 'is-clickable' : undefined} onClick={() => canEdit && setOpen({ c })}>
                      <td>
                        <b>{c.legal_name || c.name}</b>
                        {c.legal_name && c.legal_name !== c.name && <div className="muted small">{c.name}</div>}
                      </td>
                      <td className="nowrap">{c.gst_number || <span className="muted">—</span>}</td>
                      <td className="nowrap">{c.state ? `${c.state}${c.state_code ? ` (${c.state_code})` : ''}` : <span className="muted">—</span>}</td>
                      <td className="nowrap">{c.bank_name ? `${c.bank_name}${c.bank_account ? ` · ${c.bank_account.slice(-4).padStart(c.bank_account.length > 4 ? 6 : 4, '•')}` : ''}` : <span className="muted">—</span>}</td>
                      <td className="nowrap">
                        <b>{formatInvoiceNo(c.number_format, c.invoice_prefix, c.next_no)}</b>
                      </td>
                      <td>
                        <span className={cn('badge', c.is_active ? 'badge-success' : 'badge-muted')}>{c.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      {canEdit && (
                        <td className="right">
                          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Edit ${c.name}`}>
                            <Pencil size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Paged>
      )}
      {open && (
        <CompanyDrawer
          company={open.c}
          nextOrder={Math.max(0, ...(rows ?? []).map((r) => r.sort_order)) + 1}
          onClose={() => setOpen(null)}
          onSaved={(msg) => {
            setOpen(null)
            onNotice({ ok: msg })
            load()
          }}
        />
      )}
    </>
  )
}

function CompanyDrawer({ company, nextOrder, onClose, onSaved }: { company: BillingCompanyRow | null; nextOrder: number; onClose: () => void; onSaved: (msg: string) => void }) {
  const tenant = useTenant()
  const c = company
  const [f, setF] = useState({
    name: c?.name ?? '',
    legal_name: c?.legal_name ?? '',
    address: c?.address ?? '',
    email: c?.email ?? '',
    gst_number: c?.gst_number ?? '',
    state: c?.state ?? '',
    state_code: c?.state_code ?? '',
    cin: c?.cin ?? '',
    pan: c?.pan ?? '',
    bank_holder: c?.bank_holder ?? '',
    bank_name: c?.bank_name ?? '',
    bank_account: c?.bank_account ?? '',
    bank_branch: c?.bank_branch ?? '',
    bank_ifsc: c?.bank_ifsc ?? '',
    invoice_prefix: c?.invoice_prefix ?? '',
    number_format: c?.number_format ?? '{N}',
    next_no: String(c?.next_no ?? 1),
    is_active: c?.is_active ?? true,
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((d) => ({ ...d, [k]: v }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const next = Math.max(1, Math.floor(Number(f.next_no) || 0))
  const t = (v: string) => v.trim() || null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.name.trim()) return setError('Enter the company name.')
    if (!(Number(f.next_no) >= 1)) return setError('The next invoice number must be 1 or more.')
    if (f.state_code.trim() && !/^\d{1,2}$/.test(f.state_code.trim())) return setError('State code is a number, e.g. 27 for Maharashtra.')
    setBusy(true)
    setError(null)
    const input: BillingCompanyInput = {
      name: f.name.trim(),
      legal_name: t(f.legal_name),
      address: t(f.address),
      email: t(f.email),
      gst_number: t(f.gst_number.toUpperCase()),
      state: t(f.state),
      state_code: t(f.state_code),
      cin: t(f.cin.toUpperCase()),
      pan: t(f.pan.toUpperCase()),
      bank_holder: t(f.bank_holder),
      bank_name: t(f.bank_name),
      bank_account: t(f.bank_account),
      bank_branch: t(f.bank_branch),
      bank_ifsc: t(f.bank_ifsc.toUpperCase()),
      invoice_prefix: t(f.invoice_prefix),
      number_format: f.number_format.trim() || '{N}',
      next_no: next,
      is_active: f.is_active,
      sort_order: c?.sort_order ?? nextOrder,
    }
    try {
      await saveBillingCompany(tenant.id, c?.id ?? null, input)
      onSaved(c ? `${input.name} updated.` : `${input.name} added.`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={680}
      title={c ? `Company · ${c.name}` : 'New company'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button type="submit" form="company-form" disabled={busy}>
              {busy ? 'Saving…' : 'Save company'}
            </Button>
          </div>
        </>
      }
    >
      <form id="company-form" className="stack" onSubmit={submit}>
        <FormSection title="Company">
          <div className="form-grid">
            <div>
              <Label htmlFor="co-name" required>
                Short name
              </Label>
              <TextInput id="co-name" placeholder="e.g. Pride" value={f.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-legal">Name on invoice</Label>
              <TextInput id="co-legal" placeholder="e.g. Pride Educare India Pvt. Ltd" value={f.legal_name} onChange={(e) => set('legal_name', e.target.value)} />
            </div>
            <div className="span-2">
              <Label htmlFor="co-addr">Address</Label>
              <TextArea id="co-addr" rows={3} value={f.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-email">Email</Label>
              <TextInput id="co-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-gst">GSTIN</Label>
              <TextInput id="co-gst" placeholder="27AAKCP3792M1ZN" value={f.gst_number} onChange={(e) => set('gst_number', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-state">State name</Label>
              <TextInput id="co-state" placeholder="Maharashtra" value={f.state} onChange={(e) => set('state', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-sc">State code</Label>
              <TextInput id="co-sc" placeholder="27" value={f.state_code} onChange={(e) => set('state_code', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-cin">CIN</Label>
              <TextInput id="co-cin" value={f.cin} onChange={(e) => set('cin', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-pan">PAN</Label>
              <TextInput id="co-pan" value={f.pan} onChange={(e) => set('pan', e.target.value)} />
            </div>
          </div>
        </FormSection>

        <FormSection title="Bank details" description="Printed on the invoice.">
          <div className="form-grid">
            <div>
              <Label htmlFor="co-bh">Account holder name</Label>
              <TextInput id="co-bh" placeholder="Same as the name on invoice" value={f.bank_holder} onChange={(e) => set('bank_holder', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-bn">Bank name</Label>
              <TextInput id="co-bn" placeholder="HDFC Bank" value={f.bank_name} onChange={(e) => set('bank_name', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-ba">Account no.</Label>
              <TextInput id="co-ba" value={f.bank_account} onChange={(e) => set('bank_account', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-br">Branch</Label>
              <TextInput id="co-br" value={f.bank_branch} onChange={(e) => set('bank_branch', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-ifsc">IFSC code</Label>
              <TextInput id="co-ifsc" value={f.bank_ifsc} onChange={(e) => set('bank_ifsc', e.target.value)} />
            </div>
          </div>
        </FormSection>

        <FormSection title="Invoice numbers" description="Each company has its own series.">
          <div className="form-grid">
            <div>
              <Label htmlFor="co-px">Prefix</Label>
              <TextInput id="co-px" placeholder="e.g. pride" value={f.invoice_prefix} onChange={(e) => set('invoice_prefix', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-fmt">Number format</Label>
              <TextInput id="co-fmt" placeholder="{N}/{PREFIX}/{FY}" value={f.number_format} onChange={(e) => set('number_format', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-next" required>
                Next number
              </Label>
              <TextInput id="co-next" type="number" min={1} value={f.next_no} onChange={(e) => set('next_no', e.target.value)} />
            </div>
            <div className="bk-total" style={{ alignItems: 'flex-start' }}>
              <span className="muted small">Next invoice</span>
              <b>{formatInvoiceNo(f.number_format, f.invoice_prefix || null, next)}</b>
            </div>
            <div className="span-2">
              <Hint>
                {'{N}'} the number (8) · {'{NNNN}'} with zeros (0008) · {'{FY}'} the financial year (26-27) · {'{PREFIX}'} the prefix. E.g. {'{N}/{PREFIX}/{FY}'} → 8/pride/26-27, or just {'{N}'} → 58. Change the next number to continue from another series.
              </Hint>
            </div>
          </div>
        </FormSection>

        <Checkbox id="co-active" checked={f.is_active} onChange={(v) => set('is_active', v)} label="Active (can be picked on businesses and invoices)" />
      </form>
    </Drawer>
  )
}
