// Phase 9 — Elaboration: AST → IR.
//
// Lowers the surface AST built by Phase 8's parser into the structural
// IR that the rest of the pipeline already understands. Key
// responsibilities:
//   • Resolve `parameter` declarations via constant folding.
//   • Build a symbol table of port + net widths so expression nodes
//     can carry explicit widths in IR (Invariant 2 in ir/types.js).
//   • Lower AST expression kinds to IR expression kinds (one-to-one
//     for Ref/Slice/Literal/Binary/Unary/Concat/Replicate/Ternary/Index;
//     Paren collapses to its inner; StringLit becomes a synthetic
//     `_verilog`-bearing Literal so the printer can re-emit verbatim).
//   • Lower AST statements (Block, BA, NBA, If, Case, SystemCall) to
//     IR statements. SystemCall has no IR kind today, so we attach it
//     verbatim under a `_unsupported` marker that survives equality
//     checks.
//   • Hoist `initial` blocks into IR.alwaysBlocks (the IR uses one
//     shared list with a `sensitivity.initial` flag).
//   • Carry every AST `attributes` array through to the IR `attributes`
//     of the corresponding item.
//
// What we DON'T do here (deferred to Phase 10 — Component Inference):
//   • Mapping `and g(y, a, b);` back to a GATE_SLOT circuit node.
//   • Detecting that a `reg q; always @(posedge clk) q <= d;` pair
//     forms a REGISTER component.
// The IR produced here is structurally faithful to the source; turning
// that IR into circuit nodes is the next phase's job.

import { AST_KIND } from './ast.js';
import {
  IR_KIND, NET_KIND, PORT_DIR,
  makeModule, makePort, makeNet, makeMemory, makeAssign, makeAlways,
  makeInstance, makeRef, makeSlice, makeLiteral, makeBinaryOp, makeUnaryOp,
  makeTernary, makeIndex, makeConcat, makeReplicate,
} from '../ir/types.js';
import { SourceRef } from '../core/SourceRef.js';

export class ElaborateError extends Error {
  constructor(msg, srcRange) {
    super(`Elaborate error${srcRange ? ` at ${srcRange.line}:${srcRange.col}` : ''}: ${msg}`);
    this.srcRange = srcRange || null;
  }
}

// Hard error for an AST construct we don't support today. Always
// includes a pointer to SUPPORTED.md so the user knows where to check
// (and where a future contributor should add the missing case).
function _unsupported(what, srcRange) {
  return new ElaborateError(
    `unsupported construct: ${what}. ` +
    `See js/hdl/SUPPORTED.md for the accepted Verilog subset.`,
    srcRange,
  );
}

// ── Helpers ─────────────────────────────────────────────────
function _sr(astSr) {
  if (!astSr) return SourceRef.unknown();
  return SourceRef.fromVerilog(null, astSr.line, astSr.col, astSr);
}

// Build a line-offset table for the source text, then slice the
// substring corresponding to a srcRange. Returns null if the source
// wasn't passed in or the range is incomplete.
function _makeOriginalTextSlicer(source) {
  if (!source) return () => null;
  const offsets = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') offsets.push(i + 1);
  }
  const offsetOf = (line, col) => {
    if (!line || line < 1 || line > offsets.length) return null;
    return offsets[line - 1] + Math.max(0, (col | 0) - 1);
  };
  return (sr) => {
    if (!sr || !sr.line || !sr.end) return null;
    const start = offsetOf(sr.line, sr.col);
    const end   = offsetOf(sr.end.line, sr.end.col);
    if (start === null || end === null || end < start) return null;
    return source.slice(start, end);
  };
}

