// Layer 6 — BIST Controller FSM.
//
// Verifies:
//   1. Type registration + factory defaults.
//   2. Reset semantics: RESET=1 forces state back to IDLE regardless of
//      where we were in the sequence.
//   3. Happy-path traversal: IDLE → SETUP → RUN×runLength → COMPARE →
//      DONE when sigIn matches goldenSig.
//   4. Fail-path traversal: same as above but COMPARE → FAIL when
//      sigIn ≠ goldenSig.
//   5. Terminal states (DONE / FAIL) are sticky — further clocks do
//      not move them.
//
// Pin layout in the engine:
//   START(0), RESET(1), SIG_IN(2), CLK(3)
// State encoding:
//   0 IDLE, 1 SETUP, 2 RUN, 3 COMPARE, 4 DONE, 5 FAIL
//
// Run:  node examples/tests/test-dft-bist-controller.mjs

import { COMPONENT_TYPES, MEMORY_TYPE_SET, createComponent, createWire } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

const IDLE = 0, SETUP = 1, RUN = 2, COMPARE = 3, DONE = 4, FAIL = 5;

console.log('\n-- DFT BIST Controller --');

// ── 1. Type + factory ────────────────────────────────────────
{
  check("COMPONENT_TYPES.BIST_CONTROLLER === 'BIST_CONTROLLER'", COMPONENT_TYPES.BIST_CONTROLLER === 'BIST_CONTROLLER');
  check('MEMORY_TYPE_SET contains BIST_CONTROLLER', MEMORY_TYPE_SET.has('BIST_CONTROLLER'));
  const n = createComponent('BIST_CONTROLLER', 0, 0);
  check('default sigBits = 4',    n.sigBits === 4);
  check('default runLength = 16', n.runLength === 16);
  check('default goldenSig = 0',  n.goldenSig === 0);
}

function buildScene({ runLength = 4, goldenSig = 0xA, sigBits = 4 } = {}) {
  const start = { ...createComponent('INPUT', -200,   0), id: 'start', fixedValue: 0 };
  const reset = { ...createComponent('INPUT', -200,  80), id: 'reset', fixedValue: 0 };
  const sig   = { ...createComponent('INPUT', -200, 160), id: 'sig',   fixedValue: 0 };
  const clk   = { ...createComponent('CLOCK', -200, 240), id: 'clk', value: 0 };
  const b     = { ...createComponent('BIST_CONTROLLER', 0, 0), id: 'b',
                  runLength, goldenSig, sigBits };
  return {
    nodes: [start, reset, sig, clk, b],
    wires: [
      { ...createWire('start', 'b', 0), id: 'ws' },
      { ...createWire('reset', 'b', 1), id: 'wr' },
      { ...createWire('sig',   'b', 2), id: 'wsig' },
      { ...createWire('clk',   'b', 3, 0, { isClockWire: true }), id: 'wc' },
    ],
  };
}

function set(s, id, v) { s.nodes.find(n => n.id === id).fixedValue = v; }
function tick(s, ff, step) {
  s.nodes.find(n => n.id === 'clk').value = 0;
  evaluate(s.nodes, s.wires, ff, step);
  s.nodes.find(n => n.id === 'clk').value = 1;
  evaluate(s.nodes, s.wires, ff, step + 1);
}
function state(ff) { return ff.get('b').bistState; }

// ── 2. RESET forces IDLE from arbitrary state ────────────────
{
  const s = buildScene();
  const ff = new Map();
  // Pulse START to leave IDLE.
  set(s, 'start', 1); tick(s, ff, 0);            // IDLE → SETUP
  set(s, 'start', 0); tick(s, ff, 2);            // SETUP → RUN
  check('left IDLE after START pulse + 1 clock', state(ff) === RUN,
    `state=${state(ff)}`);
  // Now assert RESET.
  set(s, 'reset', 1); tick(s, ff, 4);
  check('RESET=1 forces state back to IDLE', state(ff) === IDLE,
    `state=${state(ff)}`);
  set(s, 'reset', 0);
  // With START still low, we should stay in IDLE.
  tick(s, ff, 6);
  check('IDLE is stable while START=0', state(ff) === IDLE);
}

// ── 3. Happy path: full IDLE → DONE traversal ────────────────
{
  const runLength = 4;
  const goldenSig = 0xA;
  const s = buildScene({ runLength, goldenSig });
  const ff = new Map();

  set(s, 'start', 1); tick(s, ff, 0);
  check('IDLE → SETUP after START', state(ff) === SETUP, `state=${state(ff)}`);

  set(s, 'start', 0); tick(s, ff, 2);
  check('SETUP → RUN (1 cycle)', state(ff) === RUN, `state=${state(ff)}`);

  // Run for `runLength` cycles. After the LAST run cycle the FSM should
  // be in RUN with cycleCount===runLength, then the next clock moves to
  // COMPARE. The implementation transitions inside the RUN handler the
  // tick where cycleCount hits runLength, so we count carefully.
  for (let i = 0; i < runLength - 1; i++) {
    tick(s, ff, 4 + i * 2);
    check(`RUN holds at cycle ${i + 1}`, state(ff) === RUN, `state=${state(ff)}`);
  }
  // The `runLength`-th tick should advance to COMPARE.
  tick(s, ff, 4 + (runLength - 1) * 2);
  check('RUN → COMPARE after runLength cycles', state(ff) === COMPARE,
    `state=${state(ff)}, cycleCount=${ff.get('b').cycleCount}`);

  // Drive SIG_IN = goldenSig so the COMPARE step latches DONE.
  set(s, 'sig', goldenSig);
  tick(s, ff, 100);
  check('COMPARE → DONE when sigIn matches goldenSig', state(ff) === DONE,
    `state=${state(ff)}`);
}

