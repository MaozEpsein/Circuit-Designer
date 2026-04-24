// Phase 13 stretch — LIP (latency-insensitive protocol) checker.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { checkLip } from '../../js/pipeline/LipChecker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (rel) => JSON.parse(readFileSync(resolve(__dirname, rel), 'utf8'));

let failed = 0;
const check = (label, cond, extra = '') => {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${extra ? '  — ' + extra : ''}`);
};

const pipe = (id, channels = 1) => ({ id, type: 'PIPE_REG', channels });
const hs   = (id, label = id) => ({ id, type: 'HANDSHAKE', label });
const and  = (id) => ({ id, type: 'AND' });
const inp  = (id) => ({ id, type: 'INPUT' });
const dw   = (id, srcId, targetId, targetInputIndex = 0, sourceOutputIndex = 0) =>
  ({ id, sourceId: srcId, targetId, targetInputIndex, sourceOutputIndex, isClockWire: false });

// ── 1. clean handshake — V, R from PIPEs; S drives a PIPE STALL ───
console.log('\n-- clean HANDSHAKE → no violations --');
{
  const scene = {
    nodes: [pipe('p_v'), pipe('p_r'), hs('h1'), pipe('p_dst', 1)],
    wires: [
      dw('w1','p_v','h1',0),
      dw('w2','p_r','h1',1),
      dw('w3','h1','p_dst',1, 0),   // S (out 0) → STALL pin = channels=1
    ],
  };
  const r = checkLip(scene);
  check('handshake counted',  r.handshakeCount === 1);
  check('no violations',      r.violations.length === 0, JSON.stringify(r.violations));
}

// ── 2. dangling stall — HANDSHAKE.S not wired anywhere ────────────
console.log('\n-- dangling-stall violation --');
{
  const scene = {
    nodes: [pipe('p_v'), pipe('p_r'), hs('h1')],
    wires: [
      dw('w1','p_v','h1',0),
      dw('w2','p_r','h1',1),
    ],
  };
  const r = checkLip(scene);
  check('1 violation',        r.violations.length === 1);
  check('rule=dangling-stall',r.violations[0].rule === 'dangling-stall');
}

// ── 3. unregistered valid — V from a bare INPUT ────────────────────
console.log('\n-- unregistered-valid violation --');
{
  const scene = {
    nodes: [inp('in_v'), pipe('p_r'), hs('h1'), pipe('p_dst',1)],
    wires: [
      dw('w1','in_v','h1',0),     // INPUT directly into V (not registered)
      dw('w2','p_r','h1',1),
      dw('w3','h1','p_dst',1, 0),
    ],
  };
  const r = checkLip(scene);
  const v = r.violations.find(x => x.rule === 'unregistered-valid');
  // INPUT is not in STATEFUL_BOUNDARIES — traceToStateful returns null.
  check('unregistered-valid flagged', !!v);
  check('severity = warn',           v?.severity === 'warn');
}

// ── 4. S drives the wrong pin (data, not stall) — still dangling ──
console.log('\n-- S wired to data pin (not STALL) → still dangling --');
{
  const scene = {
    nodes: [pipe('p_v'), pipe('p_r'), hs('h1'), pipe('p_dst',1)],
    wires: [
      dw('w1','p_v','h1',0),
      dw('w2','p_r','h1',1),
      dw('w3','h1','p_dst',0, 0),  // to D pin, not STALL
    ],
  };
  const r = checkLip(scene);
  check('dangling-stall still raised',
        r.violations.some(v => v.rule === 'dangling-stall'));
}

// ── 5. V→R combinational loop (ready depends on valid) ────────────
console.log('\n-- valid-to-ready-loop violation --');
{
  // Both V-source and R-source combinationally depend on gate `g`.
  const scene = {
    nodes: [pipe('p_stable'), and('g'), hs('h1'), pipe('p_dst',1)],
    wires: [
      dw('w1','p_stable','g',0),
      dw('w2','g','h1',0),    // V from g
      dw('w3','g','h1',1),    // R from g too → common combinational ancestor
      dw('w4','h1','p_dst',1, 0),
    ],
  };
  const r = checkLip(scene);
  const loop = r.violations.find(v => v.rule === 'valid-to-ready-loop');
  check('valid-to-ready-loop flagged', !!loop);
  check('error severity',              loop?.severity === 'error');
}

// ── 6. no handshake in scene → no-op ──────────────────────────────
console.log('\n-- no HANDSHAKE → empty result --');
{
  const r = checkLip({ nodes: [pipe('p')], wires: [] });
  check('handshakeCount = 0',  r.handshakeCount === 0);
  check('no violations',       r.violations.length === 0);
}

// ── 7. shipping elastic demo should be clean ──────────────────────
console.log('\n-- pipeline-demo-elastic.json → clean --');
{
  const scene = load('../circuits/pipeline-demo-elastic.json');
  const r = checkLip(scene);
  check('has ≥1 HANDSHAKE',   r.handshakeCount >= 1);
  console.log(`  (violations=${r.violations.length}; rules=${[...new Set(r.violations.map(v => v.rule))].join(',')})`);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
