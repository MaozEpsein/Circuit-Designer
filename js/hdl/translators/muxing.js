// MUX translator. N:1 multiplexer, where N can be any power of 2 (or
// not — the engine just picks data[sel] mod inputCount).
//
// Pin layout (mirroring SimulationEngine):
//   inputs 0..N-1: data lines D0..D(N-1)
//   inputs N..N+S-1: select bits, LSB first (S = ceil(log2(N)))
//   output 0: Y
//
// Verilog form: nested ternary chain. For 2:1:
//   assign y = sel ? d1 : d0;
// For 4:1:
//   assign y = (sel == 2'd0) ? d0
//            : (sel == 2'd1) ? d1
//            : (sel == 2'd2) ? d2
//            : d3;
//
// Future substep: emit `case` blocks via IRAlways for wider muxes,
// matching the README plan's preferred form. For now nested ternaries
// are tidy, synthesisable, and round-trip fine through Yosys.

import { COMPONENT_TYPES } from '../../components/Component.js';
import { registerTranslator } from './index.js';
import {
  makeRef, makeLiteral, makeBinaryOp, makeConcat, makeTernary,
} from '../ir/types.js';
import { SourceRef } from '../core/SourceRef.js';

function _outNet(ctx, nodeId, outIdx) {
  return ctx.netByEndpoint.get(`${nodeId}:${outIdx}`) || null;
}

registerTranslator(COMPONENT_TYPES.MUX, (node, ctx) => {
  const n = node.inputCount || 2;
  const sBits = Math.max(1, Math.ceil(Math.log2(n)));
  const sr = SourceRef.fromNode(node.id);

  // Resolve N data nets and S select nets.
  const dataNets = [];
  for (let i = 0; i < n; i++) dataNets.push(ctx.inputNet(node.id, i));
  const selNets = [];
  for (let i = 0; i < sBits; i++) selNets.push(ctx.inputNet(node.id, n + i));
  if (dataNets.some(d => !d) || selNets.some(s => !s)) return {};

  const yNet = _outNet(ctx, node.id, 0);
  if (!yNet) return {};

  const ref = (net) => makeRef(net.name, net.width || 1);

  // Build the select expression. For S>1, concatenate select bits in
  // MSB-first order (Verilog concat is MSB-first): {sel[S-1], ..., sel[0]}.
  let selExpr;
  if (sBits === 1) {
    selExpr = ref(selNets[0]);
  } else {
    // Reverse to MSB-first for the concat.
    const parts = [...selNets].reverse().map(ref);
    selExpr = makeConcat(parts, sr);
  }

  // For 2:1 the cleanest form is `assign y = sel ? d1 : d0;` — single
  // ternary, no equality compare. Keep that path for the common case.
  let rhs;
  if (n === 2 && sBits === 1) {
    rhs = makeTernary(selExpr, ref(dataNets[1]), ref(dataNets[0]), yNet.width || 1, sr);
  } else {
    // Right-fold ternary chain: idx 0 is the deepest "else" branch, then
    // each successive index becomes the new outer ternary. Default
    // (when sel >= n-1) falls through to the last data input.
    rhs = ref(dataNets[n - 1]);
    for (let k = n - 2; k >= 0; k--) {
      const cond = makeBinaryOp('==', selExpr, makeLiteral(k, sBits, sr), 1, sr);
      rhs = makeTernary(cond, ref(dataNets[k]), rhs, yNet.width || 1, sr);
    }
  }

  return {
    assigns: [{
      kind: 'Assign',
      sourceRef: sr,
      attributes: [],
      lhs: ref(yNet),
      rhs,
    }],
  };
});
