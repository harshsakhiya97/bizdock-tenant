import { RefreshCw } from 'lucide-react'
import { Hint, Label } from '@/components/Field'
import { SearchSelect } from '@/components/SearchSelect'
import { WaBubble } from '@/integrations/WaBubble'
import { NEXT_WEBINAR_VARS, WEBINAR_VARS } from '@/workflows/steps'
import { DateVarsContext, StepOrderContext } from '@/workflows/varGroups'
import { findTemplate, pickTemplate, TemplateParams, templateOptions, templateVars, useWatiTemplates, watiVars } from '@/workflows/WhatsAppFields'
import type { DateNotice } from './api'

/** the picked template, as a workflow step keeps it */
export type NoticeDraft = { template: string; template_language: string; template_body: string; template_vars: string[]; params: Record<string, string> }
export const EMPTY_NOTICE: NoticeDraft = { template: '', template_language: '', template_body: '', template_vars: [], params: {} }

/** what goes to the database, or what's missing */
export function noticeOf(d: NoticeDraft): DateNotice | string {
  if (!d.template) return 'Pick the message’s template.'
  if (Object.values(d.params).some((v) => !String(v ?? '').trim())) return 'Fill every variable of the message’s template.'
  return { template: d.template, template_body: d.template_body, params: d.params }
}

/**
 * A WhatsApp to a date's registrants: an approved template, its variables filled from the lead and the webinar date
 * (rescheduled: the date's new values; cancelled: the cancelled date's, plus "Next webinar" — the date they move to).
 */
export function NoticeFields({ value, onChange, kind }: { value: NoticeDraft; onChange: (d: NoticeDraft) => void; kind: 'reschedule' | 'cancel' }) {
  const { list, error, loading, reload } = useWatiTemplates()
  const picked = findTemplate(list, value)
  const vars = value.template ? templateVars(value, picked) : []
  // the cancelled date's joining links aren't of use any more
  const webinarKeys = kind === 'cancel' ? WEBINAR_VARS.filter((k) => !/join_link|short_link/.test(k)) : WEBINAR_VARS
  const order = [{ n: 1, id: 'trigger', type: 'trigger' as const, label: 'Trigger', keys: ['webinar_title', ...webinarKeys, ...NEXT_WEBINAR_VARS] }]

  return (
    <StepOrderContext.Provider value={order}>
      <DateVarsContext.Provider value={['webinar_start', 'webinar_end', 'next_webinar_start', 'next_webinar_end']}>
        <div className="stack" style={{ gap: 12 }}>
          <div>
            <div className="row-between">
              <Label htmlFor="wn-template" required>
                Template
              </Label>
              <button type="button" className="link-btn small" onClick={reload} disabled={loading}>
                <RefreshCw size={12} className={loading ? 'spin' : undefined} /> Refresh
              </button>
            </div>
            {error ? (
              <Hint>Couldn’t load templates: {error}</Hint>
            ) : (
              <SearchSelect
                id="wn-template"
                value={picked ? `${picked.elementName}|${picked.language?.value ?? ''}` : value.template ? '__missing' : ''}
                onChange={(v) => {
                  if (v === '__missing') return
                  if (!v) return onChange(EMPTY_NOTICE)
                  const t = pickTemplate(list, v, value.params, [])
                  if (t) onChange({ template: t.template, template_language: t.template_language, template_body: t.template_body, template_vars: t.template_vars, params: t.params })
                }}
                disabled={!list}
                placeholder={list ? '— Pick a template —' : 'Loading templates…'}
                searchPlaceholder="Search templates…"
                emptyText="No template matches"
                options={templateOptions(list, value.template && !picked ? `${value.template} (not approved / not found)` : null, '— Pick a template —')}
              />
            )}
            <Hint>
              {kind === 'cancel'
                ? 'Sent first; the registration workflow’s confirmation for the next date follows a minute later. Webinar fields are the cancelled date’s, Next webinar the date they move to.'
                : 'Webinar fields have the new date and time.'}
            </Hint>
          </div>
          {vars.length > 0 && <TemplateParams vars={vars} where={picked ? watiVars(picked).where : {}} params={value.params} onChange={(p) => onChange({ ...value, params: p })} disabled={false} />}
          {picked && (
            <div className="wa-phone">
              <WaBubble
                headerType={picked.header?.typeString ?? picked.header?.headerTypeString ?? 'none'}
                headerText={picked.header?.text ?? null}
                body={picked.bodyOriginal || picked.body || ''}
                footer={picked.footer}
                buttons={(picked.buttons ?? []).map((b) => ({ type: b.type, text: b.parameter?.text ?? '' }))}
              />
            </div>
          )}
        </div>
      </DateVarsContext.Provider>
    </StepOrderContext.Provider>
  )
}
