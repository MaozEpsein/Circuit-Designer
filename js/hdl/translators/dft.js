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

// ── MISR (Multiple Input Signature Register) ────────────────
// A Fibonacci LFSR with N additional 1-bit data inputs that XOR into
// the chain each cycle. Pin layout (mirroring SimulationEngine):
//   D[0]..D[N-1] (one bit each), CLK
// Output: Q = the full N-bit signature register.
//
// Per-bit next-state on the rising edge:
//   state[0] <= (XOR over taps) ^ D[0]
//   state[i] <= state[i-1]      ^ D[i]   (i >= 1)
//
// Synth-friendly: emits one `reg [W-1:0]` and a single posedge always
// block whose RHS is a Concat of per-bit XOR expressions.
registerTranslator(COMPONENT_TYPES.MISR, (node, ctx) => {
  const sr   = SourceRef.fromNode(node.id);
  const W    = node.bitWidth || 4;
  const taps = Array.isArray(node.taps) ? node.taps : [W - 1, 0];
  const seed = (node.seed ?? 0) & ((1 << W) - 1);

  const clkNet = ctx.inputNet(node.id, W);     // CLK is at index N (after D[0..N-1])
  const qNet   = _outNet(ctx, node.id, 0);
  if (!clkNet || !qNet) return {};

  const stateName = `${qNet.name}_state`;
  const stateNet  = makeNet({
    name: stateName, width: W, kind: NET_KIND.REG, sourceRef: sr,
  });

  // XOR chain over taps for the LSB feedback bit.
  let tapXor = makeSlice(stateName, taps[0], taps[0], sr);
  for (let i = 1; i < taps.length; i++) {
    tapXor = makeBinaryOp('^', tapXor,
      makeSlice(stateName, taps[i], taps[i], sr), 1, sr);
  }

  // Build the per-bit next-state, MSB-first so makeConcat orders bits
  // as Verilog expects ({MSB..LSB}).
  const dRef = (i) => {
    const dNet = ctx.inputNet(node.id, i);
    return dNet ? makeRef(dNet.name, 1) : makeLiteral(0, 1, sr);
  };
  const bits = [];
  for (let i = W - 1; i >= 1; i--) {
    bits.push(makeBinaryOp('^',
      makeSlice(stateName, i - 1, i - 1, sr),
      dRef(i), 1, sr));
  }
  bits.push(makeBinaryOp('^', tapXor, dRef(0), 1, sr));    // bit 0

  return {
    nets: [stateNet],
    alwaysBlocks: [
      // initial state = SEED;
      {
        kind: 'Always', sourceRef: sr, attributes: [],
        sensitivity: { initial: true },
        body: [{
          kind: 'BlockingAssign',
          lhs: makeRef(stateName, W),
          rhs: makeLiteral(seed, W, sr),
        }],
      },
      // posedge clk: state <= { bit_(W-1), …, bit_0 }.
      {
        kind: 'Always', sourceRef: sr, attributes: [],
        sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
        body: [{
          kind: 'NonBlockingAssign',
          lhs: makeRef(stateName, W),
          rhs: makeConcat(bits, sr),
        }],
      },
    ],
    assigns: [{
      // Q exposes the full signature.
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(qNet.name, W),
      rhs: makeRef(stateName, W),
    }],
  };
});

