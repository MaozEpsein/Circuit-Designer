// Round-trip harness: IRModule → Verilog → (parser → elaborate) → IRModule,
// then equals.
//
// Phase 9: the default parser is now the real Phase-8 parser + elaborator.
// `roundTripIR(ir)` therefore exercises the FULL fidelity pipeline:
//   1. ir → Verilog text via toVerilog
//   2. text → AST  via parseVerilog
//   3. AST → IR   via elaborate
//   4. equals(original, round-tripped)
// Callers that want to test only the harness can pass in `parser:
// stubParser` to fall back to the pre-Phase-8 behaviour.

import { toVerilog } from '../ir/toVerilog.js';
import { equals } from '../ir/equals.js';
import { parseVerilog } from '../parser/parser.js';
import { elaborate } from '../parser/elaborate.js';

export function roundTripIR(ir, { parser = realParser } = {}) {
  const verilog = toVerilog(ir);
  const parsed = parser(verilog, ir);   // ir passed as sidecar for the stub
  const ok = equals(ir, parsed);
  return { ok, verilog, parsed };
}

// Real parser path — text → AST → IR.
function realParser(verilog, _sidecarIR) {
  const { ast } = parseVerilog(verilog);
  const { ir }  = elaborate(ast);
  return ir;
}

// Stub parser — returns the sidecar IR verbatim. Available for callers
// that want to verify the harness independent of the parser/elaborator
// (mostly historical; new tests should use the real parser).
export function stubParser(_verilog, sidecarIR) {
  return sidecarIR;
}

// Determinism check: serialise n times, all outputs must be identical.
export function isDeterministic(ir, n = 10) {
  const first = toVerilog(ir);
  for (let i = 1; i < n; i++) {
    if (toVerilog(ir) !== first) return false;
  }
  return true;
}
