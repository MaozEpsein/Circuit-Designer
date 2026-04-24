/**
 * PipelineScheduler — builds a static cycle-by-cycle Gantt schedule
 * (instruction × cycle) over the decoded instruction stream, honouring
 * RAW stalls (forwarding-aware via ProgramHazardDetector) and unconditional
 * branch flushes. This is compile-time projection of an ideal in-order
 * 5-stage pipeline — no live simulation state is required.
 *
 * Output shape:
 *   {
 *     stageNames: ['IF','ID','EX','MEM','WB'],
 *     rows: [{
 *       idx, pc, name, disasm,
 *       ifCycle,          // cycle in which IF occurs
 *       stallBefore,      // # of bubble cells inserted between ID and EX
 *       flushAfter,       // # of flushed IF slots caused by this row (for JMP)
 *       stalledBy,        // [{ producerPc, bubbles }] — UI tooltip hint
 *     }],
 *     totalCycles,        // last WB cycle + 1
 *     truncated,          // true if we stopped at MAX_INSTRUCTIONS
 *     haltedAt,           // idx of HALT row, or -1
 *   }
 *
 * Design notes:
 *   - Linear PC walk: follows ROM order, NOT branch targets. JMP is drawn
 *     with a 2-cycle flush on the following two instructions (textbook MIPS:
 *     branch resolves at EX). JZ/JC are conditional — modelled as zero-cost
 *     to keep the diagram deterministic; a `speculative` flag is set so the
 *     UI can badge the row.
 *   - Hard cap at MAX_INSTRUCTIONS rows to keep loop-heavy ROMs bounded.
 *   - Trusts the `bubbles` / `resolvedByForwarding` fields already computed
 *     by ProgramHazardDetector + the forwarding annotator in PipelineAnalyzer,
 *     so CPI here matches the numbers in the PERFORMANCE panel.
 */
import { disassemble } from './InstructionDecoder.js';

const MAX_INSTRUCTIONS = 64;
const STAGE_NAMES = ['IF', 'ID', 'EX', 'MEM', 'WB'];

export function scheduleProgram(instructions, programHazards, _isa) {
  if (!Array.isArray(instructions) || instructions.length === 0) return null;

  const items = instructions.slice(0, MAX_INSTRUCTIONS);
  const truncated = instructions.length > items.length;

  // Index unresolved RAW hazards by consumer PC.
  const stallsByConsumer = new Map();
  for (const h of (programHazards || [])) {
    if (h.type !== 'RAW') continue;
    if (h.resolvedByForwarding) continue;
    if (!(h.bubbles > 0)) continue;
    if (!stallsByConsumer.has(h.instJ)) stallsByConsumer.set(h.instJ, []);
    stallsByConsumer.get(h.instJ).push({ producerPc: h.instI, bubbles: h.bubbles });
  }

  const rows = [];
  let haltedAt = -1;

  for (let i = 0; i < items.length; i++) {
    const ins = items[i];
    const prev = rows[i - 1];
    const prevIns = items[i - 1];

    let ifCycle;
    if (i === 0) {
      ifCycle = 0;
    } else {
      // Sequential baseline: follow prev's IF + its own stalls + branch flush.
      ifCycle = prev.ifCycle + 1 + prev.stallBefore + prev.flushAfter;
    }

    // Enforce RAW stall: consumer's EX must land after producer's EX + bubbles.
    let stallBefore = 0;
    const stalledBy = [];
    const needs = stallsByConsumer.get(ins.pc) || [];
    for (const s of needs) {
      const prod = rows.find(r => r.pc === s.producerPc);
      if (!prod) continue;
      const producerExCycle = prod.ifCycle + 2 + prod.stallBefore;
      const requiredConsumerExCycle = producerExCycle + s.bubbles + 1;
      const naturalConsumerExCycle  = ifCycle + 2 + stallBefore;
      const need = Math.max(0, requiredConsumerExCycle - naturalConsumerExCycle);
      if (need > 0) {
        stallBefore = Math.max(stallBefore, need);
        stalledBy.push({ producerPc: s.producerPc, bubbles: s.bubbles });
      }
    }

    // Unconditional branch → flush the next two IF slots.
    const flushAfter = (ins.name === 'JMP') ? 2 : 0;
    const speculative = (ins.name === 'JZ' || ins.name === 'JC');

    rows.push({
      idx:         i,
      pc:          ins.pc,
      name:        ins.name,
      disasm:      disassemble(ins),
      ifCycle,
      stallBefore,
      flushAfter,
      stalledBy,
      isBranch:    !!ins.isBranch,
      isHalt:      !!ins.isHalt,
      isLoad:      !!ins.isLoad,
      speculative,
    });

    if (ins.isHalt) { haltedAt = i; break; }
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

/**
 * For a given row, return the stage label occupying `cycleIdx`, or null if
 * the row is idle at that cycle. Stage order with B=stallBefore bubbles:
 *   IF | ID | (B × STALL) | EX | MEM | WB
 * Cells before IF represent FLUSH slots if the preceding row was a taken
 * branch — caller handles that by looking at prev row's `flushAfter`.
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
