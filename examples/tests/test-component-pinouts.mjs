// Snapshot tests for the component factory and the pin-out contract.
//
// Three layers:
//   1. Every type in COMPONENT_TYPES instantiates cleanly via
//      createComponent(type, 0, 0) — no throw, no null, type field
//      preserved.
//   2. Anchor types' default field sets match a hand-curated snapshot.
//      If somebody silently changes a default (e.g. PC.bitWidth from
//      8 to 4), every saved circuit that omits that field will load
//      with the wrong shape — this catches it.
//   3. Pin-count contract for the four highest-blast-radius CPU
//      components (ALU, CU, REG_FILE_DP, PC). Drives a minimal scene
//      through the engine and verifies the expected output indices
//      are populated.
//
// Run:  node examples/tests/test-component-pinouts.mjs

import { COMPONENT_TYPES, createComponent, createWire } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

// ── 1. Every COMPONENT_TYPES entry instantiates cleanly ───────────
console.log('[1] All ' + Object.keys(COMPONENT_TYPES).length + ' types instantiate via createComponent');
{
  let allOk = true;
  for (const [name, type] of Object.entries(COMPONENT_TYPES)) {
    let n;
    try { n = createComponent(type, 0, 0); }
    catch (e) { check(`createComponent('${type}') no throw`, false, e.message); allOk = false; continue; }
    if (!n)              { check(`createComponent('${type}') returns object`, false); allOk = false; continue; }
    if (n.type !== type) { check(`createComponent('${type}').type matches`, false, `got ${n.type}`); allOk = false; }
    if (n.x !== 0)       { check(`createComponent('${type}').x === 0`, false, `got ${n.x}`); allOk = false; }
    if (n.y !== 0)       { check(`createComponent('${type}').y === 0`, false, `got ${n.y}`); allOk = false; }
  }
  check(`all ${Object.keys(COMPONENT_TYPES).length} types passed`, allOk);
}

// ── 2. Anchor types — default field snapshots ────────────────────
// For each anchor, the expected fields BESIDES `type`, `x`, `y`.
// The test asserts each expected key is present with the expected
// value, AND no unexpected keys are present.
console.log('\n[2] Anchor types — default field snapshots');
const anchors = [
  ['PC',          { bitWidth: 8, label: 'PC' }],
  ['ALU',         { bitWidth: 8, label: 'ALU' }],
  ['REG_FILE',    { regCount: 8, dataBits: 8, initialRegs: null, label: 'RF' }],
  ['REG_FILE_DP', { regCount: 8, dataBits: 8, initialRegs: null, label: 'RF-DP' }],
  ['RAM',         { addrBits: 3, dataBits: 4, label: 'RAM' /* memory:{} checked separately */ }],
  ['ROM',         { addrBits: 3, dataBits: 4, label: 'ROM' }],
  ['CU',          { label: 'CU', controlTable: null, branchPredictor: 'static-nt' }],
  ['IR',          { instrWidth: 16, opBits: 4, rdBits: 4, rs1Bits: 4, rs2Bits: 4, label: 'IR' }],
  ['MUX',         { inputCount: 2, label: 'MUX' }],
  ['BUS_MUX',     { inputCount: 2, label: 'BMUX' }],
  ['INPUT',       { fixedValue: 0, label: 'IN' }],
  ['OUTPUT',      { targetValue: 0, label: 'OUT', sandbox: true }],
  ['CLOCK',       { value: 0 }],
  ['GATE_SLOT',   { gate: null, label: 'G' }],
  ['FF_SLOT',     { ffType: null, initialQ: 0, label: 'FF' }],
];
for (const [type, expected] of anchors) {
  const n = createComponent(type, 0, 0);
  let ok = true;
  for (const [k, v] of Object.entries(expected)) {
    if (n[k] !== v) { ok = false; check(`${type}.${k} === ${JSON.stringify(v)}`, false, `got ${JSON.stringify(n[k])}`); }
  }
  // Allowed extras: type, x, y, plus the keys we expected. RAM/ROM also
  // get a `memory: {}` field (object identity differs each call, so we
  // verify type + emptiness separately rather than including it in expected).
  const allowedExtras = new Set([...Object.keys(expected), 'type', 'x', 'y', 'memory']);
  const extras = Object.keys(n).filter(k => !allowedExtras.has(k));
  if (extras.length > 0) { ok = false; check(`${type} no unexpected keys`, false, `extras: ${extras.join(', ')}`); }
  if (ok) check(`${type} default snapshot matches`, true);
}
// RAM/ROM: memory should be an empty object literal.
for (const t of ['RAM', 'ROM']) {
  const n = createComponent(t, 0, 0);
  check(`${t}.memory is empty object`,
        n.memory && typeof n.memory === 'object' && Object.keys(n.memory).length === 0);
}

