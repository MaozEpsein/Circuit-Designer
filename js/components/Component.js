/**
 * Component — Base class for all circuit elements.
 * Provides common properties: id, type, position, label.
 */

export const COMPONENT_TYPES = {
  INPUT:        'INPUT',
  OUTPUT:       'OUTPUT',
  GATE_SLOT:    'GATE_SLOT',
  FF_SLOT:      'FF_SLOT',
  LATCH_SLOT:   'LATCH_SLOT',
  CLOCK:        'CLOCK',
  MUX_SELECT:   'MUX_SELECT',
  DISPLAY_7SEG: 'DISPLAY_7SEG',
  MUX:          'MUX',
  DEMUX:        'DEMUX',
  DECODER:      'DECODER',
  ENCODER:      'ENCODER',
  HALF_ADDER:   'HALF_ADDER',
  FULL_ADDER:   'FULL_ADDER',
  COMPARATOR:   'COMPARATOR',
  // Memory components
  REGISTER:     'REGISTER',
  SHIFT_REG:    'SHIFT_REG',
  COUNTER:      'COUNTER',
  RAM:          'RAM',
  ROM:          'ROM',
  REG_FILE:     'REG_FILE',
  FIFO:         'FIFO',
  STACK:        'STACK',
  PC:           'PC',
  // CPU components
  ALU:          'ALU',
  IR:           'IR',
  CU:           'CU',
  BUS:          'BUS',
  IMM:          'IMM',
  SUB_CIRCUIT:  'SUB_CIRCUIT',
  BUS_MUX:      'BUS_MUX',
  SIGN_EXT:     'SIGN_EXT',
  PIPE_REG:     'PIPE_REG',
};

export const GATE_TYPES = ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'NOT'];

export const FF_TYPES_LIST = ['D', 'T', 'SR', 'JK'];

/** Set of all node types that are flip-flops or latches (sequential elements) */
export const FF_TYPE_SET = new Set([
  'FLIPFLOP_D', 'FLIPFLOP_SR', 'FLIPFLOP_JK', 'FLIPFLOP_T', 'FF_SLOT', 'LATCH_SLOT'
]);

/** Set of all memory component types (sequential, clocked) */
export const MEMORY_TYPE_SET = new Set([
  'REGISTER', 'SHIFT_REG', 'COUNTER', 'RAM', 'ROM', 'REG_FILE', 'FIFO', 'STACK', 'PC', 'IR', 'PIPE_REG'
]);

export const LATCH_TYPES_LIST = ['D_LATCH', 'SR_LATCH'];

/**
 * Create a new component with default values for its type.
 * @param {string} type - One of COMPONENT_TYPES
 * @param {number} x
 * @param {number} y
 * @returns {object}
 */
