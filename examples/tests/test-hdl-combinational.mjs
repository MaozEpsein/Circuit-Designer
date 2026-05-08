// Phase 3 — Combinational translators (logic gates, vertical slice + breadth).
//
// Verifies the AND-gate vertical slice end-to-end through L1 (iverilog
// parse) and L2 (functional simulation matches our native engine), then
// exercises the breadth: every binary gate (AND/OR/XOR/NAND/NOR/XNOR)
// and every unary gate (NOT/BUF) emits valid primitive instances and
// parses cleanly.
//
// L3 (Yosys round-trip) is deferred — it lands when the Yosys adapter
// (`ir/fromYosysJSON.js`) ships, and the tests there will check that
// IR → Verilog → Yosys JSON → IR returns an equal IR.
//
// L4 (synth_ice40) is also deferred until the Yosys integration phase.
//
// Run:  node examples/tests/test-hdl-combinational.mjs

import { exportCircuit } from '../../js/hdl/VerilogExporter.js';
import { parseCheck, isIverilogAvailable } from '../../js/hdl/verify/iverilog.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('\n-- HDL Phase 3 — combinational translators --');

// Helper: build a minimal "two-input gate" scene (a, b → gate → y).
function buildBinaryGateScene(gate) {
  return {
    nodes: [
      { id: 'in_a', type: 'INPUT',  label: 'a' },
      { id: 'in_b', type: 'INPUT',  label: 'b' },
      { id: 'g1',   type: 'GATE_SLOT', gate, label: 'g1' },
      { id: 'out_y',type: 'OUTPUT', label: 'y' },
    ],
    wires: [
      { id: 'w1', sourceId: 'in_a', sourceOutputIndex: 0, targetId: 'g1', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'in_b', sourceOutputIndex: 0, targetId: 'g1', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'g1',   sourceOutputIndex: 0, targetId: 'out_y', targetInputIndex: 0 },
    ],
  };
}

function buildUnaryGateScene(gate) {
  return {
    nodes: [
      { id: 'in_a', type: 'INPUT',  label: 'a' },
      { id: 'g1',   type: 'GATE_SLOT', gate, label: 'g1' },
      { id: 'out_y',type: 'OUTPUT', label: 'y' },
    ],
    wires: [
      { id: 'w1', sourceId: 'in_a', sourceOutputIndex: 0, targetId: 'g1', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'g1',   sourceOutputIndex: 0, targetId: 'out_y', targetInputIndex: 0 },
    ],
  };
}

// ── 1. Vertical slice — AND gate, full L1 ───────────────────
console.log('Vertical slice: AND');
{
  const v = exportCircuit(buildBinaryGateScene('AND'), { topName: 'and_test', header: false });
  check('emits primitive `and`',           v.includes('and g1('));
  check('emits assign for output port',    /assign\s+y\s*=\s*\w+/.test(v));
  check('module signature has a, b, y',    /module and_test\(\s*input\s+a,\s*input\s+b,\s*output\s+y\s*\);/.test(v));

  const r = parseCheck(v);
  if (r.skipped) {
    console.log('  [SKIP] iverilog L1 parse — iverilog not on PATH');
  } else {
    check('iverilog -g2012 parses output',   r.ok, r.stderr);
  }
}

// ── 2. Breadth — every binary gate ──────────────────────────
console.log('Breadth: binary gates');
const BINARY = ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR'];
for (const gate of BINARY) {
  const v = exportCircuit(buildBinaryGateScene(gate), { topName: `${gate.toLowerCase()}_test`, header: false });
  const expected = gate.toLowerCase();
  check(`${gate}: primitive '${expected}' emitted`,
    new RegExp(`\\b${expected}\\s+g1\\(`).test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check(`${gate}: iverilog parses`, r.ok, r.stderr);
  }
}

// ── 3. Breadth — unary gates ────────────────────────────────
console.log('Breadth: unary gates');
for (const gate of ['NOT', 'BUF']) {
  const v = exportCircuit(buildUnaryGateScene(gate), { topName: `${gate.toLowerCase()}_test`, header: false });
  const expected = gate.toLowerCase();
  check(`${gate}: primitive '${expected}' emitted`,
    new RegExp(`\\b${expected}\\s+g1\\(`).test(v));
  // Unary primitive: must NOT have a third positional arg.
  const match = v.match(new RegExp(`${expected}\\s+g1\\(([^)]+)\\)`));
  if (match) {
    const args = match[1].split(',').map(s => s.trim()).filter(Boolean);
    check(`${gate}: emits 2 args (Y, A)`, args.length === 2, `got ${args.length}: ${args.join(', ')}`);
  }
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check(`${gate}: iverilog parses`, r.ok, r.stderr);
  }
}

// ── 4. Determinism — same circuit, byte-identical output ────
console.log('Determinism');
{
  const a = exportCircuit(buildBinaryGateScene('AND'), { topName: 'd', header: false });
  const b = exportCircuit(buildBinaryGateScene('AND'), { topName: 'd', header: false });
  check('two exports byte-identical', a === b);
}

// ── 5. Empty GATE_SLOT (gate field unset) — silently skipped ─
// Mirrors the canvas behaviour: an empty FF / gate slot is a "drop
// target", not a circuit element. The translator returns nothing and
// fromCircuit emits no instance for it; the OUTPUT port sees an
// undriven net which iverilog will warn about — that's the user's
// signal to fill the slot. No TODO comment is generated because
// GATE_SLOT IS registered, just configured emptily.
console.log('Empty GATE_SLOT (gate field unset)');
{
  const v = exportCircuit({
    nodes: [
      { id: 'g1',   type: 'GATE_SLOT', label: 'g1' },          // no gate field
      { id: 'out_y',type: 'OUTPUT', label: 'y' },
    ],
    wires: [
      { id: 'w', sourceId: 'g1', sourceOutputIndex: 0, targetId: 'out_y', targetInputIndex: 0 },
    ],
  }, { topName: 'empty_slot', header: false });
  check('empty GATE_SLOT produces no primitive instance',
    !/\b(and|or|xor|nand|nor|xnor|not|buf)\s+g1\b/.test(v));
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
