import { useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/cn'

/** a ready prompt for Claude in Chrome, with Copy */
export function PromptBox({ title, note, text }: { title: ReactNode; note?: ReactNode; text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="int-guide">
      <b>{title}</b>
      {note && (
        <p className="muted small" style={{ margin: '4px 0 8px' }}>
          {note}
        </p>
      )}
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

/** a connect side panel's two tabs: the form (keys / token) and Prompt & steps */
export function FormPromptTabs<T extends string>({ tabs, value, onChange }: { tabs: readonly (readonly [T, string])[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" style={{ marginBottom: 16 }}>
      {tabs.map(([k, label]) => (
        <button key={k} type="button" className={cn('tab', value === k && 'is-active')} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  )
}
