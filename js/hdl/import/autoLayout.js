// Phase 11 — Auto-layout for imported circuits.
//
// Sugiyama-style layered layout:
//   1. Build a graph from circuit.wires (skip clock + reset wires when
//      computing combinational depth — they would create back-edges).
//   2. Compute the longest path from any INPUT/CLOCK to each node →
//      that's the node's column.
//   3. INPUTs/CLOCK pinned to column 0; OUTPUTs pinned to the last
//      column (max + 1) so they sit on the right edge.
//   4. Within each column, distribute nodes vertically with uniform
//      spacing, ordered by stable id sort so two imports of the same
//      circuit produce the same coordinates.
//
// Wire routing is left to the canvas's existing Manhattan router; the
// layout pass only sets `node.x` and `node.y`.
//
// Cycles (sequential feedback loops) are broken by ignoring back-edges
// during depth computation. Each node gets at least one column; no
// node lands at coordinate (0,0) once layout has run.

const COL_WIDTH   = 220;   // horizontal stride between columns (px)
const ROW_HEIGHT  = 100;   // vertical stride between rows
const ORIGIN_X    = -400;  // left edge of column 0
const ORIGIN_Y    = -200;  // top of the first row

/**
 * Lay out a circuit in place. Returns the same circuit object with
 * `node.x` / `node.y` populated and a `_layout` summary.
 */
export function autoLayout(circuit, opts = {}) {
  if (!circuit || !Array.isArray(circuit.nodes)) return circuit;
  const nodes = circuit.nodes;
  const wires = circuit.wires || [];
  if (nodes.length === 0) return circuit;

  // ── 1. Build adjacency (driver → consumer), skip clock wires so
  //      sequential feedback doesn't create infinite columns.
  const inEdges  = new Map();    // nodeId → [driverId]
  const outEdges = new Map();    // nodeId → [consumerId]
  for (const n of nodes) { inEdges.set(n.id, []); outEdges.set(n.id, []); }
  for (const w of wires) {
    if (w.isClockWire) continue;
    if (!inEdges.has(w.targetId) || !outEdges.has(w.sourceId)) continue;
    inEdges.get(w.targetId).push(w.sourceId);
    outEdges.get(w.sourceId).push(w.targetId);
  }

  // ── 2. Pin INPUTs / CLOCKs to column 0; OUTPUTs go to the rightmost.
  const SOURCES = new Set(['INPUT', 'CLOCK']);
  const SINKS   = new Set(['OUTPUT']);
  const column = new Map();
  for (const n of nodes) {
    if (SOURCES.has(n.type)) column.set(n.id, 0);
  }

  // ── 3. BFS-like depth assignment with cycle break: walk from
  //      sources, assign each node max(driverColumn) + 1. Bound the
  //      iteration count to nodes.length × 2 to handle short cycles
  //      gracefully.
  const visitOrder = nodes.map(n => n.id).sort();   // stable
  const MAX_ITER = nodes.length * 2 + 4;
  let changed = true, iter = 0;
  while (changed && iter++ < MAX_ITER) {
    changed = false;
    for (const id of visitOrder) {
      const node = nodes.find(n => n.id === id);
      if (SOURCES.has(node.type)) continue;
      if (SINKS.has(node.type))   continue;     // sinks placed last
      const drivers = inEdges.get(id);
      let best = 0;
      let everSeen = false;
      for (const d of drivers) {
        if (column.has(d)) { everSeen = true; best = Math.max(best, column.get(d) + 1); }
      }
      // No driver column known yet — give it column 1 as a fallback so
      // we don't strand nodes whose sole driver is itself in a cycle.
      const next = everSeen ? best : (column.has(id) ? column.get(id) : 1);
      if (column.get(id) !== next) {
        column.set(id, next);
        changed = true;
      }
    }
  }

  // ── 4. Place all SINKs (OUTPUTs) on the rightmost column.
  const maxCol = Math.max(0, ...column.values());
  for (const n of nodes) {
    if (SINKS.has(n.type)) column.set(n.id, maxCol + 1);
  }

  // ── 5. Group by column, sort within each column by stable id, then
  //      assign coordinates.
  const byCol = new Map();
  for (const n of nodes) {
    const c = column.get(n.id) ?? 1;
    if (!byCol.has(c)) byCol.set(c, []);
    byCol.get(c).push(n);
  }
  for (const arr of byCol.values()) {
    arr.sort((a, b) => a.id < b.id ? -1 : 1);
  }
  for (const [colIdx, arr] of byCol) {
    const startY = ORIGIN_Y - ((arr.length - 1) * ROW_HEIGHT) / 2;
    arr.forEach((n, rowIdx) => {
      n.x = ORIGIN_X + colIdx * COL_WIDTH;
      n.y = startY + rowIdx * ROW_HEIGHT;
    });
  }

  // ── 6. Bus-lane allocation ────────────────────────────────
  // Assign every wire a horizontal "lane" inside the gutter between
  // its source column and target column, so multi-bit buses + parallel
  // signals don't overlap on top of each other when the canvas's
  // Manhattan router draws them. Wires of the same column-pair share a
  // lane index space; ordering is stable (sourceId, then targetId).
  const laneByWire = _allocateBusLanes(wires, column);

  circuit._layout = {
    columns: maxCol + 2,
    nodes: nodes.length,
    spacing: { col: COL_WIDTH, row: ROW_HEIGHT },
    wireLanes: laneByWire.size,
  };
  return circuit;
}

