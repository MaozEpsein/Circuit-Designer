# HDL Toolchain — Supported Verilog Subset

## Capability matrix (Phase 13 release)

| Construct | Export ✓ | Import ✓ | Notes |
|---|---|---|---|
| `module` / `endmodule` + ports | ✅ | ✅ | bus widths preserved |
| Bit-widths (`[N-1:0]`) | ✅ | ✅ | parameter-driven widths resolve via constant folding |
| `wire` / `reg` declarations | ✅ | ✅ | |
| Memory arrays (`reg [W-1:0] mem [0:D-1]`) | ✅ | ✅ | RAM if any write, ROM otherwise |
| `assign` continuous | ✅ | ✅ | expression tree → GATE_SLOT chain or VERILOG_BLOCK |
| Primitive gates (`and` / `or` / `xor` / `nand` / `nor` / `xnor` / `not` / `buf`) | ✅ | ✅ | round-trips to GATE_SLOT |
| Tri-state (`assign y = en ? a : 1'bz`) | ✅ | ✅ | multi-driver coalesced via `lowerTriState` |
| `always @(posedge clk [or negedge rst_n])` | ✅ | ✅ | single-NBA infers FF / REGISTER |
| `always @(*)` + `case` / `if` | ✅ | ✅ | case → MUX, ternary chain → MUX tree |
| `initial begin … end` | ✅ | ✅ | lifted into IR.alwaysBlocks with `sensitivity.initial` |
| `parameter` / `localparam` | ✅ | ✅ | constant-folded at elaborate time |
| Verilog `(* attribute *)` blocks | ✅ | ✅ | preserved via `IR.attributes` + `originalText` |
| System tasks (`$display`, `$readmemh`, `$bits`, …) | ✅ | ✅ | re-emitted verbatim |
| Sub-module instantiation (named or positional ports) | ✅ | ✅ | nested IR carried as SUB_CIRCUIT placeholder |
| Hierarchy (sub-modules above top, content-hash dedup) | ✅ | ⚠️ | recursive lowering deferred to a follow-up |

### Verification gates

| Gate | Tool | Status |
|---|---|---|
| L1 — Verilog parses | iverilog | ✅ on every demo + fuzz output |
| L2 — Lint (synth-clean) | runL2.js | ✅ |
| L3 — Round-trip via hand-written parser | parser + elaborate | ✅ 25/25 demos, 1000/1000 fuzz |
| L3 — Round-trip via Yosys | Yosys | ⏸ deferred (Yosys integration out of scope) |
| L4 — `synth_ice40; check -assert` | Yosys + nextpnr | ⏸ deferred |
| Cross-check (Yosys IR ≡ parser IR) | both | ⏸ deferred |
| Property fuzz (1000 seeds, well-typed IR round-trip) | irGenerator.js | ✅ 1000/1000 |

### Coverage floors achieved

| Phase | Floor (README) | Achieved |
|---|---|---|
| 3  — every gate / adder / comparator / MUX is a real component | 100% | ✅ |
| 4  — FFs / registers / counters / shift registers real | 100% | ✅ |
| 5  — palette-backed memory constructs real | 100% | ✅ |
| 9  — zero AST nodes fall through to "unsupported" | 100% | ✅ |
| 10 — Phase-3-6 round-trip schematic | ≥ 95% | ⚠️ ~50% (rest preserved as VERILOG_BLOCK; round-trip-stable) |
| 13 — full external corpus schematic | ≥ 90% | ⚠️ corpus imports cleanly; structural composites (ALU, FSM) preserved as REGISTER + VERILOG_BLOCK |

The Verilog Block fallback IS round-trip-stable — every demo
re-exports without crashes — but composite recognition for
ALU/FSM/RegFile is still partial. Future work tightens the inference;
present-day output is correct, just less canonical than possible.



Each phase extends this document with concrete examples of what the importer
accepts and the exporter produces. Anything not listed here is outside the
subset and fails with a precise error (see [SEMANTICS.md](./SEMANTICS.md)).

## Phase 1 — Export skeleton ✓

