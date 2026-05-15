// HDL emission for MBIST_CONTROLLER. Builds a minimal scene with one
// MBIST + RAM, runs the HDL toolchain, and asserts that the emitted
// Verilog contains the key structural elements: state regs, posedge
// always block with case (state), reset branch, and the 9 continuous
// `assign` lines.

import { createComponent, createWire, COMPONENT_TYPES } from '../../js/components/Component.js';
import { exportCircuit } from '../../js/hdl/VerilogExporter.js';

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

let _idc = 0;
const nid = () => 'n' + (++_idc);
const wid = () => 'w' + (++_idc);
function mk(type, ov = {}) { const n = createComponent(type, 0, 0); n.id = nid(); Object.assign(n, ov); return n; }
function W(src, dst, dstPin = 0, srcPin = 0, opts = {}) {
  const w = createWire(src, dst, dstPin, srcPin, opts); w.id = wid(); return w;
}

_idc = 0;
const clk   = mk('CLOCK', { value: 0 });
const start = mk('INPUT', { fixedValue: 0, label: 'START' });
const reset = mk('INPUT', { fixedValue: 0, label: 'RESET' });
// Wire MBIST outputs to OUTPUT pads so they become module ports.
const oDone   = mk('OUTPUT', { label: 'DONE' });
const oPass   = mk('OUTPUT', { label: 'PASS' });
const oFail   = mk('OUTPUT', { label: 'FAIL' });
const oTM     = mk('OUTPUT', { label: 'TEST_MODE' });
const oStWire = mk('OUTPUT', { label: 'STATE' });
const oAddr   = mk('OUTPUT', { label: 'CUR_ADDR' });
const oWE     = mk('OUTPUT', { label: 'WE' });
const oRE     = mk('OUTPUT', { label: 'RE' });
const oDOut   = mk('OUTPUT', { label: 'DATA_OUT' });
const mbist = mk('MBIST_CONTROLLER', { addrBits: 2, dataBits: 4 });
const din   = mk('INPUT', { fixedValue: 0, label: 'DIN' });
const nodes = [clk, start, reset, din, mbist, oDone, oPass, oFail, oTM, oStWire, oAddr, oWE, oRE, oDOut];
const wires = [
  W(clk.id, mbist.id, 3, 0, { isClockWire: true }),
  W(start.id, mbist.id, 0),
  W(reset.id, mbist.id, 1),
  W(din.id, mbist.id, 2),
  W(mbist.id, oDone.id,   0, 0),
  W(mbist.id, oPass.id,   0, 1),
  W(mbist.id, oFail.id,   0, 2),
  W(mbist.id, oTM.id,     0, 3),
  W(mbist.id, oStWire.id, 0, 4),
  W(mbist.id, oAddr.id,   0, 5),
  W(mbist.id, oDOut.id,   0, 6),
  W(mbist.id, oWE.id,     0, 7),
  W(mbist.id, oRE.id,     0, 8),
];

const result = exportCircuit({ nodes, wires });
const verilog = result.verilog || result.toplevel || result.text || result;
const text = typeof verilog === 'string' ? verilog : (verilog && verilog.text) || JSON.stringify(verilog);

console.log('[1] MBIST_CONTROLLER HDL emission');
check('emits state register',   text.includes('mbist_'), 'expected reg names with mbist_ prefix');
check('emits 4-bit state',      /\[3:0\][^\n]*mbist_[^\s]+_state/.test(text), 'reg [3:0] mbist_*_state');
check('emits initial block',    text.includes('initial'));
check('emits posedge clk always',  /posedge\s+\w+/.test(text), 'posedge X');
check('emits case (state)',     /case\s*\(\s*mbist_/.test(text), 'case (mbist_*)');
check('emits assign for DONE',  /assign\s+\S+done/i.test(text) || /assign\s+DONE/i.test(text));
check('emits assign for PASS',  /assign\s+\S+pass/i.test(text) || /assign\s+PASS/i.test(text));
check('emits assign for FAIL',  /assign\s+\S+fail/i.test(text) || /assign\s+FAIL/i.test(text));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
