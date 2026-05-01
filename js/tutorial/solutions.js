/**
 * solutions.js — programmatic builders for the canonical solution circuits.
 *
 * Each builder returns a { nodes, wires } object compatible with
 * SceneGraph.deserialize(), so loading a solution is a drop-in replacement
 * for the learner's current scene (the engine takes a snapshot first, so the
 * learner's work is preserved and restored on exit).
 *
 * Pin index conventions (mirroring the renderer / SimulationEngine):
 *   INPUT      — output 0
 *   OUTPUT     — input  0
 *   GATE_SLOT  — 2-input gates: inputs 0,1 ; output 0
 *                NOT / BUF      : input 0   ; output 0
 *
 * IDs are deterministic strings ("sol-n1", "sol-w1", ...) so re-loading the
 * same solution does not collide with the running id counter.
 */

import { createComponent, createWire, COMPONENT_TYPES } from '../components/Component.js';

function _clock(x, y) {
  const n = createComponent(COMPONENT_TYPES.CLOCK, x, y);
  n.id = _nid();
  return n;
}
function _ffD(x, y, label = 'D-FF') {
  const n = createComponent(COMPONENT_TYPES.FF_SLOT, x, y);
  n.id = _nid();
  n.ffType = 'D';
  n.label = label;
  return n;
}
function _block(type, x, y, overrides = {}) {
  const n = createComponent(type, x, y);
  n.id = _nid();
  Object.assign(n, overrides);
  return n;
}

let _seq = 0;
function _nid() { return `sol-n${++_seq}`; }
function _wid() { return `sol-w${++_seq}`; }

function _input(x, y, label) {
  const n = createComponent(COMPONENT_TYPES.INPUT, x, y);
  n.id = _nid();
  if (label) n.label = label;
  return n;
}
function _output(x, y, label) {
  const n = createComponent(COMPONENT_TYPES.OUTPUT, x, y);
  n.id = _nid();
  if (label) n.label = label;
  return n;
}
function _gate(kind, x, y) {
  const n = createComponent(COMPONENT_TYPES.GATE_SLOT, x, y);
  n.id = _nid();
  n.gate = kind;
  n.label = kind;
  return n;
}
function _wire(srcId, dstId, dstPin = 0, srcPin = 0, opts = {}) {
  const w = createWire(srcId, dstId, dstPin, srcPin, opts);
  w.id = _wid();
  return w;
}

function _build(fn) {
  _seq = 0;                           // reset per-build so ids stay deterministic
  return fn();
}

// ── Lesson 1, Step 1: place an AND gate ───────────────────────
function _l01s1() {
  const g = _gate('AND', 400, 300);
  return { nodes: [g], wires: [] };
}

// ── Lesson 1, Step 2: AND with two INPUTs and an OUT ──────────
function _l01s2() {
  const a = _input(200, 250, 'A');
  const b = _input(200, 350, 'B');
  const g = _gate('AND', 400, 300);
  const o = _output(600, 300, 'OUT');
  return {
    nodes: [a, b, g, o],
    wires: [
      _wire(a.id, g.id, 0),
      _wire(b.id, g.id, 1),
      _wire(g.id, o.id, 0),
    ],
  };
}

// ── Lesson 2, Step 1: OR ──────────────────────────────────────
function _l02s1() {
  const a = _input(200, 250, 'A');
  const b = _input(200, 350, 'B');
  const g = _gate('OR', 400, 300);
  const o = _output(600, 300, 'OUT');
  return {
    nodes: [a, b, g, o],
    wires: [
      _wire(a.id, g.id, 0),
      _wire(b.id, g.id, 1),
      _wire(g.id, o.id, 0),
    ],
  };
}

// ── Lesson 2, Step 2: NOT ─────────────────────────────────────
function _l02s2() {
  const a = _input(200, 300, 'A');
  const g = _gate('NOT', 400, 300);
  const o = _output(600, 300, 'OUT');
  return {
    nodes: [a, g, o],
    wires: [
      _wire(a.id, g.id, 0),
      _wire(g.id, o.id, 0),
    ],
  };
}

// ── Lesson 3, Step 1: NOT built from one NAND ─────────────────
function _l03s1() {
  const a = _input(200, 300, 'A');
  const n = _gate('NAND', 400, 300);
  const o = _output(600, 300, 'OUT');
  return {
    nodes: [a, n, o],
    wires: [
      _wire(a.id, n.id, 0),
      _wire(a.id, n.id, 1),       // both NAND inputs from same source
      _wire(n.id, o.id, 0),
    ],
  };
}

// ── Lesson 3, Step 2: AND from two NANDs ──────────────────────
function _l03s2() {
  const a   = _input(200, 250, 'A');
  const b   = _input(200, 350, 'B');
  const n1  = _gate('NAND', 400, 300);     // A NAND B
  const n2  = _gate('NAND', 600, 300);     // (A NAND B) NAND (A NAND B) = NOT
  const o   = _output(800, 300, 'OUT');
  return {
    nodes: [a, b, n1, n2, o],
    wires: [
      _wire(a.id,  n1.id, 0),
      _wire(b.id,  n1.id, 1),
      _wire(n1.id, n2.id, 0),
      _wire(n1.id, n2.id, 1),
      _wire(n2.id, o.id,  0),
    ],
  };
}

// ── Lesson 3, Step 3: OR from three NANDs ─────────────────────
// OR(A,B) = NAND(NOT A, NOT B). Each NOT is NAND(x,x).
function _l03s3() {
  const a   = _input(150, 250, 'A');
  const b   = _input(150, 410, 'B');
  const n1  = _gate('NAND', 360, 250);     // NOT A
  const n2  = _gate('NAND', 360, 410);     // NOT B
  const n3  = _gate('NAND', 580, 330);     // NAND(NOT A, NOT B) = A OR B
  const o   = _output(800, 330, 'OUT');
  return {
    nodes: [a, b, n1, n2, n3, o],
    wires: [
      _wire(a.id,  n1.id, 0),
      _wire(a.id,  n1.id, 1),       // NAND-as-NOT: both inputs from A
      _wire(b.id,  n2.id, 0),
      _wire(b.id,  n2.id, 1),       // NAND-as-NOT: both inputs from B
      _wire(n1.id, n3.id, 0),
      _wire(n2.id, n3.id, 1),
      _wire(n3.id, o.id,  0),
    ],
  };
}

// ── Lesson 4: XOR from AND/OR/NOT ─────────────────────────────
function _l04s1() {
  const a    = _input(150, 230, 'A');
  const b    = _input(150, 380, 'B');
  const notA = _gate('NOT', 320, 230);
  const notB = _gate('NOT', 320, 380);
  const and1 = _gate('AND', 500, 270);     // A AND NOT B
  const and2 = _gate('AND', 500, 360);     // NOT A AND B
  const or1  = _gate('OR',  680, 315);
  const o    = _output(860, 315, 'OUT');
  return {
    nodes: [a, b, notA, notB, and1, and2, or1, o],
    wires: [
      _wire(a.id,    notA.id, 0),
      _wire(b.id,    notB.id, 0),
      _wire(a.id,    and1.id, 0),
      _wire(notB.id, and1.id, 1),
      _wire(notA.id, and2.id, 0),
      _wire(b.id,    and2.id, 1),
      _wire(and1.id, or1.id,  0),
      _wire(and2.id, or1.id,  1),
      _wire(or1.id,  o.id,    0),
    ],
  };
}

// ── Lesson 5: Half Adder ──────────────────────────────────────
// Outputs sorted alphabetically by label: CARRY then SUM (matches expected).
function _l05s1() {
  const a    = _input(200, 250, 'A');
  const b    = _input(200, 380, 'B');
  const xor1 = _gate('XOR', 420, 270);
  const and1 = _gate('AND', 420, 380);
  const sum   = _output(640, 270, 'SUM');
  const carry = _output(640, 380, 'CARRY');
  return {
    nodes: [a, b, xor1, and1, sum, carry],
    wires: [
      _wire(a.id,    xor1.id, 0),
      _wire(b.id,    xor1.id, 1),
      _wire(a.id,    and1.id, 0),
      _wire(b.id,    and1.id, 1),
      _wire(xor1.id, sum.id,   0),
      _wire(and1.id, carry.id, 0),
    ],
  };
}

// ── Lesson 6: Full Adder ──────────────────────────────────────
// SUM = A XOR B XOR CIN ; COUT = (A AND B) OR (CIN AND (A XOR B))
function _l06s1() {
  const a    = _input(150, 200, 'A');
  const b    = _input(150, 320, 'B');
  const cin  = _input(150, 440, 'CIN');
  const xor1 = _gate('XOR', 340, 260);     // A XOR B
  const and1 = _gate('AND', 340, 380);     // A AND B
  const xor2 = _gate('XOR', 540, 320);     // (A XOR B) XOR CIN  → SUM
  const and2 = _gate('AND', 540, 440);     // (A XOR B) AND CIN
  const or1  = _gate('OR',  740, 410);     // → COUT
  const sum  = _output(740, 320, 'SUM');
  const cout = _output(940, 410, 'COUT');
  return {
    nodes: [a, b, cin, xor1, and1, xor2, and2, or1, sum, cout],
    wires: [
      _wire(a.id,    xor1.id, 0),
      _wire(b.id,    xor1.id, 1),
      _wire(a.id,    and1.id, 0),
      _wire(b.id,    and1.id, 1),
      _wire(xor1.id, xor2.id, 0),
      _wire(cin.id,  xor2.id, 1),
      _wire(xor1.id, and2.id, 0),
      _wire(cin.id,  and2.id, 1),
      _wire(and1.id, or1.id,  0),
      _wire(and2.id, or1.id,  1),
      _wire(xor2.id, sum.id,  0),
      _wire(or1.id,  cout.id, 0),
    ],
  };
}

// ── Lesson 7: 2:1 MUX from gates ──────────────────────────────
// OUT = (NOT SEL AND A) OR (SEL AND B)
function _l07s1() {
  const a    = _input(150, 220, 'A');
  const b    = _input(150, 340, 'B');
  const sel  = _input(150, 460, 'SEL');
  const nsel = _gate('NOT', 320, 460);
  const and1 = _gate('AND', 500, 280);     // A AND NOT SEL
  const and2 = _gate('AND', 500, 400);     // B AND SEL
  const or1  = _gate('OR',  680, 340);
  const o    = _output(860, 340, 'OUT');
  return {
    nodes: [a, b, sel, nsel, and1, and2, or1, o],
    wires: [
      _wire(sel.id,  nsel.id, 0),
      _wire(a.id,    and1.id, 0),
      _wire(nsel.id, and1.id, 1),
      _wire(b.id,    and2.id, 0),
      _wire(sel.id,  and2.id, 1),
      _wire(and1.id, or1.id,  0),
      _wire(and2.id, or1.id,  1),
      _wire(or1.id,  o.id,    0),
    ],
  };
}

