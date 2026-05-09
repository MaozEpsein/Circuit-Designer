// AST → Verilog pretty printer.
//
// Inverse of the Phase-8 parser: given an AST_KIND.Source (or a single
// Module node), produce Verilog text that re-parses to the same AST
// (modulo trivial whitespace / parenthesisation differences). Used by
// the L1 round-trip gate — parse the exporter's output, re-print it,
// then parse again and confirm structural equality.
//
// Not as polished as the IR → Verilog printer in `ir/toVerilog.js`;
// that one is the canonical output. This one is for AST round-trip
// testing only.

import { AST_KIND } from './ast.js';

function widthSpec(w) {
  if (typeof w !== 'number') return '';   // symbolic width (param-driven) — leave blank
  return w > 1 ? `[${w - 1}:0] ` : '';
}

function emitLiteral(n) {
  // Prefer the verbatim digit text when present — preserves x/z digits
  // and arbitrary casing the parser captured.
  const digits = n.text != null
    ? n.text
    : (typeof n.value === 'number'
        ? n.value.toString(n.base === 'h' ? 16 : n.base === 'b' ? 2 : n.base === 'o' ? 8 : 10)
        : '0');
  if (n.width !== null && n.base) return `${n.width}'${n.base}${digits}`;
  if (n.base)                      return `'${n.base}${digits}`;
  return digits;
}

export function emitExpr(e) {
  if (!e) return '/*<null>*/';
  switch (e.kind) {
    case AST_KIND.Literal:   return emitLiteral(e);
    case AST_KIND.Ref:       return e.name;
    case AST_KIND.Slice:
      if (_constEq(e.hi, e.lo)) return `${e.name}[${emitExpr(e.lo)}]`;
      return `${e.name}[${emitExpr(e.hi)}:${emitExpr(e.lo)}]`;
    case AST_KIND.Index:     return `${e.name}[${emitExpr(e.indexExpr)}]`;
    case AST_KIND.UnaryOp:   return `(${e.op}${emitExpr(e.operand)})`;
    case AST_KIND.BinaryOp:  return `(${emitExpr(e.left)} ${e.op} ${emitExpr(e.right)})`;
    case AST_KIND.Ternary:   return `(${emitExpr(e.cond)} ? ${emitExpr(e.then)} : ${emitExpr(e.else)})`;
    case AST_KIND.Concat:    return `{${e.parts.map(emitExpr).join(', ')}}`;
    case AST_KIND.Replicate: return `{${emitExpr(e.count)}{${emitExpr(e.inner)}}}`;
    case AST_KIND.Paren:     return `(${emitExpr(e.inner)})`;
    case AST_KIND.StringLit: return `"${(e.value || '').replace(/"/g, '\\"')}"`;
    case AST_KIND.SystemCall: return `${e.name}(${(e.args || []).map(emitExpr).join(', ')})`;
    default:                 return `/*<expr:${e.kind}>*/`;
  }
}

function _constEq(a, b) {
  if (a?.kind === AST_KIND.Literal && b?.kind === AST_KIND.Literal) {
    return a.value === b.value;
  }
  return false;
}

function emitStmt(s, indent = '    ') {
  if (!s) return `${indent}/*<null-stmt>*/`;
  switch (s.kind) {
    case AST_KIND.Block: {
      const inner = (s.stmts || []).map(x => emitStmt(x, indent + '  ')).join('\n');
      return `${indent}begin\n${inner}\n${indent}end`;
    }
    case AST_KIND.BlockingAssign:
      return `${indent}${emitExpr(s.lhs)} = ${emitExpr(s.rhs)};`;
    case AST_KIND.NonBlockingAssign:
      return `${indent}${emitExpr(s.lhs)} <= ${emitExpr(s.rhs)};`;
    case AST_KIND.If: {
      const lines = [`${indent}if (${emitExpr(s.cond)})`];
      lines.push(emitStmt(s.then, indent + '  '));
      if (s.else) {
        lines.push(`${indent}else`);
        lines.push(emitStmt(s.else, indent + '  '));
      }
      return lines.join('\n');
    }
    case AST_KIND.Case: {
      const lines = [`${indent}case (${emitExpr(s.selector)})`];
      for (const arm of (s.arms || [])) {
        if (arm.label === null) lines.push(`${indent}  default:`);
        else                     lines.push(`${indent}  ${emitExpr(arm.label)}:`);
        lines.push(emitStmt(arm.body, indent + '    '));
      }
      lines.push(`${indent}endcase`);
      return lines.join('\n');
    }
    case AST_KIND.SystemCall:
      return `${indent}${s.name}(${(s.args || []).map(emitExpr).join(', ')});`;
    default: return `${indent}/*<stmt:${s.kind}>*/`;
  }
}