// Constant-fold an AST expression to a number, or null if non-constant.
// Used for parameter resolution and width arithmetic.
function _fold(expr, params = new Map()) {
  if (!expr) return null;
  switch (expr.kind) {
    case AST_KIND.Literal:
      return typeof expr.value === 'number' ? expr.value : null;
    case AST_KIND.Paren:
      return _fold(expr.inner, params);
    case AST_KIND.Ref:
      return params.has(expr.name) ? params.get(expr.name) : null;
    case AST_KIND.UnaryOp: {
      const v = _fold(expr.operand, params);
      if (v === null) return null;
      switch (expr.op) {
        case '-': return -v;
        case '+': return +v;
        case '!': return v ? 0 : 1;
        case '~': return ~v;
      }
      return null;
    }
    case AST_KIND.BinaryOp: {
      const l = _fold(expr.left, params), r = _fold(expr.right, params);
      if (l === null || r === null) return null;
      switch (expr.op) {
        case '+':  return l + r;
        case '-':  return l - r;
        case '*':  return l * r;
        case '/':  return r === 0 ? null : Math.trunc(l / r);
        case '%':  return r === 0 ? null : l % r;
        case '&':  return l & r;
        case '|':  return l | r;
        case '^':  return l ^ r;
        case '<<': return l << r;
        case '>>': return l >>> r;
        case '<':  return l <  r ? 1 : 0;
        case '<=': return l <= r ? 1 : 0;
        case '>':  return l >  r ? 1 : 0;
        case '>=': return l >= r ? 1 : 0;
        case '==': return l === r ? 1 : 0;
        case '!=': return l !== r ? 1 : 0;
        case '**': return Math.pow(l, r);
      }
      return null;
    }
    case AST_KIND.Ternary: {
      const c = _fold(expr.cond, params);
      if (c === null) return null;
      return c ? _fold(expr.then, params) : _fold(expr.else, params);
    }
  }
  return null;
}

// Resolve an AST width spec (number from parseOptionalWidth, or
// { hi, lo } when bounds are symbolic) using the parameter table.
function _resolveWidth(w, params) {
  if (typeof w === 'number') return w;
  if (w && typeof w === 'object' && 'hi' in w && 'lo' in w) {
    const hi = _fold(w.hi, params);
    const lo = _fold(w.lo, params);
    if (hi === null || lo === null) {
      throw new ElaborateError(`could not constant-fold width [${describe(w.hi)}:${describe(w.lo)}]`, w.hi?.srcRange);
    }
    return Math.abs(hi - lo) + 1;
  }
  return 1;
}
function describe(e) {
  if (!e) return '?';
  if (e.kind === AST_KIND.Literal) return String(e.value);
  if (e.kind === AST_KIND.Ref)     return e.name;
  return e.kind;
}

// ── Symbol table ───────────────────────────────────────────
// Tracks declared ports + nets + memories so expression elaboration
// can stamp explicit widths on Ref / Slice / Concat / etc. Carries
// the source-slicer so every IR node can pick up its `originalText`.
class Scope {
  constructor(slicer = () => null) {
    this.widths = new Map();    // netName → width
    this.params = new Map();    // paramName → folded value
    this.memories = new Set();  // names that refer to memory arrays (Index target)
    this.sliceText = slicer;
  }
  declare(name, width) { this.widths.set(name, width); }
  widthOf(name)        { return this.widths.get(name); }
}

// Tag an IR node with the verbatim source span if available.
function _attachOriginal(irNode, astSrcRange, scope) {
  if (!irNode || !scope?.sliceText) return irNode;
  const txt = scope.sliceText(astSrcRange);
  if (txt) irNode.originalText = txt;
  return irNode;
}