// ── BIST_CONTROLLER (Layer 6 of the DFT track) ─────────────
// Six-state Mealy/Moore hybrid: IDLE → SETUP → RUN(N) → COMPARE →
// DONE | FAIL. RESET (synchronous) overrides every transition. Pins:
//   Inputs : START(0), RESET(1), SIG_IN(2, sigBits), CLK(3)
//   Outputs: DONE(0), PASS(1), TEST_MODE(2), STATE(3, 3-bit)
// Verilog: one 3-bit state reg + a cycle counter, posedge always
// block with a case (state) chain, and four continuous assigns
// projecting the state onto the four outputs.
registerTranslator(COMPONENT_TYPES.BIST_CONTROLLER, (node, ctx) => {
  const sr = SourceRef.fromNode(node.id);
  const sigBits = Math.max(1, (node.sigBits | 0) || 4);
  const runLen  = Math.max(1, (node.runLength | 0) || 16);
  const cw      = Math.max(1, Math.ceil(Math.log2(runLen + 1)));
  const golden  = (node.goldenSig | 0) & ((1 << sigBits) - 1);

  const startNet = ctx.inputNet(node.id, 0);
  const resetNet = ctx.inputNet(node.id, 1);
  const sigNet   = ctx.inputNet(node.id, 2);
  const clkNet   = ctx.inputNet(node.id, 3);
  if (!clkNet) return {};

  const out0 = _outNet(ctx, node.id, 0);   // DONE
  const out1 = _outNet(ctx, node.id, 1);   // PASS
  const out2 = _outNet(ctx, node.id, 2);   // TEST_MODE
  const out3 = _outNet(ctx, node.id, 3);   // STATE (3-bit)

  // Internal state regs.
  const stateName = `bist_${node.id}_state`;
  const countName = `bist_${node.id}_cnt`;
  const stateNet = makeNet({ name: stateName, width: 3,  kind: NET_KIND.REG, sourceRef: sr });
  const countNet = makeNet({ name: countName, width: cw, kind: NET_KIND.REG, sourceRef: sr });
  const stateRef = makeRef(stateName, 3);
  const countRef = makeRef(countName, cw);

  const lit3 = (n) => makeLiteral(n, 3, sr);
  const lit1 = makeLiteral(1, 1, sr);
  const lit0 = makeLiteral(0, 1, sr);

  // Convenience refs.
  const startRef = startNet ? makeRef(startNet.name, 1) : lit0;
  const resetRef = resetNet ? makeRef(resetNet.name, 1) : lit0;
  const sigRef   = sigNet   ? makeRef(sigNet.name, sigBits)
                            : makeLiteral(0, sigBits, sr);

  // case (state) inside the non-reset branch.
  const cases = [
    // 0 IDLE — wait for START
    { label: lit3(0), body: [{
        kind: 'IfStmt', sourceRef: sr,
        cond: startRef,
        then: [
          { kind: 'NonBlockingAssign', lhs: stateRef, rhs: lit3(1) },
          { kind: 'NonBlockingAssign', lhs: countRef, rhs: makeLiteral(0, cw, sr) },
        ],
        else: null,
    }] },
    // 1 SETUP — one cycle, fall through to RUN
    { label: lit3(1), body: [
        { kind: 'NonBlockingAssign', lhs: stateRef, rhs: lit3(2) },
        { kind: 'NonBlockingAssign', lhs: countRef, rhs: makeLiteral(0, cw, sr) },
    ] },
    // 2 RUN — count down `runLength` cycles
    { label: lit3(2), body: [
        { kind: 'NonBlockingAssign', lhs: countRef,
          rhs: makeBinaryOp('+', countRef, makeLiteral(1, cw, sr), cw, sr) },
        { kind: 'IfStmt', sourceRef: sr,
          cond: makeBinaryOp('>=',
            makeBinaryOp('+', countRef, makeLiteral(1, cw, sr), cw, sr),
            makeLiteral(runLen, cw, sr), 1, sr),
          then: [{ kind: 'NonBlockingAssign', lhs: stateRef, rhs: lit3(3) }],
          else: null },
    ] },
    // 3 COMPARE — single-cycle decision based on SIG_IN
    { label: lit3(3), body: [{
        kind: 'NonBlockingAssign',
        lhs: stateRef,
        rhs: makeTernary(
          makeBinaryOp('==', sigRef, makeLiteral(golden, sigBits, sr), 1, sr),
          lit3(4), lit3(5), 3, sr),
    }] },
    // 4, 5 DONE / FAIL — terminal, no transition
    { label: lit3(4), body: [] },
    { label: lit3(5), body: [] },
  ];

  const alwaysBody = [{
    kind: 'IfStmt', sourceRef: sr,
    cond: resetRef,
    then: [
      { kind: 'NonBlockingAssign', lhs: stateRef, rhs: lit3(0) },
      { kind: 'NonBlockingAssign', lhs: countRef, rhs: makeLiteral(0, cw, sr) },
    ],
    else: [{
      kind: 'CaseStmt', sourceRef: sr,
      selector: stateRef,
      cases,
      default: [],
    }],
  }];

  // Continuous projections of state onto the 4 outputs.
  const assigns = [];
  if (out0) assigns.push({                  // DONE = (state >= 4)
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(out0.name, 1),
    rhs: makeBinaryOp('||',
      makeBinaryOp('==', stateRef, lit3(4), 1, sr),
      makeBinaryOp('==', stateRef, lit3(5), 1, sr), 1, sr),
  });
  if (out1) assigns.push({                  // PASS = (state == 4)
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(out1.name, 1),
    rhs: makeBinaryOp('==', stateRef, lit3(4), 1, sr),
  });
  if (out2) assigns.push({                  // TEST_MODE = (state == 1 || == 2)
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(out2.name, 1),
    rhs: makeBinaryOp('||',
      makeBinaryOp('==', stateRef, lit3(1), 1, sr),
      makeBinaryOp('==', stateRef, lit3(2), 1, sr), 1, sr),
  });
  if (out3) assigns.push({                  // STATE — full 3-bit
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(out3.name, 3),
    rhs: stateRef,
  });

  return {
    nets: [stateNet, countNet],
    alwaysBlocks: [
      // initial — boot at IDLE.
      {
        kind: 'Always', sourceRef: sr, attributes: [],
        sensitivity: { initial: true },
        body: [
          { kind: 'BlockingAssign', lhs: stateRef, rhs: lit3(0) },
          { kind: 'BlockingAssign', lhs: countRef, rhs: makeLiteral(0, cw, sr) },
        ],
      },
      // posedge clk — the FSM.
      {
        kind: 'Always', sourceRef: sr, attributes: [],
        sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
        body: alwaysBody,
      },
    ],
    assigns,
  };
});

