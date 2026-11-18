import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { Empty, Paged } from './ui'

/** one column of a stat's records */
export type StatCol<T> = { label: string; num?: boolean; render: (r: T) => ReactNode }

/** a stat card's records: what the number counts, in a modal (20 a page) */
export type StatShow<T> = { title: string; rows: T[]; cols: StatCol<T>[]; foot?: ReactNode }

export function StatRecords<T>({
  show,
  onClose,
  rowKey,
  onRow,
}: {
  show: StatShow<T> | null
  onClose: () => void
  rowKey: (r: T) => string
  /** click a row (e.g. open the lead) */
  onRow?: (r: T) => void
}) {
  if (!show) return null
  return (
    <Modal open onClose={onClose} width={900} title={`${show.title} · ${show.rows.length}`}>
      {!show.rows.length ? (
        <Empty>Nothing here.</Empty>
      ) : (
        <Paged rows={show.rows} reset={[show.title]}>
          {(paged) => (
            <div className="table-wrap" style={{ maxHeight: '62vh', overflow: 'auto' }}>
              <table className="table table-compact">
                <thead>
                  <tr>
                    {show.cols.map((c) => (
                      <th key={c.label} className={c.num ? 'num' : undefined}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => (
                    <tr
                      key={rowKey(r)}
                      className={onRow ? 'is-clickable' : undefined}
                      onClick={
                        onRow
                          ? () => {
                              onClose()
                              onRow(r)
                            }
                          : undefined
                      }
                    >
                      {show.cols.map((c) => (
                        <td key={c.label} className={c.num ? 'num nowrap' : undefined}>
                          {c.render(r)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Paged>
      )}
      {show.foot && <div className="muted small" style={{ marginTop: 8 }}>{show.foot}</div>}
    </Modal>
  )
}
