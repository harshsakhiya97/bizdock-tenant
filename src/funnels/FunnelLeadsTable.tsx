import { useCallback, useEffect, useMemo, useState } from 'react'
import { BT, type SubBusinessType } from '@/auth/auth-context'
import { useAuth } from '@/auth/useAuth'
import { Paged } from '@/components/ui'
import { Flash } from '@/components/Flash'
import { getFollowUp, listOutcomes, pendingFollowUpId } from '@/followups/api'
import { CompleteModal } from '@/followups/CompleteModal'
import type { FollowUpRow } from '@/followups/types'
import { listLeadExtras, listLostReasons, logActivity, updateLeads, type LeadExtras } from '@/leads/api'
import { followUp, fullName, leadSource } from '@/leads/labels'
import { LeadCells } from '@/leads/LeadsPage'
import { StageMoveModal } from '@/leads/StageMoveModal'
import type { LeadRow, MemberOption, Option } from '@/leads/types'
import { MeetingDrawer } from '@/meetings/MeetingDrawer'
import { useTenant } from '@/tenant/useTenant'
import type { FunnelRow, StageRow } from './types'

/** Funnel → Leads (list): the Leads page's columns for the funnel's business, with its Follow-up / Meeting / ✕ buttons */
export function FunnelLeadsTable({
  funnel,
  type,
  leads,
  sources,
  sheetName,
  members,
  resetKey,
  onOpen,
  onChanged,
}: {
  funnel: FunnelRow
  type: SubBusinessType | null
  leads: LeadRow[]
  sources: Option[]
  /** the Google Sheet's name (a lead from a sheet: “Google Sheet · name”) */
  sheetName?: (id: string) => string | undefined
  members: MemberOption[]
  resetKey: unknown
  onOpen: (id: string) => void
  onChanged: () => void
}) {
  const tenant = useTenant()
  const { can, membership } = useAuth()
  const pp = type === BT.PAID_PODCAST
  const kind = pp ? 'pp' : type === BT.STUDIO_RENTAL ? 'studio' : 'default'
  const [extras, setExtras] = useState<Map<string, LeadExtras>>(new Map())
  const [outcomes, setOutcomes] = useState<Option[]>([])
  const [lostReasons, setLostReasons] = useState<Option[]>([])
  const [logFu, setLogFu] = useState<FollowUpRow | null>(null)
  const [meetFor, setMeetFor] = useState<LeadRow | null>(null)
  const [pendingMove, setPendingMove] = useState<{ id: string; stage: StageRow } | null>(null)
  const [notice, setNotice] = useState<{ ok?: string; error?: string } | null>(null)

  const loadExtras = useCallback(() => {
    listLeadExtras(tenant.id, funnel.sub_business_id ?? null, funnel.id).then(setExtras, (e: Error) => setNotice({ error: e.message }))
  }, [tenant.id, funnel.sub_business_id, funnel.id])
  useEffect(loadExtras, [loadExtras])
  useEffect(() => {
    listOutcomes(tenant.id).then(setOutcomes, () => setOutcomes([]))
    listLostReasons(tenant.id).then(setLostReasons, () => setLostReasons([]))
  }, [tenant.id])

  const stageById = useMemo(() => new Map(funnel.funnel_stages.map((s) => [s.id, s])), [funnel])
  const lost = funnel.funnel_stages.find((s) => s.kind === 'lost') ?? null
  const changed = (msg: string) => {
    setNotice({ ok: msg })
    onChanged()
    loadExtras()
  }

  /** the row's Follow-up button: mark the pending follow-up done (or record one done now) */
  async function openLogFollowUp(l: LeadRow) {
    const pendingId = extras.get(l.id)?.pending_fu_id ?? (await pendingFollowUpId(l.id))
    const row = pendingId ? await getFollowUp(pendingId) : null
    setLogFu(
      row ?? {
        id: '',
        tenant_id: tenant.id,
        lead_id: l.id,
        assigned_to: l.owner_id,
        due_at: new Date().toISOString(),
        mode: 'call',
        purpose: null,
        status: 'pending',
        outcome_id: null,
        result_note: null,
        completed_at: null,
        completed_by: null,
        created_at: new Date().toISOString(),
        leads: { id: l.id, first_name: l.first_name, last_name: l.last_name, phone: l.phone, whatsapp: l.whatsapp, business_id: l.business_id, sub_business_id: l.sub_business_id, funnel_id: l.funnel_id ?? '', stage_id: l.stage_id ?? '', owner_id: l.owner_id },
      },
    )
  }

  async function moveToLost(id: string, stage: StageRow, note: string, reason: string | null) {
    const l = leads.find((x) => x.id === id)
    try {
      await updateLeads([id], { stage_id: stage.id, lost_reason_id: reason })
      await logActivity(tenant.id, membership?.id, [id], { kind: 'stage', from_stage_id: l?.stage_id ?? null, to_stage_id: stage.id, note: note.trim() || null })
      changed(`${l ? fullName(l) : 'Lead'} moved to ${stage.name}.`)
    } catch (e) {
      setNotice({ error: (e as Error).message })
    }
  }

  return (
    <>
      {notice?.error && <div className="alert alert-error">{notice.error}</div>}
      <Flash msg={notice?.ok ?? null} dep={notice} />
      <Paged rows={leads} reset={resetKey}>
        {(paged) => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Category</th>
                  <th>Source</th>
                  <th>Owner</th>
                  {kind === 'pp' && <th>Form</th>}
                  {kind === 'studio' && (
                    <>
                      <th>Purpose</th>
                      <th>Time</th>
                    </>
                  )}
                  <th>Last comment</th>
                  <th>Follow-ups done</th>
                  <th>Next follow-up</th>
                  <th>Lead date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {paged.map((l) => (
                  <tr key={l.id} className="is-clickable" onClick={() => onOpen(l.id)}>
                    <td>
                      <span className="strong">{fullName(l)}</span>
                      <div className="muted small">
                        {l.phone}
                        {l.city ? ` · ${l.city}` : ''}
                      </div>
                      {l.tags.length > 0 && (
                        <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                          {l.tags.map((tg) => (
                            <span key={tg} className="tag-chip tag-chip-sm">
                              {tg}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <LeadCells
                      kind={kind}
                      l={l}
                      x={extras.get(l.id)}
                      source={leadSource(sources.find((x) => x.id === l.source_id)?.name, l.sheet_id ? sheetName?.(l.sheet_id) : undefined)}
                      owner={members.find((m) => m.id === l.owner_id)?.name}
                      stage={stageById.get(l.stage_id ?? '') ?? null}
                      fu={followUp(l.next_follow_up_at)}
                      canFollowUp={can('follow_ups', 'add') || can('leads', 'edit')}
                      canMeet={pp && can('meetings', 'add')}
                      canLose={can('leads', 'edit') && !!lost}
                      onFollowUp={() => void openLogFollowUp(l)}
                      onMeeting={() => setMeetFor(l)}
                      onLose={() => lost && setPendingMove({ id: l.id, stage: lost })}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Paged>

      {logFu && (
        <CompleteModal
          followUp={logFu}
          outcomes={outcomes}
          onClose={() => setLogFu(null)}
          onSaved={(msg) => {
            setLogFu(null)
            changed(msg)
          }}
        />
      )}
      {meetFor && (
        <MeetingDrawer
          meeting={null}
          lead={meetFor}
          leads={[meetFor]}
          members={members}
          onClose={() => setMeetFor(null)}
          onSaved={(msg) => {
            setMeetFor(null)
            changed(msg)
          }}
        />
      )}
      {pendingMove && (
        <StageMoveModal
          stage={pendingMove.stage}
          count={1}
          lostReasons={lostReasons}
          onCancel={() => setPendingMove(null)}
          onConfirm={(note, reason) => {
            const m = pendingMove
            setPendingMove(null)
            void moveToLost(m.id, m.stage, note, reason)
          }}
        />
      )}
    </>
  )
}
