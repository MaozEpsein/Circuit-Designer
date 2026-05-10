; Copy registers: move values between registers
; Pre-load: R1=42
MOV R2, R1
MOV R3, R2
MOV R4, R3
MOV R5, R4
MOV R6, R5
MOV R7, R6
HALT
; All registers R1-R7 should contain 42
