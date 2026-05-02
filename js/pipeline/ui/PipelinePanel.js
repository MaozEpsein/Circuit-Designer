/**
 * PipelinePanel — read-only UI for pipeline analysis.
 * Shows stages, latency, throughput, and bottleneck in a side panel.
 * Updates on 'pipeline:analyzed' events and debounced scene mutations.
 */
import { bus } from '../../core/EventBus.js';
import { setPipelineViolations, setPipelineCriticalPath, setPipelineHazards } from '../../rendering/CanvasRenderer.js';
import { disassemble } from '../InstructionDecoder.js';
import { cellAt as _cellAt } from '../PipelineScheduler.js';
import { HAZARD_TYPES } from '../HazardDetector.js';
import * as Telemetry from '../Telemetry.js';
import { exportJSON, exportCSV, exportMarkdown, exportPNG, copyJSON } from './PipelineExporter.js';

function _hazardSummary(hazards) {
  const counts = { RAW: 0, WAR: 0, WAW: 0, LOOP: 0 };
  for (const h of hazards) counts[h.type] = (counts[h.type] || 0) + 1;
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${n} ${t}`)
    .join(', ');
}

function _progTypeSummary(hazards) {
  const counts = { RAW: 0, WAR: 0, WAW: 0 };
  let lu = 0;
  for (const h of hazards) {
    counts[h.type] = (counts[h.type] || 0) + 1;
    if (h.loadUse) lu++;
  }
  const parts = Object.entries(counts).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${t}`);
  if (lu) parts.push(`${lu} load-use`);
  return parts.join(', ');
}

/**
 * Built-in preset views — quick-switch profiles for the ANALYSIS panel that
 * hide sections irrelevant to the current task. Stored as a list of section
 * ids to HIDE (rather than show), so a preset doesn't break when new section
 * types are added to the analyzer.
 */
/**
 * Preset views — quick-switch profiles for the ANALYSIS panel that hide
 * sections irrelevant to the current task. Each preset answers a clear
 * question, with full-word labels so first-time users don't have to decode
 * acronyms.
 */
const PRESETS = {
  all: {
    label: 'All',
    title: 'Show every section',
    hide:  [],
  },
  overview: {
    label: 'Overview',
    title: 'What is running and how it looks (default)',
    hide:  ['violations', 'hazards', 'prog', 'cdc', 'lip', 'pred', 'loops', 'forwards'],
  },
  debug: {
    label: 'Debug',
    title: 'Why isn’t it working — hazards, violations, forwarding',
    hide:  ['perf', 'pred', 'diag', 'loops'],
  },
  performance: {
    label: 'Performance',
    title: 'What is slow — CPI / IPC / predictor / forwarding',
    hide:  ['violations', 'hazards', 'prog', 'cdc', 'lip'],
  },
};

