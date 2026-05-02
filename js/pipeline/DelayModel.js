/**
 * DelayModel — per-component combinational delay in picoseconds.
 * Rough defaults inspired by 28nm CMOS standard cells.
 * Registers, I/O, and clock nodes contribute 0 (not combinational).
 */
export const DEFAULT_DELAY_PS = {
  GATE_SLOT:   50,
  // Concrete primitive gates — the palette in Component.js lists these as
  // user-placeable types (GATE_TYPES), so they need their own entries
  // otherwise DelayModel falls back to the 100 ps "unknown" path and
  // StageEvaluator emits a warning for each.
  AND:         50,
  OR:          50,
  NOT:         30,
  NAND:        40,
  NOR:         40,
  XOR:         80,
  HALF_ADDER:  150,
  FULL_ADDER:  150,
  COMPARATOR:  300,
  MUX:         200,
  DEMUX:       200,
  DECODER:     250,
  ENCODER:     200,
  BUS_MUX:     180,
  SIGN_EXT:    80,
  SPLIT:       30,
  MERGE:       30,
  HANDSHAKE:   60,
  HDU:         150,
  FWD:         180,
  ALU:         800,
  // Boundaries / memory — do not add combinational delay
  PIPE_REG:    0,
  FF_SLOT:     0,
  LATCH_SLOT:  0,
  INPUT:       0,
  OUTPUT:      0,
  CLOCK:       0,
  REGISTER:    0,
  SHIFT_REG:   0,
  COUNTER:     0,
  RAM:         0,
  ROM:         0,
  CACHE:       0,
  REG_FILE:    0,
  REG_FILE_DP: 0,
  FIFO:        0,
  STACK:       0,
  PC:          0,
  IR:          0,
  CU:          400,
  BUS:         20,
  IMM:         0,
  SUB_CIRCUIT: 100,
  MUX_SELECT:  0,
  DISPLAY_7SEG: 0,
};

/** Picoseconds of combinational delay for a node. Unknown types default to 100. */
export function delayOf(node) {
  if (!node) return 0;
  const d = DEFAULT_DELAY_PS[node.type];
  return (d == null) ? 100 : d;
}

/** True when the component type has an explicit entry in the delay table. */
export function isKnownType(type) {
  return Object.prototype.hasOwnProperty.call(DEFAULT_DELAY_PS, type);
}
