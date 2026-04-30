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

// ── CPU Build, Lesson 3: ROM Picks the Register ──────────────
// Carries forward PC + ROM from lesson 2 and adds:
//   - IR (pure bit-splitter, fed from ROM, LD held high by IMM(1))
//   - REG_FILE (single-port, 4 regs × 8 bits)
// The single new pedagogical wire: IR.RD (out 1) → RF.WR_ADDR (in 1).
// WR_DATA stays a manual IMM constant — the ALU connection is lesson 4.
function _c03s1() {
  // ── Inputs ───────────────────────────────────────────────
  const en  = _input(120, 100, 'EN');
  const rst = _input(120, 200, 'RST');
  const we  = _input(120, 540, 'WE');
  const clk = _clock(260, 360);

  // ── PC + ROM (carry-overs) ──────────────────────────────
  const pc    = _block(COMPONENT_TYPES.PC, 360, 160, { bitWidth: 4 });
  const pcOut = _output(580, 80, 'PC');
  const _asmSource =
`; In this lesson only the RD field of each instruction matters —
; the data being written is a manual IMM constant (0x77).
; LI's actual immediate value is decoded properly in lesson 6.

LI  R1, 5
LI  R2, 3
ADD R3, R1, R2
HALT`;
  const rom = _block(COMPONENT_TYPES.ROM, 580, 200, {
    addrBits:    4,
    dataBits:    16,
    asyncRead:   true,
    memory:      { 0: 0xD105, 1: 0xD203, 2: 0x0312, 3: 0xF000 },
    label:       'IMEM',
    _asmSource,
    _sourceView: 'asm',
  });
  const dataOut = _output(820, 200, 'DATA');

  // ── IR (bit-splitter) + diagnostic outputs ──────────────
  const ldImm = _block(COMPONENT_TYPES.IMM, 820, 320, { value: 1, bitWidth: 1, label: 'LD=1' });
  const ir    = _block(COMPONENT_TYPES.IR,  580, 380, {
    instrWidth: 16, opBits: 4, rdBits: 4, rs1Bits: 4, rs2Bits: 4,
    label: 'IR',
  });
  const opOut  = _output(820, 380, 'OP');
  const rdOut  = _output(820, 440, 'RD');
  const rs1Out = _output(820, 500, 'RS1');
  const rs2Out = _output(820, 560, 'RS2');

  // ── RegFile demo (manual data + RD inspect, write addr from IR) ──
  const rdAddr  = _block(COMPONENT_TYPES.IMM, 120, 660, { value: 1,    bitWidth: 8, label: 'RD_ADDR' });
  const wrData  = _block(COMPONENT_TYPES.IMM, 120, 740, { value: 0x77, bitWidth: 8, label: 'DATA' });
  const rf      = _block(COMPONENT_TYPES.REG_FILE, 360, 720, {
    regCount:    4,
    dataBits:    8,
    initialRegs: [0, 0, 0, 0],
    label:       'RF',
  });
  const q       = _output(620, 720, 'Q');

  en.fixedValue = 1;
  rst.fixedValue = 0;
  we.fixedValue = 0;

  return {
    nodes: [
      en, rst, we, clk,
      pc, pcOut, rom, dataOut,
      ldImm, ir, opOut, rdOut, rs1Out, rs2Out,
      rdAddr, wrData, rf, q,
    ],
    wires: [
      // ── PC controls + clock ──
      _wire(en.id,  pc.id, 2),
      _wire(rst.id, pc.id, 3),
      _wire(clk.id, pc.id, 4, 0, { isClockWire: true }),
      _wire(pc.id, pcOut.id, 0, 0),
      _wire(pc.id, rom.id,   0, 0),

      // ── ROM → IR (and DATA diagnostic) ──
      _wire(rom.id, dataOut.id, 0, 0),
      _wire(rom.id, ir.id,      0, 0),     // INSTR ← ROM out
      _wire(ldImm.id, ir.id,    1),        // LD=1 always
      _wire(clk.id, ir.id,      2, 0, { isClockWire: true }),

      // ── IR field diagnostics ──
      _wire(ir.id, opOut.id,  0, 0),
      _wire(ir.id, rdOut.id,  0, 1),
      _wire(ir.id, rs1Out.id, 0, 2),
      _wire(ir.id, rs2Out.id, 0, 3),

      // ── RegFile wiring ──
      _wire(rdAddr.id, rf.id, 0),       // manual RD inspect addr
      _wire(ir.id,     rf.id, 1, 1),    // ★ IR.RD (out 1) → RF.WR_ADDR — lesson's key wire
      _wire(wrData.id, rf.id, 2),       // manual WR_DATA
      _wire(we.id,     rf.id, 3),
      _wire(clk.id,    rf.id, 4, 0, { isClockWire: true }),
      _wire(rf.id,     q.id,  0, 0),
    ],
  };
}

