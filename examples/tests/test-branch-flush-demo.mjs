// End-to-end smoke test for mips-5stage-branch-flush-demo.json — verifies
// that running the bundled program produces exactly the live-counter
// readout advertised in the Pipeline panel: 3 flushes at PC=5, 10, 13.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { evaluate } from '../../js/engine/SimulationEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = resolve(__dirname, '..', 'circuits', 'mips-5stage-branch-flush-demo.json');
const scene = JSON.parse(readFileSync(file, 'utf8'));

let failed = 0;
const check = (label, cond, detail = '') => {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
};

const ffStates = new Map();
const clk = scene.nodes.find(n => n.type === 'CLOCK');
clk.value = 0;
evaluate(scene.nodes, scene.wires, ffStates, 0);
for (let cycle = 1; cycle <= 30; cycle++) {
  clk.value = 1; evaluate(scene.nodes, scene.wires, ffStates, cycle * 2 - 1);
  clk.value = 0; evaluate(scene.nodes, scene.wires, ffStates, cycle * 2);
}

const log = ffStates.get('__branch_flushes__') || [];
const pcs = log.map(e => e.pc);
console.log(`  Branch-flush log PCs: [${pcs.join(', ')}]`);

check('exactly 3 flushes recorded', log.length === 3);
check('flush #1 at PC=5  (BEQ taken)',  pcs[0] === 5);
check('flush #2 at PC=10 (BEQ taken)',  pcs[1] === 10);
check('flush #3 at PC=13 (JMP taken)',  pcs[2] === 13);

const rf = ffStates.get('rf').regs;
check('R5 = 0 (all POISON squashed)', rf[5] === 0);

console.log(`\n${failed === 0 ? 'OK' : `FAIL: ${failed} assertion(s) failed`}`);
process.exit(failed === 0 ? 0 : 1);
