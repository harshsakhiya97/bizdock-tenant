import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, PlugZap } from 'lucide-react'
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
import { mask, PROVIDERS, type Provider } from './providers'

/** System Connections: third-party services (WhatsApp, Callyzer, Zoom, voice calls, Perisclaw). */
export function IntegrationsPage() {
  const tenant = useTenant()
  const [rows, setRows] = useState<IntegrationRow[] | null>(null)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [open, setOpen] = useState<Provider | null>(null)
  const [removing, setRemoving] = useState<IntegrationRow | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})

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
          const state = !r ? 'off' : !r.is_enabled ? 'paused' : r.status
          return (
            <section key={p.id} className="card int-card">
              <div className="int-top">
                <div className="int-icon" style={{ ['--c' as string]: p.color }}>
                  <Icon size={20} />
                </div>
                <div className="int-title">
                  <b>{p.name}</b>
                  <span
                    className={cn(
                      'badge',
                      state === 'connected' ? 'badge-success' : state === 'error' ? 'badge-danger' : state === 'paused' ? 'badge-warning' : 'badge-muted',
                    )}
                  >
                    {state === 'connected' ? 'Connected' : state === 'error' ? 'Error' : state === 'paused' ? 'Paused' : 'Not connected'}
                  </span>
                </div>
                {r && (
                  <label className="switch" title={r.is_enabled ? 'Pause' : 'Turn on'}>
                    <input type="checkbox" checked={r.is_enabled} onChange={() => void toggle(r)} />
                  </label>
                )}
              </div>
              <p className="int-desc">{p.description}</p>
              <div className="int-used">
                <span>Used for</span> {p.usedFor}
              </div>
              {r?.status === 'error' && r.last_error && (
                <div className="int-err">
                  <CircleAlert size={14} /> {r.last_error}
                </div>
              )}
              <div className="int-foot">
                <span className="muted small">
                  {r ? `Connected ${ago(r.connected_at)}${r.connected_by ? ` by ${members.find((m) => m.id === r.connected_by)?.name ?? 'someone'}` : ''}` : 'Not set up yet'}
                </span>
                <div className="row">
                  {r && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(r)}>
                      Disconnect
                    </button>
                  )}
                  <button type="button" className={cn('btn btn-sm', r ? 'btn-outline' : 'btn-primary')} onClick={() => setOpen(p)}>
                    {r ? 'Settings' : (
                      <>
                        <PlugZap size={14} /> Connect
                      </>
                    )}
                  </button>
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
          existing={byProvider.get(open.id) ?? null}
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
  onClose,
  onSaved,
}: {
  provider: Provider
  existing: IntegrationRow | null
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
    const config: Record<string, string> = { ...(existing?.config ?? {}) }
    for (const f of provider.fields) {
      const v = values[f.key]?.trim() ?? ''
      if (f.secret && !v && existing?.config[f.key]) continue
      if (f.required && !v) return setError(`${f.label} is required.`)
      config[f.key] = v
    }
    setBusy(true)
    try {
      await saveIntegration(tenant.id, membership?.id, existing, provider.id, config)
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
