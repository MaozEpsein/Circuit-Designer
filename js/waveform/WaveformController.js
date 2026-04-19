/**
 * WaveformController — Public API + input handling for the waveform.
 * Wires up zoom, pan, resize, and keyboard shortcuts. All mutating
 * actions funnel through here; the renderer stays pure.
 */

import { state, reset as stateReset, setSignals as stateSetSignals, record as stateRecord, setRadix as stateSetRadix, visibleSignals, reorderSignal, toggleHidden, showAllSignals, valueAtStep, formatValue, signalBits, isBusSignal, radixFor, nextEdgeStep, prevEdgeStep, addBookmark, removeBookmarkAt, toggleGroup, runSearch, searchNext, searchPrev, serializeView, deserializeView, applyImport } from './WaveformState.js';
import * as Renderer from './WaveformRenderer.js';
import * as VCD from './WaveformVCD.js';
import { METRICS } from './WaveformTheme.js';

let _canvas = null;
let _panel  = null;
let _rafPending = false;
// The signal currently "active" for keyboard edge-jump navigation.
// Defaults to whichever signal row the mouse last hovered over; falls back
// to the first visible signal when nothing has been hovered yet.
let _activeSigId = null;

// ── Public API (keeps the old surface so app.js doesn't change) ──
export function init(canvasEl) {
  _canvas = canvasEl;
  Renderer.attach(canvasEl);
  _panel = document.getElementById('waveform-panel');
  _attachInput();
  _attachResize();
  _attachKeyboard();
  _attachContextMenu();
  _attachLabelReorder();
}

export function reset()            { stateReset(); _requestRender(); }
export function setSignals(nodes)  { stateSetSignals(nodes); _requestRender(); }
export function record(step, vals) { stateRecord(step, vals); _requestRender(); }
export function isVisible()        { return state.visible; }

export function show() {
  state.visible = true;
  requestAnimationFrame(() => { Renderer.resize(); Renderer.render(); });
}
export function hide() { state.visible = false; }
export function toggle() { state.visible ? hide() : show(); }

export function render() {
  if (!state.visible) return;
  Renderer.render();
}

/** Jump the cursor to the next (+1) or previous (-1) edge of the active signal. */
export function jumpEdge(direction) { _jumpEdge(direction); }

/** Prompt for a bookmark name and place it at the cursor / last cycle. */
export function addBookmarkAtCursor() { _promptBookmark(); }

/** Run a pattern search. Returns match count; navigates cursor to first hit. */
export function search(query) {
  const count = runSearch(query);
  if (count > 0) _setCursorCycle(state.search.matches[0]);
  else _requestRender();
  return count;
}

/** Navigate to next/prev search match. */
export function searchNextMatch() {
  const idx = searchNext();
  if (idx >= 0) _setCursorCycle(idx);
}
export function searchPrevMatch() {
  const idx = searchPrev();
  if (idx >= 0) _setCursorCycle(idx);
}

/** Arm / disarm trigger mode. While armed and not fired, record() drops incoming steps. */
export function armTrigger(expr) {
  state.trigger.expr = expr || '';
  state.trigger.armed = !!expr;
  state.trigger.fired = false;
  _requestRender();
}
export function disarmTrigger() {
  state.trigger.armed = false;
  state.trigger.fired = false;
  _requestRender();
}

/** Expose current trigger status (for UI polling). */
export function getTriggerState() {
  return { armed: state.trigger.armed, fired: state.trigger.fired, expr: state.trigger.expr };
}

/** Produce a VCD text blob from the current history. */
export function exportVCD(options) { return VCD.exportVCD(options); }

/**
 * Parse a VCD text blob and replace the current signals + history with it.
 * Returns { signalCount, cycleCount }, or throws on malformed input.
 */
export function importVCD(text) {
  const payload = VCD.importVCD(text);
  applyImport(payload);
  show();
  _requestRender();
  return { signalCount: payload.signals.length, cycleCount: payload.history.length };
}

/** Toggle full-screen mode — panel expands to fill the viewport. */
export function toggleFullscreen() {
  state.fullscreen = !state.fullscreen;
  if (_panel) _panel.classList.toggle('fullscreen', state.fullscreen);
  // Resize the canvas twice — once on the next frame (after the browser has
  // applied the class), then once more after any style recalc settles.
  // Without this, the canvas can render against the old panel size and look
  // squashed / blurry the first time fullscreen is activated.
  requestAnimationFrame(() => {
    Renderer.resize();
    Renderer.render();
    requestAnimationFrame(() => { Renderer.resize(); Renderer.render(); });
  });
  return state.fullscreen;
}

