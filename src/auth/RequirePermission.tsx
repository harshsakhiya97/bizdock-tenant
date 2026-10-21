import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Empty } from '@/components/ui'
import { useAuth } from './useAuth'

/** Shows the page only if the user has this permission (View by default) and, with `area`, can see that area (not None). */
export function RequirePermission({
  module,
  area,
  action = 'view',
  orModule,
  orAction = 'view',
  children,
}: {
  module?: string
  /** visibility area (leads, sales, …) that must not be None */
  area?: string
  action?: string
  /** also allowed with this permission */
  orModule?: string
  orAction?: string
  children: ReactNode
}) {
  const { can, scope } = useAuth()
  const areaOk = !area || scope(area) !== 'none'
  const permOk = !module || can(module, action) || Boolean(orModule && can(orModule, orAction))
  if (!areaOk || !permOk) {
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