// ── JTAG_TAP (Layer 7 of the DFT track) ────────────────────
// IEEE 1149.1 TAP controller. Pins:
//   Inputs : TCK(0), TMS(1), TDI(2), TRST(3)
//   Outputs: TDO(0, 1-bit), STATE(1, 4-bit), IR(2, irBits-bit)
// 16-state FSM advanced on posedge TCK by TMS. Verilog: one 4-bit
// state reg + IR + DR; case-on-state; continuous assigns project
// state, ir, and tdo to outputs.
registerTranslator(COMPONENT_TYPES.JTAG_TAP, (node, ctx) => {
  const sr = SourceRef.fromNode(node.id);
  const irBits = Math.max(1, (node.irBits | 0) || 4);
  const tckNet  = ctx.inputNet(node.id, 0);
  const tmsNet  = ctx.inputNet(node.id, 1);
  const tdiNet  = ctx.inputNet(node.id, 2);
  const trstNet = ctx.inputNet(node.id, 3);
  if (!tckNet) return {};

  const out0 = _outNet(ctx, node.id, 0);   // TDO
  const out1 = _outNet(ctx, node.id, 1);   // STATE
  const out2 = _outNet(ctx, node.id, 2);   // IR

  const stateName = `tap_${node.id}_state`;
  const irName    = `tap_${node.id}_ir`;
  const drName    = `tap_${node.id}_dr`;
  const tdoName   = `tap_${node.id}_tdo`;
  const stateNet = makeNet({ name: stateName, width: 4,      kind: NET_KIND.REG, sourceRef: sr });
  const irNet    = makeNet({ name: irName,    width: irBits, kind: NET_KIND.REG, sourceRef: sr });
  const drNet    = makeNet({ name: drName,    width: 32,     kind: NET_KIND.REG, sourceRef: sr });
  const tdoNetIR = makeNet({ name: tdoName,   width: 1,      kind: NET_KIND.REG, sourceRef: sr });

  const stateRef = makeRef(stateName, 4);
  const irRef    = makeRef(irName,    irBits);
  const drRef    = makeRef(drName,    32);
  const tdoRef   = makeRef(tdoName,   1);

  const lit4 = (n) => makeLiteral(n, 4, sr);
  const lit1 = makeLiteral(1, 1, sr);
  const lit0 = makeLiteral(0, 1, sr);
  const tmsRef  = tmsNet  ? makeRef(tmsNet.name, 1)  : lit0;
  const tdiRef  = tdiNet  ? makeRef(tdiNet.name, 1)  : lit0;
  const trstRef = trstNet ? makeRef(trstNet.name, 1) : lit0;

  // 16-state next-state table (rows = current state, cols = TMS=0/1).
  // Encoded as one nested ternary chain so the ALWAYS-block stays
  // a single non-blocking assign — readable when the FSM is small.
  const NEXT = [
    [1, 0],   [1, 2],   [3, 9],   [4, 5],
    [4, 5],   [6, 8],   [6, 7],   [4, 8],
    [1, 2],   [10, 0],  [11, 12], [11, 12],
    [13, 15], [13, 14], [11, 15], [1, 2],
  ];
  // Build a giant case (state) → (tms ? lit(NEXT[s][1]) : lit(NEXT[s][0]))
  const stateCases = NEXT.map((row, s) => ({
    label: lit4(s),
    body: [{
      kind: 'NonBlockingAssign', lhs: stateRef,
      rhs: makeTernary(tmsRef, lit4(row[1]), lit4(row[0]), 4, sr),
    }],
  }));

  // Shift behaviour: in Shift-DR (4) the DR shifts toward LSB, IR untouched.
  // In Shift-IR (11) the IR shifts toward LSB. TDO mirrors the LSB of
  // whichever register is being shifted. Capture-IR loads 0...01.
  const shiftCases = [
    // Shift-DR
    { label: lit4(4), body: [
      { kind: 'NonBlockingAssign', lhs: tdoRef,
        rhs: makeSlice(drName, 0, 0, sr) },
      { kind: 'NonBlockingAssign', lhs: drRef,
        rhs: makeConcat([tdiRef, makeSlice(drName, 31, 1, sr)], sr) },
    ] },
    // Shift-IR
    { label: lit4(11), body: [
      { kind: 'NonBlockingAssign', lhs: tdoRef,
        rhs: makeSlice(irName, 0, 0, sr) },
      { kind: 'NonBlockingAssign', lhs: irRef,
        rhs: makeConcat([tdiRef, makeSlice(irName, irBits - 1, 1, sr)], sr) },
    ] },
    // Capture-IR — preload 0...01.
    { label: lit4(10), body: [
      { kind: 'NonBlockingAssign', lhs: irRef,
        rhs: makeLiteral(1, irBits, sr) },
    ] },
  ];

  const alwaysBody = [{
    kind: 'IfStmt', sourceRef: sr,
    cond: trstRef,
    then: [
      { kind: 'NonBlockingAssign', lhs: stateRef, rhs: lit4(0) },
      { kind: 'NonBlockingAssign', lhs: irRef,    rhs: makeLiteral(0, irBits, sr) },
      { kind: 'NonBlockingAssign', lhs: drRef,    rhs: makeLiteral(0, 32, sr) },
      { kind: 'NonBlockingAssign', lhs: tdoRef,   rhs: lit0 },
    ],
    else: [
      { kind: 'CaseStmt', sourceRef: sr, selector: stateRef,
        cases: shiftCases, default: [] },
      { kind: 'CaseStmt', sourceRef: sr, selector: stateRef,
        cases: stateCases, default: [] },
    ],
  }];

  const assigns = [];
  if (out0) assigns.push({
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(out0.name, 1), rhs: tdoRef,
  });
  if (out1) assigns.push({
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(out1.name, 4), rhs: stateRef,
  });
  if (out2) assigns.push({
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(out2.name, irBits), rhs: irRef,
  });

  return {
    nets: [stateNet, irNet, drNet, tdoNetIR],
    alwaysBlocks: [
      {
        kind: 'Always', sourceRef: sr, attributes: [],
        sensitivity: { initial: true },
        body: [
          { kind: 'BlockingAssign', lhs: stateRef, rhs: lit4(0) },
          { kind: 'BlockingAssign', lhs: irRef,    rhs: makeLiteral(0, irBits, sr) },
          { kind: 'BlockingAssign', lhs: drRef,    rhs: makeLiteral(0, 32, sr) },
          { kind: 'BlockingAssign', lhs: tdoRef,   rhs: lit0 },
        ],
      },
      {
        kind: 'Always', sourceRef: sr, attributes: [],
        sensitivity: { triggers: [{ edge: 'posedge', signal: tckNet.name }] },
        body: alwaysBody,
      },
    ],
    assigns,
  };
});

