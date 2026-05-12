// Layer 7 — JTAG TAP controller (IEEE 1149.1) + BOUNDARY_SCAN_CELL.
//
// Verifies:
//   1. Type registration + factory defaults.
//   2. TRST forces Test-Logic-Reset (state 0).
//   3. 5 × TMS=1 from any state reaches Test-Logic-Reset.
//   4. Canonical navigation:
//        TLR --0--> RTI --1--> Select-DR --1--> Select-IR --0-->
//        Capture-IR --0--> Shift-IR  (and through DR mirror).
//   5. Capture-IR loads IR with `0...01` per IEEE.
//   6. Shift-IR shifts TDI in (MSB-side) and TDO out (LSB) bit-by-bit.
//   7. IDCODE path: after reset, IR LSB = 1 → Capture-DR preloads the
//      32-bit IDCODE; Shift-DR clocks it out on TDO LSB-first.
//   8. BOUNDARY_SCAN_CELL: SHIFT=1 latches SI; rising MODE 0→1 captures
//      the latched bit; MODE=1 routes the captured value to PO; MODE=0
//      passes PI straight to PO.
//
// Pin layout in the engine:
//   JTAG_TAP            — TCK(0)*, TMS(1), TDI(2), TRST(3)
//   BOUNDARY_SCAN_CELL  — PI(0), SI(1), MODE(2), SHIFT(3), CLK(4)*
//   (* clock pin marked via isClockWire on its wire)
//
// Run:  node examples/tests/test-dft-jtag-tap.mjs

import { COMPONENT_TYPES, MEMORY_TYPE_SET, createComponent, createWire } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

const TLR = 0, RTI = 1, SEL_DR = 2, CAP_DR = 3, SHIFT_DR = 4, EXIT1_DR = 5,
      UPD_DR = 8, SEL_IR = 9, CAP_IR = 10, SHIFT_IR = 11, EXIT1_IR = 12, UPD_IR = 15;

console.log('\n-- DFT JTAG TAP + Boundary-Scan --');

// ── 1. Type + factory ────────────────────────────────────────
{
  check("COMPONENT_TYPES.JTAG_TAP === 'JTAG_TAP'", COMPONENT_TYPES.JTAG_TAP === 'JTAG_TAP');
  check("COMPONENT_TYPES.BOUNDARY_SCAN_CELL === 'BOUNDARY_SCAN_CELL'", COMPONENT_TYPES.BOUNDARY_SCAN_CELL === 'BOUNDARY_SCAN_CELL');
  check('MEMORY_TYPE_SET contains JTAG_TAP', MEMORY_TYPE_SET.has('JTAG_TAP'));
  check('MEMORY_TYPE_SET contains BOUNDARY_SCAN_CELL', MEMORY_TYPE_SET.has('BOUNDARY_SCAN_CELL'));
  const tap = createComponent('JTAG_TAP', 0, 0);
  check('default irBits = 4',      tap.irBits === 4);
  check('default idcode set',      typeof tap.idcode === 'number');
  check('default bsrLength = 4',   tap.bsrLength === 4);
  const bsc = createComponent('BOUNDARY_SCAN_CELL', 0, 0);
  check("BSC label = 'BSC'",       bsc.label === 'BSC');
}

// ── Helpers — TAP scene with all 4 control inputs ────────────
function buildTapScene({ irBits = 4, idcode = 0x149511A1 } = {}) {
  const tck  = { ...createComponent('CLOCK', -200,   0), id: 'tck', value: 0 };
  const tms  = { ...createComponent('INPUT', -200,  80), id: 'tms', fixedValue: 0 };
  const tdi  = { ...createComponent('INPUT', -200, 160), id: 'tdi', fixedValue: 0 };
  const trst = { ...createComponent('INPUT', -200, 240), id: 'trst', fixedValue: 0 };
  const tap  = { ...createComponent('JTAG_TAP', 0, 0), id: 'tap', irBits, idcode };
  return {
    nodes: [tck, tms, tdi, trst, tap],
    wires: [
      { ...createWire('tck',  'tap', 0, 0, { isClockWire: true }), id: 'w0' },
      { ...createWire('tms',  'tap', 1), id: 'w1' },
      { ...createWire('tdi',  'tap', 2), id: 'w2' },
      { ...createWire('trst', 'tap', 3), id: 'w3' },
    ],
  };
}

function set(s, id, v) { s.nodes.find(n => n.id === id).fixedValue = v; }
function tick(s, ff, step) {
  s.nodes.find(n => n.id === 'tck').value = 0;
  evaluate(s.nodes, s.wires, ff, step);
  s.nodes.find(n => n.id === 'tck').value = 1;
  evaluate(s.nodes, s.wires, ff, step + 1);
}
function state(ff) { return ff.get('tap').tapState; }

