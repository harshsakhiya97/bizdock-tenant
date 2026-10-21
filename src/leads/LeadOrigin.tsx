import { useEffect, useState } from 'react'
import { FormSection } from '@/components/Field'
import { listLeadSubmissions } from '@/funnels/api'
import type { SubmissionRow } from '@/funnels/types'
import { db } from '@/lib/supabase'
import { ago } from '@/team/time'
import type { LeadRow } from './types'

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
const HIDDEN = new Set(['name', 'first_name', 'last_name', 'email', 'phone', 'city', ...UTM_KEYS])
const label = (k: string) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/** Where a lead came from (landing page, UTMs, extra form fields) and every form post / import for it. */
export function LeadOrigin({ lead }: { lead: LeadRow }) {
  const [subs, setSubs] = useState<SubmissionRow[] | null>(null)
  const [pages, setPages] = useState<Map<string, string>>(new Map())
  const [hooks, setHooks] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    listLeadSubmissions(lead.id)
      .then(async (rows) => {
        setSubs(rows)
        const ids = [...new Set([lead.landing_page_id, ...rows.map((r) => r.landing_page_id)].filter(Boolean))] as string[]
        const hookIds = [...new Set([lead.webhook_id, ...rows.map((r) => r.webhook_id)].filter(Boolean))] as string[]
        if (ids.length) {
          const { data } = await db().from('landing_pages').select('id, name').in('id', ids)
          setPages(new Map((data ?? []).map((p) => [p.id as string, p.name as string])))
        }
        if (hookIds.length) {
          const { data } = await db().from('funnel_webhooks').select('id, name').in('id', hookIds)
          setHooks(new Map((data ?? []).map((p) => [p.id as string, p.name as string])))
        }
      })
      .catch(() => setSubs([]))
  }, [lead.id, lead.landing_page_id, lead.webhook_id])

  const utms = UTM_KEYS.filter((k) => lead[k])
  const extra = Object.entries(lead.extra ?? {}).filter(([, v]) => String(v ?? '').trim())
  if (!lead.landing_page_id && !lead.webhook_id && !utms.length && !extra.length && !subs?.length) return null
  const pageName = (id: string | null) => (id ? pages.get(id) ?? 'Landing page' : null)
  const hookName = (id: string | null) => (id ? hooks.get(id) ?? 'Webhook' : null)
  const formOf = (s: Pick<SubmissionRow, 'webhook_id' | 'landing_page_id'>) => hookName(s.webhook_id) ?? pageName(s.landing_page_id)

  return (
    <FormSection title="Source & form submissions" description="Filled in by a webhook form, a Google Sheet or an import.">
      <dl className="origin-grid">
        {lead.webhook_id && (
          <>
            <dt>Form</dt>
            <dd>{hookName(lead.webhook_id)}</dd>
          </>
        )}
        {lead.landing_page_id && (
          <>
            <dt>Landing page</dt>
            <dd>{pageName(lead.landing_page_id)}</dd>
          </>
        )}
        {utms.map((k) => (
          <FragmentRow key={k} k={k} v={lead[k] as string} />
        ))}
        {extra.map(([k, v]) => (
          <FragmentRow key={k} k={label(k)} v={String(v)} />
        ))}
      </dl>

      {subs && subs.length > 0 && (
        <ol className="timeline">
          {subs.map((s) => {
            const fields = Object.entries(s.data ?? {}).filter(([k, v]) => !HIDDEN.has(k) && String(v ?? '').trim())
            return (
              <li key={s.id}>
                <span className="tl-dot" />
                <div>
                  <b>
                    {s.via === 'sheet' ? (s.is_new ? 'Added from the Google Sheet' : 'Updated from the Google Sheet') : s.via === 'import' ? (s.is_new ? 'Imported' : 'Updated by an import') : s.is_new ? 'Submitted the form' : 'Submitted the form again'}
                    {formOf(s) ? ` · ${formOf(s)}` : ''}
                  </b>
                  {(s.utm_source || s.utm_campaign) && (
                    <p className="small">
                      {UTM_KEYS.filter((k) => s[k])
                        .map((k) => `${k.replace('utm_', '')}: ${s[k]}`)
                        .join(' · ')}
                    </p>
                  )}
                  {fields.length > 0 && <p className="small muted">{fields.map(([k, v]) => `${label(k)}: ${v}`).join(' · ')}</p>}
                  <small>{ago(s.created_at)} · {new Date(s.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </FormSection>
  )
}

function FragmentRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  )
}
