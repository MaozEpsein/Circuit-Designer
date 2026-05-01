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
`; A "tasting menu" of the ISA — every major opcode class shows up
; at least once so DATA cycles through visibly different patterns
; as the PC walks 0..9. None of it actually executes yet (no IR /
; CU / RF / ALU / RAM exist until lessons 3-6).

LI    R1, 5
LI    R2, 3
ADD   R3, R1, R2
SUB   R4, R1, R2
AND   R5, R1, R2
XOR   R6, R1, R2
CMP   R1, R2
STORE R3, R0
LOAD  R7, R0
HALT`;
  const rom  = _block(COMPONENT_TYPES.ROM, 620, 380, {
    addrBits:  4,
    dataBits:  16,
    asyncRead: true,
    memory:    {
      0: 0xD105, 1: 0xD203, 2: 0x0312, 3: 0x1412, 4: 0x2512,
      5: 0x4612, 6: 0x7012, 7: 0x9030, 8: 0x8700, 9: 0xF000,
    },
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



// ── Track: MUX 2:1 (4 staged steps) ──────────────────────────
// Each step is a pure addition over the previous — no nodes are
// removed between steps. Diagnostic LEDs (NOT_SEL, BRANCH_A,
// BRANCH_B) stay on the canvas through step 4 so the learner can
// see every internal value.

// Step 1: SEL → NOT → NOT_SEL.
function _muxs1() {
  const sel  = _input(150, 460, 'SEL');
  const nsel = _gate('NOT', 320, 460);
  const nsel_out = _output(500, 460, 'NOT_SEL');
  return {
    nodes: [sel, nsel, nsel_out],
    wires: [
      _wire(sel.id,  nsel.id,     0),
      _wire(nsel.id, nsel_out.id, 0),
    ],
  };
}

// Step 2: + A, AND (A & NOT_SEL), BRANCH_A.
function _muxs2() {
  const a    = _input(150, 220, 'A');
  const sel  = _input(150, 460, 'SEL');
  const nsel = _gate('NOT', 320, 460);
  const nsel_out = _output(500, 460, 'NOT_SEL');
  const and1 = _gate('AND', 500, 280);
  const branchA = _output(700, 280, 'BRANCH_A');
  return {
    nodes: [a, sel, nsel, nsel_out, and1, branchA],
    wires: [
      _wire(sel.id,  nsel.id,     0),
      _wire(nsel.id, nsel_out.id, 0),
      _wire(a.id,    and1.id,     0),
      _wire(nsel.id, and1.id,     1),
      _wire(and1.id, branchA.id,  0),
    ],
  };
}

// Step 3: + B, AND (B & SEL), BRANCH_B.
function _muxs3() {
  const a    = _input(150, 220, 'A');
  const b    = _input(150, 340, 'B');
  const sel  = _input(150, 460, 'SEL');
  const nsel = _gate('NOT', 320, 460);
  const nsel_out = _output(500, 460, 'NOT_SEL');
  const and1 = _gate('AND', 500, 280);
  const branchA = _output(700, 280, 'BRANCH_A');
  const and2 = _gate('AND', 500, 400);
  const branchB = _output(700, 400, 'BRANCH_B');
  return {
    nodes: [a, b, sel, nsel, nsel_out, and1, branchA, and2, branchB],
    wires: [
      _wire(sel.id,  nsel.id,     0),
      _wire(nsel.id, nsel_out.id, 0),
      _wire(a.id,    and1.id,     0),
      _wire(nsel.id, and1.id,     1),
      _wire(and1.id, branchA.id,  0),
      _wire(b.id,    and2.id,     0),
      _wire(sel.id,  and2.id,     1),
      _wire(and2.id, branchB.id,  0),
    ],
  };
}

// Step 4: + OR (BRANCH_A | BRANCH_B), OUT — full MUX.
// AND outputs fan out: each drives both its diagnostic LED AND the
// OR. That's why no rewiring is needed; the previous LEDs simply
// gain a parallel sink.
function _muxs4() {
  const a    = _input(150, 220, 'A');
  const b    = _input(150, 340, 'B');
  const sel  = _input(150, 460, 'SEL');
  const nsel = _gate('NOT', 320, 460);
  const nsel_out = _output(500, 460, 'NOT_SEL');
  const and1 = _gate('AND', 500, 280);
  const branchA = _output(700, 280, 'BRANCH_A');
  const and2 = _gate('AND', 500, 400);
  const branchB = _output(700, 400, 'BRANCH_B');
  const or1  = _gate('OR', 900, 340);
  const out  = _output(1100, 340, 'OUT');
  return {
    nodes: [a, b, sel, nsel, nsel_out, and1, branchA, and2, branchB, or1, out],
    wires: [
      _wire(sel.id,  nsel.id,     0),
      _wire(nsel.id, nsel_out.id, 0),
      _wire(a.id,    and1.id,     0),
      _wire(nsel.id, and1.id,     1),
      _wire(and1.id, branchA.id,  0),
      _wire(b.id,    and2.id,     0),
      _wire(sel.id,  and2.id,     1),
      _wire(and2.id, branchB.id,  0),
      _wire(and1.id, or1.id,      0),
      _wire(and2.id, or1.id,      1),
      _wire(or1.id,  out.id,      0),
    ],
  };
}

// ── Traffic Light FSM (4 staged steps) ───────────────────────
// Coordinates are reused across the four steps so each successive
// build is a pure "add some nodes / wires" diff. The exception is
// step 3, which removes the manual D inputs (D0_IN, D1_IN); and
// step 4, which removes the direct AND→FF.D wires from step 3
// before inserting the RST gating.
//
// Pin layout: D-FF (FF_SLOT, ffType=D) inputs D(0), CLK(1);
// outputs Q(0), Q_BAR(1). No CLR pin → step 4's reset is built
// from gates (synchronous reset by AND-ing D with NOT(RST)).

// Step 1: 2 D-FFs + manual D inputs + S0/S1 LEDs.
function _tls1() {
  const clk    = _clock(140, 720);
  const d0in   = _input(140, 200, 'D0_IN');
  const d1in   = _input(140, 600, 'D1_IN');
  const ff0    = _ffD(620, 280, 'S0');
  const ff1    = _ffD(620, 480, 'S1');
  const s0out  = _output(820, 200, 'S0_OUT');
  const s1out  = _output(820, 580, 'S1_OUT');
  return {
    nodes: [clk, d0in, d1in, ff0, ff1, s0out, s1out],
    wires: [
      _wire(d0in.id, ff0.id, 0),
      _wire(d1in.id, ff1.id, 0),
      _wire(clk.id,  ff0.id, 1, 0, { isClockWire: true }),
      _wire(clk.id,  ff1.id, 1, 0, { isClockWire: true }),
      _wire(ff0.id,  s0out.id, 0, 0),
      _wire(ff1.id,  s1out.id, 0, 0),
    ],
  };
}

// Step 2: + NOT_S0, NOT_S1, 3 decoder ANDs, RED/GREEN/YELLOW LEDs.
function _tls2() {
  const clk    = _clock(140, 720);
  const d0in   = _input(140, 200, 'D0_IN');
  const d1in   = _input(140, 600, 'D1_IN');
  const ff0    = _ffD(620, 280, 'S0');
  const ff1    = _ffD(620, 480, 'S1');
  const s0out  = _output(820, 200, 'S0_OUT');
  const s1out  = _output(820, 580, 'S1_OUT');
  const ns0    = _gate('NOT', 380, 280);
  const ns1    = _gate('NOT', 380, 480);
  const aRed   = _gate('AND', 880, 240);
  const aGrn   = _gate('AND', 880, 380);
  const aYel   = _gate('AND', 880, 520);
  const red    = _output(1100, 240, 'RED');
  const green  = _output(1100, 380, 'GREEN');
  const yellow = _output(1100, 520, 'YELLOW');
  return {
    nodes: [clk, d0in, d1in, ff0, ff1, s0out, s1out, ns0, ns1, aRed, aGrn, aYel, red, green, yellow],
    wires: [
      _wire(d0in.id, ff0.id, 0),
      _wire(d1in.id, ff1.id, 0),
      _wire(clk.id,  ff0.id, 1, 0, { isClockWire: true }),
      _wire(clk.id,  ff1.id, 1, 0, { isClockWire: true }),
      _wire(ff0.id,  s0out.id, 0, 0),
      _wire(ff1.id,  s1out.id, 0, 0),
      // Inverters
      _wire(ff0.id,  ns0.id, 0, 0),
      _wire(ff1.id,  ns1.id, 0, 0),
      // RED = NOT_S1 AND NOT_S0
      _wire(ns1.id,  aRed.id, 0),
      _wire(ns0.id,  aRed.id, 1),
      _wire(aRed.id, red.id,  0),
      // GREEN = NOT_S1 AND S0
      _wire(ns1.id,  aGrn.id, 0),
      _wire(ff0.id,  aGrn.id, 1, 0),
      _wire(aGrn.id, green.id, 0),
      // YELLOW = S1 AND NOT_S0
      _wire(ff1.id,  aYel.id, 0, 0),
      _wire(ns0.id,  aYel.id, 1),
      _wire(aYel.id, yellow.id, 0),
    ],
  };
}

// Step 3: drop manual D inputs; fan out RED_AND → S0.D, GREEN_AND → S1.D.
// The decoder ANDs are now also the next-state logic.
function _tls3() {
  const clk    = _clock(140, 720);
  const ff0    = _ffD(620, 280, 'S0');
  const ff1    = _ffD(620, 480, 'S1');
  const s0out  = _output(820, 200, 'S0_OUT');
  const s1out  = _output(820, 580, 'S1_OUT');
  const ns0    = _gate('NOT', 380, 280);
  const ns1    = _gate('NOT', 380, 480);
  const aRed   = _gate('AND', 880, 240);
  const aGrn   = _gate('AND', 880, 380);
  const aYel   = _gate('AND', 880, 520);
  const red    = _output(1100, 240, 'RED');
  const green  = _output(1100, 380, 'GREEN');
  const yellow = _output(1100, 520, 'YELLOW');
  return {
    nodes: [clk, ff0, ff1, s0out, s1out, ns0, ns1, aRed, aGrn, aYel, red, green, yellow],
    wires: [
      _wire(clk.id,  ff0.id, 1, 0, { isClockWire: true }),
      _wire(clk.id,  ff1.id, 1, 0, { isClockWire: true }),
      _wire(ff0.id,  s0out.id, 0, 0),
      _wire(ff1.id,  s1out.id, 0, 0),
      _wire(ff0.id,  ns0.id, 0, 0),
      _wire(ff1.id,  ns1.id, 0, 0),
      _wire(ns1.id,  aRed.id, 0),
      _wire(ns0.id,  aRed.id, 1),
      _wire(aRed.id, red.id,  0),
      _wire(ns1.id,  aGrn.id, 0),
      _wire(ff0.id,  aGrn.id, 1, 0),
      _wire(aGrn.id, green.id, 0),
      _wire(ff1.id,  aYel.id, 0, 0),
      _wire(ns0.id,  aYel.id, 1),
      _wire(aYel.id, yellow.id, 0),
      // The brand-new wires that close the loop:
      // RED_AND output also feeds FF0.D (next-state S0).
      // GREEN_AND output also feeds FF1.D (next-state S1).
      _wire(aRed.id, ff0.id, 0),
      _wire(aGrn.id, ff1.id, 0),
    ],
  };
}

// Step 4: synchronous RST. Insert AND_RST_0/1 between the decoder
// outputs and the FF.D inputs; gate them with NOT(RST).
function _tls4() {
  const clk    = _clock(140, 720);
  const rst    = _input(140, 400, 'RST');
  const ff0    = _ffD(620, 280, 'S0');
  const ff1    = _ffD(620, 480, 'S1');
  const s0out  = _output(820, 200, 'S0_OUT');
  const s1out  = _output(820, 580, 'S1_OUT');
  const ns0    = _gate('NOT', 380, 280);
  const ns1    = _gate('NOT', 380, 480);
  const nrst   = _gate('NOT', 380, 400);
  const aRed   = _gate('AND', 880, 240);
  const aGrn   = _gate('AND', 880, 380);
  const aYel   = _gate('AND', 880, 520);
  const aRst0  = _gate('AND', 460, 320);
  const aRst1  = _gate('AND', 460, 440);
  const red    = _output(1100, 240, 'RED');
  const green  = _output(1100, 380, 'GREEN');
  const yellow = _output(1100, 520, 'YELLOW');
  return {
    nodes: [clk, rst, ff0, ff1, s0out, s1out, ns0, ns1, nrst, aRed, aGrn, aYel, aRst0, aRst1, red, green, yellow],
    wires: [
      _wire(clk.id,  ff0.id, 1, 0, { isClockWire: true }),
      _wire(clk.id,  ff1.id, 1, 0, { isClockWire: true }),
      _wire(ff0.id,  s0out.id, 0, 0),
      _wire(ff1.id,  s1out.id, 0, 0),
      _wire(ff0.id,  ns0.id, 0, 0),
      _wire(ff1.id,  ns1.id, 0, 0),
      // Output decoder + next-state ANDs (unchanged from step 3)
      _wire(ns1.id,  aRed.id, 0),
      _wire(ns0.id,  aRed.id, 1),
      _wire(aRed.id, red.id,  0),
      _wire(ns1.id,  aGrn.id, 0),
      _wire(ff0.id,  aGrn.id, 1, 0),
      _wire(aGrn.id, green.id, 0),
      _wire(ff1.id,  aYel.id, 0, 0),
      _wire(ns0.id,  aYel.id, 1),
      _wire(aYel.id, yellow.id, 0),
      // RST gating: D = next_state AND NOT(RST). When RST=1, D=0,
      // so the next clock edge latches 00 (= RED).
      _wire(rst.id,  nrst.id, 0),
      _wire(aRed.id, aRst0.id, 0),
      _wire(nrst.id, aRst0.id, 1),
      _wire(aRst0.id, ff0.id, 0),
      _wire(aGrn.id, aRst1.id, 0),
      _wire(nrst.id, aRst1.id, 1),
      _wire(aRst1.id, ff1.id, 0),
    ],
  };
}

// ── 2-bit ALU (5 staged steps) ──────────────────────────────
// Pin layouts in use:
//   FULL_ADDER: inputs A(0), B(1), CIN(2); outputs SUM(0), COUT(1).
//   MUX (inputCount=4): inputs D0(0), D1(1), D2(2), D3(3),
//                       S0(4)=LSB, S1(5)=MSB; output Y(0).
// Coordinates are stable across steps so each successive build is
// a pure additive diff (step 4 is the exception — the lesson's
// startsFromCustomize strips the diagnostic OUTPUTs from steps 1–3
// before alu-s4's own scene draws the MUX/Y outputs).

// Step 1: A0/A1/B0/B1 + 2 ANDs + 2 ORs + 4 diagnostic LEDs.
function _alus1() {
  const A0 = _input(120, 140, 'A0');
  const A1 = _input(120, 220, 'A1');
  const B0 = _input(120, 300, 'B0');
  const B1 = _input(120, 380, 'B1');
  const and0 = _gate('AND', 380, 140);
  const and1 = _gate('AND', 380, 220);
  const or0  = _gate('OR',  380, 300);
  const or1  = _gate('OR',  380, 380);
  const and0o = _output(560, 140, 'AND0_OUT');
  const and1o = _output(560, 220, 'AND1_OUT');
  const or0o  = _output(560, 300, 'OR0_OUT');
  const or1o  = _output(560, 380, 'OR1_OUT');
  return {
    nodes: [A0, A1, B0, B1, and0, and1, or0, or1, and0o, and1o, or0o, or1o],
    wires: [
      _wire(A0.id, and0.id, 0),
      _wire(B0.id, and0.id, 1),
      _wire(A1.id, and1.id, 0),
      _wire(B1.id, and1.id, 1),
      _wire(A0.id, or0.id,  0),
      _wire(B0.id, or0.id,  1),
      _wire(A1.id, or1.id,  0),
      _wire(B1.id, or1.id,  1),
      _wire(and0.id, and0o.id, 0),
      _wire(and1.id, and1o.id, 0),
      _wire(or0.id,  or0o.id,  0),
      _wire(or1.id,  or1o.id,  0),
    ],
  };
}

// Step 2: + 2 F-ADDs in carry chain (FA0.CIN unwired = 0) + SUM LEDs.
function _alus2() {
  const A0 = _input(120, 140, 'A0');
  const A1 = _input(120, 220, 'A1');
  const B0 = _input(120, 300, 'B0');
  const B1 = _input(120, 380, 'B1');
  const and0 = _gate('AND', 380, 140);
  const and1 = _gate('AND', 380, 220);
  const or0  = _gate('OR',  380, 300);
  const or1  = _gate('OR',  380, 380);
  const and0o = _output(560, 140, 'AND0_OUT');
  const and1o = _output(560, 220, 'AND1_OUT');
  const or0o  = _output(560, 300, 'OR0_OUT');
  const or1o  = _output(560, 380, 'OR1_OUT');
  const fa0   = _block(COMPONENT_TYPES.FULL_ADDER, 560, 480);
  const fa1   = _block(COMPONENT_TYPES.FULL_ADDER, 560, 600);
  const sum0o = _output(760, 480, 'SUM0_OUT');
  const sum1o = _output(760, 600, 'SUM1_OUT');
  return {
    nodes: [A0, A1, B0, B1, and0, and1, or0, or1, and0o, and1o, or0o, or1o, fa0, fa1, sum0o, sum1o],
    wires: [
      // Bitwise gates (unchanged from step 1)
      _wire(A0.id, and0.id, 0),
      _wire(B0.id, and0.id, 1),
      _wire(A1.id, and1.id, 0),
      _wire(B1.id, and1.id, 1),
      _wire(A0.id, or0.id,  0),
      _wire(B0.id, or0.id,  1),
      _wire(A1.id, or1.id,  0),
      _wire(B1.id, or1.id,  1),
      _wire(and0.id, and0o.id, 0),
      _wire(and1.id, and1o.id, 0),
      _wire(or0.id,  or0o.id,  0),
      _wire(or1.id,  or1o.id,  0),
      // Adder chain
      _wire(A0.id,  fa0.id, 0),
      _wire(B0.id,  fa0.id, 1),
      _wire(A1.id,  fa1.id, 0),
      _wire(B1.id,  fa1.id, 1),
      _wire(fa0.id, fa1.id, 2, 1),    // FA0.COUT (out 1) → FA1.CIN (in 2)
      _wire(fa0.id, sum0o.id, 0, 0),  // FA0.SUM (out 0) → LED
      _wire(fa1.id, sum1o.id, 0, 0),
      // FA0.CIN intentionally unwired — defaults to 0 → pure ADD.
    ],
  };
}

// Step 3: + OP0 + 2 XORs (B XOR OP0) + OP0 → FA0.CIN. Adder now does
// ADD when OP0=0 and SUB when OP0=1.
function _alus3() {
  const A0  = _input(120, 140, 'A0');
  const A1  = _input(120, 220, 'A1');
  const B0  = _input(120, 300, 'B0');
  const B1  = _input(120, 380, 'B1');
  const OP0 = _input(120, 540, 'OP0');
  const and0 = _gate('AND', 380, 140);
  const and1 = _gate('AND', 380, 220);
  const or0  = _gate('OR',  380, 300);
  const or1  = _gate('OR',  380, 380);
  const and0o = _output(560, 140, 'AND0_OUT');
  const and1o = _output(560, 220, 'AND1_OUT');
  const or0o  = _output(560, 300, 'OR0_OUT');
  const or1o  = _output(560, 380, 'OR1_OUT');
  const xor0  = _gate('XOR', 380, 480);   // B0 XOR OP0
  const xor1  = _gate('XOR', 380, 600);   // B1 XOR OP0
  const fa0   = _block(COMPONENT_TYPES.FULL_ADDER, 580, 480);
  const fa1   = _block(COMPONENT_TYPES.FULL_ADDER, 580, 600);
  const sum0o = _output(780, 480, 'SUM0_OUT');
  const sum1o = _output(780, 600, 'SUM1_OUT');
  return {
    nodes: [A0, A1, B0, B1, OP0, and0, and1, or0, or1, and0o, and1o, or0o, or1o, xor0, xor1, fa0, fa1, sum0o, sum1o],
    wires: [
      _wire(A0.id, and0.id, 0),
      _wire(B0.id, and0.id, 1),
      _wire(A1.id, and1.id, 0),
      _wire(B1.id, and1.id, 1),
      _wire(A0.id, or0.id,  0),
      _wire(B0.id, or0.id,  1),
      _wire(A1.id, or1.id,  0),
      _wire(B1.id, or1.id,  1),
      _wire(and0.id, and0o.id, 0),
      _wire(and1.id, and1o.id, 0),
      _wire(or0.id,  or0o.id,  0),
      _wire(or1.id,  or1o.id,  0),
      // XORs: B XOR OP0 → conditional invert
      _wire(B0.id,  xor0.id, 0),
      _wire(OP0.id, xor0.id, 1),
      _wire(B1.id,  xor1.id, 0),
      _wire(OP0.id, xor1.id, 1),
      // Adder chain — A from inputs, B from XOR outputs, CIN=OP0
      _wire(A0.id,   fa0.id, 0),
      _wire(xor0.id, fa0.id, 1),
      _wire(OP0.id,  fa0.id, 2),       // FA0.CIN = OP0
      _wire(A1.id,   fa1.id, 0),
      _wire(xor1.id, fa1.id, 1),
      _wire(fa0.id,  fa1.id, 2, 1),    // FA0.COUT → FA1.CIN
      _wire(fa0.id,  sum0o.id, 0, 0),
      _wire(fa1.id,  sum1o.id, 0, 0),
    ],
  };
}

// Step 4: + OP1, 2 4:1 MUXes, Y0/Y1. Diagnostic LEDs from steps 1-3
// are stripped by the lesson's startsFromCustomize — this function
// builds the canonical clean ALU shape.
function _alus4() {
  const A0  = _input(120, 140, 'A0');
  const A1  = _input(120, 220, 'A1');
  const B0  = _input(120, 300, 'B0');
  const B1  = _input(120, 380, 'B1');
  const OP0 = _input(120, 540, 'OP0');
  const OP1 = _input(120, 620, 'OP1');
  const and0 = _gate('AND', 380, 140);
  const and1 = _gate('AND', 380, 220);
  const or0  = _gate('OR',  380, 300);
  const or1  = _gate('OR',  380, 380);
  const xor0 = _gate('XOR', 380, 480);
  const xor1 = _gate('XOR', 380, 600);
  const fa0  = _block(COMPONENT_TYPES.FULL_ADDER, 580, 480);
  const fa1  = _block(COMPONENT_TYPES.FULL_ADDER, 580, 600);
  const mux0 = _block(COMPONENT_TYPES.MUX, 880, 320, { inputCount: 4, label: 'MUX0' });
  const mux1 = _block(COMPONENT_TYPES.MUX, 880, 540, { inputCount: 4, label: 'MUX1' });
  const Y0   = _output(1100, 320, 'Y0');
  const Y1   = _output(1100, 540, 'Y1');
  return {
    nodes: [A0, A1, B0, B1, OP0, OP1, and0, and1, or0, or1, xor0, xor1, fa0, fa1, mux0, mux1, Y0, Y1],
    wires: [
      _wire(A0.id, and0.id, 0),
      _wire(B0.id, and0.id, 1),
      _wire(A1.id, and1.id, 0),
      _wire(B1.id, and1.id, 1),
      _wire(A0.id, or0.id,  0),
      _wire(B0.id, or0.id,  1),
      _wire(A1.id, or1.id,  0),
      _wire(B1.id, or1.id,  1),
      _wire(B0.id,  xor0.id, 0),
      _wire(OP0.id, xor0.id, 1),
      _wire(B1.id,  xor1.id, 0),
      _wire(OP0.id, xor1.id, 1),
      _wire(A0.id,   fa0.id, 0),
      _wire(xor0.id, fa0.id, 1),
      _wire(OP0.id,  fa0.id, 2),
      _wire(A1.id,   fa1.id, 0),
      _wire(xor1.id, fa1.id, 1),
      _wire(fa0.id,  fa1.id, 2, 1),
      // MUX0 — bit 0 selection. D0=ADD, D1=SUB (same wire, adder is dual-mode).
      _wire(fa0.id,  mux0.id, 0, 0),
      _wire(fa0.id,  mux0.id, 1, 0),
      _wire(and0.id, mux0.id, 2),
      _wire(or0.id,  mux0.id, 3),
      _wire(OP0.id,  mux0.id, 4),
      _wire(OP1.id,  mux0.id, 5),
      _wire(mux0.id, Y0.id,   0),
      // MUX1 — bit 1 selection.
      _wire(fa1.id,  mux1.id, 0, 0),
      _wire(fa1.id,  mux1.id, 1, 0),
      _wire(and1.id, mux1.id, 2),
      _wire(or1.id,  mux1.id, 3),
      _wire(OP0.id,  mux1.id, 4),
      _wire(OP1.id,  mux1.id, 5),
      _wire(mux1.id, Y1.id,   0),
    ],
  };
}

// Step 5: X-ray view. Builds on alu-s3 (which still has the 6
// diagnostic LEDs) and adds OP1 + the two MUXes + Y0/Y1 — without
// removing the diagnostic outputs. The learner sees all 4 sub-results
// (AND, OR, ADD/SUB) lighting up on every cycle while Y follows the
// selected one. The visual punchline of the whole lesson.
function _alus5() {
  // Inputs and the entire alu-s3 datapath
  const A0  = _input(120, 140, 'A0');
  const A1  = _input(120, 220, 'A1');
  const B0  = _input(120, 300, 'B0');
  const B1  = _input(120, 380, 'B1');
  const OP0 = _input(120, 540, 'OP0');
  const OP1 = _input(120, 620, 'OP1');
  const and0 = _gate('AND', 380, 140);
  const and1 = _gate('AND', 380, 220);
  const or0  = _gate('OR',  380, 300);
  const or1  = _gate('OR',  380, 380);
  const and0o = _output(560, 140, 'AND0_OUT');
  const and1o = _output(560, 220, 'AND1_OUT');
  const or0o  = _output(560, 300, 'OR0_OUT');
  const or1o  = _output(560, 380, 'OR1_OUT');
  const xor0  = _gate('XOR', 380, 480);
  const xor1  = _gate('XOR', 380, 600);
  const fa0   = _block(COMPONENT_TYPES.FULL_ADDER, 580, 480);
  const fa1   = _block(COMPONENT_TYPES.FULL_ADDER, 580, 600);
  const sum0o = _output(780, 480, 'SUM0_OUT');
  const sum1o = _output(780, 600, 'SUM1_OUT');
  // New in step 5 — MUXes + Y outputs sitting to the right of the
  // diagnostic column so both are visible side-by-side.
  const mux0 = _block(COMPONENT_TYPES.MUX, 940, 320, { inputCount: 4, label: 'MUX0' });
  const mux1 = _block(COMPONENT_TYPES.MUX, 940, 540, { inputCount: 4, label: 'MUX1' });
  const Y0   = _output(1140, 320, 'Y0');
  const Y1   = _output(1140, 540, 'Y1');
  return {
    nodes: [A0, A1, B0, B1, OP0, OP1, and0, and1, or0, or1, and0o, and1o, or0o, or1o, xor0, xor1, fa0, fa1, sum0o, sum1o, mux0, mux1, Y0, Y1],
    wires: [
      _wire(A0.id, and0.id, 0),
      _wire(B0.id, and0.id, 1),
      _wire(A1.id, and1.id, 0),
      _wire(B1.id, and1.id, 1),
      _wire(A0.id, or0.id,  0),
      _wire(B0.id, or0.id,  1),
      _wire(A1.id, or1.id,  0),
      _wire(B1.id, or1.id,  1),
      _wire(and0.id, and0o.id, 0),
      _wire(and1.id, and1o.id, 0),
      _wire(or0.id,  or0o.id,  0),
      _wire(or1.id,  or1o.id,  0),
      _wire(B0.id,  xor0.id, 0),
      _wire(OP0.id, xor0.id, 1),
      _wire(B1.id,  xor1.id, 0),
      _wire(OP0.id, xor1.id, 1),
      _wire(A0.id,   fa0.id, 0),
      _wire(xor0.id, fa0.id, 1),
      _wire(OP0.id,  fa0.id, 2),
      _wire(A1.id,   fa1.id, 0),
      _wire(xor1.id, fa1.id, 1),
      _wire(fa0.id,  fa1.id, 2, 1),
      _wire(fa0.id,  sum0o.id, 0, 0),
      _wire(fa1.id,  sum1o.id, 0, 0),
      // The MUX layer — drinks from the same wires the diagnostic LEDs do.
      // Every sub-circuit fans out to BOTH its LED AND its MUX input.
      _wire(fa0.id,  mux0.id, 0, 0),    // D0 = ADD/SUB result, bit 0
      _wire(fa0.id,  mux0.id, 1, 0),    // D1 = ADD/SUB result, bit 0 (same wire)
      _wire(and0.id, mux0.id, 2),
      _wire(or0.id,  mux0.id, 3),
      _wire(OP0.id,  mux0.id, 4),
      _wire(OP1.id,  mux0.id, 5),
      _wire(mux0.id, Y0.id,   0),
      _wire(fa1.id,  mux1.id, 0, 0),
      _wire(fa1.id,  mux1.id, 1, 0),
      _wire(and1.id, mux1.id, 2),
      _wire(or1.id,  mux1.id, 3),
      _wire(OP0.id,  mux1.id, 4),
      _wire(OP1.id,  mux1.id, 5),
      _wire(mux1.id, Y1.id,   0),
    ],
  };
}

const REGISTRY = {
  'c01-pc:0':                _c01s1,
  'c02-rom:0':               _c02s1,
  'c03-ir-cu:0':             _c03s1,
  'c04-regfile:0':           _c04s1,
  'c05-alu:0':               _c05s1,
  'c06-ram:0':               _c06s1,
  'c07-jmp:0':               _c07s1,
  'c08-showcase:0':          _c08s1,
  // MUX 2:1
  'mux-s1:0':                _muxs1,
  'mux-s2:0':                _muxs2,
  'mux-s3:0':                _muxs3,
  'mux-s4:0':                _muxs4,
  // Traffic Light FSM
  'tl-s1:0':                 _tls1,
  'tl-s2:0':                 _tls2,
  'tl-s3:0':                 _tls3,
  'tl-s4:0':                 _tls4,
  // 2-bit ALU
  'alu-s1:0':                _alus1,
  'alu-s2:0':                _alus2,
  'alu-s3:0':                _alus3,
  'alu-s4:0':                _alus4,
  'alu-s5:0':                _alus5,
};

export function hasSolution(lessonId, stepIndex) {
  return !!REGISTRY[`${lessonId}:${stepIndex}`];
}

export function buildSolution(lessonId, stepIndex) {
  const fn = REGISTRY[`${lessonId}:${stepIndex}`];
  return fn ? _build(fn) : null;
}
