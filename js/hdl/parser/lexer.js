// Verilog lexer / tokenizer.
//
// Single-pass character scanner that emits a flat list of tokens. Built
// for the Verilog subset our exporter produces (Phase 1–7 output) plus
// enough wiggle room for a developer-typed module.
//
// Token shape:
//   { kind, text, value?, width?, base?, line, col, end }
//
// kinds:
//   'kw'      — reserved word (module, input, output, reg, wire, …)
//   'id'      — identifier (incl. escaped \name)
//   'num'     — integer literal (with optional size + base)
//   'str'     — string literal (reserved; not produced by exporter today)
//   'op'      — operator or punctuation (one of the symbol tokens below)
//   'eof'     — end-of-file sentinel
//
// Line / col are 1-indexed; `end` is { line, col } pointing one past the
// last character of the token.

export const KEYWORDS = new Set([
  'module', 'endmodule',
  'input', 'output', 'inout',
  'wire', 'reg', 'integer',
  'assign',
  'always', 'initial',
  'posedge', 'negedge',
  'if', 'else',
  'case', 'casez', 'casex', 'endcase', 'default',
  'begin', 'end',
  'or',
  'and', 'nand', 'nor', 'not', 'xor', 'xnor', 'buf', 'bufif0', 'bufif1', 'notif0', 'notif1',
  'parameter', 'localparam',
  'signed', 'unsigned',
]);

// Multi-character operators, ordered longest-first so the matcher
// doesn't tokenize ">=" as ">" then "=".
const MULTI_OPS = [
  '<<<', '>>>', '<=', '>=', '==', '!=', '===', '!==', '&&', '||',
  '<<', '>>', '~&', '~|', '~^', '^~', '**',
  '<=',                  // appears twice — duplicate is harmless
];
// Single-char operators / punctuation we recognise.
const SINGLE_OPS = new Set([
  '+', '-', '*', '/', '%', '&', '|', '^', '~', '!',
  '<', '>', '=', '?', ':',
  '(', ')', '[', ']', '{', '}', ',', ';',
  '@', '#', '.', "'",
]);

function isIdStart(ch) { return /[A-Za-z_]/.test(ch); }
function isIdPart(ch)  { return /[A-Za-z0-9_$]/.test(ch); }
function isDigit(ch)   { return ch >= '0' && ch <= '9'; }
function isHexDigit(ch) { return /[0-9a-fA-F_]/.test(ch); }
function isBinDigit(ch) { return /[01xXzZ_]/.test(ch); }
function isOctDigit(ch) { return /[0-7xXzZ_]/.test(ch); }

export class LexError extends Error {
  constructor(msg, line, col) {
    super(`Lex error at ${line}:${col}: ${msg}`);
    this.line = line;
    this.col  = col;
  }
}