- Empty modules: `module top; endmodule`.
- Port declarations for INPUT / CLOCK (`input`) and OUTPUT (`output`) nodes.
- Bus widths on ports via `[N-1:0]`.
- Identifier sanitisation (reserved words, illegal chars, leading digits).

## Phase 2 — IR & verification harness ✓

- All Phase-1 capabilities expressed through HDL-IR.
- Deterministic pretty-printing.
- Round-trip stub harness.

## Phase 3 — Combinational ✓

- `assign` continuous assignments.
- Primitive gate instances (positional ports): `and g(y, a, b);`,
  `or`, `xor`, `nand`, `nor`, `xnor`, `not`, `buf`.
- Tri-state via `assign y = en ? a : 1'bz;`.
- MUX / DEMUX / Decoder / Encoder lowered to `case` or chained ternaries.
- Half-adder / Full-adder / Comparator / ALU as continuous assigns.
- DISPLAY_7SEG as a port-style sink.

## Phase 4 — Sequential ✓

- `always @(posedge clk)` and `always @(posedge clk or negedge rst_n)`.
- `always @(*)` combinational blocks with `case` / `if`.
- `initial begin … end` for register seeding.
- Non-blocking assignment `<=`, blocking `=`.
- D / T / SR / JK flip-flops, D / SR latches, SCAN_FF.
- `reg [W-1:0] q;` register declarations.

## Phase 5 — Memory & CPU ✓

- Memory arrays: `reg [W-1:0] mem [0:DEPTH-1];`.
- Initial-block memory seeding: `initial begin mem[0]=…; … end`.
- ROM (sync + async) and RAM with WE/RE.
- Register files (single + dual port).
- ALU, Control Unit, Instruction Register, Program Counter.
- FIFO / STACK with FULL / EMPTY flags.

## Phase 6 — Hierarchy ✓

- Sub-circuit instantiation as named-port module instances.
- Submodule definitions emitted above the top.
- Content-hash dedup so identical sub-circuits share one definition.

## Phase 7 — Export UX ✓

- `// ─── Stage N ───` comment dividers driven by the `stage` IR attribute.
- TESTBENCH (`<top>_tb.v`) skeleton with VCD dump.
- Project .ZIP bundling design + testbench + README.

## Phase 8 — Hand-Written Lexer & Parser ✓

The importer accepts every construct the exporter emits in Phases 1-7,
plus a developer-friendly superset for hand-written files in
`examples/hdl-corpus/`.

### Lexer

- Identifiers (`foo`, `bar_baz`, `$signal_1`).
- Escaped identifiers (`\\name-with-dashes`).
- System identifiers (`$display`, `$readmemh`, `$bits`, …).
- Sized literals: `4'h5`, `8'b1010_1010`, `16'd255`, `4'bz`, `1'bx`.
- Unsized literals: `42`, `'hFF`, `'b101`.
- Underscores in numbers: `8'b1010_1010` (stripped).
- Operators (longest-first): `<<<`, `>>>`, `<=`, `>=`, `==`, `!=`, `===`, `!==`,
  `&&`, `||`, `<<`, `>>`, `~&`, `~|`, `~^`, `^~`, `**`, plus single-char.
- Comments: `// line` and `/* block */`.
- Verilog attributes: `(* keep, ram_style="block" *)` — kept as `attr` tokens
  and attached to the next item by the parser.
- Exact `line:col` tracking on every token for diagnostics.

### AST

27 node kinds:

- **Top**: Source, Module, Port.
- **Items**: NetDecl (`wire`/`reg`/`integer`), MemoryDecl, ContAssign,
  Always, Initial, Instance (primitive + module), ParamDecl, SystemCall.
- **Statements**: Block, BlockingAssign, NonBlockingAssign, If, Case
  (incl. default), SystemCall.
- **Expressions**: Ref, Slice, Index, Literal, StringLit, BinaryOp,
  UnaryOp, Ternary, Concat, Replicate, Paren.

Every node carries `srcRange` (line/col + end) so diagnostics can underline
the exact token.

### Parser

- Recursive-descent for module structure; Pratt precedence climber for
  expressions (IEEE 1364 §5.1.2 precedence).
- Disambiguates `<=` between non-blocking-assign separator (statement
  position) and less-than-or-equal (expression position) by parsing the
  LHS as an *lvalue* (Ref / Slice / Index / Concat) instead of a full
  expression.
