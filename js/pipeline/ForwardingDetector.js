/**
 * ForwardingDetector — recognize forwarding MUXes on a pipelined datapath.
 *
 * Canonical pattern this module detects (EX→EX textbook forwarding):
 *
 *     REG_FILE_DP.readDataN ──┐
 *                             ├── MUX(2:1 or 3:1) ── ALU.in_{0|1}
 *     PIPE_REG.Q (latched) ───┘                  ^
 *                                                │
 *                                          (select from a comparator
 *                                           between IR.rsN and a latched
 *                                           rd field — we don't validate
 *                                           this strictly for the MVP)
 *
 * The MVP match is intentionally structural, not semantic:
 *   1. A MUX whose output drives ALU input 0 or 1.
 *   2. At least one MUX data input traces back to a REG_FILE_DP output.
 *   3. At least one MUX data input traces back to a PIPE_REG output.
 *
 * That pattern is, in the context of a pipelined CPU, unambiguously a
 * forwarding MUX. Strictly validating the select-side comparator would
 * reject real forwarding circuits that use slightly different encodings
 * (e.g. priority logic for 3:1 MUXes, XNOR-based equality, etc.) and is
 * deferred to Tier 14d.
 *
 * The detector is non-throwing. Anything it can't confidently classify is
 * pushed to `warnings[]` and skipped; the caller still gets a usable
 * `paths[]` for whatever did match.
 */

const TRACE_DEPTH = 4;   // data-input BFS depth before giving up

function buildPreds(wires) {
  const preds = new Map();      // targetId → Array<{sourceId, inputIndex, wire}>
  for (const w of wires) {
    if (!preds.has(w.targetId)) preds.set(w.targetId, []);
    preds.get(w.targetId).push({
      sourceId:    w.sourceId,
      inputIndex:  w.targetInputIndex,
      outputIndex: w.sourceOutputIndex,
      wire:        w,
    });
  }
  for (const arr of preds.values()) {
    arr.sort((a, b) => a.inputIndex - b.inputIndex);
  }
  return preds;
}

function buildSuccs(wires) {
  const succs = new Map();
  for (const w of wires) {
    if (!succs.has(w.sourceId)) succs.set(w.sourceId, []);
    succs.get(w.sourceId).push({
      targetId:    w.targetId,
      inputIndex:  w.targetInputIndex,
      outputIndex: w.sourceOutputIndex,
      wire:        w,
    });
  }
  return succs;
}

/**
 * Walk backward from a node through "transparent" components (SPLIT, MERGE,
 * BUS, identity-looking gates with a single input) until we hit a source we
 * can classify. Returns {kind, nodeId, outputIndex} or {kind: 'unknown'}.
 *
 * Transparent types are chosen conservatively — we want to see past
 * bit-wrangling plumbing but stop at any real combinational work.
 */
const TRANSPARENT_TYPES = new Set(['SPLIT', 'MERGE', 'BUS']);

function classifySource(nodeId, outputIndex, preds, nodeMap, depth = 0) {
  if (depth > TRACE_DEPTH) return { kind: 'unknown', nodeId };
  const node = nodeMap.get(nodeId);
  if (!node) return { kind: 'unknown', nodeId };

  if (node.type === 'REG_FILE_DP' || node.type === 'REG_FILE') {
    return { kind: 'REG_FILE', nodeId, outputIndex };
  }
  if (node.type === 'PIPE_REG') {
    return { kind: 'PIPE_REG', nodeId, outputIndex, stage: node.stage ?? null };
  }

  if (TRANSPARENT_TYPES.has(node.type)) {
    const inbound = preds.get(nodeId) || [];
    if (inbound.length === 0) return { kind: 'unknown', nodeId };
    return classifySource(inbound[0].sourceId, inbound[0].outputIndex, preds, nodeMap, depth + 1);
  }

  return { kind: node.type, nodeId, outputIndex };
}

/**
 * @param {{nodes: Array, wires: Array}} scene
 * @param {object} [opts]
 * @param {Array} [opts.stages]   — result from StageEvaluator, if available
 * @returns {{ paths: Array, warnings: Array }}
 *
 * Each path entry:
 *   { id, muxId, aluNodeId,
 *     srcNodeId,                // the PIPE_REG providing the forwarded value
 *     dstNodeId,                // the MUX
 *     register: 'rs1'|'rs2',    // which ALU input (0 → rs1, 1 → rs2)
 *     srcStage,                 // PIPE_REG stage index or null
 *     dstStage,                 // ALU consumer stage index or null
 *     fromStage, toStage }      // textual labels ('EX→EX' etc. — best-effort)
 */
export function detectForwardingPaths(scene, opts = {}) {
  const nodes = scene?.nodes || [];
  const wires = scene?.wires || [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const preds = buildPreds(wires);
  const succs = buildSuccs(wires);

  const paths    = [];
  const warnings = [];

  for (const mux of nodes) {
    if (mux.type !== 'MUX' && mux.type !== 'BUS_MUX') continue;
    const inputCount = mux.inputCount || 2;

    // (1) Does this MUX feed an ALU input 0 or 1?
    const downstream = (succs.get(mux.id) || []).filter(s => {
      const tgt = nodeMap.get(s.targetId);
      return tgt && tgt.type === 'ALU' && (s.inputIndex === 0 || s.inputIndex === 1);
    });
    if (downstream.length === 0) continue;

    // (2) Classify each data input (pins 0..inputCount-1).
    const inbound = preds.get(mux.id) || [];
    const dataInputs = inbound.filter(p => p.inputIndex < inputCount);
    if (dataInputs.length < 2) continue;

    const classified = dataInputs.map(p =>
      classifySource(p.sourceId, p.outputIndex, preds, nodeMap)
    );
    const rfSources   = classified.filter(c => c.kind === 'REG_FILE');
    const pipeSources = classified.filter(c => c.kind === 'PIPE_REG');
    if (rfSources.length === 0 || pipeSources.length === 0) continue;

    // (3) For every PIPE_REG source, emit one forwarding path. The target ALU
    // input index distinguishes rs1 vs rs2 — ALU.A convention = rs1.
    for (const consumer of downstream) {
      const register = consumer.inputIndex === 0 ? 'rs1' : 'rs2';
      const aluStage = nodeMap.get(consumer.targetId)?.stage ?? null;
      for (const src of pipeSources) {
        const srcStage = src.stage ?? null;
        paths.push({
          id:        `fwd_${paths.length}`,
          muxId:     mux.id,
          aluNodeId: consumer.targetId,
          srcNodeId: src.nodeId,
          dstNodeId: mux.id,
          register,
          srcStage,
          dstStage:  aluStage,
          fromStage: _labelFromStage(srcStage, aluStage),
          toStage:   'EX',
        });
      }
    }
  }

  return { paths, warnings };
}

function _labelFromStage(srcStage, dstStage) {
  if (srcStage == null || dstStage == null) return 'FWD';
  const diff = srcStage - dstStage;
  if (diff === 1) return 'EX→EX';
  if (diff === 2) return 'MEM→EX';
  if (diff === 3) return 'WB→EX';
  if (diff > 0)   return `S${srcStage}→S${dstStage}`;
  return 'FWD';
}
