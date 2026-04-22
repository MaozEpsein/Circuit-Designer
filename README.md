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

The next major initiative. Converts Circuit Designer from a self-contained simulator into a first-class RTL design tool that interoperates with the industry toolchain (Yosys, Verilator, ModelSim, Vivado, FPGA flows).

The **logic, IR, parser, translators, verification harness, and documentation** live in a new module under `js/hdl/` and are fully isolated from existing subsystems. **Integration touchpoints are intentional and minimal**, limited to: one export button wired into [app.html](app.html) + [js/app.js](js/app.js); a preview modal (Phase 7) and an import modal (Phase 12) that mount into existing UI containers; and read-only consumption of `SceneGraph.serialize()` and `SimulationEngine` values. No existing subsystem's behaviour is modified.

### Goals

| Goal | Outcome |
|---|---|
| Export a circuit to synthesizable Verilog | `.v` file opens in Yosys / Verilator / Vivado, passes synthesis, matches simulation cycle-for-cycle |
| Generate an automated testbench | Verilog TB that drives the same inputs and dumps VCD, importable back into Waveform Pro for diff |
| Import a Verilog subset back into the canvas | Common synthesizable constructs (assign / always / case / module instantiation) reconstruct the schematic |
| Zero impact on existing runtime | Export/import only run on explicit user action; no cost to the render or simulation loops |
| Graceful extensibility | Adding a new component requires one translator function, nothing else |

### Design Principles

The toolchain is built on five non-negotiable principles. They trade raw development speed for a system that is **correct, reversible, and user-friendly** — the plan is intentionally 2-3× longer than a naive one.

1. **IR-centric architecture.** All translation flows through a single typed intermediate representation (`HDL-IR`) defined in `js/hdl/ir/`. Export path: `circuitJSON → IR → Verilog`. Import path: `Verilog → AST → IR → circuitJSON`. The IR is the contract; both sides are tested against it independently, and round-trip (IR → … → IR) is a property-level equality check, not a string diff.
2. **Four-tier verification per phase.** Every phase that produces Verilog must pass:
   - (L1) **syntactic** — `iverilog -t null` parses every output without error.
   - (L2) **semantic** — `iverilog + vvp` simulates the output and the VCD matches our native simulator bit-for-bit over a scripted stimulus, **with the stability contract**: reset and initialisation cycles are skipped before the diff starts, because iverilog is 4-state (`x` on uninitialised registers) while our simulator is 3-state (`0` by default). The diff begins at the first stable cycle where both sides have driven every signal.
   - (L3) **round-trip** — exporting, re-importing, and re-exporting yields an IR identical to the original. A phase is not complete until all three layers pass for everything it touches. **L3 is vacuous until a real Verilog reader lands** — see the "Verification Oracle Strategy" section below for the Yosys-based path that makes L3 real from Phase 3 onwards.
   - (L4) **synthesis** — `yosys -p "synth_ice40; check -assert"` against a fixed synthesis target (**iCE40** via nextpnr) completes with zero errors and zero critical warnings. iCE40 is the synthesis contract for v1; other targets may be added later but L4 is defined against iCE40 so "synth-clean" is unambiguous.
3. **External tooling is a hard test dependency.** Two tools are required to run the HDL test suite:
   - `iverilog` (Icarus Verilog, ~2 MB, MIT, Windows/Linux/macOS) — powers L1 and L2.
   - `yosys` (YosysHQ, ~50 MB with iCE40 target, ISC, Windows/Linux/macOS) — powers L3 and L4, and serves as the Verilog reader for the import path (see Oracle Strategy below).

   CI fails if either is missing. Installation instructions live in `js/hdl/INSTALL.md`.
4. **User-facing flow is one click + one modal.** Export: click `VERILOG` → modal shows preview with copy / download / "open in editor" → done. Import: drag-and-drop a `.v` onto the canvas *or* click `IMPORT VERILOG` → one modal shows parse progress, module picker if multi-module, import report → circuit appears on canvas. No multi-step wizards, no CLI, no configuration files for the common case.
5. **Supported subset is versioned and enforced.** `js/hdl/SUPPORTED.md` lists every Verilog construct the importer accepts, with examples. Unsupported constructs fail with a precise line/column error — never silently dropped. The file is updated atomically with each phase that expands the subset.
6. **Source text preservation from day one.** Every IR node carries an optional `originalText: string | null` — the exact Verilog fragment it was parsed from, if any. Export-only IRs have `originalText = null`; imported IRs preserve their source spans. This enables Phase 12's Fidelity Mode (re-emit comments, formatting, identifiers verbatim for imported code) without retrofitting the IR later. Canonical mode ignores `originalText`; Fidelity mode prefers it.

### Verification Oracle Strategy

Writing a full Verilog parser is a multi-month effort and a large maintenance surface. The plan adopts **Yosys as a semantic oracle** for all Verilog reading, reusing a battle-tested industrial parser and elaborator instead of reimplementing one.

**Pipeline at L3 / L4 / import:**

```
IR → toVerilog → Verilog string
                    │
                    ├──► yosys -p "read_verilog; proc; write_json"     (L3 / import)
                    │       └─► Yosys JSON (structural netlist)
                    │             └─► verify/yosysJsonToIR.js (~800-1200 LOC)
                    │                   └─► IR'
                    │                         └─► equals(IR, IR') or circuit reconstruction
                    │
                    └──► yosys -p "synth_ice40; check -assert"         (L4)
                            └─► pass / fail + warning surface
```

**Yosys JSON format (summary, for adapter implementers):**

