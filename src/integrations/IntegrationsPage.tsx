import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Check, CheckCircle2, CircleAlert, Copy, MessageSquareText, PlugZap, ScrollText } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Hint, Label, Select, TextInput } from '@/components/Field'
import { ConfirmModal, PageHead } from '@/components/ui'
import { listMemberOptions } from '@/leads/api'
import type { MemberOption } from '@/leads/types'
import { cn } from '@/lib/cn'
import { ago } from '@/team/time'
import { useTenant } from '@/tenant/useTenant'
import { WaWebhookBox } from './WaWebhookBox'
import { disconnectIntegration, listIntegrations, saveIntegration, setIntegrationEnabled, setZoomDefault, type IntegrationRow } from './api'
import { db } from '@/lib/supabase'
import { mask, PROVIDERS, WHATSAPP_VENDORS, zoomKeysPrompt, type Provider, type WhatsAppVendor } from './providers'
import { Flash } from '@/components/Flash'
import { connectZoom, testZoom } from '@/zoom/api'
import { CallyzerConnect } from '@/callyzer/CallyzerConnect'
import { syncCallyzer } from '@/callyzer/api'
import { connectMeta, listAdAccounts, syncMeta, updateAdAccount, type AdAccount } from '@/meta/api'
import { MetaTokenConnect } from '@/meta/MetaTokenConnect'

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
  const load = useCallback(() => {
    listIntegrations(tenant.id).then(setRows, (e: Error) => setNotice({ error: e.message }))
    listAdAccounts(tenant.id).then(setAdAccounts, () => setAdAccounts([]))
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
  const [metaSettings, setMetaSettings] = useState<IntegrationRow | null>(null)
  // Add with a token (row: a new token for that connection)
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
              {p.id === 'facebook_ads' && accounts.length > 0 && (
                <div className="int-accounts">
                  {accounts.map((a) => {
                    const mine = adAccounts.filter((x) => x.integration_id === a.id)
                    return (
                      <div key={a.id}>
                        <div className="int-account">
                          <div className="int-account-main">
                            <b>{a.label || 'Facebook'}</b>
                            <span className="muted small">
                              {a.config.fb_name ? `${a.config.fb_name} · ` : ''}{a.config.auth === 'token' ? 'Connected with a token' : 'Connected with Facebook'} · {mine.length} ad account{mine.length === 1 ? '' : 's'}
                              {a.status === 'error' && a.last_error ? ` · ${a.last_error}` : ''}
                            </span>
                          </div>
                          <div className="int-account-actions">
                            {!off && a.config.auth === 'token' && (
                              <button type="button" className={cn('btn btn-sm', a.status === 'error' ? 'btn-outline' : 'btn-ghost')} title="Paste a new token for this connection" onClick={() => setMetaToken({ row: a })}>
                                New token
                              </button>
                            )}
                            {!off && a.config.auth !== 'token' && (
                              <button type="button" className={cn('btn btn-sm', a.status === 'error' ? 'btn-outline' : 'btn-ghost')} disabled={!!metaWait} title="Log in to Facebook again, or share more ad accounts" onClick={() => connectFb(a.id)}>
                                Reconnect
                              </button>
                            )}
                            {!off && (
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMetaSettings(a)}>
                                Settings
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(a)}>
                              Remove
                            </button>
                          </div>
                        </div>
                        {mine.map((x) => (
                          <div key={x.id} className="int-account int-subaccount">
                            <label className="switch" title={x.is_enabled ? 'Stop bringing in this account’s numbers' : 'Bring in this account’s numbers'}>
                              <input type="checkbox" checked={x.is_enabled} disabled={off} onChange={() => void toggleAdAccount(x)} />
                            </label>
                            <div className="int-account-main">
                              <b>{x.name || x.act_id}</b>
                              <span className="muted small">
                                {x.act_id.replace(/^act_/, '')}
                                {x.currency ? ` · ${x.currency}` : ''}
                                {x.last_error
                                  ? ` · ${x.last_error}`
                                  : x.last_sync_at
                                    ? ` · numbers checked ${ago(x.last_sync_at)}`
                                    : x.synced_until
                                      ? ` · bringing in history (up to ${x.synced_until})`
                                      : ' · first pull in a minute'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
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
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen({ p: p.id === 'zoom' ? zoomKeys(p) : p, row: a })}>
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
                    : p.id === 'facebook_ads' && !off && accounts.length
                      ? 'Numbers every 3 hours · last 7 days again every night'
                    : off ? 'Turned off by BizDock' : p.multiple ? (accounts.length ? (p.id === 'zoom' ? 'Add as many Zoom accounts as you use' : 'Add as many ad accounts as you run') : 'Not set up yet') : r ? `Connected ${ago(r.connected_at)}${r.connected_by ? ` by ${members.find((m) => m.id === r.connected_by)?.name ?? 'someone'}` : ''}` : 'Not set up yet'}
                </span>
                <div className="row">
                  {p.id === 'whatsapp' && r && !stale && r.is_enabled && waVendor === 'wati' && (
                    <Link to="/integrations/whatsapp/templates" className="btn btn-outline btn-sm">
                      <MessageSquareText size={14} /> Templates
                    </Link>
                  )}
                  {p.id === 'whatsapp' && r && !stale && r.is_enabled && waVendor === 'wati' && (
                    <Link to="/integrations/whatsapp/logs" className="btn btn-outline btn-sm">
                      <ScrollText size={14} /> Logs
                    </Link>
                  )}
                  {p.id === 'zoom' && !off && (
                    <button type="button" className="btn btn-ghost btn-sm" title="With a Server-to-Server app made in that Zoom account" onClick={() => setOpen({ p: zoomKeys(p), row: null })}>
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
                  {p.id === 'facebook_ads' && !off && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setMetaToken({ row: null })}>
                      Add with a token
                    </button>
                  )}
                  {p.id === 'facebook_ads' && !off && (
                    <button type="button" className={cn('btn btn-sm', accounts.length ? 'btn-outline' : 'btn-primary')} disabled={!!metaWait} onClick={() => connectFb()}>
                      <PlugZap size={14} /> {metaWait ? 'Waiting for Facebook…' : accounts.length ? 'Add another Facebook login' : 'Continue with Facebook'}
                    </button>
                  )}
                  {p.multiple && p.id !== 'zoom' && p.id !== 'facebook_ads' && !off && (
                    <button type="button" className={cn('btn btn-sm', accounts.length ? 'btn-outline' : 'btn-primary')} onClick={() => setOpen({ p, row: null })}>
                      <PlugZap size={14} /> {accounts.length ? 'Add account' : 'Connect'}
                    </button>
                  )}
                  {p.id === 'callyzer' && !off && r && (
                    <button type="button" className="btn btn-outline btn-sm" disabled={czBusy || !r.is_enabled} onClick={() => void czSync()}>
                      {czBusy ? 'Checking…' : 'Sync now'}
                    </button>
                  )}
                  {p.id === 'callyzer' && !off && r && (
                    <Link to="/integrations/callyzer/logs" className="btn btn-outline btn-sm">
                      <ScrollText size={14} /> Logs
                    </Link>
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
                        <PlugZap size={14} /> Connect
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
      {metaSettings && (
        <MetaSettingsDrawer
          row={metaSettings}
          accounts={adAccounts.filter((x) => x.integration_id === metaSettings.id)}
          onClose={() => setMetaSettings(null)}
          onSaved={(msg) => {
            setMetaSettings(null)
            setNotice({ ok: msg })
            load()
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
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(provider.fields.map((f) => [f.key, f.secret ? '' : (existing?.config[f.key] ?? (f.options ? f.options[0] : ''))])),
  )
  const [label, setLabel] = useState(existing?.label ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const Icon = provider.icon

  async function save() {
    if (provider.multiple && !label.trim()) return setError('Give this account a name.')
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
      <div className="stack">
        <div className="int-top">
          <div className="int-icon" style={{ ['--c' as string]: provider.color }}>
            <Icon size={20} />
          </div>
          <div>
            <b>{provider.name}</b>
            <div className="muted small">{provider.description}</div>
          </div>
        </div>
        {provider.id === 'zoom' && <ZoomPromptBox />}
        {provider.guide && (
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
        {provider.multiple && (
          <div>
            <Label htmlFor="int-label" required>
              Account name
            </Label>
            <TextInput id="int-label" placeholder={provider.accountHint ?? 'e.g. Studio ads, Webinar ads'} value={label} onChange={(e) => setLabel(e.target.value)} />
            <Hint>Your own name for this account, to tell several apart.</Hint>
          </div>
        )}
        {provider.fields.map((f) => (
          <div key={f.key}>
            <Label htmlFor={`int-${f.key}`} required={f.required && !(f.secret && existing?.config[f.key])}>
              {f.label}
            </Label>
            {f.options ? (
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
        {existing && provider.id === 'whatsapp' && vendor === 'wati' && <WaWebhookBox />}
        {existing && (
          <div className="muted small row" style={{ gap: 6 }}>
            <CheckCircle2 size={14} /> Last updated {ago(existing.updated_at)}
          </div>
        )}
      </div>
    </Drawer>
  )
}

/** Add with keys: a ready prompt for Claude in Chrome that makes the Zoom app with every scope */
function ZoomPromptBox() {
  const [copied, setCopied] = useState(false)
  const text = zoomKeysPrompt()
  return (
    <div className="int-guide">
      <b>Let Claude in Chrome make the Zoom app</b>
      <p className="muted small" style={{ margin: '4px 0 8px' }}>
        Log in at marketplace.zoom.us as the Zoom account’s owner or admin, open Claude in Chrome, paste this, and it makes the app with every permission BizDock
        needs. Then copy the three keys from its App Credentials page into the boxes below.
      </p>
      <pre className="embed-code" style={{ maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{text}</pre>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        style={{ marginTop: 8 }}
        onClick={() =>
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
        }
      >
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy prompt'}
      </button>
    </div>
  )
}

/** a Facebook connection's settings: the GST % added to its ad accounts' spend (Meta India charges 18%) */
function MetaSettingsDrawer({ row, accounts, onClose, onSaved }: { row: IntegrationRow; accounts: AdAccount[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [rates, setRates] = useState<Record<string, string>>(() => Object.fromEntries(accounts.map((a) => [a.id, String(a.gst_rate)])))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    for (const a of accounts) {
      const v = Number(rates[a.id])
      if (!Number.isFinite(v) || v < 0 || v > 50) return setError(`GST for ${a.name ?? a.act_id} must be between 0 and 50.`)
    }
    setBusy(true)
    try {
      for (const a of accounts) if (Number(rates[a.id]) !== Number(a.gst_rate)) await updateAdAccount(a.id, { gst_rate: Number(rates[a.id]) })
      onSaved('Facebook settings saved.')
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      width={480}
      title={`${row.label || 'Facebook'} · Settings`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <Hint>Reports show ad spend with GST added (hover a number to see both). Meta India charges 18%.</Hint>
        {accounts.map((a) => (
          <div key={a.id}>
            <Label htmlFor={`gst-${a.id}`}>GST % · {a.name || a.act_id}</Label>
            <TextInput id={`gst-${a.id}`} type="number" min={0} max={50} step="0.01" value={rates[a.id] ?? ''} onChange={(e) => setRates((r) => ({ ...r, [a.id]: e.target.value }))} />
          </div>
        ))}
        {!accounts.length && <div className="muted small">No ad accounts in this connection.</div>}
      </div>
    </Drawer>
  )
}
