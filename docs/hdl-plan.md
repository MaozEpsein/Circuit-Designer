# HDL Toolchain — Verilog Import / Export

Status: Active development. Phases 1–2 complete; Phase 3 in progress; Phases 4–13 planned (see status checkboxes below).

## HDL Quickstart

**Export a design to Verilog** — click `VERILOG` in the bottom toolbar.
The modal previews the generated `.v` with syntax highlighting,
line-number gutter, stats bar, header / top-module toggles, and
buttons for `COPY`, `DOWNLOAD .v`, `TESTBENCH`, and `PROJECT .ZIP`.
Stage attributes (set by the pipeline analyzer) appear as
`// ─── Stage N ───` dividers in the body.

**Import a `.v` file** — click `IMPORT .V` next to the export button,
or drag the file anywhere on the canvas. The modal shows the file
name + size, a top-module picker (auto-pre-selected), a fidelity-mode
toggle, the first parse error (with line:col + caret), and an import
report. Two commit actions: `REPLACE CURRENT` (whole-scene swap with
undo) or `ADD AS SUB-CIRCUIT`.

**Fidelity Mode** preserves the source byte-for-byte: comments,
`(* attributes *)`, parameters, and `$display` calls all survive a
round-trip. **Canonical Mode** re-emits clean structural Verilog from
the IR.

**Run the test suite** — `node examples/tests/run-hdl.mjs`. The
1000-seed property fuzz lives in `test-hdl-fuzz.mjs`; corpus
round-trip in `test-hdl-corpus-round-trip.mjs`. See
[INSTALL.md](../INSTALL.md) for the optional iverilog / Yosys
dependencies.

**Troubleshooting:**
- *"Parse error at L:C"* — the modal points at the offending token. The
  parser supports the subset documented in [js/hdl/SUPPORTED.md](../js/hdl/SUPPORTED.md);
  constructs outside it land as `VERILOG_BLOCK` placeholders that
  round-trip safely but don't render as schematic.
- *"Output is simulation-only"* in the export header — `synthesisSafe:
  false` was set; multi-driver tri-state preserved as `1'bz` instead of
  being lowered. Drop the flag for synth-clean output.
- *Imported circuit looks stacked at the origin* — `autoLayout` ran but
  zero wires connected the nodes. Usually means the source had ports
  with names that don't match what the inferer expects (case-sensitive).

---

## Development Plan

Converts Circuit Designer from a self-contained simulator into a first-class RTL design tool that interoperates with the industry toolchain (Yosys, Verilator, ModelSim, Vivado, FPGA flows).

The **logic, IR, parser, translators, verification harness, and documentation** live in a new module under `js/hdl/` and are fully isolated from existing subsystems. **Integration touchpoints are intentional and minimal**, limited to: one export button wired into [app.html](../app.html) + [js/app.js](../js/app.js); a preview modal (Phase 7) and an import modal (Phase 12) that mount into existing UI containers; and read-only consumption of `SceneGraph.serialize()` and `SimulationEngine` values. No existing subsystem's behaviour is modified.

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
- [ ] **DISPLAY_7SEG** — output sink with 7 segment pins; emits `output [6:0] seg;` plus the per-segment assigns. Treated like a primary OUTPUT in the export model.
- [ ] **L1/L2/L3/L4 gate**: every component is tested with a scripted stimulus; iverilog VCD diffs against native VCD with zero mismatches (after stability-skip); Yosys round-trip produces equal IR; `synth_ice40` completes clean.
- [ ] `examples/tests/test-hdl-combinational.mjs` — exhaustive truth tables for small inputs, random vectors for wider buses.
- [ ] `ir/lowerTriState.js` — implement the BUS → one-hot MUX pass declared in [SEMANTICS.md](../js/hdl/SEMANTICS.md). Standalone test on synthetic IR (no BUS translator yet); full usage exercised in Phase 5.
- [ ] **VERILOG-tab demo:** ship `examples/circuits/verilog-phase3-gates.json` tagged `['verilog', 'phase3', ...]`. Numbered title `3. VERILOG — combinational gates round-trip`.

