// L2 semantic-equivalence harness.
//
// Given a circuit JSON, drive deterministic stimulus on every primary
// INPUT, run BOTH the native simulator AND iverilog over the exported
// Verilog, and compare per-step values on every primary OUTPUT.
//
// Phase A scope: combinational circuits only. No CLOCK, no FF state —
// every step is independent, the stimulus enumerates input vectors and
// the diff is an exact bit-for-bit match on outputs.
//
// Sequential L2 (clock + stability window) is Phase B and lives in
// runL2Sequential.js so the combinational harness can stay flat.

import { exportCircuit } from '../VerilogExporter.js';
import { simulate, isIverilogAvailable } from './iverilog.js';
import { vcdDiff } from './vcdDiff.js';
import { evaluate } from '../../engine/SimulationEngine.js';
import { sanitizeIdentifier } from '../core/identifiers.js';

// All input combinations for N 1-bit inputs. Caller can pass a custom
// stimulus when the design has wide buses (2^32 vectors is not great).
function _enumerateBits(inputs) {
  const N = inputs.length;
  const out = [];
  const limit = 1 << N;
  for (let v = 0; v < limit; v++) {
    const vec = {};
    for (let i = 0; i < N; i++) vec[inputs[i].id] = (v >> i) & 1;
    out.push(vec);
  }
  return out;
}

// Emit a VCD whose timeline mirrors `samples` — one step per stimulus
// vector. We only emit values for the top-level INPUT and OUTPUT nodes
// (matched against the exported port names so vcdDiff can join them).
function _nativeVCD(circuit, samples, stepNs = 10) {
  const inputs  = circuit.nodes.filter(n => n.type === 'INPUT'  || n.type === 'CLOCK');
  const outputs = circuit.nodes.filter(n => n.type === 'OUTPUT');

  // Allocate VCD identifier characters in the printable range.
  let idChar = 33;
  const idOf = new Map();
  const lines = [];
  lines.push('$timescale 1ns/1ps $end');
  lines.push('$scope module top $end');
  for (const n of [...inputs, ...outputs]) {
    const name = sanitizeIdentifier(n.label || n.id, 'n');
    const width = Math.max(1, (n.bitWidth ?? n.width ?? 1) | 0);
    const id = String.fromCharCode(idChar++);
    idOf.set(n.id, { id, name, width });
    lines.push(`$var wire ${width} ${id} ${name} $end`);
  }
  lines.push('$upscope $end');
  lines.push('$enddefinitions $end');

  const fmt = (v, width) => {
    if (width === 1) return String((v | 0) & 1);
    const bits = ((v | 0) >>> 0).toString(2).padStart(width, '0').slice(-width);
    return 'b' + bits + ' ';
  };

  // Re-evaluate the engine for each stimulus vector. fixedValue on the
  // INPUT node is the engine's stimulus knob.
  const ffStates = new Map();
  for (let s = 0; s < samples.length; s++) {
    const vec = samples[s];
    for (const n of inputs) {
      if (vec[n.id] !== undefined) n.fixedValue = vec[n.id];
    }
    const result = evaluate(circuit.nodes, circuit.wires, ffStates, s);
    lines.push(`#${s * stepNs}`);
    // Inputs first (we drove them), outputs second.
    for (const n of inputs) {
      const meta = idOf.get(n.id);
      const v = vec[n.id] ?? 0;
      lines.push(meta.width === 1 ? fmt(v, 1) + meta.id : fmt(v, meta.width) + meta.id);
    }
    for (const n of outputs) {
      const meta = idOf.get(n.id);
      // Engine writes the OUTPUT's value at nodeValues.get(node.id) when
      // the wire targeting it has propagated.
      const v = result.nodeValues.get(n.id) ?? 0;
      lines.push(meta.width === 1 ? fmt(v, 1) + meta.id : fmt(v, meta.width) + meta.id);
    }
  }
  return lines.join('\n') + '\n';
}