function emitSensitivity(sens) {
  if (sens?.star) return '@(*)';
  const trigs = (sens?.triggers || []).map(t =>
    t.edge ? `${t.edge} ${t.signal}` : t.signal,
  ).join(' or ');
  return `@(${trigs || '*'})`;
}

function emitItem(it) {
  switch (it.kind) {
    case AST_KIND.NetDecl:
      return `  ${it.netKind} ${widthSpec(it.width)}${it.name};`;
    case AST_KIND.MemoryDecl:
      return `  reg ${widthSpec(it.width)}${it.name} [0:${(it.depth || 0) - 1}];`;
    case AST_KIND.ContAssign:
      return `  assign ${emitExpr(it.lhs)} = ${emitExpr(it.rhs)};`;
    case AST_KIND.Always:
      return `  always ${emitSensitivity(it.sensitivity)} ${emitStmt(it.body[0] || { kind: AST_KIND.Block, stmts: [] }, '  ').trimStart()}`;
    case AST_KIND.Initial:
      return `  initial ${emitStmt(it.body[0] || { kind: AST_KIND.Block, stmts: [] }, '  ').trimStart()}`;
    case AST_KIND.Instance: {
      if (it.isPrimitive) {
        const args = it.ports.map(p => emitExpr(p.expr)).join(', ');
        return `  ${it.type} ${it.instanceName}(${args});`;
      }
      const params = Object.keys(it.params || {});
      const paramStr = params.length
        ? ` #(${params.map(k => `.${k}(${emitExpr(it.params[k])})`).join(', ')})`
        : '';
      const conns = (it.ports || []).map(p => p.name
        ? `.${p.name}(${p.expr ? emitExpr(p.expr) : ''})`
        : emitExpr(p.expr)).join(', ');
      return `  ${it.type}${paramStr} ${it.instanceName} (${conns});`;
    }
    case AST_KIND.Port:
      // Port re-declared in body (some dialects).
      return `  ${it.dir} ${widthSpec(it.width)}${it.name};`;
    case AST_KIND.ParamDecl:
      return `  ${it.paramKind} ${widthSpec(it.width)}${it.name} = ${emitExpr(it.value)};`;
    case AST_KIND.SystemCall:
      return `  ${it.name}(${(it.args || []).map(emitExpr).join(', ')});`;
    default:
      return `  /* item:${it.kind} */`;
  }
}

function emitModule(m) {
  const lines = [];
  if (!m.ports || m.ports.length === 0) {
    lines.push(`module ${m.name};`);
  } else {
    lines.push(`module ${m.name}(`);
    lines.push(m.ports.map(p =>
      `  ${p.dir} ${widthSpec(p.width)}${p.name}`,
    ).join(',\n'));
    lines.push(');');
  }
  if ((m.items || []).length > 0) {
    lines.push('');
    for (const it of m.items) lines.push(emitItem(it));
  }
  lines.push('');
  lines.push('endmodule');
  return lines.join('\n');
}

export function astToVerilog(ast) {
  if (!ast) return '';
  if (ast.kind === AST_KIND.Source) {
    return ast.modules.map(emitModule).join('\n\n') + '\n';
  }
  if (ast.kind === AST_KIND.Module) {
    return emitModule(ast) + '\n';
  }
  return '';
}
