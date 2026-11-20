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

/** Remembers which business (or "All businesses") is selected in the top bar. */
export function BusinessProvider({ children }: { children: ReactNode }) {
  const tenant = useTenant()
  const { businesses } = useAuth()
  const key = storageKey(tenant.id)
  const skey = subKey(tenant.id)
  const [selectedId, setSelectedId] = useState<string | null>(() => readStored(key))
  const [subId, setSubId] = useState<string | null>(() => readStored(skey))
  const [switches, setSwitches] = useState(0)

  const canSeeAll = businesses.length > 1
  // fall back if the stored business is gone; with only one business, it's always selected
  // (a sub-business picked before is a business of its own now, with the same id)
  const selected =
    businesses.find((b) => b.id === subId) ?? businesses.find((b) => b.id === selectedId) ?? (canSeeAll ? null : (businesses[0] ?? null))
  // one level of businesses now: no sub-business is ever picked
  const sub = null

  const select = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (id: string | null, _nextSub: string | null = null) => {
      setSelectedId(id)
      setSubId(null)
      setSwitches((n) => n + 1)
      store(key, id)
      store(skey, null)
    },
    [key, skey],
  )

  const inScope = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (businessId: string | null | undefined, _rowSub?: string | null) => !selected || businessId === selected.id,
    [selected],
  )

  const value = useMemo(() => ({ selected, sub, select, inScope, canSeeAll, switches }), [selected, select, inScope, canSeeAll, switches])
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}
