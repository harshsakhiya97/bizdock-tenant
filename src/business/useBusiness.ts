import { useContext } from 'react'
import { BusinessContext } from './business-context'

export function useBusiness() {
  const ctx = useContext(BusinessContext)
  if (!ctx) throw new Error('useBusiness must be used inside <BusinessProvider>')
  return ctx
}
