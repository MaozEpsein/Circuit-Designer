// DISPLAY_7SEG translator (Phase 3).
//
// A 7-segment display sink. Engine pin layout: a=0, b=1, c=2, d=3, e=4,
// f=5, g=6 — each input drives one segment. The exporter exposes the
// whole display as a single 7-bit `output [6:0] seg;` port; the
// translator emits `assign seg = {seg6, seg5, …, seg0};` so each
// segment lands at the conventional bit position (g→bit 6 … a→bit 0).
//
// Port allocation is handled in fromCircuit's collectPorts pass (port-
// style nodes get one OUTPUT each), so this translator's job is only
// the assign that packs the segment wires into the bus. Missing wires
// fall through as `1'b0` placeholders so the port stays correctly
// widthed.

import { COMPONENT_TYPES } from '../../components/Component.js';
import { registerTranslator } from './index.js';
import { makeRef, makeLiteral, makeConcat } from '../ir/types.js';
import { SourceRef } from '../core/SourceRef.js';

registerTranslator(COMPONENT_TYPES.DISPLAY_7SEG, (node, ctx) => {
  const port = ctx.portByNodeId?.get(node.id);
  if (!port) return {};
  const sr = SourceRef.fromNode(node.id);
  // MSB-first: index 6 (segment g) goes leftmost, index 0 (segment a)
  // rightmost.
  const parts = [];
  for (let i = 6; i >= 0; i--) {
    const src = ctx.inputNet(node.id, i);
    parts.push(src ? makeRef(src.name, 1) : makeLiteral(0, 1, sr));
  }
  return {
    assigns: [{
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(port.name, 7),
      rhs: makeConcat(parts, sr),
    }],
  };
});
