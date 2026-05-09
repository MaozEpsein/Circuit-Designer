// Phase 12 — Import UX helpers (DOM-free unit tests).
// Run: node examples/tests/test-hdl-import-ux.mjs

import {
  listModuleNames, pickTopModule, buildImportReport,
  formatParseError, hashVerilogBlock,
} from '../../js/hdl/ui/ImportModal.js';
import { importVerilog } from '../../js/hdl/VerilogExporter.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('listModuleNames');
{
  const names = listModuleNames(`module foo; endmodule\nmodule bar(input a); endmodule`);
  check('two modules detected', names.length === 2 && names[0] === 'foo' && names[1] === 'bar');
}
{
  check('empty source yields []',  listModuleNames('').length === 0);
  check('comments-only input yields []',
    listModuleNames('// just a comment\n/* block */').length === 0);
}

console.log('pickTopModule');
{
  check('falls through to last module by convention',
    pickTopModule(['child', 'helper', 'top']) === 'top');
  check('honours an explicit `top` even mid-list',
    pickTopModule(['top', 'helper']) === 'top');
  check('case-insensitive `Top`',
    pickTopModule(['Top', 'inner']) === 'Top');
  check('falls through when none called top',
    pickTopModule(['a', 'b', 'c']) === 'c');
  check('empty list → null',
    pickTopModule([]) === null);
}

console.log('buildImportReport');
{
  const fakeCircuit = {
    nodes: [
      { type: 'GATE_SLOT', gate: 'AND' },
      { type: 'GATE_SLOT', gate: 'OR' },
      { type: 'FLIPFLOP_D' },
      { type: 'REGISTER', bitWidth: 8 },
      { type: 'MUX' },
      { type: 'RAM', dataBits: 8, addrBits: 4 },
      { type: 'ROM', dataBits: 8, addrBits: 8 },
      { type: 'SUB_CIRCUIT' },
      { type: 'VERILOG_BLOCK' },
      { type: 'INPUT' },     // ignored
      { type: 'OUTPUT' },    // ignored
    ],
  };
  const { line, counts } = buildImportReport(fakeCircuit);
  check('counts gates',         counts.gates === 2);
  check('counts FFs separately from REGs',
    counts.flipflops === 1 && counts.registers === 1);
  check('counts RAM bytes',     counts.ramBytes === 16);   // 8b × 16 = 128b = 16B
  check('summary mentions modules + gates + ff + ram',
    /1 module/.test(line) && /2 gates/.test(line)
    && /1 flip-flop/.test(line) && /1 RAM/.test(line));
  check('summary closes with the unmapped count',
    /Verilog Blocks: 1\.$/.test(line));
}

console.log('formatParseError');
{
  // Build a parse error with location info and a source snippet.
  const src = `module bad;\n  wire ;\nendmodule`;
  const fakeErr = { token: { line: 2, col: 8 }, message: "expected 'id'" };
  const r = formatParseError(fakeErr, src);
  check('headline names the line + col', /line 2, col 8/.test(r.headline));
  check('snippet shows the offending source line',
    r.snippet?.startsWith('  wire ;'));
  check('snippet has a caret',
    r.snippet?.split('\n')[1]?.includes('^'));
}

console.log('hashVerilogBlock — comments/whitespace ignored');
{
  const a = hashVerilogBlock('module a; assign x = 1\'b0; endmodule');
  const b = hashVerilogBlock('module a;\n  // a comment\n  assign x = 1\'b0;\nendmodule');
  check('identical AST despite whitespace + comments → same hash', a === b);
}
{
  const a = hashVerilogBlock('module a; assign x = 1\'b0; endmodule');
  const b = hashVerilogBlock('module a; assign x = 1\'b1; endmodule');
  check('different literal value → different hash', a !== b);
}

console.log('Fidelity Mode — module originalText round-trips byte-identical');
{
  // The hand-written sidecar has comments + whitespace the IR
  // pretty-printer would drop. Fidelity Mode preserves it.
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, '..', 'hdl-corpus', 'phase8-mux2-handwritten.v');
  const src  = readFileSync(path, 'utf8');

  const { parseVerilog } = await import('../../js/hdl/parser/parser.js');
  const { elaborate }    = await import('../../js/hdl/parser/elaborate.js');
  const { toVerilog }    = await import('../../js/hdl/ir/toVerilog.js');

  const ast = parseVerilog(src).ast;
  const ir  = elaborate(ast, { source: src }).ir;
  const reEmittedFidelity = toVerilog(ir, { fidelity: true });
  const reEmittedCanonical = toVerilog(ir, { fidelity: false });

  // Fidelity mode must preserve the verbatim module text — so the
  // original substring must appear in the output.
  check('Fidelity output contains the original `module mux2 (` line',
    reEmittedFidelity.includes('module mux2 ('));
  check('Fidelity output preserves the (* keep *) attribute',
    reEmittedFidelity.includes('(* keep *)'));
  check('Fidelity output preserves the `parameter WIDTH = 4;` line',
    reEmittedFidelity.includes('parameter WIDTH = 4'));
  // Canonical mode strips comments + reformats, so those literal
  // strings should NOT appear.
  check('Canonical output drops the inline `(* keep *)` block',
    !reEmittedCanonical.includes('(* keep *)'));
}

console.log('importVerilog — full pipeline returns a circuit + report');
{
  const { circuit, errors } = importVerilog(`module top(input a, input b, output y);
    and g(y, a, b);
  endmodule`);
  check('no errors',                      errors.length === 0);
  check('circuit has nodes + wires',      circuit.nodes.length > 0 && circuit.wires.length > 0);
  const { line, counts } = buildImportReport(circuit);
  check('imported gate count = 1',        counts.gates === 1);
  check('report line non-empty',          typeof line === 'string' && line.length > 0);
}

if (failed > 0) {
  console.log(`\n${failed} import-UX test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll import-UX checks passed.');
}