// ── BOUNDARY_SCAN_CELL (Layer 7) ───────────────────────────
// Pins: PI(0), SI(1), MODE(2), SHIFT(3), CLK(4)  →  PO(0), SO(1)
// Verilog:
//   reg shift, upd;
//   always @(posedge clk) begin
//     shift <= shift_e ? si : pi;
//     if (mode) upd <= shift;
//   end
//   assign po = mode ? upd : pi;
//   assign so = shift;
registerTranslator(COMPONENT_TYPES.BOUNDARY_SCAN_CELL, (node, ctx) => {
  const sr = SourceRef.fromNode(node.id);
  const piNet    = ctx.inputNet(node.id, 0);
  const siNet    = ctx.inputNet(node.id, 1);
  const modeNet  = ctx.inputNet(node.id, 2);
  const shiftNet = ctx.inputNet(node.id, 3);
  const clkNet   = ctx.inputNet(node.id, 4);
  if (!clkNet) return {};

  const out0 = _outNet(ctx, node.id, 0);   // PO
  const out1 = _outNet(ctx, node.id, 1);   // SO

  const shName  = `bsc_${node.id}_shift`;
  const updName = `bsc_${node.id}_upd`;
  const shNet   = makeNet({ name: shName,  width: 1, kind: NET_KIND.REG, sourceRef: sr });
  const updNet  = makeNet({ name: updName, width: 1, kind: NET_KIND.REG, sourceRef: sr });
  const shRef   = makeRef(shName,  1);
  const updRef  = makeRef(updName, 1);

  const lit0 = makeLiteral(0, 1, sr);
  const piRef    = piNet    ? makeRef(piNet.name, 1)    : lit0;
  const siRef    = siNet    ? makeRef(siNet.name, 1)    : lit0;
  const modeRef  = modeNet  ? makeRef(modeNet.name, 1)  : lit0;
  const shiftRef = shiftNet ? makeRef(shiftNet.name, 1) : lit0;

  const alwaysBody = [
    { kind: 'NonBlockingAssign', lhs: shRef,
      rhs: makeTernary(shiftRef, siRef, piRef, 1, sr) },
    { kind: 'IfStmt', sourceRef: sr,
      cond: modeRef,
      then: [{ kind: 'NonBlockingAssign', lhs: updRef, rhs: shRef }],
      else: null },
  ];

  const assigns = [];
  if (out0) assigns.push({
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(out0.name, 1),
    rhs: makeTernary(modeRef, updRef, piRef, 1, sr),
  });
  if (out1) assigns.push({
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(out1.name, 1), rhs: shRef,
  });

  return {
    nets: [shNet, updNet],
    alwaysBlocks: [{
      kind: 'Always', sourceRef: sr, attributes: [],
      sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
      body: alwaysBody,
    }],
    assigns,
  };
});

