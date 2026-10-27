import { createContext, memo, useContext } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { STEP_META, caseLabel, casesOf, problem, summary, triggerLabel } from './steps'
import type { FlowContext, StepNode, TriggerData } from './types'

export const FlowCtx = createContext<FlowContext>({ funnels: [], pages: [], events: [], members: [], workflows: [], funnel: null, event: null, stages: [], tags: [], fieldKeys: [], linkVars: [] })

/** One box on the canvas: icon, name, one-line summary; condition boxes have a Yes and a No exit. */
function StepBoxInner({ type, data, selected }: NodeProps<StepNode>) {
  const ctx = useContext(FlowCtx)
  const meta = STEP_META[type]
  const Icon = meta.icon
  const issue = problem(type, data, ctx)
  const name = typeof data.name === 'string' ? data.name.trim() : ''
  const auto = type === 'trigger' ? triggerLabel((data as unknown as TriggerData).event) : summary(type, data, ctx)
  return (
    <div className={cn('cb-box', selected && 'is-selected', type === 'trigger' && 'is-trigger')} style={{ ['--c' as string]: meta.color }}>
      {type !== 'trigger' && <Handle type="target" position={Position.Top} className="cb-handle" />}
      <div className="cb-box-head">
        <span className="cb-icon">
          <Icon size={16} />
        </span>
        <div className="cb-box-text">
          <span className="cb-kind">{type === 'trigger' ? 'Trigger' : meta.label}</span>
          <b className="cb-title">{name || auto}</b>
        </div>
        {issue && (
          <span className="cb-issue" title={issue}>
            <AlertCircle size={15} />
          </span>
        )}
      </div>
      {type === 'trigger' ? <div className="cb-sub">{name ? `${auto} · ${summary(type, data, ctx)}` : summary(type, data, ctx)}</div> : name && <div className="cb-sub">{auto}</div>}
      {type === 'switch' ? (
        (() => {
          // one exit per path + "Otherwise", spread along the bottom
          const exits = [...casesOf(data).map((c, i) => ({ id: c.id, label: caseLabel(c, i, ctx) })), { id: 'else', label: 'Otherwise' }]
          return (
            <>
              <div className="cb-paths">
                {exits.map((x) => (
                  <span key={x.id} className={cn(x.id === 'else' && 'is-else')} title={x.label}>
                    {x.label}
                  </span>
                ))}
              </div>
              {exits.map((x, i) => (
                <Handle key={x.id} id={x.id} type="source" position={Position.Bottom} className={cn('cb-handle', x.id === 'else' && 'is-no')} style={{ left: `${((i + 0.5) / exits.length) * 100}%` }} />
              ))}
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
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="cb-handle" />
      )}
    </div>
  )
}

export const StepBox = memo(StepBoxInner)
export const NODE_TYPES = {
  trigger: StepBox,
  whatsapp: StepBox,
  email: StepBox,
  call: StepBox,
  wait: StepBox,
  wait_event: StepBox,
  condition: StepBox,
  switch: StepBox,
  goto: StepBox,
}
