/**
 * Retimer — greedy single-move retiming suggestion (Phase 10a).
 *
 * Explores every PIPE_REG in the scene and, for each, tries to push it
 * across the single combinational node adjacent to its data input
 * (backward) or data output (forward). The evaluator re-runs on the
 * trial graph; the move with the biggest drop in `maxDelayPs` wins.
 *
 * Scope of v1 (ship-then-improve):
 *   - PIPE_REGs with `channels === 1` (single data lane).
 *   - Adjacent combinational node must have exactly one data input AND
 *     exactly one data-output consumer. This rules out multi-input gates
 *     (AND/OR/XOR with 2+ inputs) and fan-out nodes; full Leiserson–Saxe
 *     (Phase 10b) will generalise by duplicating PIPEs across inputs.
 *   - STALL / FLUSH / CLK wires on the PIPE are preserved as-is.
 *
 * Returned proposal shape:
 *   {
 *     pipeId, direction: 'backward'|'forward', pastNodeId, pastNodeLabel,
 *     description, wireEdits: { remove: wireId[], add: Wire[] },
 *     before: { maxDelayPs, cycles, bottleneck },
 *     after:  { maxDelayPs, cycles, bottleneck },
 *     improvementPs,
 *   }
 * or null when nothing improves.
 */
import { evaluate } from './StageEvaluator.js';

/** Nodes we'll retime across — pure combinational computation only. */
const COMB_RETIMABLE_TYPES = new Set([
  'GATE_SLOT', 'HALF_ADDER', 'FULL_ADDER', 'COMPARATOR',
  'MUX', 'DEMUX', 'DECODER', 'ENCODER', 'BUS_MUX',
  'SIGN_EXT', 'SPLIT', 'MERGE', 'ALU',
]);

export function suggestRetime(scene) {
  const base = evaluate(scene);
  if (base.cycles < 2 || base.bottleneck < 0) return null;

  let best = null;
  for (const node of scene.nodes) {
    if (node.type !== 'PIPE_REG') continue;
    if ((node.channels ?? 1) !== 1) continue;

    for (const direction of ['backward', 'forward']) {
      const prop = _trialMove(scene, node, direction, base);
      if (!prop) continue;
      if (!best || prop.improvementPs > best.improvementPs) best = prop;
    }
  }
  return best;
}

/** Compose a trial proposal for one PIPE + direction, or null if invalid / no improvement. */
function _trialMove(scene, pipe, direction, base) {
  const move = _planMove(scene, pipe, direction);
  if (!move) return null;
  const trial = _applyMove(scene, move);
  if (!trial) return null;
  const res = evaluate(trial);
  if (res.hasCycle) return null;
  if ((res.violations?.length || 0) > (base.violations?.length || 0)) return null;
  const improvementPs = base.maxDelayPs - res.maxDelayPs;
  if (improvementPs <= 0) return null;

  // Swap canvas positions of PIPE and the node it just crossed — keeps the
  // schematic readable after retiming (PIPE visually takes the node's slot,
  // the node shifts into PIPE's old slot). Y is kept for each so a pipeline
  // laid out horizontally stays horizontal.
  const past = (scene.nodes || []).find(n => n.id === move.pastNodeId);
  const nodeEdits = (past && pipe.x != null && past.x != null) ? [
    { nodeId: pipe.id,        newX: past.x, newY: past.y ?? pipe.y ?? 0 },
    { nodeId: move.pastNodeId, newX: pipe.x, newY: pipe.y ?? past.y ?? 0 },
  ] : [];

  return {
    pipeId:        pipe.id,
    direction,
    pastNodeId:    move.pastNodeId,
    pastNodeLabel: move.pastNodeLabel,
    description:   move.description,
    wireEdits:     move.wireEdits,
    nodeEdits,
    before: { maxDelayPs: base.maxDelayPs, cycles: base.cycles, bottleneck: base.bottleneck },
    after:  { maxDelayPs: res.maxDelayPs,  cycles: res.cycles,  bottleneck: res.bottleneck },
    improvementPs,
  };
}

/**
 * Plan wire rewrites to push PIPE across one adjacent combinational node.
 * Returns { pastNodeId, pastNodeLabel, description, wireEdits } or null.
 */
