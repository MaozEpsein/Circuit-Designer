/**
 * RetimeVerifier — differential simulation check for a retime proposal.
 *
 * Takes two scene snapshots (before / after the proposed move), runs both
 * through the simulation engine with the same driven inputs for N cycles,
 * and asserts every OUTPUT node carries identical values on every non-warmup
 * cycle.
 *
 * Why this is correct under v1's single-move retime:
 *   Moving a PIPE_REG across one combinational node preserves the register
 *   count on every input→output path, so output latency is identical.
 *   Cycle-aligned comparison is therefore sufficient — no offset alignment
 *   is required (Leiserson–Saxe's general case does need it; Phase 10b will
 *   revisit when that lands).
 *
 * Returns `{ ok: true }` on a clean diff, or `{ ok: false, reason }` with
 * the first divergence captured. The caller (accept handler in app.js)
 * uses this result to decide whether to commit or revert the retime.
 */
import { evaluate } from '../engine/SimulationEngine.js';
import { estimateRunLength } from '../analysis/RunLengthEstimator.js';

/**
 * Defaults used when the caller asks for an *explicit* budget
 * (`{ budget: 'fixed' }` or passes specific cycle/vector counts).
 */
const DEFAULT_OPTS = {
  budget:         'auto',   // 'auto' → size-aware; 'fixed' → use the numbers below.
  vectorCount:     6,
  warmupCycles:    3,
  runCycles:      12,
  seed:         0xABCD,
  /* Auto-mode knobs: */
  targetMs:      500,       // wall-clock budget we try not to exceed.
  maxRunCycles: 1000,       // hard cap even if the budget allows more.
  minRunCycles:   12,       // floor — never go below this.
  minVectors:      6,
};

/**
 * Compute an adaptive verification budget for this scene.
 * Strategy:
 *   1. Warmup  = pipelineDepth + 1 (always enough to fill every register).
 *   2. Run-cycles floor = max(minRunCycles, pipelineDepth × 3) — covers
 *      several data batches flowing past the retimed boundary.
 *   3. Sample `evaluate()` cost once; derive how many extra run-cycles fit
 *      in the time budget without blowing past `targetMs`.
 *   4. Clamp to [floor, maxRunCycles]. Big circuits use the floor; small
 *      circuits pack in up to 1000 cycles of paranoia for free.
 *
 * Returns { warmupCycles, runCycles, vectorCount, sampleMs, pipelineDepth }.
 */
function _computeAutoBudget(sceneBefore, opts) {
  // 1. Single call to the RunLengthEstimator gives us both the pipeline
  //    depth (for warmup sizing) and an informed minimum number of
  //    compared cycles (longer programs get more coverage automatically).
  const estimate      = estimateRunLength(sceneBefore);
  const pipelineDepth = Math.max(1, estimate.pipelineDepth || 1);

  // Correctness floors:
  //   warmup ≥ depth + 1   → fill every register with real data before
  //                          measuring, flushing any initial-state bias.
  //   runCycles ≥ estimate × 1.2 → run the estimator's predicted length
  //                          plus a 20 % safety margin, so any bug that
  //                          surfaces a few cycles past the expected
  //                          termination point is still caught. The
  //                          estimator itself already enforces a floor
  //                          of ~6 cycles, so short demos still get
  //                          enough coverage.
  const warmupCycles  = Math.max(3, pipelineDepth + 1);
  const VERIFY_MARGIN = 1.2;
  const estWithMargin = Math.ceil(estimate.cycles * VERIFY_MARGIN);
  const minRun        = Math.max(opts.minRunCycles, estWithMargin);
  const vectorCount   = opts.minVectors;

  // 2. Sample — five back-to-back evaluate() calls, take the median to damp
  // JIT warm-up. These calls mutate a local ffStates Map, same as the real
  // run, so the per-call cost is representative.
  const samples = [];
  const ff = new Map();
  for (let i = 0; i < 5; i++) {
    const t = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    evaluate(sceneBefore.nodes, sceneBefore.wires, ff, i);
    const dt = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t;
    samples.push(Math.max(0.01, dt));
  }
  samples.sort((a, b) => a - b);
  const sampleMs = samples[2];  // median of 5

  // Per-compared-cycle cost: 2 edges × 2 scenes × sampleMs.
  const perCycleMs = sampleMs * 4;
  // Fixed cost regardless of runCycles: warmup on both scenes for every vector.
  const warmupMs   = perCycleMs * warmupCycles * vectorCount;
  // Remaining budget for the comparison window:
  const headroom   = Math.max(0, opts.targetMs - warmupMs);
  const fittedRun  = Math.floor(headroom / (perCycleMs * vectorCount));
  const runCycles  = Math.max(minRun, Math.min(opts.maxRunCycles, fittedRun || minRun));

  return {
    warmupCycles, runCycles, vectorCount, sampleMs, pipelineDepth,
    estimate: {
      cycles:     estimate.cycles,
      confidence: estimate.confidence,
      reason:     estimate.reason,
      sources:    estimate.sources,
    },
  };
}