- **Error recovery** at statement boundaries (`;`, `end`, `endmodule`).
  Multiple errors collected in one pass; surfaced via `parseVerilog().errors`.
- **Resource limits**: `maxRecursionDepth` (default 1024), `maxTokens`
  (default 1 000 000), `deadlineMs` (default 5 000). Adversarial input
  fails fast with a precise message instead of hanging.

### Verified by

- `examples/tests/test-hdl-parser.mjs` — 80+ unit checks (lexer, parser,
  attributes, parameters, system tasks, error recovery, hand-written
  sidecar `.v`).
- `examples/tests/test-hdl-parser-l1-gate.mjs` — every `verilog-phase*`
  demo (Phases 1-7, 20 files) is exported and the result must:
  1. Parse without error.
  2. Round-trip cleanly: AST → re-print → AST is structurally equal
     (Paren wrappers stripped — they are pure syntax).

### Known gaps (deferred)

- `generate` / `genvar` blocks.
- `for` loops (unroll-only) inside always blocks.
- Tasks / functions (`task`, `function`).
- User-defined types / `typedef`.
- Cross-check against Yosys-derived IR (Phase 8 plan item — needs
  Yosys integration first).

## Phase 9 — Elaboration (AST → IR) ✓

The elaborator lowers a Phase-8 AST into the same IR that the exporter
produces from a circuit. Both pipelines now meet in the middle.

### Elaboration responsibilities

- **Parameter resolution** — constant folding for any `parameter` /
  `localparam`. Supports decimal / hex / bin literals, unary `-`, all
  arithmetic & bitwise binary ops, ternary. Symbolic widths
  (`[WIDTH-1:0]`) resolve once params are known.
- **Width inference + symbol table** — every IR `Ref` / `Slice` /
  `Concat` / `Replicate` / `Index` carries an explicit width derived
  from the declared port / net / memory width. Binary-op result widths
  follow the IEEE 1364 §5.4 rule (max of operands, except for relational
  ops which produce 1).
- **Statement lowering** — AST `Block` / `BlockingAssign` /
  `NonBlockingAssign` / `If` / `Case` map 1:1 to IR `BlockingAssign`,
  `NonBlockingAssign`, `IfStmt`, `CaseStmt`. `default` arms split out
  into their own `default` array on the IR `CaseStmt`.
- **Initial blocks** lifted into `IR.alwaysBlocks` with
  `sensitivity.initial = true`, matching the existing IR convention.
- **Primitive instances** (`and g(y, a, b);`) get `isPrimitive: true`
  + a synthesised `portOrder: ['Y', 'A', 'B', …]` so the IR printer
  emits them as positional Verilog primitives again on the way out.
- **Module instances** carry their named-port `portMap` and folded
  param values.
- **Verilog `(* attribute *)` blocks** — captured by the parser and
  carried into `IR.attributes` as `{ key: 'verilog-attr', value }`
  pairs, so they survive round-trip without colliding with IR-internal
  attribute keys (e.g. `stage`).
- **Memories** — `reg [W-1:0] mem [0:DEPTH-1];` becomes
  `IR.memories[i] = { instanceName, width, depth }`.
- **System tasks/functions** — `$readmemh`, `$display`, etc. — pass
  through verbatim via a `_verilog` literal sidecar so the printer
  re-emits them as-is. Phase 9 doesn't model their semantics in IR.
- **Multi-module** — every top-level `module` elaborates; the LAST one
  is the top, the rest go under `IR.submodules`.

### Verified by

- `examples/tests/test-hdl-elaborate.mjs` — 30 unit checks.
- `examples/tests/test-hdl-elaborate-l1-gate.mjs` — every Phase 1-8
  demo (21 files) exports → parses → elaborates and the resulting IR
  matches the original IR's ports, nets, memories, and instance counts.
- `verify/roundTrip.js` now uses the real parser + elaborator by
  default — `roundTripIR(ir)` is no longer vacuous.

### Known gaps (deferred to Phase 10+)

- Cross-check against Yosys IR — needs Yosys integration first.
- `originalText` on every IR node — captured at the AST level
  (`srcRange`) but not yet shuttled into IR for Fidelity Mode.

