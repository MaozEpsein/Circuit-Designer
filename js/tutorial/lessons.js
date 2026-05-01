/**
 * lessons.js — Built-in lesson library.
 *
 * Each lesson belongs to a `track`. The catalog UI renders one tab per track.
 *
 * Tracks (id → label):
 *   basics          — Basics
 *   combinational   — Combinational
 *   sequential      — Sequential / Memory
 *   fsm-cpu         — FSM & CPU
 *
 * Validator types:
 *   { type: 'truthTable', expected: rows }   — exhaustive combinational check
 *   { type: 'hasComponent', kind, count }    — structural check
 *   { type: 'manual' }                       — learner self-verifies
 */

// Tabs are ordered by learning curve, smallest concept first:
//   1. MUX 2:1            — pure combinational, "selector picks one input"
//   2. Decoder 2-to-4     — the mirror of MUX: "address activates one output"
//   3. 2-bit ALU          — combinational + the "MUX picks one of N"
//                            mental model scaled up to 4 functional units
//   4. Traffic Light FSM  — first taste of sequential (D-FFs + state)
//   5. Build a CPU        — everything above, glued together
// Every tab uses the same staged-build pedagogy: one concept per step,
// each step preloads the previous solution via startsFrom, the build
// literally accumulates on the canvas.
export const TRACKS = [
  { id: 'mux-2to1',      label: 'MUX 2:1' },
  { id: 'decoder-2to4',  label: 'Decoder 2-to-4' },
  { id: 'alu-2bit',      label: '2-bit ALU' },
  { id: 'traffic-light', label: 'Traffic Light FSM' },
  { id: 'cpu-build',     label: 'Build a CPU' },
];

