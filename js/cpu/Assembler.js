/**
 * Assembler / Disassembler for the Circuit Designer CPU.
 *
 * Instruction format (16-bit):
 *   [15..12] OPCODE  [11..8] RD  [7..4] RS1  [3..0] RS2/IMM
 *
 * Opcodes match the CU definition:
 *   0=ADD  1=SUB  2=AND  3=OR  4=XOR  5=SHL  6=SHR  7=CMP
 *   8=LOAD 9=STORE 10=JMP 11=BEQ 12=BNE 13=MOV/LI 14=NOP 15=HALT
 *
 * BEQ/BNE are atomic compare-and-branch: in one cycle the ALU does CMP
 * Rs1,Rs2 and the CU consumes the fresh Z flag to decide the branch.
 * Encoding:  [OP][addr4][RS1][RS2]  — same width as JMP, just RS1/RS2
 * are now meaningful instead of don't-care.
 */

const OP_TABLE = {
  'ADD': 0, 'SUB': 1, 'AND': 2, 'OR': 3, 'XOR': 4,
  'SHL': 5, 'SHR': 6, 'CMP': 7, 'LOAD': 8, 'STORE': 9,
  'JMP': 10, 'BEQ': 11, 'BNE': 12, 'MOV': 13, 'LI': 13, 'NOP': 14, 'HALT': 15,
};

const OP_NAMES = Object.fromEntries(Object.entries(OP_TABLE).map(([k, v]) => [v, k]));

// How many register operands each opcode uses.
// Special string markers: 'br' = BEQ/BNE format (Rs1, Rs2, addr).
const OP_FORMAT = {
  0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, // ALU: RD, RS1, RS2
  7: 2,    // CMP: RS1, RS2 (no RD write)
  8: 2,    // LOAD: RD, ADDR(RS2)
  9: 2,    // STORE: RS1(data), RS2(addr)
  10: 1,   // JMP: IMM (in RD field)
  11: 'br',// BEQ Rs1, Rs2, addr — addr in RD, Rs1/Rs2 in their fields
  12: 'br',// BNE Rs1, Rs2, addr
  13: 2,   // MOV: RD, RS1
  14: 0,   // NOP
  15: 0,   // HALT
};

/**
 * Parse a register token like "R0", "R15", "r3" → number
 */
function parseReg(tok) {
  const m = tok.trim().toUpperCase().match(/^R(\d+)$/);
  return m ? parseInt(m[1]) & 0xF : 0;
}

/**
 * Assemble one line of text into a 16-bit instruction.
 * Examples:
 *   "ADD R2, R1, R0"  → 0x0210
 *   "HALT"            → 0xF000
 *   "JMP 5"           → 0xA500 (opcode=10, RD=5)
 *   "NOP"             → 0xE000
 * @param {string} line
 * @returns {number} 16-bit instruction
 */
export function assemble(line) {
  const parts = line.trim().replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 0;

  let mnemonic = parts[0].toUpperCase();
  // MOV Rd, Rs → ADD Rd, Rs, R0 (syntactic sugar)
  // MOV Rd, IMM → LI Rd, IMM
  if (mnemonic === 'MOV') {
    if (parts.length >= 3 && (parts[2] || '').toUpperCase().startsWith('R')) {
      mnemonic = 'ADD';
      parts[0] = 'ADD';
      parts.push('R0');
    } else {
      mnemonic = 'LI';
      parts[0] = 'LI';
    }
  }
  const op = OP_TABLE[mnemonic];
  if (op === undefined) return 0;

  // LI Rd, IMM — encodes as opcode 13 with immediate in RS1:RS2 (8-bit)
  if (mnemonic === 'LI') {
    const rd = parseReg(parts[1] || '');
    const imm = parseInt(parts[2] || '0') & 0xFF;
    const rs1 = (imm >> 4) & 0xF;
    const rs2 = imm & 0xF;
    return ((op & 0xF) << 12) | ((rd & 0xF) << 8) | ((rs1 & 0xF) << 4) | (rs2 & 0xF);
  }

  const fmt = OP_FORMAT[op];
  let rd = 0, rs1 = 0, rs2 = 0;

  if (fmt === 3) {
    // RD, RS1, RS2
    rd  = parseReg(parts[1] || '');
    rs1 = parseReg(parts[2] || '');
    rs2 = parseReg(parts[3] || '');
  } else if (fmt === 2) {
    if (op === 7) {
      // CMP RS1, RS2
      rs1 = parseReg(parts[1] || '');
      rs2 = parseReg(parts[2] || '');
    } else if (op === 9) {
      // STORE RS1, RS2(addr)
      rs1 = parseReg(parts[1] || '');
      rs2 = parseReg(parts[2] || '');
    } else if (op === 8) {
      // LOAD RD, RS2(addr) — address in RS2 so RF_B reads it
      rd  = parseReg(parts[1] || '');
      rs2 = parseReg(parts[2] || '');
    } else {
      // MOV RD, RS1
      rd  = parseReg(parts[1] || '');
      rs1 = parseReg(parts[2] || '');
    }
  } else if (fmt === 1) {
    // JMP: immediate value in RD field
    const val = parseInt(parts[1] || '0') & 0xF;
    rd = val;
  } else if (fmt === 'br') {
    // BEQ/BNE Rs1, Rs2, addr — atomic compare-and-branch.
    rs1 = parseReg(parts[1] || '');
    rs2 = parseReg(parts[2] || '');
    rd  = parseInt(parts[3] || '0') & 0xF;
  }
  // fmt === 0: NOP/HALT — all zeros

  return ((op & 0xF) << 12) | ((rd & 0xF) << 8) | ((rs1 & 0xF) << 4) | (rs2 & 0xF);
}