/** View-state snapshot for persistence alongside the project/design. */
export function saveViewState() { return serializeView(); }

/** Restore a previously-saved view snapshot. Tolerates missing fields / old versions. */
export function loadViewState(data) { deserializeView(data); _requestRender(); }

/** Cycle the global radix: DEC → HEX → BIN → DEC. Returns new value. */
export function cycleRadix() {
  const next = state.radix === 'dec' ? 'hex' : state.radix === 'hex' ? 'bin' : 'dec';
  stateSetRadix(next);
  _requestRender();
  return next;
}

/** Public action: fit the entire recorded history into the visible area. */
export function fitToWindow() {
  const n = state.history.length;
  if (n === 0) return;
  const avail = Renderer.viewportWidth() - METRICS.LABEL_W - 8;
  const desiredStep = Math.max(4, avail / n);
  const z = desiredStep / METRICS.BASE_STEP_W;
  state.zoom = Math.max(METRICS.MIN_ZOOM, Math.min(METRICS.MAX_ZOOM, z));
  state.panOffset = 0;
  _requestRender();
}

// ── rAF-coalesced render (performance budget) ───────────────────
function _requestRender() {
  if (_rafPending || !state.visible) return;
  _rafPending = true;
  requestAnimationFrame(() => {
    _rafPending = false;
    Renderer.render();
  });
}

