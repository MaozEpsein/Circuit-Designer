# Circuit Designer Pro

**A fully interactive digital circuit designer and simulator where you design, build, and test complete digital systems — from basic logic gates through a full CPU with ALU, registers, RAM, and assembly programming — with real-time simulation, waveform analysis, a ROM Editor with built-in assembler, and a live Memory Inspector.**

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
- [ ] **AI Chat Assistant** — in-app chat powered by Gemini API (user provides free API key). Ask the AI to build circuits, explain components, or write programs in natural language
- [ ] **Python/C-style programming** — write `R3 = R1 + R2` instead of assembly
- [ ] **Interactive tutorial** — step-by-step guided lessons: "build a counter", "build an ALU", "build a CPU"
- [ ] **Timing diagram export** — SVG/PNG export of waveforms

### Long-term
- [ ] **Full pipelined CPU** — 5-stage pipeline with hazard detection, forwarding, and branch prediction
- [ ] **Gate propagation delay** — configurable delay modeling per component
- [ ] **Multi-clock domains** — support for different clock frequencies
- [ ] **Component library sharing** — import/export custom sub-circuit libraries

---

## Waveform Pro — Industry-Grade Upgrade Path

> Long-running initiative developed in parallel with other features. The goal is to bring the Waveform viewer to the capability level of GTKWave / Vivado / ModelSim, while keeping a modern, minimal aesthetic instead of the dense "CAD from the 90s" look.

### Vision

A waveform that is simultaneously:

- **Professionally capable** — cursor readouts, zoom/pan, multi-bit buses, bookmarks, measurements, VCD export, trigger conditions, pattern search.
- **Visually restful** — a narrow, harmonious palette (3–5 colors total), generous row spacing, readable typography, subtle grid, smooth motion.

### Design Principles

| Principle | What it means in practice |
|---|---|
| Narrow palette | Green for HIGH, blue-grey for LOW, yellow for CLK, cyan for interaction, white for text. No more. |
| Readable type | JetBrains Mono 12px for values, 11px for labels. Never below 10px. |
| Generous spacing | Row height 32–40 px. Visual gap between signal groups. |
| Quiet grid | Time gridlines at ~10% opacity. Not a chessboard. |
| Gentle motion | Zoom/pan eased over 150 ms. Cursor tracks smoothly. No jumps. |
| One interaction color | Everything clickable/draggable is cyan. No rainbow of button colors. |

### Folder Structure

The current `js/rendering/WaveformRenderer.js` (single 216-line file) will be refactored into a dedicated module directory during Phase 1. This keeps each concern isolated and prevents the file from growing unmanageable as the 27 tasks land.

```
js/waveform/
├── WaveformRenderer.js    — canvas drawing only (signals, grid, cursor visuals)
├── WaveformController.js   — input handling (zoom, pan, cursor, markers, drag)
├── WaveformState.js        — view state (zoom level, selected signals, radix, markers, bookmarks)
├── WaveformSearch.js       — pattern matching, edge jumps, trigger conditions
├── WaveformVCD.js          — VCD import and export
└── WaveformTheme.js        — color palette, typography, spacing constants
```

Each file has a single responsibility. New features land in the file that matches their concern; no catch-all "utils" or "misc".

### Performance Goal

The Waveform must remain smooth and unobtrusive even after all 27 tasks land. The browser and the rest of the simulation must not slow down because the Waveform is open.

**Concrete targets:**

| Metric | Budget |
|---|---|
| Memory footprint | ≤ 10 MB for a typical session (20k cycles × 50 signals) |
| Idle CPU cost | ≤ 2% at 30 fps render when panel is visible |
| Render cost per frame | ≤ 4 ms for a typical scene (50 signals × ~500 visible steps) |
| Peak latency (search, export) | ≤ 100 ms spike, never blocking the main thread for longer |
| History retention | Circular buffer capped at 20k cycles; older entries drop automatically |

**Required techniques:**

- **Circular buffer** for signal history — never unbounded growth.
- **`requestAnimationFrame` throttling** for cursor / hover updates (not every `mousemove`).
- **Skip rendering when hidden** — the panel must not redraw when collapsed or covered.
- **Early-exit** on pattern search — stop at first match unless "find all" is requested.
- **Off-main-thread work** only if a task exceeds 100 ms — consider a `Worker` for VCD export of large runs.

Every phase that adds compute (Phase 3 cursor, Phase 4 search, Phase 5 VCD) must include a measurement step: verify render time and memory stay within budget before marking tasks complete.

### Development Phases

Each phase is independently shippable — you can stop at the end of any phase and have a working, more useful Waveform than before. They are ordered so the earliest phases unlock the most value.