// ── Lesson 8: 2-to-4 Decoder ──────────────────────────────────
function _l08s1() {
  const s0   = _input(150, 220, 'S0');
  const s1   = _input(150, 360, 'S1');
  const ns0  = _gate('NOT', 320, 220);
  const ns1  = _gate('NOT', 320, 360);
  const a0   = _gate('AND', 520, 160);     // Y0 = NOT S0 AND NOT S1
  const a1   = _gate('AND', 520, 280);     // Y1 = S0     AND NOT S1
  const a2   = _gate('AND', 520, 400);     // Y2 = NOT S0 AND S1
  const a3   = _gate('AND', 520, 520);     // Y3 = S0     AND S1
  const y0   = _output(720, 160, 'Y0');
  const y1   = _output(720, 280, 'Y1');
  const y2   = _output(720, 400, 'Y2');
  const y3   = _output(720, 520, 'Y3');
  return {
    nodes: [s0, s1, ns0, ns1, a0, a1, a2, a3, y0, y1, y2, y3],
    wires: [
      _wire(s0.id,  ns0.id, 0),
      _wire(s1.id,  ns1.id, 0),
      _wire(ns0.id, a0.id, 0),
      _wire(ns1.id, a0.id, 1),
      _wire(s0.id,  a1.id, 0),
      _wire(ns1.id, a1.id, 1),
      _wire(ns0.id, a2.id, 0),
      _wire(s1.id,  a2.id, 1),
      _wire(s0.id,  a3.id, 0),
      _wire(s1.id,  a3.id, 1),
      _wire(a0.id, y0.id, 0),
      _wire(a1.id, y1.id, 0),
      _wire(a2.id, y2.id, 0),
      _wire(a3.id, y3.id, 0),
    ],
  };
}

// ── Lesson 9: 4-input AND ─────────────────────────────────────
function _l09s1() {
  const a   = _input(150, 200, 'A');
  const b   = _input(150, 300, 'B');
  const c   = _input(150, 400, 'C');
  const d   = _input(150, 500, 'D');
  const ab  = _gate('AND', 340, 250);
  const abc = _gate('AND', 540, 320);
  const abcd= _gate('AND', 740, 400);
  const o   = _output(940, 400, 'OUT');
  return {
    nodes: [a, b, c, d, ab, abc, abcd, o],
    wires: [
      _wire(a.id,   ab.id,  0),
      _wire(b.id,   ab.id,  1),
      _wire(ab.id,  abc.id, 0),
      _wire(c.id,   abc.id, 1),
      _wire(abc.id, abcd.id,0),
      _wire(d.id,   abcd.id,1),
      _wire(abcd.id,o.id,   0),
    ],
  };
}

// ── Lesson 10: 3-input Majority ──────────────────────────────
// M = (A AND B) OR (A AND C) OR (B AND C)
function _l10s1() {
  const a   = _input(150, 220, 'A');
  const b   = _input(150, 360, 'B');
  const c   = _input(150, 500, 'C');
  const ab  = _gate('AND', 340, 250);
  const ac  = _gate('AND', 340, 380);
  const bc  = _gate('AND', 340, 510);
  const or1 = _gate('OR',  540, 320);     // (A AND B) OR (A AND C)
  const or2 = _gate('OR',  740, 420);     // ... OR (B AND C)
  const m   = _output(940, 420, 'M');
  return {
    nodes: [a, b, c, ab, ac, bc, or1, or2, m],
    wires: [
      _wire(a.id,  ab.id, 0),
      _wire(b.id,  ab.id, 1),
      _wire(a.id,  ac.id, 0),
      _wire(c.id,  ac.id, 1),
      _wire(b.id,  bc.id, 0),
      _wire(c.id,  bc.id, 1),
      _wire(ab.id, or1.id, 0),
      _wire(ac.id, or1.id, 1),
      _wire(or1.id, or2.id, 0),
      _wire(bc.id,  or2.id, 1),
      _wire(or2.id, m.id,   0),
    ],
  };
}

// ── Lesson 11: SR Latch from two NORs ─────────────────────────
// NOR1 = NOR(R, Q)   → Q_BAR
// NOR2 = NOR(S, Q_BAR) → Q
function _l11s1() {
  const s    = _input(150, 240, 'S');
  const r    = _input(150, 460, 'R');
  const nor1 = _gate('NOR', 380, 320);    // → Q_BAR (top NOR takes R + feedback from Q)
  const nor2 = _gate('NOR', 380, 440);    // → Q     (bottom NOR takes S + feedback from Q_BAR)
  const qbar = _output(620, 320, 'QBAR');
  const q    = _output(620, 440, 'Q');
  return {
    nodes: [s, r, nor1, nor2, qbar, q],
    wires: [
      _wire(r.id,    nor1.id, 0),
      _wire(nor2.id, nor1.id, 1),     // Q feeds back into NOR1
      _wire(s.id,    nor2.id, 0),
      _wire(nor1.id, nor2.id, 1),     // Q_BAR feeds back into NOR2
      _wire(nor1.id, qbar.id, 0),
      _wire(nor2.id, q.id,    0),
    ],
  };
}

// ── Lesson 12: D-FF Toggle Counter ────────────────────────────
// Q_BAR (output index 1) wired back into D (input 0). Clock drives toggling.
function _l12s1() {
  const clk  = _clock(180, 420);
  const dff  = _ffD(420, 320);
  const q    = _output(640, 300, 'Q');
  return {
    nodes: [clk, dff, q],
    wires: [
      _wire(dff.id, dff.id, 0, 1),       // Q_BAR (out 1) → D (in 0)  — toggle feedback
      _wire(clk.id, dff.id, 1),          // CLK → D-FF clk pin
      _wire(dff.id, q.id,   0, 0),       // Q (out 0) → output
    ],
  };
}

// ── Lesson 13: 4-bit Register from 4 parallel D-FFs ──────────
// Educational version — shows the register as 4 independent FFs sharing a clock.
function _l13s1() {
  const clk  = _clock(140, 540);
  const d0   = _input(140, 140, 'D0');
  const d1   = _input(140, 240, 'D1');
  const d2   = _input(140, 340, 'D2');
  const d3   = _input(140, 440, 'D3');
  const ff0  = _ffD(380, 140, 'FF0');
  const ff1  = _ffD(380, 240, 'FF1');
  const ff2  = _ffD(380, 340, 'FF2');
  const ff3  = _ffD(380, 440, 'FF3');
  const q0   = _output(620, 140, 'Q0');
  const q1   = _output(620, 240, 'Q1');
  const q2   = _output(620, 340, 'Q2');
  const q3   = _output(620, 440, 'Q3');
  return {
    nodes: [clk, d0, d1, d2, d3, ff0, ff1, ff2, ff3, q0, q1, q2, q3],
    wires: [
      // Each D drives its own FF
      _wire(d0.id, ff0.id, 0),
      _wire(d1.id, ff1.id, 0),
      _wire(d2.id, ff2.id, 0),
      _wire(d3.id, ff3.id, 0),
      // Shared clock — the key concept
      _wire(clk.id, ff0.id, 1),
      _wire(clk.id, ff1.id, 1),
      _wire(clk.id, ff2.id, 1),
      _wire(clk.id, ff3.id, 1),
      // Q outputs
      _wire(ff0.id, q0.id, 0, 0),
      _wire(ff1.id, q1.id, 0, 0),
      _wire(ff2.id, q2.id, 0, 0),
      _wire(ff3.id, q3.id, 0, 0),
    ],
  };
}

// ── Lesson 15: Traffic Light FSM ──────────────────────────────
// States 00 (RED) → 01 (GREEN) → 10 (YELLOW) → 00 ...
// S1' = NOT S1 AND  S0    (FF1.D)
// S0' = NOT S1 AND NOT S0 (FF0.D)
// Outputs: RED = NOT S1 AND NOT S0, GREEN = NOT S1 AND S0, YELLOW = S1 AND NOT S0
function _l15s1() {
  const clk  = _clock(140, 720);
  const ff0  = _ffD(620, 280, 'S0');
  const ff1  = _ffD(620, 480, 'S1');
  const ns0  = _gate('NOT', 240, 280);    // NOT S0  (driven from FF0.Q)
  const ns1  = _gate('NOT', 240, 480);    // NOT S1  (driven from FF1.Q)
  const dS0  = _gate('AND', 420, 280);    // FF0.D = NOT S1 AND NOT S0
  const dS1  = _gate('AND', 420, 480);    // FF1.D = NOT S1 AND  S0
  const aRed = _gate('AND', 880, 240);
  const aGrn = _gate('AND', 880, 380);
  const aYel = _gate('AND', 880, 520);
  const red    = _output(1080, 240, 'RED');
  const green  = _output(1080, 380, 'GREEN');
  const yellow = _output(1080, 520, 'YELLOW');
  return {
    nodes: [clk, ff0, ff1, ns0, ns1, dS0, dS1, aRed, aGrn, aYel, red, green, yellow],
    wires: [
      // Feedback: each FF's Q feeds the NOT and the next-state logic
      _wire(ff0.id, ns0.id, 0, 0),
      _wire(ff1.id, ns1.id, 0, 0),
      // FF0.D = NOT S1 AND NOT S0
      _wire(ns1.id, dS0.id, 0),
      _wire(ns0.id, dS0.id, 1),
      _wire(dS0.id, ff0.id, 0),
      // FF1.D = NOT S1 AND S0
      _wire(ns1.id, dS1.id, 0),
      _wire(ff0.id, dS1.id, 1, 0),
      _wire(dS1.id, ff1.id, 0),
      // Clock to both FFs
      _wire(clk.id, ff0.id, 1),
      _wire(clk.id, ff1.id, 1),
      // Output decode: RED = NOT S1 AND NOT S0
      _wire(ns1.id, aRed.id, 0),
      _wire(ns0.id, aRed.id, 1),
      _wire(aRed.id, red.id, 0),
      // GREEN = NOT S1 AND S0
      _wire(ns1.id, aGrn.id, 0),
      _wire(ff0.id, aGrn.id, 1, 0),
      _wire(aGrn.id, green.id, 0),
      // YELLOW = S1 AND NOT S0
      _wire(ff1.id, aYel.id, 0, 0),
      _wire(ns0.id, aYel.id, 1),
      _wire(aYel.id, yellow.id, 0),
    ],
  };
}

