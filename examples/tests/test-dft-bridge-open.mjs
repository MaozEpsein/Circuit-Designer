// Layer 1.5 — Bridging + Open faults on wires.
//
// Verifies the engine-side contract for two extra wire-level fault models:
//   - open: wire physically broken → propagates null (floating)
//   - bridgedWith: shorted to another wire → wired-OR / wired-AND of
//     the two source values
//
// Run:  node examples/tests/test-dft-bridge-open.mjs

import { createComponent, createWire } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('\n-- DFT bridging + open faults --');

// ── 1. createWire defaults ───────────────────────────────────
{
  const w = createWire('a', 'b');
  check('open defaults to false',         w.open === false);
  check('bridgedWith defaults to null',   w.bridgedWith === null);
  check("bridgeMode defaults to 'or'",    w.bridgeMode === 'or');

  const w2 = createWire('a', 'b', 0, 0, { open: true });
  check('opts.open = true honoured',      w2.open === true);

  const w3 = createWire('a', 'b', 0, 0, { bridgedWith: 'w_x', bridgeMode: 'and' });
  check('opts.bridgedWith honoured',      w3.bridgedWith === 'w_x');
  check("opts.bridgeMode = 'and' honoured", w3.bridgeMode === 'and');
}

// ── 2. Open fault: wire propagates null ──────────────────────
function buildAndScene(faultsOnWa = {}) {
  const inA  = { ...createComponent('INPUT',  -200, -50), id: 'in_a', fixedValue: 1 };
  const inB  = { ...createComponent('INPUT',  -200,  50), id: 'in_b', fixedValue: 1 };
  const and1 = { ...createComponent('GATE_SLOT', -50, 0), id: 'and1', gate: 'AND' };
  const out  = { ...createComponent('OUTPUT', 100, 0), id: 'out_1' };
  const w_a  = { ...createWire('in_a', 'and1', 0, 0, faultsOnWa), id: 'w_a' };
  const w_b  = { ...createWire('in_b', 'and1', 1), id: 'w_b' };
  const w_o  = { ...createWire('and1', 'out_1', 0), id: 'w_o' };
  return { nodes: [inA, inB, and1, out], wires: [w_a, w_b, w_o] };
}

{
  const s = buildAndScene({ open: true });
  const r = evaluate(s.nodes, s.wires, new Map(), 0);
  check('open w_a: w_a value is null', r.wireValues.get('w_a') === null);
  check('open w_a: AND collapses to null (one input null)', r.wireValues.get('w_o') === null);
}

// Removing `open` restores normal AND of (1,1) = 1.
{
  const s = buildAndScene({});
  const r = evaluate(s.nodes, s.wires, new Map(), 0);
  check('no fault: w_a = 1', r.wireValues.get('w_a') === 1);
  check('no fault: AND = 1', r.wireValues.get('w_o') === 1);
}

// ── 3. Bridging fault: wired-OR / wired-AND of two sources ───
function buildBridgeScene(modeOnWb) {
  // Two parallel paths — w_a from in_a (=0) feeds out_a;
  // w_b from in_b (=1) feeds out_b — but w_b is bridged to w_a.
  // Wired-OR ⇒ w_b reads as (0|1)=1 (no change here, but tests reverse).
  // Wired-AND ⇒ w_b reads as (0&1)=0 (b collapses to 0).
  const inA  = { ...createComponent('INPUT',  -200, -50), id: 'in_a', fixedValue: 0 };
  const inB  = { ...createComponent('INPUT',  -200,  50), id: 'in_b', fixedValue: 1 };
  const outA = { ...createComponent('OUTPUT', 100, -50), id: 'out_a' };
  const outB = { ...createComponent('OUTPUT', 100,  50), id: 'out_b' };
  const w_a  = { ...createWire('in_a', 'out_a', 0), id: 'w_a' };
  const w_b  = { ...createWire('in_b', 'out_b', 0, 0, {
    bridgedWith: 'w_a', bridgeMode: modeOnWb,
  }), id: 'w_b' };
  return { nodes: [inA, inB, outA, outB], wires: [w_a, w_b] };
}

{
  // Wired-OR: w_b combines source(in_b)=1 with source(in_a)=0 → 1
  const s = buildBridgeScene('or');
  const r = evaluate(s.nodes, s.wires, new Map(), 0);
  check('wired-OR bridge: w_a unaffected (=0)', r.wireValues.get('w_a') === 0);
  check('wired-OR bridge: w_b = 1|0 = 1',       r.wireValues.get('w_b') === 1);
}

{
  // Wired-AND: w_b combines source(in_b)=1 with source(in_a)=0 → 0
  const s = buildBridgeScene('and');
  const r = evaluate(s.nodes, s.wires, new Map(), 0);
  check('wired-AND bridge: w_a unaffected (=0)', r.wireValues.get('w_a') === 0);
  check('wired-AND bridge: w_b = 1&0 = 0',       r.wireValues.get('w_b') === 0);
}

// ── 4. Bridging — opposite directions confirm asymmetry ──────
// Only w_b carries `bridgedWith`. w_a is normal. So w_a stays at its source.
{
  const s = buildBridgeScene('or');
  s.nodes.find(n => n.id === 'in_a').fixedValue = 1;
  s.nodes.find(n => n.id === 'in_b').fixedValue = 0;
  const r = evaluate(s.nodes, s.wires, new Map(), 0);
  check('asymmetric bridge: w_a = 1 (its own source)',  r.wireValues.get('w_a') === 1);
  check('asymmetric bridge: w_b = 0|1 = 1 (OR of both)', r.wireValues.get('w_b') === 1);
}

// ── 5. Open dominates stuck-at, stuck-at dominates bridging ──
{
  const s = buildAndScene({ open: true, stuckAt: 1 });
  const r = evaluate(s.nodes, s.wires, new Map(), 0);
  check('open + stuck-at: open wins (null, not 1)', r.wireValues.get('w_a') === null);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
