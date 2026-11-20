import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, CircleAlert, ExternalLink, PlugZap, ScrollText } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Checkbox, Hint, Label, Select, TextInput } from '@/components/Field'
import { ConfirmModal, PageHead } from '@/components/ui'
import { SearchSelect } from '@/components/SearchSelect'
import { errText } from '@/aicalls/api'
import { listMemberOptions } from '@/leads/api'
import type { MemberOption } from '@/leads/types'
import { cn } from '@/lib/cn'
import { ago } from '@/team/time'
import { useTenant } from '@/tenant/useTenant'
import { WaWebhookBox } from './WaWebhookBox'
import { FormPromptTabs, PromptBox } from './PromptBox'
import { waHook, waHookUrl } from './waLogs'
import { disconnectIntegration, listIntegrations, saveIntegration, setIntegrationEnabled, setZoomDefault, type IntegrationRow } from './api'
import { db } from '@/lib/supabase'
import { mask, PROVIDERS, geminiKeyPrompt, hellorixKeyPrompt,googleAdsPrompts, razorpayKeysPrompt, WHATSAPP_VENDORS, watiPrompt, zoomKeysPrompt, type Provider, type WhatsAppVendor } from './providers'
import { Flash } from '@/components/Flash'
import { Modal } from '@/components/Modal'
import { connectZoom, testZoom } from '@/zoom/api'
import { CallyzerConnect } from '@/callyzer/CallyzerConnect'
import { syncCallyzer } from '@/callyzer/api'
import { connectMeta, listAdAccounts, syncMeta, updateAdAccount, type AdAccount } from '@/meta/api'
import { MetaTokenConnect } from '@/meta/MetaTokenConnect'
import { FundsLine } from '@/meta/FundsLine'
import { cidText, listGoogleAccounts, syncGoogle, testGoogle, updateGoogleAccount, type GAccount } from '@/google/api'

