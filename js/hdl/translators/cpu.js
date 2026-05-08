// CPU-component translators. Phase 5 builds these out incrementally:
//   5a (this commit): IMM + PC
//   5b: ALU, IR
//   5c: REG_FILE, REG_FILE_DP
//   5d: RAM
//   5e: ROM, CU, BUS
//   5f: FIFO, STACK
//
// IMM is pure-combinational (a constant injector). PC is a clocked
// register with a CLR > JUMP > EN priority chain — structurally close
// to COUNTER but with an external jump target instead of a load value.

import { COMPONENT_TYPES } from '../../components/Component.js';
import { registerTranslator } from './index.js';
import {
  makeRef, makeBinaryOp, makeUnaryOp, makeLiteral, makeSignExtend,
  makeTernary, makeSlice, makeIndex, makeNet, makeMemory, NET_KIND,
} from '../ir/types.js';
import { SourceRef } from '../core/SourceRef.js';

function _outNet(ctx, nodeId, outIdx) {
  return ctx.netByEndpoint.get(`${nodeId}:${outIdx}`) || null;
}

// Local copy of the priority-chain helper. It builds an if/else-if
// chain from a list of { cond, body[] } guards. Same shape as the
// one in registers.js — kept duplicated to avoid a fragile shared-
// helper export across translator files.
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
  if (guards.length > 1) node.else = _priorityChain(guards.slice(1));
  return [node];
}

// ── IMM (constant injector) ─────────────────────────────────
// No inputs. Single output: a constant value of width bitWidth. The
// value is the node's `value` prop (defaults to 0). Lowers to a
// continuous `assign out = N'hVALUE;` — no clock, no state.
registerTranslator(COMPONENT_TYPES.IMM, (node, ctx) => {
  const W = node.bitWidth || 8;
  const value = (node.value ?? 0) | 0;
  const sr = SourceRef.fromNode(node.id);

  const qNet = _outNet(ctx, node.id, 0);
  if (!qNet) return {};

  return {
    assigns: [{
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(qNet.name, W),
      rhs: makeLiteral(value, W, sr),
    }],
  };
});

