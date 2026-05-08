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

// ── Latches: D_LATCH and SR_LATCH ────────────────────────────
console.log('Latches');

// D_LATCH — transparent while EN, hold otherwise
{
  const v = exportCircuit({
    nodes: [
      { id: 'd_in', type: 'INPUT', label: 'd' },
      { id: 'en',   type: 'INPUT', label: 'en' },
      { id: 'l',    type: 'LATCH_SLOT', latchType: 'D_LATCH', label: 'l' },
      { id: 'q',    type: 'OUTPUT', label: 'q' },
    ],
    wires: [
      { id: 'w1', sourceId: 'd_in', targetId: 'l', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'en',   targetId: 'l', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'l',    targetId: 'q', targetInputIndex: 0 },
    ],
  }, { topName: 'dlatch_test', header: false });
  check('D_LATCH: emits @(*) sensitivity',         /always\s+@\(\*\)/.test(v));
  check('D_LATCH: gated by `if (en)`',             /if\s*\(en\)\s*begin[\s\S]*<=\s*d/.test(v));
  check('D_LATCH: Q net declared as reg',          /reg\s+net_l_0/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('D_LATCH: iverilog parses', r.ok, r.stderr);
  }
}

// SR_LATCH — set on (s & ~r), reset on (~s & r), gated by EN
{
  const v = exportCircuit({
    nodes: [
      { id: 's',  type: 'INPUT', label: 's' },
      { id: 'r',  type: 'INPUT', label: 'r' },
      { id: 'en', type: 'INPUT', label: 'en' },
      { id: 'l',  type: 'LATCH_SLOT', latchType: 'SR_LATCH', label: 'l' },
      { id: 'q',  type: 'OUTPUT', label: 'q' },
    ],
    wires: [
      { id: 'w1', sourceId: 's',  targetId: 'l', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'r',  targetId: 'l', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'en', targetId: 'l', targetInputIndex: 2 },
      { id: 'w4', sourceId: 'l',  targetId: 'q', targetInputIndex: 0 },
    ],
  }, { topName: 'srlatch_test', header: false });
  check('SR_LATCH: outer if(en) gate present',     /if\s*\(en\)/.test(v));
  check('SR_LATCH: set condition (s & ~r)',        /\(s\s*&\s*\(~r\)\)/.test(v));
  check('SR_LATCH: reset condition (~s & r)',      /\(\(~s\)\s*&\s*r\)/.test(v));
  check('SR_LATCH: assigns 1\'h1 / 1\'h0 in branches',
    /<=\s*1'h1/.test(v) && /<=\s*1'h0/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('SR_LATCH: iverilog parses', r.ok, r.stderr);
  }
}

// Empty LATCH_SLOT silently skipped
{
  const v = exportCircuit({
    nodes: [
      { id: 'l',  type: 'LATCH_SLOT', label: 'l' },        // no latchType
      { id: 'q',  type: 'OUTPUT', label: 'q' },
    ],
    wires: [
      { id: 'w', sourceId: 'l', targetId: 'q', targetInputIndex: 0 },
    ],
  }, { topName: 'empty_latch', header: false });
  check('empty LATCH_SLOT emits no always block',
    !/always\s+@/.test(v));
}

// ── REGISTER, COUNTER, SHIFT_REG (parametric width) ──────────
console.log('Register family');

