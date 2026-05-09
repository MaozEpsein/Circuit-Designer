// Verilog recursive-descent parser.
//
// Phase 8 vertical slice: handles the constructs our exporter emits
// (Phase 1–7), enough to round-trip every demo under `verilog-phase*`.
// Out of scope for now: generate blocks, parameters with type, tasks,
// functions, system tasks, attributes (* … *).
//
// Public entry: `parseVerilog(text, opts) → { ast, errors }` where
// ast is an AST_KIND.Source node and errors is a possibly-empty list
// of recoverable diagnostics. A throw indicates an unrecoverable
// failure with location info.

import { tokenize, LexError } from './lexer.js';
import {
  AST_KIND, PORT_DIR, attachAttrs,
  mkSource, mkModule, mkPort, mkNetDecl, mkMemoryDecl, mkContAssign,
  mkAlways, mkInitial, mkInstance, mkBlock, mkBA, mkNBA, mkIf, mkCase,
  mkRef, mkSlice, mkIndex, mkLiteral, mkBinaryOp, mkUnaryOp, mkTernary,
  mkConcat, mkReplicate, mkParen, mkParamDecl, mkSystemCall,
} from './ast.js';

export class ParseError extends Error {
  constructor(msg, tok) {
    const where = tok ? ` at ${tok.line}:${tok.col} (near "${tok.text}")` : '';
    super(`Parse error${where}: ${msg}`);
    this.token = tok;
  }
}

// Verilog expression operator precedence (lowest → highest).
// Pulled from IEEE 1364-2005 Table 5-4.
const BIN_PREC = {
  '||': 2, '&&': 3,
  '|': 4, '~|': 4,
  '^': 5, '~^': 5, '^~': 5,
  '&': 6, '~&': 6,
  '==': 7, '!=': 7, '===': 7, '!==': 7,
  '<': 8, '<=': 8, '>': 8, '>=': 8,
  '<<': 9, '>>': 9, '<<<': 9, '>>>': 9,
  '+': 10, '-': 10,
  '*': 11, '/': 11, '%': 11,
  '**': 12,
};

function _isBinOp(t) {
  return t.kind === 'op' && Object.prototype.hasOwnProperty.call(BIN_PREC, t.text);
}

class Parser {
  constructor(tokens, opts = {}) {
    this.toks = tokens;
    this.i = 0;
    this._pendingAttrs = [];
    this._errors = [];
    // Resource limits (IEEE-1364 §7 doesn't bound depth or count, but
    // adversarial input shouldn't hang the importer). Defaults are
    // generous enough for hand-written designs and the demo corpus.
    this.opts = {
      maxRecursionDepth: opts.maxRecursionDepth || 1024,
      maxTokens:         opts.maxTokens         || 1_000_000,
      deadlineMs:        opts.deadlineMs        || 5000,
    };
    this._depth = 0;
    this._deadline = Date.now() + this.opts.deadlineMs;
    if (tokens.length > this.opts.maxTokens) {
      throw new ParseError(`token count ${tokens.length} exceeds limit ${this.opts.maxTokens}`, tokens[0]);
    }
  }
  // Drain attribute tokens that precede an item.
  _drainAttrs() {
    while (this.peek() && this.peek().kind === 'attr') {
      this._pendingAttrs.push(this.consume().text);
    }
  }
  // Wrap descending into a new scope — checks recursion depth + deadline.
  _enter() {
    if (++this._depth > this.opts.maxRecursionDepth) {
      throw new ParseError(`recursion depth exceeded (>${this.opts.maxRecursionDepth})`, this.peek());
    }
    if (Date.now() > this._deadline) {
      throw new ParseError(`parse deadline exceeded (>${this.opts.deadlineMs}ms)`, this.peek());
    }
  }
  _leave() { this._depth--; }
  peek(o = 0)  { return this.toks[this.i + o]; }
  consume()    { return this.toks[this.i++]; }
  is(kind, text) {
    const t = this.peek();
    return t && t.kind === kind && (text === undefined || t.text === text);
  }
  eat(kind, text) {
    if (!this.is(kind, text)) {
      const t = this.peek();
      throw new ParseError(`expected ${text || kind}`, t);
    }
    return this.consume();
  }
  // Consume if matches; return null otherwise.
  match(kind, text) { return this.is(kind, text) ? this.consume() : null; }
  srOf(t) { return t ? { line: t.line, col: t.col, end: t.end } : null; }

