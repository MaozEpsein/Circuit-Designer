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

/**
 * Clear only the recorded history (and stale bus-width maxes). Leaves the
 * signal list and the user's curation (hiddenSignals / signalOrder) intact.
 * Used by the simulation RESET button — design is unchanged, so the tracked
 * signals should stay tracked.
 */
export function clearHistory() {
  state.history = [];
  state.signalMax = new Map();
  state.zoom = 1;
  state.panOffset = 0;
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

/**
 * Move a signal in the display order. `fromIdx` / `toIdx` are indices into
 * the VISIBLE signal list (what the user sees on screen). We translate those
 * to absolute positions in `signalOrder` so hidden signals aren't disturbed.
 */
export function reorderSignal(fromIdx, toIdx) {
  const base = state.signalOrder
    ? [...state.signalOrder]
    : state.signals.map(s => s.id);
  // Map visible indices → absolute indices in `base`.
  const visibleAbs = [];
  for (let i = 0; i < base.length; i++) {
    if (!state.hiddenSignals.has(base[i])) visibleAbs.push(i);
  }
  if (fromIdx < 0 || fromIdx >= visibleAbs.length) return;
  if (toIdx < 0) toIdx = 0;
  if (toIdx >= visibleAbs.length) toIdx = visibleAbs.length - 1;
  if (fromIdx === toIdx) return;
  const fromAbs = visibleAbs[fromIdx];
  const toAbs = visibleAbs[toIdx];
  const [moved] = base.splice(fromAbs, 1);
  // Because splice shifted items, recompute the destination.
  const adjustedTo = toAbs > fromAbs ? toAbs - 1 : toAbs;
  base.splice(adjustedTo, 0, moved);
  state.signalOrder = base;
}

export function toggleHidden(sigId) {
  if (state.hiddenSignals.has(sigId)) state.hiddenSignals.delete(sigId);
  else state.hiddenSignals.add(sigId);
}

export function showAllSignals() { state.hiddenSignals.clear(); }

// Which node types are shown by default ("recommended" view) — everything
// else is discovered into state.signals but starts hidden.
const DEFAULT_VISIBLE_TYPES = new Set(['CLOCK', 'INPUT', 'MUX_SELECT', 'OUTPUT', 'PIPE_REG']);

// All node types that produce an observable value worth putting in the picker.
const PICKABLE_TYPES = new Set([
  'CLOCK', 'INPUT', 'MUX_SELECT', 'OUTPUT',
  'REGISTER', 'SHIFT_REG', 'COUNTER', 'PC', 'IR',
  'RAM', 'ROM', 'REG_FILE', 'REG_FILE_DP',
  'FIFO', 'STACK', 'PIPE_REG',
  'ALU', 'CU', 'HANDSHAKE', 'HDU', 'FWD',
  'GATE_SLOT', 'FF_SLOT',
]);

const TYPE_TO_SIG_TYPE = {
  CLOCK: 'clock', INPUT: 'input', MUX_SELECT: 'mux', OUTPUT: 'output',
  REGISTER: 'memory', SHIFT_REG: 'memory', COUNTER: 'memory', PC: 'memory', IR: 'memory',
  RAM: 'memory', ROM: 'memory', REG_FILE: 'memory', REG_FILE_DP: 'memory',
  FIFO: 'memory', STACK: 'memory', PIPE_REG: 'memory',
  ALU: 'compute', CU: 'compute', HANDSHAKE: 'compute', HDU: 'compute', FWD: 'compute',
  GATE_SLOT: 'gate', FF_SLOT: 'ff',
};

// ── Output pins (mirror SimulationEngine __out indices) ──
const PINS_BY_TYPE = {
  ALU:         [['R', 0], ['Z', 1], ['C', 2]],
  CU:          [['ALU_OP', 0], ['RG_WE', 1], ['MM_WE', 2], ['MM_RE', 3], ['JMP', 4], ['HALT', 5], ['IMM', 6]],
  IR:          [['OP', 0], ['RD', 1], ['RS1', 2], ['RS2', 3]],
  REG_FILE_DP: [['RD1', 0], ['RD2', 1]],
  HALF_ADDER:  [['S', 0], ['C', 1]],
  FULL_ADDER:  [['S', 0], ['Cout', 1]],
  COMPARATOR:  [['EQ', 0], ['GT', 1], ['LT', 2]],
  BUS:         [['OUT', 0], ['ERR', 1]],
  FIFO:        [['Q', 0], ['FULL', 1], ['EMPTY', 2]],
  STACK:       [['Q', 0], ['FULL', 1], ['EMPTY', 2]],
  COUNTER:     [['Q', 0], ['TC', 1]],
  HANDSHAKE:   [['S', 0], ['F', 1]],
  HDU:         [['PCWrite', 0], ['IFIDWrite', 1], ['Bubble', 2]],
  FWD:         [['ForwardA', 0], ['ForwardB', 1]],
};

// ── Input pins (matches SimulationEngine inputSlots[i].inputIndex order) ──
const INPUT_PINS_BY_TYPE = {
  ALU:         [['A', 0], ['B', 1], ['OP', 2]],
  CU:          [['OP', 0], ['Z', 1], ['C', 2]],
  IR:          [['INSTR', 0], ['LD', 1]],
  PC:          [['JUMP_ADDR', 0], ['JUMP', 1], ['EN', 2], ['CLR', 3]],
  REGISTER:    [['DATA', 0], ['EN', 1], ['CLR', 2]],
  REG_FILE:    [['RD_ADDR', 0], ['WR_ADDR', 1], ['WR_DATA', 2], ['WE', 3]],
  REG_FILE_DP: [['RD1_ADDR', 0], ['RD2_ADDR', 1], ['WR_ADDR', 2], ['WR_DATA', 3], ['WE', 4]],
  RAM:         [['ADDR', 0], ['DATA', 1], ['WE', 2], ['RE', 3]],
  ROM:         [['ADDR', 0], ['RE', 1]],
  COUNTER:     [['EN', 0], ['LOAD', 1], ['DATA', 2], ['CLR', 3]],
  SHIFT_REG:   [['DIN', 0], ['DIR', 1], ['EN', 2], ['CLR', 3]],
  FIFO:        [['DATA', 0], ['WR', 1], ['RD', 2], ['CLR', 3]],
  STACK:       [['DATA', 0], ['PUSH', 1], ['POP', 2], ['CLR', 3]],
  HALF_ADDER:  [['A', 0], ['B', 1]],
  FULL_ADDER:  [['A', 0], ['B', 1], ['Cin', 2]],
  COMPARATOR:  [['A', 0], ['B', 1]],
  HANDSHAKE:   [['V', 0], ['R', 1]],
  HDU:         [['IDEX_MemRead', 0], ['IDEX_Rt', 1], ['IFID_Rs', 2], ['IFID_Rt', 3]],
  FWD:         [['IDEX_Rs', 0], ['IDEX_Rt', 1], ['EXMEM_Rd', 2], ['EXMEM_RegWrite', 3], ['MEMWB_Rd', 4], ['MEMWB_RegWrite', 5]],
};

function _outPinsFor(type) { return PINS_BY_TYPE[type] || [['Q', 0]]; }
function _inPinsFor(type)  { return INPUT_PINS_BY_TYPE[type] || []; }

/** nodeValues key for a given pin index (matches SimulationEngine's scheme). */
function _valueKey(nodeId, outIndex) {
  return outIndex === 0 ? nodeId : (nodeId + '__out' + outIndex);
}

export function setSignals(nodes) {
  if (!nodes) return;
  state.signals = [];
  state.hiddenSignals = new Set();
  state.signalOrder = null;

  const pushOutput = (node, pinName, outIndex, { startHidden }) => {
    const parentLabel = node.label || node.id;
    const isTopLevelIO = ['CLOCK', 'INPUT', 'OUTPUT', 'MUX_SELECT'].includes(node.type);
    const displayLabel = isTopLevelIO ? parentLabel : (parentLabel + '.' + pinName);
    const sig = {
      id: isTopLevelIO ? node.id : (node.id + '#out' + outIndex),
      label: displayLabel,
      pin: pinName,
      direction: 'out',
      parentLabel,
      parentId: node.id,
      nodeValueKey: _valueKey(node.id, outIndex),
      color: (node.type === 'CLOCK') ? COLORS.clock : colorForName(displayLabel),
      type: TYPE_TO_SIG_TYPE[node.type] || 'other',
    };
    state.signals.push(sig);
    if (startHidden) state.hiddenSignals.add(sig.id);
  };

  const pushInput = (node, pinName, inIndex) => {
    const parentLabel = node.label || node.id;
    const displayLabel = parentLabel + '.' + pinName;
    const sig = {
      id: node.id + '#in' + inIndex,
      label: displayLabel,
      pin: pinName,
      direction: 'in',
      inputIndex: inIndex,
      parentLabel,
      parentId: node.id,
      // Input values are resolved at record-time via wire lookup — no direct key.
      nodeValueKey: null,
      color: colorForName(displayLabel),
      type: TYPE_TO_SIG_TYPE[node.type] || 'other',
    };
    state.signals.push(sig);
    state.hiddenSignals.add(sig.id); // inputs are hidden by default
  };

  // Clock is the ONLY signal shown by default. Every other signal — including
  // top-level IO — starts hidden, and the user reveals what they want either
  // via the RECOMMENDED button (CLK + IO) or by checking individual pins.
  nodes.forEach(n => { if (n.type === 'CLOCK') pushOutput(n, 'CLK', 0, { startHidden: false }); });
  ['INPUT', 'MUX_SELECT', 'OUTPUT'].forEach(t => {
    nodes.forEach(n => {
      if (n.type !== t) return;
      pushOutput(n, n.label || n.id, 0, { startHidden: true });
    });
  });
  // Internal components — emit one signal per output pin AND per input pin,
  // all hidden by default so the picker can reveal them on demand.
  nodes.forEach(n => {
    if (!PICKABLE_TYPES.has(n.type)) return;
    if (DEFAULT_VISIBLE_TYPES.has(n.type)) return;
    _outPinsFor(n.type).forEach(([pinName, outIdx]) => pushOutput(n, pinName, outIdx, { startHidden: true }));
    _inPinsFor(n.type).forEach(([pinName, inIdx])   => pushInput(n, pinName, inIdx));
  });
}

/** Reset the visible set to the "recommended" defaults (CLK + Inputs + Outputs + Mux). */
export function showRecommended() {
  state.hiddenSignals = new Set();
  for (const s of state.signals) {
    const isRecommended = (s.type === 'clock' || s.type === 'input' || s.type === 'mux' || s.type === 'output');
    if (!isRecommended) state.hiddenSignals.add(s.id);
  }
}

/** Hide every signal except the clock. User-initiated reset. */
export function clearAllSignals() {
  state.hiddenSignals = new Set();
  for (const s of state.signals) {
    if (s.type !== 'clock') state.hiddenSignals.add(s.id);
  }
}

/** Whether a signal is currently visible (not in hiddenSignals). */
export function isSignalVisible(sigId) {
  return !state.hiddenSignals.has(sigId);
}

export function record(stepCount, nodeValues, wires) {
  if (!nodeValues) return;

  // Build a lookup: targetNodeId → { inputIndex → sourceValueKey } so
  // input-direction signals can resolve the value from whatever node feeds them.
  const inputLookup = new Map();
  if (Array.isArray(wires)) {
    for (const w of wires) {
      if (!w || !w.targetId) continue;
      let m = inputLookup.get(w.targetId);
      if (!m) { m = new Map(); inputLookup.set(w.targetId, m); }
      // Multi-output sources (ALU/IR/etc.) expose values at `sourceId__outN`;
      // output 0 uses the bare sourceId. This matches SimulationEngine.
      const srcOutIdx = w.sourceOutputIndex || 0;
      const srcKey = srcOutIdx === 0 ? w.sourceId : (w.sourceId + '__out' + srcOutIdx);
      m.set(w.targetInputIndex || 0, srcKey);
    }
  }

  const signals = new Map();
  state.signals.forEach(sig => {
    let v;
    if (sig.direction === 'in') {
      const m = inputLookup.get(sig.parentId);
      const srcKey = m ? m.get(sig.inputIndex) : null;
      v = srcKey ? (nodeValues.get(srcKey) ?? null) : null;
    } else {
      const key = sig.nodeValueKey || sig.id;
      v = nodeValues.get(key) ?? null;
    }
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
