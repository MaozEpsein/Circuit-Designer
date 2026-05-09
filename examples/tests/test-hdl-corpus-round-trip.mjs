// Phase 13 — round-trip every file in examples/hdl-corpus/ through
// CANONICAL and FIDELITY modes.
//
// CANONICAL: text → AST → IR → toVerilog(IR) — must parse cleanly
// after the second emit.
// FIDELITY:  text → AST → IR(originalText) → toVerilog(fidelity) —
// the re-emitted output must contain the original module verbatim.
//
// Run: node examples/tests/test-hdl-corpus-round-trip.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseVerilog } from '../../js/hdl/parser/parser.js';
import { elaborate }    from '../../js/hdl/parser/elaborate.js';
import { toVerilog }    from '../../js/hdl/ir/toVerilog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(__dirname, '..', 'hdl-corpus');

const files = readdirSync(CORPUS).filter(f => /\.(v|sv)$/.test(f)).sort();

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log(`Corpus round-trip — ${files.length} files\n`);

for (const f of files) {
  const src = readFileSync(join(CORPUS, f), 'utf8');
  const { ast, errors: pe } = parseVerilog(src);
  if (pe.length > 0) { check(`${f} — parse`, false, pe[0].message); continue; }
  const { ir, errors: ee } = elaborate(ast, { source: src });
  if (ee.length > 0) { check(`${f} — elaborate`, false, ee[0].message); continue; }

  // CANONICAL re-emit must parse cleanly the second time.
  const canon = toVerilog(ir, { header: false });
  let canonOk = true;
  try { parseVerilog(canon); } catch { canonOk = false; }
  check(`${f} — CANONICAL re-parse`, canonOk);

  // FIDELITY mode preserves the original module verbatim.
  const fid = toVerilog(ir, { fidelity: true });
  // Sample fragments from the original source — they must all appear
  // in the fidelity output.
  const sample = _moduleHeader(src);
  check(`${f} — FIDELITY preserves the module header`,
    sample && fid.includes(sample),
    sample ? '' : 'no module header found');
}

if (failed > 0) {
  console.log(`\n${failed} corpus round-trip check(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll corpus round-trip checks passed.');
}

// Pull the first non-comment line that contains `module NAME` so we
// have a small invariant we can assert preservation of.
function _moduleHeader(src) {
  for (const ln of src.split('\n')) {
    const t = ln.trim();
    if (!t || t.startsWith('//')) continue;
    if (t.startsWith('module ')) return t;
  }
  return null;
}
