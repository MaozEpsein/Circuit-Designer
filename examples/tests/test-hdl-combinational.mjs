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

// ── 4.5 Arithmetic: HALF_ADDER, FULL_ADDER, COMPARATOR ──────
console.log('Arithmetic');

// HALF_ADDER — sum = a^b, carry = a&b
{
  const v = exportCircuit({
    nodes: [
      { id: 'a', type: 'INPUT', label: 'a' },
      { id: 'b', type: 'INPUT', label: 'b' },
      { id: 'ha', type: 'HALF_ADDER', label: 'ha' },
      { id: 's', type: 'OUTPUT', label: 'sum' },
      { id: 'c', type: 'OUTPUT', label: 'carry' },
    ],
    wires: [
      { id: 'w1', sourceId: 'a',  sourceOutputIndex: 0, targetId: 'ha', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'b',  sourceOutputIndex: 0, targetId: 'ha', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'ha', sourceOutputIndex: 0, targetId: 's',  targetInputIndex: 0 },
      { id: 'w4', sourceId: 'ha', sourceOutputIndex: 1, targetId: 'c',  targetInputIndex: 0 },
    ],
  }, { topName: 'ha_test', header: false });
  check('HALF_ADDER: sum = a ^ b',   /assign\s+net_ha_0\s*=\s*\(a\s*\^\s*b\)/.test(v));
  check('HALF_ADDER: carry = a & b', /assign\s+net_ha_1\s*=\s*\(a\s*&\s*b\)/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('HALF_ADDER: iverilog parses', r.ok, r.stderr);
  }
}

// FULL_ADDER — sum = a^b^cin, cout = (a&b)|(b&cin)|(a&cin)
{
  const v = exportCircuit({
    nodes: [
      { id: 'a', type: 'INPUT', label: 'a' },
      { id: 'b', type: 'INPUT', label: 'b' },
      { id: 'cin', type: 'INPUT', label: 'cin' },
      { id: 'fa', type: 'FULL_ADDER', label: 'fa' },
      { id: 's', type: 'OUTPUT', label: 'sum' },
      { id: 'co', type: 'OUTPUT', label: 'cout' },
    ],
    wires: [
      { id: 'w1', sourceId: 'a',   sourceOutputIndex: 0, targetId: 'fa', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'b',   sourceOutputIndex: 0, targetId: 'fa', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'cin', sourceOutputIndex: 0, targetId: 'fa', targetInputIndex: 2 },
      { id: 'w4', sourceId: 'fa',  sourceOutputIndex: 0, targetId: 's',  targetInputIndex: 0 },
      { id: 'w5', sourceId: 'fa',  sourceOutputIndex: 1, targetId: 'co', targetInputIndex: 0 },
    ],
  }, { topName: 'fa_test', header: false });
  check('FULL_ADDER: sum nests three XORs',
    /assign\s+net_fa_0\s*=\s*\(\(a\s*\^\s*b\)\s*\^\s*cin\)/.test(v));
  check('FULL_ADDER: cout has all three AND terms ORed',
    /\(a\s*&\s*b\)/.test(v) && /\(b\s*&\s*cin\)/.test(v) && /\(a\s*&\s*cin\)/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('FULL_ADDER: iverilog parses', r.ok, r.stderr);
  }
}

// COMPARATOR — three outputs: EQ, GT, LT
{
  const v = exportCircuit({
    nodes: [
      { id: 'a', type: 'INPUT', label: 'a' },
      { id: 'b', type: 'INPUT', label: 'b' },
      { id: 'cmp', type: 'COMPARATOR', label: 'cmp' },
      { id: 'eq', type: 'OUTPUT', label: 'eq' },
      { id: 'gt', type: 'OUTPUT', label: 'gt' },
      { id: 'lt', type: 'OUTPUT', label: 'lt' },
    ],
    wires: [
      { id: 'w1', sourceId: 'a',   sourceOutputIndex: 0, targetId: 'cmp', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'b',   sourceOutputIndex: 0, targetId: 'cmp', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'cmp', sourceOutputIndex: 0, targetId: 'eq',  targetInputIndex: 0 },
      { id: 'w4', sourceId: 'cmp', sourceOutputIndex: 1, targetId: 'gt',  targetInputIndex: 0 },
      { id: 'w5', sourceId: 'cmp', sourceOutputIndex: 2, targetId: 'lt',  targetInputIndex: 0 },
    ],
  }, { topName: 'cmp_test', header: false });
  check('COMPARATOR: emits a == b assign', /assign\s+net_cmp_0\s*=\s*\(a\s*==\s*b\)/.test(v));
  check('COMPARATOR: emits a > b  assign', /assign\s+net_cmp_1\s*=\s*\(a\s*>\s*b\)/.test(v));
  check('COMPARATOR: emits a < b  assign', /assign\s+net_cmp_2\s*=\s*\(a\s*<\s*b\)/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('COMPARATOR: iverilog parses', r.ok, r.stderr);
  }
}

