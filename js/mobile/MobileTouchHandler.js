/**
 * MobileTouchHandler.js — Touch input for canvas in Mobile Viewer mode.
 *
 * Lives entirely separate from InputHandler.js. Only attached when
 * body.mobile-viewer is active. Three gestures:
 *   • Tap          — short single-finger touch → synthetic click (selection,
 *                    properties popup) routed through existing InputHandler.
 *   • Pan          — single-finger drag → Renderer.panBy(dx, dy).
 *   • Pinch-zoom   — two-finger gesture → Renderer.zoomAt(midX, midY, delta).
 *
 * preventDefault() is called on every event so the browser does not fire
 * synthetic mouse events that would clash with InputHandler's listeners.
 */

import * as Renderer from '../rendering/CanvasRenderer.js';

const TAP_MAX_MS = 250;
const TAP_MAX_MOVE_PX = 8;
const PAN_DEADZONE_PX = 4;
const PINCH_STEP_THRESHOLD = 1.05; /* ratio at which we apply one zoomAt */
const PINCH_MAX_STEPS_PER_MOVE = 4;

export class MobileTouchHandler {
  constructor() {
    this._canvas = null;
    this._touches = new Map();
    this._lastPinchDist = 0;
    this._panStarted = false;
    this._multiTouchSeen = false;

    this._onStart  = this._onStart.bind(this);
    this._onMove   = this._onMove.bind(this);
    this._onEnd    = this._onEnd.bind(this);
    this._onCancel = this._onCancel.bind(this);
  }

  attach() {
    this._canvas = document.getElementById('game-canvas');
    if (!this._canvas) return;
    const opts = { passive: false };
    this._canvas.addEventListener('touchstart',  this._onStart,  opts);
    this._canvas.addEventListener('touchmove',   this._onMove,   opts);
    this._canvas.addEventListener('touchend',    this._onEnd,    opts);
    this._canvas.addEventListener('touchcancel', this._onCancel, opts);
  }

  detach() {
    if (!this._canvas) return;
    this._canvas.removeEventListener('touchstart',  this._onStart);
    this._canvas.removeEventListener('touchmove',   this._onMove);
    this._canvas.removeEventListener('touchend',    this._onEnd);
    this._canvas.removeEventListener('touchcancel', this._onCancel);
    this._touches.clear();
    this._canvas = null;
  }

  _localPoint(touch) {
    const rect = this._canvas.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  _onStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const p = this._localPoint(t);
      this._touches.set(t.identifier, {
        x: p.x, y: p.y,
        startX: p.x, startY: p.y,
        clientX: t.clientX, clientY: t.clientY,
        startTime: performance.now(),
      });
    }
    if (this._touches.size >= 2) {
      this._multiTouchSeen = true;
      if (this._touches.size === 2) this._lastPinchDist = this._currentPinchDist();
    }
    this._panStarted = false;
  }

  _onMove(e) {
    e.preventDefault();

    /* Update stored positions for every moved touch. */
    for (const t of e.changedTouches) {
      const rec = this._touches.get(t.identifier);
      if (!rec) continue;
      const p = this._localPoint(t);
      rec.prevX = rec.x; rec.prevY = rec.y;
      rec.x = p.x; rec.y = p.y;
      rec.clientX = t.clientX; rec.clientY = t.clientY;
    }

    if (this._touches.size === 1) {
      const rec = this._touches.values().next().value;
      const dx = rec.x - (rec.prevX ?? rec.x);
      const dy = rec.y - (rec.prevY ?? rec.y);
      const moved = Math.hypot(rec.x - rec.startX, rec.y - rec.startY);
      if (this._panStarted || moved > PAN_DEADZONE_PX) {
        this._panStarted = true;
        if (dx || dy) Renderer.panBy(dx, dy);
      }
    } else if (this._touches.size >= 2) {
      const dist = this._currentPinchDist();
      if (this._lastPinchDist > 0 && dist > 0) {
        const ratio = dist / this._lastPinchDist;
        const mid = this._currentPinchMid();
        this._applyPinchZoom(ratio, mid.x, mid.y);
      }
      this._lastPinchDist = dist;
    }
  }

  _onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = this._touches.get(t.identifier);
      if (!rec) continue;
      const wasSingle = this._touches.size === 1;
      const dt = performance.now() - rec.startTime;
      const moved = Math.hypot(rec.x - rec.startX, rec.y - rec.startY);
      this._touches.delete(t.identifier);

      if (wasSingle && !this._panStarted && !this._multiTouchSeen
          && dt < TAP_MAX_MS && moved < TAP_MAX_MOVE_PX) {
        this._dispatchSyntheticClick(rec.clientX, rec.clientY);
      }
    }
    if (this._touches.size < 2) this._lastPinchDist = 0;
    if (this._touches.size === 0) {
      this._panStarted = false;
      this._multiTouchSeen = false;
    }
  }

  _onCancel(e) {
    for (const t of e.changedTouches) this._touches.delete(t.identifier);
    if (this._touches.size < 2) this._lastPinchDist = 0;
    if (this._touches.size === 0) {
      this._panStarted = false;
      this._multiTouchSeen = false;
    }
  }

  _currentPinchDist() {
    const it = this._touches.values();
    const a = it.next().value;
    const b = it.next().value;
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  _currentPinchMid() {
    const it = this._touches.values();
    const a = it.next().value;
    const b = it.next().value;
    if (!a || !b) return { x: 0, y: 0 };
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /**
   * Renderer.zoomAt applies a fixed factor (×1.1 in / ×0.9 out) per call.
   * To approximate continuous pinch-zoom we issue up to N calls per move
   * event until the cumulative factor matches the user's pinch ratio.
   */
  _applyPinchZoom(ratio, midX, midY) {
    if (!ratio || ratio === 1) return;
    let remaining = ratio;
    let steps = 0;
    if (ratio > PINCH_STEP_THRESHOLD) {
      while (remaining > PINCH_STEP_THRESHOLD && steps < PINCH_MAX_STEPS_PER_MOVE) {
        Renderer.zoomAt(midX, midY, -1); /* zoom in */
        remaining /= 1.1;
        steps++;
      }
    } else if (ratio < 1 / PINCH_STEP_THRESHOLD) {
      while (remaining < 1 / PINCH_STEP_THRESHOLD && steps < PINCH_MAX_STEPS_PER_MOVE) {
        Renderer.zoomAt(midX, midY, 1); /* zoom out */
        remaining /= 0.9;
        steps++;
      }
    }
  }

  _dispatchSyntheticClick(clientX, clientY) {
    if (!this._canvas) return;
    const evt = new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window,
      clientX, clientY, button: 0,
    });
    this._canvas.dispatchEvent(evt);
  }
}
