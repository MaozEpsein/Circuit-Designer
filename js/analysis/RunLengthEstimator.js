/**
 * RunLengthEstimator — cheap, static estimate of how many clock cycles a
 * circuit will run before "naturally terminating".
 *
 * This is a heuristic. It looks at the structure of the scene (ROM contents,
 * pipeline depth, counter widths) and returns an estimate with a confidence
 * tag so consumers can decide whether to trust it, double it, or bound it.
 *
 * It does NOT run a simulation — that's `RunLengthMeasurer` (Stage C).
 *
 * Heuristic priority (first match wins):
 *   1. ROM containing a HALT instruction   → 'high'   confidence
 *   2. ROM with an unconditional JMP back  → 'medium' confidence, isBounded=false
 *   3. ROM without HALT (program reads off the end)
 *                                          → 'medium' confidence
 *   4. PC / COUNTER with a declared width  → 'low'    confidence (upper bound)
 *   5. Pipeline-only (no program, no state) → 'low'   confidence
 *   6. No clock at all                      → 'unknown', 1 cycle
 *
 * Returned shape:
 *   {
 *     cycles:      number,   // central estimate
 *     confidence:  'high' | 'medium' | 'low' | 'unknown',
 *     reason:      string,   // human-readable "HALT at PC 0x0A + 3 stages"
 *     sources:     string[], // which heuristics contributed
 *     isBounded:   boolean,  // false when an infinite loop is detected
 *     upperBound:  number | null,  // hard ceiling when derivable (counter width)
 *   }
 */
import { evaluate as stageEvaluate } from '../pipeline/StageEvaluator.js';
import { decodeROM, findRomNode }   from '../pipeline/InstructionDecoder.js';
import { detectHazards }             from '../pipeline/HazardDetector.js';
import { measureRunLength }          from './RunLengthMeasurer.js';

const FLOOR_CYCLES        = 6;    // smallest number we'll ever estimate (≥ stableWindow)
const HALT_BUFFER         = 1;    // drain window after HALT asserts
const PIPELINE_IDLE       = 3;    // extra cycles after pipeline fill for outputs to settle
const UNBOUNDED_CAP       = 500;  // reported cycles when the circuit cannot terminate

/**
 * Types that latch state across clock edges. If a "LOOP" hazard cycle
 * contains any of these, the feedback is actually latched (e.g. REG_FILE
 * in a CPU datapath) and the circuit does NOT combinationally oscillate.
 * PIPE_REG is already excluded by the HazardDetector itself; the rest we
 * filter here to avoid false-positive LOOP classifications on CPU scenes.
 */
const STATE_HOLDING_TYPES = new Set([
  'REGISTER', 'REG_FILE', 'REG_FILE_DP', 'RAM', 'CACHE',
  'FIFO', 'STACK', 'SHIFT_REG', 'COUNTER',
  'PC', 'IR', 'FF_SLOT', 'LATCH_SLOT', 'SCAN_FF',
]);

export function estimateRunLength(scene, opts = {}) {
  const base = _estimateStatic(scene);
  // Opt-in: cross-check against the real simulator and upgrade the
  // confidence to 'verified' (or 'verified-diff') based on agreement.
  if (opts.verify) return _verifyAgainst(base, scene, opts);
  return base;
}

