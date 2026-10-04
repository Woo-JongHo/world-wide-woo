import      {
              useCallback                         ,
              useEffect                           ,
              useId                               ,
              useLayoutEffect                     ,
              useRef                              ,
              useState                            ,
                                                    } from "react"         ;
import type {
              KeyboardEvent as ReactKeyboardEvent ,
              MouseEvent as ReactMouseEvent       ,
              PointerEvent as ReactPointerEvent   ,
                                                    } from "react"         ;
import      { NODE_HEIGHT, NODE_WIDTH               } from "./graph-model" ;
import type { GraphData, GraphNode                  } from "./graph-model" ;

interface NodeCanvasProps {
  graph      : GraphData            ;
  selectedId : string | null        ;
  onSelect   : (id: string) => void ;
  onExpand   : (id: string) => void ;
  query      : string               ;
  graphKey   : string               ;
}

interface Point {
  x : number ;
  y : number ;
}

interface Camera extends Point {
  scale : number ;
}

interface Size {
  width  : number ;
  height : number ;
}

interface Bounds extends Point, Size {}

interface NodeGesture {
  id           : string  ;
  pointerId    : number  ;
  startClientX : number  ;
  startClientY : number  ;
  startX       : number  ;
  startY       : number  ;
  moved        : boolean ;
}

interface PanGesture {
  pointerId    : number ;
  startClientX : number ;
  startClientY : number ;
  startX       : number ;
  startY       : number ;
}

interface EdgeGeometry {
  path       : string                     ;
  direction  : string                     ;
  labelX     : number                     ;
  labelY     : number                     ;
  textAnchor : "start" | "middle" | "end" ;
}

