; Shift operations demo
; Pre-load: R1=1, R2=4
SHL R3, R1, R2
SHL R4, R3, R1
SHR R5, R4, R2
CMP R1, R5
HALT
; R3 = 1<<4 = 16
; R4 = 16<<1 = 32
; R5 = 32>>4 = 2
; CMP: R1(1) vs R5(2) → C=0, Z=0