// ── 2. TRST forces TLR ───────────────────────────────────────
{
  const s = buildTapScene();
  const ff = new Map();
  // Move away from TLR first so the test is meaningful.
  set(s, 'tms', 1); tick(s, ff, 0); tick(s, ff, 2); // stays in TLR
  set(s, 'tms', 0); tick(s, ff, 4);                 // TLR → RTI
  check('left TLR (in RTI)', state(ff) === RTI, `state=${state(ff)}`);
  set(s, 'trst', 1); tick(s, ff, 6);
  check('TRST=1 forces TLR', state(ff) === TLR, `state=${state(ff)}`);
}

// ── 3. 5×TMS=1 from arbitrary state reaches TLR ──────────────
{
  const s = buildTapScene();
  const ff = new Map();
  // Drive 5 TMS=1 pulses from power-on (state=0 already, but force
  // a non-TLR start first).
  set(s, 'tms', 0); tick(s, ff, 0);                 // TLR → RTI
  set(s, 'tms', 1); tick(s, ff, 2);                 // RTI → Sel-DR
  set(s, 'tms', 0); tick(s, ff, 4);                 // → Cap-DR
  check('parked away from TLR', state(ff) !== TLR);
  set(s, 'tms', 1);
  for (let i = 0; i < 5; i++) tick(s, ff, 6 + i * 2);
  check('5 × TMS=1 reaches Test-Logic-Reset', state(ff) === TLR, `state=${state(ff)}`);
}

// Drive a sequence of TMS bits and return states visited *after* each.
function walk(s, ff, tmsSeq, t0 = 0) {
  const visited = [];
  for (let i = 0; i < tmsSeq.length; i++) {
    set(s, 'tms', tmsSeq[i]);
    tick(s, ff, t0 + i * 2);
    visited.push(state(ff));
  }
  return visited;
}

// ── 4. Canonical IR-scan navigation ──────────────────────────
{
  const s = buildTapScene();
  const ff = new Map();
  // Force TLR first.
  set(s, 'trst', 1); tick(s, ff, 0); set(s, 'trst', 0);
  // TLR --0--> RTI --1--> Sel-DR --1--> Sel-IR --0--> Cap-IR --0--> Shift-IR
  const seq = [0, 1, 1, 0, 0];
  const v = walk(s, ff, seq, 2);
  check('TLR → RTI',       v[0] === RTI,      `got ${v[0]}`);
  check('RTI → Select-DR', v[1] === SEL_DR,   `got ${v[1]}`);
  check('Sel-DR → Sel-IR', v[2] === SEL_IR,   `got ${v[2]}`);
  check('Sel-IR → Cap-IR', v[3] === CAP_IR,   `got ${v[3]}`);
  check('Cap-IR → Shift-IR', v[4] === SHIFT_IR, `got ${v[4]}`);
}

// ── 5. Capture-IR loads IR = 0...01 per IEEE 1149.1 ──────────
{
  const s = buildTapScene({ irBits: 4 });
  const ff = new Map();
  set(s, 'trst', 1); tick(s, ff, 0); set(s, 'trst', 0);
  // Walk to Shift-IR; Capture-IR happens transitionally.
  walk(s, ff, [0, 1, 1, 0, 0], 2);
  check('Shift-IR reached', state(ff) === SHIFT_IR);
  // After Capture-IR the IR must be 1 (binary 0001).
  check('IR loaded with 0001 in Capture-IR', ff.get('tap').ir === 1,
    `ir=0b${ff.get('tap').ir.toString(2).padStart(4,'0')}`);
}

// ── 6. Shift-IR: shift in 4 TDI bits, read 4 TDO bits ────────
{
  const irBits = 4;
  const s = buildTapScene({ irBits });
  const ff = new Map();
  set(s, 'trst', 1); tick(s, ff, 0); set(s, 'trst', 0);
  walk(s, ff, [0, 1, 1, 0, 0], 2);                  // → Shift-IR
  check('at Shift-IR', state(ff) === SHIFT_IR);

  // Shift in 1,1,0,1 LSB-first via TDI. Each Shift-IR tick (TMS=0)
  // pushes TDI into the MSB side and pops the LSB onto TDO.
  // Before any shifts, IR = 0001 → first TDO bit = 1, then 0,0,0...
  // After shifting bits [1,1,0,1] in, the IR should be 1011 (bits land
  // in MSB end and shift right).
  const tdiBits = [1, 1, 0, 1];
  const tdoBits = [];
  for (let i = 0; i < irBits; i++) {
    set(s, 'tdi', tdiBits[i]);
    set(s, 'tms', 0);
    tick(s, ff, 100 + i * 2);
    tdoBits.push(ff.get('tap').tdo);
  }
  // After 4 shifts IR holds the 4 TDI bits in MSB→LSB order: 1011.
  check('IR after 4 shifts = 0b1011',
    ff.get('tap').ir === 0b1011,
    `ir=0b${ff.get('tap').ir.toString(2).padStart(4,'0')}`);
  // First TDO bit is original IR LSB = 1; the rest are zeros that
  // were initially in the upper bits (Capture-IR loaded 0001).
  check('first TDO bit = original IR LSB (1)', tdoBits[0] === 1, `got ${tdoBits[0]}`);
  check('subsequent TDO bits drain 0,0,0',
    tdoBits[1] === 0 && tdoBits[2] === 0 && tdoBits[3] === 0,
    `got [${tdoBits.join(',')}]`);
}

