// Regression test for the per-instruction branch-flush fix.
//
// The bug: in Phase 4e the engine used a cycle-scoped _jmpActive
// boolean to gate every register-file write. When a branch fired, the
// in-flight WB-stage write — from an instruction issued cycles BEFORE
// the branch — was wrongly squashed alongside the truly-speculative
// in-flight IF/ID instructions.
//
// The fix: each fetched instruction is stamped with a monotonic seq
// number at IR latch time, propagated through PIPE_IDEX → PIPE_EXMEM
// → PIPE_MEMWB as engine-internal metaSeq. When a branch fires the
// engine captures the branch instruction's seq; a WB write is now
// suppressed only when the WB instruction's seq is strictly greater
// than the branch's (i.e. it was issued AFTER the branch). Pre-branch
// instructions in WB write back normally.
//
// This test runs a 5-stage MIPS program that puts a real ALU-write
// instruction (ADD R5, R1, R1) one cycle ahead of a forward BNE that
// fires. Pre-fix: R5 stayed 0 because its WB write got squashed by
// the branch's _jmpActive. Post-fix: R5 = 14 (= 7 + 7).
//
// Speculative checks: the LI R6, 99 immediately after the BNE must
// still be squashed (its seq > branch.seq), so R6 stays 0. The branch
// flush log must still record exactly one entry. This protects the
// existing flush-log invariants while exercising the new WB behaviour.
//
// Run:  node examples/tests/test-branch-flush-pre-branch-wb.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createComponent, createWire } from '../../js/components/Component.js';
import { assemble } from '../../js/cpu/Assembler.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let failed = 0;
function check(label, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${extra ? '  — ' + extra : ''}`);
}

// Load the 5-stage MIPS scaffold; replace its ROM with our program.
const sceneFile = resolve(__dirname, '..', 'circuits', 'mips-5stage-complete.json');
const data = JSON.parse(readFileSync(sceneFile, 'utf8'));

const program = [
  'NOP',                  // 0  startup pad
  'LI R1, 7',             // 1  source data
  'NOP',                  // 2
  'NOP',                  // 3
  'NOP',                  // 4
  'ADD R5, R1, R1',       // 5  PRE-BRANCH WB write — must succeed (= 14)
  'NOP',                  // 6
  'BNE R1, R0, 9',        // 7  R1=7≠0 → branch taken to PC=9
  'LI R6, 99',            // 8  POST-BRANCH speculative — must be squashed (R6 stays 0)
  'HALT',                 // 9  branch target
];
const mem = {};
program.forEach((p, i) => { mem[i] = assemble(p); });
data.nodes.find(n => n.id === 'rom').memory = mem;

const nodes = data.nodes.map(n => Object.assign(createComponent(n.type, n.x, n.y), n));
const wires = data.wires.map(w => Object.assign(createWire(w.sourceId, w.targetId, w.targetInputIndex || 0, w.sourceOutputIndex || 0, w), { id: w.id }));

const ffs = new Map();
const clk = nodes.find(n => n.id === 'clk');

// Suppress engine debug noise during the run.
const _origLog = console.log;
console.log = () => {};
for (let i = 0; i < 30; i++) {
  clk.value = 1; evaluate(nodes, wires, ffs, i);
  clk.value = 0; evaluate(nodes, wires, ffs, i);
}
console.log = _origLog;

const rf  = ffs.get('rf');
const log = ffs.get('__branch_flushes__') || [];

console.log('\n-- Per-instruction branch-flush regression --');
check('R1 == 7 (LI succeeds)',                    rf?.regs?.[1] === 7);
check('R5 == 14 (PRE-branch WB succeeds)',        rf?.regs?.[5] === 14, 'pre-fix would be 0');
check('R6 == 0 (POST-branch speculative squashed)', rf?.regs?.[6] === 0, 'speculative LI must not write');
check('exactly one branch flush logged',          log.length === 1, `got ${log.length}`);
check('flush logged at PC=7 (the BNE)',           log[0]?.pc === 7);

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
