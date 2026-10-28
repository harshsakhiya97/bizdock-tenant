import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, CircleAlert, MessageSquareText, PlugZap } from 'lucide-react'
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
import { disconnectIntegration, listIntegrations, saveIntegration, setIntegrationEnabled, type IntegrationRow } from './api'
import { db } from '@/lib/supabase'
import { mask, PROVIDERS, WHATSAPP_VENDORS, type Provider, type WhatsAppVendor } from './providers'
import { Flash } from '@/components/Flash'
import { testZoom } from '@/zoom/api'

/** System Connections: third-party services (WhatsApp, Callyzer, Zoom, voice calls, Perisclaw). */
export function IntegrationsPage() {
  const tenant = useTenant()
  const [rows, setRows] = useState<IntegrationRow[] | null>(null)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [open, setOpen] = useState<{ p: Provider; row: IntegrationRow | null } | null>(null)
  const [removing, setRemoving] = useState<IntegrationRow | null>(null)
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

  const load = useCallback(() => {
    listIntegrations(tenant.id).then(setRows, (e: Error) => setNotice({ error: e.message }))
  }, [tenant.id])
  useEffect(load, [load])
  useEffect(() => {
    void listMemberOptions(tenant.id).then(setMembers)
  }, [tenant.id])

  const byProvider = new Map((rows ?? []).map((r) => [r.provider, r]))
  const allOf = (id: string) => (rows ?? []).filter((r) => r.provider === id)
  const connected = new Set((rows ?? []).filter((r) => r.is_enabled && r.status === 'connected').map((r) => r.provider)).size

  const [testing, setTesting] = useState<string | null>(null)
  async function test(r: IntegrationRow) {
    setTesting(r.id)
    try {
      const u = await testZoom(r.id)
      setNotice({ ok: `${r.label}: connected to Zoom as ${u.name || u.email}${u.email ? ` (${u.email})` : ''}.` })
    } catch (e) {
      setNotice({ error: `${r.label}: ${(e as Error).message}` })
    }
    setTesting(null)
    load()
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
              {p.multiple && accounts.length > 0 && (
                <div className="int-accounts">
                  {accounts.map((a) => (
                    <div key={a.id} className="int-account">
                      <label className="switch" title={a.is_enabled ? 'Pause' : 'Turn on'}>
                        <input type="checkbox" checked={a.is_enabled} disabled={off} onChange={() => void toggle(a)} />
                      </label>
                      <div className="int-account-main">
                        <b>
                          {a.label || a.config.ad_account_id}
                          {p.id === 'zoom' && a.config.is_default === 'Yes' && <span className="badge badge-muted" style={{ marginLeft: 6 }}>Default</span>}
                        </b>
                        <span className="muted small">
                          {p.id === 'zoom' ? a.config.host_email || 'App owner' : a.config.ad_account_id}
                          {a.status === 'error' && a.last_error ? ` · ${a.last_error}` : ''}
                        </span>
                      </div>
                      <div className="int-account-actions">
                      {!off && p.id === 'zoom' && (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={testing === a.id} onClick={() => void test(a)}>
                          {testing === a.id ? 'Testing…' : 'Test'}
                        </button>
                      )}
                      {!off && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen({ p, row: a })}>
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
              {off && allow && <div className="int-note">BizDock has turned {p.name} off for your workspace. Disconnect to remove the saved keys.</div>}
              {stale && <div className="int-err"><CircleAlert size={14} /> Your WhatsApp provider is now {WHATSAPP_VENDORS[waVendor!].label}. Enter its keys again.</div>}
              {r?.status === 'error' && r.last_error && (
                <div className="int-err">
                  <CircleAlert size={14} /> {r.last_error}
                </div>
              )}
              <div className="int-foot">
                <span className="muted small">
                  {off ? 'Turned off by BizDock' : p.multiple ? (accounts.length ? (p.id === 'zoom' ? 'Add as many Zoom accounts as you use' : 'Add as many ad accounts as you run') : 'Not set up yet') : r ? `Connected ${ago(r.connected_at)}${r.connected_by ? ` by ${members.find((m) => m.id === r.connected_by)?.name ?? 'someone'}` : ''}` : 'Not set up yet'}
                </span>
                <div className="row">
                  {p.id === 'whatsapp' && r && !stale && r.is_enabled && waVendor === 'wati' && (
                    <Link to="/integrations/whatsapp/templates" className="btn btn-outline btn-sm">
                      <MessageSquareText size={14} /> Templates
                    </Link>
                  )}
                  {p.multiple && !off && (
                    <button type="button" className={cn('btn btn-sm', accounts.length ? 'btn-outline' : 'btn-primary')} onClick={() => setOpen({ p, row: null })}>
                      <PlugZap size={14} /> {accounts.length ? 'Add account' : 'Connect'}
                    </button>
                  )}
                  {r && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(r)}>
                      Disconnect
                    </button>
                  )}
                  {!off && !p.multiple && (
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
          onClose={() => setOpen(null)}
          onSaved={(msg) => {
            setOpen(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}
      {removing && (
        <ConfirmModal
          open
          title={`${removing.label ? `Remove ${removing.label}` : `Disconnect ${PROVIDERS.find((p) => p.id === removing.provider)?.name}`}?`}
          message="The saved keys are removed. Anything using this connection stops until it is connected again."
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
  onClose,
  onSaved,
}: {
  provider: Provider
  existing: IntegrationRow | null
  /** a saved row whose keys no longer fit (WhatsApp provider changed): overwritten */
  replaceId: string | null
  vendor: WhatsAppVendor | null
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
    setBusy(true)
    try {
      await saveIntegration(tenant.id, membership?.id, existing ?? (replaceId ? ({ id: replaceId } as IntegrationRow) : null), provider.id, config, provider.multiple ? label.trim() : null)
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
        {provider.guide && (
          <div className="int-guide">
            <b>How to get these keys</b>
            <ol>
              {provider.guide.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
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
        {existing && (
          <div className="muted small row" style={{ gap: 6 }}>
            <CheckCircle2 size={14} /> Last updated {ago(existing.updated_at)}
          </div>
        )}
      </div>
    </Drawer>
  )
}