function _esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class PipelinePanel {
  constructor(analyzer) {
    this._analyzer = analyzer;
    this._el       = document.getElementById('pipeline-panel');
    this._body     = document.getElementById('pipeline-panel-body');
    this._summary  = document.getElementById('pipeline-panel-summary');
    this._visible  = false;
    this._refreshTimer = null;
    // Session-only preference (Phase 14c): when true, Program-Hazard rows
    // that the analyzer already marked `resolvedByForwarding` are filtered
    // out. Toggled via the Command Palette — intentionally not persisted
    // across sessions to keep the change scope small.
    this._hideResolved = false;
    bus.on('pipeline:toggle-hide-resolved', () => {
      this._hideResolved = !this._hideResolved;
      if (this._visible) this._render(this._analyzer.analyze());
    });

    // Live runtime branch-flush log, fed by the engine via app.js.
    this._liveBranchFlushes = [];
    bus.on('runtime:branch-flushes', (log) => {
      this._liveBranchFlushes = Array.isArray(log) ? log : [];
      if (this._visible) this._render(this._analyzer.analyze());
    });

    // Live CACHE stats (one snapshot per cache instance), same relay.
    this._liveCacheStats = [];
    bus.on('runtime:cache-stats', (snap) => {
      this._liveCacheStats = Array.isArray(snap) ? snap : [];
      if (this._visible) this._render(this._analyzer.analyze());
    });

    document.getElementById('btn-pipeline-toggle')?.addEventListener('click', () => this.toggle());
    document.getElementById('btn-pipeline-close')?.addEventListener('click', () => this.hide());
    this._wireExportMenu();
    this._buildPresetBar();

    const fsBtn = document.getElementById('btn-pipeline-fullscreen');
    fsBtn?.addEventListener('click', () => this._toggleFullscreen());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._el?.classList.contains('pipeline-fullscreen')) {
        this._toggleFullscreen();
      }
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
    bus.on('node:added',         schedule);
    bus.on('node:removed',       schedule);
    bus.on('wire:added',         schedule);
    bus.on('wire:removed',       schedule);
    bus.on('scene:loaded',       schedule);
    bus.on('scene:cleared',      schedule);
    // Property edits (ROM memory edits, PIPE channel changes, label renames)
    // route through the same debounced re-analysis path. The analyzer owns
    // cache invalidation on this event; we just trigger the recompute here.
    bus.on('node:props-changed', schedule);
  }

  show() {
    this._visible = true;
    this._el?.classList.remove('hidden');
    document.getElementById('btn-pipeline-toggle')?.classList.add('active');
    Telemetry.bump({ panelOpens: 1 });
    const r = this._analyzer.analyze({ force: true });
    this._render(r);
  }
  hide() {
    this._visible = false;
    this._el?.classList.add('hidden');
    document.getElementById('btn-pipeline-toggle')?.classList.remove('active');
    setPipelineCriticalPath(null);
    setPipelineHazards(null);
  }
  toggle() { this._visible ? this.hide() : this.show(); }

  _buildPresetBar() {
    if (!this._summary) return;
    if (document.getElementById('pipe-preset-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'pipe-preset-bar';
    bar.className = 'pipe-preset-bar';
    const active = this._loadActivePreset();
    bar.innerHTML =
      '<span class="pipe-preset-label">View:</span>' +
      '<span class="pipe-preset-hint">focus on a task — sections that don’t fit are hidden, not deleted</span>' +
      '<span class="pipe-preset-buttons">' +
      Object.entries(PRESETS).map(([id, p]) =>
        `<button class="pipe-preset-btn${id === active ? ' active' : ''}" data-preset="${id}" title="${p.title}">${p.label}</button>`
      ).join('') +
      '</span>' +
      '<span class="pipe-preset-status" id="pipe-preset-status"></span>';
    bar.addEventListener('click', (e) => {
      const id = e.target?.dataset?.preset;
      if (!id) return;
      this._setActivePreset(id);
      this._applyActivePreset({ animate: true });
      bar.querySelectorAll('.pipe-preset-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.preset === id);
      });
    });
    this._summary.parentNode.insertBefore(bar, this._summary);
  }

  _loadActivePreset() {
    try { return localStorage.getItem('pipe-panel-preset') || 'overview'; }
    catch { return 'overview'; }
  }
  _setActivePreset(id) {
    try { localStorage.setItem('pipe-panel-preset', id); } catch {}
  }
  _applyActivePreset({ animate = false } = {}) {
    if (!this._body) return;
    const id = this._loadActivePreset();
    const preset = PRESETS[id] || PRESETS.all;
    const hide = new Set(preset.hide);
    const sections = this._body.querySelectorAll(':scope > .pipe-section');
    let hiddenCount = 0;
    let totalCount  = sections.length;

    sections.forEach(sec => {
      const shouldHide = hide.has(sec.dataset.section);
      const isHidden   = sec.classList.contains('pipe-section-hidden');
      if (shouldHide) hiddenCount++;

      if (!animate) {
        sec.classList.toggle('pipe-section-hidden', shouldHide);
        sec.classList.remove('pipe-section-fading');
        return;
      }

      // Animated transitions: opacity fades over 200 ms, then display:none
      // takes the section out of the grid (or vice versa on un-hide).
      if (shouldHide && !isHidden) {
        sec.classList.add('pipe-section-fading');
        setTimeout(() => {
          if (sec.classList.contains('pipe-section-fading')) {
            sec.classList.add('pipe-section-hidden');
          }
        }, 200);
      } else if (!shouldHide && isHidden) {
        sec.classList.remove('pipe-section-hidden');
        sec.classList.add('pipe-section-fading');
        requestAnimationFrame(() =>
          requestAnimationFrame(() => sec.classList.remove('pipe-section-fading')));
      }
    });

    // Update the "X of Y hidden" status indicator.
    const status = document.getElementById('pipe-preset-status');
    if (status) {
      status.textContent = hiddenCount === 0
        ? `all ${totalCount} sections shown`
        : `${hiddenCount} of ${totalCount} hidden`;
    }
  }

  _toggleFullscreen() {
    if (!this._el) return;
    const on = this._el.classList.toggle('pipeline-fullscreen');
    const btn = document.getElementById('btn-pipeline-fullscreen');
    if (btn) btn.textContent = on ? 'EXIT FS' : 'FULLSCREEN';
    if (on) {
      this._fsSaved = {
        width:    this._el.style.width,
        height:   this._el.style.height,
        fontSize: this._el.style.fontSize,
      };
      this._el.style.width    = '';
      this._el.style.height   = '';
      this._el.style.fontSize = '';
      // Move the summary INTO the body so it can become a grid item that
      // sits side-by-side with the stages-area on the top row.
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
      // Restore summary as a sibling of the body (its original position).
      if (this._summary && this._body && this._summary.parentNode === this._body) {
        this._el.insertBefore(this._summary, this._body);
      }
    }
  }

  _wireExportMenu() {
    const btn  = document.getElementById('btn-pipeline-export');
    const menu = document.getElementById('pipe-export-menu');
    if (!btn || !menu) return;

    const closeMenu = () => menu.classList.add('hidden');
    const openMenu  = () => menu.classList.remove('hidden');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.contains('hidden') ? openMenu() : closeMenu();
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && e.target !== btn) closeMenu();
    });

    menu.addEventListener('click', async (e) => {
      const action = e.target?.dataset?.export;
      if (!action) return;
      const r = this._analyzer.analyze();
      if (!r || r.cycles === 0) { closeMenu(); return; }
      // Close the menu BEFORE rendering so PNG captures don't include it.
      closeMenu();
      try {
        if      (action === 'json') exportJSON(r);
        else if (action === 'csv')  exportCSV(r);
        else if (action === 'md')   exportMarkdown(r);
        else if (action === 'png') {
          // Always export the fullscreen layout — it has the wide grid that
          // looks good in a presentation. Toggle FS on if needed, render,
          // then restore. The user sees a brief flash, which is acceptable.
          const wasFs = this._el.classList.contains('pipeline-fullscreen');
          if (!wasFs) this._toggleFullscreen();
          try { await exportPNG(this._el, `pipeline-panel-${Date.now()}.png`); }
          finally { if (!wasFs) this._toggleFullscreen(); }
        }
        else if (action === 'copyjson') {
          const ok = await copyJSON(r);
          btn.textContent = ok ? 'COPIED ✓' : 'COPY FAILED';
          setTimeout(() => { btn.textContent = 'EXPORT'; }, 1200);
        }
      } catch (err) {
        console.error('[PipelineExport]', err);
      }
    });
  }

  _renderPredictorCompare() {
    const host = document.getElementById('pipe-predictor-compare-table');
    if (!host) return;
    const results = this._analyzer.comparePredictors();
    if (!results || results.length === 0) {
      host.innerHTML = '<div class="pred-empty">No program to compare.</div>';
      return;
    }
    const baseline = results.find(r => r.id === 'static-nt') ?? results[results.length - 1];
    const fmtPct = (x) => (x * 100).toFixed(1) + '%';
    const rows = results.map((r, i) => {
      const delta = r.cycles - baseline.cycles;
      const deltaTxt = delta === 0
        ? '<span class="pred-cmp-base">baseline</span>'
        : (delta < 0
            ? `<span class="pred-cmp-good">−${-delta} cycles</span>`
            : `<span class="pred-cmp-bad">+${delta} cycles</span>`);
      const winnerCls = i === 0 ? ' pred-cmp-winner' : '';
      return `<div class="pred-cmp-row${winnerCls}">
        <span class="pred-cmp-name">${i === 0 ? '🏆 ' : ''}${_esc(r.name)}</span>
        <span class="pred-cmp-rate">${fmtPct(r.hitRate)}</span>
        <span class="pred-cmp-mp">${r.misses}/${r.branches}</span>
        <span class="pred-cmp-cyc">${r.cycles}</span>
        <span class="pred-cmp-cpi">${r.cpi.toFixed(2)}</span>
        <span class="pred-cmp-delta">${deltaTxt}</span>
      </div>`;
    }).join('');
    host.innerHTML = `
      <div class="pred-cmp-header">PREDICTOR COMPARISON · sorted by cycles</div>
      <div class="pred-cmp-row pred-cmp-row-head">
        <span class="pred-cmp-name">Predictor</span>
        <span class="pred-cmp-rate">Hit rate</span>
        <span class="pred-cmp-mp">Mispred</span>
        <span class="pred-cmp-cyc">Cycles</span>
        <span class="pred-cmp-cpi">CPI</span>
        <span class="pred-cmp-delta">Δ vs Static-NT</span>
      </div>
      ${rows}`;
  }

  // Renders one row in the Performance grid summarising taken branches
  // observed at simulation runtime. Counts rising-edges of CU.JMP and
  // shows up to 6 of the most recent PCs where they fired. Empty string
  // if no flushes have been logged yet (keeps the grid tidy).
  _renderLiveBranchFlushes() {
    const log = this._liveBranchFlushes || [];
    if (log.length === 0) {
      return `<div class="pipe-perf-row"><span class="k">Count</span><span class="v">0 — updates only while AUTO CLK runs</span></div>`;
    }
    const max = 6;
    const recent = log.slice(-max);
    const pcs = recent.map(e => `PC=${e.pc}`).join(', ');
    const more = log.length > max ? ` (+${log.length - max} earlier)` : '';
    return `<div class="pipe-perf-row"><span class="k">Count</span><span class="v">${log.length} — at ${pcs}${more}</span></div>`;
  }

  // One row per cache instance in the scene. Each row shows total
  // hits / misses / hit-rate and the tail of the access pattern as a
  // sequence of H@addr / M@addr tokens so the learner can correlate
  // the LEDs on the canvas with the panel.
  _renderLiveCacheStats() {
    const snaps = this._liveCacheStats || [];
    if (snaps.length === 0) {
      return `<div class="pipe-perf-row"><span class="k">Caches</span><span class="v">none in scene — drop a CACHE component to enable</span></div>`;
    }
    return snaps.map(s => {
      const total = s.hits + s.misses;
      const rate  = total > 0 ? Math.round(100 * s.hits / total) : 0;
      const recent = (s.recent || []).slice(-8)
        .map(a => `${a.hit ? 'H' : 'M'}@${a.addr}`).join(' ');
      const recentStr = recent || 'idle — updates while AUTO CLK runs';
      // 3C miss breakdown — Hill 1989 classification (compulsory /
      // capacity / conflict). Only render when there are any misses
      // so warm-startup caches don't show "0/0/0".
      const m3 = s.miss3C || { compulsory: 0, capacity: 0, conflict: 0 };
      const m3total = m3.compulsory + m3.capacity + m3.conflict;
      const breakdown = m3total > 0
        ? ` · 3C: ${m3.compulsory} compulsory / ${m3.capacity} capacity / ${m3.conflict} conflict`
        : '';
      return `<div class="pipe-perf-row">
        <span class="k">${s.label || 'CACHE'}</span>
        <span class="v">${s.hits} hits · ${s.misses} misses · ${rate}% hit-rate${breakdown} · ${recentStr}</span>
      </div>`;
    }).join('');
  }

  _render(r) {
    if (!this._body || !this._summary) return;
    // Always push violations + hazards to the renderer (null when no data).
    setPipelineViolations(r?.violations?.length ? r.violations : null);
    setPipelineHazards(r?.hazards?.length ? r.hazards : null);
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
    const hzCount = r.hazards?.length ?? 0;
    const hzLine  = hzCount > 0
      ? `<span class="k">Hazards</span><span class="v warn">⚠ ${hzCount} (${_hazardSummary(r.hazards)})</span>`
      : '';
    const pgCount = r.programHazards?.length ?? 0;
    const pgLine  = pgCount > 0
      ? `<span class="k">Program</span><span class="v warn">⚠ ${pgCount} (${_progTypeSummary(r.programHazards)})</span>`
      : (r.hasProgram ? `<span class="k">Program</span><span class="v">${r.instructions.length} instr · 0 hazards</span>` : '');
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
      ${hzLine}
      ${pgLine}
      ${unknownLine}
    `;

    const stagesHtml = r.stages.map(s => {
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
    this._body.innerHTML = `<div id="pipe-stages-area" class="pipe-stages-area">${stagesHtml}</div>`;
    // In fullscreen the summary lives INSIDE body as a grid item — re-attach
    // it after the innerHTML reset wiped it.
    if (this._el?.classList.contains('pipeline-fullscreen') && this._summary) {
      this._body.insertBefore(this._summary, this._body.firstChild);
    }

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

    // Hazards section (after violations).
    if (r.hazards && r.hazards.length) {
      const labelOf = (id) => {
        const n = this._analyzer._scene.getNode?.(id);
        return n ? (n.label || n.id) : id;
      };
      const typeClass = { RAW: 'hz-raw', WAR: 'hz-war', WAW: 'hz-waw', LOOP: 'hz-loop' };
      const items = r.hazards.map(h => {
        const stages = (h.srcStage != null && h.dstStage != null)
          ? `S${h.srcStage} \u2192 S${h.dstStage}`
          : 'feedback';
        return `
          <div class="pipe-hazard-row" data-wire="${h.wireId}" data-src="${h.srcId}" data-dst="${h.dstId}" title="${_esc(h.suggestion)}">
            <span class="pipe-hz-type ${typeClass[h.type] || ''}">${h.type}</span>
            <span class="pvi-stages">${stages}</span>
            <span class="pvi-names">${_esc(labelOf(h.srcId))} \u2192 ${_esc(labelOf(h.dstId))}</span>
          </div>
          <div class="pipe-hazard-fix">\u2937 ${_esc(h.suggestion)}</div>`;
      }).join('');
      this._body.insertAdjacentHTML('beforeend',
        `<div class="pipe-hazards-header">HAZARDS (${r.hazards.length})</div>${items}`);

      this._body.querySelectorAll('.pipe-hazard-row').forEach(row => {
        row.addEventListener('click', () => {
          bus.emit('pipeline:jump-to-wire', {
            srcId: row.dataset.src, dstId: row.dataset.dst, wireId: row.dataset.wire,
          });
        });
      });
    }

    // Program Hazards section (ISA-level, one row per inter-instruction hazard).
    if (r.programHazards && r.programHazards.length) {
      const pcHex   = (pc) => '0x' + pc.toString(16).toUpperCase().padStart(2, '0');
      const byPc    = new Map((r.instructions || []).map(ins => [ins.pc, ins]));
      const typeCls = { RAW: 'hz-raw', WAR: 'hz-war', WAW: 'hz-waw' };
      const fwdById = new Map((r.forwardingPaths || []).map(p => [p.id, p]));
      const visible = this._hideResolved
        ? r.programHazards.filter(h => !h.resolvedByForwarding)
        : r.programHazards;
      const resolvedCount = r.programHazards.filter(h => h.resolvedByForwarding).length;
      const items = visible.map(h => {
        const loadUseTag = h.loadUse ? '<span class="pipe-hz-type hz-loaduse">LOAD-USE</span>' : '';
        const steadyTag  = h.steadyState ? '<span class="pipe-hz-type hz-steady" title="Cross-iteration dependency inside a loop">STEADY</span>' : '';
        const latTag     = (h.latencyI > 1) ? `<span class="pipe-hz-type hz-multicycle" title="Producer latency ${h.latencyI} cycles">×${h.latencyI}</span>` : '';
        let bubbleTxt;
        if (h.resolvedByForwarding) {
          const fwd = fwdById.get(h.forwardingPathId);
          const lbl = fwd?.fromStage || 'forwarding';
          bubbleTxt = `<span class="pipe-prog-bubbles ok pipe-prog-resolved" title="Resolved by ${_esc(lbl)} forwarding (${_esc(h.forwardingPathId || '')})">✓ ${_esc(lbl)}</span>`;
        } else if (h.type === 'RAW') {
          bubbleTxt = h.bubbles > 0
            ? `<span class="pipe-prog-bubbles">${h.bubbles} bubble${h.bubbles===1?'':'s'}</span>`
            : '<span class="pipe-prog-bubbles ok">0 bubbles</span>';
        } else {
          bubbleTxt = '<span class="pipe-prog-bubbles info">in-order: ok</span>';
        }
        const srcTxt = _esc(disassemble(byPc.get(h.instI)) || h.nameI);
        const dstTxt = _esc(disassemble(byPc.get(h.instJ)) || h.nameJ);
        const rowCls = h.resolvedByForwarding ? 'pipe-prog-row resolved' : 'pipe-prog-row';
        return `
          <div class="${rowCls}">
            <span class="pipe-hz-type ${typeCls[h.type] || ''}">${h.type}</span>${loadUseTag}${steadyTag}${latTag}
            <span class="pipe-prog-names">
              <span class="pipe-prog-pc">${pcHex(h.instI)}</span> ${srcTxt}
              <span class="pipe-prog-arrow">\u2192</span>
              <span class="pipe-prog-pc">${pcHex(h.instJ)}</span> ${dstTxt}
            </span>
            <span class="pipe-prog-reg">R${h.register}</span>
            ${bubbleTxt}
          </div>`;
      }).join('');
      const hiddenNote = (this._hideResolved && resolvedCount > 0)
        ? ` <span class="pipe-prog-hidden" title="Toggle Hide Resolved Hazards via Command Palette">${resolvedCount} hidden</span>`
        : (resolvedCount > 0
            ? ` <span class="pipe-prog-resolved-note">${resolvedCount} ✓ resolved</span>`
            : '');
      this._body.insertAdjacentHTML('beforeend',
        `<div class="pipe-prog-header">PROGRAM HAZARDS (${r.programHazards.length} \u2014 ${_progTypeSummary(r.programHazards)})${hiddenNote}</div>${items}`);
    } else if (r.hasProgram) {
      this._body.insertAdjacentHTML('beforeend',
        `<div class="pipe-prog-header">PROGRAM HAZARDS (0)</div><div class="pipe-prog-clean">No inter-instruction hazards detected over ${r.instructions.length} instruction${r.instructions.length===1?'':'s'}.</div>`);
    }

    // Performance metrics — aggregate CPI/IPC/throughput.
    if (r.metrics) {
      const m = r.metrics;
      const cpi = m.cpi.toFixed(2);
      const ipc = m.ipc.toFixed(2);
      const eff = (m.efficiency * 100).toFixed(0);
      const mips = (m.throughputMIPS != null)
        ? (m.throughputMIPS >= 1000 ? (m.throughputMIPS/1000).toFixed(2) + ' GIPS' : m.throughputMIPS.toFixed(0) + ' MIPS')
        : '—';
      const fwdLine = (m.bubblesRemovedByForwarding > 0)
        ? `<div class="pipe-perf-row"><span class="k">Forwarding</span><span class="v">−${m.bubblesRemovedByForwarding} bubble${m.bubblesRemovedByForwarding===1?'':'s'} · ${m.speedupFromForwarding.toFixed(2)}× speedup</span></div>`
        : '';
      // Phase 15 Phase 3 — predictor-derived counters. Counted off the
      // schedule rows (each back-edge / JMP row carries `mispredict`),
      // not the predictor's getEntries (those collapse iterations per PC).
      let predLine = '';
      if (r.schedule && r.predictor) {
        let branches = 0, mispred = 0;
        for (const row of r.schedule.rows) {
          if (row.predicted === null) continue;     // not a predicted branch
          branches++;
          if (row.mispredict) mispred++;
        }
        if (branches > 0) {
          const hitPct = (((branches - mispred) / branches) * 100).toFixed(1);
          const flushPenalty = mispred * 2;
          predLine =
            `<div class="pipe-perf-row"><span class="k">Predictor</span><span class="v">${_esc(r.predictor.name)}</span></div>
             <div class="pipe-perf-row"><span class="k">Branches</span><span class="v">${branches} · ${mispred} mispredict${mispred===1?'':'s'} · ${hitPct}% hit rate</span></div>
             <div class="pipe-perf-row"><span class="k">Flush penalty</span><span class="v">${flushPenalty} cycle${flushPenalty===1?'':'s'}</span></div>`;
        }
      }
      this._body.insertAdjacentHTML('beforeend',
        `<div class="pipe-perf-header">PERFORMANCE</div>
         <div class="pipe-perf-grid">
           <div class="pipe-perf-row"><span class="k">Instructions</span><span class="v">${m.instructionCount}</span></div>
           <div class="pipe-perf-row"><span class="k">Cycles</span><span class="v">${m.actualCycles} (ideal ${m.idealCycles} + ${m.stallBubbles} stall)</span></div>
           <div class="pipe-perf-row"><span class="k">CPI / IPC</span><span class="v">${cpi} / ${ipc}</span></div>
           <div class="pipe-perf-row"><span class="k">Efficiency</span><span class="v">${eff}%</span></div>
           <div class="pipe-perf-row"><span class="k">Throughput</span><span class="v">${_esc(mips)}</span></div>
           ${fwdLine}
           ${predLine}
         </div>`);
    }
    // Live runtime telemetry — own section ("runtime"), not part of
    // PERFORMANCE so presets that hide static-analysis sections still
    // show this. Always renders so the user can find it before the
    // first branch fires.
    this._body.insertAdjacentHTML('beforeend',
      `<div class="pipe-runtime-header">BRANCH FLUSHES (LIVE)</div>
       <div class="pipe-perf-grid">
         ${this._renderLiveBranchFlushes()}
       </div>`);

    // Live CACHE telemetry — one row per cache instance, always
    // rendered so the section appears even before the first access
    // (with an explanatory placeholder).
    this._body.insertAdjacentHTML('beforeend',
      `<div class="pipe-runtime-header">CACHE (LIVE)</div>
       <div class="pipe-perf-grid">
         ${this._renderLiveCacheStats()}
       </div>`);

    // Pipeline Diagram (Gantt: instruction × cycle) — renders the static
    // schedule from PipelineScheduler. Cells are colour-coded per stage;
    // stalls appear as "**" cells between ID and EX, branch flushes as "✗"
    // cells in the two IF slots following a taken JMP. Absence of stalls
    // where a RAW hazard existed indicates forwarding already absorbed it.
    if (r.schedule && r.schedule.rows.length) {
      const sc = r.schedule;
      const rows = sc.rows;
      const cycles = sc.totalCycles;
      const pcHex = (pc) => '0x' + pc.toString(16).toUpperCase().padStart(2, '0');

      const header = [
        `<div class="pipe-diag-header">PIPELINE DIAGRAM (${rows.length} instr · ${cycles} cycles${sc.truncated ? ' · truncated' : ''})</div>`,
        `<div class="pipe-diag-legend">`,
        `  <span class="pdl-cell pdc-IF">IF</span>`,
        `  <span class="pdl-cell pdc-ID">ID</span>`,
        `  <span class="pdl-cell pdc-EX">EX</span>`,
        `  <span class="pdl-cell pdc-MEM">MEM</span>`,
        `  <span class="pdl-cell pdc-WB">WB</span>`,
        `  <span class="pdl-cell pdc-STALL pdc-haz-raw"     title="${HAZARD_TYPES.RAW.desc}">RAW</span>`,
        `  <span class="pdl-cell pdc-STALL pdc-haz-loaduse" title="${HAZARD_TYPES.LOAD_USE.desc}">LDU</span>`,
        `  <span class="pdl-cell pdc-FLUSH pdc-haz-control" title="${HAZARD_TYPES.CONTROL.desc}">CTL</span>`,
        `  <span class="pdl-cell pdc-IF pdc-speculative"    title="Speculative IF/ID — fetched on a correct branch prediction (work that paid off)">SPEC</span>`,
        `</div>`,
      ].join('');

      // Column header — cycle numbers.
      const cycHeader = ['<div class="pipe-diag-row pipe-diag-cyc-header"><div class="pdr-label"></div>'];
      for (let c = 0; c < cycles; c++) cycHeader.push(`<div class="pdr-cyc">${c}</div>`);
      cycHeader.push('</div>');

      // Body — one row per instruction.
      const body = rows.map((row, i) => {
        const prev = rows[i - 1];
        const flushStart = prev ? prev.ifCycle + 1 + prev.stallBefore : -1;
        const flushEnd   = prev ? flushStart + prev.flushAfter : -1;

        const cells = [];
        for (let c = 0; c < cycles; c++) {
          if (prev && c >= flushStart && c < flushEnd) {
            const ctlInfo = HAZARD_TYPES.CONTROL;
            const isMispred = (prev.flushReason === 'mispredict');
            const flushClass = isMispred ? 'pdc-haz-mispred' : ctlInfo.cssClass;
            const reasonLine = isMispred
              ? `Mispredict — predicted ${prev.predicted ? 'T' : 'NT'}, actual ${prev.actualTaken ? 'T' : 'NT'}`
              : `${ctlInfo.label}: ${ctlInfo.desc}`;
            const ctlTip = `${reasonLine}\nFlushed by ${prev.name} @ ${pcHex(prev.pc)}${prev.iterIdx ? ` #${prev.iterIdx}/${prev.iterTotal}` : ''}`;
            cells.push(`<div class="pdr-cell pdc-FLUSH ${flushClass}" title="${_esc(ctlTip)}">✗</div>`);
            continue;
          }
          const lbl = _cellAt(row, c);
          if (!lbl) { cells.push(`<div class="pdr-cell pdc-empty"></div>`); continue; }
          if (lbl === 'STALL') {
            const first = row.stalledBy && row.stalledBy[0];
            const hazInfo = first && HAZARD_TYPES[first.type];
            const hazClass = hazInfo ? hazInfo.cssClass : '';
            const by = row.stalledBy.map(s => `${pcHex(s.producerPc)}${s.producerName ? ' ' + s.producerName : ''} (${s.bubbles})`).join(', ');
            const reg = first && Number.isFinite(first.register) ? ` (R${first.register})` : '';
            const tip = hazInfo
              ? `${hazInfo.label}: ${hazInfo.desc}\nProducer: ${by}${reg}`
              : `Stall: waiting on ${by}`;
            cells.push(`<div class="pdr-cell pdc-STALL ${hazClass}" title="${_esc(tip)}">**</div>`);
          } else {
            // Speculative shading: when the previous row is a correctly-
            // predicted branch, this row's IF and ID cells were fetched
            // before EX confirmed the prediction — mark them with a hatch
            // overlay so the user can see speculation that paid off.
            const isSpec = prev
              && prev.predicted !== null
              && !prev.mispredict
              && (lbl === 'IF' || lbl === 'ID');
            if (isSpec) {
              const dirLbl = prev.predicted ? 'taken' : 'not-taken';
              const tip = `Speculative ${lbl} — fetched on correct ${dirLbl} prediction at ${pcHex(prev.pc)}${prev.iterIdx ? ` #${prev.iterIdx}/${prev.iterTotal}` : ''}`;
              cells.push(`<div class="pdr-cell pdc-${lbl} pdc-speculative" title="${_esc(tip)}">${lbl}</div>`);
            } else {
              cells.push(`<div class="pdr-cell pdc-${lbl}">${lbl}</div>`);
            }
          }
        }

        const iterBadge = row.iterIdx
          ? `<span class="pdr-badge pdr-b-iter" title="Iteration ${row.iterIdx} of ${row.iterTotal}">#${row.iterIdx}/${row.iterTotal}</span>`
          : '';
        const predBadge = row.isBackEdge && row.predicted !== null
          ? `<span class="pdr-badge pdr-b-pred${row.mispredict ? ' pdr-b-pred-miss' : ''}" title="Predictor: ${row.mispredict ? 'MISS' : 'HIT'} — predicted ${row.predicted ? 'T' : 'NT'}, actual ${row.actualTaken ? 'T' : 'NT'}">${row.mispredict ? '✗' : '✓'}</span>`
          : '';
        const badges = [
          row.isLoad      ? '<span class="pdr-badge pdr-b-load">LD</span>' : '',
          row.isBranch    ? '<span class="pdr-badge pdr-b-branch">BR</span>' : '',
          row.speculative ? '<span class="pdr-badge pdr-b-spec" title="Conditional branch — flush not modelled">?</span>' : '',
          row.isHalt      ? '<span class="pdr-badge pdr-b-halt">HLT</span>' : '',
          iterBadge,
          predBadge,
        ].join('');
        const labelTitle = `${pcHex(row.pc)} · ${_esc(row.disasm)}`;
        return `<div class="pipe-diag-row" title="${labelTitle}">
          <div class="pdr-label"><span class="pdr-pc">${pcHex(row.pc)}</span> <span class="pdr-name">${_esc(row.disasm)}</span>${badges}</div>
          ${cells.join('')}
        </div>`;
      }).join('');

      this._body.insertAdjacentHTML('beforeend',
        `${header}<div class="pipe-diag-grid" style="--pdg-cols:${cycles}">${cycHeader.join('')}${body}</div>`);
    }

    // Loops section (Phase 14 — induction-variable loop analysis).
    if (r.loops && r.loops.length) {
      const pcHex = (pc) => '0x' + pc.toString(16).toUpperCase().padStart(2, '0');
      const items = r.loops.map(L => {
        const iv = L.inductionRegs.length
          ? L.inductionRegs.map(r => `R${r}`).join(', ')
          : '<span class="pipe-loop-noiv">no induction var</span>';
        return `<div class="pipe-loop-row">
          <span class="pipe-loop-range">${pcHex(L.startPc)} → ${pcHex(L.endPc)}</span>
          <span class="pipe-loop-body">${L.bodyPcs.length} instr</span>
          <span class="pipe-loop-iv">IV: ${iv}</span>
        </div>`;
      }).join('');
      this._body.insertAdjacentHTML('beforeend',
        `<div class="pipe-loops-header">LOOPS (${r.loops.length})</div>${items}`);
    }

    // Forwarding Paths section (Phase 14c) — one row per detected bypass.
    if (r.forwardingPaths && r.forwardingPaths.length) {
      const labelOf = (id) => {
        const n = this._analyzer._scene.getNode?.(id);
        return n ? (n.label || n.id) : id;
      };
      const items = r.forwardingPaths.map(p => `
        <div class="pipe-forward-row" data-mux="${_esc(p.muxId)}">
          <span class="pipe-forward-path">${_esc(p.fromStage || 'FWD')}</span>
          <span class="pipe-forward-reg">${_esc(p.register)}</span>
          <span class="pipe-forward-names">${_esc(labelOf(p.srcNodeId))} → ${_esc(labelOf(p.muxId))} → ${_esc(labelOf(p.aluNodeId))}</span>
        </div>`).join('');
      this._body.insertAdjacentHTML('beforeend',
        `<div class="pipe-forwards-header">FORWARDING PATHS (${r.forwardingPaths.length})</div>${items}`);

      // Coverage summary (Tier 14d-lite): which of the canonical EX-targeted
      // bypass paths are present. Informational — detector labels are coarse.
      const present = new Set(r.forwardingPaths.map(p => p.fromStage).filter(Boolean));
      const canonical = ['EX→EX', 'MEM→EX', 'WB→EX'];
      const covLine = canonical.map(lbl =>
        present.has(lbl)
          ? `<span class="pipe-cov-ok">${_esc(lbl)} ✓</span>`
          : `<span class="pipe-cov-miss">${_esc(lbl)} ✗</span>`
      ).join(' · ');
      this._body.insertAdjacentHTML('beforeend',
        `<div class="pipe-cov-row">COVERAGE: ${covLine}</div>`);
    }

    // Branch Predictor section (Phase 15 — read-only state visualizer).
    // Renders a dropdown to switch predictors and a per-PC state table fed
    // by the synthesized outcome trace from the analyzer.
    if (r.predictor) {
      const p = r.predictor;
      const pcHex = (pc) => '0x' + pc.toString(16).toUpperCase().padStart(2, '0');
      const opts = p.available.map(opt =>
        `<option value="${opt.id}"${opt.id === p.id ? ' selected' : ''}>${_esc(opt.name)}</option>`
      ).join('');
      const rows = p.entries.length
        ? p.entries.map(e => {
            const predTxt   = e.lastPred   === null ? '—' : (e.lastPred   ? 'T' : 'NT');
            const actualTxt = e.lastActual === null ? '—' : (e.lastActual ? 'T' : 'NT');
            const hitTxt    = e.hit === null ? '—' : (e.hit ? '<span class="pred-ok">✓</span>' : '<span class="pred-miss">✗</span>');
            const rate      = e.total > 0 ? `${e.hits}/${e.total}` : '0/0';
            return `<div class="pred-row">
              <span class="pred-pc">${pcHex(e.pc)}</span>
              <span class="pred-state">${_esc(e.stateLabel)}</span>
              <span class="pred-pred">${predTxt}</span>
              <span class="pred-actual">${actualTxt}</span>
              <span class="pred-hit">${hitTxt}</span>
              <span class="pred-rate">${rate}</span>
            </div>`;
          }).join('')
        : '<div class="pred-empty">No branches in program.</div>';
      const hitPct = p.totalBranches > 0 ? (p.hitRate * 100).toFixed(1) + '%' : '—';
      this._body.insertAdjacentHTML('beforeend',
        `<div class="pipe-pred-header">BRANCH PREDICTOR<button id="pipe-predictor-save" class="pred-save-btn hidden" title="Save predictor change to the CU">SAVE</button></div>
         <div class="pred-controls">
           <label class="pred-label">Predictor:</label>
           <select id="pipe-predictor-select" class="pred-select">${opts}</select>
           <span class="pred-summary">Hit rate: <b>${hitPct}</b> · ${p.totalHits}/${p.totalBranches}</span>
           <button id="pipe-predictor-compare" class="pred-btn">COMPARE</button>
         </div>
         <div class="pred-table">
           <div class="pred-row pred-row-head">
             <span class="pred-pc">PC</span>
             <span class="pred-state">State</span>
             <span class="pred-pred">Pred</span>
             <span class="pred-actual">Actual</span>
             <span class="pred-hit">✓/✗</span>
             <span class="pred-rate">Hits</span>
           </div>
           ${rows}
         </div>
         <div id="pipe-predictor-compare-table"></div>`);
      // Predictor change is now staged — only commits when the user clicks
      // the SAVE button next to the section title. Lets users explore "what-if"
      // (the panel re-runs analysis previewing the chosen predictor) without
      // mutating the CU until they confirm.
      const sel     = document.getElementById('pipe-predictor-select');
      const saveBtn = document.getElementById('pipe-predictor-save');
      const currentId = p.id;
      const cuNode = this._analyzer._scene.nodes?.find(n => n.type === 'CU');
      const cuPredictorId = cuNode?.branchPredictor || 'static-nt';
      sel?.addEventListener('change', (e) => {
        const dirty = e.target.value !== cuPredictorId;
        saveBtn?.classList.toggle('hidden', !dirty);
        // What-if preview: override wins over the CU until SAVE / revert.
        if (dirty) this._analyzer.setPredictorOverride(e.target.value);
        else       this._analyzer.clearPredictorOverride();
      });
      saveBtn?.addEventListener('click', () => {
        if (!cuNode) return;
        const newValue = sel.value;
        // Commit to the CU, then drop the preview override so the analyzer
        // reads the now-persisted CU value going forward.
        bus.emit('pipeline:set-cu-prop', {
          nodeId: cuNode.id,
          props:  { branchPredictor: newValue },
        });
        this._analyzer.clearPredictorOverride();
        saveBtn.classList.add('hidden');
      });
      const cmpBtn = document.getElementById('pipe-predictor-compare');
      cmpBtn?.addEventListener('click', () => this._renderPredictorCompare());
    }

    // CDC section (Phase 13 stretch) — only when the scene has ≥2 clocks.
    if (r.cdc && r.cdc.multiDomain) {
      const labelOf = (id) => {
        const n = this._analyzer._scene.getNode?.(id);
        return n ? (n.label || n.id) : id;
      };
      const clkCount = r.cdc.clocks.length;
      const crossings = r.cdc.crossings || [];
      if (crossings.length) {
        const items = crossings.map(c => {
          const ok = c.syncDepth >= 2;
          const badge = ok
            ? `<span class="pipe-cdc-ok" title="${c.syncDepth} synchronizing flops on destination clock">sync ${c.syncDepth}✓</span>`
            : `<span class="pipe-cdc-miss" title="Needs a 2-flop synchronizer on the destination clock">sync ${c.syncDepth}⚠</span>`;
          return `<div class="pipe-cdc-row">
            <span class="pipe-cdc-clocks">${_esc(labelOf(c.srcClock))} → ${_esc(labelOf(c.dstClock))}</span>
            <span class="pipe-cdc-names">${_esc(labelOf(c.srcId))} → ${_esc(labelOf(c.dstId))}</span>
            ${badge}
          </div>`;
        }).join('');
        this._body.insertAdjacentHTML('beforeend',
          `<div class="pipe-cdc-header">CDC CROSSINGS (${crossings.length}) · ${clkCount} clock domains</div>${items}`);
      } else {
        this._body.insertAdjacentHTML('beforeend',
          `<div class="pipe-cdc-header">CDC CROSSINGS (0) · ${clkCount} clock domains</div>`);
      }
    }

    // LIP section — structural check on HANDSHAKE wiring (Phase 13 stretch).
    if (r.lip && r.lip.handshakeCount > 0) {
      const labelOf = (id) => {
        const n = this._analyzer._scene.getNode?.(id);
        return n ? (n.label || n.id) : id;
      };
      if (r.lip.violations.length) {
        const items = r.lip.violations.map(v => {
          const sevCls = v.severity === 'error' ? 'pipe-lip-err' : 'pipe-lip-warn';
          return `<div class="pipe-lip-row">
            <span class="pipe-lip-rule ${sevCls}">${_esc(v.rule)}</span>
            <span class="pipe-lip-hs">${_esc(labelOf(v.hsId))}</span>
            <span class="pipe-lip-msg">${_esc(v.message)}</span>
          </div>`;
        }).join('');
        this._body.insertAdjacentHTML('beforeend',
          `<div class="pipe-lip-header">LIP VIOLATIONS (${r.lip.violations.length}) · ${r.lip.handshakeCount} HANDSHAKE${r.lip.handshakeCount===1?'':'s'}</div>${items}`);
      } else {
        this._body.insertAdjacentHTML('beforeend',
          `<div class="pipe-lip-header">LIP ✓ (${r.lip.handshakeCount} HANDSHAKE${r.lip.handshakeCount===1?'':'s'} · all clean)</div>`);
      }
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

    // Collapsible sections — wrap each "*-header" + its trailing siblings in
    // a .pipe-section block, hook a click toggle, and restore persisted state
    // from localStorage. Done as a post-render walk so individual section
    // renderers above don't have to know about it.
    this._applyCollapsibleSections();
  }

  _applyCollapsibleSections() {
    if (!this._body) return;
    const collapsed = this._loadCollapsedState();
    const HEADER_RE = /(?:^|\s)pipe-(\w+)-header(?:\s|$)/;
    const children = Array.from(this._body.children);

    // Group: each header starts a new section; following non-header siblings
    // belong to that section's body until the next header.
    const groups = [];
    let cur = null;
    for (const el of children) {
      if (el.classList.contains('pipe-section')) continue;   // already wrapped (defensive)
      const cls = el.className || '';
      const m = cls.match(HEADER_RE);
      if (m) {
        cur = { id: m[1], header: el, body: [] };
        groups.push(cur);
      } else if (cur) {
        cur.body.push(el);
      }
    }

    for (const g of groups) {
      const section = document.createElement('div');
      section.className = 'pipe-section';
      section.dataset.section = g.id;
      const isCollapsed = !!collapsed[g.id];
      if (isCollapsed) section.classList.add('pipe-section-collapsed');

      // Insert section wrapper before the header, then move header + body in.
      g.header.parentNode.insertBefore(section, g.header);
      const toggle = document.createElement('span');
      toggle.className = 'pipe-section-toggle';
      toggle.textContent = '▾';
      g.header.classList.add('pipe-section-header');
      g.header.insertBefore(toggle, g.header.firstChild);
      // Drag handle — visible only in fullscreen via CSS. Clicking elsewhere
      // on the section will NOT start a drag.
      const handle = document.createElement('span');
      handle.className = 'pipe-section-drag-handle';
      handle.title = 'Drag to reorder';
      handle.textContent = '⋮⋮';
      g.header.insertBefore(handle, g.header.firstChild);
      section.appendChild(g.header);

      const bodyWrap = document.createElement('div');
      bodyWrap.className = 'pipe-section-body';
      for (const node of g.body) bodyWrap.appendChild(node);
      section.appendChild(bodyWrap);

      g.header.addEventListener('click', () => {
        section.classList.toggle('pipe-section-collapsed');
        const state = this._loadCollapsedState();
        state[g.id] = section.classList.contains('pipe-section-collapsed');
        try { localStorage.setItem('pipe-panel-collapsed', JSON.stringify(state)); } catch {}
      });
    }

    this._applySectionOrderAndDrag();
    this._applyActivePreset();
  }

  _loadSectionOrder() {
    try {
      const raw = localStorage.getItem('pipe-panel-order');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  _saveSectionOrder(order) {
    try { localStorage.setItem('pipe-panel-order', JSON.stringify(order)); } catch {}
  }

  /**
   * Reorders the .pipe-section children of #pipeline-panel-body to match the
   * saved order, then wires HTML5 drag-and-drop so the user can rearrange
   * sections by dragging their headers. Drag is enabled only in fullscreen
   * mode — in the narrow side-panel it would just be noise.
   */
  _applySectionOrderAndDrag() {
    if (!this._body) return;
    const sections = Array.from(this._body.querySelectorAll(':scope > .pipe-section'));
    if (sections.length === 0) return;

    // 1. Apply saved order: pull sections that exist in saved order to the
    //    front (in saved order), leave new/unknown sections at the back.
    const saved = this._loadSectionOrder();
    const byId  = new Map(sections.map(s => [s.dataset.section, s]));
    for (const id of saved) {
      const s = byId.get(id);
      if (s) this._body.appendChild(s);
    }
    for (const s of sections) {
      if (!saved.includes(s.dataset.section)) this._body.appendChild(s);
    }

    // 2. Wire drag handlers on each section. The section is draggable ONLY
    //    when the user grabs the dedicated drag handle (⋮⋮) in the header —
    //    this prevents accidental drags from text selection / button clicks.
    for (const sec of sections) {
      sec.draggable = false;
      const handle = sec.querySelector('.pipe-section-drag-handle');
      if (handle) {
        handle.addEventListener('mousedown', () => { sec.draggable = true; });
        // Stop the header's toggle-collapse click when interacting with the handle.
        handle.addEventListener('click', (e) => e.stopPropagation());
      }

      sec.addEventListener('dragstart', (e) => {
        // Only reorder in fullscreen — outside FS the side-panel is too narrow
        // to make horizontal/vertical reordering meaningful.
        if (!this._el?.classList.contains('pipeline-fullscreen')) {
          e.preventDefault();
          return;
        }
        sec.classList.add('pipe-section-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', sec.dataset.section);
      });
      sec.addEventListener('dragend', () => {
        sec.classList.remove('pipe-section-dragging');
        sec.draggable = false;   // re-arm: must re-grab the handle to drag again
        const newOrder = Array.from(this._body.querySelectorAll(':scope > .pipe-section'))
          .map(s => s.dataset.section);
        this._saveSectionOrder(newOrder);
      });
      // Live reorder — as the cursor moves over a section, immediately swap
      // it into place. Feels much more responsive than the standard
      // "wait for drop" model. We compare against current DOM position to
      // avoid useless work that would cause flicker on every dragover tick.
      sec.addEventListener('dragover', (e) => {
        const dragging = this._body.querySelector('.pipe-section-dragging');
        if (!dragging || dragging === sec) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const r = sec.getBoundingClientRect();
        // Use both axes so reorder works in multi-column grid: midpoint of the
        // longer dimension drives "before vs after".
        const horizontal = (r.width > r.height * 1.2);
        const before = horizontal
          ? (e.clientX - r.left) < r.width  / 2
          : (e.clientY - r.top)  < r.height / 2;

        const target = before ? sec : sec.nextSibling;
        if (dragging !== target && dragging.nextSibling !== target) {
          this._body.insertBefore(dragging, target);
        }
      });
      sec.addEventListener('drop', (e) => {
        e.preventDefault();
        // Position is already correct (set during dragover) — just persist it.
        const newOrder = Array.from(this._body.querySelectorAll(':scope > .pipe-section'))
          .map(s => s.dataset.section);
        this._saveSectionOrder(newOrder);
      });
    }
  }

  _loadCollapsedState() {
    try {
      const raw = localStorage.getItem('pipe-panel-collapsed');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
}
