// Snapshot regression suite.
//
// Auto-discovers every examples/baselines/*.baseline.json, loads the
// corresponding circuit JSON, runs the engine for the recorded cycle
// count, and diffs the resulting RF / RAM / PC / branch-flush log /
// cache-stats against the baseline. Any drift FAILs the test and
// prints a precise field-by-field diff.
//
// The point: previous bugs (LI R1 not actually writing R1 in
// mips-5stage-complete; IR_FLUSH eating the branch-target IF; etc.)
// hid for a long time because per-test assertions only checked a
// final outcome (R3=99) instead of the full architectural state.
// This suite captures the WHOLE state, so drift in any field — even
// fields no individual test cares about — surfaces immediately.
//
// Update workflow:
//   UPDATE_SNAPSHOT=1 node examples/tests/test-snapshot-regression.mjs
// rewrites every baseline to the current engine output. Inspect the
// resulting `git diff examples/baselines/` carefully before committing.
//
// Run:  node examples/tests/test-snapshot-regression.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { createComponent, createWire } from '../../js/components/Component.js';
import { evaluate } from '../../js/engine/SimulationEngine.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, '..', '..');
const BASE_DIR   = resolve(REPO_ROOT, 'examples', 'baselines');
const UPDATE     = process.env.UPDATE_SNAPSHOT === '1';

let failed = 0;
const results = [];

// Normalise an empty array / undefined to null so JSON-stringified
// equality is consistent across runs.
const normalise = (v) => (v === undefined || v === null) ? null
  : (Array.isArray(v) && v.length === 0) ? null
  : v;

function captureState(nodes, ffs) {
  const rf  = nodes.find(n => n.type === 'REG_FILE_DP' || n.type === 'REG_FILE');
  const ram = nodes.find(n => n.type === 'RAM');
  const pc  = nodes.find(n => n.type === 'PC');
  const cacheMap = ffs.get('__cache_stats__');
  const cacheStats = cacheMap
    ? [...cacheMap.entries()].map(([id, s]) => ({
        id, label: s.label, hits: s.hits, misses: s.misses,
        miss3C: s.miss3C ? { ...s.miss3C } : null,
      }))
    : null;
  return {
    RF: rf ? (ffs.get(rf.id)?.regs ?? null) : null,
    RAM: ram ? (ffs.get(ram.id)?.memory ?? null) : null,
    PC: pc ? (ffs.get(pc.id)?.q ?? null) : null,
    branchFlushes: normalise(ffs.get('__branch_flushes__')),
    cacheStats,
  };
}

function runCircuit(circuitPath, cycles) {
  const data = JSON.parse(readFileSync(circuitPath, 'utf8'));
  const nodes = data.nodes.map(n => Object.assign(createComponent(n.type, n.x, n.y), n));
  const wires = data.wires.map(w => Object.assign(
    createWire(w.sourceId, w.targetId, w.targetInputIndex || 0, w.sourceOutputIndex || 0, w),
    { id: w.id }
  ));
  const ffs = new Map();
  const clk = nodes.find(n => n.id === 'clk' || n.type === 'CLOCK');
  if (!clk) throw new Error(`No CLOCK in ${circuitPath}`);
  for (let i = 0; i < cycles; i++) {
    clk.value = 1; evaluate(nodes, wires, ffs, i);
    clk.value = 0; evaluate(nodes, wires, ffs, i);
  }
  return { state: captureState(nodes, ffs), nodes, ffs };
}

