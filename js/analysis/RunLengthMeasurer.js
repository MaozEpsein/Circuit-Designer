/**
 * RunLengthMeasurer — actually runs the simulation and reports how many
 * clock cycles the circuit took to terminate. Complements
 * `RunLengthEstimator` (which guesses statically).
 *
 * Use cases:
 *   - Ground-truth verification of the estimator's heuristic.
 *   - Profiling CPU demos ("how many cycles does mips-gcd really take?").
 *   - Regression tests that assert a fixed runtime.
 *
 * This is costly for large circuits or long runs — it is NOT intended to
 * be called on every UI interaction. For UI budgeting use the estimator.
 *
 * Termination modes (`terminate` option):
 *   'halt'            — stop when a HALT signal asserts (CU.halt output, or
 *                       any node whose label is "HALT" and value becomes 1).
 *   'stable-outputs'  — stop when every OUTPUT holds the same value for
 *                       `stableWindow` consecutive cycles.
 *   'stable-state'    — stop when OUTPUTS *and* every FF state are both
 *                       stable for `stableWindow` cycles.
 *   'any'             — first of the above (default).
 *
 * Returned shape:
 *   {
 *     cycles:       number,       // measured cycle count
 *     terminated:   boolean,      // false → hit maxCycles before terminating
 *     reason:       'halt-signal' | 'stable-outputs' | 'stable-state' |
 *                    'max-cycles' | 'no-clock',
 *     timeMs:       number,       // wall-clock time spent simulating
 *     finalOutputs: { [nodeId]: number },
 *     haltNode:     string | null,  // id of the node that asserted HALT
 *   }
 */
import { evaluate } from '../engine/SimulationEngine.js';

const DEFAULT_OPTS = {
  maxCycles:    10000,
  terminate:   'any',
  stableWindow:    3,
  inputs:       null,     // null ⇒ leave fixedValue / value as-is
};

export function measureRunLength(sceneIn, optsIn = {}) {
  const opts = { ...DEFAULT_OPTS, ...optsIn };
  const scene = _deepClone(sceneIn);
  const t0 = _now();

  const clk = scene.nodes.find(n => n.type === 'CLOCK');
  if (!clk) {
    return {
      cycles: 0, terminated: true, reason: 'no-clock',
      timeMs: _now() - t0, finalOutputs: {}, haltNode: null,
    };
  }

  // Apply any fixed-input overrides from the caller.
  if (opts.inputs) {
    for (const n of scene.nodes) {
      if (n.type === 'INPUT' && opts.inputs[n.id] !== undefined) {
        n.fixedValue = opts.inputs[n.id];
      }
    }
  }

  const outputs = scene.nodes.filter(n => n.type === 'OUTPUT');
  const modes = _resolveModes(opts.terminate);

  const ff = new Map();
  let rFall = null;
  const outputHistory = [];   // last `stableWindow` snapshots of OUTPUT values

  // Ensure the first rising edge produces a transition.
  clk.value = 0;

  for (let cycle = 1; cycle <= opts.maxCycles; cycle++) {
    // Rising edge — FFs capture.
    clk.value = 1;
    evaluate(scene.nodes, scene.wires, ff, cycle * 2 - 1);
    // Falling edge — stable read point.
    clk.value = 0;
    rFall = evaluate(scene.nodes, scene.wires, ff, cycle * 2);

    // Halt detection runs first — cheap, most common termination.
    if (modes.halt) {
      const halt = _detectHalt(scene.nodes, rFall.nodeValues);
      if (halt) {
        return _finish(t0, cycle, true, 'halt-signal', outputs, rFall, halt.nodeId);
      }
    }

    // Output-stability window — meaningless without at least one OUTPUT,
    // so we skip it in that case (otherwise an empty comparison always
    // reads as "stable" and fires after `stableWindow` cycles).
    if ((modes.stableOutputs || modes.stableState) && outputs.length > 0) {
      const snapshot = outputs.map(o => rFall.nodeValues.get(o.id) ?? null);
      outputHistory.push(snapshot);
      if (outputHistory.length > opts.stableWindow) outputHistory.shift();

      if (outputHistory.length === opts.stableWindow) {
        const outputsStable = _allEqual(outputHistory);
        if (modes.stableOutputs && outputsStable) {
          return _finish(t0, cycle, true, 'stable-outputs', outputs, rFall, null);
        }
        if (modes.stableState && outputsStable && !rFall.ffUpdated) {
          // `ffUpdated` is only true on the cycle FFs changed; a stable
          // window of false means the sequential state has frozen too.
          return _finish(t0, cycle, true, 'stable-state', outputs, rFall, null);
        }
      }
    }
  }

  return _finish(t0, opts.maxCycles, false, 'max-cycles', outputs, rFall, null);
}

function _resolveModes(mode) {
  switch (mode) {
    case 'halt':            return { halt: true,  stableOutputs: false, stableState: false };
    case 'stable-outputs':  return { halt: false, stableOutputs: true,  stableState: false };
    case 'stable-state':    return { halt: false, stableOutputs: false, stableState: true  };
    case 'any':
    default:                return { halt: true,  stableOutputs: true,  stableState: false };
  }
}

function _detectHalt(nodes, nodeValues) {
  for (const n of nodes) {
    // CU's port 5 is the halt output, per SimulationEngine's convention.
    if (n.type === 'CU') {
      const v = nodeValues.get(n.id + '__out5');
      if (v === 1) return { nodeId: n.id, reason: 'CU halt output' };
    }
    // MBIST_CONTROLLER terminates on DONE (out0) or FAIL (out2).
    if (n.type === 'MBIST_CONTROLLER') {
      const done = nodeValues.get(n.id);
      const fail = nodeValues.get(n.id + '__out2');
      if (done === 1) return { nodeId: n.id, reason: fail === 1 ? 'MBIST FAIL' : 'MBIST DONE' };
    }
    // Any node whose label is "HALT" (common on CPU demos).
    if ((n.label || '').toUpperCase() === 'HALT') {
      const v = nodeValues.get(n.id);
      if (v === 1) return { nodeId: n.id, reason: `'${n.label}' signal` };
    }
  }
  return null;
}

function _allEqual(arrays) {
  if (arrays.length < 2) return true;
  const first = arrays[0];
  for (let i = 1; i < arrays.length; i++) {
    if (arrays[i].length !== first.length) return false;
    for (let j = 0; j < first.length; j++) {
      if (arrays[i][j] !== first[j]) return false;
    }
  }
  return true;
}

function _finish(t0, cycles, terminated, reason, outputs, lastResult, haltNode) {
  const finalOutputs = {};
  for (const o of outputs) finalOutputs[o.id] = lastResult?.nodeValues.get(o.id) ?? null;
  return {
    cycles, terminated, reason,
    timeMs: _now() - t0,
    finalOutputs, haltNode,
  };
}

function _now() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function _deepClone(scene) {
  return {
    nodes: (scene.nodes || []).map(n => JSON.parse(JSON.stringify(n))),
    wires: (scene.wires || []).map(w => JSON.parse(JSON.stringify(w))),
  };
}
