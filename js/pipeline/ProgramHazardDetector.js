/**
 * ProgramHazardDetector — pair-wise hazard scan over a decoded instruction
 * stream. Reports the three classical register hazards and the load-use
 * sub-case between instructions that overlap in the pipeline window.
 *
 * Hazard types:
 *   RAW ("true dependency")        — i writes R, j reads  R. Stalls an
 *                                    in-order pipeline without forwarding.
 *                                    bubbles = W + (latencyI - 1) - k - 1.
 *                                    LOAD-USE: RAW where i is a LOAD and j is
 *                                    the immediately-following instruction —
 *                                    cannot be resolved by forwarding alone.
 *   WAR ("anti-dependency")        — i reads  R, j writes R. Safe in a
 *                                    strict in-order 5-stage; reported for
 *                                    OOO awareness; bubbles = 0.
 *   WAW ("output dependency")      — i writes R, j writes R. Safe in-order;
 *                                    reported for OOO awareness; bubbles = 0.
 *
 * Phase 14 extensions:
 *   - Multi-cycle producers: an opcode carrying `latency > 1` (e.g. IDIV,
 *     multi-cycle MUL) widens the RAW dependency window by latency-1 cycles
 *     for pairs where *i* is that producer.
 *   - Loop-aware tagging: when `opts.loops` is passed, each hazard gains
 *     `loopId` / `inLoop` when both ends sit in the same loop body, and a
 *     second pass emits cross-iteration steady-state hazards for wrap-around
 *     dependencies (tail-writes feeding head-reads on the next iteration).
 *
 * Conventions:
 *   - r0 is hard-wired zero; hazards involving r0 are suppressed.
 *   - HALT terminates the scan.
 *   - Unconditional JMP terminates the forward scan — but loop-aware analysis
 *     still runs over the full stream first so steady-state hazards survive.
 */
import { DEFAULT_ISA } from './isa/default.js';

const REGS = (instr, kind) => (instr[kind] || [])
  .map(f => instr[f])
  .filter(r => r !== 0);

function _latencyOf(isa, instr) {
  const meta = isa?.opcodes?.[instr.opcode];
  const L = meta?.latency;
  return (Number.isFinite(L) && L > 1) ? L : 1;
}

/**
 * @param {Array<DecodedInstr>} instructions — output of `decodeROM(...)`
 * @param {object} [isa=DEFAULT_ISA]
 * @param {{loops?: Array}} [opts]
 * @returns {Array<ProgramHazard>}
 */
export function detectProgramHazards(instructions, isa = DEFAULT_ISA, opts = {}) {
  if (!Array.isArray(instructions) || instructions.length === 0) return [];
  const W = isa.pipelineDepth || 5;
  const loops = Array.isArray(opts.loops) ? opts.loops : [];
  const hazards = [];

  const loopIdFor = (pcA, pcB) => {
    for (const L of loops) {
      if (L.bodyPcs.includes(pcA) && L.bodyPcs.includes(pcB)) return L.id;
    }
    return null;
  };

  for (let i = 0; i < instructions.length; i++) {
    const a = instructions[i];
    if (a.isHalt) break;

    const aReads  = REGS(a, 'reads');
    const aWrites = REGS(a, 'writes');
    const latA    = _latencyOf(isa, a);
    const effW    = W + (latA - 1);

    const lookahead = Math.min(effW - 1, instructions.length - i - 1);
    for (let k = 1; k <= lookahead; k++) {
      const b = instructions[i + k];
      if (b.isHalt) break;
      const bReads  = REGS(b, 'reads');
      const bWrites = REGS(b, 'writes');
      const loopId  = loopIdFor(a.pc, b.pc);

      for (const wReg of aWrites) {
        if (!bReads.includes(wReg)) continue;
        hazards.push({
          type:     'RAW',
          instI:    a.pc,    instJ:  b.pc,
          nameI:    a.name,  nameJ:  b.name,
          register: wReg,
          bubbles:  Math.max(0, effW - k - 1),
          loadUse:  a.isLoad && k === 1,
          latencyI: latA,
          loopId,
          inLoop:   !!loopId,
          steadyState: false,
        });
      }

      // WAR/WAW only reported inside the base 5-stage window — multi-cycle
      // latency doesn't create new anti/output hazards in strict in-order.
      if (k < W) {
        for (const rReg of aReads) {
          if (!bWrites.includes(rReg)) continue;
          hazards.push({
            type: 'WAR', instI: a.pc, instJ: b.pc,
            nameI: a.name, nameJ: b.name,
            register: rReg, bubbles: 0, loadUse: false,
            latencyI: latA, loopId, inLoop: !!loopId, steadyState: false,
          });
        }
        for (const wReg of aWrites) {
          if (!bWrites.includes(wReg)) continue;
          hazards.push({
            type: 'WAW', instI: a.pc, instJ: b.pc,
            nameI: a.name, nameJ: b.name,
            register: wReg, bubbles: 0, loadUse: false,
            latencyI: latA, loopId, inLoop: !!loopId, steadyState: false,
          });
        }
      }
    }

    if (a.isBranch && a.name === 'JMP') break;
  }

  // Cross-iteration (steady-state) pass — for each loop, treat the body as
  // cyclic and walk pairs that wrap around the back-edge within the window.
  for (const L of loops) {
    const body = L.bodyPcs.map(pc => instructions.find(ins => ins.pc === pc)).filter(Boolean);
    const N = body.length;
    if (N < 2) continue;
    for (let i = 0; i < N; i++) {
      const a = body[i];
      if (a.isHalt) continue;
      const aWrites = REGS(a, 'writes');
      if (aWrites.length === 0) continue;
      const latA = _latencyOf(isa, a);
      const effW = W + (latA - 1);
      // wrap-around successors: j = i+1, i+2, ... mod N, but only those that
      // actually cross the back-edge (original index > original tail).
      for (let k = 1; k < effW && k < N; k++) {
        const j = (i + k) % N;
        if (j > i) continue;                  // same-iteration pair (already emitted)
        const b = body[j];
        const bReads = REGS(b, 'reads');
        for (const wReg of aWrites) {
          if (!bReads.includes(wReg)) continue;
          hazards.push({
            type:     'RAW',
            instI:    a.pc, instJ: b.pc,
            nameI:    a.name, nameJ: b.name,
            register: wReg,
            bubbles:  Math.max(0, effW - k - 1),
            loadUse:  a.isLoad && k === 1,
            latencyI: latA,
            loopId:   L.id,
            inLoop:   true,
            steadyState: true,
          });
        }
      }
    }
  }

  return hazards;
}
