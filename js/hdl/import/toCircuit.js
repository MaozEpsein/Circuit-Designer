// Phase 10 — IR → circuitJSON & component inference.
//
// Takes an IRModule (produced by Phase 9 elaborate, or fromCircuit
// itself) and returns a circuit.json the canvas can render. The
// inference passes recognise the patterns the exporter emits and
// rebuild the matching palette nodes; anything outside the recognised
// set is preserved as a `VERILOG_BLOCK` node that holds the original
// IR fragment so round-trip stays loss-less.
//
// Coordinates: this pass does NOT lay things out. Every node ships at
// (0,0); Phase 11's auto-layout assigns x/y.
//
// Inference passes (in order):
//   1. Ports             — INPUT / OUTPUT / CLOCK
//   2. Memories          — IR.memories[] → RAM or ROM (driver-by-write)
//   3. Primitive instances → GATE_SLOT
//   4. Submodules        → SUB_CIRCUIT placeholder
//   5. Continuous assigns — ranges from trivial-rename to
//      expression-tree lowering (BinaryOp → GATE_SLOT chain, Ternary
//      → MUX) with VERILOG_BLOCK fallback for shapes outside the
//      recognised palette (arithmetic, slice, concat).
//   6. Always blocks     — single-NBA → FLIPFLOP_D (1-bit) or REGISTER
//      (multi-bit) with optional async reset; always @(*) + case →
//      MUX; multi-NBA → AlwaysBlock placeholder.
//   7. Wire reconstruction — drivers register first, consumers second.

import { IR_KIND, PORT_DIR } from '../ir/types.js';

// Map Verilog primitive type → engine GATE_SLOT.gate value.
const PRIM_TO_GATE = {
  and: 'AND', or: 'OR', xor: 'XOR',
  nand: 'NAND', nor: 'NOR', xnor: 'XNOR',
  not: 'NOT',  buf: 'BUF',
};

// Binary IR operators that map to a GATE_SLOT kind.
const BINOP_TO_GATE = {
  '&':  'AND', '|':  'OR',  '^':  'XOR',
  '~&': 'NAND', '~|': 'NOR', '~^': 'XNOR', '^~': 'XNOR',
};

let _idSeq = 0;
function _newId(prefix = 'n') { return `${prefix}_${++_idSeq}`; }
function _resetIds()           { _idSeq = 0; }

/**
 * Convert an IRModule to a circuit.json scene. Returns
 * `{ nodes, wires, _import: { unmappedKinds, droppedAssigns } }`.
 */