// Build a Verilog testbench that drives the same stimulus into the
// exported design and dumps VCD. Combinational only — no clock, just
// `#stepNs` between vectors.
function _buildL2TB(verilogText, samples, stepNs, topName) {
  // Pull port list from the exported Verilog header.
  const ports = [];
  const re = /^\s*(input|output|inout)\s+(?:\[(\d+):(\d+)\]\s+)?([A-Za-z_][A-Za-z0-9_$]*)/gm;
  let m;
  while ((m = re.exec(verilogText))) {
    ports.push({
      dir: m[1],
      width: m[2] ? Math.abs(+m[2] - +m[3]) + 1 : 1,
      name: m[4],
    });
  }
  const inputs  = ports.filter(p => p.dir === 'input');
  const outputs = ports.filter(p => p.dir !== 'input');

  // Map stimulus keys (engine node IDs) → TB port names (sanitised
  // labels). Caller passes input nodes; the port name is sanitize(label).
  // We resolve at the TB-generation time by searching ports by name
  // exactly as fromCircuit produces them.
  const lines = [];
  // 1ns/1ns matches the native VCD time units exactly. With the
  // default 1ns/1ps, iverilog scales `#10` to 10000 in its dump and
  // every diff disagrees because the timelines never align.
  lines.push('`timescale 1ns/1ns');
  lines.push(`module ${topName}_tb;`);
  for (const p of inputs)  lines.push(`  reg ${p.width > 1 ? `[${p.width-1}:0] ` : ''}${p.name};`);
  for (const p of outputs) lines.push(`  wire ${p.width > 1 ? `[${p.width-1}:0] ` : ''}${p.name};`);
  lines.push('');
  lines.push(`  ${topName} dut (`);
  lines.push(ports.map(p => `    .${p.name}(${p.name})`).join(',\n'));
  lines.push('  );');
  lines.push('');
  lines.push('  initial begin');
  lines.push(`    $dumpfile("dump.vcd");`);
  lines.push(`    $dumpvars(0, ${topName}_tb.dut);`);
  // Time alignment with the native VCD: sample i lands at time i*stepNs
  // on both sides. Sample 0 is therefore driven AT t=0 (no leading
  // delay), and `$dumpvars` records the resulting outputs as the t=0
  // entry. Subsequent samples advance time by stepNs each.
  const assignsFor = (vec) => {
    const out = [];
    for (const p of inputs) {
      const v = vec[p.name];
      if (v !== undefined) {
        out.push(`${p.name} = ${p.width}'h${(v >>> 0).toString(16)};`);
      }
    }
    return out.join(' ');
  };
  if (samples.length) {
    lines.push(`    ${assignsFor(samples[0].__byPortName || {})}`);
    for (let i = 1; i < samples.length; i++) {
      lines.push(`    #${stepNs} ${assignsFor(samples[i].__byPortName || {})}`);
    }
  }
  lines.push(`    #${stepNs} $finish;`);
  lines.push('  end');
  lines.push('endmodule');
  return lines.join('\n') + '\n';
}

// Top-level entry point. Returns:
//   { ok: true }                                 — diff matched
//   { ok: false, divergence: {...} }             — first mismatch
//   { ok: true, skipped: true, reason: '...' }   — iverilog unavailable
export function runL2(circuit, { stimulus = null, stepNs = 10, topName = 'top' } = {}) {
  if (!isIverilogAvailable()) {
    return { ok: true, skipped: true, reason: 'iverilog not on PATH' };
  }

  const inputNodes = circuit.nodes.filter(n => n.type === 'INPUT');
  const outputNodes = circuit.nodes.filter(n => n.type === 'OUTPUT');
  if (outputNodes.length === 0) {
    return { ok: true, skipped: true, reason: 'no OUTPUT nodes' };
  }

  // Default stimulus: enumerate every 2^N combination (1-bit only here).
  const samples = stimulus || (() => {
    const widthSum = inputNodes.reduce((s, n) => s + Math.max(1, (n.bitWidth || 1) | 0), 0);
    if (widthSum > 8) {
      return null;   // caller must supply
    }
    return _enumerateBits(inputNodes);
  })();
  if (!samples) {
    return { ok: false, reason: 'auto-enumeration too large; pass `stimulus`' };
  }

  // Annotate each sample with __byPortName for the TB builder.
  for (const s of samples) {
    s.__byPortName = {};
    for (const inp of inputNodes) {
      const pn = sanitizeIdentifier(inp.label || inp.id, 'in');
      s.__byPortName[pn] = s[inp.id] ?? 0;
    }
  }

  // Native VCD first — read engine values as our reference.
  const expectedVCD = _nativeVCD(circuit, samples, stepNs);

  // Export Verilog + build TB + run iverilog.
  const v = exportCircuit(circuit, { topName, header: false });
  const tb = _buildL2TB(v, samples, stepNs, topName);
  const result = simulate(v + '\n' + tb, { standard: '2005', vcdName: 'dump.vcd' });
  if (!result.ok) {
    return { ok: false, reason: 'iverilog failure', stderr: result.stderr };
  }
  if (!result.vcd) {
    return { ok: false, reason: 'iverilog produced no VCD' };
  }

  // Compare on top-level OUTPUT names only — internal nets differ
  // between the two scopes intentionally.
  const outNames = outputNodes.map(n => sanitizeIdentifier(n.label || n.id, 'out'));
  const diff = vcdDiff(expectedVCD, result.vcd, { signals: outNames });
  if (!diff.ok) {
    return { ok: false, divergence: diff.firstDivergence };
  }
  return { ok: true };
}

