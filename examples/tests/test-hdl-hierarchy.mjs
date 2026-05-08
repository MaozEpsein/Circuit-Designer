// Phase 6 — Hierarchy & Sub-circuits.
//
// Run:  node examples/tests/test-hdl-hierarchy.mjs

import { exportCircuit } from '../../js/hdl/VerilogExporter.js';
import { parseCheck, isIverilogAvailable } from '../../js/hdl/verify/iverilog.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('\n-- HDL Phase 6 — Hierarchy --');

// A reusable "mux2_1bit" sub-circuit JSON: two inputs + select → one output,
// implemented inline by the subcircuit's GATE_SLOT instances.
function mux2() {
  return {
    nodes: [
      { id: 'a',   type: 'INPUT',  label: 'a' },
      { id: 'b',   type: 'INPUT',  label: 'b' },
      { id: 'sel', type: 'INPUT',  label: 'sel' },
      { id: 'nsel', type: 'GATE_SLOT', gate: 'NOT', label: 'nsel' },
      { id: 'a_g',  type: 'GATE_SLOT', gate: 'AND', label: 'a_g' },
      { id: 'b_g',  type: 'GATE_SLOT', gate: 'AND', label: 'b_g' },
      { id: 'or_g', type: 'GATE_SLOT', gate: 'OR',  label: 'or_g' },
      { id: 'y',   type: 'OUTPUT', label: 'y' },
    ],
    wires: [
      { id: 'w1', sourceId: 'sel', targetId: 'nsel', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'a',   targetId: 'a_g',  targetInputIndex: 0 },
      { id: 'w3', sourceId: 'nsel', sourceOutputIndex: 0, targetId: 'a_g', targetInputIndex: 1 },
      { id: 'w4', sourceId: 'b',   targetId: 'b_g',  targetInputIndex: 0 },
      { id: 'w5', sourceId: 'sel', targetId: 'b_g',  targetInputIndex: 1 },
      { id: 'w6', sourceId: 'a_g', sourceOutputIndex: 0, targetId: 'or_g', targetInputIndex: 0 },
      { id: 'w7', sourceId: 'b_g', sourceOutputIndex: 0, targetId: 'or_g', targetInputIndex: 1 },
      { id: 'w8', sourceId: 'or_g', sourceOutputIndex: 0, targetId: 'y',   targetInputIndex: 0 },
    ],
  };
}

// ── 1: single sub-circuit ────────────────────────────────────
console.log('Single sub-circuit emits its own module');
{
  const v = exportCircuit({
    nodes: [
      { id: 'in1', type: 'INPUT', label: 'in1' },
      { id: 'in2', type: 'INPUT', label: 'in2' },
      { id: 'sel', type: 'INPUT', label: 'sel' },
      { id: 'm', type: 'SUB_CIRCUIT', subName: 'mux2', label: 'm1',
        subCircuit: mux2(),
        subInputs:  [{ id: 'a' }, { id: 'b' }, { id: 'sel' }],
        subOutputs: [{ id: 'y' }],
      },
      { id: 'out', type: 'OUTPUT', label: 'out' },
    ],
    wires: [
      { id: 'wa', sourceId: 'in1', targetId: 'm', targetInputIndex: 0 },
      { id: 'wb', sourceId: 'in2', targetId: 'm', targetInputIndex: 1 },
      { id: 'ws', sourceId: 'sel', targetId: 'm', targetInputIndex: 2 },
      { id: 'wo', sourceId: 'm', sourceOutputIndex: 0, targetId: 'out', targetInputIndex: 0 },
    ],
  }, { topName: 'top1', header: false });

  const modCount = (v.match(/^module /gm) || []).length;
  check('emits exactly two modules (sub + top)', modCount === 2,
    `got ${modCount}`);
  check('submodule named after subName',         /^module\s+mux2\b/m.test(v));
  check('submodule has correct ports',
    /module\s+mux2\([\s\S]*?input\s+a[\s\S]*?input\s+b[\s\S]*?input\s+sel[\s\S]*?output\s+y[\s\S]*?\)/.test(v));
  check('top instantiates submodule with named ports',
    /mux2\s+\w+\s*\(\s*\.a\(in1\),\s*\.b\(in2\),\s*\.sel\(sel\),\s*\.y\(\w+\)\s*\)/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('iverilog parses', r.ok, r.stderr);
  }
}

