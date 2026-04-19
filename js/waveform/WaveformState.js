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
  // User-defined named bookmarks: [{ step, name }].
  bookmarks: [],
  // Set of group names the user has collapsed (hides all signals in them).
  collapsedGroups: new Set(),
  // Pattern search state: { query, matches: [stepIdx], index, open }.
  search: { query: '', matches: [], index: -1, open: false },
  // Trigger mode: armed + expression; while armed-and-not-fired, record() skips storing.
  trigger: { expr: '', armed: false, fired: false },
  // Full-screen mode — panel fills the viewport when true.
  fullscreen: false,
};

export function reset() {
  state.history = [];
  state.signals = [];
  state.zoom = 1;
  state.panOffset = 0;
  state.signalMax = new Map();
}

const TYPE_TO_GROUP = {
  clock: 'Clock',
  input: 'Inputs',
  mux:   'Controls',
  output:'Outputs',
};

/** Human-readable group name for a signal (based on its source-node type). */
export function groupOf(sig) {
  return TYPE_TO_GROUP[sig.type] || 'Signals';
}

/** Return signals that should actually be rendered, in their display order.
 *  Signals inside a collapsed group are excluded. */
export function visibleSignals() {
  const all = state.signalOrder
    ? state.signalOrder.map(id => state.signals.find(s => s.id === id)).filter(Boolean)
    : state.signals;
  return all.filter(s => !state.hiddenSignals.has(s.id) && !state.collapsedGroups.has(groupOf(s)));
}

/** Ordered list of distinct group names present in the current signals. */
export function groupsInOrder() {
  const seen = new Set();
  const ordered = [];
  const source = state.signalOrder
    ? state.signalOrder.map(id => state.signals.find(s => s.id === id)).filter(Boolean)
    : state.signals;
  for (const s of source) {
    const g = groupOf(s);
    if (!seen.has(g)) { seen.add(g); ordered.push(g); }
  }
  return ordered;
}