export function toCircuit(ir, opts = {}) {
  if (!ir || ir.kind !== IR_KIND.Module) {
    throw new Error('toCircuit() expects an IRModule');
  }
  _resetIds();
  const nodes = [];
  const wires = [];
  const driverByNet = new Map();   // netName → { nodeId, outIdx }
  const unmappedKinds = new Set();
  let droppedAssigns = 0;

  // ── 1. Ports → INPUT / OUTPUT / CLOCK ─────────────────────
  for (const p of (ir.ports || [])) {
    const isClock = /^(clk|clock|tck)\b/i.test(p.name);
    const type = p.dir === PORT_DIR.OUTPUT ? 'OUTPUT'
              : isClock ? 'CLOCK'
              : 'INPUT';
    const id = _newId('port');
    const node = {
      id, type, label: p.name,
      x: 0, y: 0,
      ...(p.width > 1 ? { bitWidth: p.width } : {}),
    };
    if (type === 'INPUT')  node.fixedValue = 0;
    if (type === 'OUTPUT') { node.targetValue = 0; node.sandbox = true; }
    if (type === 'CLOCK')  node.value = 0;
    nodes.push(node);
    if (type === 'INPUT' || type === 'CLOCK') {
      driverByNet.set(p.name, { nodeId: id, outIdx: 0 });
    }
  }

  // ── 2. Memories → RAM / ROM ───────────────────────────────
  // A memory is a RAM if any always block writes to its index
  // (`mem[addr] <= data`); otherwise ROM. Address + data widths come
  // straight from the IR memory record.
  const memoryNodes = new Map();   // memName → nodeId
  for (const m of (ir.memories || [])) {
    const writes = _findMemoryWrites(ir, m.instanceName);
    const isRam  = writes.length > 0;
    const id = _newId(isRam ? 'ram' : 'rom');
    const addrBits = Math.max(1, Math.ceil(Math.log2(m.depth || 1)));
    nodes.push({
      id, type: isRam ? 'RAM' : 'ROM',
      label: m.instanceName,
      x: 0, y: 0,
      dataBits: m.width, addrBits,
      asyncRead: true,
    });
    memoryNodes.set(m.instanceName, id);
  }

  // ── 3. Primitive instances → GATE_SLOT ────────────────────
  // Two phases: register driver first, then collect input wires once
  // every other pass has had a chance to publish its drivers too.
  const gatesPending = [];
  for (const inst of (ir.instances || [])) {
    const gate = PRIM_TO_GATE[inst.type];
    if (gate && inst.isPrimitive) {
      const id = _newId('g');
      nodes.push({ id, type: 'GATE_SLOT', gate, label: inst.instanceName, x: 0, y: 0 });
      const yExpr = inst.portMap?.Y;
      if (yExpr?.kind === IR_KIND.Ref) {
        driverByNet.set(yExpr.netName, { nodeId: id, outIdx: 0 });
      }
      gatesPending.push({ inst, id });
      continue;
    }
    if (inst.isPrimitive) {
      unmappedKinds.add(inst.type);
      const id = _newId('vb');
      nodes.push({ id, type: 'VERILOG_BLOCK',
        label: inst.instanceName || inst.type,
        x: 0, y: 0,
        _verilog: { kind: 'primitive', type: inst.type, portMap: inst.portMap || {} } });
      continue;
    }
    // ── 4. Submodule instantiation → SUB_CIRCUIT placeholder ─
    const id = _newId('sub');
    nodes.push({ id, type: 'SUB_CIRCUIT',
      label: inst.instanceName || inst.type,
      x: 0, y: 0,
      _verilog: { kind: 'module', type: inst.type, portMap: inst.portMap || {}, params: inst.params || {} } });
    // Register each port-MAP entry that returns through an output net
    // as a driver, so downstream consumers can wire to the submodule.
    for (const [k, e] of Object.entries(inst.portMap || {})) {
      if (e?.kind === IR_KIND.Ref) {
        // We don't know which side is in vs. out without a port-decl
        // table; the conservative choice is to skip — the submodule's
        // ports get reconstructed once Phase-10b lowers nested IR.
        void k;
      }
    }
  }

  // ── 5. Continuous assigns ─────────────────────────────────
  // Pre-pass: collect LHS → assign so wired-up consumers can resolve
  // through any aliasing. Then process bottom-up.
  for (const a of (ir.assigns || [])) {
    if (!a.lhs || a.lhs.kind !== IR_KIND.Ref) { droppedAssigns++; continue; }
    const lhsName = a.lhs.netName;
    const rhs = a.rhs;
    // 5a. Trivial rename: assign y = a;
    if (rhs?.kind === IR_KIND.Ref) {
      const src = driverByNet.get(rhs.netName);
      if (src) {
        if (!driverByNet.has(lhsName)) driverByNet.set(lhsName, src);
        continue;
      }
    }
    // 5b. Expression-tree lowering. Recurse the RHS, materialising
    // GATE_SLOT / MUX nodes as needed; any sub-expression we don't
    // recognise falls back to a VERILOG_BLOCK whose IR is preserved.
    const driver = _lowerExpression(rhs, { nodes, wires, driverByNet, lhsHint: lhsName });
    if (driver) {
      driverByNet.set(lhsName, driver);
    } else {
      // Total fallback — unknown shape entirely.
      const id = _newId('expr');
      nodes.push({ id, type: 'VERILOG_BLOCK', label: lhsName,
        x: 0, y: 0,
        _verilog: { kind: 'assign', lhs: a.lhs, rhs } });
      driverByNet.set(lhsName, { nodeId: id, outIdx: 0 });
    }
  }

  // ── 6. Always blocks → FLIPFLOP_D / REGISTER / MUX ────────
  for (const blk of (ir.alwaysBlocks || [])) {
    if (blk.sensitivity?.initial) continue;
    const trigger = blk.sensitivity?.triggers?.find(t => t.edge === 'posedge');
    if (trigger) {
      const inferred = _inferRegister(blk, trigger);
      if (inferred) {
        // 1-bit → FLIPFLOP_D, multi-bit → REGISTER. Both share the
        // same DATA/EN/CLR/CLK pin layout (engine-side wiring works
        // for both kinds via _memoryInputLabel).
        const isFF = (inferred.width || 1) === 1 && !inferred.rstName;
        const id = _newId(isFF ? 'ff' : 'reg');
        const type = isFF ? 'FLIPFLOP_D' : 'REGISTER';
        nodes.push({ id, type,
          label: inferred.qName,
          x: 0, y: 0,
          ...(isFF ? { initialQ: 0 } : { bitWidth: inferred.width, initialQ: 0 }) });
        driverByNet.set(inferred.qName, { nodeId: id, outIdx: 0 });
        if (inferred.dExpr?.kind === IR_KIND.Ref) {
          _wireConsumer(wires, driverByNet, inferred.dExpr.netName, id, 0);
        } else if (inferred.dExpr) {
          // Lower the RHS first so the FF sees a single named driver.
          const drv = _lowerExpression(inferred.dExpr, { nodes, wires, driverByNet });
          if (drv) wires.push({
            id: _newId('w'),
            sourceId: drv.nodeId,
            targetId: id,
            targetInputIndex: 0,
            ...(drv.outIdx > 0 ? { sourceOutputIndex: drv.outIdx } : {}),
          });
        }
        if (inferred.rstName) {
          _wireConsumer(wires, driverByNet, inferred.rstName, id, isFF ? 1 : 2);
        }
        _wireConsumer(wires, driverByNet, trigger.signal, id, isFF ? 2 : 3, true);
        continue;
      }
      // Multi-NBA / unrecognised sequential — placeholder.
      const id = _newId('alwaysq');
      nodes.push({ id, type: 'VERILOG_BLOCK', label: 'always_seq',
        x: 0, y: 0, _verilog: { kind: 'alwaysSeq', block: blk } });
      continue;
    }
    // Combinational always @(*).
    if (blk.sensitivity?.star) {
      const muxNode = _inferMuxFromCase(blk, { nodes, wires, driverByNet });
      if (muxNode) continue;
      // Fallthrough placeholder.
      const id = _newId('alwaysc');
      nodes.push({ id, type: 'VERILOG_BLOCK', label: 'always_comb',
        x: 0, y: 0, _verilog: { kind: 'alwaysComb', block: blk } });
    }
  }

  // ── 7. Wire up primitive-instance inputs and submodule ports ──
  for (const { inst, id } of gatesPending) {
    const order = inst.portOrder || ['Y', 'A', 'B'];
    let pinIdx = 0;
    for (const portName of order) {
      if (portName === 'Y') continue;
      const expr = inst.portMap?.[portName];
      if (expr?.kind === IR_KIND.Ref) {
        _wireConsumer(wires, driverByNet, expr.netName, id, pinIdx);
      }
      pinIdx++;
    }
  }

  // OUTPUT ports — drive each from its named net.
  for (const node of nodes) {
    if (node.type !== 'OUTPUT') continue;
    _wireConsumer(wires, driverByNet, node.label, node.id, 0);
  }

  return {
    nodes, wires,
    _import: {
      unmappedKinds: [...unmappedKinds],
      droppedAssigns,
    },
  };
}

