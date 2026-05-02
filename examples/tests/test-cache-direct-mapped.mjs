// Layer 1 of the Cache + Memory Hierarchy build — verifies the
// direct-mapped CACHE eval. Drives a CPU↔CACHE↔RAM scene through a
// deterministic address sequence and asserts:
//   - First access to an address misses (compulsory).
//   - Repeat access with no eviction hits.
//   - Conflict pattern (same index, different tag) misses each time
//     and overwrites the line.
//   - hits/misses counters track exactly the right values.
//   - DATA_OUT serves from the line on a hit, from RAM on a miss.
//   - MEM_RE is asserted only on miss-reads (hits do NOT bother RAM).
//   - Write-through: WE pulses MEM_WE and updates the line in lockstep.
//
// Run:  node examples/tests/test-cache-direct-mapped.mjs

import { createComponent, createWire } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

// ── Scene: INPUT(addr/data/we/re) → CACHE → RAM, plus the back-edge
// RAM → CACHE.MEM_DATA_IN. RAM is async-read so its output reflects
// whatever address CACHE.MEM_ADDR currently shows. CLK drives both.
function buildScene(opts = {}) {
  let id = 0;
  const nid = () => 'n' + (++id);
  const wid = () => 'w' + (++id);
  const mk = (type, ov = {}) => Object.assign(createComponent(type, 0, 0), { id: nid() }, ov);
  const W  = (s, d, dp = 0, sp = 0, op = {}) => Object.assign(createWire(s, d, dp, sp, op), { id: wid() });

  const addr = mk('INPUT', { fixedValue: 0, label: 'ADDR' });
  const data = mk('INPUT', { fixedValue: 0, label: 'DATA' });
  const we   = mk('INPUT', { fixedValue: 0, label: 'WE'   });
  const re   = mk('INPUT', { fixedValue: 1, label: 'RE'   });
  const clk  = mk('CLOCK', { value: 0 });
  const cache = mk('CACHE', { lines: 4, dataBits: 8, addrBits: 8, mapping: 'direct' });
  const ram  = mk('RAM',   { addrBits: 8, dataBits: 8, asyncRead: true,
    memory: { 5: 50, 7: 70, 9: 90, 11: 110, 13: 130, ...(opts.ram || {}) } });

  const wires = [
    W(addr.id, cache.id, 0),
    W(data.id, cache.id, 1),
    W(we.id,   cache.id, 2),
    W(re.id,   cache.id, 3),
    W(clk.id,  cache.id, 4, 0, { isClockWire: true }),
    W(ram.id,  cache.id, 5),                                  // back-edge: RAM → MEM_DATA_IN

    W(cache.id, ram.id, 0, 3),                                // CACHE.MEM_ADDR     → RAM.ADDR
    W(cache.id, ram.id, 1, 4),                                // CACHE.MEM_DATA_OUT → RAM.DATA
    W(cache.id, ram.id, 2, 6),                                // CACHE.MEM_WE       → RAM.WE
    W(cache.id, ram.id, 3, 5),                                // CACHE.MEM_RE       → RAM.RE
    W(clk.id,   ram.id, 4, 0, { isClockWire: true }),
  ];
  const nodes = [addr, data, we, re, clk, cache, ram];
  return { nodes, wires, addr, data, we, re, clk, cache, ram };
}

// Run one full clock period (clk=1 then clk=0). Returns the result of
// the rising-edge evaluate() so the caller can read DATA_OUT/HIT/MISS
// for the access that just completed.
function tick(scene, ffStates) {
  scene.clk.value = 1; const r = evaluate(scene.nodes, scene.wires, ffStates, 0);
  scene.clk.value = 0; evaluate(scene.nodes, scene.wires, ffStates, 0);
  return r;
}

// ── 1. Compulsory miss + repeat hit ──────────────────────────
console.log('[1] Compulsory miss → repeat hit');
{
  const s = buildScene();
  const ffs = new Map();
  // Seed clk=0 evaluate so prevClk is set.
  evaluate(s.nodes, s.wires, ffs, 0);

  s.addr.fixedValue = 5;
  let r = tick(s, ffs);
  check('first access addr=5 → MISS',                     r.nodeValues.get(s.cache.id + '__out2') === 1);
  check('first access addr=5 → HIT=0',                    r.nodeValues.get(s.cache.id + '__out1') === 0);
  check('first access addr=5 → DATA_OUT = RAM[5] = 50',   r.nodeValues.get(s.cache.id) === 50);
  check('first access addr=5 → MEM_RE=1 (drove RAM)',     r.nodeValues.get(s.cache.id + '__out5') === 1);
  check('hits/misses after cycle 1: 0/1',
        ffs.get(s.cache.id).stats.hits === 0 && ffs.get(s.cache.id).stats.misses === 1);

  r = tick(s, ffs);
  check('second access addr=5 → HIT',                     r.nodeValues.get(s.cache.id + '__out1') === 1);
  check('second access addr=5 → MISS=0',                  r.nodeValues.get(s.cache.id + '__out2') === 0);
  check('second access addr=5 → DATA_OUT = 50 (from line)', r.nodeValues.get(s.cache.id) === 50);
  check('second access addr=5 → MEM_RE=0 (did NOT touch RAM)',
        r.nodeValues.get(s.cache.id + '__out5') === 0);
  check('hits/misses after cycle 2: 1/1',
        ffs.get(s.cache.id).stats.hits === 1 && ffs.get(s.cache.id).stats.misses === 1);
}

