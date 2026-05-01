/**
 * BranchPredictor — pluggable predictor models for the pipeline visualizer.
 *
 * Each predictor maintains per-PC state (or none, for static schemes) and
 * exposes the same interface:
 *
 *   predictor.predict(pc, fallbackTarget)
 *     → { taken: bool, target: number|null, stateLabel: string }
 *
 *   predictor.update(pc, actualTaken, actualTarget)
 *     → { wasHit: bool, stateBefore: string, stateAfter: string }
 *
 *   predictor.getEntries()
 *     → [{ pc, stateLabel, lastPred, lastActual, hit, hits, total }]
 *
 * Phase 1 scope: pure logic + state. No scheduler integration yet.
 */

const STATE_LABELS_2BIT = ['Strongly NT', 'Weakly NT', 'Weakly T', 'Strongly T'];

class _PredictorBase {
  constructor() {
    this._entries = new Map();   // pc → { stateLabel, lastPred, lastActual, hit, hits, total }
  }
  _entryFor(pc) {
    let e = this._entries.get(pc);
    if (!e) {
      e = { pc, stateLabel: '—', lastPred: null, lastActual: null, hit: null, hits: 0, total: 0 };
      this._entries.set(pc, e);
    }
    return e;
  }
  getEntries() { return Array.from(this._entries.values()).sort((a, b) => a.pc - b.pc); }
  reset()      { this._entries.clear(); }
}

/** Static: always predict not-taken. Matches today's baseline behaviour. */
export class StaticNotTaken extends _PredictorBase {
  static get id()   { return 'static-nt'; }
  static get name() { return 'Static Not-Taken'; }
  predict(pc /*, fallbackTarget*/) {
    const e = this._entryFor(pc);
    e.stateLabel = 'NT (fixed)';
    return { taken: false, target: null, stateLabel: e.stateLabel };
  }
  update(pc, actualTaken /*, actualTarget*/) {
    const e = this._entryFor(pc);
    const before = e.stateLabel;
    e.lastPred   = false;
    e.lastActual = actualTaken;
    e.hit        = !actualTaken;
    if (e.hit) e.hits++;
    e.total++;
    return { wasHit: e.hit, stateBefore: before, stateAfter: e.stateLabel };
  }
}

/** Static BTFN: backward branches predicted taken, forward not-taken. */
export class StaticBTFN extends _PredictorBase {
  static get id()   { return 'static-btfn'; }
  static get name() { return 'Static BTFN (backward-taken / forward-not-taken)'; }
  predict(pc, fallbackTarget) {
    const isBackward = (typeof fallbackTarget === 'number') && fallbackTarget <= pc;
    const taken = isBackward;
    const e = this._entryFor(pc);
    e.stateLabel = isBackward ? 'T (backward)' : 'NT (forward)';
    return { taken, target: isBackward ? fallbackTarget : null, stateLabel: e.stateLabel };
  }
  update(pc, actualTaken, actualTarget) {
    const e = this._entryFor(pc);
    const before = e.stateLabel;
    const isBackward = (typeof actualTarget === 'number') && actualTarget <= pc;
    e.lastPred   = isBackward;
    e.lastActual = actualTaken;
    e.hit        = (e.lastPred === actualTaken);
    if (e.hit) e.hits++;
    e.total++;
    return { wasHit: e.hit, stateBefore: before, stateAfter: e.stateLabel };
  }
}

/** 1-bit predictor: remember last outcome per PC. */
export class OneBit extends _PredictorBase {
  static get id()   { return '1bit'; }
  static get name() { return '1-bit (last-outcome)'; }
  constructor() { super(); this._bit = new Map(); }   // pc → bool
  reset()       { super.reset(); this._bit.clear(); }
  predict(pc /*, fallbackTarget*/) {
    const taken = this._bit.get(pc) ?? false;
    const e = this._entryFor(pc);
    e.stateLabel = taken ? 'T' : 'NT';
    return { taken, target: null, stateLabel: e.stateLabel };
  }
  update(pc, actualTaken /*, actualTarget*/) {
    const e = this._entryFor(pc);
    const before = e.stateLabel;
    const predicted = this._bit.get(pc) ?? false;
    e.lastPred   = predicted;
    e.lastActual = actualTaken;
    e.hit        = (predicted === actualTaken);
    if (e.hit) e.hits++;
    e.total++;
    this._bit.set(pc, actualTaken);
    e.stateLabel = actualTaken ? 'T' : 'NT';
    return { wasHit: e.hit, stateBefore: before, stateAfter: e.stateLabel };
  }
}

