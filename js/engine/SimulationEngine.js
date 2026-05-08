/**
 * SimulationEngine — DAG-based evaluation engine.
 * Supports combinational gates and sequential flip-flops.
 * Migrated from engine.js — same logic, ES Module format.
 */
import { FF_TYPE_SET, MEMORY_TYPE_SET, parseSlices, sliceWidth } from '../components/Component.js';

// ── Combinational Gate Functions ──────────────────────────────
export const GATE_FN = {
  AND:    (a, b) => (a & b),
  OR:     (a, b) => (a | b),
  XOR:    (a, b) => (a ^ b),
  NAND:   (a, b) => ((a & b) ^ 1),
  NOR:    (a, b) => ((a | b) ^ 1),
  XNOR:   (a, b) => ((a ^ b) ^ 1),
  NOT:    (a)    => (a ^ 1),
  BUF:    (a)    => a,
  TRIBUF: (a, en) => (en === 1 ? a : null),  // null = high-Z
};

// ── Flip-Flop Next-State Functions ────────────────────────────
const FF_FN = {
  D: (args, q) => {
    const d = args[0];
    if (d === null || d === undefined) return { q, qNot: q ^ 1 };
    return { q: d, qNot: d ^ 1 };
  },
  SR: (args, q) => {
    const s = args[0], r = args[1];
    if (s === null || r === null) return { q, qNot: q ^ 1 };
    if (s && r)  return { q: 1, qNot: 0 };
    if (r)       return { q: 0, qNot: 1 };
    if (s)       return { q: 1, qNot: 0 };
    return { q, qNot: q ^ 1 };
  },
  JK: (args, q) => {
    const j = args[0], k = args[1];
    if (j === null || k === null) return { q, qNot: q ^ 1 };
    if (j && k)  return { q: q ^ 1, qNot: q };
    if (k)       return { q: 0, qNot: 1 };
    if (j)       return { q: 1, qNot: 0 };
    return { q, qNot: q ^ 1 };
  },
  T: (args, q) => {
    const t = args[0];
    if (t === null) return { q, qNot: q ^ 1 };
    return t ? { q: q ^ 1, qNot: q } : { q, qNot: q ^ 1 };
  },
};

// ── Latch Functions (level-sensitive, not edge-triggered) ────
// Latches update continuously while enable is HIGH (not just on edge)
export const LATCH_FN = {
  D_LATCH: (args, q) => {
    const d = args[0], en = args[1];
    if (en === null || d === null) return { q, qNot: q ^ 1 };
    if (en === 1) return { q: d, qNot: d ^ 1 };  // transparent when enabled
    return { q, qNot: q ^ 1 };                     // hold when disabled
  },
  SR_LATCH: (args, q) => {
    const s = args[0], r = args[1], en = args[2];
    if (en !== undefined && en !== null && en === 0) return { q, qNot: q ^ 1 }; // gated: hold
    if (s === null || r === null) return { q, qNot: q ^ 1 };
    if (s && r)  return { q: 1, qNot: 0 };
    if (r)       return { q: 0, qNot: 1 };
    if (s)       return { q: 1, qNot: 0 };
    return { q, qNot: q ^ 1 };
  },
};

const FF_TYPE_MAP = {
  FLIPFLOP_D: 'D', FLIPFLOP_SR: 'SR', FLIPFLOP_JK: 'JK', FLIPFLOP_T: 'T',
};

// ── Safe bit mask (handles bits >= 32) ─────────────────────
function _mask(bits) {
  if (bits >= 53) return Number.MAX_SAFE_INTEGER;
  if (bits >= 32) return Math.pow(2, bits) - 1;
  return (1 << bits) - 1;
}

// Resolve the associativity of a CACHE node. `direct` ⇒ 1 way (handled
// via ms.lines). `set-assoc` ⇒ node.ways (default 2). `fully-assoc` ⇒
// every line in one set. Legacy `set-assoc-2` is treated as ways=2.
function _cacheWays(node, lines) {
  const m = node.mapping;
  if (m === 'fully-assoc') return Math.max(2, lines | 0);
  if (m === 'set-assoc-2') return 2;
  if (m === 'set-assoc')   return Math.max(2, (node.ways | 0) || 2);
  return 1;
}

// Engine debug toggle. Set SIM_DEBUG=1 to re-enable the [EVAL]/[CPU]/
// [P4e-PC]/[P4e-RF] traces. Default: silent — keeps test stdout clean.
// Browser-safe: typeof guard so the file still parses where `process`
// is undefined.
const _DEBUG = (typeof process !== 'undefined' && process.env && process.env.SIM_DEBUG === '1');

// CACHE combinational evaluation — pure (no state mutation). Reads
// inputs (ADDR, DATA, WE, RE, MEM_DATA_IN), looks up the cache lines/
// sets, and writes DATA_OUT, HIT, MISS, MEM_ADDR, MEM_DATA_OUT,
// MEM_RE, MEM_WE into nodeValues. Caller is responsible for calling
// propagate(node.id) to push these to wireValues for downstream
// consumers. Used by Phase 1's main DAG pass, by the new Phase 1.5
// cascade settle (so PIPE_MEMWB latches the right value), and by the
// existing Phase 4c2.5pre settle (so post-state-mutation outputs
// reach Phase 4c3+ consumers).
function _evalCacheCombinational(node, ms, inputs, nodeValues) {
  const id = node.id;
  const inputSlotsC = inputs.get(id);
  const _readSlot = (s) => {
    if (!s) return 0;
    const outIdx = s.wire.sourceOutputIndex || 0;
    const k = outIdx === 0 ? s.sourceId : (s.sourceId + '__out' + outIdx);
    return nodeValues.get(k) ?? 0;
  };
  const addrSlot   = inputSlotsC.find(s => s.inputIndex === 0);
  const dataSlotC  = inputSlotsC.find(s => s.inputIndex === 1);
  const weSlot     = inputSlotsC.find(s => s.inputIndex === 2);
  const reSlot     = inputSlotsC.find(s => s.inputIndex === 3);
  const memDiSlot  = inputSlotsC.find(s => s.inputIndex === 5);
  const addr      = _readSlot(addrSlot);
  const dataInCpu = _readSlot(dataSlotC);
  const we        = _readSlot(weSlot) ? 1 : 0;
  const re        = _readSlot(reSlot) ? 1 : 0;
  const memDataIn = _readSlot(memDiSlot);
  const dMask     = _mask(node.dataBits || 8);
  const N         = node.lines || 4;
  const isAccess  = re || we;
  let hit = 0, hitData = 0;
  if (ms.sets) {
    const sets      = ms.sets.length;
    const indexBits = Math.max(0, Math.ceil(Math.log2(sets)));
    const setIdx    = sets > 1 ? (addr & (sets - 1)) : 0;
    const tag       = sets > 1 ? (addr >>> indexBits) : addr;
    const set       = ms.sets[setIdx];
    if (isAccess && set) {
      for (const w of set) {
        if (w.valid === 1 && w.tag === tag) { hit = 1; hitData = w.data; break; }
      }
    }
  } else if (ms.lines) {
    const indexBits = Math.max(1, Math.ceil(Math.log2(N)));
    const idx       = addr & (N - 1);
    const tag       = addr >>> indexBits;
    const line      = ms.lines[idx];
    if (isAccess && line && line.valid === 1 && line.tag === tag) {
      hit = 1; hitData = line.data;
    }
  }
  const miss    = (isAccess && !hit) ? 1 : 0;
  const dataOut = hit ? (hitData & dMask) : (memDataIn & dMask);
  const isWB    = node.writePolicy === 'write-back';
  nodeValues.set(id,             dataOut);
  nodeValues.set(id + '__out1',  hit);
  nodeValues.set(id + '__out2',  miss);
  nodeValues.set(id + '__out3',  addr);
  nodeValues.set(id + '__out4',  dataInCpu & dMask);
  nodeValues.set(id + '__out5',  ((re || (we && isWB)) && !hit) ? 1 : 0);  // MEM_RE
  nodeValues.set(id + '__out6',  (we && !isWB) ? 1 : 0);                   // MEM_WE
  return dataOut;
}

// Safe mask apply (avoids signed 32-bit issues with & operator)
function _applyMask(val, bits) {
  if (bits >= 53) return val;
  const m = _mask(bits);
  if (bits >= 32) return ((val % (m + 1)) + (m + 1)) % (m + 1);
  return (val & m) >>> 0;
}

// ── CU evaluation helper ───────────────────────────────────
function _evalCU(node, op, z, c) {
  let aluOp = 0, regWe = 0, memWe = 0, memRe = 0, jmp = 0, halt = 0, immSel = 0;

  if (node.controlTable) {
    const maxOp = node.controlTable.length - 1;
    const row = node.controlTable[op & maxOp];
    if (row) {
      aluOp  = row.aluOp || 0;
      regWe  = row.regWe ? 1 : 0;
      memWe  = row.memWe ? 1 : 0;
      memRe  = row.memRe ? 1 : 0;
      halt   = row.halt  ? 1 : 0;
      immSel = row.immSel ? 1 : 0;
      if (row.jmp === 1) jmp = 1;
      else if (row.jmp === -1) jmp = z;       // BEQ (Z-conditional jump; pair with aluOp=7 for atomic CMP+branch)
      else if (row.jmp === -2) jmp = c;       // legacy JC (extended ISA only — not in the 16-op default set)
      else if (row.jmp === -3) jmp = z ? 0 : 1; // BNE (Z-not-set conditional jump; pair with aluOp=7)
      else if (row.jmp === -4) jmp = c ? 0 : 1; // legacy JNC (extended ISA only)
    }
  } else {
    switch (op & 0xF) {
      case 0: aluOp=0;regWe=1;break; case 1: aluOp=1;regWe=1;break;
      case 2: aluOp=2;regWe=1;break; case 3: aluOp=3;regWe=1;break;
      case 4: aluOp=4;regWe=1;break; case 5: aluOp=5;regWe=1;break;
      case 6: aluOp=6;regWe=1;break; case 7: aluOp=7;break;
      case 8: regWe=1;memRe=1;break; case 9: memWe=1;break;
      case 10:jmp=1;break;
      case 11:aluOp=7;jmp=z;break;       // BEQ — CMP Rs1,Rs2; branch if equal (Z=1)
      case 12:aluOp=7;jmp=z?0:1;break;   // BNE — CMP Rs1,Rs2; branch if not equal
      case 13:regWe=1;immSel=1;break; case 14:break; case 15:halt=1;break;
    }
  }
  return { aluOp, regWe, memWe, memRe, jmp, halt, immSel };
}

/**
 * Evaluate the circuit.
 * @param {object[]} nodes - Array of node objects
 * @param {object[]} wires - Array of wire objects
 * @param {Map} ffStates - Map<nodeId, {q, qNot, prevClkValue}>
 * @param {number} stepCount - Current step count
 * @returns {{ nodeValues: Map, wireValues: Map, ffUpdated: boolean }}
 */
