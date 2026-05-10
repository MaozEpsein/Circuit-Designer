# Contributing

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

### 10. HDL export
*Mandatory once HDL Phase 3 lands.* Until then: leave a `// TODO(hdl-phase-3): translator` comment on the type's factory entry.
- [ ] Add a translator in `js/hdl/translators/<family>.js` for the new type, registered via `registerTranslator(COMPONENT_TYPES.XYZ, ...)`. Pick the matching family file (`logic-gates.js`, `arithmetic.js`, `muxing.js`, `flip-flops.js`, `registers.js`, `memory.js`, `cpu.js`); create one if the component is a new family (e.g. DFT cells get `dft.js`).
- [ ] Add the translator's test to the matching phase's test file (`test-hdl-combinational.mjs` / `test-hdl-sequential.mjs` / `test-hdl-cpu.mjs`).
- [ ] Update the HDL round-trip fuzz corpus so the component is exercised.

### 11. Example circuit
- [ ] If relevant, add a small example demonstrating the component under `examples/circuits/` and register it in the `EXAMPLES` array in [js/app.js](js/app.js).
- [ ] **If the component is HDL-relevant, also tag the demo with `'verilog'` (and optionally a phase tag like `'phase4'`) so it appears in the VERILOG examples tab. The same demo can sit in two tabs by carrying multiple matching tags — `_categoryOf()` matches the first one in tag order.**

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