  // ── Top level ──────────────────────────────────────────────
  parseSource() {
    const startTok = this.peek();
    const modules = [];
    while (!this.is('eof')) {
      // Drain top-level (* attribute *) blocks — they belong to the
      // next module and get attached via parseModule's _drainAttrs.
      this._drainAttrs();
      if (this.is('eof')) break;
      if (this.is('kw', 'module')) {
        const m = this.parseModule();
        // Attach any pending attrs to the module itself.
        if (this._pendingAttrs.length) {
          attachAttrs(m, this._pendingAttrs);
          this._pendingAttrs = [];
        }
        modules.push(m);
      } else throw new ParseError(`expected 'module'`, this.peek());
    }
    return mkSource(modules, this.srOf(startTok));
  }

  // module NAME [ ( portlist ) ] ; items endmodule
  parseModule() {
    const head = this.eat('kw', 'module');
    const nameT = this.eat('id');
    const name  = nameT.text;
    let ports = [];
    if (this.match('op', '(')) {
      ports = this.parsePortList();
      this.eat('op', ')');
    }
    this.eat('op', ';');
    const items = [];
    while (!this.is('kw', 'endmodule') && !this.is('eof')) {
      try {
        const item = this.parseModuleItem();
        if (Array.isArray(item)) items.push(...item);
        else if (item)            items.push(item);
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        // Recover: stash the error and skip to the next statement
        // boundary (`;`) or matching `end`/`endmodule`. Lets the parser
        // surface multiple problems in one pass instead of dying on
        // the first one.
        this._errors.push(e);
        this._recoverToStatementBoundary();
      }
    }
    const endTok = this.eat('kw', 'endmodule');
    // Span the whole module from `module` head to the end of `endmodule`
    // so Phase-12 Fidelity Mode can slice the verbatim source.
    const sr = { ...this.srOf(head), end: endTok.end };
    return mkModule(name, ports, items, sr);
  }
  _recoverToStatementBoundary() {
    while (!this.is('eof')) {
      const t = this.consume();
      if (t.kind === 'op' && t.text === ';') return;
      if (t.kind === 'kw' && (t.text === 'endmodule' || t.text === 'end' || t.text === 'endcase')) {
        // Don't consume the closing keyword — the outer loop needs it.
        this.i--;
        return;
      }
    }
  }

  parsePortList() {
    if (this.is('op', ')')) return [];
    const ports = [];
    do {
      ports.push(...this.parsePortOne());
    } while (this.match('op', ','));
    return ports;
  }
  // One declaration may declare multiple ports of the same shape:
  //   input [3:0] a, b, c
  parsePortOne() {
    const t0 = this.peek();
    let dir = PORT_DIR.INPUT;
    if      (this.match('kw', 'input'))  dir = PORT_DIR.INPUT;
    else if (this.match('kw', 'output')) dir = PORT_DIR.OUTPUT;
    else if (this.match('kw', 'inout'))  dir = PORT_DIR.INOUT;
    let netKind = 'wire';
    if      (this.match('kw', 'wire')) netKind = 'wire';
    else if (this.match('kw', 'reg'))  netKind = 'reg';
    let isSigned = false;
    if (this.match('kw', 'signed')) isSigned = true;
    const width = this.parseOptionalWidth();
    const names = [];
    names.push(this.eat('id').text);
    while (this.is('op', ',') && this.peek(1)?.kind === 'id'
           && !KW_STARTS_PORT(this.peek(2))) {
      this.consume();   // ,
      names.push(this.eat('id').text);
    }
    return names.map(n => mkPort(n, dir, netKind, width, isSigned, this.srOf(t0)));
  }

  // [ msb : lsb ] → returns numeric width when both bounds are integer
  // literals (the case for everything our exporter emits). Returns 1
  // when the brackets are absent.
  parseOptionalWidth() {
    if (!this.match('op', '[')) return 1;
    const hi = this.parseExpr();
    this.eat('op', ':');
    const lo = this.parseExpr();
    this.eat('op', ']');
    const hiV = _constInt(hi);
    const loV = _constInt(lo);
    if (hiV !== null && loV !== null) return Math.abs(hiV - loV) + 1;
    return { hi, lo };  // symbolic — leave for elaboration
  }

