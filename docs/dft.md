# DFT — Design For Test

The DFT subsystem provides hands-on test-infrastructure components and a fault-coverage analyzer. It is exposed via the **DFT** button (or `T`) in the HUD, which opens the DFT panel — a live read-out of every test structure in the current scene plus the fault-simulator results when a stimulus is applied.

The intent is pedagogical and demonstrative, not to ship an industrial ATPG flow. The **fault list view, scan-chain auto-detection, BIST/JTAG state machines, and signature compaction** are all wired to the same simulation engine that drives normal logic, so a student can drop in a SCAN-FF chain, generate an LFSR pattern, run the BIST controller, and watch a MISR signature converge — all inside the canvas.

## Components

| Component | Role |
|---|---|
| **SCAN_FF** | Scan flip-flop. Pin order `D, TI, TE, CLK → Q`. With `TE=0` it behaves as a normal D-FF; with `TE=1` it captures from `TI` (test-input). Chains form when one SCAN_FF's `Q` drives the next one's `TI`. |
| **LFSR** | Fibonacci linear-feedback shift register. Properties: `bitWidth`, `taps[]` (LSB-indexed), `seed`. Drives test patterns into a scan-in or directly onto a primary input. |
| **MISR** | Multiple-input signature register — a parallel-input LFSR used as a signature compactor. Reduces a long sequence of output values to a fixed-width fingerprint comparable against a *golden signature*. |
| **BIST_CONTROLLER** | Built-in self-test FSM. States: `IDLE → SETUP → RUN → COMPARE → DONE`. Drives the LFSR(s) for `runLength` cycles, then compares the MISR's signature against `goldenSignature`. |
| **JTAG_TAP** | IEEE 1149.1 Test Access Port. Implements the canonical 16-state TAP FSM (Test-Logic-Reset, Run-Test/Idle, Select-DR/IR-Scan, …, Update-DR/IR), an IR of `irBits` width, and a 32-bit ID code. |
| **BOUNDARY_SCAN_CELL** | Boundary-scan cell intended for chip-edge wiring. Two-mode operation: normal pass-through and test (capture/update through the JTAG TAP). |

Wire-level fault state (`stuck-at-0`, `stuck-at-1`, `open`, `bridge`) is per-wire metadata read by both the simulator (live) and the fault simulator (golden vs faulty comparison).

## DFT Panel — `js/dft/ui/DFTPanel.js`

Single panel with collapsible sections. Each section is read-only when no scene state matches it (e.g., no SCAN_FFs → "Scan Chains" hides itself with a hint).

**Testability Overview** — wire count, fault candidates, detected vs. undetected (after the most recent fault-sim run), fault-coverage percentage, current vector count.

**Scan Chains** — auto-detected from the scene. The detector walks each SCAN_FF's `TI` driver: if it's another SCAN_FF's `Q`, the two are linked; the chain head is any SCAN_FF whose `TI` is *not* fed by another SCAN_FF. Per chain it shows: head, tail, length, `TE` source (which signal arms the scan mode), and the scan-in / scan-out endpoints. Chains of length 1 with no upstream/downstream linkage are flagged as "orphans" so they don't pollute the topology view.

**Pattern Generators (LFSRs)** — for each LFSR in the scene:
- Live state, period (computed by direct simulation up to `2^N` cycles), and feedback polynomial in `1 + x^a + x^b + … + x^N` form.
- Edit fields for `bitWidth`, `taps[]`, `seed` — saved through the standard command pipeline so the change is undoable.
- Sink resolution — where the LFSR's `Q` actually goes (scan-in to a chain, primary input, or "unused").
- Special states flagged: `seed === 0` (LFSR cannot advance), `taps === []` (no feedback, becomes a shifter), `period < 2^N − 1` (sub-maximal polynomial).

**Signature Compactor (MISR)** — golden signature comparison with selectable radix (BIN / DEC / HEX), polynomial display, parallel input count.

**BIST Controller** — current FSM state, `runLength` (how many RUN cycles before COMPARE), golden signature, pass/fail badge after a comparison.

**JTAG TAP** — current state in the 16-state FSM with a small diagram, IR contents, IDCODE, TMS/TCK trace.

**Fault List** — every wire × every active fault model. Columns: wire id, kind (`sa0` / `sa1` / `open` / `bridge`), detected by which test vectors, status badge.

**Fault Injection (manual)** — right-click any wire to inject `stuck-at-0`, `stuck-at-1`, `open`, or `bridge` (paired with another wire). The simulator honours the injection live; clearing is a single click.

