/**
 * PipelineScheduler — builds a static cycle-by-cycle Gantt schedule
 * (instruction × cycle) over the decoded instruction stream.
 *
 * Phase 15 (Branch predictor visualizer, Phase 2): when a `predictor` is
 * supplied via options, loops detected by LoopAnalyzer are *unrolled* — each
 * iteration becomes its own row — and the predictor is consulted at each
 * back-edge branch (and JMP) to drive `flushAfter` per row. Mispredictions
 * carry `flushReason: 'mispredict'` so the renderer can colour them.
 *
 * Without a predictor (e.g. analyzer was constructed without one), the
 * scheduler falls back to the linear PC walk and the textbook "JMP=2 flush,
 * BEQ/BNE=0" heuristic — backward-compatible with Phase 1.
 *
 * Output shape:
 *   {
 *     stageNames: ['IF','ID','EX','MEM','WB'],
 *     rows: [{
 *       idx, pc, name, disasm,
 *       ifCycle, stallBefore, flushAfter,
 *       stalledBy:    [{ producerPc, bubbles, type, register, producerName }],
 *       isBranch, isHalt, isLoad, speculative,
 *
 *       // Phase-15 (loop-expansion) fields:
 *       iterIdx, iterTotal, loopId,    // null when not in an unrolled loop
 *       isBackEdge,                    // this row is the back-edge branch
 *       predicted, actualTaken,        // booleans, null when no predictor
 *       mispredict,                    // bool, default false
 *       flushReason,                   // 'mispredict' | 'unconditional' | null
 *     }],
 *     totalCycles, truncated, haltedAt,
 *   }
 */
import { disassemble } from './InstructionDecoder.js';

const MAX_ROWS = 96;            // total emitted rows after loop expansion
const STAGE_NAMES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
export const LOOP_ITERS = 6;    // iterations to unroll per detected loop

export function scheduleProgram(instructions, programHazards, _isa, options = {}) {
  if (!Array.isArray(instructions) || instructions.length === 0) return null;
  const { loops = [], predictor = null } = options;

  // Index unresolved RAW hazards by consumer PC.
  const stallsByConsumer = new Map();
  for (const h of (programHazards || [])) {
    if (h.type !== 'RAW') continue;
    if (h.resolvedByForwarding) continue;
    if (!(h.bubbles > 0)) continue;
    if (!stallsByConsumer.has(h.instJ)) stallsByConsumer.set(h.instJ, []);
    stallsByConsumer.get(h.instJ).push({
      producerPc:   h.instI,
      bubbles:      h.bubbles,
      type:         h.loadUse ? 'LOAD_USE' : 'RAW',
      register:     h.register,
      producerName: h.nameI,
    });
  }

  // Loop indexing — only loops whose start PC is in the decoded stream count.
  const pcToIdx = new Map(instructions.map((ins, i) => [ins.pc, i]));
  const loopByStartPc = new Map();
  for (const L of loops) {
    if (pcToIdx.has(L.startPc) && pcToIdx.has(L.endPc)) {
      loopByStartPc.set(L.startPc, L);
    }
  }

  const rows = [];
  let haltedAt = -1;
  let truncated = false;
  const expandedLoops = new Set();

  let i = 0;
  outer: while (i < instructions.length) {
    if (rows.length >= MAX_ROWS) { truncated = true; break; }
    const ins = instructions[i];
    const loop = loopByStartPc.get(ins.pc);

    if (loop && !expandedLoops.has(loop.id)) {
      expandedLoops.add(loop.id);
      const startIdx = i;
      const endIdx = pcToIdx.get(loop.endPc);
      if (endIdx == null || endIdx < startIdx) { i++; continue; }

      for (let iter = 1; iter <= LOOP_ITERS; iter++) {
        const isLastIter = (iter === LOOP_ITERS);
        for (let j = startIdx; j <= endIdx; j++) {
          if (rows.length >= MAX_ROWS) { truncated = true; break outer; }
          const insJ = instructions[j];
          const isBackEdge = (insJ.pc === loop.endPc);
          const extras = {
            iterIdx:   iter,
            iterTotal: LOOP_ITERS,
            loopId:    loop.id,
            isBackEdge,
            flushAfter: 0,
            flushReason: null,
            predicted:   null,
            actualTaken: null,
            mispredict:  false,
          };
          if (isBackEdge) {
            const actualTaken = !isLastIter;
            extras.actualTaken = actualTaken;
            if (predictor) {
              const p = predictor.predict(insJ.pc, loop.startPc);
              extras.predicted  = p.taken;
              extras.mispredict = (p.taken !== actualTaken);
              predictor.update(insJ.pc, actualTaken, loop.startPc);
            } else {
              // No predictor: textbook static-NT for conditional branches.
              extras.predicted  = false;
              extras.mispredict = actualTaken;
            }
            extras.flushAfter  = extras.mispredict ? 2 : 0;
            extras.flushReason = extras.mispredict ? 'mispredict' : null;
          }
          rows.push(_buildRow(insJ, rows, stallsByConsumer, extras));
          if (insJ.isHalt) { haltedAt = rows.length - 1; break outer; }
        }
      }
      i = endIdx + 1;
      continue;
    }

    // Non-loop (or already-expanded) instruction. Linear walk semantics.
    const extras = {
      iterIdx: null, iterTotal: null, loopId: null, isBackEdge: false,
      flushAfter: 0, flushReason: null,
      predicted: null, actualTaken: null, mispredict: false,
    };
    if (ins.name === 'JMP') {
      // Unconditional. With a predictor + a "BTB" (just the literal target
      // here), we could predict-taken with 0 flush. For now: predict via
      // the chosen predictor; treat actual = always taken.
      extras.actualTaken = true;
      if (predictor) {
        const p = predictor.predict(ins.pc, ins.addr ?? null);
        extras.predicted  = p.taken;
        extras.mispredict = !p.taken;
        predictor.update(ins.pc, true, ins.addr ?? null);
      } else {
        extras.predicted  = false;
        extras.mispredict = true;
      }
      extras.flushAfter  = extras.mispredict ? 2 : 0;
      extras.flushReason = extras.mispredict ? 'mispredict' : null;
      // Legacy heuristic for strict-static no-predictor: 2 flushes regardless,
      // matching the pre-Phase-15 Gantt for circuits without a predictor.
      if (!predictor) {
        extras.flushAfter  = 2;
        extras.flushReason = 'unconditional';
      }
    }
    rows.push(_buildRow(ins, rows, stallsByConsumer, extras));
    if (ins.isHalt) { haltedAt = rows.length - 1; break; }
    i++;
  }

  const last = rows[rows.length - 1];
  const lastWbCycle = last
    ? last.ifCycle + 4 + last.stallBefore   // WB = IF + 4 + stalls
    : 0;
  const totalCycles = lastWbCycle + 1;

  return {
    stageNames: STAGE_NAMES.slice(),
    rows,
    totalCycles,
    truncated,
    haltedAt,
  };
}

