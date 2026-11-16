import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertTriangle, CalendarCheck, Download, Plus, Users, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { BT, isOrderType, type SubBusinessType } from '@/auth/auth-context'
import { useBusiness } from '@/business/useBusiness'
import { activeType, orderNoun } from '@/business/activeType'
import { Empty, PageHead, Paged, SearchInput, StatCard } from '@/components/ui'
import { Flash } from '@/components/Flash'
import { listBookings } from '@/bookings/api'
import { BookingDrawer } from '@/bookings/BookingDrawer'
import { useBookingRefs } from '@/bookings/useBookingRefs'
import type { BookingRow } from '@/bookings/types'
import { useTenant } from '@/tenant/useTenant'
import { listLeads, listMemberOptions, listSources } from './api'
import { listCustomerRevenue, type Revenue } from './customers'
import { fullName, money } from './labels'
import type { LeadRow, MemberOption, Option } from './types'

const day = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '')
const hrs = (h: number) => `${Math.round(h * 10) / 10} hr${h === 1 ? '' : 's'}`

/** what a business calls its bookings, for the column names */
function words(t: SubBusinessType | null | undefined) {
  if (t === BT.STUDIO_RENTAL) return { many: 'Shoots', one: 'shoot' }
  if (t === BT.PAID_PODCAST) return { many: 'Recordings', one: 'recording' }
  if (t === BT.WEBINAR) return { many: 'Purchases', one: 'purchase' }
  if (isOrderType(t)) {
    const n = orderNoun(t)
    return { many: n.many, one: n.one.toLowerCase() }
  }
  return { many: 'Bookings', one: 'booking' }
}

type Row = { l: LeadRow; r: Revenue; balance: number }
type Pay = '' | 'paid' | 'due'
type Sort = 'newest' | 'balance' | 'billed' | 'name'

