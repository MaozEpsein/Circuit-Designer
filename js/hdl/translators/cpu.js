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
  makeTernary, makeSlice, makeIndex, makeConcat, makeNet, makeMemory, NET_KIND,
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
// Lowering: a single `always @(*) case (op) ... endcase` block sets R
// and C together — same idiom as the CU translator. R and C are upgraded
// to `reg` (out.regNets); Z stays a continuous assign that compares R
// to zero. ADD carry comes from a (W+1)-bit width-extended sum; SUB
// borrow is `a < b`; CMP carry is `a > b`; everything else is 0.
// A `default` arm zeroes both outputs so no opcode value can infer a
// latch even if OP is somehow out-of-range at simulation time.
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
  const opW = opNet.width || 3;
  const op = makeRef(opNet.name, opW);
  const opLit = (n) => makeLiteral(n, opW, sr);
  const lit0W = makeLiteral(0, W, sr);
  const lit01 = makeLiteral(0, 1, sr);

  const rRef = makeRef(rNet.name, W);
  const cRef = cNet ? makeRef(cNet.name, 1) : null;

  // Width-extended addition wire so we can slice the carry-out cleanly.
  // Continuous-assigned outside the always block; the case body just
  // references its top bit.
  const extName = `${rNet.name}_addext`;
  const extraNets = [
    makeNet({ name: extName, width: W + 1, kind: NET_KIND.WIRE, sourceRef: sr }),
  ];
  const aExt = { kind: 'Concat', sourceRef: sr, attributes: [],
    parts: [makeLiteral(0, 1, sr), a], width: W + 1 };
  const bExt = { kind: 'Concat', sourceRef: sr, attributes: [],
    parts: [makeLiteral(0, 1, sr), b], width: W + 1 };
  const assigns = [{
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(extName, W + 1),
    rhs: makeBinaryOp('+', aExt, bExt, W + 1, sr),
  }];

  // Per-op (rExpr, cExpr) tuples. The R column produces a value of W
  // bits; the C column produces a 1-bit flag (0 when not meaningful
  // for that op so it never goes "stuck" between cycles).
  const addCarry  = makeSlice(extName, W, W, sr);
  const subBorrow = makeBinaryOp('<', a, b, 1, sr);
  const cmpGT     = makeBinaryOp('>', a, b, 1, sr);
  const arms = [
    { op: 0, r: makeBinaryOp('+',  a, b, W, sr),                              c: addCarry  },
    { op: 1, r: makeBinaryOp('-',  a, b, W, sr),                              c: subBorrow },
    { op: 2, r: makeBinaryOp('&',  a, b, W, sr),                              c: lit01     },
    { op: 3, r: makeBinaryOp('|',  a, b, W, sr),                              c: lit01     },
    { op: 4, r: makeBinaryOp('^',  a, b, W, sr),                              c: lit01     },
    { op: 5, r: makeBinaryOp('<<', a, b, W, sr),                              c: lit01     },
    { op: 6, r: makeBinaryOp('>>', a, b, W, sr),                              c: lit01     },
    { op: 7, r: makeTernary(                                                                    // CMP
        makeBinaryOp('==', a, b, 1, sr),
        lit0W,
        makeBinaryOp('-', a, b, W, sr),
        W, sr),
      c: cmpGT },
  ];

  const cases = arms.map(arm => ({
    label: opLit(arm.op),
    body: cRef
      ? [
          { kind: 'BlockingAssign', sourceRef: sr, lhs: rRef, rhs: arm.r },
          { kind: 'BlockingAssign', sourceRef: sr, lhs: cRef, rhs: arm.c },
        ]
      : [
          { kind: 'BlockingAssign', sourceRef: sr, lhs: rRef, rhs: arm.r },
        ],
  }));
  const defaultBody = cRef
    ? [
        { kind: 'BlockingAssign', sourceRef: sr, lhs: rRef, rhs: lit0W },
        { kind: 'BlockingAssign', sourceRef: sr, lhs: cRef, rhs: lit01 },
      ]
    : [
        { kind: 'BlockingAssign', sourceRef: sr, lhs: rRef, rhs: lit0W },
      ];

  const alwaysBlk = {
    kind: 'Always', sourceRef: sr, attributes: [],
    sensitivity: { star: true },
    body: [{ kind: 'CaseStmt', sourceRef: sr,
      selector: op, cases, default: defaultBody }],
  };

  // Z is a clean continuous assign — there's no benefit to driving it
  // from inside the always block.
  if (zNet) {
    assigns.push({
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(zNet.name, 1),
      rhs: makeBinaryOp('==', rRef, lit0W, 1, sr),
    });
  }

  const regNets = [rNet.name];
  if (cNet) regNets.push(cNet.name);
  return {
    assigns,
    nets: extraNets,
    alwaysBlocks: [alwaysBlk],
    regNets,
  };
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