function _estimateStatic(scene) {
  const nodes = scene?.nodes || [];

  // Case 6 — no clock: combinational circuit, not cycle-driven.
  const hasClock = nodes.some(n => n.type === 'CLOCK');
  if (!hasClock) {
    return _result(1, 'unknown', 'combinational circuit (no clock)', [], true, null, 1);
  }

  // Pipeline depth is always useful; compute once and reuse.
  // Consumers (e.g. RetimeVerifier) also want to read it back to size their
  // own warmup windows without re-running StageEvaluator.
  let pipelineDepth = 1;
  try {
    const r = stageEvaluate(scene);
    pipelineDepth = Math.max(1, r?.cycles || 1);
  } catch (_) { /* best-effort — fall back to depth 1 */ }

  // Case 1-3 — ROM-driven program. Checked first because HALT is the
  // strongest termination signal; even if the graph happens to have feedback
  // edges (a CPU's REG_FILE → ALU → REG_FILE loop, for instance), the HALT
  // determines the real runtime. Putting this ahead of the LOOP check
  // prevents false-positive "infinite" reports on CPU scenes.
  const rom = findRomNode(scene);
  if (rom && rom.memory && Object.keys(rom.memory).length > 0) {
    const instrs = decodeROM(rom);

    // 1. First HALT → high-confidence termination point.
    //    cycles = haltPc (time to reach it) + pipelineDepth (drain) + 1 (halt propagation).
    const halt = instrs.find(i => i.isHalt);
    if (halt) {
      const cycles = Math.max(FLOOR_CYCLES, halt.pc + pipelineDepth + HALT_BUFFER);
      return _result(
        cycles, 'high',
        `HALT at PC 0x${halt.pc.toString(16).toUpperCase()} + ${pipelineDepth} pipeline stage${pipelineDepth === 1 ? '' : 's'}`,
        ['rom-halt'], true, null, pipelineDepth,
      );
    }

    // 2. Unconditional JMP pointing back to an earlier PC → infinite loop.
    const loopBack = instrs.find(i => i.name === 'JMP' && i.addr <= i.pc);
    if (loopBack) {
      const loopLen = Math.max(1, loopBack.pc - loopBack.addr + 1);
      const cycles  = Math.max(FLOOR_CYCLES, loopLen * 3 + pipelineDepth);
      return _result(
        cycles, 'medium',
        `infinite loop: JMP 0x${loopBack.addr.toString(16).toUpperCase()} at PC 0x${loopBack.pc.toString(16).toUpperCase()} (${loopLen} instr)`,
        ['rom-loop'], false, null, pipelineDepth,
      );
    }

    // 3. No HALT, no loop → program runs off the end of the ROM.
    const maxPc  = Math.max(...instrs.map(i => i.pc));
    const cycles = Math.max(FLOOR_CYCLES, maxPc + pipelineDepth + HALT_BUFFER);
    return _result(
      cycles, 'medium',
      `no HALT; program falls off ROM end at PC 0x${maxPc.toString(16).toUpperCase()}`,
      ['rom-end'], true, null, pipelineDepth,
    );
  }

  // Case 0a — pure combinational LOOP hazard.
  //   The HazardDetector classifies a back-edge as LOOP when its cycle
  //   contains no PIPE_REG. Filter further: if any state-holding node
  //   (REG_FILE, RAM, COUNTER, …) sits on the cycle, the feedback is
  //   latched and the circuit does NOT oscillate. Only truly combinational
  //   cycles (NAND ↔ NAND, NOT ↔ NOT) end up as unbounded.
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  let allHazards = [];
  try { allHazards = detectHazards(scene); } catch (_) { /* best-effort */ }
  const loop = allHazards.find(h =>
    h.type === 'LOOP' &&
    !(h.cyclePath || []).some(id => STATE_HOLDING_TYPES.has(nodeMap.get(id)?.type))
  );
  if (loop) {
    return _result(
      UNBOUNDED_CAP, 'high',
      `combinational loop (${(loop.cyclePath || []).length || 2}-node cycle) \u2014 outputs will oscillate`,
      ['hazard-loop'], false, null, pipelineDepth,
    );
  }

  // Case 0a' — RAW/WAR/WAW feedback whose ripple reaches an OUTPUT.
  //   Even when a cycle is "latched" by a PIPE_REG, if the latched value
  //   itself is recomputed from that same output in the next cycle, the
  //   output value can keep changing cycle after cycle (sequential
  //   oscillator). Detect by BFS: does any node on the hazard's cycle
  //   have a downstream path to an OUTPUT? If so, the outputs are unlikely
  //   to stabilise within a reasonable window. Confidence is 'medium',
  //   not 'high' — some RAW feedbacks DO stabilise once the FF state
  //   converges, and we can't tell statically.
  const feedbackHit = allHazards.find(h =>
    (h.type === 'RAW' || h.type === 'WAR' || h.type === 'WAW') &&
    _cycleReachesOutput(h, scene, nodes)
  );
  if (feedbackHit) {
    return _result(
      UNBOUNDED_CAP, 'medium',
      `${feedbackHit.type} feedback on R${feedbackHit.register ?? '?'} reaches an OUTPUT \u2014 outputs may never stabilise`,
      ['hazard-feedback'], false, null, pipelineDepth,
    );
  }

  // Case 0b — naked counter.
  //   A COUNTER or PC whose EN / LOAD / CLR pins are all unwired will
  //   count monotonically without ever resetting — the measurer sees this
  //   as "outputs never stable".
  const nakedCounter = _findNakedCounter(scene);
  if (nakedCounter) {
    const upper = Math.pow(2, nakedCounter.bitWidth || 4);
    return _result(
      UNBOUNDED_CAP, 'high',
      `${nakedCounter.type} '${nakedCounter.label || nakedCounter.id}' has no CLR wire \u2014 oscillates indefinitely (wraps every ${upper} cycles)`,
      ['naked-counter'], false, upper, pipelineDepth,
    );
  }

  // Case 4 — PC / COUNTER with a declared width gives a hard upper bound.
  //   (Naked counters were already handled above; this branch is for counters
  //   that DO have a CLR driver — they terminate when CLR asserts, but we
  //   can't predict when, so we still use the pipeline fallback.)
  const pc = nodes.find(n => (n.type === 'PC' || n.type === 'COUNTER') && n.bitWidth);
  if (pc) {
    const upperBound = Math.pow(2, pc.bitWidth);
    const cycles     = Math.max(FLOOR_CYCLES, pipelineDepth + PIPELINE_IDLE);
    return _result(
      cycles, 'low',
      `${pc.type} width ${pc.bitWidth} bits \u2192 wraps at ${upperBound} cycles; using pipeline-default estimate`,
      ['counter-width', 'pipeline-default'], true, upperBound, pipelineDepth,
    );
  }

  // Case 5 — nothing program-like; pipeline fallback.
  //   After pipeline fills (depth cycles) outputs stabilise within a few
  //   more; the measurer's stable-outputs detector typically fires around
  //   depth + stableWindow.
  const cycles = Math.max(FLOOR_CYCLES, pipelineDepth + PIPELINE_IDLE);
  return _result(
    cycles, 'low',
    `no program; pipeline depth ${pipelineDepth} + idle settling (${PIPELINE_IDLE})`,
    ['pipeline-default'], true, null, pipelineDepth,
  );
}

