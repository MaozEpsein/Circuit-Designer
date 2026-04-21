// Standalone verification for Phase 9 — hazard detection (RAW / WAR / WAW / LOOP).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { evaluate } from '../../js/pipeline/StageEvaluator.js';
import { detectHazards } from '../../js/pipeline/HazardDetector.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (rel) => JSON.parse(readFileSync(resolve(__dirname, rel), 'utf8'));

let failed = 0;
function check(label, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${extra ? '  — ' + extra : ''}`);
}

function wire(id, sourceId, targetId, targetInputIndex = 0, isClockWire = false) {
  return { id, sourceId, targetId, targetInputIndex, sourceOutputIndex: 0, waypoints: [], netName: '', colorGroup: null, isClockWire };
}

// ── 1. clean pipeline has no hazards ────────────────────────────────
console.log('\n-- pipeline-demo.json (clean) --');
{
  const data = load('../circuits/pipeline-demo.json');
  const scene = { nodes: data.nodes, wires: data.wires };
  evaluate(scene);
  const hz = detectHazards(scene);
  check('no hazards on clean demo', hz.length === 0, `got ${hz.length}`);
}

// ── 2. RAW hazard from feedback wire through PIPE_REGs ─────────────
console.log('\n-- pipeline-demo-hazard.json (RAW feedback) --');
{
  const data = load('../circuits/pipeline-demo-hazard.json');
  const scene = { nodes: data.nodes, wires: data.wires };
  evaluate(scene);
  const hz = detectHazards(scene);
  console.log(`  (hazards=${hz.length}, types=${hz.map(h => h.type).join(',')})`);
  check('at least one hazard detected', hz.length >= 1);
  const raw = hz.find(h => h.type === 'RAW');
  check('one hazard is classified RAW', !!raw);
  check('RAW hazard is on the feedback wire', raw && raw.wireId === 'w_raw');
  check('RAW hazard source is PIPE2 (stateful writer)', raw && raw.srcId === 'pipe_2');
  check('RAW hazard target is XOR (combinational reader)', raw && raw.dstId === 'xor_1');
  check('RAW hazard has a suggestion', raw && typeof raw.suggestion === 'string' && raw.suggestion.length > 0);
}

// ── 3. pure combinational loop → LOOP hazard ───────────────────────
console.log('\n-- synthetic 2-gate combinational loop --');
{
  const scene = {
    nodes: [
      { id: 'n1', type: 'GATE_SLOT', gate: 'NOT', x: 0,   y: 0 },
      { id: 'n2', type: 'GATE_SLOT', gate: 'NOT', x: 100, y: 0 },
    ],
    wires: [
      wire('w_a', 'n1', 'n2', 0),
      wire('w_b', 'n2', 'n1', 0),
    ],
  };
  evaluate(scene);
  const hz = detectHazards(scene);
  check('exactly one back-edge found', hz.length === 1, `got ${hz.length}`);
  check('classified as LOOP (no PIPE in cycle)', hz[0]?.type === 'LOOP');
}

// ── 4. WAW: two PIPE_REGs driving the same target pin ──────────────
console.log('\n-- synthetic WAW: two PIPEs → same XOR pin --');
{
  const scene = {
    nodes: [
      { id: 'in',  type: 'INPUT',     fixedValue: 1, x: 0, y: 0 },
      { id: 'p1',  type: 'PIPE_REG',  channels: 1,   x: 0, y: 0, stage: null },
      { id: 'p2',  type: 'PIPE_REG',  channels: 1,   x: 0, y: 0, stage: null },
      { id: 'xor', type: 'GATE_SLOT', gate: 'XOR',   x: 0, y: 0 },
      { id: 'clk', type: 'CLOCK',     value: 0,      x: 0, y: 0 },
    ],
    wires: [
      wire('w1', 'in',  'p1',  0),
      wire('w2', 'in',  'p2',  0),
      wire('w3', 'clk', 'p1',  3, true),
      wire('w4', 'clk', 'p2',  3, true),
      wire('w5', 'p1',  'xor', 0),
      wire('w6', 'p2',  'xor', 0),     // collision: same (xor, input 0)
    ],
  };
  evaluate(scene);
  const hz = detectHazards(scene);
  const waw = hz.find(h => h.type === 'WAW');
  check('WAW hazard detected', !!waw);
  check('WAW points to the colliding wire', waw && (waw.wireId === 'w6' || waw.wireId === 'w5'));
  check('WAW suggestion present', waw && typeof waw.suggestion === 'string' && waw.suggestion.length > 0);
}

// ── 5. clean DAG with a PIPE but no feedback → no hazards ──────────
console.log('\n-- simple DAG through one PIPE (sanity) --');
{
  const scene = {
    nodes: [
      { id: 'a',   type: 'INPUT',     fixedValue: 1, x: 0, y: 0 },
      { id: 'g',   type: 'GATE_SLOT', gate: 'AND',   x: 0, y: 0 },
      { id: 'p',   type: 'PIPE_REG',  channels: 1,   x: 0, y: 0, stage: null },
      { id: 'q',   type: 'OUTPUT',    targetValue: 0, x: 0, y: 0 },
      { id: 'clk', type: 'CLOCK',     value: 0, x: 0, y: 0 },
    ],
    wires: [
      wire('w1', 'a', 'g', 0),
      wire('w2', 'g', 'p', 0),
      wire('w3', 'clk', 'p', 3, true),
      wire('w4', 'p', 'q', 0),
    ],
  };
  evaluate(scene);
  const hz = detectHazards(scene);
  check('no hazards on clean linear pipeline', hz.length === 0, `got ${hz.length}`);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