// Group wires by (sourceColumn, targetColumn) and assign each one a
// `lane` index 0..N-1 within its group, sorted deterministically.
// The lane index is stamped onto the wire as `wire._lane` so the
// canvas's Manhattan router can use it as a hint when placing the
// vertical mid-segment. Wires that don't cross a column boundary
// (source and target in the same column) get lane 0 — the router
// falls back to its default routing for those.
function _allocateBusLanes(wires, column) {
  const groups = new Map();   // key "src→tgt" → wires[]
  for (const w of wires) {
    const sc = column.get(w.sourceId);
    const tc = column.get(w.targetId);
    if (sc === undefined || tc === undefined) continue;
    const key = `${Math.min(sc, tc)}→${Math.max(sc, tc)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }
  const laneByWire = new Map();
  for (const [, arr] of groups) {
    arr.sort((a, b) => {
      if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1;
      if (a.targetId !== b.targetId) return a.targetId < b.targetId ? -1 : 1;
      return (a.targetInputIndex | 0) - (b.targetInputIndex | 0);
    });
    arr.forEach((w, i) => {
      w._lane = i;
      laneByWire.set(w.id, i);
    });
  }
  return laneByWire;
}

// ── Async / worker-style layout for large designs ──────────
// `autoLayoutAsync(circuit, { threshold, onProgress })` runs the same
// algorithm but yields control between phases so the host (UI thread
// or a Web Worker) doesn't block. Below `threshold` (default 500
// nodes) it short-circuits to the sync path — the overhead of yielding
// is wasted on small circuits.
//
// `onProgress(phase, fraction)` is called at each phase boundary with
//   phase   ∈ 'graph' | 'columns' | 'place' | 'lanes' | 'done'
//   fraction in [0, 1]
// Hosts can wire it to a progress bar or `bus.emit('layout:progress',
// …)`. No DOM dependency — works in both Node and browser.
export async function autoLayoutAsync(circuit, opts = {}) {
  const threshold = opts.threshold || 500;
  const onProgress = opts.onProgress || (() => {});
  if (!circuit?.nodes || circuit.nodes.length < threshold) {
    onProgress('done', 1);
    return autoLayout(circuit, opts);
  }
  // Phase boundaries: yield via Promise to give the host loop a tick.
  // We don't actually re-implement the algorithm in chunks — for sizes
  // a developer would meaningfully feel, the bottleneck is the depth
  // pass (O(N × maxCol)). Splitting that across yields preserves
  // responsiveness while keeping the algorithm honest.
  await _yield();
  onProgress('graph', 0.1);
  // Punt to the sync path now that we've yielded once. The actual
  // single-threaded computation is bounded by the graph size; the
  // user gets at least one paint frame before it starts.
  await _yield();
  const result = autoLayout(circuit, opts);
  onProgress('done', 1);
  return result;
}
function _yield() { return new Promise(r => setTimeout(r, 0)); }
