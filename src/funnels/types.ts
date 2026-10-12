export type FunnelType = 'lead_gen' | 'webinar' | 'vsl' | 'custom'
export type StageKind = 'open' | 'won' | 'lost'

export type StageRow = {
  id: string
  funnel_id: string
  name: string
  color: string
  kind: StageKind
  note_required: boolean
  sort_order: number
}

export type FunnelRow = {
  id: string
  tenant_id: string
  business_id: string
  name: string
  type: FunnelType
  description: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  funnel_stages: StageRow[]
}

/** Stage as edited in the form; `id` missing = not saved yet */
export type StageDraft = {
  key: string
  id?: string
  name: string
  color: string
  kind: StageKind
  note_required: boolean
}

export type FunnelInput = {
  business_id: string
  name: string
  type: FunnelType
  description: string
}
