import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/auth/useAuth'
import { useTenant } from '@/tenant/useTenant'
import { BusinessContext } from './business-context'

const storageKey = (tenantId: string) => `selectedBusiness.${tenantId}`

function readStored(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Remembers which business (or "All businesses") is selected in the top bar. */
export function BusinessProvider({ children }: { children: ReactNode }) {
  const tenant = useTenant()
  const { businesses } = useAuth()
  const key = storageKey(tenant.id)
  const [selectedId, setSelectedId] = useState<string | null>(() => readStored(key))

  const canSeeAll = businesses.length > 1
  // fall back if the stored business is gone; with only one business, it's always selected
  const selected =
    businesses.find((b) => b.id === selectedId) ?? (canSeeAll ? null : (businesses[0] ?? null))

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id)
      try {
        if (id) localStorage.setItem(key, id)
        else localStorage.removeItem(key)
      } catch {
        /* storage unavailable */
      }
    },
    [key],
  )

  const value = useMemo(() => ({ selected, select, canSeeAll }), [selected, select, canSeeAll])
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}
