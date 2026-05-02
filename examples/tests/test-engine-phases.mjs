// Unit tests for SimulationEngine.evaluate() — one scene per
// behaviour, asserting just that behaviour. Together they pin
// down the engine's contract phase by phase, so any future
// refactor of evaluate() will trip something here before it
// silently corrupts a long-tail demo.
//
// Covers:
//   - PHASE 1 combinational: AND/OR/XOR/NOT, BUS_MUX selection,
//     fan-out, broken-circuit graceful handling, idempotency.
//   - PHASE 2 sequential: D-FF latches only on rising edge, holds
//     value otherwise.
//   - PHASE 2b memory: PC counter ticks with EN=1.
//   - PHASE 4 CPU-specific: RAM async-read, ALU flag-latch policy
//     ("only CMP updates __cpu_flags__"), CU custom controlTable
//     dispatch.
//
// Atomic BEQ/BNE end-to-end behaviour (CU re-evaluates with
// fresh flag in same cycle) lives in test-beq-bne-atomic.mjs;
// not re-tested here.
//
// Run:  node examples/tests/test-engine-phases.mjs

import { createComponent, createWire, COMPONENT_TYPES } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

// ── Scene-building helpers ────────────────────────────────────
let _idCounter = 0;
const _nid = () => 'n' + (++_idCounter);
const _wid = () => 'w' + (++_idCounter);
function mk(type, ov = {}) {
  const n = createComponent(type, 0, 0);
  n.id = _nid();
  Object.assign(n, ov);
  return n;
}
function W(srcId, dstId, dstPin = 0, srcPin = 0, opts = {}) {
  const w = createWire(srcId, dstId, dstPin, srcPin, opts);
  w.id = _wid();
  return w;
}
function reset() { _idCounter = 0; }
function run(nodes, wires, ffStates = new Map()) {
  return evaluate(nodes, wires, ffStates, 0);
}

// ── 1. Combinational gates (PHASE 1) ─────────────────────────
console.log('[1] Combinational gates — AND, OR, XOR, NOT');
const truth = [
  ['AND', 0, 0, 0], ['AND', 0, 1, 0], ['AND', 1, 0, 0], ['AND', 1, 1, 1],
  ['OR',  0, 0, 0], ['OR',  0, 1, 1], ['OR',  1, 0, 1], ['OR',  1, 1, 1],
  ['XOR', 0, 0, 0], ['XOR', 0, 1, 1], ['XOR', 1, 0, 1], ['XOR', 1, 1, 0],
];
for (const [gate, A, B, expect] of truth) {
  reset();
  const a = mk('INPUT', { fixedValue: A });
  const b = mk('INPUT', { fixedValue: B });
  const g = mk('GATE_SLOT', { gate });
  const r = run([a, b, g], [W(a.id, g.id, 0), W(b.id, g.id, 1)]);
  const got = r.nodeValues.get(g.id);
  check(`${gate}(${A},${B}) = ${expect}`, got === expect, `got ${got}`);
}
// NOT
for (const [A, expect] of [[0, 1], [1, 0]]) {
  reset();
  const a = mk('INPUT', { fixedValue: A });
  const n = mk('GATE_SLOT', { gate: 'NOT' });
  const r = run([a, n], [W(a.id, n.id, 0)]);
  check(`NOT(${A}) = ${expect}`, r.nodeValues.get(n.id) === expect);
}

// ── 2. BUS_MUX selection ─────────────────────────────────────
console.log('\n[2] BUS_MUX 2:1 — SEL picks the right data input');
{
  reset();
  const d0  = mk('INPUT', { fixedValue: 5 });
  const d1  = mk('INPUT', { fixedValue: 9 });
  const sel = mk('INPUT', { fixedValue: 0 });
  const m   = mk('BUS_MUX', { inputCount: 2 });
  const wires = [W(d0.id, m.id, 0), W(d1.id, m.id, 1), W(sel.id, m.id, 2)];
  let r = run([d0, d1, sel, m], wires);
  check('SEL=0 → MUX out = D0 (5)', r.nodeValues.get(m.id) === 5);
  sel.fixedValue = 1;
  r = run([d0, d1, sel, m], wires);
  check('SEL=1 → MUX out = D1 (9)', r.nodeValues.get(m.id) === 9);
}

