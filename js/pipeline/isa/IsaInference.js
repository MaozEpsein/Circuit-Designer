/**
 * IsaInference — derive an ISA definition directly from the user's scene.
 *
 * Eliminates the Phase-9.5 requirement to hand-maintain `default.js` for
 * every new CPU. Leverages the fact that the native `CU` component carries
 * a fully-semantic `controlTable` (array indexed by opcode, each row =
 * {aluOp, regWe, memWe, memRe, jmp, halt, immSel, name}), and that the `IR`
 * component stores the bit-slice widths for op/rd/rs1/rs2 directly on the
 * node. Together that's enough to rebuild a DEFAULT_ISA-compatible shape
 * without any datapath graph traversal.
 *
 * When `controlTable` is `null`, the simulation engine falls back to a
 * hardcoded 16-opcode dispatch (SimulationEngine._evalCU). We mirror the
 * same hardcoded rows here so inference remains accurate on clean demos
 * like simple-cpu.json that haven't been customized via the `cu:edit`
 * modal.
 *
 * Tier 14d additions:
 *   - SUB_CIRCUIT-based CUs (e.g. cpu-detailed.json): we recursively descend
 *     into `node.subCircuit.nodes` looking for a native CU that carries the
 *     real controlTable. Only the first match is used — nested sub-circuits
 *     in real CPUs virtually always wrap a single primitive CU.
 *   - Missing top-level IR: we fall back to the DEFAULT_ISA field layout
 *     scaled to the ROM's `dataBits`, which is the shape the native CU
 *     expects on its instruction-word input.
 *
 * Still out of scope:
 *   - Control signals exposed on custom pin layouts (user-built CU from
 *     gates): we don't attempt to trace them.
 */
import { DEFAULT_ISA } from './default.js';

// Mirrors the fallback dispatch in SimulationEngine._evalCU. Kept in sync
// with that switch — if the engine's default CU behaviour changes, this
// table must change with it.
const DEFAULT_CONTROL_TABLE = [
  { name: 'ADD',   aluOp: 0, regWe: 1 },
  { name: 'SUB',   aluOp: 1, regWe: 1 },
  { name: 'AND',   aluOp: 2, regWe: 1 },
  { name: 'OR',    aluOp: 3, regWe: 1 },
  { name: 'XOR',   aluOp: 4, regWe: 1 },
  { name: 'SHL',   aluOp: 5, regWe: 1 },
  { name: 'SHR',   aluOp: 6, regWe: 1 },
  { name: 'CMP',   aluOp: 7 },
  { name: 'LOAD',  regWe: 1, memRe: 1 },
  { name: 'STORE', memWe: 1 },
  { name: 'JMP',   jmp: 1 },
  { name: 'JZ',    jmp: -1 },
  { name: 'JC',    jmp: -2 },
  { name: 'MOV',   regWe: 1, immSel: 1 },
  { name: 'NOP',   },
  { name: 'HALT',  halt: 1 },
];

function _cloneFallback(source, warnings) {
  return {
    id:            'inferred-fallback',
    name:          DEFAULT_ISA.name,
    wordBits:      DEFAULT_ISA.wordBits,
    pipelineDepth: DEFAULT_ISA.pipelineDepth,
    fields:        { ...DEFAULT_ISA.fields },
    opcodes:       { ...DEFAULT_ISA.opcodes },
    source,
    warnings:      warnings.slice(),
  };
}

/**
 * Recursively search nodes (and any SUB_CIRCUIT children) for a native CU.
 * Returns the first primitive CU encountered or null. Depth-limited to guard
 * against pathological / circular sub-circuit graphs.
 */
