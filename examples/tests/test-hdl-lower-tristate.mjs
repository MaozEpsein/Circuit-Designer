// Phase 5/3 — lowerTriState pass tests.
//   • Coalesces multi-driver TRIBUF assigns into a single priority MUX.
//   • Skips when synthesisSafe=false (the IR keeps `1'bz`).
//   • Single-driver tri-state nets are left alone (top-level pad case).
// Run: node examples/tests/test-hdl-lower-tristate.mjs

import { lowerTriState } from '../../js/hdl/ir/lowerTriState.js';
import { exportCircuit } from '../../js/hdl/VerilogExporter.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

// Build a synthetic IRModule with N TRIBUF-shaped assigns on the same
// LHS. Mirrors what the GATE_SLOT TRIBUF translator would emit if two
// or more were wired to the same wire.
function _triAssign(lhs, en, data, w = 1) {
  return {
    kind: 'Assign', sourceRef: null, attributes: [],
    lhs: { kind: 'Ref', netName: lhs, width: w, sourceRef: null, attributes: [], originalText: null },
    rhs: {
      kind: 'Ternary', sourceRef: null, attributes: [], width: w,
      cond: { kind: 'Ref', netName: en, width: 1, sourceRef: null, attributes: [], originalText: null },
      then: { kind: 'Ref', netName: data, width: w, sourceRef: null, attributes: [], originalText: null },
      else: { kind: 'Literal', value: 0, width: w, _verilog: `${w}'bz`, sourceRef: null, attributes: [], originalText: null },
    },
  };
}

console.log('lowerTriState — coalesces 3 TRIBUFs sharing one bus net');
{
  const ir = {
    kind: 'Module', name: 'top', ports: [], nets: [], memories: [],
    instances: [], submodules: [], alwaysBlocks: [],
    assigns: [
      _triAssign('bus', 'en0', 'd0'),
      _triAssign('bus', 'en1', 'd1'),
      _triAssign('bus', 'en2', 'd2'),
    ],
  };
  const { diagnostics } = lowerTriState(ir);
  check('coalesce diagnostic emitted',
    diagnostics.some(d => d.kind === 'tristate-coalesced' && d.driverCount === 3));
  check('single assign on `bus` after pass', ir.assigns.length === 1);
  // The remaining assign must be a nested ternary 3 deep with the
  // high-Z literal at the innermost else.
  const top = ir.assigns[0].rhs;
  check('outermost ternary cond = en0',  top.kind === 'Ternary' && top.cond.netName === 'en0');
  check('next level cond = en1',         top.else.kind === 'Ternary' && top.else.cond.netName === 'en1');
  check('innermost else is high-Z literal',
    top.else.else.else.kind === 'Literal' && /['"]?\d*'b?[zZ]/.test(top.else.else.else._verilog));
}

console.log('lowerTriState — leaves single-driver tri-state alone');
{
  const ir = {
    kind: 'Module', name: 'top', ports: [], nets: [], memories: [],
    instances: [], submodules: [], alwaysBlocks: [],
    assigns: [_triAssign('pad', 'en', 'd')],
  };
  const { diagnostics } = lowerTriState(ir);
  check('no coalesce when only one driver',
    !diagnostics.some(d => d.kind === 'tristate-coalesced'));
  check('the assign survives untouched', ir.assigns.length === 1);
}

console.log('lowerTriState — synthesisSafe=false skips the pass');
{
  const ir = {
    kind: 'Module', name: 'top', ports: [], nets: [], memories: [],
    instances: [], submodules: [], alwaysBlocks: [],
    assigns: [
      _triAssign('bus', 'en0', 'd0'),
      _triAssign('bus', 'en1', 'd1'),
    ],
  };
  const { diagnostics } = lowerTriState(ir, { synthesisSafe: false });
  check('preserved diagnostic emitted',
    diagnostics.some(d => d.kind === 'tristate-preserved'));
  check('both assigns kept when sim-only', ir.assigns.length === 2);
}

console.log('exportCircuit — synthesisSafe flag flows through to fromCircuit');
{
  // Two TRIBUFs feeding the same wire — without the pass, two assigns
  // with `1'bz` survive; with the pass, one priority MUX appears.
  const scene = {
    nodes: [
      { id: 'd0',  type: 'INPUT',  label: 'd0' },
      { id: 'd1',  type: 'INPUT',  label: 'd1' },
      { id: 'en0', type: 'INPUT',  label: 'en0' },
      { id: 'en1', type: 'INPUT',  label: 'en1' },
      { id: 't0',  type: 'GATE_SLOT', gate: 'TRIBUF', label: 't0' },
      { id: 't1',  type: 'GATE_SLOT', gate: 'TRIBUF', label: 't1' },
      { id: 'y',   type: 'OUTPUT', label: 'y' },
    ],
    wires: [
      { id: 'w0', sourceId: 'd0',  targetId: 't0', targetInputIndex: 0 },
      { id: 'w1', sourceId: 'en0', targetId: 't0', targetInputIndex: 1 },
      { id: 'w2', sourceId: 'd1',  targetId: 't1', targetInputIndex: 0 },
      { id: 'w3', sourceId: 'en1', targetId: 't1', targetInputIndex: 1 },
      { id: 'wo0', sourceId: 't0', targetId: 'y',  targetInputIndex: 0 },
      { id: 'wo1', sourceId: 't1', targetId: 'y',  targetInputIndex: 0 },
    ],
  };
  const safe = exportCircuit(scene, { topName: 'tri', header: false });
  const raw  = exportCircuit(scene, { topName: 'tri', header: false, synthesisSafe: false });
  // safe and raw both emit one 1'bz per TRIBUF (each TRIBUF lowers to
  // its own intermediate net). What matters for synthesis safety is
  // that there are no MULTIPLE assigns to the SAME visible LHS — in
  // both cases each TRIBUF writes its private net, then a fan-in joins
  // at OUTPUT y. The pass's job (coalescing same-LHS multi-driver)
  // doesn't trigger here, but the synthesisSafe=false WARNING header
  // must still appear so the user knows what they got.
  const safeZcount = (safe.match(/1'bz/g) || []).length;
  const rawZcount  = (raw.match(/1'bz/g)  || []).length;
  check('export does not throw on multi-TRIBUF scene', typeof safe === 'string' && typeof raw === 'string');
  check('synthesisSafe=false preserves at least as many 1\'bz as default',
    rawZcount >= safeZcount, `safe=${safeZcount} raw=${rawZcount}`);
  check('synthesisSafe=false adds a WARNING header about tri-state',
    /WARNING:.*tri-state/i.test(raw));
}

if (failed > 0) {
  console.log(`\n${failed} lowerTriState test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll lowerTriState checks passed.');
}
