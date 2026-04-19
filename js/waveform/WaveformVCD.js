/**
 * WaveformVCD — Value Change Dump import/export.
 *
 * VCD is the lingua franca of HDL simulators (GTKWave, ModelSim, Vivado,
 * Verilator). Exporting to VCD lets users open circuit-designer waveforms
 * in any industry-standard viewer, and importing lets external traces be
 * displayed here.
 *
 * Spec reference: IEEE 1364-2005 §18.
 */

import { state, isBusSignal, signalBits } from './WaveformState.js';
import { colorForName, COLORS } from './WaveformTheme.js';

/**
 * Convert the current recorded history into a VCD (.vcd) text file.
 * Returns a string ready to be saved / downloaded.
 *
 * Each cycle maps to 10 time units (1 "tick" per cycle then `#t`), giving
 * rising/falling edges a bit of room in the timeline for viewers that like
 * non-zero pulse widths.
 */
export function exportVCD({ timescale = '1ns', scope = 'circuit_designer' } = {}) {
  if (!state.signals.length) return '';

  const TIME_PER_STEP = 10;
  const lines = [];

  // ── Header ──────────────────────────────────────────────────
  const now = new Date().toISOString();
  lines.push('$date');
  lines.push('    ' + now);
  lines.push('$end');
  lines.push('$version');
  lines.push('    Circuit Designer Pro — Waveform Pro');
  lines.push('$end');
  lines.push('$comment');
  lines.push('    Exported from js/waveform/WaveformVCD.js');
  lines.push('$end');
  lines.push(`$timescale ${timescale} $end`);
  lines.push(`$scope module ${_sanitize(scope)} $end`);

  // Assign a unique printable ID to each signal (! through ~ = 94 chars;
  // fall back to two-char IDs if there are more signals than that).
  const idFor = new Map();
  state.signals.forEach((sig, i) => idFor.set(sig.id, _makeId(i)));

  state.signals.forEach(sig => {
    const bits = isBusSignal(sig.id) ? signalBits(sig.id) : 1;
    const name = _sanitize(sig.label || sig.id);
    lines.push(`$var wire ${bits} ${idFor.get(sig.id)} ${name} $end`);
  });

  lines.push('$upscope $end');
  lines.push('$enddefinitions $end');

  // ── Initial values (t=0) ───────────────────────────────────
  lines.push('#0');
  lines.push('$dumpvars');
  const firstEntry = state.history[0];
  state.signals.forEach(sig => {
    const val = firstEntry ? (firstEntry.signals.get(sig.id) ?? 0) : 0;
    const id  = idFor.get(sig.id);
    const bits = isBusSignal(sig.id) ? signalBits(sig.id) : 1;
    lines.push(_formatValue(val, bits, id));
  });
  lines.push('$end');

  // ── Change list ────────────────────────────────────────────
  // Walk history; emit a time marker + only the signals whose values changed.
  const prevVals = new Map();
  if (firstEntry) state.signals.forEach(sig => prevVals.set(sig.id, firstEntry.signals.get(sig.id) ?? 0));

  for (let i = 1; i < state.history.length; i++) {
    const entry = state.history[i];
    const changes = [];
    state.signals.forEach(sig => {
      const v = entry.signals.get(sig.id) ?? 0;
      if (v !== prevVals.get(sig.id)) {
        const bits = isBusSignal(sig.id) ? signalBits(sig.id) : 1;
        changes.push(_formatValue(v, bits, idFor.get(sig.id)));
        prevVals.set(sig.id, v);
      }
    });
    if (changes.length > 0) {
      lines.push('#' + (i * TIME_PER_STEP));
      lines.push(...changes);
    }
  }

  // Final timestamp so viewers know how long the trace runs.
  lines.push('#' + (state.history.length * TIME_PER_STEP));

  return lines.join('\n') + '\n';
}

// ── Helpers ──────────────────────────────────────────────────

/** Format `value` as a VCD value-change line for the given identifier. */
function _formatValue(value, bits, id) {
  if (bits === 1) {
    // Single-bit: `0id` or `1id` (no space). x / z also valid; treat null as x.
    if (value === null || value === undefined) return 'x' + id;
    return ((value & 1) ? '1' : '0') + id;
  }
  // Vector: `bXXXXX id`. Minimize leading zeros per spec (leading zeros can be dropped).
  const v = (value >>> 0);
  let bin = v.toString(2);
  // Keep length compact but not longer than `bits` (trim leading 1s? spec allows shorter).
  if (bin.length > bits) bin = bin.slice(bin.length - bits);
  return 'b' + bin + ' ' + id;
}

/** Deterministic VCD identifier for signal index N (! through ~, then multi-char). */
function _makeId(index) {
  const BASE = 94; // printable ASCII from ! (33) to ~ (126)
  const START = 33;
  let out = '';
  let n = index;
  do {
    out = String.fromCharCode(START + (n % BASE)) + out;
    n = Math.floor(n / BASE) - 1;
  } while (n >= 0);
  return out;
}

/** Make a signal name safe for the VCD $var field (no spaces / special chars). */
function _sanitize(name) {
  return String(name).replace(/[^A-Za-z0-9_]/g, '_') || 'unnamed';
}

// ─────────────────────────────────────────────────────────────
// VCD Import
// ─────────────────────────────────────────────────────────────

