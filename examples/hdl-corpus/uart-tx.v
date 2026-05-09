// 8-N-1 UART transmitter, oversample = 1.
//
// Exercises:
//   • 4-state FSM (IDLE → START → DATA → STOP).
//   • Bit-counter alongside the state register.
//   • Indexed bit-access into a buffer (data[bit_idx]).
//   • Synchronous reset.
//
// Simplified: no baud-rate divider — caller is expected to clock this
// at the UART bit rate.

module uart_tx (
  input  wire       clk,
  input  wire       rst,
  input  wire       start,        // pulse high to begin a frame
  input  wire [7:0] data_in,
  output reg        tx,
  output reg        busy
);

  localparam IDLE  = 2'h0;
  localparam START = 2'h1;
  localparam DATA  = 2'h2;
  localparam STOP  = 2'h3;

  reg [1:0] state;
  reg [2:0] bit_idx;
  reg [7:0] shift;

  always @(posedge clk) begin
    if (rst) begin
      state   <= IDLE;
      bit_idx <= 3'h0;
      shift   <= 8'h0;
      tx      <= 1'b1;
      busy    <= 1'b0;
    end else begin
      case (state)
        IDLE: begin
          tx   <= 1'b1;
          busy <= 1'b0;
          if (start) begin
            shift   <= data_in;
            state   <= START;
            bit_idx <= 3'h0;
            busy    <= 1'b1;
          end
        end
        START: begin
          tx    <= 1'b0;
          state <= DATA;
        end
        DATA: begin
          tx <= shift[bit_idx];
          if (bit_idx == 3'h7) begin
            state <= STOP;
          end else begin
            bit_idx <= bit_idx + 3'h1;
          end
        end
        STOP: begin
          tx    <= 1'b1;
          state <= IDLE;
          busy  <= 1'b0;
        end
      endcase
    end
  end

endmodule
