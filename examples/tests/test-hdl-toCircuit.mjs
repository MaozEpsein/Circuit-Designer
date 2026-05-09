// Phase 10 — toCircuit (IR → circuitJSON) tests.
// Run: node examples/tests/test-hdl-toCircuit.mjs

import { parseVerilog }   from '../../js/hdl/parser/parser.js';
import { elaborate }      from '../../js/hdl/parser/elaborate.js';
import { toCircuit }      from '../../js/hdl/import/toCircuit.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}
function importVerilog(src) {
  const { ast } = parseVerilog(src);
  const { ir } = elaborate(ast);
  return toCircuit(ir);
}

console.log('toCircuit — ports become INPUT / OUTPUT / CLOCK nodes');
{
  const c = importVerilog(`module top(
    input  wire        clk,
    input  wire [7:0]  d,
    output wire [7:0]  q
  ); endmodule`);
  const types = c.nodes.map(n => n.type).sort();
  check('three nodes',                 c.nodes.length === 3);
  check('CLOCK + INPUT + OUTPUT',      types.join(',') === 'CLOCK,INPUT,OUTPUT');
  check('clk recognised as CLOCK',     c.nodes.find(n => n.label === 'clk').type === 'CLOCK');
  check('d carries bitWidth=8',        c.nodes.find(n => n.label === 'd').bitWidth === 8);
  check('q is OUTPUT, sandbox=true',
    c.nodes.find(n => n.label === 'q').type === 'OUTPUT'
    && c.nodes.find(n => n.label === 'q').sandbox === true);
}

console.log('toCircuit — primitive AND gate becomes GATE_SLOT');
{
  const c = importVerilog(`module top(input a, input b, output y);
    and g_and(y, a, b);
  endmodule`);
  const gate = c.nodes.find(n => n.type === 'GATE_SLOT');
  check('GATE_SLOT created',           !!gate);
  check('gate prop = AND',             gate?.gate === 'AND');
  check('label preserved',             gate?.label === 'g_and');
  // Wires: a → g.in0, b → g.in1, g → y.in0
  check('three wires',                 c.wires.length === 3);
  const wA  = c.wires.find(w => w.targetId === gate.id && w.targetInputIndex === 0);
  const wB  = c.wires.find(w => w.targetId === gate.id && w.targetInputIndex === 1);
  const wY  = c.wires.find(w => w.sourceId === gate.id);
  check('a wired to gate.in0',         !!wA && c.nodes.find(n => n.id === wA.sourceId).label === 'a');
  check('b wired to gate.in1',         !!wB && c.nodes.find(n => n.id === wB.sourceId).label === 'b');
  check('gate output → y',             !!wY && c.nodes.find(n => n.id === wY.targetId).label === 'y');
}

console.log('toCircuit — chain of gates resolves intermediate nets');
{
  const c = importVerilog(`module top(input a, input b, input c, output y);
    wire t;
    and g0(t, a, b);
    or  g1(y, t, c);
  endmodule`);
  const gates = c.nodes.filter(n => n.type === 'GATE_SLOT');
  check('two gates',                   gates.length === 2);
  // Find the AND that drives wire `t`.
  const and_ = gates.find(g => g.gate === 'AND');
  const or_  = gates.find(g => g.gate === 'OR');
  // Wire from AND's output should land on OR's in0 (wire `t`).
  const between = c.wires.find(w => w.sourceId === and_.id && w.targetId === or_.id);
  check('AND output wired to OR input', !!between && between.targetInputIndex === 0);
}

console.log('toCircuit — register inference (multi-bit, no reset)');
{
  // Multi-bit signal so the inferer picks REGISTER (not FLIPFLOP_D).
  const c = importVerilog(`module top(input clk, input [3:0] d, output [3:0] q);
    reg [3:0] q_reg;
    always @(posedge clk) q_reg <= d;
    assign q = q_reg;
  endmodule`);
  const reg = c.nodes.find(n => n.type === 'REGISTER');
  check('REGISTER node created',       !!reg);
  check('REGISTER label = q_reg',      reg?.label === 'q_reg');
  check('REGISTER bitWidth=4',         reg?.bitWidth === 4);
  // Wires: d → reg.in0, clk → reg.in3 (with isClockWire), reg → q (output)
  const wD   = c.wires.find(w => w.targetId === reg.id && w.targetInputIndex === 0);
  const wClk = c.wires.find(w => w.targetId === reg.id && w.targetInputIndex === 3);
  check('d wired to reg.DATA',         !!wD);
  check('clk wired to reg.CLK',        !!wClk && wClk.isClockWire === true);
}

console.log('toCircuit — register inference with async reset');
{
  const c = importVerilog(`module top(input clk, input rst, input d, output q);
    reg q_reg;
    always @(posedge clk or posedge rst) begin
      if (rst) q_reg <= 1'b0;
      else     q_reg <= d;
    end
    assign q = q_reg;
  endmodule`);
  const reg = c.nodes.find(n => n.type === 'REGISTER');
  check('REGISTER inferred from reset-form', !!reg);
  // CLR pin is index 2.
  const wRst = c.wires.find(w => w.targetId === reg.id && w.targetInputIndex === 2);
  check('rst wired to reg.CLR',        !!wRst);
}

console.log('toCircuit — submodule instantiation kept as SUB_CIRCUIT');
{
  const c = importVerilog(`module top(input a, output y);
    sub_inv inv(.a(a), .y(y));
  endmodule`);
  const sub = c.nodes.find(n => n.type === 'SUB_CIRCUIT');
  check('SUB_CIRCUIT placeholder',     !!sub);
  check('label preserved',             sub?.label === 'inv');
  check('IR sidecar attached',         !!sub?._verilog && sub._verilog.kind === 'module');
}

