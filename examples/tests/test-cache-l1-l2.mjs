// Layer 6 — two-level memory hierarchy (L1 → L2 → RAM).
// Pins down that nesting two CACHE components in series produces a
// real hierarchy: L1 misses cascade into L2 lookups; L2 hits absorb
// the miss without touching RAM; only L2 misses reach RAM.
//
// The engine itself didn't need new code — the existing CACHE pinout
// (CPU-side ADDR/DATA/WE/RE/CLK, MEM-side ADDR/DATA/WE/RE_OUT plus
// MEM_DATA_IN feedback) supports series composition out of the box.
//
// Run:  node examples/tests/test-cache-l1-l2.mjs

import { createComponent, createWire } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

function buildScene() {
  let id = 0;
  const nid = () => 'n' + (++id);
  const wid = () => 'w' + (++id);
  const mk = (type, ov = {}) => Object.assign(createComponent(type, 0, 0), { id: nid() }, ov);
  const W  = (s, d, dp = 0, sp = 0, op = {}) => Object.assign(createWire(s, d, dp, sp, op), { id: wid() });

  const addr = mk('INPUT', { fixedValue: 0 });
  const data = mk('INPUT', { fixedValue: 0 });
  const we   = mk('INPUT', { fixedValue: 0 });
  const re   = mk('INPUT', { fixedValue: 1 });
  const clk  = mk('CLOCK', { value: 0 });
  // L1 small + direct (forces frequent misses); L2 larger + fully (absorbs them).
  const l1   = mk('CACHE', { lines: 4,  dataBits: 8, addrBits: 8, mapping: 'direct',      label: 'L1' });
  const l2   = mk('CACHE', { lines: 16, dataBits: 8, addrBits: 8, mapping: 'fully-assoc', label: 'L2' });
  const ram  = mk('RAM',   { addrBits: 8, dataBits: 8, asyncRead: true,
    memory: { 0: 100, 4: 200, 8: 80, 12: 120, 16: 160, 20: 220 } });

  const wires = [
    // CPU → L1
    W(addr.id, l1.id, 0), W(data.id, l1.id, 1), W(we.id, l1.id, 2),
    W(re.id,   l1.id, 3), W(clk.id, l1.id, 4, 0, { isClockWire: true }),
    // L1 MEM-side → L2 CPU-side
    W(l1.id, l2.id, 0, 3),  // L1.MEM_ADDR → L2.ADDR
    W(l1.id, l2.id, 1, 4),  // L1.MEM_DATA_OUT → L2.DATA
    W(l1.id, l2.id, 2, 6),  // L1.MEM_WE → L2.WE
    W(l1.id, l2.id, 3, 5),  // L1.MEM_RE → L2.RE
    W(clk.id, l2.id, 4, 0, { isClockWire: true }),
    // L2 MEM-side → RAM
    W(l2.id, ram.id, 0, 3), W(l2.id, ram.id, 1, 4),
    W(l2.id, ram.id, 2, 6), W(l2.id, ram.id, 3, 5),
    W(clk.id, ram.id, 4, 0, { isClockWire: true }),
    // RAM → L2.MEM_DATA_IN, L2 → L1.MEM_DATA_IN
    W(ram.id, l2.id, 5),
    W(l2.id,  l1.id, 5),
  ];
  return { nodes: [addr, data, we, re, clk, l1, l2, ram], wires, addr, clk, l1, l2, ram };
}
function tick(s, ffs) {
  s.clk.value = 1; evaluate(s.nodes, s.wires, ffs, 0);
  s.clk.value = 0; evaluate(s.nodes, s.wires, ffs, 0);
}

// ── 1. L2 absorbs L1 misses for working set within L2 capacity ──
// 6 distinct addrs cycled twice. L1 (4 lines, direct) thrashes badly:
// addr 0 → idx=0&3=0; addr 4 → idx=0; addr 8 → idx=0; addr 16 → idx=0;
// every access is L1 miss. L2 (16 lines fully-assoc) holds all 6 after
// the first pass ⇒ second pass has 100% L2 hits.
console.log('[1] L2 absorbs L1 misses when working set fits L2');
{
  const s = buildScene();
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  const trace = [0, 4, 8, 12, 16, 20,  0, 4, 8, 12, 16, 20];
  for (const a of trace) { s.addr.fixedValue = a; tick(s, ffs); }
  const m1 = ffs.get(s.l1.id).stats;
  const m2 = ffs.get(s.l2.id).stats;
  check('L1: 12 misses (direct-mapped thrash)', m1.misses === 12);
  check('L2: exactly 6 misses (compulsory only)', m2.misses === 6);
  check('L2: 6 hits on the second pass',          m2.hits === 6);
}

// ── 2. L2 hit returns the right data via L1 ──
// On an L1 miss, L2 should provide the value through MEM_DATA_IN; the
// next L1 access of the same addr should hit and return the same value.
console.log('\n[2] Data flows correctly through the hierarchy');
{
  const s = buildScene();
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  s.addr.fixedValue = 4; tick(s, ffs); // L1 miss, L2 miss, RAM read → 200
  s.addr.fixedValue = 4; tick(s, ffs); // L1 hit (just filled) ⇒ data 200
  const ms1 = ffs.get(s.l1.id);
  const line0 = ms1.lines[0]; // addr 4 maps to line 0 in 4-line direct
  check('L1 line filled with addr 4 data',     line0 && line0.valid === 1 && line0.data === 200);
  check('L1 hits++ after refill',              ms1.stats.hits === 1);
}

// ── 3. L2 capacity overflow: addresses outside L2 reach RAM ──────
// Drive 17 distinct addrs (L2 has 16 lines). The 17th evicts something
// in L2; re-accessing the evicted addr causes both an L1 miss and an L2
// miss ⇒ RAM is touched again.
console.log('\n[3] L2 overflow forces a real RAM round-trip');
{
  const s = buildScene();
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  // 17 distinct addrs, then re-touch the first.
  for (let a = 0; a < 17 * 4; a += 4) { s.addr.fixedValue = a; tick(s, ffs); }
  const m2BeforeEviction = ffs.get(s.l2.id).stats.misses;
  // The 17th (a=64) already happened; addr 0 should now have been
  // evicted (LRU). Re-access addr 0:
  s.addr.fixedValue = 0; tick(s, ffs);
  const m2After = ffs.get(s.l2.id).stats.misses;
  check('L2 misses increase on re-access of evicted addr',
        m2After === m2BeforeEviction + 1);
}

console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
