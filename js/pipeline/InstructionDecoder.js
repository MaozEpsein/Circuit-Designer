/**
 * InstructionDecoder — turns a ROM node's memory dict into a linear
 * instruction stream decoded per an ISA definition.
 *
 * Output shape (one entry per occupied PC):
 *   {
 *     pc, raw,
 *     opcode, name,
 *     rd, rs1, rs2, addr,
 *     reads:  Array<fieldName>,    // which field names hold source regs
 *     writes: Array<fieldName>,    // which field names hold the dest reg
 *     isLoad, isBranch, isHalt,
 *   }
 */
import { DEFAULT_ISA, sliceField } from './isa/default.js';

/** Decode every occupied address in a ROM node. Ordered by PC ascending. */
export function decodeROM(romNode, isa = DEFAULT_ISA) {
  if (!romNode || !romNode.memory) return [];
  const addrs = Object.keys(romNode.memory)
    .map(k => parseInt(k, 10))
    .filter(n => Number.isFinite(n))
    .sort((a, b) => a - b);
  return addrs.map(pc => decodeInstruction(pc, romNode.memory[pc] >>> 0, isa));
}

/** Decode a single instruction word. */
export function decodeInstruction(pc, raw, isa = DEFAULT_ISA) {
  const opField = isa.fields.op;
  const opcode  = sliceField(raw, opField);
  const meta    = isa.opcodes[opcode] || { name: `UNK_${opcode.toString(16).toUpperCase()}`, reads: [], writes: [] };
  return {
    pc,
    raw,
    opcode,
    name:     meta.name,
    rd:       sliceField(raw, isa.fields.rd),
    rs1:      sliceField(raw, isa.fields.rs1),
    rs2:      sliceField(raw, isa.fields.rs2),
    addr:     sliceField(raw, isa.fields.addr),
    reads:    meta.reads  || [],
    writes:   meta.writes || [],
    isLoad:   !!meta.isLoad,
    isBranch: !!meta.isBranch,
    isHalt:   !!meta.isHalt,
  };
}

/** Find the first ROM node in the scene (or null). Most pipelined demos have at most one. */
export function findRomNode(scene) {
  return (scene?.nodes || []).find(n => n.type === 'ROM') || null;
}

/**
 * Format a decoded instruction into a short, MIPS-style text line — e.g.
 * `ADD R5, R4, R4` or `LOAD R11, [R12]`. Used by the panel to label hazards
 * with the exact instruction the user sees in the ROM editor.
 */
export function disassemble(instr) {
  if (!instr) return '?';
  const n = instr.name;
  const r = (x) => `R${x}`;
  switch (n) {
    case 'ADD': case 'SUB': case 'AND': case 'OR':
    case 'XOR': case 'SHL': case 'SHR':
      return `${n} ${r(instr.rd)}, ${r(instr.rs1)}, ${r(instr.rs2)}`;
    case 'CMP':   return `CMP ${r(instr.rs1)}, ${r(instr.rs2)}`;
    case 'LOAD':  return `LOAD ${r(instr.rd)}, [${r(instr.rs2)}]`;
    case 'STORE': return `STORE [${r(instr.rs2)}], ${r(instr.rs1)}`;
    case 'MOV':   return `MOV ${r(instr.rd)}, ${r(instr.rs1)}`;
    case 'JMP':
      return `${n} 0x${instr.addr.toString(16).toUpperCase()}`;
    case 'BEQ': case 'BNE':
      return `${n} ${r(instr.rs1)}, ${r(instr.rs2)}, 0x${instr.rd.toString(16).toUpperCase()}`;
    case 'NOP': case 'HALT': return n;
    default:      return `${n} (raw 0x${instr.raw.toString(16).toUpperCase().padStart(4,'0')})`;
  }
}