function _planMove(scene, pipe, direction) {
  const nodes = scene.nodes;
  const wires = scene.wires || [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // PIPE's data input wire (into pin 0) and data output wires (out of pin 0).
  // STALL/FLUSH/CLK wires live on pins ch..ch+2 and are ignored here.
  const pipeDataIn = wires.find(w =>
    !w.isClockWire && w.targetId === pipe.id && w.targetInputIndex === 0);
  const pipeDataOuts = wires.filter(w =>
    !w.isClockWire && w.sourceId === pipe.id && (w.sourceOutputIndex ?? 0) === 0);
  if (!pipeDataIn || pipeDataOuts.length !== 1) return null;
  const pipeDataOut = pipeDataOuts[0];

  if (direction === 'backward') {
    // Pull PIPE across the node C feeding its input.
    const cId = pipeDataIn.sourceId;
    const c   = nodeMap.get(cId);
    if (!_isRetimableNode(c)) return null;
    const cIns  = wires.filter(w => !w.isClockWire && w.targetId === cId);
    const cOuts = wires.filter(w => !w.isClockWire && w.sourceId === cId);
    if (cIns.length !== 1)                                     return null;
    if (cOuts.length !== 1 || cOuts[0].id !== pipeDataIn.id)   return null;

    const feeder = cIns[0];               // S → C
    // New chain: S → PIPE → C → next   (next is pipeDataOut's target)
    return {
      pastNodeId:    cId,
      pastNodeLabel: c.label || c.id,
      description:   `Move ${pipe.label || pipe.id} backward across ${c.label || c.id}`,
      wireEdits: {
        remove: [feeder.id, pipeDataIn.id, pipeDataOut.id],
        add: [
          _wire(feeder.sourceId, feeder.sourceOutputIndex ?? 0, pipe.id, 0),
          _wire(pipe.id,   0,                               cId,   feeder.targetInputIndex),
          _wire(cId,       0,                               pipeDataOut.targetId, pipeDataOut.targetInputIndex),
        ],
      },
    };
  }

  if (direction === 'forward') {
    // Push PIPE across the node C consuming its output.
    const cId = pipeDataOut.targetId;
    const c   = nodeMap.get(cId);
    if (!_isRetimableNode(c)) return null;
    const cIns  = wires.filter(w => !w.isClockWire && w.targetId === cId);
    const cOuts = wires.filter(w => !w.isClockWire && w.sourceId === cId);
    if (cIns.length !== 1 || cIns[0].id !== pipeDataOut.id)    return null;
    if (cOuts.length !== 1)                                    return null;

    const consumer = cOuts[0];            // C → next
    const prevId   = pipeDataIn.sourceId;
    // New chain: prev → C → PIPE → next
    return {
      pastNodeId:    cId,
      pastNodeLabel: c.label || c.id,
      description:   `Move ${pipe.label || pipe.id} forward across ${c.label || c.id}`,
      wireEdits: {
        remove: [pipeDataIn.id, pipeDataOut.id, consumer.id],
        add: [
          _wire(prevId, pipeDataIn.sourceOutputIndex ?? 0, cId,     pipeDataOut.targetInputIndex),
          _wire(cId,    0,                                 pipe.id, 0),
          _wire(pipe.id,0,                                 consumer.targetId, consumer.targetInputIndex),
        ],
      },
    };
  }

  return null;
}

function _isRetimableNode(n) {
  return !!n && COMB_RETIMABLE_TYPES.has(n.type);
}

/** Clone the scene shallowly and apply wire edits. */
function _applyMove(scene, move) {
  const nodes = (scene.nodes || []).map(n => ({ ...n }));
  let wires = (scene.wires || []).filter(w => !move.wireEdits.remove.includes(w.id));
  wires = wires.concat(move.wireEdits.add);
  return {
    nodes,
    wires,
    getNode: (id) => nodes.find(n => n.id === id),
  };
}

let _wireIdCounter = 0;
function _wire(sourceId, sourceOutputIndex, targetId, targetInputIndex) {
  return {
    id: `w_retime_${Date.now().toString(36)}_${++_wireIdCounter}`,
    sourceId,
    sourceOutputIndex,
    targetId,
    targetInputIndex,
    waypoints: [],
    netName: '',
    colorGroup: null,
    isClockWire: false,
  };
}
