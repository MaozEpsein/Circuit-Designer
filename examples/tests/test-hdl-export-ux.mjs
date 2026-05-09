// Phase 7 — Export UX helpers (DOM-free unit tests).
// Run: node examples/tests/test-hdl-export-ux.mjs

import {
  highlightVerilog, statsOf, withLineNumbers, parseTopPorts,
  generateTestbench, makeReadme, downloadFilename,
  VERILOG_KEYWORDS, VERILOG_TYPE_WORDS,
} from '../../js/hdl/ui/ExportModal.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('highlightVerilog');
{
  const html = highlightVerilog(`module top(input wire a, output reg q); // a comment\n  assign q = a & 4'h5;\nendmodule`);
  check('module wrapped as keyword',  /vp-kw">module</.test(html));
  check('input is a type word',       /vp-ty">input</.test(html));
  check('comment wrapped',            /vp-cmt">\/\/ a comment</.test(html));
  check('sized number wrapped',       /vp-num">4'h5</.test(html));
  check('escapes < > &',              !/<assign>/.test(highlightVerilog('<assign>')));
}
{
  const html = highlightVerilog(`assign s = "hello world";`);
  check('string literal wrapped',     /vp-str">"hello world"</.test(html));
}

console.log('statsOf');
{
  const src = `module top(input clk, input [7:0] d, output [7:0] q);
  wire [7:0] mid;
  reg  [7:0] mem [0:15];
  assign q = mid;
  assign mid = d;
  always @(posedge clk) mem[0] <= d;
endmodule`;
  const s = statsOf(src);
  check('lines counted',  s.lines >= 7);
  check('3 ports',        s.ports === 3);
  check('1 wire + 1 reg-mem ⇒ 2 nets', s.nets === 2);
  check('2 assigns',      s.assigns === 2);
  check('1 always',       s.always === 1);
  check('1 memory',       s.memory === 1);
}
{
  const empty = statsOf('');
  check('empty src ⇒ all zeros',
    empty.lines === 0 && empty.ports === 0 && empty.nets === 0
    && empty.assigns === 0 && empty.always === 0 && empty.memory === 0);
}

console.log('withLineNumbers');
{
  const out = withLineNumbers('a\nb\nc');
  check('three line spans',
    (out.match(/<span class="vp-line">/g) || []).length === 3);
  check('numbers padded uniformly',  /vp-ln">1</.test(out) && /vp-ln">3</.test(out));
}

console.log('parseTopPorts');
{
  const r = parseTopPorts(`module mux2(
    input  wire        clk,
    input  wire        sel,
    input  wire [3:0]  d0,
    input  wire [3:0]  d1,
    output reg  [3:0]  q
  );
  endmodule`);
  check('top name detected',          r.topName === 'mux2');
  check('4 inputs',                   r.inputs.length === 4);
  check('1 output',                   r.outputs.length === 1);
  check('d0 width 4',                 r.inputs.find(p => p.name === 'd0').width === 4);
  check('q width 4',                  r.outputs[0].width === 4);
}

console.log('generateTestbench');
{
  const v = `module mux2(input wire clk, input wire sel, input wire [3:0] d0, input wire [3:0] d1, output reg [3:0] q);
endmodule`;
  const tb = generateTestbench(v);
  check('declares dut instance',      /mux2 dut\s*\(/.test(tb));
  check('initialises every input',    /sel = 1'h0/.test(tb) && /d0 = 4'h0/.test(tb));
  check('toggles clk every 5 ns',     /always #5 clk = ~clk/.test(tb));
  check('dumps a VCD',                /\$dumpfile\("mux2\.vcd"\)/.test(tb));
  check('finishes after a fixed window', /\$finish/.test(tb));
}
{
  // No clock present — testbench must use a #delay instead of @posedge.
  const v = `module noclk(input wire a, output wire y); endmodule`;
  const tb = generateTestbench(v);
  check('no-clk variant uses #320 delay', /#320/.test(tb));
  check('no clock generator',             !/#5 clk/.test(tb));
}

console.log('makeReadme');
{
  const md = makeReadme('foo');
  check('mentions top + .v + tb',
    /foo\.v/.test(md) && /foo_tb\.v/.test(md));
  check('shows the iverilog command',   /iverilog -g2012/.test(md));
}

console.log('downloadFilename');
{
  check('passthrough for clean name',   downloadFilename('top') === 'top.v');
  check('sanitises spaces / specials',  downloadFilename('my design v2') === 'my_design_v2.v');
  check('falls back when garbage',      downloadFilename('!!!') === 'top.v');
  check('respects custom extension',    downloadFilename('foo', '.tb.v') === 'foo.tb.v');
}

console.log('keyword sets');
{
  check('module keyword',         VERILOG_KEYWORDS.has('module'));
  check('input is type word',     VERILOG_TYPE_WORDS.has('input'));
  check('reg is type word',       VERILOG_TYPE_WORDS.has('reg'));
  check('non-keyword excluded',   !VERILOG_KEYWORDS.has('foo'));
}

if (failed > 0) {
  console.log(`\n${failed} export-UX test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll export-UX checks passed.');
}
