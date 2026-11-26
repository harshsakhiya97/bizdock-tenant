import { useEffect, useState } from 'react'
import { Tags } from 'lucide-react'
import { TagInput } from '@/components/TagInput'
import { db } from '@/lib/supabase'

type Kind = 'meta' | 'google'
const COL: Record<Kind, 'meta_tags' | 'google_tags'> = { meta: 'meta_tags', google: 'google_tags' }

/** the first tag found in a campaign name (case ignored), as the database links them */
export function tagHit(name: string | null | undefined, tags: string[]): string | null {
  const n = (name ?? '').toLowerCase()
  return tags.find((t) => t.trim() && n.includes(t.trim().toLowerCase())) ?? null
}

/**
 * Funnel → Facebook / Google Ads: the funnel's tags. Any campaign (any ad account) whose name contains one of them is
 * linked to this funnel — when the tags are saved, and whenever a sync brings in a new campaign.
 */
export function CampaignTags({
  funnelId,
  kind,
  canEdit,
  onChange,
}: {
  funnelId: string
  kind: Kind
  canEdit: boolean
  /** the saved tags (after load and after each save: campaigns may have been linked) */
  onChange: (tags: string[]) => void
}) {
  const [tags, setTags] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    db()
      .from('funnels')
      .select(COL[kind])
      .eq('id', funnelId)
      .single()
      .then(({ data, error: e }) => {
        if (e) return setError(e.message)
        const t = ((data as Record<string, string[] | null> | null)?.[COL[kind]] ?? []) as string[]
        setTags(t)
        onChange(t)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelId, kind])

  async function save(next: string[]) {
    setTags(next)
    setBusy(true)
    setError(null)
    const { error: e } = await db().from('funnels').update({ [COL[kind]]: next }).eq('id', funnelId)
    setBusy(false)
    if (e) return setError(e.message)
    onChange(next)
  }

  return (
    <div className="card camp-tags">
      <div className="camp-tags-head">
        <Tags size={15} />
        <b>Campaign tags</b>
        <span className="muted small">
          Any {kind === 'meta' ? 'Facebook' : 'Google'} campaign, in any ad account, whose name has one of these words joins this funnel — new
          ones too, as they come in.
        </span>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {tags === null ? (
        <div className="muted small">Loading…</div>
      ) : canEdit ? (
        <TagInput comma={false} value={tags} onChange={(t) => void save(t)} disabled={busy} placeholder="e.g. VSL — press Enter after each" />
      ) : (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {tags.length ? tags.map((t) => <span key={t} className="badge badge-muted">{t}</span>) : <span className="muted small">No tags yet.</span>}
        </div>
      )}
    </div>
  )
}