// ── Input: Zoom (Ctrl+Scroll) + Pan (Shift+Scroll or plain drag) ─
function _attachInput() {
  if (!_canvas) return;

  _canvas.addEventListener('wheel', (e) => {
    if (!state.visible) return;

    if (e.ctrlKey) {
      // Ctrl+wheel = zoom around the cursor position.
      e.preventDefault();
      const rect   = _canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const dataX  = cursorX - METRICS.LABEL_W + state.panOffset;
      const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = Math.max(METRICS.MIN_ZOOM, Math.min(METRICS.MAX_ZOOM, state.zoom * zoomFactor));
      const ratio = newZoom / state.zoom;
      state.panOffset = dataX * ratio - (cursorX - METRICS.LABEL_W);
      state.zoom = newZoom;
      _clampPan();
      _requestRender();
    } else if (e.shiftKey) {
      // Shift+wheel = explicit horizontal pan.
      e.preventDefault();
      state.panOffset += e.deltaY;
      _clampPan();
      _requestRender();
    } else {
      // Plain wheel = vertical scroll when the signal list overflows,
      // otherwise horizontal pan. Horizontal-axis gestures (deltaX)
      // always pan horizontally.
      e.preventDefault();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        state.panOffset += e.deltaX;
        _clampPan();
      } else {
        const canScrollV = Renderer.contentHeight() > Renderer.viewportSignalHeight();
        if (canScrollV) {
          state.vScroll += e.deltaY;
          Renderer.clampVScroll();
        } else {
          state.panOffset += e.deltaY;
          _clampPan();
        }
      }
      _requestRender();
    }
  }, { passive: false });

  // Mouse interactions on the canvas: scrollbar thumb drag takes priority
  // over data-area pan.
  let mode = null; // 'pan' | 'vscroll' | 'hscroll' | null
  let dragStartX = 0;
  let dragStartPan = 0;
  let scrollThumbOffset = 0;
  let _pendingMarker = null; // 'A' | 'B' | null — placed on mouseup if no drag

  function _inRect(x, y, r) {
    return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  _canvas.addEventListener('mousedown', (e) => {
    if (!state.visible) return;
    const rect = _canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Vertical scrollbar
    const vTrack = Renderer.scrollbarRect();
    const vThumb = Renderer.scrollbarThumbRect();
    if (vThumb && _inRect(mx, my, vTrack)) {
      if (_inRect(mx, my, vThumb)) {
        scrollThumbOffset = my - vThumb.y;
      } else {
        state.vScroll = Renderer.scrollFromY(my - vThumb.h / 2);
        Renderer.clampVScroll();
        scrollThumbOffset = vThumb.h / 2;
        _requestRender();
      }
      mode = 'vscroll';
      document.body.style.cursor = 'ns-resize';
      e.preventDefault();
      return;
    }

    // Horizontal scrollbar
    const hTrack = Renderer.hScrollbarRect();
    const hThumb = Renderer.hScrollbarThumbRect();
    if (hThumb && _inRect(mx, my, hTrack)) {
      if (_inRect(mx, my, hThumb)) {
        scrollThumbOffset = mx - hThumb.x;
      } else {
        state.panOffset = Renderer.panFromX(mx - hThumb.w / 2);
        _clampPan();
        scrollThumbOffset = hThumb.w / 2;
        _requestRender();
      }
      mode = 'hscroll';
      document.body.style.cursor = 'ew-resize';
      e.preventDefault();
      return;
    }

    // Click on a group header in the label column → toggle collapse/expand.
    if (mx < METRICS.LABEL_W) {
      const row = Renderer.rowAtY(my);
      if (row && row.kind === 'group') {
        toggleGroup(row.group);
        _requestRender();
        e.preventDefault();
      }
      return;
    }

    // Click places a measurement marker: plain click = A, Shift+click = B.
    // Only a "pure" click (no drag) places a marker — we detect that by
    // measuring mouse travel on mouseup below. Start in pan mode and decide
    // at the end based on travel distance.
    mode = 'pan';
    dragStartX = e.clientX;
    dragStartPan = state.panOffset;
    _canvas.style.cursor = 'grabbing';
    _pendingMarker = e.shiftKey ? 'B' : 'A';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!mode) return;
    const rect = _canvas.getBoundingClientRect();
    if (mode === 'pan') {
      state.panOffset = dragStartPan - (e.clientX - dragStartX);
      _clampPan();
    } else if (mode === 'vscroll') {
      const my = e.clientY - rect.top;
      state.vScroll = Renderer.scrollFromY(my - scrollThumbOffset);
      Renderer.clampVScroll();
    } else if (mode === 'hscroll') {
      const mx = e.clientX - rect.left;
      state.panOffset = Renderer.panFromX(mx - scrollThumbOffset);
      _clampPan();
    }
    _requestRender();
  });

  window.addEventListener('mouseup', (e) => {
    if (!mode) return;
    const traveled = Math.abs(e.clientX - dragStartX);
    if (mode === 'pan' && _pendingMarker && traveled < 4) {
      // No meaningful drag → treat as a click; place the marker at that cycle.
      const rect = _canvas.getBoundingClientRect();
      const step = Math.floor(Renderer.stepForX(e.clientX - rect.left));
      if (step >= 0 && step < state.history.length) {
        if (_pendingMarker === 'B') state.markerB = step;
        else                        state.markerA = step;
        _requestRender();
      }
    }
    _pendingMarker = null;
    mode = null;
    _canvas.style.cursor = '';
    document.body.style.cursor = '';
  });

  // Double-click in the data area clears both markers.
  _canvas.addEventListener('dblclick', (e) => {
    if (!state.visible) return;
    const rect = _canvas.getBoundingClientRect();
    if (e.clientX - rect.left < METRICS.LABEL_W) return;
    state.markerA = null;
    state.markerB = null;
    _requestRender();
  });

  // Hover tracking — drives the vertical cursor + value readout in labels
  // and sets the "active signal" for keyboard edge-jumps.
  _canvas.addEventListener('mousemove', (e) => {
    if (!state.visible) return;
    const rect = _canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const rowIdx = Renderer.signalAtY(my);
    if (rowIdx >= 0) {
      const sig = visibleSignals()[rowIdx];
      if (sig) _activeSigId = sig.id;
    }
    if (mx < METRICS.LABEL_W) {
      if (state.cursorStep !== null) { state.cursorStep = null; _requestRender(); }
      return;
    }
    const step = Renderer.stepForX(mx);
    if (step < 0 || step >= state.history.length) {
      if (state.cursorStep !== null) { state.cursorStep = null; _requestRender(); }
      return;
    }
    state.cursorStep = step;
    _requestRender();
  });

  _canvas.addEventListener('mouseleave', () => {
    if (state.cursorStep !== null) { state.cursorStep = null; _requestRender(); }
  });
}

