# Snapshot baselines

Each `*.baseline.json` file in this directory is the **expected end state** of one demo from `examples/circuits/` after running the simulator for a fixed cycle count. The snapshot test (`examples/tests/test-snapshot-regression.mjs`) auto-discovers every baseline here, re-runs the corresponding circuit, and fails if the resulting state drifts from the baseline.

The point of this corpus is to make engine drift impossible to merge accidentally. If you change the engine and a demo's behaviour changes, the snapshot test will tell you exactly which demo and which fields. You then either (a) revert your change, or (b) explicitly update the baseline in the same commit that changed the engine and document why in the commit message.

## File schema

```json
{
  "file":   "examples/circuits/foo.json",
  "cycles": 200,
  "RF":     [0, 1, 2, ...],
  "RAM":    { "0": 100, "4": 200 } | null,
  "PC":     10 | null,
  "branchFlushes": [{ "cycle": 9, "pc": 5 }, ...] | null,
  "cacheStats":    [{ "id": "l1", "label": "L1", "hits": 4, "misses": 6, "miss3C": {...} }, ...] | null
}
```

- `file`: path of the circuit JSON.
- `cycles`: how many clock cycles to run before snapshotting.
- `RF`: register-file contents (array of values, indexed by register number) — `null` if no RF in scene.
- `RAM`: data-memory contents (sparse object, address → value) — `null` if no RAM.
- `PC`: program-counter value at end of run — `null` if no PC.
- `branchFlushes`: every cycle a branch fired (with PC of the branch). `null` if none.
- `cacheStats`: per-cache stats (one entry per CACHE node). `null` if no cache.

## When to update a baseline

A baseline change is a **behavioural change**. Always:

1. Run `node examples/tests/test-snapshot-regression.mjs` first to see the diff.
2. Decide: is the new behaviour correct, or did your engine change introduce a regression?
3. If correct — update the baseline in the SAME commit as the engine change, and explain in the commit message which baselines changed and why.
4. If a regression — fix the engine, do not update the baseline.

Do **not** update baselines in a separate commit from the change that caused the drift — that loses the audit trail.

## Updating baselines

To re-record a baseline (after a deliberate engine change):

```
UPDATE_SNAPSHOT=1 node examples/tests/test-snapshot-regression.mjs
```

This re-runs every circuit and overwrites every baseline file in place. Inspect the resulting `git diff` carefully before committing.

To re-record a single baseline only, re-run the snapshot test but use git to revert the others:

```
UPDATE_SNAPSHOT=1 node examples/tests/test-snapshot-regression.mjs
git checkout examples/baselines/  # revert all
git checkout HEAD -- examples/baselines/foo.baseline.json   # then NOT this one
```

(Or just edit the single file by hand if it's small.)

## Adding a new baseline for a new demo

1. Create your circuit JSON in `examples/circuits/`.
2. Decide a cycle count that captures the steady-state (typically: enough cycles for the program to reach HALT plus 5 cycles of safety).
3. Create `examples/baselines/<demo>.baseline.json` with the schema above. Leave `RF`/`RAM`/`PC`/etc. as `null` and run `UPDATE_SNAPSHOT=1` to seed.
4. Verify the seeded baseline reflects the intended behaviour BEFORE committing.
