import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type IsValidConnection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AlertTriangle, Info, Save } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { cn } from '@/lib/cn'
import { saveWorkflow } from './api'
import { FlowCtx, NODE_TYPES } from './StepBox'
import { StepPanel } from './StepPanel'
import { PALETTE, STEP_META, caseLabel, casesOf, flowContext, problem } from './steps'
import { STEP_DEFAULTS, type FlowEdge, type RefData, type StepKind, type StepNode, type WorkflowRow } from './types'

const EDGE_DEFAULTS = { type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 } } as const
const withLook = (e: FlowEdge): FlowEdge => ({
  ...EDGE_DEFAULTS,
  ...e,
  className: e.sourceHandle === 'yes' ? 'is-yes' : e.sourceHandle === 'no' ? 'is-no' : undefined,
  label: e.sourceHandle === 'yes' ? 'Yes' : e.sourceHandle === 'no' ? 'No' : undefined,
})
let seq = 0
const newId = (kind: string) => `${kind}-${Date.now().toString(36)}-${++seq}`

type Props = { workflow: WorkflowRow; refData: RefData; canEdit: boolean; onSaved?: (w: { name: string; is_active: boolean }) => void }

/** Workflow builder: n8n-style canvas. Drag steps from the left, join them with lines, set each step on the right. */
export function WorkflowBuilder(props: Props) {
  return (
    <ReactFlowProvider>
      <Builder {...props} />
    </ReactFlowProvider>
  )
}

