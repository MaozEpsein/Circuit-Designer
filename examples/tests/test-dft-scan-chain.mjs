// Layer 3 — DFT SCAN_FF + scan chain detection.
//
// Verifies:
//   1. SCAN_FF type is registered (factory + sets).
//   2. Engine: SCAN_FF latches D when TE=0, latches TI when TE=1, on
//      rising clock edge.
//   3. Chain semantics: a 3-FF chain shifts SCAN_IN → ff_a → ff_b →
//      ff_c → SCAN_OUT in 3 cycles when TE=1 throughout.
//   4. detectScanChains() finds the chain by walking TI links.
//
// Run:  node examples/tests/test-dft-scan-chain.mjs

import { COMPONENT_TYPES, FF_TYPE_SET, createComponent, createWire } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';
import { detectScanChains } from '../../js/dft/ui/DFTPanel.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('\n-- DFT SCAN_FF + scan chain --');

// ── 1. Type + factory ────────────────────────────────────────
{
  check("COMPONENT_TYPES.SCAN_FF === 'SCAN_FF'", COMPONENT_TYPES.SCAN_FF === 'SCAN_FF');
  check('FF_TYPE_SET contains SCAN_FF',          FF_TYPE_SET.has('SCAN_FF'));
  const n = createComponent('SCAN_FF', 0, 0);
  check("default label = 'SCAN-FF'",             n.label === 'SCAN-FF');
  check('default initialQ = 0',                  n.initialQ === 0);
}

// ── 2. Engine semantics: D path (TE=0) and TI path (TE=1) ────
function buildSingleFFScene() {
  const inD  = { ...createComponent('INPUT',  -200,    0), id: 'in_d',  fixedValue: 0 };
  const inTI = { ...createComponent('INPUT',  -200,   80), id: 'in_ti', fixedValue: 0 };
  const inTE = { ...createComponent('INPUT',  -200,  160), id: 'in_te', fixedValue: 0 };
  const clk  = { ...createComponent('CLOCK',  -200,  240), id: 'clk', value: 0 };
  const ff   = { ...createComponent('SCAN_FF', 0, 0),     id: 'ff', initialQ: 0 };
  return {
    nodes: [inD, inTI, inTE, clk, ff],
    wires: [
      { ...createWire('in_d',  'ff', 0), id: 'w_d' },
      { ...createWire('in_ti', 'ff', 1), id: 'w_ti' },
      { ...createWire('in_te', 'ff', 2), id: 'w_te' },
      { ...createWire('clk',   'ff', 3, 0, { isClockWire: true }), id: 'w_clk' },
    ],
  };
}

function risingEdge(s, ffStates, step) {
  s.nodes.find(n => n.id === 'clk').value = 0;
  evaluate(s.nodes, s.wires, ffStates, step);
  s.nodes.find(n => n.id === 'clk').value = 1;
  evaluate(s.nodes, s.wires, ffStates, step + 1);
}

// TE=0: latches D
{
  const s = buildSingleFFScene();
  s.nodes.find(n => n.id === 'in_d').fixedValue = 1;
  s.nodes.find(n => n.id === 'in_ti').fixedValue = 0;
  s.nodes.find(n => n.id === 'in_te').fixedValue = 0;
  const ffStates = new Map();
  risingEdge(s, ffStates, 0);
  check('TE=0: Q ← D=1', ffStates.get('ff').q === 1);
}
// TE=1: latches TI
{
  const s = buildSingleFFScene();
  s.nodes.find(n => n.id === 'in_d').fixedValue = 0;
  s.nodes.find(n => n.id === 'in_ti').fixedValue = 1;
  s.nodes.find(n => n.id === 'in_te').fixedValue = 1;
  const ffStates = new Map();
  risingEdge(s, ffStates, 0);
  check('TE=1: Q ← TI=1 (D ignored)', ffStates.get('ff').q === 1);
}