// ── 4. Fail path: SIG_IN ≠ goldenSig → FAIL ──────────────────
{
  const runLength = 4;
  const goldenSig = 0xA;
  const s = buildScene({ runLength, goldenSig });
  const ff = new Map();

  set(s, 'start', 1); tick(s, ff, 0);    // IDLE → SETUP
  set(s, 'start', 0); tick(s, ff, 2);    // SETUP → RUN
  for (let i = 0; i < runLength; i++) tick(s, ff, 4 + i * 2);  // RUN → COMPARE
  check('reached COMPARE', state(ff) === COMPARE, `state=${state(ff)}`);

  // Drive a wrong signature.
  set(s, 'sig', goldenSig ^ 0b0001);
  tick(s, ff, 100);
  check('COMPARE → FAIL when sigIn diverges from goldenSig',
    state(ff) === FAIL, `state=${state(ff)}`);
}

// ── 5. Terminal states are sticky ────────────────────────────
{
  // Re-use happy-path setup; once in DONE further clocks must not move
  // the FSM (without RESET).
  const runLength = 2;
  const goldenSig = 0x5;
  const s = buildScene({ runLength, goldenSig });
  const ff = new Map();
  set(s, 'start', 1); tick(s, ff, 0);
  set(s, 'start', 0); tick(s, ff, 2);
  tick(s, ff, 4); tick(s, ff, 6);          // RUN x2 → COMPARE
  set(s, 'sig', goldenSig); tick(s, ff, 8); // COMPARE → DONE
  check('reached DONE', state(ff) === DONE);
  for (let i = 0; i < 5; i++) tick(s, ff, 10 + i * 2);
  check('DONE is sticky across 5 more clocks', state(ff) === DONE);

  // And the same property holds for FAIL.
  const s2 = buildScene({ runLength, goldenSig });
  const ff2 = new Map();
  set(s2, 'start', 1); tick(s2, ff2, 0);
  set(s2, 'start', 0); tick(s2, ff2, 2);
  tick(s2, ff2, 4); tick(s2, ff2, 6);
  set(s2, 'sig', goldenSig ^ 1); tick(s2, ff2, 8); // COMPARE → FAIL
  check('reached FAIL', state(ff2) === FAIL);
  for (let i = 0; i < 5; i++) tick(s2, ff2, 10 + i * 2);
  check('FAIL is sticky across 5 more clocks', state(ff2) === FAIL);
}

// ── 6. START pulse mid-run is ignored (no restart) ───────────
{
  const s = buildScene({ runLength: 8, goldenSig: 0x3 });
  const ff = new Map();
  set(s, 'start', 1); tick(s, ff, 0);          // IDLE → SETUP
  set(s, 'start', 0); tick(s, ff, 2);          // SETUP → RUN
  tick(s, ff, 4);                              // RUN, cycleCount=1
  const cycBefore = ff.get('b').cycleCount;
  // Re-pulse START while already running — must NOT reset the run.
  set(s, 'start', 1); tick(s, ff, 6);
  set(s, 'start', 0);
  check('mid-RUN START is ignored (state stays RUN)',
    state(ff) === RUN, `state=${state(ff)}`);
  check('mid-RUN START did not zero the cycle counter',
    ff.get('b').cycleCount > cycBefore,
    `before=${cycBefore}, after=${ff.get('b').cycleCount}`);
}

// ── 7. runLength = 1 — minimal RUN window ────────────────────
{
  const s = buildScene({ runLength: 1, goldenSig: 0x7 });
  const ff = new Map();
  set(s, 'start', 1); tick(s, ff, 0);          // IDLE → SETUP
  set(s, 'start', 0); tick(s, ff, 2);          // SETUP → RUN
  tick(s, ff, 4);                               // RUN (1 cycle) → COMPARE
  check('runLength=1 reaches COMPARE in one RUN tick',
    state(ff) === COMPARE, `state=${state(ff)}`);
  set(s, 'sig', 0x7); tick(s, ff, 6);
  check('runLength=1 settles into DONE on match', state(ff) === DONE);
}

// ── 8. Multi-bit signature comparison is byte-wide, not 1-bit ─
// A naïve `==` would still work but verify that sigBits actually
// masks the comparison rather than coincidence on bit 0.
{
  const s = buildScene({ runLength: 2, goldenSig: 0xA, sigBits: 4 });
  const ff = new Map();
  set(s, 'start', 1); tick(s, ff, 0);
  set(s, 'start', 0); tick(s, ff, 2);
  tick(s, ff, 4); tick(s, ff, 6);              // RUN ×2 → COMPARE
  // 0xA = 1010. Try sigIn=0x2 (0010) — matches on the low bit only,
  // so the comparator MUST fail.
  set(s, 'sig', 0x2); tick(s, ff, 8);
  check('partial low-bit match still triggers FAIL', state(ff) === FAIL,
    `state=${state(ff)}`);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
