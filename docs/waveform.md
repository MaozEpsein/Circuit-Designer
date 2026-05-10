# Waveform Pro

An industry-grade waveform viewer built into the app. Brings the capability level of GTKWave / Vivado / ModelSim into a modern, minimal interface — no dense "CAD from the 90s" look.

## Design Principles

| Principle | In practice |
|---|---|
| Narrow palette | Green for HIGH, blue-grey for LOW, yellow for CLK, cyan for interaction, white for text. Nothing more. |
| Readable type | JetBrains Mono 12px for values, 11px for labels. Never below 10px. |
| Generous spacing | Row height 32–40 px. Visible gap between signal groups. |
| Quiet grid | Time gridlines at ~10 % opacity. Not a chessboard. |
| Gentle motion | Zoom / pan eased over 150 ms. Cursor tracks smoothly. No jumps. |
| One interaction color | Anything clickable / draggable is cyan. No rainbow of button colors. |

## Capabilities

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

## Implementation

The module lives in `js/waveform/` with one concern per file:

```
js/waveform/
├── WaveformRenderer.js    — canvas drawing only (signals, grid, cursor visuals)
├── WaveformController.js   — input handling, public API, orchestration
├── WaveformState.js        — view state, history, search, trigger, groups, bookmarks
├── WaveformVCD.js          — VCD import and export
└── WaveformTheme.js        — color palette, typography, spacing constants
```

## Performance

| Metric | Budget |
|---|---|
| Memory footprint | ≤ 10 MB for a typical session (20k cycles × 50 signals) |
| Idle CPU cost | ≤ 2 % at 30 fps render while the panel is visible |
| Render cost per frame | ≤ 4 ms for ~50 signals × ~500 visible steps |
| Peak latency (search, export) | ≤ 100 ms spike, never blocking the main thread for longer |
| History retention | Circular buffer capped at 20k cycles; older entries drop automatically |

Enforced via: circular history buffer, `requestAnimationFrame`-throttled input, skipped rendering while hidden, early-exit pattern search, and off-main-thread work reserved for future > 100 ms tasks.

## Tests

Automated coverage in `examples/tests/`:

| File | Checks |
|---|---|
| `test-mips-gcd.mjs` | 45 — circuit integrity, datapath widths, GCD program correctness |
| `test-vcd-export.mjs` | 11 — VCD header, timeline, value encoding |
| `test-vcd-import.mjs` | 15 — export → import round-trip, bus detection |
| `test-view-state.mjs` | 19 — serialize / deserialize / JSON round-trip |

Run any single file with `node examples/tests/<file>.mjs`.