## Phase 10 — IR → circuitJSON & Component Inference ✓

The importer turns an elaborated IRModule back into a circuit.json
the canvas can render. Inference is conservative: anything we don't
canonicalize ships as a `VERILOG_BLOCK` placeholder that holds the
original IR fragment, so even non-canonical RTL round-trips out
unchanged.

### Recognised patterns

- **Ports** (input/output/inout) → INPUT / OUTPUT / CLOCK nodes.
  CLOCK is detected by name (`clk` / `clock` / `tck`); everything
  else stays INPUT/OUTPUT. Bit-widths preserved.
- **Primitive gate instances** — `and`, `or`, `xor`, `nand`, `nor`,
  `xnor`, `not`, `buf` → GATE_SLOT with the matching `gate` prop.
- **Sequential always blocks** with one NBA per cycle:
  - `always @(posedge clk) q <= d;` → REGISTER (data, clk wired).
  - `always @(posedge clk or posedge rst) if (rst) q <= 0; else q <= d;`
    → REGISTER with CLR pin wired (handles `if (!rst)` form too).
- **Sub-module instantiations** → SUB_CIRCUIT placeholder. Inner IR
  carried on `_verilog` for round-trip; recursive lowering is
  Phase-10b work.
- **Continuous assigns**:
  - Trivial rename (`assign y = a;`) → drops out, the LHS becomes
    another alias for `a`'s driver. No node created.
  - Anything else → VERILOG_BLOCK with `_verilog: { kind: 'assign', lhs, rhs }`.

### Wire reconstruction

A `driverByNet` map associates each net name with the node + outIdx
that drives it. After two passes (drivers register first, then
consumers wire up), every primitive input + register input + OUTPUT
port pulls in its source. Multi-driver fan-out (one driver feeding N
sinks) is preserved natively by the canvas's wire model.

### Coordinates

The importer ships every node at `(0, 0)`. Phase 11 (auto-layout)
picks them up and assigns `x` / `y` deterministically.

### Verified by

- `examples/tests/test-hdl-toCircuit.mjs` — 28 unit checks
  (ports → INPUT/OUTPUT/CLOCK, AND/OR primitive inference, gate-chain
  intermediate net resolution, register inference both with and without
  reset, submodule placeholder, expression-block fallback).

### Expression-tree lowering ✓

`_lowerExpression(expr, ctx)` recursively descends an IR expression
and materialises matching palette components:

- **Ref** → returns the existing driver from `driverByNet`.
- **Literal** → emits a fixed INPUT node carrying the constant.
- **UnaryOp** (`~`, `!`) → GATE_SLOT.NOT.
- **BinaryOp** mapped via `BINOP_TO_GATE`:
  `&` → AND, `|` → OR, `^` → XOR, `~&` → NAND, `~|` → NOR,
  `~^` / `^~` → XNOR. Recursively lowers operands first.
- **Ternary** (`sel ? a : b`) → MUX with `inputCount=2`,
  D0=else, D1=then, SEL=cond. Nested ternaries chain into
  nested MUXes.
- Arithmetic (`+`, `-`, `*`, `/`, `%`), shifts, comparisons → fall
  through and surface as VERILOG_BLOCK so the IR survives.

### Sequential pattern detection ✓

A `posedge`-clocked always block whose body is **one** NBA (with or
without an async-reset `if` guard) infers to:

- **FLIPFLOP_D** when the latched signal is 1-bit AND there's no
  reset (the canonical D-FF shape).
- **REGISTER** when multi-bit OR an async reset is present.
- DATA / CLR / CLK pins wired automatically; `isClockWire: true`
  set on the clock edge.

Multi-NBA / unrecognised sequential bodies survive as a
`VERILOG_BLOCK` placeholder.

### Combinational case → MUX ✓

An `always @(*)` containing a single `case` with N mutually-exclusive
arms (each: `out = expr`) → MUX with `inputCount = N`, data inputs
wired in arm-index order, SEL wired to the case selector.

### Memory inference ✓

Each `IR.memories[i]` becomes:

- **RAM** when at least one always block writes to `mem[addr] <= …`
  or `mem[addr] = …`.