// ── RAM (sync write, async read) ────────────────────────────
// Pin layout (mirroring SimulationEngine):
//   ADDR(0), DATA(1), WE(2), RE(3), CLK(4) → Q (rd data)
//
// Verilog form:
//   reg [W-1:0] mem [0:DEPTH-1];
//   always @(posedge clk) if (we) mem[addr] <= data;
//   assign rd_data = re ? mem[addr] : W'h0;
//
// Pre-loaded memory contents (from node.memory) are emitted as an
// `initial` block — synth-friendly on FPGAs (BRAM init), simulation-
// correct in iverilog. ASIC users would replace this with a $readmemh
// or a reset path; same caveat as LFSR's seed.
registerTranslator(COMPONENT_TYPES.RAM, (node, ctx) => {
  const sr      = SourceRef.fromNode(node.id);
  const W       = node.dataBits || 8;
  const addrBits= node.addrBits || 4;
  const depth   = 1 << addrBits;

  const addrNet = ctx.inputNet(node.id, 0);
  const dataNet = ctx.inputNet(node.id, 1);
  const weNet   = ctx.inputNet(node.id, 2);
  const reNet   = ctx.inputNet(node.id, 3);
  const clkNet  = ctx.inputNet(node.id, 4);
  if (!addrNet || !clkNet) return {};

  const memName = `mem_${node.id}`;
  const memory = makeMemory({
    instanceName: memName, width: W, depth, sourceRef: sr,
  });

  const qNet = ctx.netByEndpoint.get(`${node.id}:0`);
  if (!qNet) return {};

  const memRead = makeIndex(memName, makeRef(addrNet.name, addrBits), W, sr);
  const readExpr = reNet
    ? makeTernary(makeRef(reNet.name, 1), memRead, makeLiteral(0, W, sr), W, sr)
    : memRead;

  const result = {
    memories: [memory],
    assigns: [{
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(qNet.name, W),
      rhs: readExpr,
    }],
    alwaysBlocks: [],
  };

  // Synchronous write port — only when DATA + WE are wired.
  if (dataNet && weNet) {
    result.alwaysBlocks.push({
      kind: 'Always', sourceRef: sr, attributes: [],
      sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
      body: [{
        kind: 'IfStmt', sourceRef: sr,
        cond: makeRef(weNet.name, 1),
        then: [{
          kind: 'NonBlockingAssign',
          lhs: makeIndex(memName, makeRef(addrNet.name, addrBits), W, sr),
          rhs: makeRef(dataNet.name, W),
        }],
        else: null,
      }],
    });
  }

  // Optional pre-loaded contents. Emit one BlockingAssign per cell in
  // an `initial` block. Skip if memory is empty / absent.
  if (node.memory && typeof node.memory === 'object') {
    const inits = [];
    for (const [k, v] of Object.entries(node.memory)) {
      const idx = parseInt(k, 10);
      if (!Number.isFinite(idx) || idx < 0 || idx >= depth) continue;
      inits.push({
        kind: 'BlockingAssign',
        lhs: makeIndex(memName, makeLiteral(idx, addrBits, sr), W, sr),
        rhs: makeLiteral(v | 0, W, sr),
      });
    }
    if (inits.length) {
      result.alwaysBlocks.push({
        kind: 'Always', sourceRef: sr, attributes: [],
        sensitivity: { initial: true },
        body: inits,
      });
    }
  }

  return result;
});

