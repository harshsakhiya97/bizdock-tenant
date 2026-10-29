import { createContext, memo, useContext } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AlertCircle, Plus as PlusIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { STEP_META, caseLabel, casesOf, problem, summary, triggerLabel } from './steps'
import type { FlowContext, StepNode, TriggerData } from './types'

export const FlowCtx = createContext<FlowContext>({ funnels: [], pages: [], events: [], members: [], workflows: [], funnel: null, event: null, stages: [], tags: [], fieldKeys: [], linkVars: [] })

/** the builder's "+" actions: add a step under an exit, or add a Switch path */
export const AddCtx = createContext<{ canEdit: boolean; used: Set<string>; onAdd: (source: string, handle: string | null) => void; onAddPath: (id: string) => void }>({
  canEdit: false,
  used: new Set(),
  onAdd: () => {},
  onAddPath: () => {},
})

/** a "+" under an exit (n8n style) */
function Plus({ show, left, label, onClick, isPath }: { show: boolean; left: string; label: string; onClick: () => void; isPath?: boolean }) {
  if (!show) return null
  return (
    <div className={cn('cb-plus nodrag nopan', isPath && 'is-path')} style={{ left }}>
      <span className="cb-plus-stem" />
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
      >
        <PlusIcon size={13} />
      </button>
    </div>
  )
}

/** One box on the canvas: icon, name, one-line summary; condition boxes have a Yes and a No exit. */
function StepBoxInner({ id, type, data, selected }: NodeProps<StepNode>) {
  const ctx = useContext(FlowCtx)
  const add = useContext(AddCtx)
  // an exit with no line yet gets a "+"
  const free = (handle: string | null) => add.canEdit && !add.used.has(`${id}|${handle ?? ''}`)
  const meta = STEP_META[type]
  const Icon = meta.icon
  const issue = problem(type, data, ctx)
  const name = typeof data.name === 'string' ? data.name.trim() : ''
  const auto = type === 'trigger' ? triggerLabel((data as unknown as TriggerData).event) : summary(type, data, ctx)
  // Bulk WhatsApp: its messages go on lines under the title ("3 messages" when it has no name)
  const bulkCount = type === 'bulk_whatsapp' ? (Array.isArray(data.rows) ? data.rows.length : 0) : 0
  const title = name || (bulkCount ? `${bulkCount} message${bulkCount === 1 ? '' : 's'}` : auto)
  return (
    <div className={cn('cb-box', selected && 'is-selected', type === 'trigger' && 'is-trigger')} style={{ ['--c' as string]: meta.color }}>
      {type !== 'trigger' && <Handle type="target" position={Position.Top} className="cb-handle" />}
      <div className="cb-box-head">
        <span className="cb-icon">
          <Icon size={16} />
        </span>
        <div className="cb-box-text">
          <span className="cb-kind">{type === 'trigger' ? 'Trigger' : meta.label}</span>
          <b className="cb-title">{title}</b>
        </div>
        {issue && (
          <span className="cb-issue" title={issue}>
            <AlertCircle size={15} />
          </span>
        )}
      </div>
      {type === 'trigger' ? <div className="cb-sub">{name ? `${auto} · ${summary(type, data, ctx)}` : summary(type, data, ctx)}</div> : (name || bulkCount > 0) && <div className="cb-sub">{auto}</div>}
      {type === 'switch' ? (
        (() => {
          // one exit per path + "Otherwise", spread along the bottom, then a "+" to add a path
          const exits = [...casesOf(data).map((c, i) => ({ id: c.id, label: caseLabel(c, i, ctx) })), { id: 'else', label: 'Otherwise' }]
          const slots = exits.length + (add.canEdit ? 1 : 0)
          const at = (i: number) => `${((i + 0.5) / slots) * 100}%`
          return (
            <>
              <div className="cb-paths">
                {exits.map((x) => (
                  <span key={x.id} className={cn(x.id === 'else' && 'is-else')} title={x.label}>
                    {x.label}
                  </span>
                ))}
                {add.canEdit && <span className="is-new">New path</span>}
              </div>
              {exits.map((x, i) => (
                <Handle key={x.id} id={x.id} type="source" position={Position.Bottom} className={cn('cb-handle', x.id === 'else' && 'is-no')} style={{ left: at(i) }} />
              ))}
              {exits.map((x, i) => (
                <Plus key={x.id} show={free(x.id)} left={at(i)} label={`Add a step on “${x.label}”`} onClick={() => add.onAdd(id, x.id)} />
              ))}
              {add.canEdit && <Plus show left={at(exits.length)} label="Add a path" isPath onClick={() => add.onAddPath(id)} />}
            </>
          )
        })()
      ) : type === 'goto' ? null : type === 'condition' ? (
        <>
          <Handle id="yes" type="source" position={Position.Bottom} className="cb-handle is-yes" style={{ left: '28%' }} />
          <Handle id="no" type="source" position={Position.Bottom} className="cb-handle is-no" style={{ left: '72%' }} />
          <div className="cb-branches">
            <span>Yes</span>
            <span>No</span>
          </div>
          <Plus show={free('yes')} left="28%" label="Add a step on Yes" onClick={() => add.onAdd(id, 'yes')} />
          <Plus show={free('no')} left="72%" label="Add a step on No" onClick={() => add.onAdd(id, 'no')} />
        </>
      ) : (
        <>
          <Handle type="source" position={Position.Bottom} className="cb-handle" />
          <Plus show={free(null)} left="50%" label="Add the next step" onClick={() => add.onAdd(id, null)} />
        </>
      )}
    </div>
  )
}

export const StepBox = memo(StepBoxInner)
/** every kind of step is drawn as a StepBox */
export const NODE_TYPES = Object.fromEntries(Object.keys(STEP_META).map((k) => [k, StepBox]))
