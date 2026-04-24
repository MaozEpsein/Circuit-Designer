// Standalone verification for Phase 14a — auto-ISA inference.
// Asserts that `inferIsa` produces an ISA structurally compatible with
// DEFAULT_ISA when run on the shipped single-cycle CPU demos, and degrades
// gracefully on SUB_CIRCUIT-based CUs and IR-less scenes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { inferIsa } from '../../js/pipeline/isa/IsaInference.js';
import { DEFAULT_ISA } from '../../js/pipeline/isa/default.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (rel) => JSON.parse(readFileSync(resolve(__dirname, rel), 'utf8'));

let failed = 0;
function check(label, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${extra ? '  — ' + extra : ''}`);
}

// Keys we consider the "semantic core" of an opcode row — the pieces the
// hazard detector actually consumes. We compare these for equality against
// DEFAULT_ISA rather than the full object, because the inferred `name` can
// legitimately differ (e.g. OP_X fallback) and flags like aluOp don't affect
// hazard analysis.
function coreOpcode(row) {
  return {
    reads:    row.reads || [],
    writes:   row.writes || [],
    isLoad:   !!row.isLoad,
    isBranch: !!row.isBranch,
    isHalt:   !!row.isHalt,
  };
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ── 1. simple-cpu.json — native CU, controlTable=null → default-table path ──
console.log('\n-- simple-cpu.json: inference from null controlTable --');
{
  const scene = load('../circuits/simple-cpu.json');
  const isa = inferIsa(scene);
  check('returned ISA non-null',           isa !== null);
  check('source = native-default-table',   isa.source === 'native-default-table',
        `got '${isa.source}'`);
  check('warnings is empty',               Array.isArray(isa.warnings) && isa.warnings.length === 0);
  check('wordBits = 16',                   isa.wordBits === 16);
  check('opcodes count = 16',              Object.keys(isa.opcodes).length === 16);

  // Spot-check several opcodes against DEFAULT_ISA.
  for (const i of [0x0, 0x1, 0x7, 0x8, 0x9, 0xA, 0xB, 0xD, 0xE, 0xF]) {
    const want = coreOpcode(DEFAULT_ISA.opcodes[i]);
    const got  = coreOpcode(isa.opcodes[i]);
    check(`opcode 0x${i.toString(16).toUpperCase()} semantics match DEFAULT_ISA`,
          eq(want, got),
          `want=${JSON.stringify(want)} got=${JSON.stringify(got)}`);
  }

  // Field extraction mirrors DEFAULT_ISA for the stock 4/4/4/4 IR layout.
  check('fields.op = [15,12]',  eq(isa.fields.op,  [15, 12]));
  check('fields.rd = [11,8]',   eq(isa.fields.rd,  [11, 8]));
  check('fields.rs1 = [7,4]',   eq(isa.fields.rs1, [7, 4]));
  check('fields.rs2 = [3,0]',   eq(isa.fields.rs2, [3, 0]));
  check('fields.addr = [11,0]', eq(isa.fields.addr, [11, 0]));
}

// ── 2. mips-gcd.json — same native-CU shape ────────────────────────────────
console.log('\n-- mips-gcd.json: inference from null controlTable --');
{
  const scene = load('../circuits/mips-gcd.json');
  const isa = inferIsa(scene);
  check('returned ISA non-null',           isa !== null);
  check('wordBits = 16',                   isa.wordBits === 16);
  check('opcodes count = 16',              Object.keys(isa.opcodes).length === 16);

  // Inferred opcodes should agree with DEFAULT_ISA's core semantics.
  let mismatch = 0;
  for (let i = 0; i < 16; i++) {
    if (!eq(coreOpcode(DEFAULT_ISA.opcodes[i]), coreOpcode(isa.opcodes[i]))) {
      mismatch++;
      console.log(`      mismatch at 0x${i.toString(16)}: ` +
        `want=${JSON.stringify(coreOpcode(DEFAULT_ISA.opcodes[i]))} ` +
        `got=${JSON.stringify(coreOpcode(isa.opcodes[i]))}`);
    }
  }
  check('all 16 opcodes semantically match DEFAULT_ISA', mismatch === 0);
}

// ── 3. cpu-detailed.json — SUB_CIRCUIT CU → graceful fallback ──────────────
console.log('\n-- cpu-detailed.json: SUB_CIRCUIT CU fallback --');
{
  const scene = load('../circuits/cpu-detailed.json');
  const isa = inferIsa(scene);
  // cpu-detailed's CU may be modelled as a SUB_CIRCUIT; if it's a native CU
  // with a custom controlTable, we still get a usable result. Either way the
  // inference must not crash and must return a populated ISA.
  check('returned ISA non-null',      isa !== null);
  check('has opcodes',                typeof isa.opcodes === 'object' && Object.keys(isa.opcodes).length > 0);
  check('source is a known tag',
        ['native', 'native-default-table', 'subcircuit-fallback', 'subcircuit-cu', 'no-ir-fallback', 'no-cu-fallback']
          .includes(isa.source),
        `got '${isa.source}'`);
}

// ── 4. synthetic minimal cases ────────────────────────────────────────────
console.log('\n-- synthetic scenes: missing components --');
{
  const empty = inferIsa({ nodes: [] });
  check('empty scene → null', empty === null);

  const onlyCU = inferIsa({ nodes: [{ id: 'c', type: 'CU', controlTable: null }] });
  check('CU without IR → fallback with no-ir warning',
        onlyCU && onlyCU.source === 'no-ir-fallback' && onlyCU.warnings.length > 0);

  const onlyIR = inferIsa({ nodes: [{ id: 'i', type: 'IR', instrWidth: 16, opBits: 4, rdBits: 4, rs1Bits: 4, rs2Bits: 4 }] });
  check('IR without CU → fallback with no-cu warning',
        onlyIR && onlyIR.source === 'no-cu-fallback' && onlyIR.warnings.length > 0);

  // Custom controlTable with a single HALT-only row.
  const customTable = [{ name: 'DONE', halt: 1 }];
  const customScene = {
    nodes: [
      { id: 'c', type: 'CU', controlTable: customTable },
      { id: 'i', type: 'IR', instrWidth: 8, opBits: 1, rdBits: 3, rs1Bits: 2, rs2Bits: 2 },
    ],
  };
  const customIsa = inferIsa(customScene);
  check('custom controlTable → source=native', customIsa.source === 'native');
  check('custom wordBits reflects IR',         customIsa.wordBits === 8);
  check('custom opcode 0 isHalt',              customIsa.opcodes[0].isHalt === true);
  check('custom field op = [7,7]',             eq(customIsa.fields.op, [7, 7]));
  check('custom field rd = [6,4]',             eq(customIsa.fields.rd, [6, 4]));
}

// ── 5. integration sanity: inferred ISA works with ProgramHazardDetector ──
console.log('\n-- integration: inferred ISA drives program-hazard detection --');
{
  const scene = load('../circuits/pipeline-demo-program.json');
  const isa = inferIsa(scene);
  const { decodeROM, findRomNode } = await import('../../js/pipeline/InstructionDecoder.js');
  const { detectProgramHazards }   = await import('../../js/pipeline/ProgramHazardDetector.js');
  const rom = findRomNode(scene);
  check('ROM present in program demo', !!rom);
  const stream = decodeROM(rom, isa);
  check('decoded instruction stream non-empty', stream.length > 0);
  const hazardsWithInferred = detectProgramHazards(stream, isa);
  const hazardsWithDefault  = detectProgramHazards(decodeROM(rom, DEFAULT_ISA), DEFAULT_ISA);
  check('inferred hazard count matches DEFAULT_ISA count on same scene',
        hazardsWithInferred.length === hazardsWithDefault.length,
        `inferred=${hazardsWithInferred.length} default=${hazardsWithDefault.length}`);
}

console.log(`\n${failed === 0 ? 'OK — all checks passed.' : `FAILED — ${failed} check(s)`}`);
process.exit(failed === 0 ? 0 : 1);
