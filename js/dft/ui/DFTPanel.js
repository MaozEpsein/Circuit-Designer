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

/**
 * Detect scan chains in a scene.
 *
 * A scan chain is a sequence of SCAN_FF nodes where each FF's TI
 * (Test Input, pin index 1) is wired from the Q output of the
 * previous SCAN_FF in the sequence. Chain heads are SCAN_FFs whose
 * TI input is NOT driven by another SCAN_FF (they receive scan-in
 * from a primary input or are unwired).
 *
 * @param {object[]} scanFFs - SCAN_FF nodes
 * @param {object[]} wires
 * @returns {Array<Array<object>>} list of chains, each an ordered
 *          list of SCAN_FF nodes from head to tail.
 */
/**
 * Resolve endpoint metadata for one detected chain — what drives the
 * head's TI (scan-in source), where the tail's Q goes (scan-out
 * sink), and which signal feeds the chain's TE pins (test enable).
 * Returns:
 *   { scanIn: { type, label, nodeId } | null,
 *     scanOut: { type, label, nodeId } | null,
 *     teSource: { type, label, nodeId } | null,
 *     teShared: bool }                       // every cell shares one TE driver
 *
 * `null` means "not driven from anything in the scene". A SCAN_FF
 * with an unwired TI is a chain head whose scan-in isn't connected;
 * a tail whose Q isn't observed externally is a chain whose pattern
 * response can't be read out — both are real DFT defects worth
 * surfacing in the panel.
 */
export function describeChainEndpoints(chain, allNodes, wires) {
  const nodeById = new Map(allNodes.map(n => [n.id, n]));
  const head = chain[0];
  const tail = chain[chain.length - 1];

  // Head's TI driver. If the head sits at the start of a chain, its
  // TI is by definition NOT another SCAN_FF — it's a primary input
  // (scan_in pad), some other gate's output, or unwired.
  const tiW = wires.find(w => w.targetId === head.id && w.targetInputIndex === 1);
  const scanIn = tiW
    ? (() => {
        const src = nodeById.get(tiW.sourceId);
        return src ? { type: src.type, label: src.label || src.id, nodeId: src.id } : null;
      })()
    : null;

  // Tail's Q consumer. The tail's Q drives whatever wire leaves it;
  // if that wire targets a non-SCAN_FF (since by chain detection no
  // downstream SCAN_FF receives this Q), we report the consumer.
  const qOut = wires.find(w => w.sourceId === tail.id && (w.sourceOutputIndex || 0) === 0);
  const scanOut = qOut
    ? (() => {
        const dst = nodeById.get(qOut.targetId);
        return dst ? { type: dst.type, label: dst.label || dst.id, nodeId: dst.id } : null;
      })()
    : null;

  // TE driver: is the same source feeding every TE pin in the chain?
  const teDrivers = chain.map(ff => {
    const w = wires.find(w2 => w2.targetId === ff.id && w2.targetInputIndex === 2);
    return w ? w.sourceId : null;
  });
  const distinct = new Set(teDrivers.filter(x => x !== null));
  const teShared = teDrivers.every(d => d !== null) && distinct.size === 1;
  const teSource = teShared
    ? (() => {
        const src = nodeById.get([...distinct][0]);
        return src ? { type: src.type, label: src.label || src.id, nodeId: src.id } : null;
      })()
    : null;

  return { scanIn, scanOut, teSource, teShared };
}

