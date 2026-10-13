import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { ConfirmModal, DataTable, PageHead, SearchInput, Tabs, type Column } from '@/components/ui'
import { useTenant } from '@/tenant/useTenant'
import { listBusinesses, setBusinessArchived } from './api'
import { BusinessDrawer } from './BusinessDrawer'
import type { BusinessListRow, BusinessRow } from './types'

export function BusinessesPage() {
  const tenant = useTenant()
  const { can, refreshProfile } = useAuth()
  const [rows, setRows] = useState<BusinessListRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows ?? [])
      .filter((b) => b.is_active)
      .filter((b) => !q || b.name.toLowerCase().includes(q) || (b.city ?? '').toLowerCase().includes(q))
  }, [rows, query])

  const visibleCount = rows?.filter((b) => b.is_active).length ?? 0

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

  const columns: Column<BusinessListRow>[] = [
    {
      key: 'business',
      label: 'Business',
      render: (b) => (
        <div className="cell-main">
          <BusinessIcon business={b} />
          <div>
            <span className="strong">{b.name}</span>
            {b.legal_name && <small>{b.legal_name}</small>}
          </div>
        </div>
      ),
    },
    {
      key: 'city',
      label: 'City',
      render: (b) =>
        b.city ? (
          <span className="row nowrap" style={{ gap: 4 }}>
            <MapPin size={13} className="muted" />
            {b.city}
            {b.state ? `, ${b.state}` : ''}
          </span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'contact',
      label: 'Contact',
      render: (b) => (
        <>
          <div>{b.phone || '—'}</div>
          {b.email && <div className="muted small">{b.email}</div>}
        </>
      ),
    },
    {
      key: 'gst',
      label: 'GST',
      render: (b) => (b.gst_number ? <span className="code-chip">{b.gst_number}</span> : <span className="muted">—</span>),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (b) => (
        <div className="row-actions">
          {can('businesses', 'edit') && (
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              title="Edit"
              aria-label={`Edit ${b.name}`}
              onClick={() => setDrawer({ business: b })}
            >
              <Pencil size={15} />
            </button>
          )}
          {can('businesses', 'delete') && can('businesses', 'edit') && (
            <button
              type="button"
              className="btn btn-ghost btn-icon danger-text"
              title="Delete"
              aria-label={`Delete ${b.name}`}
              onClick={() => setArchiving(b)}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHead title="Businesses" subtitle="Your businesses and their details." />

      <div className="panel">
        <div className="panel-bar">
          <Tabs tabs={['All Businesses']} value="All Businesses" count={`${visibleCount} Businesses`} />
          <div className="row">
            <SearchInput placeholder="Search businesses" value={query} onChange={setQuery} />
            {can('businesses', 'add') && (
              <button type="button" className="btn btn-primary" onClick={() => setDrawer({ business: null })}>
                <Plus size={16} /> Add Business
              </button>
            )}
          </div>
        </div>

        {error ? (
          <div className="empty danger-text">{error}</div>
        ) : !rows ? (
          <div className="empty">Loading businesses…</div>
        ) : (
          <DataTable
            bare
            columns={columns}
            rows={visible}
            empty={query ? 'No businesses match your search.' : 'No businesses yet. Add your first one.'}
          />
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

      <ConfirmModal
        open={!!archiving}
        icon={Trash2}
        danger
        title={`Delete ${archiving?.name ?? ''}?`}
        message="It will be removed from the business switcher and lists. Its data and history are kept, so it can be restored later if needed."
        confirmLabel={busy ? 'Deleting…' : 'Delete'}
        busy={busy}
        onCancel={() => setArchiving(null)}
        onConfirm={() => archiving && toggleArchive(archiving, true)}
      />
    </>
  )
}

function BusinessIcon({ business }: { business: Pick<BusinessRow, 'name' | 'logo_url'> }) {
  if (business.logo_url) {
    return (
      <span className="thumb has-img">
        <img src={business.logo_url} alt="" />
      </span>
    )
  }
  return <span className="thumb thumb-letter">{business.name.trim().charAt(0).toUpperCase()}</span>
}
