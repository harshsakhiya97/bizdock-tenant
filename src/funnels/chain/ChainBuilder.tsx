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
import { useTenant } from '@/tenant/useTenant'
import { START_NODES, getChain, saveChain } from './api'
import { ChainCtx, NODE_TYPES } from './StepBox'
import { StepPanel } from './StepPanel'
import { PALETTE, STEP_META, problem } from './steps'
import { DEFAULTS, type ChainContext, type ChainEdge, type StepKind, type StepNode } from './types'

const EDGE_DEFAULTS = { type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 } } as const
const withLook = (e: ChainEdge): ChainEdge => ({
  ...EDGE_DEFAULTS,
  ...e,
  className: e.sourceHandle === 'yes' ? 'is-yes' : e.sourceHandle === 'no' ? 'is-no' : undefined,
  label: e.sourceHandle === 'yes' ? 'Yes' : e.sourceHandle === 'no' ? 'No' : undefined,
})
let seq = 0
const newId = (kind: string) => `${kind}-${Date.now().toString(36)}-${++seq}`

type Props = { funnelId: string; ctx: ChainContext; canEdit: boolean }

/** Funnel → Chain: n8n-style canvas. Drag steps from the left, join them with lines, set each step on the right. */
export function ChainBuilder(props: Props) {
  return (
    <ReactFlowProvider>
      <Builder {...props} />
    </ReactFlowProvider>
  )
}

function Builder({ funnelId, ctx, canEdit }: Props) {
  const tenant = useTenant()
  const { membership } = useAuth()
  const flow = useReactFlow()
  const wrap = useRef<HTMLDivElement>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<ChainEdge>([])
  const [name, setName] = useState('Communication chain')
  const [active, setActive] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok?: string; error?: string }>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    getChain(funnelId)
      .then((c) => {
        setNodes(c?.nodes?.length ? c.nodes : START_NODES)
        setEdges((c?.edges ?? []).map(withLook))
        setName(c?.name ?? 'Communication chain')
        setActive(c?.is_active ?? false)
        setSavedAt(c?.updated_at ?? null)
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
      })
      .catch((e: Error) => setNotice({ error: e.message }))
  }, [funnelId, setNodes, setEdges, flow])

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
      else if (!seen.has(n.id)) out.set(n.id, 'Not joined to the chain')
    }
    return out
  }, [nodes, edges, ctx])
  const steps = nodes.filter((n) => n.type !== 'trigger').length

  const touch = () => setDirty(true)

  const onConnect = useCallback(
    (c: Connection) => {
      setEdges((eds) => addEdge(withLook({ ...c, id: newId('e') } as ChainEdge), eds))
      touch()
    },
    [setEdges],
  )
  // one line out of each exit, no loops back into the trigger, no line to itself
  const isValidConnection: IsValidConnection<ChainEdge> = useCallback(
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
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: kind, position: pos, data: { ...DEFAULTS[kind] }, selected: true }])
    if (!position && anchor && anchor.type !== 'condition' && !edges.some((e) => e.source === anchor.id)) {
      setEdges((eds) => [...eds, withLook({ id: newId('e'), source: anchor.id, target: id } as ChainEdge)])
    }
    setSelectedId(id)
    touch()
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    const kind = e.dataTransfer.getData('application/x-chain-step') as StepKind
    if (!kind || !canEdit) return
    const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addStep(kind, { x: p.x - 130, y: p.y - 30 })
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null
  function updateData(data: Record<string, unknown>) {
    setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data } : n)))
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
      setNotice({ error: 'Fix the steps marked with ! before turning the chain on.' })
      return
    }
    setBusy(true)
    try {
      await saveChain(tenant.id, funnelId, membership?.id, { name, is_active: nextActive, nodes, edges })
      setActive(nextActive)
      setDirty(false)
      setSavedAt(new Date().toISOString())
      setNotice({ ok: nextActive !== active ? (nextActive ? 'Chain turned on and saved.' : 'Chain turned off and saved.') : 'Chain saved.' })
    } catch (e) {
      setNotice({ error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ChainCtx.Provider value={ctx}>
      <div className="cb-bar">
        <input
          className="cb-name"
          aria-label="Chain name"
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
              <input type="checkbox" checked={active} disabled={busy || !loaded} onChange={(e) => void save(e.target.checked)} /> Chain on
            </label>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !loaded || !dirty}>
              <Save size={15} /> {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
      <div className="alert alert-info small cb-note">
        <Info size={15} /> WhatsApp, email and calls are connected later. Until then the chain is saved but no message is sent.
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
                    e.dataTransfer.setData('application/x-chain-step', k)
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
          <ReactFlow<StepNode, ChainEdge>
            nodes={nodes}
            edges={edges}
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
    </ChainCtx.Provider>
  )
}
