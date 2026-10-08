import { useContext } from 'react'
import { TenantContext } from './tenant-context'

export function useTenant() {
  const tenant = useContext(TenantContext)
  if (!tenant) throw new Error('useTenant must be used inside <TenantProvider>')
  return tenant
}
