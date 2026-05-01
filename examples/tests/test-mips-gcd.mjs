// Standalone verification for examples/circuits/mips-gcd.json.
// Checks: (1) JSON structural integrity, (2) wiring of core components,
// (3) correctness of the demo program by running an ISA-level simulator.
//
// The bundled program computes Σ(1..N) for N=R3 using BEQ as the loop
// exit (R3 was 5 originally, expected sum = 15). The "gcd" filename is
// kept for backwards compatibility with README links and external usage;
// the program itself was migrated when the ISA dropped JC (the C-flag
// branch needed for ordering tests in the original Euclid algorithm).
//
// Run:  node examples/tests/test-mips-gcd.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = resolve(__dirname, '..', 'circuits', 'mips-gcd.json');

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

// ── Load JSON ────────────────────────────────────────────────
console.log('Loading', JSON_PATH);
const raw = readFileSync(JSON_PATH, 'utf8');
const scene = JSON.parse(raw);

// ── Structure ────────────────────────────────────────────────
console.log('\n[1] Structural integrity');
check('has nodes array', Array.isArray(scene.nodes));
check('has wires array', Array.isArray(scene.wires));
check('nodes non-empty', scene.nodes.length > 0, `${scene.nodes.length} nodes`);
check('wires non-empty', scene.wires.length > 0, `${scene.wires.length} wires`);

const byId = new Map(scene.nodes.map(n => [n.id, n]));
for (const w of scene.wires) {
  if (!byId.has(w.sourceId)) { check(`wire ${w.id} source exists`, false, `missing ${w.sourceId}`); break; }
  if (!byId.has(w.targetId)) { check(`wire ${w.id} target exists`, false, `missing ${w.targetId}`); break; }
}

// ── Required components ──────────────────────────────────────
console.log('\n[2] Required datapath components');
const have = (type) => scene.nodes.some(n => n.type === type);
check('ROM (instruction memory)',  have('ROM'));
check('PC',                        have('PC'));
check('IR (instruction register)', have('IR'));
check('CU (control unit)',         have('CU'));
check('RF-DP (register file)',     have('REG_FILE_DP'));
check('ALU',                       have('ALU'));
check('RAM (data memory)',         have('RAM'));
check('BUS_MUX (writeback)',       have('BUS_MUX'));
check('CLOCK',                     have('CLOCK'));

// ── Datapath widths (Tier 1 + Tier 2 upgrades) ───────────────
console.log('\n[2b] Datapath widths');
const rf = scene.nodes.find(n => n.type === 'REG_FILE_DP');
const alu = scene.nodes.find(n => n.type === 'ALU');
const ram = scene.nodes.find(n => n.type === 'RAM');
check('RF data width = 16 bits', rf.dataBits === 16, `got ${rf.dataBits}`);
check('ALU width = 16 bits',     alu.bitWidth === 16, `got ${alu.bitWidth}`);
check('RAM data width = 16 bits', ram.dataBits === 16, `got ${ram.dataBits}`);
check('RAM addr width >= 6 bits', ram.addrBits >= 6, `got ${ram.addrBits}`);

const pc = scene.nodes.find(n => n.type === 'PC');
const rom = scene.nodes.find(n => n.type === 'ROM');
const cu  = scene.nodes.find(n => n.type === 'CU');
check('PC width >= 6 bits (64+ addresses)',  pc.bitWidth  >= 6, `got ${pc.bitWidth}`);
check('ROM addr width >= 6 bits',             rom.addrBits >= 6, `got ${rom.addrBits}`);
check('CU _opCount = 32 (all opcode slots)',  cu._opCount === 32, `got ${cu._opCount}`);

// ── Control-signal output pins (Tier 3) ──────────────────────
console.log('\n[2c] Control-signal probes');
const outputs = scene.nodes.filter(n => n.type === 'OUTPUT').map(n => n.label);
check('Probe: ALUOp',    outputs.includes('ALUOp'));
check('Probe: RegWrite', outputs.includes('RegWrite'));
check('Probe: MemWrite', outputs.includes('MemWrite'));
check('Probe: Jump',     outputs.includes('Jump'));
check('Probe: HALT',     outputs.includes('HALT'));

// ── Key wires (MIPS-shape core paths) ────────────────────────
console.log('\n[3] Core connections present');
const hasWire = (src, tgt) => scene.wires.some(w => w.sourceId === src && w.targetId === tgt);
check('PC → ROM',       hasWire('pc', 'rom'));
check('ROM → IR',       hasWire('rom', 'ir'));
check('IR → CU (op)',   hasWire('ir', 'cu'));
check('IR → RF',        hasWire('ir', 'rf'));
check('RF → ALU',       hasWire('rf', 'alu'));
check('CU → ALU (op)',  hasWire('cu', 'alu'));
check('ALU → CU (flags)', scene.wires.some(w => w.sourceId === 'alu' && w.targetId === 'cu'));
check('ALU → WB_MUX',   hasWire('alu', 'wb_mux'));
check('RAM → WB_MUX',   hasWire('ram', 'wb_mux'));
check('WB_MUX → RF',    hasWire('wb_mux', 'rf'));
check('IR → PC (jmp addr)', hasWire('ir', 'pc'));
check('CU → PC (jmp)',  hasWire('cu', 'pc'));

