// circuitJSON → IRModule.
//
// Phase 2 scope: port enumeration, net deduplication by source endpoint,
// translator dispatch (registry populated in Phases 3+). Identifier stability
// is enforced by preserving user-given labels as IRNet.originalName.

import { hasTranslator, getTranslator } from '../translators/index.js';
import { sanitizeIdentifier, uniqueIdentifier } from '../core/identifiers.js';
import { SourceRef } from '../core/SourceRef.js';
import {
  makeModule, makePort, makeNet, makeInstance, makeRef,
  PORT_DIR, NET_KIND,
} from './types.js';
import { lowerTriState as _lowerTriState } from './lowerTriState.js';

function nodeBitWidth(node, outIdx = 0) {
  // Per-output overrides for multi-output components whose pins have
  // different widths. Listed before the generic bitWidth fallback.
  if (node?.type === 'COUNTER' && outIdx === 1) return 1;        // TC is 1-bit
  if (node?.type === 'LFSR')                     return 1;        // serial Q is 1-bit (MSB)
  if (node?.type === 'MISR')                     return Math.max(1, (node.bitWidth || 4) | 0);  // Q = full signature
  // BIST_CONTROLLER outputs:
  //   out0 DONE (1), out1 PASS (1), out2 TEST_MODE (1), out3 STATE (3-bit)
  if (node?.type === 'BIST_CONTROLLER')          return outIdx === 3 ? 3 : 1;
  // JTAG_TAP outputs: out0 TDO (1), out1 STATE (4), out2 IR (irBits)
  if (node?.type === 'JTAG_TAP') {
    if (outIdx === 0) return 1;
    if (outIdx === 1) return 4;
    if (outIdx === 2) return Math.max(1, (node.irBits | 0) || 4);
    return 1;
  }
  // BOUNDARY_SCAN_CELL outputs: out0 PO (1), out1 SO (1)
  if (node?.type === 'BOUNDARY_SCAN_CELL')        return 1;
  // CU control outputs: out0 = ALU_OP (3-bit op selector), all others
  // are single-bit control signals.
  if (node?.type === 'CU') return outIdx === 0 ? 3 : 1;
  // BUS: out0 = bus value (bitWidth), out1 = ERR flag (1-bit).
  if (node?.type === 'BUS' && outIdx === 1)       return 1;
  // ALU: out0 = R (bitWidth), out1 = Z (1-bit), out2 = C (1-bit).
  if (node?.type === 'ALU' && outIdx >= 1)       return 1;
  // IR fields: out0=OP, out1=RD, out2=RS1, out3=RS2 — each uses its
  // own bit-count field. Width sum = instrWidth.
  if (node?.type === 'IR') {
    if (outIdx === 0) return Math.max(1, (node.opBits  ?? 4) | 0);
    if (outIdx === 1) return Math.max(1, (node.rdBits  ?? 4) | 0);
    if (outIdx === 2) return Math.max(1, (node.rs1Bits ?? 4) | 0);
    if (outIdx === 3) return Math.max(1, (node.rs2Bits ?? 4) | 0);
  }
  if (node?.type === 'BUS'     && outIdx === 1) return 1;        // ERR is 1-bit
  if (node?.type === 'HANDSHAKE')                return 1;        // S, F both 1-bit
  if (node?.type === 'COMPARATOR')               return 1;        // EQ / GT / LT all 1-bit
  if (node?.type === 'HALF_ADDER')               return 1;        // S, C both 1-bit
  if (node?.type === 'FULL_ADDER')               return 1;        // S, Cout both 1-bit
  if (node?.type === 'DECODER')                  return 1;        // every output 1-bit (one-hot)
  if (node?.type === 'ENCODER')                  return 1;        // every output 1-bit
  // Component-specific overrides for the primary output width:
  if (node?.type === 'SIGN_EXT') return Math.max(1, (node.outBits ?? 8) | 0);
  // REG_FILE family: outputs carry one register's worth of data.
  if (node?.type === 'REG_FILE' || node?.type === 'REG_FILE_DP') {
    return Math.max(1, (node.dataBits ?? node.bitWidth ?? 8) | 0);
  }
  // RAM / ROM: outputs are dataBits-wide.
  if (node?.type === 'RAM' || node?.type === 'ROM') {
    return Math.max(1, (node.dataBits ?? node.bitWidth ?? 8) | 0);
  }
  // FIFO / STACK: out0 = Q (dataBits), out1 = FULL (1), out2 = EMPTY (1).
  if (node?.type === 'FIFO' || node?.type === 'STACK') {
    if (outIdx === 0) return Math.max(1, (node.dataBits ?? node.bitWidth ?? 8) | 0);
    return 1;
  }
  // SUB_CIRCUIT — output width is dictated by the inner OUTPUT node it
  // maps to. We try the inner node's own bitWidth first, and only
  // fall back to its driver wire's source width when bitWidth is
  // unset. Without this, every SUB_CIRCUIT output net at the outer
  // scope defaults to 1 bit and iverilog warns about pruning high
  // bits at every instantiation site (the cpu-detailed regression).
  if (node?.type === 'SUB_CIRCUIT' && node.subCircuit && Array.isArray(node.subOutputs)) {
    const outDef = node.subOutputs[outIdx];
    const sc = node.subCircuit;
    if (outDef && Array.isArray(sc.nodes)) {
      const inner = sc.nodes.find(n => n.id === outDef.id);
      if (inner) {
        if (inner.bitWidth) return Math.max(1, inner.bitWidth | 0);
        const w = (sc.wires || []).find(w => w.targetId === inner.id);
        if (w) {
          const src = sc.nodes.find(n => n.id === w.sourceId);
          if (src) return nodeBitWidth(src, w.sourceOutputIndex ?? 0);
        }
      }
    }
    return 1;
  }
  const w = node?.bitWidth ?? node?.dataBits ?? node?.width ?? 1;
  return Math.max(1, w | 0);
}