// ── 3. D-FF rising edge contract ─────────────────────────────
console.log('\n[3] D-FF — latches only on rising edge of CLK');
{
  reset();
  const d   = mk('INPUT', { fixedValue: 1 });
  const clk = mk('CLOCK', { value: 0 });
  const ff  = mk('FF_SLOT', { ffType: 'D' });
  const wires = [W(d.id, ff.id, 0), W(clk.id, ff.id, 1, 0, { isClockWire: true })];
  const ffs = new Map();
  let r = run([d, clk, ff], wires, ffs);
  check('initial Q = 0',                               r.nodeValues.get(ff.id) === 0);
  // Rising edge with D=1
  clk.value = 1; r = run([d, clk, ff], wires, ffs);
  check('after rising edge with D=1, Q = 1',           r.nodeValues.get(ff.id) === 1);
  // Hold while CLK stays high
  d.fixedValue = 0;
  r = run([d, clk, ff], wires, ffs);
  check('D drops to 0 with no edge → Q stays 1',       r.nodeValues.get(ff.id) === 1);
  // Falling edge → no latch
  clk.value = 0; r = run([d, clk, ff], wires, ffs);
  check('falling edge → Q still 1 (no latch on fall)', r.nodeValues.get(ff.id) === 1);
  // Next rising edge → latches the new D
  clk.value = 1; r = run([d, clk, ff], wires, ffs);
  check('next rising edge with D=0 → Q = 0',           r.nodeValues.get(ff.id) === 0);
}

// ── 4. PC counter ─────────────────────────────────────────────
console.log('\n[4] PC — counts up on rising edge with EN=1, freezes with EN=0');
{
  reset();
  const en  = mk('INPUT', { fixedValue: 1 });
  const clk = mk('CLOCK', { value: 0 });
  const pc  = mk('PC',    { bitWidth: 4 });
  const wires = [W(en.id, pc.id, 2), W(clk.id, pc.id, 4, 0, { isClockWire: true })];
  const ffs = new Map();
  let r = run([en, clk, pc], wires, ffs);
  check('PC initial = 0', r.nodeValues.get(pc.id) === 0);
  // 5 ticks
  for (let cyc = 1; cyc <= 5; cyc++) {
    clk.value = 1; r = run([en, clk, pc], wires, ffs);
    clk.value = 0; r = run([en, clk, pc], wires, ffs);
  }
  check('PC after 5 ticks = 5', r.nodeValues.get(pc.id) === 5);
  // Disable; one more tick should NOT advance.
  en.fixedValue = 0;
  clk.value = 1; r = run([en, clk, pc], wires, ffs);
  clk.value = 0; r = run([en, clk, pc], wires, ffs);
  check('PC frozen with EN=0', r.nodeValues.get(pc.id) === 5);
}

// ── 5. RAM async-read ────────────────────────────────────────
console.log('\n[5] RAM (asyncRead) — combinational read, address change reflects instantly');
{
  reset();
  const addr = mk('INPUT', { fixedValue: 0 });
  const dat  = mk('INPUT', { fixedValue: 0 });
  const we   = mk('INPUT', { fixedValue: 0 });
  const re   = mk('INPUT', { fixedValue: 1 });
  const ck   = mk('CLOCK', { value: 0 });
  const ram  = mk('RAM', { addrBits: 2, dataBits: 4, asyncRead: true, memory: { 0: 7, 1: 5, 2: 3 } });
  const wires = [
    W(addr.id, ram.id, 0),
    W(dat.id,  ram.id, 1),
    W(we.id,   ram.id, 2),
    W(re.id,   ram.id, 3),
    W(ck.id,   ram.id, 4, 0, { isClockWire: true }),
  ];
  const ffs = new Map();
  let r = run([addr, dat, we, re, ck, ram], wires, ffs);
  check('addr=0 → RAM[0] = 7', r.nodeValues.get(ram.id) === 7);
  addr.fixedValue = 1;
  r = run([addr, dat, we, re, ck, ram], wires, ffs);
  check('addr=1 → RAM[1] = 5 (no clock needed, async)', r.nodeValues.get(ram.id) === 5);
  addr.fixedValue = 2;
  r = run([addr, dat, we, re, ck, ram], wires, ffs);
  check('addr=2 → RAM[2] = 3', r.nodeValues.get(ram.id) === 3);
}

