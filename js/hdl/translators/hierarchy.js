// Phase-6 hierarchy translator: SUB_CIRCUIT.
//
// Each canvas SUB_CIRCUIT carries an inner scene at `node.subCircuit`
// and two index lists, `node.subInputs` / `node.subOutputs`, that pin
// each external pin to an internal INPUT / OUTPUT node. We:
//
//   1. Recursively call `fromCircuit` on the inner scene (sharing the
//      caller's submodule registry so nested sub-circuits also de-dup
//      and so a sub-circuit and its parent can't accidentally emit two
//      modules with the same name).
//   2. Hash the inner module by content (see _hashIR in fromCircuit.js)
//      and either reuse an existing submodule with the same hash or
//      register the new one. Different bitWidths → different hash →
//      different module — no parameterisation in this first pass.
//   3. Emit an Instance with named-port connections. The port names
//      come from the inner module's port list (which is the inner
//      INPUT/OUTPUT/CLOCK label after sanitisation); we walk the
//      external pin lists in index order to map them up.
//
// Width-parametric sub-circuits, port-name shadowing, and the byte-
// identical re-export L3 gate land in follow-ups.

import { COMPONENT_TYPES } from '../../components/Component.js';
import { registerTranslator } from './index.js';
import { makeRef, makeInstance } from '../ir/types.js';
import { SourceRef } from '../core/SourceRef.js';

registerTranslator(COMPONENT_TYPES.SUB_CIRCUIT, (node, ctx) => {
  const sr = SourceRef.fromNode(node.id);
  if (!ctx.registerSubmodule) return {};

  // Cross-scope width inference: the inner INPUT nodes default to 1-bit
  // when the user didn't pin a bitWidth, but they're being driven by
  // potentially much wider outer wires. Before recursing into the inner
  // scene, we clone the sub-circuit and stamp each inner INPUT's
  // bitWidth from whatever the outer caller actually drives. Different
  // external widths therefore produce different content hashes — and
  // therefore different submodules — which is the right de-dup key
  // until parameterised modules land.
  const subInputsList = node.subInputs || [];
  let patchedNode = node;
  if (node.subCircuit && Array.isArray(node.subCircuit.nodes) && subInputsList.length) {
    const cloned = JSON.parse(JSON.stringify(node.subCircuit));
    for (let i = 0; i < subInputsList.length; i++) {
      const innerId = subInputsList[i]?.id;
      if (!innerId) continue;
      const innerNode = cloned.nodes.find(n => n.id === innerId);
      if (!innerNode) continue;
      const extNet = ctx.inputNet(node.id, i);
      // Use the outer wire's actual width — collectNets has already
      // resolved that via nodeBitWidth on the outer source.
      if (extNet && extNet.width > (innerNode.bitWidth || 1)) {
        innerNode.bitWidth = extNet.width;
      }
    }
    patchedNode = { ...node, subCircuit: cloned };
  }

  const moduleName = ctx.registerSubmodule(patchedNode);
  if (!moduleName) return {};

  // Look up the just-registered module so we can read its port list
  // (we need the canonical port names + directions to build the
  // named-port connections below).
  const innerIR = ctx.submoduleRegistry.submodules.find(m => m.name === moduleName);
  if (!innerIR) return {};

  // Map outer pin index → inner port. The canvas stores subInputs[]
  // and subOutputs[] in the same order as the outer pin layout, with
  // each entry pointing at an internal node by id. The inner IR's
  // ports carry sourceRef.nodeId (set by collectPorts), so we look
  // each outer-pin's mapped node up in the inner port list.
  const innerPortByNodeId = new Map();
  for (const p of innerIR.ports) {
    if (p.sourceRef?.nodeId) innerPortByNodeId.set(p.sourceRef.nodeId, p);
  }

  const subInputs  = node.subInputs  || [];
  const subOutputs = node.subOutputs || [];

  const portMap = {};
  // Inputs (outer pin i ↔ inner INPUT node subInputs[i].id).
  for (let i = 0; i < subInputs.length; i++) {
    const innerPort = innerPortByNodeId.get(subInputs[i].id);
    if (!innerPort) continue;
    const extNet = ctx.inputNet(node.id, i);
    if (!extNet) continue;
    portMap[innerPort.name] = makeRef(extNet.name, innerPort.width);
  }
  // Outputs (outer pin i ↔ inner OUTPUT node subOutputs[i].id).
  for (let i = 0; i < subOutputs.length; i++) {
    const innerPort = innerPortByNodeId.get(subOutputs[i].id);
    if (!innerPort) continue;
    const extNet = ctx.netByEndpoint.get(`${node.id}:${i}`);
    if (!extNet) continue;
    portMap[innerPort.name] = makeRef(extNet.name, innerPort.width);
  }

  return {
    instance: makeInstance({
      type: moduleName,
      instanceName: ctx.instanceName(node),
      portMap,
      params: {},
      sourceRef: sr,
    }),
  };
});