function collectPorts(circuit, usedNames) {
  const ports = [];
  const portByNodeId = new Map();
  const nodeById = new Map();
  for (const n of (circuit.nodes || [])) nodeById.set(n.id, n);

  // For OUTPUT nodes that don't carry their own explicit bitWidth, infer
  // the port width from the driver: find the wire whose target is this
  // OUTPUT, look up the source node, ask nodeBitWidth(srcNode, outIdx).
  // Without this, a user-placed OUTPUT defaults to 1 bit and silently
  // truncates an 8-bit datapath wire to its LSB.
  const outputDriverWidth = (n) => {
    const w = (circuit.wires || []).find(w => w.targetId === n.id);
    if (!w) return 1;
    const src = nodeById.get(w.sourceId);
    return src ? nodeBitWidth(src, w.sourceOutputIndex ?? 0) : 1;
  };

  // Stable iteration order: node array order (deterministic).
  for (const n of (circuit.nodes || [])) {
    if (n.type === 'INPUT' || n.type === 'CLOCK') {
      const name = uniqueIdentifier(n.label || n.id, usedNames, 'in');
      const p = makePort({
        name, dir: PORT_DIR.INPUT, width: nodeBitWidth(n),
        sourceRef: SourceRef.fromNode(n.id),
      });
      ports.push(p);
      portByNodeId.set(n.id, p);
    } else if (n.type === 'OUTPUT') {
      const name = uniqueIdentifier(n.label || n.id, usedNames, 'out');
      // Explicit bitWidth on the OUTPUT wins; otherwise infer from driver.
      const explicit = n.bitWidth || n.width;
      const width = explicit ? Math.max(1, explicit | 0) : outputDriverWidth(n);
      const p = makePort({
        name, dir: PORT_DIR.OUTPUT, width,
        sourceRef: SourceRef.fromNode(n.id),
      });
      ports.push(p);
      portByNodeId.set(n.id, p);
    } else if (n.type === 'DISPLAY_7SEG') {
      // Display sinks become 7-bit output ports off-chip. Each input
      // pin (a..g, indices 0..6) maps to one bit of the bus. The
      // translator below packs them via a Concat.
      const name = uniqueIdentifier(n.label || (n.id + '_seg'), usedNames, 'seg');
      const p = makePort({
        name, dir: PORT_DIR.OUTPUT, width: 7,
        sourceRef: SourceRef.fromNode(n.id),
      });
      ports.push(p);
      portByNodeId.set(n.id, p);
    }
  }
  return { ports, portByNodeId };
}