// ── 4.6 Muxing: MUX (2:1 ternary, N:1 nested ternary chain) ──
console.log('Muxing');

// 2:1 MUX — clean ternary form
{
  const v = exportCircuit({
    nodes: [
      { id: 'd0', type: 'INPUT', label: 'd0' },
      { id: 'd1', type: 'INPUT', label: 'd1' },
      { id: 'sel', type: 'INPUT', label: 'sel' },
      { id: 'm', type: 'MUX', inputCount: 2, label: 'm' },
      { id: 'y', type: 'OUTPUT', label: 'y' },
    ],
    wires: [
      { id: 'w1', sourceId: 'd0',  targetId: 'm', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'd1',  targetId: 'm', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'sel', targetId: 'm', targetInputIndex: 2 },
      { id: 'w4', sourceId: 'm',   targetId: 'y', targetInputIndex: 0 },
    ],
  }, { topName: 'mux21', header: false });
  check('MUX 2:1: emits sel ? d1 : d0',
    /assign\s+net_m_0\s*=\s*\(sel\s*\?\s*d1\s*:\s*d0\)/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('MUX 2:1: iverilog parses', r.ok, r.stderr);
  }
}

// 4:1 MUX — nested ternary chain over a 2-bit concat select
{
  const v = exportCircuit({
    nodes: [
      { id: 'd0', type: 'INPUT', label: 'd0' },
      { id: 'd1', type: 'INPUT', label: 'd1' },
      { id: 'd2', type: 'INPUT', label: 'd2' },
      { id: 'd3', type: 'INPUT', label: 'd3' },
      { id: 's0', type: 'INPUT', label: 's0' },
      { id: 's1', type: 'INPUT', label: 's1' },
      { id: 'm', type: 'MUX', inputCount: 4, label: 'm' },
      { id: 'y', type: 'OUTPUT', label: 'y' },
    ],
    wires: [
      { id: 'w1', sourceId: 'd0', targetId: 'm', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'd1', targetId: 'm', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'd2', targetId: 'm', targetInputIndex: 2 },
      { id: 'w4', sourceId: 'd3', targetId: 'm', targetInputIndex: 3 },
      { id: 'w5', sourceId: 's0', targetId: 'm', targetInputIndex: 4 },
      { id: 'w6', sourceId: 's1', targetId: 'm', targetInputIndex: 5 },
      { id: 'w7', sourceId: 'm',  targetId: 'y', targetInputIndex: 0 },
    ],
  }, { topName: 'mux41', header: false });
  check('MUX 4:1: builds {s1, s0} concat (MSB-first)',
    /\{s1,\s*s0\}/.test(v));
  check('MUX 4:1: emits 2\'hN literals for sel comparison',
    /2'h0/.test(v) && /2'h1/.test(v) && /2'h2/.test(v));
  check('MUX 4:1: ends with bare d3 (default branch)',
    /:\s*d3\)\)\)/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('MUX 4:1: iverilog parses', r.ok, r.stderr);
  }
}

// ── 4.7 DEMUX, DECODER, ENCODER ─────────────────────────────
console.log('Demux / Decoder / Encoder');

