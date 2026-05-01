/**
 * CodeGenerator — Compiles AST to assembly for Circuit Designer CPU.
 * Handles register allocation, control flow, memory access, and functions.
 */
import { NT } from './Parser.js';

export class CodeGenerator {
  constructor() {
    this.asm = [];          // output assembly lines
    this.errors = [];
    this.vars = {};         // variable name → register number
    this.nextReg = 1;       // R0 is always 0
    this.tempRegs = [];     // available temp registers
    this.labelCount = 0;
    this.functions = {};    // function name → { label, params }
    this.breakLabels = [];  // stack for break targets
    this.contLabels = [];   // stack for continue targets
  }

  _newLabel(prefix = 'L') {
    return `${prefix}_${this.labelCount++}`;
  }

  _allocReg(name) {
    if (name && this.vars[name] !== undefined) return this.vars[name];
    if (this.nextReg > 15) {
      const varInfo = name ? ` Variable "${name}" cannot be allocated.` : '';
      const usedVars = Object.keys(this.vars).join(', ');
      this.errors.push(`Out of registers (max 15 variables). ${varInfo} Already used: ${usedVars}`);
      return 0;
    }
    const reg = this.nextReg++;
    if (name) this.vars[name] = reg;
    return reg;
  }

  _allocTemp() {
    if (this.tempRegs.length > 0) return this.tempRegs.pop();
    return this._allocReg(null);
  }

  _freeTemp(reg) {
    // Only free if it's not a named variable
    const isNamed = Object.values(this.vars).includes(reg);
    if (!isNamed && reg > 0) this.tempRegs.push(reg);
  }

  _getVarReg(name) {
    if (this.vars[name] !== undefined) return this.vars[name];
    this.errors.push(`Undefined variable: "${name}"`);
    return 0;
  }

  _emit(line) {
    this.asm.push(line);
  }

  _emitLabel(label) {
    // Labels are resolved as address = current asm line count
    this._emit(`__LABEL_${label}__:`);
  }

  /**
   * Generate assembly from AST.
   * @param {ASTNode} ast - Program node
   * @returns {{ asm: string[], errors: string[] }}
   */
  generate(ast) {
    this.asm = [];
    this.errors = [];
    this.vars = {};
    this.nextReg = 1;
    this.tempRegs = [];
    this.labelCount = 0;
    this.functions = {};
    this.breakLabels = [];
    this.contLabels = [];

    // First pass: collect function declarations
    for (const stmt of ast.body) {
      if (stmt.type === NT.FUNC_DECL) {
        this.functions[stmt.name] = { label: this._newLabel('func_' + stmt.name), params: stmt.params };
      }
    }

    // Generate code for top-level statements (skip functions)
    for (const stmt of ast.body) {
      if (stmt.type !== NT.FUNC_DECL) {
        this._genStmt(stmt);
      }
    }

    // Generate function bodies
    for (const stmt of ast.body) {
      if (stmt.type === NT.FUNC_DECL) {
        this._genFuncDecl(stmt);
      }
    }

    // Resolve labels
    return this._resolveLabels();
  }

  _resolveLabels() {
    // Find label positions
    const labelPositions = {};
    const cleanAsm = [];
    for (const line of this.asm) {
      const labelMatch = line.match(/^__LABEL_(.+?)__:$/);
      if (labelMatch) {
        labelPositions[labelMatch[1]] = cleanAsm.length;
      } else {
        cleanAsm.push(line);
      }
    }

    // Replace label references
    const finalAsm = cleanAsm.map(line => {
      return line.replace(/__LABEL_(.+?)__/g, (_, name) => {
        const addr = labelPositions[name];
        if (addr === undefined) {
          this.errors.push(`Undefined label: "${name}"`);
          return '0';
        }
        return addr.toString();
      });
    });

    return { asm: finalAsm, errors: this.errors };
  }

  // ── Statement Generation ─────────────────────────────────

