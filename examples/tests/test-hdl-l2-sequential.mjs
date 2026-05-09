// Phase B — L2 semantic equivalence for clocked designs.
//
// Same diff pipeline as the combinational harness, plus:
//   • A clock domain (default 10ns period; rising edges at 5,15,25,...).
//   • Per-cycle stimulus (function or array). Each cycle: low phase →
//     rising edge → outputs sampled.
//   • A "stability window" — the first 2 cycles are excluded from the
//     diff, because iverilog boots regs to `x` while the engine boots
//     them to `0` and every clean register would otherwise flag.
//
// Run: node examples/tests/test-hdl-l2-sequential.mjs

import { runL2Sequential } from '../../js/hdl/verify/runL2.js';
import { isIverilogAvailable } from '../../js/hdl/verify/iverilog.js';

let failed = 0;
let skipped = 0;
function check(label, result) {
  if (result.skipped) {
    skipped++;
    console.log(`  [SKIP] ${label} — ${result.reason}`);
    return;
  }
  if (!result.ok) {
    failed++;
    const d = result.divergence;
    const detail = d
      ? `signal=${d.signal} t=${d.time} expected=${d.expected} actual=${d.actual}`
      : (result.reason || 'unknown');
    console.log(`  [FAIL] ${label} — ${detail}`);
    if (result.stderr) console.log(`         ${result.stderr.split('\n')[0]}`);
    return;
  }
  console.log(`  [PASS] ${label}`);
}

console.log('\n-- HDL L2 — Sequential equivalence --');
if (!isIverilogAvailable()) {
  console.log('  iverilog not on PATH — every check will SKIP.');
}

// ── D-FF ─────────────────────────────────────────────────────
console.log('D flip-flop');
check('q follows d on rising edge', runL2Sequential({
  nodes: [
    { id: 'd',   type: 'INPUT', label: 'd' },
    { id: 'clk', type: 'CLOCK', label: 'clk' },
    { id: 'ff',  type: 'FF_SLOT', ffType: 'D', label: 'ff' },
    { id: 'q',   type: 'OUTPUT', label: 'q' },
  ],
  wires: [
    { id: 'wd', sourceId: 'd',   targetId: 'ff', targetInputIndex: 0 },
    { id: 'wc', sourceId: 'clk', targetId: 'ff', targetInputIndex: 1 },
    { id: 'wq', sourceId: 'ff',  sourceOutputIndex: 0, targetId: 'q', targetInputIndex: 0 },
  ],
}, {
  topName: 'dff_test',
  // Toggle d every 2 cycles to verify both 0→1 and 1→0 latches.
  stimulus: (i) => ({ d: (i >> 1) & 1 }),
  cycles: 12,
}));

// ── COUNTER ──────────────────────────────────────────────────
console.log('COUNTER (4-bit, free-running)');
check('count increments every cycle when EN=1', runL2Sequential({
  nodes: [
    { id: 'en',  type: 'INPUT', label: 'en' },
    { id: 'clr', type: 'INPUT', label: 'clr' },
    { id: 'clk', type: 'CLOCK', label: 'clk' },
    { id: 'c',   type: 'COUNTER', bitWidth: 4, label: 'c' },
    { id: 'q',   type: 'OUTPUT', label: 'q', bitWidth: 4 },
  ],
  wires: [
    // COUNTER pins: EN(0), LOAD(1), DATA(2), CLR(3), CLK(4)
    { id: 'wen',  sourceId: 'en',  targetId: 'c', targetInputIndex: 0 },
    { id: 'wclr', sourceId: 'clr', targetId: 'c', targetInputIndex: 3 },
    { id: 'wclk', sourceId: 'clk', targetId: 'c', targetInputIndex: 4 },
    { id: 'wq',   sourceId: 'c',   sourceOutputIndex: 0, targetId: 'q', targetInputIndex: 0 },
  ],
}, {
  topName: 'cnt_test',
  // Hold EN high after CLR pulse to verify the count increments cleanly.
  stimulus: (i) => ({ en: 1, clr: i === 0 ? 1 : 0 }),
  cycles: 18,
  stabilityCycles: 2,
}));

