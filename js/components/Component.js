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
  CACHE:        'CACHE',
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
  REG_FILE_DP:  'REG_FILE_DP',
  SPLIT:        'SPLIT',
  MERGE:        'MERGE',
  HANDSHAKE:    'HANDSHAKE',
  HDU:          'HDU',
  FWD:          'FWD',
  // DFT components
  SCAN_FF:      'SCAN_FF',
  LFSR:         'LFSR',
};

/**
 * Parse a slice spec string like "31:26, 25:21, 15" into
 * an array of {hi, lo} ranges. A single number N means bit N (hi=lo=N).
 * Invalid entries are dropped silently.
 */
export function parseSlices(spec) {
  if (!spec || typeof spec !== 'string') return [];
  return spec.split(',').map(part => {
    const s = part.trim();
    if (!s) return null;
    const m = s.match(/^(\d+)(?:\s*:\s*(\d+))?$/);
    if (!m) return null;
    const hi = parseInt(m[1], 10);
    const lo = m[2] !== undefined ? parseInt(m[2], 10) : hi;
    if (isNaN(hi) || isNaN(lo) || hi < lo) return null;
    return { hi, lo };
  }).filter(Boolean);
}

/** Width in bits of a slice range. */
export function sliceWidth(s) { return (s.hi - s.lo + 1); }

export const GATE_TYPES = ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'NOT'];

export const FF_TYPES_LIST = ['D', 'T', 'SR', 'JK'];

/** Set of all node types that are flip-flops or latches (sequential elements) */
export const FF_TYPE_SET = new Set([
  'FLIPFLOP_D', 'FLIPFLOP_SR', 'FLIPFLOP_JK', 'FLIPFLOP_T', 'FF_SLOT', 'LATCH_SLOT', 'SCAN_FF'
]);

/** Set of all memory component types (sequential, clocked) */
export const MEMORY_TYPE_SET = new Set([
  'REGISTER', 'SHIFT_REG', 'COUNTER', 'RAM', 'ROM', 'CACHE', 'REG_FILE', 'FIFO', 'STACK', 'PC', 'IR', 'PIPE_REG', 'REG_FILE_DP', 'LFSR'
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
    case COMPONENT_TYPES.SCAN_FF:
      // DFT scan flip-flop: D + TI inputs, TE select, CLK. On rising
      // edge, Q ← (TE === 1 ? TI : D). Default initialQ = 0.
      return { ...base, initialQ: 0, label: 'SCAN-FF' };
    case COMPONENT_TYPES.LFSR:
      // Linear-Feedback Shift Register (Fibonacci form). Inputs: CLK
      // only. Output Q = the MSB that falls off on each shift. `taps`
      // are bit positions (0-indexed from LSB) XORed to form the new
      // bit. Default: 4-bit, taps [3, 0] → x^4+x+1, period 15.
      return { ...base, bitWidth: 4, taps: [3, 0], seed: 1, label: 'LFSR' };
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
    // Cache: black-box L1 between CPU and RAM. CPU side accepts the
    // same 5 inputs as RAM (ADDR, DATA, WE, RE, CLK) plus a 6th
    // MEM_DATA_IN that arrives from the RAM behind the cache. Outputs:
    // DATA_OUT(0), HIT(1), MISS(2), MEM_ADDR(3), MEM_DATA_OUT(4),
    // MEM_RE(5), MEM_WE(6). Layer 0 is a pass-through stub.
    case COMPONENT_TYPES.CACHE:
      return { ...base, lines: 4, dataBits: 8, addrBits: 8, mapping: 'direct', ways: 2, writePolicy: 'write-through', label: 'CACHE' };
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
      return { ...base, label: 'CU', controlTable: null, branchPredictor: 'static-nt' }; // null = use default
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
      return { ...base, channels: 4, label: 'PIPE', pipelineRole: 'register', stage: null };
    case COMPONENT_TYPES.REG_FILE_DP:
      return { ...base, regCount: 8, dataBits: 8, initialRegs: null, label: 'RF-DP' };
    case COMPONENT_TYPES.SPLIT:
      return { ...base, inBits: 8, slicesSpec: '7:4, 3:0', label: 'SPLIT' };
    case COMPONENT_TYPES.MERGE:
      return { ...base, outBits: 8, slicesSpec: '7:4, 3:0', label: 'MERGE' };
    case COMPONENT_TYPES.HANDSHAKE:
      return { ...base, label: 'HS', pipelineRole: 'control' };
    case COMPONENT_TYPES.HDU:
      // Hazard Detection Unit — combinational MIPS-style load-use stall detector.
      // regAddrBits sets the width compared on rs/rt/rd ports (4 = 16 regs).
      return { ...base, label: 'HDU', regAddrBits: 4, pipelineRole: 'control' };
    case COMPONENT_TYPES.FWD:
      // Forwarding Unit — combinational MIPS-style two-source priority forwarder.
      return { ...base, label: 'FWD', regAddrBits: 4, pipelineRole: 'control' };
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
    // DFT (Layer 1): stuck-at fault site. null = no fault, 0 = stuck-at-0,
    // 1 = stuck-at-1. SimulationEngine intercepts wireValues.set and forces
    // the stuck value into the wire whenever this is non-null.
    stuckAt: opts.stuckAt ?? null,
    // DFT (Layer 1.5): open fault — physically broken wire that floats.
    // The downstream consumer sees null (engine already understands floating
    // values from TRIBUF in high-Z mode).
    open: opts.open ?? false,
    // DFT (Layer 1.5): bridging fault — this wire is shorted to another
    // wire `bridgedWith`. The effective value is the wired-OR (default,
    // dominant-1) or wired-AND (dominant-0) of the two source values.
    bridgedWith: opts.bridgedWith ?? null,
    bridgeMode: opts.bridgeMode || 'or',
  };
}
