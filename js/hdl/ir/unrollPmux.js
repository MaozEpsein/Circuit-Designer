// unrollPmux — convert a multi-arm `case (sel) … endcase` IR statement
// into a chain of nested `IfStmt`s (a binary mux tree). The motivation
// is that Yosys lowers any case with parallel mutually-exclusive arms
// to a `$pmux` cell; our hand-written elaborator surfaces the same
// shape as a flat `CaseStmt`. Re-shaping CaseStmt into nested If-Else
// gives both paths a canonical form for IR equality.
//
// Behaviour:
//   case (sel)               if (sel == L0) <body0>
//     L0: <body0>      ─→    else if (sel == L1) <body1>
//     L1: <body1>            ...
//     default: <bd>          else <bd>
//   endcase
//
// Notes:
//   • Only top-level CaseStmt nodes are rewritten; CaseStmts nested
//     inside an IfStmt's then/else are visited recursively.
//   • The selector is hoisted into a synthetic Ref reused across all
//     comparisons — no expression duplication unless the selector is
//     a Ref or Slice (already cheap to share by name).

import { IR_KIND } from './types.js';
import { makeBinaryOp } from './types.js';

function _eq(selector, label, sourceRef) {
  return makeBinaryOp('==', selector, label, 1, sourceRef);
}

function rewriteStmt(s) {
  if (!s) return s;
  if (s.kind === 'IfStmt') {
    return { ...s,
      then: (s.then || []).map(rewriteStmt),
      else: (s.else || []).map(rewriteStmt),
    };
  }
  if (s.kind === 'CaseStmt') {
    const arms = s.cases || [];
    const def  = s.default || [];
    // Build right-to-left so the first arm sits at the outermost If.
    let chain = def;
    for (let i = arms.length - 1; i >= 0; i--) {
      const arm = arms[i];
      const cond = _eq(s.selector, arm.label, s.sourceRef);
      const thenStmts = (arm.body || []).map(rewriteStmt);
      const elseStmts = chain;
      chain = [{
        kind: 'IfStmt', sourceRef: s.sourceRef || null,
        cond, then: thenStmts, else: elseStmts.length ? elseStmts : null,
      }];
    }
    // If there were no arms at all, just emit the default body.
    return chain.length === 1 ? chain[0] : (chain[0] || null);
  }
  return s;
}

function rewriteAlways(blk) {
  return { ...blk, body: (blk.body || []).map(rewriteStmt) };
}

export function unrollPmux(ir) {
  if (!ir) return ir;
  const out = { ...ir,
    alwaysBlocks: (ir.alwaysBlocks || []).map(rewriteAlways),
    submodules:   (ir.submodules || []).map(unrollPmux),
  };
  return out;
}