const MIN_SCALE          = 0.35 ;
const MAX_SCALE          = 2.2  ;
const FIT_PADDING        = 48   ;
const REVEAL_PADDING     = 24   ;
const DRAG_THRESHOLD     = 4    ;
const MODULE_CLICK_DELAY = 220  ;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function positionsFromGraph(graph: GraphData): Record<string, Point> {
  return Object.fromEntries(graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
}

function graphBounds(nodes: GraphNode[], positions: Record<string, Point>): Bounds {
  if (nodes.length === 0) return { x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT };
  const firstPosition = positions[nodes[0]?.id ?? ""] ?? { x: 0, y: 0 } ;
  let minimumX        = firstPosition.x                                 ;
  let minimumY        = firstPosition.y                                 ;
  let maximumX        = minimumX + NODE_WIDTH                           ;
  let maximumY        = minimumY + NODE_HEIGHT                          ;
  for (const node of nodes) {
    const position = positions[node.id] ?? { x: node.x, y: node.y };
    minimumX = Math.min(minimumX, position.x)               ;
    minimumY = Math.min(minimumY, position.y)               ;
    maximumX = Math.max(maximumX, position.x + NODE_WIDTH)  ;
    maximumY = Math.max(maximumY, position.y + NODE_HEIGHT) ;
  }
  return { x: minimumX, y: minimumY, width: maximumX - minimumX, height: maximumY - minimumY };
}

function nodeStatusLabel(status: Exclude<GraphNode["status"], null>): string {
  const labels: Record<Exclude<GraphNode["status"], null>, string> = {
    passed         : "통과"       ,
    failed         : "실패"       ,
    "needs-review" : "검토 필요"  ,
    "not-checked"  : "미검사"     ,
    stale          : "재확인 필요",
    proposed       : "제안됨"     ,
    adopted        : "채택됨"     ,
    rejected       : "거절됨"     ,
    superseded     : "대체됨"     ,
  };
  return labels[status];
}

function edgeGeometry(source: Point, target: Point): EdgeGeometry {
  const sourceCenterX = source.x + NODE_WIDTH / 2                                                                             ;
  const sourceCenterY = source.y + NODE_HEIGHT / 2                                                                            ;
  const targetCenterX = target.x + NODE_WIDTH / 2                                                                             ;
  const targetCenterY = target.y + NODE_HEIGHT / 2                                                                            ;
  const deltaX        = targetCenterX - sourceCenterX                                                                         ;
  const deltaY        = targetCenterY - sourceCenterY                                                                         ;
  const horizontal    = Math.abs(deltaX) >= Math.abs(deltaY)                                                                  ;
  const direction     = `${deltaX < 0 ? "backward" : "forward"}-${deltaY < 0 ? "upward" : deltaY > 0 ? "downward" : "level"}` ;

  if (horizontal) {
    const sign     = deltaX < 0 ? -1 : 1                                                                                                                 ;
    const sourceX  = sourceCenterX + sign * NODE_WIDTH / 2                                                                                               ;
    const sourceY  = sourceCenterY                                                                                                                       ;
    const targetX  = targetCenterX - sign * NODE_WIDTH / 2                                                                                               ;
    const targetY  = targetCenterY                                                                                                                       ;
    const distance = Math.max(56, Math.abs(targetX - sourceX) * 0.45)                                                                                    ;
    const path     = `M ${sourceX} ${sourceY} C ${sourceX + sign * distance} ${sourceY}, ${targetX - sign * distance} ${targetY}, ${targetX} ${targetY}` ;
    return {
      path,
      direction,
      labelX     : (sourceX + targetX) / 2,
      labelY     : (sourceY + targetY) / 2 + (deltaY < 0 ? 16 : -14),
      textAnchor : "middle",
    };
  }

  const sign     = deltaY < 0 ? -1 : 1                                                                                                                 ;
  const sourceX  = sourceCenterX                                                                                                                       ;
  const sourceY  = sourceCenterY + sign * NODE_HEIGHT / 2                                                                                              ;
  const targetX  = targetCenterX                                                                                                                       ;
  const targetY  = targetCenterY - sign * NODE_HEIGHT / 2                                                                                              ;
  const distance = Math.max(44, Math.abs(targetY - sourceY) * 0.45)                                                                                    ;
  const path     = `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY + sign * distance}, ${targetX} ${targetY - sign * distance}, ${targetX} ${targetY}` ;
  return {
    path,
    direction,
    labelX     : (sourceX + targetX) / 2 + (deltaX < 0 ? -12 : 12),
    labelY     : (sourceY + targetY) / 2,
    textAnchor : deltaX < 0 ? "end" : "start",
  };
}

export function NodeCanvas({ graph, selectedId, onSelect, onExpand, query, graphKey }: NodeCanvasProps) {
  const rootRef              = useRef<HTMLDivElement>(null)                             ;
  const minimapRef           = useRef<SVGSVGElement>(null)                              ;
  const markerId             = `graph-arrow-${useId().replaceAll(":", "")}`             ;
  const cameraRef            = useRef<Camera>({ x: 40, y: 40, scale: 1 })               ;
  const positionsRef         = useRef<Record<string, Point>>(positionsFromGraph(graph)) ;
  const graphNodesRef        = useRef(graph.nodes)                                      ;
  const graphKeyRef          = useRef(graphKey)                                         ;
  const selectedIdRef        = useRef(selectedId)                                       ;
  const onSelectRef          = useRef(onSelect)                                         ;
  const onExpandRef          = useRef(onExpand)                                         ;
  const fitPendingRef        = useRef(true)                                             ;
  const nodeGestureRef       = useRef<NodeGesture | null>(null)                         ;
  const panGestureRef        = useRef<PanGesture | null>(null)                          ;
  const suppressNodeClickRef = useRef<string | null>(null)                              ;
  const pointerFocusRef      = useRef<string | null>(null)                              ;
  const moduleClickTimerRef  = useRef<number | null>(null)                              ;
  const [camera, setCamera]         = useState<Camera>(cameraRef.current)                                  ;
  const [viewport, setViewport]     = useState<Size>({ width: 0, height: 0 })                              ;
  const [positions, setPositions]   = useState<Record<string, Point>>(positionsRef.current)               ;
  const [draggingId, setDraggingId] = useState<string | null>(null)                                       ;
  const nodeIdentity                = graph.nodes.map((node) => node.id).join("\u0000")                    ;
  graphNodesRef.current = graph.nodes ;
  selectedIdRef.current = selectedId  ;
  onSelectRef.current   = onSelect    ;
  onExpandRef.current   = onExpand    ;

  const updateCamera = useCallback((next: Camera | ((current: Camera) => Camera)) => {
    const resolved = typeof next === "function" ? next(cameraRef.current) : next;
    cameraRef.current = resolved;
    setCamera(resolved);
  }, []);

  const revealNode = useCallback((id: string, size?: Size) => {
    const position = positionsRef.current[id] ;
    const root     = rootRef.current          ;
    if (!position || !root) return;
    const dimensions = size ?? root.getBoundingClientRect()   ;
    const current    = cameraRef.current                      ;
    const left       = position.x * current.scale + current.x ;
    const top        = position.y * current.scale + current.y ;
    const right      = left + NODE_WIDTH * current.scale      ;
    const bottom     = top + NODE_HEIGHT * current.scale      ;
    let shiftX       = 0                                      ;
    let shiftY       = 0                                      ;
    if (left < REVEAL_PADDING) shiftX = REVEAL_PADDING - left;
    else if (right > dimensions.width - REVEAL_PADDING) shiftX = dimensions.width - REVEAL_PADDING - right;
    if (top < REVEAL_PADDING) shiftY = REVEAL_PADDING - top;
    else if (bottom > dimensions.height - REVEAL_PADDING) shiftY = dimensions.height - REVEAL_PADDING - bottom;
    if (shiftX !== 0 || shiftY !== 0) updateCamera({ ...current, x: current.x + shiftX, y: current.y + shiftY });
  }, [updateCamera]);

  const fitGraph = useCallback((size: Size, nextPositions = positionsRef.current) => {
    if (size.width <= 0 || size.height <= 0) return;
    const bounds       = graphBounds(graphNodesRef.current, nextPositions)                                                     ;
    const usableWidth  = Math.max(1, size.width - FIT_PADDING * 2)                                                             ;
    const usableHeight = Math.max(1, size.height - FIT_PADDING * 2)                                                            ;
    const scale        = clamp(Math.min(usableWidth / bounds.width, usableHeight / bounds.height, 1.15), MIN_SCALE, MAX_SCALE) ;
    updateCamera({
      x     : (size.width - bounds.width * scale) / 2 - bounds.x * scale,
      y     : (size.height - bounds.height * scale) / 2 - bounds.y * scale,
      scale,
    });
    fitPendingRef.current = false;
    if (selectedIdRef.current) revealNode(selectedIdRef.current, size);
  }, [revealNode, updateCamera]);

  useLayoutEffect(() => {
    const changedGraph = graphKeyRef.current !== graphKey;
    const nextPositions = changedGraph
      ? positionsFromGraph(graph)
      : Object.fromEntries(graph.nodes.map((node) => [node.id, positionsRef.current[node.id] ?? { x: node.x, y: node.y }]));
    graphKeyRef.current  = graphKey;
    positionsRef.current = nextPositions;
    setPositions(nextPositions);
    if (!changedGraph) return;
    fitPendingRef.current = true;
    const rectangle = rootRef.current?.getBoundingClientRect();
    if (rectangle) fitGraph({ width: rectangle.width, height: rectangle.height }, nextPositions);
  }, [fitGraph, graphKey, nodeIdentity]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const size = { width: entry.contentRect.width, height: entry.contentRect.height };
      setViewport(size);
      if (fitPendingRef.current) fitGraph(size);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [fitGraph]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rectangle = root.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        const anchorX   = event.clientX - rectangle.left                                                         ;
        const anchorY   = event.clientY - rectangle.top                                                          ;
        const nextScale = clamp(cameraRef.current.scale * Math.exp(-event.deltaY * 0.002), MIN_SCALE, MAX_SCALE) ;
        const ratio     = nextScale / cameraRef.current.scale                                                    ;
        updateCamera({
          x     : anchorX - (anchorX - cameraRef.current.x) * ratio,
          y     : anchorY - (anchorY - cameraRef.current.y) * ratio,
          scale : nextScale,
        });
        return;
      }
      updateCamera((current) => ({
        ...current,
        x: current.x - (event.shiftKey ? event.deltaY : event.deltaX),
        y: current.y - (event.shiftKey ? event.deltaX : event.deltaY),
      }));
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [updateCamera]);

  useEffect(() => {
    if (selectedId) revealNode(selectedId);
  }, [revealNode, selectedId]);

  useEffect(() => {
    if (moduleClickTimerRef.current !== null) window.clearTimeout(moduleClickTimerRef.current);
    moduleClickTimerRef.current = null;
    return () => {
      if (moduleClickTimerRef.current !== null) window.clearTimeout(moduleClickTimerRef.current);
      moduleClickTimerRef.current = null;
    };
  }, [graphKey]);

  const zoomAtViewportCenter = (factor: number) => {
    const current   = cameraRef.current                                   ;
    const nextScale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE) ;
    const anchorX   = viewport.width / 2                                  ;
    const anchorY   = viewport.height / 2                                 ;
    const ratio     = nextScale / current.scale                           ;
    updateCamera({
      x     : anchorX - (anchorX - current.x) * ratio,
      y     : anchorY - (anchorY - current.y) * ratio,
      scale : nextScale,
    });
  };

  const resetLayout = () => {
    const nextPositions = positionsFromGraph(graph);
    positionsRef.current = nextPositions;
    setPositions(nextPositions);
    fitGraph(viewport, nextPositions);
  };

  const selectNode = (node: GraphNode) => {
    if (moduleClickTimerRef.current !== null) window.clearTimeout(moduleClickTimerRef.current);
    moduleClickTimerRef.current = null;
    if (node.kind !== "module") {
      onSelectRef.current(node.id);
      return;
    }
    moduleClickTimerRef.current = window.setTimeout(() => {
      moduleClickTimerRef.current = null;
      onSelectRef.current(node.id);
    }, MODULE_CLICK_DELAY);
  };

  const expandNode = (node: GraphNode) => {
    if (moduleClickTimerRef.current !== null) window.clearTimeout(moduleClickTimerRef.current);
    moduleClickTimerRef.current = null;
    onExpandRef.current(node.id);
  };

  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest(".graph-node,.node-canvas-toolbar,.node-minimap")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panGestureRef.current = {
      pointerId    : event.pointerId,
      startClientX : event.clientX,
      startClientY : event.clientY,
      startX       : cameraRef.current.x,
      startY       : cameraRef.current.y,
    };
  };

  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    updateCamera((current) => ({
      ...current,
      x: gesture.startX + event.clientX - gesture.startClientX,
      y: gesture.startY + event.clientY - gesture.startClientY,
    }));
  };

  const endCanvasPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panGestureRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    panGestureRef.current = null;
  };

  const onNodePointerDown = (node: GraphNode, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    suppressNodeClickRef.current = null;
    pointerFocusRef.current = node.id;
    const position = positionsRef.current[node.id] ?? { x: node.x, y: node.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    nodeGestureRef.current = {
      id           : node.id,
      pointerId    : event.pointerId,
      startClientX : event.clientX,
      startClientY : event.clientY,
      startX       : position.x,
      startY       : position.y,
      moved        : false,
    };
  };

  const onNodePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = nodeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startClientX ;
    const deltaY = event.clientY - gesture.startClientY ;
    if (!gesture.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
    gesture.moved = true;
    setDraggingId(gesture.id);
    const position = {
      x: gesture.startX + deltaX / cameraRef.current.scale,
      y: gesture.startY + deltaY / cameraRef.current.scale,
    };
    positionsRef.current = { ...positionsRef.current, [gesture.id]: position };
    setPositions(positionsRef.current);
  };

  const endNodePointer = (event: ReactPointerEvent<HTMLButtonElement>, suppressClick: boolean) => {
    const gesture = nodeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (suppressClick && gesture.moved) suppressNodeClickRef.current = gesture.id;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    nodeGestureRef.current = null;
    pointerFocusRef.current = null;
    setDraggingId(null);
  };

  const onCanvasKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".node-canvas-toolbar,.node-minimap")) return;
    const movement: Record<string, Point> = {
      ArrowLeft  : { x: 40, y: 0 },
      ArrowRight : { x: -40, y: 0 },
      ArrowUp    : { x: 0, y: 40 },
      ArrowDown  : { x: 0, y: -40 },
    };
    const delta = movement[event.key];
    if (!delta || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    updateCamera((current) => ({ ...current, x: current.x + delta.x, y: current.y + delta.y }));
  };

  const bounds            = graphBounds(graph.nodes, positions)                                                                                                    ;
  const normalizedQuery   = query.trim().toLocaleLowerCase()                                                                                                       ;
  const selectedNeighbors = new Set(graph.edges.flatMap((edge) => edge.source === selectedId ? [edge.target] : edge.target === selectedId ? [edge.source] : []))   ;
  const minimapPadding    = 32                                                                                                                                     ;
  const minimapViewBox    = `${bounds.x - minimapPadding} ${bounds.y - minimapPadding} ${bounds.width + minimapPadding * 2} ${bounds.height + minimapPadding * 2}` ;
  const viewportInWorld    = {
    x      : -camera.x / camera.scale,
    y      : -camera.y / camera.scale,
    width  : viewport.width / camera.scale,
    height : viewport.height / camera.scale,
  };

  const centerFromMinimap = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const svg = minimapRef.current                                                  ;
    let point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } ;
    if (event.detail > 0 && svg) {
      const matrix = svg.getScreenCTM();
      if (matrix) point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    }
    updateCamera((current) => ({
      ...current,
      x: viewport.width / 2 - point.x * current.scale,
      y: viewport.height / 2 - point.y * current.scale,
    }));
  };

  const resetNativeScroll = (element: HTMLDivElement) => {
    if (element.scrollLeft !== 0) element.scrollLeft = 0;
    if (element.scrollTop !== 0) element.scrollTop = 0;
  };

  return <div
    ref={rootRef}
    className="node-canvas"
    role="region"
    aria-label="Project relationship graph"
    tabIndex={0}
    onScroll={(event) => resetNativeScroll(event.currentTarget)}
    onKeyDown={onCanvasKeyDown}
    onPointerDown={onCanvasPointerDown}
    onPointerMove={onCanvasPointerMove}
    onPointerUp={endCanvasPointer}
    onPointerCancel={endCanvasPointer}
  >
    <div className="graph-world" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
      <svg className="graph-edge-layer" aria-hidden="true">
        <defs><marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" /></marker></defs>
        {graph.edges.map((edge) => {
          const source = positions[edge.source] ;
          const target = positions[edge.target] ;
          if (!source || !target) return null;
          const geometry    = edgeGeometry(source, target)                             ;
          const highlighted = edge.source === selectedId || edge.target === selectedId ;
          return <g key={edge.id} className={`graph-edge${highlighted ? " selected" : ""}`} data-kind={edge.kind} data-direction={geometry.direction} data-provenance={edge.provenance}>
            <path d={geometry.path} markerEnd={`url(#${markerId})`} />
            {edge.label && <text className="graph-edge-label" x={geometry.labelX} y={geometry.labelY} textAnchor={geometry.textAnchor} dominantBaseline="central">{edge.label}</text>}
          </g>;
        })}
      </svg>
      {graph.nodes.map((node) => {
        const position   = positions[node.id] ?? { x: node.x, y: node.y }                                                                                                                                            ;
        const matches    = !normalizedQuery || `${node.ref.id} ${node.title} ${node.subtitle}`.toLocaleLowerCase().includes(normalizedQuery)                                                                         ;
        const selected   = node.id === selectedId                                                                                                                                                                    ;
        const classNames = ["graph-node", selected ? "selected" : "", selectedNeighbors.has(node.id) ? "neighbor" : "", matches ? "" : "dimmed", draggingId === node.id ? "dragging" : ""].filter(Boolean).join(" ") ;
        return <button
          key={node.id}
          type="button"
          className={classNames}
          data-node-id={node.id}
          data-kind={node.kind}
          data-status={node.status ?? "none"}
          data-selected={selected}
          aria-pressed={selected}
          aria-label={`${node.id} ${node.title}${node.status === null ? "" : `. ${nodeStatusLabel(node.status)}`}`}
          title={node.kind === "module" ? "클릭: 상세 보기 · 더블클릭: 구성요소 펼치기" : node.kind === "project" ? "클릭: 상세 보기 · 더블클릭: 전체 모듈 보기" : "클릭하여 상세 보기"}
          style={{ left: position.x, top: position.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
          onPointerDown={(event) => onNodePointerDown(node, event)}
          onPointerMove={onNodePointerMove}
          onPointerUp={(event) => endNodePointer(event, true)}
          onPointerCancel={(event) => endNodePointer(event, false)}
          onFocus={() => {
            const root = rootRef.current;
            if (root) resetNativeScroll(root);
            if (pointerFocusRef.current === node.id) {
              pointerFocusRef.current = null;
              return;
            }
            revealNode(node.id);
          }}
          onClick={(event) => {
            if (suppressNodeClickRef.current === node.id) {
              suppressNodeClickRef.current = null;
              event.preventDefault();
              return;
            }
            selectNode(node);
          }}
          onDoubleClick={() => expandNode(node)}
        >
          <span className="graph-node-port input" aria-hidden="true" />
          <span className="graph-node-port output" aria-hidden="true" />
          <span className="graph-node-ref">{node.ref.id}</span>
          <strong className="graph-node-title">{node.title}</strong>
          <span className="graph-node-subtitle">{node.subtitle}</span>
          {node.status !== null && <span className="graph-node-status">{nodeStatusLabel(node.status)}</span>}
        </button>;
      })}
    </div>
    <div className="node-canvas-toolbar" role="toolbar" aria-label="캔버스 도구">
      <span className="node-canvas-caption">노드 드래그 · 스크롤 이동 · ⌘/Ctrl+스크롤 확대</span>
      <button type="button" className="node-canvas-control" aria-label="확대" onClick={() => zoomAtViewportCenter(1.2)}>+</button>
      <output className="node-canvas-scale" aria-label="현재 확대율">{Math.round(camera.scale * 100)}%</output>
      <button type="button" className="node-canvas-control" aria-label="축소" onClick={() => zoomAtViewportCenter(1 / 1.2)}>−</button>
      <button type="button" className="node-canvas-control" onClick={() => fitGraph(viewport)}>전체 보기</button>
      <button type="button" className="node-canvas-control" onClick={resetLayout}>정렬 초기화</button>
    </div>
    <button type="button" className="node-minimap" aria-label="Graph minimap. Click a location to center it" onPointerDown={(event) => event.stopPropagation()} onClick={centerFromMinimap}>
      <svg ref={minimapRef} viewBox={minimapViewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {graph.edges.map((edge) => {
          const source = positions[edge.source] ;
          const target = positions[edge.target] ;
          if (!source || !target) return null;
          return <line key={edge.id} className="node-minimap-edge" x1={source.x + NODE_WIDTH / 2} y1={source.y + NODE_HEIGHT / 2} x2={target.x + NODE_WIDTH / 2} y2={target.y + NODE_HEIGHT / 2} />;
        })}
        {graph.nodes.map((node) => {
          const position = positions[node.id] ?? { x: node.x, y: node.y };
          return <rect key={node.id} className="node-minimap-node" data-kind={node.kind} data-selected={node.id === selectedId} x={position.x} y={position.y} width={NODE_WIDTH} height={NODE_HEIGHT} rx="8" />;
        })}
        <rect className="node-minimap-viewport" x={viewportInWorld.x} y={viewportInWorld.y} width={viewportInWorld.width} height={viewportInWorld.height} />
      </svg>
    </button>
  </div>;
}
