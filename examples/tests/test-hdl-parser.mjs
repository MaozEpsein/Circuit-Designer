// Phase 8 — Verilog parser tests. Lexer + parser cover the constructs
// our exporter emits in Phases 1–7. Run:
//   node examples/tests/test-hdl-parser.mjs

import { tokenize, parseVerilog, AST_KIND } from '../../js/hdl/parser/index.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

// ── LEXER ───────────────────────────────────────────────────
console.log('Lexer — basic shapes');
{
  const t = tokenize('module top; endmodule');
  check('module + identifier + ; + endmodule + eof',
    t.length === 5 && t[0].kind === 'kw' && t[0].text === 'module'
    && t[1].kind === 'id' && t[1].text === 'top'
    && t[2].kind === 'op' && t[2].text === ';'
    && t[3].kind === 'kw' && t[3].text === 'endmodule'
    && t[4].kind === 'eof');
}
{
  const t = tokenize("4'h5 8'b1010_1010 32'd255 'h1A");
  check('sized hex literal', t[0].width === 4 && t[0].base === 'h' && t[0].value === 5);
  check('sized binary with underscores', t[1].width === 8 && t[1].base === 'b' && t[1].value === 0xAA);
  check('sized decimal',                  t[2].width === 32 && t[2].base === 'd' && t[2].value === 255);
  check('unsized hex',                    t[3].width === null && t[3].base === 'h' && t[3].value === 0x1A);
}
{
  const t = tokenize('a <= b == c && d');
  check('multi-char operators tokenised greedily',
    t[1].text === '<=' && t[3].text === '==' && t[5].text === '&&');
}
{
  const t = tokenize('// a comment\nfoo /* block */ bar');
  check('line + block comments stripped',
    t.length === 3 && t[0].text === 'foo' && t[1].text === 'bar' && t[2].kind === 'eof');
}
{
  const t = tokenize('posedge negedge or always initial');
  check('keywords vs identifiers',
    t.every((x, i) => i === t.length - 1 || x.kind === 'kw'));
}

{
  const t = tokenize('(* keep, ram_style="block" *) reg [7:0] mem;');
  check('attribute block tokenised',
    t[0].kind === 'attr' && t[0].text.includes('keep'));
  check('attribute followed by reg keyword',
    t[1].kind === 'kw' && t[1].text === 'reg');
}

// ── PARSER ──────────────────────────────────────────────────
console.log('Parser — empty module');
{
  const { ast } = parseVerilog('module top; endmodule');
  check('one Module node', ast.modules.length === 1);
  check('module name preserved', ast.modules[0].name === 'top');
  check('ports empty', ast.modules[0].ports.length === 0);
  check('items empty',  ast.modules[0].items.length === 0);
}

console.log('Parser — port list with widths');
{
  const src = `module top(
    input wire a,
    input [7:0] data,
    output wire y,
    output [7:0] result
  );
  endmodule`;
  const { ast } = parseVerilog(src);
  const m = ast.modules[0];
  check('4 ports parsed', m.ports.length === 4);
  check('port a is input,1-bit', m.ports[0].dir === 'input' && m.ports[0].width === 1);
  check('port data is input,8-bit', m.ports[1].dir === 'input' && m.ports[1].width === 8);
  check('port y is output,1-bit',   m.ports[2].dir === 'output' && m.ports[2].width === 1);
  check('port result is output,8-bit', m.ports[3].dir === 'output' && m.ports[3].width === 8);
}

console.log('Parser — net + memory declarations');
{
  const src = `module top;
    wire a;
    wire [3:0] bus;
    reg  [7:0] r;
    reg  [7:0] mem [0:15];
  endmodule`;
  const { ast } = parseVerilog(src);
  const items = ast.modules[0].items;
  check('4 items',                      items.length === 4);
  check('wire a 1-bit',                 items[0].kind === 'NetDecl' && items[0].netKind === 'wire' && items[0].width === 1);
  check('wire [3:0] bus is 4-bit',      items[1].width === 4);
  check('reg  [7:0] r is 8-bit',        items[2].kind === 'NetDecl' && items[2].netKind === 'reg' && items[2].width === 8);
  check('memory mem with depth=16',     items[3].kind === 'MemoryDecl' && items[3].depth === 16);
}

