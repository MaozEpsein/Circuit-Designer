/**
 * Assembler / Disassembler for the Circuit Designer CPU.
 *
 * Instruction format (16-bit):
 *   [15..12] OPCODE  [11..8] RD  [7..4] RS1  [3..0] RS2/IMM
 *
 * Opcodes match the CU definition:
 *   0=ADD  1=SUB  2=AND  3=OR  4=XOR  5=SHL  6=SHR  7=CMP
 *   8=LOAD 9=STORE 10=JMP 11=JZ 12=JC 13=MOV 14=NOP 15=HALT
 */

const OP_TABLE = {
  'ADD': 0, 'SUB': 1, 'AND': 2, 'OR': 3, 'XOR': 4,
  'SHL': 5, 'SHR': 6, 'CMP': 7, 'LOAD': 8, 'STORE': 9,
  'JMP': 10, 'JZ': 11, 'JC': 12, 'MOV': 13, 'NOP': 14, 'HALT': 15,
};

const OP_NAMES = Object.fromEntries(Object.entries(OP_TABLE).map(([k, v]) => [v, k]));

// How many register operands each opcode uses
const OP_FORMAT = {
  0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, // ALU: RD, RS1, RS2
  7: 2,   // CMP: RS1, RS2 (no RD write)
  8: 2,   // LOAD: RD, ADDR(RS1)
  9: 2,   // STORE: RS1(data), RS2(addr)
  10: 1,  // JMP: IMM (in RS2/RD field)
  11: 1,  // JZ: IMM
  12: 1,  // JC: IMM
  13: 2,  // MOV: RD, RS1
  14: 0,  // NOP
  15: 0,  // HALT
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

  const mnemonic = parts[0].toUpperCase();
  const op = OP_TABLE[mnemonic];
  if (op === undefined) return 0;

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
    // JMP/JZ/JC: immediate value in RD field
    const val = parseInt(parts[1] || '0') & 0xF;
    rd = val;
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
    return `${name} R${rd}, R${rs1}`;
  }
  if (fmt === 1) return `${name} ${rd}`;
  return name;
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