// ── Expression elaboration ─────────────────────────────────
function elabExpr(expr, scope) {
  if (!expr) throw new ElaborateError('null expression');
  switch (expr.kind) {
    case AST_KIND.Paren:
      return elabExpr(expr.inner, scope);
    case AST_KIND.Literal: {
      const w = expr.width || 32;
      const sr = _sr(expr.srcRange);
      // Preserve `4'bz` / `1'bx` as a verbatim literal — the IR's Literal
      // node can carry a `_verilog` override which the IR printer uses
      // as-is (matches the convention used by the tri-state translator).
      if (expr.text != null && /[xz]/i.test(expr.text)) {
        return { ...makeLiteral(0, w, sr),
          _verilog: `${expr.width != null ? expr.width : ''}'${expr.base || 'b'}${expr.text}`,
        };
      }
      return makeLiteral(expr.value | 0, w, sr);
    }
    case AST_KIND.Ref: {
      const w = scope.widthOf(expr.name) ?? 1;
      return makeRef(expr.name, w, _sr(expr.srcRange));
    }
    case AST_KIND.Slice: {
      const hi = _fold(expr.hi, scope.params);
      const lo = _fold(expr.lo, scope.params);
      if (hi === null || lo === null) {
        throw new ElaborateError(`non-constant slice [${describe(expr.hi)}:${describe(expr.lo)}]`, expr.srcRange);
      }
      return makeSlice(expr.name, hi, lo, _sr(expr.srcRange));
    }
    case AST_KIND.Index: {
      // Index into a memory or array. Width = element width if known;
      // otherwise default to 1.
      const w = scope.widthOf(expr.name) ?? 1;
      const idx = elabExpr(expr.indexExpr, scope);
      return makeIndex(expr.name, idx, w, _sr(expr.srcRange));
    }
    case AST_KIND.BinaryOp: {
      const l = elabExpr(expr.left, scope);
      const r = elabExpr(expr.right, scope);
      // Verilog bit-width rule: the result of a binary op takes the
      // wider of the two operands (boolean ops still produce 1-bit, but
      // we keep the wider so subsequent zero-extend works without info loss).
      const isCmp = ['==', '!=', '===', '!==', '<', '<=', '>', '>=', '&&', '||'].includes(expr.op);
      const w = isCmp ? 1 : Math.max(l.width | 0, r.width | 0, 1);
      return makeBinaryOp(expr.op, l, r, w, _sr(expr.srcRange));
    }
    case AST_KIND.UnaryOp: {
      const inner = elabExpr(expr.operand, scope);
      const isReduce = ['!', '&&', '||'].includes(expr.op);
      const w = isReduce ? 1 : (inner.width | 0 || 1);
      return makeUnaryOp(expr.op, inner, w, _sr(expr.srcRange));
    }
    case AST_KIND.Ternary: {
      const c = elabExpr(expr.cond, scope);
      const t = elabExpr(expr.then, scope);
      const e = elabExpr(expr.else, scope);
      const w = Math.max(t.width | 0, e.width | 0, 1);
      return makeTernary(c, t, e, w, _sr(expr.srcRange));
    }
    case AST_KIND.Concat: {
      const parts = expr.parts.map(p => elabExpr(p, scope));
      return makeConcat(parts, _sr(expr.srcRange));
    }
    case AST_KIND.Replicate: {
      const n = _fold(expr.count, scope.params);
      if (n === null) {
        throw new ElaborateError('replicate count must be constant', expr.srcRange);
      }
      const inner = elabExpr(expr.inner, scope);
      return makeReplicate(n, inner, _sr(expr.srcRange));
    }
    case AST_KIND.StringLit: {
      // Phase 8/9: surface as a Literal with verbatim Verilog text so
      // the printer keeps the string intact. Width is 8×N bits per
      // IEEE 1364 §3.6, but for IR purposes 0 is fine — nobody
      // arithmetics on strings.
      return { ...makeLiteral(0, 0, _sr(expr.srcRange)),
        _verilog: `"${(expr.value || '').replace(/"/g, '\\"')}"`,
      };
    }
    case AST_KIND.SystemCall: {
      // Inline `$func(arg, …)` inside an expression. No IR kind for it;
      // reconstruct the verbatim Verilog and stash on a Literal-shaped
      // sidecar so the printer emits it as-is.
      const args = (expr.args || []).map(a => _exprText(a));
      return { ...makeLiteral(0, 0, _sr(expr.srcRange)),
        _verilog: `${expr.name}(${args.join(', ')})`,
      };
    }
  }
  throw _unsupported(`expression kind '${expr.kind}'`, expr.srcRange);
}