  parseModuleItem() {
    this._drainAttrs();
    const itemAttrs = this._pendingAttrs;
    this._pendingAttrs = [];
    const wrap = (it) => {
      if (!it) return it;
      if (Array.isArray(it)) {
        if (itemAttrs.length) it.forEach(x => attachAttrs(x, itemAttrs));
        return it;
      }
      return attachAttrs(it, itemAttrs);
    };
    const t = this.peek();
    const result = this._parseModuleItemInner(t);
    return wrap(result);
  }
  _parseModuleItemInner(t) {
    if (t.kind === 'kw') {
      switch (t.text) {
        case 'wire': case 'reg': case 'integer':
          return this.parseNetOrMemory();
        case 'input': case 'output': case 'inout':
          // Port re-declared inside body. Treat as a net-decl with the
          // direction stripped for now (Phase 8 keeps it simple).
          return this.parsePortItem();
        case 'assign':       return this.parseContAssign();
        case 'always':       return this.parseAlways();
        case 'initial':      return this.parseInitial();
        case 'and': case 'or': case 'nand': case 'nor': case 'xor':
        case 'xnor': case 'not': case 'buf':
          return this.parsePrimitiveInstance();
        case 'parameter': case 'localparam':
          return this.parseParameter();
      }
    }
    if (t.kind === 'id') {
      // Either module instantiation or, if we ever see typed nets, a decl.
      return this.parseModuleInstance();
    }
    if (t.kind === 'op' && t.text === ';') {
      this.consume(); return null;
    }
    throw new ParseError(`unexpected token '${t.text}' inside module`, t);
  }

  // wire [W-1:0] a, b;
  // reg  [W-1:0] mem [0:DEPTH-1];
  parseNetOrMemory() {
    const tok = this.consume();              // wire / reg / integer
    const netKind = tok.text;
    const width = this.parseOptionalWidth();
    const items = [];
    do {
      const nameT = this.eat('id');
      // Memory? `[0:D-1]` after the name → array dimension.
      if (this.match('op', '[')) {
        const lo = this.parseExpr();
        this.eat('op', ':');
        const hi = this.parseExpr();
        this.eat('op', ']');
        const loV = _constInt(lo);
        const hiV = _constInt(hi);
        const depth = (loV !== null && hiV !== null) ? (Math.abs(hiV - loV) + 1) : null;
        items.push(mkMemoryDecl(width, nameT.text, depth, this.srOf(nameT)));
      } else {
        items.push(mkNetDecl(netKind, width, nameT.text, this.srOf(nameT)));
      }
    } while (this.match('op', ','));
    this.eat('op', ';');
    return items;
  }

  parsePortItem() {
    const ports = this.parsePortOne();
    this.eat('op', ';');
    // Re-emitted port = redundant decl when the header already lists it;
    // keep the AST faithful by surfacing them as PortDecl items.
    return ports;
  }

  parseContAssign() {
    const head = this.eat('kw', 'assign');
    const lhs  = this.parseExpr();
    this.eat('op', '=');
    const rhs  = this.parseExpr();
    this.eat('op', ';');
    return mkContAssign(lhs, rhs, this.srOf(head));
  }

  // always @(*) | always @(posedge clk or negedge rst) <stmt>
  parseAlways() {
    const head = this.eat('kw', 'always');
    this.eat('op', '@');
    const sens = this.parseSensitivity();
    const body = [this.parseStatement()];
    return mkAlways(sens, body, this.srOf(head));
  }
  parseInitial() {
    const head = this.eat('kw', 'initial');
    const body = [this.parseStatement()];
    return mkInitial(body, this.srOf(head));
  }
  parseSensitivity() {
    // IEEE 1364-2005 §9.7.4 allows two forms of the "implicit
    // sensitivity list": `@(*)` and the bare `@*` shorthand. We accept
    // both; the bare form skips the open-paren entirely.
    if (this.is('op', '*') && !this.is('op', '(')) {
      this.consume();
      return { star: true };
    }
    this.eat('op', '(');
    if (this.match('op', '*')) {
      this.eat('op', ')');
      return { star: true };
    }
    const triggers = [];
    do {
      let edge = null;
      if      (this.match('kw', 'posedge')) edge = 'posedge';
      else if (this.match('kw', 'negedge')) edge = 'negedge';
      const sigT = this.eat('id');
      triggers.push({ edge, signal: sigT.text });
    } while (this.match('kw', 'or') || this.match('op', ','));
    this.eat('op', ')');
    return { triggers };
  }

