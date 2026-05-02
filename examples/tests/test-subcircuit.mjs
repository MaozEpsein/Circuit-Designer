// Tests for SubCircuitRegistry + the engine's SUB_CIRCUIT
// recursive-evaluate path.
//
// Covers:
//   - Registry CRUD: define / get / list / remove / null on missing.
//   - INPUT/OUTPUT auto-detection becomes the sub-circuit's interface.
//   - createInstance returns deep-cloned, mutually independent objects.
//   - End-to-end combinational sub-circuit (AND) wired into outer scene.
//   - End-to-end sequential sub-circuit (D-FF) — internal state evolves
//     correctly across rising edges and HOLDS its value when CLK is
//     held high (same contract as a primary FF outside the
//     sub-circuit — see section 8 for the explicit equivalence test).
//   - Two instances of the same definition keep isolated _subFfStates.
//   - Mutating one instance's internal nodes does not leak to another.
//   - serialize / deserialize round-trip.
//
// Run:  node examples/tests/test-subcircuit.mjs

import { SubCircuitRegistry } from '../../js/core/SubCircuitRegistry.js';
import { createComponent, createWire } from '../../js/components/Component.js';
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

// Build a fresh "AND" definition: 2 INPUTs (A, B), 1 AND gate, 1 OUTPUT (Y).
function buildAndDef() {
  reset();
  const a = mk('INPUT',     { label: 'A' });
  const b = mk('INPUT',     { label: 'B' });
  const g = mk('GATE_SLOT', { gate: 'AND' });
  const y = mk('OUTPUT',    { label: 'Y' });
  return {
    nodes: [a, b, g, y],
    wires: [W(a.id, g.id, 0), W(b.id, g.id, 1), W(g.id, y.id, 0)],
  };
}

// Build a fresh "D-FF" definition: D, CLK inputs, FF_SLOT, Q output.
function buildDffDef() {
  reset();
  const d   = mk('INPUT',   { label: 'D' });
  const clk = mk('INPUT',   { label: 'CLK' });
  const ff  = mk('FF_SLOT', { ffType: 'D' });
  const q   = mk('OUTPUT',  { label: 'Q' });
  return {
    nodes: [d, clk, ff, q],
    wires: [W(d.id, ff.id, 0), W(clk.id, ff.id, 1, 0, { isClockWire: true }), W(ff.id, q.id, 0)],
  };
}

// ── 1. Registry CRUD ──────────────────────────────────────────
console.log('[1] Registry CRUD — define, get, list, remove, missing');
{
  const reg = new SubCircuitRegistry();
  check('empty list initially', reg.list().length === 0);
  check('get(missing) === null', reg.get('nope') === null);

  const def1 = reg.define('and2', ...Object.values(buildAndDef()));
  check('define returns def object',  def1 && def1.name === 'and2');
  check('get(name) returns same def', reg.get('and2') === def1);
  check('list contains the name',     reg.list().includes('and2'));

  const def2 = reg.define('dff',  ...Object.values(buildDffDef()));
  check('list grows to 2',            reg.list().length === 2);

  reg.remove('and2');
  check('remove drops from list',     reg.list().length === 1 && !reg.list().includes('and2'));
  check('get after remove === null',  reg.get('and2') === null);
}

// ── 2. INPUT / OUTPUT auto-detection ──────────────────────────
console.log('\n[2] define() detects INPUT/OUTPUT as the sub-circuit interface');
{
  const reg = new SubCircuitRegistry();
  const def = reg.define('and2', ...Object.values(buildAndDef()));
  check('detected 2 inputs',                 def.inputs.length === 2);
  check('detected 1 output',                 def.outputs.length === 1);
  check('input[0].label = "A"',              def.inputs[0].label === 'A');
  check('input[1].label = "B"',              def.inputs[1].label === 'B');
  check('output[0].label = "Y"',             def.outputs[0].label === 'Y');
  check('input[0].index = 0',                def.inputs[0].index === 0);
  check('input[1].index = 1',                def.inputs[1].index === 1);
}

// ── 3. createInstance — deep-cloned, mutually independent ─────
console.log('\n[3] createInstance — independent deep clones');
{
  const reg = new SubCircuitRegistry();
  reg.define('and2', ...Object.values(buildAndDef()));
  const i1 = reg.createInstance('and2', 0, 0, 'i1');
  const i2 = reg.createInstance('and2', 0, 0, 'i2');
  check('instance type === SUB_CIRCUIT',          i1.type === 'SUB_CIRCUIT');
  check('instance subName matches',                i1.subName === 'and2');
  check('two instances have distinct subCircuit',  i1.subCircuit !== i2.subCircuit);
  check('two instances have distinct subInputs',   i1.subInputs !== i2.subInputs);
  // Mutating i1 must not bleed into i2.
  i1.subCircuit.nodes[0].label = 'MUTATED';
  check('mutating i1 internal does not affect i2',
        i2.subCircuit.nodes[0].label === 'A');
  // createInstance for missing name → null.
  check('createInstance(missing) === null',         reg.createInstance('nope', 0, 0, 'x') === null);
}

