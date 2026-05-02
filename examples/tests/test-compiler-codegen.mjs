// Regression tests for the C-to-ASM compiler back-end.
//
// Covers both compilers:
//   - CCompiler.js / CodeGenerator.js — the AST-based compiler used
//     by the C tab in the ROM editor.
//   - Compiler.js — the simpler line-based pseudo-C compiler used by
//     legacy demos and the default ROM editor template.
//
// The load-bearing checks are around the BEQ/BNE migration: every
// conditional branch must compile to a single atomic instruction
// (no leftover CMP+JZ pairs from the legacy ISA), and every ordering
// operator (<, >, <=, >=) must be rejected with a clear error.
//
// Run:  node examples/tests/test-compiler-codegen.mjs

import { compileC, compileCToROM } from '../../js/cpu/compiler/CCompiler.js';
import { compile as compilePseudo } from '../../js/cpu/Compiler.js';
import { disassemble } from '../../js/cpu/Assembler.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

// Helpers that operate on the compiled `asm` array.
const has  = (asm, predicate) => asm.some(line => predicate(line));
const none = (asm, predicate) => !asm.some(line => predicate(line));
const startsWith = (mnemonic) => (line) => line.trim().startsWith(mnemonic + ' ') || line.trim() === mnemonic;
const countMatches = (asm, predicate) => asm.filter(predicate).length;

// ── 1. Equality branch (==): single BEQ/BNE, no legacy CMP+JZ pair ─
console.log('[1] CCompiler — `if (a == b) ...`');
{
  const r = compileC('int a = 1; int b = 2; if (a == b) { a = 1; }');
  check('no errors',                    r.errors.length === 0, JSON.stringify(r.errors));
  check('emits exactly one BNE',        countMatches(r.asm, startsWith('BNE')) === 1,
        `got ${countMatches(r.asm, startsWith('BNE'))}`);
  check('emits no CMP',                 none(r.asm, startsWith('CMP')));
  check('emits no JZ (legacy)',         none(r.asm, startsWith('JZ')));
  check('emits no JC (legacy)',         none(r.asm, startsWith('JC')));
}

// ── 2. Inequality branch (!=): single BEQ ─────────────────────────
console.log('\n[2] CCompiler — `if (a != b) ...`');
{
  const r = compileC('int a = 1; int b = 2; if (a != b) { a = 1; }');
  check('no errors',                    r.errors.length === 0);
  check('emits exactly one BEQ',        countMatches(r.asm, startsWith('BEQ')) === 1);
  check('emits no CMP',                 none(r.asm, startsWith('CMP')));
  check('emits no JZ',                  none(r.asm, startsWith('JZ')));
}

// ── 3. Ordering operators must be rejected ─────────────────────────
console.log('\n[3] CCompiler — ordering operators (<, >, <=, >=) all rejected');
for (const op of ['<', '>', '<=', '>=']) {
  const r = compileC(`int a = 1; int b = 2; if (a ${op} b) { a = 1; }`);
  check(`'${op}' produces error`, r.errors.length > 0,
        r.errors.length === 0 ? 'compiled without error (BUG)' : '');
  check(`'${op}' error mentions "not supported"`,
        r.errors.some(e => /not supported/i.test(e)));
}

// ── 4. Boolean truth-test fallback (`if (variable)`) ──────────────
// The general path: evaluate the expression to a register, then
// branch on (reg == R0). Should emit BEQ Rn, R0 with NO separate CMP.
console.log('\n[4] CCompiler — `if (a) ...` truth-test fallback');
{
  const r = compileC('int a = 5; if (a) { a = 1; }');
  check('no errors',                    r.errors.length === 0);
  check('emits a BEQ vs R0',            has(r.asm, line => /^\s*BEQ\s+R\d+,\s*R0,/.test(line)));
  check('emits no CMP',                 none(r.asm, startsWith('CMP')));
}

// ── 5. Logical NOT (!a) ────────────────────────────────────────────
// The result-builder uses BEQ Rn, R0 to test for zero atomically.
console.log('\n[5] CCompiler — `int b = !a;`');
{
  const r = compileC('int a = 5; int b = !a;');
  check('no errors',                    r.errors.length === 0);
  check('emits a BEQ vs R0',            has(r.asm, line => /^\s*BEQ\s+R\d+,\s*R0,/.test(line)));
  check('emits no CMP',                 none(r.asm, startsWith('CMP')));
  check('emits no JZ (legacy path)',    none(r.asm, startsWith('JZ')));
}