export const LESSONS = [
  // ─── Track: Build a CPU ─────────────────────────────────────
  // Each lesson layers one concept onto the last, ending in a working
  // mini-CPU that runs real assembly. Validators are manual — the goal
  // is interactive demos (signals changing, memory updating) rather than
  // exhaustive truth-tables.
  {
    id: 'c01-pc',
    track: 'cpu-build',
    title: '1 · The Program Counter — "Where am I?"',
    summary: 'Every CPU needs to remember which instruction is next. The PC (Program Counter) holds that address and ticks forward on every clock edge — the heartbeat of execution.',
    steps: [
      {
        instruction:
`Place a PC (Memory tab), set \`bitWidth=4\`.

Wire:
  • INPUT \`EN\`  → PC pin 2
  • INPUT \`RST\` → PC pin 3
  • CLOCK       → PC pin 4 (\`CLK\`)
  • PC          → OUTPUT \`COUNT\`

Try it:
  • STEP repeatedly → COUNT advances 0 → 1 → 2 → ... → 15 → 0 (wrap).
  • Toggle RST=1 for one cycle → COUNT snaps to 0.
  • Toggle EN=0 → counter freezes.`,
        hints: [
          'PC pin layout (per the simulation engine): JUMP_ADDR(0), JUMP(1), EN(2), CLR(3), CLK(4). Leave pins 0 and 1 disconnected for this lesson — we are not jumping yet.',
          'EN defaults to 1 if disconnected. Wiring an explicit INPUT to pin 2 lets you freeze the counter, which is a real-world feature (used to stall the CPU).',
          'Open the WAVEFORM panel and add COUNT and CLK to the picker — you will see COUNT step on every rising edge of CLK.',
          'Why this matters: in later lessons the PC will index a ROM full of instructions. Today we only watch it count, but this is literally the timekeeper of every CPU you have ever used.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'c02-rom',
    track: 'cpu-build',
    startsFrom: 'c01-pc',
    title: '2 · ROM as Instruction Memory — "The program lives somewhere"',
    summary: 'Programs live in memory. The PC indexes them. Hook the PC you built last lesson into a ROM, watch each address fetch a different instruction — this is the FETCH stage of fetch-decode-execute.',
    steps: [
      {
        instruction:
`STEP repeatedly and watch DATA cycle through 10 different instructions, ending at HALT (\`0xF000\`) at address 9.

To edit:
  • Right-click the ROM → opens the editor on the ASM tab.
  • Stay on ASM. Never paste ASM into the C tab — the C compiler will reject it.`,
        codeBlock: {
          language: 'asm',
          title: 'ROM program (already loaded by Show solution). 10 varied instructions exercising every major opcode class. Manual paste? ASM tab only — never C.',
          code:
`; A "tasting menu" of the ISA — every major opcode class shows up
; at least once so DATA cycles through visibly different patterns
; as the PC walks 0..9. None of it actually executes yet (no IR /
; CU / RF / ALU / RAM exist until lessons 3-6); we are only watching
; the FETCH stage deliver each instruction word.

LI    R1, 5         ; 0xD105  — immediate load
LI    R2, 3         ; 0xD203  — immediate load
ADD   R3, R1, R2    ; 0x0312  — R-type arithmetic
SUB   R4, R1, R2    ; 0x1412  — R-type arithmetic
AND   R5, R1, R2    ; 0x2512  — R-type logic
XOR   R6, R1, R2    ; 0x4612  — R-type logic
CMP   R1, R2        ; 0x7012  — sets flags, no register write
STORE R3, R0        ; 0x9030  — memory write (mem[R0] ← R3)
LOAD  R7, R0        ; 0x8700  — memory read  (R7 ← mem[R0])
HALT                ; 0xF000  — stop`,
        },
        hints: [
          'ROM pin layout: ADDR(0), RE(1), CLK(2). With async-read enabled, RE defaults to 1 and CLK is unused — ROM acts purely combinationally.',
          'PC is 4-bit → 16 addressable instructions. ROM addrBits=4 matches exactly. dataBits=16 because every CPU instruction in this design is 16 bits wide.',
          'Open the MEM panel to inspect ROM contents while you STEP. The ASM tab in the ROM editor (right-click ROM → opens editor) shows the same bytes as readable mnemonics.',
          'HALT lives at address 9 (the last opcode in the program). Addresses 10..15 are zero, which decodes as `ADD R0,R0,R0` — a harmless no-op (R0 is hard-wired to 0, so writes to it are dropped).',
          'Watch DATA closely: the high nibble (top 4 bits) is the OPCODE. You will see `D, D, 0, 1, 2, 4, 7, 9, 8, F` walk by — that is the CU\'s eye view of the program, before the CU even exists.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'c03-ir-cu',
    track: 'cpu-build',
    startsFrom: 'c02-rom',
    // When the lesson opens, c02's circuit is loaded as the foundation;
    // this patch then replaces the ROM contents (and the ASM editor source)
    // with the 13-instruction CU-exercise program so the learner doesn't
    // have to re-paste it. Keep in sync with the codeBlock below and with
    // the ROM contents of _c03s1 in solutions.js.
    startsFromROM: {
      memory: {
        0:  0xD105, 1:  0xD203, 2:  0x0312, 3:  0x1412,
        4:  0x2512, 5:  0x3612, 6:  0x4712, 7:  0x7012,
        8:  0x8800, 9:  0x9010, 10: 0xA000, 11: 0xE000,
        12: 0xF000,
      },
      asmSource:
`; Step 3 demo — exercise the CU.
; LOAD / STORE / JMP don't actually do anything yet (no RAM /
; no jump wiring); they're here so you can watch MM_WE, MM_RE,
; and JMP flip when the right opcode is decoded.

LI    R1, 5         ; OP=13 → RG_WE=1, IMM=5
LI    R2, 3         ; OP=13 → RG_WE=1, IMM=3
ADD   R3, R1, R2    ; OP=0  → ALU_OP=0, RG_WE=1
SUB   R4, R1, R2    ; OP=1  → ALU_OP=1, RG_WE=1
AND   R5, R1, R2    ; OP=2  → ALU_OP=2, RG_WE=1
OR    R6, R1, R2    ; OP=3  → ALU_OP=3, RG_WE=1
XOR   R7, R1, R2    ; OP=4  → ALU_OP=4, RG_WE=1
CMP   R1, R2        ; OP=7  → ALU runs, RG_WE=0
LOAD  R8, R0        ; OP=8  → MM_RE=1, RG_WE=1
STORE R1, R0        ; OP=9  → MM_WE=1, RG_WE=0
JMP   0             ; OP=10 → JMP=1
NOP                 ; OP=14 → all low
HALT                ; OP=15 → HALT=1`,
      sourceView: 'asm',
    },
    title: '3 · IR + CU — "The CPU starts reading the instruction"',
    summary: 'Carry forward PC + ROM from lesson 2. Add an IR (Instruction Register) that captures each fetched instruction and exposes its fields, and a CU (Control Unit) that decodes the OP field into control signals. Nothing changes state yet — no Register File, no ALU, no RAM. The ROM is loaded with a special demo program that exercises 13 different opcodes back-to-back, so you can watch every CU output flip as the right instruction arrives. Steps 4–7 will plug those control signals into real components.',
    steps: [
      {
        instruction:
`STEP through the 13-instruction demo. Watch the CU LEDs flip as each opcode arrives:

  ALU_OP, RG_WE, MM_WE, MM_RE, JMP, HALT, IMM

Open WAVEFORM to see all 7 signals over time.`,
        codeBlock: {
          language: 'asm',
          title: 'Step-3 demo program (already loaded). Each instruction lights a different combination of CU LEDs.',
          code:
`; Step 3 demo — exercise the CU.
; LOAD / STORE / JMP have no real effect yet (no RAM / no
; jump wiring); they're here so you can watch MM_WE, MM_RE,
; and JMP flip when the right opcode is decoded.

LI    R1, 5         ; OP=13 → RG_WE=1, IMM=5
LI    R2, 3         ; OP=13 → RG_WE=1, IMM=3
ADD   R3, R1, R2    ; OP=0  → ALU_OP=0, RG_WE=1
SUB   R4, R1, R2    ; OP=1  → ALU_OP=1, RG_WE=1
AND   R5, R1, R2    ; OP=2  → ALU_OP=2, RG_WE=1
OR    R6, R1, R2    ; OP=3  → ALU_OP=3, RG_WE=1
XOR   R7, R1, R2    ; OP=4  → ALU_OP=4, RG_WE=1
CMP   R1, R2        ; OP=7  → ALU runs, RG_WE=0
LOAD  R8, R0        ; OP=8  → MM_RE=1, RG_WE=1
STORE R1, R0        ; OP=9  → MM_WE=1, RG_WE=0
JMP   0             ; OP=10 → JMP=1
NOP                 ; OP=14 → all low
HALT                ; OP=15 → HALT=1`,
        },
        hints: [
          'IR pin layout: INSTR(0), LD(1), CLK(2). Outputs: OP(0), RD(1), RS1(2), RS2(3). LD is held high by a constant-1 input so the IR captures every rising edge — later lessons may gate it for stalls, but not yet.',
          'CU pin layout: inputs OP(0), Z(1), C(2). Outputs: ALU_OP(0), RG_WE(1), MM_WE(2), MM_RE(3), JMP(4), HALT(5), IMM(6). In this lesson only OP is connected on the input side; Z and C arrive in step 5 with the ALU.',
          'Why does the demo program include LOAD, STORE and JMP even though we have no RAM and no jump wiring? Because the CU does not know that. Decoding is purely combinational — the CU stares at OP and emits the canonical control pattern for that opcode regardless of what the rest of the chip can or can not do. The LEDs let you watch this in action, and they prove the decoder is correct *before* you trust it to drive real components in the next lessons.',
          'Notice CMP vs ADD: same ALU input, different RG_WE. The CU is encoding a real architectural rule — CMP exists only to set flags, not to write back. That asymmetry is exactly the kind of thing the CU exists to enforce.',
          'Why split this from the Register File? Because the IR + CU pair is the part of the CPU that "reads the instruction". Once you trust the LEDs — once each opcode produces the right control pattern — adding the Register File in the next lesson is just plugging those signals into real wires.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'c04-regfile',
    track: 'cpu-build',
    startsFrom: 'c03-ir-cu',
    // c03 was the LED-heavy CU teaching step. In c04 the focus shifts to the
    // Register File, so we strip the diagnostic LEDs whose signals are now
    // either consumed by a real component (RG_WE → RF.WE) or simply not
    // relevant to this lesson (ALU_OP / MM_WE / MM_RE / JMP / IMM / OP).
    startsFromCustomize: (data) => {
      const drop = new Set(['ALU_OP', 'MM_WE', 'MM_RE', 'JMP', 'IMM', 'OP']);
      const removedIds = new Set();
      data.nodes = data.nodes.filter(n => {
        if (n.type === 'OUTPUT' && drop.has(n.label)) { removedIds.add(n.id); return false; }
        return true;
      });
      data.wires = data.wires.filter(w => !removedIds.has(w.targetId) && !removedIds.has(w.sourceId));
    },
    // Replace the ROM contents with a Step-4 program: four LI's followed by
    // two CMP's. The LI's let the learner watch each register fill up in the
    // MEM panel; the CMP's exercise the RF-DP's two read ports (RG_WE stays
    // low for CMP, so nothing is written — the read ports light up alone).
    startsFromROM: {
      memory: {
        0: 0xE000,   // NOP   (warmup — PC=0 → 1)
        1: 0xE000,   // NOP   (warmup — PC=1 → 2)
        2: 0xD105,   // LI  R1, 5    ← first real instruction (writes R1 on STEP 3)
        3: 0xD203,   // LI  R2, 3
        4: 0xD309,   // LI  R3, 9
        5: 0xD401,   // LI  R4, 1
        6: 0x7012,   // CMP R1, R2   (RD1=5, RD2=3, no write)
        7: 0x7034,   // CMP R3, R4   (RD1=9, RD2=1, no write)
        8: 0xF000,   // HALT
      },
      asmSource:
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
HALT`,
      sourceView: 'asm',
    },
    title: '4 · Register File — "Instructions actually change something"',
    summary: 'First lesson where running the program actually changes CPU state. Carry forward everything from lesson 3 (PC, ROM, IR, CU, all 7 control LEDs). Add an RF-DP (Register File, dual-port — two simultaneous reads, one write). Now the CU\'s RG_WE drives RF.WE; the IR\'s RD / RS1 / RS2 fields drive the RF\'s three address ports; and the IR\'s RS2 field (which holds the immediate of an LI) doubles as RF.WR_DATA for now (step 5 will add a MUX so ALU results can also be written back). Each LI writes its immediate into the right register. Each CMP reads two registers (visible on the RD1 / RD2 LEDs) but writes nothing — RG_WE stays low for CMP.',
    steps: [
      {
        instruction:
`Open the MEM panel → RF tab.

STEP through the program:

  • The four LIs fill R1..R4 with 5, 3, 9, 1.
  • The two CMPs light RD1 / RD2 without writing — RG_WE stays low for CMP.`,
        codeBlock: {
          language: 'asm',
          title: 'Step-4 demo program (already loaded). Two leading NOPs warm up the PC; four LI\'s fill the registers; two CMP\'s exercise the read ports.',
          code:
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
HALT`,
        },
        hints: [
          'RF-DP pin layout: inputs RD1_ADDR(0), RD2_ADDR(1), WR_ADDR(2), WR_DATA(3), WE(4), CLK(5). Outputs: RD1(0), RD2(1). Two read ports + one write port — that is what "dual-port" means here. (Real CPUs use even more ports; two is enough for a single ALU operation per cycle.)',
          'CU.IMM (out 6) is a 1-bit "is this an immediate-using instruction?" SELECT signal — not the immediate value itself. The actual immediate is held in IR.RS2 (the lower 4 bits of the instruction). In step 5 the WB MUX uses CU.IMM as its selector to choose between IR.RS2 (immediate path) and ALU.Y (compute path).',
          'R0 protection: RF-DP enforces "writes to R0 are silently dropped" (mirrors real RISC architectures). You will see this from step 5 onwards once an ADD result accidentally targets R0.',
          'CMP is the perfect lesson-4 instruction. It exercises both read ports (for the future ALU\'s flag computation), but it writes nothing — RG_WE is held low by the CU. The LEDs prove the read ports work even though MEM stays put.',
          'The control LEDs from lesson 3 are still there, untouched. ALU_OP, MM_WE, MM_RE, JMP, IMM continue to flip according to opcode — they just have nowhere meaningful to go yet. Each next lesson will plug exactly one of them into a real wire.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'c05-alu',
    track: 'cpu-build',
    startsFrom: 'c04-regfile',
    // c04 left RD1/RD2 LEDs as diagnostics for the read ports. In c05 the
    // ALU consumes both — the LEDs are redundant. Strip them so the focus
    // stays on the ALU result and the WB MUX selection.
    startsFromCustomize: (data) => {
      const drop = new Set(['RD1', 'RD2']);
      const removedIds = new Set();
      data.nodes = data.nodes.filter(n => {
        if (n.type === 'OUTPUT' && drop.has(n.label)) { removedIds.add(n.id); return false; }
        return true;
      });
      data.wires = data.wires.filter(w => !removedIds.has(w.targetId) && !removedIds.has(w.sourceId));
    },
    // Step-5 program: NOP warmup + 2 LI's (immediate path) + 4 ALU ops
    // (ADD/SUB/AND/XOR — compute path) + HALT. The instructions are arranged
    // so the learner sees CU.IMM flip between 1 (LI) and 0 (ALU ops), and
    // the WB_MUX following it.
    startsFromROM: {
      memory: {
        0: 0xE000,   // NOP
        1: 0xE000,   // NOP
        2: 0xD105,   // LI  R1, 5    (CU.IMM=1, MUX→IR.RS2 path)
        3: 0xD203,   // LI  R2, 3
        4: 0x0312,   // ADD R3, R1, R2  → R3 = 8  (CU.IMM=0, MUX→ALU.Y)
        5: 0x1412,   // SUB R4, R1, R2  → R4 = 2
        6: 0x2512,   // AND R5, R1, R2  → R5 = 1
        7: 0x4612,   // XOR R6, R1, R2  → R6 = 6
        8: 0xF000,   // HALT
      },
      asmSource:
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
HALT`,
      sourceView: 'asm',
    },
    title: '5 · ALU + Write-Back MUX — "The CPU computes"',
    summary: 'Carry forward everything from lesson 4. Add an ALU (so RD1, RD2, and CU.ALU_OP turn into a real arithmetic result) and a BUS_MUX that selects what gets written back into the Register File. CU.IMM is now wired to the MUX selector — for LI the MUX picks the immediate field of the instruction, for ADD/SUB/etc. the MUX picks the ALU result. The temporary direct wire from c04 (IR.RS2 → RF.WR_DATA) is removed and replaced by the MUX output. With this single architectural change, the CPU goes from "remembers immediates" to "actually computes".',
    steps: [
      {
        instruction:
`STEP through the program. Watch CU.IMM and the WB MUX selection:

  • LI cycles            → CU.IMM=1, MUX picks IR.RS2 (immediate path).
  • ADD/SUB/AND/XOR cycles → CU.IMM=0, MUX picks ALU.Y (compute path).

End state in the RF:

  R3 = 8,  R4 = 2,  R5 = 1,  R6 = 6.`,
        codeBlock: {
          language: 'asm',
          title: 'Step-5 demo program (already loaded). LI exercises the IMM path; ADD/SUB/AND/XOR exercise the ALU path through the same MUX.',
          code:
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
HALT`,
        },
        hints: [
          'BUS_MUX pin layout: inputs D0(0), D1(1), ..., D(n-1), SEL (last). With the default inputCount=2: D0(0), D1(1), SEL(2). Output: Y (0). With SEL=0 the MUX passes D0; with SEL=1 it passes D1. We wire D0=ALU.Y and D1=IR.RS2, so CU.IMM=0 picks the ALU and CU.IMM=1 picks the immediate — exactly matching the meaning of the IMM signal.',
          'ALU pin layout: inputs A(0), B(1), OP(2). Outputs: R(0)=result, Z(1)=zero flag, C(2)=carry/borrow flag. ALU_OP comes from the CU and is multi-bit (encoded 0=ADD, 1=SUB, 2=AND, 3=OR, 4=XOR, 5=SHL, 6=SHR, 7=CMP).',
          'Why the MUX, not just an OR? Because OR mixes both signals all the time — junk in. A MUX is a clean selector: only one input "wins" per cycle, and CU.IMM decides which. This is the textbook "write-back stage" MUX of every RISC datapath.',
          'The Z and C wires from ALU back to CU look pointless this lesson — they are. We place them now because step 7 (BEQ/BNE — atomic compare-and-branch) reads them to decide whether to take a conditional jump. Free now, no rerouting later.',
          'CMP is the special case: it runs through the ALU like any compute instruction (and updates Z/C), but RG_WE stays low, so the MUX output is computed and ignored — nothing is written. This is exactly how a real RISC distinguishes "compute and store" from "compute and only update flags".',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'c06-ram',
    track: 'cpu-build',
    startsFrom: 'c05-alu',
    // c05 left ALU_R as the diagnostic for the compute path. In c06 the
    // MEM_MUX consumes ALU.Y visibly (selecting between ALU and RAM), so
    // the LED is redundant. Strip it.
    startsFromCustomize: (data) => {
      const drop = new Set(['ALU_R']);
      const removedIds = new Set();
      data.nodes = data.nodes.filter(n => {
        if (n.type === 'OUTPUT' && drop.has(n.label)) { removedIds.add(n.id); return false; }
        return true;
      });
      data.wires = data.wires.filter(w => !removedIds.has(w.targetId) && !removedIds.has(w.sourceId));
    },
    startsFromROM: {
      memory: {
        0:  0xE000,   // NOP
        1:  0xE000,   // NOP
        2:  0xD105,   // LI    R1, 5      (data #1)
        3:  0xD208,   // LI    R2, 8      (data #2)
        4:  0xD30F,   // LI    R3, 15     (data #3)
        5:  0xD401,   // LI    R4, 1      (addr #1)
        6:  0xD502,   // LI    R5, 2      (addr #2)
        7:  0xD603,   // LI    R6, 3      (addr #3)
        8:  0x9014,   // STORE R1, R4     → mem[1] ← 5
        9:  0x9025,   // STORE R2, R5     → mem[2] ← 8
        10: 0x9036,   // STORE R3, R6     → mem[3] ← 15
        11: 0x8704,   // LOAD  R7, R4     → R7 ← mem[1] = 5
        12: 0x8705,   // LOAD  R7, R5     → R7 ← mem[2] = 8
        13: 0x8706,   // LOAD  R7, R6     → R7 ← mem[3] = 15
        14: 0xF000,   // HALT
      },
      asmSource:
`; Step 6 demo — RAM (data memory).
; Two new control signals finally do something:
;   CU.MM_WE  → RAM.WE   (drives STORE)
;   CU.MM_RE  → RAM.RE   (drives LOAD; also picks the MEM_MUX path)
;
; Setup R1..R3 with 3 data values, R4..R6 with 3 addresses,
; then STORE all three into RAM and LOAD them back into R7.
; Watch R7 change between cycles 12, 13, 14 as different
; addresses are read.

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
HALT`,
      sourceView: 'asm',
    },
    title: '6 · RAM — "The CPU remembers things outside the registers"',
    summary: 'Carry forward the c05 datapath. Add a data RAM (the second memory in the CPU — separate from the instruction ROM that has been there since lesson 2) and a small MEM_MUX that selects what the WB_MUX\'s compute-path input sees: either the ALU result (for ADD/SUB/...) or the RAM output (for LOAD). The selector is CU.MM_RE. With this added, STORE finally moves data out of registers into RAM, and LOAD finally pulls data back in. The CPU now has both a working ALU and working data memory.',
    steps: [
      {
        instruction:
`Open the MEM panel and toggle between the RF and DMEM tabs.

STEP through the program:

  • STOREs fill RAM[1..3] with 5, 8, 15.
  • LOADs pull each value back into R7 (visible on the MEM_OUT LED).`,
        codeBlock: {
          language: 'asm',
          title: 'Step-6 demo program (already loaded). 3 STOREs to mem[1..3], then 3 LOADs reading them back into R7.',
          code:
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
HALT`,
        },
        hints: [
          'RAM pin layout: inputs ADDR(0), DATA(1), WE(2), RE(3), CLK(4). Output: data (0). Single-port — only one read or one write per cycle, decided by the WE/RE pair.',
          'ISA convention: LOAD/STORE both use IR.RS2 as the address register, and STORE uses IR.RS1 as the data register. So the wires from RF read ports already match what RAM needs — no extra address-arithmetic ALU is necessary in this teaching CPU. (Real ISAs typically add an offset via the ALU; that is omitted here for clarity.)',
          'Why two MUXes (MEM_MUX + WB_MUX)? Because the WB target value can come from three places — the ALU (compute), RAM (LOAD), or IR.RS2 (immediate / LI). One 3-input MUX with a 2-bit selector would also work; cascading two 2-input MUXes is functionally equivalent and easier to read because each MUX answers a single yes/no question (is it a load? is it an immediate?).',
          'CU.MM_RE pulls double duty here: it tells RAM "yes, do a read this cycle" AND tells MEM_MUX "pick the RAM output, not the ALU output". One signal, two consumers — that is how a real datapath stays small.',
          'STORE vs. LOAD asymmetry: STORE keeps RG_WE low (no register write — data flows from RF out to RAM in). LOAD keeps RG_WE high (RAM out flows back to RF in). The CU enforces both rules just from the opcode.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'c07-jmp',
    track: 'cpu-build',
    startsFrom: 'c06-ram',
    // c06 left no LEDs to drop (MEM_OUT is still relevant). c07 brings back
    // JMP LED (which was trimmed back in c04 because no jump path existed).
    // Now CU.JMP actually drives the PC — the LED is informative again.
    startsFromCustomize: () => { /* nothing to remove this step */ },
    startsFromROM: {
      memory: {
        0:  0xE000,   // NOP
        1:  0xE000,   // NOP
        2:  0xD104,   // LI    R1, 4   (countdown counter)
        3:  0xD201,   // LI    R2, 1   (decrement amount)
        4:  0x1112,   // SUB   R1, R1, R2  ← LOOP target.
        5:  0xB710,   // BEQ   R1, R0, 7  atomic: if R1==0 → HALT (addr 7)
        6:  0xA400,   // JMP   4          else loop back to SUB
        7:  0xF000,   // HALT
      },
      asmSource:
`; Step 7 demo — JMP / BEQ.
; A 4-iteration countdown loop:
;   R1 starts at 4; each iteration subtracts 1.
;   BEQ R1, R0, 7 is ATOMIC compare-and-branch: in one cycle the
;   ALU does CMP R1, R0 and the CU jumps to addr 7 if the result is
;   equal (i.e. R1 reached 0). No reliance on a stale flag from a
;   prior instruction — the comparison and the branch are one word.
;   JMP (unconditional) closes the loop back to the SUB.

NOP
NOP
LI  R1, 4
LI  R2, 1
SUB R1, R1, R2        ; LOOP:
BEQ R1, R0, 7         ; if R1==0, jump to HALT
JMP 4                 ; else loop back to SUB
HALT`,
      sourceView: 'asm',
    },
    title: '7 · JMP & Branch — "The CPU loops"',
    summary: 'Carry forward the entire c06 datapath. Add the two wires that close the PC feedback loop: IR.RD → PC.JUMP_ADDR (the jump target encoded in the instruction\'s RD field) and CU.JMP → PC.JMP. With these, JMP and BEQ/BNE actually move the PC sideways instead of letting it tick monotonically forward — and the CPU can loop, branch, and run real programs. The JMP LED returns since the signal now drives a real wire. BEQ/BNE are ATOMIC compare-and-branch: in one cycle the ALU compares Rs1 to Rs2 and the CU consumes the fresh Z flag to decide the jump — there is no two-instruction CMP-then-test sequence, and no risk of an intervening op clobbering the flag.',
    steps: [
      {
        instruction:
`STEP through the countdown. The loop body has three roles:

  • SUB R1, R1, R2       → decrements R1 by 1.
  • BEQ R1, R0, 7        → atomic compare-and-branch; falls through while R1≠0, fires when R1=0.
  • JMP 4                → closes the loop back to the SUB.

PC walk: visits 4 → 5 → 6 four times, then exits to HALT at 7.`,
        codeBlock: {
          language: 'asm',
          title: 'Step-7 demo program (already loaded). 4-iteration countdown using SUB + BEQ + JMP.',
          code:
`; Step 7 demo — JMP / BEQ.
; A 4-iteration countdown loop:
;   R1 starts at 4; each iteration subtracts 1.
;   BEQ atomically compares R1 to R0 (=0) and falls into HALT.

NOP
NOP
LI  R1, 4
LI  R2, 1
SUB R1, R1, R2
BEQ R1, R0, 7
JMP 4
HALT`,
        },
        hints: [
          'PC pin layout (rediscovered): JUMP_ADDR(0), JMP(1), EN(2), CLR(3), CLK(4). When JMP=1 on a rising edge, PC ← JUMP_ADDR; otherwise PC ← PC + 1. The PC has been ready for this since lesson 1; it just had no wires going to those pins until now.',
          'Why is the jump target in IR.RD? Because the assembler encodes JMP as op|target|0|0 — the target lands in the RD field. For BEQ/BNE the target stays in RD too, but RS1 and RS2 carry the registers being compared (BEQ Rs1, Rs2, target → [OP][target][Rs1][Rs2]). Same compact 16-bit word, more punch.',
          'How does BEQ/BNE work in one cycle? The CU activates the ALU in CMP mode (alu_op=7) AND raises the JMP signal at the same time. The simulator runs the ALU first, latches the fresh Z flag, then re-evaluates the CU using that flag — all within one rising edge — so the PC sees the correct branch decision when it commits.',
          'There is a subtle order-of-operations issue worth noticing: when JMP=1, the PC must skip the normal increment and load JUMP_ADDR instead. The simulator handles this in Phase 4 specifically so that the CU\'s JMP signal reaches the PC before the PC latches its next value.',
          'With this lesson the build track is functionally complete. The CPU now has: instruction fetch, decode, register file, ALU, data memory, immediate path, and conditional/unconditional branches. Every wire on the reference image has a counterpart in your circuit.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'c08-showcase',
    track: 'cpu-build',
    startsFrom: 'c07-jmp',
    // No hardware changes in this lesson — only a richer ROM program.
    startsFromCustomize: () => { /* nothing to remove */ },
    startsFromROM: {
      memory: {
        0:  0xE000,   // NOP
        1:  0xE000,   // NOP
        2:  0xD100,   // LI  R1, 0     ; F(n-2)
        3:  0xD201,   // LI  R2, 1     ; F(n-1)
        4:  0xD300,   // LI  R3, 0     ; RAM index
        5:  0xD401,   // LI  R4, 1     ; one
        6:  0xD505,   // LI  R5, 5     ; 5 iterations → F(2)..F(6)
        7:  0x0612,   // ADD R6, R1, R2 ; LOOP: R6 = F(next)
        8:  0x9063,   // STORE R6, R3   ;       mem[index] = F(next)
        9:  0x0334,   // ADD R3, R3, R4 ;       index++
        10: 0x3120,   // OR  R1, R2, R0 ;       R1 = R2  (R0 stays 0 → MOV)
        11: 0x3260,   // OR  R2, R6, R0 ;       R2 = R6
        12: 0x1554,   // SUB R5, R5, R4 ;       count--
        13: 0xBF50,   // BEQ R5, R0, 15 ;       atomic: if count==0 → HALT
        14: 0xA700,   // JMP 7          ;       else loop
        15: 0xF000,   // HALT
      },
      asmSource:
`; Step 8 — Fibonacci on your CPU.
; Computes F(2)..F(6) and stores them at RAM[0..4].
; Result: mem[0..4] = 1, 2, 3, 5, 8.
;
; State variables:
;   R1 = F(n-2)         R4 = 1 (constant)
;   R2 = F(n-1)         R5 = remaining iterations
;   R3 = RAM index      R6 = F(next) = R1 + R2
;
; "OR Rd, Rs, R0" is the trick this ISA uses for "MOV Rd, Rs"
; (since R0 is 0, OR with 0 just copies the other operand).
; "BEQ R5, R0, 15" is one-word atomic compare-and-branch — the ALU
; runs CMP R5,R0 and the CU jumps to 15 in the same cycle.

NOP
NOP
LI  R1, 0
LI  R2, 1
LI  R3, 0
LI  R4, 1
LI  R5, 5
ADD R6, R1, R2          ; LOOP: F(next) = F(n-2)+F(n-1)
STORE R6, R3            ;       mem[index] = F(next)
ADD R3, R3, R4          ;       index++
OR  R1, R2, R0          ;       R1 = R2
OR  R2, R6, R0          ;       R2 = R6
SUB R5, R5, R4          ;       count--
BEQ R5, R0, 15          ;       if done, halt
JMP 7                   ;       else loop
HALT`,
      sourceView: 'asm',
    },
    title: '8 · What the Machine Can Do — "Run real programs"',
    summary: 'No new hardware. The CPU built across lessons 1–7 is functionally complete, and this lesson proves it by running Fibonacci. The same circuit you wired up — every wire untouched — computes F(2) through F(6) and stores them in RAM. The whole point of this step is to feel the completeness: a real algorithm that any programmer would recognize, executing on the gates you connected.',
    steps: [
      {
        instruction:
`Open the MEM panel → DMEM tab.

STEP through the program. Over 5 loop iterations RAM[0..4] fills with the Fibonacci sequence:

  mem[0]=1,  mem[1]=2,  mem[2]=3,  mem[3]=5,  mem[4]=8

BEQ R5, R0 fires when the counter hits 0 → halts at PC=15.`,
        codeBlock: {
          language: 'asm',
          title: 'Fibonacci — computes F(2)..F(6) into RAM[0..4]. Final result: 1, 2, 3, 5, 8.',
          code:
`NOP
NOP
LI  R1, 0               ; F(n-2)
LI  R2, 1               ; F(n-1)
LI  R3, 0               ; index
LI  R4, 1               ; one
LI  R5, 5               ; iteration count
ADD R6, R1, R2          ; LOOP: F(next) = R1 + R2
STORE R6, R3            ;       mem[index] = F(next)
ADD R3, R3, R4          ;       index++
OR  R1, R2, R0          ;       R1 = R2  (MOV via OR with R0)
OR  R2, R6, R0          ;       R2 = R6
SUB R5, R5, R4          ;       count--
BEQ R5, R0, 15          ;       if count==0, halt
JMP 7                   ;       else loop
HALT`,
        },
        hints: [
          'Full ISA reference (every instruction this CPU now executes):\n\n  ARITHMETIC / LOGIC (writes Rd):\n    ADD  Rd, Rs1, Rs2    Rd = Rs1 + Rs2\n    SUB  Rd, Rs1, Rs2    Rd = Rs1 - Rs2\n    AND  Rd, Rs1, Rs2    Rd = Rs1 & Rs2\n    OR   Rd, Rs1, Rs2    Rd = Rs1 | Rs2\n    XOR  Rd, Rs1, Rs2    Rd = Rs1 ^ Rs2\n    SHL  Rd, Rs1, Rs2    Rd = Rs1 << Rs2\n    SHR  Rd, Rs1, Rs2    Rd = Rs1 >> Rs2\n\n  COMPARE (no register write — used internally by BEQ/BNE):\n    CMP  Rs1, Rs2        sets Z if equal, C if Rs1 > Rs2\n\n  IMMEDIATE LOAD:\n    LI   Rd, imm         Rd = imm  (imm is 8-bit; here 0..15 fits in RS2)\n    MOV  Rd, Rs          synonym for "OR Rd, Rs, R0" (R0 is always 0)\n\n  MEMORY:\n    LOAD  Rd, Raddr      Rd = RAM[Raddr]\n    STORE Rdata, Raddr   RAM[Raddr] = Rdata\n\n  CONTROL FLOW:\n    JMP  imm             unconditional: PC = imm\n    BEQ  Rs1, Rs2, imm   atomic: if Rs1 == Rs2 then PC = imm   (one cycle)\n    BNE  Rs1, Rs2, imm   atomic: if Rs1 != Rs2 then PC = imm   (one cycle)\n\n  HOUSEKEEPING:\n    NOP                  do nothing for one cycle\n    HALT                 stop execution\n\nFits on this CPU: array sum, key search in RAM, repeated-addition multiplication, parity, popcount, block copy, countdown / count-up loops, Fibonacci, bit manipulation — anything driven by equality tests.\n\nNeeds more hardware: function calls (no CALL/RET → no STACK), values >255 (8-bit data path), programs >16 instructions (4-bit PC), ordering tests `<` `>` (would need BLT/BGE — no opcode slot).',
          'Try a multiplier instead — 3 × 4 = 12, ending with R3 = 12. Right-click ROM → ASM tab → replace with:\n\nNOP\nNOP\nLI  R1, 4         ; multiplicand\nLI  R2, 3         ; counter\nLI  R3, 0         ; result\nLI  R4, 1         ; one\nADD R3, R3, R1    ; LOOP: result += multiplicand\nSUB R2, R2, R4    ;       counter--\nBEQ R2, R0, 10    ;       atomic: if counter==0 → END\nJMP 6             ;       else loop\nHALT              ; END',
          'Try a linear search — find the address of the first 1 in mem[0..3] (preload mem[2]=1, others=0; result lands in R3 = 2). Right-click ROM → ASM tab → replace with:\n\nNOP\nNOP\nLI  R3, 0         ; index\nLI  R4, 1         ; +1 step\nLI  R5, 1         ; key we are looking for\nLOAD R6, R3       ; LOOP: R6 = mem[index]\nBEQ R6, R5, 11    ;       atomic: if RAM[i]==key → FOUND\nADD R3, R3, R4    ;       index++\nJMP 5             ;       loop\nHALT              ; FOUND (PC=11)\n\n— this hint demonstrates BEQ between two registers (not just register-vs-zero), and shows the new atomic compare-and-branch saving a cycle versus the legacy CMP-then-JZ pattern.',
          'Why not GCD here? Euclid by subtraction needs to know which of R1, R2 is larger so it can subtract the smaller from the bigger — that requires testing the C flag (R1 > R2), which used to be JC. When we made BEQ/BNE atomic and reused opcode 12 for BNE, the C-flag branch went away. The teaching CPU is now equality-only by design; ordering tests would need a BLT/BGE opcode that we did not budget a slot for.',
          'The "OR Rd, Rs, R0" trick used in Fibonacci is a common idiom in small RISC ISAs that lack a dedicated MOV. R0 is hard-zero, OR with zero is identity, so the result is "copy Rs into Rd". Modern MIPS and RISC-V both use this exact convention — the assembler hides it behind a "MOV" pseudo-instruction.',
          'You have built a functioning RISC CPU from gates up. Every wire in the reference image now has a counterpart in your circuit, and every instruction in the ISA actually executes correctly through it. Sum, multiply, GCD, Fibonacci — all on the same datapath without changing a single wire. That is exactly what makes a CPU a CPU instead of a hard-wired calculator: the program in ROM, not the silicon, decides what it computes.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },

  // ─── Track: MUX 2:1 ──────────────────────────────────────────
  // Mirror the cpu-build pedagogy on a small, self-contained topic.
  // Each step is one new component / one new concept; each step
  // pre-loads the previous step's solution via startsFrom so the
  // build literally accumulates on the canvas.
  //
  // Goal: assemble OUT = (NOT SEL AND A) OR (SEL AND B) one piece
  // at a time. Each step has its own truth-table validator so the
  // learner gets immediate feedback before the next piece is added.
  {
    id: 'mux-s1',
    track: 'mux-2to1',
    title: '1 · Inverting SEL — "We need both polarities"',
    summary: 'A multiplexer picks one of two inputs based on a SEL bit. To do that we need both SEL and its inverse — the inverse is what enables the A-branch when SEL=0. Start by placing SEL through a NOT gate and watching its output flip.',
    steps: [
      {
        instruction:
`Place: INPUT \`SEL\`, NOT gate, OUTPUT \`NOT_SEL\`.

Wire: \`SEL → NOT → NOT_SEL\`.`,
        hints: [
          'Inputs alpha-sorted for the validator: SEL → NOT_SEL.',
          'A NOT gate has one input pin (0) and one output pin (0).',
          'No need for a clock yet — this is a pure combinational circuit. SEL is driven by hand; NOT_SEL updates instantly.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs: SEL → Outputs: NOT_SEL
          expected: [
            [0, 1],
            [1, 0],
          ],
        },
      },
    ],
  },
  {
    id: 'mux-s2',
    track: 'mux-2to1',
    startsFrom: 'mux-s1',
    title: '2 · The A-branch — "Open when SEL=0"',
    summary: 'Add the first half of the MUX: a single AND gate that lets A through only when NOT_SEL=1 (i.e. SEL=0). When SEL=1 the gate clamps to 0 — the A-branch is "closed". This is the core MUX trick: an AND used as a controllable switch.',
    steps: [
      {
        instruction:
`Add: INPUT \`A\`, AND gate, OUTPUT \`BRANCH_A\`.

Wire:
  • \`A → AND.in0\`
  • \`NOT_SEL → AND.in1\`
  • \`AND → BRANCH_A\``,
        hints: [
          'Pin order on AND (and most 2-input gates): in0 = top, in1 = bottom, out = right.',
          'Inputs alpha-sorted for the validator: A, SEL → BRANCH_A. (NOT_SEL is internal — the validator does not look at intermediate outputs.)',
          'Notice how A=1, SEL=1 still gives BRANCH_A=0 — even though A is high, the valve is closed because NOT_SEL is low.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: A, SEL → Outputs: BRANCH_A, NOT_SEL
          // Note: NOT_SEL is still on the canvas from step 1, so the
          // validator sees it as an output. Sort outputs alphabetically:
          // BRANCH_A, NOT_SEL.
          expected: [
            [0, 0,  0, 1],
            [0, 1,  0, 0],
            [1, 0,  1, 1],
            [1, 1,  0, 0],
          ],
        },
      },
    ],
  },
  {
    id: 'mux-s3',
    track: 'mux-2to1',
    startsFrom: 'mux-s2',
    title: '3 · The B-branch — "Open when SEL=1, mirror of A"',
    summary: 'Mirror the A-branch with SEL as the control instead of NOT_SEL. Now the two branches are perfectly complementary — at any moment exactly one is "open" and one is "closed", because SEL and NOT_SEL are bitwise opposites. This is the key insight that lets the next step combine them safely with OR.',
    steps: [
      {
        instruction:
`Add: INPUT \`B\`, AND gate, OUTPUT \`BRANCH_B\`.

Wire:
  • \`B → AND.in0\`
  • \`SEL → AND.in1\`
  • \`AND → BRANCH_B\``,
        hints: [
          'Symmetry check: this AND looks just like the A-branch from Step 2, but its second input is SEL (not NOT_SEL). One letter different, opposite behaviour.',
          'Watch BRANCH_A and BRANCH_B together. The pair (BRANCH_A, BRANCH_B) is one of (0,0), (1,0), or (0,1) — never (1,1). The (0,0) case means the selected input itself is 0; the (1,1) case is impossible.',
          'Inputs alpha-sorted: A, B, SEL → outputs alpha: BRANCH_A, BRANCH_B, NOT_SEL.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: A, B, SEL → Outputs alpha: BRANCH_A, BRANCH_B, NOT_SEL
          expected: [
            [0, 0, 0,   0, 0, 1],
            [0, 0, 1,   0, 0, 0],
            [0, 1, 0,   0, 0, 1],
            [0, 1, 1,   0, 1, 0],
            [1, 0, 0,   1, 0, 1],
            [1, 0, 1,   0, 0, 0],
            [1, 1, 0,   1, 0, 1],
            [1, 1, 1,   0, 1, 0],
          ],
        },
      },
    ],
  },
  {
    id: 'mux-s4',
    track: 'mux-2to1',
    startsFrom: 'mux-s3',
    title: '4 · Merge with OR — "It is now a MUX"',
    summary: 'The two branches are mutually exclusive (at most one is 1 at a time), so OR-ing them simply picks "the one that is on". That is the entire MUX — wire by wire, gate by gate.',
    // Pop-up shown when the learner finishes the last step. Recaps
    // what was built and where the same pattern appears elsewhere in
    // the system. Lessons without `completion` exit silently as before.
    completion: {
      title: '🎉 You built a 2:1 Multiplexer',
      body: `<p><strong>What you put together over the four steps:</strong></p>
<ul>
  <li><strong>Step 1 — NOT SEL.</strong> A single inverter that gives you the opposite of SEL. You needed it because the A-branch must be enabled exactly when SEL=0.</li>
  <li><strong>Step 2 — A-branch (A AND NOT_SEL).</strong> An AND gate used as a controllable valve: A passes through only while NOT_SEL is high.</li>
  <li><strong>Step 3 — B-branch (B AND SEL).</strong> The mirror image: B passes through only while SEL is high. The two branches are perfectly complementary — never both 1 at the same time.</li>
  <li><strong>Step 4 — OR merge.</strong> Because the branches are mutually exclusive, OR safely "picks whichever one is on". The whole 2:1 MUX is just <code>OUT = (A AND NOT SEL) OR (B AND SEL)</code>.</li>
</ul>
<p><strong>Why this matters beyond this lesson:</strong> the MUX you just built is the same primitive that:</p>
<ul>
  <li>sits inside an ALU to pick between ADD/SUB/AND/OR results,</li>
  <li>sits at the write-back stage to pick between RAM output, ALU output, and immediate values,</li>
  <li>sits at every forwarding path in a pipelined CPU (you saw 4:1 versions of it in the MIPS 5-stage demos),</li>
  <li>and is the foundation of <em>every</em> "selector" in digital logic — bus muxes, instruction decoders, address decoders, register-file read ports.</li>
</ul>
<p>Whenever the rest of the course says "a MUX picks one of N values", this is the gate-level reality.</p>`,
    },
    steps: [
      {
        instruction:
`Add: OR gate, OUTPUT \`OUT\`.

Wire:
  • \`BRANCH_A → OR.in0\`
  • \`BRANCH_B → OR.in1\`
  • \`OR → OUT\`

What happens the moment "Show solution" loads — this is where the "selector picks one of two values" feeling lands:

  • Pre-loaded values: A=1, B=0, SEL=0 (so the inputs are visibly different out of the gate).
  • SEL=0 → OUT immediately shows 1 (the MUX is picking A). Diagnostic LEDs: BRANCH_A=1 (its valve is open), BRANCH_B=0 (its valve is closed by SEL=0).
  • Toggle SEL=1 → OUT flips to 0 (now picking B). The diagnostic LEDs swap: BRANCH_A=0, BRANCH_B=0 (because B itself is 0).
  • Toggle B=1 with SEL=1 → OUT updates to 1 instantly (B changed and we're picking B). BRANCH_B lights to confirm.
  • Toggle A while SEL=1 → OUT does NOT move. A is "muted" — its valve is closed because NOT_SEL=0. That is the MUX guaranteeing that the unselected input cannot leak through.

──────────────────────────────────────────────────────
This circuit is the foundation of:
──────────────────────────────────────────────────────
  • ALU output select  — 4:1 MUX picks ADD/SUB/AND/OR per output
                          bit (you'll build this in 2-bit ALU step 4).
  • Write-back MUX     — picks between ALU result, RAM output, and
                          immediate for the register-file write port
                          (cpu-build step 5 wires this exact MUX).
  • Forwarding paths   — pipelined CPUs use 4:1 MUXes per ALU input
                          to pick the freshest source: RF read,
                          EX/MEM forward, or MEM/WB forward (MIPS
                          5-stage demos).
  • PC source select   — every cycle the PC picks between sequential
                          (PC+1) and a jump target (BEQ/BNE/JMP);
                          internally that decision is a MUX.
  • Decoder reverse    — N-to-1 MUX is functionally equivalent to a
                          decoder + N gating ANDs + OR. They are two
                          views of the same circuit (Decoder 2-to-4
                          builds the dual).
  • Conditional move   — many ISAs have a "MOV reg, src1, src2, cond"
                          instruction that synthesizes directly to
                          a MUX.
  • HDL ternary        — the \`? :\` operator in Verilog / SystemVerilog
                          synthesizes one-to-one to a MUX.
  • Bus arbitration    — multiple bus masters routed to a single
                          shared bus through a MUX selected by an
                          arbiter signal.
  • Crossbar switches  — an N×N grid of MUXes routing N inputs to N
                          outputs (used in network switches and
                          inside multi-core CPU caches).`,
        hints: [
          'OR\'s pin order matches AND: in0 top, in1 bottom, out right.',
          'You can now toggle SEL with A and B held at different values and watch OUT switch between them in real time. That is exactly what a MUX does in hardware — instant, no clock involved.',
          'Inputs alpha: A, B, SEL → outputs alpha: BRANCH_A, BRANCH_B, NOT_SEL, OUT. The OUT column is the canonical 2:1 MUX truth table.',
          'After this, if you want a clean MUX without the diagnostic LEDs, right-click each of BRANCH_A / BRANCH_B / NOT_SEL and delete — the circuit will continue to function because the LEDs were sinks, not part of the data path.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: A, B, SEL → Outputs alpha: BRANCH_A, BRANCH_B, NOT_SEL, OUT
          expected: [
            [0, 0, 0,   0, 0, 1, 0],
            [0, 0, 1,   0, 0, 0, 0],
            [0, 1, 0,   0, 0, 1, 0],
            [0, 1, 1,   0, 1, 0, 1],
            [1, 0, 0,   1, 0, 1, 1],
            [1, 0, 1,   0, 0, 0, 0],
            [1, 1, 0,   1, 0, 1, 1],
            [1, 1, 1,   0, 1, 0, 1],
          ],
        },
      },
    ],
  },

  // ─── Track: Decoder 2-to-4 ──────────────────────────────────
  // The mirror image of MUX 2:1. Where MUX picks one of N inputs by
  // selector, decoder activates one of N outputs by address. Same
  // staged-build pedagogy:
  //   1. Inverters (NOT_S0, NOT_S1) — both polarities of the address.
  //   2. Y0 — the first AND-as-pattern-matcher.
  //   3. Y1, Y2, Y3 — three more matchers, all in parallel.
  //   4. Address-decoded read — wire DATA0..DATA3 through gating ANDs
  //      and a final OR. We just built a 4-cell × 1-bit memory. This
  //      is the structure inside every RAM, ROM, and register file.
  {
    id: 'dec-s1',
    track: 'decoder-2to4',
    title: '1 · Inverters — "Both polarities of the address"',
    summary: 'A 2-bit address has two bits, S0 and S1. To activate exactly one of four outputs, every output AND will need either S0 or NOT(S0) on one input, and either S1 or NOT(S1) on the other. So the very first thing the decoder needs is the inverse of each address bit — same trick we used in MUX 2:1.',
    steps: [
      {
        instruction:
`Place: INPUTs \`S0\`, \`S1\`, 2 NOT gates, 2 OUTPUTs (\`NOT_S0\`, \`NOT_S1\`).

Wire:
  • \`S0 → NOT → NOT_S0\`
  • \`S1 → NOT → NOT_S1\``,
        hints: [
          'A NOT gate has one input pin (0) and one output pin (0).',
          'The address bus is 2 bits wide → 2^2 = 4 possible addresses (00, 01, 10, 11). Each address will activate exactly one of the four outputs we add in steps 2 and 3.',
          'Why both polarities? Because every "address detector" AND needs to test the bit value AND its opposite of the other bit — e.g. address 01 means "S1=0 AND S0=1", which needs NOT_S1 and S0 directly.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: S0, S1 → Outputs alpha: NOT_S0, NOT_S1
          expected: [
            [0, 0,  1, 1],
            [0, 1,  1, 0],
            [1, 0,  0, 1],
            [1, 1,  0, 0],
          ],
        },
      },
    ],
  },
  {
    id: 'dec-s2',
    track: 'decoder-2to4',
    startsFrom: 'dec-s1',
    title: '2 · Y0 — "AND as a pattern matcher"',
    summary: 'Wire the first AND that fires only on address 00. The pattern is \`NOT_S1 AND NOT_S0\` — both bits low. AND is acting here as a 2-bit matcher: it goes high only when its two inputs both match the pattern it is "watching for".',
    steps: [
      {
        instruction:
`Add: 1 AND gate, OUTPUT \`Y0\`.

Wire:
  • \`NOT_S1 → AND.in0\`
  • \`NOT_S0 → AND.in1\`
  • \`AND → Y0\`

Test: toggle S0/S1 through the four addresses. Y0 lights only on address 00.`,
        hints: [
          'AND as a "pattern matcher" is the core idea behind every decoder. Each output AND watches for one specific bit pattern on its inputs and only fires for that pattern.',
          'Y0 watches for "S1=0 AND S0=0" — the address-00 pattern. The remaining three outputs (Y1, Y2, Y3) will watch for the other three address patterns in step 3.',
          'Inputs alpha: S0, S1 → outputs alpha: NOT_S0, NOT_S1, Y0.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: S0, S1 → Outputs alpha: NOT_S0, NOT_S1, Y0
          expected: [
            [0, 0,  1, 1, 1],
            [0, 1,  1, 0, 0],
            [1, 0,  0, 1, 0],
            [1, 1,  0, 0, 0],
          ],
        },
      },
    ],
  },
  {
    id: 'dec-s3',
    track: 'decoder-2to4',
    startsFrom: 'dec-s2',
    title: '3 · Y1, Y2, Y3 — "Three more matchers in parallel"',
    summary: 'Mirror Y0 three more times, each one watching for a different address pattern. All four ANDs run in parallel on every cycle, but exactly one of them fires per address — the others stay 0. The decoder is complete.',
    steps: [
      {
        instruction:
`Add: 3 AND gates, 3 OUTPUTs (\`Y1\`, \`Y2\`, \`Y3\`).

Wire each AND for its address:
  • Y1 = \`NOT_S1 AND S0\`     (address 01)
  • Y2 = \`S1 AND NOT_S0\`     (address 10)
  • Y3 = \`S1 AND S0\`         (address 11)

Test: cycle through the four addresses 00 → 01 → 10 → 11. Exactly one Y lights per address.`,
        hints: [
          'The full address-to-output map: 00→Y0, 01→Y1, 10→Y2, 11→Y3. The output number is just the binary value of the address bits.',
          'All four ANDs run combinationally on every cycle. At any moment exactly one is 1 and the other three are 0 — they are mutually exclusive because the address can only be one value at a time.',
          'Open WAVEFORM and add Y0..Y3 plus S0, S1 to see the pattern: as the address counts up, the active Y line walks across.',
          'This is the canonical "1-hot" output: a vector of N bits where exactly one is high. 1-hot encoding is everywhere in hardware — it is the cleanest way to "select" one of N options without ambiguity.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: S0, S1 → Outputs alpha: NOT_S0, NOT_S1, Y0, Y1, Y2, Y3
          expected: [
            [0, 0,  1, 1,  1, 0, 0, 0],
            [0, 1,  1, 0,  0, 0, 1, 0],
            [1, 0,  0, 1,  0, 1, 0, 0],
            [1, 1,  0, 0,  0, 0, 0, 1],
          ],
        },
      },
    ],
  },
  {
    id: 'dec-s4',
    track: 'decoder-2to4',
    startsFrom: 'dec-s3',
    title: '4 · Address-Decoded Read — "We just built a 4-cell memory"',
    summary: 'Combine the 1-hot outputs with 4 data bits and an OR. Each Yn gates its matching DATAn through; only the selected gate passes data through; OR collapses the four into one output. Set the address — read DATA[address]. This is exactly how RAM, ROM, and register files work inside.',
    completion: {
      title: '🎉 You built a 2-to-4 Decoder (and a tiny memory)',
      body: `<p><strong>What you put together over the four steps:</strong></p>
<ul>
  <li><strong>Step 1 — Inverters.</strong> Both polarities of every address bit, so each output AND can test for the right pattern.</li>
  <li><strong>Step 2 — Y0 alone.</strong> A single AND used as a "pattern matcher" — fires only when both inputs match the address-00 pattern.</li>
  <li><strong>Step 3 — Y1, Y2, Y3 in parallel.</strong> Three more matchers, one per address. Together: a "1-hot" vector — exactly one wire high per cycle.</li>
  <li><strong>Step 4 — Memory cell.</strong> 4 data bits + 4 gating ANDs + 1 OR = "READ_OUT = DATA[address]". A 4-word × 1-bit RAM.</li>
</ul>
<p><strong>Why this matters beyond this lesson:</strong> the decoder you just built is the addressing circuit inside <em>every</em> memory and selector in <em>every</em> CPU. Specifically, this exact pattern (decoder + per-cell ANDs + OR) appears in:</p>
<ul>
  <li><strong>RAM</strong> — N-bit address decodes to one of 2^N rows, the selected row is read or written.</li>
  <li><strong>ROM</strong> — same as RAM but the cells are fixed at fab time. The ROM you used in cpu-build (PC indexes 16 instructions) has a 4-to-16 decoder doing exactly this job.</li>
  <li><strong>Register File</strong> — 3-bit register address decodes to one of 8 register slots; the selected register's bits flow out through ANDs and ORs to the read port. The dual-port RF you wired in cpu-build step 4 is two of these decoders running in parallel.</li>
  <li><strong>Instruction Decoder</strong> — the OP field of an instruction is decoded into 1-hot control signals that activate the right control wires (RG_WE, MM_WE, ALU_OP, etc.). The CU you wired in cpu-build step 3 is built around exactly this.</li>
  <li><strong>MUX</strong> — an N-to-1 MUX is a decoder + N gating ANDs + an OR. The 4:1 MUXes in the 2-bit ALU are functionally equivalent to this lesson's step 4. Decoder and MUX are not separate circuits — they are the same circuit seen from opposite directions.</li>
  <li><strong>Address bus on every chip</strong> — DRAM banks, peripheral selects on a microcontroller bus, cache-line lookup, network packet routing tables. Anywhere you see "address picks one of many", a decoder is doing the work.</li>
</ul>
<p>One small lesson, the mechanism behind every memory and every selector in every digital system.</p>`,
    },
    steps: [
      {
        instruction:
`Add: 4 INPUTs (\`DATA0\`, \`DATA1\`, \`DATA2\`, \`DATA3\`), 4 AND gates, 1 OR gate, OUTPUT \`READ_OUT\`.

Wire each Yn to gate its matching DATAn (each AND has 2 inputs):
  • \`Y0 AND DATA0\`
  • \`Y1 AND DATA1\`
  • \`Y2 AND DATA2\`
  • \`Y3 AND DATA3\`

OR all four gating outputs together → \`READ_OUT\`.

What happens the moment "Show solution" loads — this is where the memory metaphor clicks:

  • DATA = [1, 0, 1, 1] is pre-loaded into the 4 INPUTs (\`fixedValue\` defaults). Those four bits ARE the four memory cells.
  • Address starts at 00 → READ_OUT immediately shows 1 (the contents of cell 0).
  • Toggle S0 / S1 to walk the address 00 → 01 → 10 → 11. READ_OUT follows: 1, 0, 1, 1 — the cell contents, in order.
  • Toggle any DATA bit while an address holds it → READ_OUT updates instantly. That is "write to a cell" + "read it back" happening in one circuit. Exactly how RAM behaves.

──────────────────────────────────────────────────────
This circuit is the foundation of:
──────────────────────────────────────────────────────
  • RAM             — address decodes to a row; selected row is read.
  • ROM             — same as RAM, cells fixed at fab time.
                     The ROM in cpu-build (PC → 16 instructions)
                     has a 4-to-16 decoder doing exactly this.
  • Register File   — register address decodes to one of N slots.
                     The dual-port RF in cpu-build step 4 is two
                     of these decoders running in parallel.
  • Instruction CU  — opcode decodes to 1-hot control signals.
                     The CU in cpu-build step 3 is this pattern.
  • MUX (N-to-1)    — decoder + N gating ANDs + OR. The 4:1 MUXes
                     in the 2-bit ALU are functionally identical
                     to what you just built.
  • Address bus     — DRAM banks, microcontroller peripheral selects,
                     cache-line lookup, packet routing tables —
                     anywhere "address picks one of many".`,
        hints: [
          'The pattern is universal: decoder turns a compact address into a 1-hot vector; gating ANDs let exactly one path through; OR collapses the (mostly-zero) gated values into one output.',
          'Truth table is large (64 rows: 6 inputs × 7 outputs) but the rule is simple: READ_OUT = DATA[(S1<<1) | S0]. The other six outputs (NOT_S0, NOT_S1, Y0..Y3) ignore DATA entirely.',
          'Notice that 3 of the 4 gating ANDs always output 0 — only the AND fed by the active Yn passes its DATA through. The OR is "safe" because the others are guaranteed to be 0 (one-hot).',
          'A real RAM cell is more than this — it adds a write port (WE-gated), latches per cell, and bidirectional bit lines. But the addressing structure is identical.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: DATA0, DATA1, DATA2, DATA3, S0, S1
          // Outputs alpha: NOT_S0, NOT_S1, READ_OUT, Y0, Y1, Y2, Y3
          expected: (() => {
            const rows = [];
            for (let combo = 0; combo < 64; combo++) {
              const D0 = (combo >> 5) & 1;
              const D1 = (combo >> 4) & 1;
              const D2 = (combo >> 3) & 1;
              const D3 = (combo >> 2) & 1;
              const S0 = (combo >> 1) & 1;
              const S1 =  combo       & 1;
              const addr = (S1 << 1) | S0;
              const READ_OUT = [D0, D1, D2, D3][addr];
              const Y0 = (S1 === 0 && S0 === 0) ? 1 : 0;
              const Y1 = (S1 === 0 && S0 === 1) ? 1 : 0;
              const Y2 = (S1 === 1 && S0 === 0) ? 1 : 0;
              const Y3 = (S1 === 1 && S0 === 1) ? 1 : 0;
              rows.push([D0, D1, D2, D3, S0, S1,  S0 ? 0 : 1, S1 ? 0 : 1, READ_OUT, Y0, Y1, Y2, Y3]);
            }
            return rows;
          })(),
        },
      },
    ],
  },

  // ─── Track: Traffic Light FSM ───────────────────────────────
  // Same staged-build pedagogy as MUX 2:1. The classic 3-state FSM
  // (RED → GREEN → YELLOW → RED) gets layered into:
  //   1. State register (2 D-FFs)
  //   2. Output decoder (state code → which LED is on)
  //   3. Next-state logic (closes the loop, FSM cycles autonomously)
  //   4. RST (synchronous reset — deterministic startup)
  //
  // State encoding: 00=RED, 01=GREEN, 10=YELLOW, 11=unused.
  // Pedagogical insight in step 3: the AND gates that decode the
  // outputs (RED = NOT(S1) AND NOT(S0); GREEN = NOT(S1) AND S0)
  // are bit-for-bit the same boolean expressions as the next-state
  // equations (D0 = NOT(S1) AND NOT(S0); D1 = NOT(S1) AND S0).
  // Step 3 closes the loop with two wires only — no new gates.
  {
    id: 'tl-s1',
    track: 'traffic-light',
    title: '1 · State Register — "Memory holds the state"',
    summary: 'A finite state machine is just a register that remembers which state we are in, plus combinational logic that decides where to go next. Start with the memory: two D-FFs sharing a clock, manually driven by INPUT pins so you can prove they latch on the rising edge.',
    steps: [
      {
        instruction:
`Place: CLOCK, INPUTs \`D0_IN\` / \`D1_IN\`, 2 D-FFs (\`S0\`, \`S1\`), OUTPUTs \`S0_OUT\` / \`S1_OUT\`.

Wire the data path:
  • \`D0_IN → S0.D\`
  • \`D1_IN → S1.D\`

Wire the clock to both FFs:
  • CLOCK → \`S0.CLK\`
  • CLOCK → \`S1.CLK\`

Wire the LEDs:
  • \`S0 → S0_OUT\`
  • \`S1 → S1_OUT\``,
        hints: [
          'D-FF pin layout (FF_SLOT with ffType=D): inputs `D`(0), `CLK`(1). Outputs: `Q`(0), `Q_BAR`(1). The FF samples D only on the rising edge of CLK.',
          'Two FFs sharing one CLOCK is the canonical 2-bit state register. Both transitions happen on the same edge — no skew.',
          'Try toggling D0_IN while CLOCK is low. S0_OUT does not change. Then STEP (drives one full clock period). Now S0_OUT updates to whatever D0_IN was at the rising edge.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'tl-s2',
    track: 'traffic-light',
    startsFrom: 'tl-s1',
    title: '2 · Output Decoder — "State code to LED"',
    summary: 'Two state bits encode 4 possible states; we use only 3 of them. Decode each valid code into exactly one LED: 00 lights RED, 01 lights GREEN, 10 lights YELLOW. The illegal code 11 lights nothing — a clue that the FSM landed in an undefined state.',
    steps: [
      {
        instruction:
`Add: 2 NOT gates (\`NOT_S0\`, \`NOT_S1\`), 3 AND gates, 3 OUTPUTs (\`RED\`, \`GREEN\`, \`YELLOW\`).

Wire the inverters:
  • \`S0 → NOT_S0\`
  • \`S1 → NOT_S1\`

Wire each output AND:
  • RED    = \`NOT_S1 AND NOT_S0\`
  • GREEN  = \`NOT_S1 AND S0\`
  • YELLOW = \`S1 AND NOT_S0\`

Toggle D inputs and STEP — each valid state code (00, 01, 10) lights exactly one LED. State 11 lights none.`,
        hints: [
          'Toggle D0_IN/D1_IN to walk through the four state codes (00, 01, 10, 11) and STEP. Each valid code lights exactly one LED. Code 11 lights none — that is the "unused" state.',
          'Why no LED for state 11? Because we only need 3 states and 2 bits give us 4. The 4th code is "spare" — left unhandled here, fixed by RST in step 4.',
          'Output equations are pure combinational from the FF outputs — no clock involved. The LED reflects the current state instantly.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'tl-s3',
    track: 'traffic-light',
    startsFrom: 'tl-s2',
    title: '3 · Next-state — "Close the loop, no new gates"',
    summary: 'The transition rule is 00→01→10→00. Working out the boolean equations: D0 (next S0) = NOT(S1) AND NOT(S0); D1 (next S1) = NOT(S1) AND S0. Look closely — those are exactly the same expressions as the RED and GREEN decoders you just built. So we don\'t add new gates; we just fan out the existing AND outputs back to the FF.D inputs. The FSM becomes autonomous.',
    steps: [
      {
        instruction:
`Delete: \`D0_IN\` and \`D1_IN\` (the manual drivers — and their wires).

Wire the next-state loop (no new gates needed — the decoder ANDs already compute the right equations):
  • \`RED_AND → S0.D\`     (D0 = NOT_S1 AND NOT_S0)
  • \`GREEN_AND → S1.D\`   (D1 = NOT_S1 AND S0)

Run AUTO CLK and watch the cycle in WAVEFORM:

  RED → GREEN → YELLOW → RED → ...`,
        hints: [
          'Why no new gates? RED = NOT(S1) AND NOT(S0). D0 (next S0) = NOT(S1) AND NOT(S0). Identical expression. The AND output already exists; we just route it to a second sink.',
          'Same for GREEN = NOT(S1) AND S0 = D1 (next S1). YELLOW has no next-state role — its output only drives the LED.',
          'Fan-out is a real hardware win: one gate, two consumers. Smaller chip, less power, faster.',
          'WAVEFORM panel: add S0, S1, RED, GREEN, YELLOW to the picker. You will see the 3-cycle pattern repeat: 00/RED → 01/GREEN → 10/YELLOW → back to 00.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'tl-s4',
    track: 'traffic-light',
    startsFrom: 'tl-s3',
    title: '4 · RST — "Deterministic startup"',
    summary: 'On power-on, the FFs hold whatever they happen to land on — possibly the unused state 11, where no LED lights and the FSM\'s next-state logic produces 00 the next cycle. To guarantee a known starting state, gate the D inputs with a synchronous RST signal: when RST=1, the FFs receive 0 instead of the next-state value, forcing the state to 00 (RED) on the next clock edge. Two extra AND gates and one NOT — and the FSM is production-ready.',
    completion: {
      title: '🎉 You built a Traffic Light FSM',
      body: `<p><strong>What you put together over the four steps:</strong></p>
<ul>
  <li><strong>Step 1 — State register.</strong> Two D-FFs sharing a clock. The 2-bit number they hold IS the FSM\'s state.</li>
  <li><strong>Step 2 — Output decoder.</strong> Three AND gates (plus two NOTs) that turn each valid state code into exactly one lit LED. State <code>11</code> lights nothing — the "spare" code.</li>
  <li><strong>Step 3 — Next-state logic.</strong> No new gates. The RED and GREEN AND outputs <em>are already</em> the boolean equations for the next-state bits. Two fan-out wires close the loop, and the FSM cycles autonomously on every clock edge.</li>
  <li><strong>Step 4 — Synchronous reset.</strong> Two AND gates (and one NOT) gate the D inputs with NOT(RST). On the next clock edge after RST=1, the FFs latch 0 — forcing the FSM to RED no matter what state it was in.</li>
</ul>
<p><strong>Why this matters beyond this lesson:</strong> the four layers you just built — <em>state register, output decode, next-state logic, reset</em> — are the canonical structure of <strong>every</strong> finite state machine. The same pattern shows up:</p>
<ul>
  <li>inside the <code>CU</code> (control unit) of any pipelined CPU,</li>
  <li>in protocol handlers (USB, PCIe, Ethernet — every one is an FSM with state + decode + next-state),</li>
  <li>in elevator controllers, vending machines, traffic systems, washing-machine timers,</li>
  <li>and in software too — every <code>switch (state)</code> loop is the same idea, just executed by a CPU instead of by gates.</li>
</ul>
<p>Whenever the rest of the course says "an FSM does X", this is the gate-level reality.</p>`,
    },
    steps: [
      {
        instruction:
`Add: INPUT \`RST\`, NOT gate (\`NOT_RST\`), 2 AND gates (\`AND_RST_0\`, \`AND_RST_1\`).

Wire the RST inverter:
  • \`RST → NOT_RST\`

Re-route bit 0 (delete the direct \`RED_AND → S0.D\` wire first):
  • \`RED_AND → AND_RST_0.in0\`
  • \`NOT_RST → AND_RST_0.in1\`
  • \`AND_RST_0 → S0.D\`

Re-route bit 1 (same pattern):
  • \`GREEN_AND → AND_RST_1.in0\`
  • \`NOT_RST  → AND_RST_1.in1\`
  • \`AND_RST_1 → S1.D\`

Test: pulse RST=1 → on the next clock edge, state forces to 00 (RED).
Release RST → cycle resumes from RED.`,
        hints: [
          'How does it work? When RST=0: NOT_RST=1, the AND gate passes the next-state value through unchanged. When RST=1: NOT_RST=0, both AND gates output 0, so D0=D1=0, so the next state is 00 = RED.',
          'This is a SYNCHRONOUS reset — it takes effect on the next clock edge, not instantly. That is the cleanest, most timing-safe form of reset and is how most modern silicon resets its registers.',
          'Asynchronous reset would force Q=0 immediately the moment RST goes high, regardless of the clock. Faster, but harder to get right (race conditions with the clock edge). The FF_SLOT in this simulator does not have a CLR pin, which is why we are using the synchronous form here.',
          'Without RST: if the FSM happens to power up in state 11 (the unused code), no LED lights and the FSM is silently broken until you happen to clock through it. With RST: every reboot starts at RED, guaranteed.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },

  // ─── Track: 2-bit ALU ───────────────────────────────────────
  // Same staged-build pedagogy. The 2-bit ALU layers into:
  //   1. Bitwise AND/OR (the trivial part — parallel gates)
  //   2. Adder chain (2 F-ADDs in carry sequence — pure ADD)
  //   3. Subtractor reuse (XOR + carry-in trick — same adder
  //      now does both ADD and SUB based on OP0)
  //   4. 4:1 MUX selection (OP1 chooses ADD/SUB vs AND/OR per bit)
  //   5. Free run + completion recap (no new components)
  //
  // OP encoding: 00=ADD, 01=SUB, 10=AND, 11=OR. The pedagogical
  // payoff lives in step 3 — discovering that ONE adder + two
  // XOR gates does both ADD and SUB. That trick is how every
  // real CPU's ALU avoids a dedicated subtractor.
  {
    id: 'alu-s1',
    track: 'alu-2bit',
    title: '1 · Bitwise AND / OR — "The easy half"',
    summary: 'An ALU is just four small computers crammed into one box, with a MUX picking the answer. Start with the easiest two: bitwise AND and bitwise OR. Each one is just parallel gates, one per bit slice. No carry, no order — pure combinational logic.',
    steps: [
      {
        instruction:
`Place: INPUTs \`A0\`, \`A1\`, \`B0\`, \`B1\`.

Add: 2 ANDs (one per bit slice), 2 ORs (one per bit slice).

Wire each gate to its matching A/B bit pair, then route to OUTPUTs:
  • \`A0, B0 → AND0 → AND0_OUT\`
  • \`A1, B1 → AND1 → AND1_OUT\`
  • \`A0, B0 → OR0  → OR0_OUT\`
  • \`A1, B1 → OR1  → OR1_OUT\``,
        hints: [
          'Bitwise = "do the gate per bit, no interaction between bit slices". Bit 0 sees A0 and B0; bit 1 sees A1 and B1. They never talk to each other.',
          'This is the fastest part of any ALU because there is no carry to propagate. All bit slices compute in parallel in one gate-delay.',
          'Inputs alpha-sorted for the validator: A0, A1, B0, B1. Outputs alpha: AND0_OUT, AND1_OUT, OR0_OUT, OR1_OUT.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: A0, A1, B0, B1 → Outputs alpha: AND0_OUT, AND1_OUT, OR0_OUT, OR1_OUT
          expected: (() => {
            const rows = [];
            for (let combo = 0; combo < 16; combo++) {
              const A0 = (combo >> 3) & 1;
              const A1 = (combo >> 2) & 1;
              const B0 = (combo >> 1) & 1;
              const B1 =  combo       & 1;
              rows.push([A0, A1, B0, B1, A0 & B0, A1 & B1, A0 | B0, A1 | B1]);
            }
            return rows;
          })(),
        },
      },
    ],
  },
  {
    id: 'alu-s2',
    track: 'alu-2bit',
    startsFrom: 'alu-s1',
    title: '2 · Adder Chain — "Carry rolls left"',
    summary: 'Add a 2-bit binary adder by chaining two F-ADD blocks. Bit 0\'s carry-out feeds bit 1\'s carry-in. The first stage\'s carry-in is left unwired — defaults to 0, so we get pure ADD. The result wraps mod 4 (any overflow leaves through the unused COUT of bit 1).',
    steps: [
      {
        instruction:
`Add: 2 F-ADD blocks (palette → BLOCKS) — \`FA0\` for bit 0, \`FA1\` for bit 1.

Wire the data inputs:
  • \`A0 → FA0.A\`, \`B0 → FA0.B\`
  • \`A1 → FA1.A\`, \`B1 → FA1.B\`

Wire the carry chain:
  • \`FA0.COUT → FA1.CIN\`
  • Leave \`FA0.CIN\` unwired (defaults to 0 → pure ADD).

Add OUTPUTs \`SUM0_OUT\`, \`SUM1_OUT\` from the FA SUM pins.`,
        hints: [
          'F-ADD pin layout: inputs `A`(0), `B`(1), `CIN`(2). Outputs: `SUM`(0), `COUT`(1). Three inputs, two outputs — a building block of every adder ever made.',
          'Why chain? Because addition is *sequential per bit* — you cannot compute bit 1\'s sum without knowing whether bit 0 produced a carry. The carry chain encodes that dependency directly in the wires.',
          'Mod-4 wrap: 3+3=6, but bits[1:0] hold only 2+3+3=6 → binary 110, but we keep only the bottom 2 bits (10=2). The unused FA1.COUT is where the high-order overflow goes.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: A0, A1, B0, B1 → Outputs alpha: AND0_OUT, AND1_OUT, OR0_OUT, OR1_OUT, SUM0_OUT, SUM1_OUT
          expected: (() => {
            const rows = [];
            for (let combo = 0; combo < 16; combo++) {
              const A0 = (combo >> 3) & 1;
              const A1 = (combo >> 2) & 1;
              const B0 = (combo >> 1) & 1;
              const B1 =  combo       & 1;
              const a = (A1 << 1) | A0;
              const b = (B1 << 1) | B0;
              const s = (a + b) & 3;
              rows.push([A0, A1, B0, B1, A0 & B0, A1 & B1, A0 | B0, A1 | B1, s & 1, (s >> 1) & 1]);
            }
            return rows;
          })(),
        },
      },
    ],
  },
  {
    id: 'alu-s3',
    track: 'alu-2bit',
    startsFrom: 'alu-s2',
    title: '3 · Subtractor Reuse — "ONE adder, BOTH operations"',
    summary: 'The adder you just built can subtract too — without changing a single F-ADD. The trick: add an OP0 control bit, XOR each B input with OP0, and feed OP0 itself as the carry-in. When OP0=0 nothing changes (XOR with 0 = identity, CIN=0 → ADD). When OP0=1 every B bit flips (XOR with 1 = NOT) and CIN=1 → A + NOT(B) + 1 = A − B in two\'s complement. ONE adder. Two operations. No new subtractor.',
    steps: [
      {
        instruction:
`Add: INPUT \`OP0\`, 2 XOR gates (\`XOR_B0\`, \`XOR_B1\`).

Wire the conditional inverter (B XOR OP0):
  • \`B0 → XOR_B0.in0\`, \`OP0 → XOR_B0.in1\`
  • \`B1 → XOR_B1.in0\`, \`OP0 → XOR_B1.in1\`

Re-route the FA \`B\` inputs (delete the direct \`B0 → FA0.B\` and \`B1 → FA1.B\` first):
  • \`XOR_B0 → FA0.B\`
  • \`XOR_B1 → FA1.B\`

Wire CIN: \`OP0 → FA0.CIN\` (replacing the unwired default).

Toggle OP0:
  • OP0=0 → adder runs A+B.
  • OP0=1 → adder runs A−B (two's complement).`,
        hints: [
          'Two\'s complement primer: −B (mod 4) equals NOT(B) + 1. So A − B = A + NOT(B) + 1. The +1 is exactly what CIN=1 contributes.',
          'XOR is the canonical "conditional inverter" — XOR with 0 passes through, XOR with 1 inverts. So `B XOR OP0` is "B normally, NOT(B) when OP0=1". One gate per bit, controlled by one signal.',
          'This trick is universal: every modern CPU\'s ALU does exactly this. There is no separate subtractor in any RISC processor — adder + XOR + control bit = both operations.',
          'Watch SUM in the truth table: when OP0=0, SUM = (A+B) mod 4. When OP0=1, SUM = (A−B) mod 4 (e.g. 3−1=2; 1−3=−2 mod 4 = 2 also).',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: A0, A1, B0, B1, OP0 → Outputs alpha: AND0_OUT, AND1_OUT, OR0_OUT, OR1_OUT, SUM0_OUT, SUM1_OUT
          expected: (() => {
            const rows = [];
            for (let combo = 0; combo < 32; combo++) {
              const A0  = (combo >> 4) & 1;
              const A1  = (combo >> 3) & 1;
              const B0  = (combo >> 2) & 1;
              const B1  = (combo >> 1) & 1;
              const OP0 =  combo       & 1;
              const a = (A1 << 1) | A0;
              const b = (B1 << 1) | B0;
              const s = OP0 === 0 ? ((a + b) & 3) : ((a - b) & 3);
              rows.push([A0, A1, B0, B1, OP0, A0 & B0, A1 & B1, A0 | B0, A1 | B1, s & 1, (s >> 1) & 1]);
            }
            return rows;
          })(),
        },
      },
    ],
  },
  {
    id: 'alu-s4',
    track: 'alu-2bit',
    startsFrom: 'alu-s3',
    title: '4 · 4:1 MUX — "Pick the right answer"',
    summary: 'Now four results travel in parallel through the ALU on every cycle: ADD, SUB, AND, OR. We pick the one we want with a 4:1 MUX per output bit, controlled by OP1:OP0. The diagnostic LEDs from steps 1–3 are removed — only the final Y0/Y1 stay, because that is what a real ALU exposes.',
    startsFromCustomize: (data) => {
      // Strip the diagnostic outputs from steps 1-3. The MUX and Y outputs
      // built in this step are the canonical ALU interface.
      const drop = new Set(['AND0_OUT', 'AND1_OUT', 'OR0_OUT', 'OR1_OUT', 'SUM0_OUT', 'SUM1_OUT']);
      const removedIds = new Set();
      data.nodes = data.nodes.filter(n => {
        if (n.type === 'OUTPUT' && drop.has(n.label)) { removedIds.add(n.id); return false; }
        return true;
      });
      data.wires = data.wires.filter(w => !removedIds.has(w.targetId) && !removedIds.has(w.sourceId));
    },
    steps: [
      {
        instruction:
`Add: INPUT \`OP1\`, 2 BUS_MUX blocks with \`inputCount=4\` (one per output bit).

For each MUX, wire the four data inputs:
  • D0 ← \`FA.SUM\`   (ADD result)
  • D1 ← \`FA.SUM\`   (SUB result — same wire; adder is already in subtract mode when OP0=1)
  • D2 ← \`AND.out\`
  • D3 ← \`OR.out\`

Wire the selectors (shared by both MUXes):
  • S0 ← \`OP0\`
  • S1 ← \`OP1\`

Wire MUX outputs to OUTPUTs:
  • \`MUX0 → Y0\`
  • \`MUX1 → Y1\``,
        hints: [
          'BUS_MUX with inputCount=4 pin layout: data inputs `D0`(0), `D1`(1), `D2`(2), `D3`(3); selectors `S0`(4) = LSB, `S1`(5) = MSB. Output `Y`(0). The selector pair (S1,S0) picks Dn where n = (S1<<1) | S0.',
          'OP encoding maps directly to the MUX selectors. OP=00 → MUX picks D0 (ADD path). OP=01 → D1 (SUB — but D1 is wired to the same FA.SUM as D0, because the adder is already in subtract mode when OP0=1). OP=10 → D2 (AND). OP=11 → D3 (OR).',
          'Why D0 and D1 share the same wire? Because the SAME adder produces ADD when OP0=0 and SUB when OP0=1. The MUX has two slots for "the adder result" — one selected when OP=00, the other when OP=01.',
          'Both MUXes get the same OP0 and OP1. They are doing the same selection, just for different bit slices.',
          'Inputs alpha-sorted: A0, A1, B0, B1, OP0, OP1 (6 inputs → 64 rows). Outputs: Y0, Y1.',
        ],
        validate: {
          type: 'truthTable',
          // Same 64-row table as l16-alu-2bit
          expected: (() => {
            const rows = [];
            for (let combo = 0; combo < 64; combo++) {
              const A0  = (combo >> 5) & 1;
              const A1  = (combo >> 4) & 1;
              const B0  = (combo >> 3) & 1;
              const B1  = (combo >> 2) & 1;
              const OP0 = (combo >> 1) & 1;
              const OP1 =  combo       & 1;
              const a  = (A1 << 1) | A0;
              const b  = (B1 << 1) | B0;
              const op = (OP1 << 1) | OP0;
              let r;
              if      (op === 0) r = (a + b) & 3;
              else if (op === 1) r = (a - b) & 3;
              else if (op === 2) r = (a & b) & 3;
              else               r = (a | b) & 3;
              rows.push([A0, A1, B0, B1, OP0, OP1, r & 1, (r >> 1) & 1]);
            }
            return rows;
          })(),
        },
      },
    ],
  },
  {
    id: 'alu-s5',
    track: 'alu-2bit',
    // Note: builds on alu-s3 (NOT s4). s3 still has the 6 diagnostic LEDs
    // — we want them visible alongside the MUX + Y outputs so the learner
    // can see all 4 ALU sub-results computing simultaneously while OP only
    // changes which one reaches Y. This is the "X-ray" view of a working
    // datapath.
    startsFrom: 'alu-s3',
    title: '5 · X-ray View — "All paths run, MUX picks"',
    summary: 'Step 4 gave you the clean ALU: 6 inputs, 2 outputs, hidden internals. This step puts back the 6 diagnostic LEDs from steps 1–3 ALONGSIDE the MUX / Y outputs from step 4. Now you can see every sub-result (AND, OR, SUM-as-ADD-or-SUB) lighting up in parallel on every cycle. The MUX is just a selector — change OP and Y switches between the same 4 results that were always there. This is how a real CPU\'s datapath actually works: every functional unit runs every cycle, the opcode just decides whose answer counts.',
    completion: {
      title: '🎉 You built a 2-bit ALU',
      body: `<p><strong>What you put together over the five steps:</strong></p>
<ul>
  <li><strong>Step 1 — Bitwise AND/OR.</strong> Parallel gates per bit slice — the trivial part of any ALU.</li>
  <li><strong>Step 2 — Adder chain.</strong> Two F-ADDs in carry sequence — bit 0\'s COUT feeds bit 1\'s CIN. Pure ADD with CIN=0.</li>
  <li><strong>Step 3 — Subtractor reuse.</strong> The same adder does SUB too: XOR each B with OP0, feed OP0 as CIN. When OP0=1 the adder computes <code>A + NOT(B) + 1 = A − B</code>. ONE adder, TWO operations.</li>
  <li><strong>Step 4 — 4:1 MUX.</strong> Two MUXes (one per output bit) pick which of ADD / SUB / AND / OR reaches Y, controlled by <code>OP1:OP0</code>.</li>
  <li><strong>Step 5 — X-ray view.</strong> All 6 internal LEDs back on the canvas. The big reveal: every sub-result is computed every cycle — the MUX only filters. Change OP and Y switches between answers that were already on the wires.</li>
</ul>
<p><strong>Why this matters beyond this lesson:</strong> the ALU you just built is a miniature of <em>every</em> ALU in <em>every</em> RISC CPU. Specifically:</p>
<ul>
  <li><strong>The adder-reuse trick</strong> in step 3 is universal: no modern CPU has a separate subtractor. The 8-bit ALU you wired into the cpu-build track uses the exact same trick — it has 8 F-ADDs and 8 XOR gates and one extra control bit, and that is the whole story.</li>
  <li><strong>The MUX-per-output-bit pattern</strong> in step 4 scales directly: a 32-bit ALU uses 32 MUXes, all sharing the same opcode selectors. The structure is identical, just wider.</li>
  <li><strong>The "all paths compute, MUX picks" mental model</strong> from step 5 is how every datapath in modern silicon works — and is also why CPUs are fast. They never decide "what to compute" before computing it; they compute everything in parallel and let the opcode filter the result. This is also the WB MUX you wired in cpu-build step 5 and the forwarding MUXes in the MIPS 5-stage demos.</li>
</ul>
<p>Whenever the rest of the course says "the ALU does X", this is the gate-level reality.</p>`,
    },
    steps: [
      {
        instruction:
`First set A=3 (A1=1, A0=1) and B=1 (B1=0, B0=1) and leave them there. Then run these four input changes in order, one at a time, and read all 8 LEDs after each:


(1) OP1=0, OP0=0  →  ADD.
    Expect Y=0  (3+1 = 4, wraps mod 4).


(2) OP0=1  →  SUB.
    Expect Y=2  (3-1 = 2). SUM_OUT also flips to 2.


(3) OP0=0, OP1=1  →  AND.
    Expect Y=1  (11 AND 01 = 01).


(4) OP0=1  →  OR.
    Expect Y=3  (11 OR  01 = 11).


The whole point: AND_OUT stays at 1 in all four cases. OR_OUT stays at 3 in all four cases. They never go dark — the gates run every cycle. Y is the only thing that "follows OP", and it just picks one of the values that were already lit on the wires.`,
        codeBlock: {
          language: 'demo',
          title: 'Expected readings — A=3, B=1, sweeping OP. Note how AND_OUT and OR_OUT never change.',
          code:
`OP         AND_OUT   OR_OUT   SUM_OUT    Y
──────────────────────────────────────────────────────────
00 (ADD)      1         3         0       0   ← MUX picks SUM (3+1 = 4 mod 4)
01 (SUB)      1         3         2       2   ← MUX picks SUM (3-1 = 2)
10 (AND)      1         3         0       1   ← MUX picks AND
11 (OR)       1         3         2       3   ← MUX picks OR`,
        },
        hints: [
          'OP encoding: 00=ADD, 01=SUB, 10=AND, 11=OR.',
          'A=3, B=1 case: AND_OUT shows 1 (3&1=01); OR_OUT shows 3 (3|1=11); SUM_OUT shows 0 when OP0=0 (3+1=4 mod 4) or 2 when OP0=1 (3-1=2). All three of those are visible at once. Y picks one.',
          'Try OP=01 (SUB): SUM_OUT actually changes — it\'s the same adder running A+NOT(B)+1 instead of A+B. AND_OUT and OR_OUT stay rock-steady because OP0 does not gate them.',
          'The big takeaway: hardware has no "if / else". It does ALL the work ALL the time and uses MUXes to decide which work was relevant. That is why pipelining works — every stage of every instruction runs every cycle.',
          'A and B each pack two bits: A1 is the high bit, A0 is the low bit. Same for B and Y. Y=2 lights Y1=1, Y0=0; Y=3 lights both.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
];

export function findLesson(id) {
  return LESSONS.find(l => l.id === id) || null;
}

export function lessonsByTrack(trackId) {
  return LESSONS.filter(l => l.track === trackId);
}