function _buildRow(ins, rows, stallsByConsumer, extras) {
  const prev = rows[rows.length - 1];
  const ifCycle = prev
    ? prev.ifCycle + 1 + prev.stallBefore + prev.flushAfter
    : 0;

  // RAW stall computation. With loop expansion, multiple emitted rows can
  // share the same PC; the producer of interest is the *most recent* one
  // before us (handles cross-iteration steady-state RAW automatically).
  let stallBefore = 0;
  const stalledBy = [];
  const needs = stallsByConsumer.get(ins.pc) || [];
  for (const s of needs) {
    let prod = null;
    for (let k = rows.length - 1; k >= 0; k--) {
      if (rows[k].pc === s.producerPc) { prod = rows[k]; break; }
    }
    if (!prod) continue;
    const producerExCycle = prod.ifCycle + 2 + prod.stallBefore;
    const requiredConsumerExCycle = producerExCycle + s.bubbles + 1;
    const naturalConsumerExCycle  = ifCycle + 2 + stallBefore;
    const need = Math.max(0, requiredConsumerExCycle - naturalConsumerExCycle);
    if (need > 0) {
      stallBefore = Math.max(stallBefore, need);
      stalledBy.push({
        producerPc:   s.producerPc,
        bubbles:      s.bubbles,
        type:         s.type,
        register:     s.register,
        producerName: s.producerName,
      });
    }
  }

  return {
    idx:         rows.length,
    pc:          ins.pc,
    name:        ins.name,
    disasm:      disassemble(ins),
    ifCycle,
    stallBefore,
    flushAfter:  extras.flushAfter,
    stalledBy,
    isBranch:    !!ins.isBranch,
    isHalt:      !!ins.isHalt,
    isLoad:      !!ins.isLoad,
    // Legacy `speculative` badge: the conditional-branch marker we used
    // pre-Phase-15. With loop expansion we know taken/NT exactly, so the
    // badge is only meaningful for conditional branches *outside* unrolled
    // loops.
    speculative: (ins.name === 'BEQ' || ins.name === 'BNE') && !extras.iterIdx,
    iterIdx:     extras.iterIdx,
    iterTotal:   extras.iterTotal,
    loopId:      extras.loopId,
    isBackEdge:  !!extras.isBackEdge,
    predicted:   extras.predicted,
    actualTaken: extras.actualTaken,
    mispredict:  !!extras.mispredict,
    flushReason: extras.flushReason,
  };
}

/**
 * For a given row, return the stage label occupying `cycleIdx`, or null if
 * the row is idle at that cycle. Stage order with B=stallBefore bubbles:
 *   IF | ID | (B × STALL) | EX | MEM | WB
 */
export function cellAt(row, cycleIdx) {
  const rel = cycleIdx - row.ifCycle;
  if (rel < 0) return null;
  if (rel === 0) return 'IF';
  if (rel === 1) return 'ID';
  if (rel >= 2 && rel < 2 + row.stallBefore) return 'STALL';
  const afterStall = rel - row.stallBefore;
  if (afterStall === 2) return 'EX';
  if (afterStall === 3) return 'MEM';
  if (afterStall === 4) return 'WB';
  return null;
}
