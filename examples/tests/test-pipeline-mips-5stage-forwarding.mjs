// Verification for the mips-5stage-forwarding-demo circuit — asserts:
//   (1) ForwardingDetector finds exactly 2 paths (rs1 + rs2) on the MIPS
//       EX→EX textbook pattern where BOTH MUX inputs are PIPE_REG outputs
//       (ID/EX for normal read, EX/MEM for the forwarded alu_result).
//   (2) PipelineAnalyzer end-to-end resolves every non-load-use RAW and
//       leaves the load-use unresolved with its full bubble count.
//
// The graph still reports hasCycle=true because the forwarding feedback
// loop (EX/MEM → MUX → ALU → EX/MEM) isn't broken by StageEvaluator —
// that's tracked for Step 2 of the natural-path plan, not this test.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { detectForwardingPaths } from '../../js/pipeline/ForwardingDetector.js';
import { PipelineAnalyzer } from '../../js/pipeline/PipelineAnalyzer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (rel) => JSON.parse(readFileSync(resolve(__dirname, rel), 'utf8'));

let failed = 0;
function check(label, cond, extra = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${extra ? '  — ' + extra : ''}`);
}

// ── 1. detector finds the EX→EX paths ──────────────────────────
console.log('\n-- ForwardingDetector --');
{
  const scene = load('../circuits/mips-5stage-forwarding-demo.json');
  const { paths } = detectForwardingPaths(scene);
  check('2 forwarding paths',              paths.length === 2, `got ${paths.length}`);
  const byReg = Object.fromEntries(paths.map(p => [p.register, p]));
  check('rs1 path present',                !!byReg.rs1);
  check('rs2 path present',                !!byReg.rs2);
  check('both sourced from EX/MEM',        paths.every(p => p.srcNodeId === 'pipe_ex_mem'));
  check('both target EX (ALU)',            paths.every(p => p.toStage === 'EX'));
  check('ALU node is the consumer',        paths.every(p => p.aluNodeId === 'alu'));
  // Label must read "EX→EX" — produced by the graph-distance fallback when
  // StageEvaluator can't provide usable stage indices (forwarding cycle).
  check('fromStage label = EX→EX on both paths',
        paths.every(p => p.fromStage === 'EX→EX'),
        `got [${paths.map(p => p.fromStage).join(', ')}]`);
}

// ── 2. Regression: the normal-path PIPE_REG isn't itself reported ────
// ID/EX PIPE_REG is a MUX input too, but it's the "normal read" path, not
// a forwarded source. The detector must filter it out via the REG_FILE-as-
// pred rule.
console.log('\n-- normal-path PIPE_REG is not reported as forwarding --');
{
  const scene = load('../circuits/mips-5stage-forwarding-demo.json');
  const { paths } = detectForwardingPaths(scene);
  const normalPipeReported = paths.some(p => p.srcNodeId === 'pipe_id_ex');
  check('pipe_id_ex is NOT emitted as a forwarding source', !normalPipeReported);
}

// ── 3. End-to-end analyzer: hazard annotation ──────────────────
console.log('\n-- analyzer: hazard annotation --');
{
  const scene = load('../circuits/mips-5stage-forwarding-demo.json');
  const a = new PipelineAnalyzer(scene);
  const r = a.analyze({ force: true });

  check('ISA inference worked (native-default-table)',
        r.isa?.source === 'native-default-table');
  check('4 program hazards detected',      r.programHazards.length === 4);
  check('forwardingPaths array on result', Array.isArray(r.forwardingPaths) && r.forwardingPaths.length === 2);

  const raws = r.programHazards.filter(h => h.type === 'RAW');
  const resolved = raws.filter(h => h.resolvedByForwarding);
  const unresolved = raws.filter(h => !h.resolvedByForwarding);
  check('3 RAWs resolved',                 resolved.length === 3, `got ${resolved.length}`);
  check('1 RAW unresolved',                unresolved.length === 1, `got ${unresolved.length}`);

  // The unresolved RAW must be the load-use between PC 3 and PC 4.
  const loadUse = unresolved[0];
  check('unresolved RAW is load-use',      loadUse?.loadUse === true);
  check('load-use is PC 3 → PC 4 on R7',
        loadUse?.instI === 3 && loadUse?.instJ === 4 && loadUse?.register === 7);
  check('load-use keeps non-zero bubbles', loadUse?.bubbles > 0);

  // Every resolved hazard must have bubbles=0 and a forwardingPathId.
  check('all resolved RAWs have bubbles=0',
        resolved.every(h => h.bubbles === 0));
  check('all resolved RAWs have forwardingPathId',
        resolved.every(h => typeof h.forwardingPathId === 'string' && h.forwardingPathId.startsWith('fwd_')));
}

// ── 4. Regression guard: the original no-forwarding demo is untouched ──
console.log('\n-- no-forwarding demo regression guard --');
{
  const scene = load('../circuits/mips-5stage-demo.json');
  const { paths } = detectForwardingPaths(scene);
  check('no-forwarding demo has 0 paths', paths.length === 0);
  const a = new PipelineAnalyzer(scene);
  const r = a.analyze({ force: true });
  const raws = r.programHazards.filter(h => h.type === 'RAW');
  check('no RAW is marked resolved when no forwarding exists',
        raws.every(h => !h.resolvedByForwarding));
}

console.log(`\n${failed === 0 ? 'OK — all checks passed.' : `FAILED — ${failed} check(s)`}`);
process.exit(failed === 0 ? 0 : 1);