/** Customers: leads with a booking / order / purchase — since when, how many, last and next, billed, received and balance. */
export function CustomersPage() {
  const tenant = useTenant()
  const navigate = useNavigate()
  const { can, scope, businesses } = useAuth()
  const { selected, sub, inScope } = useBusiness()
  const refs = useBookingRefs()
  const [leads, setLeads] = useState<LeadRow[] | null>(null)
  const [revenue, setRevenue] = useState<Map<string, Revenue> | null>(null)
  const [sources, setSources] = useState<Option[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [f, setF] = useState<{ q: string; owner: string; source: string; pay: Pay; sort: Sort }>({ q: '', owner: '', source: '', pay: '', sort: 'newest' })
  const [book, setBook] = useState<{ lead: LeadRow; service: boolean; copy: BookingRow | null } | null>(null)

  const load = useCallback(() => {
    Promise.all([listLeads(tenant.id), listCustomerRevenue(tenant.id, businesses), listSources(tenant.id), listMemberOptions(tenant.id)])
      .then(([l, r, s, m]) => {
        setLeads(l)
        setRevenue(r)
        setSources(s)
        setMembers(m)
      })
      .catch((e: Error) => setError(e.message))
  }, [tenant.id, businesses])
  useEffect(load, [load])

  const typeOf = (l: Pick<LeadRow, 'business_id' | 'sub_business_id'>) => {
    const b = businesses.find((x) => x.id === l.business_id)
    return l.sub_business_id ? b?.subs.find((x) => x.id === l.sub_business_id)?.type : !b?.subs.length ? b?.type : null
  }
  const w = words(activeType(selected, sub))
  const sourceName = (id: string | null) => sources.find((s) => s.id === id)?.name
  const ownerName = (id: string | null) => members.find((m) => m.id === id)?.name

  const rows = useMemo<Row[]>(
    () =>
      (leads ?? [])
        .filter((l) => !l.is_archived && revenue?.has(l.id) && inScope(l.business_id, l.sub_business_id))
        .map((l) => {
          const r = revenue!.get(l.id)!
          return { l, r, balance: Math.max(0, r.billed - r.paid) }
        }),
    [leads, revenue, inScope],
  )
  const visible = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    return rows
      .filter(({ l }) => !q || `${fullName(l)} ${l.phone} ${l.email ?? ''} ${l.city ?? ''}`.toLowerCase().includes(q))
      .filter(({ l }) => !f.owner || (f.owner === 'none' ? !l.owner_id : l.owner_id === f.owner))
      .filter(({ l }) => !f.source || l.source_id === f.source)
      .filter(({ balance }) => !f.pay || (f.pay === 'paid' ? balance <= 0.01 : balance > 0.01))
      .sort((a, b) =>
        f.sort === 'balance'
          ? b.balance - a.balance
          : f.sort === 'billed'
            ? b.r.billed - a.r.billed
            : f.sort === 'name'
              ? fullName(a.l).localeCompare(fullName(b.l))
              : b.r.first.localeCompare(a.r.first),
      )
  }, [rows, f])

  // the cards follow the filters
  const stats = useMemo(() => {
    const billed = visible.reduce((n, x) => n + x.r.billed, 0)
    const paid = visible.reduce((n, x) => n + x.r.paid, 0)
    return {
      count: visible.length,
      bookings: visible.reduce((n, x) => n + x.r.count, 0),
      hours: visible.reduce((n, x) => n + x.r.hours, 0),
      billed,
      paid,
      due: visible.reduce((n, x) => n + x.balance, 0),
      owing: visible.filter((x) => x.balance > 0.01).length,
    }
  }, [visible])

  async function addBooking(l: LeadRow) {
    const service = isOrderType(typeOf(l))
    let copy: BookingRow | null = null
    // an order: a new one with the last order's services
    if (service) {
      const list = await listBookings(tenant.id, { leadId: l.id }).catch(() => [] as BookingRow[])
      copy = list.filter((b) => b.order_no && b.status !== 'cancelled').sort((a, b) => b.booking_date.localeCompare(a.booking_date) || (b.order_no ?? '').localeCompare(a.order_no ?? ''))[0] ?? null
    }
    setBook({ lead: l, service, copy })
  }

  function exportCsv() {
    const out = [
      ['Customer', 'Phone', 'City', 'Company', 'Source', 'Customer since', w.many, 'Hours', `Last ${w.one}`, `Next ${w.one}`, 'Billed', 'GST', 'Received', 'Balance', 'Owner'],
      ...visible.map(({ l, r, balance }) => [
        fullName(l),
        l.phone,
        l.city ?? '',
        '',
        sourceName(l.source_id) ?? '',
        day(r.first),
        r.count,
        r.hours ? Math.round(r.hours * 10) / 10 : '',
        day(r.lastPast),
        day(r.next),
        Math.round(r.billed),
        Math.round(r.gst),
        Math.round(r.paid),
        Math.round(balance),
        ownerName(l.owner_id) ?? '',
      ]),
    ]
    const csv = out.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'customers.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const scopeText = { all: 'all customers', team: 'your and your team’s customers', own: 'your own customers', none: 'no customers' }[scope('leads')]
  const filtered = f.q || f.owner || f.source || f.pay || f.sort !== 'newest'

  return (
    <>
      <PageHead
        title="Customers"
        subtitle={`Showing ${scopeText}${selected ? ` in ${selected.name}${sub ? ` · ${sub.name}` : ''}` : ''}.`}
        actions={
          can('leads', 'export') && (
            <button type="button" className="btn btn-outline" onClick={exportCsv} disabled={!visible.length}>
              <Download size={15} /> Export CSV
            </button>
          )
        }
      />
      {error && <div className="alert alert-error">{error}</div>}
      <Flash msg={notice} dep={notice} />

      <div className="stat-grid">
        <StatCard icon={Users} tone="brand" value={stats.count} label="Customers" hint={`Booked at least one ${w.one}`} />
        <StatCard icon={CalendarCheck} tone="info" value={stats.bookings} label={w.many} hint={stats.hours ? `${hrs(stats.hours)} of studio time` : undefined} />
        <StatCard icon={Wallet} tone="success" value={money(stats.paid)} label="Received" hint={`Billed ${money(stats.billed)}`} />
        <StatCard icon={AlertTriangle} tone="warning" value={money(stats.due)} label="Balance due" hint={`${stats.owing} customer${stats.owing === 1 ? '' : 's'} with payment pending`} />
      </div>

      <div className="panel">
        <div className="panel-filters">
          <SearchInput placeholder="Name, phone, email or city" value={f.q} onChange={(v) => setF((x) => ({ ...x, q: v }))} width={230} />
          <select className="input input-sm filter-select" value={f.owner} onChange={(e) => setF((x) => ({ ...x, owner: e.target.value }))} aria-label="Owner">
            <option value="">All owners</option>
            <option value="none">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={f.source} onChange={(e) => setF((x) => ({ ...x, source: e.target.value }))} aria-label="Source">
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="input input-sm filter-select" value={f.pay} onChange={(e) => setF((x) => ({ ...x, pay: e.target.value as Pay }))} aria-label="Payment">
            <option value="">Payment: all</option>
            <option value="paid">Fully paid</option>
            <option value="due">Balance due</option>
          </select>
          <select className="input input-sm filter-select" value={f.sort} onChange={(e) => setF((x) => ({ ...x, sort: e.target.value as Sort }))} aria-label="Sort">
            <option value="newest">Newest customer first</option>
            <option value="balance">Highest balance</option>
            <option value="billed">Most billed</option>
            <option value="name">Name A–Z</option>
          </select>
          {filtered && (
            <button type="button" className="clear-btn" onClick={() => setF({ q: '', owner: '', source: '', pay: '', sort: 'newest' })}>
              Reset
            </button>
          )}
        </div>

        {!leads || !revenue ? (
          <div className="empty">Loading customers…</div>
        ) : visible.length === 0 ? (
          <Empty icon={Users}>{rows.length ? 'No customers match these filters.' : 'No customers yet. A lead becomes a customer with its first booking.'}</Empty>
        ) : (
          <Paged rows={visible} reset={[f, selected?.id, sub?.id]}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Company</th>
                      <th>Source</th>
                      <th>Customer since</th>
                      <th className="num">{w.many}</th>
                      <th>Last {w.one}</th>
                      <th>Next {w.one}</th>
                      <th className="num">Billed</th>
                      <th className="num">Received</th>
                      <th>Balance</th>
                      <th>Owner</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map(({ l, r, balance }) => {
                      const t = typeOf(l)
                      const canBook = t !== BT.WEBINAR && can('bookings', 'add')
                      return (
                        <tr key={l.id} className="is-clickable" onClick={() => navigate(`/customers/${l.id}`)}>
                          <td>
                            <Link to={`/customers/${l.id}`} className="strong" onClick={(e) => e.stopPropagation()}>
                              {fullName(l)}
                            </Link>
                            <div className="muted small">
                              {l.phone}
                              {l.city ? ` · ${l.city}` : ''}
                            </div>
                            {l.tags.length > 0 && (
                              <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                                {l.tags.map((tg) => (
                                  <span key={tg} className="tag-chip tag-chip-sm">
                                    {tg}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="muted">—</td>
                          <td>{sourceName(l.source_id) ?? <span className="muted">—</span>}</td>
                          <td className="nowrap">{day(r.first) || '—'}</td>
                          <td className="num nowrap">
                            {r.count}
                            {r.hours > 0 && <div className="muted small">{hrs(r.hours)}</div>}
                          </td>
                          <td className="nowrap">{day(r.lastPast) || <span className="muted">—</span>}</td>
                          <td className="nowrap">{day(r.next) || <span className="muted">—</span>}</td>
                          <td className="num nowrap">
                            {money(r.billed)}
                            {r.gst > 0 && <div className="muted small">incl. GST {money(r.gst)}</div>}
                          </td>
                          <td className="num nowrap tone-success">{money(r.paid)}</td>
                          <td className="nowrap">{balance > 0.01 ? <b className="tone-danger">{money(balance)}</b> : <span className="badge badge-success">Paid ✓</span>}</td>
                          <td className="nowrap">{ownerName(l.owner_id) ?? <span className="muted">Unassigned</span>}</td>
                          <td className="nowrap" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            <Link className="btn btn-outline btn-sm" to={`/customers/${l.id}`}>
                              Open
                            </Link>{' '}
                            {canBook && (
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => void addBooking(l)}>
                                <Plus size={13} /> {isOrderType(t) ? orderNoun(t).one : 'Booking'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Paged>
        )}
      </div>

      {book && (
        <BookingDrawer
          key={book.lead.id}
          booking={null}
          service={book.service}
          noun={orderNoun(typeOf(book.lead)).one}
          copyFrom={book.copy}
          lead={{ id: book.lead.id, name: fullName(book.lead), phone: book.lead.phone, purpose: book.lead.purpose, business_id: book.lead.business_id, sub_business_id: book.lead.sub_business_id }}
          refs={refs}
          onClose={() => setBook(null)}
          onSaved={(msg) => {
            setBook(null)
            setNotice(msg)
            load()
          }}
        />
      )}
    </>
  )
}
