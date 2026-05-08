// Phase 2 — HDL-IR, validator, determinism, round-trip stub, iverilog gate.
// Run:  node examples/tests/test-hdl-ir.mjs

import {
  makeModule, makePort, makeNet, makeInstance, makeRef,
  makeZeroExtend, ensureWidth, PORT_DIR, NET_KIND,
} from '../../js/hdl/ir/types.js';
import { toVerilog } from '../../js/hdl/ir/toVerilog.js';
import { equals, equalsByVerilog } from '../../js/hdl/ir/equals.js';
import { fromCircuit } from '../../js/hdl/ir/fromCircuit.js';
import { roundTripIR, isDeterministic } from '../../js/hdl/verify/roundTrip.js';
import { parseCheck, isIverilogAvailable } from '../../js/hdl/verify/iverilog.js';
import { validateCircuit, hasBlockingErrors } from '../../js/hdl/core/CircuitValidator.js';
import { HDLError, SEVERITY } from '../../js/hdl/core/HDLError.js';
import { SourceRef, formatSourceRef } from '../../js/hdl/core/SourceRef.js';
import { registerTranslator } from '../../js/hdl/translators/index.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

// ── IR construction & toVerilog ──────────────────────────────
console.log('IR — construction & pretty print');
{
  const m = makeModule({
    name: 'empty',
    ports: [],
    nets: [],
    instances: [],
  });
  const v = toVerilog(m);
  check('empty module emits module..endmodule', /module empty;[\s\S]*endmodule/.test(v));
  check('no trailing tail content', v.endsWith('\n'));
}

{
  const m = makeModule({
    name: 'pass_through',
    ports: [
      makePort({ name: 'a', dir: PORT_DIR.INPUT, width: 8 }),
      makePort({ name: 'y', dir: PORT_DIR.OUTPUT, width: 8 }),
    ],
    nets: [],
    instances: [],
    assigns: [],
  });
  const v = toVerilog(m);
  check('input [7:0] a present', /input\s+\[7:0\]\s+a/.test(v));
  check('output [7:0] y present', /output\s+\[7:0\]\s+y/.test(v));
}

// ── Determinism ──────────────────────────────────────────────
console.log('IR — determinism');
{
  const m = makeModule({
    name: 't',
    ports: [
      makePort({ name: 'b', dir: PORT_DIR.INPUT, width: 1 }),
      makePort({ name: 'a', dir: PORT_DIR.INPUT, width: 1 }),
    ],
    nets: [
      makeNet({ name: 'w', width: 1 }),
    ],
    instances: [
      makeInstance({
        type: 'and', instanceName: 'g1',
        portMap: { A: makeRef('a', 1), B: makeRef('b', 1), Y: makeRef('w', 1) },
      }),
    ],
  });
  check('toVerilog deterministic over 10 runs', isDeterministic(m, 10));
  check('equalsByVerilog(self,self)', equalsByVerilog(m, m));
  check('equals(self,self)', equals(m, m));
}

// ── Width handling ───────────────────────────────────────────
console.log('IR — widths & extension');
{
  const ref4 = makeRef('x', 4);
  const wide = ensureWidth(ref4, 8);
  check('ensureWidth widens via ZeroExtend', wide.kind === 'ZeroExtend' && wide.width === 8);
  check('ensureWidth no-op when equal',      ensureWidth(ref4, 4) === ref4);

  const m = makeModule({
    name: 'w', ports: [], nets: [],
    instances: [],
  });
  // Inline an assign using ZeroExtend to confirm emission.
  m.assigns = [{ kind: 'Assign', sourceRef: SourceRef.unknown(), attributes: [],
    lhs: makeRef('y', 8),
    rhs: makeZeroExtend(makeRef('x', 4), 8),
  }];
  const v = toVerilog(m);
  check('ZeroExtend emits {4\'b0, x}', v.includes("{4'b0, x}"));
}

// ── fromCircuit: empty circuit ───────────────────────────────
console.log('IR — fromCircuit');
{
  const ir = fromCircuit({ nodes: [], wires: [] });
  check('empty → module top', ir.name === 'top' && ir.ports.length === 0);
}

{
  const ir = fromCircuit({
    nodes: [
      { id: 'n1', type: 'INPUT',  label: 'a',   bitWidth: 1 },
      { id: 'n2', type: 'OUTPUT', label: 'y',   bitWidth: 1 },
    ],
    wires: [],
  });
  check('port order preserved', ir.ports[0].name === 'a' && ir.ports[1].name === 'y');
  check('input dir',  ir.ports[0].dir === PORT_DIR.INPUT);
  check('output dir', ir.ports[1].dir === PORT_DIR.OUTPUT);
}

// ── Identifier stability ─────────────────────────────────────
console.log('IR — identifier stability');
{
  const ir = fromCircuit({
    nodes: [
      { id: 'n1', type: 'INPUT', label: 'my_signal', bitWidth: 4 },
      { id: 'n2', type: 'INPUT', label: 'another',   bitWidth: 1 },
      { id: 'g1', type: 'SOME_GATE' },   // no translator → no instance; wire-source
    ],
    wires: [
      { id: 'w1', sourceId: 'g1', sourceOutputIndex: 0, targetId: 'n1', netName: 'preferred_name' },
    ],
  });
  const names = ir.nets.map(n => n.name);
  check('user netName preserved', names.includes('preferred_name'));
  const net = ir.nets.find(n => n.name === 'preferred_name');
  check('originalName recorded', net && net.originalName === 'preferred_name');
}

