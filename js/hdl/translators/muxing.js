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

// Build a select expression from a list of select-bit nets.
// Single bit: a Ref. Multi-bit: a {msb, ..., lsb} Concat (Verilog
// concat is MSB-first, the engine's selInputs[0] is LSB).
function _selExpr(selNets, sr) {
  if (selNets.length === 1) return makeRef(selNets[0].name, selNets[0].width || 1);
  const parts = [...selNets].reverse().map(n => makeRef(n.name, n.width || 1));
  return makeConcat(parts, sr);
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

  // Build the select expression — shared with DEMUX / DECODER.
  const selExpr = _selExpr(selNets, sr);

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

// ── DEMUX ─────────────────────────────────────────────────────
// Pin layout: input 0 = data, inputs 1..S = select bits (LSB first),
// outputs 0..N-1 = one-hot routed-data lines. Each output is either
// `data` (when sel matches its index) or `1'b0` (otherwise). N is
// `outputCount`; S = ceil(log2(N)).
registerTranslator(COMPONENT_TYPES.DEMUX, (node, ctx) => {
  const n = node.outputCount || 2;
  const sBits = Math.max(1, Math.ceil(Math.log2(n)));
  const sr = SourceRef.fromNode(node.id);

  const dataNet = ctx.inputNet(node.id, 0);
  if (!dataNet) return {};
  const selNets = [];
  for (let i = 0; i < sBits; i++) selNets.push(ctx.inputNet(node.id, 1 + i));
  if (selNets.some(s => !s)) return {};

  const ref = (net) => makeRef(net.name, net.width || 1);
  const dataExpr = ref(dataNet);
  const zero = makeLiteral(0, dataNet.width || 1, sr);

  const selExpr = _selExpr(selNets, sr);

  const out = [];
  for (let o = 0; o < n; o++) {
    const oNet = _outNet(ctx, node.id, o);
    if (!oNet) continue;
    const cond = (sBits === 1 && n === 2)
      ? (o === 1 ? selExpr : makeBinaryOp('==', selExpr, makeLiteral(0, 1, sr), 1, sr))
      : makeBinaryOp('==', selExpr, makeLiteral(o, sBits, sr), 1, sr);
    const rhs = makeTernary(cond, dataExpr, zero, oNet.width || 1, sr);
    out.push({ kind: 'Assign', sourceRef: sr, attributes: [], lhs: ref(oNet), rhs });
  }
  return { assigns: out };
});

// ── DECODER ───────────────────────────────────────────────────
// Pin layout: inputs 0..N-1 = address bits (LSB first), outputs 0..2^N-1
// one-hot. `out_k = (addr == k)`. N is `inputBits`.
registerTranslator(COMPONENT_TYPES.DECODER, (node, ctx) => {
  const n = node.inputBits || 2;
  const outCount = 1 << n;
  const sr = SourceRef.fromNode(node.id);

  const addrNets = [];
  for (let i = 0; i < n; i++) addrNets.push(ctx.inputNet(node.id, i));
  if (addrNets.some(a => !a)) return {};

  const ref = (net) => makeRef(net.name, net.width || 1);
  const addrExpr = _selExpr(addrNets, sr);

  const out = [];
  for (let k = 0; k < outCount; k++) {
    const oNet = _outNet(ctx, node.id, k);
    if (!oNet) continue;
    const cond = makeBinaryOp('==', addrExpr, makeLiteral(k, n, sr), 1, sr);
    out.push({
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: ref(oNet),
      // Verilog '==' returns 1 bit, suitable for a 1-bit one-hot output.
      rhs: cond,
    });
  }
  return { assigns: out };
});

// ── ENCODER (priority) ────────────────────────────────────────
// Pin layout: inputs 0..N-1 = data lines, outputs 0..B-1 = encoded
// address bits (LSB first), where B = ceil(log2(N)). Highest active
// input wins (priority encoder, matches the engine).
//
// Each output bit b is the OR of (in[i] AND not-higher-input-active
// AND bit-b-of-i). Expressed as a nested ternary for clarity:
//   out_b = in[N-1] ? bit_b(N-1)
//         : in[N-2] ? bit_b(N-2)
//         : ...
//         : 1'b0
// We do NOT emit the `__valid` engine-internal signal — the engine
// uses it for downstream consumers, but it has no canonical Verilog
// surface in our pin model. Adding a VLD output port would require
// extending the canvas component first.
registerTranslator(COMPONENT_TYPES.ENCODER, (node, ctx) => {
  const inLines = node.inputLines || 4;
  const outBits = Math.max(1, Math.ceil(Math.log2(inLines)));
  const sr = SourceRef.fromNode(node.id);

  const inNets = [];
  for (let i = 0; i < inLines; i++) inNets.push(ctx.inputNet(node.id, i));
  if (inNets.some(n => !n)) return {};

  const ref = (net) => makeRef(net.name, net.width || 1);
  const out = [];
  for (let b = 0; b < outBits; b++) {
    const oNet = _outNet(ctx, node.id, b);
    if (!oNet) continue;
    // Build the priority chain from MSB index down to 1; index 0 is
    // the deepest else (since if no input is high, output is 0).
    let rhs = makeLiteral(0, 1, sr);
    for (let i = 1; i < inLines; i++) {        // start from i=1, default 0 covers i=0
      const bitVal = (i >> b) & 1;
      rhs = makeTernary(ref(inNets[i]), makeLiteral(bitVal, 1, sr), rhs, 1, sr);
    }
    out.push({
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: ref(oNet),
      rhs,
    });
  }
  return { assigns: out };
});
