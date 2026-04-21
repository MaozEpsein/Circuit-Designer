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
 * Out of scope for the MVP (tracked for Tier 14d):
 *   - SUB_CIRCUIT-based CUs (e.g. cpu-detailed.json): we return a fallback
 *     ISA with a warning rather than descend into the inner scene.
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
  const cu    = nodes.find(n => n.type === 'CU');
  const ir    = nodes.find(n => n.type === 'IR');

  if (!cu && !ir) {
    // A SUB_CIRCUIT-based CPU (e.g. cpu-detailed.json with a `cu_spec`
    // block) has no top-level CU or IR to introspect. Fall back to the
    // default ISA rather than returning null, so the rest of the analyzer
    // still has a usable opcode table.
    const hasSubCircuit = nodes.some(n => n.type === 'SUB_CIRCUIT');
    if (hasSubCircuit) {
      return _cloneFallback('subcircuit-fallback',
        ['SUB_CIRCUIT-based CPU — top-level CU/IR not visible; using default ISA']);
    }
    return null;
  }

  if (!cu) {
    return _cloneFallback('no-cu-fallback',
      ['no CU component found — using default ISA']);
  }

  // SUB_CIRCUIT-based CU: deferred to Tier 14d. Returning a fallback keeps
  // analysis functional on cpu-detailed.json rather than hard-erroring.
  if (cu.type === 'SUB_CIRCUIT') {
    return _cloneFallback('subcircuit-fallback',
      ['SUB_CIRCUIT-based CU not yet supported — using default ISA']);
  }

  if (!ir) {
    return _cloneFallback('no-ir-fallback',
      ['no IR component found — using default ISA']);
  }

  const fields = _fieldsFromIR(ir);
  const table  = Array.isArray(cu.controlTable) ? cu.controlTable : DEFAULT_CONTROL_TABLE;
  const source = Array.isArray(cu.controlTable) ? 'native' : 'native-default-table';

  const opcodes = {};
  for (let i = 0; i < table.length; i++) {
    const row = table[i] || {};
    opcodes[i] = _deriveOpcodeMeta(row, i);
  }

  return {
    id:            'inferred',
    name:          'Inferred from circuit',
    wordBits:      ir.instrWidth || DEFAULT_ISA.wordBits,
    pipelineDepth: DEFAULT_ISA.pipelineDepth,
    fields,
    opcodes,
    source,
    warnings:      [],
  };
}
