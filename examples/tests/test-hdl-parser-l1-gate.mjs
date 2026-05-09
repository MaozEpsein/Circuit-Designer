// Phase 8 L1 gate — every demo under examples/circuits/verilog-phase*.json
// must export to Verilog AND parse cleanly with the hand-written parser.
//
// This is the "round-trip the exporter" test the README plan asks for:
// the parser is the second mouth of the export pipeline; if it can't
// eat its own dog food, something is wrong. Run:
//   node examples/tests/test-hdl-parser-l1-gate.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { exportCircuit } from '../../js/hdl/VerilogExporter.js';
import { parseVerilog }   from '../../js/hdl/parser/index.js';
import { astToVerilog }   from '../../js/hdl/parser/astToVerilog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CIRCUITS_DIR = join(__dirname, '..', 'circuits');

const demos = readdirSync(CIRCUITS_DIR)
  .filter(f => /^verilog-phase.*\.json$/.test(f))
  .sort();

let failed = 0;
let passed = 0;
const failures = [];

console.log(`L1 gate — parsing every exported verilog-phase* demo (${demos.length} files)`);

for (const file of demos) {
  const path = join(CIRCUITS_DIR, file);
  let scene;
  try {
    scene = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.log(`  [FAIL] ${file} — JSON load: ${e.message}`);
    failed++; failures.push({ file, stage: 'json-load', err: e.message });
    continue;
  }
  let v;
  try {
    v = exportCircuit(scene, { topName: file.replace(/\.json$/, '').replace(/-/g, '_'), header: false });
  } catch (e) {
    console.log(`  [FAIL] ${file} — exportCircuit: ${e.message}`);
    failed++; failures.push({ file, stage: 'export', err: e.message });
    continue;
  }
  let ast1;
  try {
    const r = parseVerilog(v);
    ast1 = r.ast;
    if (!ast1 || !ast1.modules || ast1.modules.length === 0) {
      throw new Error('parser returned no modules');
    }
  } catch (e) {
    failed++; failures.push({ file, stage: 'parse', err: e.message, verilog: v });
    console.log(`  [FAIL] ${file} — parse: ${e.message}`);
    continue;
  }
  // Round-trip via the AST printer — the second parse must produce a
  // structurally-equivalent AST (modulo source ranges).
  let ast2;
  try {
    const reprinted = astToVerilog(ast1);
    ast2 = parseVerilog(reprinted).ast;
  } catch (e) {
    failed++; failures.push({ file, stage: 'reparse', err: e.message });
    console.log(`  [FAIL] ${file} — re-parse after pretty-print: ${e.message}`);
    continue;
  }
  if (!_astShapeEqual(ast1, ast2)) {
    failed++; failures.push({ file, stage: 'shape-diff', err: 'AST differs after print/parse' });
    console.log(`  [FAIL] ${file} — round-trip AST shape differs`);
    continue;
  }
  passed++;
  console.log(`  [PASS] ${file} — ${ast1.modules.length} module(s), top has ${ast1.modules[ast1.modules.length - 1].items.length} items, round-trip ok`);
}

// Structural-equality on AST modulo source ranges and Paren wrappers
// (parens are pure syntactic sugar — re-printing inserts them around
// any operand of a unary op, while the original parse may not have
// captured them).
function _astShapeEqual(a, b) {
  a = _stripParens(a); b = _stripParens(b);
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => _astShapeEqual(v, b[i]));
  }
  if (typeof a !== 'object') return a === b;
  const ka = Object.keys(a).filter(k => k !== 'srcRange').sort();
  const kb = Object.keys(b).filter(k => k !== 'srcRange').sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every(k => _astShapeEqual(a[k], b[k]));
}
function _stripParens(n) {
  while (n && typeof n === 'object' && n.kind === 'Paren') n = n.inner;
  return n;
}

console.log(`\n${passed}/${demos.length} demos passed.`);
if (failures.length > 0) {
  console.log('\nFailing demos (showing first 200 chars of failed verilog):');
  for (const f of failures.slice(0, 5)) {
    console.log(`  • ${f.file} [${f.stage}]: ${f.err}`);
    if (f.verilog) {
      const lines = f.verilog.split('\n').slice(0, 30).join('\n');
      console.log('    --- first 30 lines ---');
      console.log(lines.split('\n').map(l => '    ' + l).join('\n'));
    }
  }
  process.exit(1);
}