// ── Expression-tree lowering ────────────────────────────────
// Recursively materialises an IR expression as a chain of palette
// components, returning the final driver `{ nodeId, outIdx }`. Returns
// null when the shape isn't reducible to known palette nodes (caller
// then emits a VERILOG_BLOCK).
function _lowerExpression(expr, ctx) {
  if (!expr) return null;
  const { nodes, wires, driverByNet } = ctx;
  switch (expr.kind) {
    case IR_KIND.Ref: {
      return driverByNet.get(expr.netName) || null;
    }
    case IR_KIND.Literal: {
      // Constants land as a fixed INPUT. Keeps the canvas wireable.
      const id = _newId('konst');
      nodes.push({ id, type: 'INPUT',
        label: typeof expr.value === 'number' ? `c${expr.value}` : 'c0',
        fixedValue: typeof expr.value === 'number' ? (expr.value & 0xff) : 0,
        x: 0, y: 0,
        ...((expr.width || 1) > 1 ? { bitWidth: expr.width } : {}) });
      return { nodeId: id, outIdx: 0 };
    }
    case IR_KIND.UnaryOp: {
      if (expr.op === '~' || expr.op === '!') {
        const inner = _lowerExpression(expr.operand, ctx);
        if (!inner) return null;
        const id = _newId('g');
        nodes.push({ id, type: 'GATE_SLOT', gate: 'NOT', label: 'not', x: 0, y: 0 });
        wires.push({ id: _newId('w'),
          sourceId: inner.nodeId, targetId: id, targetInputIndex: 0,
          ...(inner.outIdx > 0 ? { sourceOutputIndex: inner.outIdx } : {}) });
        return { nodeId: id, outIdx: 0 };
      }
      return null;
    }
    case IR_KIND.BinaryOp: {
      const gate = BINOP_TO_GATE[expr.op];
      if (!gate) return null;            // arithmetic etc — not a Phase-10 target
      const left  = _lowerExpression(expr.left,  ctx);
      const right = _lowerExpression(expr.right, ctx);
      if (!left || !right) return null;
      const id = _newId('g');
      nodes.push({ id, type: 'GATE_SLOT', gate, label: gate.toLowerCase(), x: 0, y: 0 });
      wires.push({ id: _newId('w'),
        sourceId: left.nodeId,  targetId: id, targetInputIndex: 0,
        ...(left.outIdx > 0  ? { sourceOutputIndex: left.outIdx }  : {}) });
      wires.push({ id: _newId('w'),
        sourceId: right.nodeId, targetId: id, targetInputIndex: 1,
        ...(right.outIdx > 0 ? { sourceOutputIndex: right.outIdx } : {}) });
      return { nodeId: id, outIdx: 0 };
    }
    case IR_KIND.Ternary: {
      // ── Priority-MUX form: a chain of nested ternaries collapses to
      // an N-input MUX with a sel computed from the selectors. To keep
      // Phase 10 honest, we lower the simple 1-deep case here (2:1 MUX)
      // and let nested ternaries emit nested MUXes.
      const sel  = _lowerExpression(expr.cond, ctx);
      const in0  = _lowerExpression(expr.else, ctx);     // sel=0 picks else
      const in1  = _lowerExpression(expr.then, ctx);     // sel=1 picks then
      if (!sel || !in0 || !in1) return null;
      const id = _newId('mux');
      const w  = expr.width || expr.then?.width || 1;
      nodes.push({ id, type: 'MUX', label: 'mux', inputCount: 2,
        x: 0, y: 0, ...(w > 1 ? { bitWidth: w } : {}) });
      // MUX pin layout: D0(0), D1(1), SEL(2)
      wires.push({ id: _newId('w'), sourceId: in0.nodeId, targetId: id, targetInputIndex: 0,
        ...(in0.outIdx > 0 ? { sourceOutputIndex: in0.outIdx } : {}) });
      wires.push({ id: _newId('w'), sourceId: in1.nodeId, targetId: id, targetInputIndex: 1,
        ...(in1.outIdx > 0 ? { sourceOutputIndex: in1.outIdx } : {}) });
      wires.push({ id: _newId('w'), sourceId: sel.nodeId, targetId: id, targetInputIndex: 2,
        ...(sel.outIdx > 0 ? { sourceOutputIndex: sel.outIdx } : {}) });
      return { nodeId: id, outIdx: 0 };
    }
  }
  return null;
}

