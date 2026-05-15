// MBIST — March C− happy path. Builds a minimal scene with one
// MBIST_CONTROLLER driving a small RAM and verifies the FSM walks
// the algorithm end-to-end on a clean RAM, reaching DONE/PASS.

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
function mk(type, ov = {}) {
  const n = createComponent(type, 0, 0); n.id = nid();
  Object.assign(n, ov); return n;
}
function W(src, dst, dstPin = 0, srcPin = 0, opts = {}) {
  const w = createWire(src, dst, dstPin, srcPin, opts); w.id = wid(); return w;
}

function buildScene({ addrBits = 2, dataBits = 4, cellFaults = {} } = {}) {
  _idc = 0;
  const clk   = mk('CLOCK',  { value: 0 });
  const start = mk('INPUT',  { fixedValue: 0, label: 'START' });
  const reset = mk('INPUT',  { fixedValue: 0, label: 'RESET' });
  const ram   = mk('RAM',    { addrBits, dataBits, memory: {}, cellFaults });
  const mbist = mk('MBIST_CONTROLLER', { addrBits, dataBits });
  // RAM placed BEFORE MBIST so Phase 2b processes it first (so its
  // ms.q update precedes MBIST's sample in the same tick — but the
  // FSM is already designed for a 1-cycle sample latency via subPhase 1).
  const nodes = [clk, start, reset, ram, mbist];
  const wires = [
    W(clk.id,   mbist.id, 3, 0, { isClockWire: true }),
    W(start.id, mbist.id, 0),
    W(reset.id, mbist.id, 1),
    W(ram.id,   mbist.id, 2),  // RAM.Q → MBIST.DATA_IN
    W(clk.id,   ram.id,   4, 0, { isClockWire: true }),
    W(mbist.id, ram.id,   0, 5),  // ADDR
    W(mbist.id, ram.id,   1, 6),  // DATA_OUT
    W(mbist.id, ram.id,   2, 7),  // WE
    W(mbist.id, ram.id,   3, 8),  // RE
  ];
  return { clk, start, reset, ram, mbist, nodes, wires };
}

function runUntilTerminal({ nodes, wires, clk, start, mbist }, maxTicks = 200) {
  const ffStates = new Map();
  function tick() {
    clk.value = 1; evaluate(nodes, wires, ffStates, 0);
    clk.value = 0; evaluate(nodes, wires, ffStates, 0);
  }
  evaluate(nodes, wires, ffStates, 0);
  start.fixedValue = 1;
  let ticks = 0;
  const trail = new Set();
  for (let i = 0; i < maxTicks; i++) {
    if (i === 1) start.fixedValue = 0;
    tick(); ticks++;
    const ms = ffStates.get(mbist.id);
    if (ms) trail.add(ms.mbistState);
    if (ms && (ms.mbistState === 8 || ms.mbistState === 9)) break;
  }
  return { ticks, ffStates, trail };
}

// ── Test 1: clean RAM → DONE/PASS ──────────────────────────
console.log('[1] March C− happy path on clean 4×4 RAM');
{
  const scene = buildScene({ addrBits: 2, dataBits: 4 });
  const { ticks, ffStates, trail } = runUntilTerminal(scene);
  const ms = ffStates.get(scene.mbist.id);
  check('terminates within budget', ticks > 0 && ticks < 200, `ticks=${ticks}`);
  check('final state = DONE',       ms?.mbistState === 8, `state=${ms?.mbistState}`);
  check('failAddr cleared',         ms?.failAddr === null, `failAddr=${ms?.failAddr}`);
  // Coverage: trail should include SETUP, W0_UP, RW1_UP, RW0_UP, RW1_DN, RW0_DN, READ_FINAL, DONE.
  for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) {
    check(`trail includes state ${s}`, trail.has(s));
  }
  // RAM should end clean (all cells 0 after the final w0 pass).
  const ramMs = ffStates.get(scene.ram.id);
  const allZero = Object.values(ramMs?.memory || {}).every(v => v === 0);
  check('RAM cells all read 0 at end', allZero, JSON.stringify(ramMs?.memory));
}

// ── Test 2: synchronous reset returns FSM to IDLE ──────────
console.log('[2] Synchronous RESET returns FSM to IDLE');
{
  const scene = buildScene({ addrBits: 2, dataBits: 4 });
  const ffStates = new Map();
  function tick() {
    scene.clk.value = 1; evaluate(scene.nodes, scene.wires, ffStates, 0);
    scene.clk.value = 0; evaluate(scene.nodes, scene.wires, ffStates, 0);
  }
  evaluate(scene.nodes, scene.wires, ffStates, 0);
  scene.start.fixedValue = 1; tick();
  scene.start.fixedValue = 0;
  for (let i = 0; i < 8; i++) tick();
  const beforeReset = ffStates.get(scene.mbist.id)?.mbistState;
  check('FSM in non-IDLE before reset', beforeReset !== 0, `state=${beforeReset}`);
  scene.reset.fixedValue = 1; tick();
  scene.reset.fixedValue = 0;
  const afterReset = ffStates.get(scene.mbist.id);
  check('FSM in IDLE after reset',  afterReset?.mbistState === 0, `state=${afterReset?.mbistState}`);
  check('addrCounter cleared',      afterReset?.addrCounter === 0);
  check('marchStep cleared',        afterReset?.marchStep === 0);
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
