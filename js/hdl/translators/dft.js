// DFT-component translators: SCAN_FF and LFSR.
//
// SCAN_FF (Phase 4e of HDL plan, layer 3 of the DFT track):
//   D=0, TI=1, TE=2, CLK=3 → Q. On rising clock, q <= (te ? ti : d).
//   Lowers to a single always block — same shape as D-FF in 4a, with
//   the data input replaced by a TE-driven 2:1 mux expression.
//
// LFSR (Phase 4e, layer 4 of the DFT track):
//   Single CLK input → Q (serial out, 1-bit). Internal N-bit register
//   shifts left every clock; new LSB = XOR of bits at tap positions.
//   Q is the current MSB, exposed via continuous `assign q = state[N-1];`.
//   Initial state from `seed` is applied via Verilog `initial`.

import { COMPONENT_TYPES } from '../../components/Component.js';
import { registerTranslator } from './index.js';
import {
  makeRef, makeNet, makeBinaryOp, makeTernary, makeLiteral, makeConcat,
  makeSlice, NET_KIND,
} from '../ir/types.js';
import { SourceRef } from '../core/SourceRef.js';

function _outNet(ctx, nodeId, outIdx) {
  return ctx.netByEndpoint.get(`${nodeId}:${outIdx}`) || null;
}

// ── SCAN_FF ──────────────────────────────────────────────────
registerTranslator(COMPONENT_TYPES.SCAN_FF, (node, ctx) => {
  const sr = SourceRef.fromNode(node.id);
  const dNet  = ctx.inputNet(node.id, 0);
  const tiNet = ctx.inputNet(node.id, 1);
  const teNet = ctx.inputNet(node.id, 2);
  const clkNet = ctx.inputNet(node.id, 3);
  if (!dNet || !tiNet || !teNet || !clkNet) return {};

  const qNet = _outNet(ctx, node.id, 0);
  if (!qNet) return {};

  const qRef = makeRef(qNet.name, 1);
  // Next-state expression: te ? ti : d — same shape as a 2:1 MUX.
  const next = makeTernary(
    makeRef(teNet.name, 1),
    makeRef(tiNet.name, 1),
    makeRef(dNet.name, 1),
    1, sr,
  );

  return {
    regNets: [qNet.name],
    alwaysBlocks: [{
      kind: 'Always', sourceRef: sr, attributes: [],
      sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
      body: [{ kind: 'NonBlockingAssign', lhs: qRef, rhs: next }],
    }],
    assigns: [],
  };
});

// ── LFSR (Fibonacci, shift-left form) ─────────────────────────
// Mirrors SimulationEngine LFSR: on each clock, newBit = XOR of all
// bits at tap positions, register shifts left, newBit lands in LSB.
// Q is the MSB BEFORE the shift (the bit that overflows). Verilog
// non-blocking semantics give us the same staging — `assign q = r[N-1]`
// reads the current state, then the always block schedules the next
// state for the upcoming edge.
registerTranslator(COMPONENT_TYPES.LFSR, (node, ctx) => {
  const sr   = SourceRef.fromNode(node.id);
  const W    = node.bitWidth || 4;
  const taps = Array.isArray(node.taps) ? node.taps : [W - 1, 0];
  const seed = (node.seed ?? 1) & ((1 << W) - 1);

  const clkNet = ctx.inputNet(node.id, 0);
  const qNet   = _outNet(ctx, node.id, 0);
  if (!clkNet || !qNet) return {};

  // Internal state register — one fresh net, declared as `reg [W-1:0]`.
  const stateName = `${qNet.name}_state`;
  const stateNet  = makeNet({
    name: stateName,
    width: W,
    kind: NET_KIND.REG,
    sourceRef: sr,
  });

  const stateRef = makeRef(stateName, W);

  // XOR chain over the tap bits: r[t0] ^ r[t1] ^ ... — left-fold so
  // toVerilog parenthesises consistently.
  let xorExpr = makeSlice(stateName, taps[0], taps[0], sr);
  for (let i = 1; i < taps.length; i++) {
    xorExpr = makeBinaryOp('^', xorExpr,
      makeSlice(stateName, taps[i], taps[i], sr), 1, sr);
  }

  // Shifted next state: { state[W-2:0], xorExpr }
  const next = makeConcat(
    [makeSlice(stateName, W - 2, 0, sr), xorExpr],
    sr,
  );

  return {
    nets: [stateNet],
    // The state net is already kind=REG via makeNet; no need to add to
    // regNets (that map only upgrades existing wire-class nets).
    alwaysBlocks: [
      // initial begin state = SEED; end — sets the register at sim
      // start. iverilog honours it; FPGA synthesis tools typically
      // honour it too for register-init.
      {
        kind: 'Always', sourceRef: sr, attributes: [],
        sensitivity: { initial: true },
        body: [{
          kind: 'BlockingAssign',
          lhs: stateRef,
          rhs: makeLiteral(seed, W, sr),
        }],
      },
      // The shift logic.
      {
        kind: 'Always', sourceRef: sr, attributes: [],
        sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
        body: [{
          kind: 'NonBlockingAssign',
          lhs: stateRef,
          rhs: next,
        }],
      },
    ],
    assigns: [{
      // Q = state[W-1] — the MSB about to overflow.
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(qNet.name, 1),
      rhs: makeSlice(stateName, W - 1, W - 1, sr),
    }],
  };
});