// ── Pipeline `stage` carried into IR instance attributes ─────
// The pipelining analyzer paints a `stage` field on nodes; fromCircuit
// must preserve it as an opaque attribute so Phase 4's PIPE translator
// and Phase 7's pretty-printer (stage-comment dividers) can read it.
console.log('IR — pipeline stage attribute');
{
  // Register a stub translator so a fake component type makes it through
  // to the instance list. Returns a minimal IRInstance.
  registerTranslator('STAGE_STUB', (node) => ({
    instance: makeInstance({
      type: 'stage_stub',
      portMap: {},
      sourceRef: SourceRef.fromNode(node.id),
    }),
  }));

  const ir = fromCircuit({
    nodes: [
      { id: 's1', type: 'STAGE_STUB', stage: 2 },
      { id: 's2', type: 'STAGE_STUB' },             // no stage field
    ],
    wires: [],
  });

  const inst1 = ir.instances.find(i => i.type === 'stage_stub'
    && i.attributes.some(a => a.key === 'stage'));
  check('node.stage propagated to IR attribute',
    !!inst1, 'expected a stage_stub instance with stage attribute');
  check('stage attribute value matches',
    !!inst1 && inst1.attributes.find(a => a.key === 'stage')?.value === 2);
  const inst2 = ir.instances.find(i => i.type === 'stage_stub'
    && !i.attributes.some(a => a.key === 'stage'));
  check('instance without node.stage has no stage attribute',
    !!inst2, 'second instance should carry no stage attribute');
}

// ── CircuitValidator ─────────────────────────────────────────
console.log('Validator');
{
  const errs = validateCircuit({
    nodes: [{ id: 'a', type: 'INPUT' }, { id: 'a', type: 'OUTPUT' }],
    wires: [],
  });
  check('duplicate id caught', errs.some(e => e.code === 'HDL_VALIDATE_DUPLICATE_ID'));
  check('has blocking errors', hasBlockingErrors(errs));
}

{
  const errs = validateCircuit({
    nodes: [{ id: 'a', type: 'INPUT' }],
    wires: [{ id: 'w', sourceId: 'a', targetId: 'nonexistent' }],
  });
  check('dangling target caught', errs.some(e => e.code === 'HDL_VALIDATE_DANGLING_TARGET'));
}

{
  const errs = validateCircuit({
    nodes: [{ id: 'g', type: 'AND' }],
    wires: [],
  }, { hasTranslator: () => false });
  const w = errs.find(e => e.code === 'HDL_VALIDATE_NO_TRANSLATOR');
  check('no-translator surfaces as warning', w && w.severity === SEVERITY.WARNING);
  check('no blocking errors on warning-only', !hasBlockingErrors(errs));
}

// ── HDLError shape ───────────────────────────────────────────
console.log('HDLError');
{
  const e = new HDLError({
    code: 'HDL_TEST_SHAPE',
    message: 'shape check',
    sourceRef: SourceRef.fromNode('n42'),
    hint: 'a hint',
  });
  check('severity default error', e.severity === SEVERITY.ERROR);
  check('nodeId lifted for ErrorOverlay', e.nodeId === 'n42');
  check('has hint',                      e.hint === 'a hint');
  check('toString includes code',        String(e).includes('HDL_TEST_SHAPE'));
}

// ── Round-trip (stub) ────────────────────────────────────────
console.log('Round-trip (stub parser)');
{
  const m = makeModule({
    name: 'rt',
    ports: [makePort({ name: 'a', dir: PORT_DIR.INPUT, width: 1 })],
    nets: [],
    instances: [],
  });
  const r = roundTripIR(m);
  check('round-trip ok', r.ok);
  check('verilog present', r.verilog.includes('module rt'));
}

// ── iverilog L1 gate (skipped cleanly if absent) ─────────────
console.log('iverilog L1 (syntax)');
if (isIverilogAvailable()) {
  const m = makeModule({
    name: 'iv_test',
    ports: [
      makePort({ name: 'a', dir: PORT_DIR.INPUT, width: 8 }),
      makePort({ name: 'y', dir: PORT_DIR.OUTPUT, width: 8 }),
    ],
    nets: [],
    instances: [],
    assigns: [{ kind: 'Assign', sourceRef: SourceRef.unknown(), attributes: [],
      lhs: makeRef('y', 8), rhs: makeRef('a', 8) }],
  });
  const v = toVerilog(m);
  const r = parseCheck(v);
  check('iverilog parses emitted design', r.ok, r.stderr.slice(0, 120));
} else {
  console.log('  [SKIP] iverilog not installed — install Icarus Verilog to enable L1 gate');
}

// ── exportCircuit determinism (user-facing API, no timestamp) ───
console.log('exportCircuit — default determinism');
{
  const { exportCircuit } = await import('../../js/hdl/VerilogExporter.js');
  const circuit = {
    nodes: [
      { id: 'n1', type: 'INPUT', label: 'a', bitWidth: 1 },
      { id: 'n2', type: 'OUTPUT', label: 'y', bitWidth: 1 },
    ],
    wires: [],
  };
  const a = exportCircuit(circuit);
  await new Promise(r => setTimeout(r, 20));
  const b = exportCircuit(circuit);
  check('two exports are byte-identical by default', a === b);
  check('no timestamp in default output', !a.includes('Exported:'));

  const withTs = exportCircuit(circuit, { timestamp: true });
  check('timestamp appears only when opted-in', withTs.includes('Exported:'));
}

// ── SourceRef formatting ─────────────────────────────────────
console.log('SourceRef');
{
  check('node ref formats', formatSourceRef(SourceRef.fromNode('n1')) === 'node#n1');
  check('verilog ref formats', formatSourceRef(SourceRef.fromVerilog('a.v', 5, 3)) === 'a.v:5:3');
  check('unknown',          formatSourceRef(SourceRef.unknown()) === '<unknown>');
}

console.log(failed === 0 ? '\nAll HDL-IR checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