- Top-level: `{ creator, modules: { <name>: <Module> } }`
- Module: `{ attributes, parameter_default_values, ports, cells, memories, netnames }`
- Port: `{ direction: "input"|"output"|"inout", bits: [int|"0"|"1"|"x"|"z"], offset?, upto?, signed? }`
- Cell: `{ type, parameters, port_directions, connections: { <port>: [bits] }, hide_name }`
- Signals: each bit is either an integer ID (wire) or a string literal `"0"`/`"1"`/`"x"`/`"z"`.
- `hide_name: 1` marks Yosys-generated identifiers; `0` marks preserved user names.
- Full spec: [Yosys write_json documentation](https://yosyshq.readthedocs.io/projects/yosys/en/latest/cmd/write_json.html).

**Critical flow choices (non-obvious, locked in here):**

1. **`read_verilog; proc; write_json` — NO `synth`, NO `flatten`.** `synth` tech-maps to gates and destroys sub-module boundaries. `flatten` collapses hierarchy. Round-trip and import both need hierarchy preserved, so `proc` (which just lowers `always` blocks into `$dff`/`$mux` primitives) is the maximum elaboration we run before reading back.
2. **L4 runs `synth_ice40` on a separate invocation.** Synthesis is a one-way check, not part of the import pipeline.
3. **Width canonicalisation pass.** Yosys resolves implicit Verilog width rules more aggressively than our IR (which uses explicit `ZeroExtend`/`SignExtend`). Before `equals(IR, IR')`, both sides run through `ir/canonicaliseWidths.js` so comparisons do not flag semantically-identical IRs as different purely due to extension style.
4. **`$pmux` unrolling.** Yosys emits parallel muxes (`$pmux`) for `case` statements. Our import adapter unrolls them into binary MUX trees that match the palette's MUX component. Adapter scope therefore includes a `$pmux → N × $mux` expansion pass.

**What Yosys does NOT do for us:**

- It cannot recover comments, exact whitespace, or the original identifier when the name was sanitised. That job belongs to Fidelity Mode (`originalText` field on IR nodes; see principle 6).
- It cannot infer intent beyond structure — a `case` statement is always a `$pmux`, even if the user meant a priority encoder. Our import pass re-infers priority from `casez`/`if-else` chains.
- It cannot catch tri-state misuse — that remains our responsibility via `ir/lowerTriState.js` (see SEMANTICS.md).

### Module Layout

```
js/hdl/
├── VerilogExporter.js            — public entry: circuitJSON → Verilog string
├── VerilogImporter.js            — public entry: Verilog string → circuitJSON
├── SUPPORTED.md                  — versioned list of accepted Verilog constructs
├── ir/
│   ├── types.js                  — HDL-IR node definitions (Module, Net, Instance, …)
│   ├── fromCircuit.js            — circuitJSON → IR
│   ├── toCircuit.js              — IR → circuitJSON
│   ├── toVerilog.js              — IR → Verilog string (pretty printer)
│   ├── fromAST.js                — parser AST → IR (hand-written parser path, Phase 8)
│   ├── fromYosysJSON.js          — Yosys write_json → IR (primary import path, Phase 3+)
│   ├── lowerTriState.js          — BUS + TRIBUF → one-hot MUX pass (Phase 3)
│   ├── canonicaliseWidths.js     — normalise extensions to match Yosys resolution
│   ├── unrollPmux.js             — $pmux → N × $mux expansion (import side)
│   └── equals.js                 — structural IR equality for round-trip tests
├── translators/                  — one file per component family (IR-producing)
│   ├── index.js                  —   registry + dispatch, typed ctx API
│   ├── logic-gates.js
│   ├── arithmetic.js
│   ├── muxing.js
│   ├── flip-flops.js
│   ├── registers.js
│   ├── memory.js
│   └── cpu.js
├── parser/                       — Verilog subset parser
│   ├── lexer.js
│   ├── ast.js
│   ├── parse.js
│   └── elaborate.js              — parameter resolution, width inference
├── layout/
│   └── grid-layout.js            — DAG-layered auto-placement for imports
├── verify/
│   ├── iverilog.js               — wraps `iverilog + vvp`, returns VCD
│   ├── vcdDiff.js                — cycle-accurate VCD comparison (with stability-skip window)
│   ├── yosys.js                  — wraps `yosys`, returns JSON / synth report
│   ├── synthCheck.js             — L4 wrapper: `synth_ice40; check -assert` (iCE40 target)
│   ├── irGenerator.js            — constraint-satisfying random IR generator for property tests
│   └── roundTrip.js              — IR → Verilog → Yosys JSON → IR identity harness
└── ui/
    ├── ExportModal.js            — preview + copy/download/open
    ├── ImportModal.js            — drag-drop, module picker, report
    └── syntaxHighlight.js        — lightweight Verilog highlighter

examples/tests/                   — per-phase test runners (invoke verify/*)
```

### Phases

Each phase produces a concrete, testable deliverable gated on all three verification tiers (L1/L2/L3) where applicable. Work one phase at a time; do not skip ahead.

#### Phase 1 — Foundation & Export Skeleton
- [x] Create `js/hdl/` directory structure exactly as above.
- [x] Write `VerilogExporter.js` with a single exported function `exportCircuit(circuitJSON, options) → string`.
- [x] Define the translator registry in `translators/index.js` — a map `{ componentType → translatorFn(node, ctx) }`.
- [x] Implement module header generation: `module top(input ..., output ...);`.
- [x] Implement wire declaration pass — every net in the circuit becomes a `wire` line, with bus widths (`[N-1:0]`).
- [x] Implement a safe-identifier sanitizer (Verilog reserved words, illegal chars in node labels).
- [x] Wire a `FILE → Export → Verilog (.v)` menu item that downloads the result.
- [x] Add `examples/tests/test-hdl-skeleton.mjs` — checks that an empty circuit exports a valid empty module.

#### Phase 2 — HDL-IR & Verification Harness
The IR is introduced *before* any more translators are written, so every subsequent phase produces IR first and Verilog second. Verification infrastructure is stood up alongside.
- [x] Define `ir/types.js` — `IRModule`, `IRNet` (name, originalName, width, kind: wire/reg/tri), `IRPort` (dir, width, name), `IRInstance` (type, instanceName, portMap, params), `IRAssign` (lhs, rhsExpr), `IRAlways` (sensitivity, body), `IRMemory`, expression nodes (`BinaryOp`, `UnaryOp`, `Concat`, `Replicate`, `Literal`, `Ref`, `Slice`, `ZeroExtend`, `SignExtend`). Every node carries a `sourceRef` back-pointer + `attributes[]` for opaque metadata.
- [x] Additional foundation: `core/SourceRef.js`, `core/HDLError.js` (ErrorOverlay-compatible), `core/CircuitValidator.js`, `core/identifiers.js`.
- [x] `SEMANTICS.md` — locks 3-state (0/1/null=z) ⇄ Verilog 4-state mapping; `x` rejected with `HDL_ELAB_X_VALUE`.
- [x] `SUPPORTED.md` — scaffold; each phase appends.
- [x] Implement `ir/fromCircuit.js` — rewrites the net-gathering logic from Phase 1 into IR construction with formalised translator `ctx` API (`netOf`, `widthOf`, `instanceName`, `sanitize`).
- [x] Implement `ir/toVerilog.js` — deterministic pretty printer (sorted portMap / params, explicit determinism contract). Produces byte-identical output for structurally-identical IR.
- [x] Implement `ir/equals.js` — structural equality via canonicalised JSON (ignores `sourceRef` / `attributes`), plus `equalsByVerilog` fallback.
- [ ] **Pipeline metadata** (merged in from the old *Pipelining Phase 11*) — `fromCircuit` copies each node's `stage` field (populated by the pipelining analyzer) into `IRInstance.attributes.stage`. Consumed by the Phase 4 PIPE translator (stall/flush semantics) and the Phase 7 export UX (stage comments + violation-gate). The IR type system needs no change — `attributes[]` was designed exactly for opaque cross-phase metadata.
- [x] Refactor `VerilogExporter.js` to the 3-stage pipeline: `validateCircuit → fromCircuit → toVerilog`. Phase 1 tests pass unchanged.
- [x] Implement `verify/iverilog.js` — detects iverilog on PATH, wraps `iverilog -g2012 -o out.vvp … && vvp out.vvp`, returns `{ vcd, stderr, ok, skipped }`. Skips cleanly if iverilog absent.
- [x] Implement `verify/vcdDiff.js` — parses two VCDs, aligns by signal name + time, reports first divergence with context.
- [x] Implement `verify/roundTrip.js` — given an IR, runs `toVerilog → (stub parser until Phase 8) → equals`. **⚠ The stub is vacuous with respect to Verilog fidelity** (returns the sidecar IR verbatim without reading the emitted string); it exists to pin the harness API. True Verilog round-trip coverage begins at Phase 8 when the real parser lands and gets plugged in.
- [x] `examples/tests/test-hdl-ir.mjs` — 31 checks covering IR, validator, determinism, round-trip, iverilog L1 parse, error shapes.
- [x] `examples/tests/run-hdl.mjs` — parallel test runner (one process per test file, `cpus().length` workers, `--serial` fallback).

#### Phase 3 — Combinational Translators (vertical slice first, then breadth)
Start with one gate end-to-end through **all four verification tiers including Yosys-based L3**; only then fan out. This catches `ctx`-API gaps and Yosys-adapter gaps before they get baked into 15 translators.
- [ ] **Build Yosys integration first (before any translator):**
  - [ ] `verify/yosys.js` — detects yosys on PATH, wraps `yosys -p "read_verilog <f>; proc; write_json -o <o>"`. Skips cleanly if absent.
  - [ ] `verify/synthCheck.js` — separate wrapper for `synth_ice40; check -assert`, parses warnings/errors.
  - [ ] `ir/fromYosysJSON.js` — adapter. Scope: module → ports / netnames / cells ($-primitives: `$and`, `$or`, `$xor`, `$not`, `$mux`). Memory and sequential cells deferred to Phases 4-5. Signal bit encoding (int IDs + `"0"`/`"1"`/`"x"`/`"z"` constants) translated to `Ref`/`Slice`/`Concat`/`Literal`.
  - [ ] `ir/canonicaliseWidths.js` — runs on both sides of `equals` before comparison.
  - [ ] `ir/unrollPmux.js` — stub (real expansion starts when `case` translators land below).
  - [ ] Swap the stub parser in `verify/roundTrip.js` for the Yosys path. L3 becomes real from this point forward.
- [ ] **Vertical slice — AND gate only**: translator produces `IRInstance` with a primitive `and` type, `toVerilog` lowers to `and gN(y, a, b);`, L1 iverilog parses, L2 simulation matches native (after stability-skip window) for all 4 input combinations, L3 round-trip through Yosys produces an IR structurally equal to the input, L4 `synth_ice40` passes with zero warnings.
- [ ] Formalize the translator `ctx` API: `ctx.netOf(nodeId, pinKind, pinIdx)`, `ctx.widthOf(nodeId, pinKind, pinIdx)`, `ctx.instanceName(node)`, `ctx.param(node, key)`, `ctx.addDecl(decl)`. Document in `translators/index.js` header.
- [ ] Fan out remaining gates: OR, XOR, NAND, NOR, XNOR, NOT, BUF, TRI.
- [ ] Arithmetic: Half Adder, Full Adder — `assign` form.
- [ ] Comparator (EQ / GT / LT flags) — signed/unsigned aware.
- [ ] MUX / DEMUX / Decoder / Encoder — `case` with width-parametric ports.
- [ ] Bus MUX (multi-bit), Sign Extender (`{ {N{msb}}, data }`), Zero Extender.
- [ ] **L1/L2/L3/L4 gate**: every component is tested with a scripted stimulus; iverilog VCD diffs against native VCD with zero mismatches (after stability-skip); Yosys round-trip produces equal IR; `synth_ice40` completes clean.
- [ ] `examples/tests/test-hdl-combinational.mjs` — exhaustive truth tables for small inputs, random vectors for wider buses.
- [ ] `ir/lowerTriState.js` — implement the BUS → one-hot MUX pass declared in [SEMANTICS.md](js/hdl/SEMANTICS.md). Standalone test on synthetic IR (no BUS translator yet); full usage exercised in Phase 5.

#### Phase 4 — Sequential Translators
- [ ] Flip-Flops: D, T, SR, JK — `always @(posedge clk or negedge clr_n)` blocks; reset polarity honours exporter option.
- [ ] Latches: D, SR — `always @(*)` with explicit sensitivity, Verilator lint-clean.
- [ ] Registers (N-bit, EN / CLR / CLK).
- [ ] Shift Register (bidirectional, parametric width).
- [ ] Counter (EN / LOAD / DATA / CLR) with TC output.
- [ ] **Pipeline Register** (`PIPE_REG`) — full pipeline-aware translation (merged in from the old *Pipelining Phase 11*):
  - Stage-wise `always @(posedge clk)` with `if (!stall) q <= d;` / `if (flush) q <= 0;` semantics, mirroring the engine's runtime behaviour.
  - `stage` attribute (placed on the IR node by `fromCircuit`) preserved through to Verilog as a leading comment (`// Stage N: <label>`) so the generated HDL is navigable without losing the pipeline structure.
  - **L2/L3 gate**: a scripted stimulus across `examples/circuits/pipeline-demo.json` must produce a VCD that matches the native simulation bit-for-bit over ≥256 cycles after the standard stability window.
- [ ] Clock tree correctness — a circuit with multiple clock domains must emit each `always` block sensitive to the correct clock.
- [ ] **L1/L2/L3 gate**: clocked stimulus simulated in both engines for ≥1024 cycles, VCD identical; round-trip through IR stable.
- [ ] `examples/tests/test-hdl-sequential.mjs`.

#### Phase 5 — Memory & CPU Translators
- [ ] RAM → `reg [W-1:0] mem [0:DEPTH-1]`, sync write, async read. `$readmemh`-initialized when contents are non-zero.
- [ ] ROM → preferred emission: `initial begin mem[0]=…; end`. Large ROMs spill to a sidecar `.hex` file.
- [ ] Register File (multi-port, parametric read/write ports).
- [ ] FIFO / Stack (full / empty / almost-full flags; gray-code pointers documented in a comment).
- [ ] PC, ALU, IR, CU, BUS, IMM — each gets its own translator with a dedicated `ctx.param` surface.
- [ ] Tri-state (`z`) handling audited — the exporter warns if it emits `z` in a context iverilog cannot simulate deterministically.
- [ ] **BUS translator emits raw tri-state IR; `lowerTriState` (from Phase 3) runs as part of `fromCircuit` and converts to one-hot MUX before `toVerilog`.** Synthesis-safe by default; `synthesisSafe: false` flag preserves raw `1'bz` for sim-only users.
- [ ] L4 gate specifically exercised on BUS: a CPU circuit with ≥3 bus drivers must synthesise under `synth_ice40` with zero tri-state warnings.
- [ ] **L1/L2/L3 gate**: full Simple-CPU countdown program exported, simulated in iverilog, VCD identical to native.
- [ ] `examples/tests/test-hdl-cpu.mjs`.

#### Phase 6 — Hierarchy & Sub-circuits
- [ ] Each sub-circuit exports as its own `module` above `module top`.
- [ ] Width-parametric sub-circuits emit `parameter WIDTH = N` with `#(.WIDTH(N))` at instantiation sites.
- [ ] Identical sub-circuit definitions are de-duplicated by content hash.
- [ ] Port-name collision handling (internal labels never shadow top-level).
- [ ] Nested hierarchies (≥3 levels deep) — recursive with memoization.
- [ ] **L3 gate**: round-trip of a 3-level design yields byte-identical output on second export.
- [ ] `examples/tests/test-hdl-hierarchy.mjs`.

#### Phase 7 — Export UX
One-click flow, no configuration needed for the common case.
- [ ] `ui/ExportModal.js` — opens on click. Shows generated Verilog with JetBrains Mono + syntax highlight (keywords, numbers, comments, ports). Buttons: `COPY`, `DOWNLOAD .v`, `DOWNLOAD PROJECT .zip` (v + tb + VCD), `OPEN IN EDITOR` (OS default for `.v`).
- [ ] Live re-render — toggling `top module name` / `reset polarity` / `clock name` options re-renders the preview in <50 ms for the example library.
- [ ] Right-click a block → `Copy as Verilog` or `Export this block` (no full-project export needed).
- [ ] Testbench generator — emits `<top>_tb.v` that replays the current waveform stimulus and dumps a VCD; bundled in the project zip.
- [ ] Error surface — any component lacking a translator → non-blocking warning panel with component type, `id`, and the `// TODO:` line number in the preview.
- [ ] Progress indicator for designs with >1000 components (should still be <1 s, but feedback is mandatory).
- [ ] **Pipeline-violation gate** (merged in from the old *Pipelining Phase 11*) — when the pipelining analyzer reports cross-stage violations on the circuit, `exportCircuit` refuses to produce Verilog and the modal surfaces the violation list with a *"force anyway"* checkbox. Override sets `options.forcePipelineViolations = true`, which emits the Verilog unchanged but tags every offending wire with a `// WARNING: pipeline violation` comment.
- [ ] Stage comments pass — when IR nodes carry a `stage` attribute (set by `fromCircuit` from the pipeline analysis), the pretty-printer groups instances by stage and emits `// ─── Stage N ───` dividers between groups. Applies to `toVerilog` generally, not just to PIPE registers.
- [ ] `examples/tests/test-hdl-export-ux.mjs` (DOM-only, no browser).

#### Phase 8 — Hand-Written Verilog Lexer & Parser (Fidelity Layer)
The primary Verilog reader is Yosys (Phase 3). This phase builds a **hand-written parser in parallel** — used by Fidelity Mode (Phase 12), by error messages that need exact source spans, and as a fallback for Verilog inside our subset but rejected by the specific Yosys version in use.
- [ ] Lexer — identifiers, sized & unsized numbers (`8'hFF`, `4'b10x1`), operators, keywords, line/block comments, attributes `(* … *)` (preserved but ignored). Exact line/col tracking. Mirrors the pattern of [js/cpu/compiler/Lexer.js](js/cpu/compiler/Lexer.js).
- [ ] AST — `Module`, `Port`, `ParamDecl`, `Net`, `Reg`, `Assign`, `AlwaysBlock`, `InitialBlock`, `Case`, `If`, `For` (unroll-only), `Instantiation`, `GateInstance`, `BinaryOp`, `UnaryOp`, `Ternary`, `Concat`, `Replicate`, `Slice`, `SystemCall` (e.g. `$readmemh`). Every AST node carries the exact source range, which becomes `IRNode.originalText`.
- [ ] Parser — recursive descent, error recovery at statement boundaries, precise `file:line:col` messages with the offending token and expected set.
- [ ] Parser resource limits — max recursion depth, max token count, timeout. Prevents adversarial `.v` from hanging the importer.
- [ ] `SUPPORTED.md` — first version committed: lists every accepted construct with a tiny example for each.
- [ ] **L1 gate**: the parser round-trips every `.v` file produced by Phases 3-6 without error, and the AST → Verilog pretty-print preserves semantics (iverilog simulation identical before/after).
- [ ] **Cross-check gate**: for every `.v` file in the external corpus, Yosys JSON-derived IR and hand-written-parser-derived IR are structurally equal (modulo the width canonicalisation pass). Divergences point at bugs in either side.
- [ ] `examples/tests/test-hdl-parser.mjs`.

#### Phase 9 — Elaboration & AST → IR (Fidelity Path)
Yosys handles elaboration for the primary import path; this phase produces the parallel hand-written elaborator that consumes the Phase 8 AST. Both paths converge on the same IR.
- [ ] Parameter resolution — constant folding, `parameter WIDTH = 8; wire [WIDTH-1:0] d;` resolves to width 8.
- [ ] Width inference — every net and expression gets a concrete width; mismatches become errors with line/col. Output runs through `ir/canonicaliseWidths.js` so comparisons with Yosys-derived IRs are sound.
- [ ] Gate primitives (`and`, `or`, `xor`, `not`, `buf`, `nand`, `nor`, `xnor`) → IR primitive instances.
- [ ] `assign` → IR `Assign` + expression-tree lowering (deferred to Phase 10 for gate-level materialization).
- [ ] `always @(*)` with `case` / `if` / `?:` → IR `Always` nodes. Case statements that would naturally map to `$pmux` pass through `ir/unrollPmux.js` so the final IR is always a binary MUX tree regardless of which parser produced it.
- [ ] `always @(posedge clk [or negedge rst_n])` → IR sequential `Always` with explicit clock/reset refs.
- [ ] Memory patterns (`reg [W-1:0] mem [0:D-1]` + canonical read/write) → IR `MemoryInstance`.
- [ ] Sub-module instantiation → IR `Instance` with recursive module resolution.
- [ ] Unsupported construct → hard error with line/col and a pointer to `SUPPORTED.md`.
- [ ] `originalText` populated on every IR node from the AST's source range, enabling Phase 12 Fidelity Mode.
- [ ] **L3 gate**: parse → AST → IR for every file produced by Phases 3-6 yields an IR equal (modulo renames and width canonicalisation) to the one originally exported **AND** equal to the Yosys-derived IR of the same file.
- [ ] `examples/tests/test-hdl-elaborate.mjs`.

#### Phase 10 — IR → circuitJSON & Component Inference
This is the step that turns imported RTL back into a schematic. IR stays the source of truth.
- [ ] Primitive IR instances (`and`, `or`, …) → palette gate components, 1:1.
- [ ] Expression-tree lowering — `y = (a & b) | c` becomes AND + OR components with intermediate wires (preferred), or left as a single `assign`-backed "Expression Block" if the tree is wider than a threshold (user-configurable).
- [ ] MUX inference — `case` with one selector and mutually-exclusive cases → MUX component.
- [ ] Priority MUX — `if / else if` chain → MUX tree.
- [ ] Sequential inference — sequential `Always` with one non-blocking assign per cycle → Flip-Flop or Register; multiple → Register File or bespoke `AlwaysBlock` component (new palette type only if unavoidable).
- [ ] Memory inference — IR `MemoryInstance` → RAM or ROM (chooses by presence of write port).
- [ ] Sub-module instantiation → nested sub-circuit on the canvas with proper port mapping.
- [ ] Anything the inferer cannot canonicalize is preserved as a "Verilog Block" component that holds the original AST fragment and re-emits verbatim on export — guarantees round-trip safety even for non-canonical RTL.
- [ ] **L3 gate (whole-system)**: for every `.v` in the Phase-3-to-6 output set, `import → export` produces byte-identical Verilog.

#### Phase 11 — Auto-Layout for Imported Designs
- [ ] DAG topological layering — inputs on the left, outputs on the right, combinational depth determines column.
- [ ] Grid placement within each column (deterministic, stable — two imports of the same file produce the same layout).
- [ ] Wire routing — reuse the existing Manhattan router with Bezier corners.
- [ ] Collision avoidance, minimum spacing, lane allocation for buses.
- [ ] Sub-circuits placed as single blocks; user drills in via the Block Viewer.
- [ ] Large design handling — if the imported circuit exceeds N components, layout runs in a Worker with a progress bar.
- [ ] `examples/tests/test-hdl-layout.mjs`.

#### Phase 12 — Import UX & Fidelity Mode
One modal, drag-and-drop primary, picker secondary. Fidelity Mode lands here because the supporting IR field (`originalText`) has existed since Phase 2.
- [ ] `ui/ImportModal.js` — accepts a `.v` file by drag-and-drop onto the canvas *or* via `IMPORT VERILOG` button.
- [ ] Parse phase — shows a progress bar and the first parse error (if any) with a click-to-highlight line in a built-in viewer.
- [ ] Module picker — if the file contains >1 module, user selects the top (the only required interaction).
- [ ] Import report — `"Imported 3 modules, 42 gates, 16 flip-flops, 1 RAM (2 KiB). Unmapped constructs preserved as Verilog Blocks: 0."`
- [ ] Undo-friendly — the entire import is one atomic undo step.
- [ ] "Replace current / Add as sub-circuit / Open in new tab" choice in the import modal.
- [ ] **Fidelity Mode toggle** — `CANONICAL` (re-emit from IR structure, comments lost, identifiers sanitised) vs `FIDELITY` (re-emit `originalText` for every node that has it; fall back to IR emission for nodes without). Default: CANONICAL. Fidelity Mode is the answer for users who import hand-written RTL and want to re-export it looking like they wrote it.
- [ ] Verilog Block canonicalisation — two users importing the same fragment must produce the same IR. The Verilog Block hashes the parsed AST (after parameter resolution) rather than the source text, so whitespace/comments do not cause spurious diffs while semantics do.
- [ ] `examples/tests/test-hdl-import-ux.mjs` (DOM-only).
- [ ] `examples/tests/test-hdl-fidelity.mjs` — imports a curated `.v` with comments / unusual formatting, round-trips in Fidelity Mode, asserts byte-identical output.

#### Phase 13 — End-to-End Round-Trip, Property Testing & Release
- [ ] Round-trip suite over the entire `examples/circuits/` library: `export → import → export`, expect byte-identical output under both CANONICAL and FIDELITY modes.
- [ ] External semantic round-trip: native VCD ≡ iverilog VCD ≡ (after import+re-export) iverilog VCD, for every example, with the stability-skip window applied.
- [ ] **Synthesis contract gate**: `yosys -p "synth_ice40; check -assert"` passes on every exported example, the external corpus, and every IR produced by the property-based generator. Zero critical warnings. iCE40 is the committed target; other targets may be added in follow-up releases.
- [ ] **Cross-path gate**: for every file in the external corpus, import via Yosys path AND import via hand-written parser path. The two resulting IRs must be structurally equal after `canonicaliseWidths`.
- [ ] **Property-based fuzz tests** (≥1000 seeds per CI run). Replaces the earlier hand-wave "generate random IRs":
  - [ ] `verify/irGenerator.js` — constraint-satisfying generator. Inputs: a budget (max nodes, max depth, allowed primitive types) and a seed. Output: a well-typed `IRModule` where every net has exactly one driver, every port is connected, every expression's width is resolvable. Rejection sampling is used to enforce the constraints, not blind randomness — a truly random tree is ill-typed >95% of the time.
  - [ ] Round-trip each generated IR through L1, L2, L3, L4. Any failure is persisted as a regression fixture under `examples/tests/fixtures/fuzz/` for deterministic replay.
- [ ] `examples/hdl-corpus/` finalised — at minimum: UART TX, BCD counter, 3-state FSM, small ALU, a slice of picorv32 within the subset. Every file documented with the constructs it exercises. Used by Phases 8-13.
- [ ] `SUPPORTED.md` finalized with capability matrix, known limitations, tested tool versions (iverilog, Yosys, Verilator, nextpnr).
- [ ] `INSTALL.md` — one-paragraph install instructions per OS for iverilog + yosys + nextpnr-ice40.
- [ ] README updates: `### HDL Quickstart` section (export in one click, import by drag-and-drop), troubleshooting.
- [ ] Tag release as `v2.0 — HDL toolchain`.

### Coverage Floor (per phase)

A floor, not a ceiling. Each phase commits to converting at least this percentage of its targeted corpus into **true schematic form** (real components, real wires), not into the Phase-10 `Verilog Block` fallback. Anything below the floor blocks phase completion.

| Phase | Corpus | Floor (schematic, not fallback) |
|---|---|---|
| 3 | All combinational examples under `examples/circuits/` + combinational files in `examples/hdl-corpus/` once it exists | 100% — every gate / adder / comparator / MUX must be a real component |
| 4 | All sequential examples | 100% — FFs, registers, counters, shift registers must be real components |
| 5 | RAM / ROM / register-file / ALU / CPU examples | 100% of palette-backed constructs; non-palette `reg`-array patterns may legitimately emit a `MemoryInstance` not a palette RAM, but not a fallback |
| 9 | Elaboration of Phase 3-6 exports back to IR | 100% — zero AST nodes fall through to "unsupported" |
| 10 | Inference of IR into canvas components | **≥ 95%** schematic for Phase 3-6 round-trip; **≥ 70%** for the external corpus (picorv32 snippets, UART TX, small FSMs); the rest may land as Verilog Block |
| 13 | Full external corpus after all inference rules land | **≥ 90%** schematic across every file; remaining 10% is logged and attributed |

The Verilog Block fallback is a safety net for round-trip byte-stability, not a substitute for coverage. A phase that meets only round-trip stability but falls below the floor is **not complete**.

### Known Risks & Mitigations

Kept visible so future contributors inherit the caveats that drove the design, not just the design itself.

| Risk | Mitigation | Phase |
|---|---|---|
| Stub parser in Phase 2 makes L3 vacuous | Yosys adapter replaces the stub at Phase 3 start; the stub's vacuous nature is called out in source comments | 3 |
| 4-state `x` from iverilog on uninitialised regs breaks VCD diff | L2 stability-skip window documented in SEMANTICS.md; diff begins only after every signal has been driven | 3 |
| Internal tri-state fails FPGA synthesis silently | `ir/lowerTriState.js` runs before `toVerilog` when `synthesisSafe !== false`; L4 `synth_ice40` catches the regression anyway | 3 implementation, 5 exercised |
| Yosys resolves widths differently than our IR | `ir/canonicaliseWidths.js` normalises both sides before `equals` comparison | 3 |
| `$pmux` is not 1:1 with our MUX palette | `ir/unrollPmux.js` expands parallel muxes into binary MUX trees before inference | 3 scaffolded, 10 exercised |
| Yosys version drift (format additions) | Minimum Yosys version pinned; adapter ignores unknown fields per format spec | 3 |
| Hand-written parser diverges from Yosys on corner cases | Phase 8 cross-check gate asserts both paths produce equal IR for every corpus file | 8 |
| Property-based fuzz produces ill-typed IRs 95% of the time | Generator uses constraint satisfaction + rejection sampling, not blind randomness | 13 |
| Coverage floors on external corpus are optimistic | Corpus is curated to live inside the documented subset; floor is "100% of curated corpus" not "70% of arbitrary RTL" | 13 |
| Line-ending corruption (CRLF on Windows) breaks byte-identical tests | `.gitattributes` pins `*.v` and `*.json` fixtures to LF | 3 setup task |
| Fidelity Mode requires `originalText` that was never stored | `originalText` field added to IR in Phase 2 retroactively; import paths populate it from Phase 8 onwards | 8/9/12 |

### Success Criteria (End-of-Phase 7 — Export MVP)

- Every example in `examples/circuits/` exports Verilog that (a) parses in iverilog with zero errors, (b) simulates to a VCD bit-identical to the native simulation over ≥1024 cycles, (c) synthesises in Yosys with zero errors and zero critical warnings.
- Export UX: one click opens a modal with highlighted preview, copy, download, and "open in editor" — no wizard, no configuration for the common case.
- Adding a new component requires editing exactly one translator file and adding exactly one test case — zero changes to exporter core, IR types, or UX.

### Success Criteria (End-of-Phase 13 — Full Release)

- Any hand-written Verilog within the documented subset (`SUPPORTED.md`) imports to a valid, simulatable canvas circuit with accurate inference (gates as gates, MUXes as MUXes, FFs as FFs, RAM as RAM).
- Unsupported constructs that still round-trip safely are preserved as Verilog Blocks — no data loss on import/export cycles.
- Round-trip (`export → import → export`) on the full example library produces byte-identical output.
- Import UX: drag-and-drop a `.v` onto the canvas → one modal (progress + picker + report) → circuit on canvas. Undo reverts the entire import atomically.
- Fuzz suite passes ≥1000 random IRs per CI run without a single round-trip mismatch.
- External contributors can submit a single-file translator PR to add a new component's HDL support without understanding the rest of the codebase.

---

## Pipelining — Quick Start

Five-minute tour of every analysis feature, using pre-built demos. Open the app, click **EXAMPLES**, and switch to the **Pipeline** tab.

### 1. See a pipeline analyzed
Load **Pipeline Demo (3-stage)**. Click the **PIPE** button in the top bar. The panel opens with:
- **Latency** in cycles, **Bottleneck** stage, **f_max** in MHz/GHz, **Balance** as a percentage.
- One row per stage with its delay in picoseconds and a bar chart showing relative load.
- Click **STAGES** in the panel header to colour-code nodes on the canvas by stage.

### 2. Balance a pipeline automatically
Load **Pipeline Demo — Imbalanced 3-stage (for retiming)**. The panel shows **Balance 33 %** — stage 0 is dominant. Click **RETIME** in the panel header. A green banner proposes relocating a PIPE register across a gate; the canvas shows red / green ghost wires for the diff. Click **Accept** — every stage balances to the same delay. A bottom banner confirms the change was **verified by simulation** (estimator + measurer agreement). `Ctrl+Z` undoes in one step.

### 3. Spot hazards
Load **Pipeline Demo — All Hazards (RAW/WAR/WAW/LOOP)**. The panel's **HAZARDS** section lights up with four classified hazards — RAW, WAR, WAW, LOOP — each with a colour-coded badge, the affected wire, and an inline fix suggestion. Click any hazard row to zoom the canvas onto the offending wire.

### 4. Analyze a program
Load **בדיקת תלויות** (or any `pipeline-demo-program-*` variant). The panel's **PROGRAM HAZARDS** section decodes the ROM through the canonical 16-op ISA and reports every RAW / WAR / WAW dependency between consecutive instructions, with bubble counts, load-use flags, and the disassembled source + destination instructions.

### 5. Feel back-pressure
Load **Pipeline Demo — Elastic (valid/ready back-pressure)**. Both PIPE registers show the yellow **E** badge — stalls are driven by HANDSHAKE components wiring `valid ∧ ready` into the STALL pin. Toggle the **READY** input to `0` and hit Play — the pipeline freezes until READY returns to `1`. This is the canonical elastic-pipeline template.

### 6. Build your own
Drag a **PIPE** chip from the Pipeline palette tab. Wire data through it. Open the panel (it was already watching) — the moment the new circuit has at least one `PIPE_REG` with a valid data path, stages appear and the analyzer starts reporting delay, hazards, violations, and program-hazards (if there's a ROM). Everything below this Quick Start is incremental — analysis utilities ([js/analysis/](js/analysis/)), delay model ([js/pipeline/DelayModel.js](js/pipeline/DelayModel.js)), retimer internals — wired into the same panel. No extra configuration required.

---

## Pipelining — Development Plan

**Status**: design-stage. Prioritized ahead of the HDL Toolchain so pipeline-aware IR is available when HDL export matures.

**Goal**: Turn Circuit-Designer into a pipeline-aware EDA tool — identify stages, measure latency/throughput/f_max, flag cross-stage violations, support stall/flush and valid/ready handshake, detect hazards, and (stretch) auto-retime. Culminates in pipeline-aware Verilog export that feeds back into the HDL Toolchain.

**Architecture overview**: dedicated `js/pipeline/` feature folder (mirrors `cpu/`, `hdl/`, `waveform/`), with minimal, targeted hooks in `components/`, `core/`, `engine/`, `ui/`, and `hdl/`. One feature = one folder; shared code stays in the kernel.

### Running "PIPELINE" Example
Each phase — whenever applicable — adds to / updates a single evolving reference circuit: **`examples/pipeline-demo.json`**. It starts as the simplest possible pipelined design and grows with every new capability (stages, stall/flush, handshake, hazards, retime). At the end of the plan it is the canonical showcase: opens in-app, exercises every pipeline feature, matches a ready-to-run Verilog cosim in `examples/pipeline-demo.v`.

Per-phase update obligations are listed as **Example update** bullets inside each phase.

### Per-Phase Commit Discipline
Every phase ends with a commit — message format `pipeline(phase-N): <short summary>`. Scope: code + docs + example update for that phase, nothing else. Checkboxes in this plan are ticked in the same commit.

---

### Phase 1 — Foundations (Component + Metadata)
**Goal**: `PIPE_REG` is a first-class pipeline element; every node carries a `stage` field.
- [x] `PIPE_REG` already supports `channels` width + STALL/FLUSH pins in engine; default factory now also seeds `pipelineRole: 'register'` and `stage: null`. (`valid`/`ready` deferred to Phase 8.)
- [x] Added `stage: number | null` to node metadata (seeded at create; serializer keeps it; analyzer will overwrite in Phase 2).
- [x] Added `pipelineRole: 'data'|'control'|'register'|'boundary'` tag on nodes.
- [x] Palette: new **"Pipeline"** tab in `app.html`; PIPE moved to it. (`HANDSHAKE` + `STAGE_BOUNDARY` stubs deferred to their own phases — avoiding non-rendering chips.)
- [x] Command palette: *Insert PIPE Register* already existed; added *Toggle Stage View* (stub wired to `pipeline:stageview:toggle`, UX: toast "coming in Phase 4").
- **Example update**: created `examples/circuits/pipeline-demo.json` — 2-stage design (INPUT A/B → AND → PIPE_REG → OR with INPUT C → OUTPUT) + registered in the Examples menu.
- **Deliverable**: user drops a width-N PIPE, wires through, field nullable until analyzed.
- **Verify L1** — unit: serialize/deserialize preserves new fields.
- **Verify L2** — manual: drop PIPE, wire through, simulate → output arrives 1 cycle later.

### Phase 2 — Stage Evaluator (core pass)
**Goal**: clean, reusable levelization + per-stage depth pass (currently missing from the engine).
- [x] `js/pipeline/StageEvaluator.js`: Kahn topo-sort over data wires (clock wires skipped); cut at every `PIPE_REG`; assign `node.stage` 0..K-1; per-stage combinational depth (gate levels — PIPE/INPUT/OUTPUT/CLOCK pass-through).
- [x] Public API: `evaluate(scene) → { stages, cycles, bottleneck, hasCycle }` in `StageEvaluator.js`; wrapped by `PipelineAnalyzer` class with cache.
- [x] Cache invalidation on scene mutation via `EventBus` (`node:added/removed`, `wire:added/removed`, `scene:loaded/cleared`).
- [x] Fan-out / fan-in handled naturally — stage = max over predecessors + PIPE bump.
- [x] Hooked into Command Palette: *Analyze Pipeline* — logs stage table to console + toast with stage count & bottleneck. Exposed on `window.pipeline` for DevTools testing (`pipeline.analyze()`).
- **Example update**: `examples/circuits/pipeline-demo.json` extended to 3 stages with fan-out (`AND → PIPE1 → {NOT, OR+C} → PIPE2/PIPE3 → XOR → Q`).
- **Deliverable**: `PipelineAnalyzer.analyze()` returns correct stages for linear, branching, merging pipelines.
- **Verify L1** — unit: golden graphs (3-stage MAC, 5-stage RISC datapath).
- **Verify L2** — integration: run on bundled `examples/`.

### Phase 3 — Pipeline Panel (UI, read-only)
**Goal**: visible panel with latency / throughput / per-stage table.
- [x] `js/pipeline/ui/PipelinePanel.js` — static container `#pipeline-panel` in `app.html`, controller manages visibility + live rendering.
- [x] Panel shows: stage list (idx, depth, node count, bar chart); summary (latency, bottleneck stage+depth, throughput = 1/depth_max, balance %); bottleneck row highlighted red. Stage-highlighting overlay deferred to Phase 4.
- [x] Toggle via new HUD **PIPE** button + Command Palette (*Toggle Pipeline Panel*). Keyboard shortcut deferred to Phase 13.
- [x] Real-time update on scene mutation (debounced 200ms) + refresh on `pipeline:analyzed`.
- **Example update**: `pipeline-demo.json` (3 stages) now shows in the panel: `Latency 3 cycles, Bottleneck S0 (d=1), Throughput 1.000 /gate-delay, Balance 100%`.
- **Deliverable**: user opens panel, sees accurate numbers, can highlight any stage.
- **Verify L2** — manual on example circuits.
- **Verify L3** — screenshot regression.

### Phase 4 — Stage Overlay (canvas)
**Goal**: color-code stages on the main canvas.
- [x] `js/pipeline/ui/StageOverlay.js` + `setStageOverlay(state)` hook in `CanvasRenderer` — draws translucent coloured halos under each node, per `node.stage`.
- [x] Rotating palette of 8 distinct hues; bottleneck always overridden to red with a thicker stroke (no animation yet — deferred).
- [x] Highlight mode: click a stage row in the Pipeline Panel → that stage stays bright, others dim; click again to clear.
- [x] Toggle via Command Palette (*Toggle Stage View*) — live status shown in a toast.
- **Example update**: load `pipeline-demo.json`, enable Stage View → three distinct hues (cyan/green/yellow) visible; click a row in Pipeline Panel to isolate a stage.

### Phase 5 — Cross-Stage Validation
**Goal**: hard-flag wires that jump stages without an intervening `PIPE_REG`.
- [x] Violation detection now part of `StageEvaluator.evaluate()` result (`violations[]` with `wireId, srcId, dstId, srcStage, dstStage, missing`).
- [x] Rule: wire `src → dst` is a violation when `src` is not a `PIPE_REG` and `src` has another consumer in an earlier stage — i.e. the signal is being re-used downstream without being latched. Correctly ignores stage-agnostic inputs that happen to feed only later stages.
- [x] Violations listed in Pipeline Panel (red section, click → zoom-to-wire endpoints via `pipeline:jump-to-wire`).
- [x] Red dashed pulsing stroke on the offending wires via `setPipelineViolations(list)` hook in `CanvasRenderer`. (Warning mode only — simulation still runs.)
- [x] HDL export gating deferred to Phase 11 (where HDL export itself picks up pipeline awareness).
- **Example update**: added `examples/circuits/pipeline-demo-bad.json` — clean 2-stage pipeline with a shortcut wire `A → XOR` that skips PIPE. Validator flags it on load.
- **Tests**: `examples/tests/test-pipeline-phase5.mjs` — passes on clean + bad demos.

### Phase 6 — Per-Stage Critical Path + Bottleneck
**Goal**: real delay model, not just gate count.
- [x] `js/pipeline/DelayModel.js` — per-component delay table in picoseconds (gate 50 ps, adder 150, MUX 200, ALU 800, registers/IO 0, …); unknown types default to 100 ps.
- [x] `StageEvaluator` now computes weighted longest-path (`delayPs`) alongside gate count (`depth`). Tracks `critPred` per node to recover the exact critical chain.
- [x] Per-stage result includes `delayPs` and ordered `criticalPath[]` node IDs. Top-level `maxDelayPs` and `fMaxMHz` exposed.
- [x] Bottleneck is now delay-based (stage with max `delayPs`).
- [x] Panel shows `ps` per stage and **f_max** (auto-scales to MHz/GHz). Clicking a stage row highlights its critical path on the canvas (yellow dashed via `setPipelineCriticalPath`).
- **Example update**: same demo — measurable numbers now visible (3 × 50 ps ≈ 20 GHz theoretical with these toy delays).
- **Tests**: `examples/tests/test-pipeline-phase6.mjs` — passes.

### Phase 7 — Stall / Flush (synchronous control)
**Goal**: PIPE register responds to `enable` (stall) and `clear` (flush/bubble).
- [x] `SimulationEngine` already honours `PIPE_REG.STALL` (skip capture if 1) and `FLUSH` (drive 0) — pre-existing, confirmed during Phase 1 audit.
- [x] Palette commands *Insert Stall Input → Selected PIPE* / *Insert Flush Input → Selected PIPE* — auto-creates a labelled `INPUT` and wires it to the correct pin of the selected PIPE (undoable via `AddNodeCommand` + `AddWireCommand`). Toast feedback on missing selection / duplicate wire.
- [x] Pipeline Panel per-stage **S** / **F** badges (green `S` = stall wired, pink `F` = flush wired) — derived statically by `StageEvaluator` from wires into PIPE_REG inputs `channels` and `channels+1`.
- **Example update**: wire via palette commands — e.g. select PIPE1 in the demo → Ctrl+K → *Insert Stall Input* → new STALL input appears. Toggle it to 1 → PIPE freezes its value across clock edges.

---

**Milestone 1 (Phases 1–7)**: *"Pipeline-aware design + static analysis + basic control."* The tool can model a pipeline, measure it, validate it, stall it. Ship-ready mid-point.

---

### Phase 8 — Valid / Ready Handshake (elastic pipeline)
**Goal**: proper back-pressure between stages.
- [x] New `HANDSHAKE` component — 2 inputs (**V** valid, **R** ready), 2 outputs (**S** stall = NOT(V AND R), **F** fire = V AND R). Combinational, 60 ps delay.
- [x] Convention: wire **S** directly into a PIPE's STALL pin — auto-stall whenever downstream isn't ready or producer hasn't asserted valid.
- [x] Analyzer flags a stage as **elastic** when its PIPE's STALL source is a HANDSHAKE. Panel shows a yellow **E** badge on the stage row.
- [x] Palette chip under PIPELINE tab + Command Palette entry.
- **Example update**: promote the demo later — for now, the user can drop a HS manually between two PIPEs, wire V/R, observe E badge.

### Phase 9 — Hazard Detection
**Goal**: detect RAW / WAR / WAW across stages with feedback.
- [x] Analyze back-edges where a later stage writes a node read earlier. (`js/pipeline/HazardDetector.js` — iterative DFS with gray/black coloring; back-edge = data-wire `u → v` where `v` is already on the ancestor stack. Also WAW pass on the forward DAG: two stateful writers into the same `(target, inputIndex)`.)
- [x] Report: hazard type, source stage, sink stage, offending signal. (Each hazard record carries `type ∈ {RAW, WAR, WAW, LOOP}`, `wireId`, `srcId/dstId`, `srcStage/dstStage`, `cyclePath`.)
- [x] Suggestion engine: *"insert forwarding mux here"* or *"insert PIPE to match stages."* (Per-type suggestion strings attached to each hazard and shown under the row in the panel.)
- [x] Panel tab **"Hazards"**. (Summary line in the header + dedicated `HAZARDS (N)` section below Violations, with colored RAW/WAR/WAW/LOOP badges, stage arrow, clickable rows that `pipeline:jump-to-wire`, and inline fix suggestion. Hazard wires drawn on canvas as pulsing orange/magenta dashes, color-keyed by hazard type.)
- **Example update**: `examples/circuits/pipeline-demo-hazard.json` — 2-PIPE forward path + feedback arc from PIPE2 back to XOR (stage-0 reader) → classic RAW flagged on load. Registered in the Examples menu as *Pipeline Demo — RAW Hazard*.
- **Tests**: `examples/tests/test-pipeline-phase9.mjs` — 14 checks across the hazard demo (RAW on `w_raw`), a synthetic 2-NOT combinational loop (LOOP), a WAW collision (two PIPEs → same XOR pin), and the clean demos (no false positives).

### Phase 9.5 — Program Hazard Analysis (ISA-level)
**Goal**: detect RAW / WAR / WAW / load-use hazards **between consecutive instructions in ROM**, independently of the hardware graph. Phase 9 detects topological hazards in the datapath; Phase 9.5 detects hazards in the *program* running on that datapath. Two sub-milestones — **Easy** (hardcoded MIPS-5) ships first, then **Medium** (user-defined ISA + branches).

**Easy (MVP — hardcoded MIPS 5-stage):**
- [ ] `js/pipeline/isa/mips.js` — MIPS-I opcode table: `{opcode → {name, reads:[rs,rt], writes:[rd], fields:{rs:[25,21],rt:[20,16],rd:[15,11],imm:[15,0]}, latency, isLoad, isBranch}}`. Covers the ops used in `simple-cpu` + `mips-gcd`.
- [ ] `js/pipeline/InstructionDecoder.js` — reads a ROM node's memory, decodes word-by-word into `Array<{pc, raw, opcode, rs, rt, rd, imm}>`.
- [ ] `js/pipeline/ProgramHazardDetector.js` — pipeline-window scan with `W=5`. For each pair `(i, j)` with `j - i < W`: if `j` reads a register that `i` writes, emit `{type:RAW, loadUse:(i.isLoad && j-i===1), instI:i.pc, instJ:j.pc, reg, bubbles: W - (j - i) - 1}`. WAR/WAW fall out the same way under OOO; for a strict in-order 5-stage, report them as informational. Assumes no forwarding (Phase 14 adds that).
- [ ] Panel section **PROGRAM HAZARDS (N)** — rows like `PC 0x04 → PC 0x08  RAW on R1  (2 bubbles)` with a tooltip showing the decoded source/sink instructions. Clickable → highlights the two ROM addresses.

**Medium (user-defined ISA + branches):**
- [ ] ISA as data: `examples/isa/*.json` — `{name, wordBits, opcodes: {...}}`. Loader in `js/pipeline/isa/IsaLoader.js`.
- [ ] ISA picker: dropdown in the Pipeline panel header + auto-detect via `scene.meta.isaId` stored on the ROM node.
- [ ] Branch handling: for each branch, analyze the fall-through *and* the target path within the pipeline window; emit hazards that appear on any path (annotated with which path).
- [ ] Loop detection: if a branch target PC is ≤ current PC, report "steady-state" hazards in the loop body separately from cold-start hazards in the header row (`3 RAW (steady-state in loop @ 0x0C)`).
- [ ] Pipeline-depth knob: ISA JSON carries `pipelineDepth` (default 5); the window scanner uses it.

- **Example update**: `examples/circuits/pipeline-demo-program.json` — minimal MIPS-style datapath with a 4-instruction ROM containing a deliberate RAW (`ADD R1,R2,R3` → `SUB R4,R1,R5`) and a load-use (`LW R3,0(R2)` → `ADD R5,R3,R6`). Registered in the Examples menu. `pipeline-demo-program-isa.json` variant carries the ISA JSON reference, exercising the Medium loader.
- **Tests**: `examples/tests/test-pipeline-phase9-5.mjs` — textbook RAW / load-use / WAR / WAW sequences; branch-path hazards; loop steady-state detection. Plus: no false positives on NOP-padded clean programs.
- **Verify L1** — unit: Patterson & Hennessy classic 3-instruction hazard sequences produce the documented bubble counts.
- **Verify L2** — manual: open `mips-gcd` → Program Hazards tab lists the loop-body hazards with correct PCs.
- **Verify L3** — differential: hand-insert the reported number of NOPs into the ROM, re-run simulation; outputs match the un-padded version at shifted cycle offsets.

### Phase 10 — Auto-Retime (Leiserson–Saxe)
**Goal**: optionally move `PIPE_REG`s to balance stages while preserving semantics.
- [ ] `js/pipeline/Retimer.js` — classic retiming on the sequential graph.
- [ ] Opt-in: *Suggest Retiming* → preview overlay → accept/reject.
- [ ] Invariants preserved: initial state + I/O behavior, verified by simulation diff on N random vectors.
- [ ] Fallback: if verification fails, revert and warn.
- **Example update**: snapshot `pipeline-demo.json` pre-retime; accept the retime suggestion; commit the retimed version alongside as `pipeline-demo.retimed.json` for before/after comparison.
- **Verify L1** — unit: known retimeable graphs reach optimal balance.
- **Verify L2** — manual: unbalanced pipeline → accept suggestion → latency same, throughput up.
- **Verify L3** — differential sim: N random vectors, before/after outputs identical at matching cycle offset.

### Phase 11 — *moved to the HDL Toolchain plan*
Pipeline-aware Verilog export is fundamentally HDL-generation work, not pipeline-analysis work: the code lives in [js/hdl/](js/hdl/), the relevant `PIPE_REG` translator sits alongside the other sequential translators, and gating export on pipeline violations is an exporter-UX concern. Those responsibilities were migrated into the **HDL Toolchain** plan (see Phase 2, Phase 4, and Phase 7 of that plan for the specific bullets). This slot in the pipelining plan is kept as a cross-reference marker so the phase numbering stays stable for prior commits.

### Phase 12 — Templates, Docs, Examples
**Goal**: onboarding + reusable building blocks.
- [x] `examples/`: the demo set now covers all the analysis features — `pipeline-demo.json` (3-stage with fan-out), `pipeline-demo-retime.json` (imbalanced, 3-stage, retimeable), `pipeline-demo-elastic.json` *(new)* (2-stage with HANDSHAKE back-pressure), `pipeline-demo-hazard*.json` (hazards), `pipeline-demo-program*.json` (program-level), `pipeline-demo-hazard-all.json` (RAW/WAR/WAW/LOOP together). **Deferred**: *3-stage MAC* (needs a dedicated MULTIPLIER component the library doesn't ship yet) and *5-stage RISC skeleton* (covered in spirit by `simple-cpu.json` / `mips-gcd.json`, neither of which is *pipelined* yet — a real pipelined RISC demo belongs with Phase 14 once ISA inference lands).
- [x] README section: *Pipelining — Quick Start*. Six-step tour above the plan (analyze → balance → hazards → program → back-pressure → build your own).
- [ ] In-app tutorial overlay (optional) — skipped for v1; the Quick Start covers the same ground with lower engineering cost, and overlay UX would need its own design pass.
- **Example update**: `pipeline-demo-elastic.json` is new; `pipeline-demo.json` kept as-is (it's already the canonical Quick-Start step 1).
- **Verify L4** — user-level: the Quick Start was authored from a first-time-reader perspective; each step names exactly which button to click, and every step corresponds to a live demo in the Pipeline tab.

### Phase 13 — Polish, Telemetry, Stretch
**Goal**: ready for upstream HDL Toolchain consumption.
- [x] Performance: measured baseline on a synthetic 500-node / 10-stage pipeline — median `analyze()` runtime is **~2 ms** on commodity hardware, well under the 50 ms goal. Bench lives at `examples/tests/test-pipeline-perf.mjs` and gates any future regression (hard fail at 200 ms, soft warn at 50 ms).
- [x] Keyboard shortcuts: `P` toggles the Pipeline Panel, `Shift+P` toggles the Stage Overlay, `Ctrl+Shift+R` fires *Suggest Retiming*. Registered via `ShortcutManager` and show up in the Shortcuts overlay under a new "Pipeline" group, so users can rebind them like everything else.
- [x] Local telemetry hooks: `js/pipeline/Telemetry.js` — a single-file, localStorage-backed counter set (`analyses`, `analysesForced`, `panelOpens`, `stageViewOpens`, `paletteToggles`, `firstSeen`, `lastSeen`). No network, no IDs, no payload. Inspect via `window.pipeline.telemetry()` in DevTools; clear via `window.pipeline.resetTelemetry()`.
- [x] Accessibility: colorblind-friendly stage palette based on Wong 2011 (sky-blue, orange, bluish-green, yellow, blue, vermillion, reddish-purple, grey). Toggle via Command Palette → *Toggle Colorblind Stage Palette*; the choice persists in localStorage.
- [ ] Stretch: latency-insensitive protocol (LIP) checker.
- [ ] Stretch: clock-domain-crossing awareness (multi-clock pipelines).

### Phase 14 — Auto-ISA Inference + Forwarding-Aware Program Analysis
**Goal**: eliminate the ISA-JSON requirement from Phase 9.5 by deriving the ISA directly from the user's circuit, and suppress program hazards that the datapath already resolves via forwarding muxes. This is the bridge from "educational analyzer" to "works on any CPU the user draws".

- [x] `js/pipeline/isa/IsaInference.js` — derives `{fields, opcodes}` directly from the semantically-named `CU.controlTable` (or the engine's fallback 16-op dispatch when the table is `null`) plus the `IR` node's `opBits/rdBits/rs1Bits/rs2Bits`. Full wire-trace through the datapath turned out to be unnecessary: the CU carries all the read/write/branch/load semantics needed, so inference is a structured read of existing metadata. Graceful fallback to `DEFAULT_ISA` for SUB_CIRCUIT-based CUs (e.g. `cpu-detailed.json`); deeper descent tracked as Tier 14d.
- [x] `js/pipeline/ForwardingDetector.js` — structural pattern match on two canonical shapes: (a) the minimal case where one MUX input traces back to `REG_FILE_DP.Q` and another to a `PIPE_REG.Q` (Phase 14b demo), and (b) the classical MIPS 5-stage where both MUX inputs are PIPE_REGs — a "normal" one whose own predecessor is a REG_FILE, and a "forwarded" one that isn't. The detector also computes each path's `fromStage` label via a standalone graph-distance BFS from the ALU consumer through the forward pipeline (`EX→EX` = 1 PIPE_REG downstream, `MEM→EX` = 2, etc.), so labels stay correct even when the forwarding cycle collapses `StageEvaluator`'s own stage indices. The select-side comparator isn't semantically validated for the MVP; pattern-level matching is tolerant of cosmetic wiring variations.
- [x] Hazard annotation: `PipelineAnalyzer.analyze()` annotates each RAW with `resolvedByForwarding: true | false` + `forwardingPathId`, and zeros `bubbles` when resolved. Load-use RAWs are never flipped to resolved. The UI toggle to hide resolved rows ships with Tier 14c.
- [ ] Multi-cycle instructions: per-opcode latency > 1 (IDIV, multi-cycle MUL) widens the dependency window for that specific instruction pair.
- [ ] Induction-variable loop analysis: detect `BNE/BEQ` back-edges combined with a monotonic counter (ADDI on the branch register) → report "steady-state" hazards distinct from cold-start hazards. Surface loop bounds when derivable.
- [x] Panel: new **"FORWARDING PATHS"** section below Program Hazards — one row per detected bypass (fromStage badge · register · `PIPE → MUX → ALU` path). Resolved RAWs in Program Hazards now show a `✓ EX→EX` badge in place of the bubble count and the row dims; the header displays `N ✓ resolved`. *Toggle Hide Resolved Hazards* in the Command Palette filters those rows out (session-only). A collapsible `EX→EX ✓ / MEM→EX ✓ / MEM→ID ✗` coverage summary is deferred to Tier 14d once multi-level forwarding detection lands.
- **Example update**: three pipelined demos now ship under the **Pipeline** tab of the Examples menu:
  1. `examples/circuits/pipeline-forwarding-demo.json` — minimal 2-stage datapath with 2 forwarding MUXes. Smallest circuit that exercises the detector; useful as a teaching aid.
  2. `examples/circuits/mips-5stage-demo.json` — canonical MIPS 5-stage pipeline **without** forwarding. IR serves as the IF/ID latch, with explicit `ID/EX` / `EX/MEM` / `MEM/WB` PIPE_REGs; the panel shows 4 visible stages (`hasCycle: false`). ROM runs a 6-instruction program exercising back-to-back RAW, 2-apart RAW, and load-use — every hazard reports its full bubble cost since no forwarding exists.
  3. `examples/circuits/mips-5stage-forwarding-demo.json` — same datapath extended with 2 forwarding MUXes plus EQ+AND select logic. Detector reports `FORWARDING PATHS (2) · EX→EX rs1 / rs2`; 3 of 4 RAWs flip to `✓ EX→EX`, the load-use stays with its 3-bubble cost.
- **Supporting fix** (`StageEvaluator.js`): writeback wires — edges into a register file's `waddr`/`wdata`/`we` pins — are cut before Kahn's topo sort so pipelined CPUs with a real write-back path no longer collapse to `hasCycle: true, stages: 1`. Without this, every realistic pipelined CPU would have been levelized into a single stage.
- **Tests**: `examples/tests/test-pipeline-phase14.mjs` — (a) ISA inference matches the hand-written MIPS table from Phase 9.5 on `mips-gcd`; (b) scenes with/without forwarding muxes produce the expected hazard deltas; (c) induction loops in `mips-gcd` reported correctly.
- **Verify L1** — unit: synthetic scenes with known ISA / known forwarding configurations.
- **Verify L2** — manual: hand-build a MIPS forwarding mux → watch the Program Hazards count drop → delete the mux → count rises.
- **Verify L3** — differential vs. a reference MIPS ISS (50+ random programs, same bubble counts).

---

### Success Criteria (end-of-plan)
1. Any pipelined design built in the tool is analyzed, validated, and visualized.
2. Latency, throughput, and f_max reported accurately.
3. Stall/flush and valid/ready primitives work end-to-end (waveform-verified).
4. Hardware hazards detected; fixes suggested.
5. Program-level hazards detected per-ISA; MIPS-5 demos report correct RAW / load-use bubble counts (Phase 9.5), and forwarding-aware suppression matches a reference ISS (Phase 14).
6. Auto-retime preserves semantics on random-vector diff.
7. *Pipeline-aware Verilog export is owned by the HDL Toolchain plan (see its Phase 4 + 7). Not a deliverable of this plan.*

### Module Layout (final)
```
js/pipeline/
├── PipelineAnalyzer.js         # public API, event wiring
├── StageEvaluator.js           # levelization + critical path
├── PipelineState.js            # metrics, cached results
├── HazardDetector.js           # hardware RAW/WAR/WAW/LOOP
├── InstructionDecoder.js       # ROM → instruction stream         (Phase 9.5)
├── ProgramHazardDetector.js    # ISA-level pair-wise hazard pass   (Phase 9.5)
├── ForwardingDetector.js       # detect forwarding muxes            (Phase 14)
├── Retimer.js                  # Leiserson–Saxe
├── isa/
│   ├── mips.js                 # hardcoded MIPS-5 table             (Phase 9.5 Easy)
│   ├── IsaLoader.js            # JSON ISA loader                    (Phase 9.5 Medium)
│   └── IsaInference.js         # wire-trace ISA derivation          (Phase 14)
└── ui/
    ├── PipelinePanel.js        # side panel (Hazards + Program Hazards sections)
    └── StageOverlay.js         # canvas color overlay
```
Plus minor hooks in: `components/Component.js`, `core/SceneGraph.js`, `engine/SimulationEngine.js`, `ui/CommandPalette.js`, `core/ShortcutManager.js`, `app.html`. (HDL export hooks belong to the HDL Toolchain plan — this module does not touch `js/hdl/`.)

### Known Risks

| Risk | Mitigation |
|------|------------|
| Critical-path pass slow on large circuits | Memoize + incremental update on mutation |
| Retiming breaks semantics on corner cases | Random-vector diff gate before commit |
| Stall/flush interact unexpectedly with memory | Dedicated unit tests per FF type |
| Palette gets too crowded | New "Pipeline" tab, not overload CPU tab |
| HDL export + pipeline metadata clash | Resolved by moving pipeline-aware export into the HDL Toolchain plan (Phase 2 / 4 / 7); no `js/hdl/` code is owned by this module |
| ISA JSON proliferates (Phase 9.5 Medium) | Ship MIPS-I + nano-MIPS as reference; validate user JSON against a schema at load time |
| Auto-ISA inference (Phase 14) brittle on non-MIPS datapaths | Fall back to explicit ISA JSON when inference confidence is low; surface a "confidence score" in the panel |
| Forwarding-mux pattern matching (Phase 14) too strict / too loose | Unit-test against both hand-built forwarded MIPS and deliberately mis-wired variants; require user-toggleable override |

---

## Analysis Utilities — `js/analysis/`

Cross-cutting scene-level utilities that reason about a circuit *as a whole* — not about rendering, not about simulation timing, but about runtime behavior. Designed as shared infrastructure for any feature that needs to answer "how long does this run?" or "does it terminate?". Current consumers: `RetimeVerifier` (sizes its sim-diff budget); planned consumers: waveform auto-scroll, debug "Run to completion", HDL testbench length.

### `estimateRunLength(scene, opts?)` — static heuristic

Answers *"how many clock cycles will this circuit take to terminate, roughly?"* without running a simulation. Completes in 1–10 ms on any reasonable scene. Returns `{ cycles, confidence, reason, sources, isBounded, upperBound, pipelineDepth }`. Confidence tier dictates how much to trust the number.

Priority order of detection (first match wins):

1. **No clock** → `unknown`, 1 cycle.
2. **ROM + HALT instruction** → `high`, `haltPc + pipelineDepth + 1`.
3. **ROM + unconditional JMP back** → `medium`, `isBounded: false`.
4. **ROM without HALT** → `medium`, `maxPc + pipelineDepth + 1`.
5. **Pure combinational LOOP hazard** (no state element in cycle) → `high`, unbounded.
6. **RAW/WAR/WAW hazard whose cycle reaches an OUTPUT** → `medium`, unbounded.
7. **Naked COUNTER/PC** (no CLR/LOAD driver) → `high`, unbounded with `upperBound = 2^bitWidth`.
8. **COUNTER/PC with CLR wired** → `low`, pipeline-default with `upperBound`.
9. **Anything else** → `low`, `max(6, pipelineDepth + 3)`.

Opt-in `{ verify: true }` cross-checks against `measureRunLength` and upgrades the confidence to `verified` / `verified-diff`.

### `measureRunLength(scene, opts?)` — dynamic ground truth

Actually runs the simulation engine until a termination signal fires or `maxCycles` is reached. Cost scales with scene size × cycle count — typical CPU demos finish in tens of milliseconds; a 1000-node / 1000-cycle run takes about a minute. Not for UI hot paths; reserved for tests, profiling, and explicit "Run to completion" actions.

Termination modes:
- `'halt'` — CU halt output (`__out5` = 1) or any node labeled `"HALT"` asserting 1.
- `'stable-outputs'` — every OUTPUT holds the same value for `stableWindow` consecutive cycles.
- `'stable-state'` — outputs AND FF state both stable.
- `'any'` (default) — first of halt or stable-outputs.

Returns `{ cycles, terminated, reason, timeMs, finalOutputs, haltNode }`. Safe against infinite circuits via the `maxCycles` rail.

### Tests

- [examples/tests/test-analysis-run-length.mjs](examples/tests/test-analysis-run-length.mjs) — 32 checks across every detection path.
- [examples/tests/test-analysis-run-length-measure.mjs](examples/tests/test-analysis-run-length-measure.mjs) — 12 checks covering all termination modes + an estimator-vs-measurer agreement sanity check.

---

## Adding a New Component — Checklist

Every time a new component type is introduced, walk through this list **in order**. Skipping a step usually produces a partial-looking component that breaks in non-obvious ways (renders fine but doesn't simulate; simulates but doesn't export; etc).

### 1. Type + factory — [js/components/Component.js](js/components/Component.js)
- [ ] Add the type constant to `COMPONENT_TYPES` (e.g. `HANDSHAKE: 'HANDSHAKE'`).
- [ ] Add a `case COMPONENT_TYPES.XYZ:` in `createComponent()` returning the default shape (`{ ...base, <fields>, label: 'XYZ' }`).
- [ ] If the component is sequential/clocked, add it to `FF_TYPE_SET` or `MEMORY_TYPE_SET`.

### 2. Palette chip — [app.html](app.html)
- [ ] Add `<span class="palette-chip ..." data-tool="place-xyz" draggable="true">LBL</span>` inside the right tab (`logic`, `cpu`, `memory`, `blocks`, `pipeline`, `other`).
- [ ] Pick the closest visual class (`palette-gate`, `palette-ff`, `palette-block`, `palette-io`).

### 3. Tool → type mapping — [js/interaction/InputHandler.js](js/interaction/InputHandler.js)
- [ ] Add `'place-xyz': COMPONENT_TYPES.XYZ` to the `TOOL_TO_TYPE` / `toolToType` map.
- [ ] If resizable (user can change `inputCount`/`channels`/`bitWidth` via scroll/handle), add the type to **both** `RESIZABLE` sets (there are two near lines 137 and 690).

### 4. Command Palette — [js/ui/CommandPalette.js](js/ui/CommandPalette.js)
- [ ] Add `{ id: 'place-xyz', label: 'Place XYZ', category: 'Logic|CPU|Memory|Pipeline', action: () => bus.emit('palette:tool', 'place-xyz') }` to the components array.

### 5. Rendering — [js/rendering/CanvasRenderer.js](js/rendering/CanvasRenderer.js)
- [ ] Write `_drawXyzNode(node, val, hovered, ffStates)` — shape, pin positions, value text.
- [ ] Add the `else if (node.type === 'XYZ')` branch in the main draw switch (~line 858).
- [ ] If the component has a non-standard pin count, update the pin-count helper (~line 3077) **and** pin-position helper (~line 3141).

### 6. Simulation — [js/engine/SimulationEngine.js](js/engine/SimulationEngine.js)
- [ ] Add the logic. Combinational component → Phase 1 block; sequential clocked → Phase 2b (rising-edge capture) and Phase 3 (output re-propagation).
- [ ] Confirm the clock detection (`isClockWire` flag or highest-input-index heuristic) picks up the intended pin.

### 7. Properties panel — [js/app.js](js/app.js) `_updatePropsPanel`
- [ ] If the user edits custom fields (size, value, bit width, etc.), toggle the matching `prop-*-row` and wire its input/change handler.

### 8. Memory Inspector filter — [js/app.js](js/app.js) `_refreshMemInspector`
- [ ] If the component holds state worth inspecting (register, memory, PIPE, etc.), add its type to the `memNodes` filter **and** to `typeLabels`.

### 9. Pipeline delay — [js/pipeline/DelayModel.js](js/pipeline/DelayModel.js)
- [ ] Add an entry to `DEFAULT_DELAY_PS` in picoseconds (0 for clocked/boundary, 50–800 for combinational). Unknown types fall back to 100 ps and produce a Pipeline-panel warning.

### 9b. Waveform visibility — [js/waveform/WaveformState.js](js/waveform/WaveformState.js)
- [ ] Add the type to `PICKABLE_TYPES` (else it won't appear in the signal picker).
- [ ] Add a `TYPE_TO_SIG_TYPE` entry (`'memory'`, `'compute'`, `'gate'`, `'ff'`).
- [ ] If the component has multiple named outputs, add it to `PINS_BY_TYPE` with `[['NAME', idx], …]`.
- [ ] If the component has multiple named inputs worth picking, add it to `INPUT_PINS_BY_TYPE`.

### 10. HDL export (when the HDL Toolchain phase touches it)
- [ ] Add a translator in `js/hdl/translators/` emitting Verilog for the new type.
- [ ] Update the HDL round-trip fuzz corpus so the component is exercised.

### 11. Example circuit
- [ ] If relevant, add a small example demonstrating the component under `examples/circuits/` and register it in the `EXAMPLES` array in [js/app.js](js/app.js).

### 12. Smoke test
- [ ] Drop the new chip onto an empty canvas → confirm it renders, accepts wires, simulates, appears in the Pipeline panel, Memory Inspector, and exports/imports cleanly via JSON.

### 13. Run-length analysis — [js/analysis/](js/analysis/)
These only matter for components that change how a circuit *terminates* or *oscillates*. Skip for combinational gates and simple I/O; mandatory for anything stateful, counting, halting, or holding a program.

- [ ] **Holds state across clock edges** (any new register, latch, or memory-like type):
      Add its type to `STATE_HOLDING_TYPES` in [js/analysis/RunLengthEstimator.js](js/analysis/RunLengthEstimator.js). Without this, feedback loops through the new component may be mis-classified as combinational oscillators.
- [ ] **Counts/oscillates monotonically without reset** (counter / PC variant):
      Extend the check in `_findNakedCounter()` so a "naked" instance (no CLR/LOAD wired) is flagged as unbounded.
- [ ] **Emits a halt signal** through a dedicated pin or a `"HALT"` label convention:
      Extend `_detectHalt()` in [js/analysis/RunLengthMeasurer.js](js/analysis/RunLengthMeasurer.js) so simulation-based measurement terminates on it.
- [ ] **Is a program container** (ROM-like, memory holds instructions):
      Extend `findRomNode()` in [js/pipeline/InstructionDecoder.js](js/pipeline/InstructionDecoder.js) and ensure the ISA decoder handles any new instruction-word layout.

---

## License

MIT