// Group wires into nets by (sourceId, sourceOutputIndex). Names prefer the
// user-given netName; fallback "net_<srcId>_<outIdx>".
function collectNets(circuit, portByNodeId, usedNames) {
  const nets = [];
  const netByEndpoint = new Map();
  const nodeById = new Map();
  for (const n of (circuit.nodes || [])) nodeById.set(n.id, n);

  // Deterministic order: sort wires by (sourceId, sourceOutputIndex, id).
  const sortedWires = [...(circuit.wires || [])].sort((a, b) => {
    const sa = String(a.sourceId ?? '');
    const sb = String(b.sourceId ?? '');
    if (sa !== sb) return sa < sb ? -1 : 1;
    const oa = a.sourceOutputIndex ?? 0;
    const ob = b.sourceOutputIndex ?? 0;
    if (oa !== ob) return oa - ob;
    return String(a.id ?? '') < String(b.id ?? '') ? -1 : 1;
  });

  for (const w of sortedWires) {
    const key = `${w.sourceId}:${w.sourceOutputIndex ?? 0}`;
    if (netByEndpoint.has(key)) continue;

    // If the source is a top-level INPUT/CLOCK, reuse the port name rather
    // than inventing a separate net — keeps output human-readable.
    const srcPort = portByNodeId.get(w.sourceId);
    if (srcPort && srcPort.dir === PORT_DIR.INPUT) {
      netByEndpoint.set(key, { name: srcPort.name, width: srcPort.width, isPort: true });
      continue;
    }

    const srcNode = nodeById.get(w.sourceId);
    const original = w.netName || null;
    const fallback = `net_${w.sourceId}_${w.sourceOutputIndex ?? 0}`;
    const name = uniqueIdentifier(original || fallback, usedNames, 'net');
    const net = makeNet({
      name,
      originalName: original,
      width: srcNode ? nodeBitWidth(srcNode, w.sourceOutputIndex ?? 0) : 1,
      kind: NET_KIND.WIRE,
      sourceRef: SourceRef.fromWire(w.id),
    });
    nets.push(net);
    netByEndpoint.set(key, net);
  }

  // Ensure top-level OUTPUT ports appear as driven nets (matched by wire
  // targets). We do not emit separate wire decls for ports; toVerilog knows.
  return { nets, netByEndpoint };
}

// Width inference pre-pass. Some "pass-through" components (BUS_MUX, MUX_2,
// MUX_4, TRIBUF) carry the width of their data inputs rather than having
// their own. If the user didn't pin a bitWidth, infer it by walking back
// to the data driver. Without this, an unconfigured BUS_MUX defaults to
// 1 bit and silently truncates an 8-bit datapath to its LSB.
function inferPassthroughWidths(circuit) {
  const nodeById = new Map();
  for (const n of (circuit.nodes || [])) nodeById.set(n.id, n);
  // Per type, which input indices are "data" (carry the operating width).
  const dataPinsOf = {
    BUS_MUX: (n) => Array.from({ length: n.inputCount || 2 }, (_, i) => i),
    MUX_2:   () => [0, 1],
    MUX_4:   () => [0, 1, 2, 3],
    TRIBUF:  () => [0],
  };
  // Iterate to a fixed point — chained passthroughs need multiple passes.
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const n of (circuit.nodes || [])) {
      const f = dataPinsOf[n.type];
      if (!f) continue;
      if (n.bitWidth && n.bitWidth > 1) continue;
      for (const idx of f(n)) {
        const w = (circuit.wires || []).find(
          w => w.targetId === n.id && (w.targetInputIndex || 0) === idx,
        );
        if (!w) continue;
        const src = nodeById.get(w.sourceId);
        const sw = src ? nodeBitWidth(src, w.sourceOutputIndex ?? 0) : 1;
        if (sw > 1) { n.bitWidth = sw; changed = true; break; }
      }
    }
    if (!changed) break;
  }
}

