/**
 * PipelineAnalyzer — public API for pipeline analysis.
 * Wraps StageEvaluator with cache + EventBus integration.
 * UI consumers should call analyze() and subscribe to 'pipeline:analyzed'.
 */
import { bus } from '../core/EventBus.js';
import { evaluate } from './StageEvaluator.js';
import { detectHazards } from './HazardDetector.js';

export class PipelineAnalyzer {
  constructor(scene) {
    this._scene = scene;
    this._cache = null;
    this._dirty = true;
    this._warnedUnknown = new Set();   // types we've already warned about

    const invalidate = () => { this._dirty = true; };
    bus.on('node:added', invalidate);
    bus.on('node:removed', invalidate);
    bus.on('wire:added', invalidate);
    bus.on('wire:removed', invalidate);
    bus.on('scene:loaded', invalidate);
    bus.on('scene:cleared', invalidate);
  }

  analyze({ force = false } = {}) {
    if (!force && !this._dirty && this._cache) return this._cache;
    this._cache = evaluate(this._scene);
    this._cache.hazards = detectHazards(this._scene);
    this._dirty = false;
    // Warn once per unknown type — prompts the designer to update DelayModel.js.
    for (const t of (this._cache.unknownTypes || [])) {
      if (!this._warnedUnknown.has(t)) {
        this._warnedUnknown.add(t);
        console.warn(`[Pipeline] unknown component type '${t}' — add it to js/pipeline/DelayModel.js (falling back to 100 ps)`);
      }
    }
    bus.emit('pipeline:analyzed', this._cache);
    return this._cache;
  }

  invalidate() { this._dirty = true; }
}
