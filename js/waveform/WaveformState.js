/**
 * WaveformState — Centralized mutable state for the waveform module.
 * All views (renderer, controller) read from here; only state-specific
 * functions mutate it.
 */

import { COLORS, colorForName } from './WaveformTheme.js';

// Recorded signal history: array of { step, signals: Map<signalId, value> }
// Capped by a circular-buffer policy enforced in `record()` below.
const HISTORY_CAP = 20000;

export const state = {
  history: [],
  signals: [],
  visible: false,
  // View state — zoom is a multiplier on BASE_STEP_W; panOffset is in pixels
  // from the left of the data area (LABEL_W).
  zoom: 1,
  panOffset: 0,
  // Vertical scroll offset in pixels — for when the signal list is taller
  // than the visible panel area.
  vScroll: 0,
  panelHeight: 220,
  // Radix for displaying multi-bit bus values ('hex' | 'dec' | 'bin').
  radix: 'dec',
  // Per-signal overrides: Map<signalId, 'hex' | 'dec' | 'bin'>.
  radixOverrides: new Map(),
  // Maximum value seen for each signal (used to detect multi-bit buses).
  signalMax: new Map(),
};

export function reset() {
  state.history = [];
  state.signals = [];
  state.zoom = 1;
  state.panOffset = 0;
  state.signalMax = new Map();
}

export function setSignals(nodes) {
  if (!nodes) return;
  state.signals = [];
  // Clock keeps its canonical yellow color (always the CLK visual cue).
  nodes.forEach(n => {
    if (n.type === 'CLOCK') state.signals.push({ id: n.id, label: 'CLK', color: COLORS.clock, type: 'clock' });
  });
  // Other signals get a stable, per-name color from the curated palette.
  const addWithPaletteColor = (n, label, type) => {
    state.signals.push({ id: n.id, label, color: colorForName(label), type });
  };
  nodes.forEach(n => { if (n.type === 'INPUT')       addWithPaletteColor(n, n.label || n.id, 'input'); });
  nodes.forEach(n => { if (n.type === 'MUX_SELECT')  addWithPaletteColor(n, n.label || n.id, 'mux'); });
  nodes.forEach(n => { if (n.type === 'OUTPUT')      addWithPaletteColor(n, n.label || n.id, 'output'); });
}

export function record(stepCount, nodeValues) {
  if (!nodeValues) return;
  const signals = new Map();
  state.signals.forEach(sig => {
    const v = nodeValues.get(sig.id) ?? null;
    signals.set(sig.id, v);
    if (typeof v === 'number') {
      const prev = state.signalMax.get(sig.id) ?? 0;
      if (v > prev) state.signalMax.set(sig.id, v);
    }
  });
  const last = state.history[state.history.length - 1];
  if (last && last.step === stepCount) {
    last.signals = signals;
  } else {
    state.history.push({ step: stepCount, signals });
  }
  // Circular buffer: drop oldest when cap exceeded.
  if (state.history.length > HISTORY_CAP) {
    state.history.splice(0, state.history.length - HISTORY_CAP);
  }
}

/** Number of bits needed to represent the max value seen for a signal. */
export function signalBits(sigId) {
  const max = state.signalMax.get(sigId) ?? 0;
  if (max <= 1) return 1;
  return Math.max(1, Math.ceil(Math.log2(max + 1)));
}

/** Is this signal a multi-bit bus (max value > 1 seen)? */
export function isBusSignal(sigId) {
  return (state.signalMax.get(sigId) ?? 0) > 1;
}

/** Effective radix for a signal (per-signal override wins over global). */
export function radixFor(sigId) {
  return state.radixOverrides.get(sigId) || state.radix;
}

export function setRadix(r) {
  if (r === 'hex' || r === 'dec' || r === 'bin') state.radix = r;
}

/** Format a numeric value for display according to signal's radix + bits. */
export function formatValue(val, bits, radix) {
  if (val === null || val === undefined) return '?';
  const v = val >>> 0;
  if (radix === 'hex') return '0x' + v.toString(16).toUpperCase().padStart(Math.max(1, Math.ceil(bits / 4)), '0');
  if (radix === 'bin') return v.toString(2).padStart(Math.max(1, bits), '0');
  return v.toString();
}
