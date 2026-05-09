// HDL Export Modal — pure helpers behind the Verilog preview UI.
//
// This module owns the *logic* of the modal (syntax highlighting,
// stats, line numbering, port extraction, testbench generation, README
// boilerplate, ZIP packaging). The DOM wiring lives in the
// `initVerilogPreview` IIFE in [js/app.js](../../app.js); that IIFE
// imports the helpers below so the testable surface area is in one
// place a CI can exercise without a browser.
//
// Each helper is pure: same input → same output, no globals, no DOM.

// ── Syntax highlighting ─────────────────────────────────────
// Token-level. Avoids a real lexer because the goal is HTML-pretty,
// not semantic colouring. Three classes drive the CSS:
//   .vp-kw     reserved word
//   .vp-ty     keyword that introduces a type / direction / always
//   .vp-num    integer literal (sized or unsized)
//   .vp-str    string literal "…"
//   .vp-cmt    comment (// or /* */)
//   .vp-op     operator / punctuation we want to dim

export const VERILOG_KEYWORDS = new Set([
  'module', 'endmodule', 'assign', 'always', 'initial', 'begin', 'end',
  'if', 'else', 'case', 'casez', 'casex', 'endcase', 'default',
  'posedge', 'negedge', 'or', 'and', 'nand', 'nor', 'not', 'xor', 'xnor', 'buf',
  'parameter', 'localparam', 'signed', 'unsigned',
]);
export const VERILOG_TYPE_WORDS = new Set([
  'input', 'output', 'inout', 'wire', 'reg', 'integer', 'tri',
]);

const HTML_ESCAPE = { '&':'&amp;', '<':'&lt;', '>':'&gt;' };
function _esc(s) { return s.replace(/[&<>]/g, c => HTML_ESCAPE[c]); }

export function highlightVerilog(src) {
  if (!src) return '';
  // Order matters: comments → strings → numbers → identifiers/keywords.
  // We work on a single regex with named alternatives to avoid double-wrap.
  const RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*")|(\b\d+'[hHbBoOdD][0-9a-fA-FxXzZ_]+\b|\b\d[\d_]*\b|\b'[hHbBoO][0-9a-fA-FxXzZ_]+\b)|(\b[A-Za-z_][A-Za-z0-9_$]*\b)/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = RE.exec(src)) !== null) {
    out += _esc(src.slice(last, m.index));
    if      (m[1]) out += `<span class="vp-cmt">${_esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="vp-str">${_esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="vp-num">${_esc(m[3])}</span>`;
    else if (m[4]) {
      const w = m[4];
      if (VERILOG_TYPE_WORDS.has(w)) out += `<span class="vp-ty">${w}</span>`;
      else if (VERILOG_KEYWORDS.has(w)) out += `<span class="vp-kw">${w}</span>`;
      else out += _esc(w);
    }
    last = m.index + m[0].length;
  }
  out += _esc(src.slice(last));
  return out;
}

// ── Stats ───────────────────────────────────────────────────
// Cheap structural counts used in the preview's stats bar. Only counts
// lines/ports/nets/assigns/always/memory at a literal level — not a
// substitute for IR-level metrics. Good enough as a UI hint.