/**
 * Disassemble a 16-bit instruction into human-readable text.
 * @param {number} instr
 * @returns {string}
 */
export function disassemble(instr) {
  instr = instr & 0xFFFF;
  const op  = (instr >> 12) & 0xF;
  const rd  = (instr >> 8)  & 0xF;
  const rs1 = (instr >> 4)  & 0xF;
  const rs2 = instr         & 0xF;

  const name = OP_NAMES[op] || '???';
  const fmt = OP_FORMAT[op];

  if (fmt === 3) return `${name} R${rd}, R${rs1}, R${rs2}`;
  if (fmt === 2) {
    if (op === 7) return `${name} R${rs1}, R${rs2}`;
    if (op === 8) return `${name} R${rd}, R${rs2}`;
    if (op === 9) return `${name} R${rs1}, R${rs2}`;
    if (op === 13) return `LI R${rd}, ${(rs1 << 4) | rs2}`;
    return `${name} R${rd}, R${rs1}`;
  }
  if (fmt === 1) return `${name} ${rd}`;
  if (fmt === 'br') return `${name} R${rs1}, R${rs2}, ${rd}`;
  return name;
}

/**
 * Best-effort decompile of a single 16-bit instruction to a C-like statement.
 * Used so the ROM editor's C view can mirror what was written in ASM
 * (ops that have no natural C form fall back to `asm(...)` comments).
 * @param {number} instr
 * @returns {string}
 */
export function disassembleToC(instr) {
  instr = instr & 0xFFFF;
  const op  = (instr >> 12) & 0xF;
  const rd  = (instr >> 8)  & 0xF;
  const rs1 = (instr >> 4)  & 0xF;
  const rs2 = instr         & 0xF;
  switch (op) {
    case 0: return `R${rd} = R${rs1} + R${rs2};`;
    case 1: return `R${rd} = R${rs1} - R${rs2};`;
    case 2: return `R${rd} = R${rs1} & R${rs2};`;
    case 3: return `R${rd} = R${rs1} | R${rs2};`;
    case 4: return `R${rd} = R${rs1} ^ R${rs2};`;
    case 5: return `R${rd} = R${rs1} << R${rs2};`;
    case 6: return `R${rd} = R${rs1} >> R${rs2};`;
    case 7:  return `// cmp R${rs1}, R${rs2};`;
    case 8:  return `R${rd} = mem[R${rs2}];`;
    case 9:  return `mem[R${rs2}] = R${rs1};`;
    case 10: return `// jmp ${rd};`;
    case 11: return `if (R${rs1} == R${rs2}) goto L${rd};`;
    case 12: return `if (R${rs1} != R${rs2}) goto L${rd};`;
    case 13: return `R${rd} = ${(rs1 << 4) | rs2};`;
    case 14: return ``; // NOP → blank line
    case 15: return `halt;`;
    default: return `// ???`;
  }
}

/**
 * Decompile a ROM memory map to a pseudo-C source block.
 * Trailing NOPs are trimmed so the C view matches the visible ASM length.
 * @param {object} memory
 * @param {number} addrCount
 * @returns {string}
 */
export function decompileRomToC(memory, addrCount) {
  const lines = [];
  let lastNonEmpty = -1;
  for (let a = 0; a < addrCount; a++) {
    const v = memory[a] ?? 0;
    const c = disassembleToC(v);
    lines.push(c);
    if (c !== '') lastNonEmpty = a;
  }
  return lines.slice(0, lastNonEmpty + 1).join('\n');
}

/**
 * Get list of all opcode names.
 */
export function getOpcodeNames() {
  return Object.keys(OP_TABLE);
}

/**
 * Get the operand format for an opcode.
 * @returns {number} 0=none, 1=imm, 2=two regs, 3=three regs
 */
export function getOpcodeFormat(opName) {
  const op = OP_TABLE[opName.toUpperCase()];
  return op !== undefined ? OP_FORMAT[op] : 0;
}
