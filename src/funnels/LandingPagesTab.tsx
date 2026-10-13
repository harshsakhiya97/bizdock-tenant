import { useMemo, useState } from 'react'
import { Check, Code2, Copy, ExternalLink, Globe, Pencil, Plus, Power, RefreshCw, Trash2 } from 'lucide-react'
import { ConfirmModal, Empty } from '@/components/ui'
import { cn } from '@/lib/cn'
import { archiveLandingPage, deleteUtmLink, matchesUtm, regenerateWebhookKey, setLandingPageActive, utmUrl, webhookUrl } from './api'
import { LandingPageModal } from './LandingPageModal'
import { htmlSnippet, jsSnippet } from './snippets'
import type { LandingPage, SubmissionRow, UtmLink } from './types'
import { UtmModal } from './UtmModal'
import { useCopy } from './useCopy'

type Confirm =
  | { kind: 'regen'; page: LandingPage }
  | { kind: 'delete'; page: LandingPage }
  | { kind: 'utm'; utm: UtmLink }

/** A funnel's landing pages: page link, webhook URL, form fields, UTM links and lead counts. */
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
  const [snippet, setSnippet] = useState<Record<string, 'html' | 'js' | undefined>>({})
  const [busy, setBusy] = useState(false)
  const { copied, copy } = useCopy()

  // leads created / form posts per page (webhook only)
  const stats = useMemo(() => {
    const m = new Map<string, { leads: number; posts: number; subs: SubmissionRow[] }>()
    for (const s of submissions) {
      if (!s.landing_page_id || s.via !== 'webhook') continue
      const c = m.get(s.landing_page_id) ?? { leads: 0, posts: 0, subs: [] }
      c.posts++
      if (s.is_new) c.leads++
      c.subs.push(s)
      m.set(s.landing_page_id, c)
    }
    return m
  }, [submissions])

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
          Each landing page gets its own webhook URL. Its form posts name, email, phone and its extra fields; the lead is added to the
          funnel’s first stage with the funnel’s tags and the UTMs. The same phone again updates that lead.
        </p>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ page: null })}>
            <Plus size={16} /> Add landing page
          </button>
        )}
      </div>

      {pages.length === 0 ? (
        <Empty icon={Globe}>No landing pages yet. Add one to get its webhook URL.</Empty>
      ) : (
        <div className="stack">
          {pages.map((p) => {
            const st = stats.get(p.id) ?? { leads: 0, posts: 0, subs: [] }
            const url = webhookUrl(p.webhook_key)
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
                  <div className="lp-counts">
                    <span>
                      <b>{st.leads}</b> new lead{st.leads === 1 ? '' : 's'}
                    </span>
                    <span>
                      <b>{st.posts}</b> form post{st.posts === 1 ? '' : 's'}
                    </span>
                  </div>
                  {canEdit && (
                    <div className="row-actions">
                      <button type="button" className="btn btn-ghost btn-icon" title="Edit" aria-label={`Edit ${p.name}`} onClick={() => setEditing({ page: p })}>
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        title={p.is_active ? 'Turn off (the webhook stops accepting leads)' : 'Turn on'}
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
                  <span className="lp-label">Webhook URL</span>
                  <div className="code-line with-actions">
                    <span className="cell-clip">{url}</span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => copy(`wh-${p.id}`, url)}>
                      {copied === `wh-${p.id}` ? <Check size={14} /> : <Copy size={14} />} {copied === `wh-${p.id}` ? 'Copied' : 'Copy'}
                    </button>
                    {canEdit && (
                      <button type="button" className="btn btn-ghost btn-sm" title="New secret key; the old URL stops working" onClick={() => setConfirm({ kind: 'regen', page: p })}>
                        <RefreshCw size={14} /> Regenerate
                      </button>
                    )}
                  </div>
                </div>

                <div className="lp-grid">
                  <div className="lp-block">
                    <span className="lp-label">Form fields</span>
                    <div className="chip-row">
                      {['name', 'email', 'phone'].map((k) => (
                        <span key={k} className="field-chip">
                          {k} <i>*</i>
                        </span>
                      ))}
                      {p.fields.map((f) => (
                        <span key={f.key} className="field-chip" title={f.label}>
                          {f.key}
                          {f.required && <i>*</i>}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="lp-block">
                    <span className="lp-label">Default UTMs</span>
                    <span className="small">
                      {[p.utm_source, p.utm_medium, p.utm_campaign].filter(Boolean).join(' / ') || <span className="muted">None</span>}
                    </span>
                  </div>
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
                            const n = st.subs.filter((s) => s.is_new && matchesUtm(s, u)).length
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

                <div className="lp-block">
                  <div className="row">
                    <span className="lp-label" style={{ marginRight: 4 }}>
                      <Code2 size={13} /> How to connect
                    </span>
                    <div className="seg seg-sm">
                      <button type="button" className={cn(snippet[p.id] === 'html' && 'is-active')} onClick={() => setSnippet((s) => ({ ...s, [p.id]: s[p.id] === 'html' ? undefined : 'html' }))}>
                        HTML form
                      </button>
                      <button type="button" className={cn(snippet[p.id] === 'js' && 'is-active')} onClick={() => setSnippet((s) => ({ ...s, [p.id]: s[p.id] === 'js' ? undefined : 'js' }))}>
                        JavaScript
                      </button>
                    </div>
                  </div>
                  {snippet[p.id] && (
                    <div className="snippet">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm snippet-copy"
                        onClick={() => copy(`s-${p.id}`, snippet[p.id] === 'html' ? htmlSnippet(p) : jsSnippet(p))}
                      >
                        {copied === `s-${p.id}` ? <Check size={14} /> : <Copy size={14} />} {copied === `s-${p.id}` ? 'Copied' : 'Copy'}
                      </button>
                      <pre>{snippet[p.id] === 'html' ? htmlSnippet(p) : jsSnippet(p)}</pre>
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
        icon={confirm?.kind === 'regen' ? RefreshCw : Trash2}
        danger
        title={
          confirm?.kind === 'regen'
            ? 'Regenerate the webhook URL?'
            : confirm?.kind === 'delete'
              ? `Delete ${confirm.page.name}?`
              : `Delete ${confirm?.kind === 'utm' ? confirm.utm.label : ''}?`
        }
        message={
          confirm?.kind === 'regen'
            ? 'The current URL stops working straight away. Put the new URL in the landing page form after this.'
            : confirm?.kind === 'delete'
              ? 'Its webhook stops accepting leads. Leads that already came from it are kept.'
              : 'The link is removed from this list. Leads that came through it keep their UTMs.'
        }
        confirmLabel={busy ? 'Working…' : confirm?.kind === 'regen' ? 'Regenerate' : 'Delete'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return
          if (confirm.kind === 'regen') void run(() => regenerateWebhookKey(confirm.page.id), 'New webhook URL created. Update the landing page form.')
          else if (confirm.kind === 'delete') void run(() => archiveLandingPage(confirm.page.id), `${confirm.page.name} deleted.`)
          else void run(() => deleteUtmLink(confirm.utm.id), `${confirm.utm.label} deleted.`)
        }}
      />
    </>
  )
}