console.log('Parser — continuous assigns + expressions');
{
  const src = `module top;
    wire y;
    assign y = (a & b) | ~c;
    assign z = sel ? d0 : d1;
    assign w = {a, b[3:0], 1'b1};
    assign r = {4{a}};
  endmodule`;
  const { ast } = parseVerilog(src);
  const items = ast.modules[0].items;
  const assigns = items.filter(i => i.kind === 'ContAssign');
  check('4 continuous assigns', assigns.length === 4);
  check('first assign LHS is `y`',  assigns[0].lhs.kind === 'Ref' && assigns[0].lhs.name === 'y');
  check('first assign RHS is BinaryOp(|, …)',
    assigns[0].rhs.kind === 'BinaryOp' && assigns[0].rhs.op === '|');
  check('ternary parsed',
    assigns[1].rhs.kind === 'Ternary' && assigns[1].rhs.cond.name === 'sel');
  check('concat parsed',
    assigns[2].rhs.kind === 'Concat' && assigns[2].rhs.parts.length === 3);
  check('replicate parsed',
    assigns[3].rhs.kind === 'Replicate' && assigns[3].rhs.count.value === 4);
}

console.log('Parser — always blocks + statements');
{
  const src = `module top;
    reg q;
    always @(posedge clk or negedge rst) begin
      if (!rst) begin
        q <= 1'b0;
      end else begin
        q <= d;
      end
    end
    always @(*) begin
      case (sel)
        2'h0: out = a;
        2'h1: out = b;
        default: out = c;
      endcase
    end
    initial begin
      q = 1'b0;
    end
  endmodule`;
  const { ast } = parseVerilog(src);
  const items = ast.modules[0].items;
  const always = items.filter(i => i.kind === 'Always');
  const init   = items.filter(i => i.kind === 'Initial');
  check('two always blocks',  always.length === 2);
  check('one initial block',  init.length === 1);
  check('first always sensitivity has 2 triggers',
    always[0].sensitivity.triggers?.length === 2);
  check('first always trigger 0 = posedge clk',
    always[0].sensitivity.triggers[0].edge === 'posedge'
    && always[0].sensitivity.triggers[0].signal === 'clk');
  check('star sensitivity for the comb always',
    always[1].sensitivity.star === true);
  // Drill into the if/else inside the first always
  const blk = always[0].body[0];
  check('always body is a Block',  blk.kind === 'Block');
  const ifStmt = blk.stmts[0];
  check('Block holds an If',       ifStmt.kind === 'If');
  check('If has else',             ifStmt.else !== null);
  check('non-blocking assign in then-branch',
    ifStmt.then.stmts[0].kind === 'NonBlockingAssign');
  // Drill into the case
  const caseBlk = always[1].body[0].stmts[0];
  check('case parsed', caseBlk.kind === 'Case');
  check('case has 3 arms (incl default)', caseBlk.arms.length === 3);
  check('default arm has label=null', caseBlk.arms[2].label === null);
}

console.log('Parser — primitive gate + module instances');
{
  const src = `module top;
    and g(y, a, b);
    not n(z, x);
    submod inst (.a(p), .b(q), .y(r));
    parammod #(.WIDTH(8)) im (.x(p), .y(q));
  endmodule`;
  const { ast } = parseVerilog(src);
  const items = ast.modules[0].items;
  const gates = items.filter(i => i.kind === 'Instance' && i.isPrimitive);
  const mods  = items.filter(i => i.kind === 'Instance' && !i.isPrimitive);
  check('2 primitive gates', gates.length === 2);
  check('and gate has 3 positional ports', gates[0].ports.length === 3 && gates[0].positional === true);
  check('not gate has 2 ports',            gates[1].ports.length === 2);
  check('2 module instances', mods.length === 2);
  check('first mod has named ports',
    mods[0].ports[0].name === 'a' && mods[0].ports[0].expr.name === 'p');
  check('parameterised mod kept WIDTH=8',
    mods[1].params.WIDTH?.kind === 'Literal' && mods[1].params.WIDTH.value === 8);
}