// ── Lesson 16: 2-bit ALU ──────────────────────────────────────
// Strategy:
//   - Single 2-bit adder built from 2 FAs handles both ADD and SUB.
//     B_eff = B XOR OP0 ; CIN = OP0. So OP=00 → A+B, OP=01 → A + ~B + 1 = A-B.
//   - Parallel AND/OR gates produce bitwise logic results.
//   - Two 4:1 MUXes (inputCount=4), one per output bit, select the result:
//       D0 = ADD/SUB result, D1 = ADD/SUB result (same wire — the adder
//       already produced the SUB value when OP0=1), D2 = AND, D3 = OR.
//       S0 = OP0 (LSB of select), S1 = OP1 (MSB).
function _l16s1() {
  // ── Inputs (alphabetical sort drives validator: A0,A1,B0,B1,OP0,OP1) ──
  const A0  = _input(120, 120, 'A0');
  const A1  = _input(120, 220, 'A1');
  const B0  = _input(120, 320, 'B0');
  const B1  = _input(120, 420, 'B1');
  const OP0 = _input(120, 540, 'OP0');
  const OP1 = _input(120, 640, 'OP1');

  // ── B XOR OP0  (conditional invert for SUB) ──
  const xor0 = _gate('XOR', 360, 320);   // B0 XOR OP0
  const xor1 = _gate('XOR', 360, 420);   // B1 XOR OP0

  // ── Adder chain: 2 Full Adders ──
  const fa0 = _block(COMPONENT_TYPES.FULL_ADDER, 600, 180);  // bit 0
  const fa1 = _block(COMPONENT_TYPES.FULL_ADDER, 600, 360);  // bit 1

  // ── Parallel logic ops ──
  const and0 = _gate('AND', 600, 480);   // A0 & B0
  const and1 = _gate('AND', 600, 560);   // A1 & B1
  const or0  = _gate('OR',  600, 640);   // A0 | B0
  const or1  = _gate('OR',  600, 720);   // A1 | B1

  // ── 4:1 MUXes — one per output bit ──
  const mux0 = _block(COMPONENT_TYPES.MUX, 880, 320, { inputCount: 4 });
  const mux1 = _block(COMPONENT_TYPES.MUX, 880, 560, { inputCount: 4 });

  // ── Outputs ──
  const Y0 = _output(1100, 320, 'Y0');
  const Y1 = _output(1100, 560, 'Y1');

  return {
    nodes: [
      A0, A1, B0, B1, OP0, OP1,
      xor0, xor1,
      fa0, fa1,
      and0, and1, or0, or1,
      mux0, mux1,
      Y0, Y1,
    ],
    wires: [
      // ── A bus fan-out ──
      _wire(A0.id, fa0.id,  0),         // FA0.A
      _wire(A0.id, and0.id, 0),
      _wire(A0.id, or0.id,  0),
      _wire(A1.id, fa1.id,  0),         // FA1.A
      _wire(A1.id, and1.id, 0),
      _wire(A1.id, or1.id,  0),

      // ── B bus fan-out ──
      _wire(B0.id, xor0.id, 0),         // B0 → XOR(B0, OP0)
      _wire(B0.id, and0.id, 1),
      _wire(B0.id, or0.id,  1),
      _wire(B1.id, xor1.id, 0),
      _wire(B1.id, and1.id, 1),
      _wire(B1.id, or1.id,  1),

      // ── OP0 fan-out: invert helper, CIN of FA0, MUX select LSB ──
      _wire(OP0.id, xor0.id, 1),
      _wire(OP0.id, xor1.id, 1),
      _wire(OP0.id, fa0.id,  2),        // FA0.CIN = OP0
      _wire(OP0.id, mux0.id, 4),        // MUX0.S0
      _wire(OP0.id, mux1.id, 4),        // MUX1.S0

      // ── OP1: MUX select MSB only ──
      _wire(OP1.id, mux0.id, 5),
      _wire(OP1.id, mux1.id, 5),

      // ── XOR outputs feed FA B inputs ──
      _wire(xor0.id, fa0.id, 1),        // FA0.B = B0 XOR OP0
      _wire(xor1.id, fa1.id, 1),        // FA1.B = B1 XOR OP0

      // ── FA carry chain ──
      _wire(fa0.id, fa1.id, 2, 1),      // FA0.COUT (out 1) → FA1.CIN

      // ── MUX0 data inputs (Y0 selection) ──
      _wire(fa0.id,  mux0.id, 0, 0),    // D0 = SUM bit 0 (ADD)
      _wire(fa0.id,  mux0.id, 1, 0),    // D1 = SUM bit 0 (SUB — same wire, the adder already inverted via OP0)
      _wire(and0.id, mux0.id, 2),       // D2 = AND bit 0
      _wire(or0.id,  mux0.id, 3),       // D3 = OR  bit 0

      // ── MUX1 data inputs (Y1 selection) ──
      _wire(fa1.id,  mux1.id, 0, 0),
      _wire(fa1.id,  mux1.id, 1, 0),
      _wire(and1.id, mux1.id, 2),
      _wire(or1.id,  mux1.id, 3),

      // ── MUX outputs to Y ──
      _wire(mux0.id, Y0.id, 0),
      _wire(mux1.id, Y1.id, 0),
    ],
  };
}

// ── Lesson 17: 2-bit Counter w/ EN+RST built from gates ──────
// State equations:
//   D0 = NOT RST AND (Q0 XOR EN)              — toggle Q0 when EN=1, else hold
//   D1 = NOT RST AND (Q1 XOR (EN AND Q0))     — toggle Q1 when about to overflow
function _l17s1() {
  const en    = _input(120, 200, 'EN');
  const rst   = _input(120, 320, 'RST');
  const clk   = _clock(120, 620);

  const nrst  = _gate('NOT', 280, 320);             // NOT RST

  // Bit 0
  const xor0  = _gate('XOR', 460, 220);             // Q0 XOR EN
  const dAnd0 = _gate('AND', 640, 240);             // NOT RST AND (Q0 XOR EN) → D0
  const ff0   = _ffD(820, 240, 'FF0');

  // Bit 1
  const enQ0  = _gate('AND', 460, 420);             // EN AND Q0
  const xor1  = _gate('XOR', 640, 440);             // Q1 XOR (EN AND Q0)
  const dAnd1 = _gate('AND', 820, 460);             // NOT RST AND (...) → D1
  const ff1   = _ffD(1000, 460, 'FF1');

  const q0    = _output(1020, 240, 'Q0');
  const q1    = _output(1180, 460, 'Q1');

  return {
    nodes: [
      en, rst, clk,
      nrst,
      xor0, dAnd0, ff0,
      enQ0, xor1, dAnd1, ff1,
      q0, q1,
    ],
    wires: [
      // NOT RST
      _wire(rst.id, nrst.id, 0),

      // ── Bit 0 ──
      _wire(ff0.id, xor0.id, 0, 0),         // Q0 → XOR
      _wire(en.id,  xor0.id, 1),            // EN → XOR
      _wire(nrst.id, dAnd0.id, 0),
      _wire(xor0.id, dAnd0.id, 1),
      _wire(dAnd0.id, ff0.id, 0),           // → D
      _wire(clk.id,   ff0.id, 1),           // CLK
      _wire(ff0.id,   q0.id,  0, 0),        // Q output

      // ── Bit 1 ──
      _wire(en.id,  enQ0.id, 0),
      _wire(ff0.id, enQ0.id, 1, 0),         // Q0 → EN AND Q0
      _wire(ff1.id, xor1.id, 0, 0),         // Q1 → XOR
      _wire(enQ0.id, xor1.id, 1),
      _wire(nrst.id, dAnd1.id, 0),
      _wire(xor1.id, dAnd1.id, 1),
      _wire(dAnd1.id, ff1.id, 0),           // → D
      _wire(clk.id,   ff1.id, 1),           // CLK
      _wire(ff1.id,   q1.id,  0, 0),        // Q output
    ],
  };
}

// ── CPU Build, Lesson 1: The Program Counter ─────────────────
// 4-bit PC driven by the user via EN, RST, and a CLOCK.
// PC pin layout: JUMP_ADDR(0), JUMP(1), EN(2), CLR(3), CLK(4).
// We leave 0 and 1 disconnected — no jumping in this lesson.
function _c01s1() {
  const en   = _input(140, 200, 'EN');
  const rst  = _input(140, 320, 'RST');
  const clk  = _clock(140, 460);
  const pc   = _block(COMPONENT_TYPES.PC, 380, 320, { bitWidth: 4 });
  const out  = _output(620, 320, 'COUNT');
  // Pre-set EN=1 so the counter starts running on the first STEP.
  en.fixedValue = 1;
  rst.fixedValue = 0;
  return {
    nodes: [en, rst, clk, pc, out],
    wires: [
      _wire(en.id,  pc.id, 2),     // EN → input 2
      _wire(rst.id, pc.id, 3),     // RST → input 3
      // PC's update logic in Phase 4 finds CLK by the isClockWire flag,
      // not by pin index — so we must set it explicitly here.
      _wire(clk.id, pc.id, 4, 0, { isClockWire: true }),
      _wire(pc.id,  out.id, 0, 0), // PC value → COUNT output
    ],
  };
}

