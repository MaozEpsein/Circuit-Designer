// Multi-bit register-family translators: REGISTER, COUNTER, SHIFT_REG.
// Every member is clocked, parametric on bit width, and lowers to a
// single `always @(posedge clk)` block whose body is a chain of
// priority-ordered if/else branches:
//   1. CLR   → q <= 0       (highest priority)
//   2. LOAD  → q <= data    (COUNTER only)
//   3. EN    → q <= next    (DATA for REGISTER, count+1 for COUNTER,
//                             shifted for SHIFT_REG)
//   4. else  → hold         (no assignment fires)
//
// The Q net is upgraded to `reg [N-1:0]`. COUNTER additionally drives
// TC (terminal count) via a continuous `assign tc = &count;` (all
// bits high).
//
// Pin layouts (mirror SimulationEngine):
//   REGISTER : DATA(0)             EN(1) CLR(2) CLK(3)
//   COUNTER  : EN(0) LOAD(1) DATA(2) CLR(3) CLK(4)
//   SHIFT_REG: DIN(0) DIR(1)       EN(2) CLR(3) CLK(4)

import { COMPONENT_TYPES } from '../../components/Component.js';
import { registerTranslator } from './index.js';
import {
  makeRef, makeBinaryOp, makeLiteral, makeConcat, makeSlice, makeUnaryOp,
} from '../ir/types.js';
import { SourceRef } from '../core/SourceRef.js';

function _outNet(ctx, nodeId, outIdx) {
  return ctx.netByEndpoint.get(`${nodeId}:${outIdx}`) || null;
}

// Build a chained if/else-if structure from an array of
// { cond, body[] } guards. The first whose cond is truthy fires;
// otherwise no assignment runs (so the reg holds).
function _priorityChain(guards) {
  if (guards.length === 0) return [];
  const head = guards[0];
  const node = {
    kind: 'IfStmt',
    sourceRef: SourceRef.unknown(),
    cond: head.cond,
    then: head.body,
    else: null,
  };
  if (guards.length > 1) {
    node.else = _priorityChain(guards.slice(1));
  }
  return [node];
}

// ── REGISTER ─────────────────────────────────────────────────
registerTranslator(COMPONENT_TYPES.REGISTER, (node, ctx) => {
  const sr = SourceRef.fromNode(node.id);
  const W  = node.bitWidth || 8;

  const dataNet = ctx.inputNet(node.id, 0);
  const enNet   = ctx.inputNet(node.id, 1);
  const clrNet  = ctx.inputNet(node.id, 2);
  const clkNet  = ctx.inputNet(node.id, 3);
  if (!dataNet || !clkNet) return {};

  const qNet = _outNet(ctx, node.id, 0);
  if (!qNet) return {};

  const qRef    = makeRef(qNet.name, W);
  const dataRef = makeRef(dataNet.name, W);
  const zero    = makeLiteral(0, W, sr);

  const guards = [];
  if (clrNet) guards.push({
    cond: makeRef(clrNet.name, 1),
    body: [{ kind: 'NonBlockingAssign', lhs: qRef, rhs: zero }],
  });
  guards.push({
    cond: enNet ? makeRef(enNet.name, 1) : makeLiteral(1, 1, sr),
    body: [{ kind: 'NonBlockingAssign', lhs: qRef, rhs: dataRef }],
  });

  return {
    regNets: [qNet.name],
    alwaysBlocks: [{
      kind: 'Always', sourceRef: sr, attributes: [],
      sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
      body: _priorityChain(guards),
    }],
    assigns: [],
  };
});