export function verifyRetiming(sceneBefore, sceneAfter, optsIn = {}) {
  const opts = { ...DEFAULT_OPTS, ...optsIn };
  // If the caller didn't explicitly set runCycles / vectorCount and opts.budget
  // is 'auto', size the budget from the scene itself. Explicit overrides
  // (e.g. the test harness, Deep Verify button) bypass this path.
  const explicit = optsIn.runCycles != null || optsIn.vectorCount != null || opts.budget === 'fixed';
  let budgetInfo = null;
  if (!explicit) {
    budgetInfo = _computeAutoBudget(sceneBefore, opts);
    opts.warmupCycles = budgetInfo.warmupCycles;
    opts.runCycles    = budgetInfo.runCycles;
    opts.vectorCount  = budgetInfo.vectorCount;
  }

  // Deep clone — the engine and our test drivers mutate node.value / fixedValue
  // and write `stage` fields onto nodes. We want both scenes fully isolated.
  const sb = _deepClone(sceneBefore);
  const sa = _deepClone(sceneAfter);

  const inputsB  = sb.nodes.filter(n => n.type === 'INPUT');
  const inputsA  = sa.nodes.filter(n => n.type === 'INPUT');
  const outputsB = sb.nodes.filter(n => n.type === 'OUTPUT');
  const outputsA = sa.nodes.filter(n => n.type === 'OUTPUT');
  const clkB     = sb.nodes.find(n => n.type === 'CLOCK');
  const clkA     = sa.nodes.find(n => n.type === 'CLOCK');

  if (!clkB || !clkA) {
    // No clock in the scene — retiming is still topologically valid but we
    // have nothing to simulate. Trust the static check done by Retimer.
    return { ok: true, reason: 'no clock' };
  }
  if (inputsB.length !== inputsA.length || outputsB.length !== outputsA.length) {
    return { ok: false, reason: 'scene shape changed (input/output counts differ)' };
  }

  // Sort inputs/outputs by id so the two scenes are compared position-by-position.
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  inputsB.sort(byId);  inputsA.sort(byId);
  outputsB.sort(byId); outputsA.sort(byId);

  const rng = _xorshift(opts.seed);

  for (let v = 0; v < opts.vectorCount; v++) {
    // Fresh FF state per vector — each vector simulates an independent run.
    const ffB = new Map();
    const ffA = new Map();
    // Reset clock to 0.
    clkB.value = 0; clkA.value = 0;

    let step = 0;
    for (let c = 0; c < opts.warmupCycles + opts.runCycles; c++) {
      // Re-randomise inputs every cycle so the retime move is exercised
      // across a broad slice of input space, not just constant values.
      for (let i = 0; i < inputsB.length; i++) {
        const bits = inputsB[i].bitWidth || 1;
        const val  = rng() & ((bits >= 32) ? 0xffffffff : ((1 << bits) - 1));
        inputsB[i].fixedValue = val;
        inputsA[i].fixedValue = val;
      }

      // Rising edge.
      clkB.value = 1; clkA.value = 1;
      evaluate(sb.nodes, sb.wires, ffB, step);
      evaluate(sa.nodes, sa.wires, ffA, step);
      step++;

      // Falling edge — this is when we read the stable outputs.
      clkB.value = 0; clkA.value = 0;
      const rB = evaluate(sb.nodes, sb.wires, ffB, step);
      const rA = evaluate(sa.nodes, sa.wires, ffA, step);
      step++;

      if (c < opts.warmupCycles) continue;

      // Compare outputs cycle-by-cycle.
      for (let i = 0; i < outputsB.length; i++) {
        const idB = outputsB[i].id;
        const idA = outputsA[i].id;
        const vB  = rB.nodeValues.get(idB);
        const vA  = rA.nodeValues.get(idA);
        if (vB !== vA) {
          const label = outputsB[i].label || outputsB[i].id;
          return {
            ok: false,
            reason: `output '${label}' mismatch at vector #${v} cycle ${c}: ${vB} vs ${vA}`,
            vector: v, cycle: c, output: label, before: vB, after: vA,
            budget: {
              runCycles:   opts.runCycles,
              vectorCount: opts.vectorCount,
              warmupCycles: opts.warmupCycles,
              mode:        explicit ? 'fixed' : 'auto',
            },
          };
        }
      }
    }
  }

  return {
    ok: true,
    budget: {
      runCycles:     opts.runCycles,
      vectorCount:   opts.vectorCount,
      warmupCycles:  opts.warmupCycles,
      sampleMs:      budgetInfo?.sampleMs      ?? null,
      pipelineDepth: budgetInfo?.pipelineDepth ?? null,
      estimate:      budgetInfo?.estimate      ?? null,
      mode:          explicit ? 'fixed' : 'auto',
    },
  };
}

function _deepClone(scene) {
  // Scenes are JSON-serialisable in the retime path (simple nodes + wires),
  // so the cheap route is correct and keeps us independent of SceneGraph.
  return {
    nodes: scene.nodes.map(n => JSON.parse(JSON.stringify(n))),
    wires: scene.wires.map(w => JSON.parse(JSON.stringify(w))),
  };
}

function _xorshift(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    return s;
  };
}
