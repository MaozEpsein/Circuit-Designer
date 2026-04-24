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
import * as Telemetry from './Telemetry.js';

export class PipelineAnalyzer {
  constructor(scene) {
    this._scene = scene;
    this._cache = null;
    this._dirty = true;
    this._warnedUnknown = new Set();   // types we've already warned about

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
      h.bubbles              = 0;
    } else {
      h.resolvedByForwarding = false;
      h.forwardingPathId     = null;
    }
  }
}
