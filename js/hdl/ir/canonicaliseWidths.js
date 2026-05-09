// canonicaliseWidths — unify expression widths across an IRModule so
// that two structurally-identical IRs (one from fromCircuit, one from
// elaborate) compare equal regardless of which path produced them.
//
// Rules applied in order:
//   1. Slice widths normalised to (hi - lo + 1).
//   2. Every Concat re-derives its width from `parts.reduce(+ width)`.
//   3. Replicate width = count * inner.width.
//   4. ZeroExtend / SignExtend canonicalised to a strict superset of
//      the inner width — if `inner.width >= width`, drop the wrapper.
//   5. Width-mismatched assigns trigger a `widthMismatch` diagnostic
//      (returned in the result; the IR is not modified to hide it).
//
// Doesn't change semantics — purely a cosmetic unification so the
// equality check downstream isn't fooled by trivial differences in
// how two paths chose to compute the same width.

import { IR_KIND } from './types.js';

export function canonicaliseWidths(ir, opts = {}) {
  const diagnostics = [];
  const moduleSeen = new Set();

  function visitExpr(e, contextWidth) {
    if (!e || typeof e !== 'object') return;
    switch (e.kind) {
      case IR_KIND.Slice:
        e.width = (e.hi - e.lo + 1);
        break;
      case IR_KIND.Concat:
        for (const p of (e.parts || [])) visitExpr(p, null);
        e.width = (e.parts || []).reduce((w, p) => w + (p.width | 0), 0);
        break;
      case IR_KIND.Replicate:
        visitExpr(e.inner, null);
        e.width = (e.count | 0) * (e.inner?.width | 0);
        break;
      case IR_KIND.ZeroExtend:
      case IR_KIND.SignExtend:
        visitExpr(e.inner, null);
        if ((e.inner?.width | 0) >= (e.width | 0)) {
          // Wrapper is redundant — copy inner over the extender. Keep
          // kind so callers can still detect "had an extension"; only
          // align width.
          e.width = e.inner.width;
        }
        break;
      case IR_KIND.BinaryOp:
        visitExpr(e.left, null);
        visitExpr(e.right, null);
        // Result width = max(operands) for arithmetic/bitwise; 1 for
        // comparison/boolean (already set at lowering time, but
        // re-derive to be safe).
        if (['==','!=','===','!==','<','<=','>','>=','&&','||'].includes(e.op)) e.width = 1;
        else e.width = Math.max(e.left.width | 0, e.right.width | 0, 1);
        break;
      case IR_KIND.UnaryOp:
        visitExpr(e.operand, null);
        if (['!'].includes(e.op)) e.width = 1;
        else e.width = e.operand?.width | 0 || 1;
        break;
      case IR_KIND.Ternary:
        visitExpr(e.cond, null);
        visitExpr(e.then, null);
        visitExpr(e.else, null);
        e.width = Math.max(e.then?.width | 0, e.else?.width | 0, 1);
        break;
      case IR_KIND.Index:
        visitExpr(e.indexExpr, null);
        break;
    }
    if (contextWidth !== null && contextWidth !== undefined && (e.width | 0) !== contextWidth) {
      diagnostics.push({
        kind: 'widthMismatch',
        sourceRef: e.sourceRef || null,
        message: `expression width ${e.width} doesn't match context width ${contextWidth}`,
      });
    }
  }
  function visitStmt(s) {
    if (!s) return;
    if (s.kind === 'BlockingAssign' || s.kind === 'NonBlockingAssign') {
      visitExpr(s.lhs, null);
      visitExpr(s.rhs, s.lhs?.width);
    } else if (s.kind === 'IfStmt') {
      visitExpr(s.cond, null);
      (s.then || []).forEach(visitStmt);
      (s.else || []).forEach(visitStmt);
    } else if (s.kind === 'CaseStmt') {
      visitExpr(s.selector, null);
      for (const arm of (s.cases || [])) {
        visitExpr(arm.label, null);
        (arm.body || []).forEach(visitStmt);
      }
      (s.default || []).forEach(visitStmt);
    }
  }
  function visitModule(m) {
    if (moduleSeen.has(m)) return;     // guard against accidental cycles
    moduleSeen.add(m);
    for (const a of (m.assigns || [])) {
      visitExpr(a.lhs, null);
      visitExpr(a.rhs, a.lhs?.width);
    }
    for (const blk of (m.alwaysBlocks || [])) {
      for (const s of (blk.body || [])) visitStmt(s);
    }
    for (const inst of (m.instances || [])) {
      for (const k of Object.keys(inst.portMap || {})) visitExpr(inst.portMap[k], null);
    }
    for (const sm of (m.submodules || [])) visitModule(sm);
  }
  visitModule(ir);
  if (opts.throwOnMismatch && diagnostics.length > 0) {
    const d = diagnostics[0];
    const where = d.sourceRef
      ? ` at ${d.sourceRef.line ?? '?'}:${d.sourceRef.col ?? '?'}`
      : '';
    throw new Error(`canonicaliseWidths${where}: ${d.message}`);
  }
  return { ir, diagnostics };
}