// ── CPU Build, Lesson 2: ROM as Instruction Memory ───────────
// PC (lesson 1) drives ROM.ADDR. ROM is async-read so the instruction at
// ROM[PC] appears immediately, no extra clock needed for the read.
//
// Pre-loaded program (encoded by hand to match the assembler's default
// opcode table — opcodes 0..15 are documented at the top of Assembler.js):
//   addr 0: LI  R1, 5            → 0xD105   (op=13 LI, rd=1, imm=0x05)
//   addr 1: LI  R2, 3            → 0xD203
//   addr 2: ADD R3, R1, R2       → 0x0312   (op=0 ADD, rd=3, rs1=1, rs2=2)
//   addr 3: HALT                 → 0xF000
function _c02s1() {
  const en   = _input(140, 200, 'EN');
  const rst  = _input(140, 320, 'RST');
  const clk  = _clock(140, 460);
  const pc   = _block(COMPONENT_TYPES.PC, 380, 320, { bitWidth: 4 });
  const pcOut = _output(620, 200, 'PC');
  // _asmSource lets the ROM editor's ASM tab show this exact text instead of
  // a disassembly — same code as in the lesson's codeBlock, so the learner
  // can compare side-by-side.
  const _asmSource =
`; Adds 5 + 3, stores the result in R3.
; This program rides with us through the rest of the CPU build track.

LI  R1, 5
LI  R2, 3
ADD R3, R1, R2
HALT`;
  const rom  = _block(COMPONENT_TYPES.ROM, 620, 380, {
    addrBits:  4,
    dataBits:  16,
    asyncRead: true,
    memory:    { 0: 0xD105, 1: 0xD203, 2: 0x0312, 3: 0xF000 },
    label:     'IMEM',
    _asmSource,
    _sourceView: 'asm', // force ROM editor to open on the ASM tab — paste-safe
  });
  const data = _output(880, 380, 'DATA');
  data.displayFormat = 'instr16';

  en.fixedValue = 1;
  rst.fixedValue = 0;

  return {
    nodes: [en, rst, clk, pc, pcOut, rom, data],
    wires: [
      _wire(en.id,  pc.id, 2),
      _wire(rst.id, pc.id, 3),
      _wire(clk.id, pc.id, 4, 0, { isClockWire: true }),
      // PC value drives both the visible PC output and the ROM address bus
      _wire(pc.id, pcOut.id, 0, 0),
      _wire(pc.id, rom.id,   0, 0),
      // ROM data → DATA output
      _wire(rom.id, data.id, 0, 0),
    ],
  };
}

// ── CPU Build, Lesson 3: IR + CU ─────────────────────────────
// Carries forward PC + ROM from c02 (same positions, same program). Adds:
//   - IR (Instruction Register): captures ROM output on every clock edge,
//     splits the 16-bit instruction into OP/RD/RS1/RS2 fields. LD held high
//     by a constant-1 IMM so it captures every cycle.
//   - CU (Control Unit): pure combinational decoder. Reads OP, drives the
//     control signals. In this lesson only OP is connected on the input
//     side (Z/C flags arrive when the ALU does, in step 5).
// Three CU outputs are wired to LEDs so the learner can watch the decoded
// control pattern flip per instruction:
//   - ALU_OP (out 0) → ALU_OP LED
//   - RG_WE  (out 1) → RG_WE  LED
//   - HALT   (out 5) → HALT   LED
// A diagnostic OP LED above the IR shows the raw 4-bit opcode.
// Nothing else is wired — the other CU outputs (MM_WE, MM_RE, JMP, IMM)
// arrive in later steps when RAM / branches are added.
function _c03s1() {
  // ── Inputs ───────────────────────────────────────────────
  const en   = _input(140, 200, 'EN');
  const rst  = _input(140, 320, 'RST');
  const clk  = _clock(140, 460);

  // ── PC + ROM (carry-overs from c02, same positions) ─────
  const pc    = _block(COMPONENT_TYPES.PC, 380, 320, { bitWidth: 4 });
  const pcOut = _output(620, 200, 'PC');

  // Step-3 specific program — chosen to exercise as many distinct CU
  // output patterns as possible. LOAD / STORE / JMP do nothing visible
  // here (no RAM, no PC.JMP wiring yet) — but the CU still emits the
  // right control signals, and that's the whole point of this lesson.
  const _asmSource =
`; Step 3 demo — exercise the CU.
; Each instruction lights a different combination of control LEDs.
; LOAD / STORE / JMP don't actually do anything yet (no RAM / no
; jump wiring); they're here so you can watch MM_WE, MM_RE, and JMP
; flip when the right opcode is decoded.

LI    R1, 5         ; OP=13 → RG_WE=1, IMM=5
LI    R2, 3         ; OP=13 → RG_WE=1, IMM=3
ADD   R3, R1, R2    ; OP=0  → ALU_OP=0, RG_WE=1
SUB   R4, R1, R2    ; OP=1  → ALU_OP=1, RG_WE=1
AND   R5, R1, R2    ; OP=2  → ALU_OP=2, RG_WE=1
OR    R6, R1, R2    ; OP=3  → ALU_OP=3, RG_WE=1
XOR   R7, R1, R2    ; OP=4  → ALU_OP=4, RG_WE=1
CMP   R1, R2        ; OP=7  → ALU runs, RG_WE=0 (no write-back)
LOAD  R8, R0        ; OP=8  → MM_RE=1, RG_WE=1
STORE R1, R0        ; OP=9  → MM_WE=1, RG_WE=0
JMP   0             ; OP=10 → JMP=1
NOP                 ; OP=14 → all signals low
HALT                ; OP=15 → HALT=1`;

  const rom = _block(COMPONENT_TYPES.ROM, 620, 380, {
    addrBits:  4,
    dataBits:  16,
    asyncRead: true,
    memory:    {
      0:  0xD105,   // LI    R1, 5
      1:  0xD203,   // LI    R2, 3
      2:  0x0312,   // ADD   R3, R1, R2
      3:  0x1412,   // SUB   R4, R1, R2
      4:  0x2512,   // AND   R5, R1, R2
      5:  0x3612,   // OR    R6, R1, R2
      6:  0x4712,   // XOR   R7, R1, R2
      7:  0x7012,   // CMP   R1, R2
      8:  0x8800,   // LOAD  R8, R0
      9:  0x9010,   // STORE R1, R0
      10: 0xA000,   // JMP   0
      11: 0xE000,   // NOP
      12: 0xF000,   // HALT
    },
    label:     'IMEM',
    _asmSource,
    _sourceView: 'asm',
  });

  // ── DATA output carry-over from c02 (keeps the lesson additive — opens
  //    with c02's circuit unchanged, IR + CU are placed to the right of it).
  const data = _output(880, 380, 'DATA');
  data.displayFormat = 'instr16';

  // ── IR ───────────────────────────────────────────────────
  // Constant-1 input drives IR.LD so the IR captures every rising edge.
  const ldHi = _input(1020, 540, 'LD=1');
  const ir   = _block(COMPONENT_TYPES.IR, 1120, 380, {
    instrWidth: 16, opBits: 4, rdBits: 4, rs1Bits: 4, rs2Bits: 4,
  });
  const opLed = _output(1120, 200, 'OP');

  // ── CU ───────────────────────────────────────────────────
  const cu = _block(COMPONENT_TYPES.CU, 1400, 380);

  // ── Control-signal LEDs (all 7 CU outputs visible) ───────
  const aluOpLed = _output(1700,  80, 'ALU_OP');
  const rgWeLed  = _output(1700, 180, 'RG_WE');
  const mmWeLed  = _output(1700, 280, 'MM_WE');
  const mmReLed  = _output(1700, 380, 'MM_RE');
  const jmpLed   = _output(1700, 480, 'JMP');
  const haltLed  = _output(1700, 580, 'HALT');
  const immLed   = _output(1700, 680, 'IMM');

  en.fixedValue   = 1;
  rst.fixedValue  = 0;
  ldHi.fixedValue = 1;

  return {
    nodes: [
      en, rst, clk,
      pc, pcOut, rom, data,
      ldHi, ir, opLed,
      cu,
      aluOpLed, rgWeLed, mmWeLed, mmReLed, jmpLed, haltLed, immLed,
    ],
    wires: [
      // PC control (same as c02)
      _wire(en.id,  pc.id, 2),
      _wire(rst.id, pc.id, 3),
      _wire(clk.id, pc.id, 4, 0, { isClockWire: true }),
      // PC → PC display, PC → ROM address
      _wire(pc.id, pcOut.id, 0, 0),
      _wire(pc.id, rom.id,   0, 0),
      // ROM → DATA carry-over from c02
      _wire(rom.id, data.id, 0, 0),

      // ROM → IR.INSTR ; LD high ; CLK → IR
      _wire(rom.id,  ir.id, 0, 0),                            // INSTR
      _wire(ldHi.id, ir.id, 1, 0),                            // LD = 1
      _wire(clk.id,  ir.id, 2, 0, { isClockWire: true }),     // CLK

      // IR.OP → CU.OP ; IR.OP → diagnostic LED
      _wire(ir.id, cu.id,    0, 0),                           // OP → CU.OP
      _wire(ir.id, opLed.id, 0, 0),                           // OP → LED

      // All 7 CU outputs → LEDs
      _wire(cu.id, aluOpLed.id, 0, 0),  // ALU_OP
      _wire(cu.id, rgWeLed.id,  0, 1),  // RG_WE
      _wire(cu.id, mmWeLed.id,  0, 2),  // MM_WE
      _wire(cu.id, mmReLed.id,  0, 3),  // MM_RE
      _wire(cu.id, jmpLed.id,   0, 4),  // JMP
      _wire(cu.id, haltLed.id,  0, 5),  // HALT
      _wire(cu.id, immLed.id,   0, 6),  // IMM
    ],
  };
}

