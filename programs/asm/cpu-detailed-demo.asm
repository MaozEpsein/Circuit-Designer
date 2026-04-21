; Demo program for the detailed Harvard CPU (cpu-detailed.json)
; Exercises: ADDI (loads), ADD, SUB, SW (stores), LW (loads),
; BNE (conditional loop branch), HALT.
; 20 instructions. Addresses 0x00..0x13.
;
; High level:  sum = 1+2+3+4+5 while storing each partial sum to DMEM,
; then reload, combine via add/sub, and write final values back.
;
; NOTE (engine quirks vs. CIRCUIT_DETAILS.md):
;   * IR layout in the engine is [op:4 | rd:3 | rs1:3 | rs2:6].
;     For SW/LW we pick imm==rs2_reg so the same 6-bit field
;     names both the data register and the offset (see addr 6, 14, 18).
;   * Branch/jump target comes from IR.RD slot (3 bits → addr 0..7).
;   * ALU op 7 is CMP in the engine (stands in for SRA in the spec).
;
; --- Initialisation (R0 is hard-wired 0) --------------------------
ADDI R1, R0, 5     ; 00: R1 = 5   (loop limit N)
ADDI R4, R0, 1     ; 01: R4 = 1   (step)
ADDI R3, R0, 0     ; 02: R3 = 0   (counter i)
ADDI R2, R0, 0     ; 03: R2 = 0   (running sum)
; --- Main loop (branch target = 0x04) ----------------------------
ADD  R3, R3, R4    ; 04: i = i + 1
ADD  R2, R2, R3    ; 05: sum = sum + i
SW   R2, R3, 2     ; 06: DMEM[i+2] = sum          (rs2_reg==imm==2)
BNE  R3, R1, 4     ; 07: if i != N jump to 0x04   (absolute target)
; --- Post-loop: reload, combine, store back ----------------------
LW   R5, R0, 5     ; 08: R5 = DMEM[5]   = 6       (sum after iter 3)
LW   R6, R0, 7     ; 09: R6 = DMEM[7]   = 15      (final sum)
LW   R7, R0, 3     ; 0A: R7 = DMEM[3]   = 1       (sum after iter 1)
SUB  R5, R6, R7    ; 0B: R5 = 15 - 1    = 14
SUB  R5, R5, R4    ; 0C: R5 = 14 - 1    = 13
ADDI R6, R6, 3     ; 0D: R6 = 15 + 3    = 18
SW   R6, R0, 6     ; 0E: DMEM[6] = R6   = 18      (rs2_reg==imm==6)
LW   R7, R0, 6     ; 0F: R7 = DMEM[6]   = 18
SUB  R7, R7, R4    ; 10: R7 = 18 - 1    = 17
ADD  R5, R6, R7    ; 11: R5 = 18 + 17   = 35
SW   R5, R0, 5     ; 12: DMEM[5] = R5   = 35      (rs2_reg==imm==5)
HALT               ; 13: stop (CU.halt → disables cycle counter)