// Phase-6 hierarchy plumbing. A single shared registry passes through
// recursive fromCircuit calls so every SUB_CIRCUIT lookup hits the
// same hash table — content-identical inner scenes collapse to one
// emitted module shared across all instantiations, including those
// in other parts of the canvas.
//
//   submodules : IRModule[]            — emitted definitions, in dependency order
//   byHash     : Map<hash, moduleName> — for de-duplication
//   usedNames  : Set<string>           — module-name uniqueness across the whole IR
function makeSubmoduleRegistry() {
  return { submodules: [], byHash: new Map(), usedNames: new Set() };
}

export function fromCircuit(circuitJSON, opts = {}) {
  const circuit = circuitJSON || { nodes: [], wires: [] };
  const submoduleRegistry = opts.submoduleRegistry || makeSubmoduleRegistry();
  inferPassthroughWidths(circuit);
  const usedNames = new Set();
  const { ports, portByNodeId } = collectPorts(circuit, usedNames);
  const { nets, netByEndpoint } = collectNets(circuit, portByNodeId, usedNames);

  // Translator context — formalised here so Phases 3+ have a stable API.
  const nodeById = new Map();
  for (const n of (circuit.nodes || [])) nodeById.set(n.id, n);

  const ctx = {
    circuit,
    nodeById,
    portByNodeId,
    netByEndpoint,
    sanitize: sanitizeIdentifier,
    netOf(nodeId, outIdx = 0) {
      const key = `${nodeId}:${outIdx}`;
      return netByEndpoint.get(key) || null;
    },
    // Resolve the net feeding a target pin: walk wires to find the one
    // landing on (nodeId, inputIndex), then look up the source net.
    inputNet(nodeId, inputIndex = 0) {
      const wire = (circuit.wires || []).find(
        w => w.targetId === nodeId && (w.targetInputIndex || 0) === inputIndex,
      );
      if (!wire) return null;
      const key = `${wire.sourceId}:${wire.sourceOutputIndex || 0}`;
      return netByEndpoint.get(key) || null;
    },
    widthOf(nodeId) {
      const n = nodeById.get(nodeId);
      return n ? nodeBitWidth(n) : 1;
    },
    instanceName(node) {
      return sanitizeIdentifier(node.label || `u_${node.id}`, 'u');
    },
    // Phase-6 entry point for the SUB_CIRCUIT translator. Recursively
    // builds the inner module IR (sharing this same registry so nested
    // sub-circuits also de-dup), registers it, and returns the chosen
    // module name. The translator builds its Instance against this
    // name. Returns null when sub.subCircuit is missing.
    registerSubmodule(sub) {
      return _registerSubmodule(sub, submoduleRegistry);
    },
    submoduleRegistry,
  };

  const instances = [];
  const assigns = [];       // populated by translators that emit assign-form output
                            // and by the post-loop OUTPUT-port wiring pass.
  const alwaysBlocks = [];  // populated by sequential translators (FFs, registers, …)
  const memories = [];      // memory arrays — populated by REG_FILE / RAM / ROM
  const unmapped = [];      // [{ type, nodeId }] — caller renders as // TODO
  // Instance names share the module-level identifier namespace —
  // ports and nets already live in `usedNames`, and Verilog rejects
  // an instance whose name collides with either. (Phase-6 hierarchy
  // surfaced this: an inner OR gate labelled the same as an inner
  // output port both sanitised to `use_imm`, and iverilog refused to
  // compile the resulting submodule.) We seed `instUsedNames` from
  // `usedNames` so the uniqueIdentifier suffixing kicks in for any
  // gate or instance that would otherwise shadow a port/net.
  const instUsedNames = new Set(usedNames);
  // Net-name → kind override map. Translators that drive a net from an
  // always block need it declared as `reg` instead of `wire`.
  const _regNetNames = new Set();

  // Carry pipeline metadata (the `stage` field set by the pipelining
  // analyzer on canvas nodes) onto the IR instance as an opaque
  // attribute. Phase 4's PIPE_REG translator + Phase 7's pretty-printer
  // (stage-comment dividers) consume this. Translators that don't care
  // ignore it.
  const _attachStageAttribute = (inst, node) => {
    if (node.stage === undefined || node.stage === null) return;
    if (!Array.isArray(inst.attributes)) inst.attributes = [];
    inst.attributes.push({ key: 'stage', value: node.stage });
  };

  for (const node of (circuit.nodes || [])) {
    if (!node.type) continue;
    // Port nodes (INPUT / OUTPUT / CLOCK) have already been turned
    // into module ports by collectPorts. The OUTPUT-port wiring pass
    // below routes their drivers; no translator needed for those.
    // DISPLAY_7SEG is also port-allocated by collectPorts but its
    // segment-packing assign is emitted by the translator below.
    if (node.type === 'INPUT' || node.type === 'OUTPUT' ||
        node.type === 'CLOCK') continue;
    if (!hasTranslator(node.type)) {
      unmapped.push({ type: node.type, nodeId: node.id });
      continue;
    }
    const fn = getTranslator(node.type);
    const out = fn(node, ctx) || {};
    if (out.instance) {
      const inst = out.instance;
      // Enforce unique instance names.
      if (!inst.instanceName) inst.instanceName = ctx.instanceName(node);
      inst.instanceName = uniqueIdentifier(inst.instanceName, instUsedNames, 'u');
      _attachStageAttribute(inst, node);
      instances.push(inst);
    }
    if (Array.isArray(out.instances)) {
      for (const inst of out.instances) {
        if (!inst.instanceName) inst.instanceName = ctx.instanceName(node);
        inst.instanceName = uniqueIdentifier(inst.instanceName, instUsedNames, 'u');
        _attachStageAttribute(inst, node);
        instances.push(inst);
      }
    }
    // Translators that lower to continuous assignments (arithmetic,
    // comparator, ...) return them here. Each is a fully-formed IR
    // Assign node — we just collect them.
    if (Array.isArray(out.assigns)) {
      for (const a of out.assigns) assigns.push(a);
    }
    // Sequential translators emit Always blocks for clock-edge state
    // updates. Each block carries its own sensitivity + body.
    if (Array.isArray(out.alwaysBlocks)) {
      for (const blk of out.alwaysBlocks) alwaysBlocks.push(blk);
    }
    // Translators name nets they drive procedurally (always-block LHS
    // targets) so collectNets can declare them as `reg` not `wire`.
    if (Array.isArray(out.regNets)) {
      for (const name of out.regNets) _regNetNames.add(name);
    }
    // Translators that need an internal net not derivable from a wire
    // endpoint (e.g. LFSR's hidden state register) push fully-formed
    // IRNet objects here. They're appended to the module's `nets` list.
    if (Array.isArray(out.nets)) {
      for (const n of out.nets) nets.push(n);
    }
    // Memory arrays — REG_FILE, RAM, ROM declare `reg [W-1:0] mem [0:D-1]`
    // here. fromCircuit forwards them to ir.memories; toVerilog renders
    // the canonical Verilog memory declaration.
    if (Array.isArray(out.memories)) {
      for (const m of out.memories) memories.push(m);
    }
  }

  // Apply the reg-net upgrade. Done after the loop so it picks up
  // names regardless of translator iteration order.
  for (const net of nets) {
    if (_regNetNames.has(net.name)) net.netKind = NET_KIND.REG;
  }

  // Wire OUTPUT ports. For each top-level OUTPUT node, find the wire
  // driving it and emit an `assign <port> = <srcNet>;`. Without this,
  // the port appears in the module header but nothing drives it, and
  // iverilog (correctly) reports the port as unconnected.
  for (const node of (circuit.nodes || [])) {
    if (node.type === 'OUTPUT') {
      const port = portByNodeId.get(node.id);
      if (!port) continue;
      const wire = (circuit.wires || []).find(
        w => w.targetId === node.id && (w.targetInputIndex || 0) === 0,
      );
      if (!wire) continue;
      const key = `${wire.sourceId}:${wire.sourceOutputIndex || 0}`;
      const srcNet = netByEndpoint.get(key);
      if (!srcNet) continue;
      assigns.push({
        kind: 'Assign',
        sourceRef: SourceRef.fromWire(wire.id),
        attributes: [],
        lhs: makeRef(port.name, port.width),
        rhs: makeRef(srcNet.name, srcNet.width || port.width),
      });
    }
    // DISPLAY_7SEG used to live here too — it's now a regular
    // translator in js/hdl/translators/display.js (Phase 3 cleanup).
  }

  const ir = makeModule({
    name: 'top',
    ports,
    nets,
    instances,
    assigns,
    alwaysBlocks,
    memories,
    // Only the outermost call (the one that allocated its own
    // registry) attaches submodules — recursive callees return their
    // module to the parent which registers it; embedding the full
    // list inside every nested IR would multi-emit each definition.
    submodules: opts.submoduleRegistry ? [] : submoduleRegistry.submodules,
  });
  // Non-IR metadata used by the pretty printer to render // TODO markers.
  ir._unmapped = unmapped;
  // Run lowerTriState as the final IR-shaping pass — coalesces internal
  // multi-driver tri-state patterns into a single priority MUX so the
  // emitted Verilog is synthesis-safe (Yosys / Vivado / Quartus reject
  // internal `1'bz`). `synthesisSafe: false` keeps the raw form for
  // simulation-only users.
  const ts = _lowerTriState(ir, { synthesisSafe: opts.synthesisSafe !== false });
  ir._lowerTriStateDiagnostics = ts.diagnostics;
  return ir;
}