// ── COUNTER ──────────────────────────────────────────────────
registerTranslator(COMPONENT_TYPES.COUNTER, (node, ctx) => {
  const sr = SourceRef.fromNode(node.id);
  const W  = node.bitWidth || 4;

  const enNet   = ctx.inputNet(node.id, 0);
  const loadNet = ctx.inputNet(node.id, 1);
  const dataNet = ctx.inputNet(node.id, 2);
  const clrNet  = ctx.inputNet(node.id, 3);
  const clkNet  = ctx.inputNet(node.id, 4);
  if (!clkNet) return {};

  const qNet  = _outNet(ctx, node.id, 0);
  const tcNet = _outNet(ctx, node.id, 1);
  if (!qNet) return {};

  const qRef = makeRef(qNet.name, W);
  const zero = makeLiteral(0, W, sr);
  // count + 1: Verilog auto-extends 1'b1 to W bits in the add.
  const inc  = makeBinaryOp('+', qRef, makeLiteral(1, W, sr), W, sr);

  const guards = [];
  if (clrNet) guards.push({
    cond: makeRef(clrNet.name, 1),
    body: [{ kind: 'NonBlockingAssign', lhs: qRef, rhs: zero }],
  });
  if (loadNet && dataNet) guards.push({
    cond: makeRef(loadNet.name, 1),
    body: [{ kind: 'NonBlockingAssign', lhs: qRef, rhs: makeRef(dataNet.name, W) }],
  });
  guards.push({
    cond: enNet ? makeRef(enNet.name, 1) : makeLiteral(1, 1, sr),
    body: [{ kind: 'NonBlockingAssign', lhs: qRef, rhs: inc }],
  });

  const result = {
    regNets: [qNet.name],
    alwaysBlocks: [{
      kind: 'Always', sourceRef: sr, attributes: [],
      sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
      body: _priorityChain(guards),
    }],
    assigns: [],
  };

  // TC = all bits of count are 1 (terminal count). Verilog reduction
  // AND `&count` gives that succinctly.
  if (tcNet) {
    result.assigns.push({
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(tcNet.name, 1),
      rhs: makeUnaryOp('&', qRef, 1, sr),
    });
  }

  return result;
});

// ── PIPE_REG ─────────────────────────────────────────────────
// Pipeline register with N parallel channels, STALL, FLUSH, CLK.
// Pin layout (mirroring SimulationEngine):
//   D0..D(N-1) : channels                        (indices 0..N-1)
//   STALL      : freeze update                   (index N)
//   FLUSH      : clear all channels to 0         (index N+1)
//   CLK        : rising edge                     (index N+2)
//   __out0..__out(N-1) : one output per channel
//
// Priority semantics (matches engine):
//   FLUSH        → q_i <= 0           (all channels cleared)
//   else !STALL  → q_i <= d_i         (latch each channel)
//   else         → hold               (no assignment fires)
//
// Verilog form (one always block, multiple non-blocking assigns
// inside each branch):
//   always @(posedge clk) begin
//     if (flush) begin
//       q_0 <= 0;
//       q_1 <= 0;
//       ...
//     end else if (!stall) begin
//       q_0 <= d_0;
//       ...
//     end
//   end
registerTranslator(COMPONENT_TYPES.PIPE_REG, (node, ctx) => {
  const sr = SourceRef.fromNode(node.id);
  const ch = node.channels || 4;
  const W  = node.bitWidth || 8;

  const dataNets = [];
  for (let i = 0; i < ch; i++) dataNets.push(ctx.inputNet(node.id, i));
  const stallNet = ctx.inputNet(node.id, ch);
  const flushNet = ctx.inputNet(node.id, ch + 1);
  const clkNet   = ctx.inputNet(node.id, ch + 2);
  if (!clkNet) return {};

  const qNets = [];
  for (let i = 0; i < ch; i++) qNets.push(_outNet(ctx, node.id, i));
  // Need at least one connected output to emit anything.
  if (qNets.every(n => !n)) return {};

  const sr_ = sr;
  const lit0 = makeLiteral(0, W, sr_);

  // Build the FLUSH branch: one `q_i <= 0;` per channel.
  const flushBody = qNets
    .filter(n => n)
    .map(n => ({
      kind: 'NonBlockingAssign',
      lhs: makeRef(n.name, W),
      rhs: lit0,
    }));

  // Build the LATCH branch: one `q_i <= d_i;` per connected channel.
  const latchBody = [];
  for (let i = 0; i < ch; i++) {
    if (qNets[i] && dataNets[i]) {
      latchBody.push({
        kind: 'NonBlockingAssign',
        lhs: makeRef(qNets[i].name, W),
        rhs: makeRef(dataNets[i].name, W),
      });
    }
  }

  // Compose the body. STALL and FLUSH are optional pins — translator
  // degrades gracefully when either is missing (pure latch when both
  // absent, FLUSH-only chain when STALL absent, etc.).
  let body;
  if (flushNet && stallNet) {
    body = [{
      kind: 'IfStmt', sourceRef: sr_,
      cond: makeRef(flushNet.name, 1),
      then: flushBody,
      else: [{
        kind: 'IfStmt', sourceRef: sr_,
        cond: makeUnaryOp('!', makeRef(stallNet.name, 1), 1, sr_),
        then: latchBody,
        else: null,
      }],
    }];
  } else if (flushNet) {
    body = [{
      kind: 'IfStmt', sourceRef: sr_,
      cond: makeRef(flushNet.name, 1),
      then: flushBody,
      else: latchBody,
    }];
  } else if (stallNet) {
    body = [{
      kind: 'IfStmt', sourceRef: sr_,
      cond: makeUnaryOp('!', makeRef(stallNet.name, 1), 1, sr_),
      then: latchBody,
      else: null,
    }];
  } else {
    body = latchBody;     // pure pipeline register, always latches
  }

  return {
    regNets: qNets.filter(n => n).map(n => n.name),
    alwaysBlocks: [{
      kind: 'Always', sourceRef: sr_, attributes: [],
      sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
      body,
    }],
    assigns: [],
  };
});

