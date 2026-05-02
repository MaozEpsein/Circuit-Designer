// Layer 7 — write-back cache policy.
// Verifies the policy switch on the CACHE component (writePolicy ∈
// {write-through, write-back}) implements the textbook semantics:
//
//   write-through: every CPU write also drives MEM_WE (RAM stays
//                  in sync each cycle).
//   write-back:    CPU writes stay in the line (dirty=1); RAM is only
//                  updated when a dirty line is evicted (engine
//                  mutates the next layer's storage directly because
//                  the bus is busy with the refill).
//
// Run:  node examples/tests/test-cache-write-back.mjs

import { createComponent, createWire } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

function buildScene(writePolicy) {
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
  const cache = mk('CACHE', { lines: 4, dataBits: 8, addrBits: 8, mapping: 'direct', writePolicy, label: 'L1' });
  const ram  = mk('RAM',   { addrBits: 8, dataBits: 8, asyncRead: true,
    memory: { 0: 100, 4: 200, 8: 80, 12: 120, 16: 160 } });
  const wires = [
    W(addr.id, cache.id, 0), W(data.id, cache.id, 1), W(we.id, cache.id, 2),
    W(re.id,   cache.id, 3), W(clk.id, cache.id, 4, 0, { isClockWire: true }),
    W(ram.id,  cache.id, 5),
    W(cache.id, ram.id, 0, 3), W(cache.id, ram.id, 1, 4),
    W(cache.id, ram.id, 2, 6), W(cache.id, ram.id, 3, 5),
    W(clk.id,   ram.id, 4, 0, { isClockWire: true }),
  ];
  return { nodes: [addr, data, we, re, clk, cache, ram], wires, addr, data, we, re, clk, cache, ram };
}
function tick(s, ffs) {
  s.clk.value = 1; evaluate(s.nodes, s.wires, ffs, 0);
  s.clk.value = 0; evaluate(s.nodes, s.wires, ffs, 0);
}

// ── 1. write-through: every write reaches RAM each cycle ──
console.log('[1] write-through: each CPU write updates RAM live');
{
  const s = buildScene('write-through');
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  s.we.fixedValue = 1; s.addr.fixedValue = 0;
  s.data.fixedValue = 11; tick(s, ffs);
  s.data.fixedValue = 22; tick(s, ffs);
  s.data.fixedValue = 33; tick(s, ffs);
  // RAM should hold the latest write (33).
  check('RAM[0] === 33 after 3 writes',       ffs.get(s.ram.id).memory[0] === 33);
  // Lines have no dirty bit set under write-through.
  const ms = ffs.get(s.cache.id);
  check('line[0] not dirty under WT',         (ms.lines[0].dirty || 0) === 0);
  check('no writebacks counter under WT',     !ms.stats.writebacks);
}

// ── 2. write-back: writes stay in cache; RAM untouched ─────
console.log('\n[2] write-back: CPU writes stay in the line, RAM unchanged');
{
  const s = buildScene('write-back');
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  s.we.fixedValue = 1; s.addr.fixedValue = 0;
  s.data.fixedValue = 11; tick(s, ffs);
  s.data.fixedValue = 22; tick(s, ffs);
  s.data.fixedValue = 33; tick(s, ffs);
  const ms = ffs.get(s.cache.id);
  check('line[0] holds latest write (33)',    ms.lines[0].data === 33);
  check('line[0] dirty bit set',              ms.lines[0].dirty === 1);
  // RAM was never written by the cache — initial value preserved.
  check('RAM[0] still 100 (unchanged)',       ffs.get(s.ram.id).memory[0] === 100);
}

// ── 3. write-back: dirty eviction writes back to RAM ──────
console.log('\n[3] write-back: evicting a dirty line writes back to RAM');
{
  const s = buildScene('write-back');
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  // Write to addr 0, then access addr 4 which maps to the same line
  // (idx = 4 & 3 = 0) ⇒ evicts addr 0's line.
  s.we.fixedValue = 1; s.addr.fixedValue = 0; s.data.fixedValue = 99; tick(s, ffs);
  const ms = ffs.get(s.cache.id);
  check('line dirty before eviction',         ms.lines[0].dirty === 1);
  check('RAM[0] still 100 before eviction',   ffs.get(s.ram.id).memory[0] === 100);
  // Now read addr 4 — different tag, same idx ⇒ eviction.
  s.we.fixedValue = 0; s.addr.fixedValue = 4; tick(s, ffs);
  check('RAM[0] = 99 after dirty eviction',   ffs.get(s.ram.id).memory[0] === 99);
  check('writebacks counter == 1',            ms.stats.writebacks === 1);
  // Cache now holds addr 4's line, clean.
  check('new line[0] is for addr 4',          ms.lines[0].tag === 1 && ms.lines[0].valid === 1);
  check('new line[0] not dirty (read-fill)',  ms.lines[0].dirty === 0);
}

