// HDL-IR — intermediate representation shared by export and import paths.
//
// Design invariants (enforced by construction helpers below):
//
//   1. NORMAL FORM IS STRUCTURAL. Primitive ops (AND, OR, XOR, NOT, …) are
//      IRInstance nodes, never expression trees. Expression trees are only
//      input to elaboration; they are lowered to instances before the IR
//      is sealed.
//
//   2. WIDTH IS EXPLICIT. Every bit-width mismatch is reconciled with a
//      ZeroExtend or SignExtend expression node. No implicit Verilog
//      width rules live inside IR.
//
//   3. EVERY NODE HAS A SourceRef AND AN ATTRIBUTES ARRAY. attributes are
//      opaque metadata (e.g. `(* keep *)`) preserved verbatim across
//      round-trip; IR makes no semantic use of them.
//
//   4. IDENTIFIER STABILITY. IRNet carries both a sanitised `name` (used
//      in emitted Verilog) and the user-given `originalName` (so that
//      export → import → export preserves user labels byte-for-byte).
//
//   5. SOURCE TEXT PRESERVATION. Every IR node carries an optional
//      `originalText: string | null`. Populated by the importer from the
//      exact source range of the parsed construct; null for export-only
//      IRs. Fidelity Mode (Phase 12) prefers `originalText` over IR-driven
//      re-emission; Canonical mode ignores it.

import { SourceRef } from '../core/SourceRef.js';

export const IR_KIND = Object.freeze({
  Module:     'Module',
  Port:       'Port',
  Net:        'Net',
  Instance:   'Instance',
  Assign:     'Assign',
  Always:     'Always',
  Memory:     'Memory',
  // Expression nodes:
  Ref:        'Ref',
  Slice:      'Slice',
  Literal:    'Literal',
  BinaryOp:   'BinaryOp',
  UnaryOp:    'UnaryOp',
  Concat:     'Concat',
  Replicate:  'Replicate',
  ZeroExtend: 'ZeroExtend',
  SignExtend: 'SignExtend',
  Ternary:    'Ternary',
  Index:      'Index',
});

export const PORT_DIR = Object.freeze({
  INPUT: 'input',
  OUTPUT: 'output',
  INOUT: 'inout',
});

export const NET_KIND = Object.freeze({
  WIRE: 'wire',
  REG: 'reg',
  TRI: 'tri',
});

function base(kind, sourceRef, attributes, originalText = null) {
  return {
    kind,
    sourceRef: sourceRef ?? SourceRef.unknown(),
    attributes: attributes ?? [],
    originalText,     // Phase 8+: import paths populate; null for export-only IRs.
  };
}

// ── Constructors ─────────────────────────────────────────────

export function makeModule({ name, ports = [], nets = [], instances = [], assigns = [], alwaysBlocks = [], memories = [], submodules = [], sourceRef, attributes } = {}) {
  return {
    ...base(IR_KIND.Module, sourceRef, attributes),
    name,
    ports,
    nets,
    instances,
    assigns,
    alwaysBlocks,
    memories,
    submodules,
  };
}

export function makePort({ name, dir, width = 1, sourceRef, attributes } = {}) {
  return { ...base(IR_KIND.Port, sourceRef, attributes), name, dir, width };
}

export function makeNet({ name, originalName = null, width = 1, kind = NET_KIND.WIRE, sourceRef, attributes } = {}) {
  return {
    ...base(IR_KIND.Net, sourceRef, attributes),
    name,
    originalName,
    width,
    netKind: kind,
  };
}

// An instance of a primitive (AND/OR/FF/…) or a user module.
export function makeInstance({ type, instanceName, portMap = {}, params = {}, sourceRef, attributes } = {}) {
  return {
    ...base(IR_KIND.Instance, sourceRef, attributes),
    type,
    instanceName,
    portMap,   // { portName: ExprNode }
    params,    // { paramName: primitive value }
  };
}

export function makeAssign({ lhs, rhs, sourceRef, attributes } = {}) {
  return { ...base(IR_KIND.Assign, sourceRef, attributes), lhs, rhs };
}

export function makeAlways({ sensitivity, body, sourceRef, attributes } = {}) {
  return { ...base(IR_KIND.Always, sourceRef, attributes), sensitivity, body };
}

export function makeMemory({ instanceName, width, depth, contents = null, hasSyncWrite = true, hasAsyncRead = true, sourceRef, attributes } = {}) {
  return {
    ...base(IR_KIND.Memory, sourceRef, attributes),
    instanceName, width, depth, contents, hasSyncWrite, hasAsyncRead,
  };
}

// ── Expressions ──────────────────────────────────────────────

export function makeRef(netName, width, sourceRef) {
  return { ...base(IR_KIND.Ref, sourceRef), netName, width };
}

export function makeSlice(netName, hi, lo, sourceRef) {
  return {
    ...base(IR_KIND.Slice, sourceRef),
    netName, hi, lo, width: hi - lo + 1,
  };
}

export function makeLiteral(value, width, sourceRef) {
  return { ...base(IR_KIND.Literal, sourceRef), value, width };
}

export function makeBinaryOp(op, left, right, width, sourceRef) {
  return { ...base(IR_KIND.BinaryOp, sourceRef), op, left, right, width };
}

export function makeUnaryOp(op, operand, width, sourceRef) {
  return { ...base(IR_KIND.UnaryOp, sourceRef), op, operand, width };
}

export function makeTernary(cond, then, else_, width, sourceRef) {
  return { ...base(IR_KIND.Ternary, sourceRef), cond, then, else: else_, width };
}

// Indexed access into a memory or array net: emits `name[indexExpr]`.
// Used by REG_FILE / RAM / ROM translators where the index is a runtime
// signal (not a compile-time constant — Slice covers that case).
export function makeIndex(name, indexExpr, width, sourceRef) {
  return { ...base(IR_KIND.Index, sourceRef), name, indexExpr, width };
}

export function makeConcat(parts, sourceRef) {
  const width = parts.reduce((w, p) => w + (p.width | 0), 0);
  return { ...base(IR_KIND.Concat, sourceRef), parts, width };
}

export function makeReplicate(count, inner, sourceRef) {
  return {
    ...base(IR_KIND.Replicate, sourceRef),
    count, inner, width: count * inner.width,
  };
}

export function makeZeroExtend(inner, toWidth, sourceRef) {
  return {
    ...base(IR_KIND.ZeroExtend, sourceRef),
    inner, width: toWidth,
  };
}

export function makeSignExtend(inner, toWidth, sourceRef) {
  return {
    ...base(IR_KIND.SignExtend, sourceRef),
    inner, width: toWidth,
  };
}

// Ensure `expr` has exactly `targetWidth` bits; inserts a ZeroExtend or a
// Slice if needed. Signed contexts should call ensureSigned() instead.
export function ensureWidth(expr, targetWidth, sourceRef) {
  const w = expr.width | 0;
  if (w === targetWidth) return expr;
  if (w < targetWidth) return makeZeroExtend(expr, targetWidth, sourceRef);
  // Truncation: slice down to target.
  if (expr.kind === IR_KIND.Ref || expr.kind === IR_KIND.Slice) {
    const base = expr.kind === IR_KIND.Slice ? expr.lo : 0;
    return makeSlice(expr.netName, base + targetWidth - 1, base, sourceRef);
  }
  // Fallback: concat with high bits dropped — represent as explicit Concat of
  // a single part sliced by width. For Phase 2 the exporter only widens, so
  // this branch is reserved for the importer. Placeholder until Phase 10.
  return { ...expr, width: targetWidth, truncated: true };
}
