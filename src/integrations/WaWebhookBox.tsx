import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Hint } from '@/components/Field'
import { useTenant } from '@/tenant/useTenant'
import { at, waHook, waHookUrl } from './waLogs'

/** WhatsApp · WATI settings: the workspace's webhook address to add in WATI (delivered / read times and replies in WhatsApp logs) */
export function WaWebhookBox() {
  const tenant = useTenant()
  const [hook, setHook] = useState<{ key: string; last_event_at: string | null } | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    void waHook(tenant.id).then(setHook, () => setHook(null))
  }, [tenant.id])
  if (!hook) return null
  const url = waHookUrl(hook.key)
  return (
    <div className="stack" style={{ gap: 6 }}>
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
      </div>
      <Hint>
        For delivered / read times and replies in WhatsApp logs: in WATI → Webhooks, add this URL once and tick the message events (message received,
        template message sent, delivered, read, failed). {hook.last_event_at ? `Last event from WATI: ${at(hook.last_event_at)}.` : 'Nothing received from WATI yet.'}
      </Hint>
    </div>
  )
}