// ── CPU Build, Lesson 4: Register File (RF-DP) ───────────────
// Strict superset of _c03s1 — every node and wire from lesson 3 is preserved
// at the same coordinates, and we additively place an RF-DP plus two read-
// port LEDs below the existing layout. New wires (6 total):
//   IR.RD  (out 1) → RF.WR_ADDR   (in 2)
//   IR.RS1 (out 2) → RF.RD1_ADDR  (in 0)
//   IR.RS2 (out 3) → RF.RD2_ADDR  (in 1)
//   CU.RG_WE (out 1) → RF.WE      (in 4)   (fan-out from existing rgWeLed wire)
//   CU.IMM   (out 6) → RF.WR_DATA (in 3)   (fan-out from existing immLed wire)
//   CLK              → RF.CLK     (in 5)
//   RF.RD1 (out 0) → rd1Led
//   RF.RD2 (out 1) → rd2Led
function _c04s1() {
  // ── Inputs ───────────────────────────────────────────────
  const en   = _input(140, 200, 'EN');
  const rst  = _input(140, 320, 'RST');
  const clk  = _clock(140, 460);

  // ── PC + ROM (carry-overs from c02/c03) ──────────────────
  const pc    = _block(COMPONENT_TYPES.PC, 380, 320, { bitWidth: 4 });
  const pcOut = _output(620, 200, 'PC');
  const _asmSource =
`; Step 4 demo — instructions finally change CPU state.
; Two leading NOPs let the learner watch PC advance 0→1→2
; through an "empty pipeline" before the first real
; instruction (LI R1, 5) executes on STEP 3.

NOP
NOP
LI  R1, 5
LI  R2, 3
LI  R3, 9
LI  R4, 1
CMP R1, R2
CMP R3, R4
HALT`;
  const rom = _block(COMPONENT_TYPES.ROM, 620, 380, {
    addrBits:  4,
    dataBits:  16,
    asyncRead: true,
    memory:    {
      0: 0xE000, 1: 0xE000,                                // NOP, NOP (warmup)
      2: 0xD105, 3: 0xD203, 4: 0xD309, 5: 0xD401,          // LI R1..R4
      6: 0x7012, 7: 0x7034,                                 // CMP, CMP
      8: 0xF000,                                            // HALT
    },
    label:     'IMEM',
    _asmSource,
    _sourceView: 'asm',
  });
  const data = _output(880, 380, 'DATA');
  data.displayFormat = 'instr16';

  // ── IR + CU (carry-overs from c03; OP LED is gone — IR.OP feeds CU now,
  //    and the CU LEDs that survive are only those still telling a story
  //    in this lesson)
  const ldHi = _input(1020, 540, 'LD=1');
  const ir   = _block(COMPONENT_TYPES.IR, 1120, 380, {
    instrWidth: 16, opBits: 4, rdBits: 4, rs1Bits: 4, rs2Bits: 4,
  });
  const cu   = _block(COMPONENT_TYPES.CU, 1360, 380);

  // ── Surviving CU LEDs — placed directly above and below the CU so the
  //    relationship is visually obvious without long wires
  const rgWeLed = _output(1360, 140, 'RG_WE');
  const haltLed = _output(1360, 640, 'HALT');

  // ── NEW: Register File (dual-port), placed in the middle row right of
  //    the CU so the data path reads left-to-right
  const rf     = _block(COMPONENT_TYPES.REG_FILE_DP, 1620, 380, {
    regCount: 8, dataBits: 8, label: 'RF',
  });
  const rd1Led = _output(1880, 280, 'RD1');
  const rd2Led = _output(1880, 480, 'RD2');

  en.fixedValue   = 1;
  rst.fixedValue  = 0;
  ldHi.fixedValue = 1;

  return {
    nodes: [
      en, rst, clk,
      pc, pcOut, rom, data,
      ldHi, ir,
      cu, rgWeLed, haltLed,
      rf, rd1Led, rd2Led,
    ],
    wires: [
      // ── PC + ROM (from c02)
      _wire(en.id,  pc.id, 2),
      _wire(rst.id, pc.id, 3),
      _wire(clk.id, pc.id, 4, 0, { isClockWire: true }),
      _wire(pc.id, pcOut.id, 0, 0),
      _wire(pc.id, rom.id,   0, 0),
      _wire(rom.id, data.id, 0, 0),

      // ── IR (from c03)
      _wire(rom.id,  ir.id, 0, 0),
      _wire(ldHi.id, ir.id, 1, 0),
      _wire(clk.id,  ir.id, 2, 0, { isClockWire: true }),
      _wire(ir.id, cu.id,    0, 0),

      // ── Surviving CU LEDs
      _wire(cu.id, rgWeLed.id, 0, 1),
      _wire(cu.id, haltLed.id, 0, 5),

      // ── NEW: IR fields → RF address + data ports
      _wire(ir.id, rf.id, 0, 2),   // IR.RS1 (out 2) → RD1_ADDR
      _wire(ir.id, rf.id, 1, 3),   // IR.RS2 (out 3) → RD2_ADDR
      _wire(ir.id, rf.id, 2, 1),   // IR.RD  (out 1) → WR_ADDR
      _wire(ir.id, rf.id, 3, 3),   // IR.RS2 (out 3) → WR_DATA
                                    // (the immediate field doubles as the
                                    //  write-back value here. Step 5 adds a
                                    //  MUX that picks between this and
                                    //  ALU.Y, with CU.IMM as the selector.)
      // ── NEW: CU control → RF
      _wire(cu.id, rf.id, 4, 1),   // CU.RG_WE → WE
      _wire(clk.id, rf.id, 5, 0, { isClockWire: true }),  // CLK → RF.CLK
      // ── NEW: RF read ports → LEDs
      _wire(rf.id, rd1Led.id, 0, 0),
      _wire(rf.id, rd2Led.id, 0, 1),
    ],
  };
}

// ── CPU Build, Lesson 5: ALU + Write-Back MUX ────────────────
// Strict superset of _c04s1 with one wire replaced:
//   c04 had  IR.RS2 → RF.WR_DATA  (direct, immediate-only)
//   c05 has  IR.RS2 → MUX.D1
//            ALU.Y  → MUX.D0
//            CU.IMM → MUX.SEL
//            MUX.Y  → RF.WR_DATA
// Plus: RF.RD1 → ALU.A, RF.RD2 → ALU.B, CU.ALU_OP → ALU.OP
//       ALU.Y → ALU_R LED  (live result display)
//       ALU.Z → CU.Z, ALU.C → CU.C (placed early for step-7 branches)
function _c05s1() {
  // ── Inputs (same as c04) ─────────────────────────────────
  const en   = _input(140, 200, 'EN');
  const rst  = _input(140, 320, 'RST');
  const clk  = _clock(140, 460);

  // ── PC + ROM (same positions as c04) ─────────────────────
  const pc    = _block(COMPONENT_TYPES.PC, 380, 320, { bitWidth: 4 });
  const pcOut = _output(620, 200, 'PC');
  const _asmSource =
`; Step 5 demo — ALU + write-back MUX.
; CU.IMM (1 bit) picks the WB MUX:
;   IMM=1  → MUX picks IR.RS2 (the immediate, used by LI)
;   IMM=0  → MUX picks ALU.Y (the compute result)

NOP
NOP
LI  R1, 5
LI  R2, 3
ADD R3, R1, R2
SUB R4, R1, R2
AND R5, R1, R2
XOR R6, R1, R2
HALT`;
  const rom = _block(COMPONENT_TYPES.ROM, 620, 380, {
    addrBits:  4,
    dataBits:  16,
    asyncRead: true,
    memory:    {
      0: 0xE000, 1: 0xE000,
      2: 0xD105, 3: 0xD203,
      4: 0x0312, 5: 0x1412, 6: 0x2512, 7: 0x4612,
      8: 0xF000,
    },
    label:     'IMEM',
    _asmSource,
    _sourceView: 'asm',
  });
  const data = _output(880, 380, 'DATA');
  data.displayFormat = 'instr16';

  // ── IR + CU (carry-overs; same trimmed shape as c04)
  const ldHi = _input(1020, 540, 'LD=1');
  const ir   = _block(COMPONENT_TYPES.IR, 1120, 380, {
    instrWidth: 16, opBits: 4, rdBits: 4, rs1Bits: 4, rs2Bits: 4,
  });
  const cu = _block(COMPONENT_TYPES.CU, 1360, 380);

  // ── Surviving CU LEDs (same shape and positions as c04)
  const rgWeLed = _output(1360, 140, 'RG_WE');
  const haltLed = _output(1360, 640, 'HALT');

  // ── RF (carry-over from c04, same position; RD1/RD2 LEDs are gone —
  //    the ALU now consumes those signals visibly)
  const rf = _block(COMPONENT_TYPES.REG_FILE_DP, 1620, 380, {
    regCount: 8, dataBits: 8, label: 'RF',
  });

  // ── NEW: ALU + WB MUX + ALU_R LED ────────────────────────
  const alu = _block(COMPONENT_TYPES.ALU, 1880, 380, { bitWidth: 8 });
  const mux = _block(COMPONENT_TYPES.BUS_MUX, 1880, 620, {
    inputCount: 2, label: 'WB_MUX',
  });
  const aluResLed = _output(2140, 380, 'ALU_R');

  en.fixedValue   = 1;
  rst.fixedValue  = 0;
  ldHi.fixedValue = 1;

  return {
    nodes: [
      en, rst, clk,
      pc, pcOut, rom, data,
      ldHi, ir,
      cu, rgWeLed, haltLed,
      rf,
      alu, mux, aluResLed,
    ],
    wires: [
      // ── PC + ROM (c02)
      _wire(en.id,  pc.id, 2),
      _wire(rst.id, pc.id, 3),
      _wire(clk.id, pc.id, 4, 0, { isClockWire: true }),
      _wire(pc.id, pcOut.id, 0, 0),
      _wire(pc.id, rom.id,   0, 0),
      _wire(rom.id, data.id, 0, 0),

      // ── IR (c03)
      _wire(rom.id,  ir.id, 0, 0),
      _wire(ldHi.id, ir.id, 1, 0),
      _wire(clk.id,  ir.id, 2, 0, { isClockWire: true }),
      _wire(ir.id, cu.id,    0, 0),

      // ── Surviving CU LEDs
      _wire(cu.id, rgWeLed.id, 0, 1),
      _wire(cu.id, haltLed.id, 0, 5),

      // ── RF address ports + WE + CLK (c04 wiring kept)
      _wire(ir.id, rf.id, 0, 2),   // IR.RS1 → RD1_ADDR
      _wire(ir.id, rf.id, 1, 3),   // IR.RS2 → RD2_ADDR
      _wire(ir.id, rf.id, 2, 1),   // IR.RD  → WR_ADDR
      _wire(cu.id, rf.id, 4, 1),   // CU.RG_WE → WE
      _wire(clk.id, rf.id, 5, 0, { isClockWire: true }),

      // ── NEW: ALU
      _wire(rf.id, alu.id, 0, 0),   // RF.RD1 (out 0) → ALU.A
      _wire(rf.id, alu.id, 1, 1),   // RF.RD2 (out 1) → ALU.B
      _wire(cu.id, alu.id, 2, 0),   // CU.ALU_OP (out 0) → ALU.OP
      _wire(alu.id, aluResLed.id, 0, 0),  // ALU.Y → ALU_R LED
      // Flag feedback to CU (placed now, used in step 7)
      _wire(alu.id, cu.id, 1, 1),   // ALU.Z → CU.Z
      _wire(alu.id, cu.id, 2, 2),   // ALU.C → CU.C

      // ── NEW: WB MUX (selects what RF.WR_DATA receives)
      _wire(alu.id, mux.id, 0, 0),  // ALU.Y  → MUX.D0  (compute path)
      _wire(ir.id,  mux.id, 1, 3),  // IR.RS2 → MUX.D1  (immediate path)
      _wire(cu.id,  mux.id, 2, 6),  // CU.IMM → MUX.SEL
      _wire(mux.id, rf.id,  3, 0),  // MUX.Y  → RF.WR_DATA  (replaces c04's direct wire)
    ],
  };
}

