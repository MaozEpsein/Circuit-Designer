/**
 * PipelineAnalyzer — public API for pipeline analysis.
 * Wraps StageEvaluator with cache + EventBus integration.
 * UI consumers should call analyze() and subscribe to 'pipeline:analyzed'.
 */
import { bus } from '../core/EventBus.js';
import { evaluate } from './StageEvaluator.js';
import { detectHazards } from './HazardDetector.js';
import { decodeROM, findRomNode } from './InstructionDecoder.js';
import { detectProgramHazards } from './ProgramHazardDetector.js';
import { detectLoops } from './LoopAnalyzer.js';
import { inferIsa } from './isa/IsaInference.js';
import { DEFAULT_ISA } from './isa/default.js';
import { detectForwardingPaths } from './ForwardingDetector.js';
import { detectCdc } from './CdcDetector.js';
import { checkLip } from './LipChecker.js';
import { computeMetrics } from './PerformanceMetrics.js';
import { scheduleProgram } from './PipelineScheduler.js';
import { predictorById } from './BranchPredictor.js';
import * as Telemetry from './Telemetry.js';

export class PipelineAnalyzer {
  constructor(scene) {
    this._scene = scene;
    this._cache = null;
    this._dirty = true;
    this._warnedUnknown = new Set();   // types we've already warned about
    this._predictorId = 'static-nt';   // Phase-15: branch predictor visualizer

    const invalidate = () => { this._dirty = true; };
    bus.on('node:added', invalidate);
    bus.on('node:removed', invalidate);
    bus.on('wire:added', invalidate);
    bus.on('wire:removed', invalidate);
    bus.on('scene:loaded', invalidate);
    bus.on('scene:cleared', invalidate);
    // Property edits can change the analysis result — ROM memory (instructions
    // change → program hazards change), PIPE_REG channels (pin count →
    // stall/flush badge detection), IR bit-layout fields, etc. Always invalidate;
    // recomputing is cheap and beats missing a hazard the user just introduced.
    bus.on('node:props-changed', invalidate);
  }

  analyze({ force = false } = {}) {
    if (!force && !this._dirty && this._cache) return this._cache;
    Telemetry.bump({ analyses: 1, ...(force ? { analysesForced: 1 } : {}) });
    this._cache = evaluate(this._scene);
    this._cache.hazards = detectHazards(this._scene);
    // Program-level hazards — only meaningful if the scene has a ROM carrying
    // a decoded instruction stream. Absent ROM → empty list, no UI section.
    // Phase 14a: ISA is inferred from the scene's CU+IR rather than hard-coded,
    // falling back to DEFAULT_ISA for SUB_CIRCUIT CUs or scenes missing CU/IR.
    const rom = findRomNode(this._scene);
    const isa = inferIsa(this._scene) || DEFAULT_ISA;
    this._cache.isa             = isa;
    this._cache.instructions    = rom ? decodeROM(rom, isa) : [];
    this._cache.loops           = detectLoops(this._cache.instructions);
    this._cache.programHazards  = detectProgramHazards(this._cache.instructions, isa, { loops: this._cache.loops });
    this._cache.hasProgram      = this._cache.instructions.length > 0;

    // Phase 14b: forwarding detection runs on the same scene. When a RAW
    // program hazard has a matching forwarding path, we mark it resolved and
    // zero its bubble count — load-use is specifically never resolvable by
    // forwarding alone (the loaded value doesn't exist at EX time).
    const fwd = detectForwardingPaths(this._scene);
    this._cache.forwardingPaths    = fwd.paths;
    this._cache.forwardingWarnings = fwd.warnings;
    _annotateHazardsWithForwarding(this._cache.programHazards, fwd.paths);

    // Phase 13 stretch: clock-domain-crossing awareness. Single-clock scenes
    // short-circuit, so this is free for the common case.
    this._cache.cdc = detectCdc(this._scene);
    this._cache.lip = checkLip(this._scene);

    // Phase-extension: performance metrics aggregated from everything above.
    this._cache.metrics = computeMetrics(this._cache);

    // Gantt-style pipeline schedule (instruction × cycle) for the DIAGRAM
    // panel. Built from the already-annotated program hazards so stall
    // counts match the PERFORMANCE numbers exactly. Null when no ROM.
    // Phase-15 (Branch predictor visualizer, Phase 2). The selected predictor
    // is fed *into* the scheduler — it drives loop unrolling and per-row
    // flush counts. After scheduling, we read the predictor's accumulated
    // state out for the BRANCH PREDICTOR panel.
    let predictor = null;
    let PredictorClass = null;
    if (this._cache.hasProgram) {
      // Predictor priority:
      //   1. Panel "what-if" override (set via setPredictor) — transient,
      //      cleared when the user commits a change to the CU.
      //   2. CU node's branchPredictor prop — persistent design choice.
      //   3. Legacy default fallback.
      const cuNode = this._scene.nodes?.find(n => n.type === 'CU');
      const predictorId = this._predictorOverride
        || cuNode?.branchPredictor
        || this._predictorId;
      PredictorClass = predictorById(predictorId);
      predictor = new PredictorClass();
    }

    this._cache.schedule = this._cache.hasProgram
      ? scheduleProgram(this._cache.instructions, this._cache.programHazards, isa, {
          loops:     this._cache.loops,
          predictor,
        })
      : null;

    if (predictor) {
      const entries = predictor.getEntries();
      let totalHits = 0, totalBranches = 0;
      for (const e of entries) { totalHits += e.hits; totalBranches += e.total; }
      this._cache.predictor = {
        id:         PredictorClass.id,
        name:       PredictorClass.name,
        available:  [{ id: 'static-nt',   name: 'Static Not-Taken' },
                     { id: 'static-btfn', name: 'Static BTFN' },
                     { id: '1bit',        name: '1-bit (last-outcome)' },
                     { id: '2bit',        name: '2-bit saturating counter' }],
        entries,
        totalBranches,
        totalHits,
        hitRate: totalBranches > 0 ? (totalHits / totalBranches) : 0,
      };
    } else {
      this._cache.predictor = null;
    }

    this._dirty = false;
    // Warn once per unknown type — prompts the designer to update DelayModel.js.
    for (const t of (this._cache.unknownTypes || [])) {
      if (!this._warnedUnknown.has(t)) {
        this._warnedUnknown.add(t);
        console.warn(`[Pipeline] unknown component type '${t}' — add it to js/pipeline/DelayModel.js (falling back to 100 ps)`);
      }
    }
    bus.emit('pipeline:analyzed', this._cache);
    return this._cache;
  }

