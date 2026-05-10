; Demo program for cpu-detailed.json — spec-accurate encoding.
; Exercises: ADDI, ADD, SUB, SW, LW, BNE (PC-relative), HALT.
; 20 instructions. Bit layout follows CIRCUIT_DETAILS.md exactly:
;   R-type:   [15:12]=op  [11:9]=rd   [8:6]=rs1  [5:3]=rs2  [2:0]=0
;   I-type:   [15:12]=op  [11:9]=rd   [8:6]=rs1  [5:0]=imm6
;   LW:       [15:12]=op  [11:9]=rd   [8:6]=rs1  [5:0]=imm6
;   SW:       [15:12]=op  [11:9]=rs2  [8:6]=rs1  [5:0]=imm6
;   BEQ/BNE:  [15:12]=op  [11:9]=rs1  [8:6]=rs2  [5:0]=sign_ext(offset)
;   JMP:      [15:12]=op                         [5:0]=sign_ext(offset)
;   HALT:     [15:12]=0
;
; Branches are PC-relative: PC_next = PC + 1 + sign_ext(offset[5:0])
;
; --- Initialisation ----------------------------------------------
ADDI R1, R0, 5      ; 00: R1 = 5   (loop limit N)
ADDI R4, R0, 1      ; 01: R4 = 1   (step)
ADDI R3, R0, 0      ; 02: R3 = 0   (counter i)
ADDI R2, R0, 0      ; 03: R2 = 0   (running sum)
; --- Main loop (target for BNE offset -4) ------------------------
ADD  R3, R3, R4     ; 04: i = i + 1
ADD  R2, R2, R3     ; 05: sum = sum + i
SW   R2, R3, 0      ; 06: DMEM[R3 + 0] = R2  (writes sum to DMEM[i])
BNE  R3, R1, -4     ; 07: if R3 != R1 → PC = 7+1-4 = 4  (back to loop top)
; --- Post-loop: reload, combine, store back ----------------------
LW   R5, R1, 0      ; 08: R5 = DMEM[R1 + 0] = DMEM[5] = 15
LW   R6, R4, 0      ; 09: R6 = DMEM[R4 + 0] = DMEM[1] = 1
LW   R7, R0, 3      ; 0A: R7 = DMEM[0  + 3] = DMEM[3] = 6
SUB  R5, R5, R6     ; 0B: R5 = 15 - 1  = 14
SUB  R5, R5, R7     ; 0C: R5 = 14 - 6  = 8
SW   R5, R0, 6      ; 0D: DMEM[6] = 8
ADDI R6, R6, 7      ; 0E: R6 = 1 + 7   = 8
SW   R6, R0, 7      ; 0F: DMEM[7] = 8
LW   R7, R0, 6      ; 10: R7 = DMEM[6] = 8
SUB  R7, R7, R6     ; 11: R7 = 8 - 8   = 0 (verification)
ADD  R5, R6, R7     ; 12: R5 = 8 + 0   = 8
HALT                ; 13: stop (CU.halt disables Cycle Counter)
