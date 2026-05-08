// Layer 2 — combinational fault simulator.
//
// Verifies the simulator's contract: golden output computation,
// per-fault detection map, coverage percentage.
//
// Scene under test: a 3-input AND-OR network.
//   Y = (A & B) | C
//
//   A ─┐
//      AND1 ─┐
//   B ─┘     OR ── Y
//   C ───────┘
//
// Run:  node examples/tests/test-dft-fault-simulator.mjs

import { createComponent, createWire } from '../../js/components/Component.js';
import { simulateFaults } from '../../js/dft/FaultSimulator.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('\n-- DFT fault simulator --');

function buildScene() {
  const inA  = { ...createComponent('INPUT',     -200, -80), id: 'in_a', fixedValue: 0 };
  const inB  = { ...createComponent('INPUT',     -200,   0), id: 'in_b', fixedValue: 0 };
  const inC  = { ...createComponent('INPUT',     -200,  80), id: 'in_c', fixedValue: 0 };
  const and1 = { ...createComponent('GATE_SLOT',  -50, -40), id: 'and1', gate: 'AND' };
  const or1  = { ...createComponent('GATE_SLOT',  100,   0), id: 'or1',  gate: 'OR'  };
  const out  = { ...createComponent('OUTPUT',     250,   0), id: 'out_y' };
  const w_a  = { ...createWire('in_a', 'and1', 0), id: 'w_a' };
  const w_b  = { ...createWire('in_b', 'and1', 1), id: 'w_b' };
  const w_c  = { ...createWire('in_c', 'or1',  1), id: 'w_c' };
  const w_q  = { ...createWire('and1', 'or1',  0), id: 'w_q' };
  const w_o  = { ...createWire('or1',  'out_y', 0), id: 'w_o' };
  return {
    nodes: [inA, inB, inC, and1, or1, out],
    wires: [w_a, w_b, w_c, w_q, w_o],
  };
}

// ── 1. Golden values match Y = (A&B)|C ────────────────────────
{
  const s = buildScene();
  // Single all-zeros vector — only goal is to verify golden capture.
  const r = simulateFaults(s.nodes, s.wires, [[0, 0, 0]], { models: ['stuck-at-0'] });
  check('primary inputs ordered by id (a,b,c)',
    r.primaryInputs.map(n => n.id).join(',') === 'in_a,in_b,in_c');
  check('one primary output (out_y)',
    r.primaryOutputs.length === 1 && r.primaryOutputs[0].id === 'out_y');
  check('golden[0] = [0]', r.golden[0][0] === 0);
}

// ── 2. Full vector set hitting Y = (A&B)|C truth table ────────
{
  const s = buildScene();
  // 4 vectors covering enough corners to detect most s-a faults.
  // (A,B,C):
  //   v0: 0,0,0  → Y=0
  //   v1: 1,1,0  → Y=1
  //   v2: 0,0,1  → Y=1
  //   v3: 1,0,0  → Y=0
  const vectors = [
    [0, 0, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 0],
  ];
  const r = simulateFaults(s.nodes, s.wires, vectors, { models: ['stuck-at-0', 'stuck-at-1'] });

  check('golden values match (A&B)|C truth table',
    r.golden[0][0] === 0 && r.golden[1][0] === 1 &&
    r.golden[2][0] === 1 && r.golden[3][0] === 0);

  // 5 wires × 2 stuck-at = 10 faults total
  check('10 fault candidates enumerated', r.perFault.length === 10);

  // Coverage should be high — pick a few specific faults:
  //   w_c/sa0  → masks v2 (A=0,B=0,C=1) → forces Y=0 instead of 1 → DETECTED by v2
  //   w_c/sa1  → makes v0 (0,0,0) Y=1 instead of 0 → DETECTED by v0
  //   w_q/sa1  → forces (A&B) path to 1 → in v0 Y becomes 1 instead of 0 → DETECTED
  //   w_q/sa0  → forces AND output to 0 → v1 (1,1,0) Y becomes 0 instead of 1 → DETECTED
  const find = id => r.perFault.find(f => f.id === id);
  check('w_c/sa0 detected', find('w_c/sa0').detected);
  check('w_c/sa1 detected', find('w_c/sa1').detected);
  check('w_q/sa0 detected', find('w_q/sa0').detected);
  check('w_q/sa1 detected', find('w_q/sa1').detected);

  // Coverage object
  check('coverage.total = 10', r.coverage.total === 10);
  check('coverage.detected ≥ 7 (good vector set)',
    r.coverage.detected >= 7, `got ${r.coverage.detected}`);
  check('coverage.percent reflects detected/total',
    r.coverage.percent === Math.round(r.coverage.detected / r.coverage.total * 100));
}

// ── 3. Empty vector set ⇒ 0% coverage ─────────────────────────
{
  const s = buildScene();
  const r = simulateFaults(s.nodes, s.wires, [], { models: ['stuck-at-0', 'stuck-at-1'] });
  check('no vectors ⇒ 0 detected', r.coverage.detected === 0);
  check('no vectors ⇒ all faults still enumerated', r.coverage.total === 10);
}

// ── 4. Pre-existing injected fault is restored after sim ──────
{
  const s = buildScene();
  s.wires.find(w => w.id === 'w_q').stuckAt = 1;          // pre-inject
  const before = s.wires.find(w => w.id === 'w_q').stuckAt;
  simulateFaults(s.nodes, s.wires, [[0, 0, 0]], {});
  const after = s.wires.find(w => w.id === 'w_q').stuckAt;
  check('pre-existing fault state restored after sim',
    before === 1 && after === 1, `before=${before}, after=${after}`);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