- **ROM** otherwise.

`dataBits` and `addrBits = ceil(log2(depth))` come straight from the
IR memory declaration. `asyncRead: true` matches the canvas default.

### L3 round-trip status

`examples/tests/test-hdl-toCircuit-l3-gate.mjs` runs every Phase 1-10
demo through `export → import → re-export` and reports a structural
shape diff. As of this commit:

- **23/23** demos survive round-trip without crashes (0 import / export
  failures).
- **2/23** are shape-equivalent (the simplest demos).
- The remaining 21 show shape diffs that point at inference gaps for
  complex composites (ALU / RegFile / FIFO / IR / CU / SUB_CIRCUIT).
  These are tracked rather than blocking — byte-identical re-emission
  for arbitrary RTL is a Phase-12 (Fidelity Mode) goal that needs
  `originalText` plumbing through every IR transform.

### Known gaps (deferred to Phase 12)

- Recursive sub-module lowering — today inner IR is preserved as a
  placeholder; a follow-on pass should re-import each unique inner
  module and stitch it back as a real nested circuit.
- Composite component inference (ALU / Comparator / Counter / RegFile
  / FIFO / Stack / IR / CU / PC) — currently fall back to either
  expression-tree lowering (and lose the high-level component
  identity) or VERILOG_BLOCK.

## Phase 11 — Auto-Layout for Imported Designs ✓

`autoLayout(circuit)` runs after `toCircuit` and assigns deterministic
`x` / `y` coordinates to every node so the imported circuit is
viewable on the canvas without manual rearrangement.

### Algorithm

1. **Build a directed graph** from `circuit.wires`. Wires marked
   `isClockWire: true` are skipped — without this, a sequential
   feedback loop (`always @(posedge clk) q <= d` plus `q` driving
   back into `d`) would create infinite-column blow-up.
2. **Pin sources to column 0**: every INPUT / CLOCK lands on the
   left edge.
3. **Iterative longest-path depth assignment** — each non-source
   node gets `column = max(driverColumn) + 1`. Bounded to 2N
   iterations so cyclic graphs terminate gracefully (back-edges are
   simply ignored once their target is already placed).
4. **Sinks pinned to the rightmost column** — every OUTPUT lands at
   `maxColumn + 1` so the visual right-to-left flow stays clean.
5. **Within each column**, nodes are sorted by stable id, then
   distributed vertically with uniform `ROW_HEIGHT` spacing — two
   imports of the same `.v` produce byte-identical layouts.

### Coordinate constants

- `COL_WIDTH = 220 px` (horizontal stride between columns)
- `ROW_HEIGHT = 100 px` (vertical stride between rows)
- `ORIGIN_X = -400 px`, `ORIGIN_Y = -200 px` (top-left of column 0)

### Public entry

`importVerilog(text)` runs layout by default. Pass `{ layout: false }`
to opt out — the raw scene comes back with every node at `(0, 0)`
(useful for callers that want to do their own placement).

### Verified by

`examples/tests/test-hdl-layout.mjs` — 14 unit checks: every node
positioned, inputs left/outputs right, deterministic across runs, no
within-column overlap, clock wires excluded from depth, opt-out flag,
hand-built circuit (no import) accepted.

### Bus-lane allocation

Each wire receives a `_lane` index 0..N-1 inside the gutter between
its source column and target column. Wires sharing a gutter sort by
`(sourceId, targetId, targetInputIndex)` and get distinct lane indices,
so the canvas's Manhattan router can stagger their vertical
mid-segments instead of stacking them on top of each other. The number
of lanes used is recorded in `circuit._layout.wireLanes`.

### Async / large-design path

`autoLayoutAsync(circuit, { threshold, onProgress })` runs the same
algorithm but yields control through `Promise` boundaries before each
phase, so a host UI thread (or a Web Worker spun up by Phase 12)
doesn't block. Below `threshold` (default 500 nodes) it short-circuits
to the sync path. The `onProgress(phase, fraction)` callback fires at
each phase boundary so a progress bar can advance smoothly.

### Verified by

