// Layer 3 — 2-way set-associative cache with LRU replacement.
// Same scaffold as test-cache-direct-mapped.mjs; only the cache prop
// `mapping` differs ('direct' vs 'set-assoc-2'). Verifies that:
//   • a thrash pattern that misses every time on direct-mapped hits
//     cleanly on 2-way (more ways per set ⇒ no eviction conflict),
//   • LRU correctly evicts the least-recently-used way when a third
//     tag conflicts on the same set,
//   • internal layout is ms.sets[N/2] of 2 ways (not ms.lines).
//
// Run:  node examples/tests/test-cache-set-assoc.mjs

import { createComponent, createWire } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

function buildScene(mapping) {
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
  // 4-line cache. Direct: 4 lines, idx = addr & 3. 2-way: 2 sets × 2 ways.
  const cache = mk('CACHE', { lines: 4, dataBits: 8, addrBits: 8, mapping, label: 'L1' });
  const ram  = mk('RAM',   { addrBits: 8, dataBits: 8, asyncRead: true,
    memory: { 0: 100, 4: 200, 8: 80, 12: 120, 5: 50, 9: 90 } });
  const wires = [
    W(addr.id, cache.id, 0),  W(data.id, cache.id, 1), W(we.id, cache.id, 2),
    W(re.id,   cache.id, 3),  W(clk.id,  cache.id, 4, 0, { isClockWire: true }),
    W(ram.id,  cache.id, 5),
    W(cache.id, ram.id, 0, 3), W(cache.id, ram.id, 1, 4),
    W(cache.id, ram.id, 2, 6), W(cache.id, ram.id, 3, 5),
    W(clk.id,   ram.id, 4, 0, { isClockWire: true }),
  ];
  return { nodes: [addr, data, we, re, clk, cache, ram], wires, addr, clk, cache, ram };
}

function tick(s, ffs) {
  s.clk.value = 1; evaluate(s.nodes, s.wires, ffs, 0);
  s.clk.value = 0; evaluate(s.nodes, s.wires, ffs, 0);
}

// ── 1. Internal layout uses ms.sets, not ms.lines ─────────────
console.log('[1] Internal layout: 2-way uses ms.sets[N/2] of 2 ways');
{
  const s = buildScene('set-assoc-2');
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  const ms = ffs.get(s.cache.id);
  check('ms.sets is an array',                Array.isArray(ms.sets));
  check('sets length = N/2 = 2',              ms.sets.length === 2);
  check('each set has exactly 2 ways',        ms.sets.every(set => set.length === 2));
  check('ways have lru field',                ms.sets[0][0].lru === 0);
  check('no ms.lines on set-assoc',           ms.lines === undefined);
}

// ── 2. Thrash pattern: 0,4,0,4 — direct misses every time, 2-way hits ─
// Both addresses map to the same direct-mapped line index (0 & 3 = 0;
// 4 & 3 = 0). On 2-way, both fit into set 0 (one per way) and stay valid.
console.log('\n[2] Thrash 0,4,0,4: direct=8 misses, 2-way≈2 misses + 6 hits');
{
  const trace = [0, 4, 0, 4, 0, 4, 0, 4];

  const sd = buildScene('direct');
  const ffsD = new Map();
  evaluate(sd.nodes, sd.wires, ffsD, 0);
  for (const a of trace) { sd.addr.fixedValue = a; tick(sd, ffsD); }
  const dm = ffsD.get(sd.cache.id);
  check('direct: 0 hits',                     dm.stats.hits === 0);
  check('direct: 8 misses',                   dm.stats.misses === 8);

  const ss = buildScene('set-assoc-2');
  const ffsS = new Map();
  evaluate(ss.nodes, ss.wires, ffsS, 0);
  for (const a of trace) { ss.addr.fixedValue = a; tick(ss, ffsS); }
  const sm = ffsS.get(ss.cache.id);
  check('2-way: 6 hits (after 2 compulsory)', sm.stats.hits === 6);
  check('2-way: 2 misses',                    sm.stats.misses === 2);
}

