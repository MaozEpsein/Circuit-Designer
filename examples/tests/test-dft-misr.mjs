// Layer 5 — Multiple-Input Signature Register (MISR).
//
// Verifies:
//   1. Type registration + factory defaults.
//   2. Engine: with all data inputs = 0, a MISR seeded with 0 stays at 0
//      (no Fibonacci feedback term, nothing XORed in).
//   3. Engine: with all data inputs = 0, a MISR seeded with 1 behaves
//      like a plain LFSR (no data injection alters the chain).
//   4. Signature determinism: two runs of the same input stream produce
//      identical signatures.
//   5. Distinguishability: two different input streams (differing on at
//      least one cycle) produce different signatures.
//   6. goldenSig flag: when the captured signature matches goldenSig,
//      `sigMatch` latches 1; on a single-bit perturbation, `sigMatch`
//      latches 0.
//
// Pin layout in the engine:
//   D[0]..D[N-1] (one bit each), CLK
//
// Run:  node examples/tests/test-dft-misr.mjs

import { COMPONENT_TYPES, MEMORY_TYPE_SET, createComponent, createWire } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('\n-- DFT MISR --');

// ── 1. Type + factory ────────────────────────────────────────
{
  check("COMPONENT_TYPES.MISR === 'MISR'", COMPONENT_TYPES.MISR === 'MISR');
  check('MEMORY_TYPE_SET contains MISR',   MEMORY_TYPE_SET.has('MISR'));
  const n = createComponent('MISR', 0, 0);
  check('default bitWidth = 4',            n.bitWidth === 4);
  check('default seed = 0',                n.seed === 0);
  check('default taps = [3, 0]',           Array.isArray(n.taps) && n.taps[0] === 3 && n.taps[1] === 0);
  check('default goldenSig = null',        n.goldenSig === null);
}

// Build a MISR scene with N=4 data inputs + clock.
function buildScene({ seed = 0, taps = [3, 0], bitWidth = 4, goldenSig = null } = {}) {
  const d0 = { ...createComponent('INPUT', -200,   0), id: 'd0', fixedValue: 0 };
  const d1 = { ...createComponent('INPUT', -200,  80), id: 'd1', fixedValue: 0 };
  const d2 = { ...createComponent('INPUT', -200, 160), id: 'd2', fixedValue: 0 };
  const d3 = { ...createComponent('INPUT', -200, 240), id: 'd3', fixedValue: 0 };
  const clk= { ...createComponent('CLOCK', -200, 320), id: 'clk', value: 0 };
  const m  = { ...createComponent('MISR',     0,   0), id: 'm', bitWidth, taps, seed, goldenSig };
  return {
    nodes: [d0, d1, d2, d3, clk, m],
    wires: [
      { ...createWire('d0',  'm', 0), id: 'w0' },
      { ...createWire('d1',  'm', 1), id: 'w1' },
      { ...createWire('d2',  'm', 2), id: 'w2' },
      { ...createWire('d3',  'm', 3), id: 'w3' },
      { ...createWire('clk', 'm', 4, 0, { isClockWire: true }), id: 'wc' },
    ],
  };
}

function setData(s, [a, b, c, d]) {
  s.nodes.find(n => n.id === 'd0').fixedValue = a;
  s.nodes.find(n => n.id === 'd1').fixedValue = b;
  s.nodes.find(n => n.id === 'd2').fixedValue = c;
  s.nodes.find(n => n.id === 'd3').fixedValue = d;
}
function tick(s, ffStates, step) {
  s.nodes.find(n => n.id === 'clk').value = 0;
  evaluate(s.nodes, s.wires, ffStates, step);
  s.nodes.find(n => n.id === 'clk').value = 1;
  evaluate(s.nodes, s.wires, ffStates, step + 1);
}
function runStream(s, stream) {
  const ffStates = new Map();
  for (let i = 0; i < stream.length; i++) {
    setData(s, stream[i]);
    tick(s, ffStates, i * 2);
  }
  return ffStates.get('m');
}

