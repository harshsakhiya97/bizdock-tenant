import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { Hint, Label } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { shortBase } from '@/workflows/api'
import { embedCode, type WidgetRow } from './api'

/** the widget's embed address on the workspace's domain, and the iframe to paste */
export const embedUrl = (code: string) => `${shortBase()}/embed/${code}`

export function EmbedModal({ widget, onClose }: { widget: WidgetRow; onClose: () => void }) {
  const url = embedUrl(widget.code)
  const code = embedCode(url, widget.name)
  const [copied, setCopied] = useState<'url' | 'code' | null>(null)
  const copy = (what: 'url' | 'code', text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(what)
      setTimeout(() => setCopied(null), 1500)
    })
  }
  return (
    <Modal open onClose={onClose} title={`Embed · ${widget.name}`} width={640}>
      <div className="stack" style={{ gap: 14 }}>
        <div>
          <Label>Embed code</Label>
          <pre className="embed-code">{code}</pre>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => copy('code', code)}>
              {copied === 'code' ? <Check size={14} /> : <Copy size={14} />} {copied === 'code' ? 'Copied' : 'Copy embed code'}
            </button>
          </div>
          <Hint>Paste it into your page’s HTML where the calendar should show.{widget.is_active ? '' : ' The widget is off: it shows “not available” until you turn it on.'}</Hint>
        </div>
        <div>
          <Label>Link</Label>
          <div className="row" style={{ gap: 8 }}>
            <code className="embed-url">{url}</code>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => copy('url', url)}>
              {copied === 'url' ? <Check size={14} /> : <Copy size={14} />} {copied === 'url' ? 'Copied' : 'Copy'}
            </button>
            <a className="btn btn-outline btn-sm" href={url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Open
            </a>
          </div>
        </div>
      </div>
    </Modal>
  )
}
