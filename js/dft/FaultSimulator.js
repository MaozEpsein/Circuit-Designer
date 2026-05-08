// DFT Fault Simulator (combinational).
//
// Given a scene + a list of test vectors, the simulator iterates every
// candidate wire-level fault (every wire × {s-a-0, s-a-1, open}) and
// determines, for each fault, which vectors detect it (cause an OUTPUT
// value to differ from the fault-free "golden" run).
//
// Layer 2 keeps the model simple and combinational:
//   - Primary inputs: every INPUT node, ordered by id (deterministic).
//   - Primary outputs: every OUTPUT node, ordered by id.
//   - A vector is one assignment to ALL primary inputs (array of 0/1
//     of length N where N = primaryInputs.length).
//   - A fault is detected by a vector if any primary output disagrees
//     with the golden run for that vector.
//
// This skirts ATPG entirely — the user provides the vectors, we score
// them. Random / targeted vector generation lives in Layer 2.5.
//
// Designed to be extensible to future fault models (bridging,
// transition) without touching the loop structure: just lengthen the
// faultModelsFor(wire) generator.

import { evaluate } from '../engine/SimulationEngine.js';

/**
 * Enumerate the candidate faults for a single wire under the active
 * fault models. Layer 2 ships stuck-at-0, stuck-at-1, and open by
 * default. Bridging is excluded from auto-enumeration because it
 * requires a partner wire — only manually-injected bridges are scored.
 *
 * @param {object} wire
 * @param {string[]} models  e.g. ['stuck-at-0', 'stuck-at-1', 'open']
 * @returns {Array<{ id: string, kind: string, mutate: (w) => void }>}
 */
function faultsForWire(wire, models) {
  const out = [];
  for (const m of models) {
    if (m === 'stuck-at-0') out.push({ id: `${wire.id}/sa0`, kind: 'sa0', mutate: w => { w.stuckAt = 0; } });
    if (m === 'stuck-at-1') out.push({ id: `${wire.id}/sa1`, kind: 'sa1', mutate: w => { w.stuckAt = 1; } });
    if (m === 'open')       out.push({ id: `${wire.id}/open`, kind: 'open', mutate: w => { w.open = true; } });
  }
  return out;
}

/**
 * Run the fault simulator.
 *
 * @param {object[]} nodes
 * @param {object[]} wires
 * @param {number[][]} vectors          Each vector: [primaryInputs.length] of 0/1
 * @param {object} [opts]
 * @param {string[]} [opts.models]      Fault models to enumerate per wire.
 *                                       Default: ['stuck-at-0','stuck-at-1','open'].
 * @returns {{
 *   primaryInputs: object[],
 *   primaryOutputs: object[],
 *   golden: any[][],                  // per-vector array of OUTPUT values
 *   perFault: Array<{ id, wireId, kind, detected: boolean, detectedBy: number[] }>,
 *   coverage: { detected: number, total: number, percent: number },
 * }}
 */
export function simulateFaults(nodes, wires, vectors, opts = {}) {
  const models = opts.models || ['stuck-at-0', 'stuck-at-1', 'open'];

  const primaryInputs  = nodes.filter(n => n.type === 'INPUT' ).slice().sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const primaryOutputs = nodes.filter(n => n.type === 'OUTPUT').slice().sort((a, b) => (a.id || '').localeCompare(b.id || ''));

  // Apply a vector to the scene by mutating each primary input's
  // fixedValue. Returns a function that restores the original values.
  const applyVector = (vec) => {
    const restore = primaryInputs.map(n => ({ n, prev: n.fixedValue }));
    primaryInputs.forEach((n, i) => { n.fixedValue = vec[i] ?? 0; });
    return () => restore.forEach(({ n, prev }) => { n.fixedValue = prev; });
  };

  // Read primary output values after one evaluate(). The wire feeding an
  // OUTPUT node is what we observe — read its wireValue (which already
  // honours stuck-at via the engine chokepoint).
  const readOutputs = (result) => {
    return primaryOutputs.map(o => {
      const inboundWire = wires.find(w => w.targetId === o.id);
      if (!inboundWire) return null;
      return result.wireValues.get(inboundWire.id);
    });
  };

  // ── 1. Golden run: no faults, one entry per vector ───────────
  const golden = vectors.map(vec => {
    const restore = applyVector(vec);
    const r = evaluate(nodes, wires, new Map(), 0);
    const out = readOutputs(r);
    restore();
    return out;
  });

  // ── 2. Iterate every fault candidate, compare against golden ─
  const perFault = [];
  for (const w of wires) {
    for (const f of faultsForWire(w, models)) {
      // Snapshot original wire fault state so we can restore.
      const orig = { stuckAt: w.stuckAt ?? null, open: !!w.open };
      // Clear pre-existing injected fault on this wire so the test
      // candidate is the only fault active.
      w.stuckAt = null; w.open = false;
      f.mutate(w);

      const detectedBy = [];
      for (let vi = 0; vi < vectors.length; vi++) {
        const restore = applyVector(vectors[vi]);
        const r = evaluate(nodes, wires, new Map(), 0);
        const out = readOutputs(r);
        restore();
        // Compare to golden[vi] — any output position differing flags
        // this vector as a detector.
        for (let oi = 0; oi < out.length; oi++) {
          if (out[oi] !== golden[vi][oi]) { detectedBy.push(vi); break; }
        }
      }

      // Restore the wire's pre-test state.
      w.stuckAt = orig.stuckAt;
      w.open    = orig.open;

      perFault.push({
        id:         f.id,
        wireId:     w.id,
        kind:       f.kind,
        detected:   detectedBy.length > 0,
        detectedBy,
      });
    }
  }

  const detected = perFault.filter(f => f.detected).length;
  const total    = perFault.length;
  const percent  = total === 0 ? 100 : Math.round((detected / total) * 100);

  return {
    primaryInputs,
    primaryOutputs,
    golden,
    perFault,
    coverage: { detected, total, percent },
  };
}