function Builder({ workflow, refData, canEdit, onSaved }: Props) {
  const { membership } = useAuth()
  const flow = useReactFlow()
  const wrap = useRef<HTMLDivElement>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([])
  const [name, setName] = useState(workflow.name)
  const [active, setActive] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    {
      const c = workflow
      {
        setNodes(c.nodes)
        setEdges(c.edges.map(withLook))
        setName(c.name)
        setActive(c.is_active)
        setSavedAt(c.updated_at)
        setLoaded(true)
        // fit everything, but never smaller than readable: then start from the top (the trigger)
        requestAnimationFrame(() => {
          void flow.fitView({ padding: 0.2, maxZoom: 1 }).then(() => {
            const zoom = flow.getZoom()
            if (zoom >= 0.8 || !wrap.current) return
            const ns = flow.getNodes()
            const minX = Math.min(...ns.map((n) => n.position.x))
            const maxX = Math.max(...ns.map((n) => n.position.x + (n.measured?.width ?? 260)))
            const minY = Math.min(...ns.map((n) => n.position.y))
            const z = 0.85
            void flow.setCenter((minX + maxX) / 2, minY - 40 + wrap.current.clientHeight / 2 / z, { zoom: z })
          })
        })
      }
    }
  }, [workflow, setNodes, setEdges, flow])

  // funnel / event / stages this workflow is about (from its trigger)
  const ctx = useMemo(() => flowContext({ ...refData, selfId: workflow.id }, nodes), [refData, nodes, workflow.id])
  // lines out of a Switch show their path's name
  const shownEdges = useMemo(() => {
    const sw = new Map(nodes.filter((n) => n.type === 'switch').map((n) => [n.id, n]))
    return edges.map((e) => {
      const n = sw.get(e.source)
      if (!n || !e.sourceHandle) return e
      if (e.sourceHandle === 'else') return { ...e, label: 'Otherwise', className: 'is-no' }
      const i = casesOf(n.data).findIndex((c) => c.id === e.sourceHandle)
      return i < 0 ? e : { ...e, label: caseLabel(casesOf(n.data)[i], i, ctx) }
    })
  }, [edges, nodes, ctx])

  // steps not reachable from the trigger, and steps with missing settings
  const issues = useMemo(() => {
    const out = new Map<string, string>()
    const next = new Map<string, string[]>()
    for (const e of edges) next.set(e.source, [...(next.get(e.source) ?? []), e.target])
    const seen = new Set<string>(['trigger'])
    const queue = ['trigger']
    while (queue.length) for (const t of next.get(queue.shift()!) ?? []) if (!seen.has(t)) (seen.add(t), queue.push(t))
    for (const n of nodes) {
      const p = problem(n.type as StepKind, n.data, ctx)
      if (p) out.set(n.id, p)
      else if (!seen.has(n.id)) out.set(n.id, 'Not joined to the workflow')
    }
    return out
  }, [nodes, edges, ctx])
  const steps = nodes.filter((n) => n.type !== 'trigger').length

  const touch = () => setDirty(true)

  const onConnect = useCallback(
    (c: Connection) => {
      setEdges((eds) => addEdge(withLook({ ...c, id: newId('e') } as FlowEdge), eds))
      touch()
    },
    [setEdges],
  )
  // one line out of each exit, no loops back into the trigger, no line to itself
  const isValidConnection: IsValidConnection<FlowEdge> = useCallback(
    (c) =>
      c.source !== c.target &&
      c.target !== 'trigger' &&
      !edges.some((e) => e.source === c.source && (e.sourceHandle ?? null) === (c.sourceHandle ?? null)),
    [edges],
  )

  function addStep(kind: StepKind, position?: { x: number; y: number }) {
    const id = newId(kind)
    // without a drop position: under the selected box (or the last one), joined to it
    const anchor = nodes.find((n) => n.id === selectedId) ?? nodes[nodes.length - 1]
    const pos = position ?? { x: anchor ? anchor.position.x : 0, y: anchor ? anchor.position.y + 130 : 0 }
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: kind, position: pos, data: { ...STEP_DEFAULTS[kind as Exclude<StepKind, 'trigger'>] }, selected: true }])
    if (!position && anchor && anchor.type !== 'condition' && anchor.type !== 'switch' && anchor.type !== 'goto' && !edges.some((e) => e.source === anchor.id)) {
      setEdges((eds) => [...eds, withLook({ id: newId('e'), source: anchor.id, target: id } as FlowEdge)])
    }
    setSelectedId(id)
    touch()
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    const kind = e.dataTransfer.getData('application/x-workflow-step') as StepKind
    if (!kind || !canEdit) return
    const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addStep(kind, { x: p.x - 130, y: p.y - 30 })
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null
  function updateData(data: Record<string, unknown>) {
    setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data } : n)))
    // a removed Switch path takes its line with it
    if (selected?.type === 'switch') {
      const keep = new Set([...casesOf(data).map((c) => c.id), 'else'])
      setEdges((es) => es.filter((e) => e.source !== selectedId || !e.sourceHandle || keep.has(e.sourceHandle)))
    }
    touch()
  }
  function deleteSelected() {
    if (!selected || selected.type === 'trigger') return
    setNodes((ns) => ns.filter((n) => n.id !== selected.id))
    setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id))
    setSelectedId(null)
    touch()
  }

  async function save(nextActive = active) {
    if (nextActive && issues.size) {
      setNotice({ error: 'Fix the steps marked with ! before turning the workflow on.' })
      return
    }
    setBusy(true)
    try {
      await saveWorkflow(workflow.id, membership?.id, { name, is_active: nextActive, nodes, edges })
      onSaved?.({ name, is_active: nextActive })
      setActive(nextActive)
      setDirty(false)
      setSavedAt(new Date().toISOString())
      setNotice({ ok: nextActive !== active ? (nextActive ? 'Workflow turned on and saved.' : 'Workflow turned off and saved.') : 'Workflow saved.' })
    } catch (e) {
      setNotice({ error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <FlowCtx.Provider value={ctx}>
      <div className="cb-bar">
        <input
          className="cb-name"
          aria-label="Workflow name"
          value={name}
          disabled={!canEdit}
          onChange={(e) => {
            setName(e.target.value)
            touch()
          }}
        />
        <span className={cn('badge', active ? 'badge-success' : 'badge-muted')}>{active ? 'On' : 'Off'}</span>
        <span className="muted small">
          {steps} step{steps === 1 ? '' : 's'}
          {issues.size ? ` · ${issues.size} to fix` : ''}
          {dirty ? ' · unsaved changes' : savedAt ? ` · saved ${new Date(savedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
        </span>
        {canEdit && (
          <div className="row" style={{ marginLeft: 'auto' }}>
            <label className="check-inline" title={issues.size ? 'Fix the marked steps first' : undefined}>
              <input type="checkbox" checked={active} disabled={busy || !loaded} onChange={(e) => void save(e.target.checked)} /> Workflow on
            </label>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !loaded || !dirty}>
              <Save size={15} /> {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
      <div className="alert alert-info small cb-note">
        <Info size={15} /> WhatsApp, email and calls are connected later. Until then the workflow is saved but no message is sent.
      </div>
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      {notice.ok && !dirty && <div className="alert alert-info">{notice.ok}</div>}

      <div className="cb-layout">
        {canEdit && (
          <div className="cb-palette">
            <span className="lp-label">Steps</span>
            {PALETTE.map((k) => {
              const m = STEP_META[k]
              const Icon = m.icon
              return (
                <button
                  key={k}
                  type="button"
                  className="cb-tool"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-workflow-step', k)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={() => addStep(k)}
                  title={`${m.hint}. Drag onto the canvas, or click to add under the selected step.`}
                >
                  <span className="cb-icon" style={{ ['--c' as string]: m.color }}>
                    <Icon size={15} />
                  </span>
                  <span>
                    <b>{m.label}</b>
                    <small>{m.hint}</small>
                  </span>
                </button>
              )
            })}
            <p className="muted small" style={{ margin: '6px 2px 0' }}>
              Drag a step onto the canvas, then drag from a box’s bottom dot to the next box. Select a line or box and press Delete to remove it.
            </p>
          </div>
        )}

        <div className="cb-canvas" ref={wrap} onDragOver={(e) => (e.preventDefault(), (e.dataTransfer.dropEffect = 'move'))} onDrop={onDrop}>
          <ReactFlow<StepNode, FlowEdge>
            nodes={nodes}
            edges={shownEdges}
            nodeTypes={NODE_TYPES}
            onNodesChange={(c) => {
              // the trigger stays
              const safe = c.filter((x) => !(x.type === 'remove' && x.id === 'trigger'))
              onNodesChange(safe)
              if (safe.some((x) => x.type === 'position' || x.type === 'remove')) touch()
              if (safe.some((x) => x.type === 'remove' && x.id === selectedId)) setSelectedId(null)
            }}
            onEdgesChange={(c) => {
              onEdgesChange(c)
              if (c.some((x) => x.type === 'remove')) touch()
            }}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            defaultEdgeOptions={EDGE_DEFAULTS}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable
            deleteKeyCode={canEdit ? ['Backspace', 'Delete'] : null}
            proOptions={{ hideAttribution: true }}
            minZoom={0.3}
            maxZoom={1.5}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {selected && (
            <StepPanel
              node={selected}
              ctx={ctx}
              canEdit={canEdit}
              onChange={updateData}
              onDelete={deleteSelected}
              onClose={() => setSelectedId(null)}
            />
          )}
          {loaded && issues.size > 0 && (
            <div className="cb-issues">
              <AlertTriangle size={14} /> {[...issues.values()][0]}
              {issues.size > 1 ? ` (+${issues.size - 1} more)` : ''}
            </div>
          )}
        </div>

      </div>
    </FlowCtx.Provider>
  )
}
