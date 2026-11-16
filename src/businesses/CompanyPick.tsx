import { Checkbox, Label, Select } from '@/components/Field'
import type { BillingCompanyRow } from '@/masters/types'

/** "Company" for GST invoices + "Use this for non-GST invoices too" (ticked) or another company for non-GST invoices. */
export function CompanyPick({
  id,
  companies,
  company,
  nongst,
  onChange,
  emptyLabel = '— none —',
}: {
  id: string
  companies: BillingCompanyRow[]
  company: string
  /** '' = same as the company */
  nongst: string
  onChange: (v: { company: string; nongst: string }) => void
  emptyLabel?: string
}) {
  const options = (cur: string) => companies.filter((c) => c.is_active || c.id === cur)
  const same = !nongst
  return (
    <div className="form-grid">
      <div>
        <Label htmlFor={`${id}-co`}>Company (invoices from)</Label>
        <Select id={`${id}-co`} value={company} onChange={(e) => onChange({ company: e.target.value, nongst: e.target.value ? nongst : '' })}>
          <option value="">{emptyLabel}</option>
          {options(company).map((c) => (
            <option key={c.id} value={c.id}>
              {c.legal_name || c.name}
            </option>
          ))}
        </Select>
      </div>
      {company && (
        <div>
          {same ? (
            <div style={{ paddingTop: 26 }}>
              <Checkbox
                id={`${id}-same`}
                checked
                onChange={() => onChange({ company, nongst: options('').find((c) => c.id !== company)?.id ?? company })}
                label="Use this for non-GST invoices too"
              />
            </div>
          ) : (
            <>
              <Label htmlFor={`${id}-ng`}>Company for non-GST invoices</Label>
              <Select id={`${id}-ng`} value={nongst} onChange={(e) => onChange({ company, nongst: e.target.value === company ? '' : e.target.value })}>
                {options(nongst).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.legal_name || c.name}
                    {c.id === company ? ' (same)' : ''}
                  </option>
                ))}
              </Select>
              <button type="button" className="link-btn small" onClick={() => onChange({ company, nongst: '' })}>
                Use the same company
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
