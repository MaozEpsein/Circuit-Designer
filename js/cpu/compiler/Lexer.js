/**
 * Lexer — Tokenizer for C language.
 * Converts source code string into an array of tokens.
 */

// Token types
export const TT = {
  // Literals
  NUMBER:     'NUMBER',
  IDENTIFIER: 'IDENTIFIER',
  STRING:     'STRING',

  // Keywords
  INT:        'INT',
  VOID:       'VOID',
  IF:         'IF',
  ELSE:       'ELSE',
  WHILE:      'WHILE',
  FOR:        'FOR',
  RETURN:     'RETURN',
  BREAK:      'BREAK',
  CONTINUE:   'CONTINUE',
  GOTO:       'GOTO',
  HALT:       'HALT',
  NOP:        'NOP',

  // Operators
  PLUS:       'PLUS',       // +
  MINUS:      'MINUS',      // -
  STAR:       'STAR',       // *
  SLASH:      'SLASH',      // /
  PERCENT:    'PERCENT',    // %
  AMP:        'AMP',        // &
  PIPE:       'PIPE',       // |
  CARET:      'CARET',      // ^
  TILDE:      'TILDE',      // ~
  LSHIFT:     'LSHIFT',     // <<
  RSHIFT:     'RSHIFT',     // >>
  BANG:       'BANG',       // !

  // Comparison
  EQ:         'EQ',         // ==
  NEQ:        'NEQ',        // !=
  LT:         'LT',         // <
  GT:         'GT',         // >
  LTE:        'LTE',        // <=
  GTE:        'GTE',        // >=

  // Logical
  AND:        'AND',        // &&
  OR:         'OR',         // ||

  // Assignment
  ASSIGN:     'ASSIGN',     // =
  PLUS_EQ:    'PLUS_EQ',    // +=
  MINUS_EQ:   'MINUS_EQ',   // -=
  STAR_EQ:    'STAR_EQ',    // *=
  SLASH_EQ:   'SLASH_EQ',   // /=
  AMP_EQ:     'AMP_EQ',     // &=
  PIPE_EQ:    'PIPE_EQ',    // |=
  CARET_EQ:   'CARET_EQ',   // ^=
  LSHIFT_EQ:  'LSHIFT_EQ',  // <<=
  RSHIFT_EQ:  'RSHIFT_EQ',  // >>=

  // Increment/Decrement
  INC:        'INC',        // ++
  DEC:        'DEC',        // --

  // Delimiters
  LPAREN:     'LPAREN',     // (
  RPAREN:     'RPAREN',     // )
  LBRACE:     'LBRACE',     // {
  RBRACE:     'RBRACE',     // }
  LBRACKET:   'LBRACKET',   // [
  RBRACKET:   'RBRACKET',   // ]
  SEMI:       'SEMI',       // ;
  COMMA:      'COMMA',      // ,
  COLON:      'COLON',      // :

  // Special
  EOF:        'EOF',
};

const KEYWORDS = {
  'int': TT.INT, 'void': TT.VOID,
  'if': TT.IF, 'else': TT.ELSE,
  'while': TT.WHILE, 'for': TT.FOR,
  'return': TT.RETURN, 'break': TT.BREAK, 'continue': TT.CONTINUE,
  'goto': TT.GOTO, 'halt': TT.HALT, 'nop': TT.NOP,
};

export class Token {
  constructor(type, value, line, col) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.col = col;
  }
  toString() {
    return `${this.type}(${this.value}) @${this.line}:${this.col}`;
  }
}

/**
 * Tokenize C source code.
 * @param {string} source
 * @returns {Token[]}
 */
