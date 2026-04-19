// Verifies that waveform view settings round-trip through
// serializeView() → deserializeView() without loss.
// Run: node examples/tests/test-view-state.mjs

import { state, setSignals, serializeView, deserializeView } from '../../js/waveform/WaveformState.js';

let failed = 0;
const check = (label, cond, detail = '') => {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
};

// Seed a minimal signal set so hiddenSignals/ordering references are valid.
setSignals([
  { id: 'n1', type: 'CLOCK' },
  { id: 'n2', type: 'INPUT',  label: 'EN' },
  { id: 'n3', type: 'OUTPUT', label: 'R1' },
  { id: 'n4', type: 'OUTPUT', label: 'R2' },
]);

console.log('[1] Configure non-default view state');
state.zoom = 2.5;
state.panOffset = 120;
state.vScroll = 40;
state.radix = 'hex';
state.radixOverrides.set('n3', 'bin');
state.hiddenSignals.add('n4');
state.signalOrder = ['n3', 'n2', 'n1', 'n4'];
state.collapsedGroups.add('Inputs');
state.bookmarks.push({ step: 5, name: 'halt' });
state.markerA = 2;
state.markerB = 8;
state.trigger.expr = 'R1 == 4';
state.trigger.armed = true;
state.trigger.fired = false;

const snapshot = serializeView();
check('snapshot is an object', snapshot && typeof snapshot === 'object');
check('snapshot has version',  snapshot.v === 1);

console.log('\n[2] Wipe state');
state.zoom = 1;
state.panOffset = 0;
state.vScroll = 0;
state.radix = 'dec';
state.radixOverrides = new Map();
state.hiddenSignals = new Set();
state.signalOrder = null;
state.collapsedGroups = new Set();
state.bookmarks = [];
state.markerA = null;
state.markerB = null;
state.trigger = { expr: '', armed: false, fired: false };

console.log('[3] Restore from snapshot');
deserializeView(snapshot);
check('zoom restored',                state.zoom === 2.5);
check('panOffset restored',           state.panOffset === 120);
check('vScroll restored',             state.vScroll === 40);
check('radix restored',               state.radix === 'hex');
check('radix override restored',      state.radixOverrides.get('n3') === 'bin');
check('hidden signals restored',      state.hiddenSignals.has('n4'));
check('signal order restored',        JSON.stringify(state.signalOrder) === '["n3","n2","n1","n4"]');
check('collapsed groups restored',    state.collapsedGroups.has('Inputs'));
check('bookmarks restored',           state.bookmarks.length === 1 && state.bookmarks[0].name === 'halt');
check('markers restored',             state.markerA === 2 && state.markerB === 8);
check('trigger expr restored',        state.trigger.expr === 'R1 == 4');
check('trigger armed restored',       state.trigger.armed === true);

console.log('\n[4] Round-trip through JSON');
const viaJSON = JSON.parse(JSON.stringify(snapshot));
state.hiddenSignals = new Set();
deserializeView(viaJSON);
check('survives JSON round-trip',     state.hiddenSignals.has('n4') && state.zoom === 2.5);

console.log('\n[5] Tolerates partial / missing data');
deserializeView({ v: 1, zoom: 5 });
check('partial restore — zoom set',   state.zoom === 5);
deserializeView(null);
check('null input ignored safely',    state.zoom === 5);

console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
