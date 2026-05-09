// Phase 9 — Elaboration tests. AST → IR.
//
// Run: node examples/tests/test-hdl-elaborate.mjs

import { parseVerilog, elaborate } from '../../js/hdl/parser/index.js';
import { IR_KIND }                  from '../../js/hdl/ir/types.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}
function elab(src, opts) {
  const { ast } = parseVerilog(src);
  return elaborate(ast, opts);
}

console.log('Elaborate — empty module');
{
  const { ir, errors } = elab('module top; endmodule');
  check('no errors', errors.length === 0);
  check('IR is a Module', ir.kind === IR_KIND.Module);
  check('name preserved', ir.name === 'top');
  check('zero ports', ir.ports.length === 0);
}

console.log('Elaborate — ports + nets get widths from header');
{
  const { ir } = elab(`module foo(
    input        a,
    input  [7:0] data,
    output       y,
    output [3:0] result
  );
    wire [3:0] tmp;
    assign result = tmp;
  endmodule`);
  check('a is 1-bit input',      ir.ports[0].dir === 'input'  && ir.ports[0].width === 1);
  check('data is 8-bit input',   ir.ports[1].width === 8);
  check('result is 4-bit output',ir.ports[3].dir === 'output' && ir.ports[3].width === 4);
  const tmp = ir.nets.find(n => n.name === 'tmp');
  check('wire tmp declared 4-bit', tmp && tmp.width === 4);
  check('assign LHS is Ref(result, 4)',
    ir.assigns[0].lhs.kind === IR_KIND.Ref
    && ir.assigns[0].lhs.netName === 'result'
    && ir.assigns[0].lhs.width === 4);
}

console.log('Elaborate — parameter resolution + width-from-param');
{
  const { ir } = elab(`module bar(input wire [WIDTH-1:0] d, output wire [WIDTH-1:0] q);
    parameter WIDTH = 8;
    wire [WIDTH-1:0] mid;
    assign q = d;
  endmodule`);
  check('d port resolved to 8-bit',  ir.ports[0].width === 8);
  check('mid wire resolved to 8-bit', ir.nets[0].width === 8);
}

console.log('Elaborate — expressions');
{
  const { ir } = elab(`module e;
    wire [3:0] a, b;
    wire [7:0] s;
    assign s = a + b;
    assign s = (a & b) | ~b;
    assign s = sel ? a : b;
    assign s = {a, b};
    assign s = {2{a}};
  endmodule`);
  const a = ir.assigns;
  check('binary + width = max(4,4)=4', a[0].rhs.kind === IR_KIND.BinaryOp && a[0].rhs.width === 4);
  check('OR + UnaryOp lowered',         a[1].rhs.kind === IR_KIND.BinaryOp);
  check('Ternary preserved',            a[2].rhs.kind === IR_KIND.Ternary);
  check('Concat width = sum(parts)=8',  a[3].rhs.kind === IR_KIND.Concat && a[3].rhs.width === 8);
  check('Replicate width = count*inner=8', a[4].rhs.kind === IR_KIND.Replicate && a[4].rhs.width === 8);
}

console.log('Elaborate — always blocks → IR statements');
{
  const { ir } = elab(`module r;
    reg q;
    always @(posedge clk or negedge rst_n) begin
      if (!rst_n) q <= 1'b0;
      else        q <= d;
    end
  endmodule`);
  check('one always block in IR', ir.alwaysBlocks.length === 1);
  const blk = ir.alwaysBlocks[0];
  check('sensitivity has 2 triggers', blk.sensitivity.triggers?.length === 2);
  check('body[0] is IfStmt',          blk.body[0].kind === 'IfStmt');
  check('then-branch is NBA',         blk.body[0].then[0].kind === 'NonBlockingAssign');
  check('else-branch present',        Array.isArray(blk.body[0].else));
}

console.log('Elaborate — initial block lifted into alwaysBlocks');
{
  const { ir } = elab(`module r;
    reg q;
    initial begin
      q = 1'b0;
    end
  endmodule`);
  check('initial appears as Always with sensitivity.initial',
    ir.alwaysBlocks.length === 1
    && ir.alwaysBlocks[0].sensitivity.initial === true
    && ir.alwaysBlocks[0].body[0].kind === 'BlockingAssign');
}

console.log('Elaborate — case statement');
{
  const { ir } = elab(`module c;
    reg [1:0] sel;
    reg out;
    always @(*) begin
      case (sel)
        2'h0: out = a;
        2'h1: out = b;
        default: out = c;
      endcase
    end
  endmodule`);
  const cs = ir.alwaysBlocks[0].body[0];
  check('case lowered to CaseStmt', cs.kind === 'CaseStmt');
  check('two arms (default split out)', cs.cases.length === 2);
  check('default branch populated', cs.default.length === 1);
}

console.log('Elaborate — primitive instance carries portMap + portOrder');
{
  const { ir } = elab(`module p;
    wire y, a, b;
    and g(y, a, b);
    not n(z, x);
  endmodule`);
  const insts = ir.instances;
  check('two instances', insts.length === 2);
  const and_ = insts[0];
  check('and is primitive', and_.isPrimitive === true);
  check('portOrder is [Y,A,B]', and_.portOrder?.join(',') === 'Y,A,B');
  check('portMap.Y is Ref(y)', and_.portMap.Y.kind === IR_KIND.Ref && and_.portMap.Y.netName === 'y');
  check('not gate has 2 ports', insts[1].portOrder?.join(',') === 'Y,A');
}

