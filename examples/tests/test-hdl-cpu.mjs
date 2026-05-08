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

// ── 5d — RAM (sync write, async read, optional pre-load) ────
console.log('RAM');
{
  const v = exportCircuit({
    nodes: [
      { id: 'addr', type: 'INPUT', label: 'addr', bitWidth: 4 },
      { id: 'data', type: 'INPUT', label: 'data', bitWidth: 8 },
      { id: 'we',   type: 'INPUT', label: 'we' },
      { id: 're',   type: 'INPUT', label: 're' },
      { id: 'clk',  type: 'CLOCK', label: 'clk' },
      { id: 'ram',  type: 'RAM', dataBits: 8, addrBits: 4, label: 'ram',
        memory: { 0: 0x12, 1: 0x34, 2: 0x56 } },
      { id: 'q',    type: 'OUTPUT', label: 'q', bitWidth: 8 },
    ],
    wires: [
      { id: 'w1', sourceId: 'addr', targetId: 'ram', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'data', targetId: 'ram', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'we',   targetId: 'ram', targetInputIndex: 2 },
      { id: 'w4', sourceId: 're',   targetId: 'ram', targetInputIndex: 3 },
      { id: 'w5', sourceId: 'clk',  targetId: 'ram', targetInputIndex: 4, isClockWire: true },
      { id: 'wq', sourceId: 'ram',  targetId: 'q',   targetInputIndex: 0 },
    ],
  }, { topName: 'ram_test', header: false });
  check('RAM: declares 16-cell memory array',
    /reg\s+\[7:0\]\s+mem_ram\s*\[0:15\]/.test(v));
  check('RAM: re-gated async read',
    /assign\s+net_ram_0\s*=\s*\(re\s*\?\s*mem_ram\[addr\]\s*:\s*8'h0\)/.test(v));
  check('RAM: synchronous write inside if(we)',
    /always\s+@\(posedge\s+clk\)[\s\S]*if\s*\(we\)\s*begin[\s\S]*mem_ram\[addr\]\s*<=\s*data/.test(v));
  check('RAM: initial block pre-loads memory cells',
    /initial\s+begin[\s\S]*mem_ram\[4'h0\]\s*=\s*8'h12[\s\S]*mem_ram\[4'h1\]\s*=\s*8'h34/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('RAM: iverilog parses', r.ok, r.stderr);
  }
}

// ── 5e — ROM (read-only memory, async read, pre-loaded) ─────
console.log('ROM');
{
  const v = exportCircuit({
    nodes: [
      { id: 'addr', type: 'INPUT', label: 'addr', bitWidth: 4 },
      { id: 're',   type: 'INPUT', label: 're' },
      { id: 'clk',  type: 'CLOCK', label: 'clk' },
      { id: 'rom',  type: 'ROM', dataBits: 8, addrBits: 4, label: 'rom',
        memory: { 0: 0xa0, 1: 0xb1, 2: 0xc2 } },
      { id: 'q',    type: 'OUTPUT', label: 'q', bitWidth: 8 },
    ],
    wires: [
      { id: 'w1', sourceId: 'addr', targetId: 'rom', targetInputIndex: 0 },
      { id: 'w2', sourceId: 're',   targetId: 'rom', targetInputIndex: 1 },
      { id: 'w3', sourceId: 'clk',  targetId: 'rom', targetInputIndex: 2, isClockWire: true },
      { id: 'wq', sourceId: 'rom',  targetId: 'q',   targetInputIndex: 0 },
    ],
  }, { topName: 'rom_test', header: false });
  check('ROM: declares memory array',     /reg\s+\[7:0\]\s+rom_rom\s*\[0:15\]/.test(v));
  check('ROM: re-gated async read',       /assign\s+net_rom_0\s*=\s*\(re\s*\?\s*rom_rom\[addr\]/.test(v));
  check('ROM: emits no write port (no `always @(posedge clk)`)',
    !/always\s+@\(posedge\s+clk\)/.test(v));
  check('ROM: initial pre-loads memory cells',
    /initial\s+begin[\s\S]*rom_rom\[4'h0\]\s*=\s*8'ha0[\s\S]*rom_rom\[4'h1\]\s*=\s*8'hb1/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('ROM: iverilog parses', r.ok, r.stderr);
  }
}

// ── 5e — TRIBUF (tri-state buffer) ──────────────────────────
console.log('TRIBUF');
{
  const v = exportCircuit({
    nodes: [
      { id: 'a',  type: 'INPUT', label: 'a' },
      { id: 'en', type: 'INPUT', label: 'en' },
      { id: 't',  type: 'GATE_SLOT', gate: 'TRIBUF', label: 't' },
      { id: 'y',  type: 'OUTPUT', label: 'y' },
    ],
    wires: [
      { id: 'w1', sourceId: 'a',  targetId: 't', targetInputIndex: 0 },
      { id: 'w2', sourceId: 'en', targetId: 't', targetInputIndex: 1 },
      { id: 'wy', sourceId: 't',  targetId: 'y', targetInputIndex: 0 },
    ],
  }, { topName: 'tri_test', header: false });
  check('TRIBUF: ternary on EN with high-Z fallback',
    /assign\s+net_t_0\s*=\s*\(en\s*\?\s*a\s*:\s*1'bz\)/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('TRIBUF: iverilog parses', r.ok, r.stderr);
  }
}

// ── 5e — CU (Control Unit, 16-op default ISA) ──────────────
console.log('CU');
{
  const v = exportCircuit({
    nodes: [
      { id: 'op', type: 'INPUT', label: 'op', bitWidth: 4 },
      { id: 'z',  type: 'INPUT', label: 'z' },
      { id: 'c',  type: 'INPUT', label: 'c' },
      { id: 'cu', type: 'CU', bitWidth: 4, label: 'cu' },
      { id: 'aluop', type: 'OUTPUT', label: 'aluop', bitWidth: 3 },
      { id: 'rwe',   type: 'OUTPUT', label: 'rwe' },
      { id: 'jmp',   type: 'OUTPUT', label: 'jmp' },
      { id: 'halt',  type: 'OUTPUT', label: 'halt' },
    ],
    wires: [
      { id: 'wo', sourceId: 'op', targetId: 'cu', targetInputIndex: 0 },
      { id: 'wz', sourceId: 'z',  targetId: 'cu', targetInputIndex: 1 },
      { id: 'wc', sourceId: 'c',  targetId: 'cu', targetInputIndex: 2 },
      { id: 'wa', sourceId: 'cu', sourceOutputIndex: 0, targetId: 'aluop', targetInputIndex: 0 },
      { id: 'wr', sourceId: 'cu', sourceOutputIndex: 1, targetId: 'rwe',   targetInputIndex: 0 },
      { id: 'wj', sourceId: 'cu', sourceOutputIndex: 4, targetId: 'jmp',   targetInputIndex: 0 },
      { id: 'wh', sourceId: 'cu', sourceOutputIndex: 5, targetId: 'halt',  targetInputIndex: 0 },
    ],
  }, { topName: 'cu_test', header: false });
  check('CU: ALU_OP output is 3-bit reg',               /reg\s+\[2:0\]\s+net_cu_0/.test(v));
  check('CU: emits always @(*) with case (op)',         /always\s+@\(\*\)[\s\S]*case\s*\(op\)/.test(v));
  check('CU: ADD arm (4\'h0) assigns ALU_OP=0',         /4'h0:\s*begin[\s\S]*?net_cu_0\s*=\s*3'h0/.test(v));
  check('CU: BEQ arm (4\'hb) assigns JMP <- z',         /4'hb:\s*begin[\s\S]*?=\s*z\s*;[\s\S]*?end/.test(v));
  check('CU: BNE arm (4\'hc) assigns JMP <- ~z',        /4'hc:\s*begin[\s\S]*?=\s*\(~z\)/.test(v));
  check('CU: default arm zeroes outputs',               /default:\s*begin/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('CU: iverilog parses', r.ok, r.stderr);
  }
}

// ── 5e — BUS (multi-driver, lowered to priority-MUX) ───────
console.log('BUS');
{
  const v = exportCircuit({
    nodes: [
      { id: 'd0', type: 'INPUT', label: 'd0', bitWidth: 8 },
      { id: 'e0', type: 'INPUT', label: 'e0' },
      { id: 'd1', type: 'INPUT', label: 'd1', bitWidth: 8 },
      { id: 'e1', type: 'INPUT', label: 'e1' },
      { id: 'd2', type: 'INPUT', label: 'd2', bitWidth: 8 },
      { id: 'e2', type: 'INPUT', label: 'e2' },
      { id: 'b',  type: 'BUS', sourceCount: 3, bitWidth: 8, label: 'bus' },
      { id: 'out', type: 'OUTPUT', label: 'out', bitWidth: 8 },
      { id: 'err', type: 'OUTPUT', label: 'err' },
    ],
    wires: [
      { id: 'w0', sourceId: 'd0', targetId: 'b', targetInputIndex: 0 },
      { id: 'w1', sourceId: 'e0', targetId: 'b', targetInputIndex: 1 },
      { id: 'w2', sourceId: 'd1', targetId: 'b', targetInputIndex: 2 },
      { id: 'w3', sourceId: 'e1', targetId: 'b', targetInputIndex: 3 },
      { id: 'w4', sourceId: 'd2', targetId: 'b', targetInputIndex: 4 },
      { id: 'w5', sourceId: 'e2', targetId: 'b', targetInputIndex: 5 },
      { id: 'wo', sourceId: 'b', sourceOutputIndex: 0, targetId: 'out', targetInputIndex: 0 },
      { id: 'we', sourceId: 'b', sourceOutputIndex: 1, targetId: 'err', targetInputIndex: 0 },
    ],
  }, { topName: 'bus_test', header: false });
  check('BUS: priority chain en0 > en1 > en2',
    /\(e0\s*\?\s*d0\s*:\s*\(e1\s*\?\s*d1\s*:\s*\(e2\s*\?\s*d2/.test(v));
  check('BUS: high-Z fallback when no EN active',
    /:\s*8'bz\)\)\)/.test(v));
  check('BUS: ERR sums zero-extended ENs and compares to 1',
    /\(\(\{1'h0,\s*e0\}\s*\+\s*\{1'h0,\s*e1\}\)\s*\+\s*\{1'h0,\s*e2\}\)\s*>\s*2'h1/.test(v));
  check('BUS: ERR net is 1-bit', /wire\s+net_b_1\b/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('BUS: iverilog parses', r.ok, r.stderr);
  }
}

// ── 5f — FIFO ────────────────────────────────────────────────
console.log('FIFO');
{
  const v = exportCircuit({
    nodes: [
      { id: 'data', type: 'INPUT', label: 'data', bitWidth: 8 },
      { id: 'wr',   type: 'INPUT', label: 'wr' },
      { id: 'rd',   type: 'INPUT', label: 'rd' },
      { id: 'clr',  type: 'INPUT', label: 'clr' },
      { id: 'clk',  type: 'CLOCK', label: 'clk' },
      { id: 'fifo', type: 'FIFO',  depth: 8, dataBits: 8, label: 'fifo' },
      { id: 'q',    type: 'OUTPUT', label: 'q',     bitWidth: 8 },
      { id: 'full', type: 'OUTPUT', label: 'full' },
      { id: 'emp',  type: 'OUTPUT', label: 'emp' },
    ],
    wires: [
      { id: 'w0', sourceId: 'data', targetId: 'fifo', targetInputIndex: 0 },
      { id: 'w1', sourceId: 'wr',   targetId: 'fifo', targetInputIndex: 1 },
      { id: 'w2', sourceId: 'rd',   targetId: 'fifo', targetInputIndex: 2 },
      { id: 'w3', sourceId: 'clr',  targetId: 'fifo', targetInputIndex: 3 },
      { id: 'w4', sourceId: 'clk',  targetId: 'fifo', targetInputIndex: 4 },
      { id: 'wo', sourceId: 'fifo', sourceOutputIndex: 0, targetId: 'q',    targetInputIndex: 0 },
      { id: 'wf', sourceId: 'fifo', sourceOutputIndex: 1, targetId: 'full', targetInputIndex: 0 },
      { id: 'we', sourceId: 'fifo', sourceOutputIndex: 2, targetId: 'emp',  targetInputIndex: 0 },
    ],
  }, { topName: 'fifo_test', header: false });
  check('FIFO: declares 8x8 memory',
    /reg\s+\[7:0\]\s+mem_fifo\s+\[0:7\]/.test(v));
  check('FIFO: declares head/tail/count regs',
    /reg\s+\[3:0\]\s+head_fifo/.test(v) &&
    /reg\s+\[3:0\]\s+tail_fifo/.test(v) &&
    /reg\s+\[3:0\]\s+count_fifo/.test(v));
  check('FIFO: FULL = (count == DEPTH)',
    /=\s*\(count_fifo\s*==\s*4'h8\)/.test(v));
  check('FIFO: EMPTY = (count == 0)',
    /=\s*\(count_fifo\s*==\s*4'h0\)/.test(v));
  check('FIFO: do_wr/do_rd factored as wires',
    /assign\s+do_wr_fifo\s*=\s*\(wr\s*&&\s*\(count_fifo\s*<\s*4'h8\)\)/.test(v) &&
    /assign\s+do_rd_fifo\s*=\s*\(rd\s*&&\s*\(count_fifo\s*>\s*4'h0\)\)/.test(v));
  check('FIFO: count update reads do_wr/do_rd (no triplication)',
    /if\s+\(\(do_wr_fifo\s*&&\s*\(!do_rd_fifo\)\)\)/.test(v));
  check('FIFO: posedge clk sensitivity',
    /always\s+@\(posedge\s+clk\)/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('FIFO: iverilog parses', r.ok, r.stderr);
  }
}

// ── 5f — STACK ───────────────────────────────────────────────
console.log('STACK');
{
  const v = exportCircuit({
    nodes: [
      { id: 'data', type: 'INPUT', label: 'data', bitWidth: 8 },
      { id: 'psh',  type: 'INPUT', label: 'psh' },
      { id: 'pop',  type: 'INPUT', label: 'pop' },
      { id: 'clr',  type: 'INPUT', label: 'clr' },
      { id: 'clk',  type: 'CLOCK', label: 'clk' },
      { id: 'stk',  type: 'STACK', depth: 4, dataBits: 8, label: 'stk' },
      { id: 'q',    type: 'OUTPUT', label: 'q',     bitWidth: 8 },
      { id: 'full', type: 'OUTPUT', label: 'full' },
      { id: 'emp',  type: 'OUTPUT', label: 'emp' },
    ],
    wires: [
      { id: 'w0', sourceId: 'data', targetId: 'stk', targetInputIndex: 0 },
      { id: 'w1', sourceId: 'psh',  targetId: 'stk', targetInputIndex: 1 },
      { id: 'w2', sourceId: 'pop',  targetId: 'stk', targetInputIndex: 2 },
      { id: 'w3', sourceId: 'clr',  targetId: 'stk', targetInputIndex: 3 },
      { id: 'w4', sourceId: 'clk',  targetId: 'stk', targetInputIndex: 4 },
      { id: 'wo', sourceId: 'stk', sourceOutputIndex: 0, targetId: 'q',    targetInputIndex: 0 },
      { id: 'wf', sourceId: 'stk', sourceOutputIndex: 1, targetId: 'full', targetInputIndex: 0 },
      { id: 'we', sourceId: 'stk', sourceOutputIndex: 2, targetId: 'emp',  targetInputIndex: 0 },
    ],
  }, { topName: 'stack_test', header: false });
  check('STACK: declares 4x8 memory',
    /reg\s+\[7:0\]\s+mem_stk\s+\[0:3\]/.test(v));
  check('STACK: declares sp reg (3-bit, fits 0..4)',
    /reg\s+\[2:0\]\s+sp_stk/.test(v));
  check('STACK: PUSH > POP priority',
    /if\s+\(\(psh\s*&&\s*\(sp_stk\s*<\s*3'h4\)\)\)\s*begin[\s\S]*?end\s+else\s+begin\s+if\s+\(\(pop\s*&&/.test(v));
  check('STACK: PUSH writes mem[sp]',
    /mem_stk\[sp_stk\]\s*<=\s*data/.test(v));
  check('STACK: POP reads mem[sp-1]',
    /<=\s*mem_stk\[\(sp_stk\s*-\s*3'h1\)\]/.test(v));
  if (isIverilogAvailable()) {
    const r = parseCheck(v);
    check('STACK: iverilog parses', r.ok, r.stderr);
  }
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
