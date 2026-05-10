# Built-in CPU

A 16-bit pedagogical CPU exercised by the **Simple CPU — Countdown** example. The same datapath runs through a single-cycle reference design and a 5-stage pipelined variant; both share the ISA, assembler, ROM-editor, and high-level compilers documented below.

## Datapath (single-cycle reference)

```
CLK → PC → ROM → IR → CU → ALU ↔ Register File
                              ↕
                         RAM (Data Memory)
                              ↕
                         BUS_MUX (Write-Back)
```

`PC` advances each cycle (or jumps when CU asserts `JMP`). `ROM` provides instruction words; `IR` decodes the 16-bit instruction into `OP / RD / RS1 / RS2`. `CU` produces the per-cycle control vector (`ALU_OP, REG_WE, MEM_WE, MEM_RE, JMP, HALT`). The Register File supplies operands to the `ALU`; `BUS_MUX` selects between ALU result and `RAM` for write-back.

A 5-stage pipelined version with hazard detection, forwarding, and a Gantt analyzer is documented in [pipelining.md](pipelining.md).

## Instruction Format

Every instruction is exactly 16 bits, packed as four 4-bit fields:

```
 [15..12]   [11..8]   [7..4]   [3..0]
   OPCODE     RD       RS1      RS2/IMM
```

The fields are repurposed per opcode (RD becomes the address for `JMP`; RS1:RS2 form an 8-bit immediate for `LI`). See the ISA table below.

## Instruction Set (16 opcodes)

| Opcode | Mnemonic | Format | Encoding | Description |
|---|---|---|---|---|
| 0 | `ADD` | `RD, RS1, RS2` | `0 RD RS1 RS2` | RD ← RS1 + RS2 |
| 1 | `SUB` | `RD, RS1, RS2` | `1 RD RS1 RS2` | RD ← RS1 − RS2 |
| 2 | `AND` | `RD, RS1, RS2` | `2 RD RS1 RS2` | RD ← RS1 & RS2 |
| 3 | `OR`  | `RD, RS1, RS2` | `3 RD RS1 RS2` | RD ← RS1 \| RS2 |
| 4 | `XOR` | `RD, RS1, RS2` | `4 RD RS1 RS2` | RD ← RS1 ^ RS2 |
| 5 | `SHL` | `RD, RS1, RS2` | `5 RD RS1 RS2` | RD ← RS1 << RS2 |
| 6 | `SHR` | `RD, RS1, RS2` | `6 RD RS1 RS2` | RD ← RS1 >> RS2 |
| 7 | `CMP` | `RS1, RS2` | `7 0 RS1 RS2` | Set `Z` / `C` flags from `RS1 − RS2`; no register write |
| 8 | `LOAD` | `RD, RS2` | `8 RD 0 RS2` | RD ← `RAM[RS2]` |
| 9 | `STORE` | `RS1, RS2` | `9 0 RS1 RS2` | `RAM[RS2]` ← RS1 |
| 10 | `JMP` | `addr` | `A addr 0 0` | PC ← addr (4-bit absolute) |
| 11 | `BEQ` | `RS1, RS2, addr` | `B addr RS1 RS2` | Atomic `CMP RS1,RS2`; if `Z=1` then PC ← addr |
| 12 | `BNE` | `RS1, RS2, addr` | `C addr RS1 RS2` | Atomic `CMP RS1,RS2`; if `Z=0` then PC ← addr |
| 13 | `MOV` / `LI` | `RD, RS1` *or* `RD, IMM8` | `D RD RS1 RS2` *or* `D RD imm[7:4] imm[3:0]` | Register move *or* load-immediate (8-bit immediate; opcode is shared) |
| 14 | `NOP` | — | `E 0 0 0` | No-op |
| 15 | `HALT` | — | `F 0 0 0` | Stop execution |

**`BEQ` / `BNE` are atomic compare-and-branch** — the ALU performs `CMP RS1,RS2` and the CU consumes the freshly-computed `Z` flag in the same cycle. Encoding-wise they share `JMP`'s shape (address in the `RD` field) but `RS1` / `RS2` carry meaning instead of being don't-care.

**`MOV` / `LI`** share opcode `13`. The assembler picks the form by syntax: `MOV Rd, Rs` (register source) emits `ADD Rd, Rs, R0`; `MOV Rd, IMM` (numeric source) or the explicit `LI Rd, IMM` mnemonic emits the 8-bit immediate form.

## Assembler — `js/cpu/Assembler.js`