// ── CPU Build, Lesson 6: RAM ─────────────────────────────────
// Strict superset of _c05s1 with two changes:
//   (1) ALU_R LED is gone (MEM_MUX visibly consumes ALU.Y now).
//   (2) The c05 wire ALU.Y → WB_MUX.D0 is replaced by:
//          ALU.Y    → MEM_MUX.D0
//          RAM.OUT  → MEM_MUX.D1
//          CU.MM_RE → MEM_MUX.SEL
//          MEM_MUX.Y → WB_MUX.D0
// Plus all RAM wires (ADDR, DATA, WE, RE, CLK) and a MEM_OUT LED.
function _c06s1() {
  // ── Inputs ───────────────────────────────────────────────
  const en   = _input(140, 200, 'EN');
  const rst  = _input(140, 320, 'RST');
  const clk  = _clock(140, 460);

  // ── PC + ROM (same positions; new program loaded) ────────
  const pc    = _block(COMPONENT_TYPES.PC, 380, 320, { bitWidth: 4 });
  const pcOut = _output(620, 200, 'PC');
  const _asmSource =
`; Step 6 demo — RAM (data memory).
; Setup R1..R3 with 3 data values, R4..R6 with 3 addresses,
; then STORE all three into RAM and LOAD them back into R7.

NOP
NOP
LI    R1, 5
LI    R2, 8
LI    R3, 15
LI    R4, 1
LI    R5, 2
LI    R6, 3
STORE R1, R4
STORE R2, R5
STORE R3, R6
LOAD  R7, R4
LOAD  R7, R5
LOAD  R7, R6
HALT`;
  const rom = _block(COMPONENT_TYPES.ROM, 620, 380, {
    addrBits:  4,
    dataBits:  16,
    asyncRead: true,
    memory:    {
      0:  0xE000, 1:  0xE000,
      2:  0xD105, 3:  0xD208, 4:  0xD30F,
      5:  0xD401, 6:  0xD502, 7:  0xD603,
      8:  0x9014, 9:  0x9025, 10: 0x9036,
      11: 0x8704, 12: 0x8705, 13: 0x8706,
      14: 0xF000,
    },
    label:     'IMEM',
    _asmSource,
    _sourceView: 'asm',
  });
  const data = _output(880, 380, 'DATA');
  data.displayFormat = 'instr16';

  // ── IR + CU (same trimmed shape as c04/c05) ─────────────
  const ldHi = _input(1020, 540, 'LD=1');
  const ir   = _block(COMPONENT_TYPES.IR, 1120, 380, {
    instrWidth: 16, opBits: 4, rdBits: 4, rs1Bits: 4, rs2Bits: 4,
  });
  const cu = _block(COMPONENT_TYPES.CU, 1360, 380);
  const rgWeLed = _output(1360, 140, 'RG_WE');
  const haltLed = _output(1360, 640, 'HALT');

  // ── RF (same position) ───────────────────────────────────
  const rf = _block(COMPONENT_TYPES.REG_FILE_DP, 1620, 380, {
    regCount: 8, dataBits: 8, label: 'RF',
  });

  // ── ALU + WB MUX (same positions as c05; ALU_R LED is gone — MEM_MUX
  //    consumes ALU.Y visibly)
  const alu = _block(COMPONENT_TYPES.ALU, 1880, 380, { bitWidth: 8 });
  const wbMux = _block(COMPONENT_TYPES.BUS_MUX, 1880, 620, {
    inputCount: 2, label: 'WB_MUX',
  });

  // ── NEW: RAM + MEM_MUX + MEM_OUT LED ─────────────────────
  const ram = _block(COMPONENT_TYPES.RAM, 2140, 380, {
    addrBits: 4, dataBits: 8, asyncRead: true, label: 'DMEM', memory: {},
  });
  const memMux = _block(COMPONENT_TYPES.BUS_MUX, 2140, 620, {
    inputCount: 2, label: 'MEM_MUX',
  });
  const memOutLed = _output(2400, 380, 'MEM_OUT');

  en.fixedValue   = 1;
  rst.fixedValue  = 0;
  ldHi.fixedValue = 1;

  return {
    nodes: [
      en, rst, clk,
      pc, pcOut, rom, data,
      ldHi, ir,
      cu, rgWeLed, haltLed,
      rf,
      alu,
      // RAM + MEM_MUX must precede WB_MUX in this list — the simulator's
      // Phase 4c3 evaluates BUS_MUX nodes in array order, and WB_MUX.D0
      // reads MEM_MUX.Y, so MEM_MUX must run first.
      ram, memMux, memOutLed,
      wbMux,
    ],
    wires: [
      // ── PC + ROM (c02)
      _wire(en.id,  pc.id, 2),
      _wire(rst.id, pc.id, 3),
      _wire(clk.id, pc.id, 4, 0, { isClockWire: true }),
      _wire(pc.id, pcOut.id, 0, 0),
      _wire(pc.id, rom.id,   0, 0),
      _wire(rom.id, data.id, 0, 0),

      // ── IR (c03)
      _wire(rom.id,  ir.id, 0, 0),
      _wire(ldHi.id, ir.id, 1, 0),
      _wire(clk.id,  ir.id, 2, 0, { isClockWire: true }),
      _wire(ir.id, cu.id,    0, 0),

      // ── Surviving CU LEDs
      _wire(cu.id, rgWeLed.id, 0, 1),
      _wire(cu.id, haltLed.id, 0, 5),

      // ── RF (c04)
      _wire(ir.id, rf.id, 0, 2),
      _wire(ir.id, rf.id, 1, 3),
      _wire(ir.id, rf.id, 2, 1),
      _wire(cu.id, rf.id, 4, 1),
      _wire(clk.id, rf.id, 5, 0, { isClockWire: true }),

      // ── ALU (c05)
      _wire(rf.id, alu.id, 0, 0),
      _wire(rf.id, alu.id, 1, 1),
      _wire(cu.id, alu.id, 2, 0),
      _wire(alu.id, cu.id, 1, 1),
      _wire(alu.id, cu.id, 2, 2),

      // ── WB MUX (c05; D0 source replaced below to come from MEM_MUX)
      _wire(ir.id,  wbMux.id, 1, 3),  // IR.RS2 → WB_MUX.D1 (immediate path)
      _wire(cu.id,  wbMux.id, 2, 6),  // CU.IMM → WB_MUX.SEL
      _wire(wbMux.id, rf.id,  3, 0),  // WB_MUX.Y → RF.WR_DATA

      // ── NEW: RAM
      _wire(rf.id,  ram.id, 0, 1),  // RF.RD2 → RAM.ADDR
      _wire(rf.id,  ram.id, 1, 0),  // RF.RD1 → RAM.DATA
      _wire(cu.id,  ram.id, 2, 2),  // CU.MM_WE → RAM.WE
      _wire(cu.id,  ram.id, 3, 3),  // CU.MM_RE → RAM.RE
      _wire(clk.id, ram.id, 4, 0, { isClockWire: true }),
      _wire(ram.id, memOutLed.id, 0, 0),

      // ── NEW: MEM_MUX (selects ALU.Y vs RAM.OUT, fed by CU.MM_RE)
      _wire(alu.id,    memMux.id, 0, 0),  // ALU.Y   → MEM_MUX.D0
      _wire(ram.id,    memMux.id, 1, 0),  // RAM.OUT → MEM_MUX.D1
      _wire(cu.id,     memMux.id, 2, 3),  // CU.MM_RE → MEM_MUX.SEL
      _wire(memMux.id, wbMux.id,  0, 0),  // MEM_MUX.Y → WB_MUX.D0
    ],
  };
}

