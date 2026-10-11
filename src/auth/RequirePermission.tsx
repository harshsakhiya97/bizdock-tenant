import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Empty } from '@/components/ui'
import { useAuth } from './useAuth'

/** Shows the page only if the user can View this module. */
export function RequirePermission({ module, children }: { module: string; children: ReactNode }) {
  const { can } = useAuth()
  if (!can(module, 'view')) {
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