// ── 4. End-to-end combinational AND through sub-circuit ───────
console.log('\n[4] End-to-end — AND sub-circuit wired into outer scene');
{
  const reg = new SubCircuitRegistry();
  reg.define('and2', ...Object.values(buildAndDef()));
  reset();
  const inst = reg.createInstance('and2', 0, 0, 'sub');
  const eA   = mk('INPUT',  { fixedValue: 1, label: 'eA' });
  const eB   = mk('INPUT',  { fixedValue: 1, label: 'eB' });
  const eOut = mk('OUTPUT', { label: 'eOUT' });
  const wires = [
    W(eA.id, inst.id, 0),
    W(eB.id, inst.id, 1),
    W(inst.id, eOut.id, 0, 0),
  ];
  let r = evaluate([eA, eB, inst, eOut], wires, new Map(), 0);
  check('1 AND 1 → outer OUT = 1',                r.nodeValues.get(eOut.id) === 1);
  check('SUB_CIRCUIT.__out0 mirrors OUT',         r.nodeValues.get(inst.id + '__out0') === 1);
  eB.fixedValue = 0;
  r = evaluate([eA, eB, inst, eOut], wires, new Map(), 0);
  check('1 AND 0 → outer OUT = 0',                r.nodeValues.get(eOut.id) === 0);
  eA.fixedValue = 0;
  r = evaluate([eA, eB, inst, eOut], wires, new Map(), 0);
  check('0 AND 0 → outer OUT = 0',                r.nodeValues.get(eOut.id) === 0);
}

// ── 5. End-to-end sequential D-FF in a sub-circuit ────────────
// Uses the standard "drop external CLK to 0 between rising edges"
// pattern, which is how every production demo drives clocks.
console.log('\n[5] End-to-end — D-FF sub-circuit with external clock');
{
  const reg = new SubCircuitRegistry();
  reg.define('dff', ...Object.values(buildDffDef()));
  reset();
  const inst = reg.createInstance('dff', 0, 0, 'sub');
  const eD   = mk('INPUT',  { fixedValue: 1, label: 'eD' });
  const eClk = mk('CLOCK',  { value: 0 });
  const eOut = mk('OUTPUT', { label: 'eOUT' });
  const wires = [
    W(eD.id,   inst.id, 0),
    W(eClk.id, inst.id, 1, 0, { isClockWire: true }),
    W(inst.id, eOut.id, 0, 0),
  ];
  const ffs = new Map();
  // Helper: one full clock period (0 → 1 → 0).
  function tick() {
    eClk.value = 1; const r = evaluate([eD, eClk, inst, eOut], wires, ffs, 0);
    eClk.value = 0; evaluate([eD, eClk, inst, eOut], wires, ffs, 0);
    return r;
  }
  let r = evaluate([eD, eClk, inst, eOut], wires, ffs, 0);
  check('initial Q = 0',                                r.nodeValues.get(eOut.id) === 0);
  r = tick();
  check('tick with D=1 → Q = 1',                        r.nodeValues.get(eOut.id) === 1);
  r = tick();
  check('tick again with D=1 → Q stays 1',              r.nodeValues.get(eOut.id) === 1);
  eD.fixedValue = 0;
  r = tick();
  check('tick with D=0 → Q = 0',                        r.nodeValues.get(eOut.id) === 0);
  r = tick();
  check('tick again with D=0 → Q stays 0',              r.nodeValues.get(eOut.id) === 0);
}

// ── 6. Two instances of the same definition — isolated state ─
console.log('\n[6] Two D-FF instances — independent _subFfStates');
{
  const reg = new SubCircuitRegistry();
  reg.define('dff', ...Object.values(buildDffDef()));
  reset();
  const i1 = reg.createInstance('dff', 0, 0, 'i1');
  const i2 = reg.createInstance('dff', 0, 0, 'i2');
  const d1 = mk('INPUT',  { fixedValue: 1, label: 'd1' });
  const d2 = mk('INPUT',  { fixedValue: 0, label: 'd2' });
  const ck = mk('CLOCK',  { value: 0 });
  const o1 = mk('OUTPUT', { label: 'o1' });
  const o2 = mk('OUTPUT', { label: 'o2' });
  const wires = [
    W(d1.id, i1.id, 0), W(ck.id, i1.id, 1, 0, { isClockWire: true }), W(i1.id, o1.id, 0, 0),
    W(d2.id, i2.id, 0), W(ck.id, i2.id, 1, 0, { isClockWire: true }), W(i2.id, o2.id, 0, 0),
  ];
  const ffs = new Map();
  // Standard contract: first evaluate with CLK=0 to seed prevClk
  // before driving any rising edges (same as every primary-FF demo).
  evaluate([d1, d2, ck, i1, i2, o1, o2], wires, ffs, 0);
  function tick() {
    ck.value = 1; const r = evaluate([d1, d2, ck, i1, i2, o1, o2], wires, ffs, 0);
    ck.value = 0; evaluate([d1, d2, ck, i1, i2, o1, o2], wires, ffs, 0);
    return r;
  }
  let r = tick();
  check('after first edge: o1=1, o2=0',
        r.nodeValues.get(o1.id) === 1 && r.nodeValues.get(o2.id) === 0);
  d1.fixedValue = 0; d2.fixedValue = 1;
  r = tick();
  check('after second edge with swapped Ds: o1=0, o2=1 (state independent)',
        r.nodeValues.get(o1.id) === 0 && r.nodeValues.get(o2.id) === 1);
}