// ── CU (Control Unit) ────────────────────────────────────────
// Combinational decoder: 3 inputs (OP, Z, C) → 7 control outputs.
// Pin layout:
//   OP(0), Z(1), C(2) → ALU_OP(0), RG_WE(1), MM_WE(2), MM_RE(3),
//                       JMP(4), HALT(5), IMM(6)
//
// Lowering strategy: per-output nested-ternary chain over the OP
// value. Each opcode contributes one row of values; the chain walks
// 0..N-1 with the deepest "else" branch yielding zeros.
//
// node.controlTable (if present) drives the opcode → control mapping.
// Otherwise the default 16-op ISA from the engine is used. JMP rows
// with negative jmp codes are conditional:
//   row.jmp = -1  →  jmp = z       (BEQ)
//   row.jmp = -3  →  jmp = ~z      (BNE)
//   row.jmp =  1  →  jmp = 1       (unconditional)
//   row.jmp =  0  →  jmp = 0       (no jump)
const _DEFAULT_CU_TABLE = (() => {
  // Mirror SimulationEngine._evalCU's default switch exactly.
  const t = [];
  for (let op = 0; op < 16; op++) t[op] = { aluOp:0, regWe:0, memWe:0, memRe:0, jmp:0, halt:0, immSel:0 };
  for (let op = 0; op < 7;  op++) { t[op].aluOp = op; t[op].regWe = 1; }
  t[7].aluOp = 7;                                                // CMP
  t[8].regWe = 1; t[8].memRe = 1;                                 // LOAD
  t[9].memWe = 1;                                                 // STORE
  t[10].jmp = 1;                                                  // JMP
  t[11].aluOp = 7; t[11].jmp = -1;                                // BEQ
  t[12].aluOp = 7; t[12].jmp = -3;                                // BNE
  t[13].regWe = 1; t[13].immSel = 1;                              // LDI
  t[15].halt = 1;                                                 // HALT
  return t;
})();

registerTranslator(COMPONENT_TYPES.CU, (node, ctx) => {
  const sr = SourceRef.fromNode(node.id);

  const opNet = ctx.inputNet(node.id, 0);
  const zNet  = ctx.inputNet(node.id, 1);
  const cNet  = ctx.inputNet(node.id, 2);
  if (!opNet) return {};

  const table = Array.isArray(node.controlTable) && node.controlTable.length
    ? node.controlTable
    : _DEFAULT_CU_TABLE;

  // ALU_OP width is 3 bits (the engine masks `op & 7`); other outputs
  // are 1-bit. OP input width comes from node.bitWidth or 4.
  const opW = node.bitWidth || 4;
  const opRef = makeRef(opNet.name, opW);
  const lit0  = makeLiteral(0, 1, sr);
  const lit1  = makeLiteral(1, 1, sr);

  // Resolve the per-row JMP expression:
  //   1  → 1'b1
  //   0  → 1'b0
  //   -1 → z
  //   -3 → ~z
  // (Other negative codes from extended ISA fall back to 0.)
  const jmpExprFor = (jmpCode) => {
    if (jmpCode === 1) return lit1;
    if (jmpCode === -1 && zNet) return makeRef(zNet.name, 1);
    if (jmpCode === -3 && zNet) return makeUnaryOp('~', makeRef(zNet.name, 1), 1, sr);
    return lit0;
  };

  // Outputs (only those actually wired are driven).
  const outs = [
    { net: ctx.netByEndpoint.get(`${node.id}:0`), w: 3, key: 'aluOp', kind: 'aluOp' },
    { net: ctx.netByEndpoint.get(`${node.id}:1`), w: 1, key: 'regWe', kind: 'bit' },
    { net: ctx.netByEndpoint.get(`${node.id}:2`), w: 1, key: 'memWe', kind: 'bit' },
    { net: ctx.netByEndpoint.get(`${node.id}:3`), w: 1, key: 'memRe', kind: 'bit' },
    { net: ctx.netByEndpoint.get(`${node.id}:4`), w: 1, key: 'jmp',   kind: 'jmp' },
    { net: ctx.netByEndpoint.get(`${node.id}:5`), w: 1, key: 'halt',   kind: 'bit' },
    { net: ctx.netByEndpoint.get(`${node.id}:6`), w: 1, key: 'immSel', kind: 'bit' },
  ];
  const wiredOuts = outs.filter(o => o.net);
  if (wiredOuts.length === 0) return {};

  const rowExpr = (row, o) => {
    if (o.kind === 'aluOp') return makeLiteral((row.aluOp ?? 0) & 7, 3, sr);
    if (o.kind === 'jmp')   return jmpExprFor(row.jmp ?? 0);
    return makeLiteral(row[o.key] ? 1 : 0, 1, sr);
  };
  const zeroExpr = (o) => makeLiteral(0, o.w, sr);

  // Build one case arm per opcode; each arm assigns all wired outputs.
  const cases = [];
  for (let op = 0; op < table.length; op++) {
    const row = table[op];
    const body = wiredOuts.map(o => ({
      kind: 'BlockingAssign', sourceRef: sr, attributes: [],
      lhs: makeRef(o.net.name, o.w),
      rhs: rowExpr(row, o),
    }));
    cases.push({ label: makeLiteral(op, opW, sr), body });
  }
  // Default: all wired outputs to 0 (prevents latch inference for any
  // opcode value outside the table).
  const defaultBody = wiredOuts.map(o => ({
    kind: 'BlockingAssign', sourceRef: sr, attributes: [],
    lhs: makeRef(o.net.name, o.w),
    rhs: zeroExpr(o),
  }));

  const alwaysBlk = {
    kind: 'Always', sourceRef: sr, attributes: [],
    sensitivity: { star: true },
    body: [{
      kind: 'CaseStmt', sourceRef: sr,
      selector: opRef,
      cases,
      default: defaultBody,
    }],
  };

  return {
    alwaysBlocks: [alwaysBlk],
    regNets: wiredOuts.map(o => o.net.name),
  };
});

