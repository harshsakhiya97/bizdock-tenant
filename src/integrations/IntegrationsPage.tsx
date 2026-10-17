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

/** System Connections: third-party services (WhatsApp, Callyzer, Zoom, voice calls, Perisclaw). */
export function IntegrationsPage() {
  const tenant = useTenant()
  const [rows, setRows] = useState<IntegrationRow[] | null>(null)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [open, setOpen] = useState<Provider | null>(null)
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

  const load = useCallback(() => {
    listIntegrations(tenant.id).then(setRows, (e: Error) => setNotice({ error: e.message }))
  }, [tenant.id])
  useEffect(load, [load])
  useEffect(() => {
    void listMemberOptions(tenant.id).then(setMembers)
  }, [tenant.id])

  const byProvider = new Map((rows ?? []).map((r) => [r.provider, r]))
  const connected = (rows ?? []).filter((r) => r.is_enabled && r.status === 'connected').length

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
        subtitle={`Connect the third-party services BizDock works with. ${rows ? `${connected} of ${PROVIDERS.length} connected.` : ''}`}
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      {notice.ok && <div className="alert alert-info">{notice.ok}</div>}

      <div className="int-grid">
        {PROVIDERS.map((p) => {
          const r = byProvider.get(p.id)
          const Icon = p.icon
          const off = blocked(p)
          // the admin switched WhatsApp to another provider: the saved keys don't fit
          const stale = p.id === 'whatsapp' && !!r && !!waVendor && r.config.vendor !== waVendor
          const state = off ? 'blocked' : stale ? 'reconnect' : !r ? 'off' : !r.is_enabled ? 'paused' : r.status
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
              {off && allow && <div className="int-note">{p.name} isn’t enabled for your workspace yet. Ask BizDock to turn it on.</div>}
              {stale && <div className="int-err"><CircleAlert size={14} /> Your WhatsApp provider is now {WHATSAPP_VENDORS[waVendor!].label}. Enter its keys again.</div>}
              {r?.status === 'error' && r.last_error && (
                <div className="int-err">
                  <CircleAlert size={14} /> {r.last_error}
                </div>
              )}
              <div className="int-foot">
                <span className="muted small">
                  {off ? 'Turned on by BizDock' : r ? `Connected ${ago(r.connected_at)}${r.connected_by ? ` by ${members.find((m) => m.id === r.connected_by)?.name ?? 'someone'}` : ''}` : 'Not set up yet'}
                </span>
                <div className="row">
                  {p.id === 'whatsapp' && r && !stale && r.is_enabled && waVendor === 'wati' && (
                    <Link to="/integrations/whatsapp/templates" className="btn btn-outline btn-sm">
                      <MessageSquareText size={14} /> Templates
                    </Link>
                  )}
                  {r && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(r)}>
                      Disconnect
                    </button>
                  )}
                  {!off && (
                  <button type="button" className={cn('btn btn-sm', r && !stale ? 'btn-outline' : 'btn-primary')} onClick={() => setOpen(effective(p))}>
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
          provider={open}
          existing={((r) => (r && open.id === 'whatsapp' && r.config.vendor !== waVendor ? null : r))(byProvider.get(open.id) ?? null)}
          replaceId={byProvider.get(open.id)?.id ?? null}
          vendor={open.id === 'whatsapp' ? waVendor : null}
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
          title={`Disconnect ${PROVIDERS.find((p) => p.id === removing.provider)?.name}?`}
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
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const Icon = provider.icon

  async function save() {
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
      await saveIntegration(tenant.id, membership?.id, existing ?? (replaceId ? ({ id: replaceId } as IntegrationRow) : null), provider.id, config)
      onSaved(existing ? `${provider.name} settings saved.` : `${provider.name} connected.`)
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
      title={existing ? `${provider.name} settings` : `Connect ${provider.name}`}
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