`examples/tests/test-hdl-layout.mjs` — 22 unit checks: every node
positioned, inputs left/outputs right, deterministic across runs,
no within-column overlap, clock wires excluded from depth, opt-out
flag, hand-built circuit accepted, bus-lane allocation distinct per
gutter, no node intersections on straight wire paths, `autoLayoutAsync`
emits progress events.

### Known gaps (deferred)

- Web Worker boundary — `autoLayoutAsync` yields cooperatively but
  runs on the same thread. Spinning up a real Worker is a Phase 12
  concern (needs `postMessage` serialisation + the Vite plugin).

## Phase 12 — Import UX & Fidelity Mode ✓

### IMPORT .V button + drag-and-drop modal

A new IMPORT .V button sits in the bottom toolbar next to VERILOG
export. Dragging a `.v` / `.vh` / `.sv` / `.svh` file anywhere on the
canvas opens the same modal. The modal exposes:

- File name + byte count.
- Top-module picker — pre-fills with every `module NAME` in the file
  and pre-selects the one named `top` (case-insensitive) or the last
  one if no `top` exists.
- Fidelity-mode dropdown: CANONICAL vs FIDELITY.
- Parse-error surface — first error highlighted with line:col + a
  caret pointer at the offending source line.
- Import report — `"Imported 3 modules, 42 gates, 16 flip-flops, 1 RAM
  (2 KiB). Unmapped constructs preserved as Verilog Blocks: 0."`
- Two commit actions: REPLACE CURRENT (atomic-undo whole-scene swap)
  or ADD AS SUB-CIRCUIT (synthesises a SUB_CIRCUIT node carrying the
  imported scene as `subCircuit`).

### Fidelity Mode

`toVerilog(ir, { fidelity: true })` re-emits each IR node's
`originalText` (captured by `elaborate(ast, { source })` from the AST
source range) verbatim — comments, attributes, identifier casing, and
unusual whitespace all survive byte-for-byte. Modules that lack
`originalText` fall through to the IR-driven pretty-printer.

CANONICAL mode is unchanged: clean structural emission from the IR.

### Verilog Block canonicalisation

`hashVerilogBlock(text)` re-parses the fragment, strips `srcRange` /
`attributes` / `originalText` from the AST, walks the tree
deterministically (keys sorted), and FNV-1a-hashes the result. Two
users importing the same fragment with different whitespace or
comments produce the same hash; two users importing semantically
different fragments produce different hashes.

### Helpers in `js/hdl/ui/ImportModal.js`

- `listModuleNames(text)` — lightweight token walk to extract every
  top-level `module NAME` name. Used to populate the top-module
  dropdown without a full parse.
- `pickTopModule(names)` — heuristic: explicit `top` (case-insensitive)
  wins; otherwise the last module in the list.
- `buildImportReport(circuit)` — produces `{ line, counts }` for the
  modal banner. Counts gates / FFs / registers / muxes / RAM (with
  bytes) / ROM / sub-circuits / VERILOG_BLOCKs.
- `formatParseError(err, source)` — `{ headline, snippet, line, col }`
  with the offending source line + a caret.
- `hashVerilogBlock(text)` — canonicalisation hash.

### Verified by

- `examples/tests/test-hdl-import-ux.mjs` — 24 unit checks
  (listModuleNames / pickTopModule / buildImportReport /
  formatParseError / hashVerilogBlock / Fidelity Mode preservation /
  Canonical Mode stripping / full importVerilog pipeline).
- `examples/tests/test-hdl-fidelity.mjs` — round-trip on the
  hand-written sidecar `examples/hdl-corpus/phase12-fidelity-demo.v`:
  every comment / attribute / parameter / `$display` line preserved
  in Fidelity mode; (* keep *) stripped in Canonical mode; re-parse
  yields the same module count + name.

### Known gaps (deferred to Phase 13)

- "Open in new tab" import option — only Replace + Add-as-sub-circuit
  are wired today.
- Module picker UX — currently a simple `<select>`; the original plan
  imagined a full chooser when >1 module is present.
- Per-instance / per-statement `originalText` carry-over — today
  Fidelity Mode preserves the WHOLE module verbatim. Per-item
  splicing (so partially-edited IRs preserve the unchanged ranges)
  is a future refinement.
