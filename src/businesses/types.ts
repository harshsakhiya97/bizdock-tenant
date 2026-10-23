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
  /** true: split into sub-businesses (each has a type); false: the business has a type of its own */
  has_sub_businesses: boolean
  type: string | null
  is_active: boolean
  archived_at: string | null
  sort_order: number
  created_at: string
}

/** Business list row */
export type BusinessListRow = BusinessRow

/** Editable business fields */
export type BusinessInput = Pick<
  BusinessRow,
  'name' | 'phone' | 'email' | 'address' | 'city' | 'state' | 'has_gst' | 'gst_number' | 'legal_name' | 'has_sub_businesses' | 'type'
>

export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
/** Indian GSTIN: 15 characters, e.g. 24ABCDE1234F1Z5 */
export const isValidGst = (v: string) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v)
