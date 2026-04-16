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

## License

MIT