// ── 3. LRU eviction: 0,4,8 → all map to set 0; third evicts way 0 (addr 0) ─
// Subsequent access to addr 0 should miss; addr 4 should still hit.
console.log('\n[3] LRU evicts least-recently-used way on 3rd conflicting tag');
{
  const s = buildScene('set-assoc-2');
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);

  // sets=2 ⇒ indexBits=1 ⇒ for addrs with idx=0: tag = addr >> 1.
  //   addr 0 → tag 0, addr 4 → tag 2, addr 8 → tag 4, addr 12 → tag 6.
  s.addr.fixedValue = 0; tick(s, ffs); // miss, fill tag 0 (lru=1)
  s.addr.fixedValue = 4; tick(s, ffs); // miss, fill tag 2 (lru=2)
  s.addr.fixedValue = 8; tick(s, ffs); // miss, evicts tag 0 (smaller lru), fills tag 4 (lru=3)

  const ms = ffs.get(s.cache.id);
  check('after 3 misses set 0 holds tags {2,4}',
    ms.sets[0].map(w => w.tag).sort((a,b)=>a-b).join(',') === '2,4');

  s.addr.fixedValue = 4; tick(s, ffs); // hit
  check('addr 4 still cached → hit',          ms.stats.hits === 1);

  s.addr.fixedValue = 0; tick(s, ffs); // miss, evicts tag 4 (LRU now), refills tag 0
  check('addr 0 evicted earlier → miss',      ms.stats.misses === 4);

  // Re-touch addr 4 (tag 2 becomes MRU), then addr 12 (tag 6) should
  // evict tag 0 (which was just refilled but is now LRU vs the freshly
  // touched tag 2).
  s.addr.fixedValue = 4;  tick(s, ffs); // hit (tag 2 → MRU)
  s.addr.fixedValue = 12; tick(s, ffs); // miss, evicts tag 0
  const tags = ms.sets[0].map(w => w.tag).sort((a,b)=>a-b);
  check('LRU preserved recently-touched tag 2', tags.includes(2));
  check('LRU brought in new tag 6 for addr 12', tags.includes(6));
  check('LRU evicted stale tag 0',              !tags.includes(0));
}

// ── 4. Stats are mirrored to __cache_stats__ for the panel ────
console.log('\n[4] Cache stats Map populated for set-associative caches');
{
  const s = buildScene('set-assoc-2');
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  s.addr.fixedValue = 0; tick(s, ffs);
  s.addr.fixedValue = 4; tick(s, ffs);
  s.addr.fixedValue = 0; tick(s, ffs);

  const map = ffs.get('__cache_stats__');
  check('__cache_stats__ exists',             map instanceof Map);
  const snap = map && map.get(s.cache.id);
  check('snap mirrors hits/misses',           snap && snap.hits === 1 && snap.misses === 2);
  check('snap.recent has 3 entries',          snap.recent.length === 3);
}

// ── 5. Generic N-way: ways=4 ⇒ 1 set, 4 lines (proves generalization) ──
console.log('\n[5] Generic ways=4: lines=4 collapses to a single 4-way set');
{
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
  const cache = mk('CACHE', { lines: 4, dataBits: 8, addrBits: 8, mapping: 'set-assoc', ways: 4, label: 'L1' });
  const ram  = mk('RAM',   { addrBits: 8, dataBits: 8, asyncRead: true,
    memory: { 0: 1, 4: 2, 8: 3, 12: 4, 16: 5 } });
  const wires = [
    W(addr.id, cache.id, 0), W(data.id, cache.id, 1), W(we.id, cache.id, 2),
    W(re.id,   cache.id, 3), W(clk.id,  cache.id, 4, 0, { isClockWire: true }),
    W(ram.id,  cache.id, 5),
    W(cache.id, ram.id, 0, 3), W(cache.id, ram.id, 1, 4),
    W(cache.id, ram.id, 2, 6), W(cache.id, ram.id, 3, 5),
    W(clk.id,   ram.id, 4, 0, { isClockWire: true }),
  ];
  const nodes = [addr, data, we, re, clk, cache, ram];
  const ffs = new Map();
  evaluate(nodes, wires, ffs, 0);
  const ms = ffs.get(cache.id);
  check('ways=4 ⇒ 1 set',                     ms.sets.length === 1);
  check('that set holds 4 ways',              ms.sets[0].length === 4);

  const tick4 = () => { clk.value = 1; evaluate(nodes, wires, ffs, 0); clk.value = 0; evaluate(nodes, wires, ffs, 0); };
  // 4 distinct addrs → 4 misses fill all ways. 5th distinct addr evicts LRU.
  for (const a of [0, 4, 8, 12]) { addr.fixedValue = a; tick4(); }
  check('4 distinct addrs ⇒ all ways valid', ms.sets[0].every(w => w.valid === 1));
  // Repeat 0 should hit (still cached).
  addr.fixedValue = 0; tick4();
  check('repeat addr 0 ⇒ HIT after 4-way fill', ms.stats.hits === 1);
  // Now bring 16 → conflict, evicts the LRU way (which is addr 4 since 0 was just touched).
  addr.fixedValue = 16; tick4();
  const tags = ms.sets[0].map(w => w.tag).sort((a,b)=>a-b);
  check('4-way LRU evicted addr 4 (lru=2)',   !tags.includes(4));
}

// ── Summary ───────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