// ── Phase B — sequential L2 ─────────────────────────────────
// Same shape as runL2 but with a clock domain. Each cycle is `period`
// time units long: inputs change at t = i*period, the clock rises at
// t = i*period + period/2, and the diff samples outputs after the
// rising edge (when registers have latched the new state).
//
// `stabilityCycles` skips the diff over the first N cycles. iverilog
// boots regs to `x` while our engine boots them to `0`; without the
// skip, every register design would diverge on cycle 0.
export function runL2Sequential(circuit, opts = {}) {
  const { stimulus, cycles = 16, period = 10, stabilityCycles = 2,
          topName = 'top' } = opts;
  if (!isIverilogAvailable()) {
    return { ok: true, skipped: true, reason: 'iverilog not on PATH' };
  }

  const clkNode = circuit.nodes.find(n => n.type === 'CLOCK');
  if (!clkNode) return { ok: false, reason: 'sequential harness needs a CLOCK node' };
  // Phase-4-aware components (PC, REG_FILE, REG_FILE_DP) check
  // `wire.isClockWire` to spot the clock edge in their post-pass. The
  // harness shouldn't force the user to remember to flag every wire,
  // so we auto-mark any wire whose source is a CLOCK node. Operates
  // on the user's own array; harmless even if already set.
  for (const w of circuit.wires) {
    if (w.sourceId === clkNode.id) w.isClockWire = true;
  }
  const dataInputs = circuit.nodes.filter(n => n.type === 'INPUT');
  const outputs    = circuit.nodes.filter(n => n.type === 'OUTPUT');
  if (outputs.length === 0) {
    return { ok: true, skipped: true, reason: 'no OUTPUT nodes' };
  }

  // Build per-cycle stimulus. Caller can pass `stimulus` as either a
  // function (cycleIdx) → vec or an array of vecs. Default zeroes.
  const samples = [];
  for (let i = 0; i < cycles; i++) {
    let vec;
    if (typeof stimulus === 'function')      vec = stimulus(i) || {};
    else if (Array.isArray(stimulus))        vec = stimulus[i] || {};
    else                                     vec = {};
    samples.push(vec);
  }

  // ── Native run + VCD ────────────────────────────────────────
  // For each cycle: set inputs, drop CLK to 0 + evaluate (settle),
  // then raise CLK to 1 + evaluate (rising edge — FFs latch). We
  // capture output values after the rising edge and emit them at
  // t = i*period + period/2 so the timeline matches iverilog.
  let idChar = 33;
  const idOf = new Map();
  const vcdLines = [];
  vcdLines.push('$timescale 1ns/1ns $end');
  vcdLines.push('$scope module top $end');
  for (const n of outputs) {
    const name = sanitizeIdentifier(n.label || n.id, 'out');
    const width = Math.max(1, (n.bitWidth || 1) | 0);
    const id = String.fromCharCode(idChar++);
    idOf.set(n.id, { id, name, width });
    vcdLines.push(`$var wire ${width} ${id} ${name} $end`);
  }
  vcdLines.push('$upscope $end');
  vcdLines.push('$enddefinitions $end');
  const fmt = (v, width) => width === 1
    ? String((v | 0) & 1)
    : 'b' + ((v | 0) >>> 0).toString(2).padStart(width, '0').slice(-width) + ' ';

  const ffStates = new Map();
  const halfPeriod = period >> 1;
  for (let i = 0; i < cycles; i++) {
    const vec = samples[i];
    for (const n of dataInputs) {
      if (vec[n.id] !== undefined) n.fixedValue = vec[n.id];
    }
    // Low phase
    clkNode.value = 0;
    evaluate(circuit.nodes, circuit.wires, ffStates, i * 2);
    // Rising edge
    clkNode.value = 1;
    const r = evaluate(circuit.nodes, circuit.wires, ffStates, i * 2 + 1);
    vcdLines.push(`#${i * period + halfPeriod}`);
    for (const n of outputs) {
      const meta = idOf.get(n.id);
      const v = r.nodeValues.get(n.id) ?? 0;
      vcdLines.push(meta.width === 1
        ? fmt(v, 1) + meta.id
        : fmt(v, meta.width) + meta.id);
    }
  }
  const expectedVCD = vcdLines.join('\n') + '\n';

  // ── Verilog export + sequential TB ─────────────────────────
  const v = exportCircuit(circuit, { topName, header: false });
  // Pull port table from the exported header for the TB.
  const tbPorts = [];
  const re = /^\s*(input|output|inout)\s+(?:\[(\d+):(\d+)\]\s+)?([A-Za-z_][A-Za-z0-9_$]*)/gm;
  let mm;
  while ((mm = re.exec(v))) {
    tbPorts.push({ dir: mm[1], width: mm[2] ? Math.abs(+mm[2] - +mm[3]) + 1 : 1, name: mm[4] });
  }
  const inputsTb  = tbPorts.filter(p => p.dir === 'input');
  const outputsTb = tbPorts.filter(p => p.dir !== 'input');
  const clkName   = sanitizeIdentifier(clkNode.label || clkNode.id, 'in');

  // Map sample's engine node IDs to TB port names.
  for (const s of samples) {
    s.__byPortName = {};
    for (const inp of dataInputs) {
      const pn = sanitizeIdentifier(inp.label || inp.id, 'in');
      s.__byPortName[pn] = s[inp.id] ?? 0;
    }
  }
  const tbLines = [];
  tbLines.push('`timescale 1ns/1ns');
  tbLines.push(`module ${topName}_tb;`);
  for (const p of inputsTb)  tbLines.push(`  reg ${p.width > 1 ? `[${p.width-1}:0] ` : ''}${p.name};`);
  for (const p of outputsTb) tbLines.push(`  wire ${p.width > 1 ? `[${p.width-1}:0] ` : ''}${p.name};`);
  tbLines.push('');
  tbLines.push(`  ${topName} dut (`);
  tbLines.push(tbPorts.map(p => `    .${p.name}(${p.name})`).join(',\n'));
  tbLines.push('  );');
  tbLines.push('');
  tbLines.push(`  initial ${clkName} = 0;`);
  tbLines.push(`  always #${halfPeriod} ${clkName} = ~${clkName};`);
  tbLines.push('');
  tbLines.push('  initial begin');
  tbLines.push(`    $dumpfile("dump.vcd");`);
  tbLines.push(`    $dumpvars(0, ${topName}_tb.dut);`);
  // Initialise data inputs to 0.
  for (const p of inputsTb) {
    if (p.name === clkName) continue;
    tbLines.push(`    ${p.name} = ${p.width}'h0;`);
  }
  for (let i = 0; i < cycles; i++) {
    const vec = samples[i].__byPortName;
    const assigns = [];
    for (const p of inputsTb) {
      if (p.name === clkName) continue;
      const val = vec[p.name];
      if (val !== undefined) {
        assigns.push(`${p.name} = ${p.width}'h${(val >>> 0).toString(16)};`);
      }
    }
    if (i === 0) {
      // Apply cycle-0 inputs at t=0 BEFORE the first rising edge at
      // t=halfPeriod. The "always" toggling above will produce that
      // edge at the right time.
      if (assigns.length) tbLines.push(`    ${assigns.join(' ')}`);
    } else {
      // Subsequent cycles: change inputs at t = i*period (low phase
      // again), giving the design time before the next rising edge
      // at t = i*period + halfPeriod.
      tbLines.push(`    #${period} ${assigns.join(' ')}`);
    }
  }
  tbLines.push(`    #${period} $finish;`);
  tbLines.push('  end');
  tbLines.push('endmodule');
  const tb = tbLines.join('\n') + '\n';

  const r = simulate(v + '\n' + tb, { standard: '2005', vcdName: 'dump.vcd' });
  if (!r.ok)   return { ok: false, reason: 'iverilog failure', stderr: r.stderr };
  if (!r.vcd)  return { ok: false, reason: 'iverilog produced no VCD' };

  const outNames = outputs.map(n => sanitizeIdentifier(n.label || n.id, 'out'));
  const startTime = stabilityCycles * period + halfPeriod;
  // Diff only at clock-edge sample times. Async-read components
  // (REG_FILE / RAM / ROM with re=1) update their outputs between
  // edges in iverilog when address changes, but the native engine
  // only re-evaluates per cycle. The L2 contract is "match at
  // sample boundaries"; in-between ripples are intentional.
  const sampleTimes = new Set();
  for (let i = 0; i < cycles; i++) sampleTimes.add(i * period + halfPeriod);
  const diff = vcdDiff(expectedVCD, r.vcd, { signals: outNames, startTime, sampleTimes });
  if (!diff.ok) return { ok: false, divergence: diff.firstDivergence };
  return { ok: true };
}