// ── 7. IDCODE path — after reset, IR LSB=1 selects IDCODE ────
{
  const idcode = 0x149511A1;            // 32 bits
  const s = buildTapScene({ idcode });
  const ff = new Map();
  set(s, 'trst', 1); tick(s, ff, 0); set(s, 'trst', 0);
  // From TLR, IR is reset to 0 — IR LSB is 0, so Capture-DR would load
  // 0. To exercise the IDCODE path we need IR LSB = 1. The post-reset
  // Capture-IR loads 0...01 (LSB=1). We must NOT pass through Shift-IR
  // (it shifts on entry → drains the 1). Path:
  //   TLR --0--> RTI --1--> Sel-DR --1--> Sel-IR --0--> Cap-IR
  //       --1--> Exit1-IR --1--> Upd-IR --0--> RTI    (ir preserved = 1)
  walk(s, ff, [0, 1, 1, 0, 1, 1, 0], 2);
  check('IR latched = 0001 after Update-IR', ff.get('tap').ir === 1,
    `ir=${ff.get('tap').ir}`);
  // Now navigate RTI → Select-DR → Capture-DR (which preloads IDCODE
  // because IR LSB=1) → Shift-DR (TMS=0).
  walk(s, ff, [1, 0, 0], 20);
  check('reached Shift-DR for IDCODE', state(ff) === SHIFT_DR, `state=${state(ff)}`);
  // Shift 32 bits out LSB-first.
  set(s, 'tdi', 0);
  let received = 0;
  for (let i = 0; i < 32; i++) {
    set(s, 'tms', 0);
    tick(s, ff, 200 + i * 2);
    received |= ((ff.get('tap').tdo & 1) << i);
  }
  received = received >>> 0;
  check('shifted out exact IDCODE',
    received === (idcode >>> 0),
    `got 0x${received.toString(16)}, expected 0x${(idcode >>> 0).toString(16)}`);
}

// ── 8. BOUNDARY_SCAN_CELL behaviour ──────────────────────────
function buildBscScene() {
  const pi   = { ...createComponent('INPUT', -200,   0), id: 'pi',   fixedValue: 0 };
  const si   = { ...createComponent('INPUT', -200,  80), id: 'si',   fixedValue: 0 };
  const mode = { ...createComponent('INPUT', -200, 160), id: 'mode', fixedValue: 0 };
  const sh   = { ...createComponent('INPUT', -200, 240), id: 'sh',   fixedValue: 0 };
  const clk  = { ...createComponent('CLOCK', -200, 320), id: 'clk', value: 0 };
  const bsc  = { ...createComponent('BOUNDARY_SCAN_CELL', 0, 0), id: 'bsc' };
  return {
    nodes: [pi, si, mode, sh, clk, bsc],
    wires: [
      { ...createWire('pi',   'bsc', 0), id: 'wp' },
      { ...createWire('si',   'bsc', 1), id: 'ws' },
      { ...createWire('mode', 'bsc', 2), id: 'wm' },
      { ...createWire('sh',   'bsc', 3), id: 'wsh' },
      { ...createWire('clk',  'bsc', 4, 0, { isClockWire: true }), id: 'wc' },
    ],
  };
}
function tickBsc(s, ff, step) {
  s.nodes.find(n => n.id === 'clk').value = 0;
  evaluate(s.nodes, s.wires, ff, step);
  s.nodes.find(n => n.id === 'clk').value = 1;
  evaluate(s.nodes, s.wires, ff, step + 1);
}

{
  // (a) Normal pass-through: MODE=0 → PO = PI.
  const s = buildBscScene();
  const ff = new Map();
  set(s, 'pi', 1); set(s, 'mode', 0); set(s, 'sh', 0);
  tickBsc(s, ff, 0);
  check('MODE=0, PI=1 → Q=1 (pass-through)', ff.get('bsc').q === 1,
    `q=${ff.get('bsc').q}`);
  set(s, 'pi', 0); tickBsc(s, ff, 2);
  check('MODE=0, PI=0 → Q=0', ff.get('bsc').q === 0);

  // (b) Shift-in path: SHIFT=1, SI=1 → ms.shift latches 1.
  set(s, 'sh', 1); set(s, 'si', 1);
  tickBsc(s, ff, 4);
  check('SHIFT=1, SI=1 → internal shift latch = 1',
    ff.get('bsc').shift === 1, `shift=${ff.get('bsc').shift}`);

  // (c) Rising MODE 0→1 captures the shift latch to upd.
  set(s, 'mode', 1);
  tickBsc(s, ff, 6);
  check('rising MODE captures shift→upd', ff.get('bsc').upd === 1,
    `upd=${ff.get('bsc').upd}`);

  // (d) MODE=1 routes upd to PO regardless of PI.
  set(s, 'pi', 0);
  tickBsc(s, ff, 8);
  check('MODE=1 → Q = captured value (1), not PI (0)',
    ff.get('bsc').q === 1, `q=${ff.get('bsc').q}`);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
