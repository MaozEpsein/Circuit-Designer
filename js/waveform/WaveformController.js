/**
 * WaveformController — Public API + input handling for the waveform.
 * Wires up zoom, pan, resize, and keyboard shortcuts. All mutating
 * actions funnel through here; the renderer stays pure.
 */

import { state, reset as stateReset, setSignals as stateSetSignals, record as stateRecord, setRadix as stateSetRadix } from './WaveformState.js';
import * as Renderer from './WaveformRenderer.js';
import { METRICS } from './WaveformTheme.js';

let _canvas = null;
let _panel  = null;
let _rafPending = false;

// ── Public API (keeps the old surface so app.js doesn't change) ──
export function init(canvasEl) {
  _canvas = canvasEl;
  Renderer.attach(canvasEl);
  _panel = document.getElementById('waveform-panel');
  _attachInput();
  _attachResize();
  _attachKeyboard();
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

    // Pan inside the data area (outside the label column).
    if (mx < METRICS.LABEL_W) return;
    mode = 'pan';
    dragStartX = e.clientX;
    dragStartPan = state.panOffset;
    _canvas.style.cursor = 'grabbing';
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

  window.addEventListener('mouseup', () => {
    if (!mode) return;
    mode = null;
    _canvas.style.cursor = '';
    document.body.style.cursor = '';
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
    console.log('[Waveform] resize mousedown fired', { y: e.clientY });
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
    if (moveCount === 1 || moveCount % 30 === 0) {
      console.log('[Waveform] resize mousemove', { delta: startY - e.clientY, moves: moveCount });
    }
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
    console.log('[Waveform] resize mouseup — moves=' + moveCount);
    dragging = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
}

// ── Input: Keyboard shortcuts (F = fit-to-window) ────────────────
function _attachKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (!state.visible) return;
    const isTyping = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (isTyping) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      fitToWindow();
    }
  });
}
