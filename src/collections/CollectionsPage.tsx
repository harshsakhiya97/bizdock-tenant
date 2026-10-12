import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlarmClock, CalendarClock, Check, HandCoins, MessageCircle, Phone, Plus, Receipt, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Empty, PageHead, SearchInput, StatCard } from '@/components/ui'
import { emisLeft, fmtDay, planOf, remainingOf, rupees, todayIso } from '@/customers/labels'
import type { DueRow, SaleRow } from '@/customers/types'
import { useSalesData } from '@/customers/useSalesData'
import { telHref, waHref } from '@/followups/labels'
import { cn } from '@/lib/cn'
import { dueLabel, dueLeft, markReminded } from './api'
import { RecordPaymentModal } from './RecordPaymentModal'

type Window = 'overdue' | '7' | '30' | '90' | 'all'
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

type DueLine = { d: DueRow; s: SaleRow; name: string; phone: string | null; product: string }

/** What customers still owe: EMI instalments and balances, with Collect / call / WhatsApp and reminders. */
export function CollectionsPage() {
  const data = useSalesData()
  const { can, membership } = useAuth()
  const navigate = useNavigate()
  const today = todayIso()
  const [q, setQ] = useState('')
  const [win, setWin] = useState<Window>('30')
  const [company, setCompany] = useState('')
  const [kind, setKind] = useState('')
  const [person, setPerson] = useState('')
  const [collect, setCollect] = useState<{ saleId?: string; dueId?: string } | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

  const custById = useMemo(() => new Map(data.allCustomers.map((c) => [c.id, c])), [data.allCustomers])
  const lines: DueLine[] = useMemo(
    () =>
      data.sales
        .filter((s) => s.status === 'active')
        .flatMap((s) =>
          s.sale_dues
            .filter((d) => d.status === 'pending' && dueLeft(d) > 0)
            .map((d) => ({
              d,
              s,
              name: custById.get(s.customer_id)?.full_name ?? 'Customer',
              phone: custById.get(s.customer_id)?.phone ?? null,
              product: data.productById.get(s.product_id)?.name ?? 'Product',
            })),
        )
        .sort((a, b) => a.d.due_on.localeCompare(b.d.due_on)),
    [data.sales, data.productById, custById],
  )

  // the four totals (all pending dues, not narrowed by the filters below)
  const in30 = addDays(today, 30)
  const sum = (xs: DueLine[]) => xs.reduce((a, x) => a + dueLeft(x.d), 0)
  const emiOverdue = lines.filter((x) => x.d.kind === 'emi' && x.d.due_on < today)
  const emiNext30 = lines.filter((x) => x.d.kind === 'emi' && x.d.due_on >= today && x.d.due_on <= in30)
  const bookingBal = lines.filter((x) => x.d.kind === 'balance' && x.s.plan === 'booking')
  const fullBal = lines.filter((x) => x.d.kind === 'balance' && x.s.plan === 'full')

  const visible = lines
    .filter((x) =>
      win === 'overdue'
        ? x.d.due_on < today
        : win === 'all'
          ? true
          : x.d.due_on <= addDays(today, Number(win)),
    )
    .filter((x) => !company || x.s.billing_company_id === company)
    .filter((x) => !person || x.s.sales_person_id === person)
    .filter((x) => !kind || (kind === 'emi' ? x.d.kind === 'emi' : kind === 'booking' ? x.d.kind === 'balance' && x.s.plan === 'booking' : x.d.kind === 'balance' && x.s.plan === 'full'))
    .filter((x) => {
      const t = q.trim().toLowerCase()
      if (!t) return true
      const digits = t.replace(/\D/g, '')
      return x.name.toLowerCase().includes(t) || x.product.toLowerCase().includes(t) || (!!digits && (x.phone ?? '').replace(/\D/g, '').includes(digits))
    })

  const reminders = lines.filter((x) => x.d.due_on <= addDays(today, 7) && !x.d.reminded_at)
  const emiPlans = data.sales
    .filter((s) => s.status === 'active' && s.plan === 'emi' && emisLeft(s).length > 0)
    .sort((a, b) => (emisLeft(a)[0]?.due_on ?? '').localeCompare(emisLeft(b)[0]?.due_on ?? ''))

  const waText = (x: DueLine) =>
    `${waHref(x.phone ?? '')}?text=${encodeURIComponent(
      `Hi ${x.name.split(' ')[0]}, a gentle reminder: your ${x.d.kind === 'emi' ? `EMI ${x.d.seq}` : 'balance'} of ${rupees(dueLeft(x.d))} for ${x.product} ${x.d.due_on < today ? 'was' : 'is'} due on ${fmtDay(x.d.due_on)}. Thank you!`,
    )}`

  async function done(x: DueLine) {
    try {
      await markReminded(x.d.id, membership?.id)
      data.load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }

  const status = (d: DueRow) =>
    d.due_on < today ? (
      <span className="badge badge-danger">Overdue</span>
    ) : d.due_on === today ? (
      <span className="badge badge-warning">Due today</span>
    ) : (
      <span className="badge badge-muted">Due</span>
    )
  const openCustomer = (s: SaleRow) => navigate(`/customers?open=${s.customer_id}`)

  return (
    <>
      <PageHead
        title="Collections & EMI"
        subtitle="Instalments and balances customers still owe. Collect records the payment against the due."
        actions={
          can('payments', 'add') && (
            <button type="button" className="btn btn-success" onClick={() => setCollect({})}>
              <Plus size={16} /> Record payment
            </button>
          )
        }
      />
      {(notice.error || data.error) && <div className="alert alert-error">{notice.error ?? data.error}</div>}
      {notice.ok && <div className="alert alert-info">{notice.ok}</div>}

      <div className="stat-grid">
        <StatCard icon={AlarmClock} tone="danger" value={rupees(sum(emiOverdue))} label="EMI overdue" hint={`${emiOverdue.length} instalment${emiOverdue.length === 1 ? '' : 's'}`} />
        <StatCard icon={CalendarClock} tone="warning" value={rupees(sum(emiNext30))} label="EMI due · next 30 days" hint={`${emiNext30.length} instalment${emiNext30.length === 1 ? '' : 's'}`} />
        <StatCard icon={Wallet} tone="purple" value={rupees(sum(bookingBal))} label="Booking balance" hint={`${bookingBal.length} booking${bookingBal.length === 1 ? '' : 's'}`} />
        <StatCard icon={Receipt} tone="info" value={rupees(sum(fullBal))} label="Full-payment balance" hint="Part paid, rest promised" />
      </div>

      <div className="collect-grid">
        <div className="panel">
          <div className="panel-bar">
            <b>Dues</b>
            <span className="muted small">
              {visible.length} due · {rupees(sum(visible))}
            </span>
          </div>
          <div className="panel-filters">
            <SearchInput placeholder="Customer, phone or product" value={q} onChange={setQ} width={210} />
            <select className="input input-sm filter-select" value={win} onChange={(e) => setWin(e.target.value as Window)} aria-label="When">
              <option value="overdue">Overdue only</option>
              <option value="7">Up to next 7 days</option>
              <option value="30">Up to next 30 days</option>
              <option value="90">Up to next 90 days</option>
              <option value="all">All pending</option>
            </select>
            <select className="input input-sm filter-select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
              <option value="">All types</option>
              <option value="emi">EMI</option>
              <option value="booking">Booking balance</option>
              <option value="full">Full-payment balance</option>
            </select>
            <select className="input input-sm filter-select" value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Billing company">
              <option value="">All companies</option>
              {data.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className="input input-sm filter-select" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Sales person">
              <option value="">Sales person</option>
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          {!data.customers ? (
            <div className="empty">Loading…</div>
          ) : visible.length === 0 ? (
            <Empty icon={HandCoins}>{lines.length ? 'Nothing due in this window.' : 'Nothing is due. Booking and EMI sales show their dues here.'}</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table dues-table">
                <thead>
                  <tr>
                    <th>Due</th>
                    <th>Customer</th>
                    <th>Product</th>
                    <th>For</th>
                    <th className="right">Amount</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((x) => (
                    <tr key={x.d.id}>
                      <td className={cn('nowrap', x.d.due_on < today && 'text-danger')}>
                        <b>{fmtDay(x.d.due_on)}</b>
                      </td>
                      <td>
                        <button type="button" className="link-btn" onClick={() => openCustomer(x.s)}>
                          {x.name}
                        </button>
                        <div className="muted small nowrap">{x.phone ?? "—"}</div>
                      </td>
                      <td>{x.product}</td>
                      <td className="nowrap">
                        {dueLabel(x.d)}
                        <div className="muted small">{planOf(x.s.plan).short}</div>
                      </td>
                      <td className="right nowrap">
                        <b>{rupees(dueLeft(x.d))}</b>
                        {Number(x.d.paid_amount) > 0 && <div className="muted small">of {rupees(x.d.amount)}</div>}
                      </td>
                      <td>{status(x.d)}</td>
                      <td className="nowrap right">
                        <span className="row-actions">
                          {x.phone && (
                            <>
                              <a className="btn btn-ghost btn-icon btn-sm" href={telHref(x.phone)} aria-label={`Call ${x.name}`} title="Call">
                                <Phone size={15} />
                              </a>
                              <a className="btn btn-ghost btn-icon btn-sm" href={waText(x)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${x.name}`} title="WhatsApp reminder">
                                <MessageCircle size={15} />
                              </a>
                            </>
                          )}
                          {can('payments', 'add') && (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCollect({ saleId: x.s.id, dueId: x.d.id })}>
                              Collect
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="panel reminders">
          <div className="panel-bar">
            <b>Reminders · next 7 days</b>
            <span className="muted small">{reminders.length}</span>
          </div>
          {reminders.length === 0 ? (
            <div className="empty small">No reminders. Dues within 7 days (and overdue ones) appear here.</div>
          ) : (
            <ul className="reminder-list">
              {reminders.map((x) => (
                <li key={x.d.id}>
                  <div className={x.d.due_on < today ? 'text-danger' : undefined}>
                    <b>
                      {dueLabel(x.d)} {rupees(dueLeft(x.d))}
                    </b>{' '}
                    due {fmtDay(x.d.due_on)} · {x.name}
                  </div>
                  <div className="row-between">
                    <span className="muted small">{data.memberName(x.s.sales_person_id) ?? '—'}</span>
                    <span className="row-actions">
                      {x.phone && (
                        <a className="btn btn-ghost btn-icon btn-sm" href={waText(x)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${x.name}`}>
                          <MessageCircle size={14} />
                        </a>
                      )}
                      {(can('payments', 'add') || can('deals', 'edit')) && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => done(x)} title="Reminded">
                          <Check size={14} /> Done
                        </button>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <div className="panel">
        <div className="panel-bar">
          <div>
            <b>EMI plans running</b>{' '}
            <span className="muted small">
              {emiPlans.length} sale{emiPlans.length === 1 ? '' : 's'} · {emiPlans.reduce((a, s) => a + emisLeft(s).length, 0)} EMIs ·{' '}
              {rupees(emiPlans.reduce((a, s) => a + remainingOf(s), 0))} still to come
            </span>
          </div>
        </div>
        {emiPlans.length === 0 ? (
          <Empty icon={CalendarClock}>No EMI plans running.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>EMIs left</th>
                  <th className="right">Total remaining</th>
                  <th>Next EMI</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {emiPlans.map((s) => {
                  const left = emisLeft(s)
                  const next = left[0]
                  const c = custById.get(s.customer_id)
                  return (
                    <tr key={s.id}>
                      <td>
                        <b>{c?.full_name ?? '—'}</b>
                        <div className="muted small">{c?.phone ?? ''}</div>
                      </td>
                      <td>{data.productById.get(s.product_id)?.name}</td>
                      <td className="nowrap">
                        {left.length} of {s.sale_dues.filter((d) => d.kind === 'emi').length} left
                        <div className="muted small">{rupees(left.reduce((a, d) => a + dueLeft(d), 0))}</div>
                      </td>
                      <td className="right nowrap">
                        <b>{rupees(remainingOf(s))}</b>
                      </td>
                      <td className="nowrap">
                        {next ? (
                          <>
                            {rupees(dueLeft(next))}
                            <div className={cn('small', next.due_on < today ? 'text-danger' : 'muted')}>
                              #{next.seq} · {fmtDay(next.due_on)}
                              {next.due_on < today ? ' · overdue' : ''}
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="right">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => openCustomer(s)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {collect && (
        <RecordPaymentModal
          data={data}
          saleId={collect.saleId}
          dueId={collect.dueId}
          onClose={() => setCollect(null)}
          onSaved={(msg) => {
            setCollect(null)
            setNotice({ ok: msg })
            data.load()
          }}
        />
      )}
    </>
  )
}