function _clampPan() {
  const stepW = METRICS.BASE_STEP_W * state.zoom;
  const totalWidth = state.history.length * stepW;
  const avail = Renderer.viewportWidth() - METRICS.LABEL_W - 8;
  const maxPan = Math.max(0, totalWidth - avail);
  if (state.panOffset < 0) state.panOffset = 0;
  if (state.panOffset > maxPan) state.panOffset = maxPan;
}

// ── Input: Panel vertical resize via top-edge drag handle ────────
function _attachResize() {
  const handle = document.getElementById('waveform-resize-top');
  if (!handle || !_panel) { console.warn('[Waveform] resize handle not found'); return; }
  let dragging = false;
  let startY = 0;
  let startH = 0;
  let moveCount = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    moveCount = 0;
    startY = e.clientY;
    startH = _panel.getBoundingClientRect().height;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
    e.preventDefault();
    e.stopPropagation();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    moveCount++;
    // Panel is pinned at bottom; mouse moves UP → height increases.
    const delta = startY - e.clientY;
    const maxH = window.innerHeight * METRICS.MAX_PANEL_FRAC;
    const newH = Math.max(METRICS.MIN_PANEL_H, Math.min(maxH, startH + delta));
    _panel.style.height = newH + 'px';
    state.panelHeight = newH;
    Renderer.resize();
    _requestRender();
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
}

// ── Context menu (right-click on a signal's label column) ────────
function _attachContextMenu() {
  const menu = document.getElementById('waveform-ctx-menu');
  if (!_canvas || !menu) return;

  _canvas.addEventListener('contextmenu', (e) => {
    if (!state.visible) return;
    const rect = _canvas.getBoundingClientRect();
    const my = e.clientY - rect.top;
    e.preventDefault();
    const rowIdx = Renderer.signalAtY(my);
    const sig = rowIdx >= 0 ? visibleSignals()[rowIdx] : null;
    _showSignalMenu(sig, e.clientX, e.clientY);
  });

  document.addEventListener('mousedown', (e) => {
    if (menu.classList.contains('hidden')) return;
    if (!menu.contains(e.target)) menu.classList.add('hidden');
  });
}

function _showSignalMenu(sig, screenX, screenY) {
  const menu = document.getElementById('waveform-ctx-menu');
  if (!menu) return;

  const panelRect = _panel.getBoundingClientRect();
  const rows = [];

  if (sig) {
    const valStr = state.cursorStep !== null
      ? formatValue(valueAtStep(sig.id, state.cursorStep), isBusSignal(sig.id) ? signalBits(sig.id) : 1, radixFor(sig.id))
      : null;
    rows.push({ kind: 'header', label: sig.label });
    if (valStr !== null) rows.push({ kind: 'action', label: 'Copy value', hint: valStr, action: () => navigator.clipboard?.writeText(valStr) });
    rows.push({ kind: 'sep' });
    rows.push({ kind: 'action', label: 'Hide', action: () => { toggleHidden(sig.id); _requestRender(); } });
    rows.push({ kind: 'action', label: 'Pin to top', action: () => _pinToTop(sig.id) });
    rows.push({ kind: 'sep' });
    rows.push({ kind: 'action', label: 'Radix: DEC', action: () => { state.radixOverrides.set(sig.id, 'dec'); _requestRender(); } });
    rows.push({ kind: 'action', label: 'Radix: HEX', action: () => { state.radixOverrides.set(sig.id, 'hex'); _requestRender(); } });
    rows.push({ kind: 'action', label: 'Radix: BIN', action: () => { state.radixOverrides.set(sig.id, 'bin'); _requestRender(); } });
    rows.push({ kind: 'action', label: 'Radix: use global', action: () => { state.radixOverrides.delete(sig.id); _requestRender(); } });
  } else {
    // Clicked on empty/header area — show only global actions.
    rows.push({ kind: 'header', label: 'Waveform' });
  }

  // Global actions always available (below the per-signal block).
  if (sig) rows.push({ kind: 'sep' });
  if (state.cursorStep !== null) {
    rows.push({ kind: 'action', label: 'Add bookmark here', hint: 'Cycle ' + Math.floor(state.cursorStep), action: () => _promptBookmark() });
  }
  if (state.bookmarks.length > 0) {
    rows.push({ kind: 'action', label: 'Clear all bookmarks', hint: `${state.bookmarks.length} saved`, action: () => { state.bookmarks = []; _requestRender(); } });
  }
  if (state.hiddenSignals.size > 0) {
    rows.push({ kind: 'action', label: 'Show all signals', hint: `${state.hiddenSignals.size} hidden`, action: () => { showAllSignals(); _requestRender(); } });
  }
  if (state.markerA !== null || state.markerB !== null) {
    rows.push({ kind: 'action', label: 'Clear markers', action: () => { state.markerA = null; state.markerB = null; _requestRender(); } });
  }
  if (rows.filter(r => r.kind === 'action').length === 0) {
    rows.push({ kind: 'action', label: '(nothing to do here)', action: () => {} });
  }

  let html = '';
  for (const r of rows) {
    if (r.kind === 'sep') { html += '<div class="wf-menu-sep"></div>'; continue; }
    const cls = r.kind === 'header' ? 'wf-menu-item wf-menu-header' : 'wf-menu-item';
    const hint = r.hint ? `<span class="wf-menu-hint">${r.hint}</span>` : '';
    html += `<div class="${cls}">${r.label}${hint}</div>`;
  }
  menu.innerHTML = html;
  menu.classList.remove('hidden');
  // Position relative to the panel (since menu is a child of the panel).
  menu.style.left = (screenX - panelRect.left) + 'px';
  menu.style.top  = (screenY - panelRect.top)  + 'px';

  const actionRows = rows.filter(r => r.kind === 'action');
  const items = menu.querySelectorAll('.wf-menu-item:not(.wf-menu-header)');
  items.forEach((el, i) => {
    el.addEventListener('click', () => {
      actionRows[i]?.action?.();
      menu.classList.add('hidden');
    });
  });
}

