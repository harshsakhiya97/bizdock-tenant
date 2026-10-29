import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, FlaskConical, RefreshCw } from 'lucide-react'
import { Hint, TextInput } from '@/components/Field'
import { webhookUrl } from '@/funnels/api'
import { ensureWorkflowHook, getWorkflowHook, listenWorkflowHook, regenerateWorkflowHook, saveWorkflowHookFields } from './api'
import { varKey, type WorkflowHook } from './types'

/** tell the builder the hook changed (its variables are used by the other steps) */
export const HOOK_EVENT = 'bizdock:workflow-hook'
const announce = (h: WorkflowHook) => window.dispatchEvent(new CustomEvent<WorkflowHook>(HOOK_EVENT, { detail: h }))

const show = (v: unknown) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/**
 * "On webhook call" trigger: the workflow's own webhook URL (not tied to a funnel; nothing is saved on leads),
 * a test post to see what it sends, and the fields kept as variables for the steps.
 */
export function HookTrigger({ workflowId, disabled }: { workflowId?: string; disabled: boolean }) {
  const [hook, setHook] = useState<WorkflowHook | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [listening, setListening] = useState(false)
  const [search, setSearch] = useState('')
  // field → variable name ('' = not used)
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const poll = useRef<number | null>(null)

  useEffect(() => {
    if (!workflowId) return
    ensureWorkflowHook(workflowId).then(
      (h) => {
        setHook(h)
        setPicked(h.field_map ?? {})
        announce(h)
      },
      (e: Error) => setError(e.message),
    )
    return () => {
      if (poll.current) window.clearInterval(poll.current)
    }
  }, [workflowId])

  async function listen() {
    if (!hook || !workflowId) return
    setError(null)
    try {
      await listenWorkflowHook(hook.id)
      setListening(true)
      const before = hook.sample_at
      const until = Date.now() + 10 * 60_000
      if (poll.current) window.clearInterval(poll.current)
      poll.current = window.setInterval(async () => {
        const h = await getWorkflowHook(workflowId).catch(() => null)
        if (h && h.sample_at && h.sample_at !== before) {
          window.clearInterval(poll.current!)
          setListening(false)
          setHook(h)
          announce(h)
        } else if (Date.now() > until) {
          window.clearInterval(poll.current!)
          setListening(false)
        }
      }, 3000)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function regenerate() {
    if (!workflowId || !hook) return
    try {
      const key = await regenerateWorkflowHook(workflowId)
      const h = { ...hook, webhook_key: key }
      setHook(h)
      announce(h)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function saveFields() {
    if (!hook) return
    setSaving(true)
    setError(null)
    const map = Object.fromEntries(Object.entries(picked).filter(([, v]) => v.trim()).map(([k, v]) => [k, varKey(v)]))
    try {
      await saveWorkflowHookFields(hook.id, map)
      const h = { ...hook, field_map: map }
      setHook(h)
      setPicked(map)
      announce(h)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  const fields = useMemo(() => Object.entries(hook?.sample ?? {}), [hook?.sample])
  const shown = fields.filter(([k, v]) => !search.trim() || `${k} ${show(v)}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 150)
  const dirty = JSON.stringify(picked) !== JSON.stringify(hook?.field_map ?? {})

  if (!workflowId) return <Hint>Save the workflow first to get its webhook URL.</Hint>
  if (error && !hook) return <div className="alert alert-error small">{error}</div>
  if (!hook) return <div className="muted small">Getting the webhook URL…</div>

  const url = webhookUrl(hook.webhook_key)
  return (
    <div className="stack">
      <div>
        <span className="field-label">Webhook URL</span>
        <div className="hook-url">
          <code>{url}</code>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              void navigator.clipboard.writeText(url)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
          </button>
          {!disabled && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void regenerate()} title="A new URL; the old one stops working">
              <RefreshCw size={14} />
            </button>
          )}
        </div>
        <Hint>Send a POST (JSON or form) here. Each post starts this workflow while it’s on. Not tied to a funnel: nothing is saved on leads.</Hint>
      </div>

      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        {!disabled && (
          <button type="button" className="btn btn-outline btn-sm" disabled={listening} onClick={() => void listen()}>
            <FlaskConical size={14} /> {listening ? 'Waiting for a test post…' : hook.sample_at ? 'Test again' : 'Send a test'}
          </button>
        )}
        <span className="muted small">
          {listening
            ? 'Post to the URL now (within 10 minutes); it’s kept as the test and doesn’t start the workflow.'
            : hook.sample_at
              ? `Test received ${new Date(hook.sample_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · ${fields.length} fields`
              : 'No test yet.'}
        </span>
      </div>
      {error && <div className="alert alert-error small">{error}</div>}

      {fields.length > 0 && (
        <div>
          <span className="field-label">Fields to use in the steps</span>
          <Hint>Tick the fields the steps need and name them (the name is the variable, e.g. {'{{phone}}'}). None ticked: every field, under its own name.</Hint>
          {fields.length > 8 && <TextInput placeholder="Search fields…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ margin: '6px 0' }} />}
          <div className="hook-fields">
            {shown.map(([k, v]) => {
              const on = k in picked
              return (
                <div key={k} className="hook-field">
                  <input
                    type="checkbox"
                    aria-label={`Use ${k}`}
                    disabled={disabled}
                    checked={on}
                    onChange={(e) =>
                      setPicked((p) => {
                        const n = { ...p }
                        if (e.target.checked) n[k] = varKey(k.split('.').slice(-2).join('_'))
                        else delete n[k]
                        return n
                      })
                    }
                  />
                  <div className="hook-field-main">
                    <code>{k}</code>
                    <span className="muted small">{show(v).slice(0, 80) || '—'}</span>
                  </div>
                  {on && (
                    <TextInput
                      aria-label="Variable name"
                      className="input-sm"
                      value={picked[k]}
                      disabled={disabled}
                      onChange={(e) => setPicked((p) => ({ ...p, [k]: e.target.value }))}
                    />
                  )}
                </div>
              )
            })}
            {fields.length > shown.length && <div className="muted small">Showing {shown.length} of {fields.length}; search to find the rest.</div>}
          </div>
          {!disabled && (
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={saving || !dirty} onClick={() => void saveFields()}>
                {saving ? 'Saving…' : 'Save fields'}
              </button>
              {saved && <span className="muted small">Saved.</span>}
            </div>
          )}
          <Hint>
            Name a field <code>phone</code> to send WhatsApp steps (“To the lead”) to that number; <code>name</code> / <code>first_name</code> fill {'{{name}}'} / {'{{first_name}}'}.
          </Hint>
        </div>
      )}
    </div>
  )
}
