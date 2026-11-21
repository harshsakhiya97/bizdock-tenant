import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, ReceiptIndianRupee, RefreshCw, Tags, Trash2, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Button } from '@/components/Button'
import { ALL_DATES, DateRangePicker, type Range } from '@/components/DateRange'
import { Drawer } from '@/components/Drawer'
import { FormSection, Label, TextArea, TextInput } from '@/components/Field'
import { Flash } from '@/components/Flash'
import { SearchSelect } from '@/components/SearchSelect'
import { ConfirmModal, Empty, PageHead, Paged, SearchInput, StatCard } from '@/components/ui'
import { money } from '@/leads/labels'
import { db } from '@/lib/supabase'
import { fetchAll } from '@/lib/fetchAll'
import { useTenant } from '@/tenant/useTenant'

/** Expenses: what the business spends besides what it sells. Rough first version: one list, categories fixed in code. */
export type Expense = {
  id: string
  business_id: string | null
  spent_on: string
  category: string
  amount: number
  note: string | null
  created_at: string
}

export const EXPENSE_CATEGORIES = ['Ad Spend', 'Marketing', 'Salary', 'Trainer Fees', 'Venue', 'Travel', 'Rent', 'Office', 'Software', 'Telephony', 'Payment Gateway', 'Other']

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const today = () => new Date().toLocaleDateString('en-CA')

