// Phase 14 — induction-variable loop analysis + multi-cycle latency.
import { decodeInstruction } from '../../js/pipeline/InstructionDecoder.js';
import { detectProgramHazards } from '../../js/pipeline/ProgramHazardDetector.js';
import { detectLoops, loopContaining } from '../../js/pipeline/LoopAnalyzer.js';
import { DEFAULT_ISA } from '../../js/pipeline/isa/default.js';

let failed = 0;
const check = (label, cond, extra = '') => {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${extra ? '  — ' + extra : ''}`);
};
const enc = (op, rd, rs1, rs2) =>
  ((op & 0xF) << 12) | ((rd & 0xF) << 8) | ((rs1 & 0xF) << 4) | (rs2 & 0xF);
const encJ = (op, addr) => ((op & 0xF) << 12) | (addr & 0xFFF);

// ── 1. backward branch → one loop detected ────────────────────────
console.log('\n-- loop detection: backward JMP forms a loop --');
{
  // 0x00: ADD R1, R1, R2  (self-update on R1 → induction candidate)
  // 0x01: SUB R3, R1, R4
  // 0x02: JMP 0x00
  const instr = [
    decodeInstruction(0, enc(0x0, 1, 1, 2)),
    decodeInstruction(1, enc(0x1, 3, 1, 4)),
    decodeInstruction(2, encJ(0xA, 0x0)),
  ];
  const loops = detectLoops(instr);
  check('exactly 1 loop',          loops.length === 1);
  check('startPc = 0',              loops[0]?.startPc === 0);
  check('endPc = 2',                loops[0]?.endPc === 2);
  check('body has 3 instrs',        loops[0]?.bodyPcs.length === 3);
  check('induction reg = [R1]',     JSON.stringify(loops[0]?.inductionRegs) === '[1]');
  check('loopContaining(pc=1) hits',loopContaining(loops, 1)?.startPc === 0);
  check('loopContaining(pc=99)=null', loopContaining(loops, 99) === null);
}

// ── 2. forward branch is NOT a loop ───────────────────────────────
console.log('\n-- loop detection: forward JMP is not a loop --');
{
  const instr = [
    decodeInstruction(0, encJ(0xA, 0x2)),   // JMP forward
    decodeInstruction(1, enc(0xE, 0, 0, 0)),
    decodeInstruction(2, enc(0xE, 0, 0, 0)),
  ];
  check('no loops',                 detectLoops(instr).length === 0);
}

// ── 3. steady-state hazard — loop tail writes R1, head reads R1 ────
console.log('\n-- steady-state: tail write → head read across iteration --');
{
  // 0x00: ADD R3, R1, R4        ← reads R1
  // 0x01: ADD R1, R1, R2        ← writes R1 (induction)
  // 0x02: JMP 0x00
  // Same-iteration RAW: instI=1 writes R1, instJ (none reads within window).
  // Cross-iteration RAW: 0x01 writes R1 → next iter's 0x00 reads R1.
  const instr = [
    decodeInstruction(0, enc(0x0, 3, 1, 4)),
    decodeInstruction(1, enc(0x0, 1, 1, 2)),
    decodeInstruction(2, encJ(0xA, 0x0)),
  ];
  const loops = detectLoops(instr);
  const h = detectProgramHazards(instr, DEFAULT_ISA, { loops });
  const steady = h.filter(x => x.steadyState);
  check('at least 1 steady-state hazard', steady.length >= 1, `got ${steady.length}`);
  check('steady wraps 0x01 → 0x00',       steady.some(x => x.instI === 1 && x.instJ === 0 && x.register === 1));
  check('steady tagged with loopId',      steady.every(x => x.loopId));
  // Same-iteration hazards in body should be tagged inLoop=true as well.
  const inLoop = h.filter(x => !x.steadyState && x.inLoop);
  check('same-iteration hazards tagged inLoop', inLoop.length >= 1);
}

// ── 4. multi-cycle producer widens the window ──────────────────────
console.log('\n-- multi-cycle latency: latency=3 RAW widens window --');
{
  // Fabricate an ISA where opcode 0 (ADD) has latency=3.
  const isaMul = {
    ...DEFAULT_ISA,
    opcodes: {
      ...DEFAULT_ISA.opcodes,
      0x0: { ...DEFAULT_ISA.opcodes[0x0], latency: 3 },
    },
  };
  // 0x00: ADD R1, R2, R3  (latency 3)
  // 4 NOPs (gap k=5, beyond default W-1=4) → 0x05: SUB R5, R1, R6
  const instr = [
    decodeInstruction(0, enc(0x0, 1, 2, 3)),
    decodeInstruction(1, enc(0xE, 0, 0, 0)),
    decodeInstruction(2, enc(0xE, 0, 0, 0)),
    decodeInstruction(3, enc(0xE, 0, 0, 0)),
    decodeInstruction(4, enc(0xE, 0, 0, 0)),
    decodeInstruction(5, enc(0x1, 5, 1, 6)),
  ];
  const hDefault = detectProgramHazards(instr, DEFAULT_ISA);
  const hMul     = detectProgramHazards(instr, isaMul);
  check('default ISA: no RAW at gap=5', hDefault.filter(x => x.type === 'RAW').length === 0);
  const raw = hMul.find(x => x.type === 'RAW' && x.instI === 0 && x.instJ === 5);
  check('latency=3: RAW at gap=5 reported', !!raw);
  check('latency recorded on hazard',        raw?.latencyI === 3);
  // effW = W+latA-1 = 5+2 = 7; bubbles = 7 - k - 1 = 7 - 5 - 1 = 1.
  check('bubbles = effW - k - 1 = 1',        raw?.bubbles === 1);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
