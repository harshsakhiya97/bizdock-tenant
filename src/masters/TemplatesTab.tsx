import { useCallback, useEffect, useRef, useState } from 'react'
import { Bold, ChevronLeft, ChevronRight, Italic, Pencil, Plus, Strikethrough, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Hint, Label, Select, TextInput } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { deleteTemplate, listTemplates, saveTemplate } from '@/bookings/api'
import { CATEGORY_LABEL, type MessageTemplate, type TemplateCategory } from '@/bookings/types'
import { useTenant } from '@/tenant/useTenant'
import { WaBubble } from '@/integrations/WaBubble'

const PAGE = 10
const VARS = ['first_name', 'purpose', 'required_on', 'business', 'booking_date', 'booking_time']

/** Masters → WhatsApp messages: ready messages picked from a lead / client by situation. */
export function TemplatesTab({ canEdit, onNotice }: { canEdit: boolean; onNotice: (n: { ok?: string; error?: string }) => void }) {
  const tenant = useTenant()
  const [rows, setRows] = useState<MessageTemplate[] | null>(null)
  const [edit, setEdit] = useState<Partial<MessageTemplate> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(1)
  // situation filter ('' = all)
  const [cat, setCat] = useState<TemplateCategory | ''>('')

  const load = useCallback(() => {
    listTemplates(tenant.id).then(setRows, (e: Error) => onNotice({ error: e.message }))
  }, [tenant.id, onNotice])
  useEffect(load, [load])

  async function save() {
    if (!edit?.title?.trim()) return setError('Give the message a title.')
    if (!edit.body?.trim()) return setError('Write the message.')
    setBusy(true)
    try {
      await saveTemplate(tenant.id, { ...edit, title: edit.title, body: edit.body, category: edit.category ?? 'follow_up' })
      setEdit(null)
      onNotice({ ok: 'Message saved.' })
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // 10 a page
  const shown = (rows ?? []).filter((t) => !cat || t.category === cat)
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const current = Math.min(page, pages)

  async function remove(t: MessageTemplate) {
    try {
      await deleteTemplate(t.id)
      onNotice({ ok: `${t.title} removed.` })
      load()
    } catch (e) {
      onNotice({ error: (e as Error).message })
    }
  }

  return (
    <>
      <div className="panel-bar">
        <div>
          <b>WhatsApp messages</b>
          <div className="muted small">Ready messages by situation, picked when you WhatsApp a lead or client.</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
        <select
          className="input input-sm filter-select"
          aria-label="Situation"
          value={cat}
          onChange={(e) => {
            setCat(e.target.value as TemplateCategory | '')
            setPage(1)
          }}
        >
          <option value="">All situations</option>
          {(Object.keys(CATEGORY_LABEL) as TemplateCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]} ({(rows ?? []).filter((t) => t.category === c).length})
            </option>
          ))}
        </select>
        {canEdit && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { setError(null); setEdit({ category: cat || 'follow_up', is_active: true, title: '', body: '' }) }}>
            <Plus size={15} /> Add message
          </button>
        )}
        </div>
      </div>
      {!rows ? (
        <div className="empty">Loading…</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Situation</th>
                <th>Title</th>
                <th>Message</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.slice((current - 1) * PAGE, current * PAGE).map((t) => (
                <tr key={t.id}>
                  <td className="nowrap">{CATEGORY_LABEL[t.category]}</td>
                  <td className="nowrap">
                    <b>{t.title}</b>
                  </td>
                  <td className="muted small" style={{ maxWidth: 460 }}>
                    <div className="tpl-body-cell">{t.body}</div>
                  </td>
                  <td>{t.is_active ? 'Yes' : 'No'}</td>
                  <td className="num nowrap">
                    {canEdit && (
                      <>
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Edit" onClick={() => { setError(null); setEdit(t) }}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove" onClick={() => void remove(t)}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={5} className="muted">{rows.length ? 'No messages for this situation.' : 'No messages yet.'}</td>
                </tr>
              )}
            </tbody>
          </table>
          {shown.length > PAGE && (
            <div className="table-foot">
              <span>
                Showing {(current - 1) * PAGE + 1}–{Math.min(current * PAGE, shown.length)} of {shown.length}
              </span>
              <div className="pager">
                <button type="button" onClick={() => setPage(Math.max(1, current - 1))} aria-label="Previous">
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" className={n === current ? 'is-active' : ''} onClick={() => setPage(n)}>
                    {n}
                  </button>
                ))}
                <button type="button" onClick={() => setPage(Math.min(pages, current + 1))} aria-label="Next">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          width={980}
          title={edit.id ? 'Edit message' : 'Add message'}
          footer={
            <>
              <Button variant="outline" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <div className="foot-end">
                {error && <p className="err-text">{error}</p>}
                <Button onClick={save} disabled={busy}>
                  {busy ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </>
          }
        >
          <div className="form-grid">
            <div>
              <Label htmlFor="t-cat" required>
                Situation
              </Label>
              <Select id="t-cat" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as TemplateCategory })}>
                {(Object.keys(CATEGORY_LABEL) as TemplateCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="t-title" required>
                Title
              </Label>
              <TextInput id="t-title" value={edit.title ?? ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </div>
            <div className="span-2">
              <MessageEditor value={edit.body ?? ''} onChange={(body) => setEdit({ ...edit, body })} />
            </div>
            <label className="check-inline span-2">
              <input type="checkbox" checked={edit.is_active ?? true} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Active
            </label>
          </div>
        </Modal>
      )}
    </>
  )
}

