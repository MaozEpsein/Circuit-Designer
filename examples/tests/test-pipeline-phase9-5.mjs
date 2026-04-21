// Standalone verification for Phase 9.5 Easy — program-level hazard detection
// over the native 16-opcode / 16-bit ISA.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { decodeROM, decodeInstruction, findRomNode, disassemble } from '../../js/pipeline/InstructionDecoder.js';
import { detectProgramHazards } from '../../js/pipeline/ProgramHazardDetector.js';
import { DEFAULT_ISA, sliceField } from '../../js/pipeline/isa/default.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (rel) => JSON.parse(readFileSync(resolve(__dirname, rel), 'utf8'));

let failed = 0;
function check(label, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${extra ? '  — ' + extra : ''}`);
}

// Convenience: build an instruction word from fields.
function encode(op, rd, rs1, rs2) {
  return ((op & 0xF) << 12) | ((rd & 0xF) << 8) | ((rs1 & 0xF) << 4) | (rs2 & 0xF);
}

// ── 1. decoder: bit-field extraction on every opcode ───────────────
console.log('\n-- decoder: field extraction --');
{
  const raw = encode(0x0, 2, 1, 2);     // ADD R2, R1, R2
  const d = decodeInstruction(0, raw);
  check('opcode = 0 (ADD)',    d.opcode === 0);
  check('name = ADD',          d.name === 'ADD');
  check('rd  = 2',             d.rd === 2);
  check('rs1 = 1',             d.rs1 === 1);
  check('rs2 = 2',             d.rs2 === 2);
  check('reads = [rs1, rs2]',  JSON.stringify(d.reads) === '["rs1","rs2"]');
  check('writes = [rd]',       JSON.stringify(d.writes) === '["rd"]');
  check('isLoad false',        d.isLoad === false);
  check('isBranch false',      d.isBranch === false);
  check('isHalt false',        d.isHalt === false);
}

// ── 2. decoder: LOAD / HALT / JMP classification ───────────────────
console.log('\n-- decoder: special opcodes --');
{
  const ld  = decodeInstruction(0, encode(0x8, 4, 0, 4));     // LOAD R4, [R4]
  const hlt = decodeInstruction(0, encode(0xF, 0, 0, 0));     // HALT
  const jmp = decodeInstruction(0, encode(0xA, 0, 0, 0) | 0x0A5); // JMP addr=0xA5
  check('LOAD isLoad',    ld.isLoad === true);
  check('LOAD writes rd', JSON.stringify(ld.writes) === '["rd"]');
  check('LOAD reads rs2', JSON.stringify(ld.reads) === '["rs2"]');
  check('HALT isHalt',    hlt.isHalt === true);
  check('JMP isBranch',   jmp.isBranch === true);
  check('JMP addr=0xA5',  jmp.addr === 0xA5);
}

// ── 3. classic RAW — textbook 2-instruction sequence ───────────────
console.log('\n-- hazard: RAW between ADD and SUB --');
{
  const instr = [
    decodeInstruction(0, encode(0x0, 2, 1, 2)),   // ADD R2, R1, R2
    decodeInstruction(1, encode(0x1, 3, 2, 3)),   // SUB R3, R2, R3  ← reads R2
  ];
  const h = detectProgramHazards(instr);
  check('exactly 1 hazard',       h.length === 1);
  check('type RAW',               h[0]?.type === 'RAW');
  check('instI pc=0, instJ pc=1', h[0]?.instI === 0 && h[0]?.instJ === 1);
  check('register = R2',          h[0]?.register === 2);
  check('bubbles = 3 (W=5, k=1)', h[0]?.bubbles === 3);
  check('loadUse false',          h[0]?.loadUse === false);
}

// ── 4. classic load-use ────────────────────────────────────────────
console.log('\n-- hazard: load-use between LOAD and next ADD --');
{
  const instr = [
    decodeInstruction(0, encode(0x8, 4, 0, 4)),   // LOAD R4, [R4]
    decodeInstruction(1, encode(0x0, 5, 4, 4)),   // ADD  R5, R4, R4  ← reads R4
  ];
  const h = detectProgramHazards(instr);
  check('exactly 1 hazard',       h.length === 1);
  check('RAW with loadUse=true',  h[0]?.loadUse === true);
  check('register = R4',          h[0]?.register === 4);
}

// ── 5. pipeline-window cutoff — pair outside window ignored ────────
console.log('\n-- hazard: pair outside pipeline window is not a hazard --');
{
  const instr = [
    decodeInstruction(0, encode(0x0, 2, 1, 2)),   // ADD R2
    decodeInstruction(1, encode(0xE, 0, 0, 0)),   // NOP
    decodeInstruction(2, encode(0xE, 0, 0, 0)),   // NOP
    decodeInstruction(3, encode(0xE, 0, 0, 0)),   // NOP
    decodeInstruction(4, encode(0xE, 0, 0, 0)),   // NOP
    decodeInstruction(5, encode(0x1, 3, 2, 3)),   // SUB R3, R2, R3  (5 instructions away)
  ];
  const h = detectProgramHazards(instr);
  check('no hazards (gap ≥ W)',    h.length === 0, `got ${h.length}`);
}

// ── 6. r0 is hard-wired zero — hazards on r0 suppressed ───────────
console.log('\n-- hazard: r0 writes/reads suppressed --');
{
  const instr = [
    decodeInstruction(0, encode(0x0, 0, 1, 2)),   // ADD R0, R1, R2 (writes r0 = ignored)
    decodeInstruction(1, encode(0x1, 3, 0, 3)),   // SUB R3, R0, R3 (reads r0)
  ];
  const h = detectProgramHazards(instr);
  check('no hazards on r0',         h.length === 0, `got ${h.length}`);
}

// ── 7. HALT stops the scan ────────────────────────────────────────
console.log('\n-- hazard: scan terminates at HALT --');
{
  const instr = [
    decodeInstruction(0, encode(0x0, 2, 1, 2)),   // ADD R2
    decodeInstruction(1, encode(0xF, 0, 0, 0)),   // HALT
    decodeInstruction(2, encode(0x1, 3, 2, 3)),   // SUB R3, R2, R3 — unreachable after HALT
  ];
  const h = detectProgramHazards(instr);
  check('no hazards past HALT',     h.length === 0, `got ${h.length}`);
}

// ── 8. dedupe — instr reads same reg via rs1 AND rs2 → 1 hazard ───
console.log('\n-- hazard: single entry when both rs1 & rs2 match --');
{
  const instr = [
    decodeInstruction(0, encode(0x8, 4, 0, 4)),   // LOAD R4
    decodeInstruction(1, encode(0x0, 5, 4, 4)),   // ADD R5, R4, R4  (rs1=rs2=R4)
  ];
  const h = detectProgramHazards(instr);
  check('exactly 1 hazard, not 2',  h.length === 1, `got ${h.length}`);
}

// ── 9. full demo circuit — decode + detect ────────────────────────
console.log('\n-- pipeline-demo-program.json (full demo) --');
{
  const data = load('../circuits/pipeline-demo-program.json');
  const rom  = findRomNode({ nodes: data.nodes });
  check('ROM node found',            rom !== null);
  const instr = decodeROM(rom);
  check('6 instructions decoded',    instr.length === 6);
  check('first is ADD',              instr[0]?.name === 'ADD');
  check('third is LOAD',             instr[2]?.name === 'LOAD');
  check('last is HALT',              instr[5]?.name === 'HALT');
  const h = detectProgramHazards(instr);
  console.log(`  (hazards=${h.length}, load-use=${h.filter(x => x.loadUse).length})`);
  check('3 program hazards total',   h.length === 3, `got ${h.length}`);
  check('one is load-use',           h.some(x => x.loadUse));
  check('RAW on R2 (ADD→SUB)',       h.some(x => x.register === 2 && x.instI === 0 && x.instJ === 1));
  check('RAW+LU on R4 (LOAD→ADD)',   h.some(x => x.register === 4 && x.loadUse));
  check('RAW on R5 (ADD→CMP)',       h.some(x => x.register === 5 && x.instI === 3 && x.instJ === 4));
}

// ── 9b. rich demo — 8 dependencies from a 9-instruction program ───
console.log('\n-- pipeline-demo-program-rich.json (8 hazards) --');
{
  const data = load('../circuits/pipeline-demo-program-rich.json');
  const rom  = findRomNode({ nodes: data.nodes });
  const instr = decodeROM(rom);
  check('9 instructions decoded',      instr.length === 9);
  const h = detectProgramHazards(instr);
  console.log(`  (hazards=${h.length}, load-use=${h.filter(x => x.loadUse).length})`);
  check('exactly 8 hazards',           h.length === 8);
  check('exactly 1 load-use',          h.filter(x => x.loadUse).length === 1);
  // Fan-out of 0x00 writing R1: reads at 0x01 (bub 3), 0x02 (bub 2), 0x03 (bub 1), 0x04 (bub 0).
  const r1Fanout = h.filter(x => x.register === 1 && x.instI === 0);
  check('4 RAW on R1 from 0x00',       r1Fanout.length === 4);
  check('bubble counts 3/2/1/0',       JSON.stringify(r1Fanout.map(x => x.bubbles).sort((a,b)=>b-a)) === '[3,2,1,0]');
  // LOAD at 0x05 → ADD at 0x06 is load-use.
  const lu = h.find(x => x.loadUse);
  check('load-use is 0x05 → 0x06 R11', lu?.instI === 5 && lu?.instJ === 6 && lu?.register === 11);
  // Disassembly smoke-check.
  check('disassemble(ADD …) format',   disassemble(instr[0]) === 'ADD R1, R2, R3');
  check('disassemble(LOAD …) format',  disassemble(instr[5]) === 'LOAD R11, [R12]');
  check('disassemble(HALT) = "HALT"',  disassemble(instr[8]) === 'HALT');
}

// ── 9c. WAR and WAW detection on synthetic sequences ──────────────
console.log('\n-- hazard: WAR detection (i reads R, j writes R) --');
{
  const instr = [
    decodeInstruction(0, encode(0x0, 1, 2, 3)),   // ADD R1, R2, R3   — reads R2,R3
    decodeInstruction(1, encode(0x2, 2, 6, 7)),   // AND R2, R6, R7   — writes R2
  ];
  const h = detectProgramHazards(instr);
  const war = h.find(x => x.type === 'WAR');
  check('at least 1 hazard',           h.length >= 1);
  check('WAR detected',                !!war);
  check('WAR register = R2',           war?.register === 2);
  check('WAR bubbles = 0',             war?.bubbles === 0);
}

console.log('\n-- hazard: WAW detection (i and j write same reg) --');
{
  const instr = [
    decodeInstruction(0, encode(0x0, 1, 2, 3)),   // ADD R1, R2, R3   — writes R1
    decodeInstruction(1, encode(0x3, 1, 8, 9)),   // OR  R1, R8, R9   — writes R1
  ];
  const h = detectProgramHazards(instr);
  const waw = h.find(x => x.type === 'WAW');
  check('WAW detected',                !!waw);
  check('WAW register = R1',           waw?.register === 1);
  check('WAW bubbles = 0',             waw?.bubbles === 0);
}

// ── 9d. all-types demo — 5 hazards spanning RAW/WAR/WAW/LOAD-USE ──
console.log('\n-- pipeline-demo-program-all.json (all 4 classifications) --');
{
  const data = load('../circuits/pipeline-demo-program-all.json');
  const rom  = findRomNode({ nodes: data.nodes });
  const instr = decodeROM(rom);
  check('7 instructions decoded',      instr.length === 7);
  const h = detectProgramHazards(instr);
  const byType = { RAW: 0, WAR: 0, WAW: 0 };
  let loadUse = 0;
  for (const x of h) { byType[x.type]++; if (x.loadUse) loadUse++; }
  console.log(`  (hazards=${h.length}  RAW=${byType.RAW} WAR=${byType.WAR} WAW=${byType.WAW} load-use=${loadUse})`);
  check('at least 1 RAW',              byType.RAW >= 1);
  check('at least 1 WAR',              byType.WAR >= 1);
  check('at least 1 WAW',              byType.WAW >= 1);
  check('exactly 1 load-use',          loadUse === 1);
  // Specific expected hazards.
  check('RAW on R1 (0x00 → 0x01)',     h.some(x => x.type === 'RAW' && x.register === 1 && x.instI === 0 && x.instJ === 1));
  check('WAR on R2 (0x00 → 0x02)',     h.some(x => x.type === 'WAR' && x.register === 2 && x.instI === 0 && x.instJ === 2));
  check('WAW on R1 (0x00 → 0x03)',     h.some(x => x.type === 'WAW' && x.register === 1 && x.instI === 0 && x.instJ === 3));
  check('LOAD-USE on R10 (0x04→0x05)', h.some(x => x.loadUse && x.register === 10 && x.instI === 4 && x.instJ === 5));
}

// ── 10. clean ROM (simple-cpu) — decoder runs without crashing ────
console.log('\n-- simple-cpu.json ROM — decode sanity --');
{
  const data = load('../circuits/simple-cpu.json');
  const rom  = findRomNode({ nodes: data.nodes });
  check('ROM node present',          rom !== null);
  const instr = decodeROM(rom);
  check('decoded >= 1 instruction',  instr.length >= 1);
  const h = detectProgramHazards(instr);
  check('hazards is an Array',       Array.isArray(h));
  // We don't assert a count — the example is a real program whose hazards
  // depend on its exact ROM contents. Just make sure nothing throws.
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