  parseStatement() {
    this._enter();
    try { return this._parseStatementInner(); } finally { this._leave(); }
  }
  _parseStatementInner() {
    const t = this.peek();
    if (t.kind === 'kw') {
      switch (t.text) {
        case 'begin':   return this.parseBlock();
        case 'if':      return this.parseIf();
        case 'case': case 'casez': case 'casex':
                        return this.parseCase();
        case 'for':     return this.parseFor();
        case 'while': case 'repeat': case 'forever':
                        return this.parseLoop();
      }
    }
    // System task / function call as a statement, e.g. $display("…", x);
    if (t.kind === 'sysid') return this.parseSystemCall(true);
    // Assignment statement.
    return this.parseAssignStatement();
  }
  // for (init; cond; step) <stmt>
  // The IR has no looping construct; for-loops in the input are
  // typically `initial begin for (i=0; i<N; i=i+1) mem[i] = 0; end`
  // patterns that would unroll at elaboration. Phase 8/9 doesn't
  // unroll — we surface the loop as a verbatim AST node so re-export
  // keeps it.
  parseFor() {
    const head = this.eat('kw', 'for');
    this.eat('op', '(');
    // init: ID = expr ;
    const init = this.parseAssignStatement();
    // cond: expr ;
    const cond = this.parseExpr();
    this.eat('op', ';');
    // step: ID = expr (no trailing ; because parseAssignStatement
    // already consumes one — but here we have no `;`, just `)`).
    const stepLhs = this.parseLvalue();
    if (!this.match('op', '=')) this.eat('op', '=');
    const stepRhs = this.parseExpr();
    this.eat('op', ')');
    const body = this.parseStatement();
    return { kind: 'For', srcRange: this.srOf(head), init, cond,
             step: { kind: AST_KIND.BlockingAssign, lhs: stepLhs, rhs: stepRhs }, body };
  }
  // while/repeat/forever — accept the syntax, surface as a placeholder
  // statement node so the parser doesn't get stuck. The elaborator
  // doesn't lower these (they're rarely synthesisable as-is).
  parseLoop() {
    const head = this.consume();
    if (head.text !== 'forever') {
      this.eat('op', '(');
      this.parseExpr();
      this.eat('op', ')');
    }
    const body = this.parseStatement();
    return { kind: 'Loop', srcRange: this.srOf(head), loopKind: head.text, body };
  }
  // Parse `$name(arg, …)`. When `asStmt` is true, also consume the
  // trailing semicolon and return a SystemCall AST node.
  parseSystemCall(asStmt) {
    const head = this.eat('sysid');
    const args = [];
    if (this.match('op', '(')) {
      if (!this.is('op', ')')) {
        args.push(this.parseExpr());
        while (this.match('op', ',')) args.push(this.parseExpr());
      }
      this.eat('op', ')');
    }
    if (asStmt) this.eat('op', ';');
    return mkSystemCall(head.text, args, this.srOf(head));
  }
  parseBlock() {
    const head = this.eat('kw', 'begin');
    const stmts = [];
    while (!this.is('kw', 'end') && !this.is('eof')) {
      stmts.push(this.parseStatement());
    }
    this.eat('kw', 'end');
    return mkBlock(stmts, this.srOf(head));
  }
  parseIf() {
    const head = this.eat('kw', 'if');
    this.eat('op', '(');
    const cond = this.parseExpr();
    this.eat('op', ')');
    const then_ = this.parseStatement();
    let else_ = null;
    if (this.match('kw', 'else')) else_ = this.parseStatement();
    return mkIf(cond, then_, else_, this.srOf(head));
  }
  parseCase() {
    const head = this.consume();   // case / casez / casex
    this.eat('op', '(');
    const sel = this.parseExpr();
    this.eat('op', ')');
    const arms = [];
    while (!this.is('kw', 'endcase') && !this.is('eof')) {
      let label = null;
      if (this.match('kw', 'default')) {
        // optional colon
        this.match('op', ':');
      } else {
        label = this.parseExpr();
        this.eat('op', ':');
      }
      const body = this.parseStatement();
      arms.push({ label, body });
    }
    this.eat('kw', 'endcase');
    return mkCase(sel, arms, this.srOf(head));
  }
  parseAssignStatement() {
    // LHS of an assignment is an lvalue, not a full expression. Parsing
    // it as parseExpr would let `<=` get eaten as the relational
    // operator instead of the non-blocking-assign separator.
    const lhs = this.parseLvalue();
    const opT = this.peek();
    if (opT.kind === 'op' && opT.text === '<=') {
      this.consume();
      const rhs = this.parseExpr();
      this.eat('op', ';');
      return mkNBA(lhs, rhs, this.srOf(opT));
    }
    if (opT.kind === 'op' && opT.text === '=') {
      this.consume();
      const rhs = this.parseExpr();
      this.eat('op', ';');
      return mkBA(lhs, rhs, this.srOf(opT));
    }
    throw new ParseError(`expected '=' or '<=' in statement`, opT);
  }

