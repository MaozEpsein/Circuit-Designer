// Verifies WaveformVCD.exportVCD produces valid VCD text for a
// representative signal set. Run:  node examples/tests/test-vcd-export.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { state, setSignals, record } from '../../js/waveform/WaveformState.js';
import { exportVCD } from '../../js/waveform/WaveformVCD.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = resolve(__dirname, '..', 'circuits', 'mips-gcd.json');

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('Loading MIPS GCD circuit for signal set');
const scene = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
setSignals(scene.nodes);

// Fabricate a short synthetic trace: CLK toggles each cycle, R1_GCD
// ramps 0 → 12 → 4 → 4 over a few steps.
const steps = [
  { CLK: 0, R1_GCD: 0 },
  { CLK: 1, R1_GCD: 12 },
  { CLK: 0, R1_GCD: 12 },
  { CLK: 1, R1_GCD: 4 },
  { CLK: 0, R1_GCD: 4 },
];
function stepValues(i) {
  const m = new Map();
  const src = steps[i];
  for (const sig of state.signals) {
    if (src[sig.label] !== undefined) m.set(sig.id, src[sig.label]);
    else m.set(sig.id, 0);
  }
  return m;
}
for (let i = 0; i < steps.length; i++) record(i, stepValues(i));

const vcd = exportVCD();
console.log('\n[1] VCD structure');
check('non-empty output',          vcd.length > 0, `${vcd.length} chars`);
check('has $date section',          vcd.includes('$date'));
check('has $timescale',             /\$timescale\s+\S+\s+\$end/.test(vcd));
check('has $scope module',          /\$scope\s+module\s+\S+\s+\$end/.test(vcd));
check('has $var for each signal',   (vcd.match(/\$var\s+wire/g) || []).length >= state.signals.length);
check('has $enddefinitions',        vcd.includes('$enddefinitions $end'));
const dumpStart = vcd.indexOf('$dumpvars');
check('has $dumpvars block',        dumpStart > 0 && vcd.indexOf('$end', dumpStart) > dumpStart);

console.log('\n[2] Timeline content');
check('has initial #0 timestamp',   vcd.includes('\n#0\n'));
check('has post-init timestamps',   /\n#\d+\n/.test(vcd.slice(vcd.indexOf('#0') + 2)));

console.log('\n[3] Value encoding');
check('emits 1-bit values',         /\n[01][!-~]+\n/.test(vcd), '0id / 1id lines present');
check('emits vector values',        /\nb[01]+\s[!-~]+/.test(vcd) || !state.signals.some(s => s.label === 'R1_GCD'),
      'bXXX id for buses (if any recorded)');

console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