#### Phase 1 — Navigation Foundations *(~1–2 days)*
- [x] Horizontal zoom with `Ctrl+Scroll` (smooth, eased)
  Zoom pivots around the cursor so the cycle under the pointer stays fixed.
- [x] Horizontal pan with drag or shift-scroll
  Drag anywhere inside the data area; shift+wheel also pans horizontally.
- [x] Fit-to-window action + keyboard shortcut (`F`)
  Exposed via the `FIT` button in the header and the `F` key.
- [x] Time axis at top with cycle numbers (0, 5, 10, …) and minor ticks
  Label spacing adapts to zoom; minor ticks every ~major/5 cycles.
- [x] Resizable waveform panel (top-edge drag handle)
  Cyan top-edge handle; min 120 px, max 80% of viewport height.

**Refactor completed:** `js/rendering/WaveformRenderer.js` (single file) split into `js/waveform/{WaveformTheme, WaveformState, WaveformRenderer, WaveformController}.js` per the module layout in "Folder Structure" above. `WaveformSearch.js` and `WaveformVCD.js` will be created when Phases 4 and 5 begin.

#### Phase 2 — Data Readability *(~1–2 days)*
- [x] Multi-bit bus rendering (hex/dec/bin labels inside hexagon shapes between transitions)
  Bus signals auto-detected by max value > 1; rendered with classic X-crossover shape and value labels that shrink-to-fit or hide when there's no room.
- [x] Global radix toggle (HEX / DEC / BIN) + per-signal override via context menu
  Header button cycles DEC → HEX → BIN. Per-signal override API in place via `radixOverrides` Map; context-menu UI will land in Phase 3 alongside the rest of the signal menu.
- [x] Dynamic row height with consistent gap
  Bus rows use `ROW_H_BUS` (38 px) vs `ROW_H` (32 px) for 1-bit rows — more room for value labels; rows stack via cumulative y-offset.
- [x] Deterministic per-signal color assignment (hash of signal name → curated palette)
  djb2 hash over signal label → index into a 10-color curated palette (no red, vaporwave-leaning). Clock keeps its canonical yellow.

#### Phase 3 — Interactivity *(~2–3 days)*
- [ ] Vertical cursor following the mouse
- [ ] Side panel: "All values at cursor time" (signal name + current value)
- [ ] Click → place marker A; `Shift+Click` → marker B; footer shows `Δ = N cycles`
- [ ] Signal list with show/hide checkboxes
- [ ] Drag to reorder signal rows
- [ ] Per-signal context menu (color, hide, pin to top, copy value)

#### Phase 4 — Power Features *(~3–4 days)*
- [ ] Jump to next/previous edge of active signal (`←` / `→`)
- [ ] Pattern search ("find when `PC == 10`" or "`RegWrite` rising edge")
- [ ] Trigger mode — begin recording only when a user-defined condition becomes true
- [ ] Signal groups with collapsible headers (`▼ CPU core`, `▼ Memory`)
- [ ] Named bookmarks at specific cycles

#### Phase 5 — Industry Integration *(~2–3 days)*
- [ ] **VCD export** — standard Value Change Dump format, consumable by GTKWave / ModelSim / Vivado without modification
- [ ] VCD import — load a `.vcd` from an external tool and render it
- [ ] Save/restore waveform view state per project (selected signals, zoom level, markers, group expansion)

#### Phase 6 — Polish *(~1–2 days)*
- [ ] Full-screen mode for the waveform panel
- [ ] Complete keyboard shortcut set (`j`/`k` for signal navigation, `h`/`l` for time, `Home`/`End`, etc.)
- [ ] Minimap overview strip at the top
- [ ] Motion/animation pass — all transitions eased and consistent

### Progress Tracker

| Metric | Value |
|---|---|
| Phase 1 | 5 / 5 tasks ✅ |
| Phase 2 | 4 / 4 tasks ✅ |
| Phase 3 | 0 / 6 tasks |
| Phase 4 | 0 / 5 tasks |
| Phase 5 | 0 / 3 tasks |
| Phase 6 | 0 / 4 tasks |
| **Total** | **9 / 27 tasks** |
| Last updated | 2026-04-19 |

### How to update this section

When a task is completed:

1. Change `- [ ]` to `- [x]` on that line.
2. Increment the "Phase X" count in the Progress Tracker table.
3. Update "Last updated" to today's date.
4. If the task needed a design decision worth remembering, add a one-line note beneath the checkbox (indent with two spaces).

When adding new tasks discovered mid-development, append to the relevant phase and update the tracker total.

### Working model

This initiative runs **in parallel** with ongoing feature work — it is not a two-week freeze. Typical cadence: pick 1–2 tasks from the earliest unfinished phase per session, ship them, tick them off. The README is the single source of truth for what is done and what remains, so any session can resume from this list alone.

---

## License

MIT
