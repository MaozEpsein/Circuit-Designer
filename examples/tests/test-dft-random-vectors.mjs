// Layer 2.5 — random vector generator + sim integration.
//
// The generator itself is a one-liner inside DFTPanel, but the contract
// it must satisfy is testable in isolation:
//   1. produces N vectors of correct width (= number of primary inputs)
//   2. all entries are 0 or 1
//   3. the vectors run cleanly through simulateFaults and yield a
//      coverage % in [0, 100]
//   4. on a non-trivial scene, 100+ random vectors hit > 50 % coverage
//      (Probabilistic — chosen with a wide margin so it's not flaky.)
//
// Run:  node examples/tests/test-dft-random-vectors.mjs

import { createComponent, createWire } from '../../js/components/Component.js';
import { simulateFaults } from '../../js/dft/FaultSimulator.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('\n-- DFT random vector generator --');

// Mirror the generator implemented in DFTPanel._generateRandomVectors.
function genRandomVectors(N, primaryInputCount) {
  return Array.from({ length: N }, () =>
    Array.from({ length: primaryInputCount }, () => Math.random() < 0.5 ? 0 : 1)
  );
}

// Same scene as the Layer 2 test: Y = (A & B) | C.
function buildScene() {
  const inA  = { ...createComponent('INPUT',     -200, -80), id: 'in_a', fixedValue: 0 };
  const inB  = { ...createComponent('INPUT',     -200,   0), id: 'in_b', fixedValue: 0 };
  const inC  = { ...createComponent('INPUT',     -200,  80), id: 'in_c', fixedValue: 0 };
  const and1 = { ...createComponent('GATE_SLOT',  -50, -40), id: 'and1', gate: 'AND' };
  const or1  = { ...createComponent('GATE_SLOT',  100,   0), id: 'or1',  gate: 'OR'  };
  const out  = { ...createComponent('OUTPUT',     250,   0), id: 'out_y' };
  return {
    nodes: [inA, inB, inC, and1, or1, out],
    wires: [
      { ...createWire('in_a', 'and1', 0), id: 'w_a' },
      { ...createWire('in_b', 'and1', 1), id: 'w_b' },
      { ...createWire('in_c', 'or1',  1), id: 'w_c' },
      { ...createWire('and1', 'or1',  0), id: 'w_q' },
      { ...createWire('or1',  'out_y', 0), id: 'w_o' },
    ],
  };
}

// ── 1. Shape ─────────────────────────────────────────────────
{
  const v = genRandomVectors(16, 3);
  check('produces N=16 vectors',  v.length === 16);
  check('each vector has width 3', v.every(x => x.length === 3));
  check('all entries are 0 or 1', v.every(x => x.every(b => b === 0 || b === 1)));
}

// ── 2. Integration with simulateFaults ───────────────────────
{
  const s = buildScene();
  const v = genRandomVectors(16, 3);
  const r = simulateFaults(s.nodes, s.wires, v, { models: ['stuck-at-0', 'stuck-at-1'] });
  check('coverage object well-formed',
    typeof r.coverage.percent === 'number' &&
    r.coverage.detected >= 0 &&
    r.coverage.detected <= r.coverage.total);
  check('coverage % in [0, 100]',
    r.coverage.percent >= 0 && r.coverage.percent <= 100);
}

// ── 3. With many random vectors, coverage is materially > 0 ──
// 100 vectors over 3 inputs (8 unique combos) almost surely hits every
// combo many times. We expect > 50 %; failing this would mean the
// simulator is broken, not that random was unlucky.
{
  const s = buildScene();
  const v = genRandomVectors(100, 3);
  const r = simulateFaults(s.nodes, s.wires, v, { models: ['stuck-at-0', 'stuck-at-1'] });
  check('100 random vectors → coverage > 50 %',
    r.coverage.percent > 50, `got ${r.coverage.percent}%`);
}

// ── 4. Targeted vectors beat random on the same scene ────────
// The hand-crafted set from the Layer 2.5 demo achieves 100 % on the
// stuck-at + open universe. Random with the same vector count usually
// loses — we just assert targeted ≥ random, which holds robustly.
{
  const s = buildScene();
  const targeted = [[1,1,0],[0,0,1],[1,0,0],[0,1,0]];
  const random   = genRandomVectors(4, 3);
  const rT = simulateFaults(s.nodes, s.wires, targeted, { models: ['stuck-at-0','stuck-at-1','open'] });
  const rR = simulateFaults(s.nodes, s.wires, random,   { models: ['stuck-at-0','stuck-at-1','open'] });
  check('targeted (4 crafted) hits 100 %',
    rT.coverage.percent === 100, `targeted=${rT.coverage.percent}%`);
  check('targeted ≥ random for same vector count',
    rT.coverage.percent >= rR.coverage.percent,
    `targeted=${rT.coverage.percent}%, random=${rR.coverage.percent}%`);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
