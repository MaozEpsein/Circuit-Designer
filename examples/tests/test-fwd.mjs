// Smoke test for the Forwarding Unit (FWD).
// Drives the example scene through 5 cycles, checks that the textbook
// MIPS priority forwarder selects the right ALU operand source on each
// cycle. EX/MEM beats MEM/WB when both match.
//
// Run:  node examples/tests/test-fwd.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { evaluate } from '../../js/engine/SimulationEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = resolve(__dirname, '..', 'circuits', 'fwd-demo.json');
const scene = JSON.parse(readFileSync(file, 'utf8'));

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('\n[1] Structural integrity');
check('has FWD node', scene.nodes.some(n => n.type === 'FWD'));
check('exactly 6 INPUT drivers', scene.nodes.filter(n => n.type === 'INPUT').length === 6);
check('exactly 2 OUTPUT sinks',  scene.nodes.filter(n => n.type === 'OUTPUT').length === 2);
const fwd = scene.nodes.find(n => n.type === 'FWD');

function setStep(step) {
  for (const n of scene.nodes) {
    if (n.type === 'INPUT' && Array.isArray(n.stepValues) && step < n.stepValues.length) {
      n.fixedValue = n.stepValues[step];
    }
  }
}

console.log('\n[2] Priority forwarding across 5 cycles');
// Expected ForwardA / ForwardB encoding: 00=RF, 10=EX/MEM, 01=MEM/WB.
const expected = [
  { step: 0, fwdA: 0, fwdB: 0, why: 'all zeros'                                    },
  { step: 1, fwdA: 2, fwdB: 0, why: 'EX/MEM Rd=5=Rs → forward A from EX/MEM'        },
  { step: 2, fwdA: 0, fwdB: 1, why: 'MEM/WB Rd=7=Rt → forward B from MEM/WB'        },
  { step: 3, fwdA: 2, fwdB: 0, why: 'both match Rs; EX/MEM wins on priority'        },
  { step: 4, fwdA: 0, fwdB: 0, why: 'EX/MEM Rd=0 disables forward (and MEMWB Rd=0 too)' },
];

for (const e of expected) {
  setStep(e.step);
  const { nodeValues } = evaluate(scene.nodes, scene.wires, new Map(), e.step);
  const fA = nodeValues.get(fwd.id + '__out0') ?? 0;
  const fB = nodeValues.get(fwd.id + '__out1') ?? 0;
  check(`step ${e.step}: ForwardA=${e.fwdA} (${e.why})`, fA === e.fwdA, `got ${fA}`);
  check(`step ${e.step}: ForwardB=${e.fwdB}`,            fB === e.fwdB, `got ${fB}`);
}

console.log('\n[3] Rd=0 must never forward (hardwired-zero contract)');
// Force EX/MEM RegWrite=1, EX/MEM Rd=0, source Rs=0 — historically a buggy
// implementation will say "match!" and forward zero, defeating the point.
const probe = JSON.parse(JSON.stringify(scene.nodes));
const setBy = (label, v) => { probe.find(n => n.label === label).fixedValue = v; probe.find(n => n.label === label).stepValues = undefined; };
setBy('IDEX_Rs', 0);
setBy('IDEX_Rt', 0);
setBy('EXMEM_Rd', 0);
setBy('EXMEM_RW', 1);
setBy('MEMWB_Rd', 0);
setBy('MEMWB_RW', 1);
const r0 = evaluate(probe, scene.wires, new Map(), 0);
check('Rd=0 → ForwardA=0', (r0.nodeValues.get(fwd.id + '__out0') ?? 0) === 0);
check('Rd=0 → ForwardB=0', (r0.nodeValues.get(fwd.id + '__out1') ?? 0) === 0);

console.log(`\n${failed === 0 ? 'OK' : `FAIL: ${failed} assertion(s) failed`}`);
process.exit(failed === 0 ? 0 : 1);
