# HDL Toolchain — Supported Verilog Subset

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

- Component inference: `and g(...)` → `GATE_SLOT` circuit node etc.
  The IR is structurally faithful; turning it into circuit nodes is
  Phase 10's job.
- Cross-check against Yosys IR — needs Yosys integration first.
- `originalText` on every IR node — captured at the AST level
  (`srcRange`) but not yet shuttled into IR for Fidelity Mode.
