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
    startsFrom: 'c01-pc',
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
        instruction: 'Click "Show solution". The circuit extends lesson 2: PC and ROM stay where they were; ROM now feeds an IR (which splits the 16-bit instruction into OP/RD/RS1/RS2), and IR.OP feeds the CU. All seven CU outputs are wired to LEDs on the right: ALU_OP (2 bits), RG_WE, MM_WE, MM_RE, JMP, HALT, IMM. A diagnostic OP LED above the IR shows the raw 4-bit opcode coming out of ROM.\n\nThe ROM is pre-loaded with a 13-instruction demo program (see below) chosen to make every CU output light up at least once. Press STEP repeatedly and watch:\n\n• Cycles 1–2 (LI R1,5 / LI R2,3, OP=13): RG_WE=1, IMM lights up with 5 then 3 — the immediate path is alive.\n• Cycles 3–7 (ADD/SUB/AND/OR/XOR, OP=0..4): RG_WE=1; ALU_OP cycles through 0,1,2,3,4 — the CU is telling the (future) ALU exactly what to do.\n• Cycle 8 (CMP, OP=7): ALU_OP=7 but RG_WE=0 — CMP runs the ALU only to set flags, no register write.\n• Cycle 9 (LOAD, OP=8): MM_RE=1 + RG_WE=1 — the CU asks RAM to read and the Register File to receive.\n• Cycle 10 (STORE, OP=9): MM_WE=1, RG_WE=0 — opposite direction; nothing is written into a register.\n• Cycle 11 (JMP, OP=10): JMP=1 — the CU is requesting a PC jump (which won\'t actually happen until step 7).\n• Cycle 12 (NOP, OP=14): every signal low — by design.\n• Cycle 13 (HALT, OP=15): HALT=1 — execution would stop here in a real CPU.\n\nNothing in the circuit is actually computing or storing yet. LOAD/STORE/JMP are decoded into control signals, but no RAM exists to read or write, and the PC has no jump wiring. That is exactly the lesson: the CU is reading the program correctly long before the rest of the CPU arrives. Open WAVEFORM and add OP, ALU_OP, RG_WE, MM_WE, MM_RE, JMP, HALT, IMM to see all 13 cycles at once.',
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
        instruction: 'Click "Show solution". The full lesson-3 circuit is unchanged — only the RF-DP and two read-port LEDs are added below it. New wiring: IR.RD → RF.WR_ADDR ; IR.RS1 → RF.RD1_ADDR ; IR.RS2 → RF.RD2_ADDR ; IR.RS2 → RF.WR_DATA (RS2 doubles as the immediate value for LI; this is the temporary direct path that the step-5 MUX will replace) ; CU.RG_WE → RF.WE ; CLK → RF.CLK. Two new LEDs are wired to the read ports: RD1 reads what RS1 selected, RD2 reads what RS2 selected.\n\nInitial state (before pressing STEP at all): PC=0, RF all zeros. The ROM begins with two NOPs at addresses 0 and 1 — they do nothing visible, they just let you watch the PC tick along an "empty pipeline" before the real program starts at address 2.\n\nDemo flow (open the MEM panel before stepping — it shows R0..R7 live):\n\n• STEP 1 (PC: 0 → 1, NOP): no register changes. RG_WE=0, all CU LEDs quiet.\n• STEP 2 (PC: 1 → 2, NOP): again nothing.\n• STEP 3 (PC: 2 → 3, LI R1, 5): the first real instruction. RG_WE=1, IMM=5, RD=1 → R1 ← 5. MEM panel shows R1=5.\n• STEP 4 (LI R2, 3): R2 ← 3.\n• STEP 5 (LI R3, 9): R3 ← 9.\n• STEP 6 (LI R4, 1): R4 ← 1.\n• STEP 7 (CMP R1, R2, OP=7): RG_WE=0 → no write. RS1=1, RS2=2 → RD1 LED shows 5, RD2 LED shows 3. The dual read ports are alive even when nothing is being written.\n• STEP 8 (CMP R3, R4): RD1 LED shows 9, RD2 LED shows 1.\n• STEP 9 (HALT): RG_WE=0, HALT=1.\n\nWhat just happened: every line of the program in ROM caused (or chose not to cause) a real, observable change inside the CPU. The CU is still doing the same combinational decoding from lesson 3, but now its outputs are wired into something that remembers.',
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
        instruction: 'Click "Show solution". The lesson-4 circuit is preserved entirely; we add three components: an ALU, a 2-input BUS_MUX, and an ALU_R LED. The one wire from c04 that gets replaced: IR.RS2 → RF.WR_DATA was the temporary "immediate-only" path. It is now gone. In its place: ALU.Y → MUX.D0 ; IR.RS2 → MUX.D1 ; CU.IMM → MUX.SEL ; MUX.Y → RF.WR_DATA. Other new wires: RF.RD1 → ALU.A ; RF.RD2 → ALU.B ; CU.ALU_OP → ALU.OP ; ALU.Z → CU.Z ; ALU.C → CU.C (the flag wires are placed now so step 7 can use them for branches without rerouting).\n\nDemo flow (open the MEM panel):\n\n• STEP 1 (NOP, PC: 0→1): nothing.\n• STEP 2 (NOP, PC: 1→2): nothing.\n• STEP 3 (LI R1, 5): CU.IMM=1, MUX picks IR.RS2=5. R1 ← 5.\n• STEP 4 (LI R2, 3): R2 ← 3.\n• STEP 5 (ADD R3, R1, R2): CU.IMM=0, MUX picks ALU.Y. RF reads R1=5 and R2=3 on the read ports → ALU.A=5, ALU.B=3, ALU.OP=0 (ADD) → ALU_R LED shows 8 → R3 ← 8. The first computed write.\n• STEP 6 (SUB R4, R1, R2): ALU.OP=1 → 5−3=2 → R4 ← 2.\n• STEP 7 (AND R5, R1, R2): ALU.OP=2 → 5&3=1 → R5 ← 1.\n• STEP 8 (XOR R6, R1, R2): ALU.OP=4 → 5^3=6 → R6 ← 6.\n• STEP 9 (HALT).\n\nWatch the ALU_R LED change between cycles even when no write happens — the ALU is purely combinational, so it always shows whatever ALU.OP/A/B currently say. When CU.IMM=1 (LI cycles), the MUX ignores the ALU and the LED is just a curiosity. When CU.IMM=0, the LED is the value about to land in the destination register.',
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
        instruction: 'Click "Show solution". Three new components are added: a RAM, a 2-input MEM_MUX, and a MEM_OUT LED. The c05 wire `ALU.Y → WB_MUX.D0` is removed — replaced by the MEM_MUX path. New wires: RF.RD2 → RAM.ADDR (the address register for LOAD/STORE in this ISA is RS2) ; RF.RD1 → RAM.DATA (STORE\'s data comes from RS1) ; CU.MM_WE → RAM.WE ; CU.MM_RE → RAM.RE ; CLK → RAM.CLK ; ALU.Y → MEM_MUX.D0 ; RAM.OUT → MEM_MUX.D1 ; CU.MM_RE → MEM_MUX.SEL ; MEM_MUX.Y → WB_MUX.D0 ; RAM.OUT → MEM_OUT LED.\n\nDemo flow (open the MEM panel — switch between the RF tab and the RAM/DMEM tab to watch both):\n\n• STEPs 1–2 (NOPs): nothing.\n• STEPs 3–5 (LI R1=5, R2=8, R3=15): three data values land in R1..R3.\n• STEPs 6–8 (LI R4=1, R5=2, R6=3): three addresses land in R4..R6.\n• STEP 9 (STORE R1, R4): RAM[1] ← 5. The DMEM tab now shows address 1 holding 0x05.\n• STEP 10 (STORE R2, R5): RAM[2] ← 8.\n• STEP 11 (STORE R3, R6): RAM[3] ← 15. All three RAM cells are now populated.\n• STEP 12 (LOAD R7, R4): MEM_OUT LED shows 5. R7 ← 5.\n• STEP 13 (LOAD R7, R5): MEM_OUT LED switches to 8. R7 ← 8.\n• STEP 14 (LOAD R7, R6): MEM_OUT LED switches to 15. R7 ← 15.\n• STEP 15 (HALT).\n\nTwo memories, one CPU. The ROM holds the program forever (read-only); the RAM holds the data the program manipulates (read-write). This is exactly the Harvard architecture, and is also what the user-mode of any modern OS feels like — code segment vs. data segment.',
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
        instruction: 'Click "Show solution". Two new wires close the loop: IR.RD → PC.JUMP_ADDR and CU.JMP → PC.JMP. The JMP LED is added back to the column above CU.\n\nDemo flow (open the MEM panel; watch R1 in the RF tab; watch PC up top):\n\n• STEPs 1–2 (NOPs): warmup.\n• STEP 3 (LI R1, 4): R1 ← 4.\n• STEP 4 (LI R2, 1): R2 ← 1.\n• STEP 5 (SUB R1, R1, R2): R1 ← 3.\n• STEP 6 (BEQ R1, R0, 7): atomic — ALU does CMP R1,R0 → Z=0 → CU.JMP=0 → PC ticks to 6. JMP LED stays low.\n• STEP 7 (JMP 4): unconditional → CU.JMP=1 → PC ← 4 (the SUB address). JMP LED lights.\n• STEP 8 (back at SUB): R1 ← 2.\n• STEP 9 (BEQ R1, R0, 7): R1≠0 → no jump, fall through.\n• STEP 10 (JMP 4): jump back.\n• STEP 11 (SUB): R1 ← 1.\n• STEP 12 (BEQ): R1≠0 → fall through.\n• STEP 13 (JMP 4): jump back.\n• STEP 14 (SUB): R1 ← 0.\n• STEP 15 (BEQ R1, R0, 7): the atomic compare fires Z=1 in the same cycle → PC ← 7. The loop exits.\n• STEP 16 (HALT): HALT LED on. Done.\n\n14 cycles of execution to count down from 4. The CPU is now Turing-complete enough to run any small program — it has memory, arithmetic, conditional flow, and loops.',
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
        instruction: 'Click "Show solution". The circuit is identical to lesson 7 — every wire from c01 through c07 is exactly where you left it. The ROM is pre-loaded with a Fibonacci program. STEP through it and watch the RF / DMEM panels:\n\nWhat happens (after the warmup NOPs, the setup phase fills R1=0, R2=1, R3=0, R4=1, R5=5, then the loop runs 5 times):\n\n• Iteration 1: R6 = 0+1 = 1.  mem[0]=1.  R1=1, R2=1.\n• Iteration 2: R6 = 1+1 = 2.  mem[1]=2.  R1=1, R2=2.\n• Iteration 3: R6 = 1+2 = 3.  mem[2]=3.  R1=2, R2=3.\n• Iteration 4: R6 = 2+3 = 5.  mem[3]=5.  R1=3, R2=5.\n• Iteration 5: R6 = 3+5 = 8.  mem[4]=8.  R5=0 → BEQ R5,R0 taken → HALT.\n\nFinal RAM: mem[0..4] = 1, 2, 3, 5, 8 — that is F(2), F(3), F(4), F(5), F(6). Fibonacci, on your gates.\n\n══════════════════════════════════════════════════════\nFULL ISA — every instruction this CPU now executes:\n══════════════════════════════════════════════════════\n\n  ARITHMETIC / LOGIC (writes Rd):\n    ADD  Rd, Rs1, Rs2    Rd = Rs1 + Rs2\n    SUB  Rd, Rs1, Rs2    Rd = Rs1 - Rs2\n    AND  Rd, Rs1, Rs2    Rd = Rs1 & Rs2\n    OR   Rd, Rs1, Rs2    Rd = Rs1 | Rs2\n    XOR  Rd, Rs1, Rs2    Rd = Rs1 ^ Rs2\n    SHL  Rd, Rs1, Rs2    Rd = Rs1 << Rs2\n    SHR  Rd, Rs1, Rs2    Rd = Rs1 >> Rs2\n\n  COMPARE (no register write — used internally by BEQ/BNE):\n    CMP  Rs1, Rs2        sets Z if equal, C if Rs1 > Rs2\n\n  IMMEDIATE LOAD:\n    LI   Rd, imm         Rd = imm  (imm is 8-bit; in this lesson 0..15 fits in RS2)\n    MOV  Rd, Rs          synonym for "OR Rd, Rs, R0"  (R0 is always 0)\n\n  MEMORY:\n    LOAD  Rd, Raddr      Rd = RAM[Raddr]\n    STORE Rdata, Raddr   RAM[Raddr] = Rdata\n\n  CONTROL FLOW:\n    JMP  imm             unconditional: PC = imm\n    BEQ  Rs1, Rs2, imm   atomic: if Rs1 == Rs2 then PC = imm   (one cycle)\n    BNE  Rs1, Rs2, imm   atomic: if Rs1 != Rs2 then PC = imm   (one cycle)\n\n  HOUSEKEEPING:\n    NOP                  do nothing for one cycle\n    HALT                 stop execution\n\nAlgorithms that fit comfortably on this CPU (≤16 instructions, ≤256-valued data): array sum, search-for-key in RAM, repeated-addition multiplication, parity, popcount (count of set bits), block copy, countdown / count-up loops, Fibonacci sequence (the program above), simple bit manipulation — anything driven by equality tests.\n\nAlgorithms that need more hardware: function calls (no CALL/RET — would need a STACK), values larger than 255 (8-bit data path), programs over 16 instructions (4-bit PC), ordering tests (R1 < R2, R1 > R2 — this ISA only has BEQ/BNE; ordering would require BLT/BGE which we did not budget an opcode slot for).',
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
];

export function findLesson(id) {
  return LESSONS.find(l => l.id === id) || null;
}

export function lessonsByTrack(trackId) {
  return LESSONS.filter(l => l.track === trackId);
}
