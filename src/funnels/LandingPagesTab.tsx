import { useState } from 'react'
import { Check, Copy, ExternalLink, Globe, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { ConfirmModal, Empty } from '@/components/ui'
import { cn } from '@/lib/cn'
import { archiveLandingPage, deleteUtmLink, matchesUtm, setLandingPageActive, utmUrl } from './api'
import { LandingPageModal } from './LandingPageModal'
import type { LandingPage, SubmissionRow, UtmLink } from './types'
import { UtmModal } from './UtmModal'
import { useCopy } from './useCopy'

type Confirm =
  | { kind: 'delete'; page: LandingPage }
  | { kind: 'utm'; utm: UtmLink }

/** A funnel's landing pages: page link and UTM links (webhooks are on their own tab, not tied to a page). */
export function LandingPagesTab({
  funnelId,
  pages,
  submissions,
  canEdit,
  onChanged,
  onError,
}: {
  funnelId: string
  pages: LandingPage[] | null
  submissions: SubmissionRow[]
  canEdit: boolean
  onChanged: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [editing, setEditing] = useState<{ page: LandingPage | null } | null>(null)
  const [utmFor, setUtmFor] = useState<LandingPage | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [busy, setBusy] = useState(false)
  const { copied, copy } = useCopy()
  // new leads from any form, matched to a UTM link by its utm_* values
  const newSubs = submissions.filter((s) => s.is_new && s.via !== 'import')

  async function run(fn: () => Promise<void>, msg: string) {
    setBusy(true)
    try {
      await fn()
      onChanged(msg)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  if (!pages) return <div className="empty">Loading landing pages…</div>

  return (
    <>
      <div className="row-between" style={{ marginBottom: 14 }}>
        <p className="muted small" style={{ margin: 0 }}>
          The funnel’s landing pages and their UTM links (one per ad or post). Leads come in through the Webhooks tab; a lead counts for a UTM link when its form post carries the link’s utm_* values.
        </p>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ page: null })}>
            <Plus size={16} /> Add landing page
          </button>
        )}
      </div>

      {pages.length === 0 ? (
        <Empty icon={Globe}>No landing pages yet. Add one to make UTM links for it.</Empty>
      ) : (
        <div className="stack">
          {pages.map((p) => {
            return (
              <section key={p.id} className={cn('card lp-card', !p.is_active && 'is-off')}>
                <div className="lp-head">
                  <div className="lp-title">
                    <b>{p.name}</b>
                    <span className={cn('badge', p.is_active ? 'badge-success' : 'badge-muted')}>{p.is_active ? 'Active' : 'Off'}</span>
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noreferrer" className="link small lp-url">
                        {p.url.replace(/^https?:\/\//, '')} <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  {canEdit && (
                    <div className="row-actions">
                      <button type="button" className="btn btn-ghost btn-icon" title="Edit" aria-label={`Edit ${p.name}`} onClick={() => setEditing({ page: p })}>
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        title={p.is_active ? 'Turn off' : 'Turn on'}
                        aria-label={p.is_active ? `Turn off ${p.name}` : `Turn on ${p.name}`}
                        disabled={busy}
                        onClick={() => run(() => setLandingPageActive(p.id, !p.is_active), p.is_active ? `${p.name} turned off.` : `${p.name} turned on.`)}
                      >
                        <Power size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon danger-text"
                        title="Delete"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => setConfirm({ kind: 'delete', page: p })}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="lp-block">
                  <div className="row-between">
                    <span className="lp-label">UTM links</span>
                    {canEdit && (
                      <button type="button" className="add-chip" onClick={() => setUtmFor(p)}>
                        <Plus size={14} /> UTM link
                      </button>
                    )}
                  </div>
                  {p.landing_page_utms.length === 0 ? (
                    <div className="muted small">No UTM links yet. Add one per ad or post to see which brings the leads.</div>
                  ) : (
                    <div className="table-wrap">
                      <table className="table table-compact">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Source / medium / campaign / content</th>
                            <th className="right">Leads</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {p.landing_page_utms.map((u) => {
                            const link = utmUrl(p.url, u)
                            const n = newSubs.filter((s) => matchesUtm(s, u)).length
                            return (
                              <tr key={u.id}>
                                <td>
                                  <b>{u.label}</b>
                                </td>
                                <td className="muted small">
                                  {[u.utm_source, u.utm_medium, u.utm_campaign, u.utm_content].map((v) => v || '—').join(' / ')}
                                </td>
                                <td className="right">{n}</td>
                                <td className="nowrap" style={{ textAlign: 'right' }}>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    disabled={!link}
                                    title={link || 'Add the page link first'}
                                    onClick={() => copy(`u-${u.id}`, link)}
                                  >
                                    {copied === `u-${u.id}` ? <Check size={14} /> : <Copy size={14} />} {copied === `u-${u.id}` ? 'Copied' : 'Copy link'}
                                  </button>
                                  {canEdit && (
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-icon danger-text"
                                      aria-label={`Delete ${u.label}`}
                                      onClick={() => setConfirm({ kind: 'utm', utm: u })}
                                    >
                                      <Trash2 size={14} />
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
                </div>

              </section>
            )
          })}
        </div>
      )}

      {editing && (
        <LandingPageModal
          funnelId={funnelId}
          page={editing.page}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null)
            onChanged(msg)
          }}
        />
      )}
      {utmFor && (
        <UtmModal
          page={utmFor}
          onClose={() => setUtmFor(null)}
          onSaved={(msg) => {
            setUtmFor(null)
            onChanged(msg)
          }}
        />
      )}

      <ConfirmModal
        open={!!confirm}
        icon={Trash2}
        danger
        title={`Delete ${confirm?.kind === 'delete' ? confirm.page.name : confirm?.kind === 'utm' ? confirm.utm.label : ''}?`}
        message={
          confirm?.kind === 'delete'
            ? 'The page and its UTM links are removed from this list. Leads are kept.'
            : 'The link is removed from this list. Leads that came through it keep their UTMs.'
        }
        confirmLabel={busy ? 'Working…' : 'Delete'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return
          if (confirm.kind === 'delete') void run(() => archiveLandingPage(confirm.page.id), `${confirm.page.name} deleted.`)
          else void run(() => deleteUtmLink(confirm.utm.id), `${confirm.utm.label} deleted.`)
        }}
      />
    </>
  )
}
