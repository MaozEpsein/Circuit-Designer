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
  // Cursor position as a fractional cycle index (null = not hovering).
  // Renderer draws a vertical line at this position and the side panel shows
  // each signal's value at this cycle.
  cursorStep: null,
  // Optional measurement markers (A/B). Each is a cycle index or null.
  markerA: null,
  markerB: null,
  // Signals the user has explicitly hidden from the view.
  hiddenSignals: new Set(),
  // Optional custom ordering of signal IDs (null = use discovery order).
  signalOrder: null,
  // In-progress drag state for row reordering (null when not dragging).
  // fromIdx is the source row index (visible-signals list); targetIdx is
  // where it would land if released now; ghostY is the current mouse Y.
  reorderDrag: null,
};

export function reset() {
  state.history = [];
  state.signals = [];
  state.zoom = 1;
  state.panOffset = 0;
  state.signalMax = new Map();
}

/** Return signals that should actually be rendered, in their display order. */
export function visibleSignals() {
  const all = state.signalOrder
    ? state.signalOrder.map(id => state.signals.find(s => s.id === id)).filter(Boolean)
    : state.signals;
  return all.filter(s => !state.hiddenSignals.has(s.id));
}

/** Move the signal at `fromIdx` to `toIdx` in the display order. */
export function reorderSignal(fromIdx, toIdx) {
  const base = state.signalOrder
    ? [...state.signalOrder]
    : state.signals.map(s => s.id);
  if (fromIdx < 0 || fromIdx >= base.length) return;
  if (toIdx < 0) toIdx = 0;
  if (toIdx >= base.length) toIdx = base.length - 1;
  const [moved] = base.splice(fromIdx, 1);
  base.splice(toIdx, 0, moved);
  state.signalOrder = base;
}

export function toggleHidden(sigId) {
  if (state.hiddenSignals.has(sigId)) state.hiddenSignals.delete(sigId);
  else state.hiddenSignals.add(sigId);
}

export function showAllSignals() { state.hiddenSignals.clear(); }

export function setSignals(nodes) {
  if (!nodes) return;
  state.signals = [];
  state.hiddenSignals = new Set();
  state.signalOrder = null;
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

/**
 * Return the recorded value of `sigId` at step index `stepIdx` (floor).
 * Returns null if no entry or out of range.
 */
export function valueAtStep(sigId, stepIdx) {
  const idx = Math.max(0, Math.min(state.history.length - 1, Math.floor(stepIdx)));
  const entry = state.history[idx];
  if (!entry) return null;
  const v = entry.signals.get(sigId);
  return v === undefined ? null : v;
}

/** Format a numeric value for display according to signal's radix + bits. */
export function formatValue(val, bits, radix) {
  if (val === null || val === undefined) return '?';
  const v = val >>> 0;
  if (radix === 'hex') return '0x' + v.toString(16).toUpperCase().padStart(Math.max(1, Math.ceil(bits / 4)), '0');
  if (radix === 'bin') return v.toString(2).padStart(Math.max(1, bits), '0');
  return v.toString();
}
