import { useEffect, useMemo, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/Button'
import { Hint } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { useAuth } from '@/auth/useAuth'
import { cn } from '@/lib/cn'
import { useTenant } from '@/tenant/useTenant'
import { fillTemplate, listTemplates, sendWhatsApp } from './api'
import { CATEGORY_LABEL, type MessageTemplate, type TemplateCategory } from './types'

/** WhatsApp from a lead / client: pick a ready message by situation, edit it, open WhatsApp; a copy is kept. */
export function WhatsAppModal({
  lead,
  vars,
  defaultCategory = 'all',
  onClose,
  onSent,
}: {
  lead: { id: string; name: string; phone: string; whatsapp?: string | null; subtitle?: string }
  /** values for {{first_name}}, {{purpose}}, {{required_on}}, {{business}}, {{booking_date}}… */
  vars: Record<string, string | null | undefined>
  /** tab opened first (e.g. Follow-up from the follow-ups list) */
  defaultCategory?: TemplateCategory | 'all'
  onClose: () => void
  onSent: (msg: string) => void
}) {
  const tenant = useTenant()
  const { membership } = useAuth()
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null)
  const [cat, setCat] = useState<TemplateCategory | 'all'>(defaultCategory)
  const [picked, setPicked] = useState<MessageTemplate | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listTemplates(tenant.id)
      .then((t) => setTemplates(t.filter((x) => x.is_active)))
      .catch(() => setTemplates([]))
  }, [tenant.id])

  const cats = useMemo(() => [...new Set((templates ?? []).map((t) => t.category))], [templates])
  const shown = (templates ?? []).filter((t) => cat === 'all' || t.category === cat)

  function pick(t: MessageTemplate) {
    setPicked(t)
    setText(fillTemplate(t.body, vars))
  }

  async function send() {
    if (!text.trim()) return setError('Write the message or pick one.')
    setBusy(true)
    try {
      await sendWhatsApp(tenant.id, membership?.id, lead, { template_id: picked?.id ?? null, title: picked?.title ?? null, body: text.trim() })
      onSent('WhatsApp opened. The message is saved on the lead.')
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={760}
      title="WhatsApp message"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <div className="foot-end">
            {error && <p className="err-text">{error}</p>}
            <Button onClick={send} disabled={busy || !text.trim()}>
              <MessageCircle size={15} /> Open WhatsApp
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <div>
          <b>{lead.name}</b> <span className="muted small">· {lead.whatsapp || lead.phone}</span>
          {lead.subtitle && <div className="muted small">{lead.subtitle}</div>}
        </div>
        <div className="tabs">
          {(['all', ...cats] as const).map((c) => (
            <button key={c} type="button" className={cn('tab', cat === c && 'is-active')} onClick={() => setCat(c)}>
              {c === 'all' ? 'All' : CATEGORY_LABEL[c]}{' '}
              <span className="muted small">{c === 'all' ? (templates?.length ?? 0) : (templates ?? []).filter((t) => t.category === c).length}</span>
            </button>
          ))}
        </div>
        {!templates ? (
          <div className="muted small">Loading messages…</div>
        ) : (
          <div className="wa-grid">
            {shown.map((t) => (
              <button key={t.id} type="button" className={cn('wa-tpl', picked?.id === t.id && 'is-active')} onClick={() => pick(t)}>
                <b>{t.title}</b>
                <small>{fillTemplate(t.body, vars)}</small>
              </button>
            ))}
            {!shown.length && <div className="muted small">No messages here yet. Add them in Masters → WhatsApp messages.</div>}
          </div>
        )}
        <div>
          <span className="field-label">Message</span>
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pick a message above or type your own" />
          <Hint>Opens WhatsApp (web or app) with this text to {lead.whatsapp || lead.phone}. Sending through a WhatsApp provider comes later.</Hint>
        </div>
      </div>
    </Modal>
  )
}