export function detectScanChains(scanFFs, wires) {
  if (scanFFs.length === 0) return [];
  const ffById = new Map(scanFFs.map(n => [n.id, n]));
  // For each SCAN_FF, find: who drives my TI? (prev), and who do I drive's TI? (next)
  const prevOf = new Map();   // ff.id → upstream SCAN_FF (or undefined)
  const nextOf = new Map();   // ff.id → downstream SCAN_FF (or undefined)
  for (const ff of scanFFs) {
    const tiWire = wires.find(w => w.targetId === ff.id && w.targetInputIndex === 1);
    if (tiWire && ffById.has(tiWire.sourceId)) {
      prevOf.set(ff.id, ffById.get(tiWire.sourceId));
      nextOf.set(tiWire.sourceId, ff);
    }
  }
  // Chain heads = SCAN_FFs with no prev. Walk forward via nextOf.
  const heads = scanFFs.filter(ff => !prevOf.has(ff.id));
  const chains = [];
  for (const head of heads) {
    const chain = [head];
    let cur = head;
    const seen = new Set([head.id]);
    while (nextOf.has(cur.id)) {
      const nxt = nextOf.get(cur.id);
      if (seen.has(nxt.id)) break;     // guard against accidental loops
      seen.add(nxt.id);
      chain.push(nxt);
      cur = nxt;
    }
    chains.push(chain);
  }
  return chains;
}

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
    this._genBtn  = document.getElementById('btn-dft-gen-random');
    // Layer 2 — last fault-sim result. null until the user clicks RUN.
    // Cleared when the scene mutates (vectors / topology may have changed).
    this._lastSim = null;
    // Per-chain collapsed state. The set holds the IDs of chains the
    // user folded so the collapsed view survives a re-render. Chains
    // are identified by their position in detectScanChains() output
    // (`chain_0`, `chain_1`, …) — stable across the same scene.
    this._collapsedChains = new Set();
    // Layer 2.5 — toggled when the user clicks the [source] tag in the
    // FAULT COVERAGE row. Expands an inline table of every test vector
    // and per-vector output, so the user can see exactly what stimulus
    // was applied without leaving the panel.
    this._vectorsViewOpen = false;

    if (this._closeBtn) this._closeBtn.addEventListener('click', () => this.hide());
    if (this._fsBtn)    this._fsBtn.addEventListener('click', () => this._toggleFullscreen());
    if (this._runBtn)   this._runBtn.addEventListener('click', () => this._runFaultSim());
    if (this._genBtn)   this._genBtn.addEventListener('click', () => this._generateRandomVectors(16));

    // Event delegation for clicks inside the body — used by inline
    // toggle widgets like the [source ▸/▾] tag in the FAULT COVERAGE
    // row that expands the vectors table.
    if (this._body) {
      this._body.addEventListener('click', (e) => {
        const trg = e.target.closest('[data-action]');
        if (!trg) return;
        if (trg.dataset.action === 'toggle-vectors') {
          this._vectorsViewOpen = !this._vectorsViewOpen;
          if (this._visible) this._render();
        }
      });
    }
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
      this._renderScanChains() +
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
    this._lastSim._vectors = vectors;
    // Vector source (manual / random / atpg-stub) — surfaced in the
    // FAULT COVERAGE row so the user knows whether the % comes from a
    // hand-crafted set or random testing.
    this._lastSim._source =
      this._scene._dft?.source ||
      (this._scene._dft?.vectors ? 'manual' : 'default-sweep');
    if (this._visible) this._render();
  }

  // Layer 2.5: replace the active vector set with N random vectors.
  // Honest baseline — production flow would use ATPG (TetraMAX, Modus)
  // to target each fault directly. Random testing usually saturates
  // below 100 % because hard-to-sensitise faults need crafted vectors.
  _generateRandomVectors(N = 16) {
    if (!this._scene) return;
    const inputs = this._scene.nodes
      .filter(n => n.type === 'INPUT')
      .sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    if (inputs.length === 0) return;
    const vectors = Array.from({ length: N }, () =>
      inputs.map(() => Math.random() < 0.5 ? 0 : 1)
    );
    this._scene._dft = { vectors, source: 'random' };
    this._runFaultSim();
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
    const { coverage, _vectors, _source } = this._lastSim;
    const pct = coverage.percent;
    const barW = Math.max(2, pct);
    // Colour the bar by quality tier — under 70 red-ish, 70-90 amber,
    // 90+ green (the industry rule of thumb for "shippable").
    const tier = pct < 70 ? '#cc4040' : pct < 90 ? '#cca040' : '#40cc60';
    // Per-source label + tooltip so the user (or interviewer reading
    // over their shoulder) sees whether the % was achieved with a
    // crafted set, random testing, or a fallback sweep.
    const sourceMeta = {
      'manual':         { label: 'manual',         color: '#ffb878', tip: 'Vectors crafted by hand for this scene (or shipped with the demo). In production this is an early starting point — ATPG quickly takes over.' },
      'random':         { label: 'random N=' + _vectors.length, color: '#cc99ff', tip: 'Random testing — honest baseline. Production flow uses ATPG (Synopsys TetraMAX, Cadence Modus) which targets each fault directly with crafted vectors. Random tends to plateau before 100 % because hard-to-sensitise faults need carefully constructed test conditions.' },
      'default-sweep':  { label: 'default sweep',  color: '#876',    tip: 'Default fallback set: all-zero, all-one, walking-1 per primary input. Click GEN RANDOM for a wider sample, or ship vectors via the demo JSON for a curated set.' },
    };
    const sm = sourceMeta[_source] || sourceMeta['default-sweep'];
    // Test-compaction talking point: zero-code UI hint that production
    // ATPG output (50K+ vectors) is compressed before tester delivery.
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
          <span style="color:#876;font-size:0.92em">
            ${_vectors.length} vector${_vectors.length === 1 ? '' : 's'}
            <span data-action="toggle-vectors" style="color:${sm.color};margin-left:6px;cursor:pointer;border-bottom:1px dotted ${sm.color}66;user-select:none" title="${sm.tip}\n\nClick to ${this._vectorsViewOpen ? 'hide' : 'view'} the vectors used.">[${sm.label}${this._vectorsViewOpen ? ' ▾' : ' ▸'}]</span>
            <span style="color:#666;margin-left:6px;cursor:help;border-bottom:1px dotted #66666666" title="In silicon, ATPG produces 50 000+ vectors which are then compressed via EDT (Mentor) / OPMISR (Cadence) before being shipped to the tester — sending raw vectors over 50× more tester time would be uneconomic.">[compaction?]</span>
          </span>
        </div>
        ${this._vectorsViewOpen ? this._renderVectorsTable() : ''}
      </div>
    `;
  }

  // ── Inline vectors table (toggled by clicking the [source] tag) ─
  // Shows: vec idx, every primary input bit, the OUTPUT value(s), and
  // a small per-vector "detected" count so the user can see which
  // vectors are pulling their weight.
  _renderVectorsTable() {
    if (!this._lastSim) return '';
    const { _vectors, primaryInputs, primaryOutputs, golden, perFault } = this._lastSim;

    // Per-vector detection count — how many faults this vector caught
    // (counted as "first vector to detect" so credit is unique).
    const firstDetector = new Map();   // vecIdx → count
    for (let i = 0; i < _vectors.length; i++) firstDetector.set(i, 0);
    perFault.forEach(f => {
      if (f.detectedBy.length > 0) {
        const first = f.detectedBy[0];
        firstDetector.set(first, (firstDetector.get(first) || 0) + 1);
      }
    });

    const inHdr  = primaryInputs.map(n  => `<th style="padding:2px 6px;color:#876">${(n.label || n.id).slice(0,4)}</th>`).join('');
    const outHdr = primaryOutputs.map(n => `<th style="padding:2px 6px;color:#cca040">${(n.label || n.id).slice(0,8)}</th>`).join('');

    const rows = _vectors.map((vec, vi) => {
      const inCells  = vec.map(b => `<td style="padding:1px 6px;text-align:center;color:${b ? '#40cc60' : '#666'};font-weight:bold">${b}</td>`).join('');
      const outCells = (golden[vi] || []).map(o => {
        const txt = o === null || o === undefined ? '∅' : String(o);
        const col = o === 1 ? '#cca040' : o === 0 ? '#666' : '#cc4040';
        return `<td style="padding:1px 6px;text-align:center;color:${col};font-weight:bold">${txt}</td>`;
      }).join('');
      const dCount = firstDetector.get(vi) || 0;
      const dCol   = dCount === 0 ? '#666' : dCount < 3 ? '#cca040' : '#40cc60';
      return `<tr>
        <td style="padding:1px 6px;color:#876">v${vi}</td>
        ${inCells}
        ${outCells}
        <td style="padding:1px 6px;text-align:right;color:${dCol};font-size:0.88em">${dCount === 0 ? '<span style="color:#555">—</span>' : '+' + dCount + ' caught'}</td>
      </tr>`;
    }).join('');

    return `
      <div style="margin-top:8px;padding:8px 12px;background:rgba(204,153,255,0.04);border:1px solid #2a1a3a;border-radius:4px">
        <div style="color:#876;font-size:0.88em;margin-bottom:6px">
          Stimulus applied to the scene's primary inputs, with the resulting OUTPUT values from the golden (fault-free) run. The right column shows how many faults each vector was the FIRST to detect — vectors with "—" are redundant under the current set.
        </div>
        <table style="border-collapse:collapse;font-family:'JetBrains Mono',monospace;font-size:0.92em">
          <thead>
            <tr style="border-bottom:1px solid #401a40">
              <th style="padding:2px 6px;color:#876;text-align:left">vec</th>
              ${inHdr}
              ${outHdr}
              <th style="padding:2px 6px;color:#876;text-align:right">first to detect</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
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

  // ── SCAN CHAINS ─────────────────────────────────────────────
  // Auto-detects scan chains in the scene by walking each SCAN_FF's
  // TI input back to its source. If the source is the Q output of
  // another SCAN_FF, those two are chained. We follow the chain
  // forward (each Q can feed at most one downstream TI) until it
  // ends. Multiple disjoint chains in the same scene are supported.
  _renderScanChains() {
    const allNodes = this._scene?.nodes || [];
    const wires    = this._scene?.wires || [];
    const scanFFs  = allNodes.filter(n => n.type === 'SCAN_FF');
    const totalFFs = allNodes.filter(
      n => /FF|FLIPFLOP|REGISTER|LATCH/.test(n.type || '')
    ).length;
    if (scanFFs.length === 0) {
      return `
        <div class="dft-scan-header dft-section-header">SCAN CHAINS</div>
        <div class="dft-empty">No SCAN-FF in scene — drop a SCAN-FF chip (LOGIC tab) to enable scan-based testing.</div>
      `;
    }
    const chains = detectScanChains(scanFFs, wires);
    const scanInserted = scanFFs.length;
    const scanability = totalFFs > 0 ? Math.round((scanInserted / totalFFs) * 100) : 100;

    // Categorise chains: a chain of length 1 whose SCAN_FF has neither
    // a TI driver from a SCAN_FF (it's a head by definition) NOR a
    // downstream SCAN_FF consuming its Q is an "orphan" — present in
    // the scene but not wired into any actual chain. Worth flagging.
    const isOrphan = (chain) => {
      if (chain.length !== 1) return false;
      const ff = chain[0];
      const tiW = wires.find(w => w.targetId === ff.id && w.targetInputIndex === 1);
      return !tiW;     // head with no TI driver at all
    };

    // Pad renderer — rounded "scan-in / scan-out" port at either end
    // of the flow. Empty pads (unwired) keep the shape but get the
    // dashed-red `.empty` style so the chain reads as broken.
    const padHtml = (e, kind, missingMsg) => {
      if (!e) return `
        <div class="dft-chain-pad empty">
          <small>${kind}</small>
          <strong>(unwired)</strong>
          <small title="${missingMsg}">⚠</small>
        </div>`;
      return `
        <div class="dft-chain-pad">
          <small>${kind}</small>
          <strong>${e.label}</strong>
          <small>${e.type}</small>
        </div>`;
    };

    // Health classifier — drives the status pill colour and label.
    // healthy : both ends wired AND TE shared  → green pill
    // warn    : TE shared but missing one end, or per-cell TE       → amber pill
    // bad     : both ends unwired (incl. orphan)                    → red pill
    const classifyHealth = (ends, orphan) => {
      const inOk  = !!ends.scanIn;
      const outOk = !!ends.scanOut;
      const teOk  = ends.teShared && !!ends.teSource;
      if (orphan) return { cls: 'bad',  label: 'orphan' };
      if (inOk && outOk && teOk) return { cls: 'ok', label: 'healthy' };
      if (!inOk && !outOk)       return { cls: 'bad',  label: 'broken' };
      return { cls: 'warn', label: 'warn' };
    };

    const rowsHtml = chains.map((chain, idx) => {
      const ends = describeChainEndpoints(chain, allNodes, wires);
      const orphan = isOrphan(chain);
      const health = classifyHealth(ends, orphan);

      // Build the inline flow: pad → cell → arrow → cell → ... → pad.
      // Arrows live as separate inline elements so they can pick up
      // the chain's amber accent and align baseline with the boxes.
      const cellChunks = [];
      for (let c = 0; c < chain.length; c++) {
        if (c > 0) cellChunks.push(`<span class="dft-chain-arrow">→</span>`);
        cellChunks.push(`<div class="dft-chain-cell"><strong>${chain[c].label || chain[c].id}</strong></div>`);
      }

      // TE bar — three flavours of dash pattern carry the meaning:
      //   solid  : one source feeds every cell's TE
      //   split  : each cell has its own TE (unusual; flag it)
      //   absent : at least one cell's TE is unwired entirely
      let teBarCls, teText, teTextCls = '';
      if (ends.teShared && ends.teSource) {
        teBarCls = '';
        teText = `shared ← ${ends.teSource.label} [${ends.teSource.type}]`;
      } else {
        // Distinguish "all wired but to different sources" from "some unwired".
        const teDrivers = chain.map(ff =>
          wires.find(w => w.targetId === ff.id && w.targetInputIndex === 2));
        const anyMissing = teDrivers.some(w => !w);
        teBarCls = anyMissing ? 'absent' : 'split';
        teText = anyMissing
          ? `${teDrivers.filter(w => !w).length} of ${chain.length} cells have no TE driver`
          : `per-cell TE (${chain.length} distinct sources)`;
        teTextCls = 'warn';
      }

      const chainKey = `chain_${idx}`;
      const collapsed = this._collapsedChains.has(chainKey);
      return `
        <div class="dft-chain-block${collapsed ? ' collapsed' : ''}" data-chain-id="${chainKey}">
          <div class="dft-chain-header" title="Click to collapse / expand">
            <span class="dft-chain-toggle">${collapsed ? '▸' : '▾'}</span>
            <span class="dft-chain-title">chain_${idx}</span>
            <span class="dft-chain-len">${chain.length} cell${chain.length === 1 ? '' : 's'}</span>
            <span class="dft-chain-status ${health.cls}">${health.label}</span>
          </div>
          <div class="dft-chain-flow">
            ${padHtml(ends.scanIn,  'scan-in',  'no test-vector source')}
            <span class="dft-chain-arrow">→</span>
            ${cellChunks.join('')}
            <span class="dft-chain-arrow">→</span>
            ${padHtml(ends.scanOut, 'scan-out', 'response is unobservable')}
          </div>
          <div class="dft-chain-te">
            <span class="dft-chain-te-label">TE</span>
            <span class="dft-chain-te-bar ${teBarCls}"></span>
            <span class="dft-chain-te-source ${teTextCls}">${teText}</span>
          </div>
        </div>`;
    }).join('');

    // High-level chain-coverage summary: cells inside any non-orphan
    // chain over total scanability. Orphans count toward "scan FFs"
    // but not toward "chain coverage" — they need wiring before they
    // contribute to a real test.
    const cellsInChains = chains
      .filter(c => !isOrphan(c))
      .reduce((sum, c) => sum + c.length, 0);
    const chainedPct = scanInserted > 0
      ? Math.round((cellsInChains / scanInserted) * 100)
      : 0;
    const orphanCount = chains.filter(isOrphan).length;

    return `
      <div class="dft-scan-header dft-section-header">SCAN CHAINS</div>
      <div class="dft-perf-row">
        <span class="k">Scan FFs</span><span class="v">${scanInserted} of ${totalFFs} (${scanability}% scanability)</span>
        <span class="k">Chains</span><span class="v">${chains.length} (${cellsInChains} cells, ${chainedPct}% in chain)</span>
        ${orphanCount ? `<span class="k">Orphans</span><span class="v">${orphanCount}</span>` : ''}
      </div>
      ${rowsHtml || '<div style="padding:0 1.2em;color:#876">No completed chains — wire SCAN-FF outputs into the next SCAN-FF\'s TI input to form a chain.</div>'}
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
    // Match the canonical section header class only — `[class$="-header"]`
    // would also catch nested per-block headers (e.g. .dft-chain-header
    // from the scan-chain flow diagrams) and silently turn each chain
    // into a collapsible region. Sticking to .dft-section-header keeps
    // the toggle scoped to the four top-level sections.
    const headers = this._body.querySelectorAll('.dft-section-header');
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

    // Per-chain collapse handlers — clicking a chain header folds the
    // flow + TE bar so only the title row remains. State is persisted
    // in this._collapsedChains so it survives the next _render().
    const chainHeaders = this._body.querySelectorAll('.dft-chain-block .dft-chain-header');
    chainHeaders.forEach(h => {
      h.addEventListener('click', (e) => {
        // Allow clicks on the status pill / inner controls to bubble
        // out without folding (none today, but keeps the door open).
        if (e.target.closest('.dft-chain-status[data-action]')) return;
        const block = h.closest('.dft-chain-block');
        if (!block) return;
        const id = block.dataset.chainId;
        if (!id) return;
        if (this._collapsedChains.has(id)) {
          this._collapsedChains.delete(id);
          block.classList.remove('collapsed');
        } else {
          this._collapsedChains.add(id);
          block.classList.add('collapsed');
        }
        const tog = h.querySelector('.dft-chain-toggle');
        if (tog) tog.textContent = block.classList.contains('collapsed') ? '▸' : '▾';
      });
    });
  }
}
