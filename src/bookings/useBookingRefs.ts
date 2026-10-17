import { useEffect, useState } from 'react'
import { listFunnels } from '@/funnels/api'
import type { FunnelRow } from '@/funnels/types'
import { listSources } from '@/leads/api'
import type { Option } from '@/leads/types'
import { listBillingCompanies, listSimple } from '@/masters/api'
import type { BillingCompanyRow, SimpleRow } from '@/masters/types'
import { useTenant } from '@/tenant/useTenant'

/** Lists a booking form needs: billing companies, payment modes, sources and funnels (for new enquiries). */
export function useBookingRefs() {
  const tenant = useTenant()
  const [companies, setCompanies] = useState<BillingCompanyRow[]>([])
  const [modes, setModes] = useState<SimpleRow[]>([])
  const [sources, setSources] = useState<Option[]>([])
  const [funnels, setFunnels] = useState<FunnelRow[]>([])
  useEffect(() => {
    void Promise.all([listBillingCompanies(tenant.id), listSimple('payment_modes', tenant.id), listSources(tenant.id), listFunnels(tenant.id)]).then(
      ([c, m, s, f]) => {
        setCompanies(c.filter((x) => x.is_active))
        setModes(m.filter((x) => x.is_active))
        setSources(s)
        setFunnels(f)
      },
    )
  }, [tenant.id])
  return {
    companies,
    modes,
    sources,
    funnels,
    companyName: (id: string | null) => companies.find((c) => c.id === id)?.name,
    modeName: (id: string | null) => modes.find((m) => m.id === id)?.name,
  }
}
export type BookingRefs = ReturnType<typeof useBookingRefs>
