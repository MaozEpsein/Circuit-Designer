/**
 * ProgramHazardDetector — pair-wise hazard scan over a decoded instruction
 * stream. Reports the three classical register hazards and the load-use
 * sub-case between instructions that overlap in the pipeline window.
 *
 * Hazard types:
 *   RAW ("true dependency")        — i writes R, j reads  R. Stalls an
 *                                    in-order pipeline without forwarding.
 *                                    bubbles = W - (j - i) - 1.
 *                                    LOAD-USE: RAW where i is a LOAD and j is
 *                                    the immediately-following instruction —
 *                                    cannot be resolved by forwarding alone.
 *   WAR ("anti-dependency")        — i reads  R, j writes R. Safe in a
 *                                    strict in-order 5-stage (writes happen
 *                                    at WB, reads at ID, so j's write cannot
 *                                    precede i's read). Reported for OOO
 *                                    awareness; bubbles = 0.
 *   WAW ("output dependency")      — i writes R, j writes R. Same story:
 *                                    safe in in-order but reported for OOO
 *                                    awareness; bubbles = 0.
 *
 * Conventions:
 *   - r0 is hard-wired zero; hazards involving r0 are suppressed.
 *   - HALT terminates the scan; unconditional JMP also terminates (the Easy
 *     MVP doesn't yet follow branch targets — Phase 9.5 Medium will).
 *   - At most one hazard per ordered pair (i, j) per (type, register).
 */
import { DEFAULT_ISA } from './isa/default.js';

/**
 * @param {Array<DecodedInstr>} instructions — output of `decodeROM(...)`
 * @param {object} [isa=DEFAULT_ISA]
 * @returns {Array<ProgramHazard>}
 */
export function detectProgramHazards(instructions, isa = DEFAULT_ISA) {
  if (!Array.isArray(instructions) || instructions.length === 0) return [];
  const W = isa.pipelineDepth || 5;
  const hazards = [];

  const regs = (instr, kind) => (instr[kind] || [])
    .map(f => instr[f])
    .filter(r => r !== 0);       // drop r0 (hard-wired zero)

  for (let i = 0; i < instructions.length; i++) {
    const a = instructions[i];
    if (a.isHalt) break;

    const aReads  = regs(a, 'reads');
    const aWrites = regs(a, 'writes');

    const lookahead = Math.min(W - 1, instructions.length - i - 1);
    for (let k = 1; k <= lookahead; k++) {
      const b = instructions[i + k];
      if (b.isHalt) break;
      const bReads  = regs(b, 'reads');
      const bWrites = regs(b, 'writes');

      // RAW — a writes, b reads the same register.
      for (const wReg of aWrites) {
        if (!bReads.includes(wReg)) continue;
        hazards.push({
          type:     'RAW',
          instI:    a.pc,    instJ:  b.pc,
          nameI:    a.name,  nameJ:  b.name,
          register: wReg,
          bubbles:  Math.max(0, W - k - 1),
          loadUse:  a.isLoad && k === 1,
        });
      }

      // WAR — a reads, b writes the same register.
      for (const rReg of aReads) {
        if (!bWrites.includes(rReg)) continue;
        hazards.push({
          type:     'WAR',
          instI:    a.pc,    instJ:  b.pc,
          nameI:    a.name,  nameJ:  b.name,
          register: rReg,
          bubbles:  0,
          loadUse:  false,
        });
      }

      // WAW — a writes, b writes the same register.
      for (const wReg of aWrites) {
        if (!bWrites.includes(wReg)) continue;
        hazards.push({
          type:     'WAW',
          instI:    a.pc,    instJ:  b.pc,
          nameI:    a.name,  nameJ:  b.name,
          register: wReg,
          bubbles:  0,
          loadUse:  false,
        });
      }
    }

    // Stop scanning past an unconditional branch — the pipeline model doesn't
    // know what executes after it without a taken/not-taken analysis (Medium).
    if (a.isBranch && a.name === 'JMP') break;
  }

  return hazards;
}
