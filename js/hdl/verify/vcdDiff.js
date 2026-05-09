// Minimal VCD parser + diff. Phase 2 scope: scalar + vector signals at the
// top module, no hierarchical scopes beyond the first $scope block. Phase 4+
// will extend to nested scopes when clocked tests start producing them.

function parseVCD(text) {
  const signals = new Map();      // id char → { name, width }
  const timeline = [];            // { t, changes: Map<name, value> }
  let current = null;
  let time = 0;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;

    if (raw.startsWith('$var')) {
      // e.g., "$var wire 1 ! a $end"
      const parts = raw.split(/\s+/);
      const width = parseInt(parts[2], 10);
      const id = parts[3];
      const name = parts[4];
      signals.set(id, { name, width });
      continue;
    }
    if (raw.startsWith('#')) {
      if (current) timeline.push(current);
      time = parseInt(raw.slice(1), 10);
      current = { t: time, changes: new Map() };
      continue;
    }
    if (raw.startsWith('$') || raw.startsWith('$end')) continue;

    if (current) {
      // Scalar: "0!" / "1!"  Vector: "b0101 !"
      if (raw[0] === 'b' || raw[0] === 'B') {
        const sp = raw.indexOf(' ');
        const val = raw.slice(1, sp);
        const id = raw.slice(sp + 1);
        const sig = signals.get(id);
        // Normalise to fixed width so iverilog's terse "b11" and our
        // padded "b0011" compare equal for the same numeric value.
        // Mixed x/z vectors keep their non-numeric chars; we only
        // pad with leading 0 (the convention iverilog itself defines
        // for unspecified high bits of pure-binary vectors).
        if (sig) {
          let v = val;
          if (/^[01]+$/.test(v) && v.length < sig.width) {
            v = v.padStart(sig.width, '0');
          }
          current.changes.set(sig.name, v);
        }
      } else if (raw.length >= 2) {
        const val = raw[0];
        const id = raw.slice(1);
        const sig = signals.get(id);
        if (sig) current.changes.set(sig.name, val);
      }
    }
  }
  if (current) timeline.push(current);
  return { signals, timeline };
}

// Compare two VCDs signal-for-signal at each time step. Returns
// { ok, firstDivergence?: { time, signal, expected, actual } }.
//
// Options:
//   signals      — restrict the diff to these names only (others are
//                  ignored). Without it, every signal that appears on
//                  either side participates.
//   startTime    — skip every comparison step strictly before this
//                  time. Used by sequential L2 to ignore the
//                  stability window where iverilog regs are still 'x'
//                  and the native simulator already has them at 0.
//   sampleTimes  — when set, comparisons happen ONLY at these times
//                  (intervening change events still update state but
//                  are not checked). Used for clocked designs whose
//                  async-read outputs ripple between clock edges; the
//                  L2 contract is "match at sample boundaries", not
//                  "match every nanosecond".
export function vcdDiff(expectedText, actualText, { signals = null, startTime = 0, sampleTimes = null } = {}) {
  const a = parseVCD(expectedText);
  const b = parseVCD(actualText);

  const names = signals || [...new Set([
    ...[...a.signals.values()].map(s => s.name),
    ...[...b.signals.values()].map(s => s.name),
  ])];

  const state = new Map();  // name → { expected, actual }
  for (const n of names) state.set(n, { expected: 'x', actual: 'x' });

  let ia = 0, ib = 0;
  const times = [...new Set([...a.timeline.map(e => e.t), ...b.timeline.map(e => e.t)])].sort((x, y) => x - y);

  for (const t of times) {
    while (ia < a.timeline.length && a.timeline[ia].t <= t) {
      for (const [k, v] of a.timeline[ia].changes) {
        if (state.has(k)) state.get(k).expected = v;
      }
      ia++;
    }
    while (ib < b.timeline.length && b.timeline[ib].t <= t) {
      for (const [k, v] of b.timeline[ib].changes) {
        if (state.has(k)) state.get(k).actual = v;
      }
      ib++;
    }
    if (t < startTime) continue;     // honour the stability window
    if (sampleTimes && !sampleTimes.has(t)) continue;
    for (const [name, s] of state) {
      if (s.expected !== s.actual) {
        return { ok: false, firstDivergence: { time: t, signal: name, expected: s.expected, actual: s.actual } };
      }
    }
  }
  return { ok: true };
}