// ── 3. Pin-count contract via the engine ─────────────────────────
console.log('\n[3] Pin-count contract — drive each component, verify __outN keys');

// Helper to run a minimal scene one cycle.
let _idCounter = 0;
const _nid = () => 'n' + (++_idCounter);
const _wid = () => 'w' + (++_idCounter);
function makeNode(type, overrides = {}) {
  const n = createComponent(type, 0, 0);
  n.id = _nid();
  Object.assign(n, overrides);
  return n;
}
function makeWire(srcId, dstId, dstPin = 0, srcPin = 0, opts = {}) {
  const w = createWire(srcId, dstId, dstPin, srcPin, opts);
  w.id = _wid();
  return w;
}

// 3a. ALU — 3 outputs (R, Z, C).
console.log('  -- ALU: A(0), B(1), OP(2) → R(out0), Z(out1), C(out2) --');
{
  _idCounter = 0;
  const a   = makeNode('INPUT', { fixedValue: 5, label: 'A' });
  const b   = makeNode('INPUT', { fixedValue: 3, label: 'B' });
  const op  = makeNode('INPUT', { fixedValue: 0, label: 'OP' });   // 0 = ADD
  const alu = makeNode('ALU');
  const wires = [
    makeWire(a.id,  alu.id, 0),
    makeWire(b.id,  alu.id, 1),
    makeWire(op.id, alu.id, 2),
  ];
  const r = evaluate([a, b, op, alu], wires, new Map(), 0);
  check('ALU.__out0 (R) is set',  r.nodeValues.has(alu.id) || r.nodeValues.has(alu.id + '__out0'));
  check('ALU.__out0 == 5+3 = 8',  (r.nodeValues.get(alu.id) ?? r.nodeValues.get(alu.id + '__out0')) === 8);
  check('ALU.__out1 (Z) is set',  r.nodeValues.has(alu.id + '__out1'));
  check('ALU.__out2 (C) is set',  r.nodeValues.has(alu.id + '__out2'));
  // Sanity: OP=7 (CMP) with A==B should set Z=1.
  op.fixedValue = 7;
  b.fixedValue = 5;
  const r2 = evaluate([a, b, op, alu], wires, new Map(), 0);
  check('ALU CMP(5,5) → Z = 1',  r2.nodeValues.get(alu.id + '__out1') === 1);
}

// 3b. CU — 7 control outputs.
console.log('  -- CU: OP → aluOp(out0), regWe(out1), memWe(out2), memRe(out3), jmp(out4), halt(out5), immSel(out6) --');
{
  _idCounter = 0;
  const op = makeNode('INPUT', { fixedValue: 0, label: 'OP' });  // 0 = ADD
  const cu = makeNode('CU');
  const wires = [makeWire(op.id, cu.id, 0)];
  const r = evaluate([op, cu], wires, new Map(), 0);
  for (let i = 0; i < 7; i++) {
    check(`CU.__out${i} is set`, r.nodeValues.has(cu.id + '__out' + i));
  }
  // Spot-check: opcode 0 (ADD) → aluOp=0, regWe=1, all others 0.
  check('CU op=0 → aluOp=0',  r.nodeValues.get(cu.id + '__out0') === 0);
  check('CU op=0 → regWe=1',  r.nodeValues.get(cu.id + '__out1') === 1);
  check('CU op=0 → halt=0',   r.nodeValues.get(cu.id + '__out5') === 0);
  // Opcode 15 (HALT) → halt=1.
  op.fixedValue = 15;
  const r2 = evaluate([op, cu], wires, new Map(), 0);
  check('CU op=15 → halt=1',  r2.nodeValues.get(cu.id + '__out5') === 1);
  // Opcode 11 (BEQ) → aluOp=7 (CMP) AND jmp depends on Z; with default Z=0 → jmp=0.
  op.fixedValue = 11;
  const r3 = evaluate([op, cu], wires, new Map(), 0);
  check('CU op=11 (BEQ) → aluOp=7',  r3.nodeValues.get(cu.id + '__out0') === 7);
}