console.log('toCircuit — expression-tree lowering: XOR via assign');
{
  const c = importVerilog(`module top(input a, input b, output y);
    assign y = a ^ b;
  endmodule`);
  const xor = c.nodes.find(n => n.type === 'GATE_SLOT' && n.gate === 'XOR');
  check('XOR primitive recognised',    !!xor);
  // Wires: a → xor.in0, b → xor.in1, xor → y
  const a = c.nodes.find(n => n.label === 'a');
  const b = c.nodes.find(n => n.label === 'b');
  const y = c.nodes.find(n => n.label === 'y');
  check('a wired to xor.in0',  c.wires.some(w => w.sourceId === a.id && w.targetId === xor.id && w.targetInputIndex === 0));
  check('b wired to xor.in1',  c.wires.some(w => w.sourceId === b.id && w.targetId === xor.id && w.targetInputIndex === 1));
  check('xor → y output',      c.wires.some(w => w.sourceId === xor.id && w.targetId === y.id));
}

console.log('toCircuit — expression-tree lowering: nested (a&b)|c');
{
  const c = importVerilog(`module top(input a, input b, input c, output y);
    assign y = (a & b) | c;
  endmodule`);
  const and_ = c.nodes.find(n => n.type === 'GATE_SLOT' && n.gate === 'AND');
  const or_  = c.nodes.find(n => n.type === 'GATE_SLOT' && n.gate === 'OR');
  check('inner AND created',           !!and_);
  check('outer OR created',            !!or_);
  check('AND output → OR input',
    c.wires.some(w => w.sourceId === and_.id && w.targetId === or_.id));
}

console.log('toCircuit — Ternary lowers to MUX');
{
  const c = importVerilog(`module top(input sel, input d0, input d1, output y);
    assign y = sel ? d1 : d0;
  endmodule`);
  const mux = c.nodes.find(n => n.type === 'MUX');
  check('Ternary → MUX',               !!mux);
  check('MUX has inputCount=2',        mux?.inputCount === 2);
  // Pin layout: D0(0), D1(1), SEL(2)
  const d0 = c.nodes.find(n => n.label === 'd0');
  const d1 = c.nodes.find(n => n.label === 'd1');
  const sel = c.nodes.find(n => n.label === 'sel');
  check('D0 wired to MUX.0',           c.wires.some(w => w.sourceId === d0.id && w.targetId === mux.id && w.targetInputIndex === 0));
  check('D1 wired to MUX.1',           c.wires.some(w => w.sourceId === d1.id && w.targetId === mux.id && w.targetInputIndex === 1));
  check('SEL wired to MUX.2',          c.wires.some(w => w.sourceId === sel.id && w.targetId === mux.id && w.targetInputIndex === 2));
}

console.log('toCircuit — case statement → MUX');
{
  const c = importVerilog(`module top(input [1:0] sel, input a, input b, input c, input d, output reg y);
    always @(*) begin
      case (sel)
        2'h0: y = a;
        2'h1: y = b;
        2'h2: y = c;
        2'h3: y = d;
      endcase
    end
  endmodule`);
  const mux = c.nodes.find(n => n.type === 'MUX');
  check('case → MUX',                  !!mux);
  check('MUX inputCount = 4',          mux?.inputCount === 4);
}

console.log('toCircuit — 1-bit register infers as FLIPFLOP_D');
{
  const c = importVerilog(`module top(input clk, input d, output q);
    reg q_ff;
    always @(posedge clk) q_ff <= d;
    assign q = q_ff;
  endmodule`);
  const ff = c.nodes.find(n => n.type === 'FLIPFLOP_D');
  check('1-bit single-NBA → FLIPFLOP_D', !!ff);
  check('multi-bit not promoted',
    !c.nodes.some(n => n.type === 'REGISTER'));
}
{
  const c = importVerilog(`module top(input clk, input [7:0] d, output [7:0] q);
    reg [7:0] q_reg;
    always @(posedge clk) q_reg <= d;
    assign q = q_reg;
  endmodule`);
  check('multi-bit → REGISTER, not FLIPFLOP_D',
    c.nodes.some(n => n.type === 'REGISTER' && n.bitWidth === 8)
    && !c.nodes.some(n => n.type === 'FLIPFLOP_D'));
}

console.log('toCircuit — IRMemory → ROM (no writes) / RAM (with writes)');
{
  const c = importVerilog(`module top(input [3:0] addr, output reg [7:0] dout);
    reg [7:0] mem [0:15];
    always @(*) dout = mem[addr];
  endmodule`);
  const rom = c.nodes.find(n => n.type === 'ROM');
  check('memory with no writes → ROM', !!rom);
  check('ROM dataBits = 8 / addrBits = 4',
    rom?.dataBits === 8 && rom?.addrBits === 4);
}
{
  const c = importVerilog(`module top(input clk, input we, input [3:0] addr, input [7:0] din, output reg [7:0] dout);
    reg [7:0] mem [0:15];
    always @(posedge clk) if (we) mem[addr] <= din;
    always @(*) dout = mem[addr];
  endmodule`);
  const ram = c.nodes.find(n => n.type === 'RAM');
  check('memory with sync writes → RAM', !!ram);
  check('RAM dataBits = 8 / addrBits = 4',
    ram?.dataBits === 8 && ram?.addrBits === 4);
}

if (failed > 0) {
  console.log(`\n${failed} toCircuit test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll toCircuit checks passed.');
}
