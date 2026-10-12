import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useBusiness } from '@/business/useBusiness'
import { listCustomers, listSales } from '@/customers/api'
import { fmtDay, rupees, todayIso } from '@/customers/labels'
import type { CustomerRow, SaleRow } from '@/customers/types'
import { useTenant } from '@/tenant/useTenant'
import { dueLabel, dueLeft } from './api'

/** My Day: money due in the next 7 days (and overdue), mine or everyone's. */
export function DuesCard({ mine, me }: { mine: boolean; me: string | undefined }) {
  const tenant = useTenant()
  const { selected } = useBusiness()
  const [sales, setSales] = useState<SaleRow[] | null>(null)
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  useEffect(() => {
    void Promise.all([listSales(tenant.id), listCustomers(tenant.id)]).then(([s, c]) => {
      setSales(s)
      setCustomers(c)
    })
  }, [tenant.id])

  if (!sales) return null
  const today = todayIso()
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
  const name = (id: string) => customers.find((c) => c.id === id)?.full_name ?? 'Customer'
  const lines = sales
    .filter((s) => s.status === 'active' && (!selected || s.business_id === selected.id) && (!mine || s.sales_person_id === me))
    .flatMap((s) => s.sale_dues.filter((d) => d.status === 'pending' && d.due_on <= in7).map((d) => ({ s, d })))
    .sort((a, b) => a.d.due_on.localeCompare(b.d.due_on))
  const total = lines.reduce((a, x) => a + dueLeft(x.d), 0)

  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row-between">
        <b>Money due · 7 days</b>
        <span className="muted small">{rupees(total)}</span>
      </div>
      {lines.length === 0 ? (
        <span className="muted small">Nothing due.</span>
      ) : (
        lines.slice(0, 6).map(({ s, d }) => (
          <div key={d.id} className="day-item">
            <span className={d.due_on < today ? 'text-danger nowrap small' : 'muted nowrap small'}>{fmtDay(d.due_on).replace(/ \d{4}$/, '')}</span>
            <Link to={`/customers?open=${s.customer_id}`} className="link cell-clip">
              {name(s.customer_id)}
            </Link>
            <span className="small nowrap" style={{ marginLeft: 'auto' }}>
              {dueLabel(d)} · <b>{rupees(dueLeft(d))}</b>
            </span>
          </div>
        ))
      )}
      <Link to="/collections" className="link small">
        Open collections →
      </Link>
    </div>
  )
}
