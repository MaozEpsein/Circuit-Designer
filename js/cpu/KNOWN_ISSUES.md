# CPU Pipeline — Known Issues

Snapshot of the issues that remain unfixed after the conformance sweep
in this session. Each entry has enough context that a future session
can pick it up without re-discovering the problem.

## 1. Load-use forwarding with zero NOP spacing

### Symptom

```asm
LOAD R2, R0       ; R2 ← RAM[R0=0]
ADD  R3, R2, R0   ; R3 ← R2 + 0    — R3 ends up 0, not the loaded value
```

When a LOAD is immediately followed by an instruction that uses the
loaded register without any NOP between them, the consumer reads 0
instead of the loaded value. The HDU **does** detect the hazard and
fires its stall (visible in waveform: `Bubble=1` for one cycle), but
the MEM/WB→ALU forwarding path on the cycle right after stall release
fails to pick up `pipe_memwb.q[1]` (the freshly loaded data).

### Workaround

Insert one NOP after every LOAD whose result will be consumed by the
very next instruction. With this, `LD/SW round-trip` works perfectly
(the bundled smoke test in `examples/tests/test-mips-5stage-complete.mjs`
runs `LI R1,7 / LI R2,99 / NOPs / STORE / NOPs / LOAD R3,R1 / HALT` and
all assertions pass).

This matches MIPS-I's classical load-delay-slot contract — every MIPS-I
compiler scheduled a NOP (or an unrelated instruction) right after a
LOAD by convention.

### Root cause

The interaction between three phases of the engine
(`js/engine/SimulationEngine.js`):

- **P1** — RAM with `asyncRead: true` updates `ms.q` from
  `pipe_exmem.q[0]` (= LOAD address) and writes the result to
  wireValues for the `ram → pipe_memwb.in[1]` wire.
- **P2b** — pipe_memwb captures `ms.channels[1] = _w(dataSlots[1])`,
  which reads the wireValue for `ram.out0`. So far so good.
- **P3 + ALU re-eval (P3 + P4b)** — for the ADD instruction in EX,
  FWD asserts `ForwardA = 01` (MEM/WB) because `pipe_memwb.q[2]` (= rd)
  matches `pipe_idex.q[7]` (= rs1). mux_a then reads `wb_mux` output,
  which reads `pipe_memwb.q[1]` (= ram_data, just captured to 5).

The captured value **is** correct (`memwb=[0,5,2,1,1]` shows up at the
end of the cycle). The bug is one cycle later: at the next P2b,
pipe_memwb captures from pipe_exmem **after** pipe_exmem has already
moved past the LOAD (pipe_exmem.q[2] is now 0 from the next NOP), so
ch[2] and ch[3] reset to 0 even though the loaded data in ch[1] is
still the LOAD's. The `if (we && …)` check at P4e RF-write sees
`we=1, wrAddr=0, wrData=0` and writes R0 = 0 (silently ignored thanks
to `protectR0`). So R3 never gets written with the loaded value.

### Why it isn't trivially fixable

The fix requires reordering Phase 2b so that pipe_memwb reads its
inputs **after** pipe_exmem and RAM have re-fanned-out their fresh
values within the same P2b call. That's a structural change to the
phase pipeline that previously discovered six unrelated bugs in this
session — every fix uncovered another timing edge case (CU.out6,
ALU.out0, MUX sourceOutputIndex, SPLIT P3, CMP flag pollution,
GATE_SLOT P3). Touching the phase ordering again has high regression
risk; a 2-hour fix can easily become a multi-session debugging session
across the existing 8 conformance tests.

### Acceptance criteria for the future fix

A re-attempted fix should pass all of:

1. `examples/tests/test-hdu.mjs` — 22 assertions
2. `examples/tests/test-fwd.mjs` — 16 assertions
3. `examples/tests/test-mips-5stage-complete.mjs` — 6 assertions
4. The 8 conformance tests run inline in the session (ADD,
   SUB/AND/OR/XOR, SHL/SHR, CMP+JZ taken, CMP+JZ not-taken,
   JMP, FWD back-to-back, LD/SW round-trip).
5. **New test** for the actual fix:
   `LI R1,5; STORE R1,R0; NOPs; LOAD R2,R0; ADD R3,R2,R0` →
   final RF should have `R3 == 5`. Today this returns `R3 == 0`.

### Proposed approach (when the time comes)

Two options, in order of preference:

**Option A — Reorder Phase 2b, add intra-phase fanout.** After each
memory node finishes its P2b update, immediately fan its outputs into
wireValues (the same trick P3 uses for re-prop). Then later memory
nodes in P2b read post-update values. ~1-2 hours, medium regression
risk. Recommended approach.

**Option B — Direct RAM→ALU bypass.** Add a 5th input to mux_a/mux_b
that reads `ram.out0` combinationally, with FWD extended to emit a
new selector value (`11` = "from RAM directly"). ~30 min, lower
regression risk, but complicates FWD's encoding and breaks symmetry
with textbook MIPS forwarding. Not recommended for the same
pedagogical reason we kept the canonical EX/MEM and MEM/WB selectors.

Either way, treat this as its own feature branch — don't combine it
with unrelated work. Start by adding the failing test (item 5 above),
then make it green, then run all of items 1-4 to verify zero
regressions.
