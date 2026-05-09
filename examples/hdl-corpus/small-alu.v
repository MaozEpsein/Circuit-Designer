// 4-bit ALU — supports add, sub, and, or, xor, not, slt, eq.
//
// Exercises:
//   • Multi-arm `case` driving an output register.
//   • Mixed arithmetic + bitwise operations (the inferer keeps
//     bitwise as gates and falls through to expression-block for
//     arithmetic).
//   • One-bit Z (zero) flag computed from the result.

module small_alu (
  input  wire [3:0] a,
  input  wire [3:0] b,
  input  wire [2:0] op,        // 000=ADD, 001=SUB, 010=AND, 011=OR,
                               // 100=XOR, 101=NOT, 110=SLT, 111=EQ
  output reg  [3:0] y,
  output wire       z
);

  always @(*) begin
    case (op)
      3'h0: y = a + b;
      3'h1: y = a - b;
      3'h2: y = a & b;
      3'h3: y = a | b;
      3'h4: y = a ^ b;
      3'h5: y = ~a;
      3'h6: y = (a < b) ? 4'h1 : 4'h0;
      3'h7: y = (a == b) ? 4'h1 : 4'h0;
      default: y = 4'h0;
    endcase
  end

  assign z = (y == 4'h0);

endmodule