// ── CPU Build, Lesson 7: JMP / Branch ────────────────────────
// Strict superset of _c06s1. Two new wires close the PC feedback loop:
//   IR.RD  (out 1) → PC.JUMP_ADDR (in 0)
//   CU.JMP (out 4) → PC.JMP       (in 1)
// And we bring back the JMP LED (was trimmed in c04 because the signal
// did nothing meaningful at that point — it does now).
function _c07s1() {
  // ── Inputs ───────────────────────────────────────────────
  const en   = _input(140, 200, 'EN');
  const rst  = _input(140, 320, 'RST');
  const clk  = _clock(140, 460);

  // ── PC + ROM (same positions; new countdown program) ────
  const pc    = _block(COMPONENT_TYPES.PC, 380, 320, { bitWidth: 4 });
  const pcOut = _output(620, 200, 'PC');
  const _asmSource =
`; Step 7 demo — JMP / BEQ.
; A 4-iteration countdown loop:
;   R1 starts at 4; each iteration subtracts 1.
;   BEQ R1, R0, 7 atomically compares R1 to R0 and jumps to HALT
;   in the SAME cycle as the compare — no two-instruction sequence,
;   no flag-clobber risk.

NOP
NOP
LI  R1, 4
LI  R2, 1
SUB R1, R1, R2
BEQ R1, R0, 7
JMP 4
HALT`;
  const rom = _block(COMPONENT_TYPES.ROM, 620, 380, {
    addrBits:  4,
    dataBits:  16,
    asyncRead: true,
    memory:    {
      0: 0xE000, 1: 0xE000,
      2: 0xD104, 3: 0xD201,
      4: 0x1112, 5: 0xB710, 6: 0xA400,
      7: 0xF000,
    },
    label:     'IMEM',
    _asmSource,
    _sourceView: 'asm',
  });
  const data = _output(880, 380, 'DATA');
  data.displayFormat = 'instr16';

  // ── IR + CU + surviving CU LEDs ─────────────────────────
  const ldHi = _input(1020, 540, 'LD=1');
  const ir   = _block(COMPONENT_TYPES.IR, 1120, 380, {
    instrWidth: 16, opBits: 4, rdBits: 4, rs1Bits: 4, rs2Bits: 4,
  });
  const cu = _block(COMPONENT_TYPES.CU, 1360, 380);
  const rgWeLed = _output(1360, 140, 'RG_WE');
  const haltLed = _output(1360, 640, 'HALT');
  // JMP LED comes back — placed just above HALT on the same column
  const jmpLed  = _output(1360,  60, 'JMP');

  // ── RF, ALU, WB MUX, RAM, MEM_MUX, MEM_OUT (all from c06) ─
  const rf = _block(COMPONENT_TYPES.REG_FILE_DP, 1620, 380, {
    regCount: 8, dataBits: 8, label: 'RF',
  });
  const alu = _block(COMPONENT_TYPES.ALU, 1880, 380, { bitWidth: 8 });
  const wbMux = _block(COMPONENT_TYPES.BUS_MUX, 1880, 620, {
    inputCount: 2, label: 'WB_MUX',
  });
  const ram = _block(COMPONENT_TYPES.RAM, 2140, 380, {
    addrBits: 4, dataBits: 8, asyncRead: true, label: 'DMEM', memory: {},
  });
  const memMux = _block(COMPONENT_TYPES.BUS_MUX, 2140, 620, {
    inputCount: 2, label: 'MEM_MUX',
  });
  const memOutLed = _output(2400, 380, 'MEM_OUT');

  en.fixedValue   = 1;
  rst.fixedValue  = 0;
  ldHi.fixedValue = 1;

  return {
    nodes: [
      en, rst, clk,
      pc, pcOut, rom, data,
      ldHi, ir,
      cu, rgWeLed, haltLed, jmpLed,
      rf,
      alu,
      ram, memMux, memOutLed,
      wbMux,
    ],
    wires: [
      // ── PC + ROM (c02)
      _wire(en.id,  pc.id, 2),
      _wire(rst.id, pc.id, 3),
      _wire(clk.id, pc.id, 4, 0, { isClockWire: true }),
      _wire(pc.id, pcOut.id, 0, 0),
      _wire(pc.id, rom.id,   0, 0),
      _wire(rom.id, data.id, 0, 0),

      // ── IR (c03)
      _wire(rom.id,  ir.id, 0, 0),
      _wire(ldHi.id, ir.id, 1, 0),
      _wire(clk.id,  ir.id, 2, 0, { isClockWire: true }),
      _wire(ir.id, cu.id, 0, 0),

      // ── Surviving CU LEDs + new JMP LED
      _wire(cu.id, rgWeLed.id, 0, 1),
      _wire(cu.id, haltLed.id, 0, 5),
      _wire(cu.id, jmpLed.id,  0, 4),

      // ── RF (c04)
      _wire(ir.id, rf.id, 0, 2),
      _wire(ir.id, rf.id, 1, 3),
      _wire(ir.id, rf.id, 2, 1),
      _wire(cu.id, rf.id, 4, 1),
      _wire(clk.id, rf.id, 5, 0, { isClockWire: true }),

      // ── ALU (c05)
      _wire(rf.id, alu.id, 0, 0),
      _wire(rf.id, alu.id, 1, 1),
      _wire(cu.id, alu.id, 2, 0),
      _wire(alu.id, cu.id, 1, 1),
      _wire(alu.id, cu.id, 2, 2),

      // ── WB MUX (c05)
      _wire(ir.id,  wbMux.id, 1, 3),
      _wire(cu.id,  wbMux.id, 2, 6),
      _wire(wbMux.id, rf.id,  3, 0),

      // ── RAM (c06)
      _wire(rf.id,  ram.id, 0, 1),
      _wire(rf.id,  ram.id, 1, 0),
      _wire(cu.id,  ram.id, 2, 2),
      _wire(cu.id,  ram.id, 3, 3),
      _wire(clk.id, ram.id, 4, 0, { isClockWire: true }),
      _wire(ram.id, memOutLed.id, 0, 0),

      // ── MEM_MUX (c06)
      _wire(alu.id,    memMux.id, 0, 0),
      _wire(ram.id,    memMux.id, 1, 0),
      _wire(cu.id,     memMux.id, 2, 3),
      _wire(memMux.id, wbMux.id,  0, 0),

      // ── NEW: PC feedback loop (closes the CPU)
      _wire(ir.id, pc.id, 0, 1),  // IR.RD  → PC.JUMP_ADDR
      _wire(cu.id, pc.id, 1, 4),  // CU.JMP → PC.JMP
    ],
  };
}

// ── CPU Build, Lesson 8: Showcase ────────────────────────────
// No hardware changes. Same circuit as _c07s1, but the RAM is pre-loaded
// with four values and the ROM holds an array-sum program.
function _c08s1() {
  // ── Inputs ───────────────────────────────────────────────
  const en   = _input(140, 200, 'EN');
  const rst  = _input(140, 320, 'RST');
  const clk  = _clock(140, 460);

  // ── PC + ROM (sum-of-RAM program) ────────────────────────
  const pc    = _block(COMPONENT_TYPES.PC, 380, 320, { bitWidth: 4 });
  const pcOut = _output(620, 200, 'PC');
  const _asmSource =
`; Step 8 — Fibonacci on your CPU.
; Computes F(2)..F(6) and stores them at RAM[0..4].
; Result: mem[0..4] = 1, 2, 3, 5, 8.

NOP
NOP
LI  R1, 0
LI  R2, 1
LI  R3, 0
LI  R4, 1
LI  R5, 5
ADD R6, R1, R2          ; LOOP
STORE R6, R3
ADD R3, R3, R4
OR  R1, R2, R0
OR  R2, R6, R0
SUB R5, R5, R4
BEQ R5, R0, 15          ; atomic compare-and-branch
JMP 7
HALT`;
  const rom = _block(COMPONENT_TYPES.ROM, 620, 380, {
    addrBits:  4,
    dataBits:  16,
    asyncRead: true,
    memory:    {
      0:  0xE000, 1:  0xE000,
      2:  0xD100, 3:  0xD201, 4:  0xD300, 5:  0xD401, 6:  0xD505,
      7:  0x0612, 8:  0x9063, 9:  0x0334,
      10: 0x3120, 11: 0x3260, 12: 0x1554,
      13: 0xBF50, 14: 0xA700, 15: 0xF000,
    },
    label:     'IMEM',
    _asmSource,
    _sourceView: 'asm',
  });
  const data = _output(880, 380, 'DATA');
  data.displayFormat = 'instr16';

  // ── IR + CU + LEDs ──────────────────────────────────────
  const ldHi = _input(1020, 540, 'LD=1');
  const ir   = _block(COMPONENT_TYPES.IR, 1120, 380, {
    instrWidth: 16, opBits: 4, rdBits: 4, rs1Bits: 4, rs2Bits: 4,
  });
  const cu = _block(COMPONENT_TYPES.CU, 1360, 380);
  const rgWeLed = _output(1360, 140, 'RG_WE');
  const haltLed = _output(1360, 640, 'HALT');
  const jmpLed  = _output(1360,  60, 'JMP');

  // ── RF, ALU, WB MUX, RAM (pre-loaded), MEM_MUX, MEM_OUT ──
  const rf = _block(COMPONENT_TYPES.REG_FILE_DP, 1620, 380, {
    regCount: 8, dataBits: 8, label: 'RF',
  });
  const alu = _block(COMPONENT_TYPES.ALU, 1880, 380, { bitWidth: 8 });
  const wbMux = _block(COMPONENT_TYPES.BUS_MUX, 1880, 620, {
    inputCount: 2, label: 'WB_MUX',
  });
  const ram = _block(COMPONENT_TYPES.RAM, 2140, 380, {
    addrBits: 4, dataBits: 8, asyncRead: true, label: 'DMEM',
    // Fibonacci writes its own outputs — RAM starts empty.
    memory: {},
  });
  const memMux = _block(COMPONENT_TYPES.BUS_MUX, 2140, 620, {
    inputCount: 2, label: 'MEM_MUX',
  });
  const memOutLed = _output(2400, 380, 'MEM_OUT');

  en.fixedValue   = 1;
  rst.fixedValue  = 0;
  ldHi.fixedValue = 1;

  return {
    nodes: [
      en, rst, clk,
      pc, pcOut, rom, data,
      ldHi, ir,
      cu, rgWeLed, haltLed, jmpLed,
      rf,
      alu,
      ram, memMux, memOutLed,
      wbMux,
    ],
    wires: [
      // PC + ROM
      _wire(en.id,  pc.id, 2),
      _wire(rst.id, pc.id, 3),
      _wire(clk.id, pc.id, 4, 0, { isClockWire: true }),
      _wire(pc.id, pcOut.id, 0, 0),
      _wire(pc.id, rom.id,   0, 0),
      _wire(rom.id, data.id, 0, 0),
      // IR
      _wire(rom.id,  ir.id, 0, 0),
      _wire(ldHi.id, ir.id, 1, 0),
      _wire(clk.id,  ir.id, 2, 0, { isClockWire: true }),
      _wire(ir.id, cu.id, 0, 0),
      // CU LEDs
      _wire(cu.id, rgWeLed.id, 0, 1),
      _wire(cu.id, haltLed.id, 0, 5),
      _wire(cu.id, jmpLed.id,  0, 4),
      // RF
      _wire(ir.id, rf.id, 0, 2),
      _wire(ir.id, rf.id, 1, 3),
      _wire(ir.id, rf.id, 2, 1),
      _wire(cu.id, rf.id, 4, 1),
      _wire(clk.id, rf.id, 5, 0, { isClockWire: true }),
      // ALU
      _wire(rf.id, alu.id, 0, 0),
      _wire(rf.id, alu.id, 1, 1),
      _wire(cu.id, alu.id, 2, 0),
      _wire(alu.id, cu.id, 1, 1),
      _wire(alu.id, cu.id, 2, 2),
      // WB MUX
      _wire(ir.id,  wbMux.id, 1, 3),
      _wire(cu.id,  wbMux.id, 2, 6),
      _wire(wbMux.id, rf.id,  3, 0),
      // RAM
      _wire(rf.id,  ram.id, 0, 1),
      _wire(rf.id,  ram.id, 1, 0),
      _wire(cu.id,  ram.id, 2, 2),
      _wire(cu.id,  ram.id, 3, 3),
      _wire(clk.id, ram.id, 4, 0, { isClockWire: true }),
      _wire(ram.id, memOutLed.id, 0, 0),
      // MEM_MUX
      _wire(alu.id,    memMux.id, 0, 0),
      _wire(ram.id,    memMux.id, 1, 0),
      _wire(cu.id,     memMux.id, 2, 3),
      _wire(memMux.id, wbMux.id,  0, 0),
      // PC feedback loop (c07)
      _wire(ir.id, pc.id, 0, 1),
      _wire(cu.id, pc.id, 1, 4),
    ],
  };
}

