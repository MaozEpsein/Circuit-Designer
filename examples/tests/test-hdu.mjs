// Smoke test for the Hazard Detection Unit (HDU).
// Drives the example scene through 5 cycles, checks that the textbook
// load-use stall fires when (and only when) IDEX_MemRead is high AND the
// loaded register matches one of the IF/ID source operands.
//
// Run:  node examples/tests/test-hdu.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { evaluate } from '../../js/engine/SimulationEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = resolve(__dirname, '..', 'circuits', 'hdu-demo.json');
const scene = JSON.parse(readFileSync(file, 'utf8'));

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('\n[1] Structural integrity');
check('has HDU node', scene.nodes.some(n => n.type === 'HDU'));
check('exactly 4 INPUT drivers', scene.nodes.filter(n => n.type === 'INPUT').length === 4);
check('exactly 3 OUTPUT sinks',  scene.nodes.filter(n => n.type === 'OUTPUT').length === 3);
const hdu = scene.nodes.find(n => n.type === 'HDU');
check('regAddrBits set', hdu.regAddrBits === 4, `got ${hdu.regAddrBits}`);

// Drive the inputs through their stepValues sequence — same way the UI does.
function setStep(step) {
  for (const n of scene.nodes) {
    if (n.type === 'INPUT' && Array.isArray(n.stepValues) && step < n.stepValues.length) {
      n.fixedValue = n.stepValues[step];
    }
  }
}

console.log('\n[2] Load-use detection across 5 cycles');
// Expected per the demo: [{MR, IDEX_Rt, IFID_Rs, IFID_Rt}] → expected stall
const expected = [
  { step: 0, stall: 0, why: 'all zeros' },
  { step: 1, stall: 1, why: 'MR=1, IDEX_Rt=5 == IFID_Rs=5'  },
  { step: 2, stall: 1, why: 'MR=1, IDEX_Rt=3 == IFID_Rt=3'  },
  { step: 3, stall: 0, why: 'MR=0 → no stall'               },
  { step: 4, stall: 0, why: 'MR=1 but no register match'    },
];

for (const e of expected) {
  setStep(e.step);
  const { nodeValues } = evaluate(scene.nodes, scene.wires, new Map(), e.step);
  const pcWrite   = nodeValues.get(hdu.id + '__out0') ?? 0;
  const ifidWrite = nodeValues.get(hdu.id + '__out1') ?? 0;
  const bubble    = nodeValues.get(hdu.id + '__out2') ?? 0;
  const expBubble = e.stall;
  const expPC     = e.stall ? 0 : 1;
  check(`step ${e.step}: Bubble=${expBubble} (${e.why})`, bubble === expBubble, `got ${bubble}`);
  check(`step ${e.step}: PCWrite=${expPC}`,                pcWrite === expPC,    `got ${pcWrite}`);
  check(`step ${e.step}: IFIDWrite=${expPC}`,              ifidWrite === expPC,  `got ${ifidWrite}`);
}

console.log('\n[3] Boundary cases');
// Rd=0 must NOT trigger a stall even when MR=1 — register zero is hardwired
// in MIPS but our HDU treats any matching register the same; the load-use
// pattern still fires only when MR=1 AND a real match exists. We test that
// explicit zero-on-zero produces zero stall (no match).
const allZeroNodes = JSON.parse(JSON.stringify(scene.nodes));
for (const n of allZeroNodes) if (n.type === 'INPUT') n.fixedValue = 0;
const r0 = evaluate(allZeroNodes, scene.wires, new Map(), 0);
check('all-zero inputs → Bubble=0', (r0.nodeValues.get(hdu.id + '__out2') ?? 0) === 0);
check('all-zero inputs → PCWrite=1', (r0.nodeValues.get(hdu.id + '__out0') ?? 0) === 1);

console.log(`\n${failed === 0 ? 'OK' : `FAIL: ${failed} assertion(s) failed`}`);
process.exit(failed === 0 ? 0 : 1);