console.log('Parser — Verilog (* attribute *) blocks');
{
  const src = `module top;
    (* keep *) wire a;
    (* ram_style = "block", keep *) reg [7:0] mem [0:255];
    (* gate_marker *) and g(y, a, b);
  endmodule`;
  const { ast } = parseVerilog(src);
  const items = ast.modules[0].items;
  check('wire carries attribute', items[0].attributes?.[0]?.includes('keep'));
  check('memory carries attribute', items[1].attributes?.[0]?.includes('ram_style'));
  check('primitive instance carries attribute', items[2].attributes?.[0] === 'gate_marker');
}

console.log('Parser — resource limits');
{
  // Recursion guard — extremely deep nested ternary forces the
  // expression parser to recurse. With maxRecursionDepth=8 the parser
  // should surface a "recursion depth" error (either thrown or
  // collected via error recovery — both are acceptable).
  let src = '0';
  for (let i = 0; i < 30; i++) src = `(1 ? ${src} : 0)`;
  const wrapped = `module top; assign x = ${src}; endmodule`;
  let surfaced = false;
  try {
    const { errors } = parseVerilog(wrapped, { maxRecursionDepth: 8 });
    surfaced = errors.some(e => /recursion depth/i.test(e.message));
  } catch (e) {
    surfaced = /recursion depth/i.test(e.message);
  }
  check('recursion-depth limit enforced', surfaced);
}
{
  // Token count limit.
  let threw = false;
  try { parseVerilog('module x; endmodule', { maxTokens: 2 }); }
  catch (e) { threw = /token count/i.test(e.message); }
  check('token-count limit enforced', threw);
}

console.log('Parser — parameter declarations');
{
  const src = `module top;
    parameter WIDTH = 8;
    localparam DEPTH = 256, INIT = 4'h5;
    parameter [3:0] OPCODE = 4'b1010;
  endmodule`;
  const { ast } = parseVerilog(src);
  const params = ast.modules[0].items.filter(i => i.kind === 'ParamDecl');
  check('three top-level parameter decls captured (1+2+1)', params.length === 4);
  check('WIDTH = 8', params[0].name === 'WIDTH'
    && params[0].value.kind === 'Literal' && params[0].value.value === 8);
  check('DEPTH from list-form decl', params[1].name === 'DEPTH' && params[1].paramKind === 'localparam');
  check('OPCODE has [3:0] width carried', params[3].width === 4);
}

console.log('Parser — system tasks ($display etc)');
{
  const src = `module top;
    initial begin
      $readmemh("init.hex", mem);
      $display("hello %d", x);
    end
  endmodule`;
  const { ast } = parseVerilog(src);
  const init = ast.modules[0].items[0];
  check('initial body is a Block', init.body[0].kind === 'Block');
  const stmts = init.body[0].stmts;
  check('two SystemCall statements', stmts.length === 2 && stmts.every(s => s.kind === 'SystemCall'));
  check('$readmemh with 2 args', stmts[0].name === '$readmemh' && stmts[0].args.length === 2);
  check('$display with literal + ref', stmts[1].name === '$display' && stmts[1].args[1].kind === 'Ref');
}