// ── REGISTER ─────────────────────────────────────────────────
console.log('REGISTER (4-bit, EN-gated)');
check('q latches d when en=1, holds otherwise', runL2Sequential({
  nodes: [
    { id: 'd',   type: 'INPUT', label: 'd', bitWidth: 4 },
    { id: 'en',  type: 'INPUT', label: 'en' },
    { id: 'clr', type: 'INPUT', label: 'clr' },
    { id: 'clk', type: 'CLOCK', label: 'clk' },
    { id: 'r',   type: 'REGISTER', bitWidth: 4, label: 'r' },
    { id: 'q',   type: 'OUTPUT', label: 'q', bitWidth: 4 },
  ],
  wires: [
    { id: 'wd',  sourceId: 'd',   targetId: 'r', targetInputIndex: 0 },
    { id: 'wen', sourceId: 'en',  targetId: 'r', targetInputIndex: 1 },
    { id: 'wcr', sourceId: 'clr', targetId: 'r', targetInputIndex: 2 },
    { id: 'wcl', sourceId: 'clk', targetId: 'r', targetInputIndex: 3 },
    { id: 'wq',  sourceId: 'r',   sourceOutputIndex: 0, targetId: 'q', targetInputIndex: 0 },
  ],
}, {
  topName: 'reg_test',
  // Drive distinct data values, gate EN, sprinkle a CLR pulse mid-run.
  stimulus: (i) => ({ d: (i * 3) & 0xF, en: i % 2, clr: i === 5 ? 1 : 0 }),
  cycles: 16,
}));

// ── SHIFT_REG ────────────────────────────────────────────────
console.log('SHIFT_REG (4-bit, shift-left)');
check('serial-in shift-left', runL2Sequential({
  nodes: [
    { id: 'din', type: 'INPUT', label: 'din' },
    { id: 'dir', type: 'INPUT', label: 'dir' },
    // EN must be driven explicitly: the engine treats an unwired EN
    // as disabled (its `?? 1` default never fires because the wire
    // helper returns 0 instead of undefined). The Verilog translator
    // defaults to always-enabled, so leaving EN unwired makes the
    // two sides disagree before any shift even happens.
    { id: 'en',  type: 'INPUT', label: 'en' },
    { id: 'clk', type: 'CLOCK', label: 'clk' },
    { id: 's',   type: 'SHIFT_REG', bitWidth: 4, label: 's' },
    { id: 'q',   type: 'OUTPUT', label: 'q', bitWidth: 4 },
  ],
  wires: [
    // SHIFT_REG pins: DIN(0), DIR(1), EN(2), CLR(3), CLK(4)
    { id: 'w1', sourceId: 'din', targetId: 's', targetInputIndex: 0 },
    { id: 'w2', sourceId: 'dir', targetId: 's', targetInputIndex: 1 },
    { id: 'we', sourceId: 'en',  targetId: 's', targetInputIndex: 2 },
    { id: 'w3', sourceId: 'clk', targetId: 's', targetInputIndex: 4 },
    { id: 'wq', sourceId: 's', sourceOutputIndex: 0, targetId: 'q', targetInputIndex: 0 },
  ],
}, {
  topName: 'shr_test',
  stimulus: (i) => ({ din: i & 1, dir: 0, en: 1 }),    // dir=0 → shift-left
  cycles: 14,
  // 4-bit shift register needs ≥4 cycles before all bit positions
  // have been driven; before that, iverilog's reg still shows 'x' in
  // the bits the LSB hasn't reached yet.
  stabilityCycles: 5,
}));

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}${skipped ? ` (${skipped} skipped)` : ''}`);
process.exit(failed === 0 ? 0 : 1);