#### Phase 4 — Sequential Translators
- [ ] Flip-Flops: D, T, SR, JK — `always @(posedge clk or negedge clr_n)` blocks; reset polarity honours exporter option.
- [ ] Latches: D, SR — `always @(*)` with explicit sensitivity, Verilator lint-clean.
- [ ] Registers (N-bit, EN / CLR / CLK).
- [ ] Shift Register (bidirectional, parametric width).
- [ ] Counter (EN / LOAD / DATA / CLR) with TC output.
- [ ] **SCAN_FF** — DFT scan flip-flop. Pin order in our engine: D=0, TI=1, TE=2, CLK=3 → Q. Emits `always @(posedge clk) q <= te ? ti : d;`. Yosys lowers it to `$mux + $dff`, so round-trip should be clean. Test goes in `test-hdl-sequential.mjs`.
- [ ] **LFSR** — Fibonacci shift-left register with XOR taps. Engine props: `bitWidth`, `taps[]` (LSB-indexed), `seed`. Emits `reg [N-1:0] r = SEED; always @(posedge clk) r <= {r[N-2:0], ^(r & TAP_MASK)};`. Param-driven so the same translator handles arbitrary widths/polynomials.
- [ ] **Pipeline Register** (`PIPE_REG`) — full pipeline-aware translation (merged in from the old *Pipelining Phase 11*):
  - Stage-wise `always @(posedge clk)` with `if (!stall) q <= d;` / `if (flush) q <= 0;` semantics, mirroring the engine's runtime behaviour.
  - `stage` attribute (placed on the IR node by `fromCircuit`) preserved through to Verilog as a leading comment (`// Stage N: <label>`) so the generated HDL is navigable without losing the pipeline structure.
  - **L2/L3 gate**: a scripted stimulus across `examples/circuits/pipeline-demo.json` must produce a VCD that matches the native simulation bit-for-bit over ≥256 cycles after the standard stability window.
- [ ] Clock tree correctness — a circuit with multiple clock domains must emit each `always` block sensitive to the correct clock.
- [ ] **L1/L2/L3 gate**: clocked stimulus simulated in both engines for ≥1024 cycles, VCD identical; round-trip through IR stable.
- [ ] `examples/tests/test-hdl-sequential.mjs`.
- [ ] **VERILOG-tab demo:** ship `examples/circuits/verilog-phase4-sequential.json` tagged `['verilog', 'phase4', ...]`. Numbered title `4. VERILOG — sequential round-trip (FFs, registers, SCAN-FF, LFSR)`.

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
- [ ] **VERILOG-tab demo:** ship `examples/circuits/verilog-phase5-cpu.json` tagged `['verilog', 'phase5', ...]`. Numbered title `5. VERILOG — Simple-CPU countdown program`.

#### Phase 6 — Hierarchy & Sub-circuits
- [ ] Each sub-circuit exports as its own `module` above `module top`.
- [ ] Width-parametric sub-circuits emit `parameter WIDTH = N` with `#(.WIDTH(N))` at instantiation sites.
- [ ] Identical sub-circuit definitions are de-duplicated by content hash.
- [ ] Port-name collision handling (internal labels never shadow top-level).
- [ ] Nested hierarchies (≥3 levels deep) — recursive with memoization.
- [ ] **L3 gate**: round-trip of a 3-level design yields byte-identical output on second export.
- [ ] `examples/tests/test-hdl-hierarchy.mjs`.
- [ ] **VERILOG-tab demo:** ship `examples/circuits/verilog-phase6-hierarchy.json` tagged `['verilog', 'phase6', ...]`. Numbered title `6. VERILOG — sub-circuits & hierarchy`.

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
- [ ] **VERILOG-tab demo:** ship `examples/circuits/verilog-phase7-export-ux.json` tagged `['verilog', 'phase7', ...]`. Numbered title `7. VERILOG — export UX showcase` (small mixed circuit that exercises the modal preview, syntax highlight, and the testbench generator).