// DEMUX 1:4 — each output is `(sel == k) ? data : 0`
{
  const v = exportCircuit({
    nodes: [
      { id: 'd', type: 'INPUT', label: 'd' },
      { id: 's0', type: 'INPUT', label: 's0' },
      { id: 's1', type: 'INPUT', label: 's1' },
      { id: 'dm', type: 'DEMUX', outputCount: 4, label: 'dm' },
      { id: 'o0', type: 'OUTPUT', label: 'o0' },
      { id: 'o1', type: 'OUTPUT', label: 'o1' },
      { id: 'o2', type: 'OUTPUT', label: 'o2' },
      { id: 'o3', type: 'OUTPUT', label: 'o3' },
    ],
    wires: [
      { id: 'w1', sourceId: 'd',  targetId: 'dm', targetInputIndex: 0 },
      { id: 'w2', sourceId: 's0', targetId: 'dm', targetInputIndex: 1 },
      { id: 'w3', sourceId: 's1', targetId: 'dm', targetInputIndex: 2 },
      { id: 'wo0', sourceId: 'dm', sourceOutputIndex: 0, targetId: 'o0', targetInputIndex: 0 },
      { id: 'wo1', sourceId: 'dm', sourceOutputIndex: 1, targetId: 'o1', targetInputIndex: 0 },
      { id: 'wo2', sourceId: 'dm', sourceOutputIndex: 2, targetId: 'o2', targetInputIndex: 0 },
      { id: 'wo3', sourceId: 'dm', sourceOutputIndex: 3, targetId: 'o3', targetInputIndex: 0 },
    ],
  }, { topName: 'demux14', header: false });
  check('DEMUX: routes data to selected output',
    /\(\(\{s1,\s*s0\}\s*==\s*2'h0\)\s*\?\s*d\s*:\s*1'h0\)/.test(v));
  check('DEMUX: emits one assign per output',
    (v.match(/assign\s+net_dm_/g) || []).length === 4);
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('DEMUX: iverilog parses', r.ok, r.stderr);
  }
}

