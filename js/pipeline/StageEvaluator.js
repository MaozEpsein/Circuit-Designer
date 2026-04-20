/**
 * StageEvaluator — core levelization pass for pipelining.
 * Given a SceneGraph, assigns each node a `stage` index and computes
 * per-stage combinational depth. Cuts stages at PIPE_REG boundaries.
 *
 * Algorithm:
 *   1. Build DAG over data wires (skip clock wires).
 *   2. Topological sort (Kahn's).
 *   3. For each node: stage = max(pred.stage + (pred is PIPE_REG ? 1 : 0)).
 *      Sources (no predecessors) start at stage 0.
 *   4. Per-stage depth: combinational chain length from stage boundary.
 *      Only nodes in the same stage contribute; crossing a stage edge
 *      resets the depth counter at the receiving node.
 *
 * Bottleneck = stage with the largest depth.
 */

import { delayOf, isKnownType } from './DelayModel.js';

/** Types that don't contribute to combinational depth (clocked / boundary). */
const ZERO_DEPTH_TYPES = new Set(['PIPE_REG', 'CLOCK', 'INPUT', 'OUTPUT']);

export function evaluate(scene) {
  const nodes = scene.nodes;
  const wires = scene.wires.filter(w => !w.isClockWire);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const preds = new Map(nodes.map(n => [n.id, []]));
  const succs = new Map(nodes.map(n => [n.id, []]));
  for (const w of wires) {
    if (preds.has(w.targetId)) preds.get(w.targetId).push(w.sourceId);
    if (succs.has(w.sourceId)) succs.get(w.sourceId).push(w.targetId);
  }

  // Kahn's topological sort
  const inDeg = new Map();
  for (const n of nodes) inDeg.set(n.id, preds.get(n.id).length);
  const queue = [];
  for (const n of nodes) if (inDeg.get(n.id) === 0) queue.push(n.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const s of succs.get(id) || []) {
      inDeg.set(s, inDeg.get(s) - 1);
      if (inDeg.get(s) === 0) queue.push(s);
    }
  }
  const hasCycle = order.length !== nodes.length;

  // Stage assignment
  const stage = new Map();
  for (const id of order) {
    let s = 0;
    for (const p of preds.get(id)) {
      const pn = nodeMap.get(p);
      const bump = pn && pn.type === 'PIPE_REG' ? 1 : 0;
      s = Math.max(s, (stage.get(p) ?? 0) + bump);
    }
    stage.set(id, s);
  }
  // Nodes in cycles: default to stage 0, flagged via hasCycle
  for (const n of nodes) if (!stage.has(n.id)) stage.set(n.id, 0);

  // Per-node combinational depth (gate count) AND per-node accumulated delay
  // (picoseconds) within the current stage. Both track the longest same-stage
  // chain ending at this node. For critical-path recovery we also remember the
  // predecessor that contributed the max delay.
  const depth    = new Map();
  const delayPs  = new Map();
  const critPred = new Map();     // id → predecessor that won the delay max
  for (const id of order) {
    const n = nodeMap.get(id);
    const s = stage.get(id);
    let maxDepth = 0;
    let maxDelay = 0;
    let winner   = null;
    for (const p of preds.get(id)) {
      if (stage.get(p) !== s) continue;
      const pd = depth.get(p) ?? 0;
      if (pd > maxDepth) maxDepth = pd;
      const pde = delayPs.get(p) ?? 0;
      if (pde > maxDelay) { maxDelay = pde; winner = p; }
    }
    const combinational = !ZERO_DEPTH_TYPES.has(n.type);
    depth.set(id, combinational ? maxDepth + 1 : maxDepth);
    delayPs.set(id, maxDelay + delayOf(n));
    if (winner) critPred.set(id, winner);
  }

  // Write back metadata (derived field — analyzer owns it)
  for (const n of nodes) n.stage = stage.get(n.id) ?? null;

  // Detect stall/flush wires attached to each PIPE_REG.
  // Inputs: D0..Dch-1 (0..ch-1), STALL (ch), FLUSH (ch+1), CLK (ch+2).
  const pipeHasStall = new Map();   // nodeId → bool
  const pipeHasFlush = new Map();
  for (const w of (scene.wires || [])) {
    const dst = nodeMap.get(w.targetId);
    if (!dst || dst.type !== 'PIPE_REG') continue;
    const ch = dst.channels || 4;
    if (w.targetInputIndex === ch)     pipeHasStall.set(dst.id, true);
    if (w.targetInputIndex === ch + 1) pipeHasFlush.set(dst.id, true);
  }

  // Collect per-stage summary.
  const stageCount = nodes.length ? Math.max(0, ...stage.values()) + 1 : 0;
  const stages = [];
  for (let i = 0; i < stageCount; i++) {
    stages.push({ idx: i, nodes: [], depth: 0, delayPs: 0, criticalPath: [], hasStall: false, hasFlush: false });
  }
  // For each stage, find the node with the greatest accumulated delay — the
  // tail of the stage's critical path. Walk back via critPred to recover it.
  const stageTailByDelay = new Array(stageCount).fill(null);
  const stageTailDelay   = new Array(stageCount).fill(-1);
  for (const n of nodes) {
    const s = stage.get(n.id);
    if (s == null || s < 0) continue;
    stages[s].nodes.push(n.id);
    const d  = depth.get(n.id) ?? 0;
    const de = delayPs.get(n.id) ?? 0;
    if (d  > stages[s].depth)   stages[s].depth   = d;
    if (de > stages[s].delayPs) stages[s].delayPs = de;
    if (de > stageTailDelay[s]) { stageTailDelay[s] = de; stageTailByDelay[s] = n.id; }
    if (n.type === 'PIPE_REG') {
      if (pipeHasStall.get(n.id)) stages[s].hasStall = true;
      if (pipeHasFlush.get(n.id)) stages[s].hasFlush = true;
    }
  }
  // Walk back critPred chain for each stage tail to recover its critical path.
  for (let i = 0; i < stageCount; i++) {
    const path = [];
    let cur = stageTailByDelay[i];
    while (cur != null) {
      path.unshift(cur);
      cur = critPred.get(cur) ?? null;
    }
    stages[i].criticalPath = path;
  }

  let bottleneck = -1;
  for (let i = 0; i < stages.length; i++) {
    if (bottleneck < 0 || stages[i].delayPs > stages[bottleneck].delayPs) bottleneck = i;
  }

  // Violation detection.
  // A signal is legal in a given stage only if ALL of its consumers share the
  // same earliest stage, OR the source is a PIPE_REG (which explicitly latches
  // the signal forward). If the same signal is consumed in an earlier stage AND
  // a later stage without being latched, the later-stage wire is the violator —
  // it sees a value that is still "live" combinationally from the earlier use,
  // and its data is out of sync with anything that passed through the PIPE.
  const minConsumer = new Map();   // srcId → min stage among its consumers
  for (const w of wires) {
    const s = stage.get(w.targetId) ?? 0;
    const curr = minConsumer.get(w.sourceId);
    if (curr == null || s < curr) minConsumer.set(w.sourceId, s);
  }
  const violations = [];
  for (const w of wires) {
    const srcN = nodeMap.get(w.sourceId);
    if (!srcN || srcN.type === 'PIPE_REG') continue;
    const dstStage = stage.get(w.targetId) ?? 0;
    const minS = minConsumer.get(w.sourceId);
    if (minS != null && dstStage > minS) {
      violations.push({
        wireId: w.id,
        srcId: w.sourceId,
        dstId: w.targetId,
        srcStage: minS,
        dstStage,
        missing: dstStage - minS,
      });
    }
  }

  const maxDelayPs = stages.reduce((m, s) => Math.max(m, s.delayPs), 0);
  // f_max in MHz = 1 / (max stage delay in seconds) = 1e6 / delayPs
  const fMaxMHz = maxDelayPs > 0 ? (1e6 / maxDelayPs) : Infinity;

  // Collect component types that are missing from the delay table — designer
  // needs to add them to DelayModel.js or accept the 100 ps fallback.
  const unknownTypes = new Set();
  for (const n of nodes) if (!isKnownType(n.type)) unknownTypes.add(n.type);

  return {
    stages,
    cycles: stageCount,            // latency in clock cycles (stage count)
    bottleneck,                    // stage index with the largest delay
    hasCycle,                      // true if feedback loop detected
    violations,                    // cross-stage wires missing a PIPE_REG
    maxDelayPs,                    // worst stage delay (ps)
    fMaxMHz,                       // estimated f_max (MHz)
    unknownTypes: [...unknownTypes],   // component types without an explicit delay entry
  };
}
