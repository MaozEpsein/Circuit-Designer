# Pipelining

A pipeline-aware analysis layer over the circuit. Open any pipelined design, hit the **PIPE** button (or `P`), and the panel reports everything below live. All analysis runs in-memory on a cache invalidated by scene edits; single-clock scenes short-circuit the multi-clock passes.

## Quick Start

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
Drag a **PIPE** chip from the Pipeline palette tab. Wire data through it. Open the panel (it was already watching) — the moment the new circuit has at least one `PIPE_REG` with a valid data path, stages appear and the analyzer starts reporting delay, hazards, violations, and program-hazards (if there's a ROM). Everything below this Quick Start is incremental — analysis utilities ([js/analysis/](../js/analysis/)), delay model ([js/pipeline/DelayModel.js](../js/pipeline/DelayModel.js)), retimer internals — wired into the same panel. No extra configuration required.

---

## Capabilities

**Core analysis**
- **Stage levelization** — Kahn's topo-sort over data wires, cut at every `PIPE_REG`. Each node gets a `stage` index; the panel shows latency in cycles, bottleneck stage, f_max (ps → MHz/GHz), and per-stage balance.
- **Delay model** — picosecond delays per component type with weighted critical-path reporting and a click-to-highlight path overlay on the canvas.
- **Cross-stage validation** — flags any data wire that crosses stage boundaries without a `PIPE_REG` and paints it red on the canvas.
- **Auto-retime** — Leiserson–Saxe-style greedy single-move suggestions with a preview overlay, semantics-preserving verification by random-vector simulation diff, and one-step undo.

**Hazards**
- **Hardware hazards** — RAW / WAR / WAW / LOOP detection over the datapath graph with per-type suggestions and clickable jump-to-wire.
- **Program hazards** — ROM decoded per-ISA; pair-wise RAW / WAR / WAW / load-use with bubble counts and disassembled source/sink rows. Multi-cycle producers widen the dependency window (`effW = W + latency − 1`).
- **Loop analysis** — backward-branch detection with induction-register inference; cross-iteration "steady-state" hazards tagged distinctly from cold-start ones.
- **Forwarding detection** — structural pattern match on bypass MUXes (EX→EX, MEM→EX, WB→EX); resolved RAWs drop their bubbles and badge as `✓`. Coverage summary shows which canonical paths are present.

**Pipeline Diagram**
- **Gantt view** — instruction × cycle grid, colour-coded cells (`IF` / `ID` / `EX` / `MEM` / `WB`), stall bubbles between ID and EX, flush cells in the two IF slots after a taken JMP. Rendered directly from the decoded ROM + forwarding-aware program-hazard output, so the visible cycle count matches the PERFORMANCE section exactly. Bounded at 64 instructions / linear PC walk.

**Control + elastic**
- **Stall / flush** — per-stage `S`/`F` badges derived statically from PIPE_REG input wiring.
- **HANDSHAKE** — valid/ready elastic pipelines with an `E` badge on affected stages.
- **LIP checker** — structural validation of HANDSHAKE wiring: unregistered V/R, dangling S, and V→R combinational deadlock.

**Multi-clock**
- **CDC detector** — every stateful node is mapped to its driving CLOCK; cross-domain data paths are reported with a synchronizer-depth badge (≥2 PIPE_REGs on the destination clock = classical 2-flop synchronizer).

**ISA inference**
- Auto-derives `{fields, opcodes}` from the native `CU.controlTable` + `IR` bit-layout, or descends recursively into a SUB_CIRCUIT-based CU and falls back to the ROM's `dataBits` when no IR node exists. No hand-maintained ISA JSON required for the shipping demos.

**UX + infrastructure**
- Keyboard shortcuts (`P`, `Shift+P`, `Ctrl+Shift+R`), colorblind-friendly stage palette, local telemetry counters, and a perf baseline (median `analyze()` ≈ 2 ms on a 500-node / 10-stage scene, hard-fail regression gate at 200 ms).

## Module Layout
```
js/pipeline/
├── PipelineAnalyzer.js         # public API, event wiring, cache
├── StageEvaluator.js           # levelization + critical path
├── DelayModel.js               # per-type picosecond delays
├── HazardDetector.js           # hardware RAW/WAR/WAW/LOOP
├── InstructionDecoder.js       # ROM → decoded instruction stream
├── ProgramHazardDetector.js    # ISA-level hazards, multi-cycle, loops
├── LoopAnalyzer.js             # backward-branch + induction-var detection
├── ForwardingDetector.js       # bypass-mux pattern match
├── PipelineScheduler.js        # Gantt (instruction × cycle) static schedule
├── CdcDetector.js              # clock-domain crossings
├── LipChecker.js               # HANDSHAKE wiring rules
├── Retimer.js / RetimeVerifier.js
├── isa/ { default, IsaInference }
└── ui/ { PipelinePanel, StageOverlay }
```

**Demos** — ≈10 pipeline demos under the **Pipeline** tab of the Examples menu: basic analyzer (`pipeline-demo`), imbalanced for retime, hazards (all four types), program hazards (simple / rich / all types), elastic back-pressure, MIPS 5-stage with and without forwarding, induction-variable loop, and multi-clock CDC.

## Future Work — Pipeline Engine

- **Hazard heatmap on Gantt** — color-code pipeline bubbles by hazard type (RAW / WAW / WAR / control / structural / load-use) with hover tooltips explaining the cause and a "Suggest fixes" panel that proposes forwarding paths or reorderings.
- **Branch predictor visualizer** — pluggable predictors (static BTFN, 1-bit, 2-bit saturating counter, BTB) with a live FSM/state-table panel, speculative-execution shading on the Gantt, misprediction flush highlighting, and side-by-side hit-rate / CPI comparison across predictors.
- **L1 cache simulator** — optional cache block between CPU and RAM (configurable size / line / associativity / replacement / write policy) with a live cache-inspector panel, hit/miss visualization, 3C miss breakdown (compulsory / capacity / conflict), memory-access heatmap, and a sweep tool for plotting hit-rate vs. cache size.
