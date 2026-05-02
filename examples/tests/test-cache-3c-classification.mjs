// Layer 5 — 3C miss classification (Hill 1989).
//   • Compulsory: first time this address is ever seen.
//   • Capacity:   would have missed even in a fully-associative cache
//                 of the same line budget (working set > capacity).
//   • Conflict:   would have hit in the fully-associative shadow but
//                 the real cache's mapping forced an eviction.
//
// Engine maintains a per-cache shadow fully-associative cache (with
// the same N=node.lines budget and LRU) and classifies every real
// miss against it. Verified here per workload + via the snapshot
// mirror that the Pipeline panel reads.
//
// Run:  node examples/tests/test-cache-3c-classification.mjs

import { createComponent, createWire } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

function buildScene(mapping, opts = {}) {
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
  const cacheProps = { lines: opts.lines || 4, dataBits: 8, addrBits: 8, mapping, label: opts.label || 'L1' };
  if (opts.ways) cacheProps.ways = opts.ways;
  const cache = mk('CACHE', cacheProps);
  const ram  = mk('RAM',   { addrBits: 8, dataBits: 8, asyncRead: true,
    memory: { 0: 1, 4: 2, 8: 3, 12: 4, 16: 5, 20: 6, 24: 7, 28: 8 } });
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
function drive(s, ffs, trace) {
  for (const a of trace) { s.addr.fixedValue = a; tick(s, ffs); }
  return ffs.get(s.cache.id).stats.miss3C;
}

// ── 1. Compulsory only: each address seen exactly once, fits in cache ──
console.log('[1] All-compulsory: 4 unique addrs into 4-line cache');
{
  const s = buildScene('fully-assoc');
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  const c = drive(s, ffs, [0, 4, 8, 12]);
  check('4 compulsory misses',                c.compulsory === 4);
  check('0 capacity',                         c.capacity === 0);
  check('0 conflict',                         c.conflict === 0);
}

// ── 2. Capacity-dominant: working set > line budget on fully-assoc ──
// 5 addresses cycled in a 4-line fully-associative cache. After the
// 4 compulsory misses, every later access misses BOTH real and shadow
// (since they share the same fully-assoc + LRU policy) ⇒ capacity.
console.log('\n[2] Capacity-dominant: 5 addrs cycled into 4-line fully-assoc');
{
  const s = buildScene('fully-assoc');
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  const c = drive(s, ffs, [0, 4, 8, 12, 16,  0, 4, 8, 12, 16,  0, 4, 8, 12, 16]);
  check('5 compulsory (one per unique addr)',  c.compulsory === 5);
  check('capacity > 0',                        c.capacity > 0);
  check('conflict === 0 (fully-assoc shadow=real)', c.conflict === 0);
}

// ── 3. Conflict-dominant: working set fits in fully-assoc but thrashes 2-way ──
// 3 addresses (0, 4, 8) all map to set 0 of a 2-way 4-line cache (idx=0,
// tags 0/2/4). All 3 fit easily in the 4-line shadow (fully-assoc) ⇒ shadow
// hits after warmup ⇒ classified as conflict.
console.log('\n[3] Conflict-dominant: 3 addrs thrash a 2-way set');
{
  const s = buildScene('set-assoc', { ways: 2 });
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  const c = drive(s, ffs, [0, 4, 8,  0, 4, 8,  0, 4, 8]);
  check('3 compulsory misses',                 c.compulsory === 3);
  check('0 capacity (set fits in shadow)',     c.capacity === 0);
  check('conflict > 0 (set-assoc thrashes)',   c.conflict > 0);
  check('compulsory + conflict = total misses',
        c.compulsory + c.conflict === ffs.get(s.cache.id).stats.misses);
}

// ── 4. Direct-mapped pure conflict: 0,4 thrash on a 4-line direct cache ──
// addr 0 & 4 both map to line 0 of a 4-line direct-mapped cache. Two tags
// fit easily in the 4-line shadow ⇒ all post-warmup misses are conflict.
console.log('\n[4] Direct-mapped 0,4 thrash: pure conflict misses');
{
  const s = buildScene('direct');
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  const c = drive(s, ffs, [0, 4, 0, 4, 0, 4, 0, 4]);
  check('2 compulsory (one per addr)',         c.compulsory === 2);
  check('0 capacity',                          c.capacity === 0);
  check('rest are conflict',                   c.conflict === 6);
}

// ── 5. Snapshot Map mirrors miss3C for the panel ─────────────
console.log('\n[5] __cache_stats__ snapshot exposes miss3C breakdown');
{
  const s = buildScene('direct');
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  drive(s, ffs, [0, 4, 0, 4]);
  const map = ffs.get('__cache_stats__');
  const snap = map.get(s.cache.id);
  check('snap.miss3C exists',                  snap && snap.miss3C);
  check('mirrors compulsory=2',                snap.miss3C.compulsory === 2);
  check('mirrors conflict=2',                  snap.miss3C.conflict === 2);
  check('mirrors capacity=0',                  snap.miss3C.capacity === 0);
}

// ── 6. Miss totals reconcile: hits + sum(3C) === total accesses ───
console.log('\n[6] Sanity: hits + (compulsory + capacity + conflict) === accesses');
{
  const s = buildScene('set-assoc', { ways: 2 });
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  const trace = [0, 4, 8, 0, 4, 8, 12, 16];
  drive(s, ffs, trace);
  const ms = ffs.get(s.cache.id);
  const sum3C = ms.stats.miss3C.compulsory + ms.stats.miss3C.capacity + ms.stats.miss3C.conflict;
  check('sum of 3C === total misses',          sum3C === ms.stats.misses);
  check('hits + misses === access count',      ms.stats.hits + ms.stats.misses === trace.length);
}

console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
