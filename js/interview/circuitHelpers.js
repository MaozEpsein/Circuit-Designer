/**
 * circuitHelpers.js — small builder API for question circuits.
 *
 * A question can declare an optional `circuit: (h) => ({ nodes, wires })`
 * function. The engine invokes it when the user clicks "טען על הקנבס",
 * after snapshotting the current scene so their work is recoverable.
 *
 * Helpers mirror the pattern in js/tutorial/solutions.js so authors who are
 * already familiar with the LEARN solutions can reuse the mental model.
 *
 * Usage from a question file:
 *
 *   import { build, h } from '../../js/interview/circuitHelpers.js';
 *
 *   circuit: () => build(() => {
 *     const inp = h.input(140, 200, 'in');
 *     const clk = h.clock(140, 320);
 *     const ff  = h.ffD(380, 200, 'FF');
 *     const out = h.output(620, 200, 'out');
 *     return {
 *       nodes: [inp, clk, ff, out],
 *       wires: [
 *         h.wire(inp.id, ff.id,  0),   // in → D
 *         h.wire(clk.id, ff.id,  1),   // clk → CLK
 *         h.wire(ff.id,  out.id, 0),   // Q  → out
 *       ],
 *     };
 *   })
 */

import { createComponent, createWire, COMPONENT_TYPES } from '../components/Component.js';

let _seq = 0;
function _nid() { return `iq-n${++_seq}`; }
function _wid() { return `iq-w${++_seq}`; }

export const h = {
  input(x, y, label) {
    const n = createComponent(COMPONENT_TYPES.INPUT, x, y);
    n.id = _nid();
    if (label) n.label = label;
    return n;
  },
  output(x, y, label) {
    const n = createComponent(COMPONENT_TYPES.OUTPUT, x, y);
    n.id = _nid();
    if (label) n.label = label;
    return n;
  },
  clock(x, y) {
    const n = createComponent(COMPONENT_TYPES.CLOCK, x, y);
    n.id = _nid();
    return n;
  },
  /** D-FF. Pin layout: D=0, CLK=1; output Q=0. */
  ffD(x, y, label = 'D-FF') {
    const n = createComponent(COMPONENT_TYPES.FF_SLOT, x, y);
    n.id = _nid();
    n.ffType = 'D';
    n.label = label;
    return n;
  },
  gate(kind, x, y) {
    const n = createComponent(COMPONENT_TYPES.GATE_SLOT, x, y);
    n.id = _nid();
    n.gate = kind;
    n.label = kind;
    return n;
  },
  /** Full Adder. Inputs A=0, B=1, Cin=2; outputs SUM=out0, COUT=out1. */
  fa(x, y, label = 'FA') {
    const n = createComponent(COMPONENT_TYPES.FULL_ADDER, x, y);
    n.id = _nid();
    n.label = label;
    return n;
  },
  /** Half Adder. Inputs A=0, B=1; outputs SUM=out0, COUT=out1. */
  ha(x, y, label = 'HA') {
    const n = createComponent(COMPONENT_TYPES.HALF_ADDER, x, y);
    n.id = _nid();
    n.label = label;
    return n;
  },
  /** 2:1 MUX. Inputs: d0=0, d1=1, sel=2. Output: sel ? d1 : d0. */
  mux(x, y, label = 'MUX') {
    const n = createComponent(COMPONENT_TYPES.MUX, x, y);
    n.id = _nid();
    n.inputCount = 2;
    n.label = label;
    return n;
  },
  block(type, x, y, overrides = {}) {
    const n = createComponent(type, x, y);
    n.id = _nid();
    Object.assign(n, overrides);
    return n;
  },
  wire(srcId, dstId, dstPin = 0, srcPin = 0, opts = {}) {
    const w = createWire(srcId, dstId, dstPin, srcPin, opts);
    w.id = _wid();
    return w;
  },
};

/** Run a builder with a fresh sequence so node/wire ids are deterministic. */
export function build(fn) {
  _seq = 0;
  return fn();
}
