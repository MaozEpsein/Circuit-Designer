/**
 * LoopAnalyzer — detect induction-variable loops in a decoded instruction
 * stream (Phase 14: induction-variable loop analysis).
 *
 * A loop is any backward branch — an `isBranch` instruction whose target PC
 * is ≤ its own PC (and within the decoded stream). The body spans
 * [targetPc .. branchPc] inclusive. An induction register is any register
 * both read and written by the same body instruction in the `R = R op ?`
 * self-update shape (e.g. `ADDI R1, R1, 1`); this catches the classical
 * monotonic counter used to terminate the loop.
 *
 * Output shape:
 *   {
 *     id:        'loop#0x04',
 *     startPc:   0x04,              // loop header (branch target)
 *     endPc:     0x0C,              // branch instruction
 *     branchPc:  0x0C,              // alias of endPc
 *     bodyPcs:   [0x04, 0x06, ...], // PCs in body (inclusive, in order)
 *     inductionRegs: [1],           // registers with self-update in body
 *   }
 *
 * Scope note: the MVP does not follow branch targets inside the body or
 * handle nested loops specially — each backward branch becomes one loop,
 * and bodies can overlap. That's accurate enough for the demos we ship.
 */

export function detectLoops(instructions) {
  if (!Array.isArray(instructions) || instructions.length === 0) return [];
  const byPc = new Map(instructions.map(ins => [ins.pc, ins]));
  const pcs  = instructions.map(ins => ins.pc);
  const loops = [];

  for (const ins of instructions) {
    if (!ins.isBranch) continue;
    const target = ins.addr;
    if (target == null) continue;
    if (target > ins.pc) continue;              // forward branch — not a loop
    if (!byPc.has(target)) continue;            // target not in decoded stream

    const bodyPcs = pcs.filter(pc => pc >= target && pc <= ins.pc);
    if (bodyPcs.length === 0) continue;

    const inductionRegs = [];
    for (const pc of bodyPcs) {
      const b = byPc.get(pc);
      if (!b) continue;
      const writes = (b.writes || []).map(f => b[f]).filter(r => r !== 0);
      const reads  = (b.reads  || []).map(f => b[f]).filter(r => r !== 0);
      for (const w of writes) {
        if (reads.includes(w) && !inductionRegs.includes(w)) inductionRegs.push(w);
      }
    }

    loops.push({
      id:       `loop#0x${target.toString(16).toUpperCase()}`,
      startPc:  target,
      endPc:    ins.pc,
      branchPc: ins.pc,
      bodyPcs,
      inductionRegs,
    });
  }

  return loops;
}

/** Lookup: which loop (if any) contains the given PC. First match wins. */
export function loopContaining(loops, pc) {
  if (!Array.isArray(loops)) return null;
  for (const L of loops) if (L.bodyPcs.includes(pc)) return L;
  return null;
}
