import { useEffect, useState } from 'react'
import { listFunnels } from '@/funnels/api'
import type { FunnelRow } from '@/funnels/types'
import { listSources } from '@/leads/api'
import type { Option } from '@/leads/types'
import { listBillingCompanies, listProducts, listSimple, listStudios, type PodcastStudio } from '@/masters/api'
import type { BillingCompanyRow, ProductRow, SimpleRow } from '@/masters/types'
import { useTenant } from '@/tenant/useTenant'

/** Lists a booking form needs: billing companies, payment modes, sources and funnels (for new enquiries). */
export function useBookingRefs() {
  const tenant = useTenant()
  const [companies, setCompanies] = useState<BillingCompanyRow[]>([])
  const [modes, setModes] = useState<SimpleRow[]>([])
  const [sources, setSources] = useState<Option[]>([])
  const [funnels, setFunnels] = useState<FunnelRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  // Masters → Products (what webinar leads buy)
  const [goods, setGoods] = useState<ProductRow[]>([])
  // Masters → Podcast Studios (Paid Podcast / Studio Rental bookings)
  const [studios, setStudios] = useState<PodcastStudio[]>([])
  useEffect(() => {
    void listStudios(tenant.id).then(setStudios, () => setStudios([]))
    void Promise.all([listBillingCompanies(tenant.id), listSimple('payment_modes', tenant.id), listSources(tenant.id), listFunnels(tenant.id), listProducts(tenant.id)]).then(
      ([c, m, s, f, p]) => {
        setProducts(p.filter((x) => x.kind !== 'product'))
        setGoods(p.filter((x) => x.kind === 'product'))
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
    products,
    goods,
    studios,
    /** the default studio (else the first) */
    defaultStudio: studios.find((s) => s.is_default)?.id ?? studios[0]?.id ?? '',
    companyName: (id: string | null) => companies.find((c) => c.id === id)?.name,
    modeName: (id: string | null) => modes.find((m) => m.id === id)?.name,
  }
}
export type BookingRefs = ReturnType<typeof useBookingRefs>