// Field-by-field diff. Returns an array of human-readable lines
// describing exactly which fields drifted. Empty array → snapshots match.
function diffSnapshot(pre, post) {
  const diffs = [];
  // RF: index-by-index
  if (JSON.stringify(pre.RF) !== JSON.stringify(post.RF)) {
    if (Array.isArray(pre.RF) && Array.isArray(post.RF) && pre.RF.length === post.RF.length) {
      for (let i = 0; i < pre.RF.length; i++) {
        if (pre.RF[i] !== post.RF[i]) diffs.push(`  RF[${i}]: ${pre.RF[i]} → ${post.RF[i]}`);
      }
    } else {
      diffs.push(`  RF (length/null mismatch): ${JSON.stringify(pre.RF)} → ${JSON.stringify(post.RF)}`);
    }
  }
  // RAM: address-by-address (union of keys)
  if (JSON.stringify(pre.RAM) !== JSON.stringify(post.RAM)) {
    const keys = new Set([...Object.keys(pre.RAM || {}), ...Object.keys(post.RAM || {})]);
    for (const k of [...keys].sort((a, b) => +a - +b)) {
      const a = pre.RAM?.[k], b = post.RAM?.[k];
      if (a !== b) diffs.push(`  RAM[${k}]: ${a ?? '(unset)'} → ${b ?? '(unset)'}`);
    }
  }
  if (pre.PC !== post.PC) diffs.push(`  PC: ${pre.PC} → ${post.PC}`);
  if (JSON.stringify(pre.branchFlushes) !== JSON.stringify(post.branchFlushes)) {
    const preLen = pre.branchFlushes?.length ?? 0;
    const postLen = post.branchFlushes?.length ?? 0;
    diffs.push(`  branchFlushes: count ${preLen} → ${postLen}`);
    if (preLen !== postLen || preLen <= 6) {
      diffs.push(`    pre:  ${JSON.stringify(pre.branchFlushes)}`);
      diffs.push(`    post: ${JSON.stringify(post.branchFlushes)}`);
    }
  }
  if (JSON.stringify(pre.cacheStats) !== JSON.stringify(post.cacheStats)) {
    diffs.push(`  cacheStats:`);
    diffs.push(`    pre:  ${JSON.stringify(pre.cacheStats)}`);
    diffs.push(`    post: ${JSON.stringify(post.cacheStats)}`);
  }
  return diffs;
}

function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

const baselineFiles = readdirSync(BASE_DIR)
  .filter(f => f.endsWith('.baseline.json'))
  .sort();

console.log(`\n-- Snapshot regression: ${baselineFiles.length} baseline(s) ${UPDATE ? '(UPDATE MODE)' : ''} --`);

for (const baseFile of baselineFiles) {
  const basePath = resolve(BASE_DIR, baseFile);
  const baseline = JSON.parse(readFileSync(basePath, 'utf8'));
  const circuitPath = resolve(REPO_ROOT, baseline.file);
  const cycles = baseline.cycles;
  const demoLabel = basename(circuitPath);

  let post;
  try {
    post = runCircuit(circuitPath, cycles).state;
  } catch (err) {
    check(`${demoLabel} — engine ran without error`, false, err.message);
    continue;
  }

  // Normalise the baseline's branchFlushes for fair comparison.
  const pre = {
    RF: baseline.RF ?? null,
    RAM: baseline.RAM ?? null,
    PC: baseline.PC ?? null,
    branchFlushes: normalise(baseline.branchFlushes),
    cacheStats: normalise(baseline.cacheStats),
  };
  const drift = diffSnapshot(pre, post);

  if (UPDATE) {
    const updated = { file: baseline.file, cycles, ...post };
    writeFileSync(basePath, JSON.stringify(updated, null, 2));
    if (drift.length === 0) {
      results.push(`  [SKIP] ${demoLabel} — no drift, baseline rewritten anyway`);
    } else {
      results.push(`  [UPDATED] ${demoLabel} — ${drift.length} field(s) changed:`);
      for (const d of drift) results.push(d);
    }
  } else {
    if (drift.length === 0) {
      check(`${demoLabel} — snapshot matches baseline`, true);
    } else {
      check(`${demoLabel} — snapshot matches baseline`, false, `${drift.length} field(s) drifted`);
      for (const d of drift) console.log(d);
    }
  }
}

if (UPDATE) {
  for (const r of results) console.log(r);
  console.log(`\nUPDATE mode: ${baselineFiles.length} baselines rewritten. Inspect 'git diff examples/baselines/' before committing.`);
  process.exit(0);
}

console.log(`\n${failed === 0 ? 'ALL SNAPSHOTS MATCH' : `${failed} BASELINE(S) DRIFTED`}`);
process.exit(failed === 0 ? 0 : 1);
