/**
 * LipChecker — structural validation of Latency-Insensitive Protocol wiring.
 *
 * Checks applied per HANDSHAKE component:
 *   R1  unregistered-valid : HANDSHAKE.V (input 0) must trace back through
 *                            combinational-only nodes to a PIPE_REG or
 *                            another HANDSHAKE output. Raw combinational
 *                            valid (INPUT / gates) may glitch between
 *                            clock edges.
 *   R2  unregistered-ready : same rule for HANDSHAKE.R (input 1).
 *   R3  dangling-stall     : HANDSHAKE.S (output 0) must drive at least one
 *                            PIPE_REG's STALL pin (input index `channels`).
 *                            Without it the handshake has no back-pressure
 *                            effect — the stage advances regardless of R.
 *   R4  valid-to-ready-loop: there must be no combinational path from the
 *                            V-source subgraph to the R-source subgraph
 *                            going through this HANDSHAKE. That forms a
 *                            classic `ready = f(valid)` cycle and deadlocks.
 *
 * Violation shape:
 *   { rule, severity, hsId, message, nodeId?, wireId? }
 */

const STATEFUL_BOUNDARIES = new Set([
  'PIPE_REG', 'HANDSHAKE', 'REG_FILE', 'REG_FILE_DP',
  'PC', 'IR', 'COUNTER', 'RAM', 'ROM', 'CLOCK', 'CONSTANT',
]);

export function checkLip(scene) {
  const nodes = scene?.nodes || [];
  const wires = (scene?.wires || []).filter(w => !w.isClockWire);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const handshakes = nodes.filter(n => n.type === 'HANDSHAKE');
  if (handshakes.length === 0) return { violations: [], handshakeCount: 0 };

  // Predecessor / successor lookup over data wires.
  const preds = new Map(nodes.map(n => [n.id, []]));
  const succs = new Map(nodes.map(n => [n.id, []]));
  for (const w of wires) {
    if (preds.has(w.targetId)) preds.get(w.targetId).push(w);
    if (succs.has(w.sourceId)) succs.get(w.sourceId).push(w);
  }

  const violations = [];

  for (const hs of handshakes) {
    const ins = preds.get(hs.id) || [];
    const vWire = ins.find(w => w.targetInputIndex === 0);
    const rWire = ins.find(w => w.targetInputIndex === 1);

    // R1 / R2 — each input must resolve to a stateful producer.
    const vSrc = _traceToStateful(vWire?.sourceId, nodeMap, preds);
    const rSrc = _traceToStateful(rWire?.sourceId, nodeMap, preds);

    if (!vWire) {
      violations.push({ rule: 'disconnected-valid', severity: 'error', hsId: hs.id,
        message: `HANDSHAKE "${hs.label || hs.id}" has no V (valid) input wired` });
    } else if (!vSrc) {
      violations.push({ rule: 'unregistered-valid', severity: 'warn', hsId: hs.id,
        wireId: vWire.id,
        message: `V input not driven by a registered source — may glitch mid-cycle` });
    }

    if (!rWire) {
      violations.push({ rule: 'disconnected-ready', severity: 'error', hsId: hs.id,
        message: `HANDSHAKE "${hs.label || hs.id}" has no R (ready) input wired` });
    } else if (!rSrc) {
      violations.push({ rule: 'unregistered-ready', severity: 'warn', hsId: hs.id,
        wireId: rWire.id,
        message: `R input not driven by a registered source — may glitch mid-cycle` });
    }

    // R3 — HANDSHAKE.S (output 0) must reach a PIPE_REG STALL pin.
    const sOuts = (succs.get(hs.id) || []).filter(w => (w.sourceOutputIndex ?? 0) === 0);
    const stallTargets = sOuts.filter(w => {
      const n = nodeMap.get(w.targetId);
      if (!n || n.type !== 'PIPE_REG') return false;
      const ch = Number.isFinite(n.channels) ? n.channels : 1;
      return w.targetInputIndex === ch;
    });
    if (stallTargets.length === 0) {
      violations.push({ rule: 'dangling-stall', severity: 'error', hsId: hs.id,
        message: `HANDSHAKE.S not wired to any PIPE_REG STALL pin — back-pressure has no effect` });
    }

    // R4 — combinational cycle V → HS → R. The V-source subgraph (nodes
    // that combinationally feed V) must not overlap with the R-source
    // subgraph walked via reverse-BFS from R. If they share a non-stateful
    // node, the HS closes a ready-depends-on-valid loop.
    if (vWire && rWire) {
      const vAncestors = _combinationalAncestors(vWire.sourceId, nodeMap, preds);
      const rAncestors = _combinationalAncestors(rWire.sourceId, nodeMap, preds);
      const shared = [...vAncestors].find(id => rAncestors.has(id));
      if (shared) {
        violations.push({ rule: 'valid-to-ready-loop', severity: 'error', hsId: hs.id,
          nodeId: shared,
          message: `Combinational path links V and R via "${nodeMap.get(shared)?.label || shared}" — deadlock risk` });
      }
    }
  }

  return { violations, handshakeCount: handshakes.length };
}

/** Reverse-walk until reaching a stateful boundary; return that node id or null. */
function _traceToStateful(startId, nodeMap, preds, depth = 0) {
  if (!startId || depth > 64) return null;
  const n = nodeMap.get(startId);
  if (!n) return null;
  if (STATEFUL_BOUNDARIES.has(n.type)) return startId;
  for (const w of preds.get(startId) || []) {
    const hit = _traceToStateful(w.sourceId, nodeMap, preds, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Collect all combinational ancestor node ids, stopping at stateful boundaries. */
function _combinationalAncestors(startId, nodeMap, preds) {
  const out = new Set();
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop();
    if (!id || out.has(id)) continue;
    const n = nodeMap.get(id);
    if (!n) continue;
    out.add(id);
    if (STATEFUL_BOUNDARIES.has(n.type)) continue;   // boundary — don't cross
    for (const w of preds.get(id) || []) stack.push(w.sourceId);
  }
  return out;
}
