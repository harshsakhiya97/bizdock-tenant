import type { ReactNode } from 'react'
import { useAuth } from './useAuth'

/** Shows the page only if the user can View this module. */
export function RequirePermission({ module, children }: { module: string; children: ReactNode }) {
  const { can } = useAuth()
  if (!can(module, 'view')) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
        <h2 className="text-lg font-semibold">No access</h2>
        <p className="mt-1 text-sm text-gray-600">
          Your role doesn&apos;t include this section. Ask your admin for access.
        </p>
      </div>
    )
  }
  return children
}
