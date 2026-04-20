/**
 * PipelinePanel — read-only UI for pipeline analysis.
 * Shows stages, latency, throughput, and bottleneck in a side panel.
 * Updates on 'pipeline:analyzed' events and debounced scene mutations.
 */
import { bus } from '../../core/EventBus.js';
import { setPipelineViolations, setPipelineCriticalPath } from '../../rendering/CanvasRenderer.js';

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
    document.getElementById('btn-pipeline-toggle')?.classList.add('active');
    const r = this._analyzer.analyze({ force: true });
    this._render(r);
  }
  hide() {
    this._visible = false;
    this._el?.classList.add('hidden');
    document.getElementById('btn-pipeline-toggle')?.classList.remove('active');
    setPipelineCriticalPath(null);
  }
  toggle() { this._visible ? this.hide() : this.show(); }

  _render(r) {
    if (!this._body || !this._summary) return;
    // Always push violations to the renderer (null when no data).
    setPipelineViolations(r?.violations?.length ? r.violations : null);
    if (!r || r.cycles === 0) {
      this._summary.innerHTML = '';
      this._body.innerHTML = '<div class="pipe-empty">No pipeline detected.<br>Drop a PIPE register and wire it up.</div>';
      return;
    }
    const maxDelay = r.maxDelayPs ?? 0;
    const minDelay = r.stages.reduce((m, s) => Math.min(m, s.delayPs), Infinity);
    const balance  = maxDelay > 0 ? (minDelay / maxDelay) : 1;
    const fMax     = r.fMaxMHz;
    const fMaxStr  = (!isFinite(fMax)) ? '—' : (fMax >= 1000 ? (fMax/1000).toFixed(2) + ' GHz' : fMax.toFixed(0) + ' MHz');

    const warn = r.hasCycle ? '<span class="warn">⚠ feedback loop</span>' : '';
    const vioCount = r.violations?.length ?? 0;
    const vioLine  = vioCount > 0
      ? `<span class="k">Violations</span><span class="v warn">⚠ ${vioCount} cross-stage wire${vioCount===1?'':'s'}</span>`
      : '';
    const unknown = r.unknownTypes ?? [];
    const unknownLine = unknown.length > 0
      ? `<span class="k">Unknown</span><span class="v warn" title="Types missing from DelayModel.js — add an entry or they'll use the 100 ps fallback">⚠ ${unknown.join(', ')}</span>`
      : '';
    this._summary.innerHTML = `
      <span class="k">Latency</span><span class="v">${r.cycles} cycle${r.cycles===1?'':'s'}</span>
      <span class="k">Bottleneck</span><span class="v">S${r.bottleneck} (${maxDelay} ps)</span>
      <span class="k">f_max</span><span class="v">${fMaxStr}</span>
      <span class="k">Balance</span><span class="v">${(balance*100).toFixed(0)}%</span>
      ${warn ? `<span class="k">Warn</span><span class="v">${warn}</span>` : ''}
      ${vioLine}
      ${unknownLine}
    `;

    this._body.innerHTML = r.stages.map(s => {
      const pct = maxDelay > 0 ? Math.max(2, Math.round(100 * s.delayPs / maxDelay)) : 0;
      const bn  = s.idx === r.bottleneck ? ' bottleneck' : '';
      const badges = [
        s.hasStall ? '<span class="pipe-badge pipe-badge-stall" title="Stall wired">S</span>' : '',
        s.hasFlush ? '<span class="pipe-badge pipe-badge-flush" title="Flush wired">F</span>' : '',
        s.elastic  ? '<span class="pipe-badge pipe-badge-elastic" title="Elastic (valid/ready handshake)">E</span>' : '',
      ].join('');
      return `<div class="pipe-stage-row${bn}" data-stage="${s.idx}">
        <span class="pipe-stage-idx">S${s.idx}</span>
        <span class="pipe-stage-depth">${s.delayPs} ps</span>
        <span class="pipe-stage-count">d=${s.depth} · ${s.nodes.length}n</span>
        <span class="pipe-stage-badges">${badges}</span>
        <span class="pipe-stage-bar"><div style="width:${pct}%"></div></span>
      </div>`;
    }).join('');

    // Violations section (after the stage list).
    if (r.violations && r.violations.length) {
      const labelOf = (id) => {
        const n = this._analyzer._scene.getNode?.(id);
        return n ? (n.label || n.id) : id;
      };
      const items = r.violations.map(v => `
        <div class="pipe-violation-row" data-wire="${v.wireId}" data-src="${v.srcId}" data-dst="${v.dstId}">
          <span class="pvi-stages">S${v.srcStage} → S${v.dstStage}</span>
          <span class="pvi-names">${labelOf(v.srcId)} → ${labelOf(v.dstId)}</span>
          <span class="pvi-missing">missing ${v.missing} PIPE</span>
        </div>`).join('');
      this._body.insertAdjacentHTML('beforeend',
        `<div class="pipe-violations-header">VIOLATIONS (${r.violations.length})</div>${items}`);

      this._body.querySelectorAll('.pipe-violation-row').forEach(row => {
        row.addEventListener('click', () => {
          bus.emit('pipeline:jump-to-wire', {
            srcId: row.dataset.src, dstId: row.dataset.dst, wireId: row.dataset.wire,
          });
        });
      });
    }

    // Row clicks emit a highlight event — the StageOverlay controller listens,
    // and locally we also push the critical path of that stage to the renderer.
    this._body.querySelectorAll('.pipe-stage-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.dataset.stage, 10);
        const already = row.classList.contains('active-hl');
        this._body.querySelectorAll('.pipe-stage-row').forEach(r => r.classList.remove('active-hl'));
        if (already) {
          bus.emit('pipeline:highlight-stage', null);
          setPipelineCriticalPath(null);
        } else {
          row.classList.add('active-hl');
          bus.emit('pipeline:highlight-stage', idx);
          setPipelineCriticalPath(r.stages[idx]?.criticalPath ?? null);
        }
      });
    });
  }
}
