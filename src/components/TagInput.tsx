import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'

/** Type a tag and press Enter (or comma) to add it; × removes it. */
export function TagInput({
  id,
  value,
  onChange,
  placeholder = 'Type a tag and press Enter',
  disabled,
}: {
  id?: string
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [text, setText] = useState('')

  function add(raw: string) {
    const parts = raw.split(',').map((t) => t.trim()).filter(Boolean)
    if (!parts.length) return
    const have = new Set(value.map((t) => t.toLowerCase()))
    const next = [...value]
    for (const p of parts) if (!have.has(p.toLowerCase())) (next.push(p), have.add(p.toLowerCase()))
    onChange(next)
    setText('')
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(text)
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className={`tag-input${disabled ? ' is-disabled' : ''}`}>
      {value.map((t) => (
        <span key={t} className="tag-chip">
          {t}
          {!disabled && (
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
              <X size={12} />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          id={id}
          value={text}
          placeholder={value.length ? '' : placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => add(text)}
        />
      )}
    </div>
  )
}