// ── Lesson 11: 2-bit Comparator ───────────────────────────────
// e0 = NOT(A0 XOR B0), e1 = NOT(A1 XOR B1)
// EQ = e0 AND e1
// GT = (A1 AND NOT B1) OR (e1 AND A0 AND NOT B0)
// LT = (B1 AND NOT A1) OR (e1 AND B0 AND NOT A0)
function _l18s1() {
  const A0 = _input(120, 140, 'A0');
  const A1 = _input(120, 240, 'A1');
  const B0 = _input(120, 360, 'B0');
  const B1 = _input(120, 460, 'B1');

  // Per-bit equality (bit-1 equality is shared across GT and LT, so name e1)
  const xor0 = _gate('XOR', 320, 240);    // A0 XOR B0
  const xor1 = _gate('XOR', 320, 380);    // A1 XOR B1
  const e0   = _gate('NOT', 480, 240);    // bit-0 equal
  const e1   = _gate('NOT', 480, 380);    // bit-1 equal

  // Helpers — single-input inverters used as inputs to product terms
  const nA0 = _gate('NOT', 320, 130);
  const nA1 = _gate('NOT', 320, 200);
  const nB0 = _gate('NOT', 320, 460);
  const nB1 = _gate('NOT', 320, 530);

  // EQ = e0 AND e1
  const eqAnd = _gate('AND', 660, 320);

  // GT high-bit dominator: A1 AND NOT B1
  const gtHi  = _gate('AND', 660, 600);
  // GT low-bit cond: e1 AND A0 → temp ; temp AND NOT B0 → gtLo
  const gtTmp = _gate('AND', 660, 700);
  const gtLo  = _gate('AND', 820, 720);
  const gtOr  = _gate('OR',  980, 660);

  // LT high-bit dominator: B1 AND NOT A1
  const ltHi  = _gate('AND', 660, 850);
  const ltTmp = _gate('AND', 660, 950);
  const ltLo  = _gate('AND', 820, 970);
  const ltOr  = _gate('OR',  980, 910);

  const EQ = _output(840, 320, 'EQ');
  const GT = _output(1160, 660, 'GT');
  const LT = _output(1160, 910, 'LT');

  return {
    nodes: [
      A0, A1, B0, B1,
      xor0, xor1, e0, e1,
      nA0, nA1, nB0, nB1,
      eqAnd,
      gtHi, gtTmp, gtLo, gtOr,
      ltHi, ltTmp, ltLo, ltOr,
      EQ, GT, LT,
    ],
    wires: [
      // ── Bit equality
      _wire(A0.id, xor0.id, 0),
      _wire(B0.id, xor0.id, 1),
      _wire(xor0.id, e0.id, 0),
      _wire(A1.id, xor1.id, 0),
      _wire(B1.id, xor1.id, 1),
      _wire(xor1.id, e1.id, 0),

      // ── NOTs
      _wire(A0.id, nA0.id, 0),
      _wire(A1.id, nA1.id, 0),
      _wire(B0.id, nB0.id, 0),
      _wire(B1.id, nB1.id, 0),

      // ── EQ = e0 AND e1
      _wire(e0.id, eqAnd.id, 0),
      _wire(e1.id, eqAnd.id, 1),
      _wire(eqAnd.id, EQ.id, 0),

      // ── GT
      _wire(A1.id,  gtHi.id, 0),
      _wire(nB1.id, gtHi.id, 1),
      _wire(e1.id,  gtTmp.id, 0),
      _wire(A0.id,  gtTmp.id, 1),
      _wire(gtTmp.id, gtLo.id, 0),
      _wire(nB0.id,   gtLo.id, 1),
      _wire(gtHi.id, gtOr.id, 0),
      _wire(gtLo.id, gtOr.id, 1),
      _wire(gtOr.id, GT.id, 0),

      // ── LT (mirror)
      _wire(B1.id,  ltHi.id, 0),
      _wire(nA1.id, ltHi.id, 1),
      _wire(e1.id,  ltTmp.id, 0),
      _wire(B0.id,  ltTmp.id, 1),
      _wire(ltTmp.id, ltLo.id, 0),
      _wire(nA0.id,   ltLo.id, 1),
      _wire(ltHi.id, ltOr.id, 0),
      _wire(ltLo.id, ltOr.id, 1),
      _wire(ltOr.id, LT.id, 0),
    ],
  };
}

// ── Lesson 12: 4-bit Ripple Carry Adder ───────────────────────
// 4 FAs chained. FAn.CIN ← FAn-1.COUT.
function _l19s1() {
  const A0  = _input(120, 100, 'A0');
  const A1  = _input(120, 220, 'A1');
  const A2  = _input(120, 340, 'A2');
  const A3  = _input(120, 460, 'A3');
  const B0  = _input(120, 580, 'B0');
  const B1  = _input(120, 700, 'B1');
  const B2  = _input(120, 820, 'B2');
  const B3  = _input(120, 940, 'B3');
  const CIN = _input(120, 1060, 'CIN');

  // Stagger the 4 FAs so the carry chain reads top-to-bottom.
  const fa0 = _block(COMPONENT_TYPES.FULL_ADDER, 420, 200);
  const fa1 = _block(COMPONENT_TYPES.FULL_ADDER, 420, 400);
  const fa2 = _block(COMPONENT_TYPES.FULL_ADDER, 420, 600);
  const fa3 = _block(COMPONENT_TYPES.FULL_ADDER, 420, 800);

  const S0   = _output(660, 200, 'S0');
  const S1   = _output(660, 400, 'S1');
  const S2   = _output(660, 600, 'S2');
  const S3   = _output(660, 800, 'S3');
  const COUT = _output(660, 900, 'COUT');

  return {
    nodes: [A0, A1, A2, A3, B0, B1, B2, B3, CIN, fa0, fa1, fa2, fa3, S0, S1, S2, S3, COUT],
    wires: [
      // FA0
      _wire(A0.id,  fa0.id, 0),
      _wire(B0.id,  fa0.id, 1),
      _wire(CIN.id, fa0.id, 2),
      _wire(fa0.id, S0.id,  0, 0),
      _wire(fa0.id, fa1.id, 2, 1),    // COUT(out 1) → FA1.CIN

      // FA1
      _wire(A1.id, fa1.id, 0),
      _wire(B1.id, fa1.id, 1),
      _wire(fa1.id, S1.id, 0, 0),
      _wire(fa1.id, fa2.id, 2, 1),

      // FA2
      _wire(A2.id, fa2.id, 0),
      _wire(B2.id, fa2.id, 1),
      _wire(fa2.id, S2.id, 0, 0),
      _wire(fa2.id, fa3.id, 2, 1),

      // FA3
      _wire(A3.id, fa3.id, 0),
      _wire(B3.id, fa3.id, 1),
      _wire(fa3.id, S3.id,   0, 0),
      _wire(fa3.id, COUT.id, 0, 1),   // FA3 COUT → final COUT
    ],
  };
}

// ── Lesson 16: Rising Edge Detector ───────────────────────────
// PULSE = FF1.Q AND NOT(FF2.Q) — high for one cycle after SIG goes 0→1.
function _l20s1() {
  const sig  = _input(140, 240, 'SIG');
  const clk  = _clock(140, 480);
  const ff1  = _ffD(360, 240, 'FF1');
  const ff2  = _ffD(580, 240, 'FF2');
  const not2 = _gate('NOT', 760, 320);
  const and1 = _gate('AND', 920, 280);
  const pulse = _output(1100, 280, 'PULSE');
  return {
    nodes: [sig, clk, ff1, ff2, not2, and1, pulse],
    wires: [
      // FF1.D = SIG
      _wire(sig.id, ff1.id, 0),
      // FF2.D = FF1.Q
      _wire(ff1.id, ff2.id, 0, 0),
      // Shared clock
      _wire(clk.id, ff1.id, 1),
      _wire(clk.id, ff2.id, 1),
      // Edge detect: FF1.Q AND NOT(FF2.Q)
      _wire(ff2.id, not2.id, 0, 0),
      _wire(ff1.id, and1.id, 0, 0),
      _wire(not2.id, and1.id, 1),
      _wire(and1.id, pulse.id, 0),
    ],
  };
}


const REGISTRY = {
  'l01-first-and:0':       _l01s1,
  'l01-first-and:1':       _l01s2,
  'l02-or-and-not:0':      _l02s1,
  'l02-or-and-not:1':      _l02s2,
  'l03-nand-universal:0':  _l03s1,
  'l03-nand-universal:1':  _l03s2,
  'l03-nand-universal:2':  _l03s3,
  'l04-xor-from-scratch:0': _l04s1,
  'l05-half-adder:0':      _l05s1,
  'l06-full-adder:0':      _l06s1,
  'l07-mux-2to1:0':        _l07s1,
  'l08-decoder-2to4:0':    _l08s1,
  'l09-and4:0':            _l09s1,
  'l10-majority:0':        _l10s1,
  'l11-sr-latch:0':        _l11s1,
  'l12-dff-toggle:0':      _l12s1,
  'l13-register-4bit:0':   _l13s1,
  'l15-traffic-light:0':   _l15s1,
  'l16-alu-2bit:0':        _l16s1,
  'l17-counter-en-rst:0':  _l17s1,
  'l18-comparator-2bit:0':   _l18s1,
  'l19-ripple-adder-4bit:0': _l19s1,
  'l20-edge-detector:0':     _l20s1,
  'c01-pc:0':                _c01s1,
  'c02-rom:0':               _c02s1,
  'c03-ir-cu:0':             _c03s1,
  'c04-regfile:0':           _c04s1,
  'c05-alu:0':               _c05s1,
  'c06-ram:0':               _c06s1,
  'c07-jmp:0':               _c07s1,
  'c08-showcase:0':          _c08s1,
};

export function hasSolution(lessonId, stepIndex) {
  return !!REGISTRY[`${lessonId}:${stepIndex}`];
}

export function buildSolution(lessonId, stepIndex) {
  const fn = REGISTRY[`${lessonId}:${stepIndex}`];
  return fn ? _build(fn) : null;
}
