// Standalone verification for Phase 10c — RetimeVerifier correctness.
// Two scenarios:
//   (a) a legitimate retime proposal  → verifier reports ok.
//   (b) a sabotaged "retime" (garbage wire edits that break semantics)
//       → verifier catches the mismatch and refuses to pass.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { suggestRetime } from '../../js/pipeline/Retimer.js';
import { verifyRetiming } from '../../js/pipeline/RetimeVerifier.js';

// Silence the SimulationEngine's per-clock console.log so the test output
// stays clean. The engine logs "[EVAL] CLOCK=1 step=…" on every rising edge.
console.log = (() => { const orig = console.log; return function () {
  const s = arguments[0];
  if (typeof s === 'string' && s.startsWith('[EVAL]')) return;
  return orig.apply(console, arguments);
}; })();

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (rel) => JSON.parse(readFileSync(resolve(__dirname, rel), 'utf8'));

let failed = 0;
function check(label, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${extra ? '  — ' + extra : ''}`);
}

function applyProposal(scene, proposal) {
  const removed = new Set(proposal.wireEdits.remove);
  const posMap  = new Map((proposal.nodeEdits || []).map(e => [e.nodeId, e]));
  return {
    nodes: scene.nodes.map(n => {
      const e = posMap.get(n.id);
      return e ? { ...n, x: e.newX, y: e.newY } : { ...n };
    }),
    wires: scene.wires.filter(w => !removed.has(w.id))
      .map(w => ({ ...w }))
      .concat(proposal.wireEdits.add.map(w => ({ ...w }))),
  };
}

// ── 1. legitimate retime — outputs identical on every cycle ──────
console.log('\n-- RetimeVerifier: clean retime (should pass) --');
{
  const data  = load('../circuits/pipeline-demo-retime.json');
  const scene = { nodes: data.nodes, wires: data.wires };
  const prop  = suggestRetime(scene);
  check('suggestion exists', !!prop);
  const after = applyProposal(scene, prop);
  const r     = verifyRetiming(scene, after);
  check('verifier returns ok = true', r.ok === true, r.reason || '');
}

// ── 2. sabotaged "retime" — swap data output to a different node ─
//     Emulates a hypothetical buggy retimer move. The verifier must catch
//     the divergence rather than trust the static delay analysis.
console.log('\n-- RetimeVerifier: sabotaged edits (should fail) --');
{
  const data  = load('../circuits/pipeline-demo-retime.json');
  const sceneBefore = { nodes: data.nodes, wires: data.wires };

  // Build a sabotaged "after" scene: keep everything, but add a stray wire
  // that OR-merges a random upstream value onto the PIPE output consumer.
  // Simpler sabotage: delete a wire outright so the OUTPUT loses its source.
  const w1 = sceneBefore.wires.find(w => w.id === 'w11'); // n6 -> q
  const sabotaged = {
    nodes: sceneBefore.nodes.map(n => ({ ...n })),
    // Drop the last wire — OUTPUT becomes undefined (null).
    wires: sceneBefore.wires.filter(w => w.id !== 'w11').map(w => ({ ...w })),
  };

  const r = verifyRetiming(sceneBefore, sabotaged);
  check('verifier detects mismatch', r.ok === false);
  check('reason mentions the OUTPUT', !!r.reason && /output/i.test(r.reason));
}

// ── 3. no clock in scene — verifier returns ok with a note ───────
console.log('\n-- RetimeVerifier: no clock (combinational-only) --');
{
  const scene = {
    nodes: [
      { id: 'a',  type: 'INPUT',  fixedValue: 1, x: 0,   y: 0 },
      { id: 'n1', type: 'GATE_SLOT', gate: 'NOT', x: 100, y: 0 },
      { id: 'q',  type: 'OUTPUT', targetValue: 0, sandbox: true, x: 200, y: 0 },
    ],
    wires: [
      { id: 'w1', sourceId: 'a',  targetId: 'n1', targetInputIndex: 0, sourceOutputIndex: 0, waypoints: [], netName: '', colorGroup: null, isClockWire: false },
      { id: 'w2', sourceId: 'n1', targetId: 'q',  targetInputIndex: 0, sourceOutputIndex: 0, waypoints: [], netName: '', colorGroup: null, isClockWire: false },
    ],
  };
  const r = verifyRetiming(scene, scene);
  check('ok when no clock present',   r.ok === true);
  check('reason annotated "no clock"', r.reason === 'no clock');
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
