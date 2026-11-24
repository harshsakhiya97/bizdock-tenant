import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, ChevronLeft, ChevronRight, FileUp, RefreshCw, Send } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useBusiness } from '@/business/useBusiness'
import { Drawer } from '@/components/Drawer'
import { Checkbox, Hint, Label, TextArea, TextInput, Select } from '@/components/Field'
import { SearchSelect } from '@/components/SearchSelect'
import { ConfirmModal } from '@/components/ui'
import { listFunnels } from '@/funnels/api'
import type { FunnelRow } from '@/funnels/types'
import { WaBubble } from '@/integrations/WaBubble'
import { bubbleOf } from '@/integrations/WaTemplatesPage'
import { nicePhone, sendWaTemplate } from '@/integrations/waLogs'
import { listLeads, listMemberOptions, listSources } from '@/leads/api'
import { listCustomerRevenue } from '@/leads/customers'
import { TEMPERATURES, fullName } from '@/leads/labels'
import type { LeadRow, MemberOption, Option } from '@/leads/types'
import { cn } from '@/lib/cn'
import { parseCsv } from '@/lib/csv'
import { listMembers } from '@/team/api'
import type { MemberRow } from '@/team/types'
import { useTenant } from '@/tenant/useTenant'
import { templateOptions, useWatiTemplates, watiVars } from '@/workflows/WhatsAppFields'
import { AUDIENCE_LABEL, createCampaign, waNumber, type AudienceKind, type NewRecipient } from './api'

/** someone the campaign could go to, before the numbers are checked */
type Cand = { raw: string; name: string; lead: LeadRow | null; csv?: Record<string, string> }
type Person = { phone: string; name: string; lead: LeadRow | null; csv?: Record<string, string> }
/** where a template variable's value comes from */
type Source = { src: 'field' | 'csv' | 'text'; value: string }

