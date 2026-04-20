/**
 * PipelinePanel — read-only UI for pipeline analysis.
 * Shows stages, latency, throughput, and bottleneck in a side panel.
 * Updates on 'pipeline:analyzed' events and debounced scene mutations.
 */
import { bus } from '../../core/EventBus.js';

export class PipelinePanel {
  constructor(analyzer) {
    this._analyzer = analyzer;
    this._el       = document.getElementById('pipeline-panel');
    this._body     = document.getElementById('pipeline-panel-body');
    this._summary  = document.getElementById('pipeline-panel-summary');
    this._visible  = false;
    this._refreshTimer = null;

    document.getElementById('btn-pipeline-toggle')?.addEventListener('click', () => this.toggle());
    document.getElementById('btn-pipeline-close')?.addEventListener('click', () => this.hide());
    document.getElementById('btn-pipeline-refresh')?.addEventListener('click', () => {
      this._analyzer.analyze({ force: true });
    });

    // Live updates
    bus.on('pipeline:analyzed', (r) => { if (this._visible) this._render(r); });
    const schedule = () => {
      if (!this._visible) return;
      if (this._refreshTimer) return;
      this._refreshTimer = setTimeout(() => {
        this._refreshTimer = null;
        const r = this._analyzer.analyze();
        this._render(r);
      }, 200);
    };
    bus.on('node:added',   schedule);
    bus.on('node:removed', schedule);
    bus.on('wire:added',   schedule);
    bus.on('wire:removed', schedule);
    bus.on('scene:loaded', schedule);
    bus.on('scene:cleared', schedule);
  }

  show() {
    this._visible = true;
    this._el?.classList.remove('hidden');
    const r = this._analyzer.analyze({ force: true });
    this._render(r);
  }
  hide() {
    this._visible = false;
    this._el?.classList.add('hidden');
  }
  toggle() { this._visible ? this.hide() : this.show(); }

  _render(r) {
    if (!this._body || !this._summary) return;
    if (!r || r.cycles === 0) {
      this._summary.innerHTML = '';
      this._body.innerHTML = '<div class="pipe-empty">No pipeline detected.<br>Drop a PIPE register and wire it up.</div>';
      return;
    }
    const maxDepth = r.stages.reduce((m, s) => Math.max(m, s.depth), 0);
    const minDepth = r.stages.reduce((m, s) => Math.min(m, s.depth), Infinity);
    const balance  = maxDepth > 0 ? (minDepth / maxDepth) : 1;
    const throughput = maxDepth > 0 ? (1 / maxDepth).toFixed(3) : '—';

    const warn = r.hasCycle ? '<span class="warn">⚠ feedback loop</span>' : '';
    this._summary.innerHTML = `
      <span class="k">Latency</span><span class="v">${r.cycles} cycle${r.cycles===1?'':'s'}</span>
      <span class="k">Bottleneck</span><span class="v">stage ${r.bottleneck} (d=${maxDepth})</span>
      <span class="k">Throughput</span><span class="v">${throughput} /gate-delay</span>
      <span class="k">Balance</span><span class="v">${(balance*100).toFixed(0)}%</span>
      ${warn ? `<span class="k">Warn</span><span class="v">${warn}</span>` : ''}
    `;

    this._body.innerHTML = r.stages.map(s => {
      const pct = maxDepth > 0 ? Math.max(2, Math.round(100 * s.depth / maxDepth)) : 0;
      const bn  = s.idx === r.bottleneck ? ' bottleneck' : '';
      return `<div class="pipe-stage-row${bn}" data-stage="${s.idx}">
        <span class="pipe-stage-idx">S${s.idx}</span>
        <span class="pipe-stage-depth">d=${s.depth}</span>
        <span class="pipe-stage-count">${s.nodes.length} node${s.nodes.length===1?'':'s'}</span>
        <span class="pipe-stage-bar"><div style="width:${pct}%"></div></span>
      </div>`;
    }).join('');
  }
}
