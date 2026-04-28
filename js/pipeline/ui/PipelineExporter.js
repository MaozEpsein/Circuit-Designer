/**
 * PipelineExporter — serializes an analyzer result `r` (from analyze()) into
 * shareable formats: JSON snapshot, CSV metrics, Markdown report.
 * Pure functions plus a download() helper that triggers a browser save.
 */
import { disassemble } from '../InstructionDecoder.js';

const SCHEMA_VERSION = 1;

function _ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function _hazardCounts(list) {
  const counts = { RAW: 0, WAR: 0, WAW: 0, LOOP: 0, loadUse: 0, resolved: 0 };
  for (const h of list || []) {
    counts[h.type] = (counts[h.type] || 0) + 1;
    if (h.loadUse) counts.loadUse++;
    if (h.resolvedByForwarding) counts.resolved++;
  }
  return counts;
}

export function buildSnapshot(r) {
  if (!r) return null;
  const m = r.metrics || null;
  const sched = r.schedule || null;
  const pred = r.predictor || null;

  let predBranches = 0, predMispred = 0;
  if (sched && pred) {
    for (const row of sched.rows) {
      if (row.predicted === null) continue;
      predBranches++;
      if (row.mispredict) predMispred++;
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt:   new Date().toISOString(),
    tool:          'Circuit-Designer / Pipeline Analysis',

    pipeline: {
      cycles:      r.cycles ?? 0,
      bottleneck:  r.bottleneck ?? null,
      maxDelayPs:  r.maxDelayPs ?? null,
      fMaxMHz:     Number.isFinite(r.fMaxMHz) ? r.fMaxMHz : null,
      hasCycle:    !!r.hasCycle,
      stages: (r.stages || []).map(s => ({
        idx:     s.idx,
        delayPs: s.delayPs,
        depth:   s.depth,
        nodes:   s.nodes?.length ?? 0,
        hasStall: !!s.hasStall,
        hasFlush: !!s.hasFlush,
        elastic:  !!s.elastic,
      })),
    },

    structuralHazards: {
      count: r.hazards?.length ?? 0,
      byType: _hazardCounts(r.hazards),
    },

    programHazards: {
      count: r.programHazards?.length ?? 0,
      byType: _hazardCounts(r.programHazards),
      rows: (r.programHazards || []).map(h => ({
        type:                  h.type,
        loadUse:               !!h.loadUse,
        steadyState:           !!h.steadyState,
        register:              h.register,
        producerPc:            h.instI,
        consumerPc:            h.instJ,
        bubbles:               h.bubbles,
        latencyI:              h.latencyI,
        resolvedByForwarding:  !!h.resolvedByForwarding,
        forwardingPathId:      h.forwardingPathId || null,
      })),
    },

    forwarding: {
      count: r.forwardingPaths?.length ?? 0,
      paths: (r.forwardingPaths || []).map(p => ({
        id:        p.id,
        register:  p.register,
        fromStage: p.fromStage || null,
      })),
    },

    metrics: m ? {
      instructionCount:           m.instructionCount,
      idealCycles:                m.idealCycles,
      stallBubbles:               m.stallBubbles,
      actualCycles:               m.actualCycles,
      cpi:                        m.cpi,
      ipc:                        m.ipc,
      efficiency:                 m.efficiency,
      throughputMIPS:             m.throughputMIPS ?? null,
      bubblesRemovedByForwarding: m.bubblesRemovedByForwarding ?? 0,
      speedupFromForwarding:      m.speedupFromForwarding ?? 1,
    } : null,

    predictor: pred ? {
      id:            pred.id,
      name:          pred.name,
      totalBranches: pred.totalBranches,
      totalHits:     pred.totalHits,
      hitRate:       pred.hitRate,
      perPC: (pred.entries || []).map(e => ({
        pc:     e.pc,
        state:  e.stateLabel,
        hits:   e.hits,
        total:  e.total,
      })),
      scheduleDerived: { branches: predBranches, mispredicts: predMispred, flushPenaltyCycles: predMispred * 2 },
    } : null,

    schedule: sched ? {
      totalCycles: sched.totalCycles,
      truncated:   !!sched.truncated,
      rowCount:    sched.rows.length,
      rows: sched.rows.map(row => ({
        pc:           row.pc,
        disasm:       row.disasm,
        ifCycle:      row.ifCycle,
        stallBefore:  row.stallBefore,
        flushAfter:   row.flushAfter,
        isLoad:       !!row.isLoad,
        isBranch:     !!row.isBranch,
        isHalt:       !!row.isHalt,
        iterIdx:      row.iterIdx ?? null,
        iterTotal:    row.iterTotal ?? null,
        predicted:    row.predicted ?? null,
        actualTaken:  row.actualTaken ?? null,
        mispredict:   !!row.mispredict,
      })),
    } : null,

    loops: (r.loops || []).map(L => ({
      startPc: L.startPc,
      endPc:   L.endPc,
      bodyLen: L.bodyPcs?.length ?? 0,
      inductionRegs: L.inductionRegs || [],
    })),

    violations: (r.violations || []).map(v => ({
      srcId: v.srcId, dstId: v.dstId, srcStage: v.srcStage, dstStage: v.dstStage, missing: v.missing,
    })),
  };
}

export function toJSON(r) {
  return JSON.stringify(buildSnapshot(r), null, 2);
}

/**
 * CSV: one "metric, value" row per scalar. Easy to paste into a spreadsheet
 * or pivot in pandas. Multi-row tables (per-PC, per-row schedule) are kept
 * out of CSV — they belong in JSON.
 */
export function toCSV(r) {
  const s = buildSnapshot(r);
  if (!s) return '';
  const rows = [['metric', 'value']];
  const push = (k, v) => rows.push([k, v == null ? '' : String(v)]);

  push('generatedAt',          s.generatedAt);
  push('cycles',               s.pipeline.cycles);
  push('bottleneckStage',      s.pipeline.bottleneck);
  push('maxDelayPs',           s.pipeline.maxDelayPs);
  push('fMaxMHz',              s.pipeline.fMaxMHz);
  push('stageCount',           s.pipeline.stages.length);

  push('structuralHazards',    s.structuralHazards.count);
  push('programHazards',       s.programHazards.count);
  push('programHazards.RAW',   s.programHazards.byType.RAW);
  push('programHazards.WAR',   s.programHazards.byType.WAR);
  push('programHazards.WAW',   s.programHazards.byType.WAW);
  push('programHazards.loadUse', s.programHazards.byType.loadUse);
  push('programHazards.resolved', s.programHazards.byType.resolved);
  push('forwardingPaths',      s.forwarding.count);

  if (s.metrics) {
    push('instructionCount',          s.metrics.instructionCount);
    push('idealCycles',               s.metrics.idealCycles);
    push('stallBubbles',              s.metrics.stallBubbles);
    push('actualCycles',              s.metrics.actualCycles);
    push('cpi',                       s.metrics.cpi.toFixed(4));
    push('ipc',                       s.metrics.ipc.toFixed(4));
    push('efficiency',                s.metrics.efficiency.toFixed(4));
    push('throughputMIPS',            s.metrics.throughputMIPS);
    push('bubblesRemovedByForwarding', s.metrics.bubblesRemovedByForwarding);
    push('speedupFromForwarding',     s.metrics.speedupFromForwarding.toFixed(4));
  }

  if (s.predictor) {
    push('predictor.id',          s.predictor.id);
    push('predictor.name',        s.predictor.name);
    push('predictor.branches',    s.predictor.totalBranches);
    push('predictor.hits',        s.predictor.totalHits);
    push('predictor.hitRate',     s.predictor.hitRate.toFixed(4));
    push('predictor.mispredicts', s.predictor.scheduleDerived.mispredicts);
    push('predictor.flushPenaltyCycles', s.predictor.scheduleDerived.flushPenaltyCycles);
  }

  return rows.map(r => r.map(_csvCell).join(',')).join('\r\n');
}

function _csvCell(v) {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toMarkdown(r) {
  const s = buildSnapshot(r);
  if (!s) return '# Pipeline Analysis\n\n_No data._\n';
  const out = [];
  const pcHex = (pc) => '0x' + Number(pc).toString(16).toUpperCase().padStart(2, '0');

  out.push(`# Pipeline Analysis Snapshot`);
  out.push(``);
  out.push(`- Generated: \`${s.generatedAt}\``);
  out.push(`- Schema: v${s.schemaVersion}`);
  out.push(``);

  out.push(`## Pipeline`);
  out.push(`| Metric | Value |`);
  out.push(`|---|---|`);
  out.push(`| Cycles | ${s.pipeline.cycles} |`);
  out.push(`| Bottleneck | S${s.pipeline.bottleneck} (${s.pipeline.maxDelayPs} ps) |`);
  out.push(`| f_max | ${s.pipeline.fMaxMHz != null ? s.pipeline.fMaxMHz.toFixed(1) + ' MHz' : '—'} |`);
  out.push(`| Stages | ${s.pipeline.stages.length} |`);
  out.push(``);

  if (s.metrics) {
    out.push(`## Performance`);
    out.push(`| Metric | Value |`);
    out.push(`|---|---|`);
    out.push(`| Instructions | ${s.metrics.instructionCount} |`);
    out.push(`| Cycles | ${s.metrics.actualCycles} (ideal ${s.metrics.idealCycles} + ${s.metrics.stallBubbles} stall) |`);
    out.push(`| CPI / IPC | ${s.metrics.cpi.toFixed(2)} / ${s.metrics.ipc.toFixed(2)} |`);
    out.push(`| Efficiency | ${(s.metrics.efficiency * 100).toFixed(0)}% |`);
    out.push(`| Throughput | ${s.metrics.throughputMIPS != null ? s.metrics.throughputMIPS.toFixed(0) + ' MIPS' : '—'} |`);
    if (s.metrics.bubblesRemovedByForwarding > 0) {
      out.push(`| Forwarding speedup | ${s.metrics.speedupFromForwarding.toFixed(2)}× (−${s.metrics.bubblesRemovedByForwarding} bubbles) |`);
    }
    out.push(``);
  }

  out.push(`## Hazards`);
  out.push(`- Structural: **${s.structuralHazards.count}**`);
  const ph = s.programHazards.byType;
  out.push(`- Program: **${s.programHazards.count}** (RAW:${ph.RAW} WAR:${ph.WAR} WAW:${ph.WAW} · load-use:${ph.loadUse} · resolved:${ph.resolved})`);
  out.push(`- Forwarding paths: **${s.forwarding.count}**`);
  out.push(``);

  if (s.predictor) {
    out.push(`## Branch Predictor — ${s.predictor.name}`);
    out.push(`| Metric | Value |`);
    out.push(`|---|---|`);
    out.push(`| Branches | ${s.predictor.totalBranches} |`);
    out.push(`| Hits | ${s.predictor.totalHits} |`);
    out.push(`| Hit rate | ${(s.predictor.hitRate * 100).toFixed(1)}% |`);
    out.push(`| Mispredicts (schedule) | ${s.predictor.scheduleDerived.mispredicts} |`);
    out.push(`| Flush penalty | ${s.predictor.scheduleDerived.flushPenaltyCycles} cycles |`);
    out.push(``);
    if (s.predictor.perPC.length) {
      out.push(`### Per-PC`);
      out.push(`| PC | State | Hits/Total |`);
      out.push(`|---|---|---|`);
      for (const e of s.predictor.perPC) {
        out.push(`| ${pcHex(e.pc)} | ${e.state} | ${e.hits}/${e.total} |`);
      }
      out.push(``);
    }
  }

  if (s.schedule && s.schedule.rows.length) {
    out.push(`## Schedule (${s.schedule.rowCount} rows · ${s.schedule.totalCycles} cycles${s.schedule.truncated ? ' · truncated' : ''})`);
    out.push(`| PC | Instr | IF | Stall | Flush | Pred | Actual |`);
    out.push(`|---|---|---|---|---|---|---|`);
    for (const row of s.schedule.rows) {
      const p = row.predicted === null ? '—' : (row.predicted ? 'T' : 'NT');
      const a = row.actualTaken === null ? '—' : (row.actualTaken ? 'T' : 'NT');
      out.push(`| ${pcHex(row.pc)} | ${row.disasm} | ${row.ifCycle} | ${row.stallBefore} | ${row.flushAfter} | ${p} | ${a} |`);
    }
    out.push(``);
  }

  return out.join('\n');
}

export function download(filename, content, mime = 'application/octet-stream') {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJSON(r) {
  download(`pipeline-snapshot-${_ts()}.json`, toJSON(r), 'application/json');
}
export function exportCSV(r) {
  download(`pipeline-metrics-${_ts()}.csv`, toCSV(r), 'text/csv');
}
export function exportMarkdown(r) {
  download(`pipeline-report-${_ts()}.md`, toMarkdown(r), 'text/markdown');
}

/**
 * Renders a DOM element to PNG via html2canvas (loaded globally from CDN).
 * Expands collapsed sections temporarily so the image captures everything,
 * then restores the previous state. Throws if html2canvas is not loaded.
 */
export async function exportPNG(element, filename) {
  if (typeof window.html2canvas !== 'function') {
    throw new Error('html2canvas not loaded — check network/CDN');
  }
  if (!element) throw new Error('no element to render');

  // Temporarily expand all collapsed sections so they appear in the PNG.
  const collapsed = Array.from(element.querySelectorAll('.pipe-section-collapsed'));
  collapsed.forEach(el => el.classList.remove('pipe-section-collapsed'));

  // Find scrollable descendants and remove their height/overflow caps so the
  // PNG captures everything below the scroll fold, not just the viewport.
  const scrollers = [element, ...element.querySelectorAll('*')].filter(el => {
    const cs = getComputedStyle(el);
    return /(auto|scroll)/.test(cs.overflow + cs.overflowY + cs.overflowX);
  });
  const saved = scrollers.map(el => ({
    el,
    overflow: el.style.overflow,
    height:   el.style.height,
    maxHeight: el.style.maxHeight,
  }));
  scrollers.forEach(el => {
    el.style.overflow  = 'visible';
    el.style.height    = 'auto';
    el.style.maxHeight = 'none';
  });

  try {
    const fullW = element.scrollWidth;
    const fullH = element.scrollHeight;
    const canvas = await window.html2canvas(element, {
      backgroundColor: '#050410',
      scale: 2,
      logging: false,
      useCORS: true,
      width:        fullW,
      height:       fullH,
      windowWidth:  fullW,
      windowHeight: fullH,
    });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `pipeline-panel-${_ts()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  } finally {
    collapsed.forEach(el => el.classList.add('pipe-section-collapsed'));
    saved.forEach(s => {
      s.el.style.overflow  = s.overflow;
      s.el.style.height    = s.height;
      s.el.style.maxHeight = s.maxHeight;
    });
  }
}

export async function copyJSON(r) {
  try {
    await navigator.clipboard.writeText(toJSON(r));
    return true;
  } catch { return false; }
}
