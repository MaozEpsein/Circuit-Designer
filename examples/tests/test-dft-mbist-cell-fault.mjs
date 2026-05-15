// MBIST — memory-cell fault detection. Verifies that an MBIST_CONTROLLER
// asserts FAIL with the correct failAddr when a RAM cell is stuck-at,
// for both whole-word and per-bit fault injections.

import { createComponent, createWire, COMPONENT_TYPES } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

let _idc = 0;
const nid = () => 'n' + (++_idc);
const wid = () => 'w' + (++_idc);
function mk(type, ov = {}) { const n = createComponent(type, 0, 0); n.id = nid(); Object.assign(n, ov); return n; }
function W(src, dst, dstPin = 0, srcPin = 0, opts = {}) {
  const w = createWire(src, dst, dstPin, srcPin, opts); w.id = wid(); return w;
}

function run(cellFaults) {
  _idc = 0;
  const clk   = mk('CLOCK',  { value: 0 });
  const start = mk('INPUT',  { fixedValue: 0 });
  const reset = mk('INPUT',  { fixedValue: 0 });
  const ram   = mk('RAM',    { addrBits: 2, dataBits: 4, memory: {}, cellFaults });
  const mbist = mk('MBIST_CONTROLLER', { addrBits: 2, dataBits: 4 });
  const nodes = [clk, start, reset, ram, mbist];
  const wires = [
    W(clk.id, mbist.id, 3, 0, { isClockWire: true }),
    W(start.id, mbist.id, 0),
    W(reset.id, mbist.id, 1),
    W(ram.id, mbist.id, 2),
    W(clk.id, ram.id, 4, 0, { isClockWire: true }),
    W(mbist.id, ram.id, 0, 5),
    W(mbist.id, ram.id, 1, 6),
    W(mbist.id, ram.id, 2, 7),
    W(mbist.id, ram.id, 3, 8),
  ];
  const ffStates = new Map();
  function tick() {
    clk.value = 1; evaluate(nodes, wires, ffStates, 0);
    clk.value = 0; evaluate(nodes, wires, ffStates, 0);
  }
  evaluate(nodes, wires, ffStates, 0);
  start.fixedValue = 1;
  for (let i = 0; i < 200; i++) {
    if (i === 1) start.fixedValue = 0;
    tick();
    const ms = ffStates.get(mbist.id);
    if (ms?.mbistState === 8 || ms?.mbistState === 9) return ms;
  }
  return ffStates.get(mbist.id);
}

// ── Test 1: whole-word stuck-at-1 at cell 1 → FAIL with failAddr=1 ─
console.log('[1] Whole-word stuck-at-1 at addr 1');
{
  const ms = run({ 1: { stuckAt: 1, bit: null } });
  check('state == FAIL', ms?.mbistState === 9, `state=${ms?.mbistState}`);
  check('failAddr == 1', ms?.failAddr === 1, `failAddr=${ms?.failAddr}`);
}

// ── Test 2: whole-word stuck-at-0 at cell 2 → FAIL with failAddr=2 ─
console.log('[2] Whole-word stuck-at-0 at addr 2');
{
  const ms = run({ 2: { stuckAt: 0, bit: null } });
  check('state == FAIL', ms?.mbistState === 9, `state=${ms?.mbistState}`);
  check('failAddr == 2', ms?.failAddr === 2, `failAddr=${ms?.failAddr}`);
}

// ── Test 3: per-bit stuck-at-1 at cell 0 bit 3 → FAIL/addr 0/bit 3 ─
console.log('[3] Per-bit stuck-at-1 at addr 0 bit 3');
{
  const ms = run({ 0: { stuckAt: 1, bit: 3 } });
  check('state == FAIL', ms?.mbistState === 9, `state=${ms?.mbistState}`);
  check('failAddr == 0', ms?.failAddr === 0, `failAddr=${ms?.failAddr}`);
  check('failBit == 3',  ms?.failBit === 3,  `failBit=${ms?.failBit}`);
}

// ── Test 4: per-bit stuck-at-0 at cell 3 bit 0 → FAIL ─────────────
console.log('[4] Per-bit stuck-at-0 at addr 3 bit 0');
{
  const ms = run({ 3: { stuckAt: 0, bit: 0 } });
  check('state == FAIL', ms?.mbistState === 9, `state=${ms?.mbistState}`);
  check('failAddr == 3', ms?.failAddr === 3, `failAddr=${ms?.failAddr}`);
  check('failBit == 0',  ms?.failBit === 0,  `failBit=${ms?.failBit}`);
}

// ── Test 5: clean RAM control → DONE (sanity) ──────────────────────
console.log('[5] Clean RAM control (no faults)');
{
  const ms = run({});
  check('state == DONE', ms?.mbistState === 8, `state=${ms?.mbistState}`);
  check('failAddr null', ms?.failAddr === null);
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