// ── 2: de-duplication ────────────────────────────────────────
console.log('Identical sub-circuits de-dup to one module');
{
  const sc = mux2();
  const v = exportCircuit({
    nodes: [
      { id: 'a1', type: 'INPUT', label: 'a1' },
      { id: 'b1', type: 'INPUT', label: 'b1' },
      { id: 's1', type: 'INPUT', label: 's1' },
      { id: 'a2', type: 'INPUT', label: 'a2' },
      { id: 'b2', type: 'INPUT', label: 'b2' },
      { id: 's2', type: 'INPUT', label: 's2' },
      { id: 'm1', type: 'SUB_CIRCUIT', subName: 'mux2', label: 'inst1',
        subCircuit: sc,
        subInputs:  [{ id: 'a' }, { id: 'b' }, { id: 'sel' }],
        subOutputs: [{ id: 'y' }] },
      { id: 'm2', type: 'SUB_CIRCUIT', subName: 'mux2', label: 'inst2',
        subCircuit: sc,
        subInputs:  [{ id: 'a' }, { id: 'b' }, { id: 'sel' }],
        subOutputs: [{ id: 'y' }] },
      { id: 'o1', type: 'OUTPUT', label: 'o1' },
      { id: 'o2', type: 'OUTPUT', label: 'o2' },
    ],
    wires: [
      { id: 'w1', sourceId: 'a1', targetId: 'm1', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'b1', targetId: 'm1', targetInputIndex: 1 },
      { id: 'w3', sourceId: 's1', targetId: 'm1', targetInputIndex: 2 },
      { id: 'w4', sourceId: 'a2', targetId: 'm2', targetInputIndex: 0 },
      { id: 'w5', sourceId: 'b2', targetId: 'm2', targetInputIndex: 1 },
      { id: 'w6', sourceId: 's2', targetId: 'm2', targetInputIndex: 2 },
      { id: 'w7', sourceId: 'm1', sourceOutputIndex: 0, targetId: 'o1', targetInputIndex: 0 },
      { id: 'w8', sourceId: 'm2', sourceOutputIndex: 0, targetId: 'o2', targetInputIndex: 0 },
    ],
  }, { topName: 'top2', header: false });

  const modCount = (v.match(/^module /gm) || []).length;
  check('two instances → still only two modules (sub+top)', modCount === 2,
    `got ${modCount}`);
  const subDefs = (v.match(/^module\s+mux2\b/gm) || []).length;
  check('only one mux2 definition', subDefs === 1, `got ${subDefs}`);
  const subInsts = (v.match(/^\s*mux2\s+\w+\s*\(/gm) || []).length;
  check('two mux2 instantiations', subInsts === 2, `got ${subInsts}`);
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('iverilog parses', r.ok, r.stderr);
  }
}