console.log('Parser — error recovery at statement boundaries');
{
  // Two broken items between two valid ones; recovery should yield
  // two PARSED items + two errors collected, not a thrown stop.
  const src = `module top;
    wire a;
    foo bar baz;
    wire ;
    wire c;
  endmodule`;
  const { ast, errors } = parseVerilog(src);
  const items = ast.modules[0].items;
  check('valid items survive (a + c)',
    items.some(i => i.kind === 'NetDecl' && i.name === 'a')
    && items.some(i => i.kind === 'NetDecl' && i.name === 'c'));
  check('errors collected (>=1)', errors.length >= 1);
  check('error has location info', errors[0]?.token?.line > 0);
}

console.log('Parser — round-trip on exporter output');
{
  // Take a tiny circuit, export it, parse the resulting Verilog, confirm
  // the parser doesn't choke. Real structural diff comes in Phase 9
  // (AST → IR), but "no throw + AST shape sane" is already a strong
  // smoke test for the exporter ↔ parser pair.
  const { exportCircuit } = await import('../../js/hdl/VerilogExporter.js');
  const v = exportCircuit({
    nodes: [
      { id: 'a', type: 'INPUT',  label: 'a' },
      { id: 'b', type: 'INPUT',  label: 'b' },
      { id: 'g', type: 'GATE_SLOT', gate: 'AND', label: 'g' },
      { id: 'y', type: 'OUTPUT', label: 'y' },
    ],
    wires: [
      { id: 'w0', sourceId: 'a', targetId: 'g', targetInputIndex: 0 },
      { id: 'w1', sourceId: 'b', targetId: 'g', targetInputIndex: 1 },
      { id: 'w2', sourceId: 'g', targetId: 'y', targetInputIndex: 0 },
    ],
  }, { topName: 'and_gate', header: false });
  const { ast } = parseVerilog(v);
  check('parser accepted exporter output (AND gate)', ast.modules.length === 1);
  check('module name preserved', ast.modules[0].name === 'and_gate');
  check('a + b as inputs, y as output',
    ast.modules[0].ports.some(p => p.name === 'a' && p.dir === 'input')
    && ast.modules[0].ports.some(p => p.name === 'b' && p.dir === 'input')
    && ast.modules[0].ports.some(p => p.name === 'y' && p.dir === 'output'));
  check('emitted `and` primitive instance survives parse',
    ast.modules[0].items.some(it => it.kind === 'Instance' && it.type === 'and' && it.isPrimitive));
}

console.log('Parser — Phase-8 sidecar .v (hand-written corpus)');
{
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, '..', 'hdl-corpus', 'phase8-mux2-handwritten.v');
  const src  = readFileSync(path, 'utf8');
  const { ast, errors } = parseVerilog(src);
  check('sidecar parses without errors', errors.length === 0);
  check('one module named mux2',
    ast.modules.length === 1 && ast.modules[0].name === 'mux2');
  const items = ast.modules[0].items;
  const has   = (kind, pred = () => true) => items.some(i => i.kind === kind && pred(i));
  check('parameter WIDTH=4',
    has('ParamDecl', i => i.name === 'WIDTH' && i.value.value === 4));
  check('attribute on the inner reg',
    items.some(i => i.kind === 'MemoryDecl' || i.kind === 'NetDecl')
    && items.some(i => Array.isArray(i.attributes) && i.attributes[0]?.includes('keep')));
  check('continuous assign sel_b = sel',
    has('ContAssign', i => i.lhs.name === 'sel_b' && i.rhs.name === 'sel'));
  check('comb always with case',
    has('Always', i => i.sensitivity?.star === true
        && i.body[0].stmts?.some(s => s.kind === 'Case')));
  check('clocked always with if/else',
    has('Always', i => i.sensitivity?.triggers?.length === 2
        && i.body[0].stmts?.some(s => s.kind === 'If')));
  check('initial with $display',
    has('Initial', i => i.body[0].stmts?.some(
      s => s.kind === 'SystemCall' && s.name === '$display')));
}

if (failed > 0) {
  console.log(`\n${failed} parser test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll parser checks passed.');
}
