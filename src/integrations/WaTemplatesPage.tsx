import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { ConfirmModal, Empty, PageHead, SearchInput } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { WaBubble } from './WaBubble'
import { deleteWatiTemplate, listWatiTemplates, type WatiTemplate } from './watiApi'

const STATUS: Record<string, { label: string; tone: string }> = {
  APPROVED: { label: 'Approved', tone: 'badge-success' },
  PENDING: { label: 'Pending', tone: 'badge-warning' },
  REJECTED: { label: 'Rejected', tone: 'badge-danger' },
  DRAFT: { label: 'Draft', tone: 'badge-muted' },
  PAUSED: { label: 'Paused', tone: 'badge-warning' },
  DISABLED: { label: 'Disabled', tone: 'badge-muted' },
}
const statusOf = (s: string) => STATUS[(s ?? '').toUpperCase()] ?? { label: s || '—', tone: 'badge-muted' }
const cap = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '')
export const bubbleOf = (t: WatiTemplate) => ({
  headerType: t.header?.typeString ?? t.header?.headerTypeString ?? 'none',
  headerText: t.header?.text ?? null,
  body: t.bodyOriginal || t.body || '',
  footer: t.footer,
  buttons: (t.buttons ?? []).map((b) => ({ type: b.type, text: b.parameter?.text ?? '' })),
})

/** WhatsApp → Templates: the workspace's templates from its WhatsApp provider (WATI). */
export function WaTemplatesPage() {
  const tenant = useTenant()
  const [rows, setRows] = useState<WatiTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState('APPROVED')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [open, setOpen] = useState<WatiTemplate | null>(null)
  const [removing, setRemoving] = useState<WatiTemplate | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    listWatiTemplates(tenant.id)
      .then(setRows, (e: Error) => {
        setError(e.message)
        setRows((r) => r ?? [])
      })
      .finally(() => setLoading(false))
  }, [tenant.id])
  useEffect(load, [load])

  const cats = useMemo(() => [...new Set((rows ?? []).map((t) => t.category).filter(Boolean))], [rows])
  const base = (rows ?? []).filter(
    (t) => (!cat || t.category === cat) && (!q.trim() || `${t.elementName} ${t.body}`.toLowerCase().includes(q.trim().toLowerCase())),
  )
  const count = (s: string) => base.filter((t) => (t.status ?? '').toUpperCase() === s).length
  const tabs = [
    { id: 'APPROVED', label: 'Approved', n: count('APPROVED') },
    { id: 'PENDING', label: 'Pending', n: count('PENDING') },
    { id: 'REJECTED', label: 'Rejected', n: count('REJECTED') },
    { id: 'all', label: 'All', n: base.length },
  ]
  const shown = base
    .filter((t) => tab === 'all' || (t.status ?? '').toUpperCase() === tab)
    .sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''))

  return (
    <>
      <Link to="/integrations" className="back-link">
        <ArrowLeft size={15} /> System Connections
      </Link>
      <PageHead
        title="WhatsApp templates"
        subtitle="Your templates in WATI. New templates go to Meta for approval; only approved ones can be sent."
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={load} disabled={loading}>
              <RefreshCw size={15} className={cn(loading && 'spin')} /> Refresh
            </button>
            <Link to="/integrations/whatsapp/templates/new" className="btn btn-primary">
              <Plus size={16} /> New template
            </Link>
          </>
        }
      />
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-info">{notice}</div>}

      <div className="panel">
        <div className="panel-tabs">
          <div className="tabs">
            {tabs.map((t) => (
              <button key={t.id} type="button" className={cn('tab', tab === t.id && 'is-active')} onClick={() => setTab(t.id)}>
                {t.label} <span className="muted small">{t.n}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel-filters">
          <SearchInput placeholder="Template name or text" value={q} onChange={setQ} width={240} />
          <select className="input input-sm filter-select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {cap(c)}
              </option>
            ))}
          </select>
        </div>
        {!rows ? (
          <div className="empty">Loading templates from WATI…</div>
        ) : !shown.length ? (
          <Empty>{rows.length ? 'No templates here.' : 'No templates yet. Create one with “New template”.'}</Empty>
        ) : (
          <div className="tpl-grid">
            {shown.map((t) => {
              const st = statusOf(t.status)
              return (
                <button key={t.id} type="button" className="tpl-card" onClick={() => setOpen(t)}>
                  <div className="tpl-top">
                    <b>{t.elementName}</b>
                    <span className={cn('badge', st.tone)}>{st.label}</span>
                  </div>
                  <div className="muted small">
                    {cap(t.category)} · {t.language?.text ?? t.language?.value ?? '—'}
                  </div>
                  <div className="tpl-preview">
                    <WaBubble {...bubbleOf(t)} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {open && (
        <Modal
          open
          onClose={() => setOpen(null)}
          width={640}
          title={open.elementName}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(open)}>
                <Trash2 size={15} /> Delete
              </button>
              <div className="foot-end">
                <button type="button" className="btn btn-outline" onClick={() => setOpen(null)}>
                  Close
                </button>
              </div>
            </>
          }
        >
          <div className="tpl-view">
            <dl className="info-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={cn('badge', statusOf(open.status).tone)}>{statusOf(open.status).label}</span>
                </dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{cap(open.category)}</dd>
              </div>
              <div>
                <dt>Language</dt>
                <dd>{open.language?.text ?? open.language?.value ?? '—'}</dd>
              </div>
              <div>
                <dt>Last changed</dt>
                <dd>{open.lastModified ? new Date(open.lastModified).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</dd>
              </div>
              {!!open.customParams?.length && (
                <div style={{ gridColumn: 'span 2' }}>
                  <dt>Variables</dt>
                  <dd>{open.customParams.map((p) => `{{${p.paramName}}} e.g. ${p.paramValue}`).join(' · ')}</dd>
                </div>
              )}
            </dl>
            <div className="wa-phone">
              <WaBubble {...bubbleOf(open)} />
            </div>
          </div>
        </Modal>
      )}
      {removing && (
        <ConfirmModal
          open
          danger
          title={`Delete ${removing.elementName}?`}
          message="It is deleted in WATI and Meta too. Messages already sent are not affected."
          confirmLabel="Delete"
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const t = removing
            setRemoving(null)
            setOpen(null)
            try {
              await deleteWatiTemplate(tenant.id, t)
              setNotice(`${t.elementName} deleted.`)
              load()
            } catch (e) {
              setError((e as Error).message)
            }
          }}
        />
      )}
    </>
  )
}