// ── 6. While loop with `!= 0` ─────────────────────────────────────
console.log('\n[6] CCompiler — `while (a != 0) a = a - 1;`');
{
  const r = compileC('int a = 5; while (a != 0) a = a - 1;');
  check('no errors',                    r.errors.length === 0);
  check('emits BEQ as loop exit',       has(r.asm, startsWith('BEQ')));
  check('emits JMP as loop back-edge',  has(r.asm, startsWith('JMP')));
  check('emits no CMP',                 none(r.asm, startsWith('CMP')));
  check('emits no JZ',                  none(r.asm, startsWith('JZ')));
}

// ── 7. For loop with `!= N` exit ──────────────────────────────────
console.log('\n[7] CCompiler — `for (int i = 0; i != 5; i = i + 1) ...`');
{
  const r = compileC('int s = 0; for (int i = 0; i != 5; i = i + 1) s = s + i;');
  check('no errors',                    r.errors.length === 0);
  check('emits BEQ as loop exit',       has(r.asm, startsWith('BEQ')));
  check('emits JMP as loop back-edge',  has(r.asm, startsWith('JMP')));
  check('emits no CMP',                 none(r.asm, startsWith('CMP')));
}

// ── 8. Register exhaustion ────────────────────────────────────────
console.log('\n[8] CCompiler — register exhaustion (>15 variables)');
{
  let src = '';
  for (let i = 0; i < 20; i++) src += `int v${i} = ${i};\n`;
  const r = compileC(src);
  check('produces at least one error',        r.errors.length > 0);
  check('error mentions "Out of registers"',  r.errors.some(e => /Out of registers/i.test(e)));
}

// ── 9. Pseudo-C compiler (Compiler.js) ────────────────────────────
console.log('\n[9] Compiler.js (line-based pseudo-C) — BEQ/BNE emission + ordering rejection');
{
  // ==
  const eq = compilePseudo('if (R1 == R2) goto end;\nNOP;\nend:\nHALT;');
  check('==: no errors',          eq.errors.length === 0);
  check('==: emits exactly one BEQ', countMatches(eq.asm, startsWith('BEQ')) === 1);
  check('==: emits no CMP',       none(eq.asm, startsWith('CMP')));
  check('==: emits no JZ',        none(eq.asm, startsWith('JZ')));

  // !=
  const ne = compilePseudo('if (R1 != R2) goto end;\nNOP;\nend:\nHALT;');
  check('!=: no errors',          ne.errors.length === 0);
  check('!=: emits exactly one BNE', countMatches(ne.asm, startsWith('BNE')) === 1);
  check('!=: emits no CMP',       none(ne.asm, startsWith('CMP')));

  // >  (must be rejected)
  const gt = compilePseudo('if (R1 > R2) goto end;\nNOP;\nend:\nHALT;');
  check('>: produces error',      gt.errors.length > 0);
  check('>: error mentions "Ordering"', gt.errors.some(e => /Ordering/i.test(e)));
}

// ── 10. End-to-end: C → ROM round-trip ────────────────────────────
// Compile a tiny program all the way to ROM bytes; verify the bytes
// disassemble back to the same mnemonics. Closes the loop:
//   C source → ASM lines → ROM hex → ASM (via disassemble).
console.log('\n[10] End-to-end — compileCToROM → disassemble round-trip');
{
  const r = compileCToROM('int a = 5; int b = 3; a = a + b;');
  check('no errors',          r.errors.length === 0, JSON.stringify(r.errors));
  check('memory non-empty',   Object.keys(r.memory).length > 0);
  // Every line in `asm` should round-trip through assemble→disassemble cleanly.
  const memAddrs = Object.keys(r.memory).map(Number).sort((a, b) => a - b);
  let mismatches = 0;
  for (const addr of memAddrs) {
    const expected = r.asm[addr];
    const got      = disassemble(r.memory[addr]);
    // disassemble may differ from the source line in spacing, so compare
    // their mnemonics + register operands by stripping non-essential
    // whitespace.
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    if (norm(expected) !== norm(got)) mismatches++;
  }
  check('every ROM word round-trips', mismatches === 0,
        mismatches > 0 ? `${mismatches} of ${memAddrs.length} mismatched` : '');
  // Spot check: the very first instruction sets a temp to 5.
  check('memory[0] decodes to LI',
        /^LI\s+R\d+,\s*5$/.test(disassemble(r.memory[0])),
        `got "${disassemble(r.memory[0])}"`);
}

// ── Summary ───────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