// ── 7. serialize / deserialize round-trip ─────────────────────
console.log('\n[7] serialize → deserialize round-trip');
{
  const reg1 = new SubCircuitRegistry();
  reg1.define('and2', ...Object.values(buildAndDef()));
  reg1.define('dff',  ...Object.values(buildDffDef()));
  const dump = reg1.serialize();
  const reg2 = new SubCircuitRegistry();
  reg2.deserialize(dump);
  check('round-tripped registry has same names',
        reg2.list().sort().join(',') === reg1.list().sort().join(','));
  const def = reg2.get('and2');
  check('round-tripped def has 2 inputs',  def && def.inputs.length === 2);
  check('round-tripped def has 1 output',  def && def.outputs.length === 1);
  // Instance from the deserialized def still works.
  reset();
  const inst = reg2.createInstance('and2', 0, 0, 'sub');
  const eA   = mk('INPUT',  { fixedValue: 1 });
  const eB   = mk('INPUT',  { fixedValue: 1 });
  const eOut = mk('OUTPUT', {});
  const wires = [W(eA.id, inst.id, 0), W(eB.id, inst.id, 1), W(inst.id, eOut.id, 0, 0)];
  const r = evaluate([eA, eB, inst, eOut], wires, new Map(), 0);
  check('instance from deserialized def still computes 1 AND 1 = 1',
        r.nodeValues.get(eOut.id) === 1);
}

// ── 8. SUB_CIRCUIT FF must behave identically to inlined FF ───
// A clocked sub-circuit must NOT re-latch on every outer evaluate().
// It should latch exactly once per external 0→1 transition of its
// CLK input — same contract as a primary FF outside the sub-circuit.
console.log('\n[8] Inlined-FF equivalence — multiple evaluate() with held CLK does NOT re-latch');
{
  const reg = new SubCircuitRegistry();
  reg.define('dff', ...Object.values(buildDffDef()));
  reset();
  const inst = reg.createInstance('dff', 0, 0, 'sub');
  const eD   = mk('INPUT', { fixedValue: 1, label: 'eD' });
  const eClk = mk('CLOCK', { value: 0 });
  const eOut = mk('OUTPUT', { label: 'eOUT' });
  const wires = [
    W(eD.id, inst.id, 0),
    W(eClk.id, inst.id, 1, 0, { isClockWire: true }),
    W(inst.id, eOut.id, 0, 0),
  ];
  const ffs = new Map();
  // Setup the FF with D=1 captured on a real 0→1 edge.
  evaluate([eD, eClk, inst, eOut], wires, ffs, 0);   // CLK=0
  eClk.value = 1;
  let r = evaluate([eD, eClk, inst, eOut], wires, ffs, 0);   // CLK=1, edge → latch D=1
  check('after first 0→1 edge with D=1: Q = 1', r.nodeValues.get(eOut.id) === 1);

  // Now hold CLK=1 and change D. The FF MUST hold its old value
  // because there's no new edge — same as a primary D-FF would.
  eD.fixedValue = 0;
  r = evaluate([eD, eClk, inst, eOut], wires, ffs, 0);
  check('hold CLK=1, D dropped to 0, eval again → Q stays 1 (no edge)',
        r.nodeValues.get(eOut.id) === 1);
  r = evaluate([eD, eClk, inst, eOut], wires, ffs, 0);
  check('hold CLK=1, eval third time → Q still 1',
        r.nodeValues.get(eOut.id) === 1);

  // Drop CLK to 0 (still no edge for rising-edge FF).
  eClk.value = 0;
  r = evaluate([eD, eClk, inst, eOut], wires, ffs, 0);
  check('CLK 1→0 with D=0 → Q still 1 (only rising edges latch)',
        r.nodeValues.get(eOut.id) === 1);

  // Now a real 0→1 transition with D=0 should finally latch the new value.
  eClk.value = 1;
  r = evaluate([eD, eClk, inst, eOut], wires, ffs, 0);
  check('next genuine 0→1 edge with D=0 → Q = 0',
        r.nodeValues.get(eOut.id) === 0);
}

// ── Summary ───────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
