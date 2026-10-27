import { useEffect, useMemo, useState } from 'react'
import { Check, Code2, Copy, Network, Pencil, Plus, Power, RefreshCw, Trash2, Webhook } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { workflowForWebhook } from '@/workflows/api'
import { Button } from '@/components/Button'
import { Hint, Label, Select, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { ConfirmModal, Empty } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { addWebhook, deleteWebhook, regenerateWebhookKey, setWebhookActive, updateWebhook, webhookUrl } from './api'
import { FieldMapping } from './FieldMapping'
import { curlSnippet, htmlSnippet, jsSnippet } from './snippets'
import { MATCH_BY, WEBHOOK_ACTIONS, type FunnelWebhook, type MatchBy, type SubmissionRow, type WebhookAction } from './types'
import { useCopy } from './useCopy'

type Kind = 'html' | 'js' | 'curl'
const snippetFor = (h: FunnelWebhook, kind: Kind | undefined) => (kind === 'html' ? htmlSnippet(h) : kind === 'curl' ? curlSnippet(h) : jsSnippet(h))

type Confirm = { kind: 'regen'; hook: FunnelWebhook } | { kind: 'delete'; hook: FunnelWebhook }

/** A funnel's webhook URLs (one per form, on any page): URL, field mapping, how to connect and lead counts. */
export function WebhooksTab({
  funnelId,
  hooks,
  submissions,
  canEdit,
  onChanged,
  onError,
}: {
  funnelId: string
  hooks: FunnelWebhook[] | null
  submissions: SubmissionRow[]
  canEdit: boolean
  onChanged: (msg: string) => void
  onError: (msg: string) => void
}) {
  const tenant = useTenant()
  const navigate = useNavigate()
  const { can, membership } = useAuth()
  const canWorkflow = can('workflows', 'view') && (can('workflows', 'add') || can('workflows', 'edit'))
  async function openWorkflow(h: FunnelWebhook) {
    setBusy(true)
    try {
      navigate(`/workflows/${await workflowForWebhook(tenant.id, membership?.id, funnelId, h)}`)
    } catch (e) {
      onError((e as Error).message)
      setBusy(false)
    }
  }
  const [naming, setNaming] = useState<{ hook: FunnelWebhook | null } | null>(null)
  const [hookName, setHookName] = useState('')
  const [hookAction, setHookAction] = useState<WebhookAction>('create_lead')
  const [hookMatch, setHookMatch] = useState<MatchBy>('phone')
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [snippet, setSnippet] = useState<Record<string, Kind | undefined>>({})
  const [busy, setBusy] = useState(false)
  const { copied, copy } = useCopy()
  useEffect(() => {
    setHookName(naming?.hook?.name ?? '')
    setHookAction(naming?.hook?.action ?? 'create_lead')
    setHookMatch(naming?.hook?.match_by ?? 'phone')
  }, [naming])

  // new leads / form posts per webhook
  const stats = useMemo(() => {
    const m = new Map<string, { leads: number; posts: number; matched: number; missed: number }>()
    for (const s of submissions) {
      if (!s.webhook_id) continue
      const c = m.get(s.webhook_id) ?? { leads: 0, posts: 0, matched: 0, missed: 0 }
      c.posts++
      if (s.is_new) c.leads++
      if (s.result === 'no_match') c.missed++
      else if (s.result) c.matched++
      m.set(s.webhook_id, c)
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

  if (!hooks) return <div className="empty">Loading webhooks…</div>

  return (
    <>
      <div className="row-between" style={{ marginBottom: 14 }}>
        <p className="muted small" style={{ margin: 0 }}>
          One webhook URL per form or tool. Each one does one thing: create a new lead, update a lead’s fields, book a meeting for a lead, or log a purchase. Send one test to match its fields; after that every post does that thing.
        </p>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => setNaming({ hook: null })}>
            <Plus size={16} /> Add webhook
          </button>
        )}
      </div>

      {hooks.length === 0 ? (
        <Empty icon={Webhook}>No webhooks yet. Add one and put its URL in your form.</Empty>
      ) : (
        <div className="stack">
          {hooks.map((h) => {
            const url = webhookUrl(h.webhook_key)
            const st = stats.get(h.id) ?? { leads: 0, posts: 0, matched: 0, missed: 0 }
            const act = WEBHOOK_ACTIONS.find((a) => a.value === h.action) ?? WEBHOOK_ACTIONS[0]
            return (
              <section key={h.id} className={cn('card lp-card', !h.is_active && 'is-off')}>
                <div className="lp-head">
                  <div className="lp-title">
                    <Webhook size={16} />
                    <b>{h.name}</b>
                    <span className={cn('badge', h.is_active ? 'badge-success' : 'badge-muted')}>{h.is_active ? 'Active' : 'Off'}</span>
                    <span className="badge badge-info" title={act.hint}>
                      {act.badge}
                    </span>
                  </div>
                  <div className="lp-counts">
                    {h.action === 'create_lead' ? (
                      <span>
                        <b>{st.leads}</b> new lead{st.leads === 1 ? '' : 's'}
                      </span>
                    ) : (
                      <>
                        <span>
                          <b>{st.matched}</b> matched
                        </span>
                        {st.missed > 0 && (
                          <span className="tone-warning" title="Posts where no lead had this phone / email (logged only)">
                            <b>{st.missed}</b> no match
                          </span>
                        )}
                      </>
                    )}
                    <span>
                      <b>{st.posts}</b> form post{st.posts === 1 ? '' : 's'}
                    </span>
                  </div>
                  {canEdit && (
                    <div className="row-actions">
                      <button type="button" className="btn btn-ghost btn-icon" title="Edit" aria-label={`Edit ${h.name}`} onClick={() => setNaming({ hook: h })}>
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        title={h.is_active ? 'Turn off (this URL stops accepting leads)' : 'Turn on'}
                        aria-label={h.is_active ? `Turn off ${h.name}` : `Turn on ${h.name}`}
                        disabled={busy}
                        onClick={() => run(() => setWebhookActive(h.id, !h.is_active), h.is_active ? `${h.name} turned off.` : `${h.name} turned on.`)}
                      >
                        <Power size={15} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-icon danger-text" title="Delete" aria-label={`Delete ${h.name}`} onClick={() => setConfirm({ kind: 'delete', hook: h })}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="lp-block">
                  <div className="code-line with-actions">
                    <span className="cell-clip">{url}</span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => copy(`wh-${h.id}`, url)}>
                      {copied === `wh-${h.id}` ? <Check size={14} /> : <Copy size={14} />} {copied === `wh-${h.id}` ? 'Copied' : 'Copy'}
                    </button>
                    {canEdit && (
                      <button type="button" className="btn btn-ghost btn-sm" title="New secret key; the old URL stops working" onClick={() => setConfirm({ kind: 'regen', hook: h })}>
                        <RefreshCw size={14} /> Regenerate
                      </button>
                    )}
                  </div>
                  <FieldMapping
                    key={`${h.id}-${h.sample_at ?? ''}`}
                    hook={h}
                    canEdit={canEdit}
                    onChanged={onChanged}
                    onError={onError}
                    actions={
                      canWorkflow && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => void openWorkflow(h)} disabled={busy} title="Open the workflow this form starts (made for you the first time)">
                          <Network size={14} /> Workflow
                        </button>
                      )
                    }
                  />
                  <div className="row">
                    <span className="lp-label" style={{ marginRight: 4 }}>
                      <Code2 size={13} /> How to connect
                    </span>
                    <div className="seg seg-sm">
                      {(['html', 'js', 'curl'] as const).map((k) => (
                        <button key={k} type="button" className={cn(snippet[h.id] === k && 'is-active')} onClick={() => setSnippet((x) => ({ ...x, [h.id]: x[h.id] === k ? undefined : k }))}>
                          {k === 'html' ? 'HTML form' : k === 'js' ? 'JavaScript' : 'cURL'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {snippet[h.id] && (
                    <div className="snippet">
                      <button type="button" className="btn btn-outline btn-sm snippet-copy" onClick={() => copy(`s-${h.id}`, snippetFor(h, snippet[h.id]))}>
                        {copied === `s-${h.id}` ? <Check size={14} /> : <Copy size={14} />} {copied === `s-${h.id}` ? 'Copied' : 'Copy'}
                      </button>
                      <pre>{snippetFor(h, snippet[h.id])}</pre>
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {naming && (
        <Modal
          open
          onClose={() => setNaming(null)}
          width={560}
          title={naming.hook ? 'Edit webhook' : 'New webhook'}
          footer={
            <>
              <Button variant="outline" onClick={() => setNaming(null)}>
                Cancel
              </Button>
              <div className="foot-end">
                <Button
                  disabled={busy || !hookName.trim()}
                  onClick={() => {
                    const n = naming
                    setNaming(null)
                    const w = { name: hookName, action: hookAction, match_by: hookMatch }
                    void run(
                      () => (n.hook ? updateWebhook(n.hook.id, w) : addWebhook(tenant.id, funnelId, w)),
                      n.hook ? 'Webhook saved.' : `Webhook ${hookName.trim()} added. Copy its URL into that form.`,
                    )
                  }}
                >
                  {naming.hook ? 'Save' : 'Add webhook'}
                </Button>
              </div>
            </>
          }
        >
          <Label htmlFor="hook-name" required>
            Name
          </Label>
          <TextInput id="hook-name" autoFocus placeholder="e.g. Hero form, Booking tool, Razorpay" value={hookName} onChange={(e) => setHookName(e.target.value)} />

          <span className="field-label" style={{ marginTop: 16, display: 'block' }}>
            What does each post do?
          </span>
          <div className="wh-actions">
            {WEBHOOK_ACTIONS.map((a) => (
              <label key={a.value} className={cn('wh-action', hookAction === a.value && 'is-on')}>
                <input type="radio" name="wh-action" checked={hookAction === a.value} onChange={() => setHookAction(a.value)} />
                <span>
                  <b>{a.label}</b>
                  <small>{a.hint}</small>
                </span>
              </label>
            ))}
          </div>

          {hookAction !== 'create_lead' && (
            <div style={{ marginTop: 14 }}>
              <Label htmlFor="hook-match" required>
                Find the lead by
              </Label>
              <Select id="hook-match" value={hookMatch} onChange={(e) => setHookMatch(e.target.value as MatchBy)}>
                {MATCH_BY.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <Hint>Looked up among this business’s leads. If no lead matches, the post is only logged (shown as “no match”).</Hint>
            </div>
          )}
          {naming.hook && naming.hook.action !== hookAction && (
            <div className="alert alert-warning small" style={{ marginTop: 12 }}>
              Changing what the webhook does: check its field mapping after saving.
            </div>
          )}
        </Modal>
      )}

      <ConfirmModal
        open={!!confirm}
        icon={confirm?.kind === 'regen' ? RefreshCw : Trash2}
        danger
        title={confirm?.kind === 'regen' ? 'Regenerate the webhook URL?' : `Delete the webhook ${confirm?.hook.name ?? ''}?`}
        message={
          confirm?.kind === 'regen'
            ? 'The current URL stops working straight away. Put the new URL in the form after this.'
            : 'This URL stops accepting leads. Leads that already came through it are kept.'
        }
        confirmLabel={busy ? 'Working…' : confirm?.kind === 'regen' ? 'Regenerate' : 'Delete'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return
          if (confirm.kind === 'regen') void run(() => regenerateWebhookKey(confirm.hook.id), 'New webhook URL created. Update the form.')
          else void run(() => deleteWebhook(confirm.hook.id), `${confirm.hook.name} deleted.`)
        }}
      />
    </>
  )
}