// ── 2. Conflict eviction (same index, different tag) ─────────
// 4-line direct-mapped cache: addresses 5 and 9 both fall on
// index 1 (5 & 3 = 1; 9 & 3 = 1) but have tags 1 and 2.
// Accessing them alternately should miss every time.
console.log('\n[2] Conflict misses on the same index with different tags');
{
  const s = buildScene();
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);

  // Walk: 5, 9, 5, 9, 5 — all map to index 1.
  const addrs = [5, 9, 5, 9, 5];
  let totalHits = 0, totalMisses = 0;
  for (const a of addrs) {
    s.addr.fixedValue = a;
    const r = tick(s, ffs);
    if (r.nodeValues.get(s.cache.id + '__out1') === 1) totalHits++;
    if (r.nodeValues.get(s.cache.id + '__out2') === 1) totalMisses++;
  }
  check('all 5 accesses miss (pure conflict thrash)', totalMisses === 5 && totalHits === 0);
  check('counters: 0 hits, 5 misses',
        ffs.get(s.cache.id).stats.hits === 0 && ffs.get(s.cache.id).stats.misses === 5);
}

// ── 3. Mixed pattern from the demo ───────────────────────────
// Trace 5, 7, 5, 9, 5, 11, 5, 13:
//   5(M) 7(M) 5(H) 9(M-conflict) 5(M-conflict) 11(M) 5(H) 13(M)
// Expected: 2 hits, 6 misses.
console.log('\n[3] Demo trace 5,7,5,9,5,11,5,13 — expected 2 hits / 6 misses');
{
  const s = buildScene();
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);

  const trace = [5, 7, 5, 9, 5, 11, 5, 13];
  const expected = ['M', 'M', 'H', 'M', 'M', 'M', 'H', 'M'];
  for (let i = 0; i < trace.length; i++) {
    s.addr.fixedValue = trace[i];
    const r = tick(s, ffs);
    const got = r.nodeValues.get(s.cache.id + '__out1') === 1 ? 'H' : 'M';
    check(`access #${i + 1} addr=${trace[i]} expected ${expected[i]}`, got === expected[i],
          `got ${got}`);
  }
  check('final counters: 2 hits, 6 misses',
        ffs.get(s.cache.id).stats.hits === 2 && ffs.get(s.cache.id).stats.misses === 6);
}

// ── 4. Write-through ─────────────────────────────────────────
// Writing to addr 5 with value 99: MEM_WE=1, RAM[5] becomes 99,
// line[1] holds {tag=1, valid=1, data=99}. A subsequent read of
// addr 5 hits the line and returns 99.
console.log('\n[4] Write-through: WE pulses MEM_WE, line + RAM both update');
{
  const s = buildScene();
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);

  // Write 99 to addr 5.
  s.addr.fixedValue = 5;
  s.data.fixedValue = 99;
  s.we.fixedValue = 1;
  s.re.fixedValue = 0;
  let r = tick(s, ffs);
  check('write asserts MEM_WE=1',                r.nodeValues.get(s.cache.id + '__out6') === 1);
  check('line[1] now { tag:1, valid:1, data:99 }',
        ffs.get(s.cache.id).lines[1].tag === 1 &&
        ffs.get(s.cache.id).lines[1].valid === 1 &&
        ffs.get(s.cache.id).lines[1].data === 99);
  // RAM persists the write because MEM_WE was driven on the rising edge.
  check('RAM[5] updated to 99 (write-through)',  ffs.get(s.ram.id).memory[5] === 99);

  // Now read it back. Should HIT and return 99.
  s.we.fixedValue = 0;
  s.re.fixedValue = 1;
  r = tick(s, ffs);
  check('read after write → HIT',                r.nodeValues.get(s.cache.id + '__out1') === 1);
  check('read after write → DATA_OUT = 99',      r.nodeValues.get(s.cache.id) === 99);
}

// ── 5. RE=0 WE=0 → idle, no counter advances ────────────────
// When the CPU isn't accessing, the cache must NOT count "hit" or
// "miss" — counters stay flat across idle cycles.
console.log('\n[5] Idle cycles (RE=0 WE=0) do not advance counters');
{
  const s = buildScene();
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);

  s.addr.fixedValue = 5;
  s.re.fixedValue = 1;
  tick(s, ffs);
  const baselineHits   = ffs.get(s.cache.id).stats.hits;
  const baselineMisses = ffs.get(s.cache.id).stats.misses;

  // Now go idle for 3 cycles.
  s.re.fixedValue = 0;
  for (let i = 0; i < 3; i++) tick(s, ffs);

  check('hits unchanged after 3 idle cycles',   ffs.get(s.cache.id).stats.hits === baselineHits);
  check('misses unchanged after 3 idle cycles', ffs.get(s.cache.id).stats.misses === baselineMisses);
}

// ── Summary ───────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
