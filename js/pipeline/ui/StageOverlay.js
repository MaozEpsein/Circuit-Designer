/**
 * StageOverlay — toggles coloured halos on the canvas per pipeline stage.
 * Subscribes to 'pipeline:analyzed' to keep the overlay in sync with scene mutations.
 */
import { bus } from '../../core/EventBus.js';
import { setStageOverlay } from '../../rendering/CanvasRenderer.js';
import * as Telemetry from '../Telemetry.js';

export class StageOverlay {
  constructor(analyzer) {
    this._analyzer = analyzer;
    this._enabled     = false;
    this._highlighted = null;   // null = show every stage; number = isolate one
    this._bottleneck  = -1;

    bus.on('pipeline:analyzed', (r) => {
      this._bottleneck = r?.bottleneck ?? -1;
      this._push();
    });
    bus.on('pipeline:highlight-stage', (idx) => {
      this._highlighted = (idx == null) ? null : idx;
      if (this._enabled) this._push();
    });
  }

  enable() {
    this._enabled = true;
    Telemetry.bump({ stageViewOpens: 1 });
    const r = this._analyzer.analyze();        // ensures node.stage is up-to-date
    this._bottleneck = r?.bottleneck ?? -1;
    this._push();
  }
  disable() {
    this._enabled = false;
    setStageOverlay(null);
  }
  toggle() { this._enabled ? this.disable() : this.enable(); }
  isEnabled() { return this._enabled; }

  _push() {
    if (!this._enabled) { setStageOverlay(null); return; }
    setStageOverlay({
      enabled: true,
      highlighted: this._highlighted,
      bottleneck:  this._bottleneck,
    });
  }
}