// 8-bit REGISTER with EN + CLR
{
  const v = exportCircuit({
    nodes: [
      { id: 'data', type: 'INPUT', label: 'data', bitWidth: 8 },
      { id: 'en',   type: 'INPUT', label: 'en' },
      { id: 'clr',  type: 'INPUT', label: 'clr' },
      { id: 'clk',  type: 'CLOCK', label: 'clk' },
      { id: 'r',    type: 'REGISTER', bitWidth: 8, label: 'r' },
      { id: 'q',    type: 'OUTPUT', label: 'q', bitWidth: 8 },
    ],
    wires: [
      { id: 'wd', sourceId: 'data', targetId: 'r', targetInputIndex: 0 },
      { id: 'we', sourceId: 'en',   targetId: 'r', targetInputIndex: 1 },
      { id: 'wc', sourceId: 'clr',  targetId: 'r', targetInputIndex: 2 },
      { id: 'wk', sourceId: 'clk',  targetId: 'r', targetInputIndex: 3, isClockWire: true },
      { id: 'wq', sourceId: 'r',    targetId: 'q', targetInputIndex: 0 },
    ],
  }, { topName: 'reg8', header: false });
  check('REGISTER: 8-bit reg declaration',     /reg\s+\[7:0\]\s+net_r_0/.test(v));
  check('REGISTER: CLR has highest priority',  /if\s*\(clr\)\s*begin[\s\S]*<=\s*8'h0/.test(v));
  check('REGISTER: EN-gated load of data',     /if\s*\(en\)\s*begin[\s\S]*<=\s*data/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('REGISTER: iverilog parses', r.ok, r.stderr);
  }
}

// 4-bit COUNTER with EN, LOAD, CLR + TC reduction
{
  const v = exportCircuit({
    nodes: [
      { id: 'en',   type: 'INPUT', label: 'en' },
      { id: 'load', type: 'INPUT', label: 'load' },
      { id: 'data', type: 'INPUT', label: 'data', bitWidth: 4 },
      { id: 'clr',  type: 'INPUT', label: 'clr' },
      { id: 'clk',  type: 'CLOCK', label: 'clk' },
      { id: 'c',    type: 'COUNTER', bitWidth: 4, label: 'c' },
      { id: 'q',    type: 'OUTPUT', label: 'q', bitWidth: 4 },
      { id: 'tc',   type: 'OUTPUT', label: 'tc' },
    ],
    wires: [
      { id: 'we',  sourceId: 'en',   targetId: 'c', targetInputIndex: 0 },
      { id: 'wl',  sourceId: 'load', targetId: 'c', targetInputIndex: 1 },
      { id: 'wd',  sourceId: 'data', targetId: 'c', targetInputIndex: 2 },
      { id: 'wcl', sourceId: 'clr',  targetId: 'c', targetInputIndex: 3 },
      { id: 'wk',  sourceId: 'clk',  targetId: 'c', targetInputIndex: 4, isClockWire: true },
      { id: 'wq',  sourceId: 'c',    sourceOutputIndex: 0, targetId: 'q',  targetInputIndex: 0 },
      { id: 'wtc', sourceId: 'c',    sourceOutputIndex: 1, targetId: 'tc', targetInputIndex: 0 },
    ],
  }, { topName: 'cnt4', header: false });
  check('COUNTER: 4-bit reg declaration',      /reg\s+\[3:0\]\s+net_c_0/.test(v));
  check('COUNTER: priority CLR → LOAD → EN',
    /if\s*\(clr\)[\s\S]*if\s*\(load\)[\s\S]*if\s*\(en\)/.test(v));
  check('COUNTER: increment expression',       /\(net_c_0\s*\+\s*4'h1\)/.test(v));
  check('COUNTER: TC = reduction-AND of count',/\(&net_c_0\)/.test(v));
  check('COUNTER: TC net is 1-bit (not 4-bit)', /wire\s+net_c_1\b/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('COUNTER: iverilog parses', r.ok, r.stderr);
  }
}

// 4-bit SHIFT_REG, bidirectional
{
  const v = exportCircuit({
    nodes: [
      { id: 'din', type: 'INPUT', label: 'din' },
      { id: 'dir', type: 'INPUT', label: 'dir' },
      { id: 'en',  type: 'INPUT', label: 'en' },
      { id: 'clr', type: 'INPUT', label: 'clr' },
      { id: 'clk', type: 'CLOCK', label: 'clk' },
      { id: 's',   type: 'SHIFT_REG', bitWidth: 4, label: 's' },
      { id: 'q',   type: 'OUTPUT', label: 'q', bitWidth: 4 },
    ],
    wires: [
      { id: 'w0', sourceId: 'din', targetId: 's', targetInputIndex: 0 },
      { id: 'w1', sourceId: 'dir', targetId: 's', targetInputIndex: 1 },
      { id: 'w2', sourceId: 'en',  targetId: 's', targetInputIndex: 2 },
      { id: 'w3', sourceId: 'clr', targetId: 's', targetInputIndex: 3 },
      { id: 'w4', sourceId: 'clk', targetId: 's', targetInputIndex: 4, isClockWire: true },
      { id: 'wq', sourceId: 's',   targetId: 'q', targetInputIndex: 0 },
    ],
  }, { topName: 'sh4', header: false });
  check('SHIFT_REG: 4-bit reg declaration',    /reg\s+\[3:0\]\s+net_s_0/.test(v));
  check('SHIFT_REG: shift-left form {q[2:0], din}',
    /\{net_s_0\[2:0\],\s*din\}/.test(v));
  check('SHIFT_REG: shift-right form {din, q[3:1]}',
    /\{din,\s*net_s_0\[3:1\]\}/.test(v));
  check('SHIFT_REG: DIR-gated direction', /if\s*\(dir\)[\s\S]*else\s+begin/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('SHIFT_REG: iverilog parses', r.ok, r.stderr);
  }
}

// ── DFT components: SCAN_FF + LFSR ──────────────────────────
console.log('DFT (SCAN_FF + LFSR)');

// SCAN_FF — D-FF + 2:1 mux on data input gated by TE
{
  const v = exportCircuit({
    nodes: [
      { id: 'd', type: 'INPUT', label: 'd' },
      { id: 'ti', type: 'INPUT', label: 'ti' },
      { id: 'te', type: 'INPUT', label: 'te' },
      { id: 'clk', type: 'CLOCK', label: 'clk' },
      { id: 'sff', type: 'SCAN_FF', label: 'sff' },
      { id: 'q', type: 'OUTPUT', label: 'q' },
    ],
    wires: [
      { id: 'w0', sourceId: 'd',  targetId: 'sff', targetInputIndex: 0 },
      { id: 'w1', sourceId: 'ti', targetId: 'sff', targetInputIndex: 1 },
      { id: 'w2', sourceId: 'te', targetId: 'sff', targetInputIndex: 2 },
      { id: 'w3', sourceId: 'clk',targetId: 'sff', targetInputIndex: 3, isClockWire: true },
      { id: 'wq', sourceId: 'sff',targetId: 'q',   targetInputIndex: 0 },
    ],
  }, { topName: 'sff_test', header: false });
  check('SCAN_FF: next-state is (te ? ti : d)',
    /<=\s*\(te\s*\?\s*ti\s*:\s*d\)/.test(v));
  check('SCAN_FF: Q is reg', /reg\s+net_sff_0/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('SCAN_FF: iverilog parses', r.ok, r.stderr);
  }
}

// LFSR — internal N-bit reg + initial-block seed + shift logic
{
  const v = exportCircuit({
    nodes: [
      { id: 'clk',  type: 'CLOCK', label: 'clk' },
      { id: 'lfsr', type: 'LFSR', bitWidth: 4, taps: [3, 0], seed: 1, label: 'lfsr' },
      { id: 'q',    type: 'OUTPUT', label: 'q' },
    ],
    wires: [
      { id: 'w0', sourceId: 'clk', targetId: 'lfsr', targetInputIndex: 0, isClockWire: true },
      { id: 'wq', sourceId: 'lfsr', targetId: 'q', targetInputIndex: 0 },
    ],
  }, { topName: 'lfsr_test', header: false });
  check('LFSR: declares N-bit internal state reg',
    /reg\s+\[3:0\]\s+net_lfsr_0_state/.test(v));
  check('LFSR: initial block seeds the state',
    /initial\s+begin[\s\S]*net_lfsr_0_state\s*=\s*4'h1/.test(v));
  check('LFSR: serial Q taps state[N-1]',
    /assign\s+net_lfsr_0\s*=\s*net_lfsr_0_state\[3\]/.test(v));
  check('LFSR: shift expression `{state[2:0], xor(taps)}`',
    /\{net_lfsr_0_state\[2:0\],\s*\(net_lfsr_0_state\[3\]\s*\^\s*net_lfsr_0_state\[0\]\)\}/.test(v));
  check('LFSR: Q net is 1-bit (not bitWidth)',
    /wire\s+net_lfsr_0\b/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('LFSR: iverilog parses', r.ok, r.stderr);
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