export function createComponent(type, x, y) {
  const base = { type, x, y };

  switch (type) {
    case COMPONENT_TYPES.INPUT:
      return { ...base, fixedValue: 0, label: 'IN' };
    case COMPONENT_TYPES.OUTPUT:
      return { ...base, targetValue: 0, label: 'OUT', sandbox: true };
    case COMPONENT_TYPES.GATE_SLOT:
      return { ...base, gate: null, label: 'G' };
    case COMPONENT_TYPES.FF_SLOT:
      return { ...base, ffType: null, initialQ: 0, label: 'FF' };
    case COMPONENT_TYPES.LATCH_SLOT:
      return { ...base, latchType: null, initialQ: 0, label: 'LATCH' };
    case COMPONENT_TYPES.CLOCK:
      return { ...base, value: 0 };
    case COMPONENT_TYPES.MUX_SELECT:
      return { ...base, value: 0, label: 'SW' };
    case COMPONENT_TYPES.DISPLAY_7SEG:
      return { ...base, label: '7SEG' };
    case COMPONENT_TYPES.MUX:
      return { ...base, inputCount: 2, label: 'MUX' };   // 2:1 default, configurable
    case COMPONENT_TYPES.DEMUX:
      return { ...base, outputCount: 2, label: 'DEMUX' };
    case COMPONENT_TYPES.DECODER:
      return { ...base, inputBits: 2, label: 'DEC' };     // 2:4 default
    case COMPONENT_TYPES.ENCODER:
      return { ...base, inputLines: 4, label: 'ENC' };
    case COMPONENT_TYPES.HALF_ADDER:
      return { ...base, label: 'HA' };
    case COMPONENT_TYPES.FULL_ADDER:
      return { ...base, label: 'FA' };
    case COMPONENT_TYPES.COMPARATOR:
      return { ...base, label: 'CMP' };
    // Memory components
    case COMPONENT_TYPES.REGISTER:
      return { ...base, bitWidth: 4, label: 'REG' };
    case COMPONENT_TYPES.SHIFT_REG:
      return { ...base, bitWidth: 4, direction: 'LEFT', label: 'SHREG' };
    case COMPONENT_TYPES.COUNTER:
      return { ...base, bitWidth: 4, label: 'CNT' };
    case COMPONENT_TYPES.RAM:
      return { ...base, addrBits: 3, dataBits: 4, memory: {}, label: 'RAM' };
    case COMPONENT_TYPES.ROM:
      return { ...base, addrBits: 3, dataBits: 4, memory: {}, label: 'ROM' };
    case COMPONENT_TYPES.REG_FILE:
      return { ...base, regCount: 8, dataBits: 8, initialRegs: null, label: 'RF' };
    case COMPONENT_TYPES.FIFO:
      return { ...base, depth: 8, dataBits: 8, label: 'FIFO' };
    case COMPONENT_TYPES.STACK:
      return { ...base, depth: 8, dataBits: 8, label: 'STACK' };
    case COMPONENT_TYPES.PC:
      return { ...base, bitWidth: 8, label: 'PC' };
    case COMPONENT_TYPES.ALU:
      return { ...base, bitWidth: 8, label: 'ALU' };
    case COMPONENT_TYPES.IR:
      return { ...base, instrWidth: 16, opBits: 4, rdBits: 4, rs1Bits: 4, rs2Bits: 4, label: 'IR' };
    case COMPONENT_TYPES.CU:
      return { ...base, label: 'CU' };
    case COMPONENT_TYPES.BUS:
      return { ...base, sourceCount: 3, label: 'BUS' };
    case COMPONENT_TYPES.IMM:
      return { ...base, value: 0, bitWidth: 8, label: 'IMM' };
    case COMPONENT_TYPES.SUB_CIRCUIT:
      return { ...base, label: 'BLOCK', subName: '', subInputs: [], subOutputs: [], subCircuit: null };
    case COMPONENT_TYPES.BUS_MUX:
      return { ...base, inputCount: 2, label: 'BMUX' };
    case COMPONENT_TYPES.SIGN_EXT:
      return { ...base, inBits: 4, outBits: 8, label: 'SEXT' };
    case COMPONENT_TYPES.PIPE_REG:
      return { ...base, channels: 4, label: 'PIPE' };
    default:
      return base;
  }
}

/**
 * Create a wire object.
 * @param {string} sourceId
 * @param {string} targetId
 * @param {number} targetInputIndex
 * @param {number} sourceOutputIndex
 * @param {object} [opts] - Optional: { waypoints, netName, colorGroup, isClockWire }
 */
export function createWire(sourceId, targetId, targetInputIndex = 0, sourceOutputIndex = 0, opts = {}) {
  return {
    sourceId,
    targetId,
    targetInputIndex,
    sourceOutputIndex,
    waypoints: opts.waypoints || [],      // User-defined bend points [{x, y}, ...]
    netName: opts.netName || '',          // Label for the net/wire
    colorGroup: opts.colorGroup || null,  // Color group identifier
    isClockWire: opts.isClockWire || false,
  };
}
