// Phase 13 performance baseline.
//
// Goal: keep PipelineAnalyzer.analyze() under 50ms on a 500-node pipelined
// circuit. This test generates a synthetic linear pipeline with ~500 gate
// nodes partitioned into 10 stages by PIPE_REGs, runs analyze() 100 times,
// and reports median / p95 / max.
//
// The hard-fail threshold is 200ms so CI doesn't flake on a slow runner;
// we warn above 50ms (README goal) so any regression surfaces loudly.
import { PipelineAnalyzer } from '../../js/pipeline/PipelineAnalyzer.js';

const HARD_LIMIT_MS = 200;
const SOFT_LIMIT_MS = 50;
const NODES_TARGET  = 500;
const STAGES        = 10;
const RUNS          = 100;
const WARMUP        = 10;

// Build a linear pipeline: INPUT → [gates × G] → PIPE → [gates × G] → ... → OUTPUT.
// Total nodes target = NODES_TARGET. Per stage: (NODES_TARGET - STAGES - 2) / STAGES gates.
function buildScene() {
  const nodes = [];
  const wires = [];
  const perStage = Math.floor((NODES_TARGET - STAGES - 2) / STAGES);
  let wireId = 0;

  nodes.push({ type:'CLOCK',  id:'clk',  label:'CLK', value:0, x:-2000, y:0 });
  nodes.push({ type:'INPUT',  id:'in0',  label:'IN',  fixedValue:1, x:-1900, y:0 });

  let lastId = 'in0';
  for (let s = 0; s < STAGES; s++) {
    for (let g = 0; g < perStage; g++) {
      const id = `g_s${s}_${g}`;
      nodes.push({ type:'AND', id, label:'A', x:-1800 + s*200 + g*20, y:0 });
      wires.push(mk(lastId, 0, id, 0));
      wires.push(mk('in0',  0, id, 1));    // second input tied to in0
      lastId = id;
    }
    const pipeId = `pipe_s${s}`;
    nodes.push({ type:'PIPE_REG', id:pipeId, label:`PIPE${s}`, channels:1, pipelineRole:'register', stage:null, x:-1800 + s*200 + 180, y:0 });
    wires.push(mk(lastId, 0, pipeId, 0));
    wires.push(mk('clk',  0, pipeId, 3, true));   // channels=1 → clk at pin 3
    lastId = pipeId;
  }
  nodes.push({ type:'OUTPUT', id:'out', label:'OUT', x:500, y:0 });
  wires.push(mk(lastId, 0, 'out', 0));

  return { nodes, wires };

  function mk(sourceId, sourceOutputIndex, targetId, targetInputIndex, clk=false) {
    return {
      sourceId, targetId, targetInputIndex, sourceOutputIndex,
      waypoints:[], netName:'', colorGroup:null, isClockWire:!!clk,
      id: `w_${wireId++}`,
    };
  }
}

function run() {
  const scene = buildScene();
  console.log(`scene: ${scene.nodes.length} nodes, ${scene.wires.length} wires`);

  // Build analyzer once — analyze() is the path we're benchmarking.
  const analyzer = new PipelineAnalyzer(scene);

  // Warm up.
  for (let i = 0; i < WARMUP; i++) analyzer.analyze({ force: true });

  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    analyzer.analyze({ force: true });
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(RUNS / 2)];
  const p95    = times[Math.floor(RUNS * 0.95)];
  const max    = times[RUNS - 1];
  const mean   = times.reduce((a, b) => a + b, 0) / RUNS;

  console.log(`runs=${RUNS}`);
  console.log(`median = ${median.toFixed(2)} ms`);
  console.log(`mean   = ${mean.toFixed(2)} ms`);
  console.log(`p95    = ${p95.toFixed(2)} ms`);
  console.log(`max    = ${max.toFixed(2)} ms`);

  let failed = 0;
  const check = (label, cond) => {
    console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}`);
    if (!cond) failed++;
  };
  check(`median ≤ ${HARD_LIMIT_MS} ms (hard limit)`, median <= HARD_LIMIT_MS);
  check(`p95    ≤ ${HARD_LIMIT_MS} ms`,              p95    <= HARD_LIMIT_MS);

  if (median > SOFT_LIMIT_MS) {
    console.log(`  [WARN] median ${median.toFixed(2)}ms > soft limit ${SOFT_LIMIT_MS}ms (README goal) — possible regression`);
  } else {
    console.log(`  [OK]  median is within the ${SOFT_LIMIT_MS}ms soft limit`);
  }

  console.log(failed === 0 ? '\nOK — perf within hard limits.' : `\nFAILED — ${failed} check(s).`);
  process.exit(failed === 0 ? 0 : 1);
}

run();
