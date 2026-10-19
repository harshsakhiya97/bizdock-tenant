import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { listMemberOptions } from '@/leads/api'
import type { MemberOption } from '@/leads/types'
import { listBillingCompanies, listProducts, listSimple } from '@/masters/api'
import type { BillingCompanyRow, ProductRow, SimpleRow } from '@/masters/types'
import { useTenant } from '@/tenant/useTenant'
import { listCustomers, listSales } from './api'
import type { CustomerRow, SaleRow } from './types'

/** Everything the Customers page needs, narrowed to the business picked in the top bar. */
export function useSalesData() {
  const tenant = useTenant()
  const { businesses } = useAuth()
  const { selected, sub } = useBusiness()
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null)
  const [sales, setSales] = useState<SaleRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [companies, setCompanies] = useState<BillingCompanyRow[]>([])
  const [modes, setModes] = useState<SimpleRow[]>([])
  const [stages, setStages] = useState<SimpleRow[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([
      listCustomers(tenant.id),
      listSales(tenant.id),
      listProducts(tenant.id),
      listBillingCompanies(tenant.id),
      listSimple('payment_modes', tenant.id),
      listSimple('customer_stages', tenant.id),
      listMemberOptions(tenant.id),
    ])
      .then(([c, s, p, b, m, st, mem]) => {
        setCustomers(c)
        setSales(s)
        setProducts(p)
        setCompanies(b)
        setModes(m)
        setStages(st)
        setMembers(mem)
      })
      .catch((e: Error) => setError(e.message))
  }, [tenant.id])
  useEffect(load, [load])

  const inBiz = useCallback(
    (b: string) => (selected ? b === selected.id : businesses.some((x) => x.id === b)),
    [selected, businesses],
  )

  return useMemo(() => {
    const productById = new Map(products.map((p) => [p.id, p]))
    const salesByCustomer = new Map<string, SaleRow[]>()
    for (const s of sales) salesByCustomer.set(s.customer_id, [...(salesByCustomer.get(s.customer_id) ?? []), s])
    return {
      load,
      error,
      customers: customers ? customers.filter((c) => inBiz(c.business_id)) : null,
      allCustomers: customers ?? [],
      sales: sales.filter((s) => inBiz(s.business_id) && (!sub || s.sub_business_id === sub.id)),
      salesByCustomer,
      products,
      productById,
      companies,
      modes,
      stages,
      members,
      /** what a sale is called: its product, or what was written for it */
      saleTitle: (s: Pick<SaleRow, 'product_id' | 'notes'>) => (s.product_id ? productById.get(s.product_id)?.name : null) ?? s.notes ?? 'Sale',
      memberName: (id: string | null) => members.find((m) => m.id === id)?.name,
      companyName: (id: string | null) => companies.find((c) => c.id === id)?.name,
      modeName: (id: string | null) => modes.find((m) => m.id === id)?.name,
      stageOf: (id: string | null) => stages.find((s) => s.id === id),
    }
  }, [load, error, customers, sales, products, companies, modes, stages, members, inBiz, sub])
}

export type SalesData = ReturnType<typeof useSalesData>