export function toggleGroup(name) {
  if (state.collapsedGroups.has(name)) state.collapsedGroups.delete(name);
  else state.collapsedGroups.add(name);
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

  // Trigger mode: if armed and not yet fired, evaluate the expression against
  // this step's values; only start actually storing history once it fires.
  if (state.trigger.armed && !state.trigger.fired) {
    const fn = compileExpression(state.trigger.expr);
    if (fn) {
      // Build a temporary single-step "history" tail so the evaluator can look at it.
      const tempIdx = state.history.length;
      state.history.push({ step: stepCount, signals });
      const fires = fn(tempIdx, tempIdx - 1);
      if (fires) {
        state.trigger.fired = true;
        // Drop a bookmark at the trigger point so the user can always find it.
        addBookmark(tempIdx, 'TRIG');
        if (state.history.length > HISTORY_CAP) state.history.splice(0, state.history.length - HISTORY_CAP);
        return;
      } else {
        state.history.pop(); // discard — not yet triggered
        return;
      }
    }
  }

  const last = state.history[state.history.length - 1];
  if (last && last.step === stepCount) {
    last.signals = signals;
  } else {
    state.history.push({ step: stepCount, signals });
  }
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
 * Find the next cycle after `fromStep` where `sigId` changes value.
 * Returns the cycle index or -1 if no further transition is recorded.
 */
export function nextEdgeStep(sigId, fromStep) {
  const start = Math.floor(fromStep) + 1;
  const n = state.history.length;
  let prev = valueAtStep(sigId, Math.floor(fromStep));
  for (let i = start; i < n; i++) {
    const v = state.history[i].signals.get(sigId);
    if (v !== prev) return i;
  }
  return -1;
}

/** Like nextEdgeStep but searching backwards. */
export function prevEdgeStep(sigId, fromStep) {
  const start = Math.floor(fromStep) - 1;
  if (start < 0) return -1;
  const curr = valueAtStep(sigId, Math.floor(fromStep));
  let lookingFor = curr;
  // Walk back until the value differs from the one under the cursor.
  for (let i = start; i >= 0; i--) {
    const v = state.history[i].signals.get(sigId);
    if (v !== lookingFor) return i + 1; // the transition point is just after this differing value
  }
  return -1;
}

export function addBookmark(step, name) {
  if (step == null) return;
  const label = name || ('B' + (state.bookmarks.length + 1));
  state.bookmarks.push({ step: Math.floor(step), name: label });
  // Keep sorted by cycle for easier rendering / navigation.
  state.bookmarks.sort((a, b) => a.step - b.step);
}

export function removeBookmarkAt(step) {
  state.bookmarks = state.bookmarks.filter(b => b.step !== step);
}

export function clearBookmarks() { state.bookmarks = []; }

/**
 * Produce a JSON-safe snapshot of the current view settings (NOT the
 * recorded history — just how the user has the viewer configured).
 * Hooked into the project save path so view state rides along with designs.
 */
export function serializeView() {
  return {
    v: 1,
    zoom: state.zoom,
    panOffset: state.panOffset,
    vScroll: state.vScroll,
    panelHeight: state.panelHeight,
    radix: state.radix,
    radixOverrides: Object.fromEntries(state.radixOverrides),
    hiddenSignals: [...state.hiddenSignals],
    signalOrder: state.signalOrder,
    collapsedGroups: [...state.collapsedGroups],
    bookmarks: state.bookmarks.map(b => ({ ...b })),
    markerA: state.markerA,
    markerB: state.markerB,
    trigger: { expr: state.trigger.expr, armed: state.trigger.armed, fired: state.trigger.fired },
  };
}

/**
 * Replace the current signals + history with a VCD-import payload.
 * Resets view state that depends on the old signal set (hidden, order,
 * overrides, bookmarks, markers) so the imported trace starts clean.
 */
export function applyImport(payload) {
  if (!payload || !Array.isArray(payload.signals) || !Array.isArray(payload.history)) return;
  state.signals = payload.signals.map(s => ({
    id: s.id,
    label: s.label,
    color: s.color,
    type: s.type || 'output',
  }));
  state.history = payload.history.map(e => ({
    step: e.step,
    signals: e.signals instanceof Map ? e.signals : new Map(Object.entries(e.signals || {})),
  }));
  // Recompute max values so bus detection works on imported data.
  state.signalMax = new Map();
  for (const entry of state.history) {
    for (const [sigId, v] of entry.signals) {
      if (typeof v === 'number') {
        const prev = state.signalMax.get(sigId) ?? 0;
        if (v > prev) state.signalMax.set(sigId, v);
      }
    }
  }
  // Reset view-dependent state to avoid stale references.
  state.hiddenSignals   = new Set();
  state.signalOrder     = null;
  state.collapsedGroups = new Set();
  state.radixOverrides  = new Map();
  state.bookmarks       = [];
  state.markerA         = null;
  state.markerB         = null;
  state.zoom            = 1;
  state.panOffset       = 0;
  state.vScroll         = 0;
  state.cursorStep      = null;
  state.trigger         = { expr: '', armed: false, fired: false };
}

/** Restore view settings from a serializeView() payload. Tolerates missing fields. */
export function deserializeView(data) {
  if (!data || typeof data !== 'object') return;
  if (typeof data.zoom === 'number')        state.zoom = data.zoom;
  if (typeof data.panOffset === 'number')   state.panOffset = data.panOffset;
  if (typeof data.vScroll === 'number')     state.vScroll = data.vScroll;
  if (typeof data.panelHeight === 'number') state.panelHeight = data.panelHeight;
  if (data.radix === 'hex' || data.radix === 'dec' || data.radix === 'bin') state.radix = data.radix;
  state.radixOverrides = new Map(Object.entries(data.radixOverrides || {}));
  state.hiddenSignals  = new Set(Array.isArray(data.hiddenSignals) ? data.hiddenSignals : []);
  state.signalOrder    = Array.isArray(data.signalOrder) ? data.signalOrder : null;
  state.collapsedGroups = new Set(Array.isArray(data.collapsedGroups) ? data.collapsedGroups : []);
  state.bookmarks      = Array.isArray(data.bookmarks) ? data.bookmarks.map(b => ({ step: b.step|0, name: String(b.name || '') })) : [];
  state.markerA        = (typeof data.markerA === 'number') ? data.markerA : null;
  state.markerB        = (typeof data.markerB === 'number') ? data.markerB : null;
  if (data.trigger) {
    state.trigger.expr  = String(data.trigger.expr || '');
    state.trigger.armed = !!data.trigger.armed;
    state.trigger.fired = !!data.trigger.fired;
  }
}

/**
 * Parse a simple search/trigger expression and return an evaluator function.
 * Supported forms:
 *   <signal>            — rising edge of the signal (0 → 1)
 *   <signal> == <val>   — equality (numeric or hex 0x..)
 *   <signal> != <val>   — inequality
 *   <signal> > <val>    — greater than
 *   <signal> < <val>    — less than
 * Returns a function (stepIdx, prevStepIdx) → bool, or null if unparseable.
 */
export function compileExpression(expr) {
  if (!expr || typeof expr !== 'string') return null;
  const trimmed = expr.trim();
  if (!trimmed) return null;

  const findSig = (name) => {
    const lowered = name.toLowerCase();
    return state.signals.find(s =>
      (s.label || '').toLowerCase() === lowered || s.id.toLowerCase() === lowered);
  };

  const parseNum = (s) => {
    s = s.trim();
    if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
    if (/^0b[01]+$/i.test(s))     return parseInt(s.slice(2), 2);
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  };

  const opMatch = trimmed.match(/^([A-Za-z_][\w]*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (opMatch) {
    const sig = findSig(opMatch[1]);
    if (!sig) return null;
    const num = parseNum(opMatch[3]);
    if (!Number.isFinite(num)) return null;
    const op = opMatch[2];
    return (idx) => {
      const v = valueAtStep(sig.id, idx);
      if (v === null || v === undefined) return false;
      switch (op) {
        case '==': return v === num;
        case '!=': return v !== num;
        case '>':  return v >  num;
        case '<':  return v <  num;
        case '>=': return v >= num;
        case '<=': return v <= num;
      }
      return false;
    };
  }

  // Plain signal name → rising edge (0 → non-0).
  const sig = findSig(trimmed);
  if (!sig) return null;
  return (idx, prevIdx) => {
    if (prevIdx < 0) return false;
    const prev = valueAtStep(sig.id, prevIdx);
    const curr = valueAtStep(sig.id, idx);
    return (prev === 0 || prev === null) && curr > 0;
  };
}

/** Run a search over recorded history; cache results in state.search. */
export function runSearch(query) {
  state.search.query = query;
  state.search.matches = [];
  state.search.index = -1;
  const fn = compileExpression(query);
  if (!fn) return 0;
  for (let i = 0; i < state.history.length; i++) {
    if (fn(i, i - 1)) state.search.matches.push(i);
  }
  if (state.search.matches.length > 0) state.search.index = 0;
  return state.search.matches.length;
}

export function searchNext() {
  const m = state.search.matches;
  if (m.length === 0) return -1;
  state.search.index = (state.search.index + 1) % m.length;
  return m[state.search.index];
}
export function searchPrev() {
  const m = state.search.matches;
  if (m.length === 0) return -1;
  state.search.index = (state.search.index - 1 + m.length) % m.length;
  return m[state.search.index];
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
