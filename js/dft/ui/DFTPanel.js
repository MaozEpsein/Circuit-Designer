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

    if (this._closeBtn) this._closeBtn.addEventListener('click', () => this.hide());
    if (this._fsBtn)    this._fsBtn.addEventListener('click', () => this._toggleFullscreen());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._el?.classList.contains('dft-fullscreen')) {
        this._toggleFullscreen();
      }
    });
    // Top-toolbar DFT button — parallel to the ANALYSIS button.
    document.getElementById('btn-dft-toggle')?.addEventListener('click', () => this.toggle());

    // Re-render on scene mutations so the panel reflects the current
    // circuit. Layers 1+ will read the scene for fault enumeration,
    // scan-chain detection, etc.
    const refresh = () => { if (this._visible) this._render(); };
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
    const injected = wires.filter(w => w.stuckAt === 0 || w.stuckAt === 1).length;
    const faultCnt = wireCnt * 2;

    this._summary.innerHTML = `
      <span class="k">Wires</span><span class="v">${wireCnt}</span>
      <span class="k">Faults possible (s-a-0 + s-a-1)</span><span class="v">${faultCnt}</span>
      <span class="k">Currently injected</span><span class="v">${injected}</span>
    `;

    this._body.innerHTML =
      this._renderTestabilityOverview(wires, injected) +
      this._renderFaultList(wires);

    this._applyCollapsibleSections();
  }

  // ── TESTABILITY OVERVIEW ────────────────────────────────────
  _renderTestabilityOverview(wires, injected) {
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
        <span class="k">Total faults possible</span><span class="v">${faultCnt}</span>
        <span class="k">Currently injected</span><span class="v">${injected}</span>
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
    // Visual conventions:
    //   inactive cell  → muted dim dot
    //   injected cell  → solid orange pill with the stuck value inside
    //   injected row   → subtle orange row tint + bold wire-id
    const cellInactive = '<span style="color:#444">·</span>';
    const cellInject   = (val) =>
      `<span style="display:inline-block;min-width:22px;padding:1px 6px;background:#ff9933;color:#1a0d00;border-radius:10px;font-weight:bold;font-size:0.85em;letter-spacing:0.5px;box-shadow:0 0 6px rgba(255,153,51,0.6)">S${val}</span>`;

    const rows = wires.map(w => {
      const id        = (w.id || `${w.sourceId}→${w.targetId}`).slice(0, 22);
      const isInject  = (w.stuckAt === 0 || w.stuckAt === 1);
      const sa0       = w.stuckAt === 0 ? cellInject(0) : cellInactive;
      const sa1       = w.stuckAt === 1 ? cellInject(1) : cellInactive;
      const status    = isInject
        ? `<span style="color:#ffb878;font-weight:bold">s-a-${w.stuckAt} ◀</span>`
        : '<span style="color:#555">—</span>';
      const rowStyle  = isInject ? 'background:rgba(255,153,51,0.08)' : '';
      const idStyle   = isInject ? 'color:#ffb878;font-weight:bold' : 'color:#f0e2cf';
      return `<tr style="${rowStyle}">
        <td style="padding:2px 8px;${idStyle}">${id}</td>
        <td style="padding:2px 8px">${(w.sourceId || '').slice(0, 12)}</td>
        <td style="padding:2px 8px">${(w.targetId || '').slice(0, 12)}[${w.targetInputIndex ?? 0}]</td>
        <td style="padding:2px 8px;text-align:center">${sa0}</td>
        <td style="padding:2px 8px;text-align:center">${sa1}</td>
        <td style="padding:2px 8px">${status}</td>
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
              <th style="padding:3px 8px;text-align:left">injected</th>
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
