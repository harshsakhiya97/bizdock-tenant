import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Download, IndianRupee, Plus, ReceiptText, ShoppingBag, UserPlus, Users, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Empty, PageHead, SearchInput, StatCard } from '@/components/ui'
import { fullName } from '@/leads/labels'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'
import { RecordPaymentModal } from '@/collections/RecordPaymentModal'
import { AddCustomerDrawer } from './AddCustomerDrawer'
import { CustomerDrawer } from './CustomerDrawer'
import { emisLeft, fmtDay, nextDue, PLANS, planOf, remainingOf, rupees, todayIso, addMonthsIso } from './labels'
import { NewSaleDrawer, type SalePrefill } from './NewSaleDrawer'
import type { CustomerRow, SaleRow } from './types'
import { useSalesData, type SalesData } from './useSalesData'

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Customers (journey tabs) and All sales (every product bought), with New sale / New customer. */
export function CustomersPage() {
  const data = useSalesData()
  const { can, scope } = useAuth()
  const { selected } = useBusiness()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'sales' && scope('sales') !== 'none' ? 'sales' : 'customers'
  const [openId, setOpenId] = useState<string | null>(null)
  const [sale, setSale] = useState<SalePrefill | null>(null)
  const [adding, setAdding] = useState(false)
  const [collectSale, setCollectSale] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  // /customers?sale_lead=<lead id>: a lead was just won → New sale filled from the lead
  const saleLead = params.get('sale_lead')
  useEffect(() => {
    if (!saleLead) return
    void db()
      .from('leads')
      .select('id, business_id, first_name, last_name, phone, email, city, owner_id, estimated_amount')
      .eq('id', saleLead)
      .maybeSingle()
      .then(({ data: l }) => {
        if (l)
          setSale({
            business_id: l.business_id,
            lead_id: l.id,
            customer: { full_name: fullName(l), phone: l.phone ?? '', email: l.email ?? '', city: l.city ?? '' },
            sales_person_id: l.owner_id ?? undefined,
          })
        setParams(
          (p) => {
            p.delete('sale_lead')
            return p
          },
          { replace: true },
        )
      })
  }, [saleLead, setParams])

  // /customers?open=<customer id>
  const openParam = params.get('open')
  useEffect(() => {
    if (!openParam) return
    setOpenId(openParam)
    setParams(
      (p) => {
        p.delete('open')
        return p
      },
      { replace: true },
    )
  }, [openParam, setParams])

  const open = data.allCustomers.find((c) => c.id === openId) ?? null
  const saved = (msg: string, closeDrawer = false) => {
    setNotice({ ok: msg })
    if (closeDrawer) setOpenId(null)
    data.load()
  }

  return (
    <>
      <PageHead
        title="Customers"
        subtitle={selected ? `Customers of ${selected.name} and what they bought.` : 'Everyone who bought from you, and what they bought.'}
        actions={
          <>
            {can('customers', 'edit') && (
              <button type="button" className="btn btn-outline" onClick={() => setAdding(true)}>
                <UserPlus size={16} /> New customer
              </button>
            )}
            {can('deals', 'add') && (
              <button type="button" className="btn btn-primary" onClick={() => setSale({ business_id: selected?.id })}>
                <Plus size={16} /> New sale
              </button>
            )}
          </>
        }
      />
      {(notice.error || data.error) && <div className="alert alert-error">{notice.error ?? data.error}</div>}
      {notice.ok && <div className="alert alert-info">{notice.ok}</div>}

      {scope('sales') !== 'none' && (
        <div className="seg">
          <button type="button" className={cn(tab === 'customers' && 'is-active')} onClick={() => setParams({})}>
            <Users size={15} /> Customers
          </button>
          <button type="button" className={cn(tab === 'sales' && 'is-active')} onClick={() => setParams({ tab: 'sales' })}>
            <ReceiptText size={15} /> All sales
          </button>
        </div>
      )}

      {tab === 'customers' ? <CustomersTab data={data} onOpen={setOpenId} /> : <SalesTab data={data} onOpen={setOpenId} />}

      {open && !sale && (
        <CustomerDrawer
          key={open.id}
          customer={open}
          data={data}
          onClose={() => setOpenId(null)}
          onNewSale={() => setSale({ business_id: open.business_id, customer_id: open.id, customer_name: open.full_name })}
          onCollect={setCollectSale}
          onSaved={saved}
        />
      )}
      {sale && (
        <NewSaleDrawer
          data={data}
          prefill={sale}
          onClose={() => setSale(null)}
          onSaved={(msg) => {
            setSale(null)
            saved(msg)
          }}
        />
      )}
      {collectSale && (
        <RecordPaymentModal
          data={data}
          saleId={collectSale}
          onClose={() => setCollectSale(null)}
          onSaved={(msg) => {
            setCollectSale(null)
            saved(msg)
          }}
        />
      )}
      {adding && (
        <AddCustomerDrawer
          data={data}
          defaultBusinessId={selected?.id ?? null}
          onClose={() => setAdding(false)}
          onSaved={(msg) => {
            setAdding(false)
            saved(msg)
          }}
        />
      )}
    </>
  )
}

