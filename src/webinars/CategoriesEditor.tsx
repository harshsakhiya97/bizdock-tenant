import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { FormSection } from '@/components/Field'
import type { WebinarCategory } from './api'

/**
 * The webinar's lead categories: a name and the minimum minutes attended for each, plus "Not joined" (always there).
 * After each date a lead gets the highest category their minutes reach; joined but under the lowest → the lowest.
 */
export function CategoriesEditor({ value, canEdit, onChange }: { value: WebinarCategory[]; canEdit: boolean; onChange: (v: WebinarCategory[]) => void }) {
  const joined = value.filter((c) => c.min != null)
  const none = value.find((c) => c.min == null) ?? { key: 'not_joined', name: 'Not joined', min: null }
  const put = (list: WebinarCategory[], nj: WebinarCategory = none) => onChange([...list, nj])
  const edit = (i: number, patch: Partial<WebinarCategory>) => put(joined.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  return (
    <FormSection
      title="Lead categories"
      description="After each date, a lead gets the highest category whose minimum minutes they attended (someone who joined for less than the lowest gets the lowest). The after-webinar workflow sends one message per category."
    >
      <div className="cat-rows">
        <div className="cat-row cat-head">
          <span>Category</span>
          <span>Attended at least</span>
          <span />
        </div>
        {joined.map((c, i) => (
          <div key={c.key} className="cat-row">
            <input className="input input-sm" value={c.name} maxLength={40} disabled={!canEdit} placeholder="e.g. Super Hot" onChange={(e) => edit(i, { name: e.target.value })} />
            <span className="cat-min">
              <input
                className="input input-sm"
                type="number"
                min={0}
                step={1}
                value={c.min ?? ''}
                disabled={!canEdit}
                onChange={(e) => edit(i, { min: e.target.value === '' ? 0 : Math.max(0, Math.round(Number(e.target.value))) })}
              />
              <span className="muted small">min</span>
            </span>
            {canEdit ? (
              <button type="button" className="btn btn-ghost btn-icon btn-sm danger-text" title="Remove" disabled={joined.length <= 1} onClick={() => put(joined.filter((_, j) => j !== i))}>
                <Trash2 size={15} />
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        <div className="cat-row">
          <input className="input input-sm" value={none.name} maxLength={40} disabled={!canEdit} onChange={(e) => put(joined, { ...none, name: e.target.value })} />
          <span className="muted small">Didn’t join</span>
          <span />
        </div>
      </div>
      {canEdit && (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => put([...joined, { key: `c_${crypto.randomUUID().slice(0, 8)}`, name: '', min: Math.max(0, Math.min(...joined.map((c) => Number(c.min)), 30) - 10) }])}
          >
            <Plus size={14} /> Add category
          </Button>
        </div>
      )}
    </FormSection>
  )
}

/** checked and in order (highest minimum first, Not joined last), or what's wrong */
export function cleanCategories(v: WebinarCategory[]): WebinarCategory[] | string {
  const joined = v.filter((c) => c.min != null).map((c) => ({ ...c, name: c.name.trim(), min: Math.max(0, Math.round(Number(c.min) || 0)) }))
  const none = v.find((c) => c.min == null) ?? { key: 'not_joined', name: 'Not joined', min: null }
  const all = [...joined, { ...none, name: none.name.trim() }]
  if (!joined.length) return 'Add at least one category for people who joined.'
  if (all.some((c) => !c.name)) return 'Give every lead category a name.'
  const names = all.map((c) => c.name.toLowerCase())
  if (new Set(names).size !== names.length) return 'Two lead categories have the same name.'
  const mins = joined.map((c) => c.min)
  if (new Set(mins).size !== mins.length) return 'Two lead categories have the same minimum minutes.'
  return [...joined.sort((a, b) => b.min - a.min), all[all.length - 1]]
}