function _findCuDeep(nodes, depth = 0) {
  if (!Array.isArray(nodes) || depth > 8) return null;
  for (const n of nodes) {
    if (n?.type === 'CU') return n;
  }
  for (const n of nodes) {
    const inner = n?.subCircuit?.nodes;
    if (inner) {
      const hit = _findCuDeep(inner, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Build a field layout from the ROM's `dataBits` when no IR node is present.
 * Uses the DEFAULT_ISA 4/4/4/4 shape scaled by width — the native CU expects
 * its instruction input in this layout (op / rd / rs1 / rs2).
 */
function _fieldsFromRom(rom) {
  const w = Number.isFinite(rom?.dataBits) ? rom.dataBits : 16;
  const q = Math.floor(w / 4);
  const opLo  = w - q;
  const rdHi  = opLo - 1;
  const rdLo  = rdHi - q + 1;
  const rs1Hi = rdLo - 1;
  const rs1Lo = rs1Hi - q + 1;
  const rs2Hi = rs1Lo - 1;
  const rs2Lo = Math.max(0, rs2Hi - q + 1);
  return {
    op:   [w - 1, opLo],
    rd:   [rdHi,  rdLo],
    rs1:  [rs1Hi, rs1Lo],
    rs2:  [rs2Hi, rs2Lo],
    addr: [rdHi,  0],
  };
}

function _fieldsFromIR(ir) {
  const w   = ir.instrWidth || 16;
  const op  = ir.opBits     || 4;
  const rd  = ir.rdBits     || 4;
  const rs1 = ir.rs1Bits    || 4;
  const rs2 = ir.rs2Bits    || 4;
  const opLo  = w - op;
  const rdHi  = opLo - 1;
  const rdLo  = rdHi - rd + 1;
  const rs1Hi = rdLo - 1;
  const rs1Lo = rs1Hi - rs1 + 1;
  const rs2Hi = rs1Lo - 1;
  const rs2Lo = Math.max(0, rs2Hi - rs2 + 1);
  return {
    op:   [w - 1,  opLo],
    rd:   [rdHi,   rdLo],
    rs1:  [rs1Hi,  rs1Lo],
    rs2:  [rs2Hi,  rs2Lo],
    addr: [rdHi,   0],     // overlaps rd+rs1+rs2 (JMP target)
  };
}

/**
 * Derive the reads/writes/flags for a single opcode row.
 * Rules (ordered — first match wins):
 *   - halt=1       → terminator, no register traffic.
 *   - no signals + aluOp=0 → NOP.
 *   - no signals + aluOp≠0 → CMP-style flag compare: reads both regs, no writeback.
 *   - jmp≠0        → branch, no register reads/writes.
 *   - memRe=1      → LOAD: reads rs2 (base register), writes rd if regWe.
 *   - memWe=1      → STORE: reads rs1+rs2 (data + base), writes nothing.
 *   - immSel=1     → I-type: reads rs1, writes rd if regWe.
 *   - default      → R-type: reads rs1+rs2, writes rd if regWe.
 */
function _deriveOpcodeMeta(row, idx) {
  const meta = {
    name:   row.name || `OP_${idx.toString(16).toUpperCase()}`,
    reads:  [],
    writes: [],
  };

  const noReg =
    !row.regWe && !row.memWe && !row.memRe &&
    !row.jmp   && !row.halt  && !row.immSel;

  if (row.halt) {
    meta.isHalt = true;
    return meta;
  }
  if (noReg) {
    // aluOp≠0 with no writeback → the ALU runs but its output is only used to
    // set Z/C flags (classic CMP). Those reads are real hazard sources.
    if (row.aluOp) meta.reads = ['rs1', 'rs2'];
    return meta;
  }
  if (row.jmp && row.jmp !== 0) {
    meta.isBranch = true;
    return meta;
  }
  if (row.memRe) {
    meta.reads  = ['rs2'];
    meta.writes = row.regWe ? ['rd'] : [];
    meta.isLoad = true;
    return meta;
  }
  if (row.memWe) {
    meta.reads  = ['rs1', 'rs2'];
    return meta;
  }
  if (row.immSel) {
    meta.reads  = ['rs1'];
    meta.writes = row.regWe ? ['rd'] : [];
    return meta;
  }
  meta.reads  = ['rs1', 'rs2'];
  meta.writes = row.regWe ? ['rd'] : [];
  return meta;
}

/**
 * @param {{nodes: Array}} scene
 * @returns {{ id, name, wordBits, pipelineDepth, fields, opcodes, source, warnings } | null}
 *
 * Returns null only when the scene has neither CU nor IR (nothing to work
 * with). All other paths return a usable ISA with `source` and `warnings`
 * set so the caller can surface the degraded-mode reason in the UI.
 */
export function inferIsa(scene) {
  const nodes = scene?.nodes || [];
  const warnings = [];

  // Tier 14d: descend into SUB_CIRCUITs when no primitive CU is at the top.
  let cu = nodes.find(n => n.type === 'CU');
  let cuSource = 'native';
  if (!cu) {
    const deep = _findCuDeep(nodes);
    if (deep) {
      cu = deep;
      cuSource = 'subcircuit-descended';
      warnings.push('CU descended from SUB_CIRCUIT — native controlTable used');
    }
  }

  const ir  = nodes.find(n => n.type === 'IR');
  const rom = nodes.find(n => n.type === 'ROM');

  if (!cu && !ir) {
    // Nothing to infer from — neither a CU anywhere nor an IR at the top.
    if (nodes.some(n => n.type === 'SUB_CIRCUIT')) {
      return _cloneFallback('subcircuit-fallback',
        ['SUB_CIRCUIT-based CPU — no native CU found at any depth; using default ISA']);
    }
    return null;
  }

  if (!cu) {
    return _cloneFallback('no-cu-fallback',
      ['no CU component found — using default ISA']);
  }

  // IR layout: prefer an explicit IR node; fall back to the ROM's width
  // using the 4/4/4/4 default shape the native CU expects.
  let fields, wordBits;
  if (ir) {
    fields   = _fieldsFromIR(ir);
    wordBits = ir.instrWidth || DEFAULT_ISA.wordBits;
  } else if (rom) {
    fields   = _fieldsFromRom(rom);
    wordBits = rom.dataBits || DEFAULT_ISA.wordBits;
    warnings.push('no IR component — field layout derived from ROM dataBits');
  } else {
    return _cloneFallback('no-ir-fallback',
      ['no IR component and no ROM to derive width — using default ISA']);
  }

  const table  = Array.isArray(cu.controlTable) ? cu.controlTable : DEFAULT_CONTROL_TABLE;
  const tableTag = Array.isArray(cu.controlTable) ? 'native' : 'native-default-table';
  const source = (cuSource === 'subcircuit-descended') ? 'subcircuit-cu' : tableTag;

  const opcodes = {};
  for (let i = 0; i < table.length; i++) {
    const row = table[i] || {};
    opcodes[i] = _deriveOpcodeMeta(row, i);
  }

  return {
    id:            'inferred',
    name:          'Inferred from circuit',
    wordBits,
    pipelineDepth: DEFAULT_ISA.pipelineDepth,
    fields,
    opcodes,
    source,
    warnings,
  };
}