// ── 3: nested hierarchy (2 levels) ───────────────────────────
console.log('Nested hierarchy (2 levels deep)');
{
  // Inner sub-circuit: mux2.
  // Outer sub-circuit: contains a mux2 instance + its own ports.
  const innerSC = mux2();
  const outerSC = {
    nodes: [
      { id: 'pa', type: 'INPUT',  label: 'pa' },
      { id: 'pb', type: 'INPUT',  label: 'pb' },
      { id: 'ps', type: 'INPUT',  label: 'ps' },
      { id: 'inner', type: 'SUB_CIRCUIT', subName: 'mux2',
        subCircuit: innerSC,
        subInputs:  [{ id: 'a' }, { id: 'b' }, { id: 'sel' }],
        subOutputs: [{ id: 'y' }] },
      { id: 'po', type: 'OUTPUT', label: 'po' },
    ],
    wires: [
      { id: 'iw1', sourceId: 'pa', targetId: 'inner', targetInputIndex: 0 },
      { id: 'iw2', sourceId: 'pb', targetId: 'inner', targetInputIndex: 1 },
      { id: 'iw3', sourceId: 'ps', targetId: 'inner', targetInputIndex: 2 },
      { id: 'iw4', sourceId: 'inner', sourceOutputIndex: 0, targetId: 'po', targetInputIndex: 0 },
    ],
  };
  const v = exportCircuit({
    nodes: [
      { id: 'a', type: 'INPUT', label: 'a' },
      { id: 'b', type: 'INPUT', label: 'b' },
      { id: 's', type: 'INPUT', label: 's' },
      { id: 'wrap', type: 'SUB_CIRCUIT', subName: 'wrapper',
        subCircuit: outerSC,
        subInputs:  [{ id: 'pa' }, { id: 'pb' }, { id: 'ps' }],
        subOutputs: [{ id: 'po' }] },
      { id: 'y', type: 'OUTPUT', label: 'y' },
    ],
    wires: [
      { id: 'w1', sourceId: 'a', targetId: 'wrap', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'b', targetId: 'wrap', targetInputIndex: 1 },
      { id: 'w3', sourceId: 's', targetId: 'wrap', targetInputIndex: 2 },
      { id: 'w4', sourceId: 'wrap', sourceOutputIndex: 0, targetId: 'y', targetInputIndex: 0 },
    ],
  }, { topName: 'top3', header: false });

  const modCount = (v.match(/^module /gm) || []).length;
  check('three modules emitted (mux2 + wrapper + top)', modCount === 3,
    `got ${modCount}`);
  check('mux2 module present',    /^module\s+mux2\b/m.test(v));
  check('wrapper module present', /^module\s+wrapper\b/m.test(v));
  // Inner module must be defined BEFORE wrapper (Verilog requires
  // definitions before use).
  const idxMux  = v.search(/^module\s+mux2\b/m);
  const idxWrap = v.search(/^module\s+wrapper\b/m);
  const idxTop  = v.search(/^module\s+top3\b/m);
  check('definition order: mux2 < wrapper < top3',
    idxMux >= 0 && idxWrap > idxMux && idxTop > idxWrap);
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('iverilog parses', r.ok, r.stderr);
  }
}

// ── 4: stable re-export (L3 gate) ────────────────────────────
console.log('Re-export of same circuit yields byte-identical output');
{
  const c = {
    nodes: [
      { id: 'a', type: 'INPUT', label: 'a' },
      { id: 'b', type: 'INPUT', label: 'b' },
      { id: 's', type: 'INPUT', label: 's' },
      { id: 'm', type: 'SUB_CIRCUIT', subName: 'mux2', label: 'mx',
        subCircuit: mux2(),
        subInputs:  [{ id: 'a' }, { id: 'b' }, { id: 'sel' }],
        subOutputs: [{ id: 'y' }] },
      { id: 'y', type: 'OUTPUT', label: 'y' },
    ],
    wires: [
      { id: 'w1', sourceId: 'a', targetId: 'm', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'b', targetId: 'm', targetInputIndex: 1 },
      { id: 'w3', sourceId: 's', targetId: 'm', targetInputIndex: 2 },
      { id: 'w4', sourceId: 'm', sourceOutputIndex: 0, targetId: 'y', targetInputIndex: 0 },
    ],
  };
  const v1 = exportCircuit(JSON.parse(JSON.stringify(c)), { topName: 'rt', header: false });
  const v2 = exportCircuit(JSON.parse(JSON.stringify(c)), { topName: 'rt', header: false });
  check('byte-identical', v1 === v2);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
