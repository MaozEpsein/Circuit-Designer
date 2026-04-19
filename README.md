# Circuit Designer Pro

**A browser-based digital design and verification environment for RTL-level work — schematic capture, cycle-accurate simulation, industry-grade waveform analysis (VCD import/export), ROM/assembly toolchain, and live memory inspection. Built for engineers who need a fast, modern alternative to legacy CAD tools.**

[![Launch App](https://img.shields.io/badge/%F0%9F%9A%80_Launch_Circuit_Designer_Pro-Click_Here-blue?style=for-the-badge&logoColor=white)](https://maozepsein.github.io/Circuit-Designer/app.html)

---

## Features

### Component Library — 40+ Components

#### Logic Gates
AND, OR, XOR, NAND, NOR, XNOR, NOT, Buffer, Tri-state Buffer

#### Sequential Elements
- **Flip-Flops** — D, T, SR, JK (edge-triggered)
- **Latches** — D-Latch, SR-Latch (level-sensitive)

#### Arithmetic & Combinational Blocks
| Component | Description |
|-----------|-------------|
| Half Adder | A + B = Sum, Carry |
| Full Adder | A + B + Cin = Sum, Cout |
| Comparator | EQ, GT, LT outputs |
| MUX | N:1 multiplexer (configurable 2-8 inputs) |
| DEMUX | 1:N demultiplexer |
| Decoder | N-to-2^N one-hot |
| Encoder | Priority encoder |
| Bus MUX | Multi-bit bus multiplexer (2-8 inputs) |
| Sign Extender | N-bit to M-bit sign extension (configurable) |

#### Memory Components
| Component | Inputs | Outputs | Description |
|-----------|--------|---------|-------------|
| Register | DATA, EN, CLR, CLK | Q | N-bit register with enable and clear |
| Shift Register | DIN, DIR, EN, CLR, CLK | Q | Bidirectional shift register |
| Counter | EN, LOAD, DATA, CLR, CLK | Q, TC | Up counter with parallel load |
| RAM | ADDR, DATA, WE, RE, CLK | Q | Read/write random access memory |
| ROM | ADDR, RE, CLK | Q | Read-only memory with built-in ROM Editor |
| Register File | RD_A, WR_A, WR_D, WE, CLK | RD_DATA | Multi-register file (2-32 registers, pre-loadable) |
| FIFO | DATA, WR, RD, CLR, CLK | Q, FULL, EMPTY | First-In First-Out queue |
| Stack | DATA, PUSH, POP, CLR, CLK | Q, FULL, EMPTY | Last-In First-Out stack |
| PC | JMP_A, JMP, EN, CLR, CLK | ADDR | Program Counter with jump support |

#### CPU Components
| Component | Inputs | Outputs | Description |
|-----------|--------|---------|-------------|
| ALU | A, B, OP | R, Z, C | 8 operations: ADD, SUB, AND, OR, XOR, SHL, SHR, CMP |
| IR | INSTR, LD, CLK | OP, RD, RS1, RS2 | Instruction Register — decodes 16-bit instructions |
| CU | OP, Z, C | ALU_OP, REG_WE, MEM_WE, MEM_RE, JMP, HALT | Control Unit — 16 opcodes |
| BUS | D0-Dn, EN0-ENn | OUT, ERR | Shared bus with tri-state arbitration |
| IMM | — | value | Constant/immediate value source |
| Pipeline Register | D0-Dn, STALL, FLUSH, CLK | Q0-Qn | Pipeline stage separator with stall/flush |

#### I/O Components
- **Input / Output** nodes (supports multi-bit bus values)
- **Clock** generator
- **MUX Switch** (toggle value)
- **7-Segment Display**

#### Advanced
- **Sub-circuits** — group components into reusable custom blocks

---

### Simulation Engine
- DAG-based topological evaluation with real-time propagation
- Rising-edge clock detection for sequential elements
- Asynchronous read / synchronous write for memory components
- Multi-bit bus wires — thick golden wires with hex value labels
- Full CPU feedback loop resolution (RF → ALU → CU → RF write-back)
- Automatic re-propagation on state changes

### ROM Editor & Assembler
- **Double-click ROM** to open the visual ROM Editor
- Two editing modes: **HEX** (direct) and **Assembly** (human-readable)
- **Quick Builder** — select opcode + registers from dropdowns, click INSERT
- Auto-uppercase while typing
- 16 supported instructions: ADD, SUB, AND, OR, XOR, SHL, SHR, CMP, LOAD, STORE, JMP, JZ, JC, MOV, NOP, HALT
- Full round-trip: Assembly → HEX → Assembly

### Debugging & Analysis
- **Waveform Viewer** — timing diagrams for any signal
- **Signal Probes** — attach to any wire for live monitoring
- **Watch List** — pin signals to a persistent panel
- **Truth Table Generator** — auto-generate for any sub-circuit
- **Signal Tracing** — highlight signal paths forward/backward
- **Error Overlay** — detect undefined/conflicting signals
- **Memory Inspector** — live view of all memory components:
  - Per-bit register visualization with click-to-toggle
  - RAM/ROM address table view
  - Register File — all internal registers displayed (R0-Rn)
  - FIFO/Stack buffer contents with fill level indicator
  - Inline value editing (HEX/BIN/DEC formats)

### Design Tools
- Drag-and-drop component placement from 5 palette tabs
- Double-click to edit component properties (size, label, bit width)
- Properties panel for selected component configuration
- Manhattan wire routing with Bezier curves
- Multi-select (rubber-band + Shift+click), align, and distribute
- Copy/paste (Ctrl+C/V) with full undo/redo support
- Undo/redo for **all** operations including property changes
- Sub-circuits — select components → CREATE BLOCK → reusable custom component
- Snap-to-grid, pan and zoom with minimap
- Command palette (Ctrl+K) for quick access
- Export/import circuits as JSON
- Project save/load with IndexedDB
- Screenshot and SVG export

---

## Palette Tabs

| Tab | Components |
|-----|------------|
| **LOGIC** | Gates (AND, OR, XOR, NAND, NOR, XNOR, NOT, BUF, TRI), Flip-Flops (D, T, SR, JK), Latches (D, SR) |
| **BLOCKS** | MUX, DEMUX, Decoder, Encoder, Half Adder, Full Adder, Comparator, Bus MUX, Sign Extender |
| **MEMORY** | Register, Shift Register, Counter, RAM, ROM, Register File, FIFO, Stack, PC |
| **CPU** | ALU, IR, CU, BUS, IMM, Pipeline Register |
| **OTHER** | MUX Switch, 7-Segment Display |

Quick toolbar: IN, OUT, WIRE, CLK

---

## Examples

Click the **EXAMPLES** button to load pre-built circuits:

| Example | Description |
|---------|-------------|
| 4-Bit Counter | Counter driven by clock, counts 0-15 |
| ALU Calculator | ALU with two immediate inputs and flag outputs |
| Register Load/Read | Load a value into a register and read it back |
| RAM Read/Write | Write to RAM and read from a specific address |
| FIFO Queue | Push/pop data with FULL/EMPTY indicators |
| Instruction Decoder | IR + CU decoding a 16-bit instruction |
| **Simple CPU — Countdown** | Full CPU: PC → ROM → IR → CU → ALU → Register File → RAM. Runs a program that counts down from 10 to 0 with LOAD/STORE support |

---

## CPU Architecture

The built-in CPU example implements a complete single-cycle processor:

```
CLK → PC → ROM → IR → CU → ALU ↔ Register File
                                ↕
                          RAM (Data Memory)
                                ↕
                          BUS_MUX (Write-Back)
```

### Instruction Set (16-bit, 16 opcodes)

| Opcode | Mnemonic | Format | Description |
|--------|----------|--------|-------------|
| 0 | ADD | RD, RS1, RS2 | RD = RS1 + RS2 |
| 1 | SUB | RD, RS1, RS2 | RD = RS1 - RS2 |
| 2 | AND | RD, RS1, RS2 | RD = RS1 & RS2 |
| 3 | OR | RD, RS1, RS2 | RD = RS1 \| RS2 |
| 4 | XOR | RD, RS1, RS2 | RD = RS1 ^ RS2 |
| 5 | SHL | RD, RS1, RS2 | RD = RS1 << RS2 |
| 6 | SHR | RD, RS1, RS2 | RD = RS1 >> RS2 |
| 7 | CMP | RS1, RS2 | Compare, set Z/C flags |
| 8 | LOAD | RD, RS2 | RD = RAM[RS2] |
| 9 | STORE | RS1, RS2 | RAM[RS2] = RS1 |
| 10 | JMP | addr | PC = addr |
| 11 | JZ | addr | if Z: PC = addr |
| 12 | JC | addr | if C: PC = addr |
| 13 | MOV | RD, RS1 | RD = RS1 |
| 14 | NOP | — | No operation |
| 15 | HALT | — | Stop execution |

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/MaozEpsein/Circuit-Designer.git
cd Circuit-Designer

# No build step required — use any static server:
npx serve .
```

Then open `http://localhost:3000/app.html` in your browser.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Rendering | HTML5 Canvas 2D (60 FPS) |
| Language | Vanilla JavaScript (ES Modules) |
| Storage | IndexedDB (local) + Firebase (cloud) |
| Styling | CSS with dark theme |
| Font | JetBrains Mono |
| Build | None — zero dependencies, static hosting |

---

## Roadmap

### Near-term
- [ ] **JMP pipeline flush** — suppress register write after jump to fix pipeline hazards
- [ ] **LI (Load Immediate)** — load constant value directly into register
- [ ] **ROM file loading** — upload .hex or .asm files directly into ROM
- [ ] **Hazard Detection Unit** — detect data hazards and auto-stall pipeline
- [ ] **Forwarding Unit** — bypass ALU result to next instruction without stall

### Mid-term
- [ ] **Verilog / VHDL import & export** — round-trip between schematic and synthesizable HDL (subset: modules, assign, always @, wire/reg)
- [ ] **AI design assistant** — structured tool-use agent that reads the circuit JSON and performs targeted edits, bug analysis, and HDL generation on request
- [ ] **High-level programming for the built-in CPU** — C-style syntax compiling to the 16-opcode ISA (`R3 = R1 + R2`)
- [ ] **Timing diagram export** — SVG/PNG export of waveforms for design reviews and documentation

### Long-term
- [ ] **Pipelined CPU reference design** — 5-stage pipeline with hazard detection, forwarding, branch prediction, and per-stage pipeline inspection in the waveform panel
- [ ] **Event-driven simulator** — per-gate propagation delay (ns), setup/hold checks, glitch detection — replacing the cycle-accurate engine for timing-critical work
- [ ] **Multi-clock domains** — independent clock trees, CDC detection, metastability warnings
- [ ] **Component library ecosystem** — versioned sub-circuit libraries, import / export / sharing

---

## Waveform Pro

An industry-grade waveform viewer built into the app. Brings the capability level of GTKWave / Vivado / ModelSim into a modern, minimal interface — no dense "CAD from the 90s" look.

### Design Principles

| Principle | In practice |
|---|---|
| Narrow palette | Green for HIGH, blue-grey for LOW, yellow for CLK, cyan for interaction, white for text. Nothing more. |
| Readable type | JetBrains Mono 12px for values, 11px for labels. Never below 10px. |
| Generous spacing | Row height 32–40 px. Visible gap between signal groups. |
| Quiet grid | Time gridlines at ~10 % opacity. Not a chessboard. |
| Gentle motion | Zoom / pan eased over 150 ms. Cursor tracks smoothly. No jumps. |
| One interaction color | Anything clickable / draggable is cyan. No rainbow of button colors. |

### Capabilities

**Navigation & Layout**
- Horizontal zoom around the cursor (`Ctrl + Wheel` · `+` / `−`).
- Horizontal pan (drag inside the data area · `Shift + Wheel` · plain wheel · `h` / `l` step).
- Vertical scroll when the signal list overflows, with a draggable cyan scrollbar.
- Fit-to-window (`F` or `FIT` button) — auto-sizes zoom so the full history is visible.
- Full-screen mode (`⛶ FULL` button or `Shift + F`, `Esc` to exit).
- Resizable panel — drag the cyan top-edge handle. Min 120 px, max 80 % of the viewport.
- Time axis with cycle numbers that adapt label spacing to the current zoom, plus minor ticks.

**Data Readability**
- Multi-bit buses render as hex-diagram segments with value labels that shrink-to-fit or hide if a segment is too narrow.
- Global radix toggle in the header cycles DEC → HEX → BIN; per-signal override is available via right-click.
- Dynamic row heights — bus rows are slightly taller than 1-bit rows for label room.
- Deterministic per-signal colors (djb2 hash → curated 10-color palette). The clock signal always uses the canonical yellow.

**Interactivity**
- Vertical cursor follows the mouse; each signal's value at the cursor cycle is shown inline in its label, respecting the current radix.
- Markers A / B: plain click places `A`, `Shift + Click` places `B`. Footer shows cycle numbers and `Δ` in cycles. Double-click clears both.
- Hide / show signals and "Show all hidden" via the right-click menu.
- Drag a signal label up or down to reorder rows. A cyan indicator shows where the row will land while dragging (visible indices are mapped to the absolute order so hidden signals aren't disturbed).
- Right-click context menu per signal: copy value at cursor, hide, pin to top, radix override (DEC / HEX / BIN / global), plus global actions (clear markers, clear bookmarks, add bookmark at cursor).
- **Signal Picker** — a collapsible sidebar on the left (`◨ SIGNALS` button; open by default when the Waveform panel is first shown). Every component in the circuit appears as a collapsible node in a GTKWave-style tree; expanding a component reveals every pin it exposes (inputs and outputs, separated by compact `INPUTS` / `OUTPUTS` sub-headers) so internal wires — register Q, PC out, ALU result, CU control lines, FF states — are all discoverable even when hidden.
  - **Filter box** grows vertically on focus so the text is readable while typing, then shrinks back on blur.
  - **`RECOMMENDED`** (collapsible, closed by default) restores the default set: CLK + all Inputs + MUX selectors + all Outputs.
  - **`CLEAR ALL`** (red, with confirmation) hides every signal except the clock. Re-enable any signal from the tree.
  - Default: only the clock is visible; everything else is listed but hidden until clicked. Persists per project.

**Power Features**
- Edge jump — `←` / `→` advance the cursor to the previous / next transition of the active signal. `Home` / `End` go to the first / last cycle.
- Pattern search in the header: `<signal>` (rising edge), `<signal> == <value>`, `!=`, `>`, `<`, `>=`, `<=` with decimal / hex (`0x..`) / binary (`0b..`) values. Matching cycles get a cyan highlight band; Enter runs the search, `Shift + N` inside the box cycles through matches.
- Trigger mode — arm the `TRIG` button with a condition (same grammar as search). While armed, incoming steps are discarded until the condition fires; on fire, a `TRIG` bookmark is dropped at the exact cycle and recording continues normally. The button turns yellow while waiting, green after firing.
- Signal groups — auto-grouped by type (Clock / Inputs / Controls / Outputs). Click the `▼` / `▶` triangle next to a group name to collapse.
- Named bookmarks — press `B` at the cursor (or use the `+ BMK` button / right-click) to save a named cycle. Rendered as dashed soft-purple vertical line with a label tag.

**Industry Integration**
- **VCD export** — `.VCD` button produces an IEEE-1364 Value Change Dump that opens directly in GTKWave, ModelSim, Vivado, or Verilator without modification.
- **VCD import** — `IMPORT` button loads a `.vcd` from any external HDL simulator. Parser handles nested `$scope` hierarchies (flattened), any `$var` type, scalar and vector value changes, and maps x/z gracefully. The imported trace replaces current signals + history and resets the view state.
- **View state persistence** — zoom, pan, vertical scroll, panel height, radix, per-signal overrides, hidden signals, custom ordering, collapsed groups, bookmarks, markers, and trigger are all saved alongside the design (auto-save, project save, JSON export) and restored on reload.

**Keyboard Shortcuts** (with the panel open)

| Key | Action |
|---|---|
| `F` | Fit all cycles to window |
| `Shift + F` | Toggle full-screen |
| `Esc` | Exit full-screen |
| `← / →` | Jump to previous / next edge of the active signal |
| `h / l` | Step cursor ± 1 cycle |
| `j / k` | Switch active signal (down / up) |
| `Home / End` | First / last cycle |
| `+ / −` | Zoom in / out around the cursor |
| `B` | Add a named bookmark at the cursor |
| `W` | Toggle the Waveform panel |

### Implementation

The module lives in `js/waveform/` with one concern per file:

```
js/waveform/
├── WaveformRenderer.js    — canvas drawing only (signals, grid, cursor visuals)
├── WaveformController.js   — input handling, public API, orchestration
├── WaveformState.js        — view state, history, search, trigger, groups, bookmarks
├── WaveformVCD.js          — VCD import and export
└── WaveformTheme.js        — color palette, typography, spacing constants
```

### Performance

| Metric | Budget |
|---|---|
| Memory footprint | ≤ 10 MB for a typical session (20k cycles × 50 signals) |
| Idle CPU cost | ≤ 2 % at 30 fps render while the panel is visible |
| Render cost per frame | ≤ 4 ms for ~50 signals × ~500 visible steps |
| Peak latency (search, export) | ≤ 100 ms spike, never blocking the main thread for longer |
| History retention | Circular buffer capped at 20k cycles; older entries drop automatically |

Enforced via: circular history buffer, `requestAnimationFrame`-throttled input, skipped rendering while hidden, early-exit pattern search, and off-main-thread work reserved for future > 100 ms tasks.

### Tests

Automated coverage in `examples/tests/`:

| File | Checks |
|---|---|
| `test-mips-gcd.mjs` | 45 — circuit integrity, datapath widths, GCD program correctness |
| `test-vcd-export.mjs` | 11 — VCD header, timeline, value encoding |
| `test-vcd-import.mjs` | 15 — export → import round-trip, bus detection |
| `test-view-state.mjs` | 19 — serialize / deserialize / JSON round-trip |

Run any single file with `node examples/tests/<file>.mjs`.

---

## HDL Toolchain (Verilog Import / Export) — Development Plan

The next major initiative. Converts Circuit Designer from a self-contained simulator into a first-class RTL design tool that interoperates with the industry toolchain (Yosys, Verilator, ModelSim, Vivado, FPGA flows). All work lives in a new isolated module under `js/hdl/` — no existing subsystem is touched.

### Goals

| Goal | Outcome |
|---|---|
| Export a circuit to synthesizable Verilog | `.v` file opens in Yosys / Verilator / Vivado, passes synthesis, matches simulation cycle-for-cycle |
| Generate an automated testbench | Verilog TB that drives the same inputs and dumps VCD, importable back into Waveform Pro for diff |
| Import a Verilog subset back into the canvas | Common synthesizable constructs (assign / always / case / module instantiation) reconstruct the schematic |
| Zero impact on existing runtime | Export/import only run on explicit user action; no cost to the render or simulation loops |
| Graceful extensibility | Adding a new component requires one translator function, nothing else |

### Module Layout

```
js/hdl/
├── VerilogExporter.js        — public entry: circuitJSON → Verilog string
├── VerilogImporter.js        — public entry: Verilog string → circuitJSON
├── translators/              — one file per component family
│   ├── index.js              —   registry + dispatch
│   ├── logic-gates.js
│   ├── flip-flops.js
│   ├── memory.js
│   └── cpu.js
├── parser/                   — Verilog subset parser
│   ├── lexer.js
│   ├── ast.js
│   └── elaborate.js
├── layout/
│   └── grid-layout.js        — auto-placement for imported designs
└── tests/
    ├── export-primitives.mjs
    ├── export-roundtrip.mjs
    ├── import-subset.mjs
    └── yosys-verify.mjs       — optional (runs only if Yosys is installed locally)
```

### Phases

Each phase produces a concrete, testable deliverable. Work one phase at a time; do not skip ahead.

#### Phase 1 — Foundation & Export Skeleton
- [ ] Create `js/hdl/` directory structure exactly as above.
- [ ] Write `VerilogExporter.js` with a single exported function `exportCircuit(circuitJSON, options) → string`.
- [ ] Define the translator registry in `translators/index.js` — a map `{ componentType → translatorFn(node, ctx) }`.
- [ ] Implement module header generation: `module top(input ..., output ...);`.
- [ ] Implement wire declaration pass — every net in the circuit becomes a `wire` line, with bus widths (`[N-1:0]`).
- [ ] Implement a safe-identifier sanitizer (Verilog reserved words, illegal chars in node labels).
- [ ] Wire a `FILE → Export → Verilog (.v)` menu item that downloads the result.
- [ ] Add `examples/tests/test-hdl-skeleton.mjs` — checks that an empty circuit exports a valid empty module.

#### Phase 2 — Combinational Logic Export
- [ ] Translators for all logic gates: AND, OR, XOR, NAND, NOR, XNOR, NOT, BUF, TRI.
- [ ] Half Adder, Full Adder — pure `assign` statements.
- [ ] Comparator (EQ / GT / LT flags).
- [ ] MUX / DEMUX / Decoder / Encoder — `case` statements with bus widths from component config.
- [ ] Bus MUX (multi-bit) and Sign Extender (`{ {N{msb}}, data }`).
- [ ] `examples/tests/test-hdl-combinational.mjs` — for each component, build a tiny circuit → export → re-parse → compare.
- [ ] Manual verification: run one circuit per component through Yosys synthesis and confirm no errors.

#### Phase 3 — Sequential Logic Export
- [ ] Flip-Flops: D, T, SR, JK — `always @(posedge clk)` blocks, async clear → `or negedge clr`.
- [ ] Latches: D, SR — `always @(*)` with enable condition.
- [ ] Registers (N-bit with EN / CLR / CLK).
- [ ] Shift Register (bidirectional).
- [ ] Counter (EN / LOAD / DATA / CLR) with TC output.
- [ ] Pipeline Register (STALL / FLUSH logic).
- [ ] `examples/tests/test-hdl-sequential.mjs` — drive a clock in both our simulator and Verilator, diff the VCDs.

#### Phase 4 — Memory & CPU Components Export
- [ ] RAM → `reg [W-1:0] mem [0:DEPTH-1]` + sync write, async read.
- [ ] ROM → `reg` array with `initial` block populated from ROM Editor contents, or `$readmemh` with a sidecar file.
- [ ] Register File (multi-port).
- [ ] FIFO / Stack with full / empty flags.
- [ ] PC (JMP_A / JMP / EN / CLR).
- [ ] ALU — `case (op)` with 8 operations, Z/C flag logic.
- [ ] IR — field extraction into OP / RD / RS1 / RS2.
- [ ] CU — opcode → control signals `case` table (16 opcodes).
- [ ] BUS — tri-state arbitration with `z` on inactive drivers.
- [ ] IMM — `assign out = CONST;`.
- [ ] `examples/tests/test-hdl-cpu.mjs` — full Simple-CPU countdown exported, simulated externally, VCD matches.

#### Phase 5 — Hierarchical Design & Sub-circuits
- [ ] Each sub-circuit exports as its own `module` above `module top`.
- [ ] Parameterise bit widths via `parameter WIDTH = 8` where the sub-circuit is width-configurable.
- [ ] Port-name collision handling (sub-circuit's internal labels must not shadow top-level names).
- [ ] Nested hierarchies (block inside block inside block) — recursive module generation with memoization so identical blocks export only once.
- [ ] `examples/tests/test-hdl-hierarchy.mjs` — a 3-level deep design, verify module list + instantiation.

#### Phase 6 — Export UX & Polish
- [ ] Preview modal — shows generated Verilog with JetBrains Mono + basic syntax highlight (keywords, numbers, comments) before download.
- [ ] Per-sub-circuit export — right-click a block → `Copy as Verilog` or `Export this block`.
- [ ] Testbench generator — emits a `_tb.v` that reads the current VCD's stimulus, runs the module, dumps its own VCD for diff.
- [ ] Export settings dialog — top module name, reset polarity (active-high / active-low), clock name override, comment style (short / verbose).
- [ ] Round-trip self-check — after export, re-parse our own output with our importer (once Phase 7 exists) and verify identity.
- [ ] Error surface — if any component lacks a translator, emit a `// TODO:` comment and surface a non-blocking warning in the UI.

#### Phase 7 — Verilog Parser (Import Foundations)
- [ ] Lexer for the target subset (identifiers, numbers w/ bases, operators, keywords, comments).
- [ ] AST nodes: `Module`, `Port`, `Wire`, `Reg`, `Assign`, `Always`, `Case`, `If`, `Instantiation`, `BinaryOp`, `UnaryOp`, `Concat`, `Replicate`.
- [ ] Parser builds AST from token stream; clear error messages with line / column.
- [ ] Parameter resolution — `parameter WIDTH = 8; wire [WIDTH-1:0] d;` must fold to a concrete width.
- [ ] `examples/tests/test-hdl-parser.mjs` — parses every `.v` file we've exported in Phases 2-5 without error.

#### Phase 8 — Elaboration & Inference
- [ ] Gate primitives (`and`, `or`, `xor`, `not`, `buf`) → map directly to palette components.
- [ ] `assign y = a & b;` → AND gate instance. Build expression-tree → gate-network lowering.
- [ ] `always @(*)` with `case` → MUX instance(s). Priority `if/else if` → MUX tree.
- [ ] `always @(posedge clk)` with non-blocking assigns → FF or Register.
- [ ] RAM / ROM pattern detection — `reg [W-1:0] mem [0:D-1]` with sync write / async read → RAM component.
- [ ] Sub-module instantiation → recursively import and turn into a canvas sub-circuit.
- [ ] Unsupported construct → fail-soft with a clear report of what was skipped.
- [ ] `examples/tests/test-hdl-elaborate.mjs` — a mix of hand-written .v files (simple counter, FSM, ALU) produce correct circuitJSON.

#### Phase 9 — Auto-Layout for Imported Designs
- [ ] DAG topological layering: inputs on the left, outputs on the right, combinational depth determines column.
- [ ] Grid placement within each column (deterministic, stable).
- [ ] Wire routing — reuse the existing Manhattan router with Bezier corners.
- [ ] Collision avoidance and minimum spacing.
- [ ] Sub-circuits placed as single blocks; user can drill in via the Block Viewer.
- [ ] `examples/tests/test-hdl-layout.mjs` — verify that imported designs have no overlapping components and all wires connect.

#### Phase 10 — Import UX, End-to-End Tests & Release
- [ ] `FILE → Import → Verilog (.v)` menu item with file picker.
- [ ] Module picker dialog when the file contains multiple modules (user selects the top).
- [ ] Import report — modal showing "Imported N modules, M gates, K flip-flops. Skipped X constructs (details…)".
- [ ] Round-trip suite: for each example in `examples/circuits/`, do `export → import → export` and diff the two Verilog outputs (should match modulo comments).
- [ ] Optional `yosys-verify.mjs` — if `yosys` is on PATH, run synthesis on every exported file in CI and assert zero errors.
- [ ] README section: capability matrix (what Verilog subset is supported), known limitations, example workflows.
- [ ] Tag release as `v2.0 — HDL toolchain`.

### Success Criteria (End-of-Phase 6 MVP)

- Exporting the Simple CPU example produces Verilog that synthesises in Yosys with zero errors and zero critical warnings.
- A generated testbench simulated in Verilator produces a VCD that, when imported into Waveform Pro, is bit-identical to the native simulation VCD.
- Adding a hypothetical new component requires editing exactly one translator file and adding exactly one test case — no changes to exporter core.

### Success Criteria (End-of-Phase 10 Full Release)

- Any hand-written Verilog within the documented subset imports to a valid, simulatable canvas circuit.
- Round-trip (export → import → export) on the full example library produces byte-stable output.
- External contributors can submit a single-file translator PR to add a new component's HDL support without understanding the rest of the codebase.

---

## License

MIT