const FIELDS: [string, string][] = [
  ['first_name', 'First name'],
  ['name', 'Full name'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['city', 'City'],
  ['lead_date', 'Lead date'],
  ['funnel', 'Funnel'],
  ['business', 'Business'],
]
const KINDS: AudienceKind[] = ['leads', 'customers', 'team', 'csv', 'paste']
const last10 = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-10)
const localNow = () => {
  const d = new Date(Date.now() + 60 * 60_000)
  d.setMinutes(0, 0, 0)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

type LeadFilter = { biz: string; funnel: string; stage: string; temp: string; source: string; owner: string; from: string; to: string }

/** WhatsApp → Campaign → Send new campaign: 1 who it goes to, 2 the template, its variables and when. */
export function NewCampaignDrawer({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const tenant = useTenant()
  const { businesses } = useAuth()
  const { selected, sub } = useBusiness()
  const [step, setStep] = useState<1 | 2>(1)
  const [kind, setKind] = useState<AudienceKind>('leads')
  const [error, setError] = useState<string | null>(null)

  // lists
  const [leads, setLeads] = useState<LeadRow[] | null>(null)
  const [funnels, setFunnels] = useState<FunnelRow[]>([])
  const [sources, setSources] = useState<Option[]>([])
  const [owners, setOwners] = useState<MemberOption[]>([])
  const [customerIds, setCustomerIds] = useState<Set<string> | null>(null)
  const [team, setTeam] = useState<MemberRow[] | null>(null)
  useEffect(() => {
    Promise.all([listLeads(tenant.id), listFunnels(tenant.id), listSources(tenant.id), listMemberOptions(tenant.id)])
      .then(([l, f, s, m]) => {
        setLeads(l.filter((x) => !x.is_archived))
        setFunnels(f)
        setSources(s)
        setOwners(m)
      })
      .catch((e: Error) => setError(e.message))
  }, [tenant.id])
  useEffect(() => {
    if (kind === 'customers' && !customerIds)
      listCustomerRevenue(tenant.id, businesses).then((r) => setCustomerIds(new Set(r.keys())), (e: Error) => setError(e.message))
    if (kind === 'team' && !team)
      listMembers(tenant.id).then(
        (m) => {
          const active = m.filter((x) => x.status === 'active' && waNumber(x.phone))
          setTeam(active)
          setPicked(new Set(active.map((x) => x.id)))
        },
        (e: Error) => setError(e.message),
      )
  }, [kind, tenant.id, businesses, customerIds, team])

  // Step 1 · audience
  const [lf, setLf] = useState<LeadFilter>({ biz: selected ? (sub ? `${selected.id}|${sub.id}` : selected.id) : '', funnel: '', stage: '', temp: '', source: '', owner: '', from: '', to: '' })
  const setL = (k: keyof LeadFilter, v: string) => setLf((x) => ({ ...x, [k]: v, ...(k === 'funnel' ? { stage: '' } : {}), ...(k === 'biz' ? { funnel: '', stage: '' } : {}) }))
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [csv, setCsv] = useState<{ file: string; head: string[]; rows: string[][]; phone: number; name: number } | null>(null)
  const [paste, setPaste] = useState('')

  const bizName = (l: LeadRow) => {
    const b = businesses.find((x) => x.id === l.business_id)
    const s = b?.subs.find((x) => x.id === l.sub_business_id)
    return s ? s.name : b?.name ?? ''
  }
  const inBiz = (l: LeadRow) => {
    if (!lf.biz) return true
    const [b, s] = lf.biz.split('|')
    return l.business_id === b && (!s || l.sub_business_id === s)
  }
  const bizFunnels = funnels.filter((f) => {
    if (!lf.biz) return true
    const [b, s] = lf.biz.split('|')
    return f.business_id === b && (!s || !f.sub_business_id || f.sub_business_id === s)
  })
  const stages = funnels.find((f) => f.id === lf.funnel)?.funnel_stages ?? []

  // leads by their number (newest first), to link pasted / CSV / team numbers to a lead
  const byPhone = useMemo(() => {
    const m = new Map<string, LeadRow>()
    for (const l of leads ?? []) for (const p of [l.whatsapp, l.phone]) if (last10(p).length === 10 && !m.has(last10(p))) m.set(last10(p), l)
    return m
  }, [leads])

  const cands = useMemo<Cand[] | null>(() => {
    if (!leads) return null
    const fromLead = (l: LeadRow): Cand => ({ raw: l.whatsapp || l.phone, name: fullName(l), lead: l })
    if (kind === 'leads')
      return leads
        .filter(
          (l) =>
            inBiz(l) &&
            (!lf.funnel || (lf.funnel === 'none' ? !l.funnel_id : l.funnel_id === lf.funnel)) &&
            (!lf.stage || l.stage_id === lf.stage) &&
            (!lf.temp || l.temperature === lf.temp) &&
            (!lf.source || l.source_id === lf.source) &&
            (!lf.owner || (lf.owner === 'none' ? !l.owner_id : l.owner_id === lf.owner)) &&
            (!lf.from || l.created_at.slice(0, 10) >= lf.from) &&
            (!lf.to || l.created_at.slice(0, 10) <= lf.to),
        )
        .map(fromLead)
    if (kind === 'customers') {
      if (!customerIds) return null
      return leads
        .filter((l) => customerIds.has(l.id) && inBiz(l) && (!lf.source || l.source_id === lf.source) && (!lf.owner || (lf.owner === 'none' ? !l.owner_id : l.owner_id === lf.owner)))
        .map(fromLead)
    }
    if (kind === 'team') return team ? team.filter((m) => picked.has(m.id)).map((m) => ({ raw: m.phone ?? '', name: m.name, lead: null })) : null
    if (kind === 'csv')
      return (csv?.rows ?? []).map((r) => {
        const raw = r[csv!.phone] ?? ''
        return { raw, name: csv!.name >= 0 ? (r[csv!.name] ?? '').trim() : '', lead: byPhone.get(last10(raw)) ?? null, csv: Object.fromEntries(csv!.head.map((h, i) => [h, (r[i] ?? '').trim()])) }
      })
    return paste
      .split(/[\n,;]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((raw) => ({ raw, name: '', lead: byPhone.get(last10(raw)) ?? null }))
  }, [kind, leads, lf, customerIds, team, picked, csv, paste, byPhone]) // eslint-disable-line react-hooks/exhaustive-deps

  // checked numbers: one per number, the invalid ones apart
  const audience = useMemo(() => {
    const people: Person[] = []
    const seen = new Set<string>()
    const invalid: string[] = []
    let dupes = 0
    for (const c of cands ?? []) {
      const phone = waNumber(c.raw)
      if (!phone) {
        invalid.push(c.raw || `${c.name || 'Someone'} (no number)`)
        continue
      }
      if (seen.has(phone)) {
        dupes++
        continue
      }
      seen.add(phone)
      people.push({ phone, name: c.name || (c.lead ? fullName(c.lead) : ''), lead: c.lead, csv: c.csv })
    }
    return { people, invalid, dupes }
  }, [cands])

  async function pickCsv(file: File) {
    setError(null)
    const rows = parseCsv(await file.text())
    if (rows.length < 2) return setError('The CSV needs a header row and at least one number.')
    const head = rows[0].map((h, i) => h.trim() || `Column ${i + 1}`)
    const find = (re: RegExp) => head.findIndex((h) => re.test(h))
    const phone = Math.max(0, find(/whats|phone|mobile|number|contact/i))
    const name = find(/name/i)
    setCsv({ file: file.name, head, rows: rows.slice(1), phone, name })
  }

  // Step 2 · template, variables, when
  const { list: templates, error: tplError, loading: tplLoading, reload: reloadTpl } = useWatiTemplates()
  const [tplKey, setTplKey] = useState<string | null>(null)
  const tpl = templates?.find((t) => `${t.elementName}|${t.language?.value ?? ''}` === tplKey) ?? null
  const { vars, where } = tpl ? watiVars(tpl) : { vars: [] as string[], where: {} as Record<string, string> }
  const [map, setMap] = useState<Record<string, Source>>({})
  const [name, setName] = useState('')
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [at, setAt] = useState(localNow)
  const [test, setTest] = useState('')
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  function pickTemplate(key: string | null) {
    setTplKey(key)
    const t = templates?.find((x) => `${x.elementName}|${x.language?.value ?? ''}` === key)
    if (!t) return
    const m: Record<string, Source> = {}
    for (const v of watiVars(t).vars) {
      const csvCol = kind === 'csv' ? csv?.head.find((h) => h.toLowerCase().replace(/\W+/g, '_') === v.toLowerCase()) : undefined
      m[v] = FIELDS.some(([k]) => k === v) ? { src: 'field', value: v } : v === 'name' ? { src: 'field', value: 'first_name' } : csvCol ? { src: 'csv', value: csvCol } : { src: 'text', value: '' }
    }
    setMap(m)
    if (!name.trim()) setName(`${t.elementName} · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`)
  }

  const fieldOf = (p: Person, f: string): string => {
    const l = p.lead
    switch (f) {
      case 'first_name':
        return l?.first_name ?? p.name.split(/\s+/)[0] ?? ''
      case 'name':
        return l ? fullName(l) : p.name
      case 'phone':
        return l?.phone ?? p.phone
      case 'email':
        return l?.email ?? ''
      case 'city':
        return l?.city ?? ''
      case 'lead_date':
        return l ? new Date(l.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
      case 'funnel':
        return l ? funnels.find((x) => x.id === l.funnel_id)?.name ?? '' : ''
      case 'business':
        return l ? bizName(l) : ''
      default:
        return ''
    }
  }
  const paramsOf = (p: Person) =>
    Object.fromEntries(
      vars.map((v) => {
        const s = map[v] ?? { src: 'text', value: '' }
        return [v, (s.src === 'field' ? fieldOf(p, s.value) : s.src === 'csv' ? p.csv?.[s.value] ?? '' : s.value).trim()]
      }),
    )
  const first = audience.people[0]
  const sample = first ? paramsOf(first) : {}
  const filled = (text: string) => text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => (sample[k] ? sample[k] : m))
  const missing = vars.filter((v) => map[v]?.src === 'text' && !map[v].value.trim())
  const blanks = first ? vars.filter((v) => map[v]?.src !== 'text' && audience.people.some((p) => !paramsOf(p)[v])) : []
  const atIso = when === 'later' && at ? new Date(at).toISOString() : null
  const lateOk = when === 'now' || (!!at && new Date(at).getTime() > Date.now())
  const body = tpl ? tpl.bodyOriginal || tpl.body || '' : ''

  async function sendTest() {
    if (!tpl || !first) return
    setTestMsg(null)
    setError(null)
    setBusy(true)
    try {
      await sendWaTemplate(tenant.id, { phone: test, template: tpl.elementName, params: paramsOf(first), body, lead_id: null })
      setTestMsg(`Test sent to ${nicePhone(waNumber(test))} with ${first.name || nicePhone(first.phone)}’s values.`)
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  async function submit() {
    if (!tpl) return
    setBusy(true)
    setError(null)
    try {
      const recipients: NewRecipient[] = audience.people.map((p) => ({ phone: p.phone, name: p.name, lead_id: p.lead?.id ?? null, params: paramsOf(p) }))
      const b = lf.biz ? businesses.find((x) => x.id === lf.biz.split('|')[0]) : null
      const s = b && lf.biz.includes('|') ? b.subs.find((x) => x.id === lf.biz.split('|')[1]) : null
      const label =
        kind === 'csv'
          ? `CSV · ${csv?.file ?? ''}`
          : kind === 'leads' || kind === 'customers'
            ? `${AUDIENCE_LABEL[kind]}${b ? ` · ${s?.name ?? b.name}` : ''}`
            : AUDIENCE_LABEL[kind]
      await createCampaign(
        tenant.id,
        { name: name.trim() || tpl.elementName, template: tpl.elementName, template_language: tpl.language?.value ?? '', template_body: body, audience: { kind, label }, scheduled_at: atIso },
        recipients,
      )
      onDone(when === 'now' ? `Campaign started: ${recipients.length} messages, about 1 a second.` : `Campaign scheduled for ${new Date(at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.`)
    } catch (e) {
      setError((e as Error).message)
      setConfirm(false)
    }
    setBusy(false)
  }

  const n = audience.people.length
  const footer =
    step === 1 ? (
      <>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Cancel
        </button>
        <div className="foot-end">
          <span className="muted small">{n} number{n === 1 ? '' : 's'}</span>
          <button type="button" className="btn btn-primary" disabled={!n} onClick={() => setStep(2)}>
            Next <ChevronRight size={16} />
          </button>
        </div>
      </>
    ) : (
      <>
        <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>
          <ChevronLeft size={16} /> Back
        </button>
        <div className="foot-end">
          <button type="button" className="btn btn-primary" disabled={!tpl || !n || missing.length > 0 || !lateOk || busy} onClick={() => setConfirm(true)}>
            {when === 'now' ? <Send size={15} /> : <CalendarClock size={15} />} {when === 'now' ? `Send to ${n}` : `Schedule for ${n}`}
          </button>
        </div>
      </>
    )

  return (
    <Drawer open onClose={onClose} title="Send new campaign" width={820} footer={footer}>
      <div className="wa-steps">
        <button type="button" className={cn('wa-step', step === 1 && 'is-active')} onClick={() => setStep(1)}>
          <span>1</span> Audience
        </button>
        <i />
        <button type="button" className={cn('wa-step', step === 2 && 'is-active')} disabled={!n} onClick={() => setStep(2)}>
          <span>2</span> Template &amp; schedule
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      {step === 1 ? (
        <div className="stack">
          <div className="seg" role="group" aria-label="Send to">
            {KINDS.map((k) => (
              <button key={k} type="button" className={cn(kind === k && 'is-active')} onClick={() => setKind(k)}>
                {AUDIENCE_LABEL[k]}
              </button>
            ))}
          </div>

          {(kind === 'leads' || kind === 'customers') && (
            <div className="form-grid form-grid-3">
              <div>
                <Label htmlFor="c-biz">Business</Label>
                <Select id="c-biz" className="input" value={lf.biz} onChange={(e) => setL('biz', e.target.value)}>
                  <option value="">All businesses</option>
                  {businesses.flatMap((b) => [
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>,
                    ...b.subs.map((s) => (
                      <option key={s.id} value={`${b.id}|${s.id}`}>
                        {`${b.name} · ${s.name}`}
                      </option>
                    )),
                  ])}
                </Select>
              </div>
              {kind === 'leads' && (
                <>
                  <div>
                    <Label htmlFor="c-funnel">Funnel</Label>
                    <Select id="c-funnel" className="input" value={lf.funnel} onChange={(e) => setL('funnel', e.target.value)}>
                      <option value="">All funnels</option>
                      <option value="none">No funnel</option>
                      {bizFunnels.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="c-stage">Status</Label>
                    <Select id="c-stage" className="input" value={lf.stage} onChange={(e) => setL('stage', e.target.value)} disabled={!stages.length}>
                      <option value="">{stages.length ? 'All statuses' : 'Pick a funnel first'}</option>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="c-temp">Category</Label>
                    <Select id="c-temp" className="input" value={lf.temp} onChange={(e) => setL('temp', e.target.value)}>
                      <option value="">All categories</option>
                      {TEMPERATURES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </>
              )}
              <div>
                <Label htmlFor="c-source">Source</Label>
                <Select id="c-source" className="input" value={lf.source} onChange={(e) => setL('source', e.target.value)}>
                  <option value="">All sources</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="c-owner">Assigned to</Label>
                <Select id="c-owner" className="input" value={lf.owner} onChange={(e) => setL('owner', e.target.value)}>
                  <option value="">Anyone</option>
                  <option value="none">Not assigned</option>
                  {owners.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
              {kind === 'leads' && (
                <>
                  <div>
                    <Label htmlFor="c-from">Lead date from</Label>
                    <TextInput id="c-from" type="date" value={lf.from} onChange={(e) => setL('from', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="c-to">Lead date to</Label>
                    <TextInput id="c-to" type="date" value={lf.to} onChange={(e) => setL('to', e.target.value)} />
                  </div>
                </>
              )}
            </div>
          )}

          {kind === 'team' && (
            <div className="stack" style={{ gap: 8 }}>
              {!team ? (
                <div className="muted small">Loading the team…</div>
              ) : !team.length ? (
                <div className="muted small">No team member has a WhatsApp number on their profile.</div>
              ) : (
                <>
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set(team.map((m) => m.id)))}>
                      Select all
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set())}>
                      Clear
                    </button>
                  </div>
                  <div className="form-grid">
                    {team.map((m) => (
                      <Checkbox
                        key={m.id}
                        id={`c-m-${m.id}`}
                        checked={picked.has(m.id)}
                        onChange={(on) =>
                          setPicked((s) => {
                            const x = new Set(s)
                            if (on) x.add(m.id)
                            else x.delete(m.id)
                            return x
                          })
                        }
                        label={m.name}
                        description={nicePhone(waNumber(m.phone))}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {kind === 'csv' && (
            <div className="stack" style={{ gap: 10 }}>
              <label className="btn btn-outline" style={{ alignSelf: 'flex-start' }}>
                <FileUp size={15} /> {csv ? `Change file (${csv.file})` : 'Upload CSV'}
                <input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && void pickCsv(e.target.files[0])} />
              </label>
              <Hint>First row = column names. Any other columns (city, amount…) can fill the template’s variables in step 2.</Hint>
              {csv && (
                <div className="form-grid">
                  <div>
                    <Label htmlFor="c-csv-phone">Number column</Label>
                    <Select id="c-csv-phone" className="input" value={csv.phone} onChange={(e) => setCsv({ ...csv, phone: Number(e.target.value) })}>
                      {csv.head.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="c-csv-name">Name column</Label>
                    <Select id="c-csv-name" className="input" value={csv.name} onChange={(e) => setCsv({ ...csv, name: Number(e.target.value) })}>
                      <option value={-1}>— none —</option>
                      {csv.head.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {kind === 'paste' && (
            <div>
              <Label htmlFor="c-paste">Numbers</Label>
              <TextArea id="c-paste" rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'9876543210\n+91 98765 43211, 919876543212'} />
              <Hint>One per line, or separated by commas. 10-digit numbers get +91.</Hint>
            </div>
          )}

          <div className="wa-audience">
            {!cands ? (
              <span className="muted">Loading…</span>
            ) : (
              <>
                <b>{n}</b> number{n === 1 ? '' : 's'} will get it
                {audience.dupes > 0 && <span className="muted"> · {audience.dupes} duplicate{audience.dupes === 1 ? '' : 's'} removed (each number gets one message)</span>}
                {audience.invalid.length > 0 && (
                  <div className="small danger-text" style={{ marginTop: 6 }}>
                    {audience.invalid.length} not valid, left out: {audience.invalid.slice(0, 8).join(', ')}
                    {audience.invalid.length > 8 ? '…' : ''}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="wa-camp-2">
          <div className="stack">
            <div>
              <Label htmlFor="c-tpl" required>
                Template
              </Label>
              <div className="row nowrap" style={{ gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <SearchSelect
                    id="c-tpl"
                    value={tplKey}
                    onChange={pickTemplate}
                    options={templateOptions(templates, null, '— pick an approved template —').slice(1)}
                    placeholder={templates ? 'Pick an approved template' : 'Loading templates…'}
                    searchPlaceholder="Search templates…"
                  />
                </div>
                <button type="button" className="btn btn-ghost btn-icon" title="Refresh templates" onClick={reloadTpl} disabled={tplLoading}>
                  <RefreshCw size={15} className={cn(tplLoading && 'spin')} />
                </button>
              </div>
              {tplError && <div className="small danger-text">{tplError}</div>}
            </div>

            {tpl && vars.length > 0 && (
              <div className="stack" style={{ gap: 10 }}>
                <Label>Variables</Label>
                {vars.map((v) => {
                  const s = map[v] ?? { src: 'text', value: '' }
                  const choice = s.src === 'text' ? 'text:' : `${s.src}:${s.value}`
                  return (
                    <div key={v} className="wa-var-row">
                      <code>{`{{${v}}}`}</code>
                      <Select
                        className="input"
                        value={choice}
                        aria-label={`${v} comes from`}
                        onChange={(e) => {
                          const [src, ...rest] = e.target.value.split(':')
                          setMap((m) => ({ ...m, [v]: { src: src as Source['src'], value: src === 'text' ? '' : rest.join(':') } }))
                        }}
                      >
                        <optgroup label="Lead / customer">
                          {FIELDS.map(([k, label]) => (
                            <option key={k} value={`field:${k}`}>
                              {label}
                            </option>
                          ))}
                        </optgroup>
                        {kind === 'csv' && csv && (
                          <optgroup label="CSV column">
                            {csv.head.map((h) => (
                              <option key={h} value={`csv:${h}`}>
                                {h}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <option value="text:">Same text for everyone</option>
                      </Select>
                      {s.src === 'text' && (
                        <TextInput value={s.value} placeholder={where[v] ? `Text ${where[v]}` : 'Text'} onChange={(e) => setMap((m) => ({ ...m, [v]: { src: 'text', value: e.target.value } }))} />
                      )}
                    </div>
                  )
                })}
                {blanks.length > 0 && <Hint>Some numbers have no value for {blanks.map((v) => `{{${v}}}`).join(', ')}: they get “-” there.</Hint>}
              </div>
            )}

            <div>
              <Label htmlFor="c-name">Campaign name</Label>
              <TextInput id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali offer" />
            </div>

            <div>
              <Label>When</Label>
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <div className="seg">
                  <button type="button" className={cn(when === 'now' && 'is-active')} onClick={() => setWhen('now')}>
                    Send now
                  </button>
                  <button type="button" className={cn(when === 'later' && 'is-active')} onClick={() => setWhen('later')}>
                    Schedule
                  </button>
                </div>
                {when === 'later' && <TextInput type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} style={{ width: 220 }} />}
              </div>
              {!lateOk && <div className="small danger-text">Pick a time in the future.</div>}
              <Hint>Messages go out about 1 a second ({Math.max(1, Math.ceil(n / 60))} min for {n}).</Hint>
            </div>

            <div>
              <Label htmlFor="c-test">Test number</Label>
              <div className="row nowrap" style={{ gap: 8 }}>
                <TextInput id="c-test" value={test} onChange={(e) => setTest(e.target.value)} placeholder="Your WhatsApp number" />
                <button type="button" className="btn btn-outline" disabled={!tpl || !waNumber(test) || missing.length > 0 || busy} onClick={() => void sendTest()}>
                  <Send size={14} /> Send test
                </button>
              </div>
              {testMsg && <div className="small" style={{ color: 'var(--success)' }}>{testMsg}</div>}
            </div>
          </div>

          <div>
            <Label>Preview{first ? ` · ${first.name || nicePhone(first.phone)}` : ''}</Label>
            <div className="wa-phone">
              {tpl ? (
                <WaBubble {...bubbleOf(tpl)} body={filled(body)} headerText={tpl.header?.text ? filled(tpl.header.text) : null} />
              ) : (
                <div className="muted small">Pick a template to see it here.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirm}
        icon={when === 'now' ? Send : CalendarClock}
        title={when === 'now' ? `Send to ${n} number${n === 1 ? '' : 's'} now?` : `Schedule for ${n} number${n === 1 ? '' : 's'}?`}
        message={`“${tpl?.elementName ?? ''}” goes to ${n} number${n === 1 ? '' : 's'}${when === 'later' && at ? ` on ${new Date(at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}. Sent messages can’t be taken back.`}
        confirmLabel={when === 'now' ? 'Send' : 'Schedule'}
        busy={busy}
        onConfirm={() => void submit()}
        onCancel={() => setConfirm(false)}
      />
    </Drawer>
  )
}
