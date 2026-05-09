// Phase D — L2 fuzz. Random-stimulus stress across the translator
// catalogue. Each fixture is a small fixed wiring with a seeded
// pseudo-random stimulus run over ~60 cycles. The point is to widen
// input coverage past the hand-picked vectors of phases A–C: any
// translator that's only correct on the vectors we thought to write
// will trip here.
//
// PRNG is seeded so every failure is reproducible. The seed is in
// the filename header — change it to look for new failures.
//
// Run: node examples/tests/test-hdl-l2-fuzz.mjs

import { runL2, runL2Sequential } from '../../js/hdl/verify/runL2.js';
import { isIverilogAvailable } from '../../js/hdl/verify/iverilog.js';

let failed = 0;
let skipped = 0;
function check(label, result) {
  if (result.skipped) { skipped++; console.log(`  [SKIP] ${label} — ${result.reason}`); return; }
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

// Mulberry32 — small, fast, non-cryptographic PRNG. Seeded so a
// failing run can be reproduced and bisected.
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 0xC0FFEE;
const FUZZ_CYCLES = 60;

console.log(`\n-- HDL L2 — fuzz (seed=0x${SEED.toString(16)}, ${FUZZ_CYCLES} cycles) --`);
if (!isIverilogAvailable()) {
  console.log('  iverilog not on PATH — every check will SKIP.');
}

// ── Combinational fuzz ──────────────────────────────────────
console.log('Combinational gates (random 2-input vectors)');
{
  const rng = rngFrom(SEED);
  // Stimulus: 32 random {a,b} pairs. Combinational runL2 doesn't take
  // a cycle count — it iterates the stimulus list directly.
  const samples = [];
  for (let i = 0; i < 32; i++) samples.push({ a: rng() < 0.5 ? 0 : 1, b: rng() < 0.5 ? 0 : 1 });
  for (const gate of ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR']) {
    check(`${gate} fuzz`, runL2({
      nodes: [
        { id: 'a', type: 'INPUT', label: 'a' },
        { id: 'b', type: 'INPUT', label: 'b' },
        { id: 'g', type: 'GATE_SLOT', gate, label: 'g' },
        { id: 'y', type: 'OUTPUT', label: 'y' },
      ],
      wires: [
        { id: 'w1', sourceId: 'a', targetId: 'g', targetInputIndex: 0 },
        { id: 'w2', sourceId: 'b', targetId: 'g', targetInputIndex: 1 },
        { id: 'w3', sourceId: 'g', sourceOutputIndex: 0, targetId: 'y', targetInputIndex: 0 },
      ],
    }, { topName: `fuzz_${gate.toLowerCase()}`, stimulus: samples }));
  }
}

console.log('FULL_ADDER (random 3-input vectors)');
{
  const rng = rngFrom(SEED + 1);
  const samples = [];
  for (let i = 0; i < 32; i++) samples.push({
    a: rng() < 0.5 ? 0 : 1, b: rng() < 0.5 ? 0 : 1, cin: rng() < 0.5 ? 0 : 1,
  });
  check('FULL_ADDER fuzz', runL2({
    nodes: [
      { id: 'a',   type: 'INPUT', label: 'a' },
      { id: 'b',   type: 'INPUT', label: 'b' },
      { id: 'cin', type: 'INPUT', label: 'cin' },
      { id: 'fa',  type: 'FULL_ADDER', label: 'fa' },
      { id: 's',   type: 'OUTPUT', label: 's' },
      { id: 'co',  type: 'OUTPUT', label: 'co' },
    ],
    wires: [
      { id: 'w1', sourceId: 'a',   targetId: 'fa', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'b',   targetId: 'fa', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'cin', targetId: 'fa', targetInputIndex: 2 },
      { id: 'ws', sourceId: 'fa', sourceOutputIndex: 0, targetId: 's',  targetInputIndex: 0 },
      { id: 'wc', sourceId: 'fa', sourceOutputIndex: 1, targetId: 'co', targetInputIndex: 0 },
    ],
  }, { topName: 'fuzz_fa', stimulus: samples }));
}

console.log('ALU (random a/b/op across 4-bit space)');
{
  const rng = rngFrom(SEED + 2);
  const samples = [];
  for (let i = 0; i < 96; i++) samples.push({
    a: Math.floor(rng() * 16), b: Math.floor(rng() * 16), op: Math.floor(rng() * 8),
  });
  check('ALU fuzz', runL2({
    nodes: [
      { id: 'a',  type: 'INPUT', label: 'a',  bitWidth: 4 },
      { id: 'b',  type: 'INPUT', label: 'b',  bitWidth: 4 },
      { id: 'op', type: 'INPUT', label: 'op', bitWidth: 3 },
      { id: 'alu', type: 'ALU', bitWidth: 4, label: 'alu' },
      { id: 'r', type: 'OUTPUT', label: 'r', bitWidth: 4 },
      { id: 'z', type: 'OUTPUT', label: 'z' },
      { id: 'c', type: 'OUTPUT', label: 'c' },
    ],
    wires: [
      { id: 'wa', sourceId: 'a',  targetId: 'alu', targetInputIndex: 0 },
      { id: 'wb', sourceId: 'b',  targetId: 'alu', targetInputIndex: 1 },
      { id: 'wo', sourceId: 'op', targetId: 'alu', targetInputIndex: 2 },
      { id: 'wr', sourceId: 'alu', sourceOutputIndex: 0, targetId: 'r', targetInputIndex: 0 },
      { id: 'wz', sourceId: 'alu', sourceOutputIndex: 1, targetId: 'z', targetInputIndex: 0 },
      { id: 'wc', sourceId: 'alu', sourceOutputIndex: 2, targetId: 'c', targetInputIndex: 0 },
    ],
  }, { topName: 'fuzz_alu', stimulus: samples }));
}

// ── Sequential fuzz ─────────────────────────────────────────
console.log('REGISTER (random data + EN/CLR pulses)');
{
  const rng = rngFrom(SEED + 3);
  check('REGISTER fuzz', runL2Sequential({
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
    topName: 'fuzz_reg',
    // EN biased high (≈80%), CLR rare (≈10%) so we mostly latch new
    // data with occasional clears.
    stimulus: () => ({
      d:   Math.floor(rng() * 16),
      en:  rng() < 0.8 ? 1 : 0,
      clr: rng() < 0.1 ? 1 : 0,
    }),
    cycles: FUZZ_CYCLES,
  }));
}

console.log('COUNTER (random EN/CLR; LOAD ignored)');
{
  const rng = rngFrom(SEED + 4);
  check('COUNTER fuzz', runL2Sequential({
    nodes: [
      { id: 'en',  type: 'INPUT', label: 'en' },
      { id: 'clr', type: 'INPUT', label: 'clr' },
      { id: 'clk', type: 'CLOCK', label: 'clk' },
      { id: 'c',   type: 'COUNTER', bitWidth: 4, label: 'c' },
      { id: 'q',   type: 'OUTPUT', label: 'q', bitWidth: 4 },
    ],
    wires: [
      { id: 'wen',  sourceId: 'en',  targetId: 'c', targetInputIndex: 0 },
      { id: 'wclr', sourceId: 'clr', targetId: 'c', targetInputIndex: 3 },
      { id: 'wclk', sourceId: 'clk', targetId: 'c', targetInputIndex: 4 },
      { id: 'wq',   sourceId: 'c',   sourceOutputIndex: 0, targetId: 'q', targetInputIndex: 0 },
    ],
  }, {
    topName: 'fuzz_cnt',
    // Force CLR on cycle 0. The translator's reg starts as 'x' in
    // iverilog; native starts at 0. Without a deterministic reset
    // pulse, the first few cycles diverge no matter what stability
    // window we set.
    stimulus: (i) => i === 0
      ? { en: 0, clr: 1 }
      : { en: rng() < 0.7 ? 1 : 0, clr: rng() < 0.05 ? 1 : 0 },
    cycles: FUZZ_CYCLES,
  }));
}

console.log('SHIFT_REG (random DIN, DIR flips occasionally)');
{
  const rng = rngFrom(SEED + 5);
  let dir = 0;
  check('SHIFT_REG fuzz', runL2Sequential({
    nodes: [
      { id: 'din', type: 'INPUT', label: 'din' },
      { id: 'dir', type: 'INPUT', label: 'dir' },
      { id: 'en',  type: 'INPUT', label: 'en' },
      { id: 'clk', type: 'CLOCK', label: 'clk' },
      { id: 's',   type: 'SHIFT_REG', bitWidth: 4, label: 's' },
      { id: 'q',   type: 'OUTPUT', label: 'q', bitWidth: 4 },
    ],
    wires: [
      { id: 'w1', sourceId: 'din', targetId: 's', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'dir', targetId: 's', targetInputIndex: 1 },
      { id: 'we', sourceId: 'en',  targetId: 's', targetInputIndex: 2 },
      { id: 'w3', sourceId: 'clk', targetId: 's', targetInputIndex: 4 },
      { id: 'wq', sourceId: 's', sourceOutputIndex: 0, targetId: 'q', targetInputIndex: 0 },
    ],
  }, {
    topName: 'fuzz_shr',
    stimulus: () => {
      // Flip direction ~10% of cycles to exercise both branches.
      if (rng() < 0.1) dir = 1 - dir;
      return { din: rng() < 0.5 ? 0 : 1, dir, en: 1 };
    },
    cycles: FUZZ_CYCLES,
    stabilityCycles: 6,    // ≥ width of the shift register
  }));
}

console.log('STACK (random push/pop sequences)');
{
  const rng = rngFrom(SEED + 6);
  check('STACK fuzz', runL2Sequential({
    nodes: [
      { id: 'data', type: 'INPUT', label: 'data', bitWidth: 8 },
      { id: 'psh',  type: 'INPUT', label: 'psh' },
      { id: 'pop',  type: 'INPUT', label: 'pop' },
      { id: 'clr',  type: 'INPUT', label: 'clr' },
      { id: 'clk',  type: 'CLOCK', label: 'clk' },
      { id: 'st',   type: 'STACK', depth: 8, dataBits: 8, label: 'st' },
      { id: 'q',    type: 'OUTPUT', label: 'q', bitWidth: 8 },
      { id: 'full', type: 'OUTPUT', label: 'full' },
      { id: 'emp',  type: 'OUTPUT', label: 'emp' },
    ],
    wires: [
      { id: 'w0', sourceId: 'data', targetId: 'st', targetInputIndex: 0 },
      { id: 'w1', sourceId: 'psh',  targetId: 'st', targetInputIndex: 1 },
      { id: 'w2', sourceId: 'pop',  targetId: 'st', targetInputIndex: 2 },
      { id: 'w3', sourceId: 'clr',  targetId: 'st', targetInputIndex: 3 },
      { id: 'w4', sourceId: 'clk',  targetId: 'st', targetInputIndex: 4 },
      { id: 'wq', sourceId: 'st',   sourceOutputIndex: 0, targetId: 'q',    targetInputIndex: 0 },
      { id: 'wf', sourceId: 'st',   sourceOutputIndex: 1, targetId: 'full', targetInputIndex: 0 },
      { id: 'we', sourceId: 'st',   sourceOutputIndex: 2, targetId: 'emp',  targetInputIndex: 0 },
    ],
  }, {
    topName: 'fuzz_stk',
    // CLR every ~30 cycles. PUSH biased over POP so the stack visits
    // both empty and full extremes during the run.
    stimulus: (i) => {
      if (i === 0)              return { clr: 1, psh: 0, pop: 0, data: 0 };
      if (i % 30 === 29)        return { clr: 1, psh: 0, pop: 0, data: 0 };
      const r = rng();
      if (r < 0.55)             return { clr: 0, psh: 1, pop: 0, data: Math.floor(rng() * 256) };
      if (r < 0.85)             return { clr: 0, psh: 0, pop: 1, data: 0 };
      return { clr: 0, psh: 0, pop: 0, data: 0 };
    },
    cycles: FUZZ_CYCLES,
    stabilityCycles: 2,
  }));
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}${skipped ? ` (${skipped} skipped)` : ''}`);
process.exit(failed === 0 ? 0 : 1);
