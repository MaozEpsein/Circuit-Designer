// Layer 4 — fully-associative cache. The engine already supports
// `mapping: 'fully-assoc'` via the N-way generalization in Layer 3
// (sets=1, ways=lines). This test pins down that promise:
//   • a workload that thrashes 2-way (3 conflicting tags into 1 set
//     of 2 ways) hits cleanly when the cache is fully-associative,
//   • internal layout is ms.sets[1] of N ways,
//   • LRU eviction kicks in once we exceed the line budget.
//
// Run:  node examples/tests/test-cache-fully-assoc.mjs

import { createComponent, createWire } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

function buildScene(mapping, ways) {
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
  const cacheProps = { lines: 4, dataBits: 8, addrBits: 8, mapping, label: 'L1' };
  if (ways) cacheProps.ways = ways;
  const cache = mk('CACHE', cacheProps);
  const ram  = mk('RAM',   { addrBits: 8, dataBits: 8, asyncRead: true,
    memory: { 0: 100, 4: 200, 8: 80, 12: 120, 16: 160 } });
  const wires = [
    W(addr.id, cache.id, 0), W(data.id, cache.id, 1), W(we.id, cache.id, 2),
    W(re.id,   cache.id, 3), W(clk.id,  cache.id, 4, 0, { isClockWire: true }),
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

// ── 1. Internal layout: 1 set of N ways ───────────────────────
console.log('[1] fully-assoc layout: ms.sets[1] of N ways');
{
  const s = buildScene('fully-assoc');
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  const ms = ffs.get(s.cache.id);
  check('ms.sets exists',                     Array.isArray(ms.sets));
  check('exactly 1 set',                      ms.sets.length === 1);
  check('that set holds N=4 ways',            ms.sets[0].length === 4);
  check('no ms.lines',                        ms.lines === undefined);
}

// ── 2. Thrash 0,4,8: 2-way misses every time, fully-assoc hits ─
// All three addrs map to set 0 of a 2-way (idx = addr & 1 = 0 with 2 sets).
// 3 competing tags into 2 ways ⇒ LRU keeps evicting ⇒ 100% miss after warmup.
// Fully-assoc with 4 lines fits all three ⇒ 3 compulsory misses, then 100% hits.
console.log('\n[2] Thrash 0,4,8 cycled: 2-way misses, fully-assoc hits cleanly');
{
  const trace = [0, 4, 8, 0, 4, 8, 0, 4, 8];

  const s2 = buildScene('set-assoc', 2);
  const ffs2 = new Map();
  evaluate(s2.nodes, s2.wires, ffs2, 0);
  for (const a of trace) { s2.addr.fixedValue = a; tick(s2, ffs2); }
  const m2 = ffs2.get(s2.cache.id);
  check('2-way: 9 misses (full thrash)',      m2.stats.misses === 9);
  check('2-way: 0 hits',                      m2.stats.hits === 0);

  const sf = buildScene('fully-assoc');
  const ffsF = new Map();
  evaluate(sf.nodes, sf.wires, ffsF, 0);
  for (const a of trace) { sf.addr.fixedValue = a; tick(sf, ffsF); }
  const mf = ffsF.get(sf.cache.id);
  check('fully-assoc: 3 compulsory misses',   mf.stats.misses === 3);
  check('fully-assoc: 6 hits after warmup',   mf.stats.hits === 6);
}

// ── 3. LRU eviction once line budget is exceeded ──────────────
// 4 distinct addrs fill the cache; a 5th must evict the LRU way (addr 0,
// which has not been touched since cycle 1).
console.log('\n[3] fully-assoc evicts LRU once cache is full');
{
  const s = buildScene('fully-assoc');
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);

  for (const a of [0, 4, 8, 12]) { s.addr.fixedValue = a; tick(s, ffs); } // 4 misses, fills all
  const ms = ffs.get(s.cache.id);
  check('all 4 ways valid after 4 fills',     ms.sets[0].every(w => w.valid === 1));
  // 5th distinct addr — must evict addr 0 (oldest).
  s.addr.fixedValue = 16; tick(s, ffs);
  const tags = ms.sets[0].map(w => w.tag).sort((a,b)=>a-b);
  check('tag for addr 0 evicted',             !tags.includes(0));
  check('tag for addr 16 cached',             tags.includes(16));
  // Now access addr 0 again — should miss (was evicted).
  s.addr.fixedValue = 0; tick(s, ffs);
  check('re-access of evicted addr 0 ⇒ miss', ms.stats.misses === 6);
}

// ── 4. Cache stats Map populated for fully-assoc too ──────────
console.log('\n[4] __cache_stats__ map keyed by cache id, label preserved');
{
  const s = buildScene('fully-assoc');
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  s.addr.fixedValue = 0; tick(s, ffs);
  s.addr.fixedValue = 4; tick(s, ffs);
  s.addr.fixedValue = 0; tick(s, ffs); // hit
  const map = ffs.get('__cache_stats__');
  const snap = map && map.get(s.cache.id);
  check('snap exists',                        !!snap);
  check('snap mirrors hits',                  snap.hits === 1);
  check('snap mirrors misses',                snap.misses === 2);
  check('snap.label preserved',               snap.label === 'L1');
}

console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
