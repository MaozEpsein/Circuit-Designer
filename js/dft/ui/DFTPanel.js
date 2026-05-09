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

/**
 * Compute an LFSR's true period by direct simulation. Starts from
 * `seed`, runs the same Fibonacci shift the engine uses, and stops
 * when a state repeats (Floyd-style "first revisit" detection via a
 * Set). For a primitive polynomial of width N, the period equals
 * 2^N - 1 — every non-zero state visited exactly once. Anything
 * shorter means the polynomial is reducible / non-primitive (still
 * legal but useless for max-length BIST).
 *
 * Capped at 2^N iterations to keep wide LFSRs from hanging the UI.
 * Returns:
 *   { period, maxPeriod, isMaxLength, stuckAtZero }
 *   • stuckAtZero = seed is 0; the LFSR would never advance.
 */
export function lfsrPeriod(width, taps, seed) {
  width = Math.max(1, Math.min(24, width | 0));
  const mask = (1 << width) - 1;
  const maxPeriod = mask;     // 2^N - 1 — the all-zero state is excluded
  if ((seed & mask) === 0) return { period: 0, maxPeriod, isMaxLength: false, stuckAtZero: true };
  const seen = new Set();
  let s = seed & mask;
  while (!seen.has(s)) {
    seen.add(s);
    let xor = 0;
    for (const t of taps) xor ^= ((s >> t) & 1);
    s = (((s << 1) | xor) & mask) >>> 0;
    if (seen.size > maxPeriod) break;     // safety
  }
  return { period: seen.size, maxPeriod, isMaxLength: seen.size === maxPeriod, stuckAtZero: false };
}

/**
 * Format the tap list as a compact summary: degree + tap positions.
 * "x⁴ taps[3,0]" rather than a fully-expanded polynomial — the
 * Fibonacci-vs-Galois mapping rules differ across textbooks and
 * getting the symbolic form wrong is worse than skipping it.
 */
export function lfsrPolynomial(width, taps) {
  const sup = (n) => String(n).split('').map(d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]).join('');
  const sorted = (taps || []).slice().sort((a, b) => b - a);
  return `x${sup(width)} taps[${sorted.join(',')}]`;
}

/**
 * Resolve where each LFSR's serial Q output is delivered. For DFT,
 * the interesting case is "Q drives the TI of a chain head" — that
 * marks the LFSR as a BIST pattern source. Returns:
 *   { sinks: [{ type, label, nodeId, isScanIn }], drivesScan: bool }
 */
