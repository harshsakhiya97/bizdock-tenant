import { useContext } from 'react'
import { TenantContext } from '@/tenant/tenant-context'

export function DevelopedBy({ className }: { className?: string }) {
  const tenant = useContext(TenantContext)
  if (tenant?.hide_bizdock_branding) return null
  return <p className={className}>Developed by BizDock</p>
}
