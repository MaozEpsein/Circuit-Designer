// Phase 11 — auto-layout tests.
//   • Every node gets non-(0,0) coordinates after layout.
//   • Inputs land in column 0; outputs in the rightmost column.
//   • Two layouts of the same circuit produce identical coordinates
//     (deterministic — needed so re-imports don't shuffle the canvas).
//   • Within a column, nodes are spread vertically without overlap.
// Run: node examples/tests/test-hdl-layout.mjs

import { importVerilog }              from '../../js/hdl/VerilogExporter.js';
import { autoLayout, autoLayoutAsync } from '../../js/hdl/import/autoLayout.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('autoLayout — every node positioned');
{
  const { circuit } = importVerilog(`module top(input a, input b, output y);
    and g(y, a, b);
  endmodule`);
  check('layout summary attached', !!circuit._layout && circuit._layout.nodes === circuit.nodes.length);
  check('all nodes have x/y',
    circuit.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));
  check('not every node at the same point',
    new Set(circuit.nodes.map(n => `${n.x},${n.y}`)).size > 1);
}

console.log('autoLayout — inputs left, outputs right');
{
  const { circuit } = importVerilog(`module top(input a, input b, input c, output y);
    wire t;
    and g0(t, a, b);
    or  g1(y, t, c);
  endmodule`);
  const xs = Object.fromEntries(circuit.nodes.map(n => [n.label, n.x]));
  // The intermediate wire `t` becomes the AND gate (`g0`); the OR is g1.
  check('a/b/c on the left',  xs.a < xs.g0 && xs.b < xs.g0 && xs.c < xs.g1);
  check('y on the right',     xs.y > xs.g1);
  check('AND before OR',      xs.g0 < xs.g1);
}

console.log('autoLayout — deterministic across runs');
{
  const src = `module top(input a, input b, output y);
    wire t;
    and g0(t, a, b);
    not g1(y, t);
  endmodule`;
  const a = importVerilog(src).circuit;
  const b = importVerilog(src).circuit;
  const aPos = a.nodes.map(n => `${n.label}@${n.x},${n.y}`).sort().join('|');
  const bPos = b.nodes.map(n => `${n.label}@${n.x},${n.y}`).sort().join('|');
  check('two imports yield identical coordinates', aPos === bPos);
}

console.log('autoLayout — vertical spacing within a column avoids overlap');
{
  const { circuit } = importVerilog(`module top(input a, input b, input c, input d, output [3:0] y);
    assign y[0] = a;
    assign y[1] = b;
    assign y[2] = c;
    assign y[3] = d;
  endmodule`);
  // Group inputs by column (they're all in col 0). Their y's must be distinct.
  const inputs = circuit.nodes.filter(n => n.type === 'INPUT');
  const ys = inputs.map(n => n.y);
  check('all inputs distinct y',  new Set(ys).size === ys.length);
}

console.log('autoLayout — clock wire ignored when computing depth');
{
  const { circuit } = importVerilog(`module top(input clk, input d, output q);
    reg q_ff;
    always @(posedge clk) q_ff <= d;
    assign q = q_ff;
  endmodule`);
  // Without the clock-wire skip, the FF's column would chase clk
  // forever. With it, FF lands one step right of d.
  const xs = Object.fromEntries(circuit.nodes.map(n => [n.label || n.type, n.x]));
  check('FF placed to the right of d', xs.q_ff > xs.d);
  check('q on the rightmost column',  xs.q >= xs.q_ff);
}

console.log('autoLayout — opt-out via { layout: false }');
{
  const { circuit } = importVerilog('module top(input a, output y); assign y = a; endmodule', { layout: false });
  // No layout pass → every node still at (0,0) and no _layout summary.
  check('no _layout summary',         !circuit._layout);
  check('every node at (0,0)',        circuit.nodes.every(n => n.x === 0 && n.y === 0));
}

