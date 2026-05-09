// Phase 12 sidecar — demonstrates Fidelity Mode round-trip.
//
// This file uses comments + Verilog attributes + parameters that the
// IR pretty-printer would normally drop. Importing this file and
// re-exporting in FIDELITY mode produces byte-identical output.
// Importing and re-exporting in CANONICAL mode strips the comments
// and emits clean structural Verilog from the IR.
//
// Try it:
//   1. Drag this file onto the canvas (or click IMPORT .V).
//   2. The modal shows the import report ("3 modules, 2 gates, ...").
//   3. Pick FIDELITY mode in the dropdown to see verbatim re-emission.

(* fpga_top *)
module sample_alu (
  input  wire        clk,
  input  wire        rst_n,
  input  wire [3:0]  a,
  input  wire [3:0]  b,
  input  wire        op,        // 0 = add, 1 = sub
  output reg  [3:0]  result
);

  parameter WIDTH = 4;

  // Internal sum / diff. The (* keep *) attribute hints the synth
  // tool not to optimise these away even though they're not directly
  // exposed as ports.
  (* keep *) wire [WIDTH-1:0] sum;
  (* keep *) wire [WIDTH-1:0] diff;

  assign sum  = a + b;
  assign diff = a - b;

  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      result <= {WIDTH{1'b0}};
    end else begin
      // Pick the right side based on `op`.
      result <= op ? diff : sum;
    end
  end

  initial begin
    $display("sample_alu reset to 0");
  end

endmodule