  // Lvalue: identifier with optional bit / part select, or a concat of
  // such. No binary operators allowed.
  parseLvalue() {
    const t = this.peek();
    if (t.kind === 'op' && t.text === '{') {
      this.consume();
      const parts = [this.parseLvalue()];
      while (this.match('op', ',')) parts.push(this.parseLvalue());
      this.eat('op', '}');
      return mkConcat(parts, this.srOf(t));
    }
    const nameT = this.eat('id');
    if (this.match('op', '[')) {
      const a = this.parseExpr();
      if (this.match('op', ':')) {
        const b = this.parseExpr();
        this.eat('op', ']');
        return mkSlice(nameT.text, a, b, this.srOf(nameT));
      }
      this.eat('op', ']');
      return mkIndex(nameT.text, a, this.srOf(nameT));
    }
    return mkRef(nameT.text, this.srOf(nameT));
  }

  // parameter [ [W-1:0] ] NAME = EXPR [, NAME2 = EXPR2 …] ;
  parseParameter() {
    const head = this.consume();         // 'parameter' | 'localparam'
    const paramKind = head.text;
    const width = this.parseOptionalWidth();
    const decls = [];
    do {
      const nameT = this.eat('id');
      this.eat('op', '=');
      const value = this.parseExpr();
      decls.push(mkParamDecl(paramKind, nameT.text, value, width, this.srOf(nameT)));
    } while (this.match('op', ','));
    this.eat('op', ';');
    return decls;
  }

  // Primitive gate instance:  and g(y, a, b);  buf b(y, a);
  parsePrimitiveInstance() {
    const tk = this.consume();           // gate keyword
    const type = tk.text;
    const nameT = this.eat('id');
    this.eat('op', '(');
    const ports = [];
    if (!this.is('op', ')')) {
      ports.push({ name: null, expr: this.parseExpr() });
      while (this.match('op', ',')) {
        ports.push({ name: null, expr: this.parseExpr() });
      }
    }
    this.eat('op', ')');
    this.eat('op', ';');
    return mkInstance(type, nameT.text, {}, ports, true, true, this.srOf(tk));
  }

  // Module instantiation:  TYPE [ #(.PARAM(EXPR), …) ] inst (.port(expr), …);
  parseModuleInstance() {
    const typeT = this.eat('id');
    const params = {};
    if (this.match('op', '#')) {
      this.eat('op', '(');
      if (!this.is('op', ')')) {
        do {
          this.eat('op', '.');
          const pn = this.eat('id').text;
          this.eat('op', '(');
          const pv = this.parseExpr();
          this.eat('op', ')');
          params[pn] = pv;
        } while (this.match('op', ','));
      }
      this.eat('op', ')');
    }
    const nameT = this.eat('id');
    this.eat('op', '(');
    const ports = [];
    if (!this.is('op', ')')) {
      // Named-port form `.port(net)` — required by our exporter for
      // module instances. Positional is supported as a fallback.
      const isNamed = this.is('op', '.');
      if (isNamed) {
        do {
          this.eat('op', '.');
          const pn = this.eat('id').text;
          this.eat('op', '(');
          const pv = this.is('op', ')') ? null : this.parseExpr();
          this.eat('op', ')');
          ports.push({ name: pn, expr: pv });
        } while (this.match('op', ','));
      } else {
        ports.push({ name: null, expr: this.parseExpr() });
        while (this.match('op', ',')) {
          ports.push({ name: null, expr: this.parseExpr() });
        }
      }
    }
    this.eat('op', ')');
    this.eat('op', ';');
    return mkInstance(typeT.text, nameT.text, params, ports, false, false, this.srOf(typeT));
  }

  // ── Expressions (Pratt-ish precedence climber) ─────────────
  parseExpr() {
    this._enter();
    try { return this.parseTernary(); } finally { this._leave(); }
  }

