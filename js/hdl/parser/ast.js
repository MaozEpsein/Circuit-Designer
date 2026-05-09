// Verilog AST node types and factories.
//
// The AST is intentionally close to the surface syntax — a thin layer
// over what the lexer produced. Elaboration (Phase 9) is what lowers
// AST → IR; Phase 8 stops at "parsed faithfully".
//
// Every node carries:
//   - kind: string tag (one of AST_KIND.*)
//   - srcRange: { line, col, end? } for diagnostics + source-mapping
// Many also carry attributes / docComments captured during parse.

export const AST_KIND = {
  // Top
  Source:      'Source',         // { modules: Module[] }
  Module:      'Module',         // { name, ports[], items[] }
  Port:        'Port',           // { name, dir, netKind, width, isSigned }
  // Items inside a module body
  NetDecl:     'NetDecl',        // { netKind: 'wire'|'reg', width, name }
  MemoryDecl:  'MemoryDecl',     // { width, name, depth }
  ContAssign:  'ContAssign',     // { lhs: Expr, rhs: Expr }
  Always:      'Always',         // { sensitivity, body: Stmt[] }
  Initial:     'Initial',        // { body: Stmt[] }
  Instance:    'Instance',       // { type, instanceName, params, ports, isPrimitive, positional }
  ParamDecl:   'ParamDecl',      // { kind: 'parameter'|'localparam', name, value, width? }
  SystemCall:  'SystemCall',     // { name, args: Expr[] }    — e.g. $readmemh, $display
  // Statements
  Block:       'Block',          // begin ... end → { stmts: Stmt[] }
  BlockingAssign:    'BlockingAssign',     // { lhs, rhs }
  NonBlockingAssign: 'NonBlockingAssign',  // { lhs, rhs }
  If:          'If',             // { cond, then: Stmt, else: Stmt|null }
  Case:        'Case',           // { selector, arms: { label: Expr|null, body: Stmt }[] (label null = default) }
  // Expressions
  Ref:         'Ref',            // { name }
  Slice:       'Slice',          // { name, hi: Expr, lo: Expr }
  Index:       'Index',          // { name, indexExpr }
  Literal:     'Literal',        // { value, width, base, text? }   (base: 'd'|'h'|'b'|'o' or null for unsized; text preserves x/z digits)
  StringLit:   'StringLit',      // { value }                — for $display etc; reserved
  BinaryOp:    'BinaryOp',       // { op, left, right }
  UnaryOp:     'UnaryOp',        // { op, operand }
  Ternary:     'Ternary',        // { cond, then, else }
  Concat:      'Concat',         // { parts: Expr[] }
  Replicate:   'Replicate',      // { count: Expr, inner: Expr }
  Paren:       'Paren',          // { inner: Expr } — preserved so the round-trip pretty-printer can match
};

export const PORT_DIR = { INPUT: 'input', OUTPUT: 'output', INOUT: 'inout' };

function _node(kind, srcRange, props) {
  return { kind, srcRange: srcRange || null, ...props };
}

// Attach pending Verilog attribute strings (collected by the parser
// from preceding `(* … *)` blocks) to a freshly-built AST item.
export function attachAttrs(node, attrs) {
  if (attrs && attrs.length) node.attributes = [...attrs];
  return node;
}

// ── Factories ────────────────────────────────────────────────
export const mkSource    = (modules, sr)               => _node(AST_KIND.Source,     sr, { modules });
export const mkModule    = (name, ports, items, sr)    => _node(AST_KIND.Module,     sr, { name, ports, items });
export const mkPort      = (name, dir, netKind, width, isSigned, sr) =>
  _node(AST_KIND.Port, sr, { name, dir, netKind, width, isSigned: !!isSigned });
export const mkNetDecl   = (netKind, width, name, sr)  => _node(AST_KIND.NetDecl,    sr, { netKind, width, name });
export const mkMemoryDecl = (width, name, depth, sr)   => _node(AST_KIND.MemoryDecl, sr, { width, name, depth });
export const mkContAssign = (lhs, rhs, sr)             => _node(AST_KIND.ContAssign, sr, { lhs, rhs });
export const mkAlways    = (sensitivity, body, sr)     => _node(AST_KIND.Always,     sr, { sensitivity, body });
export const mkInitial   = (body, sr)                  => _node(AST_KIND.Initial,    sr, { body });
export const mkInstance  = (type, instanceName, params, ports, isPrimitive, positional, sr) =>
  _node(AST_KIND.Instance, sr, { type, instanceName, params, ports, isPrimitive: !!isPrimitive, positional: !!positional });
export const mkParamDecl  = (paramKind, name, value, width, sr) =>
  _node(AST_KIND.ParamDecl,  sr, { paramKind, name, value, width: width ?? null });
export const mkSystemCall = (name, args, sr) =>
  _node(AST_KIND.SystemCall, sr, { name, args });
export const mkBlock     = (stmts, sr)                 => _node(AST_KIND.Block,      sr, { stmts });
export const mkBA        = (lhs, rhs, sr)              => _node(AST_KIND.BlockingAssign,    sr, { lhs, rhs });
export const mkNBA       = (lhs, rhs, sr)              => _node(AST_KIND.NonBlockingAssign, sr, { lhs, rhs });
export const mkIf        = (cond, then_, else_, sr)    => _node(AST_KIND.If,         sr, { cond, then: then_, else: else_ });
export const mkCase      = (selector, arms, sr)        => _node(AST_KIND.Case,       sr, { selector, arms });
export const mkRef       = (name, sr)                  => _node(AST_KIND.Ref,        sr, { name });
export const mkSlice     = (name, hi, lo, sr)          => _node(AST_KIND.Slice,      sr, { name, hi, lo });
export const mkIndex     = (name, indexExpr, sr)       => _node(AST_KIND.Index,      sr, { name, indexExpr });
export const mkLiteral   = (value, width, base, sr, text) => _node(AST_KIND.Literal,    sr, { value, width, base, text: text || null });
export const mkBinaryOp  = (op, left, right, sr)       => _node(AST_KIND.BinaryOp,   sr, { op, left, right });
export const mkUnaryOp   = (op, operand, sr)           => _node(AST_KIND.UnaryOp,    sr, { op, operand });
export const mkTernary   = (cond, then_, else_, sr)    => _node(AST_KIND.Ternary,    sr, { cond, then: then_, else: else_ });
export const mkConcat    = (parts, sr)                 => _node(AST_KIND.Concat,     sr, { parts });
export const mkReplicate = (count, inner, sr)          => _node(AST_KIND.Replicate,  sr, { count, inner });
export const mkParen     = (inner, sr)                 => _node(AST_KIND.Paren,      sr, { inner });
