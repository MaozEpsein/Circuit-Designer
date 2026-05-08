// Logic-gate translators. Each gate-slot node is lowered to a Verilog
// primitive instance (positional port list, output first):
//   AND  → and  g(y, a, b);
//   OR   → or   g(y, a, b);
//   XOR  → xor  g(y, a, b);
//   NAND → nand g(y, a, b);
//   NOR  → nor  g(y, a, b);
//   XNOR → xnor g(y, a, b);
//   NOT  → not  g(y, a);
//   BUF  → buf  g(y, a);
//
// TRIBUF lowers to `assign y = en ? a : 1'bz;` — high-Z when EN is
// low. Synthesisable as a real tri-state on FPGA top-level pins; for
// internal nets the BUS translator (Phase 5e) handles the multi-
// driver lowerTriState pass.

import { COMPONENT_TYPES } from '../../components/Component.js';
import { registerTranslator } from './index.js';
import {
  makeInstance, makeRef, makeTernary, makeLiteral,
} from '../ir/types.js';
import { SourceRef } from '../core/SourceRef.js';

// Engine gate-name → Verilog primitive type. Verilog's named primitives
// match our gate set exactly except for case.
const PRIMITIVE_BY_GATE = {
  AND:  'and',
  OR:   'or',
  XOR:  'xor',
  NAND: 'nand',
  NOR:  'nor',
  XNOR: 'xnor',
  NOT:  'not',
  BUF:  'buf',
};

const SINGLE_INPUT_GATES = new Set(['NOT', 'BUF']);

function _translateGateSlot(node, ctx) {
  // TRIBUF: distinct lowering — assign with ternary on EN, high-Z
  // otherwise. Doesn't fit the primitive-positional shape used for
  // and/or/xor/etc.
  if (node.gate === 'TRIBUF') {
    const aNet  = ctx.inputNet(node.id, 0);
    const enNet = ctx.inputNet(node.id, 1);
    const yNet  = ctx.netOf(node.id, 0);
    if (!aNet || !enNet || !yNet) return {};
    const sr = SourceRef.fromNode(node.id);
    // 1'bz literal expressed as a Verilog string-literal (the IR's
    // Literal node is integer-valued; for tri-state we hand-roll an
    // expression the pretty-printer emits verbatim).
    const hiZ = { kind: 'Literal', sourceRef: sr, attributes: [],
      value: 0, width: 1, _verilog: "1'bz" };
    return {
      assigns: [{
        kind: 'Assign', sourceRef: sr, attributes: [],
        lhs: makeRef(yNet.name, 1),
        rhs: makeTernary(
          makeRef(enNet.name, 1),
          makeRef(aNet.name, 1),
          hiZ,
          1, sr,
        ),
      }],
    };
  }

  const verilogType = PRIMITIVE_BY_GATE[node.gate];
  if (!verilogType) {
    // GATE_SLOT with an empty or unsupported gate field — leave unmapped
    // so fromCircuit emits a TODO comment.
    return {};
  }

  const yNet = ctx.netOf(node.id, 0);
  const aNet = ctx.inputNet(node.id, 0);
  const bNet = SINGLE_INPUT_GATES.has(node.gate)
    ? null
    : ctx.inputNet(node.id, 1);

  // Bail if we can't resolve every required net — skipping yields a
  // TODO comment in the output rather than an invalid gate instance.
  if (!yNet || !aNet) return {};
  if (!SINGLE_INPUT_GATES.has(node.gate) && !bNet) return {};

  const portMap = bNet
    ? { Y: makeRef(yNet.name, 1), A: makeRef(aNet.name, 1), B: makeRef(bNet.name, 1) }
    : { Y: makeRef(yNet.name, 1), A: makeRef(aNet.name, 1) };
  const portOrder = bNet ? ['Y', 'A', 'B'] : ['Y', 'A'];

  return {
    instance: {
      ...makeInstance({
        type: verilogType,
        portMap,
        sourceRef: SourceRef.fromNode(node.id),
      }),
      isPrimitive: true,
      portOrder,
    },
  };
}

registerTranslator(COMPONENT_TYPES.GATE_SLOT, _translateGateSlot);
