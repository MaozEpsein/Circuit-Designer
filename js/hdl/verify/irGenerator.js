// Phase 13 — constraint-satisfying random IR generator.
//
// Produces well-typed IRModules from a seed + budget. Every output
// satisfies:
//   • Every net has exactly one driver.
//   • Every port and every gate input is connected.
//   • Every expression's width is resolvable (single-bit only for
//     this generator, so width arithmetic stays trivial).
//
// Strategy is constraint-driven, not blind random:
//   1. Pick `nIn` input ports + `nOut` output ports.
//   2. Pick `nGate` primitive gate instances. For each gate, sample
//      its inputs from the pool of already-driven nets (input ports +
//      previously-emitted gates).
//   3. Each output port chooses a random driver from the gate pool
//      (or, when no gates were generated, a random input port).
//   4. Names use a deterministic prefix + ordinal so two generations
//      with the same seed produce byte-identical IRs.
//
// The generator does NOT attempt arithmetic / sequential logic /
// memories — Phase 13 fuzz aims to stress the most-exercised paths
// (gate primitives, port wiring, IR equality), not every IR shape.

import {
  IR_KIND, NET_KIND, PORT_DIR,
  makeModule, makePort, makeNet, makeInstance, makeRef,
} from '../ir/types.js';

// Tiny seeded PRNG (Mulberry32). Pure, deterministic, no Node deps.
function _rng(seed) {
  let s = (seed >>> 0) || 0xdeadbeef;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function _pick(arr, rand) { return arr[(rand() * arr.length) | 0]; }
function _intRange(rand, lo, hi) { return lo + ((rand() * (hi - lo + 1)) | 0); }

// Pool of primitive gate types we can lower without spec width care.
const PRIMS_TWO_INPUT = ['and', 'or', 'xor', 'nand', 'nor', 'xnor'];
const PRIMS_ONE_INPUT = ['not', 'buf'];

/**
 * generateIR(seed, opts) → IRModule
 *   seed:   integer (any 32-bit value)
 *   opts:
 *     maxInputs   default 6
 *     maxOutputs  default 4
 *     maxGates    default 32
 *     name        default `gen_<seed>`
 */
export function generateIR(seed = 0x1234, opts = {}) {
  const rand = _rng(seed);
  const maxInputs  = opts.maxInputs  || 6;
  const maxOutputs = opts.maxOutputs || 4;
  const maxGates   = opts.maxGates   || 32;

  const nIn   = _intRange(rand, 2, maxInputs);
  const nOut  = _intRange(rand, 1, maxOutputs);
  const nGate = _intRange(rand, 1, maxGates);

  // ── 1. Ports + their backing nets ─────────────────────────
  const ports = [];
  const nets  = [];
  const driverPool = [];   // names of nets driven so far
  for (let i = 0; i < nIn; i++) {
    const name = `i${i}`;
    ports.push(makePort({ name, dir: PORT_DIR.INPUT, width: 1 }));
    driverPool.push(name);
  }
  for (let i = 0; i < nOut; i++) {
    const name = `o${i}`;
    ports.push(makePort({ name, dir: PORT_DIR.OUTPUT, width: 1 }));
    // Output nets are driven LAST (step 3); not in driverPool until
    // we wire each one to a chosen source.
  }

  // ── 2. Primitive gate instances ───────────────────────────
  const instances = [];
  for (let i = 0; i < nGate; i++) {
    const yName = `g${i}_y`;
    nets.push(makeNet({ name: yName, originalName: yName, width: 1, kind: NET_KIND.WIRE }));
    const isUnary = rand() < 0.2;
    const type = isUnary ? _pick(PRIMS_ONE_INPUT, rand) : _pick(PRIMS_TWO_INPUT, rand);
    const aName = _pick(driverPool, rand);
    const bName = isUnary ? null : _pick(driverPool, rand);
    const portMap = isUnary
      ? { Y: makeRef(yName, 1), A: makeRef(aName, 1) }
      : { Y: makeRef(yName, 1), A: makeRef(aName, 1), B: makeRef(bName, 1) };
    const portOrder = isUnary ? ['Y', 'A'] : ['Y', 'A', 'B'];
    const inst = makeInstance({
      type, instanceName: `g${i}`, portMap, params: {},
    });
    inst.isPrimitive = true;
    inst.portOrder   = portOrder;
    instances.push(inst);
    driverPool.push(yName);
  }

  // ── 3. Wire each output port to a random gate (or input if no
  //      gates were generated this round).
  const assigns = [];
  for (let i = 0; i < nOut; i++) {
    const src = _pick(driverPool, rand);
    assigns.push({
      kind: 'Assign', sourceRef: null, attributes: [],
      lhs: makeRef(`o${i}`, 1),
      rhs: makeRef(src, 1),
    });
  }

  return makeModule({
    name: opts.name || `gen_${(seed >>> 0).toString(16)}`,
    ports, nets, instances, assigns, alwaysBlocks: [], memories: [],
  });
}

/**
 * Small synchronous validator — used by the fuzz suite to assert
 * "well-typed" before round-tripping. Returns an array of complaints;
 * empty means well-typed.
 */
export function validateGeneratedIR(ir) {
  const probs = [];
  const declared = new Set([
    ...(ir.ports || []).filter(p => p.dir === PORT_DIR.INPUT).map(p => p.name),
    ...(ir.nets  || []).map(n => n.name),
  ]);
  // Every gate output must be a declared net.
  for (const inst of (ir.instances || [])) {
    const yExpr = inst.portMap?.Y;
    if (yExpr?.kind !== IR_KIND.Ref || !declared.has(yExpr.netName)) {
      probs.push(`gate ${inst.instanceName} drives undeclared net`);
    }
  }
  // Every assign LHS must be an OUTPUT port; RHS must reference a driver.
  const outs = new Set((ir.ports || [])
    .filter(p => p.dir === PORT_DIR.OUTPUT).map(p => p.name));
  for (const a of (ir.assigns || [])) {
    if (!outs.has(a.lhs?.netName)) probs.push(`assign LHS ${a.lhs?.netName} is not an output`);
    if (a.rhs?.kind !== IR_KIND.Ref) probs.push('assign RHS is not a Ref');
    else if (!declared.has(a.rhs.netName))
      probs.push(`assign RHS references undeclared net ${a.rhs.netName}`);
  }
  return probs;
}
