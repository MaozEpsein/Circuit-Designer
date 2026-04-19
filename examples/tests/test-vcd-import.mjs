// Round-trip test for VCD import: build a known state, export → import,
// then verify the reloaded signals + history match the source.
// Run:  node examples/tests/test-vcd-import.mjs

import { state, setSignals, record, applyImport } from '../../js/waveform/WaveformState.js';
import { exportVCD, importVCD } from '../../js/waveform/WaveformVCD.js';

let failed = 0;
const check = (label, cond, detail = '') => {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
};

console.log('[1] Seed a known trace');
setSignals([
  { id: 'clk_id', type: 'CLOCK',  label: 'CLK' },
  { id: 'en_id',  type: 'INPUT',  label: 'EN'  },
  { id: 'r1_id',  type: 'OUTPUT', label: 'R1'  },
  { id: 'r2_id',  type: 'OUTPUT', label: 'R2'  },
]);
const trace = [
  { CLK: 0, EN: 0, R1: 0,  R2: 0 },
  { CLK: 1, EN: 1, R1: 12, R2: 8 },
  { CLK: 0, EN: 1, R1: 12, R2: 8 },
  { CLK: 1, EN: 1, R1: 4,  R2: 8 },
  { CLK: 0, EN: 1, R1: 4,  R2: 4 },
  { CLK: 1, EN: 0, R1: 4,  R2: 0 },
];
const byLabel = (lbl) => state.signals.find(s => s.label === lbl);
for (let i = 0; i < trace.length; i++) {
  const m = new Map();
  for (const s of state.signals) m.set(s.id, trace[i][s.label] ?? 0);
  record(i, m);
}
check('seeded 4 signals',         state.signals.length === 4);
check('seeded 6 history entries', state.history.length === 6);

console.log('\n[2] Export → Import round-trip');
const vcd = exportVCD();
check('exportVCD produced output', vcd.length > 0);
const payload = importVCD(vcd);
check('importVCD returns payload', payload && Array.isArray(payload.signals) && Array.isArray(payload.history));
check('signal count preserved',    payload.signals.length === 4);
check('history length preserved',  payload.history.length === 6);

console.log('\n[3] Apply payload and inspect');
applyImport(payload);
check('state signal count',        state.signals.length === 4);
check('state history length',      state.history.length === 6);
const byName = (n) => state.signals.find(s => s.label === n);
check('CLK signal present',        !!byName('CLK'));
check('R1 signal present',         !!byName('R1'));

// Compare last cycle values — EN=0, R1=4, R2=0.
const lastEntry = state.history[state.history.length - 1];
const r1 = byName('R1');
const r2 = byName('R2');
const en = byName('EN');
check('R1 value at end == 4',      lastEntry.signals.get(r1.id) === 4);
check('R2 value at end == 0',      lastEntry.signals.get(r2.id) === 0);
check('EN value at end == 0',      lastEntry.signals.get(en.id) === 0);

// Bus detection should work (R1 max value = 12 → multi-bit).
import('../../js/waveform/WaveformState.js').then(({ isBusSignal, signalBits }) => {
  check('R1 detected as bus',    isBusSignal(r1.id), 'max=' + (state.signalMax.get(r1.id) ?? 0));
  check('R1 bit-width >= 4',     signalBits(r1.id) >= 4);
  console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
  process.exit(failed === 0 ? 0 : 1);
});
