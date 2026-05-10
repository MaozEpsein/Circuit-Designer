/**
 * MobileMode.js — Mobile Viewer Mode (Scope A)
 *
 * Toggles the `body.mobile-viewer` class based on viewport + touch capability.
 * When active, mobile.css reflows the layout and js/mobile/MobileTouchHandler.js
 * attaches touch handlers to the canvas. When inactive, this file has zero
 * effect on the desktop experience.
 *
 * URL overrides for testing:
 *   ?mobile=1  — force mobile viewer ON (any device)
 *   ?mobile=0  — force mobile viewer OFF (any device)
 */

const MOBILE_BREAKPOINT_PX = 768;

let _touchHandler = null;
let _resizeTimer = null;
let _initialized = false;

function detect() {
  const params = new URLSearchParams(location.search);
  if (params.has('mobile')) return params.get('mobile') !== '0';
  const isNarrow = window.innerWidth < MOBILE_BREAKPOINT_PX;
  const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  return isNarrow && hasTouch;
}

function ensureBadge() {
  let el = document.getElementById('mobile-viewer-badge');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'mobile-viewer-badge';
  el.textContent = '📱 VIEWER';
  el.title = 'Mobile viewer mode — read-only. Use ?mobile=0 to force desktop layout.';
  el.style.cssText = [
    'position:fixed', 'bottom:6px', 'right:6px', 'z-index:250',
    'background:#102030', 'color:#80c0ff', 'border:1px solid #2a4060',
    'border-radius:10px', 'padding:3px 8px',
    "font:bold 9px 'JetBrains Mono',monospace", 'letter-spacing:1px',
    'pointer-events:none', 'opacity:0.7',
  ].join(';');
  document.body.appendChild(el);
  return el;
}

function apply() {
  const on = detect();
  const wasOn = document.body.classList.contains('mobile-viewer');
  if (on === wasOn) return;
  document.body.classList.toggle('mobile-viewer', on);
  if (on) {
    ensureBadge();
    if (!_touchHandler) {
      import('./MobileTouchHandler.js').then(mod => {
        if (!document.body.classList.contains('mobile-viewer')) return;
        _touchHandler = new mod.MobileTouchHandler();
        _touchHandler.attach();
      }).catch(() => {});
    }
  } else {
    const badge = document.getElementById('mobile-viewer-badge');
    if (badge) badge.remove();
    if (_touchHandler) {
      _touchHandler.detach();
      _touchHandler = null;
    }
  }
}

function onResize() {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(apply, 200);
}

export function init() {
  if (_initialized) return;
  _initialized = true;
  apply();
  window.addEventListener('resize', onResize);
}

export function isActive() {
  return document.body.classList.contains('mobile-viewer');
}
