// End-to-end verification that BEQ / BNE perform an ATOMIC compare-
// and-branch in a single-cycle CPU — i.e. the ALU's CMP and the CU's
// branch decision happen in the same clock cycle, with no need for a
// preceding CMP to seed the Z flag.
//
// We reuse the c07-jmp lesson solution as scaffolding. It builds the
// canonical single-cycle datapath (PC + ROM + IR + CU + RF + ALU +
// RAM + WB-mux + immediate path) end-to-end, with all wires verified
// in production by the LEARN tutorial. We swap its ROM contents per
// scenario and inspect the RF after a fixed number of cycles.
//
// Run:  node examples/tests/test-beq-bne-atomic.mjs

import { buildSolution } from '../../js/tutorial/solutions.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

// Build a fresh single-cycle CPU scene + run a custom ROM. ROM must be
// at most 16 entries (c07's PC is 4-bit). Returns { regs, ffStates }.
function runProgram(memory, cycles = 32) {
  const scene = buildSolution('c07-jmp', 0);
  const rom   = scene.nodes.find(n => n.type === 'ROM');
  rom.memory = { ...memory };
  for (let a = 0; a < 16; a++) {
    if (rom.memory[a] === undefined) rom.memory[a] = 0xE000; // NOP
  }
  const ffStates = new Map();
  const clk = scene.nodes.find(n => n.type === 'CLOCK');
  clk.value = 0;
  evaluate(scene.nodes, scene.wires, ffStates, 0);
  for (let cyc = 1; cyc <= cycles; cyc++) {
    clk.value = 1; evaluate(scene.nodes, scene.wires, ffStates, cyc * 2 - 1);
    clk.value = 0; evaluate(scene.nodes, scene.wires, ffStates, cyc * 2);
  }
  const rf = scene.nodes.find(n => n.type === 'REG_FILE_DP' || n.type === 'REG_FILE');
  const regs = ffStates.get(rf.id)?.regs || [];
  const flags = ffStates.get('__cpu_flags__') || { z: 0, c: 0 };
  return { regs, flags, ffStates };
}

// ── BEQ — should TAKE (R1 == R2) ──────────────────────────────
// Layout:
//   0: LI    R1, 5
//   1: LI    R2, 5
//   2: BEQ   R1, R2, 4   ← R1==R2, branch fires; skips PC=3
//   3: LI    R3, 9       ← MUST NOT EXECUTE
//   4: LI    R4, 7       ← branch target; should run
//   5: HALT
console.log('[1] BEQ taken — R1 == R2 branches over poison');
{
  const r = runProgram({
    0: 0xD105, 1: 0xD205, 2: 0xB412, 3: 0xD309, 4: 0xD407, 5: 0xF000,
  });
  check('R1 = 5',                 r.regs[1] === 5,  `got ${r.regs[1]}`);
  check('R2 = 5',                 r.regs[2] === 5,  `got ${r.regs[2]}`);
  check('R3 = 0 (poison skipped)', r.regs[3] === 0,  `got ${r.regs[3]}`);
  check('R4 = 7 (target ran)',     r.regs[4] === 7,  `got ${r.regs[4]}`);
}

// ── BEQ — should FALL THROUGH (R1 != R2) ──────────────────────
console.log('\n[2] BEQ not taken — R1 != R2 falls through');
{
  const r = runProgram({
    0: 0xD105, 1: 0xD206, 2: 0xB412, 3: 0xD309, 4: 0xD407, 5: 0xF000,
  });
  check('R1 = 5',                  r.regs[1] === 5,  `got ${r.regs[1]}`);
  check('R2 = 6',                  r.regs[2] === 6,  `got ${r.regs[2]}`);
  check('R3 = 9 (executed — branch did not fire)', r.regs[3] === 9, `got ${r.regs[3]}`);
  check('R4 = 7 (target reached anyway)',          r.regs[4] === 7, `got ${r.regs[4]}`);
}

