import { Copy, ExternalLink, FileText, Image as ImageIcon, Phone, Reply, Video } from 'lucide-react'
import type { ReactNode } from 'react'

export type BubbleButton = { type: string; text: string }

/** WhatsApp formatting: *bold* _italic_ ~strike~, {{var}} highlighted */
function format(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|\{\{[^}]+\}\})/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const s = m[0]
    const inner = s.slice(1, -1)
    if (s.startsWith('{{')) out.push(<span key={i++} className="wa-var">{s}</span>)
    else if (s.startsWith('*')) out.push(<b key={i++}>{inner}</b>)
    else if (s.startsWith('_')) out.push(<i key={i++}>{inner}</i>)
    else out.push(<s key={i++}>{inner}</s>)
    last = m.index + s.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const btnIcon = (t: string) =>
  t === 'url' ? <ExternalLink size={13} /> : t === 'call' || t === 'voice_call' ? <Phone size={13} /> : t.includes('copy') ? <Copy size={13} /> : <Reply size={13} />

/** A message as it shows in WhatsApp: header, body, footer, buttons */
export function WaBubble({
  headerType,
  headerText,
  body,
  footer,
  buttons,
  time = '11:30',
}: {
  headerType?: string | null
  headerText?: string | null
  body: string
  footer?: string | null
  buttons?: BubbleButton[]
  time?: string
}) {
  const ht = (headerType ?? 'none').toLowerCase()
  return (
    <div className="wa-msg">
      <div className="wa-bubble">
        {ht === 'text' && headerText && <div className="wa-head-text">{headerText}</div>}
        {['image', 'video', 'document'].includes(ht) && (
          <div className="wa-media">
            {ht === 'image' ? <ImageIcon size={26} /> : ht === 'video' ? <Video size={26} /> : <FileText size={26} />}
          </div>
        )}
        <div className="wa-body">{body ? format(body) : <span className="muted">Template message…</span>}</div>
        {footer && <div className="wa-foot">{footer}</div>}
        <div className="wa-time">{time}</div>
      </div>
      {!!buttons?.length && (
        <div className="wa-btns">
          {buttons.map((b, i) => (
            <div key={i} className="wa-btn">
              {btnIcon(b.type)} {b.text || '…'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
