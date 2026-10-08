import { createContext } from 'react'
import type { Business } from '@/auth/auth-context'

export type BusinessSelection = {
  /** null = "All businesses" */
  selected: Business | null
  select: (id: string | null) => void
  /** true when the user can see more than one business (so "All businesses" makes sense) */
  canSeeAll: boolean
}

export const BusinessContext = createContext<BusinessSelection | undefined>(undefined)