// ── 6. ALU flag-latch policy ─────────────────────────────────
// __cpu_flags__ is shared engine-state. Only CMP (op=7) writes
// to it; SUB/ADD/etc. compute the result but leave the latched
// flag untouched. This is critical for the BEQ/BNE atomicity
// promise — if SUB clobbered Z, every branch in cpu-build would
// silently misbehave.
console.log('\n[6] ALU flag latching — only CMP (op=7) writes __cpu_flags__');
{
  reset();
  const a   = mk('INPUT', { fixedValue: 5 });
  const b   = mk('INPUT', { fixedValue: 5 });
  const op  = mk('INPUT', { fixedValue: 7 });   // CMP
  const alu = mk('ALU');
  const wires = [W(a.id, alu.id, 0), W(b.id, alu.id, 1), W(op.id, alu.id, 2)];
  const ffs = new Map();
  // CMP(5, 5) → expect z=1, c=0 latched.
  run([a, b, op, alu], wires, ffs);
  let flags = ffs.get('__cpu_flags__');
  check('after CMP(5,5): __cpu_flags__ has z=1', flags && flags.z === 1);
  check('after CMP(5,5): __cpu_flags__ has c=0', flags && flags.c === 0);
  // Now run SUB(5, 6) → result is non-zero, but flags MUST stay z=1.
  op.fixedValue = 1;   // SUB
  b.fixedValue = 6;
  run([a, b, op, alu], wires, ffs);
  flags = ffs.get('__cpu_flags__');
  check('after SUB(5,6): flags unchanged (z=1)',  flags && flags.z === 1);
  check('after SUB(5,6): flags unchanged (c=0)',  flags && flags.c === 0);
  // ADD also must not change flags.
  op.fixedValue = 0;
  run([a, b, op, alu], wires, ffs);
  flags = ffs.get('__cpu_flags__');
  check('after ADD: flags still z=1 (untouched)',  flags && flags.z === 1);
  // CMP with a different result should overwrite.
  op.fixedValue = 7;
  b.fixedValue = 6;
  run([a, b, op, alu], wires, ffs);
  flags = ffs.get('__cpu_flags__');
  check('after CMP(5,6): flags now z=0',  flags && flags.z === 0);
}

// ── 7. CU custom controlTable dispatch ───────────────────────
// When `controlTable` is set, _evalCU reads the row at index op
// and uses its fields. This is how every per-lesson CU customizes
// its behaviour without forking the engine.
console.log('\n[7] CU custom controlTable — row 0 ALU-only, row 1 conditional jump');
{
  reset();
  const op = mk('INPUT', { fixedValue: 0 });
  const cu = mk('CU', {
    controlTable: [
      { aluOp: 5, regWe: 1, memWe: 0, memRe: 0, jmp: 0,  halt: 0, immSel: 0 },
      { aluOp: 7, regWe: 0, memWe: 0, memRe: 0, jmp: -1, halt: 0, immSel: 0 },
    ],
  });
  const wires = [W(op.id, cu.id, 0)];
  let r = run([op, cu], wires);
  check('row 0: __out0 (aluOp) = 5', r.nodeValues.get(cu.id + '__out0') === 5);
  check('row 0: __out1 (regWe) = 1', r.nodeValues.get(cu.id + '__out1') === 1);
  check('row 0: __out4 (jmp)   = 0', r.nodeValues.get(cu.id + '__out4') === 0);
  op.fixedValue = 1;
  r = run([op, cu], wires);
  check('row 1: __out0 (aluOp) = 7',                       r.nodeValues.get(cu.id + '__out0') === 7);
  check('row 1: __out1 (regWe) = 0',                       r.nodeValues.get(cu.id + '__out1') === 0);
  check('row 1: __out4 (jmp)   = 0 (Z=0 → conditional)',   r.nodeValues.get(cu.id + '__out4') === 0);
}

