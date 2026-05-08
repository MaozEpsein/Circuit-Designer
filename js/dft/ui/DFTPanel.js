// DFT (Design For Test) Panel.
//
// Parallel architecture to PipelinePanel — different abstraction
// (testability, fault coverage, scan chains, BIST, JTAG) but the
// same UI shape: a header bar, a summary row, and a body of
// collapsible sections, each rendered fresh on a render pass.
//
// Layer 0 (this file in this commit): scaffold only — empty body
// with a friendly placeholder. Subsequent layers add sections one
// at a time (Fault List, Coverage, Scan Chains, BIST LIVE, JTAG
// LIVE, etc.) by extending _render() with new section emitters.
//
// Mutual exclusion with PipelinePanel: opening DFT closes Pipeline
// and vice versa. Both panels share the bottom-right slot in the
// CSS, so showing both at once would overlap. Distinct accent
// colours (blue for Pipeline, orange for DFT) make it clear which
// is active.

import { bus } from '../../core/EventBus.js';
import { simulateFaults } from '../FaultSimulator.js';

export class DFTPanel {
  constructor(sceneRef = null) {
    // Optional scene reference. When provided, sections like FAULT LIST
    // and TESTABILITY OVERVIEW enumerate the live scene's wires.
    this._scene   = sceneRef;
    this._el      = document.getElementById('dft-panel');
    this._header  = document.getElementById('dft-panel-header');
    this._summary = document.getElementById('dft-panel-summary');
    this._body    = document.getElementById('dft-panel-body');
    this._closeBtn   = document.getElementById('btn-dft-close');
    this._fsBtn      = document.getElementById('btn-dft-fullscreen');
    this._visible    = false;

    this._runBtn  = document.getElementById('btn-dft-run');
    // Layer 2 — last fault-sim result. null until the user clicks RUN.
    // Cleared when the scene mutates (vectors / topology may have changed).
    this._lastSim = null;

    if (this._closeBtn) this._closeBtn.addEventListener('click', () => this.hide());
    if (this._fsBtn)    this._fsBtn.addEventListener('click', () => this._toggleFullscreen());
    if (this._runBtn)   this._runBtn.addEventListener('click', () => this._runFaultSim());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._el?.classList.contains('dft-fullscreen')) {
        this._toggleFullscreen();
      }
    });
    // Top-toolbar DFT button — parallel to the ANALYSIS button.
    document.getElementById('btn-dft-toggle')?.addEventListener('click', () => this.toggle());

    // Re-render on scene mutations so the panel reflects the current
    // circuit. Topology changes invalidate the cached fault-sim result —
    // a stale coverage % over a different netlist would be misleading.
    const refresh = () => {
      this._lastSim = null;
      if (this._visible) this._render();
    };
    bus.on('node:added',     refresh);
    bus.on('node:removed',   refresh);
    bus.on('wire:added',     refresh);
    bus.on('wire:removed',   refresh);
    bus.on('scene:loaded',   refresh);
    bus.on('node:props-changed', refresh);

    // Live telemetry channel for BIST / JTAG / coverage updates.
    // Layer 0 just stores the latest payload; later layers read it
    // in their section renderers.
    this._liveData = {};
    bus.on('runtime:dft-data', (payload) => {
      this._liveData = payload || {};
      if (this._visible) this._render();
    });
  }

  show() {
    if (!this._el) return;
    this._el.classList.remove('hidden');
    document.getElementById('btn-dft-toggle')?.classList.add('active');
    this._visible = true;
    this._render();
  }

  hide() {
    if (!this._el) return;
    this._el.classList.add('hidden');
    document.getElementById('btn-dft-toggle')?.classList.remove('active');
    this._visible = false;
  }

  toggle() {
    if (this._visible) this.hide();
    else this.show();
  }

  _toggleFullscreen() {
    if (!this._el) return;
    const on = this._el.classList.toggle('dft-fullscreen');
    if (this._fsBtn) this._fsBtn.textContent = on ? 'EXIT FS' : 'FULLSCREEN';
    if (on) {
      this._fsSaved = {
        width:    this._el.style.width,
        height:   this._el.style.height,
        fontSize: this._el.style.fontSize,
      };
      this._el.style.width    = '';
      this._el.style.height   = '';
      this._el.style.fontSize = '';
      if (this._summary && this._body && this._summary.parentNode !== this._body) {
        this._body.insertBefore(this._summary, this._body.firstChild);
      }
    } else {
      if (this._fsSaved) {
        this._el.style.width    = this._fsSaved.width;
        this._el.style.height   = this._fsSaved.height;
        this._el.style.fontSize = this._fsSaved.fontSize;
        this._fsSaved = null;
      }
      if (this._summary && this._body && this._summary.parentNode === this._body) {
        this._el.insertBefore(this._summary, this._body);
      }
    }
  }

  // Render pass. Layer 0 only emits the placeholder body — every
  // subsequent layer adds a section by extending this method (or by
  // appending more `_render*` calls). Each section is wrapped by
  // _applyCollapsibleSections() at the end so headers become
  // toggleable.
  _render() {
    if (!this._body || !this._summary) return;
    const wires    = this._scene?.wires || [];
    const wireCnt  = wires.length;
    const injStuck = wires.filter(w => w.stuckAt === 0 || w.stuckAt === 1).length;
    const injOpen  = wires.filter(w => w.open).length;
    const injBrdg  = wires.filter(w => w.bridgedWith).length;
    const injTotal = injStuck + injOpen + injBrdg;
    const faultCnt = wireCnt * 2;       // potential s-a-0 + s-a-1 sites

    this._summary.innerHTML = `
      <span class="k">Wires</span><span class="v">${wireCnt}</span>
      <span class="k">Faults possible (s-a-0 + s-a-1)</span><span class="v">${faultCnt}</span>
      <span class="k">Injected (stuck / open / bridge)</span><span class="v">${injStuck} / ${injOpen} / ${injBrdg}</span>
    `;

    this._body.innerHTML =
      this._renderTestabilityOverview(wires, { injStuck, injOpen, injBrdg, injTotal }) +
      this._renderFaultCoverage() +
      this._renderFaultList(wires);

    this._applyCollapsibleSections();
  }

  // ── Run the combinational fault simulator on the current scene ─
  // Vectors come from `scene._dft?.vectors` (set by demo JSONs or by
  // future UI). If absent, fall back to a small canonical sweep:
  // all-zero, all-one, walking-1. Result is cached on this._lastSim
  // and surfaced via _renderFaultCoverage + the detection column in
  // _renderFaultList.
  _runFaultSim() {
    if (!this._scene) return;
    const vectors = this._scene._dft?.vectors || this._defaultVectors();
    if (!vectors.length) return;
    this._lastSim = simulateFaults(this._scene.nodes, this._scene.wires, vectors, {
      models: ['stuck-at-0', 'stuck-at-1', 'open'],
    });
    this._lastSim._vectors = vectors;     // remembered for the per-vector display
    if (this._visible) this._render();
  }

  // Default vector sweep when the scene doesn't ship its own: all-zero,
  // all-one, then one walking-1 per primary input. Modest coverage but
  // always available — the user can override by editing `scene._dft.vectors`.
  _defaultVectors() {
    const inputs = (this._scene?.nodes || [])
      .filter(n => n.type === 'INPUT')
      .sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    const N = inputs.length;
    if (N === 0) return [];
    const allZero = Array(N).fill(0);
    const allOne  = Array(N).fill(1);
    const walking = Array.from({ length: N }, (_, i) => {
      const v = Array(N).fill(0); v[i] = 1; return v;
    });
    return [allZero, allOne, ...walking];
  }

  // ── FAULT COVERAGE ──────────────────────────────────────────
  _renderFaultCoverage() {
    if (!this._lastSim) {
      return `
        <div class="dft-coverage-header dft-section-header">FAULT COVERAGE</div>
        <div class="dft-empty">Click <b style="color:#ffb878">RUN FAULT SIM</b> in the header to score the test vectors against every wire fault. Coverage and per-fault detection rows will populate the table below.</div>
      `;
    }
    const { coverage, _vectors } = this._lastSim;
    const pct = coverage.percent;
    const barW = Math.max(2, pct);
    // Colour the bar by quality tier — under 70 red-ish, 70-90 amber,
    // 90+ green (the industry rule of thumb for "shippable").
    const tier = pct < 70 ? '#cc4040' : pct < 90 ? '#cca040' : '#40cc60';
    return `
      <div class="dft-coverage-header dft-section-header">FAULT COVERAGE</div>
      <div class="dft-perf-row" style="grid-template-columns: 1fr">
        <div style="display:flex;align-items:center;gap:1em;flex-wrap:wrap">
          <div style="flex:1;min-width:200px;background:#1a1208;border:1px solid #401a00;border-radius:3px;height:18px;position:relative;overflow:hidden">
            <div style="position:absolute;left:0;top:0;bottom:0;width:${barW}%;background:linear-gradient(90deg,${tier}88,${tier});box-shadow:0 0 8px ${tier}66;transition:width 0.3s"></div>
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#fff;font-size:0.92em;text-shadow:0 0 4px #000">
              ${pct}% — ${coverage.detected} of ${coverage.total} faults
            </div>
          </div>
          <span style="color:#876;font-size:0.92em">${_vectors.length} vector${_vectors.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    `;
  }

  // ── TESTABILITY OVERVIEW ────────────────────────────────────
  _renderTestabilityOverview(wires, inj) {
    const wireCnt   = wires.length;
    const faultCnt  = wireCnt * 2;
    const nodeCnt   = this._scene?.nodes?.length || 0;
    const ffCnt     = (this._scene?.nodes || []).filter(
      n => /FF|FLIPFLOP|REGISTER|LATCH/.test(n.type || '')
    ).length;
    return `
      <div class="dft-overview-header dft-section-header">TESTABILITY OVERVIEW</div>
      <div class="dft-perf-row">
        <span class="k">Nodes / Wires</span><span class="v">${nodeCnt} / ${wireCnt}</span>
        <span class="k">FFs (state-holding)</span><span class="v">${ffCnt}</span>
        <span class="k">Total faults possible (s-a)</span><span class="v">${faultCnt}</span>
        <span class="k">Injected — stuck-at</span><span class="v" style="color:#ff9933">${inj.injStuck}</span>
        <span class="k">Injected — open</span><span class="v" style="color:#ff4040">${inj.injOpen}</span>
        <span class="k">Injected — bridging</span><span class="v" style="color:#cc66ff">${inj.injBrdg}</span>
      </div>
    `;
  }

  // ── FAULT LIST ──────────────────────────────────────────────
  _renderFaultList(wires) {
    if (!wires.length) {
      return `
        <div class="dft-faultlist-header dft-section-header">FAULT LIST</div>
        <div class="dft-empty">no wires in scene — drop components and connect them to enumerate fault sites.</div>
      `;
    }
    // Visual conventions per fault type:
    //   stuck-at  → orange pill with S0 / S1
    //   open      → red pill "OPN"
    //   bridging  → purple pill "B→<other>"
    //   inactive  → dim dot
    const cellInactive = '<span style="color:#444">·</span>';
    const pill = (bg, fg, text) =>
      `<span style="display:inline-block;min-width:22px;padding:1px 6px;background:${bg};color:${fg};border-radius:10px;font-weight:bold;font-size:0.85em;letter-spacing:0.5px;box-shadow:0 0 6px ${bg}99">${text}</span>`;

    // Build a per-wire detection summary if a fault-sim result is cached.
    // Maps wireId → { sa0: [vec idx...], sa1: [...], open: [...] }.
    const det = new Map();
    if (this._lastSim) {
      this._lastSim.perFault.forEach(f => {
        if (!det.has(f.wireId)) det.set(f.wireId, {});
        det.get(f.wireId)[f.kind] = f.detectedBy;
      });
    }
    const fmtDetect = (arr) => {
      if (!arr) return '';
      if (arr.length === 0) return '<span style="color:#cc4040">UND</span>';
      if (arr.length <= 3)  return '<span style="color:#40cc60">v' + arr.join(',v') + '</span>';
      return `<span style="color:#40cc60">v${arr.slice(0,2).join(',v')} +${arr.length-2}</span>`;
    };

    const rows = wires.map(w => {
      const id   = (w.id || `${w.sourceId}→${w.targetId}`).slice(0, 22);
      const hasStuck  = (w.stuckAt === 0 || w.stuckAt === 1);
      const hasOpen   = !!w.open;
      const hasBridge = !!w.bridgedWith;
      const isInject  = hasStuck || hasOpen || hasBridge;
      const d         = det.get(w.id);

      const sa0 = w.stuckAt === 0 ? pill('#ff9933', '#1a0d00', 'S0') : cellInactive;
      const sa1 = w.stuckAt === 1 ? pill('#ff9933', '#1a0d00', 'S1') : cellInactive;
      const op  = hasOpen           ? pill('#ff4040', '#1a0000', 'OPN') : cellInactive;
      const br  = hasBridge
        ? pill('#cc66ff', '#1a001a', 'B→' + (w.bridgedWith || '').slice(0, 6))
        : cellInactive;

      // Row tint follows the dominant fault (open > stuck > bridge).
      let rowStyle = '';
      let idColor  = '#f0e2cf';
      if (hasOpen)        { rowStyle = 'background:rgba(255,64,64,0.10)';  idColor = '#ffb0b0'; }
      else if (hasStuck)  { rowStyle = 'background:rgba(255,153,51,0.08)'; idColor = '#ffb878'; }
      else if (hasBridge) { rowStyle = 'background:rgba(204,102,255,0.08)';idColor = '#e0c0ff'; }

      const status = isInject
        ? `<span style="color:${idColor};font-weight:bold">${
            hasOpen ? 'open' : hasStuck ? 's-a-' + w.stuckAt : 'bridge ' + w.bridgeMode
          } ◀</span>`
        : '<span style="color:#555">—</span>';

      // "detected by" column. Shows the per-fault detection summary
      // when fault sim has been run. Compact: "sa0 v2 · sa1 UND · op v0".
      let detectedHtml = '<span style="color:#444">—</span>';
      if (d) {
        const parts = [];
        if (d.sa0)  parts.push(`<span style="color:#876">sa0</span> ${fmtDetect(d.sa0)}`);
        if (d.sa1)  parts.push(`<span style="color:#876">sa1</span> ${fmtDetect(d.sa1)}`);
        if (d.open) parts.push(`<span style="color:#876">op</span> ${fmtDetect(d.open)}`);
        detectedHtml = parts.join(' · ');
      }

      return `<tr style="${rowStyle}">
        <td style="padding:2px 8px;color:${idColor};${isInject ? 'font-weight:bold' : ''}">${id}</td>
        <td style="padding:2px 8px">${(w.sourceId || '').slice(0, 12)}</td>
        <td style="padding:2px 8px">${(w.targetId || '').slice(0, 12)}[${w.targetInputIndex ?? 0}]</td>
        <td style="padding:2px 8px;text-align:center">${sa0}</td>
        <td style="padding:2px 8px;text-align:center">${sa1}</td>
        <td style="padding:2px 8px;text-align:center">${op}</td>
        <td style="padding:2px 8px;text-align:center">${br}</td>
        <td style="padding:2px 8px">${status}</td>
        <td style="padding:2px 8px;font-size:0.88em">${detectedHtml}</td>
      </tr>`;
    }).join('');
    return `
      <div class="dft-faultlist-header dft-section-header">FAULT LIST</div>
      <div style="padding:0 1.2em;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-family:'JetBrains Mono',monospace;font-size:0.92em">
          <thead>
            <tr style="color:#876;border-bottom:1px solid #401a00">
              <th style="padding:3px 8px;text-align:left">wire-id</th>
              <th style="padding:3px 8px;text-align:left">source</th>
              <th style="padding:3px 8px;text-align:left">target[in]</th>
              <th style="padding:3px 8px">s-a-0</th>
              <th style="padding:3px 8px">s-a-1</th>
              <th style="padding:3px 8px">open</th>
              <th style="padding:3px 8px">bridge</th>
              <th style="padding:3px 8px;text-align:left">injected</th>
              <th style="padding:3px 8px;text-align:left">detected by</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // Wraps each "*-header" element in a .dft-section container with
  // a clickable toggle. Mirrors PipelinePanel._applyCollapsibleSections.
  // Idempotent — safe to call after every _render().
  _applyCollapsibleSections() {
    if (!this._body) return;
    const headers = this._body.querySelectorAll('[class$="-header"]');
    headers.forEach(h => {
      // Skip if already wrapped.
      if (h.parentElement?.classList.contains('dft-section')) return;
      const section = document.createElement('div');
      section.className = 'dft-section';
      section.dataset.section = h.className.replace(/-header$/, '');
      h.parentNode.insertBefore(section, h);
      section.appendChild(h);
      // Move every following sibling that isn't another header into
      // this section, until the next header (or end of body).
      while (section.nextSibling && !(section.nextSibling.className || '').endsWith('-header')) {
        section.appendChild(section.nextSibling);
      }
      // Add a toggle indicator + click handler.
      if (!h.querySelector('.dft-section-toggle')) {
        const toggle = document.createElement('span');
        toggle.className = 'dft-section-toggle';
        toggle.textContent = '▾';
        h.appendChild(toggle);
      }
      h.addEventListener('click', () => {
        section.classList.toggle('dft-section-collapsed');
        const tog = h.querySelector('.dft-section-toggle');
        if (tog) tog.textContent = section.classList.contains('dft-section-collapsed') ? '▸' : '▾';
      });
    });
  }
}