// ── MBIST_CONTROLLER (Memory BIST, stage 1) ─────────────────
// Pin layout:
//   Inputs : START(0), RESET(1), DATA_IN(2, dataBits), CLK(3)
//   Outputs: DONE(0), PASS(1), FAIL(2), TEST_MODE(3),
//            STATE(4, 3-bit), ADDR(5, addrBits),
//            DATA_OUT(6, dataBits), WE(7), RE(8)
// March C− algorithm: 10 states (IDLE..FAIL), 6 march elements,
// 3 sub-phases per RW step (drive RE → sample → drive WE).
//
// Stage-1 emission is structural: declares state registers, an
// initial block, and a posedge-CLK always with a `case (state)`
// transition table. Output assigns reflect the FSM. The DATA_IN
// comparison is approximated (the live engine does the actual check
// at native simulation; the Verilog here is a teaching version).
registerTranslator(COMPONENT_TYPES.MBIST_CONTROLLER, (node, ctx) => {
  const sr = SourceRef.fromNode(node.id);
  const addrBits = Math.max(1, (node.addrBits | 0) || 4);
  const dataBits = Math.max(1, (node.dataBits | 0) || 8);

  const startNet = ctx.inputNet(node.id, 0);
  const resetNet = ctx.inputNet(node.id, 1);
  const dinNet   = ctx.inputNet(node.id, 2);
  const clkNet   = ctx.inputNet(node.id, 3);
  if (!clkNet) return {};

  const outDone = _outNet(ctx, node.id, 0);
  const outPass = _outNet(ctx, node.id, 1);
  const outFail = _outNet(ctx, node.id, 2);
  const outTM   = _outNet(ctx, node.id, 3);
  const outSt   = _outNet(ctx, node.id, 4);
  const outAd   = _outNet(ctx, node.id, 5);
  const outDo   = _outNet(ctx, node.id, 6);
  const outWE   = _outNet(ctx, node.id, 7);
  const outRE   = _outNet(ctx, node.id, 8);

  // Internal regs.
  const stateName = `mbist_${node.id}_state`;
  const stepName  = `mbist_${node.id}_step`;
  const addrName  = `mbist_${node.id}_addr`;
  const subName   = `mbist_${node.id}_sub`;
  const failAName = `mbist_${node.id}_failAddr`;
  const stateNet  = makeNet({ name: stateName, width: 4,        kind: NET_KIND.REG, sourceRef: sr });
  const stepNet   = makeNet({ name: stepName,  width: 3,        kind: NET_KIND.REG, sourceRef: sr });
  const addrNet   = makeNet({ name: addrName,  width: addrBits, kind: NET_KIND.REG, sourceRef: sr });
  const subNet    = makeNet({ name: subName,   width: 2,        kind: NET_KIND.REG, sourceRef: sr });
  const failANet  = makeNet({ name: failAName, width: addrBits, kind: NET_KIND.REG, sourceRef: sr });
  const stateRef  = makeRef(stateName, 4);
  const stepRef   = makeRef(stepName,  3);
  const addrRef   = makeRef(addrName,  addrBits);
  const subRef    = makeRef(subName,   2);
  const failARef  = makeRef(failAName, addrBits);

  const lit4 = (n) => makeLiteral(n, 4, sr);
  const lit3 = (n) => makeLiteral(n, 3, sr);
  const lit2 = (n) => makeLiteral(n, 2, sr);
  const litA = (n) => makeLiteral(n, addrBits, sr);
  const litD = (n) => makeLiteral(n, dataBits, sr);
  const lit1 = makeLiteral(1, 1, sr);
  const lit0 = makeLiteral(0, 1, sr);

  const startRef = startNet ? makeRef(startNet.name, 1) : lit0;
  const resetRef = resetNet ? makeRef(resetNet.name, 1) : lit0;
  const dinRef   = dinNet   ? makeRef(dinNet.name, dataBits)
                            : makeLiteral(0, dataBits, sr);

  const N_minus_1 = (1 << addrBits) - 1;

  // Case body for FSM. Stage 1 emits the high-level transitions; the
  // exact mismatch check is approximated by a default no-op on read
  // sub-phases (live engine performs the actual check).
  const cases = [
    // 0 IDLE — wait for START
    { label: lit4(0), body: [{
        kind: 'IfStmt', sourceRef: sr, cond: startRef,
        then: [
          { kind: 'NonBlockingAssign', lhs: stateRef, rhs: lit4(1) },
          { kind: 'NonBlockingAssign', lhs: stepRef,  rhs: lit3(0) },
          { kind: 'NonBlockingAssign', lhs: addrRef,  rhs: litA(0) },
          { kind: 'NonBlockingAssign', lhs: subRef,   rhs: lit2(0) },
        ], else: null,
    }] },
    // 1 SETUP — go to W0_UP
    { label: lit4(1), body: [
        { kind: 'NonBlockingAssign', lhs: stateRef, rhs: lit4(2) },
    ] },
    // 2 W0_UP — increment addr; on rollover → state 3, addr=0
    { label: lit4(2), body: [{
        kind: 'IfStmt', sourceRef: sr,
        cond: makeBinaryOp('<', addrRef, litA(N_minus_1), 1, sr),
        then: [{ kind: 'NonBlockingAssign', lhs: addrRef,
                 rhs: makeBinaryOp('+', addrRef, litA(1), addrBits, sr) }],
        else: [
          { kind: 'NonBlockingAssign', lhs: stateRef, rhs: lit4(3) },
          { kind: 'NonBlockingAssign', lhs: stepRef,  rhs: lit3(1) },
          { kind: 'NonBlockingAssign', lhs: addrRef,  rhs: litA(0) },
          { kind: 'NonBlockingAssign', lhs: subRef,   rhs: lit2(0) },
        ],
    }] },
    // 3..6 RW phases (asc 3/4, desc 5/6) — 3 sub-phases each, transitions are
    // structural; the live engine handles the actual fault check. Stub:
    // advance sub-phase; on sub=2 rollover, advance addr; on addr rollover,
    // advance state.
    ...[3, 4, 5, 6].map(stateCode => ({
      label: lit4(stateCode), body: [{
        kind: 'CaseStmt', sourceRef: sr,
        selector: subRef,
        cases: [
          { label: lit2(0), body: [{ kind: 'NonBlockingAssign', lhs: subRef, rhs: lit2(1) }] },
          { label: lit2(1), body: [{ kind: 'NonBlockingAssign', lhs: subRef, rhs: lit2(2) }] },
          { label: lit2(2), body: [{
              kind: 'IfStmt', sourceRef: sr,
              cond: (stateCode === 3 || stateCode === 4)
                    ? makeBinaryOp('<', addrRef, litA(N_minus_1), 1, sr)
                    : makeBinaryOp('>', addrRef, litA(0), 1, sr),
              then: [
                { kind: 'NonBlockingAssign', lhs: subRef, rhs: lit2(0) },
                { kind: 'NonBlockingAssign', lhs: addrRef,
                  rhs: (stateCode === 3 || stateCode === 4)
                       ? makeBinaryOp('+', addrRef, litA(1), addrBits, sr)
                       : makeBinaryOp('-', addrRef, litA(1), addrBits, sr) },
              ],
              else: [
                { kind: 'NonBlockingAssign', lhs: stateRef, rhs: lit4(stateCode + 1) },
                { kind: 'NonBlockingAssign', lhs: stepRef,
                  rhs: lit3(stateCode + 1 - 2) },
                { kind: 'NonBlockingAssign', lhs: subRef,  rhs: lit2(0) },
                { kind: 'NonBlockingAssign', lhs: addrRef,
                  rhs: (stateCode === 3) ? litA(0)
                     : (stateCode === 4) ? litA(N_minus_1)
                     : (stateCode === 5) ? litA(N_minus_1)
                     : litA(0) },
              ],
          }] },
        ],
        default: [],
      }],
    })),
    // 7 READ_FINAL — 2 sub-phases; on addr rollover → DONE
    { label: lit4(7), body: [{
        kind: 'CaseStmt', sourceRef: sr, selector: subRef,
        cases: [
          { label: lit2(0), body: [{ kind: 'NonBlockingAssign', lhs: subRef, rhs: lit2(1) }] },
          { label: lit2(1), body: [{
              kind: 'IfStmt', sourceRef: sr,
              cond: makeBinaryOp('<', addrRef, litA(N_minus_1), 1, sr),
              then: [
                { kind: 'NonBlockingAssign', lhs: subRef, rhs: lit2(0) },
                { kind: 'NonBlockingAssign', lhs: addrRef,
                  rhs: makeBinaryOp('+', addrRef, litA(1), addrBits, sr) },
              ],
              else: [{ kind: 'NonBlockingAssign', lhs: stateRef, rhs: lit4(8) }],
          }] },
        ],
        default: [],
    }] },
    // 8 DONE / 9 FAIL — terminal
    { label: lit4(8), body: [] },
    { label: lit4(9), body: [] },
  ];

  const alwaysBody = [{
    kind: 'IfStmt', sourceRef: sr, cond: resetRef,
    then: [
      { kind: 'NonBlockingAssign', lhs: stateRef,  rhs: lit4(0) },
      { kind: 'NonBlockingAssign', lhs: stepRef,   rhs: lit3(0) },
      { kind: 'NonBlockingAssign', lhs: addrRef,   rhs: litA(0) },
      { kind: 'NonBlockingAssign', lhs: subRef,    rhs: lit2(0) },
      { kind: 'NonBlockingAssign', lhs: failARef,  rhs: litA(0) },
    ],
    else: [{
      kind: 'CaseStmt', sourceRef: sr, selector: stateRef,
      cases, default: [],
    }],
  }];

  // Continuous projections of FSM state onto the 9 outputs.
  const assigns = [];
  if (outDone) assigns.push({
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(outDone.name, 1),
    rhs: makeBinaryOp('||',
      makeBinaryOp('==', stateRef, lit4(8), 1, sr),
      makeBinaryOp('==', stateRef, lit4(9), 1, sr), 1, sr),
  });
  if (outPass) assigns.push({
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(outPass.name, 1),
    rhs: makeBinaryOp('==', stateRef, lit4(8), 1, sr),
  });
  if (outFail) assigns.push({
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(outFail.name, 1),
    rhs: makeBinaryOp('==', stateRef, lit4(9), 1, sr),
  });
  if (outTM) assigns.push({
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(outTM.name, 1),
    rhs: makeBinaryOp('&&',
      makeBinaryOp('!=', stateRef, lit4(0), 1, sr),
      makeBinaryOp('&&',
        makeBinaryOp('!=', stateRef, lit4(8), 1, sr),
        makeBinaryOp('!=', stateRef, lit4(9), 1, sr), 1, sr),
      1, sr),
  });
  if (outSt) assigns.push({
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(outSt.name, 3),
    rhs: makeSlice(stateName, 2, 0, sr),
  });
  if (outAd) assigns.push({
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(outAd.name, addrBits),
    rhs: addrRef,
  });
  // DATA_OUT — 0 unless on a write sub-phase of an odd march step.
  if (outDo) assigns.push({
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(outDo.name, dataBits),
    rhs: makeTernary(
      makeBinaryOp('||',
        makeBinaryOp('==', stepRef, lit3(1), 1, sr),
        makeBinaryOp('==', stepRef, lit3(3), 1, sr), 1, sr),
      litD((1 << dataBits) - 1), litD(0), dataBits, sr),
  });
  // WE = (state == W0_UP) || ((state ∈ {RW1_UP..RW0_DN}) && sub == 2)
  if (outWE) assigns.push({
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(outWE.name, 1),
    rhs: makeBinaryOp('||',
      makeBinaryOp('==', stateRef, lit4(2), 1, sr),
      makeBinaryOp('&&',
        makeBinaryOp('&&',
          makeBinaryOp('>=', stateRef, lit4(3), 1, sr),
          makeBinaryOp('<=', stateRef, lit4(6), 1, sr), 1, sr),
        makeBinaryOp('==', subRef, lit2(2), 1, sr), 1, sr),
      1, sr),
  });
  // RE = ((state ∈ {RW1_UP..RW0_DN}) && sub == 0) || (state == READ_FINAL && sub == 0)
  if (outRE) assigns.push({
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(outRE.name, 1),
    rhs: makeBinaryOp('&&',
      makeBinaryOp('==', subRef, lit2(0), 1, sr),
      makeBinaryOp('||',
        makeBinaryOp('&&',
          makeBinaryOp('>=', stateRef, lit4(3), 1, sr),
          makeBinaryOp('<=', stateRef, lit4(6), 1, sr), 1, sr),
        makeBinaryOp('==', stateRef, lit4(7), 1, sr),
        1, sr),
      1, sr),
  });

  // Suppress unused-warning for dinRef in stage-1 emission (the actual
  // mismatch check is approximated; live engine handles it).
  void dinRef;

  return {
    nets: [stateNet, stepNet, addrNet, subNet, failANet],
    alwaysBlocks: [
      {
        kind: 'Always', sourceRef: sr, attributes: [],
        sensitivity: { initial: true },
        body: [
          { kind: 'BlockingAssign', lhs: stateRef, rhs: lit4(0) },
          { kind: 'BlockingAssign', lhs: stepRef,  rhs: lit3(0) },
          { kind: 'BlockingAssign', lhs: addrRef,  rhs: litA(0) },
          { kind: 'BlockingAssign', lhs: subRef,   rhs: lit2(0) },
          { kind: 'BlockingAssign', lhs: failARef, rhs: litA(0) },
        ],
      },
      {
        kind: 'Always', sourceRef: sr, attributes: [],
        sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
        body: alwaysBody,
      },
    ],
    assigns,
  };
});
