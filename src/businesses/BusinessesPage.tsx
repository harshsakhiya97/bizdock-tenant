import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, ArchiveRestore, MapPin, Pencil, Plus, Search } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { listBusinesses, setBusinessArchived } from './api'
import { BusinessDrawer } from './BusinessDrawer'
import type { BusinessListRow, BusinessRow } from './types'

type Tab = 'active' | 'archived'

export function BusinessesPage() {
  const tenant = useTenant()
  const { can, refreshProfile } = useAuth()
  const [rows, setRows] = useState<BusinessListRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('active')
  const [query, setQuery] = useState('')
  const [drawer, setDrawer] = useState<{ business: BusinessRow | null } | null>(null)
  const [archiving, setArchiving] = useState<BusinessListRow | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    listBusinesses(tenant.id)
      .then(setRows)
      .catch((e: Error) => setError(e.message))
  }, [tenant.id])
  useEffect(load, [load])

  /** reload this list and the top-bar business switcher */
  const reload = useCallback(() => {
    load()
    void refreshProfile()
  }, [load, refreshProfile])

  const counts = useMemo(
    () => ({
      active: rows?.filter((b) => b.is_active).length ?? 0,
      archived: rows?.filter((b) => !b.is_active).length ?? 0,
    }),
    [rows],
  )
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows ?? [])
      .filter((b) => (tab === 'active' ? b.is_active : !b.is_active))
      .filter((b) => !q || b.name.toLowerCase().includes(q) || (b.city ?? '').toLowerCase().includes(q))
  }, [rows, tab, query])

  async function toggleArchive(b: BusinessListRow, archived: boolean) {
    setBusy(true)
    try {
      await setBusinessArchived(b.id, archived)
      setArchiving(null)
      reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold">Businesses</h2>
      <p className="mt-0.5 text-sm text-gray-600">Your businesses, their branches and details.</p>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            {(['active', 'archived'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-1 text-sm font-medium',
                  tab === t
                    ? 'border border-brand text-brand'
                    : 'border border-transparent text-gray-600 hover:bg-gray-50',
                )}
              >
                {t === 'active' ? 'Active' : 'Archived'}
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-xs font-semibold',
                    tab === t ? 'bg-brand-soft text-brand' : 'bg-gray-100 text-gray-600',
                  )}
                >
                  {counts[t]}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Search businesses"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 w-60 rounded-lg border border-gray-300 pr-3 pl-9 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </div>
            {can('businesses', 'add') && (
              <Button onClick={() => setDrawer({ business: null })}>
                <Plus /> Add Business
              </Button>
            )}
          </div>
        </div>

        {error ? (
          <p className="px-4 py-10 text-center text-sm text-red-600">{error}</p>
        ) : !rows ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">Loading businesses…</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">
            {query
              ? 'No businesses match your search.'
              : tab === 'active'
                ? 'No businesses yet. Add your first one.'
                : 'No archived businesses.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
                  <th className="px-4 py-2.5">Business</th>
                  <th className="px-4 py-2.5">City</th>
                  <th className="px-4 py-2.5">Branches</th>
                  <th className="px-4 py-2.5">Contact</th>
                  <th className="px-4 py-2.5">GST</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => {
                  const activeBranches = b.branches.filter((x) => x.is_active).length
                  return (
                    <tr key={b.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <BusinessIcon business={b} />
                          <div>
                            <div className="font-semibold text-gray-900">{b.name}</div>
                            {b.legal_name && <div className="text-xs text-gray-500">{b.legal_name}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {b.city ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5 text-gray-400" />
                            {b.city}
                            {b.state ? `, ${b.state}` : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {b.has_branches ? (
                          `${activeBranches} ${activeBranches === 1 ? 'branch' : 'branches'}`
                        ) : (
                          <span className="text-gray-400">Single location</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <div>{b.phone || '—'}</div>
                        {b.email && <div className="text-xs text-gray-500">{b.email}</div>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{b.gst_number || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {b.is_active ? (
                            <>
                              {can('businesses', 'edit') && (
                                <Button
                                  variant="ghost"
                                  onClick={() => setDrawer({ business: b })}
                                  aria-label={`Edit ${b.name}`}
                                >
                                  <Pencil /> Edit
                                </Button>
                              )}
                              {can('businesses', 'delete') && can('businesses', 'edit') && (
                                <Button
                                  variant="ghost"
                                  className="text-red-600"
                                  onClick={() => setArchiving(b)}
                                  aria-label={`Archive ${b.name}`}
                                >
                                  <Archive />
                                </Button>
                              )}
                            </>
                          ) : (
                            can('businesses', 'edit') && (
                              <Button variant="ghost" disabled={busy} onClick={() => toggleArchive(b, false)}>
                                <ArchiveRestore /> Restore
                              </Button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawer && (
        <BusinessDrawer
          business={drawer.business}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null)
            reload()
          }}
        />
      )}

      <Modal open={!!archiving} onClose={() => setArchiving(null)}>
        <h2 className="text-lg font-bold">Archive {archiving?.name}?</h2>
        <p className="mt-1 text-sm text-gray-600">
          It will be hidden from the business switcher and lists. All its data, branches and history are kept, and you
          can restore it any time from the Archived tab.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => setArchiving(null)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => archiving && toggleArchive(archiving, true)}>
            {busy ? 'Archiving…' : 'Archive'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function BusinessIcon({ business }: { business: Pick<BusinessRow, 'name' | 'logo_url'> }) {
  if (business.logo_url) {
    return (
      <img
        src={business.logo_url}
        alt=""
        className="size-9 shrink-0 rounded-lg border border-gray-200 bg-white object-contain"
      />
    )
  }
  return (
    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-sm font-bold text-brand">
      {business.name.trim().charAt(0).toUpperCase()}
    </div>
  )
}