  _genStmt(node) {
    switch (node.type) {
      case NT.VAR_DECL: return this._genVarDecl(node);
      case NT.ASSIGN: return this._genAssign(node);
      case NT.COMPOUND_ASSIGN: return this._genCompoundAssign(node);
      case NT.IF: return this._genIf(node);
      case NT.WHILE: return this._genWhile(node);
      case NT.FOR: return this._genFor(node);
      case NT.BLOCK: return this._genBlock(node);
      case NT.RETURN: return this._genReturn(node);
      case NT.GOTO: this._emit(`JMP __LABEL_${node.label}__`); return;
      case NT.LABEL: this._emitLabel(node.name); return;
      case NT.HALT: this._emit('HALT'); return;
      case NT.NOP: this._emit('NOP'); return;
      case NT.BREAK:
        if (this.breakLabels.length === 0) { this.errors.push('break outside loop'); return; }
        this._emit(`JMP __LABEL_${this.breakLabels[this.breakLabels.length - 1]}__`);
        return;
      case NT.CONTINUE:
        if (this.contLabels.length === 0) { this.errors.push('continue outside loop'); return; }
        this._emit(`JMP __LABEL_${this.contLabels[this.contLabels.length - 1]}__`);
        return;
      case NT.EXPR_STMT: return this._genExprStmt(node);
      default:
        this.errors.push(`Unknown statement type: ${node.type}`);
    }
  }

  _genVarDecl(node) {
    const reg = this._allocReg(node.name);
    if (node.init) {
      const valReg = this._genExpr(node.init);
      if (valReg !== reg) {
        this._emit(`ADD R${reg}, R${valReg}, R0`);
      }
      this._freeTemp(valReg);
    }
  }

  _genAssign(node) {
    if (node.target.type === NT.ARRAY_ACCESS) {
      // mem[expr] = value
      return this._genMemStore(node.target, node.value);
    }
    const targetReg = this._getVarReg(node.target.name);
    const valReg = this._genExpr(node.value);
    if (valReg !== targetReg) {
      this._emit(`ADD R${targetReg}, R${valReg}, R0`);
    }
    this._freeTemp(valReg);
  }

  _genCompoundAssign(node) {
    const targetReg = this._getVarReg(node.target.name);
    const valReg = this._genExpr(node.value);
    const opMap = { '+=': 'ADD', '-=': 'SUB', '&=': 'AND', '|=': 'OR', '^=': 'XOR', '<<=': 'SHL', '>>=': 'SHR' };
    const mnemonic = opMap[node.op];
    if (mnemonic) {
      this._emit(`${mnemonic} R${targetReg}, R${targetReg}, R${valReg}`);
    } else {
      this.errors.push(`Unsupported compound operator: ${node.op}`);
    }
    this._freeTemp(valReg);
  }

  _genIf(node) {
    const elseLabel = this._newLabel('else');
    const endLabel = this._newLabel('endif');

    this._genConditionJump(node.condition, elseLabel, true); // jump to else if false
    this._genStmt(node.then);
    if (node.else) {
      this._emit(`JMP __LABEL_${endLabel}__`);
    }
    this._emitLabel(elseLabel);
    if (node.else) {
      this._genStmt(node.else);
      this._emitLabel(endLabel);
    }
  }

  _genWhile(node) {
    const startLabel = this._newLabel('while');
    const endLabel = this._newLabel('endwhile');

    this.breakLabels.push(endLabel);
    this.contLabels.push(startLabel);

    this._emitLabel(startLabel);
    this._genConditionJump(node.condition, endLabel, true); // jump to end if false
    this._genStmt(node.body);
    this._emit(`JMP __LABEL_${startLabel}__`);
    this._emitLabel(endLabel);

    this.breakLabels.pop();
    this.contLabels.pop();
  }

  _genFor(node) {
    const startLabel = this._newLabel('for');
    const updateLabel = this._newLabel('forupd');
    const endLabel = this._newLabel('endfor');

    this.breakLabels.push(endLabel);
    this.contLabels.push(updateLabel);

    // Init
    if (node.init) this._genStmt(node.init);

    this._emitLabel(startLabel);

    // Condition
    if (node.condition) {
      this._genConditionJump(node.condition, endLabel, true);
    }

    // Body
    this._genStmt(node.body);

    // Update
    this._emitLabel(updateLabel);
    if (node.update) {
      const r = this._genExpr(node.update);
      this._freeTemp(r);
    }

    this._emit(`JMP __LABEL_${startLabel}__`);
    this._emitLabel(endLabel);

    this.breakLabels.pop();
    this.contLabels.pop();
  }

  _genBlock(node) {
    for (const stmt of node.body) {
      this._genStmt(stmt);
    }
  }

  _genReturn(node) {
    if (node.value) {
      const reg = this._genExpr(node.value);
      // Return value in R1 (convention)
      if (reg !== 1) this._emit(`ADD R1, R${reg}, R0`);
      this._freeTemp(reg);
    }
    // In a simple CPU, return just halts or jumps back
    // For now, we don't generate a RET instruction
  }