export function evaluate(nodes, wires, ffStates, stepCount) {
  const _clkNode = nodes.find(n => n.type === 'CLOCK');
  if (_DEBUG && _clkNode && _clkNode.value === 1) console.log(`[EVAL] CLOCK=1 step=${stepCount}`);
  ffStates = ffStates || new Map();

  const nodeMap    = new Map(nodes.map(n => [n.id, n]));
  const nodeValues = new Map();
  const wireValues = new Map();

  // ── DFT stuck-at fault injection ───────────────────────────
  // Intercept every wireValues.set so a wire with `stuckAt = 0|1` always
  // stores its stuck value, regardless of the upstream propagated value.
  // Centralizing the override here means the 25+ wireValues.set sites
  // throughout evaluate() don't each need to be patched.
  const _wireById = new Map(wires.map(w => [w.id, w]));
  // Resolve the upstream source value of a wire (without applying its own
  // faults — used internally by bridging which combines two source vals).
  const _rawSource = (w) => {
    const outIdx = w.sourceOutputIndex || 0;
    const key = outIdx === 0 ? w.sourceId : (w.sourceId + '__out' + outIdx);
    return nodeValues.get(key);
  };
  // Apply per-wire fault model to a freshly propagated value. Order:
  //   open       → null (broken)
  //   stuck-at   → forced 0 / 1
  //   bridging   → wired-OR / wired-AND with the bridged wire's source
  const _applyWireFault = (w, val) => {
    if (!w) return val;
    if (w.open) return null;
    if (w.stuckAt === 0 || w.stuckAt === 1) return w.stuckAt;
    if (w.bridgedWith) {
      const other = _wireById.get(w.bridgedWith);
      if (other) {
        const a = (val === 0 || val === 1) ? val : 0;
        const b0 = _rawSource(other);
        const b  = (b0 === 0 || b0 === 1) ? b0 : 0;
        return w.bridgeMode === 'and' ? (a & b) : (a | b);
      }
    }
    return val;
  };
  const _origSet  = wireValues.set.bind(wireValues);
  wireValues.set  = (id, val) => _origSet(id, _applyWireFault(_wireById.get(id), val));
  // Slot-aware reader. When a downstream consumer pulls a value via an
  // input slot, this helper applies the wire's faults before returning.
  // Use this anywhere a slot read can replace a hand-rolled
  // `outIdx + key + nodeValues.get(key)` triple.
  const _readSlot = (slot, fallback = undefined) => {
    const w = slot.wire;
    const raw = _rawSource(w);
    const v = _applyWireFault(w, raw);
    return (v === undefined && fallback !== undefined) ? fallback : v;
  };

  // ── Build adjacency ───────────────────────────────────────
  const successors = new Map(nodes.map(n => [n.id, []]));
  const inputs     = new Map(nodes.map(n => [n.id, []]));

  wires.forEach(wire => {
    successors.get(wire.sourceId)?.push({ wire, targetId: wire.targetId });
    inputs.get(wire.targetId)?.push({
      wire,
      sourceId:   wire.sourceId,
      inputIndex: wire.targetInputIndex,
    });
  });
  inputs.forEach(arr => arr.sort((a, b) => a.inputIndex - b.inputIndex));

  // ── IR_FLUSH suppression (per-instruction branch one-shot) ───
  // When a branch fires at cycle N, its IR.curSeq is captured in
  // ffStates as __last_fired_branch_seq__. At cycle N+1 the IR still
  // physically holds the BNE instruction (Phase 2 hasn't latched the
  // new fetch yet), so a naive Phase-1 CU evaluation would see op=BNE,
  // assert jmp=1, drive ir_flush_mux to gnd, and the new fetch would
  // be lost — over-flushing the IF stage by one cycle.
  // Suppression: every CU eval site checks whether the IR (or upstream
  // PIPE_REG) it's reading carries the SAME instruction-id as the
  // last-fired branch. If yes, force jmp=0 — that branch is already
  // history; the engine has already updated PC and committed the flush.
  // The mux reads jmp=0, selects ROM, the target instruction reaches
  // IR correctly. Sentinel -1 = no branch ever fired (safe at startup).
  const _lastFiredBranchSeq = ffStates && ffStates.get
    ? (ffStates.get('__last_fired_branch_seq__') ?? -1)
    : -1;
  const _cuSeqCache = new Map();
  const _cuBranchSeqOf = (cuNode) => {
    if (_cuSeqCache.has(cuNode.id)) return _cuSeqCache.get(cuNode.id);
    const slots = inputs.get(cuNode.id) || [];
    const opSlot = slots.find(s => s.inputIndex === 0);
    let seq = -1;
    if (opSlot) {
      const upNode = nodeMap.get(opSlot.sourceId);
      if (upNode) {
        const upMs = ffStates.get(upNode.id);
        if (upNode.type === 'IR' && upMs && typeof upMs.curSeq === 'number') seq = upMs.curSeq;
        else if (upNode.type === 'PIPE_REG' && upMs && typeof upMs.metaSeq === 'number') seq = upMs.metaSeq;
      }
    }
    _cuSeqCache.set(cuNode.id, seq);
    return seq;
  };
  // Wrap a freshly-computed jmp output: returns 0 if this CU is
  // re-firing on the same IR instance that already fired last cycle,
  // otherwise returns the original jmp value.
  const _suppressReFireJmp = (cuNode, jmp) => {
    if (!jmp) return 0;
    if (_lastFiredBranchSeq < 0) return jmp;
    const mySeq = _cuBranchSeqOf(cuNode);
    if (mySeq < 0) return jmp;
    return (mySeq === _lastFiredBranchSeq) ? 0 : jmp;
  };

  // ── Topological Sort (Kahn's) ─────────────────────────────
  const inDegree = new Map(nodes.map(n => [n.id, 0]));
  wires.forEach(w => {
    inDegree.set(w.targetId, (inDegree.get(w.targetId) || 0) + 1);
  });

  // FF and memory nodes as pseudo-sources
  nodes.forEach(n => {
    if (FF_TYPE_SET.has(n.type) || MEMORY_TYPE_SET.has(n.type)) inDegree.set(n.id, 0);
  });

  const queue = [];
  inDegree.forEach((deg, id) => { if (deg === 0) queue.push(id); });

  const order = [];
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    successors.get(id)?.forEach(({ targetId }) => {
      const targetType = nodeMap.get(targetId)?.type;
      if (FF_TYPE_SET.has(targetType) || MEMORY_TYPE_SET.has(targetType)) return;
      const newDeg = (inDegree.get(targetId) || 0) - 1;
      inDegree.set(targetId, newDeg);
      if (newDeg === 0) queue.push(targetId);
    });
  }

  // ── PHASE 1: Propagate combinational + FF-as-source ───────
  order.forEach(id => {
    const node  = nodeMap.get(id);
    let   value = null;

    if (node.type === 'IMM') {
      value = _applyMask(node.value ?? 0, node.bitWidth || 8);

    } else if (node.type === 'INPUT') {
      value = node.fixedValue;

    } else if (node.type === 'MUX_SELECT') {
      value = node.value ?? 0;

    } else if (node.type === 'DISPLAY_7SEG') {
      const inputSlots = inputs.get(id);
      const segments = inputSlots.map(s => nodeValues.get(s.sourceId) ?? 0);
      node._segments = segments;
      value = segments.reduce((acc, v, i) => acc | ((v ? 1 : 0) << i), 0);

    } else if (node.type === 'CLOCK') {
      value = node.value ?? 0;

    } else if (FF_TYPE_SET.has(node.type)) {
      if (node.type === 'FF_SLOT' && !node.ffType) {
        value = null;
        nodeValues.set(id, value);
        successors.get(id)?.forEach(({ wire }) => wireValues.set(wire.id, null));
        return;
      }
      if (node.type === 'LATCH_SLOT' && !node.latchType) {
        value = null;
        nodeValues.set(id, value);
        successors.get(id)?.forEach(({ wire }) => wireValues.set(wire.id, null));
        return;
      }
      const ffState = ffStates.get(id) || { q: 0, qNot: 1, prevClkValue: null };
      value = ffState.q;
      nodeValues.set(id + '__qnot', ffState.qNot);

    } else if (node.type === 'GATE_SLOT') {
      if (node.gate == null) {
        value = null;
      } else {
        const inputSlots = inputs.get(id);
        const args = inputSlots.map(slot => _readSlot(slot));
        if (args.some(a => a === null || a === undefined)) {
          value = null;
        } else {
          value = GATE_FN[node.gate](...args);
        }
      }

    } else if (node.type === 'MUX') {
      // MUX: first N inputs are data, remaining are select lines.
      // Read each input using its wire's sourceOutputIndex so multi-output
      // drivers (PIPE_REG channels, IR fields, etc.) deliver the right value.
      const n = node.inputCount || 2;
      const selCount = Math.ceil(Math.log2(n));
      const inputSlots = inputs.get(id);
      const dataInputs = inputSlots.slice(0, n);
      const selInputs = inputSlots.slice(n, n + selCount);
      const _readSlot = (slot) => {
        if (!slot) return null;
        const outIdx = slot.wire.sourceOutputIndex || 0;
        const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
        return nodeValues.get(key);
      };

      let selIdx = 0;
      let selValid = true;
      for (let s = 0; s < selInputs.length; s++) {
        const sv = _readSlot(selInputs[s]);
        if (sv === null || sv === undefined) { selValid = false; break; }
        selIdx |= (sv << s);
      }

      if (!selValid || selIdx >= dataInputs.length) {
        value = null;
      } else {
        value = _readSlot(dataInputs[selIdx]) ?? null;
      }

    } else if (node.type === 'DEMUX') {
      // DEMUX: input 0 is data, remaining are select lines
      const outCount = node.outputCount || 2;
      const selCount = Math.ceil(Math.log2(outCount));
      const inputSlots = inputs.get(id);
      const dataSlot = inputSlots[0];
      const selInputs = inputSlots.slice(1, 1 + selCount);

      const dataVal = dataSlot ? (nodeValues.get(dataSlot.sourceId) ?? null) : null;

      let selIdx = 0;
      let selValid = true;
      for (let s = 0; s < selInputs.length; s++) {
        const sv = nodeValues.get(selInputs[s]?.sourceId);
        if (sv === null || sv === undefined) { selValid = false; break; }
        selIdx |= (sv << s);
      }

      // Store each output value
      for (let o = 0; o < outCount; o++) {
        nodeValues.set(id + '__out' + o, (selValid && o === selIdx) ? dataVal : 0);
      }
      value = nodeValues.get(id + '__out0') ?? null;

    } else if (node.type === 'DECODER') {
      // DECODER: N input bits → 2^N outputs (one-hot)
      const n = node.inputBits || 2;
      const outCount = 1 << n;
      const inputSlots = inputs.get(id);

      let selIdx = 0;
      let valid = true;
      for (let s = 0; s < n && s < inputSlots.length; s++) {
        const sv = nodeValues.get(inputSlots[s]?.sourceId);
        if (sv === null || sv === undefined) { valid = false; break; }
        selIdx |= (sv << s);
      }

      for (let o = 0; o < outCount; o++) {
        nodeValues.set(id + '__out' + o, (valid && o === selIdx) ? 1 : 0);
      }
      value = nodeValues.get(id + '__out0') ?? 0;

    } else if (node.type === 'ENCODER') {
      // ENCODER (priority): 2^N input lines → N output bits
      const inLines = node.inputLines || 4;
      const outBits = Math.ceil(Math.log2(inLines));
      const inputSlots = inputs.get(id);

      // Priority encoder: highest active input wins
      let activeIdx = -1;
      for (let i = inLines - 1; i >= 0; i--) {
        const sv = i < inputSlots.length ? (nodeValues.get(inputSlots[i]?.sourceId) ?? null) : null;
        if (sv === 1) { activeIdx = i; break; }
      }

      for (let b = 0; b < outBits; b++) {
        nodeValues.set(id + '__out' + b, activeIdx >= 0 ? ((activeIdx >> b) & 1) : 0);
      }
      // Valid flag output
      nodeValues.set(id + '__valid', activeIdx >= 0 ? 1 : 0);
      value = nodeValues.get(id + '__out0') ?? 0;

    } else if (node.type === 'HANDSHAKE') {
      // Inputs: V (valid), R (ready) → Outputs: S (stall = NOT(V AND R)), F (fire = V AND R)
      const inputSlots = inputs.get(id);
      const v = inputSlots[0] ? (nodeValues.get(inputSlots[0].sourceId) ?? null) : null;
      const r = inputSlots[1] ? (nodeValues.get(inputSlots[1].sourceId) ?? null) : null;
      if (v === null || r === null) {
        value = null;
        nodeValues.set(id + '__out0', null);
        nodeValues.set(id + '__out1', null);
      } else {
        const fire  = (v & r) & 1;
        const stall = fire ^ 1;
        nodeValues.set(id + '__out0', stall);
        nodeValues.set(id + '__out1', fire);
        value = stall;
      }

    } else if (node.type === 'HALF_ADDER') {
      // HA: inputs A, B → outputs Sum (out0), Carry (out1)
      const inputSlots = inputs.get(id);
      const _readSlot = (slot) => {
        if (!slot) return null;
        const outIdx = slot.wire.sourceOutputIndex || 0;
        const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
        return nodeValues.get(key);
      };
      const a = _readSlot(inputSlots[0]);
      const b = _readSlot(inputSlots[1]);
      if (a === null || a === undefined || b === null || b === undefined) {
        value = null;
        nodeValues.set(id + '__out0', null);
        nodeValues.set(id + '__out1', null);
      } else {
        const sum = a ^ b;
        const carry = a & b;
        nodeValues.set(id + '__out0', sum);
        nodeValues.set(id + '__out1', carry);
        value = sum;
      }

    } else if (node.type === 'FULL_ADDER') {
      // FA: inputs A, B, Cin → outputs Sum (out0), Cout (out1)
      // Inputs MUST be read via sourceOutputIndex so a wire from another
      // FA's COUT (output 1, e.g. carry chain) returns COUT and not SUM.
      const inputSlots = inputs.get(id);
      const _readSlot = (slot) => {
        if (!slot) return null;
        const outIdx = slot.wire.sourceOutputIndex || 0;
        const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
        return nodeValues.get(key);
      };
      const a   = _readSlot(inputSlots[0]);
      const b   = _readSlot(inputSlots[1]);
      const cin = _readSlot(inputSlots[2]);
      if (a === null || a === undefined || b === null || b === undefined || cin === null || cin === undefined) {
        value = null;
        nodeValues.set(id + '__out0', null);
        nodeValues.set(id + '__out1', null);
      } else {
        const sum  = a ^ b ^ cin;
        const cout = (a & b) | (b & cin) | (a & cin);
        nodeValues.set(id + '__out0', sum);
        nodeValues.set(id + '__out1', cout);
        value = sum;
      }

    } else if (node.type === 'COMPARATOR') {
      // CMP: inputs A, B → outputs EQ (out0), GT (out1), LT (out2)
      const inputSlots = inputs.get(id);
      const a = inputSlots[0] ? (nodeValues.get(inputSlots[0].sourceId) ?? null) : null;
      const b = inputSlots[1] ? (nodeValues.get(inputSlots[1].sourceId) ?? null) : null;
      if (a === null || b === null) {
        nodeValues.set(id + '__out0', null);
        nodeValues.set(id + '__out1', null);
        nodeValues.set(id + '__out2', null);
        value = null;
      } else {
        nodeValues.set(id + '__out0', a === b ? 1 : 0);   // EQ
        nodeValues.set(id + '__out1', a > b  ? 1 : 0);    // GT
        nodeValues.set(id + '__out2', a < b  ? 1 : 0);    // LT
        value = a === b ? 1 : 0;
      }

    } else if (node.type === 'HDU') {
      // Hazard Detection Unit — load-use stall detector (textbook MIPS).
      //   stall = IDEX_MemRead && (IDEX_Rt == IFID_Rs || IDEX_Rt == IFID_Rt)
      //   stall ⇒ PCWrite=0, IFIDWrite=0, Bubble=1
      //   else  ⇒ PCWrite=1, IFIDWrite=1, Bubble=0
      const inputSlots = inputs.get(id);
      const get = (i) => {
        const slot = inputSlots[i];
        if (!slot) return 0;
        const outIdx = slot.wire.sourceOutputIndex || 0;
        const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
        return nodeValues.get(key) ?? 0;
      };
      const memRead = get(0) ? 1 : 0;
      const idexRt  = get(1);
      const ifidRs  = get(2);
      const ifidRt  = get(3);
      const stall = memRead && (idexRt === ifidRs || idexRt === ifidRt) ? 1 : 0;
      nodeValues.set(id + '__out0', stall ? 0 : 1); // PCWrite
      nodeValues.set(id + '__out1', stall ? 0 : 1); // IFIDWrite
      nodeValues.set(id + '__out2', stall);          // Bubble
      value = stall;

    } else if (node.type === 'FWD') {
      // Forwarding Unit — textbook MIPS priority forwarder.
      // ForwardA encoding: 00 = use RF, 10 = forward EX/MEM, 01 = forward MEM/WB.
      // EX/MEM has priority over MEM/WB when both match, per Patterson & Hennessy.
      const inputSlots = inputs.get(id);
      const get = (i) => {
        const slot = inputSlots[i];
        if (!slot) return 0;
        const outIdx = slot.wire.sourceOutputIndex || 0;
        const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
        return nodeValues.get(key) ?? 0;
      };
      const idexRs  = get(0);
      const idexRt  = get(1);
      const exmemRd = get(2);
      const exmemRW = get(3) ? 1 : 0;
      const memwbRd = get(4);
      const memwbRW = get(5) ? 1 : 0;
      // Forwarding to source A
      let fwdA = 0;
      if (exmemRW && exmemRd !== 0 && exmemRd === idexRs) fwdA = 2;        // 10
      else if (memwbRW && memwbRd !== 0 && memwbRd === idexRs) fwdA = 1;  // 01
      // Forwarding to source B
      let fwdB = 0;
      if (exmemRW && exmemRd !== 0 && exmemRd === idexRt) fwdB = 2;
      else if (memwbRW && memwbRd !== 0 && memwbRd === idexRt) fwdB = 1;
      nodeValues.set(id + '__out0', fwdA);
      nodeValues.set(id + '__out1', fwdB);
      value = fwdA;

    } else if (MEMORY_TYPE_SET.has(node.type)) {
      // Memory components act as sources: emit stored Q value (packed integer)
      let ms = ffStates.get(id);
      if (!ms) {
        ms = { q: 0, prevClkValue: null };
        if (node.type === 'RAM' || node.type === 'ROM') ms.memory = node.memory ? { ...node.memory } : {};
        if (node.type === 'CACHE') {
          // Direct-mapped: ms.lines[N]. N-way set-associative or fully-
          // associative: ms.sets[N/ways], each holding `ways` lines.
          // LRU is a monotonically increasing counter touched on every
          // hit/fill; evict the line with the smallest counter.
          const N = node.lines || 4;
          const ways = _cacheWays(node, N);
          if (ways >= 2) {
            const sets = Math.max(1, Math.floor(N / ways));
            ms.sets = Array.from({ length: sets }, () =>
              Array.from({ length: ways }, () => ({ tag: null, valid: 0, data: 0, lru: 0, dirty: 0 }))
            );
            ms.lruClock = 0;
          } else {
            ms.lines = Array.from({ length: N }, () => ({ tag: null, valid: 0, data: 0, dirty: 0 }));
          }
          ms.stats = { hits: 0, misses: 0 };
        }
        if (node.type === 'COUNTER') ms.count = 0;
        if (node.type === 'REG_FILE' || node.type === 'REG_FILE_DP') {
          ms.regs = node.initialRegs ? [...node.initialRegs] : new Array(node.regCount || 8).fill(0);
        }
        if (node.type === 'PIPE_REG') {
          ms.channels = new Array(node.channels || 4).fill(0);
        }
        if (node.type === 'FIFO' || node.type === 'STACK') {
          ms.buffer = [];
          ms.full = 0;
          ms.empty = 1;
        }
        ffStates.set(id, ms);
      }
      value = ms.q ?? 0;
      // TC output for counter (terminal count)
      if (node.type === 'COUNTER') {
        const maxVal = _mask(node.bitWidth || 4);
        nodeValues.set(id + '__out1', ms.count === maxVal ? 1 : 0);
      }
      // ROM combinational (asynchronous) read — CIRCUIT_DETAILS-style IMEM
      if (node.type === 'ROM' && node.asyncRead) {
        const inputSlotsAsync = inputs.get(id);
        const addrSlot = inputSlotsAsync.find(s => s.inputIndex === 0);
        const reSlot   = inputSlotsAsync.find(s => s.inputIndex === 1);
        const addr = addrSlot ? (nodeValues.get(addrSlot.sourceId) ?? 0) : 0;
        const re   = reSlot   ? (nodeValues.get(reSlot.sourceId)   ?? 1) : 1;
        const dMaskAsync = _mask(node.dataBits || 4);
        if (re) ms.q = ((node.memory && node.memory[addr]) ?? 0) & dMaskAsync;
        value = ms.q ?? 0;
      }
      // RAM combinational read — needed for pipelined LOAD so the data
      // reaches MEM/WB at the same cycle as the rest of the LOAD bundle.
      // Address inputs read with sourceOutputIndex so PIPE_REG channels
      // deliver the right value.
      if (node.type === 'RAM' && node.asyncRead) {
        const inputSlotsRam = inputs.get(id);
        const _readSlotR = (s) => {
          if (!s) return 0;
          const outIdx = s.wire.sourceOutputIndex || 0;
          const k = outIdx === 0 ? s.sourceId : (s.sourceId + '__out' + outIdx);
          return nodeValues.get(k) ?? 0;
        };
        const addrSlot = inputSlotsRam.find(s => s.inputIndex === 0);
        const reSlot   = inputSlotsRam.find(s => s.inputIndex === 3);
        const addr = _readSlotR(addrSlot);
        const re   = reSlot ? _readSlotR(reSlot) : 1;
        const dMaskAsync = _mask(node.dataBits || 4);
        if (re) ms.q = ((ms.memory && ms.memory[addr]) ?? 0) & dMaskAsync;
        value = ms.q ?? 0;
      }
      // CACHE — combinational lookup. Body factored into
      // _evalCacheCombinational so Phase 1 + Phase 1.5 settle + Phase
      // 4c2.5pre settle all share the exact same logic.
      // Pinout:
      //   In:  0=ADDR, 1=DATA(CPU→cache), 2=WE, 3=RE, 4=CLK, 5=MEM_DATA_IN
      //   Out: 0=DATA_OUT, 1=HIT, 2=MISS, 3=MEM_ADDR, 4=MEM_DATA_OUT,
      //        5=MEM_RE, 6=MEM_WE
      // Side effects (fill line, increment counters) happen in Phase
      // 4c2.5 gated on the rising CLK edge.
      if (node.type === 'CACHE') {
        value = _evalCacheCombinational(node, ms, inputs, nodeValues);
      }
      // IR: decode stored instruction into fields
      if (node.type === 'IR') {
        const instr = ms.q ?? 0;
        const opBits  = node.opBits  || 4;
        const rdBits  = node.rdBits  || 4;
        const rs1Bits = node.rs1Bits || 4;
        const rs2Bits = node.rs2Bits || 4;
        // Fields extracted MSB-first: [OP | RD | RS1 | RS2]
        const rs2Shift = 0;
        const rs1Shift = rs2Bits;
        const rdShift  = rs2Bits + rs1Bits;
        const opShift  = rs2Bits + rs1Bits + rdBits;
        nodeValues.set(id + '__out0', (instr >> opShift)  & (_mask(opBits))); // OP
        nodeValues.set(id + '__out1', (instr >> rdShift)  & (_mask(rdBits))); // RD
        nodeValues.set(id + '__out2', (instr >> rs1Shift) & (_mask(rs1Bits))); // RS1
        nodeValues.set(id + '__out3', (instr >> rs2Shift) & (_mask(rs2Bits))); // RS2/IMM
        value = nodeValues.get(id + '__out0');
      }
      // PC: no extra outputs beyond Q
      // PIPE_REG: output all stored channels
      if (node.type === 'PIPE_REG') {
        const ch = ms.channels || [];
        for (let i = 0; i < ch.length; i++) {
          nodeValues.set(id + '__out' + i, ch[i] ?? 0);
        }
        value = ch[0] ?? 0;
      }
      // FIFO/STACK: output top/front + flags
      if (node.type === 'FIFO' || node.type === 'STACK') {
        nodeValues.set(id + '__out1', ms.full ?? 0);
        nodeValues.set(id + '__out2', ms.empty ?? 1);
      }
      // REG_FILE_DP: dual-port async read
      if (node.type === 'REG_FILE_DP') {
        const inputSlots = inputs.get(id);
        const _readSlot = (slot) => {
          if (!slot) return 0;
          const outIdx = slot.wire.sourceOutputIndex || 0;
          const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
          return nodeValues.get(key) ?? 0;
        };
        if (!ms.regs) ms.regs = node.initialRegs ? [...node.initialRegs] : new Array(node.regCount || 8).fill(0);
        const rd1Addr = _readSlot(inputSlots[0]);
        const rd2Addr = _readSlot(inputSlots[1]);
        const regIdx1 = rd1Addr % (node.regCount || 8);
        const regIdx2 = rd2Addr % (node.regCount || 8);
        const readR0 = (idx) => (node.protectR0 && idx === 0) ? 0 : (ms.regs[idx] ?? 0);
        value = readR0(regIdx1);
        nodeValues.set(id + '__out0', value);
        nodeValues.set(id + '__out1', readR0(regIdx2));
        ms.q = value;
      }
      // REG_FILE: async read — read address comes from input 0
      if (node.type === 'REG_FILE') {
        const inputSlots = inputs.get(id);
        const slot = inputSlots[0];
        let rdAddr = 0;
        if (slot) {
          const outIdx = slot.wire.sourceOutputIndex || 0;
          const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
          rdAddr = nodeValues.get(key) ?? 0;
        }
        const regIdx = rdAddr % (node.regCount || 8);
        value = (ms.regs[regIdx] ?? 0);
        ms.q = value;
      }

    } else if (node.type === 'SIGN_EXT') {
      // Sign extend: input IN(0) from inBits to outBits
      const inputSlots = inputs.get(id);
      const inVal = inputSlots[0] ? (nodeValues.get(inputSlots[0].sourceId) ?? 0) : 0;
      const inBits = node.inBits || 4;
      const outBits = node.outBits || 8;
      const signBit = (inVal >> (inBits - 1)) & 1;
      if (signBit) {
        // Negative: fill upper bits with 1s
        const mask = (_mask(outBits)) ^ (_mask(inBits));
        value = (inVal | mask) & (_mask(outBits));
      } else {
        value = inVal & (_mask(inBits));
      }

    } else if (node.type === 'SPLIT') {
      // Bus splitter: one input bus → N outputs, each a bit-range slice.
      // Read input via sourceOutputIndex so multi-output drivers (FWD, ALU, …)
      // deliver the right specific output, not just their primary value.
      const inputSlots = inputs.get(id);
      const slot = inputSlots[0];
      let inVal = 0;
      if (slot) {
        const outIdx = slot.wire.sourceOutputIndex || 0;
        const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
        inVal = nodeValues.get(key) ?? 0;
      }
      const slices = parseSlices(node.slicesSpec || '');
      for (let i = 0; i < slices.length; i++) {
        const s = slices[i];
        const width = sliceWidth(s);
        const mask = width >= 32 ? 0xFFFFFFFF : ((1 << width) - 1);
        const sliced = ((inVal >>> s.lo) & mask) >>> 0;
        nodeValues.set(id + '__out' + i, sliced);
      }
      value = slices.length > 0 ? (nodeValues.get(id + '__out0') ?? 0) : 0;

    } else if (node.type === 'MERGE') {
      // Bus merger: N inputs → one output, each input placed into its bit range.
      // Read inputs from the actual sourceOutputIndex so multi-output drivers
      // (IR fields, PIPE_REG channels, etc.) deliver the right value.
      const inputSlots = inputs.get(id);
      const slices = parseSlices(node.slicesSpec || '');
      const outBits = node.outBits || 8;
      const outMask = outBits >= 32 ? 0xFFFFFFFF : ((1 << outBits) - 1);
      let merged = 0;
      for (let i = 0; i < slices.length; i++) {
        const s = slices[i];
        const width = sliceWidth(s);
        const partMask = width >= 32 ? 0xFFFFFFFF : ((1 << width) - 1);
        const slot = inputSlots.find(sl => sl.inputIndex === i);
        let v = 0;
        if (slot) {
          const outIdx = slot.wire.sourceOutputIndex || 0;
          const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
          v = nodeValues.get(key) ?? 0;
        }
        merged = (merged | ((v & partMask) << s.lo)) >>> 0;
      }
      value = merged & outMask;

    } else if (node.type === 'BUS_MUX') {
      // Bus MUX: inputs D0..Dn-1, SEL (last input) → Y
      const inputSlots = inputs.get(id);
      const n = node.inputCount || 2;
      const selSlot = inputSlots.find(s => s.inputIndex === n);
      const sel = selSlot ? (nodeValues.get(selSlot.sourceId) ?? 0) : 0;
      const dataSlot = inputSlots.find(s => s.inputIndex === (sel % n));
      value = dataSlot ? (nodeValues.get(dataSlot.sourceId) ?? 0) : 0;

    } else if (node.type === 'SUB_CIRCUIT') {
      // Evaluate internal sub-circuit
      const inputSlots = inputs.get(id);
      const sc = node.subCircuit;
      if (sc && sc.nodes && sc.wires) {
        const subInputDefs = node.subInputs || [];
        if (!node._subFfStates) node._subFfStates = new Map();

        // Inject external values into internal INPUT nodes
        const setInputs = (overrides) => {
          for (let i = 0; i < subInputDefs.length; i++) {
            const intNode = sc.nodes.find(n => n.id === subInputDefs[i].id);
            if (!intNode) continue;
            if (overrides && overrides[i] !== undefined) {
              intNode.fixedValue = overrides[i];
            } else {
              const extSlot = inputSlots.find(s => s.inputIndex === i);
              intNode.fixedValue = extSlot ? (nodeValues.get(extSlot.sourceId) ?? 0) : 0;
            }
          }
        };

        // Inject the external CLK values directly and run the
        // inner scene once. The inner FFs maintain their own
        // prevClkValue across calls (via node._subFfStates), so
        // an internal rising edge fires exactly when the external
        // CLK actually transitions 0→1 — same contract as a
        // primary FF outside the sub-circuit. (An earlier version
        // forced an internal CLK=0 pre-pulse on every outer
        // evaluate(), which made any sub-circuit FF re-latch
        // every cycle the external CLK was held high.)
        setInputs(null);
        const subResult = evaluate(sc.nodes, sc.wires, node._subFfStates, stepCount);

        const subOutputDefs = node.subOutputs || [];
        for (let i = 0; i < subOutputDefs.length; i++) {
          nodeValues.set(id + '__out' + i, subResult.nodeValues.get(subOutputDefs[i].id) ?? 0);
        }
        value = nodeValues.get(id + '__out0') ?? 0;
      }

    } else if (node.type === 'BUS') {
      // Combinational Bus: pairs of (Dn, ENn) inputs → OUT, ERR
      const inputSlots = inputs.get(id);
      const srcCount = node.sourceCount || 3;
      let activeCount = 0;
      let busVal = null;
      for (let s = 0; s < srcCount; s++) {
        const dSlot  = inputSlots.find(sl => sl.inputIndex === s * 2);
        const enSlot = inputSlots.find(sl => sl.inputIndex === s * 2 + 1);
        const d  = dSlot  ? (nodeValues.get(dSlot.sourceId) ?? 0)  : 0;
        const en = enSlot ? (nodeValues.get(enSlot.sourceId) ?? 0) : 0;
        if (en) {
          activeCount++;
          busVal = d;
        }
      }
      if (activeCount === 0) {
        value = null; // high-Z
      } else if (activeCount === 1) {
        value = busVal;
      } else {
        value = busVal; // conflict — take last, but flag error
      }
      nodeValues.set(id + '__out1', activeCount > 1 ? 1 : 0); // ERR

    } else if (node.type === 'CU') {
      const inputSlots = inputs.get(id);
      const op = inputSlots[0] ? (nodeValues.get(inputSlots[0].sourceId) ?? 0) : 0;
      const z  = inputSlots[1] ? (nodeValues.get(inputSlots[1].sourceId) ?? 0) : 0;
      const c  = inputSlots[2] ? (nodeValues.get(inputSlots[2].sourceId) ?? 0) : 0;
      const { aluOp, regWe, memWe, memRe, jmp, halt, immSel } = _evalCU(node, op, z, c);
      const jmpFinal = _suppressReFireJmp(node, jmp);
      value = aluOp;
      nodeValues.set(id + '__out0', aluOp);
      nodeValues.set(id + '__out1', regWe);
      nodeValues.set(id + '__out2', memWe);
      nodeValues.set(id + '__out3', memRe);
      nodeValues.set(id + '__out4', jmpFinal);
      nodeValues.set(id + '__out5', halt);
      nodeValues.set(id + '__out6', immSel);

    } else if (node.type === 'ALU') {
      // Combinational ALU: inputs A(0), B(1), OP(2) → outputs R, Z(flag), C(flag).
      // Read each input via sourceOutputIndex so multi-output sources
      // (like pipe_idex.alu_op channel) deliver the right value.
      const inputSlots = inputs.get(id);
      const _readSlot = (slot) => {
        if (!slot) return 0;
        const outIdx = slot.wire.sourceOutputIndex || 0;
        const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
        return nodeValues.get(key) ?? 0;
      };
      const a  = _readSlot(inputSlots[0]);
      const b  = _readSlot(inputSlots[1]);
      const op = _readSlot(inputSlots[2]);
      const bits = node.bitWidth || 8;
      const mask = _mask(bits);
      let r = 0, carry = 0;
      switch (op & 7) {
        case 0: { const s = a + b; r = s & mask; carry = (s >> bits) & 1; break; }          // ADD
        case 1: { const s = a - b; r = s & mask; carry = s < 0 ? 1 : 0; break; }             // SUB
        case 2: r = (a & b) & mask; break;                                                     // AND
        case 3: r = (a | b) & mask; break;                                                     // OR
        case 4: r = (a ^ b) & mask; break;                                                     // XOR
        case 5: { const s = a << (b & 0xF); r = s & mask; carry = (s >> bits) & 1; break; }   // SHL
        case 6: r = (a >>> (b & 0xF)) & mask; break;                                           // SHR
        case 7: {
          if (node.sraMode) {                                                                    // SRA
            const k = b & 0x7;
            const signBit = (a >> (bits - 1)) & 1;
            r = (a >>> k) & mask;
            if (signBit && k > 0) r = (r | (((_mask(bits)) << (bits - k)) & mask)) & mask;
          } else {
            r = a === b ? 0 : (a - b) & mask; carry = a > b ? 1 : 0;                             // CMP
          }
          break;
        }
      }
      value = r;
      nodeValues.set(id + '__out0', r);                  // Result (also primary)
      nodeValues.set(id + '__out1', r === 0 ? 1 : 0);  // Z flag
      nodeValues.set(id + '__out2', carry);              // C flag

    } else if (node.type === 'OUTPUT') {
      const inputSlots = inputs.get(id);
      if (inputSlots.length > 0) {
        const slot = inputSlots[0];
        const outIdx = slot.wire.sourceOutputIndex || 0;
        if (outIdx === 1 && FF_TYPE_SET.has(nodeMap.get(slot.sourceId)?.type)) {
          value = nodeValues.get(slot.sourceId + '__qnot') ?? null;
        } else if (outIdx >= 1) {
          value = nodeValues.get(slot.sourceId + '__out' + outIdx) ?? null;
        } else {
          value = nodeValues.get(slot.sourceId) ?? null;
        }
      }
    }

    nodeValues.set(id, value);

    successors.get(id)?.forEach(({ wire }) => {
      const outIdx = wire.sourceOutputIndex || 0;
      if (outIdx === 1 && FF_TYPE_SET.has(node.type)) {
        wireValues.set(wire.id, nodeValues.get(id + '__qnot') ?? null);
      } else if (node.type === 'DEMUX' || node.type === 'DECODER' || node.type === 'ENCODER' ||
                 node.type === 'HALF_ADDER' || node.type === 'FULL_ADDER' || node.type === 'COMPARATOR' ||
                 node.type === 'ALU' || node.type === 'CU' || node.type === 'BUS' ||
                 node.type === 'SUB_CIRCUIT' || node.type === 'SPLIT' || node.type === 'HANDSHAKE' ||
                 node.type === 'HDU' || node.type === 'FWD') {
        wireValues.set(wire.id, nodeValues.get(id + '__out' + outIdx) ?? null);
      } else if (node.type === 'REG_FILE_DP') {
        // Dual port: out0=RD1_DATA, out1=RD2_DATA
        if (outIdx === 1) wireValues.set(wire.id, nodeValues.get(id + '__out1') ?? 0);
        else wireValues.set(wire.id, value);
      } else if (node.type === 'IR' || node.type === 'PIPE_REG') {
        // IR/PIPE_REG always uses __out for all outputs
        wireValues.set(wire.id, nodeValues.get(id + '__out' + outIdx) ?? 0);
      } else if (MEMORY_TYPE_SET.has(node.type)) {
        // outIdx 0 = Q (packed value), outIdx 1 = TC (counter only)
        if (outIdx >= 1) wireValues.set(wire.id, nodeValues.get(id + '__out' + outIdx) ?? 0);
        else wireValues.set(wire.id, value);
      } else {
        wireValues.set(wire.id, value);
      }
    });
  });

  // ── PHASE 1.5: cache cascade settle BEFORE FF latches ────────
  // Phase 1's topological sort can't resolve the L1↔L2 data cycle
  // (L1.MEM_DATA_IN ← L2.DATA_OUT, L1.MEM_ADDR → L2.ADDR). Whichever
  // cache evaluates first sees stale MEM_DATA_IN (=0 at startup) and
  // mis-computes its own DATA_OUT on a miss. That stale value then
  // propagates into wireValues and Phase 2 latches it into PIPE_MEMWB
  // — silently corrupting every LOAD that misses through a cache
  // hierarchy. Symptom: tight loops with LOAD-via-CACHE return 0
  // forever even though the cache stores the right value.
  // Fix: re-evaluate every cache up to numCaches times (sufficient
  // for any acyclic depth) so the cycle stabilises BEFORE Phase 2.
  // Same body as Phase 4c2.5pre (which still runs to handle the
  // post-state-mutation case for Phase 4c3+ consumers).
  // The cascade includes any downstream RAM with asyncRead=true:
  // when the cache's MEM_ADDR shifts during a settle pass, the RAM's
  // combinational output must re-evaluate too, otherwise the cache
  // re-reads stale RAM data on the next pass.
  const _cacheNodesP15 = nodes.filter(n => n.type === 'CACHE');
  const _ramNodesP15   = nodes.filter(n => n.type === 'RAM' && n.asyncRead);
  // Inline propagation: pull each downstream wire's value from the
  // node's freshly-set nodeValues, indexed by sourceOutputIndex.
  // Identical semantics to the closure-bound `propagate()` defined
  // later inside Phase 4's block.
  const _propagateP15 = (id) => {
    successors.get(id)?.forEach(({ wire }) => {
      const outIdx = wire.sourceOutputIndex || 0;
      const val = outIdx >= 1
        ? (nodeValues.get(id + '__out' + outIdx) ?? nodeValues.get(id) ?? 0)
        : (nodeValues.get(id) ?? 0);
      wireValues.set(wire.id, val);
    });
  };
  // Re-eval an asyncRead RAM combinationally with whatever address
  // is now visible on its input slot (after upstream cache settled).
  // Mirrors the Phase 1 RAM-asyncRead block (~line 580).
  const _evalRamAsync = (node) => {
    const ms = ffStates.get(node.id);
    if (!ms) return;
    const inputSlots = inputs.get(node.id) || [];
    const _readR = (s) => {
      if (!s) return 0;
      const outIdx = s.wire.sourceOutputIndex || 0;
      const k = outIdx === 0 ? s.sourceId : (s.sourceId + '__out' + outIdx);
      return nodeValues.get(k) ?? 0;
    };
    const addrSlot = inputSlots.find(s => s.inputIndex === 0);
    const reSlot   = inputSlots.find(s => s.inputIndex === 3);
    const addr = _readR(addrSlot);
    const re   = reSlot ? _readR(reSlot) : 1;
    const dMask = _mask(node.dataBits || 4);
    if (re) ms.q = ((ms.memory && ms.memory[addr]) ?? 0) & dMask;
    nodeValues.set(node.id, ms.q ?? 0);
  };
  for (let pass = 0; pass < _cacheNodesP15.length + 1; pass++) {
    for (const node of _cacheNodesP15) {
      const ms = ffStates.get(node.id);
      if (!ms) continue;
      _evalCacheCombinational(node, ms, inputs, nodeValues);
      _propagateP15(node.id);
    }
    for (const node of _ramNodesP15) {
      _evalRamAsync(node);
      _propagateP15(node.id);
    }
  }

  // ── PHASE 2: Detect rising clock edges, update FF state ───
  let ffUpdated = false;

  // Snapshot per-instruction sequence numbers BEFORE this phase runs
  // any FF updates. PIPE_REG.metaSeq propagation needs to read the
  // upstream stage's PREVIOUS-cycle value — if we read live, all
  // PIPE_REGs end up with the same seq (chicken-and-egg with FF
  // updates within one phase). The snapshot is keyed by node.id and
  // captures whatever seq field that node carried entering the phase.
  const _seqSnapshot = new Map();
  for (const node of nodes) {
    if (node.type === 'IR' || node.type === 'PIPE_REG') {
      const ms = ffStates.get(node.id);
      if (!ms) continue;
      if (node.type === 'IR') _seqSnapshot.set(node.id, ms.curSeq ?? -1);
      else _seqSnapshot.set(node.id, ms.metaSeq ?? -1);
    }
  }

  nodes.forEach(node => {
    if (!FF_TYPE_SET.has(node.type)) return;

    const inputSlots = inputs.get(node.id);

    // ── LATCH: level-sensitive (updates while enable is HIGH) ──
    if (node.type === 'LATCH_SLOT' && node.latchType) {
      const dataSlots = inputSlots;
      const dataArgs = dataSlots.map(s => wireValues.get(s.wire.id) ?? null);

      let ffState = ffStates.get(node.id);
      if (!ffState) {
        ffState = { q: 0, qNot: 1, prevClkValue: null };
        ffStates.set(node.id, ffState);
      }

      const { q: newQ, qNot: newQNot } = LATCH_FN[node.latchType](dataArgs, ffState.q);
      if (newQ !== ffState.q || newQNot !== ffState.qNot) {
        ffState.q    = newQ;
        ffState.qNot = newQNot;
        ffUpdated = true;
      }
      return;
    }

    // ── SCAN_FF: edge-triggered, mux of D/TI by TE ─────────
    // Pin layout: D=0, TI=1, TE=2, CLK=3. On rising clock edge,
    // Q ← (TE === 1 ? TI : D). Reads via _readSlot so any wire-level
    // fault (stuck-at / open / bridging) on any input is honoured.
    if (node.type === 'SCAN_FF') {
      const slotByIdx = new Map(inputSlots.map(s => [s.inputIndex, s]));
      const dSlot  = slotByIdx.get(0);
      const tiSlot = slotByIdx.get(1);
      const teSlot = slotByIdx.get(2);
      const ckSlot = slotByIdx.get(3);
      if (!ckSlot) return;
      const clkNow = wireValues.get(ckSlot.wire.id) ?? null;
      let ffState = ffStates.get(node.id);
      if (!ffState) {
        ffState = { q: node.initialQ ?? 0, qNot: (node.initialQ ?? 0) ^ 1, prevClkValue: null };
        ffStates.set(node.id, ffState);
      }
      const prevClk = ffState.prevClkValue;
      if (clkNow === 1 && prevClk === 0) {
        const te = teSlot ? (_readSlot(teSlot) ?? 0) : 0;
        const d  = dSlot  ? (_readSlot(dSlot)  ?? 0) : 0;
        const ti = tiSlot ? (_readSlot(tiSlot) ?? 0) : 0;
        const newQ = te === 1 ? ti : d;
        if (newQ !== ffState.q) {
          ffState.q    = newQ;
          ffState.qNot = newQ ^ 1;
          ffUpdated = true;
        }
      }
      if (clkNow !== null) ffState.prevClkValue = clkNow;
      return;
    }

    // ── FF: edge-triggered (updates on rising clock edge) ──
    const clkSlot = inputSlots.find(s => s.wire.isClockWire) ||
                    inputSlots.reduce((best, s) =>
                      (!best || s.inputIndex > best.inputIndex) ? s : best, null);

    if (!clkSlot) return;

    const clkNow = wireValues.get(clkSlot.wire.id) ?? null;

    let ffState = ffStates.get(node.id);
    if (!ffState) {
      ffState = { q: 0, qNot: 1, prevClkValue: null };
      ffStates.set(node.id, ffState);
    }

    const prevClk = ffState.prevClkValue;

    if (clkNow === 1 && prevClk === 0) {
      const dataSlots = inputSlots.filter(s => s !== clkSlot);
      const dataArgs  = dataSlots.map(s => wireValues.get(s.wire.id) ?? null);

      const ffType = node.type === 'FF_SLOT' ? node.ffType : FF_TYPE_MAP[node.type];
      const { q: newQ, qNot: newQNot } = FF_FN[ffType](dataArgs, ffState.q);

      if (newQ !== ffState.q || newQNot !== ffState.qNot) {
        ffState.q    = newQ;
        ffState.qNot = newQNot;
        ffUpdated = true;
      }
    }

    if (clkNow !== null) ffState.prevClkValue = clkNow;
  });

  // ── PHASE 2b: Memory components (clocked, bus-style) ──────────
  nodes.forEach(node => {
    if (!MEMORY_TYPE_SET.has(node.type)) return;

    const inputSlots = inputs.get(node.id);
    const clkSlot = inputSlots.find(s => s.wire.isClockWire) ||
                    inputSlots.reduce((best, s) =>
                      (!best || s.inputIndex > best.inputIndex) ? s : best, null);
    if (!clkSlot) return;

    const clkNow = wireValues.get(clkSlot.wire.id) ?? null;
    let ms = ffStates.get(node.id);
    if (!ms) {
      ms = { q: 0, prevClkValue: null };
      if (node.type === 'RAM' || node.type === 'ROM') ms.memory = node.memory ? { ...node.memory } : {};
      if (node.type === 'CACHE') {
        const N = node.lines || 4;
        if (node.mapping === 'set-assoc-2') {
          const sets = Math.max(1, N >> 1);
          ms.sets = Array.from({ length: sets }, () => [
            { tag: null, valid: 0, data: 0, lru: 0 },
            { tag: null, valid: 0, data: 0, lru: 0 },
          ]);
          ms.lruClock = 0;
        } else {
          ms.lines = Array.from({ length: N }, () => ({ tag: null, valid: 0, data: 0 }));
        }
        ms.stats = { hits: 0, misses: 0 };
      }
      if (node.type === 'COUNTER') ms.count = 0;
      ffStates.set(node.id, ms);
    }

    const prevClk = ms.prevClkValue;
    const _w = (slot) => slot ? (wireValues.get(slot.wire.id) ?? 0) : 0;
    const dataSlots = inputSlots.filter(s => s !== clkSlot);

    // Rising edge: 0 → 1
    if (clkNow === 1 && prevClk === 0) {
      const bits = node.bitWidth || node.dataBits || 4;
      const oldQ = ms.q;

      if (node.type === 'REGISTER') {
        // Inputs: DATA(0), EN(1), CLR(2), CLK
        const data = _w(dataSlots[0]);
        const en   = _w(dataSlots[1]) ?? 1;
        const clr  = _w(dataSlots[2]);
        if (clr)     ms.q = 0;
        else if (en) ms.q = data & (_mask(bits));

      } else if (node.type === 'SHIFT_REG') {
        // Inputs: DIN(0), DIR(1), EN(2), CLR(3), CLK
        const din = _w(dataSlots[0]) & 1;
        const dir = _w(dataSlots[1]);   // 0=left, 1=right
        const en  = _w(dataSlots[2]) ?? 1;
        const clr = _w(dataSlots[3]);
        const mask = _mask(bits);
        if (clr) {
          ms.q = 0;
        } else if (en) {
          if (dir === 0) {
            ms.q = ((ms.q << 1) | din) & mask;    // shift left, new bit at LSB
          } else {
            ms.q = ((ms.q >>> 1) | (din << (bits - 1))) & mask; // shift right, new bit at MSB
          }
        }

      } else if (node.type === 'COUNTER') {
        // Inputs: EN(0), LOAD(1), DATA(2), CLR(3), CLK
        const en   = _w(dataSlots[0]) ?? 1;
        const load = _w(dataSlots[1]);
        const data = _w(dataSlots[2]);
        const clr  = _w(dataSlots[3]);
        const mask = _mask(bits);
        if (clr) {
          ms.count = 0;
        } else if (load) {
          ms.count = data & mask;
        } else if (en) {
          ms.count = (ms.count + 1) & mask;
        }
        ms.q = ms.count;

      } else if (node.type === 'RAM') {
        // RAM write is deferred to Phase 4 (needs fresh RF values for STORE)
        // Only update read output here
        const addr = _w(dataSlots[0]);
        const re   = _w(dataSlots[3]) ?? 1;
        const dMask = _mask(node.dataBits || 4);
        if (re) ms.q = (ms.memory[addr] ?? 0) & dMask;

      } else if (node.type === 'ROM') {
        // Inputs: ADDR(0), RE(1), CLK
        // Skip clocked load when asyncRead is on — Phase 1 already refreshed ms.q.
        if (!node.asyncRead) {
          const addr = _w(dataSlots[0]);
          const re   = _w(dataSlots[1]) ?? 1;
          const dMask = _mask(node.dataBits || 4);
          if (re) ms.q = ((node.memory && node.memory[addr]) ?? 0) & dMask;
        }

      } else if (node.type === 'REG_FILE_DP') {
        // Dual-port RF: read only in Phase 2b, write deferred to Phase 4
        const dMask = _mask(node.dataBits || 8);
        const regCnt = node.regCount || 8;
        if (!ms.regs) ms.regs = node.initialRegs ? [...node.initialRegs] : new Array(regCnt).fill(0);
        const rd1Addr = _w(dataSlots[0]);
        const rd2Addr = _w(dataSlots[1]);
        const readR0 = (idx) => (node.protectR0 && (idx % regCnt) === 0) ? 0 : (ms.regs[idx % regCnt] ?? 0);
        ms.q = readR0(rd1Addr) & dMask;
        nodeValues.set(node.id + '__out1', readR0(rd2Addr) & dMask);

      } else if (node.type === 'REG_FILE') {
        // REG_FILE write is deferred to Phase 4 (after combinational re-eval)
        // so it can use fresh ALU results. Only update read output here.
        const dMask  = _mask(node.dataBits || 8);
        const regCnt = node.regCount || 8;
        if (!ms.regs) ms.regs = new Array(regCnt).fill(0);
        const rdAddr = _w(dataSlots[0]);
        ms.q = (ms.regs[rdAddr % regCnt] ?? 0) & dMask;

      } else if (node.type === 'FIFO') {
        // Inputs: DATA(0), WR(1), RD(2), CLR(3), CLK
        const data = _w(dataSlots[0]);
        const wr   = _w(dataSlots[1]);
        const rd   = _w(dataSlots[2]);
        const clr  = _w(dataSlots[3]);
        const depth = node.depth || 8;
        const dMask = _mask(node.dataBits || 8);
        if (!ms.buffer) ms.buffer = [];
        if (clr) {
          ms.buffer = [];
        } else {
          if (wr && ms.buffer.length < depth) {
            ms.buffer.push(data & dMask);
          }
          if (rd && ms.buffer.length > 0) {
            ms.q = ms.buffer.shift();  // dequeue front
          }
        }
        if (ms.buffer.length > 0 && !rd) ms.q = ms.buffer[0] ?? 0;
        ms.full  = ms.buffer.length >= depth ? 1 : 0;
        ms.empty = ms.buffer.length === 0 ? 1 : 0;

      } else if (node.type === 'STACK') {
        // Inputs: DATA(0), PUSH(1), POP(2), CLR(3), CLK
        const data = _w(dataSlots[0]);
        const push = _w(dataSlots[1]);
        const pop  = _w(dataSlots[2]);
        const clr  = _w(dataSlots[3]);
        const depth = node.depth || 8;
        const dMask = _mask(node.dataBits || 8);
        if (!ms.buffer) ms.buffer = [];
        if (clr) {
          ms.buffer = [];
        } else {
          if (push && ms.buffer.length < depth) {
            ms.buffer.push(data & dMask);
          }
          if (pop && ms.buffer.length > 0) {
            ms.q = ms.buffer.pop();  // pop top
          }
        }
        if (ms.buffer.length > 0 && !pop) ms.q = ms.buffer[ms.buffer.length - 1] ?? 0;
        ms.full  = ms.buffer.length >= depth ? 1 : 0;
        ms.empty = ms.buffer.length === 0 ? 1 : 0;

      } else if (node.type === 'PIPE_REG') {
        // Inputs: D0..Dn-1, STALL, FLUSH, CLK
        const ch = node.channels || 4;
        if (!ms.channels) ms.channels = new Array(ch).fill(0);
        if (typeof ms.metaSeq !== 'number') ms.metaSeq = -1;
        const stall = _w(dataSlots[ch])     ?? 0;
        const flush = _w(dataSlots[ch + 1]) ?? 0;
        if (flush) {
          // Clear all channels + metadata. Sentinel -1 marks a bubble
          // — engine-internal "no real instruction in this stage"; used
          // by the per-instruction branch-flush gate at WB.
          for (let i = 0; i < ch; i++) ms.channels[i] = 0;
          ms.metaSeq = -1;
        } else if (!stall) {
          // Normal latch
          for (let i = 0; i < ch; i++) {
            ms.channels[i] = _w(dataSlots[i]) ?? 0;
          }
          // Inherit the upstream stage's instruction sequence number.
          // The "data" channels of a pipeline register can come from
          // many sources (RF reads, CU outputs, IR fields, immediate
          // path, etc.) — only IR and another PIPE_REG carry the
          // canonical instruction-id. Scan all data input slots; pick
          // the first one whose source is an IR (prefer) or PIPE_REG.
          // All such donors should agree because they all reflect the
          // same in-flight instruction at this stage boundary.
          let upSeq = -1;
          for (let k = 0; k < ch; k++) {
            const slot = dataSlots[k];
            if (!slot) continue;
            const upNode = nodeMap.get(slot.sourceId);
            if (!upNode) continue;
            // Read from the pre-phase snapshot (NOT live ms.metaSeq /
            // ms.curSeq), so each PIPE_REG sees its upstream as it
            // was at the START of this cycle's rising edge.
            if (upNode.type === 'IR' && _seqSnapshot.has(upNode.id)) {
              upSeq = _seqSnapshot.get(upNode.id);
              break; // IR is the canonical source — no need to look further
            }
            if (upNode.type === 'PIPE_REG' && _seqSnapshot.has(upNode.id) && upSeq === -1) {
              upSeq = _seqSnapshot.get(upNode.id); // tentative; keep scanning for an IR
            }
          }
          ms.metaSeq = upSeq;
        }
        // If stall: keep previous values + previous metaSeq (do nothing).
        ms.q = ms.channels[0] ?? 0;

      } else if (node.type === 'IR') {
        // Inputs: INSTR(0), LD(1), CLK
        const instr = _w(dataSlots[0]);
        const ld    = _w(dataSlots[1]) ?? 1;
        const iWidth = node.instrWidth || 16;
        const mask   = _mask(iWidth);
        // Per-instruction sequence number: monotonic, assigned every
        // time IR latches a new instruction. Carried forward through
        // the PIPE_REGs (as metaSeq) so the WB-stage write gate can
        // tell which instructions are speculative (issued AFTER a
        // branch fired) and which are not (issued BEFORE).
        if (typeof ms.nextSeq !== 'number') { ms.nextSeq = 0; ms.curSeq = 0; }
        if (ld) {
          ms.q = instr & mask;
          ms.curSeq = ms.nextSeq++;
        }

      } else if (node.type === 'PC') {
        // PC is handled by Phase 4 (needs fresh CU.JMP signal)
        // Skip here — Phase 4 will do the actual update
      }

      if (ms.q !== oldQ) ffUpdated = true;
    }

    // REG_FILE, PC prevClk is managed by Phase 4
    // RAM: update prevClk here but skip write (Phase 4 handles write with fresh values)
    if (node.type !== 'REG_FILE' && node.type !== 'REG_FILE_DP' && node.type !== 'PC' && clkNow !== null) ms.prevClkValue = clkNow;
  });

  // ── PHASE 3: Re-propagate FF outputs if state changed ─────
  if (ffUpdated) {
    nodes.forEach(node => {
      if (!FF_TYPE_SET.has(node.type) && !MEMORY_TYPE_SET.has(node.type)) return;

      if (MEMORY_TYPE_SET.has(node.type)) {
        const ms = ffStates.get(node.id);
        if (!ms) return;
        nodeValues.set(node.id, ms.q ?? 0);
        if (node.type === 'PIPE_REG') {
          const ch = ms.channels || [];
          for (let i = 0; i < ch.length; i++) {
            nodeValues.set(node.id + '__out' + i, ch[i] ?? 0);
          }
          nodeValues.set(node.id, ch[0] ?? 0);
          successors.get(node.id)?.forEach(({ wire }) => {
            const outIdx = wire.sourceOutputIndex || 0;
            wireValues.set(wire.id, nodeValues.get(node.id + '__out' + outIdx) ?? 0);
          });
          return;
        }
        if (node.type === 'IR') {
          const instr = ms.q ?? 0;
          const opBits = node.opBits || 4, rdBits = node.rdBits || 4, rs1Bits = node.rs1Bits || 4, rs2Bits = node.rs2Bits || 4;
          const opVal = (instr >> (rs2Bits + rs1Bits + rdBits)) & _mask(opBits);
          nodeValues.set(node.id, opVal); // primary value = OP field
          nodeValues.set(node.id + '__out0', opVal);
          nodeValues.set(node.id + '__out1', (instr >> (rs2Bits + rs1Bits))          & _mask(rdBits));
          nodeValues.set(node.id + '__out2', (instr >> rs2Bits)                       & (_mask(rs1Bits)));
          nodeValues.set(node.id + '__out3', instr                                    & (_mask(rs2Bits)));
          successors.get(node.id)?.forEach(({ wire }) => {
            const outIdx = wire.sourceOutputIndex || 0;
            wireValues.set(wire.id, nodeValues.get(node.id + '__out' + outIdx) ?? 0);
          });
          return;
        }
        if (node.type === 'COUNTER') {
          const maxVal = _mask(node.bitWidth || 4);
          nodeValues.set(node.id + '__out1', ms.count === maxVal ? 1 : 0);
        }
        if (node.type === 'FIFO' || node.type === 'STACK') {
          nodeValues.set(node.id + '__out1', ms.full ?? 0);
          nodeValues.set(node.id + '__out2', ms.empty ?? 1);
        }
        successors.get(node.id)?.forEach(({ wire }) => {
          const outIdx = wire.sourceOutputIndex || 0;
          if (outIdx >= 1) wireValues.set(wire.id, nodeValues.get(node.id + '__out' + outIdx) ?? 0);
          else wireValues.set(wire.id, ms.q ?? 0);
        });
        return;
      }

      const ffState = ffStates.get(node.id) || { q: 0, qNot: 1 };
      nodeValues.set(node.id, ffState.q);
      nodeValues.set(node.id + '__qnot', ffState.qNot);

      successors.get(node.id)?.forEach(({ wire }) => {
        const outIdx = wire.sourceOutputIndex || 0;
        const val    = outIdx === 1 ? ffState.qNot : ffState.q;
        wireValues.set(wire.id, val);
      });
    });

    // Re-run full Phase 1 evaluation for all non-source nodes
    order.forEach(id => {
      const node = nodeMap.get(id);
      // Skip sources — they already have correct values
      if (FF_TYPE_SET.has(node.type) || MEMORY_TYPE_SET.has(node.type) || node.type === 'INPUT' ||
          node.type === 'CLOCK' || node.type === 'MUX_SELECT' || node.type === 'IMM' ||
          node.type === 'DISPLAY_7SEG') return;

      // Re-evaluate by simulating the same logic as Phase 1
      // Read fresh values from nodeValues (updated by Phase 2b/3)
      const inputSlots = inputs.get(id);
      let value = null;

      if (node.type === 'GATE_SLOT') {
        if (node.gate != null) {
          const args = inputSlots.map(slot => _readSlot(slot));
          if (!args.some(a => a === null || a === undefined)) {
            value = GATE_FN[node.gate](...args);
          }
        }
      } else if (node.type === 'OUTPUT') {
        if (inputSlots.length > 0) {
          const slot = inputSlots[0];
          const outIdx = slot.wire.sourceOutputIndex || 0;
          if (outIdx === 1 && FF_TYPE_SET.has(nodeMap.get(slot.sourceId)?.type)) {
            value = nodeValues.get(slot.sourceId + '__qnot') ?? null;
          } else if (outIdx >= 1) {
            value = nodeValues.get(slot.sourceId + '__out' + outIdx) ?? null;
          } else {
            value = nodeValues.get(slot.sourceId) ?? null;
          }
        }
      } else if (node.type === 'BUS') {
        const srcCount = node.sourceCount || 3;
        let activeCount = 0; let busVal = null;
        for (let s = 0; s < srcCount; s++) {
          const dSlot = inputSlots.find(sl => sl.inputIndex === s*2);
          const enSlot = inputSlots.find(sl => sl.inputIndex === s*2+1);
          const d = dSlot ? (nodeValues.get(dSlot.sourceId) ?? 0) : 0;
          const en = enSlot ? (nodeValues.get(enSlot.sourceId) ?? 0) : 0;
          if (en) { activeCount++; busVal = d; }
        }
        value = activeCount === 0 ? null : busVal;
        nodeValues.set(id + '__out1', activeCount > 1 ? 1 : 0);
      } else if (node.type === 'CU') {
        const op = inputSlots[0] ? (nodeValues.get(inputSlots[0].sourceId) ?? 0) : 0;
        const z = inputSlots[1] ? (nodeValues.get(inputSlots[1].sourceId) ?? 0) : 0;
        const c = inputSlots[2] ? (nodeValues.get(inputSlots[2].sourceId) ?? 0) : 0;
        const cu = _evalCU(node, op, z, c);
        const cuJmp = _suppressReFireJmp(node, cu.jmp);
        value = cu.aluOp;
        nodeValues.set(id+'__out0',cu.aluOp);nodeValues.set(id+'__out1',cu.regWe);nodeValues.set(id+'__out2',cu.memWe);nodeValues.set(id+'__out3',cu.memRe);nodeValues.set(id+'__out4',cuJmp);nodeValues.set(id+'__out5',cu.halt);nodeValues.set(id+'__out6',cu.immSel);
      } else if (node.type === 'MUX') {
        // Re-evaluate so multi-output sources (PIPE_REG channels, IR fields)
        // deliver the right post-edge values to data + select inputs.
        const n = node.inputCount || 2;
        const selCount = Math.ceil(Math.log2(n));
        const dataInputs = inputSlots.slice(0, n);
        const selInputs = inputSlots.slice(n, n + selCount);
        const _readSlot = (slot) => {
          if (!slot) return null;
          const outIdx = slot.wire.sourceOutputIndex || 0;
          const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
          return nodeValues.get(key);
        };
        let selIdx = 0;
        let selValid = true;
        for (let s = 0; s < selInputs.length; s++) {
          const sv = _readSlot(selInputs[s]);
          if (sv === null || sv === undefined) { selValid = false; break; }
          selIdx |= (sv << s);
        }
        if (!selValid || selIdx >= dataInputs.length) {
          value = null;
        } else {
          value = _readSlot(dataInputs[selIdx]) ?? null;
        }
      } else if (node.type === 'SPLIT') {
        // Re-evaluate so multi-output drivers (FWD, etc.) deliver
        // post-edge values into the bit-slices that downstream MUX
        // selectors read. Without this, P3 generic eval would set
        // every successor wire to the same primary value.
        const slot = inputSlots[0];
        let inVal = 0;
        if (slot) {
          const outIdx = slot.wire.sourceOutputIndex || 0;
          const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
          inVal = nodeValues.get(key) ?? 0;
        }
        const slices = parseSlices(node.slicesSpec || '');
        for (let i = 0; i < slices.length; i++) {
          const s = slices[i];
          const width = sliceWidth(s);
          const mask = width >= 32 ? 0xFFFFFFFF : ((1 << width) - 1);
          const sliced = ((inVal >>> s.lo) & mask) >>> 0;
          nodeValues.set(id + '__out' + i, sliced);
        }
        value = slices.length > 0 ? (nodeValues.get(id + '__out0') ?? 0) : 0;
      } else if (node.type === 'MERGE') {
        // Re-evaluate so IR-field inputs deliver post-edge values into
        // the merged immediate that pipe_idex captures next cycle.
        const slices = parseSlices(node.slicesSpec || '');
        const outBits = node.outBits || 8;
        const outMask = outBits >= 32 ? 0xFFFFFFFF : ((1 << outBits) - 1);
        let merged = 0;
        for (let i = 0; i < slices.length; i++) {
          const s = slices[i];
          const width = sliceWidth(s);
          const partMask = width >= 32 ? 0xFFFFFFFF : ((1 << width) - 1);
          const slot = inputSlots.find(sl => sl.inputIndex === i);
          let v = 0;
          if (slot) {
            const outIdx = slot.wire.sourceOutputIndex || 0;
            const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
            v = nodeValues.get(key) ?? 0;
          }
          merged = (merged | ((v & partMask) << s.lo)) >>> 0;
        }
        value = merged & outMask;
      } else if (node.type === 'SIGN_EXT') {
        const slot = inputSlots[0];
        let inVal = 0;
        if (slot) {
          const outIdx = slot.wire.sourceOutputIndex || 0;
          const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
          inVal = nodeValues.get(key) ?? 0;
        }
        const inBits = node.inBits || 4;
        const outBits = node.outBits || 8;
        const signBit = (inVal >> (inBits - 1)) & 1;
        if (signBit) {
          const mask = (_mask(outBits)) ^ (_mask(inBits));
          value = (inVal | mask) & (_mask(outBits));
        } else {
          value = inVal & (_mask(inBits));
        }
      } else if (node.type === 'HDU' || node.type === 'FWD') {
        // Re-evaluate using the current __out values of multi-output sources.
        const get = (i) => {
          const slot = inputSlots[i];
          if (!slot) return 0;
          const outIdx = slot.wire.sourceOutputIndex || 0;
          const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
          return nodeValues.get(key) ?? 0;
        };
        if (node.type === 'HDU') {
          const memRead = get(0) ? 1 : 0;
          const idexRt  = get(1);
          const ifidRs  = get(2);
          const ifidRt  = get(3);
          const stall = memRead && (idexRt === ifidRs || idexRt === ifidRt) ? 1 : 0;
          nodeValues.set(id + '__out0', stall ? 0 : 1);
          nodeValues.set(id + '__out1', stall ? 0 : 1);
          nodeValues.set(id + '__out2', stall);
          value = stall;
        } else {
          const idexRs  = get(0);
          const idexRt  = get(1);
          const exmemRd = get(2);
          const exmemRW = get(3) ? 1 : 0;
          const memwbRd = get(4);
          const memwbRW = get(5) ? 1 : 0;
          let fwdA = 0;
          if (exmemRW && exmemRd !== 0 && exmemRd === idexRs) fwdA = 2;
          else if (memwbRW && memwbRd !== 0 && memwbRd === idexRs) fwdA = 1;
          let fwdB = 0;
          if (exmemRW && exmemRd !== 0 && exmemRd === idexRt) fwdB = 2;
          else if (memwbRW && memwbRd !== 0 && memwbRd === idexRt) fwdB = 1;
          nodeValues.set(id + '__out0', fwdA);
          nodeValues.set(id + '__out1', fwdB);
          value = fwdA;
        }
      } else if (node.type === 'ALU') {
        const _readSlot = (slot) => {
          if (!slot) return 0;
          const outIdx = slot.wire.sourceOutputIndex || 0;
          const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
          return nodeValues.get(key) ?? 0;
        };
        const a = _readSlot(inputSlots[0]);
        const b = _readSlot(inputSlots[1]);
        const op = _readSlot(inputSlots[2]);
        const bits = node.bitWidth || 8; const mask = (1<<bits)-1;
        let r=0, carry=0;
        switch(op&7){case 0:{const s=a+b;r=s&mask;carry=(s>>bits)&1;break;}case 1:{const s=a-b;r=s&mask;carry=s<0?1:0;break;}case 2:r=(a&b)&mask;break;case 3:r=(a|b)&mask;break;case 4:r=(a^b)&mask;break;case 5:{const s=a<<(b&0xF);r=s&mask;carry=(s>>bits)&1;break;}case 6:r=(a>>>(b&0xF))&mask;break;case 7:{if(node.sraMode){const k=b&0x7;const sb=(a>>(bits-1))&1;r=(a>>>k)&mask;if(sb&&k>0)r=(r|(((_mask(bits))<<(bits-k))&mask))&mask;}else{r=a===b?0:(a-b)&mask;carry=a>b?1:0;}break;}}
        value = r;
        nodeValues.set(id+'__out0',r);nodeValues.set(id+'__out1',r===0?1:0);nodeValues.set(id+'__out2',carry);
      } else {
        // Generic combinational: read first input
        if (inputSlots.length > 0) {
          value = nodeValues.get(inputSlots[0].sourceId) ?? null;
        }
      }

      nodeValues.set(id, value);
      successors.get(id)?.forEach(({ wire }) => {
        const outIdx = wire.sourceOutputIndex || 0;
        if (node.type === 'ALU' || node.type === 'CU' || node.type === 'BUS' ||
            node.type === 'HDU' || node.type === 'FWD' || node.type === 'SPLIT') {
          wireValues.set(wire.id, nodeValues.get(id + '__out' + outIdx) ?? value);
        } else {
          wireValues.set(wire.id, value);
        }
      });
    });
  }

  // ── PHASE 4: Full CPU feedback loop resolution ──
  // Re-run the entire combinational + write chain with fresh values:
  // RF read → ALU → CU (flags) → RF write + PC jump + Outputs
  {
    const _nv = (id) => nodeValues.get(id) ?? 0;
    const _wv = (wid) => wireValues.get(wid) ?? 0;
    const propagate = (id) => {
      successors.get(id)?.forEach(({ wire }) => {
        const outIdx = wire.sourceOutputIndex || 0;
        const val = outIdx >= 1 ? (nodeValues.get(id + '__out' + outIdx) ?? _nv(id)) : _nv(id);
        wireValues.set(wire.id, val);
      });
    };

    // 4a: CU recompute first (needs fresh IR.OP from Phase 3)
    for (const node of nodes) {
      if (node.type !== 'CU') continue;
      const id = node.id;
      const inputSlots = inputs.get(id);
      const op = inputSlots[0] ? _nv(inputSlots[0].sourceId) : 0;
      const z  = inputSlots[1] ? _nv(inputSlots[1].sourceId) : 0;
      const c  = inputSlots[2] ? _nv(inputSlots[2].sourceId) : 0;
      const { aluOp, regWe, memWe, memRe, jmp, halt, immSel } = _evalCU(node, op, z, c);
      const jmpFinal = _suppressReFireJmp(node, jmp);
      nodeValues.set(id, aluOp);
      nodeValues.set(id+'__out0',aluOp);nodeValues.set(id+'__out1',regWe);nodeValues.set(id+'__out2',memWe);nodeValues.set(id+'__out3',memRe);nodeValues.set(id+'__out4',jmpFinal);nodeValues.set(id+'__out5',halt);nodeValues.set(id+'__out6',immSel);
      propagate(id);
    }

    // 4b: RF read with fresh addresses from IR
    for (const node of nodes) {
      if (node.type !== 'REG_FILE' && node.type !== 'REG_FILE_DP') continue;
      const ms = ffStates.get(node.id);
      if (!ms || !ms.regs) continue;
      const inputSlots = inputs.get(node.id);
      const clkSlot = inputSlots.find(s => s.wire.isClockWire);
      if (!clkSlot) continue;
      const dataSlots = inputSlots.filter(s => s !== clkSlot);
      const dMask = _mask(node.dataBits || 8);
      const regCnt = node.regCount || 8;
      const rd1Addr = dataSlots[0] ? _wv(dataSlots[0].wire.id) : 0;
      const readR0P4b = (idx) => (node.protectR0 && (idx % regCnt) === 0) ? 0 : (ms.regs[idx % regCnt] ?? 0);
      ms.q = readR0P4b(rd1Addr) & dMask;
      nodeValues.set(node.id, ms.q);
      if (node.type === 'REG_FILE_DP') {
        const rd2Addr = dataSlots[1] ? _wv(dataSlots[1].wire.id) : 0;
        nodeValues.set(node.id + '__out1', readR0P4b(rd2Addr) & dMask);
      }
      propagate(node.id);
    }

    // Determine current instruction opcode and immSel from CU, IMM from IR
    let _currentOpcode = -1;
    let _immSel = 0;
    let _immValue = 0;
    for (const node of nodes) {
      if (node.type === 'CU') {
        const cuInputs = inputs.get(node.id);
        _currentOpcode = cuInputs[0] ? _nv(cuInputs[0].sourceId) : 0;
        _immSel = _nv(node.id + '__out6');
      } else if (node.type === 'IR') {
        // Combine RS1:RS2 fields as 8-bit immediate
        const rs1 = _nv(node.id + '__out2');
        const rs2 = _nv(node.id + '__out3');
        _immValue = ((rs1 & 0xF) << 4) | (rs2 & 0xF);
      }
    }

    // 4b: ALU recompute + latch Z/C flags (persistent across ticks)
    // Read persisted flags
    let _flagState = ffStates.get('__cpu_flags__') || { z: 0, c: 0 };
    const _readSlotP4 = (slot) => {
      if (!slot) return 0;
      const outIdx = slot.wire.sourceOutputIndex || 0;
      const key = outIdx === 0 ? slot.sourceId : (slot.sourceId + '__out' + outIdx);
      return nodeValues.get(key) ?? 0;
    };
    for (const node of nodes) {
      if (node.type !== 'ALU') continue;
      const id = node.id;
      const inputSlots = inputs.get(id);
      const a  = _readSlotP4(inputSlots[0]);
      const b  = _readSlotP4(inputSlots[1]);
      const op = _readSlotP4(inputSlots[2]);
      const bits = node.bitWidth || 8, mask = _mask(bits);
      let r = 0, carry = 0;
      switch (op & 7) {
        case 0: { const s = a + b; r = s & mask; carry = (s >> bits) & 1; break; }
        case 1: { const s = a - b; r = s & mask; carry = s < 0 ? 1 : 0; break; }
        case 2: r = (a & b) & mask; break; case 3: r = (a | b) & mask; break;
        case 4: r = (a ^ b) & mask; break;
        case 5: { const s = a << (b & 0xF); r = s & mask; carry = (s >> bits) & 1; break; }
        case 6: r = (a >>> (b & 0xF)) & mask; break;
        case 7: {
          if (node.sraMode) {
            const k = b & 0x7;
            const sb = (a >> (bits - 1)) & 1;
            r = (a >>> k) & mask;
            if (sb && k > 0) r = (r | (((_mask(bits)) << (bits - k)) & mask)) & mask;
          } else {
            r = a === b ? 0 : (a - b) & mask; carry = a > b ? 1 : 0;
          }
          break;
        }
      }
      nodeValues.set(id, r);
      const zFlag = r === 0 ? 1 : 0;
      nodeValues.set(id + '__out1', zFlag);
      nodeValues.set(id + '__out2', carry);
      // Only CMP (alu_op=7 in our ISA) updates flags. ADD/SUB/AND/OR/etc.
      // produce a result but leave flags unchanged. NOP (alu_op=0 with no
      // reg_we) must definitely not pollute Z/C between a CMP and the
      // following branch.
      if ((op & 7) === 7) {
        _flagState = { z: zFlag, c: carry };
        ffStates.set('__cpu_flags__', _flagState);
      }
      propagate(id);
    }

    // 4c2: RAM write + read with fresh RF/CU values (for STORE/LOAD)
    for (const node of nodes) {
      if (node.type !== 'RAM') continue;
      const ms = ffStates.get(node.id);
      if (!ms) continue;
      const inputSlots = inputs.get(node.id);
      const clkSlot = inputSlots.find(s => s.wire.isClockWire);
      if (!clkSlot) continue;
      const clkNow = _wv(clkSlot.wire.id);
      if (clkNow === 1) {
        const dataSlots = inputSlots.filter(s => s !== clkSlot);
        const addr = dataSlots[0] ? _wv(dataSlots[0].wire.id) : 0;
        const data = dataSlots[1] ? _wv(dataSlots[1].wire.id) : 0;
        const we   = dataSlots[2] ? _wv(dataSlots[2].wire.id) : 0;
        const re   = dataSlots[3] ? _wv(dataSlots[3].wire.id) : 1;
        const dMask = _mask(node.dataBits || 4);
        if (we) ms.memory[addr] = data & dMask;
        if (re) ms.q = (ms.memory[addr] ?? 0) & dMask;
        nodeValues.set(node.id, ms.q);
        propagate(node.id);
      }
    }

    // 4c2.5pre: settle DATA_OUT through any cache hierarchy (L1 → L2 → ...).
    // When two CACHE components are wired in series, the inner cache's
    // DATA_OUT feeds the outer cache's MEM_DATA_IN. The outer cache must
    // see the inner's settled value before downstream consumers (Phase
    // 4c3 BUS_MUX, Phase 4d CU re-eval, Phase 4e WB) read it. Iterate
    // `numCaches` times (sufficient for any acyclic cascade depth); no
    // state mutation or counter update — pure combinational re-eval.
    // Body shared with Phase 1 + Phase 1.5 via _evalCacheCombinational.
    const _cacheNodes = nodes.filter(n => n.type === 'CACHE');
    for (let pass = 0; pass < _cacheNodes.length; pass++) {
      for (const node of _cacheNodes) {
        const ms = ffStates.get(node.id);
        if (!ms) continue;
        _evalCacheCombinational(node, ms, inputs, nodeValues);
        propagate(node.id);
      }
    }

    // 4c2.5: CACHE side effects — fill lines on miss, update counters.
    // Runs after Phase 4c2 has settled RAM AND after the cascade settle
    // pass above, so MEM_DATA_IN reflects the real value coming back
    // from the layer below this cycle. Gated on the rising CLK edge so
    // each access mutates state exactly once per real bus cycle.
    // Helper: locate the RAM (or downstream cache) wired to this cache's
    // MEM_ADDR output — needed for write-back eviction, which mutates
    // the next layer's storage directly (the bus is busy with the
    // refill so we cannot drive a real bus writeback in the same cycle).
    const _findConnectedMem = (cacheId) => {
      for (const n of nodes) {
        if (n.type !== 'RAM' && n.type !== 'CACHE') continue;
        const slots = inputs.get(n.id) || [];
        for (const s of slots) {
          if (s.sourceId === cacheId && (s.wire.sourceOutputIndex || 0) === 3) return n;
        }
      }
      return null;
    };
    for (const node of nodes) {
      if (node.type !== 'CACHE') continue;
      const id = node.id;
      const ms = ffStates.get(id);
      if (!ms) continue;
      const inputSlots = inputs.get(id);
      const _readSlotC = (s) => {
        if (!s) return 0;
        const outIdx = s.wire.sourceOutputIndex || 0;
        const k = outIdx === 0 ? s.sourceId : (s.sourceId + '__out' + outIdx);
        return nodeValues.get(k) ?? 0;
      };
      const clkSlotC  = inputSlots.find(s => s.wire.isClockWire) || inputSlots.find(s => s.inputIndex === 4);
      const clkNow    = clkSlotC ? (_wv(clkSlotC.wire.id) ?? 0) : 0;
      const prevClkC  = ms.prevCacheClk ?? null;
      const isRisingEdge = (clkNow === 1 && prevClkC === 0);
      ms.prevCacheClk = clkNow;

      const addrSlot   = inputSlots.find(s => s.inputIndex === 0);
      const dataSlotC  = inputSlots.find(s => s.inputIndex === 1);
      const weSlot     = inputSlots.find(s => s.inputIndex === 2);
      const reSlot     = inputSlots.find(s => s.inputIndex === 3);
      const memDiSlot  = inputSlots.find(s => s.inputIndex === 5);
      const addr      = _readSlotC(addrSlot);
      const dataInCpu = _readSlotC(dataSlotC);
      const we        = _readSlotC(weSlot)  ? 1 : 0;
      const re        = _readSlotC(reSlot)  ? 1 : 0;
      const memDataIn = _readSlotC(memDiSlot);
      const dMask     = _mask(node.dataBits || 8);

      const N         = node.lines || 4;
      const isAccess  = re || we;
      const isSetAssoc = !!ms.sets;

      let hit = 0, hitData = 0;
      let setIdx = 0, tag = 0, set = null, idx = 0, line = null;

      if (isSetAssoc) {
        const sets      = ms.sets.length;
        const indexBits = Math.max(0, Math.ceil(Math.log2(sets)));
        setIdx = sets > 1 ? (addr & (sets - 1)) : 0;
        tag    = sets > 1 ? (addr >>> indexBits) : addr;
        set    = ms.sets[setIdx];
        if (isAccess && set) {
          for (const w of set) {
            if (w.valid === 1 && w.tag === tag) { hit = 1; hitData = w.data; break; }
          }
        }
      } else {
        const indexBits = Math.max(1, Math.ceil(Math.log2(N)));
        idx  = addr & (N - 1);
        tag  = addr >>> indexBits;
        line = ms.lines && ms.lines[idx];
        if (isAccess && line && line.valid === 1 && line.tag === tag) {
          hit = 1; hitData = line.data;
        }
      }

      // Always refresh DATA_OUT with the now-settled value so the LED
      // shows the right thing this cycle even on a miss (the RAM read
      // happens combinationally via asyncRead). On hit, serve from line.
      const dataOut = hit ? (hitData & dMask) : (memDataIn & dMask);
      nodeValues.set(id, dataOut);
      propagate(id);

      // Side effects only on the rising edge of CLK — once per real
      // bus cycle. evaluate() may be called multiple times per cycle
      // (e.g. tooling that calls it twice for clk=0 then clk=1); the
      // edge gate makes this idempotent.
      if (!isRisingEdge || !isAccess) continue;

      const isWriteBack = node.writePolicy === 'write-back';
      // Write-back eviction: when a dirty line is replaced, push its
      // value to the next memory layer. We mutate that layer directly
      // (RAM.memory or downstream CACHE.lines/sets) because the wire
      // bus is occupied by the refill. Counted in stats.writebacks.
      const _writeback = (oldTag, oldIdx, oldData, oldDirty) => {
        if (!isWriteBack || !oldDirty) return;
        if (!ms.connectedMemId) {
          const mem = _findConnectedMem(id);
          if (mem) ms.connectedMemId = mem.id;
        }
        if (!ms.connectedMemId) return;
        // Reconstruct the address: addr = (tag << indexBits) | idx.
        // For sets > 1: indexBits = log2(sets); idx = setIdx.
        // For direct: indexBits = log2(N); idx = lineIdx.
        // For fully-assoc (sets=1, indexBits=0): addr = tag.
        let addrBack;
        if (isSetAssoc) {
          const sets2 = ms.sets.length;
          const ib2   = sets2 > 1 ? Math.max(0, Math.ceil(Math.log2(sets2))) : 0;
          addrBack = sets2 > 1 ? ((oldTag << ib2) | oldIdx) : oldTag;
        } else {
          const ib2 = Math.max(1, Math.ceil(Math.log2(node.lines || 4)));
          addrBack = (oldTag << ib2) | oldIdx;
        }
        const memMs = ffStates.get(ms.connectedMemId);
        if (!memMs) return;
        if (memMs.memory) {
          memMs.memory[addrBack] = oldData & dMask;
        }
        ms.stats.writebacks = (ms.stats.writebacks || 0) + 1;
      };

      if (isSetAssoc) {
        ms.lruClock = (ms.lruClock || 0) + 1;
        if (hit) {
          ms.stats.hits++;
          for (const w of set) {
            if (w.valid === 1 && w.tag === tag) {
              w.lru = ms.lruClock;
              if (we) {
                w.data = dataInCpu & dMask;
                if (isWriteBack) w.dirty = 1;
              }
              break;
            }
          }
        } else {
          ms.stats.misses++;
          let victim = set.find(w => w.valid === 0);
          if (!victim) {
            victim = set[0];
            for (let k = 1; k < set.length; k++) {
              if (set[k].lru < victim.lru) victim = set[k];
            }
          }
          // Write back the evicted line BEFORE overwriting it.
          if (victim.valid === 1) _writeback(victim.tag, setIdx, victim.data, victim.dirty);
          victim.tag   = tag;
          victim.valid = 1;
          victim.data  = (we ? dataInCpu : memDataIn) & dMask;
          victim.lru   = ms.lruClock;
          victim.dirty = (we && isWriteBack) ? 1 : 0;
        }
      } else {
        if (hit) {
          ms.stats.hits++;
          if (we) {
            ms.lines[idx].data = dataInCpu & dMask;
            if (isWriteBack) ms.lines[idx].dirty = 1;
          }
        } else {
          ms.stats.misses++;
          const old = ms.lines[idx];
          if (old && old.valid === 1) _writeback(old.tag, idx, old.data, old.dirty);
          ms.lines[idx] = {
            tag,
            valid: 1,
            data: (we ? dataInCpu : memDataIn) & dMask,
            dirty: (we && isWriteBack) ? 1 : 0,
          };
        }
      }

      // 3C miss classification (compulsory / capacity / conflict).
      // Read seenAddrs and the shadow fully-associative cache BEFORE
      // updating either, so the classification reflects the state at
      // the moment of access. The shadow has the same line budget as
      // the real cache, fully-associative + LRU — that's the canonical
      // way to tell capacity from conflict (Hill 1989).
      if (!ms.seenAddrs)         ms.seenAddrs = new Set();
      if (!ms.shadow)            ms.shadow = [];
      if (!ms.shadowClock)       ms.shadowClock = 0;
      if (!ms.stats.miss3C)      ms.stats.miss3C = { compulsory: 0, capacity: 0, conflict: 0 };

      if (!hit) {
        if (!ms.seenAddrs.has(addr)) {
          ms.stats.miss3C.compulsory++;
        } else {
          const inShadow = ms.shadow.some(e => e.addr === addr);
          if (inShadow) ms.stats.miss3C.conflict++;
          else          ms.stats.miss3C.capacity++;
        }
      }

      // Update shadow (always, for LRU bookkeeping).
      const linesCap = node.lines || 4;
      ms.shadowClock++;
      const sExisting = ms.shadow.findIndex(e => e.addr === addr);
      if (sExisting >= 0) {
        ms.shadow[sExisting].lru = ms.shadowClock;
      } else if (ms.shadow.length >= linesCap) {
        let victimIdx = 0;
        for (let k = 1; k < ms.shadow.length; k++) {
          if (ms.shadow[k].lru < ms.shadow[victimIdx].lru) victimIdx = k;
        }
        ms.shadow[victimIdx] = { addr, lru: ms.shadowClock };
      } else {
        ms.shadow.push({ addr, lru: ms.shadowClock });
      }
      ms.seenAddrs.add(addr);

      // Push a snapshot to the global cache-stats map so the Pipeline
      // panel can render it live. Mirrors the __branch_flushes__
      // pattern: ffStates owns the data, app.js relays via bus event.
      let cacheStats = ffStates.get('__cache_stats__');
      if (!cacheStats) { cacheStats = new Map(); ffStates.set('__cache_stats__', cacheStats); }
      let snap = cacheStats.get(id);
      if (!snap) { snap = { label: node.label || 'CACHE', hits: 0, misses: 0, recent: [], miss3C: { compulsory: 0, capacity: 0, conflict: 0 } }; cacheStats.set(id, snap); }
      snap.label  = node.label || 'CACHE';
      snap.hits   = ms.stats.hits;
      snap.misses = ms.stats.misses;
      snap.miss3C = { ...ms.stats.miss3C };
      // Record the most recent N=12 accesses so the panel can show the
      // tail of the workload.
      snap.recent.push({ addr, hit: hit ? 1 : 0, miss: hit ? 0 : 1 });
      if (snap.recent.length > 12) snap.recent.shift();
    }

    // 4c3: BUS_MUX eval with fresh wire values
    for (const node of nodes) {
      if (node.type !== 'BUS_MUX') continue;
      const id = node.id;
      const inputSlots = inputs.get(id);
      const n = node.inputCount || 2;
      const selSlot = inputSlots.find(s => s.inputIndex === n);
      const sel = selSlot ? _wv(selSlot.wire.id) : 0;
      const dataSlot = inputSlots.find(s => s.inputIndex === (sel % n));
      const val = dataSlot ? _wv(dataSlot.wire.id) : 0;
      nodeValues.set(id, val);
      propagate(id);
    }

    // 4d: CU recompute with persistent Z/C flags
    for (const node of nodes) {
      if (node.type !== 'CU') continue;
      const id = node.id;
      const inputSlots = inputs.get(id);
      const op = inputSlots[0] ? _nv(inputSlots[0].sourceId) : 0;
      // Use persistent flags from flag state register
      const z  = _flagState.z;
      const c  = _flagState.c;
      const { aluOp, regWe, memWe, memRe, jmp, halt, immSel } = _evalCU(node, op, z, c);
      // Phase 4d also gets the IR_FLUSH suppression: at this point
      // PIPE_REG / IR may have just latched (Phase 2), so curSeq /
      // metaSeq may have advanced. The cache is per-evaluate so the
      // _cuBranchSeqOf result is whatever was captured at first call;
      // re-derive freshly here to use the post-Phase-2 seq.
      _cuSeqCache.delete(node.id);
      const jmpFinal = _suppressReFireJmp(node, jmp);
      nodeValues.set(id, aluOp);
      nodeValues.set(id+'__out0',aluOp);nodeValues.set(id+'__out1',regWe);nodeValues.set(id+'__out2',memWe);nodeValues.set(id+'__out3',memRe);nodeValues.set(id+'__out4',jmpFinal);nodeValues.set(id+'__out5',halt);nodeValues.set(id+'__out6',immSel);
      propagate(id);
    }

    // 4e: RF write + PC jump (on rising edge)
    // _jmpActive remains a cycle-scoped boolean kept ONLY for the
    // branch-flush log below — it counts how many cycles a branch
    // fired, which matches the existing test invariants
    // (test-branch-flush-{demo,live}.mjs assert log.length).
    //
    // _branchSeq is the per-instruction fix for the WB-write gate:
    // when a CU asserts jmp, it points to a specific instruction
    // (the branch). That instruction has a sequence number assigned
    // at IR latch time (see Phase 2 IR/PIPE_REG plumbing). All
    // instructions issued AFTER the branch have strictly-larger seqs
    // and ARE speculative; instructions issued BEFORE have smaller
    // seqs and are committed real work — their writebacks must NOT
    // be squashed. Multiple CUs (sub-circuits) → take min so the
    // oldest branch wins (most conservative: suppresses fewest).
    let _jmpActive = false;
    let _branchSeq = -1;
    for (const node of nodes) {
      if (node.type !== 'CU') continue;
      const jmpVal = nodeValues.get(node.id + '__out4') ?? 0;
      if (!jmpVal) continue;
      _jmpActive = true;
      // Find this CU's branch seq: walk its OP input (slot 0) back
      // to either an IR (single-cycle CPU) or a PIPE_REG (5-stage).
      const cuInputs = inputs.get(node.id) || [];
      const opSlot = cuInputs.find(s => s.inputIndex === 0);
      if (!opSlot) continue;
      const upNode = nodeMap.get(opSlot.sourceId);
      if (!upNode) continue;
      const upMs = ffStates.get(upNode.id);
      let mySeq = -1;
      if (upNode.type === 'IR' && upMs && typeof upMs.curSeq === 'number') mySeq = upMs.curSeq;
      else if (upNode.type === 'PIPE_REG' && upMs && typeof upMs.metaSeq === 'number') mySeq = upMs.metaSeq;
      if (mySeq < 0) continue;
      if (_branchSeq < 0 || mySeq < _branchSeq) _branchSeq = mySeq;
    }

    // Helper for WB-stage writeback gate: a write coming out of a
    // REG_FILE / REG_FILE_DP is speculative (and must be squashed)
    // ONLY if a branch fired this cycle AND the WB instruction's
    // seq is strictly greater than the branch's seq (i.e. it was
    // issued AFTER the branch). Single-cycle CPUs have no PIPE_REG
    // upstream of the RF write port → fall back to false (no
    // suppression — same behaviour as before the fix for those).
    const _wbPipeCache = new Map();
    const _findWbPipe = (rfNode) => {
      if (_wbPipeCache.has(rfNode.id)) return _wbPipeCache.get(rfNode.id);
      // RF write port: REG_FILE_DP WR_DATA = input 3, REG_FILE WR_DATA = input 2.
      const wrIdx = rfNode.type === 'REG_FILE_DP' ? 3 : 2;
      const slots = inputs.get(rfNode.id) || [];
      const wrSlot = slots.find(s => s.inputIndex === wrIdx);
      let result = null;
      if (wrSlot) {
        // BFS back up the wire graph to find the nearest PIPE_REG.
        // Bounded — if the graph has cycles or no PIPE_REG ancestor,
        // we fail open (return null → no suppression).
        const seen = new Set([rfNode.id]);
        const queue = [wrSlot.sourceId];
        let steps = 0;
        while (queue.length && steps++ < 50) {
          const id = queue.shift();
          if (seen.has(id)) continue;
          seen.add(id);
          const n = nodeMap.get(id);
          if (!n) continue;
          if (n.type === 'PIPE_REG') { result = n; break; }
          // Walk further back through this node's inputs.
          const ups = inputs.get(id) || [];
          for (const s of ups) {
            if (!s.wire?.isClockWire) queue.push(s.sourceId);
          }
        }
      }
      _wbPipeCache.set(rfNode.id, result);
      return result;
    };
    const _isWbSpeculative = (rfNode) => {
      if (!_jmpActive || _branchSeq < 0) return false;
      const pipe = _findWbPipe(rfNode);
      if (!pipe) return false;       // single-cycle: no WB stage to be speculative
      const ms = ffStates.get(pipe.id);
      const wbSeq = ms?.metaSeq ?? -1;
      if (wbSeq < 0) return false;   // bubble in WB → nothing to suppress
      return wbSeq > _branchSeq;
    };

    // Live branch-flush log: record (cycle, pc-of-branch) on the rising
    // edge where a taken branch is committed. Detection happens after
    // P4d (CU recompute on the latched-this-edge IR) but before P4e's
    // PC update, so PC.q still holds the branch instruction's own slot.
    const _clkRisingNow = nodes.some(n => {
      if (n.type !== 'CLOCK') return false;
      const ms = ffStates.get(n.id);
      const cur = n.value;
      const prev = ms ? ms.prevClkValue : null;
      return cur === 1 && (prev === 0 || prev === null || prev === undefined);
    });
    if (_jmpActive && _clkRisingNow) {
      const pcNode = nodes.find(n => n.type === 'PC');
      if (pcNode) {
        const pcMs = ffStates.get(pcNode.id);
        const bits = pcNode.bitWidth || 8;
        const mask = (1 << bits) - 1;
        const branchPc = pcMs ? (pcMs.q & mask) : 0;
        let log = ffStates.get('__branch_flushes__');
        if (!log) { log = []; ffStates.set('__branch_flushes__', log); }
        log.push({ cycle: stepCount ?? 0, pc: branchPc });
        if (log.length > 1024) log.splice(0, log.length - 1024);
      }
      // Persist the seq of the branch instruction that just committed,
      // so next cycle's CU evals can recognise a re-fire of the same
      // IR instance and suppress the over-flush. _branchSeq was
      // captured above when we computed _jmpActive.
      if (_branchSeq >= 0) ffStates.set('__last_fired_branch_seq__', _branchSeq);
    }
    // CLOCK prevClkValue tracking for rising-edge detection above.
    for (const n of nodes) {
      if (n.type !== 'CLOCK') continue;
      let ms = ffStates.get(n.id);
      if (!ms) { ms = { prevClkValue: null }; ffStates.set(n.id, ms); }
      ms.prevClkValue = n.value;
    }

    for (const node of nodes) {
      if (node.type !== 'REG_FILE' && node.type !== 'REG_FILE_DP' && node.type !== 'PC') continue;
      const ms = ffStates.get(node.id);
      if (!ms) continue;
      const inputSlots = inputs.get(node.id);
      const clkSlot = inputSlots.find(s => s.wire.isClockWire);
      if (!clkSlot) continue;
      const clkNow = _wv(clkSlot.wire.id);
      const prevClk = ms.prevClkValue;
      if (_DEBUG && node.type === 'PC') console.log(`[P4e-PC] clkNow=${clkNow} prevClk=${prevClk} edge=${clkNow===1&&(prevClk===0||prevClk===null)} PC=${ms.q}`);
      if (_DEBUG && node.type === 'REG_FILE_DP') console.log(`[P4e-RF] clkNow=${clkNow} prevClk=${prevClk} edge=${clkNow===1&&(prevClk===0||prevClk===null)}`);

      if (clkNow === 1 && (prevClk === 0 || prevClk === null)) {
        const dataSlots = inputSlots.filter(s => s !== clkSlot);
        const _w2 = (slot) => slot ? _wv(slot.wire.id) : 0;

        if (node.type === 'REG_FILE') {
          const wrAddr = _w2(dataSlots[1]);
          const wrData = _w2(dataSlots[2]);
          const we     = _w2(dataSlots[3]);
          const dMask  = _mask(node.dataBits || 8);
          const regCnt = node.regCount || 8;
          if (we && !_isWbSpeculative(node)) ms.regs[wrAddr % regCnt] = wrData & dMask;
          const rdAddr = _w2(dataSlots[0]);
          ms.q = (ms.regs[rdAddr % regCnt] ?? 0) & dMask;
        } else if (node.type === 'REG_FILE_DP') {
          // Dual-port: RD1_ADDR(0), RD2_ADDR(1), WR_ADDR(2), WR_DATA(3), WE(4), CLK
          const wrAddr = _w2(dataSlots[2]);
          const wrData = _w2(dataSlots[3]);
          const we     = _w2(dataSlots[4]);
          const dMask  = _mask(node.dataBits || 8);
          const regCnt = node.regCount || 8;
          if (!ms.regs) ms.regs = node.initialRegs ? [...node.initialRegs] : new Array(regCnt).fill(0);
          const wrIdx = wrAddr % regCnt;
          if (we && !_isWbSpeculative(node) && !(node.protectR0 && wrIdx === 0)) ms.regs[wrIdx] = wrData & dMask;
          const rd1Addr = _w2(dataSlots[0]);
          const rd2Addr = _w2(dataSlots[1]);
          const readR0 = (idx) => (node.protectR0 && (idx % regCnt) === 0) ? 0 : (ms.regs[idx % regCnt] ?? 0);
          ms.q = readR0(rd1Addr) & dMask;
          nodeValues.set(node.id + '__out1', readR0(rd2Addr) & dMask);
        } else if (node.type === 'PC') {
          const allSlots = inputSlots.filter(s => s !== clkSlot);
          const getByIdx = (idx) => {
            const s = allSlots.find(sl => sl.inputIndex === idx);
            return s ? _wv(s.wire.id) : 0;
          };
          const jumpAddr = getByIdx(0);
          const jump     = getByIdx(1);
          const en       = getByIdx(2) || (!allSlots.find(sl => sl.inputIndex === 2) ? 1 : 0);
          const clr      = getByIdx(3);
          const bitsPC   = node.bitWidth || 8;
          const mask     = _mask(bitsPC);
          if (clr)       ms.q = 0;
          else if (jump && node.pcRelative) {
            // CIRCUIT_DETAILS: PC = PC + 1 + sign_ext(offset). Input 0 is interpreted
            // as a signed bitsPC-bit two's-complement value (SIGN_EXT supplies that).
            const signBitPC = (jumpAddr >> (bitsPC - 1)) & 1;
            const signedOff = signBitPC ? ((jumpAddr & mask) - (1 << bitsPC)) : (jumpAddr & mask);
            ms.q = ((ms.q + 1 + signedOff) & mask) >>> 0;
          }
          else if (jump) ms.q = jumpAddr & mask;
          else if (en)   ms.q = (ms.q + 1) & mask;
        }
        nodeValues.set(node.id, ms.q);
        propagate(node.id);
      }
      if (clkNow !== null) ms.prevClkValue = clkNow;
    }

    // DEBUG: CPU state trace (only on clock rising edge). Gated on
    // _DEBUG so production / test stdout stays clean — the snapshot
    // diff is the proper signal channel.
    const _anyClkHigh = _DEBUG && nodes.some(n => n.type === 'CLOCK' && n.value === 1);
    if (_anyClkHigh) for (const node of nodes) {
      if (node.type === 'PC') {
        const pc = nodeValues.get(node.id) ?? '?';
        const irNode = nodes.find(n => n.type === 'IR');
        const cuNode = nodes.find(n => n.type === 'CU');
        const rfNode = nodes.find(n => n.type === 'REG_FILE_DP' || n.type === 'REG_FILE');
        const irOp = irNode ? (_nv(irNode.id + '__out0')) : '?';
        const irRd = irNode ? (_nv(irNode.id + '__out1')) : '?';
        const irRs1 = irNode ? (_nv(irNode.id + '__out2')) : '?';
        const irRs2 = irNode ? (_nv(irNode.id + '__out3')) : '?';
        const cuRegWe = cuNode ? (_nv(cuNode.id + '__out1')) : '?';
        const cuJmp = cuNode ? (_nv(cuNode.id + '__out4')) : '?';
        const cuHalt = cuNode ? (_nv(cuNode.id + '__out5')) : '?';
        const cuImmSel = cuNode ? (_nv(cuNode.id + '__out6')) : '?';
        const rfState = rfNode ? (ffStates.get(rfNode.id)?.regs?.slice(0,4)) : '?';
        const aluNode = nodes.find(n => n.type === 'ALU');
        const aluR = aluNode ? (_nv(aluNode.id)) : '?';
        const wbNode = nodes.find(n => n.type === 'BUS_MUX');
        const wbVal = wbNode ? (_nv(wbNode.id)) : '?';
        console.log(`[CPU] PC:${pc} IR:[op=${irOp},rd=${irRd},rs1=${irRs1},rs2=${irRs2}] CU:[regWe=${cuRegWe},jmp=${cuJmp},halt=${cuHalt},immSel=${cuImmSel}] ALU_R:${aluR} WB:${wbVal} RF:[${rfState}]`);
      }
    }

    // 4e: Update outputs
    for (const node of nodes) {
      if (node.type !== 'OUTPUT') continue;
      const inputSlots = inputs.get(node.id);
      if (inputSlots.length > 0) {
        const slot = inputSlots[0];
        const outIdx = slot.wire.sourceOutputIndex || 0;
        let val = outIdx >= 1 ? (nodeValues.get(slot.sourceId + '__out' + outIdx) ?? null) : (_nv(slot.sourceId) ?? null);
        nodeValues.set(node.id, val);
      }
    }
  }

  return { nodeValues, wireValues, ffUpdated };
}
