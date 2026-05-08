// Phase 4 — Sequential translators (D / T / SR / JK flip-flops).
//
// L1 (iverilog parse) gate is on for every flavour. L2 (VCD diff
// vs. native) is deferred to a later sub-step alongside Phase 4d
// pipeline registers — once the test harness has a stimulus driver
// for clocked designs.
//
// Run:  node examples/tests/test-hdl-sequential.mjs

import { exportCircuit } from '../../js/hdl/VerilogExporter.js';
import { parseCheck, isIverilogAvailable } from '../../js/hdl/verify/iverilog.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('\n-- HDL Phase 4 — sequential translators --');

// Helper: tiny scene for an FF flavour. SR / JK get two data inputs.
function buildFFScene(ffType) {
  const dataPins = (ffType === 'SR' || ffType === 'JK') ? 2 : 1;
  const dataLabels = ffType === 'SR' ? ['s', 'r']
                  : ffType === 'JK' ? ['j', 'k']
                  : ffType === 'T'  ? ['t']
                  : ['d'];
  const nodes = [
    { id: 'clk', type: 'CLOCK', label: 'clk' },
    { id: 'ff',  type: 'FF_SLOT', ffType, label: 'ff' },
    { id: 'q',   type: 'OUTPUT', label: 'q' },
  ];
  const wires = [];
  for (let i = 0; i < dataPins; i++) {
    nodes.push({ id: 'in_' + i, type: 'INPUT', label: dataLabels[i] });
    wires.push({ id: 'w_in_' + i, sourceId: 'in_' + i, targetId: 'ff', targetInputIndex: i });
  }
  wires.push({
    id: 'w_clk', sourceId: 'clk', targetId: 'ff',
    targetInputIndex: dataPins, isClockWire: true,
  });
  wires.push({ id: 'w_q', sourceId: 'ff', targetId: 'q', targetInputIndex: 0 });
  return { nodes, wires };
}

// ── D-FF: vertical slice + L1 gate ───────────────────────────
console.log('D-FF (vertical slice)');
{
  const v = exportCircuit(buildFFScene('D'), { topName: 'dff', header: false });
  check('emits `reg` for Q net',          /reg\s+net_ff_0/.test(v));
  check('emits `always @(posedge clk)`',  /always\s+@\(posedge\s+clk\)/.test(v));
  check('emits non-blocking q <= d',      /net_ff_0\s*<=\s*d/.test(v));
  check('emits `assign q = net_ff_0`',    /assign\s+q\s*=\s*net_ff_0/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('iverilog -g2012 parses output', r.ok, r.stderr);
  }
}

// ── T-FF: toggle on T=1 ──────────────────────────────────────
console.log('T-FF');
{
  const v = exportCircuit(buildFFScene('T'), { topName: 'tff', header: false });
  // Next-state expression: t ? ~Q : Q  → "(t ? (~net_ff_0) : net_ff_0)"
  check('T-FF: next-state is (t ? ~q : q)',
    /\(t\s*\?\s*\(~net_ff_0\)\s*:\s*net_ff_0\)/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('T-FF: iverilog parses', r.ok, r.stderr);
  }
}

// ── SR-FF: set/reset/hold ────────────────────────────────────
console.log('SR-FF');
{
  const v = exportCircuit(buildFFScene('SR'), { topName: 'srff', header: false });
  check('SR-FF: set condition (s & ~r)',
    /\(s\s*&\s*\(~r\)\)/.test(v));
  check('SR-FF: reset condition (~s & r)',
    /\(\(~s\)\s*&\s*r\)/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('SR-FF: iverilog parses', r.ok, r.stderr);
  }
}

// ── JK-FF: set/reset/toggle/hold ─────────────────────────────
console.log('JK-FF');
{
  const v = exportCircuit(buildFFScene('JK'), { topName: 'jkff', header: false });
  check('JK-FF: set condition (j & ~k)',
    /\(j\s*&\s*\(~k\)\)/.test(v));
  check('JK-FF: reset condition (~j & k)',
    /\(\(~j\)\s*&\s*k\)/.test(v));
  check('JK-FF: toggle condition (j & k)',
    /\(j\s*&\s*k\)/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('JK-FF: iverilog parses', r.ok, r.stderr);
  }
}

// ── Empty FF_SLOT (ffType unset) — silently skipped ──────────
console.log('Empty FF_SLOT (ffType unset)');
{
  const v = exportCircuit({
    nodes: [
      { id: 'clk', type: 'CLOCK', label: 'clk' },
      { id: 'ff',  type: 'FF_SLOT', label: 'ff' },           // no ffType
      { id: 'q',   type: 'OUTPUT', label: 'q' },
    ],
    wires: [
      { id: 'w_clk', sourceId: 'clk', targetId: 'ff', targetInputIndex: 0, isClockWire: true },
      { id: 'w_q', sourceId: 'ff', targetId: 'q', targetInputIndex: 0 },
    ],
  }, { topName: 'empty_ff', header: false });
  check('empty FF_SLOT emits no always block',
    !/always\s+@/.test(v));
  check('empty FF_SLOT emits no reg declaration',
    !/reg\s+net_ff/.test(v));
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
