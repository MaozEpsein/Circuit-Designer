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

export const TRACKS = [
  { id: 'basics',        label: 'Basics' },
  { id: 'combinational', label: 'Combinational' },
  { id: 'sequential',    label: 'Sequential' },
  { id: 'fsm-cpu',       label: 'FSM & CPU' },
  { id: 'cpu-build',     label: 'Build a CPU' },
];

export const LESSONS = [
  // ─── Track 1: Basics ─────────────────────────────────────────
  {
    id: 'l01-first-and',
    track: 'basics',
    title: '1 · Your First Gate: AND',
    summary: 'A gentle start — drop an AND gate, wire two inputs and an output, and verify the truth table.',
    steps: [
      {
        instruction: 'Drag an AND gate from the LOGIC palette tab onto the canvas.',
        validate: { type: 'hasComponent', kind: 'AND', count: 1 },
        hints: ['Top-right palette → LOGIC tab → "AND" chip. Drag it onto the canvas.'],
      },
      {
        instruction: 'Add two INPUT nodes and one OUTPUT (from the top toolbar), then wire them so the two inputs feed the AND gate and the gate feeds the output.',
        validate: {
          type: 'truthTable',
          expected: [[0,0,0],[0,1,0],[1,0,0],[1,1,1]],
        },
        hints: [
          'IN and OUT chips are in the top toolbar, next to WIRE.',
          'Pick the WIRE tool to connect. Click a pin to start a wire.',
          'If the truth table is wrong — make sure no wire is reversed and none is missing.',
        ],
      },
    ],
  },
  {
    id: 'l02-or-and-not',
    track: 'basics',
    title: '2 · OR and NOT',
    summary: 'Build an OR, then a NOT that inverts a signal.',
    steps: [
      {
        instruction: 'Build an OR gate with two inputs and one output.',
        hints: [
          'OR is in the LOGIC palette tab, next to AND.',
          'OR(A, B) = 1 whenever at least one input is 1.',
        ],
        validate: { type: 'truthTable', expected: [[0,0,0],[0,1,1],[1,0,1],[1,1,1]] },
      },
      {
        instruction: 'Clear the canvas (CLEAR ALL) and build a NOT — one input, one output.',
        hints: [
          'NOT has only one input pin.',
          'NOT inverts: 0 becomes 1, 1 becomes 0.',
        ],
        validate: { type: 'truthTable', expected: [[0,1],[1,0]] },
      },
    ],
  },
  {
    id: 'l03-nand-universal',
    track: 'basics',
    title: '3 · NAND is Universal',
    summary: 'Prove that NAND is universal: build NOT, then AND, using only NANDs.',
    steps: [
      {
        instruction: 'Build a NOT gate using only one NAND (wire both NAND inputs to the same signal).',
        hints: [
          'NAND with both inputs tied together behaves like NOT.',
          'You can split a wire: clicking on an existing wire creates a waypoint.',
        ],
        validate: { type: 'truthTable', expected: [[0,1],[1,0]] },
      },
      {
        instruction: 'Now: build an AND gate using only two NANDs (a NAND followed by a NAND-as-NOT).',
        hints: [
          'AND(A,B) = NOT(NAND(A,B)). Feed the first NAND output into both inputs of a second NAND.',
          'You will need: 2 INPUT, 2 NAND, 1 OUTPUT.',
        ],
        validate: { type: 'truthTable', expected: [[0,0,0],[0,1,0],[1,0,0],[1,1,1]] },
      },
      {
        instruction: 'Final piece of the universality proof: build an OR gate using only NANDs. With NOT, AND, and OR all expressible as NANDs, every Boolean function reduces to a NAND network.',
        hints: [
          'De Morgan: A OR B = NOT(NOT A AND NOT B) = NAND(NOT A, NOT B).',
          'Each NOT is itself a NAND with both inputs tied. Total: 3 NANDs (two NAND-as-NOT plus one combining NAND).',
          'Wiring: NAND1 = NOT A (both inputs from A). NAND2 = NOT B. NAND3 takes (NAND1_out, NAND2_out).',
        ],
        validate: { type: 'truthTable', expected: [[0,0,0],[0,1,1],[1,0,1],[1,1,1]] },
      },
    ],
  },
  {
    id: 'l04-xor-from-scratch',
    track: 'basics',
    title: '4 · XOR from Basic Gates',
    summary: 'Build XOR without using a built-in XOR gate.',
    steps: [
      {
        instruction: 'Build XOR using only AND, OR, NOT (no built-in XOR/XNOR). Two inputs, one output.',
        hints: [
          'XOR(A, B) = (A AND NOT B) OR (NOT A AND B).',
          'You will need 2 NOT, 2 AND, and 1 OR.',
        ],
        validate: { type: 'truthTable', expected: [[0,0,0],[0,1,1],[1,0,1],[1,1,0]] },
      },
    ],
  },
  {
    id: 'l05-half-adder',
    track: 'basics',
    title: '5 · Half Adder',
    summary: 'Your first arithmetic circuit: two bits in, sum and carry out.',
    steps: [
      {
        instruction: 'Build a Half Adder: inputs A, B, outputs SUM and CARRY. Use XOR and AND.',
        hints: [
          'SUM = A XOR B, CARRY = A AND B.',
          'Output order is alphabetical by label: name them SUM and CARRY (CARRY comes first).',
        ],
        validate: {
          type: 'truthTable',
          // Outputs alpha: CARRY then SUM
          expected: [[0,0,0,0],[0,1,0,1],[1,0,0,1],[1,1,1,0]],
        },
      },
    ],
  },

  // ─── Track 2: Combinational ──────────────────────────────────
  {
    id: 'l06-full-adder',
    track: 'combinational',
    title: '6 · Full Adder',
    summary: 'Add two bits with a carry-in. The building block of all multi-bit adders.',
    steps: [
      {
        instruction: 'Build a Full Adder: inputs A, B, CIN; outputs SUM and COUT.',
        hints: [
          'SUM = A XOR B XOR CIN.',
          'COUT = (A AND B) OR (CIN AND (A XOR B)).',
          'You will need 2 XOR, 2 AND, 1 OR. Outputs alphabetically: COUT then SUM.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: A, B, CIN. Outputs alpha: COUT, SUM.
          // [A, B, CIN, COUT, SUM]
          expected: [
            [0,0,0, 0,0],
            [0,0,1, 0,1],
            [0,1,0, 0,1],
            [0,1,1, 1,0],
            [1,0,0, 0,1],
            [1,0,1, 1,0],
            [1,1,0, 1,0],
            [1,1,1, 1,1],
          ],
        },
      },
    ],
  },
  {
    id: 'l07-mux-2to1',
    track: 'combinational',
    title: '7 · 2:1 Multiplexer from Gates',
    summary: 'A selector circuit: SEL chooses A or B. Built from AND, OR, NOT.',
    steps: [
      {
        instruction: 'Build a 2:1 MUX using only AND, OR, NOT. Inputs A, B, SEL → OUT. When SEL=0 the output is A; when SEL=1 the output is B.',
        hints: [
          'OUT = (NOT SEL AND A) OR (SEL AND B).',
          'You will need 1 NOT, 2 AND, 1 OR.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: A, B, SEL → OUT
          expected: [
            [0,0,0, 0],
            [0,0,1, 0],
            [0,1,0, 0],
            [0,1,1, 1],
            [1,0,0, 1],
            [1,0,1, 0],
            [1,1,0, 1],
            [1,1,1, 1],
          ],
        },
      },
    ],
  },
  {
    id: 'l08-decoder-2to4',
    track: 'combinational',
    title: '8 · 2-to-4 Decoder',
    summary: 'Two select bits drive exactly one of four outputs high. Foundation for memory addressing.',
    steps: [
      {
        instruction: 'Build a 2-to-4 decoder. Inputs S0, S1; outputs Y0, Y1, Y2, Y3. For input value n, exactly Yn is 1.',
        hints: [
          'Y0 = NOT S0 AND NOT S1. Y1 = S0 AND NOT S1.',
          'Y2 = NOT S0 AND S1. Y3 = S0 AND S1.',
          'You will need 2 NOT and 4 AND gates.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: S0, S1. Outputs alpha: Y0, Y1, Y2, Y3.
          expected: [
            [0,0, 1,0,0,0],
            [0,1, 0,0,1,0],
            [1,0, 0,1,0,0],
            [1,1, 0,0,0,1],
          ],
        },
      },
    ],
  },
  {
    id: 'l09-and4',
    track: 'combinational',
    title: '9 · 4-input AND',
    summary: 'Chain three AND gates so the output is 1 only when all four inputs are 1.',
    steps: [
      {
        instruction: 'Build a 4-input AND. Inputs A, B, C, D → OUT. OUT = 1 only when all four inputs are 1.',
        hints: [
          'AND is associative: (((A AND B) AND C) AND D).',
          'You will need 3 AND gates.',
        ],
        validate: {
          type: 'truthTable',
          // 16 rows; only the all-ones row is 1
          expected: (() => {
            const rows = [];
            for (let i = 0; i < 16; i++) {
              const a = (i>>3)&1, b = (i>>2)&1, c = (i>>1)&1, d = i&1;
              rows.push([a, b, c, d, (a&b&c&d) ? 1 : 0]);
            }
            return rows;
          })(),
        },
      },
    ],
  },
  {
    id: 'l10-majority',
    track: 'combinational',
    title: '10 · 3-input Majority (Voting)',
    summary: 'Three voters, majority wins. Output is 1 when at least two of A, B, C are 1 — the heart of fault-tolerant systems and triple-modular redundancy.',
    steps: [
      {
        instruction: 'Build a 3-input majority gate: inputs A, B, C; output M. M = 1 whenever at least two of the three inputs are 1.',
        hints: [
          'M = (A AND B) OR (A AND C) OR (B AND C).',
          'You will need 3 AND gates and 2 OR gates to combine the three pair-wise products.',
          'Sanity check: 011 → 1, 110 → 1, 100 → 0, 111 → 1.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: A, B, C → M
          expected: [
            [0,0,0, 0],
            [0,0,1, 0],
            [0,1,0, 0],
            [0,1,1, 1],
            [1,0,0, 0],
            [1,0,1, 1],
            [1,1,0, 1],
            [1,1,1, 1],
          ],
        },
      },
    ],
  },

  {
    id: 'l18-comparator-2bit',
    track: 'combinational',
    title: '11 · 2-bit Comparator',
    summary: 'Compare two 2-bit numbers and report A>B, A==B, A<B as three independent flags.',
    steps: [
      {
        instruction: 'Build a 2-bit magnitude comparator. Inputs A0, A1, B0, B1. Outputs EQ, GT, LT (exactly one is 1 for any input combination). EQ=1 when A==B, GT=1 when A>B, LT=1 when A<B.',
        hints: [
          'Bit-equality helpers: e0 = NOT(A0 XOR B0), e1 = NOT(A1 XOR B1). Then EQ = e0 AND e1.',
          'GT = (A1 AND NOT B1) OR (e1 AND A0 AND NOT B0). The high bit decides outright unless equal; only then does the low bit matter.',
          'LT = (B1 AND NOT A1) OR (e1 AND B0 AND NOT A0). Mirror of GT.',
          'Sanity: A=10, B=01 → GT. A=11, B=11 → EQ. A=01, B=10 → LT.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: A0,A1,B0,B1.  Outputs alpha: EQ, GT, LT.
          expected: (() => {
            const rows = [];
            for (let combo = 0; combo < 16; combo++) {
              const A0 = (combo >> 3) & 1;
              const A1 = (combo >> 2) & 1;
              const B0 = (combo >> 1) & 1;
              const B1 =  combo       & 1;
              const a = (A1 << 1) | A0;
              const b = (B1 << 1) | B0;
              rows.push([
                A0, A1, B0, B1,
                a === b ? 1 : 0,    // EQ
                a >   b ? 1 : 0,    // GT
                a <   b ? 1 : 0,    // LT
              ]);
            }
            return rows;
          })(),
        },
      },
    ],
  },
  {
    id: 'l19-ripple-adder-4bit',
    track: 'combinational',
    title: '12 · 4-bit Ripple Carry Adder',
    summary: 'Chain four Full Adders so the carry ripples from bit 0 up to bit 3 — the classic multi-bit adder, and the lesson that makes Full Adder pay off.',
    steps: [
      {
        instruction: 'Build a 4-bit ripple-carry adder. Inputs A0, A1, A2, A3, B0, B1, B2, B3, CIN (9 inputs). Outputs S0, S1, S2, S3, COUT (5 outputs). Use 4 F-ADD blocks; pass each block\'s COUT into the next block\'s CIN. The final block\'s COUT becomes the overall COUT.',
        hints: [
          'F-ADD block pin layout: A(0), B(1), CIN(2); outputs SUM(0), COUT(1).',
          'Bit 0: FA0.A=A0, FA0.B=B0, FA0.CIN=CIN. Bit n+1: FAn+1.CIN = FAn.COUT.',
          'Why "ripple"? The high-bit FA cannot finalize until the low-bit FA settles. In real hardware this limits clock speed and is why CLA (carry-look-ahead) was invented.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha: A0,A1,A2,A3, B0,B1,B2,B3, CIN  (9 → 512 rows)
          // Outputs alpha: COUT, S0, S1, S2, S3
          expected: (() => {
            const rows = [];
            for (let combo = 0; combo < 512; combo++) {
              const A0 = (combo >> 8) & 1;
              const A1 = (combo >> 7) & 1;
              const A2 = (combo >> 6) & 1;
              const A3 = (combo >> 5) & 1;
              const B0 = (combo >> 4) & 1;
              const B1 = (combo >> 3) & 1;
              const B2 = (combo >> 2) & 1;
              const B3 = (combo >> 1) & 1;
              const CIN =  combo       & 1;
              const a = (A3 << 3) | (A2 << 2) | (A1 << 1) | A0;
              const b = (B3 << 3) | (B2 << 2) | (B1 << 1) | B0;
              const sum = a + b + CIN;
              const COUT = (sum >> 4) & 1;
              const S0 = sum & 1;
              const S1 = (sum >> 1) & 1;
              const S2 = (sum >> 2) & 1;
              const S3 = (sum >> 3) & 1;
              rows.push([A0, A1, A2, A3, B0, B1, B2, B3, CIN, COUT, S0, S1, S2, S3]);
            }
            return rows;
          })(),
        },
      },
    ],
  },

  // ─── Track 3: Sequential / Memory ────────────────────────────
  // Sequential validators are manual: the learner verifies via WAVEFORM panel.
  {
    id: 'l11-sr-latch',
    track: 'sequential',
    title: '13 · SR Latch from NOR Gates',
    summary: 'The simplest 1-bit memory: cross-coupled NORs that hold a state.',
    steps: [
      {
        instruction: 'Build an SR Latch from two cross-coupled NOR gates. Inputs S (set), R (reset); outputs Q and Q_BAR. Verify with the WAVEFORM panel that pulsing S sets Q=1, pulsing R resets Q=0, and S=R=0 holds the state. When done, click Check to mark the lesson complete.',
        hints: [
          'Two NOR gates feeding each other: NOR1 takes (R, NOR2_out) → Q_BAR. NOR2 takes (S, NOR1_out) → Q.',
          'Open the WAVEFORM panel (top toolbar) to watch Q and Q_BAR over time.',
          'Avoid setting S=R=1 simultaneously — that is the forbidden state.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'l12-dff-toggle',
    track: 'sequential',
    title: '14 · D-FF Toggle Counter',
    summary: 'Wire a D flip-flop so it toggles on every clock edge — a 1-bit counter.',
    steps: [
      {
        instruction: 'Place a D-FF, a NOT gate, and a CLK. Wire Q_BAR back into D so Q toggles on every rising edge. Use STEP or AUTO CLK to verify the output flips 0→1→0→1. When done, click Check.',
        hints: [
          'The D-FF is in the LOGIC palette. Its output Q drives the NOT, and the NOT feeds D.',
          'Easier: many D-FF blocks expose Q_BAR directly — connect Q_BAR straight to D.',
          'Watch Q on the WAVEFORM panel — it should produce a square wave at half the clock frequency.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'l13-register-4bit',
    track: 'sequential',
    title: '15 · 4-bit Register from D-FFs',
    summary: 'A register is just N flip-flops sharing one clock. Build one from primitives instead of using the REG block.',
    steps: [
      {
        instruction: 'Build a 4-bit parallel register without using the REG block. Place 4 D-flip-flops side by side, give each its own data input (D0..D3) and Q output (Q0..Q3), and wire ONE shared CLOCK to all four CLK pins. On each rising edge, all four bits load simultaneously. Verify with WAVEFORM that Q[3:0] mirrors D[3:0] one cycle later.',
        hints: [
          'D-FF is in the LOGIC palette. You need 4 of them.',
          'Each D-FF has D (input 0) and CLK (input 1); outputs are Q (out 0) and Q_BAR (out 1).',
          'All four flip-flops MUST share the same CLOCK source — otherwise the bits will not load on the same edge.',
          'Educational point: this is exactly what the REG block does internally. The block just hides these 4 flip-flops behind a bus interface.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },

  {
    id: 'l20-edge-detector',
    track: 'sequential',
    title: '16 · Rising Edge Detector',
    summary: 'Detect the moment a signal goes 0→1. The output pulses high for exactly one clock cycle on every rising edge — a building block every FPGA designer uses constantly.',
    steps: [
      {
        instruction: 'Build a rising-edge detector. Inputs: SIG (the signal to watch). Output: PULSE (one clock cycle high on every rising edge of SIG). Architecture: chain two D-FFs (FF1 captures SIG, FF2 captures FF1.Q). Then PULSE = FF1.Q AND NOT FF2.Q. Verify by toggling SIG between steps and watching PULSE in WAVEFORM — you should see a one-cycle blip whenever SIG goes 0→1.',
        hints: [
          'Two-stage FF chain: FF1.D = SIG. FF2.D = FF1.Q. Both share the same CLOCK.',
          'Edge formula: PULSE = FF1.Q AND NOT(FF2.Q). After a rising edge, FF1 captures the new "1" first; FF2 still has the old "0" → AND gives 1. One cycle later FF2 catches up → AND becomes 0.',
          'This pattern doubles as a synchronizer: FF1.Q + FF2.Q give you a 2-FF synchronized version of an asynchronous SIG, used to safely cross clock domains.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },

  // ─── Track 4: FSM & CPU ──────────────────────────────────────
  {
    id: 'l15-traffic-light',
    track: 'fsm-cpu',
    title: '17 · Traffic Light FSM',
    summary: 'Three-state machine that cycles RED → GREEN → YELLOW → RED.',
    steps: [
      {
        instruction: 'Build a 3-state FSM. Use 2 D-FFs to encode the state (00=RED, 01=GREEN, 10=YELLOW), and combinational logic to compute the next state. Outputs RED, GREEN, YELLOW are decoded from the state bits. Verify the cycle in WAVEFORM.',
        hints: [
          'Next-state logic: (S1,S0)=00→01, 01→10, 10→00.',
          'Output decode: RED = NOT S1 AND NOT S0. GREEN = NOT S1 AND S0. YELLOW = S1 AND NOT S0.',
          'You can use the truth-table generator in the DEBUG panel to derive the next-state equations.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'l16-alu-2bit',
    track: 'fsm-cpu',
    title: '18 · 2-bit ALU',
    summary: 'A miniature ALU with ADD / SUB / AND / OR selected by 2 op bits — the heart of every CPU datapath, in miniature.',
    steps: [
      {
        instruction: 'Build a 2-bit ALU. Inputs A0, A1, B0, B1, OP0, OP1 (six inputs). Outputs Y0, Y1. OP=00 → A+B (mod 4). OP=01 → A-B (two\'s complement, mod 4). OP=10 → bitwise A AND B. OP=11 → bitwise A OR B. Use the F-ADD blocks for the adder, parallel AND/OR gates for the logical ops, and 4:1 MUXes (set inputCount=4) to select the output. Tip: a single adder can do both ADD and SUB by XOR-ing each B bit with OP0 and feeding OP0 as the carry-in.',
        hints: [
          'Use the F-ADD block (palette → BLOCKS). Pin order: A(0), B(1), CIN(2); outputs SUM(0), COUT(1).',
          'B-conditional invert: B_eff = B XOR OP0. CIN = OP0. With OP=00 the adder does A+B; with OP=01 it does A + NOT(B) + 1 = A - B. ADD and SUB share the same adder.',
          'For each output bit, a 4:1 MUX (inputCount=4) picks the correct result. Pins: D0..D3, then S0 (LSB), S1 (MSB). Wire ADD/SUB result to BOTH D0 and D1 (the adder already produces the right value depending on OP0).',
          'D0 = adder out, D1 = adder out, D2 = A AND B (bitwise), D3 = A OR B (bitwise). Repeat for both bit slices.',
        ],
        validate: {
          type: 'truthTable',
          // Inputs alpha-sorted: A0, A1, B0, B1, OP0, OP1 (6 inputs → 64 rows)
          // Outputs alpha-sorted: Y0, Y1
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
              if (op === 0)      r = (a + b) & 3;
              else if (op === 1) r = (a - b) & 3;
              else if (op === 2) r = (a & b) & 3;
              else               r = (a | b) & 3;
              const Y0 =  r       & 1;
              const Y1 = (r >> 1) & 1;
              rows.push([A0, A1, B0, B1, OP0, OP1, Y0, Y1]);
            }
            return rows;
          })(),
        },
      },
    ],
  },
  {
    id: 'l17-counter-en-rst',
    track: 'fsm-cpu',
    title: '19 · 2-bit Counter with Enable + Reset (from gates)',
    summary: 'Build a counter from D-flip-flops and combinational logic — no built-in CNT block. See exactly how EN and RST hook into the next-state equations.',
    steps: [
      {
        instruction: 'Build a 2-bit counter (states 00 → 01 → 10 → 11 → 00 …) using 2 D-FFs and combinational logic. Inputs: EN, RST. Outputs: Q0 (LSB), Q1 (MSB). Behaviour: when RST=1 the state forces to 00; when EN=1 the count increments on each rising edge; when EN=0 (and RST=0) the state holds. Verify with WAVEFORM.',
        hints: [
          'Next-state equations:\n  D0 = NOT RST AND (Q0 XOR EN)\n  D1 = NOT RST AND (Q1 XOR (EN AND Q0))\nThe XOR-with-EN trick says "toggle when EN=1, hold when EN=0".',
          'Carry-style logic for Q1: Q1 toggles only when Q0=1 AND EN=1 (that is when the lower bit is about to overflow on this edge).',
          'Component count: 2 D-FFs, 1 NOT (for NOT RST), 2 XOR, 3 AND, 1 CLOCK. All FFs share the clock.',
          'Why do this from gates? Because the CNT block hides exactly this logic. Building it once makes every counter design after this transparent to you.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },

  // ─── Track 5: Build a CPU ────────────────────────────────────
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
        instruction: 'Build a 4-bit Program Counter you can drive by hand. Place a PC block (Memory tab) and configure it for 4 bits. Wire an EN input (input pin 2), an RST input (input pin 3), and a CLOCK to its CLK pin (input 4). Wire the PC output to an OUTPUT named COUNT. Then explore: with EN=1, RST=0, press STEP repeatedly — COUNT advances 0 → 1 → 2 → ... → 15 → 0 (wrap). Toggle RST=1 for one cycle → COUNT snaps to 0. Set EN=0 → counter freezes. Watch the value live in WAVEFORM.',
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
    title: '2 · ROM as Instruction Memory — "The program lives somewhere"',
    summary: 'Programs live in memory. The PC indexes them. Hook the PC you built last lesson into a ROM, watch each address fetch a different instruction — this is the FETCH stage of fetch-decode-execute.',
    steps: [
      {
        instruction: 'Goal: extend the PC circuit so the PC indexes a ROM full of instructions, and watch each address fetch a different one. The fastest way: just click "Show solution" — it builds the entire circuit and pre-loads the ROM with the program shown below. Then press STEP repeatedly and watch DATA cycle through the instructions: 0xD105 → 0xD203 → 0x0312 → 0xF000 → 0x0000 (memory beyond address 3 is zero). To inspect or edit the program manually: right-click the loaded ROM. The editor will open directly on the ASM tab — that is where ASM code is parsed. If you switch to the C tab and paste ASM there, the C compiler will reject it (you will see "Unexpected character" errors). Stay on ASM. Manual circuit construction (without Show solution): place a ROM (Memory tab), open Properties, set addrBits=4, dataBits=16, asyncRead=true; wire PC → ROM input 0; add a DATA output reading from the ROM.',
        codeBlock: {
          language: 'asm',
          title: 'ROM program (already loaded by Show solution). Manual paste? ASM tab only — never C.',
          code:
`; Adds 5 + 3, stores the result in R3.
; This program rides with us through the rest of the CPU build track.

LI  R1, 5
LI  R2, 3
ADD R3, R1, R2
HALT`,
        },
        hints: [
          'ROM pin layout: ADDR(0), RE(1), CLK(2). With async-read enabled, RE defaults to 1 and CLK is unused — ROM acts purely combinationally.',
          'PC is 4-bit → 16 addressable instructions. ROM addrBits=4 matches exactly. dataBits=16 because every CPU instruction in this design is 16 bits wide.',
          'Open the MEM panel to inspect ROM contents while you STEP. The ASM tab in the ROM editor (right-click ROM → opens editor) shows the same bytes as readable mnemonics.',
          'Why HALT first sits at address 3? Because programs always end with a HALT, and the assembler places it at the next free address. From address 4 onward, the ROM is zero (encodes as ADD R0,R0,R0 — a no-op when R0 is forced to 0).',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'c03-regfile',
    track: 'cpu-build',
    title: '3 · ROM Picks the Register — "The instruction steers the writes"',
    summary: 'Carry forward PC + ROM. Add an IR (Instruction Register, pure bit-splitter) and a Register File. One critical wire — IR.RD → RF.WR_ADDR — means each instruction in ROM chooses which register the next write lands in. The data itself is still a manual IMM; lesson 4 plugs in the ALU so the data also comes from the instruction stream.',
    steps: [
      {
        instruction: 'Click "Show solution". Layout: top half is PC + ROM from lesson 2 (unchanged). Middle adds an IR fed by ROM, with four diagnostic outputs (OP, RD, RS1, RS2) so you watch the decoded fields live. Bottom half is a single-port Register File whose WR_ADDR is wired straight to IR.RD — the only new wire that matters. WR_DATA stays a manual IMM (default 0x77), and WE is a manual toggle. Demo: (1) Initial state — IR uninitialised so all field outputs read 0; RF all zero; WE=0. (2) STEP once with WE=0 — IR captures 0xD105; OP=13, RD=1, RS1=0, RS2=5; PC=1; nothing written (WE was 0). (3) Toggle WE=1, STEP — IR now holds 0xD203 (RD=2), and the rising edge writes R2 ← 0x77; PC=2. (4) STEP — IR=0x0312 (RD=3) → R3 ← 0x77; PC=3. (5) STEP — IR=0xF000 (HALT, RD=0) → R0 ← 0x77 (no R0 protection on single-port RF — see hint 4). (6) Open MEM panel: R0=0x77, R1=0, R2=0x77, R3=0x77. R1 missed because WE was 0 during its cycle. Try variations: double-click IMM_DATA to a new value, or double-click IMM_RD_ADDR to 2 to make Q read R2 instead of R1.',
        codeBlock: {
          language: 'asm',
          title: 'ROM contents (already loaded). Same spine program for the rest of the track.',
          code:
`; In this lesson only the RD field of each instruction matters —
; the data being written is a manual IMM constant (0x77).
; LI's actual immediate value is decoded properly in lesson 6.

LI  R1, 5
LI  R2, 3
ADD R3, R1, R2
HALT`,
        },
        hints: [
          'IR is a pure bit-splitter — no opcode interpretation, just splits the 16-bit instruction into four 4-bit fields. Out 0=OP, out 1=RD, out 2=RS1, out 3=RS2. LD pin is held high by an IMM(1) so it always captures on the rising edge.',
          'The single new wire that makes this lesson different from lesson 2: IR.RD (out 1) → RF.WR_ADDR (in 1). That is the whole point — the instruction stream selects the destination register, even though the value being written is still hand-set.',
          'WR_DATA is still a constant IMM. In lesson 4 it gets replaced by the ALU output (so ADD actually adds). In lesson 6 the LI immediate path arrives so LI R1, 5 truly loads 5 into R1.',
          'R0 is NOT protected on the single-port REG_FILE — if WE=1 during the HALT cycle, R0 receives the data. Lesson 4 upgrades to REG_FILE_DP with protectR0=true (mirroring real CPUs), at which point R0 stays 0 forever.',
        ],
        validate: { type: 'manual' },
      },
    ],
  },
  {
    id: 'c04-execute',
    track: 'cpu-build',
    title: '4 · ROM Drives the RegFile — "The CPU executes"',
    summary: 'First lesson where instructions actually do something. The ADD in ROM reaches the ALU, and a single STEP with WE=1 latches the result back into a register. Fetch → decode → execute, end to end — minus the Control Unit, which arrives in lesson 5.',
    steps: [
      {
        instruction: 'Click "Show solution". The PC + ROM from earlier lessons is now joined by an IR (Instruction Register), a REG_FILE_DP (dual-port — two reads at once for the ALU), and an ALU. Wiring: PC → ROM → IR; IR.RS1 → RF.RD1_ADDR; IR.RS2 → RF.RD2_ADDR; IR.RD → RF.WR_ADDR; RF.RD1 → ALU.A; RF.RD2 → ALU.B; ALU.Y → RF.WR_DATA. The IR is a pure bit-splitter — no decoding, just exposes the four fields. ALU_OP is hard-coded to 0 (ADD) via an IMM, and WE is a manual toggle — both will be replaced by a real Control Unit in lesson 5. RF starts pre-loaded: R0=0, R1=5, R2=3, R3=0. The ROM holds a single ADD then HALT (LI is skipped because the immediate path lands in lesson 6).\n\nDemo flow: (1) Initial state — IR is uninitialised so its outputs read 0; RF reads R0,R0 → ALU.Y = 0. (2) STEP once with WE=0 — IR captures 0x0312, the diagnostic outputs jump: OP=0, RD=3, RS1=1, RS2=2; A_IN=5, B_IN=3, ALU_Y=8. R3 is still 0 (WE=0). (3) Toggle WE=1, STEP again — on this rising edge, R3 ← 8. (4) Open MEM panel: R3 = 0x08. The CPU has just executed its first real instruction. (5) Toggle WE=0 to stop further writes (PC keeps advancing into HALT, harmless).',
        codeBlock: {
          language: 'asm',
          title: 'ROM program (already loaded). LI is skipped — R1 and R2 are pre-loaded into the RegFile via initialRegs.',
          code:
`; R1=5 and R2=3 are pre-loaded into the RegFile.
; The single meaningful instruction is the ADD; HALT stops the loop.

ADD R3, R1, R2
HALT`,
        },
        hints: [
          'IR is a pure bit-splitter. It does not interpret the opcode — it just splits the 16-bit instruction into four 4-bit fields and exposes each on its own output (out 0=OP, out 1=RD, out 2=RS1, out 3=RS2). LD is wired to a constant 1 IMM so it always loads on the rising edge.',
          'We use REG_FILE_DP (dual port), not REG_FILE, because the ALU needs both operands simultaneously. Single-port RF can only read one register per cycle — that would force a multi-cycle execute. Real CPUs use multi-port register files for exactly this reason.',
          'R1 and R2 are pre-loaded into the RegFile because LI (load-immediate) does not work yet — the path that copies the IMM field of the instruction into RF.WR_DATA arrives in lesson 6 with the write-back MUX. For now we cheat by initialising the registers directly.',
          'ALU_OP is hard-coded to 0 (ADD) via an IMM. The CU in lesson 5 replaces that IMM with a real opcode-decoded signal — for an ADD instruction (op=0) it will output 0; for SUB (op=1) it will output 1; etc. The wiring you see today does not change — only the source of ALU_OP.',
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