// ── Sequential pattern: REGISTER / FF ───────────────────────
function _inferRegister(blk, _posedgeTrigger) {
  const body = blk.body || [];
  if (body.length !== 1) return null;
  const top = body[0];
  if (top.kind === 'NonBlockingAssign') {
    if (top.lhs?.kind !== IR_KIND.Ref) return null;
    return {
      qName: top.lhs.netName,
      width: top.lhs.width || 1,
      dExpr: top.rhs,
      rstName: null,
    };
  }
  if (top.kind === 'IfStmt') {
    const cond = top.cond;
    const rstName = (cond?.kind === IR_KIND.Ref) ? cond.netName
                  : (cond?.kind === IR_KIND.UnaryOp && cond.op === '!'
                     && cond.operand?.kind === IR_KIND.Ref) ? cond.operand.netName
                  : null;
    if (!rstName) return null;
    const thenStmt = (top.then || [])[0];
    const elseStmt = (top.else || [])[0];
    if (thenStmt?.kind !== 'NonBlockingAssign' || elseStmt?.kind !== 'NonBlockingAssign') return null;
    if (thenStmt.lhs?.kind !== IR_KIND.Ref || elseStmt.lhs?.kind !== IR_KIND.Ref) return null;
    if (thenStmt.lhs.netName !== elseStmt.lhs.netName) return null;
    return {
      qName: thenStmt.lhs.netName,
      width: thenStmt.lhs.width || elseStmt.lhs.width || 1,
      dExpr: elseStmt.rhs,
      rstName,
    };
  }
  return null;
}