#### Phase 8 — Hand-Written Verilog Lexer & Parser (Fidelity Layer)
The primary Verilog reader is Yosys (Phase 3). This phase builds a **hand-written parser in parallel** — used by Fidelity Mode (Phase 12), by error messages that need exact source spans, and as a fallback for Verilog inside our subset but rejected by the specific Yosys version in use.
- [ ] Lexer — identifiers, sized & unsized numbers (`8'hFF`, `4'b10x1`), operators, keywords, line/block comments, attributes `(* … *)` (preserved but ignored). Exact line/col tracking. Mirrors the pattern of [js/cpu/compiler/Lexer.js](../js/cpu/compiler/Lexer.js).
- [ ] AST — `Module`, `Port`, `ParamDecl`, `Net`, `Reg`, `Assign`, `AlwaysBlock`, `InitialBlock`, `Case`, `If`, `For` (unroll-only), `Instantiation`, `GateInstance`, `BinaryOp`, `UnaryOp`, `Ternary`, `Concat`, `Replicate`, `Slice`, `SystemCall` (e.g. `$readmemh`). Every AST node carries the exact source range, which becomes `IRNode.originalText`.
- [ ] Parser — recursive descent, error recovery at statement boundaries, precise `file:line:col` messages with the offending token and expected set.
- [ ] Parser resource limits — max recursion depth, max token count, timeout. Prevents adversarial `.v` from hanging the importer.
- [ ] `SUPPORTED.md` — first version committed: lists every accepted construct with a tiny example for each.
- [ ] **L1 gate**: the parser round-trips every `.v` file produced by Phases 3-6 without error, and the AST → Verilog pretty-print preserves semantics (iverilog simulation identical before/after).
- [ ] **Cross-check gate**: for every `.v` file in the external corpus, Yosys JSON-derived IR and hand-written-parser-derived IR are structurally equal (modulo the width canonicalisation pass). Divergences point at bugs in either side.
- [ ] `examples/tests/test-hdl-parser.mjs`.
- [ ] **VERILOG-tab demo:** ship `examples/circuits/verilog-phase8-parser.json` tagged `['verilog', 'phase8', ...]` together with a sidecar `.v` file under `examples/hdl-corpus/` that the parser reads. Numbered title `8. VERILOG — hand-written parser exercise`.

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
- [ ] **VERILOG-tab demo:** ship `examples/circuits/verilog-phase9-elaborate.json` (or a sidecar `.v`) tagged `['verilog', 'phase9', ...]`. Numbered title `9. VERILOG — elaboration & widths`.

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
- [ ] **VERILOG-tab demo:** ship `examples/circuits/verilog-phase10-import.json` (the result of importing a curated `.v`) tagged `['verilog', 'phase10', ...]`. Numbered title `10. VERILOG — import to canvas`.

#### Phase 11 — Auto-Layout for Imported Designs
- [ ] DAG topological layering — inputs on the left, outputs on the right, combinational depth determines column.
- [ ] Grid placement within each column (deterministic, stable — two imports of the same file produce the same layout).
- [ ] Wire routing — reuse the existing Manhattan router with Bezier corners.
- [ ] Collision avoidance, minimum spacing, lane allocation for buses.
- [ ] Sub-circuits placed as single blocks; user drills in via the Block Viewer.
- [ ] Large design handling — if the imported circuit exceeds N components, layout runs in a Worker with a progress bar.
- [ ] `examples/tests/test-hdl-layout.mjs`.
- [ ] **VERILOG-tab demo:** ship `examples/circuits/verilog-phase11-layout.json` (a freshly auto-laid-out import) tagged `['verilog', 'phase11', ...]`. Numbered title `11. VERILOG — auto-layout for imports`.

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
- [ ] **VERILOG-tab demo:** ship `examples/circuits/verilog-phase12-fidelity.json` tagged `['verilog', 'phase12', ...]` with the matching `.v` source under `examples/hdl-corpus/`. Numbered title `12. VERILOG — fidelity-mode round-trip`.

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
- [ ] **VERILOG-tab demo:** ship `examples/circuits/verilog-phase13-corpus-tour.json` tagged `['verilog', 'phase13', 'release', ...]`. Numbered title `13. VERILOG — release showcase` (a small but representative slice of the final corpus, chosen so the user can browse a single demo and see every category of construct land in real components).

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