export function tokenize(source) {
  const tokens = [];
  let i = 0;
  let line = 1, col = 1;
  const N = source.length;

  function peek(o = 0) { return i + o < N ? source[i + o] : ''; }
  function advance(n = 1) {
    while (n-- > 0) {
      if (source[i] === '\n') { line++; col = 1; } else { col++; }
      i++;
    }
  }
  function startTok() { return { line, col }; }
  function pushTok(kind, text, props, start) {
    tokens.push({ kind, text, line: start.line, col: start.col,
      end: { line, col }, ...props });
  }

  while (i < N) {
    const ch = source[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') { advance(); continue; }

    // Line comment // …
    if (ch === '/' && peek(1) === '/') {
      while (i < N && source[i] !== '\n') advance();
      continue;
    }

    // Block comment /* … */
    if (ch === '/' && peek(1) === '*') {
      const start = startTok();
      advance(2);
      while (i < N && !(source[i] === '*' && peek(1) === '/')) advance();
      if (i >= N) throw new LexError('unterminated block comment', start.line, start.col);
      advance(2);
      continue;
    }

    // Verilog attribute block (* … *) — IEEE 1364-2005 §7.4.4. We
    // capture the body verbatim as a single 'attr' token. The parser
    // attaches the most recent attribute to the next item it sees.
    if (ch === '(' && peek(1) === '*' && peek(2) !== ')') {
      const start = startTok();
      advance(2);             // consume (*
      let body = '';
      while (i < N && !(source[i] === '*' && peek(1) === ')')) {
        body += source[i]; advance();
      }
      if (i >= N) throw new LexError('unterminated (* attribute *)', start.line, start.col);
      advance(2);             // consume *)
      pushTok('attr', body.trim(), { value: body.trim() }, start);
      continue;
    }

    // System task / function name — `$identifier` (e.g. $display).
    if (ch === '$' && isIdStart(peek(1) || '')) {
      const start = startTok();
      let text = '$';
      advance();
      while (i < N && isIdPart(source[i])) { text += source[i]; advance(); }
      pushTok('sysid', text, {}, start);
      continue;
    }

    // Identifier / keyword
    if (isIdStart(ch)) {
      const start = startTok();
      let text = '';
      while (i < N && isIdPart(source[i])) { text += source[i]; advance(); }
      if (KEYWORDS.has(text)) pushTok('kw', text, {}, start);
      else                    pushTok('id', text, {}, start);
      continue;
    }

    // Escaped identifier  \foo
    if (ch === '\\') {
      const start = startTok();
      advance();
      let text = '';
      while (i < N && !/[\s]/.test(source[i])) { text += source[i]; advance(); }
      pushTok('id', text, { escaped: true }, start);
      continue;
    }

    // Number — sized or unsized.
    //   Unsized: 123, 'h1A, 'b1010
    //   Sized:   4'h5, 8'b1010_1010, 16'd255
    // We greedily take leading digits then look for a single quote.
    if (isDigit(ch) || (ch === "'" && /[hHbBoOdD]/.test(peek(1) || ''))) {
      const start = startTok();
      let raw = '';
      while (i < N && (isDigit(source[i]) || source[i] === '_')) {
        raw += source[i]; advance();
      }
      let width = null;
      let base  = null;
      let valStr = raw;
      if (source[i] === "'") {
        if (raw !== '') width = parseInt(raw.replace(/_/g, ''), 10);
        advance();             // consume '
        const baseCh = source[i];
        if (!baseCh || !/[hHbBoOdD]/.test(baseCh)) {
          throw new LexError(`bad number base after '`, start.line, start.col);
        }
        base = baseCh.toLowerCase();
        advance();
        // Allow whitespace after base.
        while (i < N && /[ \t]/.test(source[i])) advance();
        valStr = '';
        const isOk = base === 'h' ? isHexDigit
                   : base === 'b' ? isBinDigit
                   : base === 'o' ? isOctDigit
                   :                isDigit;
        while (i < N && isOk(source[i])) { valStr += source[i]; advance(); }
        if (valStr === '') throw new LexError('empty number value', start.line, start.col);
      }
      const cleaned = valStr.replace(/_/g, '');
      // Tolerate x/z digits by leaving the raw text alongside a numeric value.
      const numeric = /[xz]/i.test(cleaned)
        ? null
        : Number.parseInt(cleaned, base === 'h' ? 16 : base === 'b' ? 2 : base === 'o' ? 8 : 10);
      pushTok('num', (width !== null ? width : '') + (base ? `'${base}` : '') + cleaned,
        { value: numeric, valueText: cleaned, width, base }, start);
      continue;
    }

    // String literal "…"   (Phase-8: kept for $display/$monitor)
    if (ch === '"') {
      const start = startTok();
      advance();
      let text = '';
      while (i < N && source[i] !== '"') {
        if (source[i] === '\\' && i + 1 < N) { text += source[i + 1]; advance(2); continue; }
        text += source[i]; advance();
      }
      if (i >= N) throw new LexError('unterminated string', start.line, start.col);
      advance();             // consume closing "
      pushTok('str', text, { value: text }, start);
      continue;
    }

    // Multi-char operators (longest match).
    let matched = null;
    for (const op of MULTI_OPS) {
      if (source.startsWith(op, i)) { matched = op; break; }
    }
    if (matched) {
      const start = startTok();
      advance(matched.length);
      pushTok('op', matched, {}, start);
      continue;
    }

    if (SINGLE_OPS.has(ch)) {
      const start = startTok();
      advance();
      pushTok('op', ch, {}, start);
      continue;
    }

    throw new LexError(`unexpected character '${ch}'`, line, col);
  }

  tokens.push({ kind: 'eof', text: '', line, col, end: { line, col } });
  return tokens;
}
