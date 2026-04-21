/**
 * HazardDetector — classifies feedback in the pipeline data graph.
 *
 * The StageEvaluator treats the design as a DAG and ignores wires that form
 * cycles (Kahn's). Those ignored wires — back-edges — are the interesting
 * thing here: they're what pipeline hazards look like in a schematic.
 *
 * Classification:
 *   RAW  = back-edge source is a stateful element (register / RAM / PIPE_REG …)
 *          and the cycle is latched by at least one PIPE_REG. A later-stage
 *          write feeds back to an earlier-stage read.
 *   WAR  = back-edge target is a stateful element (source is combinational);
 *          a later-stage writer depends on a value consumed upstream.
 *   LOOP = cycle contains no PIPE_REG — a pure combinational loop (illegal,
 *          won't simulate).
 *   WAW  = two stateful writers drive the same (targetNode, targetInputIndex)
 *          across different stages. Detected via a forward-DAG pass, not a
 *          back-edge.
 *
 * Each hazard carries a short suggestion string for the panel.
 */

const STATEFUL_TYPES = new Set([
  'PIPE_REG', 'REGISTER', 'REG_FILE', 'REG_FILE_DP',
  'RAM', 'FIFO', 'STACK', 'SHIFT_REG',
  'COUNTER', 'PC', 'IR', 'FF_SLOT', 'LATCH_SLOT',
]);

const SUGGESTIONS = {
  RAW:  'Insert a PIPE_REG on the feedback path, or add a forwarding mux to select the latest value.',
  WAR:  'Move the write to a later stage, or gate the read with the writer\u2019s enable signal.',
  WAW:  'Only one stateful writer per destination \u2014 merge the conflicting writers or remove one.',
  LOOP: 'Break the combinational cycle with a PIPE_REG \u2014 pure combinational loops cannot simulate.',
};

export function detectHazards(scene) {
  const nodes = scene.nodes || [];
  const wires = (scene.wires || []).filter(w => !w.isClockWire);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const succs = new Map(nodes.map(n => [n.id, []]));
  for (const w of wires) {
    if (succs.has(w.sourceId)) succs.get(w.sourceId).push(w);
  }

  // Iterative DFS with gray/black coloring and an explicit ancestor path
  // stack — when we hit a gray target, slice the stack from that ancestor
  // down to the current node to recover the cycle path.
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color   = new Map(nodes.map(n => [n.id, WHITE]));
  const depthOf = new Map();       // id \u2192 index in pathStack while gray
  const hazards = [];
  for (const start of nodes) {
    if (color.get(start.id) !== WHITE) continue;
    const pathStack = [start.id];
    const frames    = [{ id: start.id, it: 0 }];
    color.set(start.id, GRAY);
    depthOf.set(start.id, 0);
    while (frames.length) {
      const top = frames[frames.length - 1];
      const out = succs.get(top.id) || [];
      if (top.it < out.length) {
        const w = out[top.it++];
        const v = w.targetId;
        const c = color.get(v);
        if (c === GRAY) {
          const fromDepth = depthOf.get(v);
          const cyclePath = pathStack.slice(fromDepth);
          hazards.push(_classifyBackEdge(w, cyclePath, nodeMap));
        } else if (c === WHITE) {
          color.set(v, GRAY);
          depthOf.set(v, pathStack.length);
          pathStack.push(v);
          frames.push({ id: v, it: 0 });
        }
      } else {
        color.set(top.id, BLACK);
        pathStack.pop();
        frames.pop();
      }
    }
  }

  // WAW pass: two stateful writers to the same (dst, inputIndex).
  const writesByPin = new Map();
  for (const w of wires) {
    const src = nodeMap.get(w.sourceId);
    if (!src || !STATEFUL_TYPES.has(src.type)) continue;
    const dst = nodeMap.get(w.targetId);
    if (!dst) continue;
    const key = `${w.targetId}#${w.targetInputIndex ?? 0}`;
    let arr = writesByPin.get(key);
    if (!arr) { arr = []; writesByPin.set(key, arr); }
    arr.push(w);
  }
  for (const arr of writesByPin.values()) {
    if (arr.length < 2) continue;
    const first = arr[0];
    for (let i = 1; i < arr.length; i++) {
      const later = arr[i];
      hazards.push({
        type: 'WAW',
        wireId: later.id,
        srcId:  later.sourceId,
        dstId:  later.targetId,
        srcStage: nodeMap.get(later.sourceId)?.stage ?? null,
        dstStage: nodeMap.get(later.targetId)?.stage ?? null,
        conflictsWith: first.sourceId,
        cyclePath: [],
        suggestion: SUGGESTIONS.WAW,
      });
    }
  }

  return hazards;
}

function _classifyBackEdge(wire, cyclePath, nodeMap) {
  const src = nodeMap.get(wire.sourceId);
  const dst = nodeMap.get(wire.targetId);
  const hasPipe = cyclePath.some(id => nodeMap.get(id)?.type === 'PIPE_REG');
  let type;
  if (!hasPipe)                              type = 'LOOP';
  else if (STATEFUL_TYPES.has(src?.type))    type = 'RAW';
  else if (STATEFUL_TYPES.has(dst?.type))    type = 'WAR';
  else                                       type = 'RAW';   // latched cycle, no stateful endpoint \u2014 still a flow feedback
  return {
    type,
    wireId: wire.id,
    srcId:  wire.sourceId,
    dstId:  wire.targetId,
    srcStage: src?.stage ?? null,
    dstStage: dst?.stage ?? null,
    cyclePath,
    suggestion: SUGGESTIONS[type],
  };
}