type CustFilters = { q: string; product: string; owner: string; emis: boolean; expiring: boolean; sort: string }
const CUST_EMPTY: CustFilters = { q: '', product: '', owner: '', emis: false, expiring: false, sort: 'newest' }

function CustomersTab({ data, onOpen }: { data: SalesData; onOpen: (id: string) => void }) {
  const [stageTab, setStageTab] = useState('all')
  const [f, setF] = useState<CustFilters>(CUST_EMPTY)
  const setFilter = <K extends keyof CustFilters>(k: K, v: CustFilters[K]) => setF((d) => ({ ...d, [k]: v }))

  const rows = useMemo(() => {
    const today = todayIso()
    const in30 = addMonthsIso(today, 1)
    return (data.customers ?? []).map((c) => {
      const sales = (data.salesByCustomer.get(c.id) ?? []).filter((s) => s.status === 'active')
      const dues = sales.flatMap((s) => s.sale_dues.filter((d) => d.status === 'pending')).sort((a, b) => a.due_on.localeCompare(b.due_on))
      const emis = sales.flatMap(emisLeft)
      return {
        c,
        sales,
        lifetime: sales.reduce((a, s) => a + Number(s.total_amount), 0),
        remaining: sales.reduce((a, s) => a + remainingOf(s), 0),
        emis,
        next: dues[0] ?? null,
        expiring: sales.some((s) => s.valid_until && s.valid_until >= today && s.valid_until <= in30),
      }
    })
  }, [data.customers, data.salesByCustomer])

  const base = rows
    .filter((r) => (stageTab === 'deleted' ? r.c.is_archived : !r.c.is_archived))
    .filter((r) => {
      const q = f.q.trim().toLowerCase()
      if (!q) return true
      const digits = q.replace(/\D/g, '')
      return (
        r.c.full_name.toLowerCase().includes(q) ||
        (r.c.email ?? '').toLowerCase().includes(q) ||
        (r.c.city ?? '').toLowerCase().includes(q) ||
        (!!digits && (r.c.phone ?? '').replace(/\D/g, '').includes(digits))
      )
    })
    .filter((r) => !f.product || r.sales.some((s) => s.product_id === f.product))
    .filter((r) => !f.owner || (f.owner === 'none' ? !r.c.owner_id : r.c.owner_id === f.owner))
    .filter((r) => !f.emis || r.emis.length > 0)
    .filter((r) => !f.expiring || r.expiring)
  const visible = base
    .filter((r) => stageTab === 'all' || stageTab === 'deleted' || r.c.stage_id === stageTab)
    .sort((a, b) => {
      if (f.sort === 'oldest') return a.c.created_at.localeCompare(b.c.created_at)
      if (f.sort === 'value') return b.lifetime - a.lifetime
      if (f.sort === 'remaining') return b.remaining - a.remaining
      if (f.sort === 'name') return a.c.full_name.localeCompare(b.c.full_name)
      return b.c.created_at.localeCompare(a.c.created_at)
    })

  const live = base.filter((r) => !r.c.is_archived)
  const tabs = [
    { id: 'all', label: 'All', count: stageTab === 'deleted' ? rows.filter((r) => !r.c.is_archived).length : live.length },
    ...data.stages
      .filter((s) => s.is_active)
      .map((s) => ({ id: s.id, label: s.name, count: live.filter((r) => r.c.stage_id === s.id).length })),
    { id: 'deleted', label: 'Deleted', count: rows.filter((r) => r.c.is_archived).length },
  ]
  const productsInScope = data.products.filter((p) => data.sales.some((s) => s.product_id === p.id))

  return (
    <div className="panel">
      <div className="panel-tabs">
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={cn('tab', stageTab === t.id && 'is-active')} onClick={() => setStageTab(t.id)}>
              {t.label} <span className="muted small">{t.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="panel-filters">
        <SearchInput placeholder="Name, phone, email or city" value={f.q} onChange={(v) => setFilter('q', v)} width={230} />
        <select className="input input-sm filter-select" value={f.product} onChange={(e) => setFilter('product', e.target.value)} aria-label="Product">
          <option value="">Product</option>
          {productsInScope.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="input input-sm filter-select" value={f.owner} onChange={(e) => setFilter('owner', e.target.value)} aria-label="Owner">
          <option value="">Owner</option>
          <option value="none">Unassigned</option>
          {data.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select className="input input-sm filter-select" value={f.sort} onChange={(e) => setFilter('sort', e.target.value)} aria-label="Sort">
          <option value="newest">Newest customers</option>
          <option value="oldest">Oldest customers</option>
          <option value="value">Highest lifetime value</option>
          <option value="remaining">Most remaining</option>
          <option value="name">Name A–Z</option>
        </select>
        <label className="check-inline">
          <input type="checkbox" checked={f.emis} onChange={(e) => setFilter('emis', e.target.checked)} /> EMIs left
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={f.expiring} onChange={(e) => setFilter('expiring', e.target.checked)} /> Validity ends in 30 days
        </label>
        {JSON.stringify(f) !== JSON.stringify(CUST_EMPTY) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF(CUST_EMPTY)}>
            Reset
          </button>
        )}
      </div>

      {!data.customers ? (
        <div className="empty">Loading customers…</div>
      ) : visible.length === 0 ? (
        <Empty icon={Users}>{rows.length ? 'No customers match.' : 'No customers yet. Record a New sale, or win a lead, and they appear here.'}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table cust-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Stage</th>
                <th>Products</th>
                <th className="right">Lifetime value</th>
                <th className="right">Remaining</th>
                <th>EMIs left</th>
                <th>Next due</th>
                <th>Owner</th>
                <th>Since</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const st = data.stageOf(r.c.stage_id)
                return (
                  <tr key={r.c.id} className="is-clickable" onClick={() => onOpen(r.c.id)}>
                    <td>
                      <b>{r.c.full_name}</b>
                      <div className="muted small">{[r.c.phone, r.c.city].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td>
                      {st ? (
                        <span className="stage-pill" style={{ ['--c' as string]: st.color }}>
                          {st.name}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {r.sales.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        r.sales.map((s) => (
                          <div key={s.id} className="small">
                            {data.productById.get(s.product_id)?.name ?? 'Product'}
                            {s.valid_until && <span className="muted"> · till {fmtDay(s.valid_until)}</span>}
                          </div>
                        ))
                      )}
                    </td>
                    <td className="right nowrap">{rupees(r.lifetime)}</td>
                    <td className={cn('right nowrap', r.remaining > 0 && 'text-danger')}>{rupees(r.remaining)}</td>
                    <td className="nowrap">
                      {r.emis.length ? (
                        <>
                          {r.emis.length} left
                          <div className="muted small">{rupees(r.emis.reduce((a, d) => a + Number(d.amount) - Number(d.paid_amount), 0))}</div>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="nowrap">
                      {r.next ? (
                        <>
                          <b>{rupees(Number(r.next.amount) - Number(r.next.paid_amount))}</b>
                          <div className={cn('small', r.next.due_on < todayIso() ? 'text-danger' : 'muted')}>
                            {r.next.kind === 'emi' ? `EMI ${r.next.seq}` : 'Balance'} · {fmtDay(r.next.due_on)}
                          </div>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="nowrap">{data.memberName(r.c.owner_id) ?? <span className="muted">Unassigned</span>}</td>
                    <td className="nowrap muted">{fmtDay(r.c.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

type SaleFilters = {
  q: string
  plan: string
  product: string
  company: string
  mode: string
  person: string
  from: string
  to: string
  balance: boolean
  emis: boolean
  cancelled: boolean
  sort: string
}
const SALE_EMPTY: SaleFilters = {
  q: '',
  plan: '',
  product: '',
  company: '',
  mode: '',
  person: '',
  from: '',
  to: '',
  balance: false,
  emis: false,
  cancelled: false,
  sort: 'newest',
}

function SalesTab({ data, onOpen }: { data: SalesData; onOpen: (id: string) => void }) {
  const { can } = useAuth()
  const [f, setF] = useState<SaleFilters>(SALE_EMPTY)
  const setFilter = <K extends keyof SaleFilters>(k: K, v: SaleFilters[K]) => setF((d) => ({ ...d, [k]: v }))
  const custById = useMemo(() => new Map(data.allCustomers.map((c) => [c.id, c])), [data.allCustomers])

  const visible = data.sales
    .filter((s) => (f.cancelled ? s.status === 'cancelled' : s.status === 'active'))
    .filter((s) => {
      const q = f.q.trim().toLowerCase()
      if (!q) return true
      const c = custById.get(s.customer_id)
      return (
        (c?.full_name ?? '').toLowerCase().includes(q) ||
        (c?.phone ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '¤') ||
        (s.reference ?? '').toLowerCase().includes(q)
      )
    })
    .filter((s) => !f.plan || s.plan === f.plan)
    .filter((s) => !f.product || s.product_id === f.product)
    .filter((s) => !f.company || s.billing_company_id === f.company)
    .filter((s) => !f.mode || s.payment_mode_id === f.mode)
    .filter((s) => !f.person || s.sales_person_id === f.person)
    .filter((s) => !f.from || s.sale_date >= f.from)
    .filter((s) => !f.to || s.sale_date <= f.to)
    .filter((s) => !f.balance || remainingOf(s) > 0)
    .filter((s) => !f.emis || emisLeft(s).length > 0)
    .sort((a, b) =>
      f.sort === 'oldest'
        ? a.sale_date.localeCompare(b.sale_date)
        : f.sort === 'value'
          ? Number(b.total_amount) - Number(a.total_amount)
          : f.sort === 'remaining'
            ? remainingOf(b) - remainingOf(a)
            : b.sale_date.localeCompare(a.sale_date) || b.created_at.localeCompare(a.created_at),
    )

  const active = visible.filter((s) => s.status === 'active')
  const total = active.reduce((a, s) => a + Number(s.total_amount), 0)
  const gst = active.reduce((a, s) => a + Number(s.gst_amount), 0)
  const collected = active.reduce((a, s) => a + Number(s.paid_amount), 0)
  const remaining = active.reduce((a, s) => a + remainingOf(s), 0)
  const emiSales = active.filter((s) => emisLeft(s).length > 0)
  const emiCount = emiSales.reduce((a, s) => a + emisLeft(s).length, 0)

  function exportCsv() {
    downloadCsv('sales.csv', [
      ['Date', 'Customer', 'Phone', 'Type', 'Product', 'Qty', 'Billing company', 'Before GST', 'GST', 'Total', 'Paid', 'Remaining', 'EMIs left', 'Next due', 'Mode', 'Reference', 'Sales person', 'Status'],
      ...visible.map((s) => {
        const c = custById.get(s.customer_id)
        const nd = nextDue(s)
        return [
          s.sale_date,
          c?.full_name ?? '',
          c?.phone ?? '',
          planOf(s.plan).short,
          data.productById.get(s.product_id)?.name ?? '',
          s.quantity,
          data.companyName(s.billing_company_id) ?? '',
          s.base_amount,
          s.gst_amount,
          s.total_amount,
          s.paid_amount,
          remainingOf(s),
          emisLeft(s).length,
          nd ? `${nd.due_on} (${nd.amount})` : '',
          data.modeName(s.payment_mode_id) ?? '',
          s.reference ?? '',
          data.memberName(s.sales_person_id) ?? '',
          s.status,
        ]
      }),
    ])
  }

  return (
    <>
      <div className="stat-grid">
        <StatCard icon={ShoppingBag} tone="brand" value={active.length} label="Sales" />
        <StatCard icon={IndianRupee} tone="info" value={rupees(total)} label="Total sales value" hint={`GST ${rupees(gst)}`} />
        <StatCard icon={Wallet} tone="success" value={rupees(collected)} label="Collected" />
        <StatCard
          icon={ReceiptText}
          tone="danger"
          value={rupees(remaining)}
          label="Total remaining"
          hint={emiCount ? `${emiCount} EMIs left in ${emiSales.length} sale${emiSales.length > 1 ? 's' : ''}` : undefined}
        />
      </div>

      <div className="panel">
        <div className="panel-filters">
          <SearchInput placeholder="Customer, phone or reference" value={f.q} onChange={(v) => setFilter('q', v)} width={220} />
          <select className="input input-sm filter-select" value={f.plan} onChange={(e) => setFilter('plan', e.target.value)} aria-label="Type">
            <option value="">Type</option>
            {PLANS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.short}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={f.product} onChange={(e) => setFilter('product', e.target.value)} aria-label="Product">
            <option value="">Product</option>
            {data.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={f.company} onChange={(e) => setFilter('company', e.target.value)} aria-label="Billing company">
            <option value="">Billing company</option>
            {data.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={f.mode} onChange={(e) => setFilter('mode', e.target.value)} aria-label="Payment mode">
            <option value="">Payment mode</option>
            {data.modes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={f.person} onChange={(e) => setFilter('person', e.target.value)} aria-label="Sales person">
            <option value="">Sales person</option>
            {data.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="row date-range">
            <input type="date" className="input input-sm" value={f.from} onChange={(e) => setFilter('from', e.target.value)} aria-label="From" />
            <span className="muted small">to</span>
            <input type="date" className="input input-sm" value={f.to} onChange={(e) => setFilter('to', e.target.value)} aria-label="To" />
          </span>
          <label className="check-inline">
            <input type="checkbox" checked={f.balance} onChange={(e) => setFilter('balance', e.target.checked)} /> Balance due
          </label>
          <label className="check-inline">
            <input type="checkbox" checked={f.emis} onChange={(e) => setFilter('emis', e.target.checked)} /> EMIs left
          </label>
          <label className="check-inline">
            <input type="checkbox" checked={f.cancelled} onChange={(e) => setFilter('cancelled', e.target.checked)} /> Cancelled
          </label>
          <select className="input input-sm filter-select" value={f.sort} onChange={(e) => setFilter('sort', e.target.value)} aria-label="Sort">
            <option value="newest">Newest sales</option>
            <option value="oldest">Oldest sales</option>
            <option value="value">Highest value</option>
            <option value="remaining">Most remaining</option>
          </select>
          {JSON.stringify(f) !== JSON.stringify(SALE_EMPTY) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF(SALE_EMPTY)}>
              Reset
            </button>
          )}
          {can('leads', 'export') && (
            <button type="button" className="btn btn-outline btn-sm" onClick={exportCsv} disabled={!visible.length}>
              <Download size={14} /> Export CSV
            </button>
          )}
        </div>

        {visible.length === 0 ? (
          <Empty icon={ReceiptText}>{data.sales.length ? 'No sales match.' : 'No sales yet.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table sales-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Product</th>
                  <th>Billing co.</th>
                  <th className="right">Total</th>
                  <th className="right">Remaining</th>
                  <th>EMIs left</th>
                  <th>Next due</th>
                  <th>Mode</th>
                  <th>Sales person</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <SaleTr key={s.id} s={s} c={custById.get(s.customer_id)} data={data} onOpen={onOpen} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

function SaleTr({ s, c, data, onOpen }: { s: SaleRow; c: CustomerRow | undefined; data: SalesData; onOpen: (id: string) => void }) {
  const plan = planOf(s.plan)
  const emis = emisLeft(s)
  const nd = nextDue(s)
  const rem = remainingOf(s)
  return (
    <tr className="is-clickable" onClick={() => c && onOpen(c.id)}>
      <td className="nowrap">{fmtDay(s.sale_date)}</td>
      <td>
        <b>{c?.full_name ?? '—'}</b>
        {s.notes && <div className="muted small clamp-1">{s.notes}</div>}
      </td>
      <td>
        <span className={cn('badge', plan.tone)}>{plan.short}</span>
        {s.status === 'cancelled' && <span className="badge badge-danger">Cancelled</span>}
      </td>
      <td>
        {data.productById.get(s.product_id)?.name ?? '—'}
        {s.quantity > 1 && <span className="muted"> × {s.quantity}</span>}
      </td>
      <td className="nowrap">{data.companyName(s.billing_company_id) ?? '—'}</td>
      <td className="right nowrap">{rupees(s.total_amount)}</td>
      <td className={cn('right nowrap', rem > 0 && 'text-danger')}>{rupees(rem)}</td>
      <td className="nowrap">
        {s.plan === 'emi' ? (
          <>
            {emis.length} of {s.sale_dues.filter((d) => d.kind === 'emi').length} left
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="nowrap">
        {nd ? (
          <>
            <b>{rupees(Number(nd.amount) - Number(nd.paid_amount))}</b>
            <div className={cn('small', nd.due_on < todayIso() ? 'text-danger' : 'muted')}>
              {nd.kind === 'emi' ? `#${nd.seq}` : 'Balance'} · {fmtDay(nd.due_on)}
            </div>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="nowrap">{data.modeName(s.payment_mode_id) ?? '—'}</td>
      <td className="nowrap">{data.memberName(s.sales_person_id) ?? '—'}</td>
    </tr>
  )
}