  invalidate() { this._dirty = true; }

  setPredictor(id) {
    if (id === this._predictorId) return;
    this._predictorId = id;
    this._dirty = true;
    this.analyze({ force: true });
  }

  /** Transient "what-if" preview — wins over the CU node until cleared. */
  setPredictorOverride(id) {
    this._predictorOverride = id || null;
    this._dirty = true;
    this.analyze({ force: true });
  }
  clearPredictorOverride() {
    if (!this._predictorOverride) return;
    this._predictorOverride = null;
    this._dirty = true;
    this.analyze({ force: true });
  }

  /**
   * Phase 15 Phase 3 — run every available predictor against the current
   * decoded program and return their relative performance. Read-only: does
   * NOT change the currently-selected predictor.
   *
   * Returns: [{ id, name, branches, hits, misses, hitRate, cycles, cpi }]
   * sorted by cycles ascending. `null` when there is no program.
   */
  comparePredictors() {
    if (!this._cache?.hasProgram) return null;
    const isa = this._cache.isa;
    const PredictorClasses = [
      predictorById('static-nt'),
      predictorById('static-btfn'),
      predictorById('1bit'),
      predictorById('2bit'),
    ];
    const results = PredictorClasses.map(Cls => {
      const p = new Cls();
      const sch = scheduleProgram(this._cache.instructions, this._cache.programHazards, isa, {
        loops:     this._cache.loops,
        predictor: p,
      });
      let branches = 0, misses = 0;
      for (const row of (sch?.rows || [])) {
        if (row.predicted === null) continue;
        branches++;
        if (row.mispredict) misses++;
      }
      const hits   = branches - misses;
      const cycles = sch?.totalCycles ?? 0;
      const instr  = sch?.rows?.length ?? 0;
      const cpi    = instr > 0 ? cycles / instr : 0;
      return {
        id:       Cls.id,
        name:     Cls.name,
        branches, hits, misses,
        hitRate:  branches > 0 ? hits / branches : 0,
        cycles, cpi,
      };
    });
    results.sort((a, b) => a.cycles - b.cycles);
    return results;
  }
}

/**
 * Stamp `resolvedByForwarding` + `forwardingPathId` on each RAW hazard. The
 * MVP rule: *any* detected forwarding path that targets EX resolves *any*
 * non-load-use RAW. This is deliberately coarse — validating that the
 * specific path covers the exact (instI, instJ, register) triple is Tier 14d.
 * Load-use (producer is a LOAD at j-i=1) is never flipped: the loaded value
 * doesn't exist at EX time, so forwarding from the MEM stage is too late.
 */
function _annotateHazardsWithForwarding(hazards, paths) {
  if (!Array.isArray(hazards)) return;
  const hasExForwarding = paths.some(p => p.toStage === 'EX');
  for (const h of hazards) {
    if (h.type !== 'RAW' || h.loadUse) {
      h.resolvedByForwarding = false;
      h.forwardingPathId     = null;
      continue;
    }
    if (hasExForwarding) {
      const match = paths.find(p => p.toStage === 'EX');
      h.resolvedByForwarding = true;
      h.forwardingPathId     = match.id;
      h.bubblesOriginal      = h.bubbles;
      h.bubbles              = 0;
    } else {
      h.resolvedByForwarding = false;
      h.forwardingPathId     = null;
    }
  }
}
