// Arithmetic translators — Half Adder, Full Adder, Comparator.
//
// Lowered to continuous-assignment form. No primitive Verilog gate
// matches them 1:1, so each output pin gets its own `assign`.
//
// Pin layouts (mirroring SimulationEngine):
//   HALF_ADDER: in[A=0, B=1] → out[Sum=0, Carry=1]
//   FULL_ADDER: in[A=0, B=1, Cin=2] → out[Sum=0, Cout=1]
//   COMPARATOR: in[A=0, B=1] → out[EQ=0, GT=1, LT=2]
//
// All operate at the bit width of their input source nets (engine treats
// scalar values, but Verilog `>`/`<` on multi-bit nets gives unsigned
// magnitude compare which matches the engine's behaviour).

import { COMPONENT_TYPES } from '../../components/Component.js';
import { registerTranslator } from './index.js';
import { makeRef, makeBinaryOp, IR_KIND } from '../ir/types.js';
import { SourceRef } from '../core/SourceRef.js';

function _assign(lhsRef, rhsExpr, sourceRef) {
  return {
    kind: 'Assign',
    sourceRef: sourceRef ?? SourceRef.unknown(),
    attributes: [],
    lhs: lhsRef,
    rhs: rhsExpr,
  };
}

// Resolve outputs by source endpoint. Multi-output components have a
// distinct net per (nodeId, outputIndex) tuple — we read each via
// netByEndpoint. Returns `null` when the output pin is unconnected.
function _outNet(ctx, nodeId, outIdx) {
  return ctx.netByEndpoint.get(`${nodeId}:${outIdx}`) || null;
}

// ── HALF_ADDER ───────────────────────────────────────────────
registerTranslator(COMPONENT_TYPES.HALF_ADDER, (node, ctx) => {
  const a = ctx.inputNet(node.id, 0);
  const b = ctx.inputNet(node.id, 1);
  if (!a || !b) return {};
  const sumNet   = _outNet(ctx, node.id, 0);
  const carryNet = _outNet(ctx, node.id, 1);
  const ref      = (n) => makeRef(n.name, n.width || 1);
  const out = [];
  if (sumNet) {
    out.push(_assign(ref(sumNet),
      makeBinaryOp('^', ref(a), ref(b), 1, SourceRef.fromNode(node.id)),
      SourceRef.fromNode(node.id)));
  }
  if (carryNet) {
    out.push(_assign(ref(carryNet),
      makeBinaryOp('&', ref(a), ref(b), 1, SourceRef.fromNode(node.id)),
      SourceRef.fromNode(node.id)));
  }
  return { assigns: out };
});

// ── FULL_ADDER ───────────────────────────────────────────────
registerTranslator(COMPONENT_TYPES.FULL_ADDER, (node, ctx) => {
  const a   = ctx.inputNet(node.id, 0);
  const b   = ctx.inputNet(node.id, 1);
  const cin = ctx.inputNet(node.id, 2);
  if (!a || !b || !cin) return {};
  const sumNet  = _outNet(ctx, node.id, 0);
  const coutNet = _outNet(ctx, node.id, 1);
  const ref     = (n) => makeRef(n.name, n.width || 1);
  const sr      = SourceRef.fromNode(node.id);
  const out     = [];
  if (sumNet) {
    // sum = a ^ b ^ cin
    const xor1 = makeBinaryOp('^', ref(a), ref(b), 1, sr);
    const sum  = makeBinaryOp('^', xor1, ref(cin), 1, sr);
    out.push(_assign(ref(sumNet), sum, sr));
  }
  if (coutNet) {
    // cout = (a & b) | (b & cin) | (a & cin)
    const ab = makeBinaryOp('&', ref(a), ref(b),   1, sr);
    const bc = makeBinaryOp('&', ref(b), ref(cin), 1, sr);
    const ac = makeBinaryOp('&', ref(a), ref(cin), 1, sr);
    const ab_or_bc   = makeBinaryOp('|', ab, bc, 1, sr);
    const cout       = makeBinaryOp('|', ab_or_bc, ac, 1, sr);
    out.push(_assign(ref(coutNet), cout, sr));
  }
  return { assigns: out };
});

// ── COMPARATOR ───────────────────────────────────────────────
registerTranslator(COMPONENT_TYPES.COMPARATOR, (node, ctx) => {
  const a = ctx.inputNet(node.id, 0);
  const b = ctx.inputNet(node.id, 1);
  if (!a || !b) return {};
  const eqNet = _outNet(ctx, node.id, 0);
  const gtNet = _outNet(ctx, node.id, 1);
  const ltNet = _outNet(ctx, node.id, 2);
  const ref   = (n) => makeRef(n.name, n.width || 1);
  const sr    = SourceRef.fromNode(node.id);
  const out   = [];
  if (eqNet) out.push(_assign(ref(eqNet), makeBinaryOp('==', ref(a), ref(b), 1, sr), sr));
  if (gtNet) out.push(_assign(ref(gtNet), makeBinaryOp('>',  ref(a), ref(b), 1, sr), sr));
  if (ltNet) out.push(_assign(ref(ltNet), makeBinaryOp('<',  ref(a), ref(b), 1, sr), sr));
  return { assigns: out };
});
