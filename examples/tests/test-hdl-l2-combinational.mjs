// Phase A — L2 semantic equivalence for combinational designs.
//
// For each fixture, the harness:
//   1. Enumerates all 2^N input vectors (for small N).
//   2. Runs the native simulator → captures output values.
//   3. Exports Verilog + builds a matching TB → runs iverilog.
//   4. Diffs the two VCDs on every primary OUTPUT.
//
// A failure means the translator emits Verilog whose behaviour
// disagrees with the canvas simulator at some input vector — the
// kind of bug that L1 (parse-only) lets through.
//
// Run: node examples/tests/test-hdl-l2-combinational.mjs

import { runL2 } from '../../js/hdl/verify/runL2.js';
import { isIverilogAvailable } from '../../js/hdl/verify/iverilog.js';

let failed = 0;
let skipped = 0;
function check(label, result) {
  if (result.skipped) {
    skipped++;
    console.log(`  [SKIP] ${label} — ${result.reason}`);
    return;
  }
  if (!result.ok) {
    failed++;
    const d = result.divergence;
    const detail = d
      ? `signal=${d.signal} t=${d.time} expected=${d.expected} actual=${d.actual}`
      : (result.reason || 'unknown');
    console.log(`  [FAIL] ${label} — ${detail}`);
    if (result.stderr) console.log(`         ${result.stderr.split('\n')[0]}`);
    return;
  }
  console.log(`  [PASS] ${label}`);
}

console.log('\n-- HDL L2 — Combinational equivalence --');
if (!isIverilogAvailable()) {
  console.log('  iverilog not on PATH — every check will SKIP.');
}

// ── Single-gate fixtures ─────────────────────────────────────
console.log('Logic gates (2-input)');
for (const gate of ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR']) {
  check(`gate ${gate}`, runL2({
    nodes: [
      { id: 'a', type: 'INPUT',  label: 'a' },
      { id: 'b', type: 'INPUT',  label: 'b' },
      { id: 'g', type: 'GATE_SLOT', gate, label: 'g' },
      { id: 'y', type: 'OUTPUT', label: 'y' },
    ],
    wires: [
      { id: 'w1', sourceId: 'a', targetId: 'g', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'b', targetId: 'g', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'g', sourceOutputIndex: 0, targetId: 'y', targetInputIndex: 0 },
    ],
  }, { topName: `g_${gate.toLowerCase()}` }));
}

console.log('Unary gates (NOT, BUF)');
for (const gate of ['NOT', 'BUF']) {
  check(`gate ${gate}`, runL2({
    nodes: [
      { id: 'a', type: 'INPUT',  label: 'a' },
      { id: 'g', type: 'GATE_SLOT', gate, label: 'g' },
      { id: 'y', type: 'OUTPUT', label: 'y' },
    ],
    wires: [
      { id: 'w1', sourceId: 'a', targetId: 'g', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'g', sourceOutputIndex: 0, targetId: 'y', targetInputIndex: 0 },
    ],
  }, { topName: `u_${gate.toLowerCase()}` }));
}

// ── HALF_ADDER ────────────────────────────────────────────────
console.log('HALF_ADDER');
check('S = a^b, C = a&b', runL2({
  nodes: [
    { id: 'a', type: 'INPUT', label: 'a' },
    { id: 'b', type: 'INPUT', label: 'b' },
    { id: 'h', type: 'HALF_ADDER', label: 'ha' },
    { id: 's', type: 'OUTPUT', label: 's' },
    { id: 'c', type: 'OUTPUT', label: 'c' },
  ],
  wires: [
    { id: 'w1', sourceId: 'a', targetId: 'h', targetInputIndex: 0 },
    { id: 'w2', sourceId: 'b', targetId: 'h', targetInputIndex: 1 },
    { id: 'ws', sourceId: 'h', sourceOutputIndex: 0, targetId: 's', targetInputIndex: 0 },
    { id: 'wc', sourceId: 'h', sourceOutputIndex: 1, targetId: 'c', targetInputIndex: 0 },
  ],
}, { topName: 'ha_test' }));