export function tokenize(source) {
  const tokens = [];
  let pos = 0;
  let line = 1;
  let col = 1;

  function peek(offset = 0) { return source[pos + offset] || '\0'; }
  function advance() {
    const ch = source[pos++];
    if (ch === '\n') { line++; col = 1; } else { col++; }
    return ch;
  }
  function match(ch) {
    if (peek() === ch) { advance(); return true; }
    return false;
  }
  function makeToken(type, value) {
    return new Token(type, value, line, col);
  }

  while (pos < source.length) {
    const ch = peek();

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      advance();
      continue;
    }

    // Single-line comment: //
    if (ch === '/' && peek(1) === '/') {
      while (pos < source.length && peek() !== '\n') advance();
      continue;
    }

    // Multi-line comment: /* ... */
    if (ch === '/' && peek(1) === '*') {
      advance(); advance(); // skip /*
      while (pos < source.length) {
        if (peek() === '*' && peek(1) === '/') { advance(); advance(); break; }
        advance();
      }
      continue;
    }

    const startLine = line, startCol = col;

    // Number: decimal or hex
    if (ch >= '0' && ch <= '9') {
      let num = '';
      if (ch === '0' && (peek(1) === 'x' || peek(1) === 'X')) {
        num += advance(); num += advance(); // 0x
        while (pos < source.length && /[0-9a-fA-F]/.test(peek())) num += advance();
      } else {
        while (pos < source.length && peek() >= '0' && peek() <= '9') num += advance();
      }
      tokens.push(new Token(TT.NUMBER, parseInt(num), startLine, startCol));
      continue;
    }

    // Identifier or keyword
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let id = '';
      while (pos < source.length && (/[a-zA-Z0-9_]/.test(peek()))) id += advance();
      const kwType = KEYWORDS[id];
      tokens.push(new Token(kwType || TT.IDENTIFIER, id, startLine, startCol));
      continue;
    }

    // Operators and delimiters
    advance(); // consume ch
    switch (ch) {
      case '(': tokens.push(new Token(TT.LPAREN, '(', startLine, startCol)); break;
      case ')': tokens.push(new Token(TT.RPAREN, ')', startLine, startCol)); break;
      case '{': tokens.push(new Token(TT.LBRACE, '{', startLine, startCol)); break;
      case '}': tokens.push(new Token(TT.RBRACE, '}', startLine, startCol)); break;
      case '[': tokens.push(new Token(TT.LBRACKET, '[', startLine, startCol)); break;
      case ']': tokens.push(new Token(TT.RBRACKET, ']', startLine, startCol)); break;
      case ';': tokens.push(new Token(TT.SEMI, ';', startLine, startCol)); break;
      case ',': tokens.push(new Token(TT.COMMA, ',', startLine, startCol)); break;
      case ':': tokens.push(new Token(TT.COLON, ':', startLine, startCol)); break;
      case '~': tokens.push(new Token(TT.TILDE, '~', startLine, startCol)); break;
      case '^':
        if (match('=')) tokens.push(new Token(TT.CARET_EQ, '^=', startLine, startCol));
        else tokens.push(new Token(TT.CARET, '^', startLine, startCol));
        break;
      case '+':
        if (match('+')) tokens.push(new Token(TT.INC, '++', startLine, startCol));
        else if (match('=')) tokens.push(new Token(TT.PLUS_EQ, '+=', startLine, startCol));
        else tokens.push(new Token(TT.PLUS, '+', startLine, startCol));
        break;
      case '-':
        if (match('-')) tokens.push(new Token(TT.DEC, '--', startLine, startCol));
        else if (match('=')) tokens.push(new Token(TT.MINUS_EQ, '-=', startLine, startCol));
        else tokens.push(new Token(TT.MINUS, '-', startLine, startCol));
        break;
      case '*':
        if (match('=')) tokens.push(new Token(TT.STAR_EQ, '*=', startLine, startCol));
        else tokens.push(new Token(TT.STAR, '*', startLine, startCol));
        break;
      case '/':
        if (match('=')) tokens.push(new Token(TT.SLASH_EQ, '/=', startLine, startCol));
        else tokens.push(new Token(TT.SLASH, '/', startLine, startCol));
        break;
      case '%': tokens.push(new Token(TT.PERCENT, '%', startLine, startCol)); break;
      case '=':
        if (match('=')) tokens.push(new Token(TT.EQ, '==', startLine, startCol));
        else tokens.push(new Token(TT.ASSIGN, '=', startLine, startCol));
        break;
      case '!':
        if (match('=')) tokens.push(new Token(TT.NEQ, '!=', startLine, startCol));
        else tokens.push(new Token(TT.BANG, '!', startLine, startCol));
        break;
      case '<':
        if (match('<')) {
          if (match('=')) tokens.push(new Token(TT.LSHIFT_EQ, '<<=', startLine, startCol));
          else tokens.push(new Token(TT.LSHIFT, '<<', startLine, startCol));
        } else if (match('=')) tokens.push(new Token(TT.LTE, '<=', startLine, startCol));
        else tokens.push(new Token(TT.LT, '<', startLine, startCol));
        break;
      case '>':
        if (match('>')) {
          if (match('=')) tokens.push(new Token(TT.RSHIFT_EQ, '>>=', startLine, startCol));
          else tokens.push(new Token(TT.RSHIFT, '>>', startLine, startCol));
        } else if (match('=')) tokens.push(new Token(TT.GTE, '>=', startLine, startCol));
        else tokens.push(new Token(TT.GT, '>', startLine, startCol));
        break;
      case '&':
        if (match('&')) tokens.push(new Token(TT.AND, '&&', startLine, startCol));
        else if (match('=')) tokens.push(new Token(TT.AMP_EQ, '&=', startLine, startCol));
        else tokens.push(new Token(TT.AMP, '&', startLine, startCol));
        break;
      case '|':
        if (match('|')) tokens.push(new Token(TT.OR, '||', startLine, startCol));
        else if (match('=')) tokens.push(new Token(TT.PIPE_EQ, '|=', startLine, startCol));
        else tokens.push(new Token(TT.PIPE, '|', startLine, startCol));
        break;
      default:
        throw new Error(`Unexpected character '${ch}' at line ${startLine}:${startCol}`);
    }
  }

  tokens.push(new Token(TT.EOF, null, line, col));
  return tokens;
}
