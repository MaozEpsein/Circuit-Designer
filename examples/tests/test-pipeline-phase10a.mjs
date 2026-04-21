// Standalone verification for Phase 10a — greedy single-move retime suggestion.
// Constructs synthetic scenes directly (no JSON) to pin specific invariants.
import { evaluate } from '../../js/pipeline/StageEvaluator.js';
import { suggestRetime } from '../../js/pipeline/Retimer.js';

let failed = 0;
function check(label, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${extra ? '  — ' + extra : ''}`);
}

/** Terse builders to keep the test scenes readable. */
function input (id, x, y)         { return { id, type: 'INPUT',     fixedValue: 1, x, y }; }
function output(id, x, y)         { return { id, type: 'OUTPUT',    targetValue: 0, sandbox: true, x, y }; }
function clk   (id, x, y)         { return { id, type: 'CLOCK',     value: 0, x, y }; }
function not   (id, x, y, label)  { return { id, type: 'GATE_SLOT', gate: 'NOT', x, y, label: label ?? id }; }
function and   (id, x, y, label)  { return { id, type: 'GATE_SLOT', gate: 'AND', x, y, label: label ?? id }; }
function pipe  (id, x, y, label)  { return { id, type: 'PIPE_REG',  channels: 1, x, y, pipelineRole: 'register', stage: null, label: label ?? id }; }
function wire  (id, sId, sOut, tId, tIn, clk) {
  return { id, sourceId: sId, sourceOutputIndex: sOut, targetId: tId, targetInputIndex: tIn, waypoints: [], netName: '', colorGroup: null, isClockWire: !!clk };
}

// ── 1. unbalanced linear pipeline → expect backward move across the upstream gate ──
console.log('\n-- unbalanced linear pipeline (3 gates vs 1) --');
{
  // A → NOT1 → NOT2 → NOT3 → PIPE → NOT4 → Q
  //   stage 0: 150 ps,  stage 1: 50 ps — imbalanced.
  const scene = {
    nodes: [
      input('a', 0, 0),
      not('n1', 100, 0),
      not('n2', 200, 0),
      not('n3', 300, 0),
      pipe('p',  400, 0),
      not('n4', 500, 0),
      output('q', 600, 0),
      clk('clk', 400, 100),
    ],
    wires: [
      wire('w1','a',0,'n1',0), wire('w2','n1',0,'n2',0), wire('w3','n2',0,'n3',0),
      wire('w4','n3',0,'p',0), wire('w5','clk',0,'p',3, true),
      wire('w6','p',0,'n4',0), wire('w7','n4',0,'q',0),
    ],
  };
  const before = evaluate(scene);
  check('baseline is imbalanced (maxDelayPs=150)', before.maxDelayPs === 150);
  check('baseline has 2 stages',                   before.cycles === 2);

  const prop = suggestRetime(scene);
  check('suggestion returned',                     !!prop, prop ? prop.description : 'null');
  check('direction is backward',                   prop?.direction === 'backward');
  check('pastNode is the NOT3 upstream of PIPE',   prop?.pastNodeId === 'n3');
  check('improvement = 50 ps',                     prop?.improvementPs === 50);
  check('after.maxDelayPs = 100',                  prop?.after?.maxDelayPs === 100);
  check('after.cycles = 2 (same latency)',         prop?.after?.cycles === 2);
  check('wireEdits removes 3 wires',               prop?.wireEdits?.remove?.length === 3);
  check('wireEdits adds 3 wires',                  prop?.wireEdits?.add?.length === 3);
  // Position swap: PIPE takes NOT3's slot, NOT3 takes PIPE's slot.
  check('nodeEdits has 2 entries (swap)',          prop?.nodeEdits?.length === 2);
  const swapPipe = prop?.nodeEdits?.find(e => e.nodeId === 'p');
  const swapN3   = prop?.nodeEdits?.find(e => e.nodeId === 'n3');
  check('PIPE moves to NOT3\u2019s x (300)',       swapPipe?.newX === 300);
  check('NOT3 moves to PIPE\u2019s x (400)',       swapN3?.newX === 400);
}

// ── 2. already-balanced pipeline → no suggestion ─────────────────
console.log('\n-- already balanced (1 gate per stage) --');
{
  const scene = {
    nodes: [
      input('a', 0, 0),
      not('n1', 100, 0),
      pipe('p', 200, 0),
      not('n2', 300, 0),
      output('q', 400, 0),
      clk('clk', 200, 100),
    ],
    wires: [
      wire('w1','a',0,'n1',0), wire('w2','n1',0,'p',0), wire('w3','clk',0,'p',3,true),
      wire('w4','p',0,'n2',0), wire('w5','n2',0,'q',0),
    ],
  };
  const prop = suggestRetime(scene);
  check('no suggestion on balanced pipeline',      prop === null);
}

// ── 3. imbalanced on the downstream side → expect forward move ───
console.log('\n-- unbalanced the other way (1 gate before, 3 after) --');
{
  // A → NOT1 → PIPE → NOT2 → NOT3 → NOT4 → Q
  //   stage 0: 50 ps, stage 1: 150 ps — imbalanced, reversed.
  const scene = {
    nodes: [
      input('a', 0, 0),
      not('n1', 100, 0),
      pipe('p', 200, 0),
      not('n2', 300, 0),
      not('n3', 400, 0),
      not('n4', 500, 0),
      output('q', 600, 0),
      clk('clk', 200, 100),
    ],
    wires: [
      wire('w1','a',0,'n1',0), wire('w2','n1',0,'p',0), wire('w3','clk',0,'p',3,true),
      wire('w4','p',0,'n2',0), wire('w5','n2',0,'n3',0), wire('w6','n3',0,'n4',0), wire('w7','n4',0,'q',0),
    ],
  };
  const prop = suggestRetime(scene);
  check('suggestion returned',                     !!prop, prop ? prop.description : 'null');
  check('direction is forward',                    prop?.direction === 'forward');
  check('pastNode is NOT2 (first downstream)',     prop?.pastNodeId === 'n2');
  check('improvement = 50 ps',                     prop?.improvementPs === 50);
  check('after.maxDelayPs = 100',                  prop?.after?.maxDelayPs === 100);
}

// ── 4. multi-input gate blocks the move in v1 ────────────────────
console.log('\n-- multi-input gate adjacent to PIPE (v1 restriction) --');
{
  // A → AND → PIPE → NOT → Q,  B → AND — AND has 2 inputs, cannot retime across in v1.
  const scene = {
    nodes: [
      input('a', 0, 0), input('b', 0, 40),
      and('g1', 100, 20),
      pipe('p', 200, 20),
      not('n1', 300, 20),
      output('q', 400, 20),
      clk('clk', 200, 120),
    ],
    wires: [
      wire('w1','a',0,'g1',0), wire('w2','b',0,'g1',1),
      wire('w3','g1',0,'p',0), wire('w4','clk',0,'p',3,true),
      wire('w5','p',0,'n1',0), wire('w6','n1',0,'q',0),
    ],
  };
  const prop = suggestRetime(scene);
  // Backward across AND rejected (2 inputs). Forward across NOT might be valid
  // but stage 0 (AND=50) vs stage 1 (NOT=50) is already balanced — no
  // improvement to report either way.
  check('no suggestion (AND blocks, pipeline balanced)', prop === null);
}

// ── 5. no-PIPE graph → no suggestion ─────────────────────────────
console.log('\n-- combinational-only graph --');
{
  const scene = {
    nodes: [
      input('a', 0, 0),
      not('n1', 100, 0),
      output('q', 200, 0),
    ],
    wires: [
      wire('w1','a',0,'n1',0), wire('w2','n1',0,'q',0),
    ],
  };
  const prop = suggestRetime(scene);
  check('no suggestion on combinational-only graph', prop === null);
}

// ── 6. applying the suggestion yields the predicted delay ────────
console.log('\n-- apply backward-move, re-evaluate, delays match proposal --');
{
  const scene = {
    nodes: [
      input('a', 0, 0),
      not('n1', 100, 0), not('n2', 200, 0), not('n3', 300, 0),
      pipe('p', 400, 0),
      not('n4', 500, 0),
      output('q', 600, 0),
      clk('clk', 400, 100),
    ],
    wires: [
      wire('w1','a',0,'n1',0), wire('w2','n1',0,'n2',0), wire('w3','n2',0,'n3',0),
      wire('w4','n3',0,'p',0), wire('w5','clk',0,'p',3,true),
      wire('w6','p',0,'n4',0), wire('w7','n4',0,'q',0),
    ],
  };
  const prop = suggestRetime(scene);
  check('proposal exists', !!prop);
  // Apply wireEdits manually — the command layer (Phase 10b) will wrap this.
  const applied = {
    nodes: scene.nodes.map(n => ({ ...n })),
    wires: scene.wires.filter(w => !prop.wireEdits.remove.includes(w.id)).concat(prop.wireEdits.add),
  };
  const after = evaluate(applied);
  check('applied maxDelayPs = 100', after.maxDelayPs === 100);
  check('applied cycles = 2',       after.cycles === 2);
  check('applied has no cycle',     after.hasCycle === false);
  check('applied has no violations',(after.violations?.length || 0) === 0);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