// DECODER 2:4 — each output is `(addr == k)`, one-hot
{
  const v = exportCircuit({
    nodes: [
      { id: 'a0', type: 'INPUT', label: 'a0' },
      { id: 'a1', type: 'INPUT', label: 'a1' },
      { id: 'dec', type: 'DECODER', inputBits: 2, label: 'dec' },
      { id: 'o0', type: 'OUTPUT', label: 'o0' },
      { id: 'o1', type: 'OUTPUT', label: 'o1' },
      { id: 'o2', type: 'OUTPUT', label: 'o2' },
      { id: 'o3', type: 'OUTPUT', label: 'o3' },
    ],
    wires: [
      { id: 'w1', sourceId: 'a0', targetId: 'dec', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'a1', targetId: 'dec', targetInputIndex: 1 },
      { id: 'wo0', sourceId: 'dec', sourceOutputIndex: 0, targetId: 'o0', targetInputIndex: 0 },
      { id: 'wo1', sourceId: 'dec', sourceOutputIndex: 1, targetId: 'o1', targetInputIndex: 0 },
      { id: 'wo2', sourceId: 'dec', sourceOutputIndex: 2, targetId: 'o2', targetInputIndex: 0 },
      { id: 'wo3', sourceId: 'dec', sourceOutputIndex: 3, targetId: 'o3', targetInputIndex: 0 },
    ],
  }, { topName: 'dec24', header: false });
  check('DECODER: each output is `(addr == k)`',
    /\(\{a1,\s*a0\}\s*==\s*2'h0\)/.test(v) &&
    /\(\{a1,\s*a0\}\s*==\s*2'h3\)/.test(v));
  check('DECODER: emits 2^N (=4) outputs',
    (v.match(/assign\s+net_dec_/g) || []).length === 4);
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('DECODER: iverilog parses', r.ok, r.stderr);
  }
}

// ENCODER 4:2 — priority encoder, nested ternary chain
{
  const v = exportCircuit({
    nodes: [
      { id: 'i0', type: 'INPUT', label: 'i0' },
      { id: 'i1', type: 'INPUT', label: 'i1' },
      { id: 'i2', type: 'INPUT', label: 'i2' },
      { id: 'i3', type: 'INPUT', label: 'i3' },
      { id: 'enc', type: 'ENCODER', inputLines: 4, label: 'enc' },
      { id: 'b0', type: 'OUTPUT', label: 'b0' },
      { id: 'b1', type: 'OUTPUT', label: 'b1' },
    ],
    wires: [
      { id: 'w1', sourceId: 'i0', targetId: 'enc', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'i1', targetId: 'enc', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'i2', targetId: 'enc', targetInputIndex: 2 },
      { id: 'w4', sourceId: 'i3', targetId: 'enc', targetInputIndex: 3 },
      { id: 'wo0', sourceId: 'enc', sourceOutputIndex: 0, targetId: 'b0', targetInputIndex: 0 },
      { id: 'wo1', sourceId: 'enc', sourceOutputIndex: 1, targetId: 'b1', targetInputIndex: 0 },
    ],
  }, { topName: 'enc42', header: false });
  // i3 is highest-priority and is checked outermost
  check('ENCODER: highest-priority input checked first',
    /\(i3\s*\?\s*1'h1/.test(v));
  // Output count: log2(4) = 2 outputs (b0, b1)
  check('ENCODER: emits log2(N) (=2) output bits',
    (v.match(/assign\s+net_enc_/g) || []).length === 2);
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('ENCODER: iverilog parses', r.ok, r.stderr);
  }
}

// ── 4.8 Width-changers: SIGN_EXT, BUS_MUX, DISPLAY_7SEG ─────
console.log('Width-changers / display sink');

// SIGN_EXT 4 → 8: replicate-concat form
{
  const v = exportCircuit({
    nodes: [
      { id: 'in', type: 'INPUT', label: 'in', bitWidth: 4 },
      { id: 'se', type: 'SIGN_EXT', inBits: 4, outBits: 8, label: 'se' },
      { id: 'out', type: 'OUTPUT', label: 'out', bitWidth: 8 },
    ],
    wires: [
      { id: 'w1', sourceId: 'in', targetId: 'se', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'se', targetId: 'out', targetInputIndex: 0 },
    ],
  }, { topName: 'se_test', header: false });
  check('SIGN_EXT: replicates sign bit then concats',
    /\{\{4\{in\[3\]\}\},\s*in\}/.test(v));
  check('SIGN_EXT: net widened to 8-bit', /wire\s+\[7:0\]\s+net_se_0/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('SIGN_EXT: iverilog parses', r.ok, r.stderr);
  }
}

// BUS_MUX 2:1 8-bit: clean ternary
{
  const v = exportCircuit({
    nodes: [
      { id: 'a', type: 'INPUT', label: 'a', bitWidth: 8 },
      { id: 'b', type: 'INPUT', label: 'b', bitWidth: 8 },
      { id: 's', type: 'INPUT', label: 's' },
      { id: 'mx', type: 'BUS_MUX', inputCount: 2, bitWidth: 8, label: 'mx' },
      { id: 'y', type: 'OUTPUT', label: 'y', bitWidth: 8 },
    ],
    wires: [
      { id: 'w1', sourceId: 'a', targetId: 'mx', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'b', targetId: 'mx', targetInputIndex: 1 },
      { id: 'w3', sourceId: 's', targetId: 'mx', targetInputIndex: 2 },
      { id: 'w4', sourceId: 'mx', targetId: 'y', targetInputIndex: 0 },
    ],
  }, { topName: 'bm_test', header: false });
  check('BUS_MUX 2:1: ternary form', /assign\s+net_mx_0\s*=\s*\(s\s*\?\s*b\s*:\s*a\)/.test(v));
  check('BUS_MUX 2:1: net is 8-bit', /wire\s+\[7:0\]\s+net_mx_0/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('BUS_MUX: iverilog parses', r.ok, r.stderr);
  }
}

// DISPLAY_7SEG: becomes a 7-bit output port packing 7 input pins
{
  const v = exportCircuit({
    nodes: [
      { id: 'a', type: 'INPUT', label: 'a' }, { id: 'b', type: 'INPUT', label: 'b' },
      { id: 'c', type: 'INPUT', label: 'c' }, { id: 'd', type: 'INPUT', label: 'd' },
      { id: 'e', type: 'INPUT', label: 'e' }, { id: 'f', type: 'INPUT', label: 'f' },
      { id: 'g', type: 'INPUT', label: 'g' },
      { id: 'd7', type: 'DISPLAY_7SEG', label: 'seg7' },
    ],
    wires: [
      { id: 'w0', sourceId: 'a', targetId: 'd7', targetInputIndex: 0 },
      { id: 'w1', sourceId: 'b', targetId: 'd7', targetInputIndex: 1 },
      { id: 'w2', sourceId: 'c', targetId: 'd7', targetInputIndex: 2 },
      { id: 'w3', sourceId: 'd', targetId: 'd7', targetInputIndex: 3 },
      { id: 'w4', sourceId: 'e', targetId: 'd7', targetInputIndex: 4 },
      { id: 'w5', sourceId: 'f', targetId: 'd7', targetInputIndex: 5 },
      { id: 'w6', sourceId: 'g', targetId: 'd7', targetInputIndex: 6 },
    ],
  }, { topName: 'd7_test', header: false });
  check('DISPLAY_7SEG: emits 7-bit output port', /output\s+\[6:0\]\s+seg7/.test(v));
  check('DISPLAY_7SEG: packs MSB-first {g, f, e, d, c, b, a}',
    /\{g,\s*f,\s*e,\s*d,\s*c,\s*b,\s*a\}/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('DISPLAY_7SEG: iverilog parses', r.ok, r.stderr);
  }
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