// ── SHIFT_REG ────────────────────────────────────────────────
// Bidirectional shift register. DIR=1 → left (DIN enters at LSB),
// DIR=0 → right (DIN enters at MSB). Matches the engine semantics.
registerTranslator(COMPONENT_TYPES.SHIFT_REG, (node, ctx) => {
  const sr = SourceRef.fromNode(node.id);
  const W  = node.bitWidth || 4;

  const dinNet  = ctx.inputNet(node.id, 0);
  const dirNet  = ctx.inputNet(node.id, 1);
  const enNet   = ctx.inputNet(node.id, 2);
  const clrNet  = ctx.inputNet(node.id, 3);
  const clkNet  = ctx.inputNet(node.id, 4);
  if (!clkNet) return {};

  const qNet = _outNet(ctx, node.id, 0);
  if (!qNet) return {};

  const qRef = makeRef(qNet.name, W);
  const zero = makeLiteral(0, W, sr);

  // Shift-left: q[W-2:0] becomes the new q[W-1:1]; new q[0] = din.
  // In Verilog: q <= {q[W-2:0], din}.
  // Shift-right: q <= {din, q[W-1:1]}.
  const dinRef = dinNet ? makeRef(dinNet.name, 1)
                        : makeLiteral(0, 1, sr);
  const left  = makeConcat([makeSlice(qNet.name, W - 2, 0, sr), dinRef], sr);
  const right = makeConcat([dinRef, makeSlice(qNet.name, W - 1, 1, sr)], sr);

  // Pick direction via if/else inside the EN-gated branch. We avoid a
  // single ternary so the if/else nesting reads cleanly in the output.
  const shiftBody = dirNet
    ? [{
        kind: 'IfStmt', sourceRef: sr,
        cond: makeRef(dirNet.name, 1),
        then: [{ kind: 'NonBlockingAssign', lhs: qRef, rhs: left }],
        else: [{ kind: 'NonBlockingAssign', lhs: qRef, rhs: right }],
      }]
    // No DIR pin → default to left-shift (MSB-first).
    : [{ kind: 'NonBlockingAssign', lhs: qRef, rhs: left }];

  const guards = [];
  if (clrNet) guards.push({
    cond: makeRef(clrNet.name, 1),
    body: [{ kind: 'NonBlockingAssign', lhs: qRef, rhs: zero }],
  });
  guards.push({
    cond: enNet ? makeRef(enNet.name, 1) : makeLiteral(1, 1, sr),
    body: shiftBody,
  });

  return {
    regNets: [qNet.name],
    alwaysBlocks: [{
      kind: 'Always', sourceRef: sr, attributes: [],
      sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
      body: _priorityChain(guards),
    }],
    assigns: [],
  };
});
