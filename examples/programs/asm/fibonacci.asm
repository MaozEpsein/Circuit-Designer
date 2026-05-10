; Fibonacci sequence (unrolled)
; Pre-load: R1=1, R2=1
; Computes: 1, 1, 2, 3, 5, 8, 13, 21
ADD R3, R1, R2
ADD R4, R2, R3
ADD R5, R3, R4
ADD R6, R4, R5
ADD R7, R5, R6
HALT
; R1=1, R2=1, R3=2, R4=3, R5=5, R6=8, R7=13