  _genExprStmt(node) {
    const reg = this._genExpr(node.expr);
    this._freeTemp(reg);
  }

  _genFuncDecl(node) {
    const func = this.functions[node.name];
    this._emitLabel(func.label);

    // Map parameters to registers
    const savedVars = { ...this.vars };
    for (let i = 0; i < node.params.length; i++) {
      // Parameters come in R1, R2, R3... (calling convention)
      this.vars[node.params[i]] = i + 1;
    }

    this._genBlock(node.body);
    this._emit('HALT'); // safety: if no return

    // Restore variable scope
    this.vars = savedVars;
  }

  // ── Condition Jump ───────────────────────────────────────

  _genConditionJump(expr, label, jumpIfFalse) {
    if (expr.type === NT.BINARY) {
      // Atomic compare-and-branch path. The ISA only supports equality
      // (BEQ) and inequality (BNE) — ordering operators were removed
      // when JC was repurposed for BNE (no atomic way to test the C flag).
      if (expr.op === '==' || expr.op === '!=') {
        const leftReg  = this._genExpr(expr.left);
        const rightReg = this._genExpr(expr.right);
        // BEQ branches when Rs1 == Rs2; BNE when Rs1 != Rs2.
        const takeWhenEqual = (expr.op === '==') ? !jumpIfFalse : jumpIfFalse;
        const mnemonic = takeWhenEqual ? 'BEQ' : 'BNE';
        this._emit(`${mnemonic} R${leftReg}, R${rightReg}, __LABEL_${label}__`);
        this._freeTemp(leftReg);
        this._freeTemp(rightReg);
        return;
      }
      if (['>', '<', '>=', '<='].includes(expr.op)) {
        this.errors.push(
          `Operator '${expr.op}' is not supported in this ISA — use '==' or '!=' (the CPU only has BEQ/BNE).`
        );
        return;
      }
    }

    // General case: evaluate to register, branch on (reg == R0).
    // BEQ reg,R0 fires when reg is zero (boolean false); BNE when non-zero.
    const reg = this._genExpr(expr);
    const mnemonic = jumpIfFalse ? 'BEQ' : 'BNE';
    this._emit(`${mnemonic} R${reg}, R0, __LABEL_${label}__`);
    this._freeTemp(reg);
  }

  // ── Expression Generation ────────────────────────────────
  // Returns the register number holding the result.

  _genExpr(node) {
    switch (node.type) {
      case NT.NUMBER: return this._genNumber(node);
      case NT.IDENT: return this._genIdent(node);
      case NT.BINARY: return this._genBinary(node);
      case NT.UNARY: return this._genUnary(node);
      case NT.ASSIGN: {
        this._genAssign(node);
        if (node.target.type === NT.ARRAY_ACCESS) return 0;
        return this._getVarReg(node.target.name);
      }
      case NT.COMPOUND_ASSIGN: { this._genCompoundAssign(node); return this._getVarReg(node.target.name); }
      case NT.INC_DEC: return this._genIncDec(node);
      case NT.ARRAY_ACCESS:
        if (node.array && node.array.name === 'mem') return this._genMemLoad(node);
        this.errors.push(`Array access only supported for "mem[]"`);
        return 0;
      case NT.FUNC_CALL: return this._genFuncCall(node);
      default:
        this.errors.push(`Cannot generate expression for: ${node.type}`);
        return 0;
    }
  }

  _genNumber(node) {
    if (node.value === 0) return 0; // R0 is always 0
    const reg = this._allocTemp();
    this._emit(`LI R${reg}, ${node.value & 0xFF}`);
    return reg;
  }

  _genIdent(node) {
    return this._getVarReg(node.name);
  }