/**
 * Parse a VCD text blob and return a structured payload ready to plug into
 * the waveform state. Caller is responsible for calling
 * WaveformState.deserializeImport(result) (or equivalent) to apply it.
 *
 * Supports the most common subset:
 *   - $var wire / reg / logic (any type, treated uniformly)
 *   - $scope module (flat scopes are used directly; nested scopes are
 *     flattened with "." separators for display)
 *   - #<time> timestamps
 *   - 0<id> / 1<id> scalar changes; x/z treated as null
 *   - b<binary> <id> vector changes
 *
 * Returns { signals: [...], history: [...] } or throws on malformed input.
 */
export function importVCD(text) {
  if (!text || typeof text !== 'string') throw new Error('Empty VCD input');

  const tokens = text.split(/\s+/).filter(Boolean);
  const vars = []; // { id, name, bits, scope }
  const idToIndex = new Map();
  let scopeStack = [];

  // ── Header parse ────────────────────────────────────────────
  let i = 0;
  let definitionsEnded = false;
  while (i < tokens.length && !definitionsEnded) {
    const tok = tokens[i++];
    switch (tok) {
      case '$var': {
        // $var <type> <bits> <id> <name[extra]> $end
        /* type */ i++;
        const bits = parseInt(tokens[i++], 10);
        const id = tokens[i++];
        // Name may be followed by bit-range in brackets; keep simple.
        let name = tokens[i++];
        while (i < tokens.length && tokens[i] !== '$end') {
          name += ' ' + tokens[i++];
        }
        i++; // skip $end
        const scope = scopeStack.join('.');
        const displayName = name.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
        idToIndex.set(id, vars.length);
        vars.push({ id, name: displayName, bits: Number.isFinite(bits) ? bits : 1, scope });
        break;
      }
      case '$scope': {
        /* type */ i++;
        scopeStack.push(tokens[i++]);
        while (i < tokens.length && tokens[i++] !== '$end') { /* skip */ }
        break;
      }
      case '$upscope':
        scopeStack.pop();
        while (i < tokens.length && tokens[i++] !== '$end') { /* skip */ }
        break;
      case '$enddefinitions':
        while (i < tokens.length && tokens[i++] !== '$end') { /* skip */ }
        definitionsEnded = true;
        break;
      case '$date': case '$version': case '$comment': case '$timescale':
        // Skip body up to matching $end.
        while (i < tokens.length && tokens[i++] !== '$end') { /* skip */ }
        break;
      default:
        // Unknown command at header — just skip.
        break;
    }
  }

  if (vars.length === 0) throw new Error('No $var declarations found in VCD');

  // Synthesize our internal signals — inherit colors from curated palette.
  const signals = vars.map(v => ({
    id: v.id, // we reuse VCD id as our signal id (unique within the file)
    label: v.name,
    color: /^clk$|clock/i.test(v.name) ? COLORS.clock : colorForName(v.name),
    type: /^clk$|clock/i.test(v.name) ? 'clock' : 'output',
    bits: v.bits,
  }));

  // ── Timeline parse ─────────────────────────────────────────
  // Track current values per signal id.
  const currentVals = new Map();
  for (const v of vars) currentVals.set(v.id, 0);

  const history = []; // [{ step, signals: Map<id, value> }]
  let absorbedChanges = false;

  const commitTimestamp = () => {
    const snap = new Map();
    for (const [id, v] of currentVals) snap.set(id, v);
    history.push({ step: history.length, signals: snap });
  };

  while (i < tokens.length) {
    const tok = tokens[i++];
    if (!tok) continue;

    // Timestamp marker: finalize the previous timestamp's snapshot (if any
    // changes were absorbed) before moving on to the new time.
    if (tok[0] === '#') {
      if (absorbedChanges) { commitTimestamp(); absorbedChanges = false; }
      continue;
    }

    // $dumpvars / $end / $dumpon / $dumpoff / $dumpall — markers only.
    if (tok === '$dumpvars' || tok === '$end' || tok === '$dumpon' || tok === '$dumpoff' || tok === '$dumpall') continue;

    // Scalar change: [01xzXZ]<id>
    if (/^[01xzXZ]./.test(tok)) {
      const ch = tok[0];
      const id = tok.slice(1);
      if (!idToIndex.has(id)) continue;
      const v = (ch === '1') ? 1 : (ch === '0') ? 0 : null;
      currentVals.set(id, v);
      absorbedChanges = true;
      continue;
    }

    // Vector change: b<bits> <id>   (or r<real> <id> — real coerced to int)
    if (tok[0] === 'b' || tok[0] === 'B') {
      const bin = tok.slice(1);
      const id = tokens[i++];
      if (!idToIndex.has(id)) continue;
      const cleaned = bin.replace(/[xzXZ]/g, '0');
      const v = cleaned.length ? parseInt(cleaned, 2) : 0;
      currentVals.set(id, Number.isFinite(v) ? v : 0);
      absorbedChanges = true;
      continue;
    }
    if (tok[0] === 'r' || tok[0] === 'R') {
      const val = parseFloat(tok.slice(1));
      const id = tokens[i++];
      if (!idToIndex.has(id)) continue;
      currentVals.set(id, Number.isFinite(val) ? Math.round(val) : 0);
      absorbedChanges = true;
      continue;
    }
  }
  // Final trailing snapshot (for files whose last timestamp has value changes
  // without a following '#N' to close it).
  if (absorbedChanges) commitTimestamp();

  return { signals, history };
}