console.log('autoLayout — works on a hand-built circuit (no import)');
{
  const c = {
    nodes: [
      { id: 'a', type: 'INPUT',  label: 'a', x: 0, y: 0 },
      { id: 'b', type: 'INPUT',  label: 'b', x: 0, y: 0 },
      { id: 'g', type: 'GATE_SLOT', gate: 'AND', label: 'g', x: 0, y: 0 },
      { id: 'y', type: 'OUTPUT', label: 'y', x: 0, y: 0 },
    ],
    wires: [
      { id: 'w0', sourceId: 'a', targetId: 'g', targetInputIndex: 0 },
      { id: 'w1', sourceId: 'b', targetId: 'g', targetInputIndex: 1 },
      { id: 'w2', sourceId: 'g', targetId: 'y', targetInputIndex: 0 },
    ],
  };
  autoLayout(c);
  check('hand-built circuit gets layout',
    c.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y))
    && new Set(c.nodes.map(n => `${n.x},${n.y}`)).size === c.nodes.length);
}

console.log('autoLayout — bus-lane allocation puts parallel wires on distinct lanes');
{
  // Four signals fan out from the same column boundary into four
  // gates one column over. They all share the same gutter, so each
  // wire should get a unique lane index.
  const { circuit } = importVerilog(`module top(input a0, input a1, input a2, input a3, input b0, input b1, input b2, input b3,
                                                output y0, output y1, output y2, output y3);
    and g0(y0, a0, b0);
    and g1(y1, a1, b1);
    and g2(y2, a2, b2);
    and g3(y3, a3, b3);
  endmodule`);
  // Pick any 4 wires that share (sourceCol, targetCol) and confirm
  // they got distinct _lane assignments.
  const lanes = circuit.wires.map(w => w._lane).filter(l => Number.isFinite(l));
  check('every wire received a _lane',    lanes.length === circuit.wires.length);
  // The wires from different gate-pairs share gutters; lanes within
  // the same gutter must be distinct. Group by source+target columns.
  const byCol = {};
  const colOf = id => circuit.nodes.find(n => n.id === id).x;
  for (const w of circuit.wires) {
    const sc = colOf(w.sourceId);
    const tc = colOf(w.targetId);
    const key = `${Math.min(sc, tc)}→${Math.max(sc, tc)}`;
    (byCol[key] ||= []).push(w._lane);
  }
  for (const key of Object.keys(byCol)) {
    const arr = byCol[key];
    if (arr.length < 2) continue;
    const distinct = new Set(arr).size === arr.length;
    check(`gutter ${key} has distinct lanes`, distinct, `lanes=[${arr.join(',')}]`);
  }
  check('layout summary records wireLanes count',
    circuit._layout.wireLanes === circuit.wires.length);
}

console.log('autoLayout — wires never start/end at the same xy as another node');
{
  // Sanity: imported circuits shouldn't have wires whose endpoints
  // coincide with an unrelated node's center (that'd guarantee the
  // canvas router draws through the node).
  const { circuit } = importVerilog(`module top(input a, input b, input c, output y);
    and g0(t1, a, b);
    or  g1(y, t1, c);
  endmodule`);
  const nodeXY = new Map();
  for (const n of circuit.nodes) nodeXY.set(`${n.x},${n.y}`, n.id);
  let intersects = 0;
  for (const w of circuit.wires) {
    const src = circuit.nodes.find(n => n.id === w.sourceId);
    const tgt = circuit.nodes.find(n => n.id === w.targetId);
    // If src and tgt share x or y, fine — Manhattan router is OK.
    // We check that no UNRELATED node sits on the straight line.
    if (src.x === tgt.x) {
      const lo = Math.min(src.y, tgt.y), hi = Math.max(src.y, tgt.y);
      for (const n of circuit.nodes) {
        if (n.id === src.id || n.id === tgt.id) continue;
        if (n.x === src.x && n.y > lo && n.y < hi) intersects++;
      }
    }
  }
  check('no intermediate node on a straight wire path', intersects === 0);
}

console.log('autoLayoutAsync — yields control + reports progress');
{
  // Below threshold → sync path. Above threshold → yields.
  const small = importVerilog('module t(input a, output y); assign y = a; endmodule', { layout: false });
  const events = [];
  await autoLayoutAsync(small.circuit, {
    threshold: 1,
    onProgress: (phase, frac) => events.push([phase, frac]),
  });
  check('progress callback emitted at least one event', events.length >= 1);
  check('final event is `done` with fraction 1',
    events[events.length - 1][0] === 'done' && events[events.length - 1][1] === 1);
  check('async layout still positions every node',
    small.circuit.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));
}

if (failed > 0) {
  console.log(`\n${failed} layout test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll layout checks passed.');
}