```js
import { assemble, disassemble, disassembleToC, decompileRomToC,
         getOpcodeNames, getOpcodeFormat } from 'js/cpu/Assembler.js';

assemble('ADD R2, R1, R0');     // → 0x0210
assemble('HALT');                // → 0xF000
assemble('JMP 5');               // → 0xA500
assemble('LI R3, 42');           // → 0xD32A
assemble('BEQ R1, R2, 8');       // → 0xB812

disassemble(0x0210);             // → 'ADD R2, R1, R0'
disassembleToC(0x0210);          // → 'R2 = R1 + R0'

// Whole-ROM utilities for the editor's "decompile to C" view.
decompileRomToC({0:0x0210,1:0xF000}, 16);
// → 'R2 = R1 + R0;\nhalt;'
```

- `assemble(line)` — one line of text → 16-bit instruction (number).
- `disassemble(instr)` — instruction → assembly mnemonic string.
- `disassembleToC(instr)` — instruction → C-like single-line statement (used in the ROM editor for an at-a-glance read).
- `decompileRomToC(memory, addrCount)` — whole-program disassembly to a C-style program string.
- `getOpcodeNames()` / `getOpcodeFormat(opName)` — introspection for tooling (palette pickers, the high-level compiler's emitter).

The assembler is forgiving: missing operands default to register 0, unknown mnemonics emit `0` (= `ADD R0,R0,R0` ≡ NOP-equivalent), and case is ignored. This is intentional for the visual ROM editor where users are still typing.

## ROM Editor

Double-click any `ROM` component on the canvas to open the editor. Two modes (toggled in the modal header):

- **HEX mode** — direct 16-bit hex per address. Useful for examining what an external tool produced.
- **Assembly mode** — one assembly line per address. Auto-uppercase while typing; the ROM round-trips through `assemble` / `disassemble` so editing in either mode is lossless.

**Quick Builder** sits beside the table — pick an opcode from the dropdown, fill the operand dropdowns, click `INSERT`. The matching assembly line is appended at the next free address. This is the fastest way to bootstrap a small program without memorising the operand order.

## High-Level Compilers

Two paths from higher-level source to ROM data, both ultimately routed through `Assembler.assemble`:

### `js/cpu/Compiler.js` — single-line C-like

A pragmatic line-oriented compiler for the canvas demos. Each input line becomes exactly one instruction. Supported syntax:

```c
R3 = R1 + R2;       // ADD R3, R1, R2     (also -, &, |, ^, <<, >>)
R3 = R1;             // MOV R3, R1
mem[R0] = R1;        // STORE R1, R0
R5 = mem[R2];        // LOAD R5, R2
compare(R1, R2);     // CMP R1, R2
if (R1 == R2) goto label;   // BEQ R1, R2, label  (atomic, 1 word)
if (R1 != R2) goto label;   // BNE R1, R2, label  (atomic, 1 word)
goto label;          // JMP label
halt;                // HALT
nop;                 // NOP
label:               // address marker (no instruction emitted)
// comment           // ignored
```

```js
import { compileToROM } from 'js/cpu/Compiler.js';
const { memory, errors, asm } = compileToROM(source);
```

Ordering operators (`<`, `>`, `<=`, `>=`) are explicitly rejected — the ISA only has equality compare-and-branch.

### `js/cpu/compiler/CCompiler.js` — full C-like (Lexer / Parser / CodeGenerator)

A genuine multi-pass compiler with a lexer, recursive-descent parser, and code generator. Keywords supported by the lexer: `int`, `void`, `if`, `else`, `while`, `for`, `return`, `break`, `continue`, `goto`, `halt`, `nop`. The output is the same `assemble`-ready assembly stream that `Compiler.js` produces, then run through `Assembler.assemble` to fill the ROM.

```js
import { compileC, compileCToROM } from 'js/cpu/compiler/CCompiler.js';
const { asm, errors } = compileC(source);
const { memory } = compileCToROM(source);
```

The full compiler is the path for the planned **High-level CPU programming** roadmap item — it understands control flow, scopes, and a function-style `int main() { ... }` skeleton. The simpler line-oriented `Compiler.js` covers the existing canvas demos with zero stack management.

## Known Issues

[js/cpu/KNOWN_ISSUES.md](../js/cpu/KNOWN_ISSUES.md) documents the open hardware-pipeline issues, currently:

- **Load-use forwarding with zero NOP spacing** in the 5-stage pipeline. The MEM/WB → ALU forwarding path drops the freshly-loaded value when a `LOAD` is immediately consumed by the next instruction. Workaround: insert one NOP after every `LOAD` whose result feeds the very next instruction (this matches MIPS-I's classical load-delay-slot contract). The HDU detects the hazard and stalls, but the bypass falls through one cycle later — root cause is in the Phase-2b timing of `pipe_memwb`. The proposed fix (Option A: intra-phase fanout in P2b) is documented in the file.

The single-cycle reference design and the pipeline analyzer/Gantt tooling are unaffected.