// ── 3. 3-FF chain shifts a value end-to-end in 3 cycles ──────
function buildChainScene() {
  const inSI = { ...createComponent('INPUT', -300, -100, ), id: 'in_si', fixedValue: 1 };
  const inTE = { ...createComponent('INPUT', -300,    0,  ), id: 'in_te', fixedValue: 1 };
  const clk  = { ...createComponent('CLOCK', -300,  100,  ), id: 'clk', value: 0 };
  const a    = { ...createComponent('SCAN_FF',   0, 0),     id: 'ff_a', initialQ: 0 };
  const b    = { ...createComponent('SCAN_FF', 100, 0),     id: 'ff_b', initialQ: 0 };
  const c    = { ...createComponent('SCAN_FF', 200, 0),     id: 'ff_c', initialQ: 0 };
  // Each ff has a dummy D input (tied 0) for completeness.
  const inD  = { ...createComponent('INPUT', -300, 200), id: 'in_d', fixedValue: 0 };
  return {
    nodes: [inSI, inTE, clk, a, b, c, inD],
    wires: [
      // ff_a
      { ...createWire('in_d',  'ff_a', 0), id: 'wa_d' },
      { ...createWire('in_si', 'ff_a', 1), id: 'wa_ti' },
      { ...createWire('in_te', 'ff_a', 2), id: 'wa_te' },
      { ...createWire('clk',   'ff_a', 3, 0, { isClockWire: true }), id: 'wa_clk' },
      // ff_b
      { ...createWire('in_d',  'ff_b', 0), id: 'wb_d' },
      { ...createWire('ff_a',  'ff_b', 1), id: 'wb_ti' },
      { ...createWire('in_te', 'ff_b', 2), id: 'wb_te' },
      { ...createWire('clk',   'ff_b', 3, 0, { isClockWire: true }), id: 'wb_clk' },
      // ff_c
      { ...createWire('in_d',  'ff_c', 0), id: 'wc_d' },
      { ...createWire('ff_b',  'ff_c', 1), id: 'wc_ti' },
      { ...createWire('in_te', 'ff_c', 2), id: 'wc_te' },
      { ...createWire('clk',   'ff_c', 3, 0, { isClockWire: true }), id: 'wc_clk' },
    ],
  };
}

{
  const s = buildChainScene();
  const ffStates = new Map();
  risingEdge(s, ffStates, 0);
  check('cycle 1: ff_a=1 (SCAN_IN shifted in)',     ffStates.get('ff_a').q === 1);
  check('cycle 1: ff_b=0 (still empty)',            ffStates.get('ff_b').q === 0);
  risingEdge(s, ffStates, 2);
  check('cycle 2: ff_a=1 (SCAN_IN re-driven)',      ffStates.get('ff_a').q === 1);
  check('cycle 2: ff_b=1 (received from ff_a)',     ffStates.get('ff_b').q === 1);
  check('cycle 2: ff_c=0 (still empty)',            ffStates.get('ff_c').q === 0);
  // Drop SCAN_IN to 0, shift again.
  s.nodes.find(n => n.id === 'in_si').fixedValue = 0;
  risingEdge(s, ffStates, 4);
  check('cycle 3: ff_a=0 (new SCAN_IN value)',      ffStates.get('ff_a').q === 0);
  check('cycle 3: ff_b=1 (carried from ff_a)',      ffStates.get('ff_b').q === 1);
  check('cycle 3: ff_c=1 (carried from ff_b)',      ffStates.get('ff_c').q === 1);
}

// ── 4. detectScanChains finds the chain by walking TI links ──
{
  const s = buildChainScene();
  const scanFFs = s.nodes.filter(n => n.type === 'SCAN_FF');
  const chains = detectScanChains(scanFFs, s.wires);
  check('one chain detected', chains.length === 1);
  check('chain length = 3',   chains[0].length === 3);
  check('chain order: ff_a → ff_b → ff_c',
    chains[0][0].id === 'ff_a' &&
    chains[0][1].id === 'ff_b' &&
    chains[0][2].id === 'ff_c');
}

// Two disjoint chains side by side
{
  const a1 = { ...createComponent('SCAN_FF', 0, 0), id: 'a1' };
  const a2 = { ...createComponent('SCAN_FF', 0, 0), id: 'a2' };
  const b1 = { ...createComponent('SCAN_FF', 0, 0), id: 'b1' };
  const b2 = { ...createComponent('SCAN_FF', 0, 0), id: 'b2' };
  const wires = [
    { ...createWire('a1', 'a2', 1), id: 'wa' },
    { ...createWire('b1', 'b2', 1), id: 'wb' },
  ];
  const chains = detectScanChains([a1, a2, b1, b2], wires);
  check('two disjoint chains detected', chains.length === 2);
  check('each chain has length 2',
    chains.every(c => c.length === 2));
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
