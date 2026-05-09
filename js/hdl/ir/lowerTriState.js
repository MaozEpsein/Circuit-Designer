// lowerTriState — IR pass that converts internal multi-driver tri-state
// patterns into a single one-hot priority MUX assign. Modern synthesis
// flows (Yosys, Vivado, Quartus) reject internal tri-state — only
// top-level `inout` ports keep `1'bz`. See SEMANTICS.md ("Tri-state").
//
// Detection rule:
//   • Group continuous assigns by LHS net name.
//   • If a single net has multiple assigns AND at least one of them
//     uses a `1'bz`-style verbatim literal, collapse the group into a
//     single priority chain ("first non-Z driver wins").
//
// What this pass DOES NOT touch (and why that's OK):
//   • Translators that already emit a single inlined ternary chain
//     (BUS translator — see js/hdl/translators/cpu.js). The pass sees
//     one assign for those and leaves them alone.
//   • TRIBUF whose output net has only ONE driver — the ternary stays
//     (single-driver tri-state in Verilog is fine for top-level pads).
//
// `synthesisSafe: false` — when the caller passes this flag (via
// `fromCircuit`'s options), the pass is skipped and the IR keeps its
// raw tri-state assigns. The exporter emits a leading `// WARNING`
// comment so users know the output is simulation-only.

import { IR_KIND, makeTernary, makeRef, makeLiteral } from './types.js';

/** True for IR Literal nodes that the pretty-printer emits as `N'bz`. */
function _isHighZLiteral(expr) {
  if (!expr) return false;
  if (expr.kind !== IR_KIND.Literal) return false;
  return typeof expr._verilog === 'string' && /['"]?\d*'b?[zZ]/.test(expr._verilog);
}

/** True for ternaries whose ELSE branch is a high-Z literal. The
 *  conventional shape produced by TRIBUF: `en ? data : 1'bz`. */
function _isTriBufTernary(expr) {
  return expr && expr.kind === IR_KIND.Ternary && _isHighZLiteral(expr.else);
}

/**
 * Run the pass over an IRModule (recursing into submodules). Returns
 * the (potentially mutated) IR plus a `diagnostics[]` array.
 */
export function lowerTriState(ir, opts = {}) {
  const diagnostics = [];
  if (opts.synthesisSafe === false) {
    diagnostics.push({
      kind: 'tristate-preserved',
      message: 'lowerTriState skipped (synthesisSafe=false): internal tri-state preserved — output is simulation-only and will not synthesise.',
    });
    return { ir, diagnostics };
  }
  _visitModule(ir, diagnostics);
  return { ir, diagnostics };
}

function _visitModule(mod, diagnostics) {
  if (!mod || !Array.isArray(mod.assigns)) return;
  // Group assigns by LHS net name. We only handle plain Ref LHS — slice
  // / concat LHS are out of scope for the multi-driver pattern.
  const byLhs = new Map();      // lhsName → assigns[]
  for (const a of mod.assigns) {
    if (!a.lhs || a.lhs.kind !== IR_KIND.Ref) continue;
    const name = a.lhs.netName;
    if (!byLhs.has(name)) byLhs.set(name, []);
    byLhs.get(name).push(a);
  }
  const dropped = new Set();    // assigns to remove from mod.assigns
  const added = [];
  for (const [name, group] of byLhs) {
    if (group.length < 2) continue;
    // Collect the (enable, data) pairs from ternary-shaped tri-state
    // assigns; if every assign in the group fits the shape AND at
    // least one is real high-Z, coalesce into a priority chain.
    const triLike = group.every(a => _isTriBufTernary(a.rhs));
    if (!triLike) continue;
    // Build chain: first → next → … → high-Z fallback (the ELSE of
    // the LAST assign — same `N'bz` literal preserved).
    const sr = group[0].sourceRef || null;
    const fallback = group[group.length - 1].rhs.else;
    let chain = fallback;
    for (let i = group.length - 1; i >= 0; i--) {
      const t = group[i].rhs;
      // t.cond = enable, t.then = data, t.else = (was) hiZ
      chain = makeTernary(t.cond, t.then, chain, t.then.width || 1, sr);
    }
    // Replace the whole group with a single coalesced assign on the LHS.
    for (const a of group) dropped.add(a);
    added.push({
      kind: 'Assign', sourceRef: sr, attributes: [],
      lhs: makeRef(name, group[0].lhs.width || 1, sr),
      rhs: chain,
    });
    diagnostics.push({
      kind: 'tristate-coalesced',
      net: name,
      driverCount: group.length,
      message: `lowered ${group.length} tri-state drivers on net '${name}' to a single priority MUX`,
    });
  }
  if (dropped.size > 0 || added.length > 0) {
    mod.assigns = mod.assigns.filter(a => !dropped.has(a)).concat(added);
  }
  for (const sub of (mod.submodules || [])) _visitModule(sub, diagnostics);
}