/**
 * A naked counter is a COUNTER or PC with:
 *   - No data-wire driving its CLR pin (index 3).
 *   - No data-wire driving its LOAD pin (index 1, counter) / JMP pin (1, PC).
 * Such a node counts monotonically and never resets, so outputs never
 * stabilise. Returns the first such node, or null.
 */
/** BFS downstream from any node in the hazard's cycle; return true if it reaches an OUTPUT. */
function _cycleReachesOutput(hazard, scene, nodes) {
  const outputs = new Set(nodes.filter(n => n.type === 'OUTPUT').map(n => n.id));
  if (!outputs.size) return false;
  const succs = new Map(nodes.map(n => [n.id, []]));
  for (const w of (scene.wires || [])) {
    if (w.isClockWire) continue;
    if (succs.has(w.sourceId)) succs.get(w.sourceId).push(w.targetId);
  }
  const seeds  = (hazard.cyclePath && hazard.cyclePath.length)
    ? hazard.cyclePath
    : [hazard.srcId, hazard.dstId].filter(Boolean);
  const seen   = new Set(seeds);
  const queue  = [...seeds];
  while (queue.length) {
    const cur = queue.shift();
    if (outputs.has(cur)) return true;
    for (const nxt of (succs.get(cur) || [])) {
      if (seen.has(nxt)) continue;
      seen.add(nxt);
      queue.push(nxt);
    }
  }
  return false;
}

/**
 * Run the measurer and return an annotated result that reports whether the
 * static estimate agrees with the dynamic measurement.
 *   'verified'       — estimate and measurement agree (or both say unbounded)
 *   'verified-diff'  — they disagree; measured cycle count is taken as truth
 * In both cases, the returned `cycles` is the measured value (authoritative),
 * and the original estimate is retained under `.estimated`.
 */
function _verifyAgainst(baseResult, scene, opts) {
  let mes;
  try {
    mes = measureRunLength(scene, {
      terminate:   'any',
      maxCycles:    Math.max(opts.verifyMaxCycles || 500, baseResult.cycles * 2),
      stableWindow: 3,
    });
  } catch (e) {
    // If simulation fails, fall back to the static estimate unchanged.
    return baseResult;
  }

  const estUnbounded = baseResult.isBounded === false;
  const mesUnbounded = !mes.terminated;
  const bothUnbounded = estUnbounded && mesUnbounded;
  const bothBounded   = !estUnbounded && !mesUnbounded;

  // Agreement thresholds: within 5 cycles OR within 30% of the larger value.
  const close = bothBounded && (Math.abs(baseResult.cycles - mes.cycles) <=
    Math.max(5, Math.max(baseResult.cycles, mes.cycles) * 0.3));
  const agreement = bothUnbounded || close;

  return {
    ...baseResult,
    cycles:     mes.terminated ? mes.cycles : UNBOUNDED_CAP,
    confidence: agreement ? 'verified' : 'verified-diff',
    reason: agreement
      ? `${baseResult.reason} \u2014 verified by simulation (${mes.cycles} cycles, ${mes.reason})`
      : `estimator said ${baseResult.cycles}, measurer said ${mes.cycles} (${mes.reason})`,
    sources:   [...baseResult.sources, 'measured'],
    isBounded:  mes.terminated,
    estimated:  { cycles: baseResult.cycles, confidence: baseResult.confidence, reason: baseResult.reason },
    measured:   { cycles: mes.cycles, reason: mes.reason, terminated: mes.terminated, timeMs: mes.timeMs },
  };
}

function _findNakedCounter(scene) {
  const nodes = scene.nodes || [];
  const wires = scene.wires || [];
  for (const n of nodes) {
    if (n.type !== 'COUNTER' && n.type !== 'PC') continue;
    const hasNonClockInput = wires.some(w =>
      w.targetId === n.id && !w.isClockWire &&
      // Pins 1..3 are EN/LOAD/CLR for COUNTER and JMP/EN/CLR for PC. If none
      // are driven, the node only sees the clock and will tick forever.
      (w.targetInputIndex === 1 || w.targetInputIndex === 2 || w.targetInputIndex === 3)
    );
    if (!hasNonClockInput) return n;
  }
  return null;
}

function _result(cycles, confidence, reason, sources, isBounded, upperBound, pipelineDepth) {
  return { cycles, confidence, reason, sources, isBounded, upperBound, pipelineDepth };
}