// ── 4. write-back: clean eviction does NOT write back ──────
console.log('\n[4] write-back: evicting a clean line does NOT write back');
{
  const s = buildScene('write-back');
  const ffs = new Map();
  evaluate(s.nodes, s.wires, ffs, 0);
  // Read-fill addr 0 (line clean), then read addr 4 ⇒ eviction without writeback.
  s.addr.fixedValue = 0; tick(s, ffs);
  s.addr.fixedValue = 4; tick(s, ffs);
  const ms = ffs.get(s.cache.id);
  check('writebacks counter still 0',          (ms.stats.writebacks || 0) === 0);
  check('RAM[0] unchanged',                    ffs.get(s.ram.id).memory[0] === 100);
}

// ── 5. write-back set-associative: dirty bit per way ──────
console.log('\n[5] write-back set-associative: per-way dirty + LRU eviction');
{
  let id = 0;
  const nid = () => 'n' + (++id);
  const wid = () => 'w' + (++id);
  const mk = (type, ov = {}) => Object.assign(createComponent(type, 0, 0), { id: nid() }, ov);
  const W  = (s2, d, dp = 0, sp = 0, op = {}) => Object.assign(createWire(s2, d, dp, sp, op), { id: wid() });

  const addr = mk('INPUT', { fixedValue: 0 });
  const data = mk('INPUT', { fixedValue: 0 });
  const we   = mk('INPUT', { fixedValue: 0 });
  const re   = mk('INPUT', { fixedValue: 1 });
  const clk  = mk('CLOCK', { value: 0 });
  const cache = mk('CACHE', { lines: 4, dataBits: 8, addrBits: 8, mapping: 'set-assoc', ways: 2, writePolicy: 'write-back', label: 'L1' });
  const ram  = mk('RAM',   { addrBits: 8, dataBits: 8, asyncRead: true,
    memory: { 0: 100, 4: 200, 8: 80 } });
  const wires = [
    W(addr.id, cache.id, 0), W(data.id, cache.id, 1), W(we.id, cache.id, 2),
    W(re.id,   cache.id, 3), W(clk.id, cache.id, 4, 0, { isClockWire: true }),
    W(ram.id,  cache.id, 5),
    W(cache.id, ram.id, 0, 3), W(cache.id, ram.id, 1, 4),
    W(cache.id, ram.id, 2, 6), W(cache.id, ram.id, 3, 5),
    W(clk.id,   ram.id, 4, 0, { isClockWire: true }),
  ];
  const nodes = [addr, data, we, re, clk, cache, ram];
  const ffs = new Map();
  evaluate(nodes, wires, ffs, 0);
  const tick2 = () => { clk.value = 1; evaluate(nodes, wires, ffs, 0); clk.value = 0; evaluate(nodes, wires, ffs, 0); };
  // Write addr 0 (way 0), write addr 4 (way 1) — both dirty in set 0.
  we.fixedValue = 1;
  addr.fixedValue = 0; data.fixedValue = 77; tick2();
  addr.fixedValue = 4; data.fixedValue = 88; tick2();
  const ms = ffs.get(cache.id);
  const dirtyCount = ms.sets[0].filter(w => w.dirty).length;
  check('both ways in set 0 are dirty',          dirtyCount === 2);
  // Read addr 8 — same set (idx = 0 with sets=2: 8 & 1 = 0). Evicts LRU way (addr 0).
  we.fixedValue = 0;
  addr.fixedValue = 8; tick2();
  check('writebacks counter == 1 after evict',   ms.stats.writebacks === 1);
  check('RAM[0] = 77 (LRU dirty wrote back)',    ffs.get(ram.id).memory[0] === 77);
  check('RAM[4] still 200 (still cached dirty)', ffs.get(ram.id).memory[4] === 200);
}

console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
