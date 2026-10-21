import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Package, Pencil, Plus } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Empty, PageHead } from '@/components/ui'
import { money } from '@/leads/labels'
import { cn } from '@/lib/cn'
import { db } from '@/lib/supabase'
import { useTenant } from '@/tenant/useTenant'
import { listProducts } from './api'
import { ProductDrawer } from './ProductDrawer'
import { SimpleList } from './SimpleList'
import { TemplatesTab } from './TemplatesTab'
import type { ProductRow, SimpleTable } from './types'
import { Flash } from '@/components/Flash'

type Tab = 'overview' | 'products' | 'whatsapp' | SimpleTable

const SIMPLE: Partial<Record<SimpleTable, { title: string; purpose: string }>> = {
  payment_modes: { title: 'Payment modes', purpose: 'How money was received.' },
  lead_sources: { title: 'Lead sources', purpose: 'Where a lead came from.' },
  follow_up_outcomes: { title: 'Follow-up outcomes', purpose: 'The result of a call or follow-up.' },
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'products', label: 'Services' },
  { id: 'payment_modes', label: 'Payment modes' },
  { id: 'lead_sources', label: 'Lead sources' },
  { id: 'follow_up_outcomes', label: 'Follow-up outcomes' },
  { id: 'whatsapp', label: 'WhatsApp messages' },
]

/** Masters: the editable lists every module picks from. */
export function MastersPage() {
  const { can } = useAuth()
  const canEdit = can('masters', 'edit')
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'overview') as Tab
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const go = (t: Tab) => {
    setNotice({})
    setParams(t === 'overview' ? {} : { tab: t })
  }
  const onNotice = useCallback((n: { ok?: string; error?: string }) => setNotice(n), [])

  return (
    <>
      <PageHead title="Masters" subtitle="The lists the rest of the app picks from. Changes apply everywhere straight away." />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      <div className="panel">
        <div className="panel-tabs">
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={cn('tab', tab === t.id && 'is-active')} onClick={() => go(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {tab === 'overview' && <Overview go={go} />}
        {tab === 'products' && <ProductsTab canEdit={canEdit} onNotice={onNotice} />}
        {tab === 'whatsapp' && <TemplatesTab canEdit={canEdit} onNotice={onNotice} />}
        {tab in SIMPLE && (
          <SimpleList
            key={tab}
            table={tab as SimpleTable}
            title={SIMPLE[tab as SimpleTable]!.title}
            description={SIMPLE[tab as SimpleTable]!.purpose}
            canEdit={canEdit}
            onNotice={onNotice}
          />
        )}
      </div>
    </>
  )
}

function Overview({ go }: { go: (t: Tab) => void }) {
  const tenant = useTenant()
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    const tables = ['products', ...Object.keys(SIMPLE)]
    void Promise.all(
      tables.map((t) =>
        db()
          .from(t)
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('is_active', true)
          .then(({ count }) => [t, count ?? 0] as const),
      ),
    ).then((r) => setCounts(Object.fromEntries(r)))
  }, [tenant.id])

  const rows: { tab: Tab; label: string; table: string; purpose: string }[] = [
    { tab: 'products', label: 'Services', table: 'products', purpose: 'Services offered on a booking: price and GST, per business.' },
    ...(Object.keys(SIMPLE) as SimpleTable[]).map((t) => ({ tab: t, label: SIMPLE[t]!.title, table: t, purpose: SIMPLE[t]!.purpose })),
  ]
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Master list</th>
            <th>Active entries</th>
            <th>Used for</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tab} className="is-clickable" onClick={() => go(r.tab)}>
              <td>
                <button type="button" className="link-btn">
                  {r.label}
                </button>
              </td>
              <td>{counts[r.table] ?? '…'}</td>
              <td className="muted">{r.purpose}</td>
            </tr>
          ))}
          <tr>
            <td>
              <Link to="/funnels" className="link-btn">
                Funnels & stages
              </Link>
            </td>
            <td className="muted">—</td>
            <td className="muted">Lead stages are set per funnel on the Funnels page.</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function ProductsTab({ canEdit, onNotice }: { canEdit: boolean; onNotice: (n: { ok?: string; error?: string }) => void }) {
  const tenant = useTenant()
  const { businesses } = useAuth()
  const { selected, sub } = useBusiness()
  const [rows, setRows] = useState<ProductRow[] | null>(null)
  const [drawer, setDrawer] = useState<{ product: ProductRow | null } | null>(null)
  const [showOff, setShowOff] = useState(false)

  const load = useCallback(() => {
    listProducts(tenant.id)
      .then(setRows)
      .catch((e: Error) => onNotice({ error: e.message }))
  }, [tenant.id, onNotice])
  useEffect(load, [load])

  const bizName = useMemo(() => new Map(businesses.map((b) => [b.id, b.name])), [businesses])
  const visible = (rows ?? [])
    .filter((p) => (selected ? p.business_id === selected.id : bizName.has(p.business_id)))
    .filter((p) => !sub || !p.sub_business_id || p.sub_business_id === sub.id)
    .filter((p) => showOff || p.is_active)

  return (
    <>
      <div className="panel-bar">
        <div>
          <b>Services</b>
          <div className="muted small">
            {selected ? `Services of ${selected.name}${sub ? ` · ${sub.name}` : ''}.` : 'Services of every business.'} Pick the business in the top bar to narrow the list.
          </div>
        </div>
        <div className="row">
          <label className="check-inline">
            <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Show inactive
          </label>
          {canEdit && (
            <button type="button" className="btn btn-primary" onClick={() => setDrawer({ product: null })} disabled={!businesses.length}>
              <Plus size={16} /> Add service
            </button>
          )}
        </div>
      </div>
      {!rows ? (
        <div className="empty">Loading…</div>
      ) : visible.length === 0 ? (
        <Empty icon={Package}>No services yet. Add the services you offer (studio, editing, host…) so they can be picked on a booking.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Service</th>
                {!selected && <th>Business</th>}
                <th className="right">Price</th>
                <th>GST</th>
                <th className="right">With GST</th>
                <th>Status</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const total = Number(p.price) * (1 + (p.gst_applicable ? Number(p.gst_rate) : 0) / 100)
                return (
                  <tr key={p.id} className={canEdit ? 'is-clickable' : undefined} onClick={() => canEdit && setDrawer({ product: p })}>
                    <td>
                      <b>{p.name}</b>
                      {p.sub_business_id && <div className="muted small">{businesses.find((b) => b.id === p.business_id)?.subs.find((x) => x.id === p.sub_business_id)?.name}</div>}
                    </td>
                    {!selected && <td>{bizName.get(p.business_id) ?? '—'}</td>}
                    <td className="right nowrap">{money(p.price)}</td>
                    <td>{p.gst_applicable ? `${Number(p.gst_rate)}%` : <span className="muted">No GST</span>}</td>
                    <td className="right nowrap">{money(total)}</td>
                    <td>
                      <span className={cn('badge', p.is_active ? 'badge-success' : 'badge-muted')}>{p.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    {canEdit && (
                      <td className="right">
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Edit ${p.name}`}>
                          <Pencil size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {drawer && (
        <ProductDrawer
          product={drawer.product}
          businesses={businesses}
          defaultBusinessId={selected?.id ?? null}
          nextOrder={Math.max(0, ...(rows ?? []).map((r) => r.sort_order)) + 1}
          onClose={() => setDrawer(null)}
          onSaved={(msg) => {
            setDrawer(null)
            onNotice({ ok: msg })
            load()
          }}
        />
      )}
    </>
  )
}