// ── CPU Build, Lesson 4: ROM Drives the RegFile ──────────────
// Carries forward PC + ROM from lessons 1–3 and adds IR + REG_FILE_DP +
// ALU so a real instruction in ROM updates the Register File on STEP.
//
// Wiring summary:
//   PC → ROM.ADDR ; ROM.OUT → IR.INSTR
//   IR.RS1 → RF.RD1_ADDR ; IR.RS2 → RF.RD2_ADDR ; IR.RD → RF.WR_ADDR
//   RF.RD1 → ALU.A ; RF.RD2 → ALU.B ; IMM(0) → ALU.OP_IN
//   ALU.Y → RF.WR_DATA ; manual WE → RF.WE
//   Shared CLOCK → PC, IR, RF (all isClockWire: true)
//
// Initial state: R0=0, R1=5, R2=3, R3=0 (initialRegs preload). ROM contains
// just `ADD R3, R1, R2` and `HALT` — LI is skipped because the immediate
// path arrives in lesson 6.
function _c04s1() {
  // ── Inputs ───────────────────────────────────────────────
  const en  = _input(120, 100, 'EN');
  const rst = _input(120, 200, 'RST');
  const we  = _input(120, 540, 'WE');
  const clk = _clock(260, 360);

  // ── PC + ROM (carry-overs) ──────────────────────────────
  const pc    = _block(COMPONENT_TYPES.PC, 360, 160, { bitWidth: 4 });
  const pcOut = _output(580, 80, 'PC');
  const _asmSource =
`; R1=5 and R2=3 are pre-loaded into the RegFile.
; The single meaningful instruction is the ADD; HALT stops the loop.

ADD R3, R1, R2
HALT`;
  const rom   = _block(COMPONENT_TYPES.ROM, 580, 200, {
    addrBits:    4,
    dataBits:    16,
    asyncRead:   true,
    memory:      { 0: 0x0312, 1: 0xF000 },
    label:       'IMEM',
    _asmSource,
    _sourceView: 'asm',
  });
  const dataOut = _output(820, 200, 'DATA');

  // ── IR (bit-splitter — gets ROM data + a constant LD=1) ──
  const ldImm = _block(COMPONENT_TYPES.IMM, 820, 320, { value: 1, bitWidth: 1, label: 'LD=1' });
  const ir    = _block(COMPONENT_TYPES.IR,  580, 380, {
    instrWidth: 16, opBits: 4, rdBits: 4, rs1Bits: 4, rs2Bits: 4,
    label: 'IR',
  });
  // Diagnostic outputs for IR fields so the learner sees decode happen.
  const opOut  = _output(820, 380, 'OP');
  const rdOut  = _output(820, 440, 'RD');
  const rs1Out = _output(820, 500, 'RS1');
  const rs2Out = _output(820, 560, 'RS2');

  // ── ALU OP IMM (hard-coded ADD until CU arrives in lesson 5) ──
  const opImm = _block(COMPONENT_TYPES.IMM, 1080, 760, { value: 0, bitWidth: 3, label: 'ADD' });

  // ── RegFile (dual-port, 4 regs × 8 bits, R0 protected, R1=5, R2=3) ──
  const rf = _block(COMPONENT_TYPES.REG_FILE_DP, 360, 720, {
    regCount:    4,
    dataBits:    8,
    initialRegs: [0, 5, 3, 0],
    protectR0:   true,
    label:       'RF',
  });
  const aIn = _output(620, 700, 'A_IN');
  const bIn = _output(620, 780, 'B_IN');

  // ── ALU ──
  const alu  = _block(COMPONENT_TYPES.ALU, 880, 740, { bitWidth: 8, label: 'ALU' });
  const aluY = _output(1140, 740, 'ALU_Y');

  // Pre-set EN, WE so the demo behaviour matches the lesson copy.
  en.fixedValue = 1;
  rst.fixedValue = 0;
  we.fixedValue = 0;

  return {
    nodes: [
      en, rst, we, clk,
      pc, pcOut, rom, dataOut,
      ldImm, ir, opOut, rdOut, rs1Out, rs2Out,
      opImm, rf, aIn, bIn, alu, aluY,
    ],
    wires: [
      // ── PC controls + clock ──
      _wire(en.id,  pc.id, 2),
      _wire(rst.id, pc.id, 3),
      _wire(clk.id, pc.id, 4, 0, { isClockWire: true }),
      _wire(pc.id, pcOut.id, 0, 0),
      _wire(pc.id, rom.id,   0, 0),

      // ── ROM → IR (and DATA diagnostic) ──
      _wire(rom.id, dataOut.id, 0, 0),
      _wire(rom.id, ir.id,      0, 0),     // INSTR ← ROM out
      _wire(ldImm.id, ir.id,    1),        // LD=1 always
      _wire(clk.id, ir.id,      2, 0, { isClockWire: true }),

      // ── IR field diagnostics + RF address routing ──
      _wire(ir.id, opOut.id,  0, 0),
      _wire(ir.id, rdOut.id,  0, 1),
      _wire(ir.id, rs1Out.id, 0, 2),
      _wire(ir.id, rs2Out.id, 0, 3),
      _wire(ir.id, rf.id, 0, 2),  // RS1 (out 2) → RD1_ADDR (in 0)
      _wire(ir.id, rf.id, 1, 3),  // RS2 (out 3) → RD2_ADDR (in 1)
      _wire(ir.id, rf.id, 2, 1),  // RD  (out 1) → WR_ADDR  (in 2)

      // ── RF read ports → ALU operands (and diagnostics) ──
      _wire(rf.id, aIn.id,  0, 0),
      _wire(rf.id, bIn.id,  0, 1),
      _wire(rf.id, alu.id,  0, 0),  // RD1 → ALU.A
      _wire(rf.id, alu.id,  1, 1),  // RD2 → ALU.B
      _wire(opImm.id, alu.id, 2),   // ALU OP_IN ← IMM(0)=ADD

      // ── ALU output → RF write-back (and diagnostic) ──
      _wire(alu.id, aluY.id, 0, 0),
      _wire(alu.id, rf.id,   3, 0),  // ALU.Y → RF.WR_DATA

      // ── WE + RF clock ──
      _wire(we.id,  rf.id, 4),
      _wire(clk.id, rf.id, 5, 0, { isClockWire: true }),
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
  'c03-regfile:0':           _c03s1,
  'c04-execute:0':           _c04s1,
};

export function hasSolution(lessonId, stepIndex) {
  return !!REGISTRY[`${lessonId}:${stepIndex}`];
}

export function buildSolution(lessonId, stepIndex) {
  const fn = REGISTRY[`${lessonId}:${stepIndex}`];
  return fn ? _build(fn) : null;
}
