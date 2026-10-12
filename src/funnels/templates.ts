import type { FunnelType, StageDraft, StageKind } from './types'

export const STAGE_COLORS = ['#64748b', '#3b82f6', '#8b5cf6', '#0d9488', '#d97706', '#ea580c', '#db2777', '#16a34a', '#dc2626']

export const KIND_LABEL: Record<StageKind, string> = { open: 'In progress', won: 'Won', lost: 'Lost' }

export const FUNNEL_TYPES: { value: FunnelType; label: string; hint: string }[] = [
  { value: 'lead_gen', label: 'Lead Gen', hint: 'Enquiries from ads, forms or calls, worked by the sales team.' },
  { value: 'webinar', label: 'Webinar', hint: 'People register, attend a webinar, then are pitched.' },
  { value: 'vsl', label: 'VSL', hint: 'Video sales letter: opt in, watch, book a call, convert.' },
  { value: 'custom', label: 'Custom', hint: 'Start small and add your own stages.' },
]

export const typeLabel = (t: FunnelType) => FUNNEL_TYPES.find((x) => x.value === t)?.label ?? 'Custom'

type T = [name: string, color: string, kind: StageKind, note?: boolean]

// Starter stages per type. Lead Gen follows Happy OS's sales pipeline.
const TEMPLATES: Record<FunnelType, T[]> = {
  lead_gen: [
    ['Enquiry', '#64748b', 'open'],
    ['Explain', '#3b82f6', 'open'],
    ['Proposal', '#8b5cf6', 'open'],
    ['Warm', '#d97706', 'open'],
    ['Hot', '#ea580c', 'open'],
    ['Won', '#16a34a', 'won', true],
    ['Lost', '#dc2626', 'lost', true],
  ],
  webinar: [
    ['Registered', '#64748b', 'open'],
    ['Attended', '#3b82f6', 'open'],
    ['Pitched', '#8b5cf6', 'open'],
    ['Follow-up', '#d97706', 'open'],
    ['Won', '#16a34a', 'won', true],
    ['Not attended', '#94a3b8', 'lost'],
    ['Lost', '#dc2626', 'lost', true],
  ],
  vsl: [
    ['Opted in', '#64748b', 'open'],
    ['Watched video', '#3b82f6', 'open'],
    ['Call booked', '#8b5cf6', 'open'],
    ['Call done', '#0d9488', 'open'],
    ['Won', '#16a34a', 'won', true],
    ['Lost', '#dc2626', 'lost', true],
  ],
  custom: [
    ['New', '#64748b', 'open'],
    ['Won', '#16a34a', 'won', true],
    ['Lost', '#dc2626', 'lost', true],
  ],
}

let seq = 0
export const newKey = () => `new-${++seq}`

export function templateStages(type: FunnelType): StageDraft[] {
  return TEMPLATES[type].map(([name, color, kind, note]) => ({ key: newKey(), name, color, kind, note_required: !!note }))
}