function _pinToTop(sigId) {
  const order = state.signalOrder ? [...state.signalOrder] : state.signals.map(s => s.id);
  const idx = order.indexOf(sigId);
  if (idx > 0) {
    order.splice(idx, 1);
    order.unshift(sigId);
    state.signalOrder = order;
    _requestRender();
  }
}

// ── Drag to reorder signals in the label column ───────────────────
function _attachLabelReorder() {
  if (!_canvas) return;
  let dragFromIdx = -1;
  let dragStartY = 0;
  let moved = false;

  _canvas.addEventListener('mousedown', (e) => {
    if (!state.visible) return;
    if (e.button !== 0) return; // left button only
    const rect = _canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Only fires when the click is in the label column (left of data area).
    if (mx >= METRICS.LABEL_W) return;
    const idx = Renderer.signalAtY(my);
    if (idx < 0) return;
    dragFromIdx = idx;
    dragStartY = e.clientY;
    moved = false;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (dragFromIdx < 0) return;
    const travel = Math.abs(e.clientY - dragStartY);
    if (!moved && travel > 4) {
      moved = true;
      _canvas.style.cursor = 'grabbing';
    }
    if (!moved) return;
    const rect = _canvas.getBoundingClientRect();
    const my = e.clientY - rect.top;
    const targetIdx = Renderer.signalAtY(my);
    state.reorderDrag = {
      fromIdx: dragFromIdx,
      targetIdx: targetIdx >= 0 ? targetIdx : dragFromIdx,
      ghostY: my,
    };
    _requestRender();
  });

  window.addEventListener('mouseup', (e) => {
    if (dragFromIdx < 0) return;
    if (moved) {
      const rect = _canvas.getBoundingClientRect();
      const toIdx = Renderer.signalAtY(e.clientY - rect.top);
      if (toIdx >= 0 && toIdx !== dragFromIdx) {
        reorderSignal(dragFromIdx, toIdx);
      }
    }
    dragFromIdx = -1;
    moved = false;
    state.reorderDrag = null;
    _canvas.style.cursor = '';
    _requestRender();
  });
}