// ── 8. Broken circuit graceful ───────────────────────────────
// A wire whose source doesn't exist in the node list must not
// throw. Unaffected nodes should still propagate.
console.log('\n[8] Broken circuit — wire to nonexistent source must not throw');
{
  reset();
  const a = mk('INPUT', { fixedValue: 1 });
  const g = mk('GATE_SLOT', { gate: 'NOT' });   // 1 input
  const orphan = W('NONEXISTENT_NODE', g.id, 0);
  const survivor = mk('INPUT', { fixedValue: 0 });
  const probe    = mk('OUTPUT', { label: 'PROBE' });
  const probeWire = W(survivor.id, probe.id, 0);
  let r;
  let threw = false;
  try { r = run([a, g, survivor, probe], [orphan, probeWire]); }
  catch (e) { threw = true; }
  check('evaluate() does not throw',                                 !threw);
  check('survivor INPUT/OUTPUT pair still propagates correctly',     r && r.nodeValues.get(probe.id) === 0);
}

// ── 9. Fan-out — one source feeds many sinks ─────────────────
console.log('\n[9] Fan-out — one INPUT drives three independent gates');
{
  reset();
  const src = mk('INPUT', { fixedValue: 1 });
  const g1  = mk('GATE_SLOT', { gate: 'NOT' });
  const g2  = mk('GATE_SLOT', { gate: 'NOT' });
  const g3  = mk('GATE_SLOT', { gate: 'NOT' });
  const wires = [W(src.id, g1.id, 0), W(src.id, g2.id, 0), W(src.id, g3.id, 0)];
  const r = run([src, g1, g2, g3], wires);
  check('all 3 sinks see src=1 → NOT=0',
        r.nodeValues.get(g1.id) === 0 &&
        r.nodeValues.get(g2.id) === 0 &&
        r.nodeValues.get(g3.id) === 0);
}

// ── 10. Idempotency — repeated evaluate is stable ────────────
// Calling evaluate() twice on a stable scene should produce
// identical results. Catches accidental state mutation in
// node properties or shared state.
console.log('\n[10] Idempotency — evaluate twice → same nodeValues');
{
  reset();
  const a = mk('INPUT', { fixedValue: 1 });
  const b = mk('INPUT', { fixedValue: 0 });
  const g = mk('GATE_SLOT', { gate: 'AND' });
  const wires = [W(a.id, g.id, 0), W(b.id, g.id, 1)];
  const ffs = new Map();
  const r1 = run([a, b, g], wires, ffs);
  const v1 = r1.nodeValues.get(g.id);
  const r2 = run([a, b, g], wires, ffs);
  const v2 = r2.nodeValues.get(g.id);
  check('two evaluate() calls → same gate output', v1 === v2);
  // FF state with no clock movement should also be stable.
  reset();
  const clk = mk('CLOCK', { value: 0 });
  const din = mk('INPUT', { fixedValue: 1 });
  const ff  = mk('FF_SLOT', { ffType: 'D' });
  const wires2 = [W(din.id, ff.id, 0), W(clk.id, ff.id, 1, 0, { isClockWire: true })];
  const ffs2 = new Map();
  const ra = run([clk, din, ff], wires2, ffs2);
  const rb = run([clk, din, ff], wires2, ffs2);
  check('FF Q stable across two no-edge evaluate() calls',
        ra.nodeValues.get(ff.id) === rb.nodeValues.get(ff.id));
}

// ── Summary ───────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
