import { createContext } from 'react'
import type { Business, SubBusiness } from '@/auth/auth-context'

export type BusinessSelection = {
  /** null = "All businesses" */
  selected: Business | null
  /** a sub-business of the selected business; null = the whole business */
  sub: SubBusiness | null
  select: (id: string | null, subId?: string | null) => void
  /** true when the row belongs to the selected business (and sub-business, when one is picked) */
  inScope: (businessId: string | null | undefined, subId?: string | null) => boolean
  /** true when the user can see more than one business (so "All businesses" makes sense) */
  canSeeAll: boolean
}

export const BusinessContext = createContext<BusinessSelection | undefined>(undefined)