// Build a stable content hash for a sub-circuit IR so identical
// sub-circuits across the canvas collapse to a single Verilog module.
// We hash a canonical projection of port shape + instance graph +
// assigns + always blocks. Names of internal nets DO matter (they
// appear in the emitted body), so we include them. The 32-bit FNV-1a
// algorithm is plenty for the de-dup table.
function _hashIR(ir) {
  const canonical = JSON.stringify({
    ports: ir.ports.map(p => ({ n: p.name, d: p.dir, w: p.width })),
    nets:  ir.nets.map(n => ({ n: n.name, w: n.width, k: n.netKind })),
    instances: ir.instances.map(i => ({
      t: i.type, p: i.portMap, par: i.params, ord: i.portOrder, prim: !!i.isPrimitive,
    })),
    assigns: ir.assigns,
    always:  ir.alwaysBlocks,
    memories: ir.memories,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function _registerSubmodule(node, registry) {
  const sc = node.subCircuit;
  if (!sc || !Array.isArray(sc.nodes)) return null;

  const innerIR = fromCircuit(sc, { submoduleRegistry: registry });
  const hash = _hashIR(innerIR);
  const existing = registry.byHash.get(hash);
  if (existing) return existing;

  // Pick a module name. Prefer node.subName when set; fall back to a
  // hash-suffixed identifier so two different sub-circuits sharing
  // a label don't collide.
  let base = sanitizeIdentifier(node.subName || node.label || 'block', 'block');
  let chosen = base;
  if (registry.usedNames.has(chosen)) chosen = `${base}_${hash}`;
  registry.usedNames.add(chosen);
  innerIR.name = chosen;
  registry.byHash.set(hash, chosen);
  registry.submodules.push(innerIR);
  return chosen;
}