  _genBinary(node) {
    const opMap = {
      '+': 'ADD', '-': 'SUB', '&': 'AND', '|': 'OR',
      '^': 'XOR', '<<': 'SHL', '>>': 'SHR',
    };

    const mnemonic = opMap[node.op];
    if (mnemonic) {
      const leftReg = this._genExpr(node.left);
      const rightReg = this._genExpr(node.right);
      const resultReg = this._allocTemp();
      this._emit(`${mnemonic} R${resultReg}, R${leftReg}, R${rightReg}`);
      this._freeTemp(leftReg);
      this._freeTemp(rightReg);
      return resultReg;
    }

    // Comparison operators → evaluate to 0 or 1
    if (['==', '!=', '>', '<', '>=', '<='].includes(node.op)) {
      const resultReg = this._allocTemp();
      const trueLabel = this._newLabel('true');
      const endLabel = this._newLabel('endcmp');

      this._emit(`ADD R${resultReg}, R0, R0`); // result = 0
      this._genConditionJump(node, trueLabel, false); // jump if true
      this._emit(`JMP __LABEL_${endLabel}__`);
      this._emitLabel(trueLabel);
      // result = 1 — need a way to set to 1
      this._emit(`LI R${resultReg}, 1`);
      this._emitLabel(endLabel);
      return resultReg;
    }

    // Logical operators
    if (node.op === '&&' || node.op === '||') {
      const leftReg = this._genExpr(node.left);
      const rightReg = this._genExpr(node.right);
      const resultReg = this._allocTemp();
      if (node.op === '&&') {
        this._emit(`AND R${resultReg}, R${leftReg}, R${rightReg}`);
      } else {
        this._emit(`OR R${resultReg}, R${leftReg}, R${rightReg}`);
      }
      this._freeTemp(leftReg);
      this._freeTemp(rightReg);
      return resultReg;
    }

    const unsupported = { '*': 'Multiplication', '/': 'Division', '%': 'Modulo' };
    if (unsupported[node.op]) {
      this.errors.push(`${unsupported[node.op]} (${node.op}) is not supported by the CPU's ALU. Consider using repeated addition/subtraction.`);
    } else {
      this.errors.push(`Unsupported operator: ${node.op}`);
    }
    return 0;
  }

  _genUnary(node) {
    const operandReg = this._genExpr(node.operand);
    const resultReg = this._allocTemp();
    if (node.op === '-') {
      this._emit(`SUB R${resultReg}, R0, R${operandReg}`); // 0 - operand
    } else if (node.op === '~') {
      // NOT: XOR with all 1s — need 0xFF constant
      this._emit(`LI R${resultReg}, 255`);
      this._emit(`XOR R${resultReg}, R${operandReg}, R${resultReg}`);
    } else if (node.op === '!') {
      // Logical NOT: if operand == 0, result = 1, else 0.
      // Atomic BEQ replaces the legacy CMP+JZ pair.
      const trueLabel = this._newLabel('not');
      const endLabel = this._newLabel('endnot');
      this._emit(`ADD R${resultReg}, R0, R0`);
      this._emit(`BEQ R${operandReg}, R0, __LABEL_${trueLabel}__`);
      this._emit(`JMP __LABEL_${endLabel}__`);
      this._emitLabel(trueLabel);
      this._emit(`LI R${resultReg}, 1`);
      this._emitLabel(endLabel);
    }
    this._freeTemp(operandReg);
    return resultReg;
  }

  _genIncDec(node) {
    const reg = this._getVarReg(node.operand.name);
    // Need a constant 1
    const oneReg = this._allocTemp();
    this._emit(`LI R${oneReg}, 1`);
    if (node.op === '++') {
      this._emit(`ADD R${reg}, R${reg}, R${oneReg}`);
    } else {
      this._emit(`SUB R${reg}, R${reg}, R${oneReg}`);
    }
    this._freeTemp(oneReg);
    return reg;
  }

  _genMemStore(target, value) {
    const addrReg = this._genExpr(target.index);
    const valReg = this._genExpr(value);
    this._emit(`STORE R${valReg}, R${addrReg}`);
    this._freeTemp(addrReg);
    this._freeTemp(valReg);
  }

  _genMemLoad(node) {
    // node is ARRAY_ACCESS { array: IDENT(mem), index: expr }
    const addrReg = this._genExpr(node.index);
    const resultReg = this._allocTemp();
    this._emit(`LOAD R${resultReg}, R${addrReg}`);
    if (addrReg !== 0) this._freeTemp(addrReg);
    return resultReg;
  }

  _genFuncCall(node) {
    const funcName = node.name.name;
    const func = this.functions[funcName];
    if (!func) {
      this.errors.push(`Undefined function: "${funcName}"`);
      return 0;
    }

    // Load arguments into R1, R2, ... (calling convention)
    for (let i = 0; i < node.args.length; i++) {
      const argReg = this._genExpr(node.args[i]);
      if (argReg !== i + 1) {
        this._emit(`ADD R${i + 1}, R${argReg}, R0`);
      }
      this._freeTemp(argReg);
    }

    this._emit(`JMP __LABEL_${func.label}__`);
    // Return value expected in R1
    return 1;
  }
}
