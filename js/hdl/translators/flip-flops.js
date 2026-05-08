// Flip-flop translators. FF_SLOT with ffType ∈ {D, T, SR, JK} lowers
// to an `always @(posedge clk)` block whose body is the next-state
// rule for the chosen FF type. The Q output net is declared as `reg`.
//
// Pin layout (mirroring SimulationEngine):
//   D-FF  : in[D=0, CLK=1]                  out[Q=0, Qn=1]
//   T-FF  : in[T=0, CLK=1]                  out[Q=0, Qn=1]
//   SR-FF : in[S=0, R=1, CLK=2]             out[Q=0, Qn=1]
//   JK-FF : in[J=0, K=1, CLK=2]             out[Q=0, Qn=1]
//
// Verilog (D example):
//   always @(posedge clk) begin
//     net_ff_0 <= d;
//   end
// Phase 4 keeps the body terse — no asynchronous reset yet (that
// arrives later in the phase, with reset-polarity options).

import { COMPONENT_TYPES } from '../../components/Component.js';
import { registerTranslator } from './index.js';
import {
  makeRef, makeBinaryOp, makeUnaryOp, makeTernary, makeLiteral,
} from '../ir/types.js';
import { SourceRef } from '../core/SourceRef.js';

function _outNet(ctx, nodeId, outIdx) {
  return ctx.netByEndpoint.get(`${nodeId}:${outIdx}`) || null;
}

// Build the next-state expression for each FF flavour.
//   args: ordered data inputs as Ref expressions
//   q:    Ref to the current Q (for T-FF self-toggle, JK-FF hold)
function _nextState(ffType, args, q, sr) {
  const lit0 = makeLiteral(0, 1, sr);
  const lit1 = makeLiteral(1, 1, sr);
  switch (ffType) {
    case 'D':
      // Q ← D
      return args[0];
    case 'T':
      // Q ← T ? ~Q : Q
      return makeTernary(args[0], makeUnaryOp('~', q, 1, sr), q, 1, sr);
    case 'SR': {
      // s, r:
      //   s & ~r  → 1
      //   ~s & r  → 0
      //   else    → Q
      const s = args[0], r = args[1];
      const setCond = makeBinaryOp('&', s, makeUnaryOp('~', r, 1, sr), 1, sr);
      const rstCond = makeBinaryOp('&', makeUnaryOp('~', s, 1, sr), r, 1, sr);
      return makeTernary(setCond, lit1, makeTernary(rstCond, lit0, q, 1, sr), 1, sr);
    }
    case 'JK': {
      // j & ~k → 1
      // ~j & k → 0
      // j & k  → ~Q
      // else   → Q
      const j = args[0], k = args[1];
      const setCond  = makeBinaryOp('&', j, makeUnaryOp('~', k, 1, sr), 1, sr);
      const rstCond  = makeBinaryOp('&', makeUnaryOp('~', j, 1, sr), k, 1, sr);
      const togCond  = makeBinaryOp('&', j, k, 1, sr);
      const tog      = makeUnaryOp('~', q, 1, sr);
      return makeTernary(setCond, lit1,
        makeTernary(rstCond, lit0,
          makeTernary(togCond, tog, q, 1, sr), 1, sr), 1, sr);
    }
    default:
      return q;     // unrecognised → hold
  }
}

