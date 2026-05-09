// Phase 8 sidecar — a hand-written 2:1 MUX in the dialect the parser
// must round-trip. Exercises:
//   • port list with mixed widths           — input wire + output reg
//   • a parameter declaration                — parameter WIDTH = 4
//   • Verilog (* attribute *) blocks         — (* keep *) before the
//                                              register
//   • a continuous assign with bit-select    — assign sel_b = sel[0]
//   • an always @(*) comb block + case       — selects between d0/d1
//   • a non-blocking always with reset       — clocked register update
//   • $display in initial                    — system-task statement
//
// Drop this file's text into the parser at runtime to confirm the
// importer survives every construct above.

module mux2 (
  input  wire        clk,
  input  wire        rst,
  input  wire        sel,
  input  wire [3:0]  d0,
  input  wire [3:0]  d1,
  output reg  [3:0]  q
);

  parameter WIDTH = 4;

  (* keep *) reg [WIDTH-1:0] inner;

  wire sel_b;
  assign sel_b = sel;

  always @(*) begin
    case (sel_b)
      1'b0: inner = d0;
      1'b1: inner = d1;
      default: inner = 4'h0;
    endcase
  end

  always @(posedge clk or posedge rst) begin
    if (rst) begin
      q <= 4'h0;
    end else begin
      q <= inner;
    end
  end

  initial begin
    $display("mux2 module initialised");
  end

endmodule