export function statsOf(src) {
  if (!src) return { lines: 0, ports: 0, nets: 0, assigns: 0, always: 0, memory: 0 };
  const lines   = src.split('\n').length;
  // Port keywords appear in two places — body declarations (`^input ...;`)
  // and header lists (`module top(input a, input b, ...);`). Count both.
  const ports   = (src.match(/(?:^|[(,])\s*(?:input|output|inout)\b/gm) || []).length;
  const nets    = (src.match(/^\s*(wire|reg|tri)\s/gm) || []).length;
  const assigns = (src.match(/^\s*assign\b/gm) || []).length;
  const always  = (src.match(/^\s*always\b/gm) || []).length;
  // Memory declaration: `reg [..] name [0:..];`.
  const memory  = (src.match(/^\s*reg\s+\[[^\]]*\]\s+\w+\s+\[\s*\d+\s*:/gm) || []).length;
  return { lines, ports, nets, assigns, always, memory };
}

// ── Line numbers ────────────────────────────────────────────
// Wraps each line in `<span class="vp-line">` with a sibling
// `<span class="vp-ln">N</span>` gutter. Input is HTML — passes line
// breaks through untouched. Numbers are right-aligned to the gutter
// width (3 chars covers up to 999 lines comfortably).

export function withLineNumbers(html) {
  if (!html) return '';
  const lines = html.split('\n');
  const w = String(lines.length).length;
  return lines.map((ln, i) => {
    const num = String(i + 1).padStart(w, ' ');
    return `<span class="vp-line"><span class="vp-ln">${num}</span>${ln}</span>`;
  }).join('\n');
}

// ── Top-level port extraction ───────────────────────────────
// Scans a `module foo(...)` header for input / output ports + their
// widths so the testbench generator can drive each one with a known
// stimulus. Naive but tolerant; good enough for our exporter's output.

export function parseTopPorts(src) {
  if (!src) return { topName: 'top', inputs: [], outputs: [] };
  const m = src.match(/\bmodule\s+(\w+)\s*\(([\s\S]*?)\)\s*;/);
  if (!m) return { topName: 'top', inputs: [], outputs: [] };
  const topName = m[1];
  const portsBlk = m[2];
  const inputs = [];
  const outputs = [];
  // Tokens shaped like:  input wire [7:0] foo, …
  const lineRE = /\b(input|output|inout)\b\s+(?:wire|reg)?\s*(?:\[\s*(\d+)\s*:\s*(\d+)\s*\])?\s*([A-Za-z_]\w*)/g;
  let mm;
  while ((mm = lineRE.exec(portsBlk)) !== null) {
    const dir  = mm[1];
    const hi   = mm[2] !== undefined ? parseInt(mm[2], 10) : 0;
    const lo   = mm[3] !== undefined ? parseInt(mm[3], 10) : 0;
    const name = mm[4];
    const width = (mm[2] !== undefined) ? Math.abs(hi - lo) + 1 : 1;
    if      (dir === 'input')  inputs.push({ name, width });
    else if (dir === 'output') outputs.push({ name, width });
  }
  return { topName, inputs, outputs };
}

// ── Testbench generator ─────────────────────────────────────
// Emits a self-contained `<top>_tb.v` that drives every input to 0,
// pulses the clock if one is present, dumps a VCD, and stops after
// 64 cycles. Simulators can replay the design without extra setup.

export function generateTestbench(verilog, opts = {}) {
  const { topName, inputs, outputs } = parseTopPorts(verilog);
  const top = opts.topName || topName;
  const clkName  = inputs.find(p => /^clk|clock/i.test(p.name))?.name;
  const dutPorts = [...inputs, ...outputs].map(p =>
    `.${p.name}(${p.name})`).join(', ');
  const declIn   = inputs.map(p =>
    `  reg  ${p.width > 1 ? `[${p.width - 1}:0] ` : ''}${p.name};`).join('\n');
  const declOut  = outputs.map(p =>
    `  wire ${p.width > 1 ? `[${p.width - 1}:0] ` : ''}${p.name};`).join('\n');
  const initZero = inputs.map(p => `    ${p.name} = ${p.width}'h0;`).join('\n');
  const clockBlock = clkName
    ? `  // Clock generator — 10 ns period.\n  always #5 ${clkName} = ~${clkName};\n\n`
    : '';
  const stopBlock = clkName
    ? `    repeat (64) @(posedge ${clkName});\n    $finish;`
    : `    #320;\n    $finish;`;
  return `// Auto-generated testbench for module \`${top}\`.\n` +
    `// Drives every input to 0, ${clkName ? `pulses ${clkName}, ` : ''}dumps a VCD,\n` +
    `// and stops after 64 cycles.\n\n` +
    `\`timescale 1ns / 1ps\n\n` +
    `module ${top}_tb;\n\n` +
    declIn + (declIn ? '\n' : '') +
    declOut + (declOut ? '\n\n' : '\n') +
    `  ${top} dut (${dutPorts});\n\n` +
    clockBlock +
    `  initial begin\n` +
    `    $dumpfile("${top}.vcd");\n` +
    `    $dumpvars(0, ${top}_tb);\n` +
    initZero + (initZero ? '\n' : '') +
    stopBlock + '\n' +
    `  end\n\n` +
    `endmodule\n`;
}

// ── README boilerplate for the project .zip ─────────────────

export function makeReadme(topName) {
  return `# ${topName} — Verilog project\n\n` +
    `Generated by Circuit Designer.\n\n` +
    `## Files\n\n` +
    `- \`${topName}.v\` — design under test.\n` +
    `- \`${topName}_tb.v\` — auto-generated testbench (drives 0, dumps VCD).\n` +
    `- \`${topName}.vcd\` — appears after running the testbench.\n\n` +
    `## Run with iverilog\n\n` +
    `\`\`\`\n` +
    `iverilog -g2012 -o ${topName}.vvp ${topName}.v ${topName}_tb.v\n` +
    `vvp ${topName}.vvp\n` +
    `gtkwave ${topName}.vcd &\n` +
    `\`\`\`\n`;
}

// ── Download filename helper ────────────────────────────────
// Sanitises the user-typed top-name into something filesystem-safe.

export function downloadFilename(topName, ext = '.v') {
  const base = String(topName || 'top').trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'top';
  return base + ext;
}