// ── LATCH_SLOT ──────────────────────────────────────────────
// Level-sensitive cousin of the flip-flop. Sensitivity is `@(*)` —
// the latch is transparent while EN is high, holds otherwise.
//
// Pin layout (mirroring SimulationEngine):
//   D_LATCH : in[D=0, EN=1]                    out[Q=0, Qn=1]
//   SR_LATCH: in[S=0, R=1, EN=2]               out[Q=0, Qn=1]
//
// Verilog (D_LATCH):
//   always @(*) begin
//     if (en) q <= d;
//   end
// Verilog (SR_LATCH):
//   always @(*) begin
//     if (en) begin
//       if      (s & ~r) q <= 1'b1;
//       else if (~s & r) q <= 1'b0;
//     end
//   end
// (Reset wins the s&r=1 indeterminate case; matches LATCH_FN semantics.)
registerTranslator(COMPONENT_TYPES.LATCH_SLOT, (node, ctx) => {
  if (!node.latchType) return {};   // empty slot — silently skipped
  const sr = SourceRef.fromNode(node.id);

  let dataNets, enNet;
  if (node.latchType === 'D_LATCH') {
    dataNets = [ctx.inputNet(node.id, 0)];
    enNet    = ctx.inputNet(node.id, 1);
  } else if (node.latchType === 'SR_LATCH') {
    dataNets = [ctx.inputNet(node.id, 0), ctx.inputNet(node.id, 1)];
    enNet    = ctx.inputNet(node.id, 2);
  } else {
    return {};
  }
  if (!enNet || dataNets.some(n => !n)) return {};

  const qNet  = _outNet(ctx, node.id, 0);
  const qnNet = _outNet(ctx, node.id, 1);
  if (!qNet) return {};

  const qRef = makeRef(qNet.name, 1);
  const en   = makeRef(enNet.name, 1);
  const lit0 = makeLiteral(0, 1, sr);
  const lit1 = makeLiteral(1, 1, sr);

  // Build the body of the @(*) block. Use BLOCKING assigns inside
  // combinational/latch always blocks — that's the synthesisable Verilog
  // idiom. Non-blocking belongs to clocked `@(posedge clk)` blocks only;
  // mixing them in `@(*)` triggers tool warnings and is a known
  // race-prone style smell.
  let body;
  if (node.latchType === 'D_LATCH') {
    // if (en) q = d;
    const d = makeRef(dataNets[0].name, 1);
    body = [{
      kind: 'IfStmt', sourceRef: sr,
      cond: en,
      then: [{ kind: 'BlockingAssign', lhs: qRef, rhs: d }],
      else: null,
    }];
  } else {
    // SR_LATCH:
    //   if (en) begin
    //     if      (s & ~r) q = 1;
    //     else if (~s & r) q = 0;
    //   end
    const s = makeRef(dataNets[0].name, 1);
    const r = makeRef(dataNets[1].name, 1);
    const setCond = makeBinaryOp('&', s, makeUnaryOp('~', r, 1, sr), 1, sr);
    const rstCond = makeBinaryOp('&', makeUnaryOp('~', s, 1, sr), r, 1, sr);
    const innerIf = {
      kind: 'IfStmt', sourceRef: sr,
      cond: setCond,
      then: [{ kind: 'BlockingAssign', lhs: qRef, rhs: lit1 }],
      else: [{
        kind: 'IfStmt', sourceRef: sr,
        cond: rstCond,
        then: [{ kind: 'BlockingAssign', lhs: qRef, rhs: lit0 }],
        else: null,
      }],
    };
    body = [{
      kind: 'IfStmt', sourceRef: sr,
      cond: en,
      then: [innerIf],
      else: null,
    }];
  }

  const result = {
    regNets: [qNet.name],
    alwaysBlocks: [{
      kind: 'Always', sourceRef: sr, attributes: [],
      sensitivity: { star: true },
      body,
    }],
    assigns: [],
  };

  if (qnNet) {
    result.assigns.push({
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(qnNet.name, 1),
      rhs: makeUnaryOp('~', qRef, 1, sr),
    });
  }

  return result;
});

registerTranslator(COMPONENT_TYPES.FF_SLOT, (node, ctx) => {
  if (!node.ffType) return {};   // empty slot → silently skipped (matches GATE_SLOT)
  const sr = SourceRef.fromNode(node.id);

  const dataCount = (node.ffType === 'SR' || node.ffType === 'JK') ? 2 : 1;
  const dataNets = [];
  for (let i = 0; i < dataCount; i++) dataNets.push(ctx.inputNet(node.id, i));
  const clkNet = ctx.inputNet(node.id, dataCount);
  if (dataNets.some(d => !d) || !clkNet) return {};

  // The Q output net is what we'll drive from the always-block. Mark
  // it as `reg`. The Qn (output 1) is `~Q` and emits as a continuous
  // assign so it stays a regular wire.
  const qNet  = _outNet(ctx, node.id, 0);
  const qnNet = _outNet(ctx, node.id, 1);
  if (!qNet) return {};

  const qRef = makeRef(qNet.name, qNet.width || 1);
  const args = dataNets.map(n => makeRef(n.name, n.width || 1));
  const next = _nextState(node.ffType, args, qRef, sr);

  const result = {
    regNets: [qNet.name],
    alwaysBlocks: [{
      kind: 'Always',
      sourceRef: sr,
      attributes: [],
      sensitivity: {
        triggers: [{ edge: 'posedge', signal: clkNet.name }],
      },
      body: [{ kind: 'NonBlockingAssign', lhs: qRef, rhs: next }],
    }],
    assigns: [],
  };

  // If Qn is wired, drive it as `assign qn = ~q;`.
  if (qnNet) {
    result.assigns.push({
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(qnNet.name, qnNet.width || 1),
      rhs: makeUnaryOp('~', qRef, 1, sr),
    });
  }

  return result;
});
