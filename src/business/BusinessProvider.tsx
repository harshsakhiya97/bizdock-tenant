import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/auth/useAuth'
import { useTenant } from '@/tenant/useTenant'
import { BusinessContext } from './business-context'

const storageKey = (tenantId: string) => `selectedBusiness.${tenantId}`
const subKey = (tenantId: string) => `selectedSubBusiness.${tenantId}`

function readStored(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function store(key: string, v: string | null) {
  try {
    if (v) localStorage.setItem(key, v)
    else localStorage.removeItem(key)
  } catch {
    /* storage unavailable */
  }
}

/** Remembers which business (or "All businesses") and sub-business is selected in the top bar. */
export function BusinessProvider({ children }: { children: ReactNode }) {
  const tenant = useTenant()
  const { businesses } = useAuth()
  const key = storageKey(tenant.id)
  const skey = subKey(tenant.id)
  const [selectedId, setSelectedId] = useState<string | null>(() => readStored(key))
  const [subId, setSubId] = useState<string | null>(() => readStored(skey))

  const canSeeAll = businesses.length > 1
  // fall back if the stored business is gone; with only one business, it's always selected
  const selected =
    businesses.find((b) => b.id === selectedId) ?? (canSeeAll ? null : (businesses[0] ?? null))
  const sub = selected?.subs.find((s) => s.id === subId) ?? null

  const select = useCallback(
    (id: string | null, nextSub: string | null = null) => {
      setSelectedId(id)
      setSubId(nextSub)
      store(key, id)
      store(skey, nextSub)
    },
    [key, skey],
  )

  const inScope = useCallback(
    (businessId: string | null | undefined, rowSub?: string | null) =>
      !selected || (businessId === selected.id && (!sub || rowSub === sub.id)),
    [selected, sub],
  )

  const value = useMemo(() => ({ selected, sub, select, inScope, canSeeAll }), [selected, sub, select, inScope, canSeeAll])
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}
