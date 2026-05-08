// Layer 1 — DFT stuck-at fault injection on wires.
//
// Verifies the engine-side contract:
//   1. createWire defaults stuckAt = null (no fault).
//   2. A wire with stuckAt = 1 forces its propagated value to 1
//      regardless of the upstream source's actual output.
//   3. A wire with stuckAt = 0 forces its propagated value to 0.
//   4. Removing the fault (stuckAt = null) restores normal propagation.
//
// Scene under test: A AND B → OR ← C AND D → OUT. Inject the fault on
// the AND1→OR wire and assert OR collapses to the stuck value.
//
// Run:  node examples/tests/test-dft-stuckat-faults.mjs

import { createComponent, createWire } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('\n-- DFT stuck-at faults --');

// ── 1. createWire default ────────────────────────────────────
{
  const w = createWire('a', 'b');
  check('createWire defaults stuckAt = null', w.stuckAt === null);

  const w2 = createWire('a', 'b', 0, 0, { stuckAt: 1 });
  check('createWire honours opts.stuckAt = 1', w2.stuckAt === 1);

  const w3 = createWire('a', 'b', 0, 0, { stuckAt: 0 });
  check('createWire honours opts.stuckAt = 0', w3.stuckAt === 0);
}

// ── 2. Engine override ───────────────────────────────────────
function buildScene(stuckAtOnQ1) {
  const inA  = { ...createComponent('INPUT',  -260, -120), id: 'in_a', fixedValue: 0 };
  const inB  = { ...createComponent('INPUT',  -260,  -50), id: 'in_b', fixedValue: 0 };
  const inC  = { ...createComponent('INPUT',  -260,   50), id: 'in_c', fixedValue: 0 };
  const inD  = { ...createComponent('INPUT',  -260,  120), id: 'in_d', fixedValue: 0 };
  const and1 = { ...createComponent('GATE_SLOT', -90, -85), id: 'and1', gate: 'AND' };
  const and2 = { ...createComponent('GATE_SLOT', -90,  85), id: 'and2', gate: 'AND' };
  const or1  = { ...createComponent('GATE_SLOT',  80,   0), id: 'or1',  gate: 'OR'  };
  const out  = { ...createComponent('OUTPUT',  240,    0), id: 'out_1' };

  const w_a  = { ...createWire('in_a', 'and1', 0), id: 'w_a' };
  const w_b  = { ...createWire('in_b', 'and1', 1), id: 'w_b' };
  const w_c  = { ...createWire('in_c', 'and2', 0), id: 'w_c' };
  const w_d  = { ...createWire('in_d', 'and2', 1), id: 'w_d' };
  const w_q1 = { ...createWire('and1', 'or1',  0, 0, { stuckAt: stuckAtOnQ1 }), id: 'w_q1' };
  const w_q2 = { ...createWire('and2', 'or1',  1), id: 'w_q2' };
  const w_o  = { ...createWire('or1',  'out_1', 0), id: 'w_o' };

  return {
    nodes: [inA, inB, inC, inD, and1, and2, or1, out],
    wires: [w_a, w_b, w_c, w_d, w_q1, w_q2, w_o],
  };
}

// Baseline: no fault. With all inputs 0, OR output is 0.
{
  const s = buildScene(null);
  const r = evaluate(s.nodes, s.wires, new Map(), 0);
  const wq1 = r.wireValues.get('w_q1');
  const wo  = r.wireValues.get('w_o');
  check('baseline: w_q1 = 0 (AND of two zeros)', wq1 === 0, `got ${wq1}`);
  check('baseline: w_o  = 0 (OR of two zeros)',  wo  === 0, `got ${wo}`);
}

// Stuck-at-1 on w_q1: OR collapses to 1 even though both ANDs output 0.
{
  const s = buildScene(1);
  const r = evaluate(s.nodes, s.wires, new Map(), 0);
  const wq1 = r.wireValues.get('w_q1');
  const wo  = r.wireValues.get('w_o');
  check('s-a-1 on w_q1: w_q1 forced to 1',  wq1 === 1, `got ${wq1}`);
  check('s-a-1 on w_q1: OR output also 1',  wo  === 1, `got ${wo}`);
}

// Stuck-at-0 on w_q1 — set both inputs of AND1 high so it would normally
// drive 1; the fault forces it to 0, and the OR reflects only AND2 (still 0).
{
  const s = buildScene(0);
  s.nodes.find(n => n.id === 'in_a').fixedValue = 1;
  s.nodes.find(n => n.id === 'in_b').fixedValue = 1;
  const r = evaluate(s.nodes, s.wires, new Map(), 0);
  const wq1 = r.wireValues.get('w_q1');
  const wo  = r.wireValues.get('w_o');
  check('s-a-0 on w_q1 with A=B=1: w_q1 forced to 0', wq1 === 0, `got ${wq1}`);
  check('s-a-0 on w_q1: OR output also 0',            wo  === 0, `got ${wo}`);
}

// Removing the fault (stuckAt = null) restores normal propagation.
{
  const s = buildScene(null);
  s.nodes.find(n => n.id === 'in_a').fixedValue = 1;
  s.nodes.find(n => n.id === 'in_b').fixedValue = 1;
  const r = evaluate(s.nodes, s.wires, new Map(), 0);
  const wq1 = r.wireValues.get('w_q1');
  const wo  = r.wireValues.get('w_o');
  check('fault removed: w_q1 propagates AND result = 1', wq1 === 1, `got ${wq1}`);
  check('fault removed: w_o  reflects OR = 1',           wo  === 1, `got ${wo}`);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
