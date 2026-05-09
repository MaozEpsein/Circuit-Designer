// 4-bit BCD counter — counts 0…9 then rolls over to 0.
//
// Exercises:
//   • Sequential always block with synchronous reset.
//   • A `case`-style if/else for the rollover decision.
//   • An always @(*) for the comb-only `is_nine` flag.
//
// One of the smallest non-trivial designs that touches Phase 4
// (registers), Phase 3 (combinational), and the inferer's case-→-MUX
// pattern in Phase 10.

module bcd_counter (
  input  wire       clk,
  input  wire       rst,
  input  wire       en,
  output reg  [3:0] count,
  output wire       is_nine
);

  always @(posedge clk) begin
    if (rst)        count <= 4'h0;
    else if (en) begin
      if (count == 4'h9) count <= 4'h0;
      else                count <= count + 4'h1;
    end
  end

  assign is_nine = (count == 4'h9);

endmodule