// ── PC (program counter) ────────────────────────────────────
// Pin layout (mirroring SimulationEngine):
//   JUMP_ADDR(0), JUMP(1), EN(2), CLR(3), CLK(4) → PC
//
// Priority semantics:
//   CLR              → pc <= 0
//   else JUMP        → pc <= jumpAddr               (absolute jump)
//                     or pc <= pc + 1 + signExt(jumpAddr)
//                                                    (when pcRelative)
//   else EN          → pc <= pc + 1
//   else             → hold
//
// pcRelative is a node prop — when set, the JUMP branch treats
// jumpAddr as a signed offset rather than an absolute address.
registerTranslator(COMPONENT_TYPES.PC, (node, ctx) => {
  const W   = node.bitWidth || 8;
  const sr  = SourceRef.fromNode(node.id);

  const jumpAddrNet = ctx.inputNet(node.id, 0);
  const jumpNet     = ctx.inputNet(node.id, 1);
  const enNet       = ctx.inputNet(node.id, 2);
  const clrNet      = ctx.inputNet(node.id, 3);
  const clkNet      = ctx.inputNet(node.id, 4);
  if (!clkNet) return {};

  const qNet = _outNet(ctx, node.id, 0);
  if (!qNet) return {};

  const qRef = makeRef(qNet.name, W);
  const zero = makeLiteral(0, W, sr);
  const inc  = makeBinaryOp('+', qRef, makeLiteral(1, W, sr), W, sr);

  const guards = [];
  if (clrNet) guards.push({
    cond: makeRef(clrNet.name, 1),
    body: [{ kind: 'NonBlockingAssign', lhs: qRef, rhs: zero }],
  });
  if (jumpNet && jumpAddrNet) {
    let jumpRhs;
    if (node.pcRelative) {
      // PC <= PC + 1 + signExt(offset, W). The signExt of an already
      // W-bit value is a no-op; we use the IR node anyway so an
      // importer can recover the original semantic intent.
      const off = makeSignExtend(makeRef(jumpAddrNet.name, W), W, sr);
      const pcPlus1 = makeBinaryOp('+', qRef, makeLiteral(1, W, sr), W, sr);
      jumpRhs = makeBinaryOp('+', pcPlus1, off, W, sr);
    } else {
      jumpRhs = makeRef(jumpAddrNet.name, W);
    }
    guards.push({
      cond: makeRef(jumpNet.name, 1),
      body: [{ kind: 'NonBlockingAssign', lhs: qRef, rhs: jumpRhs }],
    });
  }
  guards.push({
    cond: enNet ? makeRef(enNet.name, 1) : makeLiteral(1, 1, sr),
    body: [{ kind: 'NonBlockingAssign', lhs: qRef, rhs: inc }],
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

// ── ALU (combinational) ─────────────────────────────────────
// Pin layout (mirroring SimulationEngine):
//   A(0), B(1), OP(2) → R(out0), Z(out1, 1-bit), C(out2, 1-bit)
//
// Op encoding (3-bit OP):
//   0 ADD, 1 SUB, 2 AND, 3 OR, 4 XOR, 5 SHL, 6 SHR, 7 CMP (or SRA when sraMode)
//
// Result (R) is built as a nested-ternary chain on OP. Z = (R == 0).
// C combines ADD overflow (high bit of width-extended sum), SUB
// borrow (a < b), and 0 for the rest. To pick up the ADD carry we
// declare an extra (W+1)-bit internal wire `<id>_addext = {1'b0,a}+{1'b0,b}`
// so its top bit can be sliced cleanly.
registerTranslator(COMPONENT_TYPES.ALU, (node, ctx) => {
  const sr = SourceRef.fromNode(node.id);
  const W  = node.bitWidth || 8;

  const aNet  = ctx.inputNet(node.id, 0);
  const bNet  = ctx.inputNet(node.id, 1);
  const opNet = ctx.inputNet(node.id, 2);
  if (!aNet || !bNet || !opNet) return {};

  const rNet = ctx.netByEndpoint.get(`${node.id}:0`);
  const zNet = ctx.netByEndpoint.get(`${node.id}:1`);
  const cNet = ctx.netByEndpoint.get(`${node.id}:2`);
  if (!rNet) return {};

  const a  = makeRef(aNet.name, W);
  const b  = makeRef(bNet.name, W);
  const op = makeRef(opNet.name, opNet.width || 3);
  const opLit = (n) => makeLiteral(n, opNet.width || 3, sr);

  // Build the result chain. OP=7 is CMP (a == b ? 0 : a - b) unless
  // sraMode is set; we follow the canvas default and emit CMP. SRA
  // requires shift-by-variable on signed which iverilog handles
  // with $signed, but our canvas usage of OP=7 is mostly CMP.
  const ops = [
    makeBinaryOp('+', a, b, W, sr),                                                 // ADD
    makeBinaryOp('-', a, b, W, sr),                                                 // SUB
    makeBinaryOp('&', a, b, W, sr),                                                 // AND
    makeBinaryOp('|', a, b, W, sr),                                                 // OR
    makeBinaryOp('^', a, b, W, sr),                                                 // XOR
    makeBinaryOp('<<', a, b, W, sr),                                                // SHL
    makeBinaryOp('>>', a, b, W, sr),                                                // SHR
    makeTernary(                                                                    // CMP / SRA
      makeBinaryOp('==', a, b, 1, sr),
      makeLiteral(0, W, sr),
      makeBinaryOp('-', a, b, W, sr),
      W, sr,
    ),
  ];
  let rExpr = ops[ops.length - 1];
  for (let k = ops.length - 2; k >= 0; k--) {
    rExpr = makeTernary(
      makeBinaryOp('==', op, opLit(k), 1, sr),
      ops[k], rExpr, W, sr,
    );
  }

  const assigns = [{
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(rNet.name, W),
    rhs: rExpr,
  }];

  if (zNet) {
    assigns.push({
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(zNet.name, 1),
      rhs: makeBinaryOp('==', makeRef(rNet.name, W), makeLiteral(0, W, sr), 1, sr),
    });
  }

  // C flag: extra (W+1)-bit wire for the ADD carry, then a ternary
  // chain selecting the right "carry" based on op.
  const extraNets = [];
  if (cNet) {
    const extName = `${rNet.name}_addext`;
    extraNets.push(makeNet({ name: extName, width: W + 1, kind: NET_KIND.WIRE, sourceRef: sr }));
    // {1'b0, a} + {1'b0, b}  via concat — re-uses makeConcat through
    // a hand-built Concat node so we don't have to import it just for one use.
    const aExt = { kind: 'Concat', sourceRef: sr, attributes: [],
      parts: [makeLiteral(0, 1, sr), a], width: W + 1 };
    const bExt = { kind: 'Concat', sourceRef: sr, attributes: [],
      parts: [makeLiteral(0, 1, sr), b], width: W + 1 };
    assigns.push({
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(extName, W + 1),
      rhs: makeBinaryOp('+', aExt, bExt, W + 1, sr),
    });
    const addCarry = makeSlice(extName, W, W, sr);
    const subBorrow = makeBinaryOp('<', a, b, 1, sr);
    const cmpGT     = makeBinaryOp('>', a, b, 1, sr);
    // op == 0 → ADD carry; op == 1 → SUB borrow; op == 7 → CMP greater; else 0.
    let cExpr = makeLiteral(0, 1, sr);
    cExpr = makeTernary(makeBinaryOp('==', op, opLit(7), 1, sr), cmpGT,    cExpr, 1, sr);
    cExpr = makeTernary(makeBinaryOp('==', op, opLit(1), 1, sr), subBorrow,cExpr, 1, sr);
    cExpr = makeTernary(makeBinaryOp('==', op, opLit(0), 1, sr), addCarry, cExpr, 1, sr);
    assigns.push({
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(cNet.name, 1),
      rhs: cExpr,
    });
  }

  return { assigns, nets: extraNets };
});

// ── REG_FILE (single-port read, single-port write) ──────────
// Pin layout (mirroring SimulationEngine):
//   RD_ADDR(0), WR_ADDR(1), WR_DATA(2), WE(3), CLK(4) → Q (rd data)
//
// Verilog form:
//   reg [W-1:0] regs [0:DEPTH-1];
//   always @(posedge clk) if (we) regs[wr_addr] <= wr_data;
//   assign rd_data = regs[rd_addr];
//
// Asynchronous read by default (matches the engine's model).
registerTranslator(COMPONENT_TYPES.REG_FILE, (node, ctx) => {
  const sr      = SourceRef.fromNode(node.id);
  const W       = node.dataBits || node.bitWidth || 8;
  const regCnt  = node.regCount || 8;
  const addrW   = Math.max(1, Math.ceil(Math.log2(regCnt)));

  const rdAddrNet = ctx.inputNet(node.id, 0);
  const wrAddrNet = ctx.inputNet(node.id, 1);
  const wrDataNet = ctx.inputNet(node.id, 2);
  const weNet     = ctx.inputNet(node.id, 3);
  const clkNet    = ctx.inputNet(node.id, 4);
  if (!rdAddrNet || !clkNet) return {};

  const memName = `regs_${node.id}`;
  const memory = makeMemory({
    instanceName: memName, width: W, depth: regCnt,
    sourceRef: sr,
  });

  const qNet = ctx.netByEndpoint.get(`${node.id}:0`);
  if (!qNet) return {};

  const result = {
    memories: [memory],
    assigns: [{
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(qNet.name, W),
      rhs: makeIndex(memName, makeRef(rdAddrNet.name, addrW), W, sr),
    }],
  };

  // Write port — present only when WR_DATA, WR_ADDR, WE are all wired.
  if (wrAddrNet && wrDataNet && weNet) {
    result.alwaysBlocks = [{
      kind: 'Always', sourceRef: sr, attributes: [],
      sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
      body: [{
        kind: 'IfStmt', sourceRef: sr,
        cond: makeRef(weNet.name, 1),
        then: [{
          kind: 'NonBlockingAssign',
          lhs: makeIndex(memName, makeRef(wrAddrNet.name, addrW), W, sr),
          rhs: makeRef(wrDataNet.name, W),
        }],
        else: null,
      }],
    }];
  }

  return result;
});

// ── REG_FILE_DP (dual-port read, single-port write) ─────────
// Pin layout (mirroring SimulationEngine):
//   RD1_ADDR(0), RD2_ADDR(1), WR_ADDR(2), WR_DATA(3), WE(4), CLK(5)
//   → out0 = RD1_DATA, out1 = RD2_DATA
//
// Same memory + write semantics as REG_FILE; just two read ports
// instead of one.
registerTranslator(COMPONENT_TYPES.REG_FILE_DP, (node, ctx) => {
  const sr      = SourceRef.fromNode(node.id);
  const W       = node.dataBits || node.bitWidth || 8;
  const regCnt  = node.regCount || 8;
  const addrW   = Math.max(1, Math.ceil(Math.log2(regCnt)));

  const rd1AddrNet = ctx.inputNet(node.id, 0);
  const rd2AddrNet = ctx.inputNet(node.id, 1);
  const wrAddrNet  = ctx.inputNet(node.id, 2);
  const wrDataNet  = ctx.inputNet(node.id, 3);
  const weNet      = ctx.inputNet(node.id, 4);
  const clkNet     = ctx.inputNet(node.id, 5);
  if (!clkNet) return {};

  const memName = `regs_${node.id}`;
  const memory = makeMemory({
    instanceName: memName, width: W, depth: regCnt,
    sourceRef: sr,
  });

  const rd1Net = ctx.netByEndpoint.get(`${node.id}:0`);
  const rd2Net = ctx.netByEndpoint.get(`${node.id}:1`);

  const assigns = [];
  if (rd1AddrNet && rd1Net) {
    assigns.push({
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(rd1Net.name, W),
      rhs: makeIndex(memName, makeRef(rd1AddrNet.name, addrW), W, sr),
    });
  }
  if (rd2AddrNet && rd2Net) {
    assigns.push({
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(rd2Net.name, W),
      rhs: makeIndex(memName, makeRef(rd2AddrNet.name, addrW), W, sr),
    });
  }

  const result = {
    memories: [memory],
    assigns,
  };

  if (wrAddrNet && wrDataNet && weNet) {
    result.alwaysBlocks = [{
      kind: 'Always', sourceRef: sr, attributes: [],
      sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
      body: [{
        kind: 'IfStmt', sourceRef: sr,
        cond: makeRef(weNet.name, 1),
        then: [{
          kind: 'NonBlockingAssign',
          lhs: makeIndex(memName, makeRef(wrAddrNet.name, addrW), W, sr),
          rhs: makeRef(wrDataNet.name, W),
        }],
        else: null,
      }],
    }];
  }

  return result;
});

// ── IR (Instruction Register) ───────────────────────────────
// Pin layout: INSTR(0), LD(1), CLK(2). Outputs are slices of the
// latched instruction word:
//   out0=OP  bits[W-1            : W-opBits]
//   out1=RD  bits[W-opBits-1     : W-opBits-rdBits]
//   out2=RS1 bits[rs2Bits+rs1Bits-1 : rs2Bits]
//   out3=RS2 bits[rs2Bits-1      : 0]
// Total instruction width W = opBits + rdBits + rs1Bits + rs2Bits.
registerTranslator(COMPONENT_TYPES.IR, (node, ctx) => {
  const sr = SourceRef.fromNode(node.id);
  const opBits  = node.opBits  ?? 4;
  const rdBits  = node.rdBits  ?? 4;
  const rs1Bits = node.rs1Bits ?? 4;
  const rs2Bits = node.rs2Bits ?? 4;
  const W = opBits + rdBits + rs1Bits + rs2Bits;

  const instrNet = ctx.inputNet(node.id, 0);
  const ldNet    = ctx.inputNet(node.id, 1);
  const clkNet   = ctx.inputNet(node.id, 2);
  if (!instrNet || !clkNet) return {};

  // The latched instruction lives in an internal reg, since each
  // canvas wire from IR's outputs is one of the four field slices —
  // none carry the full instruction by itself.
  const stateName = `ir_${node.id}_instr`;
  const stateNet  = makeNet({
    name: stateName, width: W, kind: NET_KIND.REG, sourceRef: sr,
  });
  const stateRef  = makeRef(stateName, W);

  const out0 = ctx.netByEndpoint.get(`${node.id}:0`);    // OP
  const out1 = ctx.netByEndpoint.get(`${node.id}:1`);    // RD
  const out2 = ctx.netByEndpoint.get(`${node.id}:2`);    // RS1
  const out3 = ctx.netByEndpoint.get(`${node.id}:3`);    // RS2

  // Field slices (Verilog slice [hi:lo]).
  const sliceOP  = [W - 1,                 W - opBits];
  const sliceRD  = [W - opBits - 1,        W - opBits - rdBits];
  const sliceRS1 = [rs2Bits + rs1Bits - 1, rs2Bits];
  const sliceRS2 = [rs2Bits - 1,           0];

  const assigns = [];
  const slot = (net, [hi, lo]) => {
    if (!net) return;
    assigns.push({
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(net.name, hi - lo + 1),
      rhs: makeSlice(stateName, hi, lo, sr),
    });
  };
  slot(out0, sliceOP);
  slot(out1, sliceRD);
  slot(out2, sliceRS1);
  slot(out3, sliceRS2);

  // Latch on rising clock when LD asserted (default LD=1 if unwired).
  const ldRef = ldNet ? makeRef(ldNet.name, 1) : makeLiteral(1, 1, sr);
  return {
    nets: [stateNet],
    assigns,
    alwaysBlocks: [{
      kind: 'Always', sourceRef: sr, attributes: [],
      sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
      body: [{
        kind: 'IfStmt', sourceRef: sr,
        cond: ldRef,
        then: [{
          kind: 'NonBlockingAssign',
          lhs: stateRef,
          rhs: makeRef(instrNet.name, W),
        }],
        else: null,
      }],
    }],
  };
});