> **Mobile:** the panel is fully read-only on mobile-viewer mode. All editing controls (LFSR fields, GEN RANDOM, RUN FAULT SIM, fullscreen) are hidden via CSS; the structural views remain.

## Fault Simulator — `js/dft/FaultSimulator.js`

Combinational fault simulator. Skips ATPG entirely — the user supplies test vectors, the simulator scores them against every candidate fault.

```js
import { simulateFaults } from 'js/dft/FaultSimulator.js';

const result = simulateFaults(nodes, wires, vectors, {
  models: ['stuck-at-0', 'stuck-at-1', 'open']  // default
});
```

**Inputs**
- `nodes`, `wires` — the scene.
- `vectors` — array of vectors. Each vector is one assignment to **all** primary inputs (sorted by node id), as an array of 0/1 of length `primaryInputs.length`.
- `opts.models` — which fault models to enumerate per wire. `'bridge'` is excluded from auto-enumeration since it requires a partner wire; manually-injected bridges are still scored.

**Output**
```ts
{
  primaryInputs:  Node[],
  primaryOutputs: Node[],
  golden:         Value[][],     // per-vector golden output values
  perFault: [{
    id:         string,          // e.g. "wire-7/sa0"
    wireId:     string,
    kind:       'sa0' | 'sa1' | 'open',
    detected:   boolean,
    detectedBy: number[],        // indices into vectors[]
  }, ...],
  coverage: { detected: number, total: number, percent: number },
}
```

**Algorithm**
1. **Golden run** — apply each vector, evaluate, record the OUTPUT values.
2. **Per-fault loop** — clear any pre-existing injection on the wire, mutate it with the candidate fault, re-evaluate every vector, compare to golden. First differing primary output flags detection. Restore the wire when done.
3. **Coverage** — `detected / total` across all candidate faults.

The simulator reads OUTPUTs by following the wire that targets each OUTPUT node and reading its `wireValue` from the engine result map — this is the single chokepoint that already honours `stuckAt` / `open`, so faults propagate correctly without a separate fault-aware engine.

## Helper Exports — `js/dft/ui/DFTPanel.js`

The panel module exports a handful of pure helpers usable from tests, the engine, or future tooling:

| Function | Purpose |
|---|---|
| `detectScanChains(scanFFs, wires)` | Walks `TI`/`Q` links, returns ordered chain arrays head→tail. |
| `describeChainEndpoints(chain, allNodes, wires)` | Resolves a chain's external `scanIn` driver and `scanOut` consumer (or `null`). |
| `lfsrPeriod(width, taps, seed)` | True period via direct simulation; capped at `2^N`. Returns `{ period, stuckAtZero, hitsZero }`. |
| `lfsrPolynomial(width, taps)` | Pretty-print `1 + x^a + x^b + … + x^N`. |
| `describeLfsrSinks(lfsr, allNodes, wires)` | Reports each LFSR `Q` consumer; flags scan-in usage so the panel can label the LFSR as a BIST source. |

All five functions are pure and stateless — they take a snapshot and return data, suitable for unit tests.

## Adding a New DFT Component

Follow the standard [component checklist](../CONTRIBUTING.md). DFT-specific notes:

- **Pin order matters for SCAN_FF-class components.** Auto-chain detection relies on `TI` being input index 1 (`(w.targetInputIndex || 0) === 1`).
- **LFSR/MISR translators land in `js/hdl/translators/dft.js`** when HDL Phase 4 enables sequential translators (see [hdl-plan.md](hdl-plan.md)).
- **Boundary-scan cells** must be wired to a JTAG TAP via the canonical IR/DR shift signals; the panel will not auto-detect them otherwise.

## What This DFT Layer is NOT

- **Not an ATPG engine.** Test vectors are user-supplied or LFSR-generated; there is no SAT/structural pattern-generation pass.
- **Not sequential fault simulation.** The fault simulator is pure-combinational — sequential fault sim (with state) requires a different harness.
- **Not industrial-grade compaction.** Real silicon compresses vectors via EDT (Mentor) / OPMISR (Cadence) — this is called out in the panel's `[compaction?]` tooltip.
- **Not transition / delay-fault aware.** Only static stuck-at + open + bridge in this layer.

These are deliberate scope decisions: the layer focuses on demonstrating the *structures* (scan chains, LFSR, MISR, BIST, JTAG) and the *coverage idea* (vectors → detected faults), not on building a production tool.