/** 2-bit saturating counter: classical four-state FSM. */
export class TwoBitSaturating extends _PredictorBase {
  static get id()   { return '2bit'; }
  static get name() { return '2-bit saturating counter'; }
  constructor() { super(); this._cnt = new Map(); }   // pc → 0..3
  reset()       { super.reset(); this._cnt.clear(); }
  predict(pc /*, fallbackTarget*/) {
    const c = this._cnt.get(pc) ?? 1;   // start in Weakly NT
    const taken = c >= 2;
    const e = this._entryFor(pc);
    e.stateLabel = STATE_LABELS_2BIT[c];
    return { taken, target: null, stateLabel: e.stateLabel };
  }
  update(pc, actualTaken /*, actualTarget*/) {
    const e = this._entryFor(pc);
    const before = e.stateLabel;
    let c = this._cnt.get(pc) ?? 1;
    const predicted = c >= 2;
    e.lastPred   = predicted;
    e.lastActual = actualTaken;
    e.hit        = (predicted === actualTaken);
    if (e.hit) e.hits++;
    e.total++;
    c = actualTaken ? Math.min(3, c + 1) : Math.max(0, c - 1);
    this._cnt.set(pc, c);
    e.stateLabel = STATE_LABELS_2BIT[c];
    return { wasHit: e.hit, stateBefore: before, stateAfter: e.stateLabel };
  }
}

export const PREDICTORS = [StaticNotTaken, StaticBTFN, OneBit, TwoBitSaturating];

export function predictorById(id) {
  return PREDICTORS.find(P => P.id === id) || StaticNotTaken;
}

/**
 * Synthesize a deterministic outcome trace from the static schedule + loop
 * analysis. We don't have live PC traces in Phase 1, so:
 *   - Each loop's back-edge conditional is taken (LOOP_ITERS-1) times, then
 *     not-taken once (loop exit).
 *   - Unconditional JMP (in or out of loops) is always taken.
 *   - Conditional branches not part of any loop are walked once as not-taken
 *     (matches the static-NT fallback the scheduler currently assumes).
 *
 * Outcome shape: [{ pc, name, taken, target }]. Target is the producer's
 * jump target (PC after the branch for fall-through, or the loop head).
 */
const LOOP_ITERS = 4;

export function synthesizeOutcomes(instructions, loops) {
  if (!Array.isArray(instructions) || instructions.length === 0) return [];

  const byPc = new Map(instructions.map(ins => [ins.pc, ins]));
  const loopByTailPc = new Map();
  for (const L of (loops || [])) {
    const tailPc = L.bodyPcs[L.bodyPcs.length - 1];
    const headPc = L.bodyPcs[0];
    loopByTailPc.set(tailPc, headPc);
  }

  const out = [];
  for (const ins of instructions) {
    if (!ins.isBranch) continue;
    if (ins.name === 'JMP') {
      out.push({ pc: ins.pc, name: ins.name, taken: true, target: ins.target ?? null });
      continue;
    }
    // Conditional (BEQ/BNE) — back-edge of a loop?
    const headPc = loopByTailPc.get(ins.pc);
    if (headPc !== undefined) {
      for (let i = 0; i < LOOP_ITERS - 1; i++) {
        out.push({ pc: ins.pc, name: ins.name, taken: true, target: headPc });
      }
      out.push({ pc: ins.pc, name: ins.name, taken: false, target: headPc });
    } else {
      // Non-loop conditional — walk once as not-taken.
      out.push({ pc: ins.pc, name: ins.name, taken: false, target: ins.target ?? null });
    }
  }
  return out;
}

/**
 * Drive a predictor through a synthesized outcome trace. Returns:
 *   { entries: [...], totalBranches, totalHits, hitRate }
 */
export function runPredictorTrace(predictor, outcomes) {
  predictor.reset();
  for (const o of outcomes) {
    predictor.predict(o.pc, o.target);
    predictor.update(o.pc, o.taken, o.target);
  }
  const entries = predictor.getEntries();
  let totalHits = 0, totalBranches = 0;
  for (const e of entries) { totalHits += e.hits; totalBranches += e.total; }
  return {
    entries,
    totalBranches,
    totalHits,
    hitRate: totalBranches > 0 ? (totalHits / totalBranches) : 0,
  };
}