export function ExpensesPage() {
  const tenant = useTenant()
  const { can, businesses, membership } = useAuth()
  const { selected, inScope } = useBusiness()
  const canEdit = can('expenses', 'edit')
  const [rows, setRows] = useState<Expense[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | undefined>()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [range, setRange] = useState<Range>(ALL_DATES)
  const [open, setOpen] = useState<{ row: Expense | null } | null>(null)
  const [removing, setRemoving] = useState<Expense | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setRows(null)
    setError(null)
    fetchAll<Expense>(() => db().from('expenses').select('id, business_id, spent_on, category, amount, note, created_at').eq('tenant_id', tenant.id).order('spent_on', { ascending: false }).order('id') as never)
      .then(setRows)
      .catch((e: Error) => {
        setError(e.message)
        setRows([])
      })
  }, [tenant.id])
  useEffect(load, [load])

  const bizName = useMemo(() => new Map(businesses.map((b) => [b.id, b.name])), [businesses])
  const mine = useMemo(() => (rows ?? []).filter((r) => !r.business_id || inScope(r.business_id)), [rows, inScope])
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return mine.filter(
      (r) =>
        (!cat || r.category === cat) &&
        (!range.from || r.spent_on >= range.from) &&
        (!range.to || r.spent_on <= range.to) &&
        (!s || `${r.category} ${r.note ?? ''}`.toLowerCase().includes(s)),
    )
  }, [mine, q, cat, range])
  const total = shown.reduce((t, r) => t + Number(r.amount), 0)
  const byCat = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of shown) m.set(r.category, (m.get(r.category) ?? 0) + Number(r.amount))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [shown])

  async function remove() {
    if (!removing) return
    setBusy(true)
    const { error: e } = await db().from('expenses').delete().eq('id', removing.id)
    setBusy(false)
    if (e) setError(e.message)
    else setNotice(`${removing.category} · ${money(removing.amount)} deleted.`)
    setRemoving(null)
    load()
  }

  return (
    <>
      <PageHead
        title="Expenses"
        subtitle="What the business spends besides what it sells: ad spend, salaries, venue, software… Net profit on the dashboard is collected minus these."
        actions={
          canEdit && (
            <Button onClick={() => setOpen({ row: null })}>
              <Plus size={16} /> Add expense
            </Button>
          )
        }
      />
      {error && <div className="alert alert-error">{error}</div>}
      <Flash msg={notice} dep={notice} />
      <div className="stat-grid">
        <StatCard icon={Wallet} tone="danger" value={money(total)} label="Spent" hint={`${shown.length} ${shown.length === 1 ? 'entry' : 'entries'}`} />
        <StatCard icon={Tags} tone="info" value={byCat[0]?.[0] ?? '—'} label="Biggest category" hint={byCat[0] ? money(byCat[0][1]) : undefined} onClick={byCat[0] ? () => setCat(byCat[0][0]) : undefined} />
        <StatCard icon={ReceiptIndianRupee} tone="ink" value={byCat.length} label="Categories used" />
      </div>
      {byCat.length > 1 && (
        <section className="panel card-pad" style={{ marginBottom: 16 }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {byCat.map(([c, amt]) => (
              <button key={c} type="button" className={`exp-chip${cat === c ? ' is-on' : ''}`} onClick={() => setCat(cat === c ? null : c)}>
                {c} · {money(amt)}
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-filters">
          <SearchInput placeholder="Category or note" value={q} onChange={setQ} width={240} />
          <div style={{ width: 200 }}>
            <SearchSelect value={cat} onChange={setCat} placeholder="All categories" options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
          </div>
          <DateRangePicker value={range} onChange={setRange} />
          {(q || cat || range.key !== 'all') && (
            <button
              type="button"
              className="clear-btn"
              onClick={() => {
                setQ('')
                setCat(null)
                setRange(ALL_DATES)
              }}
            >
              Reset
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={load} title="Refresh" aria-label="Refresh" style={{ marginLeft: 'auto' }}>
            <RefreshCw size={14} />
          </button>
        </div>
        {!rows ? (
          <div className="empty">Loading…</div>
        ) : !shown.length ? (
          <Empty icon={Wallet}>{mine.length ? 'No expenses for these filters.' : 'No expenses yet. Add what the business spends to see net profit.'}</Empty>
        ) : (
          <Paged rows={shown} reset={[q, cat, range.from, range.to]}>
            {(paged) => (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      {businesses.length > 1 && <th>Business</th>}
                      <th>Note</th>
                      <th className="num">Amount</th>
                      {canEdit && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((r) => (
                      <tr key={r.id} className={canEdit ? 'is-clickable' : undefined} onClick={() => canEdit && setOpen({ row: r })}>
                        <td className="nowrap">{fmtDay(r.spent_on)}</td>
                        <td>
                          <span className="badge badge-muted">{r.category}</span>
                        </td>
                        {businesses.length > 1 && <td className="small">{r.business_id ? bizName.get(r.business_id) : <span className="muted">All businesses</span>}</td>}
                        <td className="small">{r.note || <span className="muted">—</span>}</td>
                        <td className="num nowrap">{money(r.amount)}</td>
                        {canEdit && (
                          <td className="right">
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon btn-sm danger-text"
                              aria-label="Delete"
                              onClick={(e) => {
                                e.stopPropagation()
                                setRemoving(r)
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Paged>
        )}
      </section>

      {open && (
        <ExpenseDrawer
          row={open.row}
          defaultBusinessId={selected?.id ?? null}
          memberId={membership?.id}
          onClose={() => setOpen(null)}
          onSaved={(m) => {
            setOpen(null)
            setNotice(m)
            load()
          }}
        />
      )}
      <ConfirmModal
        open={!!removing}
        icon={Trash2}
        danger
        busy={busy}
        title="Delete this expense?"
        message={removing ? `${removing.category} · ${money(removing.amount)} on ${fmtDay(removing.spent_on)}. This can't be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </>
  )
}

function ExpenseDrawer({
  row,
  defaultBusinessId,
  memberId,
  onClose,
  onSaved,
}: {
  row: Expense | null
  defaultBusinessId: string | null
  memberId: string | undefined
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const { businesses } = useAuth()
  const [f, setF] = useState({
    spent_on: row?.spent_on ?? today(),
    category: row?.category ?? 'Ad Spend',
    amount: row ? String(row.amount) : '',
    business_id: row ? (row.business_id ?? '') : (defaultBusinessId ?? ''),
    note: row?.note ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((d) => ({ ...d, [k]: v }))

  async function save() {
    const amount = Number(f.amount)
    if (!(amount > 0)) return setError('Enter the amount.')
    if (!f.category) return setError('Pick the category.')
    setBusy(true)
    setError(null)
    const values = { spent_on: f.spent_on || today(), category: f.category, amount, business_id: f.business_id || null, note: f.note.trim() || null }
    const { error: e } = row
      ? await db().from('expenses').update(values).eq('id', row.id)
      : await db().from('expenses').insert({ ...values, tenant_id: tenant.id, created_by: memberId ?? null })
    setBusy(false)
    if (e) return setError(e.message)
    onSaved(row ? 'Expense saved.' : `${f.category} · ${money(amount)} added.`)
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={row ? 'Edit expense' : 'Add expense'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : row ? 'Save' : 'Add expense'}
            </Button>
          </div>
        </>
      }
    >
      <FormSection title="Expense">
        <div className="form-grid">
          <div>
            <Label htmlFor="ex-date" required>
              Date
            </Label>
            <TextInput id="ex-date" type="date" value={f.spent_on} onChange={(e) => set('spent_on', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ex-amt" required>
              Amount (₹)
            </Label>
            <TextInput id="ex-amt" type="number" min={0} step="0.01" value={f.amount} onChange={(e) => set('amount', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ex-cat" required>
              Category
            </Label>
            <SearchSelect id="ex-cat" value={f.category} onChange={(v) => set('category', v ?? '')} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
          </div>
          <div>
            <Label htmlFor="ex-biz">Business</Label>
            <SearchSelect
              id="ex-biz"
              value={f.business_id || null}
              onChange={(v) => set('business_id', v ?? '')}
              placeholder="All businesses"
              options={businesses.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>
          <div className="span-2">
            <Label htmlFor="ex-note">Note</Label>
            <TextArea id="ex-note" rows={2} value={f.note} placeholder="e.g. Facebook ads for BGR 31 May webinar" onChange={(e) => set('note', e.target.value)} />
          </div>
        </div>
      </FormSection>
    </Drawer>
  )
}
