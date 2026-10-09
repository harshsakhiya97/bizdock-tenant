export type BusinessRow = {
  id: string
  tenant_id: string
  name: string
  logo_url: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  gst_number: string | null
  legal_name: string | null
  has_gst: boolean
  has_branches: boolean
  is_active: boolean
  archived_at: string | null
  sort_order: number
  created_at: string
}

export type BranchRow = {
  id: string
  tenant_id: string
  business_id: string
  code: string
  name: string
  short_name: string
  city: string | null
  address: string | null
  phone: string | null
  email: string | null
  manager_member_id: string | null
  own_gst: boolean
  legal_name: string | null
  gst_number: string | null
  is_active: boolean
  archived_at: string | null
  sort_order: number
}

/** Business list row: business + its branches (id + active flag, for counting) */
export type BusinessListRow = BusinessRow & { branches: Pick<BranchRow, 'id' | 'is_active'>[] }

/** Editable business fields */
export type BusinessInput = Pick<
  BusinessRow,
  'name' | 'phone' | 'email' | 'address' | 'city' | 'state' | 'has_gst' | 'gst_number' | 'legal_name' | 'has_branches'
>

/** Branch as edited in the form. `id` is missing for branches not saved yet. */
export type BranchDraft = {
  key: string
  id?: string
  code: string
  name: string
  short_name: string
  city: string
  address: string
  phone: string
  email: string
  manager_member_id: string | null
  /** true = this branch has its own GST instead of the business GST */
  own_gst: boolean
  legal_name: string
  gst_number: string
}

export type ManagerOption = { id: string; name: string }

/** Branch code: 2–12 capital letters, numbers or dashes, e.g. MUM-01 */
export const isValidBranchCode = (v: string) => /^[A-Z0-9-]{2,12}$/.test(v)

export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
/** Indian GSTIN: 15 characters, e.g. 24ABCDE1234F1Z5 */
export const isValidGst = (v: string) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v)
