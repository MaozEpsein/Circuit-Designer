/**
 * Parser — Recursive descent parser for C.
 * Converts tokens into an AST (Abstract Syntax Tree).
 */
import { TT } from './Lexer.js';

// AST Node types
export const NT = {
  PROGRAM:    'PROGRAM',
  VAR_DECL:   'VAR_DECL',     // int a = expr;
  ASSIGN:     'ASSIGN',        // a = expr;
  COMPOUND_ASSIGN: 'COMPOUND_ASSIGN', // a += expr;
  IF:         'IF',
  WHILE:      'WHILE',
  FOR:        'FOR',
  BLOCK:      'BLOCK',         // { ... }
  RETURN:     'RETURN',
  BREAK:      'BREAK',
  CONTINUE:   'CONTINUE',
  GOTO:       'GOTO',
  LABEL:      'LABEL',
  HALT:       'HALT',
  NOP:        'NOP',
  EXPR_STMT:  'EXPR_STMT',
  FUNC_DECL:  'FUNC_DECL',
  FUNC_CALL:  'FUNC_CALL',
  // Expressions
  BINARY:     'BINARY',
  UNARY:      'UNARY',
  NUMBER:     'NUMBER',
  IDENT:      'IDENT',
  ARRAY_ACCESS: 'ARRAY_ACCESS', // mem[expr]
  INC_DEC:    'INC_DEC',       // i++, i--
};

export class ASTNode {
  constructor(type, props = {}) {
    this.type = type;
    Object.assign(this, props);
  }
}

/**
 * Parse tokens into an AST.
 * @param {Token[]} tokens
 * @returns {ASTNode} Program node
 */
