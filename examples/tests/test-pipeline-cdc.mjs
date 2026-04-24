// Phase 13 stretch — clock-domain-crossing detection.
import { detectCdc } from '../../js/pipeline/CdcDetector.js';

let failed = 0;
const check = (label, cond, extra = '') => {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${extra ? '  — ' + extra : ''}`);
};

const pipe  = (id, x=0, y=0) => ({ id, type: 'PIPE_REG', x, y });
const clock = (id) => ({ id, type: 'CLOCK' });
const gate  = (id) => ({ id, type: 'AND' });
const cw    = (id, srcId, targetId) => ({ id, sourceId: srcId, targetId, targetInputIndex: 1, isClockWire: true });
const dw    = (id, srcId, targetId, idx = 0) => ({ id, sourceId: srcId, targetId, targetInputIndex: idx, isClockWire: false });

// ── 1. single clock → no crossings ─────────────────────────────────
console.log('\n-- single clock → no CDC --');
{
  const scene = {
    nodes: [clock('clk'), pipe('p1'), pipe('p2')],
    wires: [cw('w1','clk','p1'), cw('w2','clk','p2'), dw('w3','p1','p2')],
  };
  const r = detectCdc(scene);
  check('multiDomain false',  r.multiDomain === false);
  check('0 crossings',        r.crossings.length === 0);
}

// ── 2. two clocks, direct crossing, no sync → flagged with depth 0 ──
console.log('\n-- two clocks, unsynchronized crossing --');
{
  const scene = {
    nodes: [clock('clkA'), clock('clkB'), pipe('p_a'), pipe('p_b')],
    wires: [
      cw('c1','clkA','p_a'),
      cw('c2','clkB','p_b'),
      dw('d1','p_a','p_b'),
    ],
  };
  const r = detectCdc(scene);
  check('multiDomain true',    r.multiDomain === true);
  check('1 crossing',          r.crossings.length === 1);
  check('src clkA → dst clkB', r.crossings[0].srcClock === 'clkA' && r.crossings[0].dstClock === 'clkB');
  check('syncDepth = 1 (single recv flop)', r.crossings[0].syncDepth === 1);
}

// ── 3. two clocks + 2-flop synchronizer on destination clock ───────
console.log('\n-- 2-flop synchronizer → depth ≥ 2 --');
{
  // p_a (clkA) → p_sync1 (clkB) → p_sync2 (clkB) → p_b (clkB)
  const scene = {
    nodes: [
      clock('clkA'), clock('clkB'),
      pipe('p_a'), pipe('p_s1'), pipe('p_s2'), pipe('p_b'),
    ],
    wires: [
      cw('c1','clkA','p_a'),
      cw('c2','clkB','p_s1'), cw('c3','clkB','p_s2'), cw('c4','clkB','p_b'),
      dw('d1','p_a','p_s1'),
      dw('d2','p_s1','p_s2'),
      dw('d3','p_s2','p_b'),
    ],
  };
  const r = detectCdc(scene);
  // Only the first cross-domain edge is emitted (p_a → p_s1); its syncDepth
  // counts the chain p_s1 → p_s2 → p_b on clkB = 3.
  const edge = r.crossings.find(c => c.srcId === 'p_a' && c.dstId === 'p_s1');
  check('crossing at p_a → p_s1',   !!edge);
  check('syncDepth >= 2 (synced)',  edge && edge.syncDepth >= 2, `got ${edge?.syncDepth}`);
}

// ── 4. crossing through a combinational gate ───────────────────────
console.log('\n-- crossing passes through combinational node --');
{
  const scene = {
    nodes: [clock('clkA'), clock('clkB'), pipe('p_a'), gate('g'), pipe('p_b')],
    wires: [
      cw('c1','clkA','p_a'), cw('c2','clkB','p_b'),
      dw('d1','p_a','g'), dw('d2','g','p_b'),
    ],
  };
  const r = detectCdc(scene);
  check('1 crossing via combinational',   r.crossings.length === 1);
  check('depth = 1 (single recv flop)', r.crossings[0].syncDepth === 1);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