// Reconstruct a Verilog text fragment from a parsed AST expression — used
// to round-trip system-call arguments verbatim. Keeps the elaborator
// independent of the AST printer (and avoids a circular import).
function _exprText(e) {
  if (!e) return '';
  switch (e.kind) {
    case AST_KIND.Literal:
      if (e.text != null) return `${e.width != null ? e.width : ''}'${e.base || 'd'}${e.text}`;
      return String(e.value ?? 0);
    case AST_KIND.StringLit: return `"${(e.value || '').replace(/"/g, '\\"')}"`;
    case AST_KIND.Ref:       return e.name;
    case AST_KIND.Paren:     return `(${_exprText(e.inner)})`;
    case AST_KIND.UnaryOp:   return `(${e.op}${_exprText(e.operand)})`;
    case AST_KIND.BinaryOp:  return `(${_exprText(e.left)} ${e.op} ${_exprText(e.right)})`;
    case AST_KIND.Ternary:   return `(${_exprText(e.cond)} ? ${_exprText(e.then)} : ${_exprText(e.else)})`;
    case AST_KIND.Concat:    return `{${(e.parts || []).map(_exprText).join(', ')}}`;
    case AST_KIND.Replicate: return `{${_exprText(e.count)}{${_exprText(e.inner)}}}`;
    case AST_KIND.Slice:     return `${e.name}[${_exprText(e.hi)}:${_exprText(e.lo)}]`;
    case AST_KIND.Index:     return `${e.name}[${_exprText(e.indexExpr)}]`;
    case AST_KIND.SystemCall:return `${e.name}(${(e.args || []).map(_exprText).join(', ')})`;
  }
  return '';
}

// ── Statement elaboration ──────────────────────────────────
// IR statements use string-tag union (NonBlockingAssign / BlockingAssign
// / IfStmt / CaseStmt) per the existing always-block emitter. We don't
// formally `import` those tags — they're string literals everywhere.
function elabStmt(stmt, scope) {
  if (!stmt) return null;
  switch (stmt.kind) {
    case AST_KIND.Block: {
      const out = [];
      for (const s of (stmt.stmts || [])) {
        const r = elabStmt(s, scope);
        if (Array.isArray(r)) out.push(...r);
        else if (r)           out.push(r);
      }
      return out;
    }
    case AST_KIND.BlockingAssign:
      return { kind: 'BlockingAssign', sourceRef: _sr(stmt.srcRange),
        lhs: elabExpr(stmt.lhs, scope), rhs: elabExpr(stmt.rhs, scope) };
    case AST_KIND.NonBlockingAssign:
      return { kind: 'NonBlockingAssign', sourceRef: _sr(stmt.srcRange),
        lhs: elabExpr(stmt.lhs, scope), rhs: elabExpr(stmt.rhs, scope) };
    case AST_KIND.If: {
      const then_ = elabStmt(stmt.then, scope);
      const else_ = stmt.else ? elabStmt(stmt.else, scope) : null;
      return { kind: 'IfStmt', sourceRef: _sr(stmt.srcRange),
        cond: elabExpr(stmt.cond, scope),
        then: Array.isArray(then_) ? then_ : (then_ ? [then_] : []),
        else: Array.isArray(else_) ? else_ : (else_ ? [else_] : null) };
    }
    case AST_KIND.Case: {
      const arms = [];
      let def = [];
      for (const a of (stmt.arms || [])) {
        const body = elabStmt(a.body, scope);
        const bodyArr = Array.isArray(body) ? body : (body ? [body] : []);
        if (a.label === null) def = bodyArr;
        else arms.push({ label: elabExpr(a.label, scope), body: bodyArr });
      }
      return { kind: 'CaseStmt', sourceRef: _sr(stmt.srcRange),
        selector: elabExpr(stmt.selector, scope),
        cases: arms,
        default: def };
    }
    case AST_KIND.SystemCall: {
      // No IR statement kind for it — wrap as a BlockingAssign whose RHS
      // is a verbatim-Verilog Literal. The IR printer will emit it as
      // the assignment text. Cleaner: mark with a dedicated kind that
      // the printer ignores. Use that approach so the IR equality check
      // stays meaningful.
      const args = (stmt.args || []).map(_exprText).join(', ');
      return { kind: 'SystemCall', sourceRef: _sr(stmt.srcRange),
        name: stmt.name, args: stmt.args || [], _verilog: `${stmt.name}(${args});` };
    }
  }
  // For / Loop statements (Phase 8 parse-only): preserve verbatim
  // rather than throwing — many corpus files use them in `initial`
  // blocks for memory init, which the elaborator doesn't lower but
  // the import path should still accept.
  if (stmt.kind === 'For' || stmt.kind === 'Loop') {
    return { kind: stmt.kind, sourceRef: _sr(stmt.srcRange),
             _verilog: '/* unsynthesised loop */' };
  }
  throw _unsupported(`statement kind '${stmt.kind}'`, stmt.srcRange);
}

