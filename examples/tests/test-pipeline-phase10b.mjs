// Standalone verification for Phase 10b — RetimeCommand correctness.
// Exercises execute → re-evaluate → undo → re-evaluate on a real SceneGraph,
// so the undo path is covered (not just the algorithm's static prediction).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SceneGraph } from '../../js/core/SceneGraph.js';
import { evaluate } from '../../js/pipeline/StageEvaluator.js';
import { suggestRetime } from '../../js/pipeline/Retimer.js';
import { RetimeCommand } from '../../js/pipeline/commands/RetimeCommand.js';
import { CommandManager } from '../../js/core/CommandManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (rel) => JSON.parse(readFileSync(resolve(__dirname, rel), 'utf8'));

let failed = 0;
function check(label, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${extra ? '  — ' + extra : ''}`);
}

// ── Build a SceneGraph backed by the imbalanced retime demo ─────
function buildSceneFromJson(relPath) {
  const data = load(relPath);
  const scene = new SceneGraph();
  for (const n of data.nodes) scene.addNode({ ...n });
  for (const w of data.wires) scene.addWire({ ...w });
  return scene;
}

console.log('\n-- RetimeCommand on pipeline-demo-retime.json --');
const scene    = buildSceneFromJson('../circuits/pipeline-demo-retime.json');
const commands = new CommandManager();

// Snapshot starting wire-id set.
const startWireIds = new Set(scene.wires.map(w => w.id));

const before = evaluate({ nodes: scene.nodes, wires: scene.wires });
check('before: 3 stages, 150 ps bottleneck', before.cycles === 3 && before.maxDelayPs === 150);

const proposal = suggestRetime({ nodes: scene.nodes, wires: scene.wires });
check('suggestion exists',                    !!proposal);
check('predicts 100 ps after',                proposal?.after?.maxDelayPs === 100);
check('predicts +50 ps improvement',          proposal?.improvementPs === 50);

// Execute RetimeCommand.
const cmd = new RetimeCommand(scene, proposal);
// Snapshot PIPE1 & INV3 positions so we can verify the swap survives undo.
const p1_before_x = scene.getNode('p1').x;
const n3_before_x = scene.getNode('n3').x;
commands.execute(cmd);

const afterCmd = evaluate({ nodes: scene.nodes, wires: scene.wires });
check('after execute: maxDelayPs = 100',      afterCmd.maxDelayPs === 100);
check('after execute: still 3 stages',        afterCmd.cycles === 3);
check('after execute: no cycles introduced',  afterCmd.hasCycle === false);
check('after execute: no new violations',     (afterCmd.violations?.length || 0) === 0);
// Every stage should now be 100 ps (perfectly balanced).
check('stage 0 = 100 ps',                     afterCmd.stages[0].delayPs === 100);
check('stage 1 = 100 ps',                     afterCmd.stages[1].delayPs === 100);
check('stage 2 = 100 ps',                     afterCmd.stages[2].delayPs === 100);
check('Balance now 100% (min == max)',        afterCmd.stages.every(s => s.delayPs === afterCmd.maxDelayPs));
check('PIPE1 x now matches old INV3 x',       scene.getNode('p1').x === n3_before_x);
check('INV3 x now matches old PIPE1 x',       scene.getNode('n3').x === p1_before_x);

// Undo and confirm state is restored verbatim.
commands.undo();
const afterUndo = evaluate({ nodes: scene.nodes, wires: scene.wires });
check('after undo: back to 150 ps',           afterUndo.maxDelayPs === 150);
check('after undo: wire-id set matches start', scene.wires.every(w => startWireIds.has(w.id)) && scene.wires.length === startWireIds.size);
check('after undo: PIPE1 x restored',         scene.getNode('p1').x === p1_before_x);
check('after undo: INV3 x restored',          scene.getNode('n3').x === n3_before_x);

// Redo returns to the retimed state.
commands.redo();
const afterRedo = evaluate({ nodes: scene.nodes, wires: scene.wires });
check('after redo: 100 ps again',             afterRedo.maxDelayPs === 100);

// Undo once more, confirm the suggestion is still produced deterministically.
commands.undo();
const reprop = suggestRetime({ nodes: scene.nodes, wires: scene.wires });
check('re-running suggest after undo yields same pastNode', reprop?.pastNodeId === proposal.pastNodeId);

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
