import { useCallback, useEffect, useState } from 'react'
import { ConfirmModal, Paged } from '@/components/ui'
import { cn } from '@/lib/cn'
import { adSpendCompare, adSpendReplace } from '@/meta/api'

const inr = (n: number | null) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`)

/** Funnel → Facebook Ads: the saved day-wise spend (old CRM) next to Facebook's numbers, then Replace. */
export function AdSpendCompare({ funnelId, canEdit, onDone }: { funnelId: string; canEdit: boolean; onDone: (msg: string) => void }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adSpendCompare>> | null>(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    adSpendCompare(funnelId).then(setRows, (e: Error) => setError(e.message))
  }, [funnelId])
  useEffect(load, [load])

  if (!rows || !rows.length) return null
  const todo = rows.filter((r) => r.meta != null && r.source !== 'meta')
  const saved = rows.reduce((n, r) => n + Number(r.saved), 0)
  const meta = rows.reduce((n, r) => n + Number(r.meta ?? 0), 0)
  return (
    <section className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row-between">
        <div>
          <b>Saved day-wise spend vs Facebook</b>
          <div className="muted small">
            {rows.length} saved day{rows.length === 1 ? '' : 's'} · saved {inr(saved)} · Facebook {inr(meta)} (both without GST)
          </div>
        </div>
        {canEdit && todo.length > 0 && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAsking(true)}>
            Replace with Facebook’s numbers
          </button>
        )}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <Paged rows={rows}>
        {(page) => (
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="num">Saved</th>
                  <th className="num">Facebook</th>
                  <th className="num">Difference</th>
                  <th>Now using</th>
                </tr>
              </thead>
              <tbody>
                {page.map((r) => {
                  const diff = r.meta == null ? null : Number(r.meta) - Number(r.saved)
                  return (
                    <tr key={r.day}>
                      <td className="nowrap">{r.day}</td>
                      <td className="num">{inr(r.saved)}</td>
                      <td className="num">{inr(r.meta)}</td>
                      <td className={cn('num', diff && Math.abs(diff) >= 1 ? (diff > 0 ? 'tone-danger' : 'tone-success') : '')}>{diff == null ? '—' : inr(diff)}</td>
                      <td className="small">{r.source === 'meta' ? 'Facebook' : r.meta != null ? 'Facebook (report)' : 'Saved'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Paged>
      {asking && (
        <ConfirmModal
          open
          title="Replace with Facebook’s numbers?"
          message={`${todo.length} saved day${todo.length === 1 ? '' : 's'} take Facebook’s spend. The saved amount of each is kept in its notes.`}
          confirmLabel="Replace"
          onCancel={() => setAsking(false)}
          onConfirm={async () => {
            setAsking(false)
            try {
              const n = await adSpendReplace(funnelId)
              onDone(`${n} day${n === 1 ? '' : 's'} now use Facebook’s spend.`)
              load()
            } catch (e) {
              setError((e as Error).message)
            }
          }}
        />
      )}
    </section>
  )
}
