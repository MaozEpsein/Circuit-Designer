# Circuit Designer Pro

**A fully interactive digital circuit designer and simulator where you design, build, and test complete digital systems — from basic logic gates and flip-flops through arithmetic units, memory hierarchies with RAM, ROM, register files, FIFO queues and stacks, all the way to finite state machines — with real-time simulation, waveform analysis, signal tracing, truth table generation, and a live Memory Inspector that lets you watch and edit every register and memory cell as your circuit runs.**

> **[Launch Circuit Designer Pro](https://maozepsein.github.io/Circuit-Designer/app.html)**

---

## Features

### Component Library

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

#### Memory Components
| Component | Inputs | Outputs | Description |
|-----------|--------|---------|-------------|
| Register | DATA, EN, CLR, CLK | Q | N-bit register with enable and clear |
| Shift Register | DIN, DIR, EN, CLR, CLK | Q | Bidirectional shift register |
| Counter | EN, LOAD, DATA, CLR, CLK | Q, TC | Up counter with parallel load |
| RAM | ADDR, DATA, WE, RE, CLK | Q | Read/write random access memory |
| ROM | ADDR, RE, CLK | Q | Read-only memory with preset data |
| Register File | RD_A, WR_A, WR_D, WE, CLK | RD_DATA | Multi-register file (configurable 2-32 registers) |
| FIFO | DATA, WR, RD, CLR, CLK | Q, FULL, EMPTY | First-In First-Out queue |
| Stack | DATA, PUSH, POP, CLR, CLK | Q, FULL, EMPTY | Last-In First-Out stack |
| PC | JMP_A, JMP, EN, CLR, CLK | ADDR | Program Counter with jump support |

#### I/O Components
- **Input / Output** nodes
- **Clock** generator
- **MUX Switch** (toggle value)
- **7-Segment Display**

### Simulation Engine
- DAG-based topological evaluation with real-time propagation
- Rising-edge clock detection for sequential elements
- Asynchronous read / synchronous write for memory components
- Bus-style multi-bit wires (packed integer values)
- Automatic re-propagation on state changes

### Debugging & Analysis
- **Waveform Viewer** — timing diagrams for any signal
- **Signal Probes** — attach to any wire for live monitoring
- **Watch List** — pin signals to a persistent panel
- **Truth Table Generator** — auto-generate for any sub-circuit
- **Signal Tracing** — highlight signal paths forward/backward
- **Error Overlay** — detect undefined/conflicting signals
- **Memory Inspector** — live view of all memory components with:
  - Per-bit register visualization with click-to-toggle
  - RAM/ROM address table view
  - Register File with all internal registers displayed
  - FIFO/Stack buffer contents with fill level
  - Inline value editing (decimal, hex, binary formats)

### Design Tools
- Drag-and-drop component placement from palette tabs
- Double-click to edit component properties (size, label, bit width)
- Properties panel for selected component configuration
- Manhattan wire routing with Bezier curves
- Multi-select, align, and distribute
- Copy/paste, undo/redo
- Snap-to-grid
- Pan and zoom with minimap
- Command palette (Ctrl+K) for quick access
- Export/import circuits as JSON
- Project save/load with IndexedDB
- Screenshot export

---

## Palette Tabs

| Tab | Components |
|-----|------------|
| **LOGIC** | Gates (AND, OR, XOR, NAND, NOR, XNOR, NOT, BUF, TRI), Flip-Flops (D, T, SR, JK), Latches (D, SR) |
| **BLOCKS** | MUX, DEMUX, Decoder, Encoder, Half Adder, Full Adder, Comparator |
| **MEMORY** | Register, Shift Register, Counter, RAM, ROM, Register File, FIFO, Stack, PC |
| **OTHER** | MUX Switch, 7-Segment Display |

Quick toolbar: IN, OUT, WIRE, CLK

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/MaozEpsein/Circuit-Designer.git
cd Circuit-Designer

# No build step required — open directly or use any static server:
npx serve .
```

Then open `app.html` in your browser.

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

- [ ] **CPU tab** — ALU, Instruction Register, Control Unit, Bus, Immediate value
- [ ] **Sub-circuits** — group circuits into reusable custom blocks
- [ ] **Multi-bit bus wires** — visual distinction for bus vs. single-bit wires
- [ ] **Timing diagram export** — SVG/PNG export of waveforms
- [ ] **Gate propagation delay** — configurable delay modeling

---

## License

MIT