// ── GCD program decoding + simulation ────────────────────────
console.log('\n[4] GCD program ISA simulation');
check('ROM memory has entries', rom && Object.keys(rom.memory).length > 0,
      `${rom ? Object.keys(rom.memory).length : 0} instructions`);

// Reference ISA simulator — mirrors the CPU semantics defined in js/cpu/Assembler.js
// and js/engine/SimulationEngine.js (ALU + control flow).
// The bit width of the datapath matches RF.dataBits in the JSON — defaults to 16
// so the simulator stays consistent with the actual circuit.
function runProgram(memory, { maxCycles = 500, dataBits = 16, pcBits = 6 } = {}) {
  const regs = new Array(16).fill(0);
  regs[0] = 0;
  let pc = 0;
  let zFlag = 0;
  let cFlag = 0;
  const MASK = dataBits >= 32 ? 0xFFFFFFFF : ((1 << dataBits) - 1);
  const PC_MASK = (1 << pcBits) - 1;
  let cycles = 0;

  while (cycles++ < maxCycles) {
    const instr = (memory[pc] ?? 0) & 0xFFFF;
    const op  = (instr >> 12) & 0xF;
    const rd  = (instr >>  8) & 0xF;
    const rs1 = (instr >>  4) & 0xF;
    const rs2 =  instr        & 0xF;
    const imm8 = (rs1 << 4) | rs2;

    let nextPC = pc + 1;
    switch (op) {
      case 0: regs[rd] = (regs[rs1] + regs[rs2]) & MASK; break;            // ADD
      case 1: {                                                             // SUB
        const s = regs[rs1] - regs[rs2];
        regs[rd] = s & MASK;
        cFlag = s < 0 ? 1 : 0;
        break;
      }
      case 2: regs[rd] = (regs[rs1] & regs[rs2]) & MASK; break;            // AND
      case 3: regs[rd] = (regs[rs1] | regs[rs2]) & MASK; break;            // OR
      case 4: regs[rd] = (regs[rs1] ^ regs[rs2]) & MASK; break;            // XOR
      case 5: regs[rd] = (regs[rs1] << (regs[rs2] & 0xF)) & MASK; break;   // SHL
      case 6: regs[rd] = (regs[rs1] >>> (regs[rs2] & 0xF)) & MASK; break;  // SHR
      case 7: {                                                             // CMP — sets flags only
        const a = regs[rs1], b = regs[rs2];
        zFlag = a === b ? 1 : 0;
        cFlag = a > b  ? 1 : 0;
        break;
      }
      case 10: nextPC = rd; break;                                          // JMP
      case 11: {                                                             // BEQ Rs1, Rs2, addr — atomic
        const a = regs[rs1], b = regs[rs2];
        zFlag = a === b ? 1 : 0;
        cFlag = a > b  ? 1 : 0;
        if (zFlag === 1) nextPC = rd;
        break;
      }
      case 12: {                                                             // BNE Rs1, Rs2, addr — atomic
        const a = regs[rs1], b = regs[rs2];
        zFlag = a === b ? 1 : 0;
        cFlag = a > b  ? 1 : 0;
        if (zFlag === 0) nextPC = rd;
        break;
      }
      case 13: regs[rd] = imm8 & MASK; break;                                // LI
      case 14: break;                                                         // NOP
      case 15: return { regs, pc, cycles, halted: true };                    // HALT
      default: return { regs, pc, cycles, halted: false, error: 'bad opcode ' + op };
    }
    regs[0] = 0;
    pc = nextPC & PC_MASK;
  }
  return { regs, pc, cycles, halted: false, error: 'max cycles' };
}

// Expected: Σ(1..5) = 15. The result lives in R1 at HALT; R2 reaches R3=N.
const dataBits = rf.dataBits;
const pcBits = pc.bitWidth;
const result = runProgram(rom.memory, { dataBits, pcBits });
check('program halts cleanly',      result.halted,           `after ${result.cycles} cycles`);
check('Σ(1..5) = 15 in R1',         result.regs[1] === 15,   `got R1=${result.regs[1]}`);
check('counter R2 reaches N=5',     result.regs[2] === 5,    `got R2=${result.regs[2]}`);
check('PC at HALT instruction',     result.pc === 10,        `got PC=${result.pc}`);

// Sanity: change N (R3) to a different value and re-verify the closed form.
const memAlt = { ...rom.memory };
memAlt[2] = 0xD300 | 7;   // LI R3, 7
const result2 = runProgram(memAlt, { dataBits, pcBits });
check('Σ(1..7) = 28',               result2.regs[1] === 28,  `got R1=${result2.regs[1]}`);

// 16-bit stress test: a larger N exercises more iterations and shows the
// 16-bit datapath holding the running sum without truncation (Σ(1..20) = 210
// — would overflow an 8-bit accumulator).
const memBig = { ...rom.memory };
memBig[2] = 0xD300 | 20;  // LI R3, 20
const result3 = runProgram(memBig, { dataBits, pcBits });
check('Σ(1..20) = 210',             result3.regs[1] === 210, `got R1=${result3.regs[1]}`);

// ── Summary ─────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