// ── FULL_ADDER ────────────────────────────────────────────────
console.log('FULL_ADDER');
check('all 8 input vectors', runL2({
  nodes: [
    { id: 'a',   type: 'INPUT', label: 'a' },
    { id: 'b',   type: 'INPUT', label: 'b' },
    { id: 'cin', type: 'INPUT', label: 'cin' },
    { id: 'fa', type: 'FULL_ADDER', label: 'fa' },
    { id: 's', type: 'OUTPUT', label: 's' },
    { id: 'co', type: 'OUTPUT', label: 'co' },
  ],
  wires: [
    { id: 'w1', sourceId: 'a',   targetId: 'fa', targetInputIndex: 0 },
    { id: 'w2', sourceId: 'b',   targetId: 'fa', targetInputIndex: 1 },
    { id: 'w3', sourceId: 'cin', targetId: 'fa', targetInputIndex: 2 },
    { id: 'ws', sourceId: 'fa', sourceOutputIndex: 0, targetId: 's',  targetInputIndex: 0 },
    { id: 'wc', sourceId: 'fa', sourceOutputIndex: 1, targetId: 'co', targetInputIndex: 0 },
  ],
}, { topName: 'fa_test' }));

// ── COMPARATOR ────────────────────────────────────────────────
console.log('COMPARATOR');
check('1-bit eq/gt/lt', runL2({
  nodes: [
    { id: 'a', type: 'INPUT', label: 'a' },
    { id: 'b', type: 'INPUT', label: 'b' },
    { id: 'c', type: 'COMPARATOR', label: 'c' },
    { id: 'eq', type: 'OUTPUT', label: 'eq' },
    { id: 'gt', type: 'OUTPUT', label: 'gt' },
    { id: 'lt', type: 'OUTPUT', label: 'lt' },
  ],
  wires: [
    { id: 'w1', sourceId: 'a', targetId: 'c', targetInputIndex: 0 },
    { id: 'w2', sourceId: 'b', targetId: 'c', targetInputIndex: 1 },
    { id: 'we', sourceId: 'c', sourceOutputIndex: 0, targetId: 'eq', targetInputIndex: 0 },
    { id: 'wg', sourceId: 'c', sourceOutputIndex: 1, targetId: 'gt', targetInputIndex: 0 },
    { id: 'wl', sourceId: 'c', sourceOutputIndex: 2, targetId: 'lt', targetInputIndex: 0 },
  ],
}, { topName: 'cmp_test' }));

// ── Composite: 2-input MUX built from gates ──────────────────
console.log('Composite — 2:1 MUX from gates');
check('MUX y = sel ? b : a', runL2({
  nodes: [
    { id: 'a',   type: 'INPUT', label: 'a' },
    { id: 'b',   type: 'INPUT', label: 'b' },
    { id: 'sel', type: 'INPUT', label: 'sel' },
    { id: 'nsel',  type: 'GATE_SLOT', gate: 'NOT', label: 'nsel' },
    { id: 'a_and', type: 'GATE_SLOT', gate: 'AND', label: 'a_and' },
    { id: 'b_and', type: 'GATE_SLOT', gate: 'AND', label: 'b_and' },
    { id: 'or_g',  type: 'GATE_SLOT', gate: 'OR',  label: 'or_g' },
    { id: 'y',   type: 'OUTPUT', label: 'y' },
  ],
  wires: [
    { id: 'w1', sourceId: 'sel', targetId: 'nsel', targetInputIndex: 0 },
    { id: 'w2', sourceId: 'a',   targetId: 'a_and', targetInputIndex: 0 },
    { id: 'w3', sourceId: 'nsel', sourceOutputIndex: 0, targetId: 'a_and', targetInputIndex: 1 },
    { id: 'w4', sourceId: 'b',   targetId: 'b_and', targetInputIndex: 0 },
    { id: 'w5', sourceId: 'sel', targetId: 'b_and', targetInputIndex: 1 },
    { id: 'w6', sourceId: 'a_and', sourceOutputIndex: 0, targetId: 'or_g', targetInputIndex: 0 },
    { id: 'w7', sourceId: 'b_and', sourceOutputIndex: 0, targetId: 'or_g', targetInputIndex: 1 },
    { id: 'w8', sourceId: 'or_g',  sourceOutputIndex: 0, targetId: 'y',    targetInputIndex: 0 },
  ],
}, { topName: 'mux_test' }));

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}${skipped ? ` (${skipped} skipped)` : ''}`);
process.exit(failed === 0 ? 0 : 1);