// ── BNE — should TAKE (R1 != R2) ──────────────────────────────
console.log('\n[3] BNE taken — R1 != R2 branches over poison');
{
  const r = runProgram({
    0: 0xD105, 1: 0xD206, 2: 0xC412, 3: 0xD309, 4: 0xD407, 5: 0xF000,
  });
  check('R3 = 0 (poison skipped)', r.regs[3] === 0, `got ${r.regs[3]}`);
  check('R4 = 7 (target ran)',     r.regs[4] === 7, `got ${r.regs[4]}`);
}

// ── BNE — should FALL THROUGH (R1 == R2) ──────────────────────
console.log('\n[4] BNE not taken — R1 == R2 falls through');
{
  const r = runProgram({
    0: 0xD105, 1: 0xD205, 2: 0xC412, 3: 0xD309, 4: 0xD407, 5: 0xF000,
  });
  check('R3 = 9 (executed)', r.regs[3] === 9, `got ${r.regs[3]}`);
}

// ── BEQ R0, R0 — degenerate always-taken ──────────────────────
console.log('\n[5] BEQ R0, R0 — degenerate self-compare always branches');
{
  const r = runProgram({
    0: 0xB300, 1: 0xD109, 2: 0xE000, 3: 0xD208, 4: 0xF000,
  });
  check('R1 = 0 (skipped)',        r.regs[1] === 0, `got ${r.regs[1]}`);
  check('R2 = 8 (target reached)', r.regs[2] === 8, `got ${r.regs[2]}`);
}

// ── ATOMICITY — non-CMP ALU op before branch must NOT pollute decision ──
// This is the heart of the test. The OLD JZ/JC behaviour required a
// preceding CMP to set Z. With BEQ/BNE atomic, the comparison happens
// in the same cycle. We inject an XOR right before the BEQ to prove
// the branch uses its OWN compare result, not a stale flag.
console.log('\n[6] Atomicity — branch ignores stale flag, uses its own CMP');
{
  // R1=4, R2=4. Then XOR R5,R1,R2 → R5=0 (sets ALU.Z=1 *transiently*
  // but does NOT update __cpu_flags__ because non-CMP ops do not latch).
  // The persisted Z stays at 0 from boot. Then BEQ R1,R2,4 must still
  // fire from its own atomic CMP — proving the branch did not depend
  // on the latched flag.
  const r = runProgram({
    0: 0xD104, 1: 0xD204, 2: 0x4512, 3: 0xB412, 4: 0xD407, 5: 0xF000,
  });
  check('R5 = 0 (XOR ran)',                    r.regs[5] === 0, `got ${r.regs[5]}`);
  check('R3 = 0 (poison @PC=3 was skipped)',   r.regs[3] === 0, `got ${r.regs[3]}`);
  check('R4 = 7 (BEQ took us to target)',      r.regs[4] === 7, `got ${r.regs[4]}`);
}

// ── Flag-pollution guard — back-to-back BEQs each compare freshly ──
console.log('\n[7] Sequential BEQs — each evaluates its own operands');
{
  // PC=2: R1=3, R2=3 → BEQ R1,R2,4 takes → jumps to PC=4.
  // PC=4: R3=4, R4=5 → BEQ R3,R4,6 must NOT take (3 != 5 wait — R3=4, R4=5).
  //       If the second BEQ wrongly inherited Z=1 from the first compare,
  //       it would mis-branch and the LI R7,7 below would be skipped.
  // Layout (16-slot ROM):
  //   0: LI R1,3   1: LI R2,3   2: BEQ R1,R2,5
  //   3: HALT      4: NOP
  //   5: LI R3,4   6: LI R4,5   7: BEQ R3,R4,10
  //   8: LI R7,7   9: HALT
  //  10: HALT      (would land here if second BEQ wrongly took)
  const r = runProgram({
    0: 0xD103, 1: 0xD203, 2: 0xB512,
    3: 0xF000, 4: 0xE000,
    5: 0xD304, 6: 0xD405, 7: 0xBA34,
    8: 0xD707, 9: 0xF000,
   10: 0xF000,
  });
  check('first BEQ took (R1==R2 → jumped to PC=5)', r.regs[3] === 4 && r.regs[4] === 5);
  check('second BEQ did NOT take (R3 != R4)',       r.regs[7] === 7,
        `R7=${r.regs[7]} (would be 0 if second branch wrongly fired)`);
}

// ── Summary ───────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
