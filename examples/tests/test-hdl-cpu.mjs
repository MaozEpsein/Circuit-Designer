// Phase 5 — CPU & memory translators.
//   5a (this commit): IMM + PC.
//   Subsequent substeps: ALU, IR, REG_FILE, RAM, ROM, CU, BUS,
//   FIFO, STACK.
//
// Run:  node examples/tests/test-hdl-cpu.mjs

import { exportCircuit } from '../../js/hdl/VerilogExporter.js';
import { parseCheck, isIverilogAvailable } from '../../js/hdl/verify/iverilog.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('\n-- HDL Phase 5 — CPU & memory translators --');

// ── 5a — IMM (constant injector) ─────────────────────────────
console.log('IMM');
{
  const v = exportCircuit({
    nodes: [
      { id: 'imm', type: 'IMM', value: 42, bitWidth: 8, label: 'imm' },
      { id: 'q',   type: 'OUTPUT', label: 'q', bitWidth: 8 },
    ],
    wires: [
      { id: 'w', sourceId: 'imm', targetId: 'q', targetInputIndex: 0 },
    ],
  }, { topName: 'imm_test', header: false });
  // 42 decimal = 0x2a
  check('IMM: emits literal of correct width and value',
    /assign\s+net_imm_0\s*=\s*8'h2a/.test(v));
  check('IMM: net is 8-bit', /wire\s+\[7:0\]\s+net_imm_0/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('IMM: iverilog parses', r.ok, r.stderr);
  }
}

// ── 5a — PC (program counter, absolute jump) ─────────────────
console.log('PC (absolute jump)');
{
  const v = exportCircuit({
    nodes: [
      { id: 'jaddr', type: 'INPUT', label: 'jaddr', bitWidth: 8 },
      { id: 'jump',  type: 'INPUT', label: 'jump' },
      { id: 'en',    type: 'INPUT', label: 'en' },
      { id: 'clr',   type: 'INPUT', label: 'clr' },
      { id: 'clk',   type: 'CLOCK', label: 'clk' },
      { id: 'pc',    type: 'PC', bitWidth: 8, label: 'pc' },
      { id: 'q',     type: 'OUTPUT', label: 'q', bitWidth: 8 },
    ],
    wires: [
      { id: 'w1', sourceId: 'jaddr', targetId: 'pc', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'jump',  targetId: 'pc', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'en',    targetId: 'pc', targetInputIndex: 2 },
      { id: 'w4', sourceId: 'clr',   targetId: 'pc', targetInputIndex: 3 },
      { id: 'w5', sourceId: 'clk',   targetId: 'pc', targetInputIndex: 4, isClockWire: true },
      { id: 'wq', sourceId: 'pc',    targetId: 'q',  targetInputIndex: 0 },
    ],
  }, { topName: 'pc_test', header: false });
  check('PC: 8-bit reg declaration',          /reg\s+\[7:0\]\s+net_pc_0/.test(v));
  check('PC: CLR has highest priority',       /if\s*\(clr\)\s*begin[\s\S]*<=\s*8'h0/.test(v));
  check('PC: JUMP loads jaddr absolutely',    /if\s*\(jump\)\s*begin[\s\S]*<=\s*jaddr/.test(v));
  check('PC: EN-gated increment',             /if\s*\(en\)\s*begin[\s\S]*<=\s*\(net_pc_0\s*\+\s*8'h1\)/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('PC: iverilog parses', r.ok, r.stderr);
  }
}

// PC with pcRelative — JUMP branch becomes pc + 1 + signExt(offset)
console.log('PC (pcRelative)');
{
  const v = exportCircuit({
    nodes: [
      { id: 'off',  type: 'INPUT', label: 'off', bitWidth: 8 },
      { id: 'jump', type: 'INPUT', label: 'jump' },
      { id: 'clk',  type: 'CLOCK', label: 'clk' },
      { id: 'pc',   type: 'PC', bitWidth: 8, pcRelative: true, label: 'pc' },
      { id: 'q',    type: 'OUTPUT', label: 'q', bitWidth: 8 },
    ],
    wires: [
      { id: 'w1', sourceId: 'off',  targetId: 'pc', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'jump', targetId: 'pc', targetInputIndex: 1 },
      { id: 'w5', sourceId: 'clk',  targetId: 'pc', targetInputIndex: 4, isClockWire: true },
      { id: 'wq', sourceId: 'pc',   targetId: 'q',  targetInputIndex: 0 },
    ],
  }, { topName: 'pcrel_test', header: false });
  check('PC pcRelative: JUMP branch is pc + 1 + offset',
    /<=\s*\(\(net_pc_0\s*\+\s*8'h1\)\s*\+\s*off\)/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('PC pcRelative: iverilog parses', r.ok, r.stderr);
  }
}

// ── 5b — ALU (combinational, 3-bit op encoding) ─────────────
console.log('ALU');
{
  const v = exportCircuit({
    nodes: [
      { id: 'a', type: 'INPUT', label: 'a', bitWidth: 8 },
      { id: 'b', type: 'INPUT', label: 'b', bitWidth: 8 },
      { id: 'op', type: 'INPUT', label: 'op', bitWidth: 3 },
      { id: 'alu', type: 'ALU', bitWidth: 8, label: 'alu' },
      { id: 'r', type: 'OUTPUT', label: 'r', bitWidth: 8 },
      { id: 'z', type: 'OUTPUT', label: 'z' },
      { id: 'c', type: 'OUTPUT', label: 'c' },
    ],
    wires: [
      { id: 'wa', sourceId: 'a',  targetId: 'alu', targetInputIndex: 0 },
      { id: 'wb', sourceId: 'b',  targetId: 'alu', targetInputIndex: 1 },
      { id: 'wo', sourceId: 'op', targetId: 'alu', targetInputIndex: 2 },
      { id: 'wr', sourceId: 'alu', sourceOutputIndex: 0, targetId: 'r', targetInputIndex: 0 },
      { id: 'wz', sourceId: 'alu', sourceOutputIndex: 1, targetId: 'z', targetInputIndex: 0 },
      { id: 'wc', sourceId: 'alu', sourceOutputIndex: 2, targetId: 'c', targetInputIndex: 0 },
    ],
  }, { topName: 'alu_test', header: false });
  check('ALU: ADD branch (op == 3\'h0) → (a + b)',
    /\(op\s*==\s*3'h0\)\s*\?\s*\(a\s*\+\s*b\)/.test(v));
  check('ALU: SUB branch (op == 3\'h1) → (a - b)',
    /\(op\s*==\s*3'h1\)\s*\?\s*\(a\s*-\s*b\)/.test(v));
  check('ALU: Z = (R == 0)',
    /assign\s+net_alu_1\s*=\s*\(net_alu_0\s*==\s*8'h0\)/.test(v));
  check('ALU: extra addext wire is W+1 bits',
    /wire\s+\[8:0\]\s+net_alu_0_addext/.test(v));
  check('ALU: C selects addext[W] for ADD',
    /\(op\s*==\s*3'h0\)\s*\?\s*net_alu_0_addext\[8\]/.test(v));
  check('ALU: Z and C nets are 1-bit',
    /wire\s+net_alu_1\b/.test(v) && /wire\s+net_alu_2\b/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('ALU: iverilog parses', r.ok, r.stderr);
  }
}

// ── 5b — IR (instruction register, 4 fields) ────────────────
console.log('IR');
{
  const v = exportCircuit({
    nodes: [
      { id: 'instr', type: 'INPUT', label: 'instr', bitWidth: 16 },
      { id: 'ld',    type: 'INPUT', label: 'ld' },
      { id: 'clk',   type: 'CLOCK', label: 'clk' },
      { id: 'ir',    type: 'IR', opBits: 4, rdBits: 4, rs1Bits: 4, rs2Bits: 4, label: 'ir' },
      { id: 'op',    type: 'OUTPUT', label: 'op',  bitWidth: 4 },
      { id: 'rd',    type: 'OUTPUT', label: 'rd',  bitWidth: 4 },
      { id: 'rs1',   type: 'OUTPUT', label: 'rs1', bitWidth: 4 },
      { id: 'rs2',   type: 'OUTPUT', label: 'rs2', bitWidth: 4 },
    ],
    wires: [
      { id: 'wi', sourceId: 'instr', targetId: 'ir', targetInputIndex: 0 },
      { id: 'wl', sourceId: 'ld',    targetId: 'ir', targetInputIndex: 1 },
      { id: 'wk', sourceId: 'clk',   targetId: 'ir', targetInputIndex: 2, isClockWire: true },
      { id: 'wo', sourceId: 'ir',    sourceOutputIndex: 0, targetId: 'op',  targetInputIndex: 0 },
      { id: 'wr', sourceId: 'ir',    sourceOutputIndex: 1, targetId: 'rd',  targetInputIndex: 0 },
      { id: 'wr1',sourceId: 'ir',    sourceOutputIndex: 2, targetId: 'rs1', targetInputIndex: 0 },
      { id: 'wr2',sourceId: 'ir',    sourceOutputIndex: 3, targetId: 'rs2', targetInputIndex: 0 },
    ],
  }, { topName: 'ir_test', header: false });
  check('IR: declares 16-bit internal reg',
    /reg\s+\[15:0\]\s+ir_ir_instr/.test(v));
  check('IR: OP slice is high 4 bits',  /assign\s+net_ir_0\s*=\s*ir_ir_instr\[15:12\]/.test(v));
  check('IR: RD slice is bits[11:8]',   /assign\s+net_ir_1\s*=\s*ir_ir_instr\[11:8\]/.test(v));
  check('IR: RS1 slice is bits[7:4]',   /assign\s+net_ir_2\s*=\s*ir_ir_instr\[7:4\]/.test(v));
  check('IR: RS2 slice is bits[3:0]',   /assign\s+net_ir_3\s*=\s*ir_ir_instr\[3:0\]/.test(v));
  check('IR: latched on rising clock when LD',
    /always\s+@\(posedge\s+clk\)\s+begin[\s\S]*if\s*\(ld\)\s*begin[\s\S]*ir_ir_instr\s*<=\s*instr/.test(v));
  check('IR: each output net has its own bit count',
    /wire\s+\[3:0\]\s+net_ir_0/.test(v) &&
    /wire\s+\[3:0\]\s+net_ir_3/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('IR: iverilog parses', r.ok, r.stderr);
  }
}

// ── 5c — REG_FILE (single-port read, single-port write) ────
console.log('REG_FILE');
{
  const v = exportCircuit({
    nodes: [
      { id: 'rd_a',  type: 'INPUT', label: 'rd_a', bitWidth: 3 },
      { id: 'wr_a',  type: 'INPUT', label: 'wr_a', bitWidth: 3 },
      { id: 'wr_d',  type: 'INPUT', label: 'wr_d', bitWidth: 8 },
      { id: 'we',    type: 'INPUT', label: 'we' },
      { id: 'clk',   type: 'CLOCK', label: 'clk' },
      { id: 'rf',    type: 'REG_FILE', dataBits: 8, regCount: 8, label: 'rf' },
      { id: 'q',     type: 'OUTPUT', label: 'q', bitWidth: 8 },
    ],
    wires: [
      { id: 'w1', sourceId: 'rd_a', targetId: 'rf', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'wr_a', targetId: 'rf', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'wr_d', targetId: 'rf', targetInputIndex: 2 },
      { id: 'w4', sourceId: 'we',   targetId: 'rf', targetInputIndex: 3 },
      { id: 'w5', sourceId: 'clk',  targetId: 'rf', targetInputIndex: 4, isClockWire: true },
      { id: 'wq', sourceId: 'rf',   targetId: 'q',  targetInputIndex: 0 },
    ],
  }, { topName: 'rf_test', header: false });
  check('REG_FILE: declares memory array',
    /reg\s+\[7:0\]\s+regs_rf\s*\[0:7\]/.test(v));
  check('REG_FILE: async read via index',
    /assign\s+net_rf_0\s*=\s*regs_rf\[rd_a\]/.test(v));
  check('REG_FILE: synchronous write inside if(we)',
    /always\s+@\(posedge\s+clk\)[\s\S]*if\s*\(we\)\s*begin[\s\S]*regs_rf\[wr_a\]\s*<=\s*wr_d/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('REG_FILE: iverilog parses', r.ok, r.stderr);
  }
}

// ── 5c — REG_FILE_DP (dual-port read, single-port write) ───
console.log('REG_FILE_DP');
{
  const v = exportCircuit({
    nodes: [
      { id: 'rd1', type: 'INPUT', label: 'rd1', bitWidth: 3 },
      { id: 'rd2', type: 'INPUT', label: 'rd2', bitWidth: 3 },
      { id: 'wa',  type: 'INPUT', label: 'wa', bitWidth: 3 },
      { id: 'wd',  type: 'INPUT', label: 'wd', bitWidth: 8 },
      { id: 'we',  type: 'INPUT', label: 'we' },
      { id: 'clk', type: 'CLOCK', label: 'clk' },
      { id: 'rf',  type: 'REG_FILE_DP', dataBits: 8, regCount: 8, label: 'rf' },
      { id: 'q1',  type: 'OUTPUT', label: 'q1', bitWidth: 8 },
      { id: 'q2',  type: 'OUTPUT', label: 'q2', bitWidth: 8 },
    ],
    wires: [
      { id: 'w0', sourceId: 'rd1', targetId: 'rf', targetInputIndex: 0 },
      { id: 'w1', sourceId: 'rd2', targetId: 'rf', targetInputIndex: 1 },
      { id: 'w2', sourceId: 'wa',  targetId: 'rf', targetInputIndex: 2 },
      { id: 'w3', sourceId: 'wd',  targetId: 'rf', targetInputIndex: 3 },
      { id: 'w4', sourceId: 'we',  targetId: 'rf', targetInputIndex: 4 },
      { id: 'w5', sourceId: 'clk', targetId: 'rf', targetInputIndex: 5, isClockWire: true },
      { id: 'wq1', sourceId: 'rf', sourceOutputIndex: 0, targetId: 'q1', targetInputIndex: 0 },
      { id: 'wq2', sourceId: 'rf', sourceOutputIndex: 1, targetId: 'q2', targetInputIndex: 0 },
    ],
  }, { topName: 'rf_dp_test', header: false });
  check('REG_FILE_DP: declares memory array', /reg\s+\[7:0\]\s+regs_rf\s*\[0:7\]/.test(v));
  check('REG_FILE_DP: rd1 reads regs[rd1]', /assign\s+net_rf_0\s*=\s*regs_rf\[rd1\]/.test(v));
  check('REG_FILE_DP: rd2 reads regs[rd2]', /assign\s+net_rf_1\s*=\s*regs_rf\[rd2\]/.test(v));
  check('REG_FILE_DP: shared write port', /regs_rf\[wa\]\s*<=\s*wd/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('REG_FILE_DP: iverilog parses', r.ok, r.stderr);
  }
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