// ── BUS (multi-driver tri-state, lowered to one-hot priority) ─
// Pin layout: pairs of (D_i, EN_i) for `sourceCount` drivers, then
// the implicit clock (none for combinational BUS).
//   Inputs: D0(0), EN0(1), D1(2), EN1(3), …
//   Outputs: out0 = bus value, out1 = ERR (more than one EN active)
//
// Lowering: each (Di, ENi) pair becomes a ternary. Highest-priority
// driver wins (by index order). When no EN is asserted, the chain
// falls through to high-Z (`1'bz`). ERR is the population-count of
// EN signals being > 1, computed via per-bit zero-extend + add.
//
// This is the canonical lowerTriState path the README plan called
// for at Phase 5 — synthesis-safe (no internal multi-driver tri-state,
// only one continuous assign on the bus net).
registerTranslator(COMPONENT_TYPES.BUS, (node, ctx) => {
  const sr = SourceRef.fromNode(node.id);
  const W  = node.bitWidth || 8;
  const N  = node.sourceCount || 3;

  const dataNets = [];
  const enNets   = [];
  for (let i = 0; i < N; i++) {
    dataNets.push(ctx.inputNet(node.id, i * 2));
    enNets.push(ctx.inputNet(node.id, i * 2 + 1));
  }
  // At least one wired pair is needed; missing pairs use 0/0.
  if (enNets.every(e => !e) || dataNets.every(d => !d)) return {};

  const outNet = ctx.netByEndpoint.get(`${node.id}:0`);
  const errNet = ctx.netByEndpoint.get(`${node.id}:1`);
  if (!outNet) return {};

  const hiZ = { kind: 'Literal', sourceRef: sr, attributes: [],
    value: 0, width: W, _verilog: `${W}'bz` };

  // Priority chain: en0 ? d0 : (en1 ? d1 : ... : <hiZ>)
  let busExpr = hiZ;
  for (let i = N - 1; i >= 0; i--) {
    const dRef = dataNets[i] ? makeRef(dataNets[i].name, W) : makeLiteral(0, W, sr);
    const enRef = enNets[i] ? makeRef(enNets[i].name, 1) : makeLiteral(0, 1, sr);
    busExpr = makeTernary(enRef, dRef, busExpr, W, sr);
  }

  const assigns = [{
    kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(outNet.name, W),
    rhs: busExpr,
  }];

  // ERR: more than one EN active. Sum each EN bit zero-extended to
  // the width needed to count N drivers, then compare.
  if (errNet) {
    // Width to hold count up to N: ceil(log2(N+1)) bits.
    const cntW = Math.max(1, Math.ceil(Math.log2(N + 1)));
    let sum = null;
    for (let i = 0; i < N; i++) {
      const enRef = enNets[i] ? makeRef(enNets[i].name, 1) : makeLiteral(0, 1, sr);
      // Zero-extend to cntW bits via concat.
      const padW = cntW - 1;
      const enExt = padW > 0
        ? { kind: 'Concat', sourceRef: sr, attributes: [],
            parts: [makeLiteral(0, padW, sr), enRef], width: cntW }
        : enRef;
      sum = sum ? makeBinaryOp('+', sum, enExt, cntW, sr) : enExt;
    }
    assigns.push({
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(errNet.name, 1),
      rhs: makeBinaryOp('>', sum, makeLiteral(1, cntW, sr), 1, sr),
    });
  }

  return { assigns };
});

