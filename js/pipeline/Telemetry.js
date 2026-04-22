/**
 * Pipeline Telemetry — purely local (localStorage) usage counters for the
 * pipelining feature. No network, no IDs, no payload beyond monotonic
 * counters. Intended for the designer's own "is anyone using this?"
 * introspection — surfaced on the DevTools via `window.pipeline.telemetry()`.
 *
 * Stored as a single JSON blob under one key so the whole thing round-trips
 * as a unit. Failures on localStorage access (privacy mode, quota) are
 * swallowed silently — telemetry must never break the user-facing features.
 */

const STORAGE_KEY = 'circuit_designer_pipeline_telemetry';

const _empty = () => ({
  analyses:         0,     // total analyze() invocations
  analysesForced:   0,     // analyze({force:true}) subset
  panelOpens:       0,     // pipeline panel show() calls
  stageViewOpens:   0,     // stage overlay enabled-transitions
  paletteToggles:   0,     // colorblind palette toggles
  firstSeen:        null,  // ISO timestamp of first event
  lastSeen:         null,  // ISO timestamp of most recent event
});

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return _empty();
    return { ..._empty(), ...JSON.parse(raw) };
  } catch (_) {
    return _empty();
  }
}

function _save(obj) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (_) {}
}

/**
 * Bump one or more counters and touch lastSeen. No-op silently on failure.
 * @param {Partial<Record<'analyses'|'analysesForced'|'panelOpens'|'stageViewOpens'|'paletteToggles', number>>} deltas
 */
export function bump(deltas) {
  const t = _load();
  for (const [k, v] of Object.entries(deltas)) {
    if (k in t && typeof t[k] === 'number') t[k] += v;
  }
  const now = new Date().toISOString();
  if (!t.firstSeen) t.firstSeen = now;
  t.lastSeen = now;
  _save(t);
}

/** Snapshot of current counters. Safe to call anywhere. */
export function snapshot() {
  return _load();
}

/** Reset to zero. Exposed for manual use via DevTools. */
export function reset() {
  _save(_empty());
}
