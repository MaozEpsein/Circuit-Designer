// Smoke-test the engine's live branch-flush log surfaced via
// ffStates.get('__branch_flushes__'). Builds a tiny program with a BEQ
// in IMEM and asserts that exactly one entry lands in the log at the
// expected PC.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { evaluate } from '../../js/engine/SimulationEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = resolve(__dirname, '..', 'circuits', 'mips-5stage-complete.json');
const scene = JSON.parse(readFileSync(file, 'utf8'));

// Override IMEM with a branch program. The 5-stage pipeline evaluates
// the CU in ID and the ALU one cycle later in EX, so atomic BEQ uses
// the *previously* latched Z flag. We seed it with an explicit CMP a
// few cycles earlier so the BEQ at PC=6 fires on its first issue.
//   0: LI R1,5         (0xD105)
//   1: NOP / 2: NOP
//   3: CMP R0,R0       (0x7000) — sets Z=1 (R0==R0)
//   4: NOP / 5: NOP
//   6: BEQ R0,R0,8     (0xB800) — branches on the latched Z=1
//   7: LI R5,99        (0xD563) — POISON, must be squashed
//   8: LI R3,42        (0xD32A) — branch target
//   9: HALT            (0xF000)
const rom = scene.nodes.find(n => n.id === 'rom');
rom.memory = {
  '0': 53509, '1': 57344, '2': 57344, '3': 28672, '4': 57344,
  '5': 57344, '6': 47104, '7': 54627, '8': 54058, '9': 61440,
};

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
for (let cycle = 1; cycle <= 20; cycle++) {
  clk.value = 1; evaluate(scene.nodes, scene.wires, ffStates, cycle * 2 - 1);
  clk.value = 0; evaluate(scene.nodes, scene.wires, ffStates, cycle * 2);
}

const log = ffStates.get('__branch_flushes__') || [];
console.log(`  Branch-flush log:`, JSON.stringify(log));

check('log has exactly 1 entry', log.length === 1);
check('flush recorded at PC=6 (the BEQ slot)', log.length > 0 && log[0].pc === 6,
      log.length > 0 ? `got PC=${log[0].pc}` : '');

const rf = ffStates.get('rf').regs;
check('R5 (poison) squashed → 0', rf[5] === 0);
check('R3 (target) reached WB → 42', rf[3] === 42);

console.log(`\n${failed === 0 ? 'OK' : `FAIL: ${failed} assertion(s) failed`}`);
process.exit(failed === 0 ? 0 : 1);
