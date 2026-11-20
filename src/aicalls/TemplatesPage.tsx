import { useCallback, useEffect, useState } from 'react'
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Flash } from '@/components/Flash'
import { ConfirmModal, Empty, PageHead } from '@/components/ui'
import { useTenant } from '@/tenant/useTenant'
import { hx, kindLabel, readyMade, type CollectField, type TemplateForm, type TemplateRow } from './api'
import { emptyForm, TemplateDrawer } from './TemplateDrawer'

type Opt = { id: string; label: string }
type Data = { templates: TemplateRow[]; default: string | null; voices: Opt[]; personas: Opt[]; fixed_opening: boolean; lang_step: boolean }

/** AI Calling → Templates: the call scripts on HelloRix, ready-made ones to start from, add / edit in the side drawer */
export function AiTemplatesPage() {
  const tenant = useTenant()
  const { can } = useAuth()
  const { selected } = useBusiness()
  const canEdit = can('ai_calling', 'templates')
  const [data, setData] = useState<Data | null>(null)
  const [drawer, setDrawer] = useState<{ id: string | null; form: TemplateForm } | null>(null)
  const [deleting, setDeleting] = useState<TemplateRow | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const business = selected?.name ?? tenant.app_name
  const load = useCallback(() => {
    hx<Data>(tenant.id, { action: 'templates' }).then(setData, (e: Error) => {
      setData({ templates: [], default: null, voices: [], personas: [], fixed_opening: true, lang_step: true })
      setNotice({ error: e.message })
    })
  }, [tenant.id])
  useEffect(load, [load])

  async function edit(t: TemplateRow) {
    setOpening(t.id)
    try {
      const d = await hx<{ template: Record<string, unknown> }>(tenant.id, { action: 'template', objective_id: t.id })
      const x = d.template
      const raw = !!x.raw
      const str = (k: string) => (typeof x[k] === 'string' ? (x[k] as string) : '')
      setDrawer({
        id: t.id,
        form: {
          ...emptyForm(),
          name: str('name'),
          kind: str('kind') || 'qualify',
          purpose: raw ? '' : str('purpose'),
          scenario: raw ? str('scenario') || str('prompt') || str('purpose') : '',
          ask: raw && str('ask').startsWith('Follow the call instructions') ? '' : str('ask'),
          collect: ((x.collect ?? []) as CollectField[]).map((c) => ({ ...c, options: Array.isArray(c.options) ? c.options.join(', ') : c.options })),
          if_they_push_back: str('if_they_push_back'),
          closing: str('closing'),
          give_up: str('give_up'),
          voice_id: str('voice_id'),
          persona_id: str('persona_id'),
        },
      })
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
    setOpening(null)
  }

  const fields = (c: CollectField[] | null) => (c ?? []).map((x) => x.field).filter((f) => f !== 'preferred_language' && f !== 'callback_time')

  return (
    <>
      <PageHead
        title="Templates"
        subtitle="The call scripts the AI follows: who it is, what it asks and the answers it collects. Saved on HelloRix."
        actions={
          canEdit && (
            <button type="button" className="btn btn-primary" onClick={() => setDrawer({ id: null, form: emptyForm() })}>
              <Plus size={16} /> New template
            </button>
          )
        }
      />
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice.ok} dep={notice} />

      {!data ? (
        <div className="empty">Loading…</div>
      ) : !data.templates.length ? (
        <Empty icon={FileText}>No templates yet. Start from a ready-made one below, or New template.</Empty>
      ) : (
        <div className="ac-cards">
          {data.templates.map((t) => {
            const fs = fields(t.collect)
            return (
              <article key={t.id} className="card card-pad ac-card">
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <b>{t.name}</b>
                  {data.default === t.id && <span className="badge badge-success">Default</span>}
                  <span className="badge badge-muted">{kindLabel(t.kind)}</span>
                </div>
                <div className="muted small ac-clip">{t.prompt_mode === 'raw' ? 'Full prompt' : t.purpose || '—'}</div>
                {fs.length > 0 && <div className="small">Collects: {fs.map((f) => f.replace(/_/g, ' ')).join(', ')}</div>}
                <div className="muted small">
                  v{t.version ?? 1} · {t.id}
                </div>
                {canEdit && (
                  <div className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => void edit(t)} disabled={opening === t.id}>
                      <Pencil size={14} /> {opening === t.id ? 'Opening…' : 'Edit'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-icon btn-sm danger-text" title="Delete" onClick={() => setDeleting(t)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {canEdit && (
        <section style={{ marginTop: 20 }}>
          <b>Ready-made templates</b>
          <div className="muted small" style={{ marginBottom: 10 }}>
            Pick one, check the text and save. It already uses {business}.
          </div>
          <div className="ac-cards">
            {readyMade(business).map((r) => (
              <article key={r.id} className="card card-pad ac-card">
                <b>{r.title}</b>
                <div className="muted small">{r.use}</div>
                <div className="small">Collects: {r.form.collect.map((c) => c.field.replace(/_/g, ' ')).join(', ')}</div>
                <div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setDrawer({ id: null, form: r.form })}>
                    Use this template
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {drawer && data && (
        <TemplateDrawer
          key={drawer.id ?? `new-${drawer.form.name}`}
          objectiveId={drawer.id}
          initial={drawer.form}
          business={business}
          voices={data.voices}
          personas={data.personas}
          fixedOpening={data.fixed_opening}
          langStep={data.lang_step}
          onClose={() => setDrawer(null)}
          onSaved={(msg) => {
            setDrawer(null)
            setNotice({ ok: msg })
            load()
          }}
        />
      )}
      <ConfirmModal
        open={!!deleting}
        icon={Trash2}
        danger
        title="Delete this template?"
        message={deleting ? `“${deleting.name}” is archived on HelloRix and can’t be used for new calls. Calls already made keep their results.` : ''}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const t = deleting
          setDeleting(null)
          if (!t) return
          try {
            await hx(tenant.id, { action: 'template_delete', objective_id: t.id })
            setNotice({ ok: `${t.name} deleted.` })
            load()
          } catch (e) {
            setNotice({ error: (e as Error).message })
          }
        }}
      />
    </>
  )
}
