// Width-changing translators: SIGN_EXT and BUS_MUX (multi-bit MUX).
//
// SIGN_EXT — `assign out = { {(N-W){in[W-1]}}, in };` using the existing
//            ZeroExtend / SignExtend IR nodes (toVerilog already knows
//            how to render them as Verilog concat-replicate constructs).
// BUS_MUX  — same nested-ternary pattern as MUX, but data lines and Y
//            are multi-bit. The translator pulls width from the source
//            nets so any bus width works.

import { COMPONENT_TYPES } from '../../components/Component.js';
import { registerTranslator } from './index.js';
import {
  makeRef, makeLiteral, makeBinaryOp, makeTernary, makeSignExtend,
} from '../ir/types.js';
import { SourceRef } from '../core/SourceRef.js';

function _outNet(ctx, nodeId, outIdx) {
  return ctx.netByEndpoint.get(`${nodeId}:${outIdx}`) || null;
}

// ── SIGN_EXT ─────────────────────────────────────────────────
// One input (IN, width = inBits), one output (width = outBits).
// IR's makeSignExtend wraps a sub-expression and toVerilog emits the
// canonical `{ {pad{inner[W-1]}}, inner }` form, so the translator
// just needs to construct the right SignExtend node.
registerTranslator(COMPONENT_TYPES.SIGN_EXT, (node, ctx) => {
  const inNet  = ctx.inputNet(node.id, 0);
  if (!inNet) return {};
  const outNet = _outNet(ctx, node.id, 0);
  if (!outNet) return {};

  const inBits  = node.inBits  || inNet.width || 4;
  const outBits = node.outBits || outNet.width || 8;
  const sr = SourceRef.fromNode(node.id);

  // Inner Ref carries the input width — SignExtend uses it to compute
  // the replicate count internally.
  const inner = makeRef(inNet.name, inBits);
  const ext   = (outBits > inBits)
    ? makeSignExtend(inner, outBits, sr)
    : inner;     // width-equal: no extension needed; toVerilog drops it

  return {
    assigns: [{
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(outNet.name, outBits),
      rhs: ext,
    }],
  };
});

// ── BUS_MUX ──────────────────────────────────────────────────
// N data inputs (multi-bit) at indices 0..N-1, SEL at index N, output
// Y. Emits a nested-ternary chain just like MUX but with the data
// width preserved on each branch.
registerTranslator(COMPONENT_TYPES.BUS_MUX, (node, ctx) => {
  const n = node.inputCount || 2;
  const sr = SourceRef.fromNode(node.id);

  const dataNets = [];
  for (let i = 0; i < n; i++) dataNets.push(ctx.inputNet(node.id, i));
  const selNet = ctx.inputNet(node.id, n);
  if (dataNets.some(d => !d) || !selNet) return {};

  const yNet = _outNet(ctx, node.id, 0);
  if (!yNet) return {};

  const dataWidth = yNet.width || dataNets[0].width || 1;
  const selWidth  = selNet.width || Math.max(1, Math.ceil(Math.log2(n)));

  const ref     = (net, w) => makeRef(net.name, w ?? net.width ?? 1);
  const selRef  = makeRef(selNet.name, selWidth);

  // 2:1 fast path: clean ternary, no equality compare.
  let rhs;
  if (n === 2) {
    rhs = makeTernary(selRef,
      ref(dataNets[1], dataWidth),
      ref(dataNets[0], dataWidth),
      dataWidth, sr);
  } else {
    rhs = ref(dataNets[n - 1], dataWidth);
    for (let k = n - 2; k >= 0; k--) {
      const cond = makeBinaryOp('==', selRef, makeLiteral(k, selWidth, sr), 1, sr);
      rhs = makeTernary(cond, ref(dataNets[k], dataWidth), rhs, dataWidth, sr);
    }
  }

  return {
    assigns: [{
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: ref(yNet, dataWidth),
      rhs,
    }],
  };
});
