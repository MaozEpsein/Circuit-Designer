/**
 * PipelinePanel — read-only UI for pipeline analysis.
 * Shows stages, latency, throughput, and bottleneck in a side panel.
 * Updates on 'pipeline:analyzed' events and debounced scene mutations.
 */
import { bus } from '../../core/EventBus.js';
import { setPipelineViolations, setPipelineCriticalPath, setPipelineHazards } from '../../rendering/CanvasRenderer.js';
import { disassemble } from '../InstructionDecoder.js';
import { cellAt as _cellAt } from '../PipelineScheduler.js';
import * as Telemetry from '../Telemetry.js';

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
      this._body.insertAdjacentHTML('beforeend',
        `<div class="pipe-perf-header">PERFORMANCE</div>
         <div class="pipe-perf-grid">
           <div class="pipe-perf-row"><span class="k">Instructions</span><span class="v">${m.instructionCount}</span></div>
           <div class="pipe-perf-row"><span class="k">Cycles</span><span class="v">${m.actualCycles} (ideal ${m.idealCycles} + ${m.stallBubbles} stall)</span></div>
           <div class="pipe-perf-row"><span class="k">CPI / IPC</span><span class="v">${cpi} / ${ipc}</span></div>
           <div class="pipe-perf-row"><span class="k">Efficiency</span><span class="v">${eff}%</span></div>
           <div class="pipe-perf-row"><span class="k">Throughput</span><span class="v">${_esc(mips)}</span></div>
           ${fwdLine}
         </div>`);
    }

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
        `  <span class="pdl-cell pdc-STALL" title="Bubble from RAW dependency">**</span>`,
        `  <span class="pdl-cell pdc-FLUSH" title="IF slot flushed by taken branch">✗</span>`,
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
            cells.push(`<div class="pdr-cell pdc-FLUSH" title="Flushed by ${prev.name} @ ${pcHex(prev.pc)}">✗</div>`);
            continue;
          }
          const lbl = _cellAt(row, c);
          if (!lbl) { cells.push(`<div class="pdr-cell pdc-empty"></div>`); continue; }
          if (lbl === 'STALL') {
            const by = row.stalledBy.map(s => `${pcHex(s.producerPc)} (${s.bubbles})`).join(', ');
            cells.push(`<div class="pdr-cell pdc-STALL" title="Stall: waiting on ${_esc(by)}">**</div>`);
          } else {
            cells.push(`<div class="pdr-cell pdc-${lbl}">${lbl}</div>`);
          }
        }

        const badges = [
          row.isLoad      ? '<span class="pdr-badge pdr-b-load">LD</span>' : '',
          row.isBranch    ? '<span class="pdr-badge pdr-b-branch">BR</span>' : '',
          row.speculative ? '<span class="pdr-badge pdr-b-spec" title="Conditional branch — flush not modelled">?</span>' : '',
          row.isHalt      ? '<span class="pdr-badge pdr-b-halt">HLT</span>' : '',
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
  }
}