export function describeLfsrSinks(lfsr, allNodes, wires) {
  const nodeById = new Map(allNodes.map(n => [n.id, n]));
  const sinks = wires
    .filter(w => w.sourceId === lfsr.id)
    .map(w => {
      const dst = nodeById.get(w.targetId);
      if (!dst) return null;
      const isScanIn = dst.type === 'SCAN_FF' && (w.targetInputIndex || 0) === 1;
      return { type: dst.type, label: dst.label || dst.id, nodeId: dst.id, isScanIn };
    })
    .filter(Boolean);
  return { sinks, drivesScan: sinks.some(s => s.isScanIn) };
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
    this._collapseAllBtn = document.getElementById('btn-dft-collapse-all');
    this._editAllBtn     = document.getElementById('btn-dft-edit-all');
    this._visible    = false;

    this._runBtn  = document.getElementById('btn-dft-run');
    this._genBtn  = document.getElementById('btn-dft-gen-random');
    // Layer 2 — last fault-sim result. null until the user clicks RUN.
    // Cleared when the scene mutates (vectors / topology may have changed).
    this._lastSim = null;
    // Per-block collapsed state. Each entry is a block-id like
    // `chain_0` (positional, stable per scene) or `lfsr_<nodeId>` (by
    // node id, also stable). The set survives a re-render so the
    // user's fold choices aren't undone by a fault-sim refresh.
    this._collapsedBlocks   = new Set();
    this._collapsedSections = new Set();
    // Per-field LFSR edit state. Key shape: `<lfsrId>:<field>`. A
    // field is in view mode (read-only text + pencil) until the user
    // clicks the pencil; then it enters edit mode (input + save/
    // cancel). The set survives re-render so a partial edit isn't
    // lost when the panel refreshes for some other reason.
    this._editingFields = new Set();
    // Per-section info popovers — Set of section keys (e.g.
    // 'patterns') currently expanded. Each section can stash a small
    // explanatory block under its header via the ⓘ button.
    this._infoOpen = new Set();
    // Radix preference for the MISR signature compactor section.
    // 'bin' | 'dec' | 'hex'. Persists across renders. Decimal default
    // because that's what new users naturally read.
    this._misrRadix = 'dec';
    // Layer 2.5 — toggled when the user clicks the [source] tag in the
    // FAULT COVERAGE row. Expands an inline table of every test vector
    // and per-vector output, so the user can see exactly what stimulus
    // was applied without leaving the panel.
    this._vectorsViewOpen = false;

    if (this._closeBtn) this._closeBtn.addEventListener('click', () => this.hide());
    if (this._fsBtn)    this._fsBtn.addEventListener('click', () => this._toggleFullscreen());
    if (this._collapseAllBtn) this._collapseAllBtn.addEventListener('click', () => this._toggleCollapseAll());
    if (this._editAllBtn)     this._editAllBtn.addEventListener('click', () => this._toggleEditAll());
    if (this._runBtn)   this._runBtn.addEventListener('click', () => this._runFaultSim());
    if (this._genBtn)   this._genBtn.addEventListener('click', () => this._generateRandomVectors(16));

    // Event delegation for clicks inside the body — used by inline
    // toggle widgets like the [source ▸/▾] tag in the FAULT COVERAGE
    // row that expands the vectors table.
    if (this._body) {
      // Bind on mousedown specifically for actions whose target is
      // re-rendered every simulation tick — radix toggle, pencil
      // edit on a tick-rendered card, etc. Click never fires when
      // mouseup lands on a different DOM node than mousedown.
      this._body.addEventListener('mousedown', (e) => {
        // Radix toggle.
        const radixTrg = e.target.closest('[data-action="misr-radix"]');
        if (radixTrg) {
          e.preventDefault();
          const r = radixTrg.dataset.radix;
          if (r === 'bin' || r === 'dec' || r === 'hex') {
            this._misrRadix = r;
            if (this._visible) this._render();
          }
          return;
        }
        // Info toggle. Bound on mousedown because the panel re-renders
        // every tick — a click event whose mousedown and mouseup land
        // on different DOM nodes never fires.
        const infoTrg = e.target.closest('[data-action="toggle-info"]');
        if (infoTrg) {
          e.preventDefault();
          e.stopPropagation();
          const section = infoTrg.dataset.section;
          if (!section) return;
          if (this._infoOpen.has(section)) this._closeInfoPopovers();
          else                              this._openInfoPopover(section);
          return;
        }
        // Section header collapse — same survival reasoning.
        const headerTrg = e.target.closest('.dft-section-header');
        if (headerTrg && !e.target.closest('button, [data-action]')) {
          const section = headerTrg.parentElement;
          if (section && section.classList.contains('dft-section')) {
            e.preventDefault();
            const id = section.dataset.section || '';
            const nowCollapsed = !section.classList.contains('dft-section-collapsed');
            section.classList.toggle('dft-section-collapsed', nowCollapsed);
            if (nowCollapsed) this._collapsedSections.add(id);
            else              this._collapsedSections.delete(id);
            const tog = headerTrg.querySelector('.dft-section-toggle');
            if (tog) tog.textContent = nowCollapsed ? '▸' : '▾';
          }
          return;
        }
        // Pencil edit / save / cancel — also re-rendered every tick.
        const editTrg = e.target.closest('[data-action="lfsr-edit"], [data-action="lfsr-save"], [data-action="lfsr-cancel"]');
        if (editTrg) {
          e.preventDefault();
          const lfsrId = editTrg.dataset.lfsrId;
          const field  = editTrg.dataset.field;
          if (!lfsrId || !field) return;
          const action = editTrg.dataset.action;
          if (action === 'lfsr-edit') {
            this._editingFields.add(`${lfsrId}:${field}`);
            if (this._visible) this._render();
            const inp = this._body.querySelector(`input[data-lfsr-id="${lfsrId}"][data-field="${field}"]`);
            inp?.focus(); inp?.select?.();
          } else if (action === 'lfsr-save') {
            const inp = this._body.querySelector(`input[data-lfsr-id="${lfsrId}"][data-field="${field}"]`);
            if (inp) this._commitLfsrEdit(inp);
            this._editingFields.delete(`${lfsrId}:${field}`);
            if (this._visible) this._render();
          } else if (action === 'lfsr-cancel') {
            this._editingFields.delete(`${lfsrId}:${field}`);
            if (this._visible) this._render();
          }
          return;
        }
        // Per-block (chain / lfsr / misr / bist) collapse.
        const blockHeader = e.target.closest('.dft-chain-block[data-block-id] .dft-chain-header');
        if (blockHeader && !e.target.closest('.dft-chain-status[data-action], button, [data-action]')) {
          const block = blockHeader.closest('.dft-chain-block');
          const id = block?.dataset.blockId;
          if (id) {
            e.preventDefault();
            if (this._collapsedBlocks.has(id)) {
              this._collapsedBlocks.delete(id);
              block.classList.remove('collapsed');
            } else {
              this._collapsedBlocks.add(id);
              block.classList.add('collapsed');
            }
            const tog = blockHeader.querySelector('.dft-chain-toggle');
            if (tog) tog.textContent = block.classList.contains('collapsed') ? '▸' : '▾';
          }
          return;
        }
      });
      // toggle-vectors stays on click — it's outside the per-tick
      // re-render path. Pencil edit / save / cancel moved to the
      // mousedown listener above for the same survival reason.
      this._body.addEventListener('click', (e) => {
        const trg = e.target.closest('[data-action]');
        if (!trg) return;
        if (trg.dataset.action === 'toggle-vectors') {
          this._vectorsViewOpen = !this._vectorsViewOpen;
          if (this._visible) this._render();
          return;
        }
        // misr-radix and toggle-info are handled in the mousedown
        // listener above — click doesn't fire reliably here because
        // the panel re-renders mid-touch.
      });
      // Keyboard shortcuts inside the LFSR edit input — Enter saves,
      // Escape cancels.
      this._body.addEventListener('keydown', (e) => {
        const inp = e.target.closest('input[data-lfsr-id]');
        if (!inp) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          this._commitLfsrEdit(inp);
          this._editingFields.delete(`${inp.dataset.lfsrId}:${inp.dataset.field}`);
          if (this._visible) this._render();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this._editingFields.delete(`${inp.dataset.lfsrId}:${inp.dataset.field}`);
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
    if (this._collapseAllBtn) this._collapseAllBtn.style.display = on ? '' : 'none';
    if (this._editAllBtn)     this._editAllBtn.style.display     = on ? '' : 'none';
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

  // Fullscreen-only "collapse all / expand all". Toggles between
  // every section + per-block being folded vs. all open. State lives
  // alongside the per-section / per-block sets so individual users
  // can still drill back in after a global expand.
  _toggleCollapseAll() {
    // Discover live section ids from the DOM (set by
    // _applyCollapsibleSections from each header's className).
    const sectionIds = Array.from(this._body?.querySelectorAll('.dft-section') || [])
      .map(s => s.dataset.section).filter(Boolean);
    const blockIds = Array.from(this._body?.querySelectorAll('.dft-chain-block[data-block-id]') || [])
      .map(b => b.dataset.blockId).filter(Boolean);
    const anyOpen = sectionIds.some(s => !this._collapsedSections.has(s)) ||
                    blockIds.some(b => !this._collapsedBlocks.has(b));
    if (anyOpen) {
      sectionIds.forEach(s => this._collapsedSections.add(s));
      blockIds.forEach(b => this._collapsedBlocks.add(b));
      if (this._collapseAllBtn) this._collapseAllBtn.textContent = '▸ EXPAND ALL';
    } else {
      this._collapsedSections.clear();
      this._collapsedBlocks.clear();
      if (this._collapseAllBtn) this._collapseAllBtn.textContent = '▾ COLLAPSE ALL';
    }
    if (this._visible) this._render();
  }

  // Fullscreen-only "edit all / save all". Opens every editable
  // field (LFSR seed/taps/width, MISR golden, BIST runLength/golden)
  // for parallel editing; on second press, commits each one and
  // returns to view mode.
  _toggleEditAll() {
    const allNodes = this._scene?.nodes || [];
    const fields = [];
    allNodes.forEach(n => {
      if (n.type === 'LFSR') {
        fields.push(`${n.id}:bitWidth`, `${n.id}:seed`, `${n.id}:taps`);
      } else if (n.type === 'MISR') {
        fields.push(`${n.id}:bitWidth`, `${n.id}:seed`, `${n.id}:taps`, `${n.id}:goldenSig`);
      } else if (n.type === 'BIST_CONTROLLER') {
        fields.push(`${n.id}:runLength`, `${n.id}:goldenSig`);
      } else if (n.type === 'JTAG_TAP') {
        fields.push(`${n.id}:irBits`, `${n.id}:idcode`);
      }
    });
    const anyEditing = fields.some(k => this._editingFields.has(k));
    if (anyEditing) {
      // SAVE ALL — commit every open input, then close.
      fields.forEach(k => {
        if (!this._editingFields.has(k)) return;
        const [id, field] = k.split(':');
        const inp = this._body?.querySelector(
          `input[data-lfsr-id="${id}"][data-field="${field}"]`);
        if (inp) this._commitLfsrEdit(inp);
        this._editingFields.delete(k);
      });
      if (this._editAllBtn) this._editAllBtn.textContent = '✎ EDIT ALL';
    } else {
      fields.forEach(k => this._editingFields.add(k));
      if (this._editAllBtn) this._editAllBtn.textContent = '💾 SAVE ALL';
    }
    if (this._visible) this._render();
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
      this._renderPatternGenerators() +
      this._renderSignatureCompactors() +
      this._renderBistControllers() +
      this._renderJtagTaps() +
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
    const cvHeader = `<span class="dft-section-title">FAULT COVERAGE` +
      `<button class="dft-info-btn" data-action="toggle-info" data-section="coverage" title="What does this section show?">i</button>` +
      `</span>`;
    const cvInfo = this._infoOpen.has('coverage') ? `
      <div class="dft-info-panel">
        <div class="dft-info-lead">Fraction of the scene's possible faults that the active test vectors actually flag — the headline metric of any DFT flow. The bar is coloured by industry tiers: &lt;70 % red, 70–90 % amber, ≥90 % green.</div>
      </div>` : '';
    if (!this._lastSim) {
      return `
        <div class="dft-coverage-header dft-section-header">${cvHeader}</div>${cvInfo}
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
      <div class="dft-coverage-header dft-section-header">${cvHeader}</div>${cvInfo}
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
    const ovHeader = `<span class="dft-section-title">TESTABILITY OVERVIEW` +
      `<button class="dft-info-btn" data-action="toggle-info" data-section="overview" title="What does this section show?">i</button>` +
      `</span>`;
    const ovInfo = this._infoOpen.has('overview') ? `
      <div class="dft-info-panel">
        <div class="dft-info-lead">Top-line counts for the scene: how many wires (each is two potential stuck-at sites), how many flip-flops, and how many faults you've manually injected via the wire context menu.</div>
      </div>` : '';
    return `
      <div class="dft-overview-header dft-section-header">${ovHeader}</div>${ovInfo}
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

    // Reusable header (title + ⓘ button) + the popover panel for the
    // chain-status legend. Same shape and styling as the Pattern
    // Generators help, just different content.
    const chainHeaderHtml = `<span class="dft-section-title">SCAN CHAINS` +
      `<button class="dft-info-btn" data-action="toggle-info" data-section="chains" title="What do the chain status pills mean?">i</button>` +
      `</span>`;
    const chainInfoPanel = this._infoOpen.has('chains') ? `
      <div class="dft-info-panel">
        <div class="dft-info-lead">Scan chains shift test vectors serially through every flip-flop, replacing the design's normal datapath during test mode. Status flags wiring completeness.</div>
        <div class="dft-info-row">
          <span class="dft-chain-status ok">healthy</span>
          <span class="dft-info-text">scan-in + scan-out wired AND a single TE source feeds every cell.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status warn">warn</span>
          <span class="dft-info-text">One end unwired, or each cell uses a different TE driver.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status bad">broken</span>
          <span class="dft-info-text">Both scan-in AND scan-out unwired — chain can't be tested.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status bad">orphan</span>
          <span class="dft-info-text">Lone SCAN_FF with nothing wired to its TI — not part of any chain.</span>
        </div>
      </div>
    ` : '';

    if (scanFFs.length === 0) {
      return `
        <div class="dft-scan-header dft-section-header">${chainHeaderHtml}</div>${chainInfoPanel}
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
      const collapsed = this._collapsedBlocks.has(chainKey);
      return `
        <div class="dft-chain-block${collapsed ? ' collapsed' : ''}" data-block-id="${chainKey}">
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
      <div class="dft-scan-header dft-section-header">${chainHeaderHtml}</div>${chainInfoPanel}
      <div class="dft-perf-row">
        <span class="k">Scan FFs</span><span class="v">${scanInserted} of ${totalFFs} (${scanability}% scanability)</span>
        <span class="k">Chains</span><span class="v">${chains.length} (${cellsInChains} cells, ${chainedPct}% in chain)</span>
        ${orphanCount ? `<span class="k">Orphans</span><span class="v">${orphanCount}</span>` : ''}
      </div>
      ${rowsHtml || '<div style="padding:0 1.2em;color:#876">No completed chains — wire SCAN-FF outputs into the next SCAN-FF\'s TI input to form a chain.</div>'}
    `;
  }

  // Commit a single edited LFSR field. Validates the value, mutates
  // the scene node in place, drops cached engine state for that
  // node so the new seed/taps take effect on the next tick, and
  // re-renders the panel. On invalid input the field reverts and
  // no mutation happens.
  _commitLfsrEdit(input) {
    const id    = input.dataset.lfsrId;
    const field = input.dataset.field;
    const node  = this._scene?.nodes?.find(n => n.id === id);
    if (!node) return;
    if (node.type !== 'LFSR' && node.type !== 'MISR' && node.type !== 'BIST_CONTROLLER' && node.type !== 'JTAG_TAP') return;

    const raw = (input.value || '').trim();
    let next;
    // JTAG_TAP's irBits: small positive integer.
    if (field === 'irBits') {
      const v = parseInt(raw, 10);
      if (!Number.isFinite(v) || v < 1 || v > 16) { input.value = node.irBits ?? 4; return; }
      node.irBits = v;
      const ffStates = window.state?.ffStates;
      if (ffStates?.delete) ffStates.delete(node.id);
      bus.emit('node:edited', { node, field });
      if (this._visible) this._render();
      return;
    }
    // JTAG_TAP's idcode: 32-bit value, dec / hex / bin.
    if (field === 'idcode') {
      let v;
      if (/^0[xX][0-9a-fA-F]+$/.test(raw))      v = parseInt(raw.slice(2), 16);
      else if (/^0[bB][01]+$/.test(raw))        v = parseInt(raw.slice(2), 2);
      else if (/^[0-9]+$/.test(raw))            v = parseInt(raw, 10);
      if (!Number.isFinite(v) || v < 0) {
        input.value = '0x' + ((node.idcode | 0) >>> 0).toString(16); return;
      }
      node.idcode = v >>> 0;
      bus.emit('node:edited', { node, field });
      if (this._visible) this._render();
      return;
    }
    // BIST_CONTROLLER's runLength: positive integer.
    if (field === 'runLength') {
      const v = parseInt(raw, 10);
      if (!Number.isFinite(v) || v < 1 || v > 65535) { input.value = node.runLength; return; }
      node.runLength = v;
      const ffStates = window.state?.ffStates;
      if (ffStates?.delete) ffStates.delete(node.id);
      bus.emit('node:edited', { node, field });
      if (this._visible) this._render();
      return;
    }
    if (field === 'goldenSig') {
      // Special: blank input clears the golden signature back to null.
      if (raw === '') { node.goldenSig = null; bus.emit('node:edited', { node, field }); if (this._visible) this._render(); return; }
      let v;
      if (/^0[xX][0-9a-fA-F]+$/.test(raw))      v = parseInt(raw.slice(2), 16);
      else if (/^0[bB][01]+$/.test(raw))        v = parseInt(raw.slice(2), 2);
      else if (/^[0-9]+$/.test(raw))            v = parseInt(raw, 10);
      if (!Number.isFinite(v) || v < 0) {
        input.value = (typeof node.goldenSig === 'number') ? '0x' + (node.goldenSig >>> 0).toString(16) : '';
        return;
      }
      node.goldenSig = v & ((1 << (node.bitWidth || 4)) - 1);
      bus.emit('node:edited', { node, field });
      if (this._visible) this._render();
      return;
    }
    if (field === 'bitWidth') {
      const v = parseInt(raw, 10);
      if (!Number.isFinite(v) || v < 1 || v > 32) { input.value = node.bitWidth; return; }
      next = v;
    } else if (field === 'seed') {
      // Accept decimal, 0x… hex, or 0b… binary.
      let v;
      if (/^0[xX][0-9a-fA-F]+$/.test(raw))      v = parseInt(raw.slice(2), 16);
      else if (/^0[bB][01]+$/.test(raw))        v = parseInt(raw.slice(2), 2);
      else if (/^[0-9]+$/.test(raw))            v = parseInt(raw, 10);
      if (!Number.isFinite(v) || v < 0) {
        input.value = '0x' + ((node.seed ?? 0) >>> 0).toString(16); return;
      }
      const w = node.bitWidth | 0;
      next = v & ((1 << w) - 1);     // truncate silently to the LFSR's width
    } else if (field === 'taps') {
      // Comma-separated integers, dedup + sort.
      const parts = raw.split(/[,\s]+/).filter(Boolean).map(s => parseInt(s, 10));
      if (parts.some(n => !Number.isFinite(n) || n < 0)) {
        input.value = (node.taps || []).join(','); return;
      }
      const w = node.bitWidth | 0;
      const valid = [...new Set(parts.filter(n => n < w))].sort((a, b) => a - b);
      if (valid.length === 0) { input.value = (node.taps || []).join(','); return; }
      next = valid;
    } else {
      return;
    }

    node[field] = next;
    // Engine caches LFSR run state in the FF state map keyed by node id.
    // Drop it so the next tick re-seeds from the new value.
    const ffStates = window.state?.ffStates;
    if (ffStates?.delete) ffStates.delete(node.id);
    // Notify the rest of the app (canvas redraws, telemetry, etc.).
    bus.emit('node:edited', { node, field });
    if (this._visible) this._render();
  }

  // Open one section's info panel. The panel renders inline below
  // the section header, so no click-outside trap is needed — the
  // user closes it by clicking the i button again.
  _openInfoPopover(section) {
    this._infoOpen.add(section);
    if (this._visible) this._render();
  }
  _closeInfoPopovers() {
    if (this._infoOpen.size === 0) return;
    this._infoOpen.clear();
    if (this._visible) this._render();
  }

  // Render one editable LFSR field. Two states:
  //   view  → the value as text + ✏ pencil button (click to edit)
  //   edit  → an <input> + ✓ save + ✕ cancel buttons
  // Edit state lives in this._editingFields keyed `<id>:<field>` so
  // re-renders preserve it.
  _renderLfsrField(lfsrId, field, viewHtml, opts = {}) {
    const key = `${lfsrId}:${field}`;
    const editing = this._editingFields.has(key);
    if (!editing) {
      return `
        <span class="dft-lfsr-v">
          ${viewHtml}
          <button class="dft-lfsr-edit" data-lfsr-id="${lfsrId}" data-field="${field}"
                  data-action="lfsr-edit" title="Edit ${field}">✎</button>
        </span>`;
    }
    const inputType = opts.inputType || 'text';
    const minMax    = opts.minMax || '';
    return `
      <span class="dft-lfsr-v">
        <input class="dft-lfsr-input" type="${inputType}" ${minMax}
               data-lfsr-id="${lfsrId}" data-field="${field}"
               value="${opts.current ?? ''}"
               title="${opts.hint || ''}"
               autofocus>
        <button class="dft-lfsr-save"   data-lfsr-id="${lfsrId}" data-field="${field}"
                data-action="lfsr-save"   title="Save (Enter)">💾</button>
        <button class="dft-lfsr-cancel" data-lfsr-id="${lfsrId}" data-field="${field}"
                data-action="lfsr-cancel" title="Cancel (Esc)">✕</button>
        <small class="dft-lfsr-hint">${opts.hint || ''}</small>
      </span>`;
  }

  // ── PATTERN GENERATORS (LFSRs) ─────────────────────────────
  // Layer-4 surface in the DFT panel. Lists every LFSR in the scene,
  // computes its true period, names its polynomial, and flags whether
  // the serial Q drives a SCAN_FF's TI — i.e. whether this LFSR is
  // wired up as a real BIST pattern source or is just sitting there.
  _renderPatternGenerators() {
    const allNodes = this._scene?.nodes || [];
    const wires    = this._scene?.wires || [];
    const lfsrs    = allNodes.filter(n => n.type === 'LFSR');
    const open = this._infoOpen.has('patterns');
    const infoPanel = open ? `
      <div class="dft-info-panel">
        <div class="dft-info-lead">LFSRs as test-pattern sources for BIST. Status combines polynomial quality with whether the LFSR is actually wired into a scan path.</div>
        <div class="dft-info-row">
          <span class="dft-chain-status ok">BIST source</span>
          <span class="dft-info-text">Primitive polynomial AND Q wired to scan-in. All good.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status warn">unused</span>
          <span class="dft-info-text">Primitive but Q drives nothing testable — wire it to a SCAN_FF.TI.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status warn">sub-max</span>
          <span class="dft-info-text">Reducible polynomial — short orbit. Pick taps from a primitive table.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status bad">seed=0</span>
          <span class="dft-info-text">Zero is a fixed point — set seed to any non-zero value.</span>
        </div>
      </div>
    ` : '';
    // Wrap title + info button in one flex item so the parent's
    // justify-content: space-between keeps the toggle on the right
    // without throwing the info button into the middle.
    const headerHtml = `<span class="dft-section-title">PATTERN GENERATORS` +
      `<button class="dft-info-btn" data-action="toggle-info" data-section="patterns" title="What do the status pills mean?">i</button>` +
      `</span>`;

    if (lfsrs.length === 0) {
      return `
        <div class="dft-patterns-header dft-section-header">${headerHtml}</div>${infoPanel}
        <div class="dft-empty">No LFSR in scene — drop one (LOGIC tab) to enable BIST-style pseudo-random testing.</div>
      `;
    }
    const blocks = lfsrs.map((lfsr) => {
      const width = Math.max(1, lfsr.bitWidth | 0);
      const seed  = (lfsr.seed ?? 1) & ((1 << width) - 1);
      const taps  = Array.isArray(lfsr.taps) ? lfsr.taps.slice() : [width - 1, 0];
      const period = lfsrPeriod(width, taps, seed);
      const sinks = describeLfsrSinks(lfsr, allNodes, wires);

      // Health classifier: max-length + drives a scan-in = green;
      // sub-max polynomial OR not driving any scan = amber; stuck-at-0
      // seed = red.
      let cls, label;
      if (period.stuckAtZero)               { cls = 'bad';  label = 'seed=0'; }
      else if (period.isMaxLength && sinks.drivesScan) { cls = 'ok';   label = 'BIST source'; }
      else if (period.isMaxLength)          { cls = 'warn'; label = 'unused'; }
      else                                   { cls = 'warn'; label = 'sub-max'; }

      const sinkText = sinks.sinks.length === 0
        ? '<span class="dft-chain-end-empty">(Q not connected)</span>'
        : sinks.sinks.map(s =>
            `<span class="${s.isScanIn ? 'dft-lfsr-sink-scan' : 'dft-lfsr-sink'}">${s.label} <small>[${s.type}${s.isScanIn ? '·TI' : ''}]</small></span>`
          ).join(', ');

      const blockId = `lfsr_${lfsr.id}`;
      const collapsed = this._collapsedBlocks.has(blockId);
      return `
        <div class="dft-chain-block${collapsed ? ' collapsed' : ''}" data-block-id="${blockId}">
          <div class="dft-chain-header" title="Click to collapse / expand">
            <span class="dft-chain-toggle">${collapsed ? '▸' : '▾'}</span>
            <span class="dft-chain-title">${lfsr.label || lfsr.id}</span>
            <span class="dft-chain-len">${width}-bit</span>
            <span class="dft-chain-status ${cls}">${label}</span>
          </div>
          <div class="dft-lfsr-grid">
            <span class="dft-lfsr-k">width</span>
            ${this._renderLfsrField(lfsr.id, 'bitWidth',
              `<code>${width}</code> <small>bits</small>`,
              { current: width, hint: 'integer 1–24', inputType: 'number', minMax: 'min="1" max="24"' })}
            <span class="dft-lfsr-k">seed</span>
            ${this._renderLfsrField(lfsr.id, 'seed',
              `<code>${seed.toString(2).padStart(width, '0')}</code> <small>(0x${seed.toString(16)})</small>`,
              { current: '0x' + seed.toString(16), hint: 'dec, 0xHEX, or 0bBIN — truncated to width' })}
            <span class="dft-lfsr-k">shape</span>
            ${this._renderLfsrField(lfsr.id, 'taps',
              `<code>${lfsrPolynomial(width, taps)}</code> <small>(Fibonacci LFSR, shift-left; XOR of tap bits drops into the new LSB each clock)</small>`,
              { current: taps.join(','), hint: 'comma-separated bit positions (0 = LSB)' })}
            <span class="dft-lfsr-k">period</span>
            <span class="dft-lfsr-v">
              <code>${period.period}</code>
              <small>of ${period.maxPeriod} max ${period.isMaxLength ? '✓ max-length' : `(${Math.round(100 * period.period / period.maxPeriod)}% — non-primitive)`}</small>
            </span>
            <span class="dft-lfsr-k">drives</span>
            <span class="dft-lfsr-v">${sinkText}</span>
          </div>
        </div>`;
    }).join('');

    const goodCount = lfsrs.filter(l => {
      const w = Math.max(1, l.bitWidth | 0);
      const seed = (l.seed ?? 1) & ((1 << w) - 1);
      const taps = Array.isArray(l.taps) ? l.taps : [w - 1, 0];
      return lfsrPeriod(w, taps, seed).isMaxLength;
    }).length;

    return `
      <div class="dft-patterns-header dft-section-header">${headerHtml}</div>${infoPanel}
      <div class="dft-perf-row">
        <span class="k">LFSRs</span><span class="v">${lfsrs.length}</span>
        <span class="k">Max-length polynomials</span><span class="v">${goodCount} of ${lfsrs.length}</span>
      </div>
      ${blocks}
    `;
  }

  // ── SIGNATURE COMPACTORS (MISR) ─────────────────────────────
  // Mirror of PATTERN GENERATORS but for the BIST response side. Each
  // MISR shows its current live signature (ms.reg from the engine),
  // an editable goldenSig, and a match / mismatch / no-golden status.
  _renderSignatureCompactors() {
    const allNodes = this._scene?.nodes || [];
    const wires    = this._scene?.wires || [];
    const misrs    = allNodes.filter(n => n.type === 'MISR');

    const headerHtml = `<span class="dft-section-title">SIGNATURE COMPACTORS` +
      `<button class="dft-info-btn" data-action="toggle-info" data-section="misrs" title="What does this section show?">i</button>` +
      `</span>`;
    const infoPanel = this._infoOpen.has('misrs') ? `
      <div class="dft-info-panel">
        <div class="dft-info-lead">MISRs sit at the END of a scan chain and compress the test responses into a compact signature. Comparing it against the pre-computed "golden" value tells you instantly if any fault corrupted the response.</div>
        <div class="dft-info-row">
          <span class="dft-chain-status ok">match</span>
          <span class="dft-info-text">Current signature equals the golden value — no detected fault.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status bad">mismatch</span>
          <span class="dft-info-text">Signatures differ — at least one bit of the response was wrong; a fault is present.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status warn">no golden</span>
          <span class="dft-info-text">No reference signature set yet — capture the current one as the golden value once you trust the design.</span>
        </div>
      </div>` : '';

    // Radix selector — three small toggle pills that let the user
    // flip the value displays (seed / live sig / golden) between
    // binary, decimal, and hex. Editing inputs continue to accept all
    // three formats regardless.
    const radix = this._misrRadix;
    const radixBtn = (r, label) =>
      `<button class="dft-misr-radix-btn${radix === r ? ' active' : ''}"
               data-action="misr-radix" data-radix="${r}"
               title="Display values in ${label}">${label}</button>`;
    const radixSelector = `<span class="dft-misr-radix">` +
      radixBtn('bin', 'BIN') + radixBtn('dec', 'DEC') + radixBtn('hex', 'HEX') +
      `</span>`;

    // Number → display string for the chosen radix. Width arg only
    // matters for binary (zero-padding to N bits).
    const fmtVal = (v, W) => {
      if (radix === 'dec') return String(v >>> 0);
      if (radix === 'hex') return '0x' + (v >>> 0).toString(16);
      return (v >>> 0).toString(2).padStart(W, '0');
    };

    if (misrs.length === 0) {
      return `
        <div class="dft-misrs-header dft-section-header">${headerHtml}</div>${infoPanel}
        <div class="dft-empty">No MISR in scene — drop one (TEST tab) to compress scan-chain responses into a signature.</div>
      `;
    }

    // Engine-side state — ms.reg holds the live signature, populated
    // each tick by the SimulationEngine. Read from the global state
    // bucket the app maintains so the panel doesn't need its own
    // simulation pass.
    const ffStates = window.state?.ffStates;

    const blocks = misrs.map(misr => {
      const W    = Math.max(1, (misr.bitWidth || 4) | 0);
      const mask = (1 << W) - 1;
      const ms   = ffStates?.get?.(misr.id);
      const sig  = (typeof ms?.reg === 'number') ? (ms.reg & mask) : 0;
      const golden = (typeof misr.goldenSig === 'number') ? (misr.goldenSig & mask) : null;

      // Status classifier.
      let cls, label;
      if (golden === null)        { cls = 'warn'; label = 'no golden'; }
      else if (sig === golden)    { cls = 'ok';   label = 'match'; }
      else                        { cls = 'bad';  label = 'mismatch'; }

      // Count wired data inputs — a MISR with no inputs wired is just a
      // standalone LFSR-shaped circuit; flag it.
      let wiredIns = 0;
      for (let i = 0; i < W; i++) {
        if (wires.find(w => w.targetId === misr.id && (w.targetInputIndex || 0) === i)) wiredIns++;
      }

      const blockId = `misr_${misr.id}`;
      const collapsed = this._collapsedBlocks.has(blockId);
      const goldenText = golden === null
        ? `<span class="dft-chain-end-empty">(not set)</span>`
        : `<code>${fmtVal(golden, W)}</code>`;
      return `
        <div class="dft-chain-block${collapsed ? ' collapsed' : ''}" data-block-id="${blockId}">
          <div class="dft-chain-header" title="Click to collapse / expand">
            <span class="dft-chain-toggle">${collapsed ? '▸' : '▾'}</span>
            <span class="dft-chain-title">${misr.label || misr.id}</span>
            <span class="dft-chain-len">${W}-bit</span>
            <span class="dft-chain-status ${cls}">${label}</span>
          </div>
          <div class="dft-lfsr-grid">
            <span class="dft-lfsr-k">width</span>
            ${this._renderMisrField(misr.id, 'bitWidth',
              `<code>${W}</code> <small>bits</small>`,
              { current: W, inputType: 'number', minMax: 'min="1" max="32"',
                hint: 'integer 1–32' })}
            <span class="dft-lfsr-k">seed</span>
            ${this._renderMisrField(misr.id, 'seed',
              `<code>${fmtVal((misr.seed ?? 0) & mask, W)}</code>`,
              { current: '0x' + ((misr.seed ?? 0) & mask).toString(16),
                hint: 'dec, 0xHEX, or 0bBIN — initial state at sim start' })}
            <span class="dft-lfsr-k">taps</span>
            ${this._renderMisrField(misr.id, 'taps',
              `<code>${(misr.taps || []).join(',')}</code> <small>(Fibonacci feedback into bit 0)</small>`,
              { current: (misr.taps || []).join(','),
                hint: 'comma-separated bit positions (0 = LSB)' })}
            <span class="dft-lfsr-k">live sig</span>
            <span class="dft-lfsr-v">
              <code>${fmtVal(sig, W)}</code>
            </span>
            <span class="dft-lfsr-k">golden</span>
            ${this._renderMisrField(misr.id, 'goldenSig',
              goldenText,
              { current: golden === null ? '' : '0x' + golden.toString(16),
                hint: 'dec, 0xHEX, or 0bBIN — leave blank to clear' })}
            <span class="dft-lfsr-k">inputs</span>
            <span class="dft-lfsr-v">
              <code>${wiredIns}</code> <small>of ${W} data pins wired</small>
            </span>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="dft-misrs-header dft-section-header">${headerHtml}</div>${infoPanel}
      <div class="dft-misr-toolbar">
        <span class="dft-misr-toolbar-label">display</span>
        ${radixSelector}
      </div>
      <div class="dft-perf-row">
        <span class="k">MISRs</span><span class="v">${misrs.length}</span>
      </div>
      ${blocks}
    `;
  }

  // Like _renderLfsrField but shared by the MISR pane. Same edit
  // lifecycle (✎ → input + 💾 + ✕) and the same `data-action` keys —
  // the click delegation handles both because we route by data-field.
  _renderMisrField(misrId, field, viewHtml, opts = {}) {
    const key = `${misrId}:${field}`;
    const editing = this._editingFields.has(key);
    if (!editing) {
      return `
        <span class="dft-lfsr-v">
          ${viewHtml}
          <button class="dft-lfsr-edit" data-lfsr-id="${misrId}" data-field="${field}"
                  data-action="lfsr-edit" title="Edit ${field}">✎</button>
        </span>`;
    }
    const inputType = opts.inputType || 'text';
    const minMax    = opts.minMax || '';
    return `
      <span class="dft-lfsr-v">
        <input class="dft-lfsr-input" type="${inputType}" ${minMax}
               data-lfsr-id="${misrId}" data-field="${field}"
               value="${opts.current ?? ''}"
               title="${opts.hint || ''}"
               autofocus>
        <button class="dft-lfsr-save"   data-lfsr-id="${misrId}" data-field="${field}"
                data-action="lfsr-save"   title="Save (Enter)">💾</button>
        <button class="dft-lfsr-cancel" data-lfsr-id="${misrId}" data-field="${field}"
                data-action="lfsr-cancel" title="Cancel (Esc)">✕</button>
        <small class="dft-lfsr-hint">${opts.hint || ''}</small>
      </span>`;
  }

  // ── BIST CONTROLLERS ────────────────────────────────────────
  // One block per BIST_CONTROLLER node — current state name, cycle
  // counter against runLength, golden signature (editable), and a
  // status pill that mirrors the FSM (idle / running / pass / fail).
  _renderBistControllers() {
    const allNodes = this._scene?.nodes || [];
    const ctls     = allNodes.filter(n => n.type === 'BIST_CONTROLLER');

    const headerHtml = `<span class="dft-section-title">BIST CONTROLLERS` +
      `<button class="dft-info-btn" data-action="toggle-info" data-section="bist" title="What does this section show?">i</button>` +
      `</span>`;
    const infoPanel = this._infoOpen.has('bist') ? `
      <div class="dft-info-panel">
        <div class="dft-info-lead">Each BIST_CONTROLLER orchestrates one self-test run: assert TEST_MODE for runLength cycles while LFSR + MISR do their work, then compare the captured signature to the golden value and latch PASS or FAIL.</div>
        <div class="dft-info-row">
          <span class="dft-chain-status warn">idle</span>
          <span class="dft-info-text">Waiting for START. Pulse the START input to begin the run.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status warn">running</span>
          <span class="dft-info-text">In SETUP / RUN — TEST_MODE high, cycle counter advancing toward runLength.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status ok">pass</span>
          <span class="dft-info-text">Run completed and the captured MISR signature matched goldenSig — design is fault-free under this test.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status bad">fail</span>
          <span class="dft-info-text">Captured signature didn't match — at least one fault sensitised by the test.</span>
        </div>
      </div>` : '';

    if (ctls.length === 0) {
      return `
        <div class="dft-bist-header dft-section-header">${headerHtml}</div>${infoPanel}
        <div class="dft-empty">No BIST_CONTROLLER in scene — drop one (TEST tab) to sequence a self-test run end-to-end.</div>
      `;
    }

    const ffStates = window.state?.ffStates;
    const STATE_NAMES = ['IDLE', 'SETUP', 'RUN', 'COMPARE', 'DONE', 'FAIL'];
    const radix = this._misrRadix;
    const fmtVal = (v, W) => {
      if (radix === 'dec') return String(v >>> 0);
      if (radix === 'hex') return '0x' + (v >>> 0).toString(16);
      return (v >>> 0).toString(2).padStart(W, '0');
    };

    const blocks = ctls.map(ctl => {
      const sigBits = Math.max(1, (ctl.sigBits | 0) || 4);
      const runLen  = Math.max(1, (ctl.runLength | 0) || 16);
      const golden  = (ctl.goldenSig | 0) & ((1 << sigBits) - 1);
      const ms      = ffStates?.get?.(ctl.id);
      const stateN  = (ms && typeof ms.bistState === 'number') ? ms.bistState : 0;
      const cycles  = (ms && typeof ms.cycleCount === 'number') ? ms.cycleCount : 0;
      const sName   = STATE_NAMES[stateN] || '?';

      let cls, label;
      if (stateN === 4)      { cls = 'ok';   label = 'pass'; }
      else if (stateN === 5) { cls = 'bad';  label = 'fail'; }
      else if (stateN === 0) { cls = 'warn'; label = 'idle'; }
      else                   { cls = 'warn'; label = 'running'; }

      const blockId = `bist_${ctl.id}`;
      const collapsed = this._collapsedBlocks.has(blockId);
      return `
        <div class="dft-chain-block${collapsed ? ' collapsed' : ''}" data-block-id="${blockId}">
          <div class="dft-chain-header" title="Click to collapse / expand">
            <span class="dft-chain-toggle">${collapsed ? '▸' : '▾'}</span>
            <span class="dft-chain-title">${ctl.label || ctl.id}</span>
            <span class="dft-chain-len">${sigBits}-bit sig · ${runLen}-cycle run</span>
            <span class="dft-chain-status ${cls}">${label}</span>
          </div>
          <div class="dft-lfsr-grid">
            <span class="dft-lfsr-k">state</span>
            <span class="dft-lfsr-v">
              <code>${sName}</code> <small>(code ${stateN})</small>
            </span>
            <span class="dft-lfsr-k">cycle</span>
            <span class="dft-lfsr-v">
              <code>${cycles}</code> <small>of ${runLen}${stateN === 2 ? ' (RUN in progress)' : ''}</small>
            </span>
            <span class="dft-lfsr-k">runLength</span>
            ${this._renderMisrField(ctl.id, 'runLength',
              `<code>${runLen}</code> <small>cycles per RUN phase</small>`,
              { current: runLen, inputType: 'number', minMax: 'min="1" max="65535"',
                hint: 'integer ≥ 1' })}
            <span class="dft-lfsr-k">golden</span>
            ${this._renderMisrField(ctl.id, 'goldenSig',
              `<code>${fmtVal(golden, sigBits)}</code>`,
              { current: '0x' + golden.toString(16),
                hint: 'dec, 0xHEX, or 0bBIN — expected MISR sig at end of RUN' })}
            <span class="dft-lfsr-k">sigBits</span>
            <span class="dft-lfsr-v">
              <code>${sigBits}</code> <small>bits — set to match the connected MISR's width</small>
            </span>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="dft-bist-header dft-section-header">${headerHtml}</div>${infoPanel}
      <div class="dft-perf-row">
        <span class="k">Controllers</span><span class="v">${ctls.length}</span>
      </div>
      ${blocks}
    `;
  }

  // ── JTAG TAPS (Layer 7) ────────────────────────────────────
  // One block per JTAG_TAP node: current TAP state name (one of 16),
  // IR + DR contents, IDCODE, and how many BOUNDARY_SCAN_CELLs sit
  // in the current scene.
  _renderJtagTaps() {
    const allNodes = this._scene?.nodes || [];
    const taps     = allNodes.filter(n => n.type === 'JTAG_TAP');
    const bscCount = allNodes.filter(n => n.type === 'BOUNDARY_SCAN_CELL').length;

    const headerHtml = `<span class="dft-section-title">JTAG TAPS` +
      `<button class="dft-info-btn" data-action="toggle-info" data-section="jtag" title="What does this section show?">i</button>` +
      `</span>`;
    const infoPanel = this._infoOpen.has('jtag') ? `
      <div class="dft-info-panel">
        <div class="dft-info-lead">Each JTAG TAP runs the IEEE 1149.1 16-state FSM. TMS on posedge TCK walks states; Shift-IR/DR clock TDI through the IR / DR registers and emit TDO. Boundary-scan cells form the chain that lets a tester poke and read every IO pin.</div>
        <div class="dft-info-row">
          <span class="dft-chain-status warn">TLR</span>
          <span class="dft-info-text">Test-Logic-Reset — TAP idle, IR cleared. Reached after 5×TMS=1 from anywhere.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status ok">Shift-DR/IR</span>
          <span class="dft-info-text">Active shifting — TDI is being clocked into the chain, TDO emits the LSB.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status warn">Update-*</span>
          <span class="dft-info-text">Latch the shifted value into the parallel hold register (e.g. boundary-scan cell update).</span>
        </div>
      </div>` : '';

    if (taps.length === 0) {
      return `
        <div class="dft-jtag-header dft-section-header">${headerHtml}</div>${infoPanel}
        <div class="dft-empty">No JTAG_TAP in scene — drop one (TEST tab) to drive boundary-scan / debug-test pins (TCK / TMS / TDI / TRST → TDO).</div>
      `;
    }

    const STATE_NAMES = [
      'Test-Logic-Reset', 'Run-Test/Idle',
      'Select-DR', 'Capture-DR', 'Shift-DR', 'Exit1-DR', 'Pause-DR', 'Exit2-DR', 'Update-DR',
      'Select-IR', 'Capture-IR', 'Shift-IR', 'Exit1-IR', 'Pause-IR', 'Exit2-IR', 'Update-IR',
    ];
    const ffStates = window.state?.ffStates;
    const radix = this._misrRadix;
    const fmtVal = (v, W) => {
      if (radix === 'dec') return String(v >>> 0);
      if (radix === 'hex') return '0x' + (v >>> 0).toString(16);
      return (v >>> 0).toString(2).padStart(W, '0');
    };

    const blocks = taps.map(tap => {
      const irBits = Math.max(1, (tap.irBits | 0) || 4);
      const ms     = ffStates?.get?.(tap.id);
      const stateN = (ms && typeof ms.tapState === 'number') ? ms.tapState : 0;
      const sName  = STATE_NAMES[stateN] || '?';
      const ir     = (ms && typeof ms.ir === 'number') ? ms.ir : 0;
      const dr     = (ms && typeof ms.dr === 'number') ? ms.dr : 0;
      const idcode = (tap.idcode | 0) >>> 0;

      let cls, label;
      if (stateN === 4 || stateN === 11)        { cls = 'ok';   label = 'shifting'; }
      else if (stateN === 0)                    { cls = 'warn'; label = 'TLR'; }
      else if (stateN === 8 || stateN === 15)   { cls = 'warn'; label = 'updated'; }
      else                                      { cls = 'warn'; label = 'idle'; }

      const blockId = `jtag_${tap.id}`;
      const collapsed = this._collapsedBlocks.has(blockId);
      return `
        <div class="dft-chain-block${collapsed ? ' collapsed' : ''}" data-block-id="${blockId}">
          <div class="dft-chain-header" title="Click to collapse / expand">
            <span class="dft-chain-toggle">${collapsed ? '▸' : '▾'}</span>
            <span class="dft-chain-title">${tap.label || tap.id}</span>
            <span class="dft-chain-len">${irBits}-bit IR · 32-bit DR</span>
            <span class="dft-chain-status ${cls}">${label}</span>
          </div>
          <div class="dft-lfsr-grid">
            <span class="dft-lfsr-k">state</span>
            <span class="dft-lfsr-v">
              <code>${sName}</code> <small>(code ${stateN})</small>
            </span>
            <span class="dft-lfsr-k">IR</span>
            <span class="dft-lfsr-v">
              <code>${fmtVal(ir, irBits)}</code> <small>${irBits}-bit instruction</small>
            </span>
            <span class="dft-lfsr-k">DR</span>
            <span class="dft-lfsr-v">
              <code>${fmtVal(dr, 32)}</code> <small>32-bit data shift</small>
            </span>
            <span class="dft-lfsr-k">irBits</span>
            ${this._renderMisrField(tap.id, 'irBits',
              `<code>${irBits}</code>`,
              { current: irBits, inputType: 'number', minMax: 'min="1" max="16"',
                hint: 'IR width — 4–8 typical' })}
            <span class="dft-lfsr-k">IDCODE</span>
            ${this._renderMisrField(tap.id, 'idcode',
              `<code>0x${idcode.toString(16).padStart(8, '0')}</code>`,
              { current: '0x' + idcode.toString(16),
                hint: 'dec, 0xHEX, or 0bBIN — 32-bit JEP-106 device code' })}
            <span class="dft-lfsr-k">BSCs</span>
            <span class="dft-lfsr-v">
              <code>${bscCount}</code> <small>boundary-scan cells in scene</small>
            </span>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="dft-jtag-header dft-section-header">${headerHtml}</div>${infoPanel}
      <div class="dft-perf-row">
        <span class="k">TAP controllers</span><span class="v">${taps.length}</span>
      </div>
      ${blocks}
    `;
  }

  // ── FAULT LIST ──────────────────────────────────────────────
  _renderFaultList(wires) {
    // Section header + ⓘ legend for the fault model abbreviations.
    // Same shape as Pattern Generators / Scan Chains; reuses the
    // shared .dft-info-panel styling.
    const flHeader = `<span class="dft-section-title">FAULT LIST` +
      `<button class="dft-info-btn" data-action="toggle-info" data-section="faultlist" title="What do the column names mean?">i</button>` +
      `</span>`;
    const flInfoPanel = this._infoOpen.has('faultlist') ? `
      <div class="dft-info-panel">
        <div class="dft-info-lead">Every wire is a potential fault site. The four columns are the fault models the simulator can inject; "injected" shows which are currently active.</div>
        <div class="dft-info-row">
          <span class="dft-chain-status warn">s-a-0 / s-a-1</span>
          <span class="dft-info-text">Stuck-at fault — the wire is forced to 0 (or 1) regardless of its driver.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status bad">open</span>
          <span class="dft-info-text">Wire severed; downstream sees null / undefined.</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status bad">bridge</span>
          <span class="dft-info-text">Wire shorted to another; both nets converge to one (typically AND-style).</span>
        </div>
        <div class="dft-info-row">
          <span class="dft-chain-status ok">injected</span>
          <span class="dft-info-text">✓ when a fault is currently active on this wire (you toggled it on).</span>
        </div>
      </div>
    ` : '';

    if (!wires.length) {
      return `
        <div class="dft-faultlist-header dft-section-header">${flHeader}</div>${flInfoPanel}
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
      <div class="dft-faultlist-header dft-section-header">${flHeader}</div>${flInfoPanel}
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
      // Re-apply collapsed state from prior render (the wrapper DOM
      // is rebuilt from scratch on every _render, so the class needs
      // to be re-added from this._collapsedSections).
      if (this._collapsedSections.has(section.dataset.section)) {
        section.classList.add('dft-section-collapsed');
      }
      if (!h.querySelector('.dft-section-toggle')) {
        const toggle = document.createElement('span');
        toggle.className = 'dft-section-toggle';
        toggle.textContent = section.classList.contains('dft-section-collapsed') ? '▸' : '▾';
        h.appendChild(toggle);
      }
      // Click handlers for collapse + per-block toggle live on
      // _body's delegated mousedown listener (bound once in init) so
      // they survive the per-tick re-render.
    });
  }
}
