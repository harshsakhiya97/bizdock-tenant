import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Empty } from '@/components/ui'
import { useAuth } from './useAuth'

/** Shows the page only if the user has this permission (View by default). */
export function RequirePermission({
  module,
  action = 'view',
  orModule,
  orAction = 'view',
  children,
}: {
  module: string
  action?: string
  /** also allowed with this permission */
  orModule?: string
  orAction?: string
  children: ReactNode
}) {
  const { can } = useAuth()
  if (!can(module, action) && !(orModule && can(orModule, orAction))) {
    return (
      <div className="card">
        <Empty icon={Lock}>
          <b>No access</b>
          <div>Your role doesn&apos;t include this section. Ask your admin for access.</div>
        </Empty>
      </div>
    )
  }
  return children
}
