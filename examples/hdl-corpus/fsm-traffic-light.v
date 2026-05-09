// 3-state FSM — a simplified traffic-light controller.
//
// Exercises:
//   • Two always blocks in one module (state register + next-state
//     comb).
//   • `case` on a state register with mutually-exclusive arms — the
//     canonical pattern for MUX inference in Phase 10.
//   • `localparam` for state encoding.
//   • Separate output decode (Moore-style — outputs depend only on
//     state, not on inputs).

module fsm_traffic (
  input  wire       clk,
  input  wire       rst_n,
  input  wire       sensor,
  output reg        red,
  output reg        yellow,
  output reg        green
);

  localparam S_RED    = 2'h0;
  localparam S_GREEN  = 2'h1;
  localparam S_YELLOW = 2'h2;

  reg [1:0] state, next_state;

  // State register.
  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) state <= S_RED;
    else        state <= next_state;
  end

  // Next-state combinational.
  always @(*) begin
    case (state)
      S_RED:    next_state = sensor ? S_GREEN  : S_RED;
      S_GREEN:  next_state = sensor ? S_YELLOW : S_GREEN;
      S_YELLOW: next_state = S_RED;
      default:  next_state = S_RED;
    endcase
  end

  // Output decode (Moore).
  always @(*) begin
    red    = (state == S_RED);
    yellow = (state == S_YELLOW);
    green  = (state == S_GREEN);
  end

endmodule
