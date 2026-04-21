/**
 * Native 16-opcode / 16-bit ISA definition — the default ISA used by the
 * simple-cpu and mips-gcd demos. Laid out in 5 MIPS-style stages
 * (Fetch / Decode / Execute / Memory / Write-back), hence the pipeline depth.
 *
 * Instruction word layout (bit indices are MSB-first as [hi, lo] inclusive):
 *
 *   [15:12]  OP    — opcode (4 bits)
 *   [11:8]   RD    — destination register (4 bits)
 *   [7:4]    RS1   — source register 1 (4 bits)
 *   [3:0]    RS2   — source register 2 (4 bits)
 *   [11:0]   ADDR  — branch target, overlaps RD/RS1/RS2 for JMP/JZ/JC
 *
 * The `reads` / `writes` arrays reference the field names above. A register
 * number of 0 is treated as r0 (hard-wired zero in classical MIPS); hazards
 * involving r0 are suppressed by the detector.
 */
export const DEFAULT_ISA = {
  id:            'native16',
  name:          'Native 16-bit (16-op)',
  wordBits:      16,
  pipelineDepth: 5,
  fields: {
    op:   [15, 12],
    rd:   [11,  8],
    rs1:  [ 7,  4],
    rs2:  [ 3,  0],
    addr: [11,  0],
  },
  opcodes: {
    0x0: { name: 'ADD',   reads: ['rs1','rs2'], writes: ['rd']                 },
    0x1: { name: 'SUB',   reads: ['rs1','rs2'], writes: ['rd']                 },
    0x2: { name: 'AND',   reads: ['rs1','rs2'], writes: ['rd']                 },
    0x3: { name: 'OR',    reads: ['rs1','rs2'], writes: ['rd']                 },
    0x4: { name: 'XOR',   reads: ['rs1','rs2'], writes: ['rd']                 },
    0x5: { name: 'SHL',   reads: ['rs1','rs2'], writes: ['rd']                 },
    0x6: { name: 'SHR',   reads: ['rs1','rs2'], writes: ['rd']                 },
    0x7: { name: 'CMP',   reads: ['rs1','rs2'], writes: []                     },
    0x8: { name: 'LOAD',  reads: ['rs2'],       writes: ['rd'], isLoad:   true },
    0x9: { name: 'STORE', reads: ['rs1','rs2'], writes: []                     },
    0xA: { name: 'JMP',   reads: [],            writes: [],     isBranch: true },
    0xB: { name: 'JZ',    reads: [],            writes: [],     isBranch: true },
    0xC: { name: 'JC',    reads: [],            writes: [],     isBranch: true },
    0xD: { name: 'MOV',   reads: ['rs1'],       writes: ['rd']                 },
    0xE: { name: 'NOP',   reads: [],            writes: []                     },
    0xF: { name: 'HALT',  reads: [],            writes: [],     isHalt:   true },
  },
};

/** Width-safe bit-slice extraction for an instruction word. */
export function sliceField(raw, field) {
  if (!field) return 0;
  const [hi, lo] = field;
  const width = hi - lo + 1;
  const mask = (1 << width) - 1;
  return (raw >>> lo) & mask;
}