// ── 2. seed=0, all D=0 → stays at 0 ──────────────────────────
{
  const s = buildScene({ seed: 0 });
  const stream = Array.from({ length: 8 }, () => [0, 0, 0, 0]);
  const ms = runStream(s, stream);
  check('seed=0, zero-stream → reg stays at 0', ms.reg === 0, `got 0b${ms.reg.toString(2)}`);
}

// ── 3. seed=1, all D=0 → behaves like an LFSR ────────────────
// The Fibonacci LFSR with x^4+x+1, seed=1 has a 15-cycle period and
// returns to 1 at the end. With zero-data injection on every bit, the
// MISR must trace exactly the same sequence.
{
  const sLfsr = buildScene({ seed: 1 });
  const stream = Array.from({ length: 15 }, () => [0, 0, 0, 0]);
  const ms = runStream(sLfsr, stream);
  check('seed=1, zero-stream, 15 cycles → reg back to seed 1',
    ms.reg === 1, `got 0b${ms.reg.toString(2).padStart(4,'0')}`);
}

// ── 4. Determinism: two identical streams → identical signatures
{
  const stream = [
    [1, 0, 0, 1],
    [0, 1, 1, 0],
    [1, 1, 0, 0],
    [0, 0, 1, 1],
    [1, 0, 1, 0],
    [0, 1, 0, 1],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
  ];
  const sigA = runStream(buildScene({ seed: 0 }), stream).reg;
  const sigB = runStream(buildScene({ seed: 0 }), stream).reg;
  check('identical streams → identical signatures', sigA === sigB,
    `A=0b${sigA.toString(2).padStart(4,'0')} B=0b${sigB.toString(2).padStart(4,'0')}`);
  check('signature is non-zero for a non-trivial stream', sigA !== 0);
}

// ── 5. Distinguishability: one-bit perturbation → different sig
{
  const golden = [
    [1, 0, 0, 1], [0, 1, 1, 0], [1, 1, 0, 0], [0, 0, 1, 1],
    [1, 0, 1, 0], [0, 1, 0, 1], [1, 1, 1, 1], [0, 0, 0, 0],
  ];
  // Flip one bit on one cycle to simulate a faulty test response.
  const faulty = golden.map((v, i) => i === 3 ? [1, 0, 1, 1] : v);
  const sigGold  = runStream(buildScene({ seed: 0 }), golden).reg;
  const sigFault = runStream(buildScene({ seed: 0 }), faulty).reg;
  check('1-bit perturbation → different signature', sigGold !== sigFault,
    `gold=0b${sigGold.toString(2).padStart(4,'0')} fault=0b${sigFault.toString(2).padStart(4,'0')}`);
}

// ── 6. goldenSig comparator (sigMatch flag) ──────────────────
{
  const stream = [
    [1, 0, 0, 1], [0, 1, 1, 0], [1, 1, 0, 0], [0, 0, 1, 1],
    [1, 0, 1, 0], [0, 1, 0, 1], [1, 1, 1, 1], [0, 0, 0, 0],
  ];
  // First run with goldenSig=null to capture the natural signature.
  const baseline = runStream(buildScene({ seed: 0 }), stream).reg;

  // Match case: feed goldenSig = baseline.
  const sMatch = runStream(buildScene({ seed: 0, goldenSig: baseline }), stream);
  check('sigMatch = 1 when stream matches goldenSig', sMatch.sigMatch === 1,
    `reg=${sMatch.reg}, golden=${baseline}, sigMatch=${sMatch.sigMatch}`);

  // Mismatch case: same goldenSig, flip one bit in the stream.
  const faulty = stream.map((v, i) => i === 5 ? [1, 1, 0, 1] : v);
  const sFail = runStream(buildScene({ seed: 0, goldenSig: baseline }), faulty);
  check('sigMatch = 0 when stream diverges from goldenSig', sFail.sigMatch === 0,
    `reg=${sFail.reg}, golden=${baseline}, sigMatch=${sFail.sigMatch}`);

  // When goldenSig is null the flag stays null (panel shows "no reference").
  const sNull = runStream(buildScene({ seed: 0, goldenSig: null }), stream);
  check('sigMatch = null when goldenSig not set', sNull.sigMatch === null,
    `sigMatch=${sNull.sigMatch}`);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
