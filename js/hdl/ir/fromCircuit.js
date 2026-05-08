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

function nodeBitWidth(node) {
  const w = node?.bitWidth ?? node?.dataBits ?? node?.width ?? 1;
  return Math.max(1, w | 0);
}

function collectPorts(circuit, usedNames) {
  const ports = [];
  const portByNodeId = new Map();
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
      const p = makePort({
        name, dir: PORT_DIR.OUTPUT, width: nodeBitWidth(n),
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
      width: srcNode ? nodeBitWidth(srcNode) : 1,
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

export function fromCircuit(circuitJSON) {
  const circuit = circuitJSON || { nodes: [], wires: [] };
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
  };

  const instances = [];
  const unmapped = [];     // [{ type, nodeId }] — caller renders as // TODO
  const instUsedNames = new Set();

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
    if (node.type === 'INPUT' || node.type === 'OUTPUT' || node.type === 'CLOCK') continue;
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
  }

  // Wire OUTPUT ports. For each top-level OUTPUT node, find the wire
  // driving it and emit an `assign <port> = <srcNet>;`. Without this,
  // the port appears in the module header but nothing drives it, and
  // iverilog (correctly) reports the port as unconnected.
  const assigns = [];
  for (const node of (circuit.nodes || [])) {
    if (node.type !== 'OUTPUT') continue;
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

  const ir = makeModule({
    name: 'top',
    ports,
    nets,
    instances,
    assigns,
    alwaysBlocks: [],
    memories: [],
    submodules: [],
  });
  // Non-IR metadata used by the pretty printer to render // TODO markers.
  ir._unmapped = unmapped;
  return ir;
}
