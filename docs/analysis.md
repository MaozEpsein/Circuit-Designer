# Analysis Utilities — `js/analysis/`

Cross-cutting scene-level utilities that reason about a circuit *as a whole* — not about rendering, not about simulation timing, but about runtime behavior. Designed as shared infrastructure for any feature that needs to answer "how long does this run?" or "does it terminate?". Current consumers: `RetimeVerifier` (sizes its sim-diff budget); planned consumers: waveform auto-scroll, debug "Run to completion", HDL testbench length.

## `estimateRunLength(scene, opts?)` — static heuristic

Answers *"how many clock cycles will this circuit take to terminate, roughly?"* without running a simulation. Completes in 1–10 ms on any reasonable scene. Returns `{ cycles, confidence, reason, sources, isBounded, upperBound, pipelineDepth }`. Confidence tier dictates how much to trust the number.

Priority order of detection (first match wins):

1. **No clock** → `unknown`, 1 cycle.
2. **ROM + HALT instruction** → `high`, `haltPc + pipelineDepth + 1`.
3. **ROM + unconditional JMP back** → `medium`, `isBounded: false`.
4. **ROM without HALT** → `medium`, `maxPc + pipelineDepth + 1`.
5. **Pure combinational LOOP hazard** (no state element in cycle) → `high`, unbounded.
6. **RAW/WAR/WAW hazard whose cycle reaches an OUTPUT** → `medium`, unbounded.
7. **Naked COUNTER/PC** (no CLR/LOAD driver) → `high`, unbounded with `upperBound = 2^bitWidth`.
8. **COUNTER/PC with CLR wired** → `low`, pipeline-default with `upperBound`.
9. **Anything else** → `low`, `max(6, pipelineDepth + 3)`.

Opt-in `{ verify: true }` cross-checks against `measureRunLength` and upgrades the confidence to `verified` / `verified-diff`.

## `measureRunLength(scene, opts?)` — dynamic ground truth

Actually runs the simulation engine until a termination signal fires or `maxCycles` is reached. Cost scales with scene size × cycle count — typical CPU demos finish in tens of milliseconds; a 1000-node / 1000-cycle run takes about a minute. Not for UI hot paths; reserved for tests, profiling, and explicit "Run to completion" actions.

Termination modes:
- `'halt'` — CU halt output (`__out5` = 1) or any node labeled `"HALT"` asserting 1.
- `'stable-outputs'` — every OUTPUT holds the same value for `stableWindow` consecutive cycles.
- `'stable-state'` — outputs AND FF state both stable.
- `'any'` (default) — first of halt or stable-outputs.

Returns `{ cycles, terminated, reason, timeMs, finalOutputs, haltNode }`. Safe against infinite circuits via the `maxCycles` rail.

## Tests

- [examples/tests/test-analysis-run-length.mjs](../examples/tests/test-analysis-run-length.mjs) — 32 checks across every detection path.
- [examples/tests/test-analysis-run-length-measure.mjs](../examples/tests/test-analysis-run-length-measure.mjs) — 12 checks covering all termination modes + an estimator-vs-measurer agreement sanity check.
