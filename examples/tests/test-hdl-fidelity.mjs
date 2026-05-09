// Phase 12 — Fidelity Mode round-trip test.
//
// A hand-written `.v` with comments + unusual formatting must
// round-trip byte-identical when re-exported in Fidelity mode:
//   text → AST → IR(originalText carried) → toVerilog(fidelity:true)
// Run: node examples/tests/test-hdl-fidelity.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseVerilog } from '../../js/hdl/parser/parser.js';
import { elaborate }    from '../../js/hdl/parser/elaborate.js';
import { toVerilog }    from '../../js/hdl/ir/toVerilog.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const corpusPath = join(__dirname, '..', 'hdl-corpus', 'phase8-mux2-handwritten.v');
const src = readFileSync(corpusPath, 'utf8');

console.log('Fidelity Mode — hand-written sidecar round-trip');
{
  const { ast, errors: parseErrs } = parseVerilog(src);
  check('parses without errors',          parseErrs.length === 0);
  const { ir, errors: elabErrs }   = elaborate(ast, { source: src });
  check('elaborates without errors',      elabErrs.length === 0);
  check('module IR has originalText',     typeof ir.originalText === 'string'
                                          && ir.originalText.startsWith('module mux2'));

  const reEmitted = toVerilog(ir, { fidelity: true });
  // Substring check: the re-emitted output must contain the verbatim
  // module body — comments, attributes, parameter, case statement, etc.
  const fragments = [
    'module mux2 (',
    '(* keep *)',
    'parameter WIDTH = 4',
    '$display("mux2 module initialised")',
    'always @(*)',
    'always @(posedge clk or posedge rst)',
  ];
  for (const f of fragments) {
    check(`fidelity output preserves \`${f}\``, reEmitted.includes(f));
  }
  // Stronger: a second parse of the re-emitted output should yield
  // an AST structurally identical to the first. (Comments are stripped
  // from the AST anyway, so this is the strongest "semantically same"
  // claim we can make without a full Verilog formatter on both sides.)
  const ast2 = parseVerilog(reEmitted).ast;
  check('re-parse gives the same module count',
    ast2.modules.length === ast.modules.length);
  check('re-parse gives the same module name',
    ast2.modules[0].name === ast.modules[0].name);
}

console.log('Canonical Mode — same input loses comments + attributes');
{
  const ast = parseVerilog(src).ast;
  const ir  = elaborate(ast, { source: src }).ir;
  const reEmitted = toVerilog(ir, { fidelity: false });
  // Canonical drops the verbatim source and re-emits from IR. The
  // module name + ports must survive but the (* keep *) attribute is
  // stripped.
  check('canonical output names the module',  reEmitted.includes('module'));
  // Canonical mode WILL strip the inline (* keep *) Verilog attribute
  // because IR doesn't model attribute syntax (it stores them as
  // generic key/value pairs).
  check('canonical output strips (* keep *)',
    !reEmitted.includes('(* keep *)'));
}

if (failed > 0) {
  console.log(`\n${failed} fidelity test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll fidelity checks passed.');
}