export function parse(tokens) {
  let pos = 0;

  function peek() { return tokens[pos]; }
  function prev() { return tokens[pos - 1]; }
  function advance() { return tokens[pos++]; }
  function check(type) { return peek().type === type; }
  function match(...types) {
    if (types.includes(peek().type)) { advance(); return true; }
    return false;
  }
  function expect(type, msg) {
    if (peek().type === type) return advance();
    throw error(msg || `Expected ${type}, got ${peek().type}`);
  }
  function error(msg) {
    const t = peek();
    return new Error(`${msg} at line ${t.line}:${t.col}`);
  }

  // ── Program ──────────────────────────────────────────────
  function parseProgram() {
    const body = [];
    while (!check(TT.EOF)) {
      body.push(parseTopLevel());
    }
    return new ASTNode(NT.PROGRAM, { body });
  }

  function parseTopLevel() {
    // Function declaration: int name(...) { }
    // or variable declaration: int name = ...;
    if (check(TT.INT) || check(TT.VOID)) {
      const typeToken = advance();
      const name = expect(TT.IDENTIFIER, 'Expected identifier').value;

      if (check(TT.LPAREN)) {
        // Function declaration
        return parseFuncDecl(typeToken.value, name);
      } else {
        // Variable declaration
        return parseVarDeclRest(name);
      }
    }
    return parseStatement();
  }

  // ── Statements ───────────────────────────────────────────
  function parseStatement() {
    if (check(TT.INT) || check(TT.VOID)) return parseVarDecl();
    if (check(TT.IF)) return parseIf();
    if (check(TT.WHILE)) return parseWhile();
    if (check(TT.FOR)) return parseFor();
    if (check(TT.LBRACE)) return parseBlock();
    if (check(TT.RETURN)) return parseReturn();
    if (check(TT.BREAK)) { advance(); expect(TT.SEMI); return new ASTNode(NT.BREAK); }
    if (check(TT.CONTINUE)) { advance(); expect(TT.SEMI); return new ASTNode(NT.CONTINUE); }
    if (check(TT.GOTO)) return parseGoto();
    if (check(TT.HALT)) { advance(); expect(TT.SEMI); return new ASTNode(NT.HALT); }
    if (check(TT.NOP)) { advance(); expect(TT.SEMI); return new ASTNode(NT.NOP); }

    // Label: identifier followed by colon
    if (check(TT.IDENTIFIER) && pos + 1 < tokens.length && tokens[pos + 1].type === TT.COLON) {
      const name = advance().value;
      advance(); // consume :
      return new ASTNode(NT.LABEL, { name });
    }

    // Expression statement
    return parseExprStatement();
  }

  function parseVarDecl() {
    expect(TT.INT, 'Expected type');
    const name = expect(TT.IDENTIFIER, 'Expected variable name').value;
    return parseVarDeclRest(name);
  }

  function parseVarDeclRest(name) {
    let init = null;
    if (match(TT.ASSIGN)) {
      init = parseExpression();
    }
    expect(TT.SEMI, 'Expected ;');
    return new ASTNode(NT.VAR_DECL, { name, init });
  }

  function parseIf() {
    expect(TT.IF);
    expect(TT.LPAREN, 'Expected (');
    const condition = parseExpression();
    expect(TT.RPAREN, 'Expected )');
    const then = parseStatement();
    let else_ = null;
    if (match(TT.ELSE)) {
      else_ = parseStatement();
    }
    return new ASTNode(NT.IF, { condition, then, else: else_ });
  }

  function parseWhile() {
    expect(TT.WHILE);
    expect(TT.LPAREN, 'Expected (');
    const condition = parseExpression();
    expect(TT.RPAREN, 'Expected )');
    const body = parseStatement();
    return new ASTNode(NT.WHILE, { condition, body });
  }

  function parseFor() {
    expect(TT.FOR);
    expect(TT.LPAREN, 'Expected (');
    // Init
    let init = null;
    if (!check(TT.SEMI)) {
      if (check(TT.INT)) {
        init = parseVarDecl(); // includes ;
      } else {
        init = parseExprStatement(); // includes ;
      }
    } else {
      advance(); // skip ;
    }
    // Condition
    let condition = null;
    if (!check(TT.SEMI)) {
      condition = parseExpression();
    }
    expect(TT.SEMI, 'Expected ;');
    // Update
    let update = null;
    if (!check(TT.RPAREN)) {
      update = parseExpression();
    }
    expect(TT.RPAREN, 'Expected )');
    const body = parseStatement();
    return new ASTNode(NT.FOR, { init, condition, update, body });
  }

  function parseBlock() {
    expect(TT.LBRACE, 'Expected {');
    const body = [];
    while (!check(TT.RBRACE) && !check(TT.EOF)) {
      body.push(parseStatement());
    }
    expect(TT.RBRACE, 'Expected }');
    return new ASTNode(NT.BLOCK, { body });
  }

  function parseReturn() {
    expect(TT.RETURN);
    let value = null;
    if (!check(TT.SEMI)) {
      value = parseExpression();
    }
    expect(TT.SEMI, 'Expected ;');
    return new ASTNode(NT.RETURN, { value });
  }

  function parseGoto() {
    expect(TT.GOTO);
    const label = expect(TT.IDENTIFIER, 'Expected label').value;
    expect(TT.SEMI, 'Expected ;');
    return new ASTNode(NT.GOTO, { label });
  }

  function parseExprStatement() {
    const expr = parseExpression();
    expect(TT.SEMI, 'Expected ;');
    return new ASTNode(NT.EXPR_STMT, { expr });
  }

  // ── Function Declaration ─────────────────────────────────
  function parseFuncDecl(returnType, name) {
    expect(TT.LPAREN);
    const params = [];
    while (!check(TT.RPAREN)) {
      if (params.length > 0) expect(TT.COMMA, 'Expected ,');
      expect(TT.INT, 'Expected parameter type');
      params.push(expect(TT.IDENTIFIER, 'Expected parameter name').value);
    }
    expect(TT.RPAREN);
    const body = parseBlock();
    return new ASTNode(NT.FUNC_DECL, { returnType, name, params, body });
  }

  // ── Expressions (precedence climbing) ────────────────────
  function parseExpression() {
    return parseAssignment();
  }

  function parseAssignment() {
    let left = parseLogicalOr();

    // Assignment operators
    const assignOps = {
      [TT.ASSIGN]: '=', [TT.PLUS_EQ]: '+=', [TT.MINUS_EQ]: '-=',
      [TT.STAR_EQ]: '*=', [TT.SLASH_EQ]: '/=',
      [TT.AMP_EQ]: '&=', [TT.PIPE_EQ]: '|=', [TT.CARET_EQ]: '^=',
      [TT.LSHIFT_EQ]: '<<=', [TT.RSHIFT_EQ]: '>>=',
    };

    const op = assignOps[peek().type];
    if (op) {
      advance();
      const right = parseAssignment(); // right-associative
      if (op === '=') {
        return new ASTNode(NT.ASSIGN, { target: left, value: right });
      } else {
        return new ASTNode(NT.COMPOUND_ASSIGN, { target: left, op, value: right });
      }
    }

    return left;
  }

  function parseLogicalOr() {
    let left = parseLogicalAnd();
    while (match(TT.OR)) {
      left = new ASTNode(NT.BINARY, { op: '||', left, right: parseLogicalAnd() });
    }
    return left;
  }

  function parseLogicalAnd() {
    let left = parseBitwiseOr();
    while (match(TT.AND)) {
      left = new ASTNode(NT.BINARY, { op: '&&', left, right: parseBitwiseOr() });
    }
    return left;
  }

  function parseBitwiseOr() {
    let left = parseBitwiseXor();
    while (match(TT.PIPE)) {
      left = new ASTNode(NT.BINARY, { op: '|', left, right: parseBitwiseXor() });
    }
    return left;
  }

  function parseBitwiseXor() {
    let left = parseBitwiseAnd();
    while (match(TT.CARET)) {
      left = new ASTNode(NT.BINARY, { op: '^', left, right: parseBitwiseAnd() });
    }
    return left;
  }

  function parseBitwiseAnd() {
    let left = parseEquality();
    while (match(TT.AMP)) {
      left = new ASTNode(NT.BINARY, { op: '&', left, right: parseEquality() });
    }
    return left;
  }

  function parseEquality() {
    let left = parseComparison();
    while (true) {
      if (match(TT.EQ)) left = new ASTNode(NT.BINARY, { op: '==', left, right: parseComparison() });
      else if (match(TT.NEQ)) left = new ASTNode(NT.BINARY, { op: '!=', left, right: parseComparison() });
      else break;
    }
    return left;
  }

  function parseComparison() {
    let left = parseShift();
    while (true) {
      if (match(TT.LT)) left = new ASTNode(NT.BINARY, { op: '<', left, right: parseShift() });
      else if (match(TT.GT)) left = new ASTNode(NT.BINARY, { op: '>', left, right: parseShift() });
      else if (match(TT.LTE)) left = new ASTNode(NT.BINARY, { op: '<=', left, right: parseShift() });
      else if (match(TT.GTE)) left = new ASTNode(NT.BINARY, { op: '>=', left, right: parseShift() });
      else break;
    }
    return left;
  }

  function parseShift() {
    let left = parseAddSub();
    while (true) {
      if (match(TT.LSHIFT)) left = new ASTNode(NT.BINARY, { op: '<<', left, right: parseAddSub() });
      else if (match(TT.RSHIFT)) left = new ASTNode(NT.BINARY, { op: '>>', left, right: parseAddSub() });
      else break;
    }
    return left;
  }

  function parseAddSub() {
    let left = parseMulDiv();
    while (true) {
      if (match(TT.PLUS)) left = new ASTNode(NT.BINARY, { op: '+', left, right: parseMulDiv() });
      else if (match(TT.MINUS)) left = new ASTNode(NT.BINARY, { op: '-', left, right: parseMulDiv() });
      else break;
    }
    return left;
  }

  function parseMulDiv() {
    let left = parseUnary();
    while (true) {
      if (match(TT.STAR)) left = new ASTNode(NT.BINARY, { op: '*', left, right: parseUnary() });
      else if (match(TT.SLASH)) left = new ASTNode(NT.BINARY, { op: '/', left, right: parseUnary() });
      else if (match(TT.PERCENT)) left = new ASTNode(NT.BINARY, { op: '%', left, right: parseUnary() });
      else break;
    }
    return left;
  }

  function parseUnary() {
    if (match(TT.MINUS)) return new ASTNode(NT.UNARY, { op: '-', operand: parseUnary() });
    if (match(TT.TILDE)) return new ASTNode(NT.UNARY, { op: '~', operand: parseUnary() });
    if (match(TT.BANG))  return new ASTNode(NT.UNARY, { op: '!', operand: parseUnary() });
    if (match(TT.INC)) return new ASTNode(NT.INC_DEC, { op: '++', operand: parsePrimary(), prefix: true });
    if (match(TT.DEC)) return new ASTNode(NT.INC_DEC, { op: '--', operand: parsePrimary(), prefix: true });
    return parsePostfix();
  }

  function parsePostfix() {
    let expr = parsePrimary();
    while (true) {
      if (match(TT.INC)) { expr = new ASTNode(NT.INC_DEC, { op: '++', operand: expr, prefix: false }); }
      else if (match(TT.DEC)) { expr = new ASTNode(NT.INC_DEC, { op: '--', operand: expr, prefix: false }); }
      else if (match(TT.LBRACKET)) {
        const index = parseExpression();
        expect(TT.RBRACKET, 'Expected ]');
        expr = new ASTNode(NT.ARRAY_ACCESS, { array: expr, index });
      }
      else if (match(TT.LPAREN)) {
        // Function call
        const args = [];
        while (!check(TT.RPAREN)) {
          if (args.length > 0) expect(TT.COMMA, 'Expected ,');
          args.push(parseExpression());
        }
        expect(TT.RPAREN, 'Expected )');
        expr = new ASTNode(NT.FUNC_CALL, { name: expr, args });
      }
      else break;
    }
    return expr;
  }

  function parsePrimary() {
    if (match(TT.NUMBER)) return new ASTNode(NT.NUMBER, { value: prev().value });
    if (match(TT.IDENTIFIER)) return new ASTNode(NT.IDENT, { name: prev().value });
    if (match(TT.LPAREN)) {
      const expr = parseExpression();
      expect(TT.RPAREN, 'Expected )');
      return expr;
    }
    throw error(`Unexpected token: ${peek().type}(${peek().value})`);
  }

  return parseProgram();
}
