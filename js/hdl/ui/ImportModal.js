// Import Modal — pure helpers behind the Verilog import UI.
//
// This module owns the *logic* of the modal (counting imported
// constructs, hashing Verilog Blocks for canonicalisation, picking a
// top module from a multi-module file). The DOM wiring (drag-and-drop,
// file picker, modal layout) lives in app.js and consumes the helpers
// below — same split as ExportModal.js.
//
// Each helper is pure: same input → same output, no globals, no DOM.

import { tokenize }   from '../parser/lexer.js';
import { parseVerilog } from '../parser/parser.js';

// ── Module list extraction ──────────────────────────────────
// Returns the list of top-level `module NAME` declarations in the
// source — used to pre-fill the module-picker dropdown when a file
// contains more than one module. Lighter than full parse: walks
// tokens and looks for `module` followed by `id`.

export function listModuleNames(text) {
  if (!text) return [];
  const toks = tokenize(text);
  const names = [];
  for (let i = 0; i < toks.length - 1; i++) {
    if (toks[i].kind === 'kw' && toks[i].text === 'module' && toks[i + 1].kind === 'id') {
      names.push(toks[i + 1].text);
    }
  }
  return names;
}

// Pick a default top module. Heuristic: the LAST module in the file
// (matches how elaborate() chooses), unless one is explicitly named
// `top` (case-insensitive) — that wins.
export function pickTopModule(names) {
  if (!Array.isArray(names) || names.length === 0) return null;
  const exact = names.find(n => n.toLowerCase() === 'top');
  return exact || names[names.length - 1];
}

// ── Import report ──────────────────────────────────────────
// Summarises the result of an import for a banner like:
//   "Imported 3 modules, 42 gates, 16 flip-flops, 1 RAM (2 KiB).
//    Unmapped constructs preserved as Verilog Blocks: 0."

export function buildImportReport(circuit, opts = {}) {
  const nodes = circuit?.nodes || [];
  const counts = {
    modules: 1 + (opts.submoduleCount | 0),
    gates: 0, flipflops: 0, registers: 0,
    muxes: 0, rams: 0, roms: 0,
    submodules: 0,
    blocks: 0,
    ramBytes: 0,
  };
  for (const n of nodes) {
    switch (n.type) {
      case 'GATE_SLOT': counts.gates++; break;
      case 'FLIPFLOP_D': case 'FLIPFLOP_T': case 'FLIPFLOP_SR': case 'FLIPFLOP_JK':
      case 'FF_SLOT': counts.flipflops++; break;
      case 'REGISTER': counts.registers++; break;
      case 'MUX': counts.muxes++; break;
      case 'RAM':
        counts.rams++;
        counts.ramBytes += Math.ceil((n.dataBits || 0) * (1 << (n.addrBits || 0)) / 8);
        break;
      case 'ROM': counts.roms++; break;
      case 'SUB_CIRCUIT': counts.submodules++; break;
      case 'VERILOG_BLOCK': counts.blocks++; break;
    }
  }
  const parts = [];
  parts.push(`${counts.modules} module${counts.modules === 1 ? '' : 's'}`);
  if (counts.gates)     parts.push(`${counts.gates} gate${counts.gates === 1 ? '' : 's'}`);
  if (counts.flipflops) parts.push(`${counts.flipflops} flip-flop${counts.flipflops === 1 ? '' : 's'}`);
  if (counts.registers) parts.push(`${counts.registers} register${counts.registers === 1 ? '' : 's'}`);
  if (counts.muxes)     parts.push(`${counts.muxes} mux${counts.muxes === 1 ? '' : 'es'}`);
  if (counts.rams)      parts.push(`${counts.rams} RAM${counts.rams === 1 ? '' : 's'}${counts.ramBytes ? ` (${_humanBytes(counts.ramBytes)})` : ''}`);
  if (counts.roms)      parts.push(`${counts.roms} ROM${counts.roms === 1 ? '' : 's'}`);
  if (counts.submodules)parts.push(`${counts.submodules} sub-circuit${counts.submodules === 1 ? '' : 's'}`);
  let line = `Imported ${parts.join(', ')}. `;
  line += `Unmapped constructs preserved as Verilog Blocks: ${counts.blocks}.`;
  return { line, counts };
}

function _humanBytes(n) {
  if (n < 1024)         return `${n} B`;
  if (n < 1024 * 1024)  return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KiB`;
  return `${(n / 1024 / 1024).toFixed(1)} MiB`;
}

// ── Parse-error formatting ─────────────────────────────────
// Produces a single-line message + the offending source line with a
// caret pointing at the column. Suitable for the modal's "first
// parse error" surface.

export function formatParseError(err, source) {
  const line = err?.token?.line ?? err?.srcRange?.line ?? null;
  const col  = err?.token?.col  ?? err?.srcRange?.col  ?? null;
  const where = (line && col) ? `${line}:${col}` : '?';
  if (!source || !line) {
    return { headline: `Parse error at ${where}: ${err?.message || ''}`, snippet: null };
  }
  const lines = source.split('\n');
  const target = lines[line - 1] || '';
  const caret = ' '.repeat(Math.max(0, col - 1)) + '^';
  return {
    headline: `${err.message || 'Parse error'} (line ${line}, col ${col})`,
    snippet:  `${target}\n${caret}`,
    line, col,
  };
}

// ── Verilog Block canonicalisation hash ─────────────────────
// Two users importing the same Verilog fragment must produce the same
// IR. Whitespace / comments / token positions must NOT contribute to
// the hash — only the resolved AST shape does. We re-parse the
// fragment, strip srcRange + attributes from the AST, and stringify
// deterministically.

export function hashVerilogBlock(text) {
  if (!text) return '0';
  let ast;
  try { ast = parseVerilog(text).ast; }
  catch { return _fnv1a(text); }
  return _fnv1a(_stableStringify(_canonAst(ast)));
}

// Walk an AST stripping srcRange + attributes recursively. Sort object
// keys so JSON.stringify output is deterministic.
function _canonAst(node) {
  if (Array.isArray(node)) return node.map(_canonAst);
  if (node === null || typeof node !== 'object') return node;
  const out = {};
  for (const k of Object.keys(node).sort()) {
    if (k === 'srcRange' || k === 'attributes' || k === 'originalText') continue;
    out[k] = _canonAst(node[k]);
  }
  return out;
}
function _stableStringify(o) {
  if (Array.isArray(o)) return '[' + o.map(_stableStringify).join(',') + ']';
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + _stableStringify(o[k])).join(',') + '}';
}
// FNV-1a — small, fast, no crypto deps. Good enough for de-dup keys.
function _fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
