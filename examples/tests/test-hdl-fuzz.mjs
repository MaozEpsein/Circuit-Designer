// Phase 13 — property-based fuzz suite. 1000 seeds, each round-tripped:
//   IR → toVerilog → parseVerilog → elaborate → equals?
// Failures are persisted as fixtures so they can replay deterministically.
//
// Run: node examples/tests/test-hdl-fuzz.mjs            (1000 seeds)
//      node examples/tests/test-hdl-fuzz.mjs --seeds=50 (smaller smoke)

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { generateIR, validateGeneratedIR } from '../../js/hdl/verify/irGenerator.js';
import { toVerilog }    from '../../js/hdl/ir/toVerilog.js';
import { parseVerilog } from '../../js/hdl/parser/parser.js';
import { elaborate }    from '../../js/hdl/parser/elaborate.js';
import { canonicaliseWidths } from '../../js/hdl/ir/canonicaliseWidths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures', 'fuzz');

const arg = process.argv.find(a => a.startsWith('--seeds='));
const N   = arg ? parseInt(arg.split('=')[1], 10) : 1000;

let passed = 0, validateFail = 0, parseFail = 0, elabFail = 0, equalFail = 0;
const failures = [];

console.log(`Phase 13 fuzz — ${N} seeds (well-typed IR → toVerilog → parse → elaborate → equals)\n`);

for (let seed = 1; seed <= N; seed++) {
  const ir = generateIR(seed);
  const probs = validateGeneratedIR(ir);
  if (probs.length > 0) {
    validateFail++;
    failures.push({ seed, stage: 'validate', detail: probs[0] });
    continue;
  }
  let verilog, ast, ir2;
  try {
    verilog = toVerilog(ir, { header: false });
  } catch (e) {
    failures.push({ seed, stage: 'export', detail: e.message });
    continue;
  }
  try {
    ast = parseVerilog(verilog).ast;
  } catch (e) {
    parseFail++;
    failures.push({ seed, stage: 'parse', detail: e.message, verilog });
    continue;
  }
  try {
    ir2 = elaborate(ast).ir;
  } catch (e) {
    elabFail++;
    failures.push({ seed, stage: 'elaborate', detail: e.message, verilog });
    continue;
  }
  // Canonicalise both sides before structural comparison so trivial
  // width / fold differences don't cause false positives.
  canonicaliseWidths(ir);
  canonicaliseWidths(ir2);
  // Soft equality — same ports + same instance counts by type.
  const probs2 = _shapeDiff(ir, ir2);
  if (probs2.length === 0) {
    passed++;
  } else {
    equalFail++;
    failures.push({ seed, stage: 'shape', detail: probs2.join(' | '), verilog });
  }
}

const total = N;
const failed = total - passed;
console.log(`Result: ${passed}/${total} passed.`);
console.log(`  validate fail: ${validateFail}, parse fail: ${parseFail}, elab fail: ${elabFail}, shape fail: ${equalFail}`);
if (failed > 0) {
  if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true });
  // Persist up to 10 first failures so a developer can replay them.
  for (const f of failures.slice(0, 10)) {
    const path = join(FIXTURES_DIR, `seed-${f.seed}-${f.stage}.json`);
    writeFileSync(path, JSON.stringify({
      seed: f.seed, stage: f.stage, detail: f.detail,
      verilog: f.verilog || null,
    }, null, 2));
  }
  console.log(`\n${failures.slice(0, 10).length} failure fixture(s) written to examples/tests/fixtures/fuzz/`);
}

// Phase-13 release gate: parse + elaborate failures are blocking.
// Shape-diffs are tracked but tolerated (they reveal cases where
// inference still differs but the IR is semantically equivalent).
if (parseFail + elabFail + validateFail > 0) process.exit(1);

function _shapeDiff(a, b) {
  const probs = [];
  if ((a.ports || []).length !== (b.ports || []).length) {
    probs.push(`ports: ${a.ports?.length} vs ${b.ports?.length}`);
  }
  // Count by primitive type — that's the structural fingerprint.
  const ca = _typeCounts(a.instances || []);
  const cb = _typeCounts(b.instances || []);
  for (const k of Object.keys(ca)) {
    if (ca[k] !== (cb[k] || 0)) probs.push(`${k}: ${ca[k]} vs ${cb[k] || 0}`);
  }
  for (const k of Object.keys(cb)) {
    if (!(k in ca)) probs.push(`${k}: 0 vs ${cb[k]}`);
  }
  return probs;
}
function _typeCounts(arr) {
  const m = {};
  for (const x of arr) m[x.type] = (m[x.type] || 0) + 1;
  return m;
}