// ── Combinational pattern: case (sel) → MUX ─────────────────
function _inferMuxFromCase(blk, ctx) {
  const body = blk.body || [];
  // Allow either a bare CaseStmt or a Block containing one.
  let cs = body[0];
  if (cs?.kind === 'Block' && cs.stmts?.length === 1) cs = cs.stmts[0];
  if (cs?.kind !== 'CaseStmt') return null;
  // Every arm body must be exactly one BlockingAssign on the same LHS.
  const arms = cs.cases || [];
  if (arms.length < 2) return null;
  let outName = null;
  let outWidth = 1;
  const data = [];        // [{ idx, expr }] keyed by literal label value
  for (const arm of arms) {
    const stmt = arm.body?.[0];
    if (stmt?.kind !== 'BlockingAssign') return null;
    if (stmt.lhs?.kind !== IR_KIND.Ref) return null;
    if (outName === null) { outName = stmt.lhs.netName; outWidth = stmt.lhs.width || 1; }
    else if (outName !== stmt.lhs.netName) return null;
    if (arm.label?.kind !== IR_KIND.Literal) return null;
    data.push({ idx: arm.label.value | 0, expr: stmt.rhs });
  }
  if (outName === null) return null;
  // Build the MUX with `inputCount` = max(arm-index)+1.
  const inputCount = data.reduce((m, d) => Math.max(m, d.idx + 1), 0);
  const id = _newId('mux');
  ctx.nodes.push({ id, type: 'MUX', label: outName,
    x: 0, y: 0, inputCount,
    ...(outWidth > 1 ? { bitWidth: outWidth } : {}) });
  ctx.driverByNet.set(outName, { nodeId: id, outIdx: 0 });
  // Wire each arm's data into the matching MUX input.
  for (const d of data) {
    const drv = _lowerExpression(d.expr, ctx);
    if (!drv) continue;
    ctx.wires.push({ id: _newId('w'),
      sourceId: drv.nodeId, targetId: id, targetInputIndex: d.idx,
      ...(drv.outIdx > 0 ? { sourceOutputIndex: drv.outIdx } : {}) });
  }
  // Wire SEL — comes after the data pins.
  const sel = _lowerExpression(cs.selector, ctx);
  if (sel) {
    ctx.wires.push({ id: _newId('w'),
      sourceId: sel.nodeId, targetId: id, targetInputIndex: inputCount,
      ...(sel.outIdx > 0 ? { sourceOutputIndex: sel.outIdx } : {}) });
  }
  return { id };
}

// ── Memory write detection ──────────────────────────────────
// Walks every always block looking for `mem[addr] <= data` or
// `mem[addr] = data`. Returns the (possibly empty) list of writers.
function _findMemoryWrites(ir, memName) {
  const writers = [];
  function visitStmt(s) {
    if (!s) return;
    if (s.kind === 'NonBlockingAssign' || s.kind === 'BlockingAssign') {
      if (s.lhs?.kind === IR_KIND.Index && s.lhs.name === memName) writers.push(s);
    }
    if (s.kind === 'Block')   (s.stmts || []).forEach(visitStmt);
    if (s.kind === 'IfStmt') { (s.then || []).forEach(visitStmt); (s.else || []).forEach(visitStmt); }
    if (s.kind === 'CaseStmt') {
      for (const arm of (s.cases || [])) (arm.body || []).forEach(visitStmt);
      (s.default || []).forEach(visitStmt);
    }
  }
  for (const blk of (ir.alwaysBlocks || [])) {
    for (const s of (blk.body || [])) visitStmt(s);
  }
  return writers;
}

// Append a wire from `netName`'s driver to (targetId, targetInputIndex).
// No-op when the net has no known driver.
function _wireConsumer(wires, driverByNet, netName, targetId, targetInputIndex, isClockWire = false) {
  const src = driverByNet.get(netName);
  if (!src) return;
  wires.push({
    id: _newId('w'),
    sourceId: src.nodeId,
    targetId,
    targetInputIndex,
    ...(src.outIdx > 0 ? { sourceOutputIndex: src.outIdx } : {}),
    ...(isClockWire ? { isClockWire: true } : {}),
  });
}