// ── ROM (read-only memory, pre-loaded contents) ─────────────
// Pin layout (mirroring SimulationEngine):
//   ADDR(0), RE(1), CLK(2) → Q (rd data)
//
// Verilog form: like RAM but with no write port. The memory is
// initialised at sim-start via an `initial` block populated from
// `node.memory`. RE-gated async read — match the engine's "hold on
// re=0" with `re ? mem[addr] : 0`.
//
// asyncRead is the canvas default; sync-read variants would need a
// separate Q reg, deferred until a user actually requests it.
registerTranslator(COMPONENT_TYPES.ROM, (node, ctx) => {
  const sr      = SourceRef.fromNode(node.id);
  const W       = node.dataBits || 8;
  const addrBits= node.addrBits || 4;
  const depth   = 1 << addrBits;

  const addrNet = ctx.inputNet(node.id, 0);
  const reNet   = ctx.inputNet(node.id, 1);
  // CLK pin exists but ROM is read-only and async — we don't need it.
  if (!addrNet) return {};

  const memName = `rom_${node.id}`;
  const memory = makeMemory({
    instanceName: memName, width: W, depth, sourceRef: sr,
  });

  const qNet = ctx.netByEndpoint.get(`${node.id}:0`);
  if (!qNet) return {};

  const memRead = makeIndex(memName, makeRef(addrNet.name, addrBits), W, sr);
  const readExpr = reNet
    ? makeTernary(makeRef(reNet.name, 1), memRead, makeLiteral(0, W, sr), W, sr)
    : memRead;

  const result = {
    memories: [memory],
    assigns: [{
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(qNet.name, W),
      rhs: readExpr,
    }],
    alwaysBlocks: [],
  };

  if (node.memory && typeof node.memory === 'object') {
    const inits = [];
    for (const [k, v] of Object.entries(node.memory)) {
      const idx = parseInt(k, 10);
      if (!Number.isFinite(idx) || idx < 0 || idx >= depth) continue;
      inits.push({
        kind: 'BlockingAssign',
        lhs: makeIndex(memName, makeLiteral(idx, addrBits, sr), W, sr),
        rhs: makeLiteral(v | 0, W, sr),
      });
    }
    if (inits.length) {
      result.alwaysBlocks.push({
        kind: 'Always', sourceRef: sr, attributes: [],
        sensitivity: { initial: true },
        body: inits,
      });
    }
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

// ── FIFO (synchronous queue) ────────────────────────────────
// Pin layout (mirroring SimulationEngine):
//   DATA(0), WR(1), RD(2), CLR(3), CLK(4) → Q (front), FULL, EMPTY
//
// Verilog form: a memory + head/tail pointers + count. Reads are
// destructive: when RD is asserted, Q latches the front and head
// advances. FULL/EMPTY come from the count comparator. Pointer wrap
// uses an explicit `(p + 1 == DEPTH) ? 0 : p + 1` to support
// non-power-of-2 depths.
registerTranslator(COMPONENT_TYPES.FIFO, (node, ctx) => {
  const sr      = SourceRef.fromNode(node.id);
  const W       = node.dataBits || 8;
  const depth   = Math.max(1, node.depth || 8);
  const ptrW    = Math.max(1, Math.ceil(Math.log2(depth + 1)));

  const dataNet = ctx.inputNet(node.id, 0);
  const wrNet   = ctx.inputNet(node.id, 1);
  const rdNet   = ctx.inputNet(node.id, 2);
  const clrNet  = ctx.inputNet(node.id, 3);
  const clkNet  = ctx.inputNet(node.id, 4);
  if (!clkNet) return {};

  const qNet     = ctx.netByEndpoint.get(`${node.id}:0`);
  const fullNet  = ctx.netByEndpoint.get(`${node.id}:1`);
  const emptyNet = ctx.netByEndpoint.get(`${node.id}:2`);

  const memName  = `mem_${node.id}`;
  const headName = `head_${node.id}`;
  const tailName = `tail_${node.id}`;
  const cntName  = `count_${node.id}`;
  const qIntName = `q_${node.id}`;

  const memory = makeMemory({ instanceName: memName, width: W, depth, sourceRef: sr });
  const headNet = makeNet({ name: headName, width: ptrW, kind: NET_KIND.REG, sourceRef: sr });
  const tailNet = makeNet({ name: tailName, width: ptrW, kind: NET_KIND.REG, sourceRef: sr });
  const cntNet  = makeNet({ name: cntName,  width: ptrW, kind: NET_KIND.REG, sourceRef: sr });
  const qIntNet = makeNet({ name: qIntName, width: W,    kind: NET_KIND.REG, sourceRef: sr });
  // Effective op gates (wire-level, not reg). Defining them once removes
  // the `wr && count<DEPTH` / `rd && count>0` triplication that previously
  // lived inside each branch — so the count update reads as one obvious
  // 4-state case (do_wr, do_rd) ∈ {00, 01, 10, 11} → {hold, -1, +1, hold}.
  const doWrName = `do_wr_${node.id}`;
  const doRdName = `do_rd_${node.id}`;
  const doWrNet = makeNet({ name: doWrName, width: 1, kind: NET_KIND.WIRE, sourceRef: sr });
  const doRdNet = makeNet({ name: doRdName, width: 1, kind: NET_KIND.WIRE, sourceRef: sr });

  const headRef = makeRef(headName, ptrW);
  const tailRef = makeRef(tailName, ptrW);
  const cntRef  = makeRef(cntName,  ptrW);
  const qIntRef = makeRef(qIntName, W);
  const doWrRef = makeRef(doWrName, 1);
  const doRdRef = makeRef(doRdName, 1);
  const litDepth = makeLiteral(depth, ptrW, sr);
  const lit0p   = makeLiteral(0, ptrW, sr);
  const lit1p   = makeLiteral(1, ptrW, sr);

  const wrRef   = wrNet  ? makeRef(wrNet.name, 1)  : makeLiteral(0, 1, sr);
  const rdRef   = rdNet  ? makeRef(rdNet.name, 1)  : makeLiteral(0, 1, sr);
  const dataRef = dataNet ? makeRef(dataNet.name, W) : makeLiteral(0, W, sr);

  const notFull  = makeBinaryOp('<', cntRef, litDepth, 1, sr);
  const notEmpty = makeBinaryOp('>', cntRef, lit0p, 1, sr);

  const assigns = [];
  // do_wr / do_rd defined first so later asserts read top-down.
  assigns.push({ kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: doWrRef, rhs: makeBinaryOp('&&', wrRef, notFull, 1, sr) });
  assigns.push({ kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: doRdRef, rhs: makeBinaryOp('&&', rdRef, notEmpty, 1, sr) });
  if (qNet) assigns.push({ kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(qNet.name, W), rhs: qIntRef });
  if (fullNet) assigns.push({ kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(fullNet.name, 1),
    rhs: makeBinaryOp('==', cntRef, litDepth, 1, sr) });
  if (emptyNet) assigns.push({ kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(emptyNet.name, 1),
    rhs: makeBinaryOp('==', cntRef, lit0p, 1, sr) });

  const wrap = (pRef) => makeTernary(
    makeBinaryOp('==',
      makeBinaryOp('+', pRef, lit1p, ptrW, sr),
      litDepth, 1, sr),
    lit0p,
    makeBinaryOp('+', pRef, lit1p, ptrW, sr),
    ptrW, sr,
  );

  const writeBranch = {
    kind: 'IfStmt', sourceRef: sr,
    cond: doWrRef,
    then: [
      { kind: 'NonBlockingAssign',
        lhs: makeIndex(memName, tailRef, W, sr), rhs: dataRef },
      { kind: 'NonBlockingAssign', lhs: tailRef, rhs: wrap(tailRef) },
    ],
    else: null,
  };
  const readBranch = {
    kind: 'IfStmt', sourceRef: sr,
    cond: doRdRef,
    then: [
      { kind: 'NonBlockingAssign', lhs: qIntRef,
        rhs: makeIndex(memName, headRef, W, sr) },
      { kind: 'NonBlockingAssign', lhs: headRef, rhs: wrap(headRef) },
    ],
    else: null,
  };
  // Count update: do_wr alone → +1; do_rd alone → -1; both/neither → hold.
  const countBranch = {
    kind: 'IfStmt', sourceRef: sr,
    cond: makeBinaryOp('&&', doWrRef, makeUnaryOp('!', doRdRef, 1, sr), 1, sr),
    then: [{ kind: 'NonBlockingAssign', lhs: cntRef,
      rhs: makeBinaryOp('+', cntRef, lit1p, ptrW, sr) }],
    else: [{
      kind: 'IfStmt', sourceRef: sr,
      cond: makeBinaryOp('&&', doRdRef, makeUnaryOp('!', doWrRef, 1, sr), 1, sr),
      then: [{ kind: 'NonBlockingAssign', lhs: cntRef,
        rhs: makeBinaryOp('-', cntRef, lit1p, ptrW, sr) }],
      else: null,
    }],
  };

  const clrRef = clrNet ? makeRef(clrNet.name, 1) : null;
  const nonClr = [writeBranch, readBranch, countBranch];
  const body = clrRef ? [{
    kind: 'IfStmt', sourceRef: sr, cond: clrRef,
    then: [
      { kind: 'NonBlockingAssign', lhs: headRef, rhs: lit0p },
      { kind: 'NonBlockingAssign', lhs: tailRef, rhs: lit0p },
      { kind: 'NonBlockingAssign', lhs: cntRef,  rhs: lit0p },
    ],
    else: nonClr,
  }] : nonClr;

  return {
    memories: [memory],
    nets: [headNet, tailNet, cntNet, qIntNet, doWrNet, doRdNet],
    assigns,
    alwaysBlocks: [{
      kind: 'Always', sourceRef: sr, attributes: [],
      sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
      body,
    }],
  };
});

// ── STACK (synchronous LIFO) ────────────────────────────────
// Pin layout (mirroring SimulationEngine):
//   DATA(0), PUSH(1), POP(2), CLR(3), CLK(4) → Q (top), FULL, EMPTY
//
// SP names the next-free slot (0 = empty, DEPTH = full). PUSH writes
// mem[sp] then sp++; POP latches Q from mem[sp-1] then sp--. PUSH and
// POP are mutually exclusive — when both asserted, PUSH wins (matches
// the engine's `if push else if pop`).
registerTranslator(COMPONENT_TYPES.STACK, (node, ctx) => {
  const sr     = SourceRef.fromNode(node.id);
  const W      = node.dataBits || 8;
  const depth  = Math.max(1, node.depth || 8);
  const ptrW   = Math.max(1, Math.ceil(Math.log2(depth + 1)));

  const dataNet = ctx.inputNet(node.id, 0);
  const pushNet = ctx.inputNet(node.id, 1);
  const popNet  = ctx.inputNet(node.id, 2);
  const clrNet  = ctx.inputNet(node.id, 3);
  const clkNet  = ctx.inputNet(node.id, 4);
  if (!clkNet) return {};

  const qNet     = ctx.netByEndpoint.get(`${node.id}:0`);
  const fullNet  = ctx.netByEndpoint.get(`${node.id}:1`);
  const emptyNet = ctx.netByEndpoint.get(`${node.id}:2`);

  const memName  = `mem_${node.id}`;
  const spName   = `sp_${node.id}`;
  const qIntName = `q_${node.id}`;

  const memory = makeMemory({ instanceName: memName, width: W, depth, sourceRef: sr });
  const spNet   = makeNet({ name: spName,   width: ptrW, kind: NET_KIND.REG, sourceRef: sr });
  const qIntNet = makeNet({ name: qIntName, width: W,    kind: NET_KIND.REG, sourceRef: sr });

  const spRef   = makeRef(spName, ptrW);
  const qIntRef = makeRef(qIntName, W);
  const litDepth = makeLiteral(depth, ptrW, sr);
  const lit0p   = makeLiteral(0, ptrW, sr);
  const lit1p   = makeLiteral(1, ptrW, sr);

  const pushRef = pushNet ? makeRef(pushNet.name, 1) : makeLiteral(0, 1, sr);
  const popRef  = popNet  ? makeRef(popNet.name,  1) : makeLiteral(0, 1, sr);
  const dataRef = dataNet ? makeRef(dataNet.name, W) : makeLiteral(0, W, sr);

  const assigns = [];
  if (qNet) assigns.push({ kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(qNet.name, W), rhs: qIntRef });
  if (fullNet) assigns.push({ kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(fullNet.name, 1),
    rhs: makeBinaryOp('==', spRef, litDepth, 1, sr) });
  if (emptyNet) assigns.push({ kind: 'Assign', sourceRef: sr, attributes: [],
    lhs: makeRef(emptyNet.name, 1),
    rhs: makeBinaryOp('==', spRef, lit0p, 1, sr) });

  const notFull  = makeBinaryOp('<', spRef, litDepth, 1, sr);
  const notEmpty = makeBinaryOp('>', spRef, lit0p, 1, sr);

  const pushBranch = [
    { kind: 'NonBlockingAssign',
      lhs: makeIndex(memName, spRef, W, sr), rhs: dataRef },
    { kind: 'NonBlockingAssign', lhs: spRef,
      rhs: makeBinaryOp('+', spRef, lit1p, ptrW, sr) },
  ];
  const popBranch = [
    { kind: 'NonBlockingAssign', lhs: qIntRef,
      rhs: makeIndex(memName,
        makeBinaryOp('-', spRef, lit1p, ptrW, sr), W, sr) },
    { kind: 'NonBlockingAssign', lhs: spRef,
      rhs: makeBinaryOp('-', spRef, lit1p, ptrW, sr) },
  ];

  const opChain = {
    kind: 'IfStmt', sourceRef: sr,
    cond: makeBinaryOp('&&', pushRef, notFull, 1, sr),
    then: pushBranch,
    else: [{
      kind: 'IfStmt', sourceRef: sr,
      cond: makeBinaryOp('&&', popRef, notEmpty, 1, sr),
      then: popBranch,
      else: null,
    }],
  };

  const clrRef = clrNet ? makeRef(clrNet.name, 1) : null;
  const body = clrRef ? [{
    kind: 'IfStmt', sourceRef: sr, cond: clrRef,
    then: [{ kind: 'NonBlockingAssign', lhs: spRef, rhs: lit0p }],
    else: [opChain],
  }] : [opChain];

  return {
    memories: [memory],
    nets: [spNet, qIntNet],
    assigns,
    alwaysBlocks: [{
      kind: 'Always', sourceRef: sr, attributes: [],
      sensitivity: { triggers: [{ edge: 'posedge', signal: clkNet.name }] },
      body,
    }],
  };
});