console.log('Elaborate — module instance with named ports + params');
{
  const { ir } = elab(`module top;
    submod #(.WIDTH(8)) inst (.a(p), .b(q), .y(r));
  endmodule`);
  const inst = ir.instances[0];
  check('not flagged as primitive', !inst.isPrimitive);
  check('WIDTH param folded to 8',  inst.params.WIDTH === 8);
  check('portMap has named ports',  Object.keys(inst.portMap).sort().join(',') === 'a,b,y');
}

console.log('Elaborate — verilog attributes carried through');
{
  const { ir } = elab(`module a;
    (* keep *) wire foo;
    (* gsr_marker *) and g(y, a, b);
  endmodule`);
  const fooNet = ir.nets[0];
  check('wire carries attribute',
    fooNet.attributes?.some(a => a.key === 'verilog-attr' && a.value === 'keep'));
  const inst = ir.instances[0];
  check('instance carries attribute',
    inst.attributes?.some(a => a.key === 'verilog-attr' && a.value === 'gsr_marker'));
}

console.log('Elaborate — multi-module: last is top, others under submodules');
{
  const { ir } = elab(`module child(input a, output y); assign y = a; endmodule
                       module top(input a, output y); child c(.a(a),.y(y)); endmodule`);
  check('top is `top`',                 ir.name === 'top');
  check('child appears in submodules',  ir.submodules?.length === 1 && ir.submodules[0].name === 'child');
}

console.log('Elaborate — originalText populated when source provided');
{
  const src = `module foo(input wire a, output wire y);
  assign y = a;
endmodule`;
  const { ast } = parseVerilog(src);
  const { ir }  = elaborate(ast, { source: src });
  check('module has originalText',     typeof ir.originalText === 'string' && ir.originalText.length > 0);
  check('port a has originalText',     ir.ports[0].originalText?.includes('input'));
  check('assign has originalText',     ir.assigns[0].originalText?.startsWith('assign'));
}
{
  // Without source, originalText stays null.
  const { ast } = parseVerilog('module bar; endmodule');
  const { ir }  = elaborate(ast);
  check('originalText null when source omitted', ir.originalText == null);
}

console.log('Elaborate — unsupported construct error points to SUPPORTED.md');
{
  // Synthesise a minimal AST with a fake expression kind.
  const { ast } = parseVerilog('module e; wire a; assign a = b; endmodule');
  // Mutate one expression node to an unknown kind.
  ast.modules[0].items[1].rhs.kind = 'BogusKind';
  // ElaborateError is caught and surfaced via the errors[] channel by
  // design (so a multi-module source can elaborate the good ones and
  // report the bad ones together).
  const { errors } = elaborate(ast);
  const msg = errors.map(e => e.message).join('\n');
  check('error message names the bogus kind', /BogusKind/.test(msg));
  check('error message points to SUPPORTED.md', /SUPPORTED\.md/.test(msg));
}

console.log('canonicaliseWidths — no-op on already-canonical IR');
{
  const { canonicaliseWidths } = await import('../../js/hdl/ir/canonicaliseWidths.js');
  const { ast } = parseVerilog(`module m;
    wire [3:0] a, b, y;
    assign y = a + b;
  endmodule`);
  const { ir } = elaborate(ast);
  const before = JSON.stringify(ir);
  const { ir: ir2, diagnostics } = canonicaliseWidths(ir);
  check('no diagnostics on clean IR',  diagnostics.length === 0);
  check('IR unchanged structurally',   JSON.stringify(ir2) === before);
}
{
  // Force a Concat with a wrong width — canonicalise must repair it.
  const { canonicaliseWidths } = await import('../../js/hdl/ir/canonicaliseWidths.js');
  const fakeIR = {
    kind: 'Module', name: 'm', ports: [], nets: [], memories: [], instances: [], submodules: [],
    assigns: [], alwaysBlocks: [{ kind: 'Always', sensitivity: { star: true }, body: [] }],
  };
  const concat = { kind: 'Concat', parts: [
    { kind: 'Literal', value: 0, width: 4 },
    { kind: 'Literal', value: 0, width: 8 },
  ], width: 99 };
  fakeIR.alwaysBlocks[0].body.push({ kind: 'BlockingAssign',
    lhs: { kind: 'Ref', netName: 'x', width: 12 }, rhs: concat });
  canonicaliseWidths(fakeIR);
  check('Concat width re-derived to 12', concat.width === 12);
}

console.log('unrollPmux — case becomes if/else chain');
{
  const { unrollPmux } = await import('../../js/hdl/ir/unrollPmux.js');
  const { ast } = parseVerilog(`module m;
    reg out;
    always @(*) begin
      case (sel)
        2'h0: out = a;
        2'h1: out = b;
        default: out = c;
      endcase
    end
  endmodule`);
  const { ir } = elaborate(ast);
  const ir2 = unrollPmux(ir);
  const stmt = ir2.alwaysBlocks[0].body[0];
  check('top-level became IfStmt',     stmt.kind === 'IfStmt');
  check('cond is == against label 0',
    stmt.cond.kind === 'BinaryOp' && stmt.cond.op === '==');
  // Walk the chain — should be IfStmt → IfStmt → default body.
  const next = stmt.else?.[0];
  check('else holds nested IfStmt',    next?.kind === 'IfStmt');
  const tail = next.else;
  check('innermost else has the default body',
    Array.isArray(tail) && tail.length === 1 && tail[0].kind === 'BlockingAssign');
}

if (failed > 0) {
  console.log(`\n${failed} elaborate test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll elaborate checks passed.');
}