  parseTernary() {
    const cond = this.parseBinary(0);
    if (this.match('op', '?')) {
      const then_ = this.parseExpr();
      this.eat('op', ':');
      const else_ = this.parseExpr();
      return mkTernary(cond, then_, else_, cond.srcRange);
    }
    return cond;
  }
  parseBinary(minPrec) {
    let left = this.parseUnary();
    while (_isBinOp(this.peek())) {
      const op = this.peek().text;
      const prec = BIN_PREC[op];
      if (prec < minPrec) break;
      this.consume();
      const right = this.parseBinary(prec + 1);  // left-assoc
      left = mkBinaryOp(op, left, right, left.srcRange);
    }
    return left;
  }
  parseUnary() {
    const t = this.peek();
    if (t.kind === 'op' && (t.text === '!' || t.text === '~' || t.text === '-' || t.text === '+'
                          || t.text === '&' || t.text === '|' || t.text === '^'
                          || t.text === '~&' || t.text === '~|' || t.text === '~^' || t.text === '^~')) {
      this.consume();
      const inner = this.parseUnary();
      return mkUnaryOp(t.text, inner, this.srOf(t));
    }
    return this.parsePrimary();
  }
  parsePrimary() {
    const t = this.peek();
    if (t.kind === 'num') {
      this.consume();
      // Preserve the raw digit text so x/z literals (4'bz, 1'bx) can
      // round-trip without going through `value` (which is numeric).
      return mkLiteral(t.value, t.width || null, t.base || null, this.srOf(t), t.valueText);
    }
    if (t.kind === 'str') {
      this.consume();
      return { kind: AST_KIND.StringLit, srcRange: this.srOf(t), value: t.value };
    }
    if (t.kind === 'sysid') {
      // System function call inside an expression, e.g. $bits(x).
      return this.parseSystemCall(false);
    }
    if (t.kind === 'op' && t.text === '(') {
      this.consume();
      const inner = this.parseExpr();
      this.eat('op', ')');
      return mkParen(inner, this.srOf(t));
    }
    if (t.kind === 'op' && t.text === '{') {
      this.consume();
      // Replicate?  {N{x}}
      const first = this.parseExpr();
      if (this.match('op', '{')) {
        const inner = this.parseExpr();
        this.eat('op', '}');
        this.eat('op', '}');
        return mkReplicate(first, inner, this.srOf(t));
      }
      const parts = [first];
      while (this.match('op', ',')) parts.push(this.parseExpr());
      this.eat('op', '}');
      return mkConcat(parts, this.srOf(t));
    }
    if (t.kind === 'id') {
      const nameT = this.consume();
      // Bit / part select?
      if (this.match('op', '[')) {
        const a = this.parseExpr();
        if (this.match('op', ':')) {
          const b = this.parseExpr();
          this.eat('op', ']');
          return mkSlice(nameT.text, a, b, this.srOf(nameT));
        }
        this.eat('op', ']');
        return mkIndex(nameT.text, a, this.srOf(nameT));
      }
      return mkRef(nameT.text, this.srOf(nameT));
    }
    throw new ParseError(`unexpected token '${t.text}' in expression`, t);
  }
}

// Recognise tokens that would START a fresh port declaration. Used to
// stop consuming `, NAME` when the next thing is actually `, input ...`.
function KW_STARTS_PORT(t) {
  if (!t) return false;
  if (t.kind !== 'kw') return false;
  return t.text === 'input' || t.text === 'output' || t.text === 'inout';
}

function _constInt(expr) {
  if (!expr) return null;
  if (expr.kind === AST_KIND.Literal && typeof expr.value === 'number') return expr.value;
  if (expr.kind === AST_KIND.Paren) return _constInt(expr.inner);
  if (expr.kind === AST_KIND.UnaryOp && expr.op === '-') {
    const v = _constInt(expr.operand);
    return v === null ? null : -v;
  }
  if (expr.kind === AST_KIND.BinaryOp) {
    const l = _constInt(expr.left), r = _constInt(expr.right);
    if (l === null || r === null) return null;
    switch (expr.op) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/': return r === 0 ? null : Math.trunc(l / r);
    }
  }
  return null;
}

// Public entry — accepts source text, returns { ast, errors, tokens }.
// Throws on unrecoverable lex / parse errors with location info.
export function parseVerilog(text, opts = {}) {
  const tokens = tokenize(text);
  const p = new Parser(tokens, opts);
  const ast = p.parseSource();
  return { ast, errors: p._errors.slice(), tokens };
}

// Re-export error types so callers can `instanceof` them.
export { ParseError as VerilogParseError };
export { LexError  as VerilogLexError };
