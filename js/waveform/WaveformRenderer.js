/**
 * WaveformRenderer — Pure canvas drawing for the waveform viewer.
 * Reads from WaveformState; does not handle input or manage DOM state.
 */

import { state, isBusSignal, signalBits, radixFor, formatValue } from './WaveformState.js';
import { COLORS, METRICS, TYPE } from './WaveformTheme.js';

let _canvas, _ctx;

export function attach(canvasEl) {
  _canvas = canvasEl;
  _ctx    = canvasEl.getContext('2d');
}

export function resize() {
  if (!_canvas) return;
  const parent = _canvas.parentElement;
  if (!parent) return;
  const dpr = window.devicePixelRatio || 1;
  _canvas.width  = parent.clientWidth  * dpr;
  _canvas.height = parent.clientHeight * dpr;
  _canvas.style.width  = parent.clientWidth  + 'px';
  _canvas.style.height = parent.clientHeight + 'px';
  _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Effective pixel width of a single cycle after zoom. */
export function stepWidth() {
  return METRICS.BASE_STEP_W * state.zoom;
}

/** Pixel x-coordinate of the step at index `i` (after pan + zoom). */
export function xForStep(i) {
  return METRICS.LABEL_W + i * stepWidth() - state.panOffset;
}

export function viewportWidth() {
  return _canvas.width / (window.devicePixelRatio || 1);
}

export function viewportHeight() {
  return _canvas.height / (window.devicePixelRatio || 1);
}

export function render() {
  if (!state.visible || !_ctx || state.signals.length === 0) return;

  const w = viewportWidth();
  const h = viewportHeight();

  // Background
  _ctx.fillStyle = COLORS.bg;
  _ctx.fillRect(0, 0, w, h);

  // Top border line
  _ctx.strokeStyle = COLORS.border;
  _ctx.lineWidth = 1;
  _ctx.beginPath();
  _ctx.moveTo(0, 0);
  _ctx.lineTo(w, 0);
  _ctx.stroke();

  const numSteps = state.history.length;
  if (numSteps === 0) {
    _drawEmptyHint(w, h);
    return;
  }

  _drawTimeAxis(w);
  _drawGrid(w, h);
  _drawSignals(w, h);
}

function _drawEmptyHint(w, h) {
  _ctx.fillStyle = COLORS.gridText;
  _ctx.font = TYPE.hint;
  _ctx.textAlign = 'center';
  _ctx.textBaseline = 'middle';
  _ctx.fillText('Press STEP to see waveforms', w / 2, h / 2);
}

/**
 * Time axis across the top of the data area.
 * Major ticks every N cycles (auto-chosen from zoom) with cycle numbers;
 * minor ticks between them for scale.
 */
function _drawTimeAxis(w) {
  const stepW = stepWidth();
  const numSteps = state.history.length;

  // Pick a major-tick interval that keeps labels from crowding.
  // Minimum label spacing of ~54 px keeps 5–6 digit numbers legible.
  const minLabelPx = 54;
  const minCyclesPerLabel = Math.max(1, Math.ceil(minLabelPx / stepW));
  const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let major = niceSteps[niceSteps.length - 1];
  for (const s of niceSteps) { if (s >= minCyclesPerLabel) { major = s; break; } }
  const minor = Math.max(1, Math.floor(major / 5));

  _ctx.save();
  _ctx.beginPath();
  _ctx.rect(METRICS.LABEL_W, 0, w - METRICS.LABEL_W, METRICS.HEADER_H);
  _ctx.clip();

  // Minor ticks
  _ctx.strokeStyle = COLORS.axisMinor;
  _ctx.lineWidth = 1;
  for (let i = 0; i <= numSteps; i += minor) {
    const x = xForStep(i);
    if (x < METRICS.LABEL_W - 2 || x > w + 2) continue;
    _ctx.beginPath();
    _ctx.moveTo(x, METRICS.HEADER_H - 4);
    _ctx.lineTo(x, METRICS.HEADER_H);
    _ctx.stroke();
  }

  // Major ticks + labels
  _ctx.fillStyle = COLORS.gridText;
  _ctx.font = TYPE.axis;
  _ctx.textAlign = 'center';
  _ctx.textBaseline = 'middle';
  _ctx.strokeStyle = COLORS.axisMajor;

  for (let i = 0; i <= numSteps; i += major) {
    const x = xForStep(i);
    if (x < METRICS.LABEL_W - 20 || x > w + 20) continue;
    _ctx.beginPath();
    _ctx.moveTo(x, 0);
    _ctx.lineTo(x, METRICS.HEADER_H);
    _ctx.stroke();
    _ctx.fillText(String(i), x, METRICS.HEADER_H / 2);
  }

  // Bottom line of axis
  _ctx.strokeStyle = COLORS.border;
  _ctx.beginPath();
  _ctx.moveTo(METRICS.LABEL_W, METRICS.HEADER_H);
  _ctx.lineTo(w, METRICS.HEADER_H);
  _ctx.stroke();

  _ctx.restore();
}

function _drawGrid(w, h) {
  const stepW = stepWidth();
  const numSteps = state.history.length;
  _ctx.save();
  _ctx.beginPath();
  _ctx.rect(METRICS.LABEL_W, METRICS.HEADER_H, w - METRICS.LABEL_W, h - METRICS.HEADER_H);
  _ctx.clip();

  _ctx.strokeStyle = COLORS.grid;
  _ctx.lineWidth = 1;
  for (let i = 0; i <= numSteps; i++) {
    const x = xForStep(i);
    if (x < METRICS.LABEL_W - 1 || x > w + 1) continue;
    _ctx.beginPath();
    _ctx.moveTo(x, METRICS.HEADER_H);
    _ctx.lineTo(x, h);
    _ctx.stroke();
  }
  _ctx.restore();
}

function _rowHeight(sig) {
  return isBusSignal(sig.id) ? METRICS.ROW_H_BUS : METRICS.ROW_H;
}

function _rowY(idx) {
  // Cumulative y offsets so each row gets its own tailored height.
  let y = METRICS.HEADER_H;
  for (let i = 0; i < idx; i++) y += _rowHeight(state.signals[i]);
  return y;
}

/** Total vertical height of all rows (for scroll clamping + scrollbar). */
export function contentHeight() {
  let total = 0;
  state.signals.forEach(sig => { total += _rowHeight(sig); });
  return total;
}

/** Visible height of the signal area below the time-axis header. */
export function viewportSignalHeight() {
  return Math.max(0, viewportHeight() - METRICS.HEADER_H);
}

/** Clamp vScroll to the valid range given current content + viewport. */
export function clampVScroll() {
  const max = Math.max(0, contentHeight() - viewportSignalHeight());
  if (state.vScroll < 0) state.vScroll = 0;
  if (state.vScroll > max) state.vScroll = max;
}

function _drawSignals(w, h) {
  clampVScroll();
  const scrollY = state.vScroll;

  _ctx.save();
  _ctx.beginPath();
  _ctx.rect(METRICS.LABEL_W, METRICS.HEADER_H, w - METRICS.LABEL_W, h - METRICS.HEADER_H);
  _ctx.clip();

  let y0 = METRICS.HEADER_H - scrollY;
  state.signals.forEach(sig => {
    const rowH = _rowHeight(sig);
    // Only draw rows that intersect the visible area.
    if (y0 + rowH >= METRICS.HEADER_H && y0 < h) {
      // Row separator
      _ctx.strokeStyle = COLORS.grid;
      _ctx.beginPath();
      _ctx.moveTo(METRICS.LABEL_W, y0 + rowH);
      _ctx.lineTo(w, y0 + rowH);
      _ctx.stroke();

      if (isBusSignal(sig.id)) {
        _drawBusRow(sig, y0, rowH, w);
      } else {
        _drawBitRow(sig, y0, rowH, w);
      }
    }
    y0 += rowH;
  });

  _ctx.restore();

  // Signal labels — clipped to their own band so they don't invade the header
  _ctx.save();
  _ctx.beginPath();
  _ctx.rect(0, METRICS.HEADER_H, METRICS.LABEL_W, h - METRICS.HEADER_H);
  _ctx.clip();
  let lblY = METRICS.HEADER_H - scrollY;
  state.signals.forEach(sig => {
    const rowH = _rowHeight(sig);
    if (lblY + rowH >= METRICS.HEADER_H && lblY < h) {
      const yMid = lblY + rowH / 2;
      _ctx.fillStyle = sig.color;
      _ctx.font = TYPE.label;
      _ctx.textAlign = 'right';
      _ctx.textBaseline = 'middle';
      _ctx.fillText(sig.label, METRICS.LABEL_W - 8, yMid);
    }
    lblY += rowH;
  });
  _ctx.restore();

  // Vertical scrollbar (only when content overflows)
  _drawVScrollbar(w, h);
}

// ── Scrollbars (clickable + draggable) ────────────────────────
const SCROLLBAR_W = 10;
const SCROLLBAR_MARGIN = 2;

/** Bounding box of the vertical scrollbar track (viewport coords). */
export function scrollbarRect() {
  const w = viewportWidth();
  return {
    x: w - SCROLLBAR_W - SCROLLBAR_MARGIN,
    y: METRICS.HEADER_H + 2,
    w: SCROLLBAR_W,
    h: viewportSignalHeight() - 4,
  };
}

/** Bounding box of the draggable thumb (viewport coords). */
export function scrollbarThumbRect() {
  const total    = contentHeight();
  const viewport = viewportSignalHeight();
  if (total <= viewport) return null;
  const track = scrollbarRect();
  const thumbH = Math.max(28, track.h * (viewport / total));
  const ratio = (total - viewport) > 0 ? state.vScroll / (total - viewport) : 0;
  const thumbY = track.y + (track.h - thumbH) * ratio;
  return { x: track.x, y: thumbY, w: track.w, h: thumbH };
}

/** Convert a mouse Y inside the track to a vScroll value. */
export function scrollFromY(mouseY) {
  const total    = contentHeight();
  const viewport = viewportSignalHeight();
  if (total <= viewport) return 0;
  const track = scrollbarRect();
  const thumbH = Math.max(28, track.h * (viewport / total));
  const ratio = (mouseY - track.y) / (track.h - thumbH);
  return Math.max(0, Math.min(total - viewport, ratio * (total - viewport)));
}

function _drawVScrollbar(w, h) {
  const total    = contentHeight();
  const viewport = viewportSignalHeight();
  if (total <= viewport) return;

  const track = scrollbarRect();
  const thumb = scrollbarThumbRect();

  // Track (subtle background)
  _ctx.fillStyle = 'rgba(100,150,170,0.10)';
  _ctx.fillRect(track.x, track.y, track.w, track.h);

  // Thumb (cyan, rounded)
  _ctx.fillStyle = COLORS.accent;
  _ctx.globalAlpha = 0.6;
  _roundRect(thumb.x + 1, thumb.y, thumb.w - 2, thumb.h, 3);
  _ctx.fill();
  _ctx.globalAlpha = 1;

  _drawHScrollbar(w, h);
}

// ── Horizontal scrollbar (clickable + draggable) ──────────────

/** Total pixel width of all recorded steps at current zoom. */
export function contentWidth() {
  return state.history.length * stepWidth();
}

/** Visible pixel width of the time-axis area (right of the label column). */
export function viewportDataWidth() {
  return Math.max(0, viewportWidth() - METRICS.LABEL_W - SCROLLBAR_W - SCROLLBAR_MARGIN - 4);
}

/** Bounding box of the horizontal scrollbar track. */
export function hScrollbarRect() {
  const w = viewportWidth();
  const h = viewportHeight();
  return {
    x: METRICS.LABEL_W + 2,
    y: h - SCROLLBAR_W - SCROLLBAR_MARGIN,
    w: w - METRICS.LABEL_W - SCROLLBAR_W - SCROLLBAR_MARGIN - 6,
    h: SCROLLBAR_W,
  };
}

/** Bounding box of the draggable horizontal thumb. */
export function hScrollbarThumbRect() {
  const total    = contentWidth();
  const viewport = viewportDataWidth();
  if (total <= viewport) return null;
  const track = hScrollbarRect();
  const thumbW = Math.max(28, track.w * (viewport / total));
  const ratio = (total - viewport) > 0 ? state.panOffset / (total - viewport) : 0;
  const thumbX = track.x + (track.w - thumbW) * Math.max(0, Math.min(1, ratio));
  return { x: thumbX, y: track.y, w: thumbW, h: track.h };
}

/** Convert a mouse X inside the horizontal track to a panOffset value. */
export function panFromX(mouseX) {
  const total    = contentWidth();
  const viewport = viewportDataWidth();
  if (total <= viewport) return 0;
  const track = hScrollbarRect();
  const thumbW = Math.max(28, track.w * (viewport / total));
  const ratio = (mouseX - track.x) / (track.w - thumbW);
  return Math.max(0, Math.min(total - viewport, ratio * (total - viewport)));
}

function _drawHScrollbar(w, h) {
  const total    = contentWidth();
  const viewport = viewportDataWidth();
  if (total <= viewport) return;

  const track = hScrollbarRect();
  const thumb = hScrollbarThumbRect();

  _ctx.fillStyle = 'rgba(100,150,170,0.10)';
  _ctx.fillRect(track.x, track.y, track.w, track.h);

  _ctx.fillStyle = COLORS.accent;
  _ctx.globalAlpha = 0.6;
  _roundRect(thumb.x, thumb.y + 1, thumb.w, thumb.h - 2, 3);
  _ctx.fill();
  _ctx.globalAlpha = 1;
}

function _roundRect(x, y, w, h, r) {
  _ctx.beginPath();
  _ctx.moveTo(x + r, y);
  _ctx.arcTo(x + w, y,     x + w, y + h, r);
  _ctx.arcTo(x + w, y + h, x,     y + h, r);
  _ctx.arcTo(x,     y + h, x,     y,     r);
  _ctx.arcTo(x,     y,     x + w, y,     r);
  _ctx.closePath();
}

/** Classic 1-bit waveform: green (or signal color) for HIGH, grey for LOW. */
function _drawBitRow(sig, y0, rowH, w) {
  const yHigh = y0 + 6;
  const yLow  = y0 + rowH - 6;

  let prevVal = null;
  if (state.history.length > 0 && state.history[0].step === 0) {
    prevVal = state.history[0].signals.get(sig.id) ?? null;
  }

  if (prevVal !== null) {
    const initX0 = xForStep(0);
    const initX1 = xForStep(1);
    const initY = prevVal === 1 ? yHigh : yLow;
    _ctx.strokeStyle = sig.color;
    _ctx.lineWidth = 2;
    _ctx.beginPath();
    _ctx.moveTo(initX0, initY);
    _ctx.lineTo(initX1, initY);
    _ctx.stroke();
  }

  for (let i = 0; i < state.history.length; i++) {
    const entry = state.history[i];
    if (entry.step === 0) continue;
    const val = entry.signals.get(sig.id) ?? null;
    const x0 = xForStep(i);
    const x1 = xForStep(i + 1);
    if (x1 < METRICS.LABEL_W || x0 > w) { prevVal = val; continue; }
    if (val === null) continue;

    const curY = val === 1 ? yHigh : yLow;
    _ctx.strokeStyle = sig.color;
    _ctx.lineWidth = 2;
    _ctx.beginPath();
    if (prevVal !== null && prevVal !== val) {
      const prevY = prevVal === 1 ? yHigh : yLow;
      _ctx.moveTo(x0, prevY);
      _ctx.lineTo(x0, curY);
    } else {
      _ctx.moveTo(x0, curY);
    }
    _ctx.lineTo(x1, curY);
    _ctx.stroke();
    if (val === 1) {
      _ctx.fillStyle = sig.color + '10';
      _ctx.fillRect(x0, yHigh, x1 - x0, yLow - yHigh);
    }
    prevVal = val;
  }
}

/**
 * Multi-bit bus rendering. Draws a pair of horizontal rails with an X-shaped
 * transition at each value change — the industry-standard hex-diagram look.
 * Values are shown as text centered in each stable segment.
 */
function _drawBusRow(sig, y0, rowH, w) {
  const yTop = y0 + 6;
  const yBot = y0 + rowH - 6;
  const yMid = (yTop + yBot) / 2;
  const bits = signalBits(sig.id);
  const radix = radixFor(sig.id);
  const xingW = Math.min(6, Math.max(3, stepWidth() * 0.2)); // X-transition width

  // Segment structure: collect runs of identical consecutive values so we
  // can draw one hexagon per stable value.
  const entries = state.history;
  const n = entries.length;
  if (n === 0) return;

  // Starting value — prefer step 0 if it exists.
  let segStart = 0;
  let segVal = entries[0].signals.get(sig.id);
  if (segVal === undefined) segVal = null;

  for (let i = 1; i <= n; i++) {
    const val = i < n ? (entries[i].signals.get(sig.id) ?? null) : undefined;
    const changed = (i === n) || (val !== segVal);
    if (changed) {
      _drawBusSegment(sig.color, segStart, i, segVal, yTop, yBot, yMid, bits, radix, xingW, w);
      segStart = i;
      segVal = val;
    }
  }
}

function _drawBusSegment(color, iStart, iEnd, val, yTop, yBot, yMid, bits, radix, xingW, w) {
  const x0 = xForStep(iStart);
  const x1 = xForStep(iEnd);
  if (x1 < METRICS.LABEL_W || x0 > w) return;
  if (val === null || val === undefined) return;

  const hexStart = x0 + (iStart === 0 ? 0 : xingW / 2);
  const hexEnd   = x1 - xingW / 2;

  // Two parallel rails (top + bottom of the hex), with slanted leading and
  // trailing edges forming the X-transition.
  _ctx.strokeStyle = color;
  _ctx.lineWidth = 1.5;
  _ctx.beginPath();
  // Leading edge (X from y0 rails into hex corners)
  if (iStart === 0) {
    _ctx.moveTo(x0, yTop);
  } else {
    _ctx.moveTo(x0, yMid);
    _ctx.lineTo(hexStart, yTop);
  }
  // Top rail
  _ctx.lineTo(hexEnd, yTop);
  // Trailing X to midline
  _ctx.lineTo(x1, yMid);
  _ctx.stroke();

  _ctx.beginPath();
  if (iStart === 0) {
    _ctx.moveTo(x0, yBot);
  } else {
    _ctx.moveTo(x0, yMid);
    _ctx.lineTo(hexStart, yBot);
  }
  _ctx.lineTo(hexEnd, yBot);
  _ctx.lineTo(x1, yMid);
  _ctx.stroke();

  // Soft fill inside the hex to group visually with the color.
  _ctx.fillStyle = color + '15';
  _ctx.beginPath();
  _ctx.moveTo(iStart === 0 ? x0 : x0, iStart === 0 ? yTop : yMid);
  if (iStart !== 0) _ctx.lineTo(hexStart, yTop);
  _ctx.lineTo(hexEnd, yTop);
  _ctx.lineTo(x1, yMid);
  _ctx.lineTo(hexEnd, yBot);
  if (iStart !== 0) _ctx.lineTo(hexStart, yBot);
  _ctx.lineTo(x0, iStart === 0 ? yBot : yMid);
  _ctx.closePath();
  _ctx.fill();

  // Value label — centered, shrink to fit or hide if there's no room.
  const text = formatValue(val, bits, radix);
  const availableW = hexEnd - hexStart - 4;
  _ctx.font = TYPE.value;
  let tw = _ctx.measureText(text).width;
  if (tw > availableW) {
    _ctx.font = TYPE.valueSmall;
    tw = _ctx.measureText(text).width;
  }
  if (tw <= availableW && availableW > 8) {
    _ctx.fillStyle = COLORS.text;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(text, (hexStart + hexEnd) / 2, yMid);
  }
}