// 3c. REG_FILE_DP — 2 read ports (RD1 = out0, RD2 = out1).
console.log('  -- REG_FILE_DP: RD1_ADDR(0), RD2_ADDR(1), WR_ADDR(2), WR_DATA(3), WE(4), CLK(5) → RD1(out0), RD2(out1) --');
{
  _idCounter = 0;
  const clk  = makeNode('CLOCK',   { value: 0 });
  const rd1a = makeNode('INPUT',   { fixedValue: 0, label: 'RD1A' });
  const rd2a = makeNode('INPUT',   { fixedValue: 0, label: 'RD2A' });
  const wra  = makeNode('INPUT',   { fixedValue: 0, label: 'WRA' });
  const wrd  = makeNode('INPUT',   { fixedValue: 0, label: 'WRD' });
  const we   = makeNode('INPUT',   { fixedValue: 0, label: 'WE'  });
  const rf   = makeNode('REG_FILE_DP');
  const wires = [
    makeWire(rd1a.id, rf.id, 0),
    makeWire(rd2a.id, rf.id, 1),
    makeWire(wra.id,  rf.id, 2),
    makeWire(wrd.id,  rf.id, 3),
    makeWire(we.id,   rf.id, 4),
    makeWire(clk.id,  rf.id, 5, 0, { isClockWire: true }),
  ];
  const r = evaluate([clk, rd1a, rd2a, wra, wrd, we, rf], wires, new Map(), 0);
  check('REG_FILE_DP.__out0 (RD1) is set', r.nodeValues.has(rf.id) || r.nodeValues.has(rf.id + '__out0'));
  check('REG_FILE_DP.__out1 (RD2) is set', r.nodeValues.has(rf.id + '__out1'));
  // No __out2 expected.
  check('REG_FILE_DP has no __out2', !r.nodeValues.has(rf.id + '__out2'));
}

// 3d. PC — single output `q`, counts up on rising edge with EN=1.
console.log('  -- PC: JUMP_ADDR(0), JMP(1), EN(2), CLR(3), CLK(4) → q(out0) --');
{
  _idCounter = 0;
  const en  = makeNode('INPUT', { fixedValue: 1, label: 'EN' });
  const clk = makeNode('CLOCK', { value: 0 });
  const pc  = makeNode('PC',    { bitWidth: 4 });
  const wires = [
    makeWire(en.id,  pc.id, 2),
    makeWire(clk.id, pc.id, 4, 0, { isClockWire: true }),
  ];
  const ffStates = new Map();
  let r = evaluate([en, clk, pc], wires, ffStates, 0);
  check('PC initial value is 0', (r.nodeValues.get(pc.id) ?? null) === 0);
  // Tick three full clock periods → PC should reach 3.
  for (let cyc = 1; cyc <= 3; cyc++) {
    clk.value = 1; r = evaluate([en, clk, pc], wires, ffStates, cyc * 2 - 1);
    clk.value = 0; r = evaluate([en, clk, pc], wires, ffStates, cyc * 2);
  }
  check('PC counts to 3 after 3 ticks', r.nodeValues.get(pc.id) === 3);
}

// ── Summary ───────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
