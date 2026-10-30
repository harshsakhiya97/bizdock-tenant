import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type IsValidConnection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AlertTriangle, Info, Plus, Save, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useBackTo } from './backTo'
import { HOOK_EVENT } from './HookTrigger'
import { useAuth } from '@/auth/useAuth'
import { cn } from '@/lib/cn'
import { saveWorkflow } from './api'
import { AddCtx } from './addCtx'
import { FlowCtx, NODE_TYPES } from './StepBox'
import { StepPanel } from './StepPanel'
import { PALETTE, STEP_META, caseLabel, casesOf, flowContext, problem } from './steps'
import { STEP_DEFAULTS, type FlowEdge, type RefData, type StepKind, type StepNode, type WorkflowHook, type WorkflowRow } from './types'
import { Flash } from '@/components/Flash'

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
  const navigate = useNavigate()
  const back = useBackTo()
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
  // the workflow's own webhook ("On webhook call") as it changes in the trigger panel
  const [hooks, setHooks] = useState(refData.hooks ?? [])
  useEffect(() => {
    const on = (e: Event) => {
      const h = (e as CustomEvent<WorkflowHook>).detail
      setHooks((list) => [...list.filter((x) => x.workflow_id !== h.workflow_id), h])
    }
    window.addEventListener(HOOK_EVENT, on)
    return () => window.removeEventListener(HOOK_EVENT, on)
  }, [])
  const ctx = useMemo(() => flowContext({ ...refData, hooks, selfId: workflow.id }, nodes), [refData, hooks, nodes, workflow.id])
  // lines out of a Switch show their path's name
  const shownEdges = useMemo(() => {
    const sw = new Map(nodes.filter((n) => n.type === 'switch').map((n) => [n.id, n]))
    return edges.map((e) => {
      const n = sw.get(e.source)
      if (!n || !e.sourceHandle) return e
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
  // the + panel: pick the next step
  const [adding, setAdding] = useState(false)
  const [find, setFind] = useState('')
  // a "+" under a box's exit: the next step goes there
  const [from, setFrom] = useState<{ source: string; handle: string | null; fresh?: boolean } | null>(null)
  const used = useMemo(() => new Set(edges.map((e) => `${e.source}|${e.sourceHandle ?? ''}`)), [edges])

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
    const target = from && nodes.find((n) => n.id === from.source)
    let pos: { x: number; y: number }
    if (!position && target) {
      // under the "+" that was clicked (a Switch / Yes-No exit: under that exit), joined to it
      const w = target.measured?.width ?? 260
      const h = target.measured?.height ?? 90
      const exits: (string | null)[] = target.type === 'switch' ? casesOf(target.data).map((c) => c.id) : target.type === 'condition' ? ['yes', 'no'] : [null]
      const i = Math.max(0, exits.indexOf(from.handle))
      const shift = exits.length > 1 ? (i - (exits.length - 1) / 2) * (w + 40) : 0
      pos = { x: target.position.x + shift, y: target.position.y + h + 90 }
      setEdges((eds) => [...eds, withLook({ id: newId('e'), source: target.id, sourceHandle: from.handle ?? undefined, target: id } as FlowEdge)])
    } else {
      // without a drop position: under the selected box (or the last one), joined to it
      const anchor = nodes.find((n) => n.id === selectedId) ?? nodes[nodes.length - 1]
      pos = position ?? { x: anchor ? anchor.position.x : 0, y: anchor ? anchor.position.y + 130 : 0 }
      if (!position && anchor && anchor.type !== 'condition' && anchor.type !== 'switch' && anchor.type !== 'goto' && !edges.some((e) => e.source === anchor.id)) {
        setEdges((eds) => [...eds, withLook({ id: newId('e'), source: anchor.id, target: id } as FlowEdge)])
      }
    }
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: kind, position: pos, data: { ...STEP_DEFAULTS[kind as Exclude<StepKind, 'trigger'>] }, selected: true }])
    setSelectedId(id)
    setAdding(false)
    setFrom(null)
    touch()
    // bring the new box into view
    if (!position) void flow.setCenter(pos.x + 170, pos.y + 40, { zoom: flow.getZoom(), duration: 300 })
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    const kind = e.dataTransfer.getData('application/x-workflow-step') as StepKind
    if (!kind || !canEdit) return
    const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addStep(kind, { x: p.x - 130, y: p.y - 30 })
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null
  // "+" under an exit: pick the next step for it
  const addCtx = useMemo(
    () => ({
      canEdit,
      used,
      onAdd: (source: string, handle: string | null) => {
        setFrom({ source, handle })
        setSelectedId(null)
        setFind('')
        setAdding(true)
      },
      // the Switch's extra "+": a new path, then its settings open (same as editing it)
      // the Switch's dotted "+": a new path, then pick its step (its condition is set later)
      onAddPath: (nodeId: string) => {
        const caseId = `c${Date.now().toString(36)}`
        setNodes((ns) =>
          ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, cases: [...casesOf(n.data), { id: caseId, label: '', field: 'stage', op: 'is', value: '' }] } } : n)),
        )
        setFrom({ source: nodeId, handle: caseId, fresh: true })
        setSelectedId(null)
        setFind('')
        setAdding(true)
        setDirty(true)
      },
    }),
    [canEdit, used, setNodes],
  )
  function updateData(data: Record<string, unknown>) {
    setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data } : n)))
    // a removed Switch path takes its line with it
    if (selected?.type === 'switch') {
      const keep = new Set(casesOf(data).map((c) => c.id))
      setEdges((es) => es.filter((e) => e.source !== selectedId || !e.sourceHandle || keep.has(e.sourceHandle)))
    }
    touch()
  }
  /**
   * steps being deleted: a Switch path they hung from goes too (a Switch keeps at least 1 path;
   * the path's other lines, if any, keep it)
   */
  /**
   * steps being deleted from the middle of a line: the step before joins the step after (through a run of
   * deleted steps too); not when a deleted step splits into several paths
   */
  function bridges(removed: Set<string>): FlowEdge[] {
    const out: FlowEdge[] = []
    for (const e of edges) {
      if (!removed.has(e.target) || removed.has(e.source)) continue
      let cur = e.target
      const seen = new Set<string>()
      while (removed.has(cur) && !seen.has(cur)) {
        seen.add(cur)
        const outs = edges.filter((x) => x.source === cur)
        if (outs.length !== 1) break
        cur = outs[0].target
      }
      if (removed.has(cur) || cur === e.source || cur === 'trigger') continue
      const taken = (s: string, h: string | null | undefined) =>
        edges.some((x) => x.source === s && (x.sourceHandle ?? null) === (h ?? null) && !removed.has(x.target)) ||
        out.some((x) => x.source === s && (x.sourceHandle ?? null) === (h ?? null))
      if (taken(e.source, e.sourceHandle)) continue
      out.push(withLook({ id: newId('e'), source: e.source, sourceHandle: e.sourceHandle ?? undefined, target: cur } as FlowEdge))
    }
    return out
  }
  function dropPaths(removed: Set<string>, bridged: FlowEdge[] = []) {
    const gone = new Map<string, Set<string>>()
    for (const e of edges) {
      if (!removed.has(e.target) || !e.sourceHandle || removed.has(e.source)) continue
      // the path now goes on to the next step: it stays
      if (bridged.some((b) => b.source === e.source && b.sourceHandle === e.sourceHandle)) continue
      const sw = nodes.find((n) => n.id === e.source && n.type === 'switch')
      if (!sw) continue
      const stillUsed = edges.some((x) => x.source === e.source && x.sourceHandle === e.sourceHandle && !removed.has(x.target))
      if (stillUsed) continue
      gone.set(sw.id, (gone.get(sw.id) ?? new Set()).add(e.sourceHandle))
    }
    if (!gone.size) return
    setNodes((ns) =>
      ns.map((n) => {
        const drop = gone.get(n.id)
        if (!drop) return n
        let cases = casesOf(n.data)
        for (const c of [...cases].reverse()) if (drop.has(c.id) && cases.length > 1) cases = cases.filter((x) => x.id !== c.id)
        return { ...n, data: { ...n.data, cases } }
      }),
    )
  }
  // closing the step list: a path just made for it (no step picked) goes again
  function closeAdd() {
    if (from?.fresh && from.handle) {
      const { source, handle } = from
      setNodes((ns) => ns.map((n) => (n.id === source ? { ...n, data: { ...n.data, cases: casesOf(n.data).filter((c) => c.id !== handle) } } : n)))
    }
    setAdding(false)
    setFrom(null)
  }
  function deleteSelected() {
    if (!selected || selected.type === 'trigger') return
    const removed = new Set([selected.id])
    const join = bridges(removed)
    dropPaths(removed, join)
    setNodes((ns) => ns.filter((n) => n.id !== selected.id))
    setEdges((es) => [...es.filter((e) => e.source !== selected.id && e.target !== selected.id), ...join])
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
    <AddCtx.Provider value={addCtx}>
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
            <label className={cn('tgl', active && 'is-on')} title={issues.size ? 'Fix the marked steps first' : undefined}>
              <input type="checkbox" role="switch" checked={active} disabled={busy || !loaded} onChange={(e) => void save(e.target.checked)} />
              <span className="tgl-track" aria-hidden="true">
                <span className="tgl-knob" />
              </span>
              {active ? 'Active' : 'Inactive'}
            </label>
            <button type="button" className="btn btn-outline" onClick={() => navigate(back.to)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !loaded || !dirty}>
              <Save size={15} /> {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
      <div className="alert alert-info small cb-note">
        <Info size={15} /> WhatsApp, Bulk WhatsApp, Generate link, Create Zoom meeting, Wait, Switch and Go to workflow steps run now. Email, Call and Wait for event are saved but don’t run yet.
      </div>
      {notice.error && <div className="alert alert-error">{notice.error}</div>}
      {!dirty && <Flash msg={notice.ok} dep={notice} />}

      <div className="cb-layout">
        <div className="cb-canvas" ref={wrap} onDragOver={(e) => (e.preventDefault(), (e.dataTransfer.dropEffect = 'move'))} onDrop={onDrop}>
          <ReactFlow<StepNode, FlowEdge>
            nodes={nodes}
            edges={shownEdges}
            nodeTypes={NODE_TYPES}
            onNodesChange={(c) => {
              // the trigger stays
              const safe = c.filter((x) => !(x.type === 'remove' && x.id === 'trigger'))
              const removed = new Set(safe.flatMap((x) => (x.type === 'remove' ? [x.id] : [])))
              if (removed.size) {
                const join = bridges(removed)
                dropPaths(removed, join)
                if (join.length) setEdges((es) => [...es, ...join])
              }
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
            onNodeClick={(_, n) => (adding && closeAdd(), setSelectedId(n.id))}
            onPaneClick={() => setSelectedId(null)}
            defaultEdgeOptions={EDGE_DEFAULTS}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable
            // n8n style: drag on empty canvas draws a box to select several steps (move / delete them together);
            // pan with the middle / right button, the trackpad, or Space + drag
            selectionOnDrag={canEdit}
            panOnDrag={canEdit ? [1, 2] : true}
            panOnScroll={canEdit}
            selectionMode={SelectionMode.Partial}
            deleteKeyCode={canEdit ? ['Backspace', 'Delete'] : null}
            proOptions={{ hideAttribution: true }}
            minZoom={0.3}
            maxZoom={1.5}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {canEdit && !adding && (
            <button type="button" className="cb-add-fab" onClick={() => (setFrom(null), setAdding(true), setFind(''))} title="Add a step" aria-label="Add a step">
              <Plus size={20} />
            </button>
          )}
          {adding && (
            <aside className="cb-panel cb-add-panel">
              <div className="cb-panel-head">
                <div style={{ flex: 1 }}>
                  <b>What happens next?</b>
                  <div className="muted small">
                    Added under{' '}
                    <b>{(() => {
                      const f = from && nodes.find((n) => n.id === from.source)
                      if (f) {
                        const base = String((f.data as Record<string, unknown>).name || STEP_META[f.type as StepKind]?.label || 'the step')
                        if (!from.handle) return base
                        if (from.handle === 'yes' || from.handle === 'no') return `${base} → ${from.handle === 'yes' ? 'Yes' : 'No'}`
                        const i = casesOf(f.data).findIndex((c) => c.id === from.handle)
                        return i < 0 ? base : `${base} → ${caseLabel(casesOf(f.data)[i], i, ctx)}`
                      }
                      const a = nodes.find((n) => n.id === selectedId) ?? nodes[nodes.length - 1]
                      if (!a) return 'the trigger'
                      return String((a.data as Record<string, unknown>).name || STEP_META[a.type as StepKind]?.label || 'the last step')
                    })()}</b>
                    . You can also drag a step onto the canvas.
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={closeAdd}>
                  <X size={16} />
                </button>
              </div>
              <div className="cb-panel-body">
                <div className="cb-add-search">
                  <Search size={15} />
                  <input autoFocus placeholder="Search steps…" value={find} onChange={(e) => setFind(e.target.value)} />
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  {PALETTE.filter((k) => {
                    const q = find.trim().toLowerCase()
                    return !q || STEP_META[k].label.toLowerCase().includes(q) || STEP_META[k].hint.toLowerCase().includes(q)
                  }).map((k) => {
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
                </div>
                <p className="muted small" style={{ margin: 0 }}>
                  Join boxes by dragging from a box’s bottom dot to the next box. Select a line or box and press Delete to remove it.
                </p>
              </div>
            </aside>
          )}
          {selected && !adding && (
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
    </AddCtx.Provider>
    </FlowCtx.Provider>
  )
}
