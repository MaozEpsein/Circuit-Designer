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
