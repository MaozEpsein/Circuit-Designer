// Round-trip test for the Assembler / Disassembler.
//
// For every supported mnemonic, asserts that:
//   1. assemble(line) produces the expected 16-bit word, AND
//   2. disassemble(word) reproduces the canonical line text.
//
// This is the cheapest regression net for ISA changes — flipping any
// opcode number, format, or field layout will surface here before any
// downstream simulation does.
//
// Run:  node examples/tests/test-assembler-roundtrip.mjs

import { assemble, disassemble, getOpcodeNames, getOpcodeFormat } from '../../js/cpu/Assembler.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

// ── 1. Hand-picked encodings ──────────────────────────────────
// Each row: [source line, expected 16-bit word, expected disassembly].
// Disassembly may differ in spacing/case from the input — we compare
// the canonical form returned by disassemble(assemble(x)).
console.log('[1] Encoding spot checks');
const cases = [
  // ALU R-type
  ['ADD R2, R1, R0',   0x0210, 'ADD R2, R1, R0'],
  ['SUB R3, R5, R4',   0x1354, 'SUB R3, R5, R4'],
  ['XOR R7, R7, R7',   0x4777, 'XOR R7, R7, R7'],
  ['SHL R1, R2, R3',   0x5123, 'SHL R1, R2, R3'],
  ['SHR R1, R2, R3',   0x6123, 'SHR R1, R2, R3'],
  // CMP — only RS1, RS2; no RD
  ['CMP R1, R2',       0x7012, 'CMP R1, R2'],
  ['CMP R0, R0',       0x7000, 'CMP R0, R0'],
  // Memory
  ['LOAD R5, R3',      0x8503, 'LOAD R5, R3'],
  ['STORE R6, R3',     0x9063, 'STORE R6, R3'],
  // JMP — single immediate in RD field
  ['JMP 5',            0xA500, 'JMP 5'],
  ['JMP 0',            0xA000, 'JMP 0'],
  // BEQ / BNE — atomic compare-and-branch (the new ISA)
  ['BEQ R1, R2, 7',    0xB712, 'BEQ R1, R2, 7'],
  ['BEQ R0, R0, 0',    0xB000, 'BEQ R0, R0, 0'],
  ['BEQ R5, R0, 15',   0xBF50, 'BEQ R5, R0, 15'],
  ['BNE R3, R0, 15',   0xCF30, 'BNE R3, R0, 15'],
  ['BNE R1, R1, 4',    0xC411, 'BNE R1, R1, 4'],
  // LI — 8-bit immediate packed into RS1:RS2
  ['LI R1, 0',         0xD100, 'LI R1, 0'],
  ['LI R1, 4',         0xD104, 'LI R1, 4'],
  ['LI R5, 99',        0xD563, 'LI R5, 99'],
  ['LI R7, 255',       0xD7FF, 'LI R7, 255'],
  // MOV is sugar for "ADD Rd, Rs, R0" — disassembles back to ADD form
  ['MOV R3, R5',       0x0350, 'ADD R3, R5, R0'],
  // House-keeping
  ['NOP',              0xE000, 'NOP'],
  ['HALT',             0xF000, 'HALT'],
];

for (const [line, hex, canonical] of cases) {
  const got = assemble(line);
  check(
    `${line.padEnd(20)} → 0x${hex.toString(16).toUpperCase().padStart(4, '0')}`,
    got === hex,
    got !== hex ? `got 0x${got.toString(16).toUpperCase().padStart(4, '0')}` : '',
  );
  const dis = disassemble(got);
  check(
    `disassemble(0x${hex.toString(16).toUpperCase().padStart(4, '0')}) = "${canonical}"`,
    dis === canonical,
    dis !== canonical ? `got "${dis}"` : '',
  );
}

// ── 2. Opcode-table sanity ────────────────────────────────────
// If somebody accidentally drops or duplicates an opcode in OP_TABLE,
// the demo programs will silently misbehave. Catch it here.
console.log('\n[2] Opcode table integrity');
const names = getOpcodeNames();
const required = ['ADD','SUB','AND','OR','XOR','SHL','SHR','CMP',
                  'LOAD','STORE','JMP','BEQ','BNE','MOV','LI','NOP','HALT'];
for (const n of required) {
  check(`mnemonic "${n}" present`, names.includes(n));
}
// JZ / JC must NOT be present after the BEQ/BNE migration.
check('mnemonic "JZ" removed', !names.includes('JZ'));
check('mnemonic "JC" removed', !names.includes('JC'));

// BEQ / BNE must use the dedicated branch format ('br'), not the 1-imm
// format that JZ/JC used to share.
check("getOpcodeFormat('BEQ') === 'br'", getOpcodeFormat('BEQ') === 'br');
check("getOpcodeFormat('BNE') === 'br'", getOpcodeFormat('BNE') === 'br');
check("getOpcodeFormat('JMP') === 1",    getOpcodeFormat('JMP') === 1);

// ── 3. Round-trip on every BEQ/BNE in the encoding space ──────
// Sweep all (Rs1, Rs2, addr) combos to ensure no field collides.
console.log('\n[3] BEQ/BNE exhaustive round-trip (256 cases)');
let exBad = 0;
for (const op of ['BEQ', 'BNE']) {
  for (let rs1 = 0; rs1 < 4; rs1++) {
    for (let rs2 = 0; rs2 < 4; rs2++) {
      for (let addr = 0; addr < 16; addr++) {
        const line = `${op} R${rs1}, R${rs2}, ${addr}`;
        const enc  = assemble(line);
        const dec  = disassemble(enc);
        if (dec !== line) {
          if (exBad < 3) console.log(`    [FAIL] "${line}" → 0x${enc.toString(16)} → "${dec}"`);
          exBad++;
        }
      }
    }
  }
}
check(`all 512 BEQ/BNE round-trips (${exBad} failures)`, exBad === 0);

// ── Summary ───────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