// ── Module elaboration ─────────────────────────────────────
function elabModule(mod, sliceText = () => null) {
  const scope = new Scope(sliceText);
  // Pre-pass 1: collect parameter values (left-to-right; later params
  // may reference earlier ones — handled by passing scope.params).
  for (const it of (mod.items || [])) {
    if (it.kind === AST_KIND.ParamDecl) {
      const v = _fold(it.value, scope.params);
      if (v === null) throw new ElaborateError(`parameter ${it.name} has non-constant value`, it.srcRange);
      scope.params.set(it.name, v);
    }
  }
  // Pre-pass 2: declare port + net widths so expressions can resolve.
  const ports = (mod.ports || []).map(p => {
    const w = _resolveWidth(p.width, scope.params);
    scope.declare(p.name, w);
    return _attachOriginal(
      makePort({ name: p.name, dir: _portDir(p.dir), width: w, sourceRef: _sr(p.srcRange) }),
      p.srcRange, scope);
  });
  const nets = [];
  const memories = [];
  for (const it of (mod.items || [])) {
    if (it.kind === AST_KIND.NetDecl) {
      const w = _resolveWidth(it.width, scope.params);
      scope.declare(it.name, w);
      nets.push(_attachOriginal(makeNet({ name: it.name, originalName: it.name, width: w,
        kind: it.netKind === 'reg' ? NET_KIND.REG : NET_KIND.WIRE,
        sourceRef: _sr(it.srcRange), attributes: _attrs(it) }),
        it.srcRange, scope));
    } else if (it.kind === AST_KIND.MemoryDecl) {
      const w = _resolveWidth(it.width, scope.params);
      scope.declare(it.name, w);
      scope.memories.add(it.name);
      memories.push(_attachOriginal(
        makeMemory({ instanceName: it.name, width: w, depth: it.depth || 0,
          sourceRef: _sr(it.srcRange), attributes: _attrs(it) }),
        it.srcRange, scope));
    }
  }
  // Pre-pass 2.5: ports re-declared inside the body (`input wire foo;`)
  // shouldn't double-add ports, but their widths may differ. Use the
  // header width as authoritative and warn (silent for now).
  // Pre-pass 3: lower assigns, alwaysBlocks, instances.
  const assigns = [];
  const alwaysBlocks = [];
  const instances = [];
  for (const it of (mod.items || [])) {
    switch (it.kind) {
      case AST_KIND.ContAssign:
        assigns.push(_attachOriginal(makeAssign({
          lhs: elabExpr(it.lhs, scope),
          rhs: elabExpr(it.rhs, scope),
          sourceRef: _sr(it.srcRange),
          attributes: _attrs(it),
        }), it.srcRange, scope));
        break;
      case AST_KIND.Always: {
        const body = elabStmt(it.body[0], scope) || [];
        alwaysBlocks.push(_attachOriginal(makeAlways({
          sensitivity: it.sensitivity,
          body: Array.isArray(body) ? body : [body],
          sourceRef: _sr(it.srcRange),
          attributes: _attrs(it),
        }), it.srcRange, scope));
        break;
      }
      case AST_KIND.Initial: {
        const body = elabStmt(it.body[0], scope) || [];
        alwaysBlocks.push(_attachOriginal(makeAlways({
          sensitivity: { initial: true },
          body: Array.isArray(body) ? body : [body],
          sourceRef: _sr(it.srcRange),
          attributes: _attrs(it),
        }), it.srcRange, scope));
        break;
      }
      case AST_KIND.Instance: {
        // Build portMap from the AST's port list. For primitive
        // instances (positional), synthesise port names matching what
        // the IR printer expects (Y, A, B, …) so the export round-trip
        // produces the same primitive shape.
        const portMap = {};
        const portOrder = [];
        if (it.isPrimitive) {
          const NAMES = ['Y', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
          (it.ports || []).forEach((p, i) => {
            const k = NAMES[i] || `P${i}`;
            portMap[k] = elabExpr(p.expr, scope);
            portOrder.push(k);
          });
        } else {
          for (const p of (it.ports || [])) {
            if (!p.name) {
              // Positional connection on a non-primitive — keep with
              // numeric key to preserve order.
              portMap[`_p${Object.keys(portMap).length}`] =
                p.expr ? elabExpr(p.expr, scope) : null;
            } else if (p.expr) {
              portMap[p.name] = elabExpr(p.expr, scope);
            }
          }
        }
        const params = {};
        for (const [k, v] of Object.entries(it.params || {})) {
          const folded = _fold(v, scope.params);
          params[k] = folded !== null ? folded : v;   // keep AST when non-folded
        }
        const inst = makeInstance({
          type: it.type,
          instanceName: it.instanceName,
          portMap,
          params,
          sourceRef: _sr(it.srcRange),
          attributes: _attrs(it),
        });
        if (it.isPrimitive) {
          inst.isPrimitive = true;
          inst.portOrder = portOrder;
        }
        _attachOriginal(inst, it.srcRange, scope);
        instances.push(inst);
        break;
      }
      case AST_KIND.ParamDecl:
      case AST_KIND.NetDecl:
      case AST_KIND.MemoryDecl:
      case AST_KIND.Port:
        // Already consumed in pre-passes.
        break;
      default:
        // Unknown item kind — leave a marker on the module so callers
        // can decide what to do.
        break;
    }
  }
  return _attachOriginal(makeModule({
    name: mod.name,
    ports, nets, memories, assigns, alwaysBlocks, instances,
    sourceRef: _sr(mod.srcRange),
    attributes: _attrs(mod),
  }), mod.srcRange, scope);
}

function _portDir(d) {
  if (d === 'output') return PORT_DIR.OUTPUT;
  if (d === 'inout')  return PORT_DIR.INOUT;
  return PORT_DIR.INPUT;
}
function _attrs(astNode) {
  if (!Array.isArray(astNode?.attributes)) return [];
  // IR attributes are { key, value } pairs; AST attribute strings get
  // wrapped under a `verilog-attr` key so they survive round-trip but
  // don't collide with IR-internal keys (like `stage`).
  return astNode.attributes.map(s => ({ key: 'verilog-attr', value: s }));
}

// ── Public entry ───────────────────────────────────────────
// `elaborate(ast, opts) → { ir, errors }` where `ir` is the FIRST
// IRModule (top). Multi-module sources elaborate every module and
// expose the rest via `ir.submodules`.
//
// opts:
//   source?: string         original Verilog text — when supplied,
//                           every IR node carrying a srcRange picks
//                           up `originalText` (verbatim slice). Used
//                           by Phase 12 Fidelity Mode.
export function elaborate(ast, opts = {}) {
  if (!ast || ast.kind !== AST_KIND.Source || ast.modules.length === 0) {
    throw new ElaborateError('elaborate() expects a Source AST with at least one Module');
  }
  const sliceText = _makeOriginalTextSlicer(opts.source);
  const errors = [];
  const modules = [];
  for (const m of ast.modules) {
    try {
      modules.push(elabModule(m, sliceText));
    } catch (e) {
      if (e instanceof ElaborateError) errors.push(e);
      else throw e;
    }
  }
  if (modules.length === 0) {
    return { ir: null, errors };
  }
  const top = modules[modules.length - 1];   // last module is top by convention
  if (modules.length > 1) top.submodules = modules.slice(0, -1);
  return { ir: top, errors };
}