/** System Connections: third-party services (WhatsApp, Callyzer, Zoom, voice calls, Perisclaw). */
export function IntegrationsPage() {
  const tenant = useTenant()
  const [rows, setRows] = useState<IntegrationRow[] | null>(null)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [open, setOpen] = useState<{ p: Provider; row: IntegrationRow | null } | null>(null)
  const [removing, setRemoving] = useState<IntegrationRow | null>(null)
  // Connect Callyzer side panel (reconnect: Settings, change the key)
  const [czOpen, setCzOpen] = useState<{ reconnect: boolean } | null>(null)
  const [czBusy, setCzBusy] = useState(false)
  async function czSync() {
    setCzBusy(true)
    try {
      await syncCallyzer(tenant.id)
      setNotice({ ok: 'Checking Callyzer for new calls. They appear on leads in a minute.' })
      window.setTimeout(load, 15000)
    } catch (e) {
      setNotice({ error: (e as Error).message })
    } finally {
      setCzBusy(false)
    }
  }
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  // what BizDock (admin) allows this workspace: { whatsapp: { allowed, provider } }
  const [allow, setAllow] = useState<({ whatsapp?: { allowed: boolean; provider: WhatsAppVendor | null } } & Record<string, { allowed?: boolean } | undefined>) | null>(null)
  useEffect(() => {
    void db()
      .from('tenants')
      .select('connections')
      .eq('id', tenant.id)
      .maybeSingle()
      .then(({ data }) => setAllow((data?.connections as typeof allow) ?? {}))
  }, [tenant.id])
  const waVendor = allow?.whatsapp?.allowed ? (allow.whatsapp.provider ?? null) : null
  /** WhatsApp: fields of the provider the admin picked */
  const effective = (p: Provider): Provider =>
    p.id === 'whatsapp' && waVendor ? { ...p, name: `WhatsApp · ${WHATSAPP_VENDORS[waVendor].label}`, fields: WHATSAPP_VENDORS[waVendor].fields } : p
  const blocked = (p: Provider) => (p.id === 'whatsapp' ? !waVendor : !allow?.[p.id]?.allowed)
  // only what BizDock has turned on for this workspace (plus anything still saved, so it can be disconnected)
  const visible = allow ? PROVIDERS.filter((p) => !blocked(p) || (rows ?? []).some((r) => r.provider === p.id)) : []

  // Facebook Ads: the ad accounts of each Facebook connection
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([])
  // Google Ads: the ad accounts found with the saved keys
  const [gAccounts, setGAccounts] = useState<GAccount[]>([])
  const [gBusy, setGBusy] = useState(false)
  // Gemini AI: this month's tokens (BizDock's own AI calls)
  const [aiUse, setAiUse] = useState<{ model: string; calls: number; input: number; output: number }[]>([])
  // AI Calling: this month's calls and their cost (HelloRix's price of each call)
  const [hxMonth, setHxMonth] = useState<{ calls: number; answered: number; cost: number; all: number } | null>(null)
  // a card's accounts: a one-line summary on the card, the full list in a modal
  const [listFor, setListFor] = useState<string | null>(null)
  const load = useCallback(() => {
    listIntegrations(tenant.id).then(setRows, (e: Error) => setNotice({ error: e.message }))
    listAdAccounts(tenant.id).then(setAdAccounts, () => setAdAccounts([]))
    listGoogleAccounts(tenant.id).then(setGAccounts, () => setGAccounts([]))
    db()
      .rpc('ai_usage_month', { p_tenant: tenant.id })
      .then(({ data }) => setAiUse((data ?? []) as typeof aiUse))
    const ist = new Date(Date.now() + 330 * 60_000)
    const monthStart = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 330 * 60_000).toISOString()
    void db()
      .from('ai_calls')
      .select('placed_at, cost, talk_seconds')
      .eq('tenant_id', tenant.id)
      .limit(10000)
      .then(({ data }) => {
        const rows = (data ?? []) as { placed_at: string; cost: number | null; talk_seconds: number | null }[]
        const m = rows.filter((x) => x.placed_at >= monthStart)
        setHxMonth({ calls: m.length, answered: m.filter((x) => Number(x.talk_seconds) > 0).length, cost: m.reduce((t, x) => t + Number(x.cost ?? 0), 0), all: rows.reduce((t, x) => t + Number(x.cost ?? 0), 0) })
      })
  }, [tenant.id])
  useEffect(load, [load])
  useEffect(() => {
    void listMemberOptions(tenant.id).then(setMembers)
  }, [tenant.id])

  const byProvider = new Map((rows ?? []).map((r) => [r.provider, r]))
  const allOf = (id: string) => (rows ?? []).filter((r) => r.provider === id)
  const connected = new Set((rows ?? []).filter((r) => r.is_enabled && r.status === 'connected').map((r) => r.provider)).size

  // Connect with Zoom: the popup is open (Cancel stops waiting)
  const [zoomWait, setZoomWait] = useState<{ cancel: () => void } | null>(null)
  function connect(integrationId?: string) {
    try {
      const c = connectZoom(tenant.id, integrationId)
      setZoomWait({ cancel: c.cancel })
      c.done
        .then((r) => setNotice(r.ok ? { ok: r.message } : r.message === 'Cancelled.' ? {} : { error: r.message }))
        .catch((e: Error) => setNotice({ error: e.message }))
        .finally(() => {
          setZoomWait(null)
          load()
        })
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }
  // Continue with Facebook: the popup is open (Cancel stops waiting)
  const [metaWait, setMetaWait] = useState<{ cancel: () => void } | null>(null)
  const [metaBusy, setMetaBusy] = useState(false)
  // Add with keys (a system user's token)
  const [metaToken, setMetaToken] = useState<{ row: IntegrationRow | null } | null>(null)
  function connectFb(integrationId?: string) {
    try {
      const c = connectMeta(tenant.id, integrationId)
      setMetaWait({ cancel: c.cancel })
      c.done
        .then((r) => setNotice(r.ok ? { ok: `${r.message} Its numbers are being brought in.` } : r.message === 'Cancelled.' ? {} : { error: r.message }))
        .catch((e: Error) => setNotice({ error: e.message }))
        .finally(() => {
          setMetaWait(null)
          load()
        })
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }
  async function fbSync() {
    setMetaBusy(true)
    try {
      await syncMeta(tenant.id)
      setNotice({ ok: 'Bringing in the latest numbers from Facebook. They show in a minute.' })
      window.setTimeout(load, 20000)
    } catch (e) {
      setNotice({ error: (e as Error).message })
    } finally {
      setMetaBusy(false)
    }
  }
  async function gSync() {
    setGBusy(true)
    try {
      await syncGoogle(tenant.id)
      setNotice({ ok: 'Bringing in the latest numbers from Google Ads. They show in a minute.' })
      window.setTimeout(load, 20000)
    } catch (e) {
      setNotice({ error: (e as Error).message })
    } finally {
      setGBusy(false)
    }
  }
  async function toggleGAccount(a: GAccount) {
    try {
      await updateGoogleAccount(a.id, { is_enabled: !a.is_enabled })
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }
  async function toggleAdAccount(a: AdAccount) {
    try {
      await updateAdAccount(a.id, { is_enabled: !a.is_enabled })
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }

  // Add with keys (a Zoom Server-to-Server app): only its three keys; recording on, default when it's the first
  const zoomKeys = (p: Provider): Provider => ({ ...p, fields: p.fields.filter((f) => ['account_id', 'client_id', 'client_secret'].includes(f.key)) })

  // the Zoom account picked first for new meetings and workflow steps (only one)
  async function makeDefault(r: IntegrationRow) {
    try {
      await setZoomDefault(allOf('zoom'), r.id)
      setNotice({ ok: `${r.label} is now the default Zoom account.` })
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }

  async function toggle(r: IntegrationRow) {
    try {
      await setIntegrationEnabled(r.id, !r.is_enabled)
      load()
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }

  return (
    <>
      <PageHead
        title="System Connections"
        subtitle={`Connect the third-party services BizDock works with. ${rows && allow ? `${connected} of ${visible.length} connected.` : ''}`}
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      {allow && !visible.length && <div className="empty">No connections are turned on for your workspace yet. Ask BizDock to enable the ones you need.</div>}
      <div className="int-grid">
        {visible.map((p) => {
          const r = p.multiple ? undefined : byProvider.get(p.id)
          const accounts = p.multiple ? allOf(p.id) : []
          const Icon = p.icon
          const off = blocked(p)
          // the admin switched WhatsApp to another provider: the saved keys don't fit
          const stale = p.id === 'whatsapp' && !!r && !!waVendor && r.config.vendor !== waVendor
          const state = off
            ? 'blocked'
            : p.multiple
              ? accounts.some((a) => a.is_enabled && a.status === 'connected')
                ? 'connected'
                : accounts.length
                  ? 'paused'
                  : 'off'
              : stale
                ? 'reconnect'
                : !r
                  ? 'off'
                  : !r.is_enabled
                    ? 'paused'
                    : r.status
          return (
            <section key={p.id} className="card int-card">
              <div className="int-top">
                <div className="int-icon" style={{ ['--c' as string]: p.color }}>
                  <Icon size={20} />
                </div>
                <div className="int-title">
                  <b>{effective(p).name}</b>
                  <span
                    className={cn(
                      'badge',
                      state === 'connected' ? 'badge-success' : state === 'error' || state === 'reconnect' ? 'badge-danger' : state === 'paused' ? 'badge-warning' : 'badge-muted',
                    )}
                  >
                    {p.multiple && accounts.length ? `${accounts.length} account${accounts.length === 1 ? '' : 's'}` : ''}
                    {p.multiple && accounts.length ? ' · ' : ''}
                    {{ connected: 'Connected', error: 'Error', reconnect: 'Reconnect needed', paused: 'Paused', off: 'Not connected', blocked: 'Not enabled', disconnected: 'Not connected' }[state]}
                  </span>
                </div>
                {r && !off && !stale && (
                  <label className="switch" title={r.is_enabled ? 'Pause' : 'Turn on'}>
                    <input type="checkbox" checked={r.is_enabled} onChange={() => void toggle(r)} />
                  </label>
                )}
              </div>
              <p className="int-desc">{p.description}</p>
              <div className="int-used">
                <span>Used for</span> {p.usedFor}
              </div>
              {p.id === 'facebook_ads' && adAccounts.length > 0 && (
                <button type="button" className="int-summary" onClick={() => setListFor(p.id)}>
                  <span>
                    <b>
                      {adAccounts.length} ad account{adAccounts.length === 1 ? '' : 's'}
                    </b>{' '}
                    · {adAccounts.filter((x) => x.is_enabled).length} bringing in numbers
                    {adAccounts.some((x) => x.last_error) && <span className="int-summary-err"> · {adAccounts.filter((x) => x.last_error).length} with an error</span>}
                  </span>
                  <span className="int-summary-link">View accounts</span>
                </button>
              )}
              {p.id === 'facebook_ads' && adAccounts.length > 0 && listFor === p.id && (
                <Modal open onClose={() => setListFor(null)} width={640} title={`${p.name} · ${adAccounts.length} ad account${adAccounts.length === 1 ? '' : 's'}`}>
                <div className="int-accounts">
                  {adAccounts.map((x) => (
                    <div key={x.id} className="int-account">
                      <label className="switch" title={x.is_enabled ? 'Stop bringing in this account’s numbers' : 'Bring in this account’s numbers'}>
                        <input type="checkbox" checked={x.is_enabled} disabled={off} onChange={() => void toggleAdAccount(x)} />
                      </label>
                      <div className="int-account-main">
                        <b>
                          {accounts.find((c) => c.id === x.integration_id)?.label ? `${accounts.find((c) => c.id === x.integration_id)?.label} - ` : ''}
                          {x.name || x.act_id}
                        </b>
                        <span className="muted small">
                          {x.act_id.replace(/^act_/, '')}
                          {x.last_error
                            ? ` · ${x.last_error}`
                            : x.last_sync_at
                              ? ''
                              : x.synced_until
                                ? ` · bringing in history (up to ${x.synced_until})`
                                : ' · first pull in a minute'}
                        </span>
                        <FundsLine a={x} />
                      </div>
                    </div>
                  ))}
                </div>
                </Modal>
              )}
              {p.id === 'gemini' && r && !off && (() => {
                const calls = aiUse.reduce((t, x) => t + Number(x.calls), 0)
                const tin = aiUse.reduce((t, x) => t + Number(x.input), 0)
                const tout = aiUse.reduce((t, x) => t + Number(x.output), 0)
                const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n))
                return (
                  <div className="int-summary" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                    <span>
                      Model <b>{r.config.model || '— pick one in Settings'}</b>
                    </span>
                    <span className="muted">
                      This month: {calls} call{calls === 1 ? '' : 's'} · {k(tin)} in / {k(tout)} out tokens
                    </span>
                    <span className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                      <a className="link-btn" href="https://aistudio.google.com/usage" target="_blank" rel="noopener noreferrer">
                        AI Studio usage <ExternalLink size={12} />
                      </a>
                      <a className="link-btn" href="https://console.cloud.google.com/billing" target="_blank" rel="noopener noreferrer">
                        Billing / pay <ExternalLink size={12} />
                      </a>
                    </span>
                  </div>
                )
              })()}
              {p.id === 'hellorix' && r && !off && (
                <div className="int-summary" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <span>
                    This month: <b>{hxMonth?.calls ?? 0}</b> call{hxMonth?.calls === 1 ? '' : 's'} · {hxMonth?.answered ?? 0} answered · <b>₹{(hxMonth?.cost ?? 0).toFixed(2)}</b>
                  </span>
                  <span className="muted">
                    All time ₹{(hxMonth?.all ?? 0).toFixed(2)} · calls {r.config.hours_start || '10:00'}–{r.config.hours_end || '19:00'} (India time)
                  </span>
                  {(() => {
                    // the calling numbers linked on the HelloRix account (read when the key was checked)
                    let nums: { id: string; label: string }[] = []
                    try {
                      nums = JSON.parse(r.config.options || '{}').numbers ?? []
                    } catch {
                      nums = []
                    }
                    return (
                      <span className="muted">
                        Calling number{nums.length === 1 ? '' : 's'}: {nums.length ? nums.map((n) => n.label || n.id).join(', ') : 'none linked on HelloRix yet'}
                      </span>
                    )
                  })()}
                  <span className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                    <a className="link-btn" href="https://app.hellorix.ai" target="_blank" rel="noopener noreferrer">
                      HelloRix wallet / recharge <ExternalLink size={12} />
                    </a>
                  </span>
                </div>
              )}
              {p.id === 'google_ads' && r && gAccounts.filter((x) => !x.is_manager).length > 0 && (() => {
                const ga = gAccounts.filter((x) => !x.is_manager)
                return (
                  <button type="button" className="int-summary" onClick={() => setListFor(p.id)}>
                    <span>
                      <b>
                        {ga.length} ad account{ga.length === 1 ? '' : 's'}
                      </b>{' '}
                      · {ga.filter((x) => x.is_enabled).length} bringing in numbers
                      {ga.some((x) => x.last_error) && <span className="int-summary-err"> · {ga.filter((x) => x.last_error).length} with an error</span>}
                    </span>
                    <span className="int-summary-link">View accounts</span>
                  </button>
                )
              })()}
              {p.id === 'google_ads' && listFor === p.id && (
                <Modal open onClose={() => setListFor(null)} width={640} title={`Google Ads · ${gAccounts.filter((x) => !x.is_manager).length} ad accounts`}>
                  <div className="int-accounts">
                    {gAccounts
                      .filter((x) => !x.is_manager)
                      .map((x) => (
                        <div key={x.id} className="int-account">
                          <label className="switch" title={x.is_enabled ? 'Stop bringing in this account’s numbers' : 'Bring in this account’s numbers'}>
                            <input type="checkbox" checked={x.is_enabled} disabled={off} onChange={() => void toggleGAccount(x)} />
                          </label>
                          <div className="int-account-main">
                            <b>{x.name || cidText(x.customer_id)}</b>
                            <span className="muted small">
                              {cidText(x.customer_id)}
                              {x.currency ? ` · ${x.currency}` : ''}
                              {x.last_error ? ` · ${x.last_error}` : x.last_sync_at ? ` · numbers ${ago(x.last_sync_at)}` : ' · first pull in a minute'}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </Modal>
              )}
              {p.id === 'facebook_ads' && accounts.some((a) => a.status === 'error') && (
                <div className="int-note">A Facebook connection needs attention: open Logs → Connections.</div>
              )}
              {p.id === 'facebook_ads' && metaWait && (
                <div className="int-note row-between">
                  <span>Waiting for Facebook… log in, pick your business and ad accounts, and press Allow.</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={metaWait.cancel}>
                    Cancel
                  </button>
                </div>
              )}
              {p.multiple && p.id !== 'facebook_ads' && accounts.length > 0 && (
                <button type="button" className="int-summary" onClick={() => setListFor(p.id)}>
                  <span>
                    <b>
                      {accounts.length} {p.id === 'zoom' ? 'Zoom' : ''} account{accounts.length === 1 ? '' : 's'}
                    </b>
                    {p.id === 'zoom' && accounts.find((a) => a.config.is_default === 'Yes') && <> · default: {accounts.find((a) => a.config.is_default === 'Yes')?.label}</>}
                    {accounts.some((a) => a.status === 'error') && <span className="int-summary-err"> · {accounts.filter((a) => a.status === 'error').length} need attention</span>}
                  </span>
                  <span className="int-summary-link">View accounts</span>
                </button>
              )}
              {p.multiple && p.id !== 'facebook_ads' && accounts.length > 0 && listFor === p.id && (
                <Modal open onClose={() => setListFor(null)} width={640} title={`${p.name} · ${accounts.length} account${accounts.length === 1 ? '' : 's'}`}>
                <div className="int-accounts">
                  {accounts.map((a) => (
                    <div key={a.id} className="int-account">
                      {p.id === 'zoom' ? (
                        // Zoom: the radio picks the default account (picked first for new meetings and workflow steps)
                        <label className="int-default" title={a.config.is_default === 'Yes' ? 'Default account' : 'Make this the default account'}>
                          <input type="radio" name="zoom-default" checked={a.config.is_default === 'Yes'} disabled={off} onChange={() => void makeDefault(a)} />
                        </label>
                      ) : (
                        <label className="switch" title={a.is_enabled ? 'Pause' : 'Turn on'}>
                          <input type="checkbox" checked={a.is_enabled} disabled={off} onChange={() => void toggle(a)} />
                        </label>
                      )}
                      <div className="int-account-main">
                        <b>
                          {a.label || a.config.ad_account_id}
                          {p.id === 'zoom' && a.config.is_default === 'Yes' && <span className="badge badge-muted" style={{ marginLeft: 6 }}>Default</span>}
                        </b>
                        <span className="muted small">
                          {p.id === 'zoom' ? (a.config.auth === 'oauth' ? `${a.config.zoom_email || 'Zoom user'} · Connected with Zoom` : a.config.host_email || 'Connected with keys') : a.config.ad_account_id}
                          {a.status === 'error' && a.last_error ? ` · ${a.last_error}` : ''}
                        </span>
                      </div>
                      <div className="int-account-actions">
                      {!off && p.id === 'zoom' && (a.config.auth !== 'oauth' || a.status === 'error') && (
                        <button
                          type="button"
                          className={cn('btn btn-sm', a.status === 'error' ? 'btn-outline' : 'btn-ghost')}
                          disabled={!!zoomWait}
                          title={a.config.auth === 'oauth' ? 'Log in to Zoom again' : 'Replace this account’s keys with Connect with Zoom (same account, its meetings stay linked)'}
                          onClick={() => connect(a.id)}
                        >
                          {a.config.auth === 'oauth' ? 'Reconnect' : 'Connect with Zoom'}
                        </button>
                      )}
                      {!off && (p.id !== 'zoom' || a.config.auth !== 'oauth') && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                          setListFor(null)
                          setOpen({ p: p.id === 'zoom' ? zoomKeys(p) : p, row: a })
                        }}>
                          Settings
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(a)}>
                        Remove
                      </button>
                      </div>
                    </div>
                  ))}
                </div>
                </Modal>
              )}
              {p.id === 'zoom' && zoomWait && (
                <div className="int-note row-between">
                  <span>Waiting for Zoom… log in and press Allow in the Zoom window.</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={zoomWait.cancel}>
                    Cancel
                  </button>
                </div>
              )}
              {off && allow && <div className="int-note">BizDock has turned {p.name} off for your workspace. Disconnect to remove the saved keys.</div>}
              {stale && <div className="int-err"><CircleAlert size={14} /> Your WhatsApp provider is now {WHATSAPP_VENDORS[waVendor!].label}. Enter its keys again.</div>}
              {r?.status === 'error' && r.last_error && (
                <div className="int-err">
                  <CircleAlert size={14} /> {r.last_error}
                </div>
              )}
              <div className="int-foot">
                <span className="muted small">
                  {p.id === 'callyzer' && r && !off
                    ? r.config.cursor
                      ? 'Bringing in past calls…'
                      : r.config.last_sync_at
                        ? `Calls checked ${ago(r.config.last_sync_at)} · every 5 min`
                        : 'Connected · first check in a minute'
                    : (p.id === 'gemini' || p.id === 'hellorix') && r && !off
                    ? r.config.checked_at
                      ? `Key checked ${ago(r.config.checked_at)}`
                      : 'Connected'
                    : p.id === 'razorpay' && r && !off
                    ? r.config.last_sync_at
                      ? `Payments checked ${ago(r.config.last_sync_at)} · every 5 min`
                      : 'Connected · first check within 5 minutes'
                    : (p.id === 'facebook_ads' && !off && accounts.length) || (p.id === 'google_ads' && !off && r && r.status === 'connected')
                      ? 'Numbers every 3 hours · last 7 days again every night'
                    : off ? 'Turned off by BizDock' : p.multiple ? (accounts.length ? (p.id === 'zoom' ? 'Add as many Zoom accounts as you use' : 'Add as many ad accounts as you run') : 'Not set up yet') : r ? `Connected ${ago(r.connected_at)}${r.connected_by ? ` by ${members.find((m) => m.id === r.connected_by)?.name ?? 'someone'}` : ''}` : 'Not set up yet'}
                </span>
                <div className="row">
                  {p.id === 'zoom' && !off && (
                    <button type="button" className="btn btn-outline btn-sm" title="With a Server-to-Server app made in that Zoom account" onClick={() => setOpen({ p: zoomKeys(p), row: null })}>
                      Add with keys
                    </button>
                  )}
                  {p.id === 'zoom' && !off && (
                    <button type="button" className="btn btn-sm btn-primary" disabled={!!zoomWait} onClick={() => connect()}>
                      <PlugZap size={14} /> {zoomWait ? 'Waiting for Zoom…' : 'Connect with Zoom'}
                    </button>
                  )}
                  {p.id === 'facebook_ads' && !off && accounts.length > 0 && (
                    <button type="button" className="btn btn-outline btn-sm" disabled={metaBusy} onClick={() => void fbSync()}>
                      {metaBusy ? 'Starting…' : 'Sync now'}
                    </button>
                  )}
                  {p.id === 'facebook_ads' && !off && accounts.length > 0 && (
                    <Link to="/integrations/facebook-ads/logs" className="btn btn-outline btn-sm">
                      <ScrollText size={14} /> Logs
                    </Link>
                  )}
                  {p.id === 'facebook_ads' && !off && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setMetaToken({ row: null })}>
                      Add with keys
                    </button>
                  )}
                  {p.id === 'facebook_ads' && !off && (
                    <button type="button" className="btn btn-sm btn-primary" disabled={!!metaWait} onClick={() => connectFb()}>
                      <PlugZap size={14} /> {metaWait ? 'Waiting for Facebook…' : 'Continue with Facebook'}
                    </button>
                  )}
                  {p.multiple && p.id !== 'zoom' && p.id !== 'facebook_ads' && !off && (
                    <button type="button" className={cn('btn btn-sm', accounts.length ? 'btn-outline' : 'btn-primary')} onClick={() => setOpen({ p, row: null })}>
                      <PlugZap size={14} /> {accounts.length ? 'Add account' : 'Connect'}
                    </button>
                  )}
                  {p.id === 'google_ads' && !off && r && gAccounts.length > 0 && (
                    <button type="button" className="btn btn-outline btn-sm" disabled={gBusy} onClick={() => void gSync()}>
                      {gBusy ? 'Starting…' : 'Sync now'}
                    </button>
                  )}
                  {p.id === 'google_ads' && !off && r && gAccounts.length > 0 && (
                    <Link to="/integrations/google-ads/logs" className="btn btn-outline btn-sm">
                      <ScrollText size={14} /> Logs
                    </Link>
                  )}
                  {p.id === 'callyzer' && !off && r && (
                    <button type="button" className="btn btn-outline btn-sm" disabled={czBusy || !r.is_enabled} onClick={() => void czSync()}>
                      {czBusy ? 'Checking…' : 'Sync now'}
                    </button>
                  )}
                  {r && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(r)}>
                      Disconnect
                    </button>
                  )}
                  {p.id === 'callyzer' && !off && (
                    <button type="button" className={cn('btn btn-sm', r ? 'btn-outline' : 'btn-primary')} onClick={() => setCzOpen({ reconnect: !!r })}>
                      {r ? 'Settings' : (
                        <>
                          <PlugZap size={14} /> Connect
                        </>
                      )}
                    </button>
                  )}
                  {!off && !p.multiple && p.id !== 'callyzer' && (
                  <button type="button" className={cn('btn btn-sm', r && !stale ? 'btn-outline' : 'btn-primary')} onClick={() => setOpen({ p: effective(p), row: r ?? null })}>
                    {r && !stale ? 'Settings' : (
                      <>
                        <PlugZap size={14} /> {p.id === 'razorpay' || p.id === 'google_ads' || p.id === 'gemini' || p.id === 'hellorix' ? 'Add with keys' : 'Connect'}
                      </>
                    )}
                  </button>
                  )}
                </div>
              </div>
            </section>
          )
        })}
      </div>
      <Hint>Keys are visible only to people with “Settings & integrations” access. Sending messages and calls through these services is switched on module by module as each integration is built.</Hint>

      {open && (
        <ConnectDrawer
          provider={open.p}
          existing={open.row && open.p.id === 'whatsapp' && open.row.config.vendor !== waVendor ? null : open.row}
          replaceId={open.p.multiple ? null : (open.row?.id ?? null)}
          vendor={open.p.id === 'whatsapp' ? waVendor : null}
          zoomCount={allOf('zoom').length}
          onClose={() => setOpen(null)}
          onSaved={(msg) => {
            setOpen(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}
      {czOpen && (
        <CallyzerConnect
          reconnect={czOpen.reconnect}
          onClose={() => setCzOpen(null)}
          onDone={(msg) => {
            setCzOpen(null)
            setNotice({ ok: msg })
            load()
            window.setTimeout(load, 20000)
          }}
        />
      )}
      {metaToken && (
        <MetaTokenConnect
          integrationId={metaToken.row?.id ?? null}
          label={metaToken.row?.label}
          onClose={() => setMetaToken(null)}
          onDone={(msg) => {
            setMetaToken(null)
            setNotice({ ok: msg })
            load()
            window.setTimeout(load, 20000)
          }}
        />
      )}
      {removing && (
        <ConfirmModal
          open
          title={`${removing.label ? `Remove ${removing.label}` : `Disconnect ${PROVIDERS.find((p) => p.id === removing.provider)?.name}`}?`}
          message={
            removing.provider === 'facebook_ads'
              ? 'BizDock stops bringing in this Facebook login’s ad numbers. The numbers already brought in, and the funnels’ campaign links, stay.'
              : 'The saved keys are removed. Anything using this connection stops until it is connected again.'
          }
          confirmLabel="Disconnect"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const r = removing
            setRemoving(null)
            try {
              await disconnectIntegration(r.id)
              setNotice({ ok: 'Disconnected.' })
              load()
            } catch (e) {
              setNotice({ error: (e as Error).message })
            }
          }}
        />
      )}
    </>
  )
}

function ConnectDrawer({
  provider,
  existing,
  replaceId,
  vendor,
  zoomCount = 0,
  onClose,
  onSaved,
}: {
  provider: Provider
  existing: IntegrationRow | null
  /** a saved row whose keys no longer fit (WhatsApp provider changed): overwritten */
  replaceId: string | null
  vendor: WhatsAppVendor | null
  /** Zoom accounts already connected (the first one becomes the default) */
  zoomCount?: number
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const tenant = useTenant()
  const { membership } = useAuth()
  // secret fields start empty: left empty = keep the saved value
  // AI Calling: calling hours 10–7, every day
  const HX_DEFAULTS: Record<string, string> = { hours_start: '10:00', hours_end: '19:00', hours_days: '0,1,2,3,4,5,6' }
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      provider.fields.map((f) => [f.key, f.secret ? '' : (existing?.config[f.key] ?? (provider.id === 'hellorix' && HX_DEFAULTS[f.key] !== undefined ? HX_DEFAULTS[f.key] : f.options ? f.options[0] : ''))]),
    ),
  )
  const [label, setLabel] = useState(existing?.label ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const Icon = provider.icon

  // Gemini: the models the key can use (the typed key, else the saved one), for the Model dropdown
  const [gModels, setGModels] = useState<{ id: string; name: string }[] | null>(() => {
    try {
      return provider.id === 'gemini' && existing?.config.models ? JSON.parse(existing.config.models) : null
    } catch {
      return null
    }
  })
  const [gModelsMsg, setGModelsMsg] = useState('Enter the API key to list the models')
  const typedKey = provider.id === 'gemini' ? (values.api_key ?? '').trim() : ''
  useEffect(() => {
    if (provider.id !== 'gemini') return
    if (!typedKey && !existing) return
    if (typedKey && typedKey.length < 20) return
    let live = true
    setGModelsMsg('Checking the key…')
    const t = window.setTimeout(async () => {
      const { data, error: e } = await db().functions.invoke('gemini', { body: { action: 'models', ...(typedKey ? { api_key: typedKey } : { id: existing?.id }) } })
      if (!live) return
      const why = data?.error ?? (e ? await errText(e) : null)
      if (why) {
        setGModels(null)
        setGModelsMsg(why)
        return
      }
      const list = (data?.models ?? []) as { id: string; name: string }[]
      setGModels(list)
      setValues((v) => ({ ...v, model: list.some((m) => m.id === v.model) ? v.model : String(data?.default ?? list[0]?.id ?? '') }))
    }, 500)
    return () => {
      live = false
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedKey])

  // AI Calling: the key's caller numbers, voices, personas and templates (the typed key, else the saved one)
  type Opt = { id: string; label: string }
  const [hxOpts, setHxOpts] = useState<{ numbers: Opt[]; voices: Opt[]; personas: Opt[]; templates: Opt[] } | null>(() => {
    try {
      return provider.id === 'hellorix' && existing?.config.options ? JSON.parse(existing.config.options) : null
    } catch {
      return null
    }
  })
  const [hxMsg, setHxMsg] = useState('Enter the API key to load the options')
  const hxKey = provider.id === 'hellorix' ? (values.api_key ?? '').trim() : ''
  useEffect(() => {
    if (provider.id !== 'hellorix') return
    if (!hxKey && !existing) return
    if (hxKey && hxKey.length < 12) return
    let live = true
    setHxMsg('Checking the key…')
    const t = window.setTimeout(async () => {
      const { data, error: e } = await db().functions.invoke('hellorix', { body: { action: 'options', ...(hxKey ? { api_key: hxKey } : { id: existing?.id }) } })
      if (!live) return
      const why = data?.error ?? (e ? await errText(e) : null)
      if (why) {
        setHxOpts(null)
        setHxMsg(why)
        return
      }
      setHxOpts({ numbers: data?.numbers ?? [], voices: data?.voices ?? [], personas: data?.personas ?? [], templates: data?.templates ?? [] })
    }, 500)
    return () => {
      live = false
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hxKey])

  async function save() {
    if (provider.multiple && !label.trim()) return setError('Give this account a name.')
    if (provider.id === 'hellorix' && (values.hours_start || '') >= (values.hours_end || '')) return setError('The calling hours must end after they start.')
    if (provider.id === 'hellorix' && !values.hours_days) return setError('Tick at least one calling day.')
    const config: Record<string, string> = existing ? { ...existing.config } : {}
    if (vendor) config.vendor = vendor
    for (const f of provider.fields) {
      const v = values[f.key]?.trim() ?? ''
      if (f.secret && !v && existing?.config[f.key]) continue
      if (f.required && !v) return setError(`${f.label} is required.`)
      config[f.key] = v
    }
    if (provider.id === 'zoom' && !existing) {
      config.cloud_record = 'Yes'
      config.is_default = zoomCount ? 'No' : 'Yes'
    }
    setBusy(true)
    try {
      const id = await saveIntegration(tenant.id, membership?.id, existing ?? (replaceId ? ({ id: replaceId } as IntegrationRow) : null), provider.id, config, provider.multiple ? label.trim() : null)
      // Razorpay keys: checked straight away
      if (provider.id === 'razorpay' && id) {
        const { data, error: e } = await db().functions.invoke('razorpay', { body: { action: 'test', id } })
        const why = data?.error ?? (e ? await errText(e) : null)
        onSaved(why ? `Razorpay saved, but it refused the keys: ${why}` : 'Razorpay connected. Payments come in within 5 minutes (the last 90 days first).')
        return
      }
      // Gemini: check the key, list the models (for the Model dropdown), pick a default model
      if (provider.id === 'gemini' && id) {
        const { data, error: e } = await db().functions.invoke('gemini', { body: { action: 'test', id } })
        const why = data?.error ?? (e ? await errText(e) : null)
        onSaved(why ? `Gemini saved, but Google refused the key: ${why}` : `Gemini AI connected · model ${data?.model} (${data?.models} models available; change it in Settings).`)
        return
      }
      // AI Calling: check the key, keep its options and the webhook secret
      if (provider.id === 'hellorix' && id) {
        const { data, error: e } = await db().functions.invoke('hellorix', { body: { action: 'test', id } })
        const why = data?.error ?? (e ? await errText(e) : null)
        onSaved(why ? `AI Calling saved, but HelloRix refused the key: ${why}` : 'AI Calling connected. Make your call scripts in AI Calling → Templates.')
        return
      }
      // Google Ads keys: log in, list the ad accounts, start the first pull
      if (provider.id === 'google_ads' && id) {
        try {
          const g = await testGoogle(id)
          onSaved(`Google Ads connected: ${g.saved} ad account${g.saved === 1 ? '' : 's'} found. The last 90 days come in over the next few minutes.${g.problems.length ? ` Not read: ${g.problems.join('; ')}` : ''}`)
        } catch (e) {
          onSaved(`Google Ads saved, but Google refused: ${(e as Error).message}`)
        }
        return
      }
      // Zoom keys: checked straight away
      if (provider.id === 'zoom' && id) {
        try {
          const u = await testZoom(id)
          onSaved(`${label.trim()} connected to Zoom as ${u.name || u.email}${u.email ? ` (${u.email})` : ''}.`)
        } catch (e) {
          onSaved(`${label.trim()} saved, but Zoom refused the keys: ${(e as Error).message} Fix them with Settings on the account.`)
        }
        return
      }
      onSaved(provider.multiple ? (existing ? `${label.trim()} saved.` : `${label.trim()} connected.`) : existing ? `${provider.name} settings saved.` : `${provider.name} connected.`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  // Zoom keys, Razorpay and WATI: the form tab and a Prompt & steps tab (Claude in Chrome)
  const tabbed = provider.id === 'zoom' || provider.id === 'razorpay' || provider.id === 'google_ads' || provider.id === 'gemini' || provider.id === 'hellorix' || (provider.id === 'whatsapp' && vendor === 'wati')
  const [tab, setTab] = useState<'keys' | 'prompt'>('keys')
  const showForm = !tabbed || tab === 'keys'
  const [hookUrl, setHookUrl] = useState<string | null>(null)
  useEffect(() => {
    if (provider.id === 'whatsapp' && vendor === 'wati') void waHook(tenant.id).then((h) => setHookUrl(waHookUrl(h.key)), () => setHookUrl(null))
  }, [provider.id, vendor, tenant.id])
  return (
    <Drawer
      open
      onClose={onClose}
      width={520}
      title={provider.multiple ? (existing ? `${existing.label ?? 'Account'} settings` : `Add ${provider.name}`) : existing ? `${provider.name} settings` : `Connect ${provider.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : existing ? 'Save' : 'Connect'}
            </Button>
          </div>
        </>
      }
    >
      {tabbed && (
        <FormPromptTabs
          tabs={[
            ['keys', 'Keys'],
            ['prompt', 'Prompt & steps'],
          ]}
          value={tab}
          onChange={setTab}
        />
      )}
      <div className="stack">
        {showForm && (
        <div className="int-top">
          <div className="int-icon" style={{ ['--c' as string]: provider.color }}>
            <Icon size={20} />
          </div>
          <div>
            <b>{provider.name}</b>
            <div className="muted small">{provider.description}</div>
          </div>
        </div>
        )}
        {tabbed && tab === 'prompt' && provider.id === 'zoom' && (
          <PromptBox
            title="Let Claude in Chrome make the Zoom app"
            note="Log in at marketplace.zoom.us as the Zoom account’s owner or admin, open Claude in Chrome, paste this, and it makes the app with every permission BizDock needs. Then copy the three keys from its App Credentials page into the Keys tab."
            text={zoomKeysPrompt()}
          />
        )}
        {tabbed && tab === 'prompt' && provider.id === 'google_ads' && (
          <>
            <p className="muted small" style={{ margin: 0 }}>
              One BizDock manager (MCC) account reads every client’s Google Ads. Run these four prompts in Claude in Chrome, in order, each on the login it names. Steps 1–3 are per client; step 4 is once.
            </p>
            {googleAdsPrompts().map((g) => (
              <PromptBox key={g.title} title={g.title} note={g.who} text={g.text} />
            ))}
          </>
        )}
        {tabbed && tab === 'prompt' && provider.id === 'gemini' && (
          <PromptBox
            title="Let Claude in Chrome make the Gemini API key"
            note="Log in to Google, open Claude in Chrome and paste this. It opens Google AI Studio, creates the key and tells you the plan (Free / Paid); you copy the key into the Keys tab yourself."
            text={geminiKeyPrompt()}
          />
        )}
        {tabbed && tab === 'prompt' && provider.id === 'hellorix' && (
          <PromptBox
            title="Let Claude in Chrome make the HelloRix API key"
            note="Log in at app.hellorix.ai as the account’s owner or admin, open Claude in Chrome and paste this. It creates the key and tells you the linked numbers and wallet balance; you copy the key into the Keys tab yourself."
            text={hellorixKeyPrompt()}
          />
        )}
        {tabbed && tab === 'prompt' && provider.id === 'razorpay' && (
          <PromptBox
            title="Let Claude in Chrome open Razorpay’s API keys"
            note="Log in at dashboard.razorpay.com as the account’s owner or admin, open Claude in Chrome and paste this. It opens API keys and generates them; you copy the Key ID and Key Secret into the Keys tab yourself."
            text={razorpayKeysPrompt()}
          />
        )}
        {tabbed && tab === 'prompt' && provider.id === 'whatsapp' && (
          <>
            <PromptBox
              title="Let Claude in Chrome open WATI’s API Docs"
              note={`Log in to WATI as an admin, open Claude in Chrome and paste this. It shows you the API endpoint and access token${hookUrl ? ' and adds BizDock’s webhook' : ''}; you copy the token yourself.`}
              text={watiPrompt(hookUrl)}
            />
            <div className="int-guide">
              <b>The steps</b>
              <ol>
                <li>Log in to WATI (app.wati.io) as an admin.</li>
                <li>Open API Docs: copy the API Endpoint and the Access Token (without “Bearer”) into the Keys tab, with your WhatsApp business number.</li>
                <li>Webhooks → Add Webhook: paste BizDock’s webhook URL (Keys tab, after connecting), Enabled, tick the message events (received, sent, delivered, read, failed). Save.</li>
                <li>Press {existing ? 'Save' : 'Connect'} in BizDock.</li>
              </ol>
            </div>
          </>
        )}
        {(!tabbed || tab === 'prompt') && provider.guide && (
          <div className="int-guide">
            <b>How to get these keys</b>
            <ol>
              {provider.guide.map((g, i) =>
                typeof g === 'string' ? (
                  <li key={i}>{g}</li>
                ) : (
                  <li key={i}>
                    {g.text}
                    <ul className="int-guide-groups">
                      {g.groups.map((grp) => (
                        <li key={grp.label}>
                          <b>{grp.label}</b>
                          <ul>
                            {grp.items.map((it) => (
                              <li key={it}>
                                <code>{it}</code>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </li>
                ),
              )}
            </ol>
          </div>
        )}
        {showForm && tabbed && <Hint>No keys yet? See Prompt &amp; steps.</Hint>}
        {showForm && provider.multiple && (
          <div>
            <Label htmlFor="int-label" required>
              Account name
            </Label>
            <TextInput id="int-label" placeholder={provider.accountHint ?? 'e.g. Studio ads, Webinar ads'} value={label} onChange={(e) => setLabel(e.target.value)} />
            <Hint>Your own name for this account, to tell several apart.</Hint>
          </div>
        )}
        {showForm && provider.fields.map((f) => (
          <div key={f.key}>
            <Label htmlFor={`int-${f.key}`} required={f.required && !(f.secret && existing?.config[f.key])}>
              {f.label}
            </Label>
            {provider.id === 'hellorix' && f.key !== 'api_key' ? (
              <HxField f={f.key} value={values[f.key] ?? ''} opts={hxOpts} msg={hxMsg} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
            ) : provider.id === 'gemini' && f.key === 'model' ? (
              <SearchSelect
                id={`int-${f.key}`}
                value={values[f.key] || null}
                disabled={!gModels?.length}
                placeholder={gModels?.length ? 'Select a model' : gModelsMsg}
                searchPlaceholder="Search models…"
                options={(gModels ?? []).map((m) => ({ value: m.id, label: `${m.name} (${m.id})` }))}
                onChange={(v) => setValues({ ...values, [f.key]: v ?? '' })}
              />
            ) : f.options ? (
              <Select id={`int-${f.key}`} value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            ) : (
              <TextInput
                id={`int-${f.key}`}
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                placeholder={f.secret && existing?.config[f.key] ? `${mask(existing.config[f.key])} (saved — leave blank to keep)` : f.placeholder}
                value={values[f.key]}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            )}
            {f.hint && <Hint>{f.hint}</Hint>}
          </div>
        ))}
        {showForm && existing && provider.id === 'whatsapp' && vendor === 'wati' && <WaWebhookBox />}
        {showForm && existing && (
          <div className="muted small row" style={{ gap: 6 }}>
            <CheckCircle2 size={14} /> Last updated {ago(existing.updated_at)}
          </div>
        )}
      </div>
    </Drawer>
  )
}

/** System Connections → AI Calling: a setting below the key (dropdowns from the key's account, hours, days, switches) */
function HxField({
  f,
  value,
  opts,
  msg,
  onChange,
}: {
  f: string
  value: string
  opts: { numbers: { id: string; label: string }[]; voices: { id: string; label: string }[]; personas: { id: string; label: string }[]; templates: { id: string; label: string }[] } | null
  msg: string
  onChange: (v: string) => void
}) {
  if (f === 'from_number')
    return (
      <>
        <TextInput id={`int-${f}`} list="hx-numbers" value={value} placeholder="+91XXXXXXXXXX" onChange={(e) => onChange(e.target.value.replace(/[^\d+]/g, ''))} />
        <datalist id="hx-numbers">
          {(opts?.numbers ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </datalist>
        {!opts && msg !== 'Enter the API key to load the options' && <Hint>{msg}</Hint>}
      </>
    )
  const list = f === 'voice_id' ? opts?.voices : f === 'persona_id' ? opts?.personas : f === 'default_objective' ? opts?.templates : null
  if (list !== null && list !== undefined)
    return (
      <Select id={`int-${f}`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{f === 'default_objective' ? '— none —' : f === 'from_number' ? 'Any free line' : 'Account default'}</option>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
        {value && !list.some((o) => o.id === value) && <option value={value}>{value}</option>}
      </Select>
    )
  if (f === 'from_number' || f === 'voice_id' || f === 'persona_id' || f === 'default_objective')
    return (
      <Select id={`int-${f}`} value="" disabled>
        <option value="">{msg}</option>
      </Select>
    )
  if (f === 'insights')
    return (
      <SearchSelect
        id={`int-${f}`}
        value={value || 'full'}
        onChange={(v) => onChange(v ?? 'full')}
        options={[
          { value: 'full', label: 'Full: outcome, summary and answers' },
          { value: 'outcome', label: 'Outcome only' },
        ]}
      />
    )
  if (f === 'hours_start' || f === 'hours_end') return <TextInput id={`int-${f}`} type="time" step={900} value={value} onChange={(e) => onChange(e.target.value)} />
  if (f === 'hours_days') {
    const days = value.split(',').filter(Boolean)
    return (
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => {
          const on = days.includes(String(i))
          return (
            <button
              key={d}
              type="button"
              className={cn('btn btn-sm', on ? 'btn-primary' : 'btn-outline')}
              onClick={() => onChange((on ? days.filter((x) => x !== String(i)) : [...days, String(i)]).sort().join(','))}
            >
              {d}
            </button>
          )
        })}
      </div>
    )
  }
  if (f === 'fixed_opening' || f === 'lang_step')
    return (
      <Checkbox
        id={`int-${f}`}
        checked={value !== '0'}
        onChange={(v) => onChange(v ? '1' : '0')}
        label="Added to every template"
        description={
          f === 'fixed_opening'
            ? 'Never “Hello”: starts with “Namaste {name} ji”, the company, why we called and “Kya aapke paas 2 minute hain?”; if busy it asks when to call back.'
            : 'After the opening it asks Hindi or English and goes on in that language; answers are saved in English.'
        }
      />
    )
  return <TextInput id={`int-${f}`} value={value} onChange={(e) => onChange(e.target.value)} />
}