/**
 * The message box: WhatsApp formatting (*bold* _italic_ ~strike~), line breaks and emojis are kept as typed;
 * buttons wrap the selected text; a variable is inserted at the cursor; the right side shows it as WhatsApp will.
 */
function MessageEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  function wrap(mark: string) {
    const el = ref.current
    if (!el) return
    const a = el.selectionStart
    const b = el.selectionEnd
    const sel = value.slice(a, b) || 'text'
    onChange(value.slice(0, a) + mark + sel + mark + value.slice(b))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(a + mark.length, a + mark.length + sel.length)
    })
  }
  function insert(tag: string) {
    const el = ref.current
    const a = el?.selectionStart ?? value.length
    const b = el?.selectionEnd ?? value.length
    onChange(value.slice(0, a) + tag + value.slice(b))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(a + tag.length, a + tag.length)
    })
  }
  return (
    <div className="tpl-editor">
      <div>
        <Label htmlFor="t-body" required>
          Message
        </Label>
        <div className="tpl-toolbar">
          <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Bold (*text*)" aria-label="Bold" onClick={() => wrap('*')}>
            <Bold size={15} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Italic (_text_)" aria-label="Italic" onClick={() => wrap('_')}>
            <Italic size={15} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Strikethrough (~text~)" aria-label="Strikethrough" onClick={() => wrap('~')}>
            <Strikethrough size={15} />
          </button>
          <select className="input input-sm" aria-label="Insert a field" value="" onChange={(e) => e.target.value && insert(`{{${e.target.value}}}`)}>
            <option value="">Insert a field…</option>
            {VARS.map((v) => (
              <option key={v} value={v}>
                {`{{${v}}}`}
              </option>
            ))}
          </select>
        </div>
        <textarea ref={ref} id="t-body" className="input tpl-textarea" rows={16} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type or paste the message. Line breaks and emojis stay as they are." />
        <Hint>*bold* · _italic_ · ~strike~ · line breaks and emojis are kept. Fills in: {VARS.map((v) => `{{${v}}}`).join(' ')}</Hint>
      </div>
      <div>
        <span className="field-label">Preview</span>
        <div className="tpl-preview">
          <WaBubble body={value} />
        </div>
      </div>
    </div>
  )
}
