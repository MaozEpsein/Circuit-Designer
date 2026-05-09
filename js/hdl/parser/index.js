// Public entry for the Verilog parser (Phase 8).
//
// Usage:
//   import { parseVerilog } from './js/hdl/parser/index.js';
//   const { ast, errors, tokens } = parseVerilog(sourceText);
//
// `ast` is an AST_KIND.Source node (see ast.js). Phase 9 lowers AST →
// IR; Phase 10 lowers IR → circuitJSON.

export { parseVerilog, VerilogParseError, VerilogLexError } from './parser.js';
export { tokenize, KEYWORDS, LexError } from './lexer.js';
export { elaborate, ElaborateError } from './elaborate.js';
export { astToVerilog } from './astToVerilog.js';
export * from './ast.js';