// ── Input: Keyboard shortcuts ────────────────────────────────────
// f            — fit-to-window
// Shift+f      — toggle full-screen
// ← / →        — jump to previous/next edge of the active signal
// h / l        — pan cursor left / right by one cycle
// j / k        — cycle "active signal" down / up (for edge-jump navigation)
// Home / End   — first / last cycle
// b            — add a named bookmark at the cursor
// + / =  /  -  — zoom in / zoom out
// Esc          — exit full-screen
function _attachKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (!state.visible) return;
    const isTyping = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (isTyping) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Shift+F → full-screen toggle (check before plain f).
    if (e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      toggleFullscreen();
      return;
    }
    if (e.shiftKey) return; // no other shift shortcuts — allow text entry etc.

    switch (e.key) {
      case 'f': case 'F':
        e.preventDefault(); fitToWindow(); return;
      case 'ArrowRight':
        e.preventDefault(); _jumpEdge(+1); return;
      case 'ArrowLeft':
        e.preventDefault(); _jumpEdge(-1); return;
      case 'l': case 'L':
        e.preventDefault(); _setCursorCycle((state.cursorStep ?? 0) + 1); return;
      case 'h': case 'H':
        e.preventDefault(); _setCursorCycle((state.cursorStep ?? 0) - 1); return;
      case 'j': case 'J':
        e.preventDefault(); _cycleActiveSignal(+1); return;
      case 'k': case 'K':
        e.preventDefault(); _cycleActiveSignal(-1); return;
      case 'Home':
        e.preventDefault(); _setCursorCycle(0); return;
      case 'End':
        e.preventDefault(); _setCursorCycle(state.history.length - 1); return;
      case 'b': case 'B':
        e.preventDefault(); _promptBookmark(); return;
      case '+': case '=':
        e.preventDefault(); _zoomAroundCursor(1.25); return;
      case '-': case '_':
        e.preventDefault(); _zoomAroundCursor(1 / 1.25); return;
      case 'Escape':
        if (state.fullscreen) { e.preventDefault(); toggleFullscreen(); }
        return;
    }
  });
}

/** Move the "active signal" pointer up or down among the visible signals. */
function _cycleActiveSignal(delta) {
  const vis = visibleSignals();
  if (vis.length === 0) return;
  const curr = vis.findIndex(s => s.id === _activeSigId);
  const next = ((curr < 0 ? 0 : curr) + delta + vis.length) % vis.length;
  _activeSigId = vis[next].id;
  _requestRender();
}

/** Multiply zoom by `factor`, keeping the cursor position (if any) steady. */
function _zoomAroundCursor(factor) {
  const oldZoom = state.zoom;
  const newZoom = Math.max(METRICS.MIN_ZOOM, Math.min(METRICS.MAX_ZOOM, oldZoom * factor));
  if (newZoom === oldZoom) return;
  const pivot = state.cursorStep !== null ? state.cursorStep : 0;
  const viewBeforeX = pivot * METRICS.BASE_STEP_W * oldZoom - state.panOffset;
  state.zoom = newZoom;
  state.panOffset = pivot * METRICS.BASE_STEP_W * newZoom - viewBeforeX;
  _clampPan();
  _requestRender();
}

/** Which signal should arrow keys navigate through? */
function _activeSignal() {
  const vis = visibleSignals();
  if (_activeSigId) {
    const found = vis.find(s => s.id === _activeSigId);
    if (found) return found;
  }
  return vis[0] || null;
}

/** Move the cursor to the next/prev transition of the active signal. */
function _jumpEdge(direction) {
  const sig = _activeSignal();
  if (!sig) return;
  const from = state.cursorStep !== null ? state.cursorStep : 0;
  const next = direction > 0 ? nextEdgeStep(sig.id, from) : prevEdgeStep(sig.id, from);
  if (next >= 0) _setCursorCycle(next);
}

/** Set cursor to a specific cycle and make sure it's within the viewport. */
function _setCursorCycle(step) {
  const clamped = Math.max(0, Math.min(state.history.length - 1, step));
  state.cursorStep = clamped;
  // Auto-scroll horizontally if the cursor is outside the visible window.
  const stepW = METRICS.BASE_STEP_W * state.zoom;
  const x = clamped * stepW;
  const viewW = Renderer.viewportDataWidth();
  if (x < state.panOffset)            state.panOffset = Math.max(0, x - stepW);
  else if (x > state.panOffset + viewW - stepW)
    state.panOffset = Math.max(0, x - viewW + stepW * 2);
  _requestRender();
}

function _promptBookmark() {
  const step = state.cursorStep !== null
    ? Math.floor(state.cursorStep)
    : state.history.length - 1;
  if (step < 0) return;
  // eslint-disable-next-line no-alert
  const name = window.prompt('Bookmark name:', 'bm' + (state.bookmarks.length + 1));
  if (name === null) return; // cancelled
  addBookmark(step, (name || '').trim() || ('bm' + (state.bookmarks.length + 1)));
  _requestRender();
}
