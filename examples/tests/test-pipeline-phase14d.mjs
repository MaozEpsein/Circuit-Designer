// Tier 14d — SUB_CIRCUIT CU descent + IR-less ROM-width fallback.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { inferIsa } from '../../js/pipeline/isa/IsaInference.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (rel) => JSON.parse(readFileSync(resolve(__dirname, rel), 'utf8'));

let failed = 0;
const check = (label, cond, extra = '') => {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${extra ? '  — ' + extra : ''}`);
};

// ── 1. cpu-detailed.json — descends into the Control Unit SUB_CIRCUIT ─────
console.log('\n-- cpu-detailed.json: SUB_CIRCUIT descent --');
{
  const scene = load('../circuits/cpu-detailed.json');
  const isa = inferIsa(scene);
  check('ISA returned',                     isa !== null);
  check('source = subcircuit-cu',           isa.source === 'subcircuit-cu', `got ${isa.source}`);
  check('warning about descent present',    isa.warnings.some(w => /SUB_CIRCUIT/.test(w)));
  check('warning about ROM-width fallback', isa.warnings.some(w => /ROM dataBits/.test(w)));
  check('16 opcodes rebuilt',               Object.keys(isa.opcodes).length === 16);
  check('wordBits from ROM (16)',           isa.wordBits === 16);
  // Field layout matches the DEFAULT 4/4/4/4 shape.
  check('fields.op = [15,12]',              JSON.stringify(isa.fields.op)  === '[15,12]');
  check('fields.rs2 = [3,0]',               JSON.stringify(isa.fields.rs2) === '[3,0]');
}

// ── 2. synthetic — SUB_CIRCUIT wrapper containing only a CU ──────────────
console.log('\n-- synthetic: SUB_CIRCUIT wrapper → descent finds CU --');
{
  const scene = {
    nodes: [
      { type: 'ROM', dataBits: 16, memory: {} },
      {
        type: 'SUB_CIRCUIT', label: 'wrapped-cu',
        subCircuit: { nodes: [{ type: 'CU', controlTable: null }] , wires: [] },
      },
    ],
  };
  const isa = inferIsa(scene);
  check('ISA non-null',                     isa !== null);
  check('source reflects descent',          isa.source === 'subcircuit-cu');
  check('opcodes populated from default',   Object.keys(isa.opcodes).length === 16);
}

// ── 3. no IR + no ROM → no-ir-fallback (safety) ──────────────────────────
console.log('\n-- synthetic: CU + nothing else → no-ir-fallback --');
{
  const isa = inferIsa({ nodes: [{ type: 'CU', controlTable: null }] });
  check('source = no-ir-fallback',          isa.source === 'no-ir-fallback', `got ${isa.source}`);
}

// ── 4. regression — IR present still wins over ROM width ─────────────────
console.log('\n-- regression: IR present overrides ROM-based width --');
{
  const scene = {
    nodes: [
      { type: 'ROM', dataBits: 32, memory: {} },        // 32-bit ROM ...
      { type: 'IR', instrWidth: 16, opBits: 4, rdBits: 4, rs1Bits: 4, rs2Bits: 4 },
      { type: 'CU', controlTable: null },
    ],
  };
  const isa = inferIsa(scene);
  check('wordBits from IR (16), not ROM',   isa.wordBits === 16);
  check('source is native',                 isa.source === 'native-default-table');
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
