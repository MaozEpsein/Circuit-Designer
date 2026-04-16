/**
 * app.js — Circuit Designer Pro — Application Bootstrap
 * Wires together all modules and starts the app loop.
 */
import { bus } from './core/EventBus.js';
import { StateManager } from './core/StateManager.js';
import { CommandManager } from './core/CommandManager.js';
import { SceneGraph } from './core/SceneGraph.js';
import * as Renderer from './rendering/CanvasRenderer.js';
import * as Waveform from './rendering/WaveformRenderer.js';
import * as Input from './interaction/InputHandler.js';
import { MEMORY_TYPE_SET, COMPONENT_TYPES } from './components/Component.js';
import { SetNodePropsCommand } from './components/CircuitCommands.js';
import { assemble, disassemble, getOpcodeNames, getOpcodeFormat } from './cpu/Assembler.js';
import { SubCircuitRegistry } from './core/SubCircuitRegistry.js';
import { SimulationController, formatValue, VALUE_FORMAT } from './engine/SimulationController.js';
import { ProbeManager } from './debug/SignalProbe.js';
import { WatchList } from './debug/WatchList.js';
import { SignalTracer } from './debug/SignalTracer.js';
import { ErrorOverlay } from './debug/ErrorOverlay.js';
import { generateTruthTable, renderTruthTableHTML } from './debug/TruthTableGenerator.js';
import { CommandPalette } from './ui/CommandPalette.js';
import { MiniMap } from './ui/MiniMap.js';
import { SelectionManager } from './ui/SelectionManager.js';
import { AnnotationLayer } from './ui/AnnotationLayer.js';
import { ProjectStorage } from './ui/ProjectStorage.js';

// ── Singletons ──────────────────────────────────────────────
const scene    = new SceneGraph();
const subRegistry = new SubCircuitRegistry();
const state    = new StateManager();
const commands = new CommandManager(100);
const simCtrl  = new SimulationController();
const probes     = new ProbeManager();
const watchList  = new WatchList();
const tracer     = new SignalTracer();
const errorOverlay = new ErrorOverlay();
const cmdPalette = new CommandPalette();
const miniMap    = new MiniMap();
const selection  = new SelectionManager(scene, commands);
const annotations = new AnnotationLayer();
const projectStore = new ProjectStorage();
let _currentProjectId = null;

// ── DOM References ──────────────────────────────────────────
const canvas        = document.getElementById('game-canvas');
const stepCountEl   = document.getElementById('step-count');
const btnStep       = document.getElementById('btn-step');
const btnAutoClk    = document.getElementById('btn-auto-clk');
const clockControls = document.getElementById('clock-controls');
const waveformPanel = document.getElementById('waveform-panel');
const btnWaveform   = document.getElementById('btn-waveform');
const designTools   = document.querySelectorAll('.design-tool');
const designProps   = document.getElementById('design-props');
const propsType     = document.getElementById('design-props-type');
const propLabel     = document.getElementById('prop-label');
const propValueToggle  = document.getElementById('prop-value-toggle');
const propStepsRow     = document.getElementById('prop-steps-row');
const propSteps        = document.getElementById('prop-steps');
const propTargetToggle = document.getElementById('prop-target-toggle');
const propStepTargetsRow = document.getElementById('prop-step-targets-row');
const propStepTargets    = document.getElementById('prop-step-targets');
const propInitQToggle    = document.getElementById('prop-initq-toggle');
const propLabelRow   = document.getElementById('prop-label-row');
const propValueRow   = document.getElementById('prop-value-row');
const propTargetRow  = document.getElementById('prop-target-row');
const propInitQRow   = document.getElementById('prop-initq-row');

// Wire property panel refs
const wireProps         = document.getElementById('wire-props');
const wireNetName       = document.getElementById('wire-netname');
const wireColorGroup    = document.getElementById('wire-color-group');
const wireClockToggle   = document.getElementById('wire-clock-toggle');
const wireClearWaypoints = document.getElementById('wire-clear-waypoints');
let _selectedWireId = null;

// ── Auto Clock ──────────────────────────────────────────────
let _autoClkRunning  = false;
let _autoClkInterval = null;

function _updateStepCount() {
  stepCountEl.textContent = `STEP: ${state.stepCount}`;
}

function _stopAutoClock() {
  if (_autoClkInterval) { clearInterval(_autoClkInterval); _autoClkInterval = null; }
  _autoClkRunning = false;
  btnAutoClk.classList.remove('running');
  btnAutoClk.textContent = 'AUTO CLK';
}

function _startAutoClock() {
  _autoClkRunning = true;
  btnAutoClk.classList.add('running');
  btnAutoClk.textContent = '\u25A0 STOP';
  _autoClkInterval = setInterval(() => {
    if (!simCtrl.paused) _stepClock();
  }, simCtrl.speed);
}

function _stepClock() {
  if (!scene.hasSequentialElements()) return;
  state.stepCount++;

  // Update stepped inputs
  scene.nodes.forEach(n => {
    if (n.type === 'INPUT' && n.stepValues) {
      const idx = Math.min(state.stepCount, n.stepValues.length) - 1;
      n.fixedValue = n.stepValues[idx];
    }
  });

  // Raise clock
  state.clockHigh = true;
  scene.nodes.forEach(n => { if (n.type === 'CLOCK') n.value = 1; });

  Renderer.startPulse();
  _updateStepCount();
}

// ── Clock Controls ──────────────────────────────────────────
function _setClockControlsVisible(visible) {
  clockControls.classList.toggle('hidden', !visible);
}

btnStep.addEventListener('click', () => {
  _stepClock();
});

btnAutoClk.addEventListener('click', () => {
  if (_autoClkRunning) _stopAutoClock();
  else _startAutoClock();
});

bus.on('clock:step', () => {
  if (scene.hasSequentialElements()) _stepClock();
});

// ── Core: Evaluate + Render Loop ────────────────────────────
let _rafId = null;
let _lastNodeValues = new Map();
let _lastWireValues = new Map();
let _frameCount = 0;

function tick() {
  const nodes = scene.nodes;
  const wires = scene.wires;

  // Use SimulationController for evaluation (breakpoints, glitch detection, etc.)
  const result = simCtrl.evaluate(nodes, wires, state.ffStates, state.stepCount);
  _lastNodeValues = result.nodeValues;
  _lastWireValues = result.wireValues;

  // Lower clock after evaluation
  if (state.clockHigh) {
    state.clockHigh = false;
    nodes.forEach(n => { if (n.type === 'CLOCK') n.value = 0; });
  }

  // If breakpoint hit, stop auto-clock
  if (result.breakpointHit && _autoClkRunning) {
    _stopAutoClock();
  }

  const wirePreview = Input.getWirePreview();

  Renderer.render(
    nodes, wires, result.nodeValues, result.wireValues,
    state.ffStates, state.hoveredNodeId, state.selectedNodeId,
    state.stepCount, wirePreview, state.tool
  );

  // Record waveform data
  if (result.nodeValues) {
    Waveform.record(state.stepCount, result.nodeValues);
    if (Waveform.isVisible()) Waveform.render();
  }

  // Update debug tools
  probes.update(result.nodeValues, result.wireValues);
  watchList.update(result.nodeValues);
  errorOverlay.analyze(nodes, wires, result.nodeValues);

  // Update mini-map (throttled — every 10 frames)
  if (miniMap.visible && _frameCount % 10 === 0) {
    miniMap.render(nodes, wires);
  }
  _frameCount++;

  // Refresh debug panels if visible
  if (_debugPanelVisible) {
    _refreshDebugPanels();
  }

  // Auto-save
  _scheduleDesignSave();

  _rafId = requestAnimationFrame(tick);
}

// ── Auto-save ───────────────────────────────────────────────
let _designSaveTimer = null;
function _scheduleDesignSave() {
  if (_designSaveTimer) return;
  _designSaveTimer = setTimeout(() => {
    _designSaveTimer = null;
    if (scene.nodeCount > 0) {
      localStorage.setItem('circuit_designer_pro', JSON.stringify(scene.serialize()));
    }
  }, 2000);
}

// ── Design Tool Selection ───────────────────────────────────
function _updateDesignToolActive(tool) {
  designTools.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
}

designTools.forEach(btn => {
  btn.addEventListener('click', () => {
    state.tool = btn.dataset.tool;
  });
});

bus.on('tool:changed', ({ tool }) => {
  _updateDesignToolActive(tool);
});

// Prevent toolbar clicks from reaching canvas
document.getElementById('design-toolbar')?.addEventListener('mousedown', (e) => e.stopPropagation());
document.getElementById('design-toolbar')?.addEventListener('click', (e) => e.stopPropagation());

// ── Property Panel ──────────────────────────────────────────
function _getSelectedNode() {
  if (!state.selectedNodeId) return null;
  return scene.getNode(state.selectedNodeId);
}

const propSizeRow    = document.getElementById('prop-size-row');
const propSizeLabel  = document.getElementById('prop-size-label');
const propSizeSelect = document.getElementById('prop-size-select');

function _updatePropsPanel() {
  const node = _getSelectedNode();
  if (!node) {
    designProps.classList.add('hidden');
    return;
  }
  designProps.classList.remove('hidden');
  propsType.textContent = node.type;

  propLabelRow.style.display = '';
  propValueRow.style.display = (node.type === 'INPUT' || node.type === 'MUX_SELECT') ? '' : 'none';
  propStepsRow.style.display = node.type === 'INPUT' ? '' : 'none';
  propTargetRow.style.display = node.type === 'OUTPUT' ? '' : 'none';
  propStepTargetsRow.style.display = node.type === 'OUTPUT' ? '' : 'none';
  propInitQRow.style.display = node.type === 'FF_SLOT' ? '' : 'none';

  // MUX/DEMUX/DECODER/ENCODER size config
  const isMux = node.type === 'MUX';
  const isDemux = node.type === 'DEMUX';
  const isDecoder = node.type === 'DECODER';
  const isEncoder = node.type === 'ENCODER';
  const isMemory = MEMORY_TYPE_SET.has(node.type);
  const hasSize = isMux || isDemux || isDecoder || isEncoder;
  propSizeRow.style.display = hasSize ? '' : 'none';

  // Memory component fields
  const propMembitRow  = document.getElementById('prop-membit-row');
  const propMembitSel  = document.getElementById('prop-membit-select');
  const propMemaddrRow = document.getElementById('prop-memaddr-row');
  const propMemaddrSel = document.getElementById('prop-memaddr-select');
  if (isMemory && (node.type === 'RAM' || node.type === 'ROM')) {
    propMembitRow.style.display = '';
    document.getElementById('prop-membit-label').textContent = 'Data Bits';
    propMembitSel.value = node.dataBits || 4;
    propMemaddrRow.style.display = '';
    propMemaddrSel.value = node.addrBits || 3;
  } else if (node.type === 'REG_FILE' || node.type === 'FIFO' || node.type === 'STACK') {
    propMembitRow.style.display = '';
    document.getElementById('prop-membit-label').textContent = 'Data Bits';
    propMembitSel.value = node.dataBits || 8;
    propMemaddrRow.style.display = 'none';
  } else if (isMemory) {
    propMembitRow.style.display = '';
    document.getElementById('prop-membit-label').textContent = 'Bit Width';
    propMembitSel.value = node.bitWidth || 4;
    propMemaddrRow.style.display = 'none';
  } else {
    propMembitRow.style.display = 'none';
    propMemaddrRow.style.display = 'none';
  }
  if (isMux) {
    propSizeLabel.textContent = 'Inputs';
    propSizeSelect.value = node.inputCount || 2;
  } else if (isDemux) {
    propSizeLabel.textContent = 'Outputs';
    propSizeSelect.value = node.outputCount || 2;
  } else if (isDecoder) {
    propSizeLabel.textContent = 'Input Bits';
    propSizeSelect.value = node.inputBits || 2;
  } else if (isEncoder) {
    propSizeLabel.textContent = 'Input Lines';
    propSizeSelect.value = node.inputLines || 4;
  }

  propLabel.value = node.label || '';
  if (node.type === 'INPUT') {
    propValueToggle.textContent = node.fixedValue ?? 0;
    propSteps.value = (node.stepValues || []).join(',');
  }
  if (node.type === 'MUX_SELECT') propValueToggle.textContent = node.value ?? 0;
  if (node.type === 'OUTPUT') {
    propTargetToggle.textContent = node.targetValue ?? 0;
    propStepTargets.value = (node.stepTargets || []).join(',');
  }
  if (node.type === 'FF_SLOT') propInitQToggle.textContent = node.initialQ ?? 0;
}

propSizeSelect?.addEventListener('change', () => {
  const node = _getSelectedNode();
  if (!node) return;
  const val = parseInt(propSizeSelect.value);
  const props = {};
  if (node.type === 'MUX') props.inputCount = val;
  else if (node.type === 'DEMUX') props.outputCount = val;
  else if (node.type === 'DECODER') props.inputBits = val;
  else if (node.type === 'ENCODER') props.inputLines = val;
  if (Object.keys(props).length) commands.execute(new SetNodePropsCommand(scene, node.id, props));
});

// Memory bit width / data bits change
document.getElementById('prop-membit-select')?.addEventListener('change', () => {
  const node = _getSelectedNode();
  if (!node) return;
  const val = parseInt(document.getElementById('prop-membit-select').value);
  const props = {};
  if (node.type === 'RAM' || node.type === 'ROM' || node.type === 'REG_FILE' || node.type === 'FIFO' || node.type === 'STACK') {
    props.dataBits = val;
  } else if (MEMORY_TYPE_SET.has(node.type)) {
    props.bitWidth = val;
  }
  if (Object.keys(props).length) commands.execute(new SetNodePropsCommand(scene, node.id, props));
  state.ffStates.delete(node.id);
});

// Memory address bits change
document.getElementById('prop-memaddr-select')?.addEventListener('change', () => {
  const node = _getSelectedNode();
  if (!node || (node.type !== 'RAM' && node.type !== 'ROM')) return;
  commands.execute(new SetNodePropsCommand(scene, node.id, { addrBits: parseInt(document.getElementById('prop-memaddr-select').value) }));
  state.ffStates.delete(node.id);
});

let _lastPropsNodeId = null;
setInterval(() => {
  if (state.selectedNodeId !== _lastPropsNodeId) {
    _lastPropsNodeId = state.selectedNodeId;
    _updatePropsPanel();
  }
}, 100);

propLabel.addEventListener('change', () => {
  const node = _getSelectedNode();
  if (node && node.label !== propLabel.value) {
    const cmd = new SetNodePropsCommand(scene, node.id, { label: propLabel.value });
    commands.execute(cmd);
  }
});

propValueToggle.addEventListener('click', () => {
  const node = _getSelectedNode();
  if (!node) return;
  if (node.type === 'INPUT') {
    const newVal = (node.fixedValue ?? 0) ^ 1;
    commands.execute(new SetNodePropsCommand(scene, node.id, { fixedValue: newVal }));
    propValueToggle.textContent = newVal;
  } else if (node.type === 'MUX_SELECT') {
    const newVal = (node.value ?? 0) ^ 1;
    commands.execute(new SetNodePropsCommand(scene, node.id, { value: newVal }));
    propValueToggle.textContent = newVal;
  }
});

propSteps.addEventListener('input', () => {
  const node = _getSelectedNode();
  if (!node || node.type !== 'INPUT') return;
  const vals = propSteps.value.split(',').map(s => parseInt(s.trim())).filter(v => v === 0 || v === 1);
  node.stepValues = vals.length > 0 ? vals : undefined;
});

propTargetToggle.addEventListener('click', () => {
  const node = _getSelectedNode();
  if (!node || node.type !== 'OUTPUT') return;
  const newVal = (node.targetValue ?? 0) ^ 1;
  commands.execute(new SetNodePropsCommand(scene, node.id, { targetValue: newVal }));
  propTargetToggle.textContent = newVal;
});

propStepTargets.addEventListener('input', () => {
  const node = _getSelectedNode();
  if (!node || node.type !== 'OUTPUT') return;
  const vals = propStepTargets.value.split(',').map(s => parseInt(s.trim())).filter(v => v === 0 || v === 1);
  node.stepTargets = vals.length > 0 ? vals : undefined;
});

propInitQToggle.addEventListener('click', () => {
  const node = _getSelectedNode();
  if (!node || node.type !== 'FF_SLOT') return;
  const newVal = (node.initialQ ?? 0) ^ 1;
  commands.execute(new SetNodePropsCommand(scene, node.id, { initialQ: newVal }));
  propInitQToggle.textContent = newVal;
});

// ── Wire Property Panel ─────────────────────────────────────
function _getSelectedWire() {
  if (!_selectedWireId) return null;
  return scene.getWire(_selectedWireId);
}

function _updateWirePropsPanel() {
  const wire = _getSelectedWire();
  if (!wire) {
    wireProps.classList.add('hidden');
    return;
  }
  wireProps.classList.remove('hidden');
  wireNetName.value = wire.netName || '';
  wireColorGroup.value = wire.colorGroup || '';
  wireClockToggle.textContent = wire.isClockWire ? 'ON' : 'OFF';
}

// Wire selection: when clicking a wire in select mode, show wire props
bus.on('wire:selected', ({ wireId }) => {
  _selectedWireId = wireId;
  state.selectedNodeId = null;
  _updateWirePropsPanel();
});

bus.on('selection:changed', () => {
  if (state.selectedNodeId) {
    _selectedWireId = null;
    wireProps.classList.add('hidden');
  }
});

wireNetName?.addEventListener('input', () => {
  const wire = _getSelectedWire();
  if (wire) wire.netName = wireNetName.value;
});

wireColorGroup?.addEventListener('change', () => {
  const wire = _getSelectedWire();
  if (wire) wire.colorGroup = wireColorGroup.value || null;
});

wireClockToggle?.addEventListener('click', () => {
  const wire = _getSelectedWire();
  if (!wire) return;
  wire.isClockWire = !wire.isClockWire;
  wireClockToggle.textContent = wire.isClockWire ? 'ON' : 'OFF';
});

wireClearWaypoints?.addEventListener('click', () => {
  const wire = _getSelectedWire();
  if (!wire) return;
  wire.waypoints = [];
});

// ── Simulation Controls ─────────────────────────────────────
const simSpeedSlider = document.getElementById('sim-speed');
const simSpeedLabel  = document.getElementById('sim-speed-label');
const simValueFormat = document.getElementById('sim-value-format');
const simStatus      = document.getElementById('sim-status');
const simStatusText  = document.getElementById('sim-status-text');
const breakpointPanel = document.getElementById('breakpoint-panel');
const breakpointList  = document.getElementById('breakpoint-list');

simSpeedSlider?.addEventListener('input', () => {
  simCtrl.speed = parseInt(simSpeedSlider.value);
  if (simSpeedLabel) simSpeedLabel.textContent = simCtrl.speed + 'ms';
  // Restart auto-clock with new speed if running
  if (_autoClkRunning) {
    _stopAutoClock();
    _startAutoClock();
  }
});

simValueFormat?.addEventListener('change', () => {
  simCtrl.valueFormat = simValueFormat.value;
});

// Breakpoint UI
document.getElementById('btn-add-breakpoint')?.addEventListener('click', () => {
  const nodeId = state.selectedNodeId;
  if (!nodeId) {
    alert('Select a node first, then add a breakpoint.');
    return;
  }
  const node = scene.getNode(nodeId);
  const label = node ? (node.label || nodeId) : nodeId;
  simCtrl.addBreakpoint(nodeId, 'any_change', null, label);
  _renderBreakpointList();
});

document.getElementById('btn-clear-breakpoints')?.addEventListener('click', () => {
  simCtrl.clearBreakpoints();
  _renderBreakpointList();
});

function _renderBreakpointList() {
  if (!breakpointList) return;
  const bps = simCtrl.breakpoints;
  if (bps.length === 0) {
    breakpointList.innerHTML = '<div style="color:#4a6080;font-size:9px;padding:4px">No breakpoints set</div>';
    return;
  }
  breakpointList.innerHTML = bps.map(bp => {
    const cls = bp.enabled ? '' : ' style="opacity:0.4"';
    return `<div class="bp-item"${cls}>
      <span class="bp-dot" style="background:${bp.enabled ? '#ff4444' : '#555'}"></span>
      <span class="bp-label">${bp.label}</span>
      <span class="bp-cond">${bp.condition}</span>
      <button class="bp-toggle" data-bp="${bp.id}">${bp.enabled ? 'ON' : 'OFF'}</button>
      <button class="bp-remove" data-bp="${bp.id}">&times;</button>
    </div>`;
  }).join('');

  // Event delegation for breakpoint buttons
  breakpointList.querySelectorAll('.bp-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      simCtrl.toggleBreakpoint(btn.dataset.bp);
      _renderBreakpointList();
    });
  });
  breakpointList.querySelectorAll('.bp-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      simCtrl.removeBreakpoint(btn.dataset.bp);
      _renderBreakpointList();
    });
  });
}

// Show simulation status messages
bus.on('breakpoint:hit', ({ breakpoint, step }) => {
  if (simStatus) {
    simStatus.classList.remove('hidden');
    simStatusText.textContent = `BREAKPOINT HIT: "${breakpoint.label}" at step ${step}`;
    simStatusText.style.color = '#ff4444';
  }
});

bus.on('simulation:oscillation', (err) => {
  if (simStatus) {
    simStatus.classList.remove('hidden');
    simStatusText.textContent = `OSCILLATION: ${err.message}`;
    simStatusText.style.color = '#ffcc00';
  }
});

bus.on('simulation:glitches', (glitches) => {
  if (simStatus) {
    simStatus.classList.remove('hidden');
    simStatusText.textContent = `GLITCH: ${glitches.length} hazard(s) detected at step ${glitches[0]?.step}`;
    simStatusText.style.color = '#ff9933';
    // Auto-hide after 3 seconds
    setTimeout(() => { simStatus.classList.add('hidden'); }, 3000);
  }
});

// Show breakpoint panel when sequential elements exist
bus.on('node:added', () => {
  if (scene.hasSequentialElements() && breakpointPanel) {
    breakpointPanel.classList.remove('hidden');
    _renderBreakpointList();
  }
});

// Analyze clock domains when circuit changes
bus.on('scene:loaded', () => {
  simCtrl.reset();
  simCtrl.analyzeClockDomains(scene.nodes, scene.wires);
  _renderBreakpointList();
});

// ── Toolbar Actions ─────────────────────────────────────────
document.getElementById('btn-design-clear')?.addEventListener('click', () => {
  if (scene.nodeCount === 0) return;
  if (!confirm('Clear the entire canvas?')) return;
  scene.clear();
  state.selectedNodeId = null;
  commands.clear();
  simCtrl.reset();
  localStorage.removeItem('circuit_designer_pro');
});

document.getElementById('btn-design-undo')?.addEventListener('click', () => {
  commands.undo();
  _updateStepCount();
});

document.getElementById('btn-design-redo')?.addEventListener('click', () => {
  commands.redo();
  _updateStepCount();
});

// Export
document.getElementById('btn-design-export')?.addEventListener('click', () => {
  if (scene.nodeCount === 0) return;
  const data = JSON.stringify(scene.serialize(), null, 2);
  navigator.clipboard.writeText(data).then(() => {
    alert('Circuit JSON copied to clipboard!');
  }).catch(() => {
    prompt('Copy this JSON:', data);
  });
});

// Import
document.getElementById('btn-design-import')?.addEventListener('click', () => {
  const json = prompt('Paste circuit JSON:');
  if (!json) return;
  try {
    const data = JSON.parse(json);
    if (data.nodes && data.wires) {
      scene.deserialize(data);
      state.selectedNodeId = null;
      commands.clear();
      state.resetSequentialState(scene.nodes);
    }
  } catch (_) {
    alert('Invalid JSON.');
  }
});

// Share (screenshot)
document.getElementById('btn-design-share')?.addEventListener('click', () => {
  const w = canvas.width;
  const h = canvas.height;
  const bannerH = 60;

  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h + bannerH;
  const octx = offscreen.getContext('2d');

  octx.fillStyle = '#0d1117';
  octx.fillRect(0, 0, w, bannerH);
  octx.strokeStyle = '#a060ff';
  octx.lineWidth = 2;
  octx.beginPath();
  octx.moveTo(0, bannerH);
  octx.lineTo(w, bannerH);
  octx.stroke();

  octx.fillStyle = '#a060ff';
  octx.font = 'bold 20px JetBrains Mono, monospace';
  octx.textAlign = 'left';
  octx.textBaseline = 'middle';
  octx.fillText('CIRCUIT DESIGNER PRO', 20, 30);

  octx.fillStyle = '#555';
  octx.font = '12px JetBrains Mono, monospace';
  octx.textAlign = 'right';
  octx.fillText('Professional Circuit Design', w - 20, 30);

  octx.drawImage(canvas, 0, bannerH);

  offscreen.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'circuit-designer-pro.png';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
});

// ── Waveform ────────────────────────────────────────────────
function toggleWaveform() {
  if (Waveform.isVisible()) {
    Waveform.hide();
    waveformPanel.classList.add('hidden');
    btnWaveform.classList.remove('active');
  } else {
    waveformPanel.offsetHeight;
    waveformPanel.classList.remove('hidden');
    Waveform.show();
    btnWaveform.classList.add('active');
  }
}

btnWaveform?.addEventListener('click', toggleWaveform);
document.getElementById('btn-waveform-close')?.addEventListener('click', toggleWaveform);

// ── Sequential Controls ─────────────────────────────────────
function _updateSequentialUI() {
  const isSeq = scene.hasSequentialElements();
  _setClockControlsVisible(isSeq);
  // Show/hide FF palette
  const ffPalette = document.getElementById('ff-palette');
  const gatePalette = document.getElementById('gate-palette');
  if (ffPalette) ffPalette.classList.toggle('hidden', true);
  if (gatePalette) gatePalette.classList.toggle('hidden', false);
}

bus.on('node:added', () => {
  _updateSequentialUI();
  cmdPalette.updateNodeItems(scene.nodes);
});
bus.on('node:removed', () => {
  _updateSequentialUI();
  cmdPalette.updateNodeItems(scene.nodes);
});
bus.on('scene:loaded', () => {
  _updateSequentialUI();
  state.resetSequentialState(scene.nodes);
  Waveform.reset();
  Waveform.setSignals(scene.nodes);
  cmdPalette.updateNodeItems(scene.nodes);
});
bus.on('scene:cleared', () => {
  _updateSequentialUI();
  _updateStepCount();
});

// ── Palette Tabs ────────────────────────────────────────────
document.querySelectorAll('.palette-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.palette-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.palette-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === target));
  });
});

// ── Component Palette (top-right) ────────────────────────────
// Click: set tool for single placement, then revert to SELECT
// Drag: drag chip onto canvas to place directly

document.querySelectorAll('.palette-chip').forEach(chip => {
  const tool = chip.dataset.tool;

  // Click — set tool (single-shot for placement tools)
  chip.addEventListener('click', () => {
    if (tool) {
      state.tool = tool;
      document.querySelectorAll('.palette-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    }
  });

  // Drag — drag component onto canvas
  if (chip.draggable) {
    chip.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', tool);
      // Hide native ghost, show custom
      const emptyImg = new Image();
      emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      e.dataTransfer.setDragImage(emptyImg, 0, 0);
      const ghost = document.getElementById('drag-ghost');
      if (ghost) {
        ghost.textContent = chip.textContent;
        ghost.className = '';
        ghost.style.left = e.clientX + 'px';
        ghost.style.top = e.clientY + 'px';
      }
      chip.classList.add('dragging');
      _paletteDragTool = tool;
    });

    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
      const ghost = document.getElementById('drag-ghost');
      if (ghost) ghost.classList.add('hidden');
      _paletteDragTool = null;
    });
  }
});

let _paletteDragTool = null;

// Track ghost position during palette drag
document.addEventListener('drag', (e) => {
  if (!_paletteDragTool || !e.clientX) return;
  const ghost = document.getElementById('drag-ghost');
  if (ghost) {
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
  }
});

// Single-shot: after placing a component, revert tool to SELECT
bus.on('node:added', () => {
  const tool = state.tool;
  // If it's a placement tool (not wire/select/delete), revert to select
  if (tool && tool.startsWith('place-')) {
    state.tool = 'select';
  }
});

// Sync palette chip highlight when tool changes from toolbar or keyboard
bus.on('tool:changed', ({ tool }) => {
  document.querySelectorAll('.palette-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.tool === tool);
  });
});

// ── Chip Tooltip ────────────────────────────────────────────
const chipTooltip = document.getElementById('chip-tooltip');
const GATE_TT = {
  AND:  { name: 'AND', formula: 'Z = A \u00B7 B', inputs: ['A','B'], rows: [[0,0,0],[0,1,0],[1,0,0],[1,1,1]] },
  OR:   { name: 'OR',  formula: 'Z = A + B', inputs: ['A','B'], rows: [[0,0,0],[0,1,1],[1,0,1],[1,1,1]] },
  XOR:  { name: 'XOR', formula: 'Z = A \u2295 B', inputs: ['A','B'], rows: [[0,0,0],[0,1,1],[1,0,1],[1,1,0]] },
  NAND: { name: 'NAND', formula: 'Z = \u00AC(A \u00B7 B)', inputs: ['A','B'], rows: [[0,0,1],[0,1,1],[1,0,1],[1,1,0]] },
  NOR:  { name: 'NOR',  formula: 'Z = \u00AC(A + B)', inputs: ['A','B'], rows: [[0,0,1],[0,1,0],[1,0,0],[1,1,0]] },
  NOT:  { name: 'NOT',  formula: 'Z = \u00ACA', inputs: ['A'], rows: [[0,1],[1,0]] },
};
const FF_TT = {
  D:  { name: 'D Flip-Flop', formula: "Q' = D", desc: 'Captures D on clock edge' },
  T:  { name: 'T Flip-Flop', formula: "Q' = Q \u2295 T", desc: 'Toggles when T=1, holds when T=0' },
  SR: { name: 'SR Flip-Flop', formula: "Q' = S + \u00ACR\u00B7Q", desc: 'S=SET, R=RESET' },
  JK: { name: 'JK Flip-Flop', formula: "Q' = J\u00B7\u00ACQ + \u00ACK\u00B7Q", desc: 'Like SR but J=K=1 toggles' },
};

function _buildGateTooltip(gate) {
  const tt = GATE_TT[gate];
  if (!tt) return '';
  const cols = [...tt.inputs, 'Z'];
  let html = `<div class="chip-tt-name">${tt.name}</div><table><tr>`;
  cols.forEach(c => { html += `<th>${c}</th>`; });
  html += '</tr>';
  tt.rows.forEach(row => { html += '<tr>'; row.forEach(v => { html += `<td class="v${v}">${v}</td>`; }); html += '</tr>'; });
  html += `</table><div class="chip-tt-formula">${tt.formula}</div>`;
  return html;
}

function _buildFfTooltip(ff) {
  const tt = FF_TT[ff];
  if (!tt) return '';
  return `<div class="chip-tt-name">${tt.name}</div><div>${tt.desc}</div><div class="chip-tt-formula">${tt.formula}</div>`;
}

document.querySelectorAll('.gate-chip').forEach(chip => {
  chip.addEventListener('mouseenter', (e) => {
    const gate = chip.dataset.gate;
    const ff = chip.dataset.ff;
    let html = '';
    if (gate) html = _buildGateTooltip(gate);
    else if (ff) html = _buildFfTooltip(ff);
    if (!html || !chipTooltip) return;
    chipTooltip.innerHTML = html;
    chipTooltip.classList.remove('hidden');
    const rect = chip.getBoundingClientRect();
    chipTooltip.style.top = (rect.bottom + 6) + 'px';
    const ttW = chipTooltip.offsetWidth;
    const maxLeft = window.innerWidth - ttW - 8;
    chipTooltip.style.left = Math.max(4, Math.min(rect.left, maxLeft)) + 'px';
  });
  chip.addEventListener('mouseleave', () => {
    if (chipTooltip) chipTooltip.classList.add('hidden');
  });
});

// ── Debug Panel ─────────────────────────────────────────────
const debugPanel = document.getElementById('debug-panel');
const debugToggle = document.getElementById('btn-debug-toggle');
const watchListContainer = document.getElementById('watch-list-container');
const errorListContainer = document.getElementById('error-list-container');
const truthtableContainer = document.getElementById('truthtable-container');
let _debugPanelVisible = false;
let _debugRefreshTimer = null;

function _toggleDebugPanel() {
  _debugPanelVisible = !_debugPanelVisible;
  debugPanel?.classList.toggle('hidden', !_debugPanelVisible);
  if (_debugPanelVisible) _refreshDebugPanels();
}

debugToggle?.addEventListener('click', _toggleDebugPanel);
document.getElementById('btn-debug-close')?.addEventListener('click', _toggleDebugPanel);

function _refreshDebugPanels() {
  watchList.renderTo(watchListContainer, simCtrl.valueFormat);
  errorOverlay.renderTo(errorListContainer);
}

// Watch list
document.getElementById('btn-watch-add')?.addEventListener('click', () => {
  const nodeId = state.selectedNodeId;
  if (!nodeId) { alert('Select a node first.'); return; }
  const node = scene.getNode(nodeId);
  watchList.add(nodeId, node?.label || nodeId);
  _refreshDebugPanels();
});

document.getElementById('btn-watch-clear')?.addEventListener('click', () => {
  watchList.clear();
  _refreshDebugPanels();
});

// Error overlay toggle
document.getElementById('errors-enabled')?.addEventListener('change', (e) => {
  errorOverlay.enabled = e.target.checked;
});

// Signal tracing
document.getElementById('btn-trace-forward')?.addEventListener('click', () => {
  if (!state.selectedNodeId) { alert('Select a node to trace from.'); return; }
  tracer.traceForward(state.selectedNodeId, scene.nodes, scene.wires);
});

document.getElementById('btn-trace-backward')?.addEventListener('click', () => {
  if (!state.selectedNodeId) { alert('Select a node to trace from.'); return; }
  tracer.traceBackward(state.selectedNodeId, scene.nodes, scene.wires);
});

document.getElementById('btn-trace-stop')?.addEventListener('click', () => {
  tracer.stop();
});

// Truth table generator
document.getElementById('btn-gen-truthtable')?.addEventListener('click', () => {
  const nodes = scene.nodes;
  const wires = scene.wires;
  const inputIds = nodes.filter(n => n.type === 'INPUT').map(n => n.id);
  const outputIds = nodes.filter(n => n.type === 'OUTPUT').map(n => n.id);

  if (inputIds.length === 0 || outputIds.length === 0) {
    if (truthtableContainer) truthtableContainer.innerHTML = '<div style="color:#ff4444;font-size:9px;padding:4px">Need at least 1 INPUT and 1 OUTPUT node.</div>';
    return;
  }

  const table = generateTruthTable(nodes, wires, inputIds, outputIds);
  if (truthtableContainer) truthtableContainer.innerHTML = renderTruthTableHTML(table);
});

// Waveform export
document.getElementById('btn-waveform-export')?.addEventListener('click', () => {
  const wfCanvas = document.getElementById('waveform-canvas');
  if (!wfCanvas) return;
  wfCanvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'waveform.png';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
});

// Keyboard shortcut: Ctrl+D toggles debug panel
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.code === 'KeyD') {
    e.preventDefault();
    _toggleDebugPanel();
  }
});

// ── Memory Inspector Panel ──────────────────────────────────
const memInspector = document.getElementById('mem-inspector');
const memBody = document.getElementById('mem-inspector-body');
let _memInspectorVisible = false;
let _memFormat = 'hex'; // 'hex', 'bin', 'dec'

function _toggleMemInspector() {
  _memInspectorVisible = !_memInspectorVisible;
  memInspector?.classList.toggle('hidden', !_memInspectorVisible);
  if (_memInspectorVisible) _refreshMemInspector();
}

document.getElementById('btn-mem-toggle')?.addEventListener('click', _toggleMemInspector);
document.getElementById('btn-mem-close')?.addEventListener('click', _toggleMemInspector);
document.getElementById('btn-mem-format')?.addEventListener('click', () => {
  const btn = document.getElementById('btn-mem-format');
  if (_memFormat === 'hex') { _memFormat = 'bin'; btn.textContent = 'BIN'; }
  else if (_memFormat === 'bin') { _memFormat = 'dec'; btn.textContent = 'DEC'; }
  else { _memFormat = 'hex'; btn.textContent = 'HEX'; }
  _refreshMemInspector();
});

function _formatMemValue(val, bits) {
  if (_memFormat === 'hex') return '0x' + (val >>> 0).toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0');
  if (_memFormat === 'bin') return (val >>> 0).toString(2).padStart(bits, '0');
  return val.toString();
}

function _refreshMemInspector() {
  if (!memBody || !_memInspectorVisible) return;

  const memNodes = scene.nodes.filter(n =>
    n.type === 'REGISTER' || n.type === 'SHIFT_REG' || n.type === 'COUNTER' ||
    n.type === 'RAM' || n.type === 'ROM' || n.type === 'REG_FILE' ||
    n.type === 'FIFO' || n.type === 'STACK' || n.type === 'PC'
  );

  if (memNodes.length === 0) {
    memBody.innerHTML = '<div class="mem-empty">No memory components in circuit</div>';
    return;
  }

  const typeLabels = { REGISTER: 'REG', SHIFT_REG: 'SHREG', COUNTER: 'CNT', RAM: 'RAM', ROM: 'ROM', REG_FILE: 'RF', FIFO: 'FIFO', STACK: 'STACK', PC: 'PC' };
  let html = '';

  for (const node of memNodes) {
    const ms = state.ffStates.get(node.id);
    const bits = node.bitWidth || node.dataBits || 4;
    const qVal = ms ? (ms.q ?? 0) : 0;

    // Component header row
    html += `<div class="mem-comp-header" data-node-id="${node.id}">`;
    html += `<span class="mem-row-label">${node.label || node.id}</span>`;
    html += `<span class="mem-row-type">${typeLabels[node.type]}</span>`;
    html += `<span class="mem-row-size">${bits}-bit</span>`;
    html += `<span class="mem-row-value">${_formatMemValue(qVal, bits)}</span>`;
    html += `<input class="mem-row-edit" type="text" value="${qVal}" data-node-id="${node.id}" title="Edit value (Enter)" />`;
    html += `</div>`;

    // Individual bit registers
    html += `<div class="mem-bits-grid">`;
    for (let b = bits - 1; b >= 0; b--) {
      const bitVal = (qVal >> b) & 1;
      html += `<div class="mem-bit-cell ${bitVal ? 'mem-bit-on' : 'mem-bit-off'}" data-node-id="${node.id}" data-bit="${b}">`;
      html += `<span class="mem-bit-label">Q${b}</span>`;
      html += `<span class="mem-bit-val">${bitVal}</span>`;
      html += `</div>`;
    }
    html += `</div>`;

    // RAM/ROM: show address-value table
    if ((node.type === 'RAM' || node.type === 'ROM') && ms?.memory) {
      const aBits = node.addrBits || 3;
      const addrCount = 1 << aBits;
      html += `<div class="mem-ram-table">`;
      for (let a = 0; a < addrCount; a++) {
        const cellVal = ms.memory[a] ?? 0;
        const active = cellVal !== 0 ? ' mem-ram-cell-active' : '';
        html += `<div class="mem-ram-cell${active}"><span class="mem-ram-addr">[${a}]</span>${_formatMemValue(cellVal, bits)}</div>`;
      }
      html += `</div>`;
    }

    // REG_FILE: show all internal registers
    if (node.type === 'REG_FILE' && ms?.regs) {
      const regCnt = node.regCount || 8;
      html += `<div class="mem-regfile-table">`;
      for (let r = 0; r < regCnt; r++) {
        const rVal = ms.regs[r] ?? 0;
        const active = rVal !== 0 ? ' mem-regfile-active' : '';
        html += `<div class="mem-regfile-row${active}" data-node-id="${node.id}" data-reg="${r}">`;
        html += `<span class="mem-regfile-name">R${r}</span>`;
        html += `<span class="mem-regfile-val">${_formatMemValue(rVal, bits)}</span>`;
        html += `<span class="mem-regfile-bin">${(rVal >>> 0).toString(2).padStart(bits, '0')}</span>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    // FIFO/STACK: show buffer contents
    if ((node.type === 'FIFO' || node.type === 'STACK') && ms?.buffer) {
      const depth = node.depth || 8;
      const bufLen = ms.buffer.length;
      html += `<div class="mem-regfile-table">`;
      html += `<div class="mem-regfile-row" style="border-bottom:1px solid #2a1a40">`;
      html += `<span class="mem-regfile-name" style="color:#5a4080">${bufLen}/${depth}</span>`;
      html += `<span class="mem-regfile-val" style="color:#5a4080">${ms.full ? 'FULL' : ms.empty ? 'EMPTY' : ''}</span>`;
      html += `</div>`;
      for (let i = 0; i < bufLen; i++) {
        const label = node.type === 'FIFO' ? (i === 0 ? '\u25B6 ' + i : '' + i) : (i === bufLen - 1 ? '\u25B6 ' + i : '' + i);
        const v = ms.buffer[i] ?? 0;
        html += `<div class="mem-regfile-row mem-regfile-active">`;
        html += `<span class="mem-regfile-name">${label}</span>`;
        html += `<span class="mem-regfile-val">${_formatMemValue(v, bits)}</span>`;
        html += `<span class="mem-regfile-bin">${(v >>> 0).toString(2).padStart(bits, '0')}</span>`;
        html += `</div>`;
      }
      html += `</div>`;
    }
  }

  memBody.innerHTML = html;

  // Click header to select node on canvas
  memBody.querySelectorAll('.mem-comp-header').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('mem-row-edit')) return;
      state.selectedNodeId = row.dataset.nodeId;
    });
  });

  // Click individual bit to toggle it
  memBody.querySelectorAll('.mem-bit-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const nodeId = cell.dataset.nodeId;
      const bit = parseInt(cell.dataset.bit);
      const ms = state.ffStates.get(nodeId);
      const node = scene.getNode(nodeId);
      if (!ms || !node) return;
      const bits = node.bitWidth || node.dataBits || 4;
      const mask = (1 << bits) - 1;
      ms.q = (ms.q ^ (1 << bit)) & mask;
      if (node.type === 'COUNTER') ms.count = ms.q;
      _refreshMemInspector();
    });
  });

  // Edit value inline
  memBody.querySelectorAll('.mem-row-edit').forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const nodeId = inp.dataset.nodeId;
        const node = scene.getNode(nodeId);
        const ms = state.ffStates.get(nodeId);
        if (!node || !ms) return;
        const bits = node.bitWidth || node.dataBits || 4;
        const mask = (1 << bits) - 1;
        let newVal = parseInt(inp.value, 10);
        if (isNaN(newVal)) newVal = 0;
        ms.q = newVal & mask;
        if (node.type === 'COUNTER') ms.count = ms.q;
        inp.value = ms.q;
        _refreshMemInspector();
      }
      e.stopPropagation();
    });
  });
}

// Auto-refresh memory inspector during simulation
setInterval(() => {
  if (_memInspectorVisible) _refreshMemInspector();
}, 200);

// ── Command Palette Actions ─────────────────────────────────
bus.on('palette:tool', (tool) => { state.tool = tool; });
bus.on('palette:action', (action) => {
  switch (action) {
    case 'undo': commands.undo(); break;
    case 'redo': commands.redo(); break;
    case 'clear': document.getElementById('btn-design-clear')?.click(); break;
    case 'export': document.getElementById('btn-design-export')?.click(); break;
    case 'import': document.getElementById('btn-design-import')?.click(); break;
    case 'screenshot': document.getElementById('btn-design-share')?.click(); break;
    case 'toggle-debug': _toggleDebugPanel(); break;
    case 'toggle-waveform': toggleWaveform(); break;
    case 'zoom-fit': Renderer.zoomToFit(scene.nodes); break;
    case 'gen-truthtable': document.getElementById('btn-gen-truthtable')?.click(); break;
  }
});
bus.on('palette:select-node', (nodeId) => {
  state.selectedNodeId = nodeId;
  // Pan to center on the node
  const node = scene.getNode(nodeId);
  if (node) {
    Renderer.resetPan();
  }
});

// ── MiniMap Navigation ──────────────────────────────────────
miniMap.onNavigate = (worldX, worldY) => {
  Renderer.resetPan();
  Renderer.panBy(
    window.innerWidth / 2 - worldX,
    window.innerHeight / 2 - worldY
  );
};

// ── Multi-select / Align / Distribute ───────────────────────
const alignToolbar = document.getElementById('align-toolbar');

bus.on('multiselect:changed', (ids) => {
  if (alignToolbar) {
    alignToolbar.classList.toggle('hidden', ids.length < 2);
  }
});

document.querySelectorAll('.align-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.align;
    switch (action) {
      case 'left': selection.alignLeft(); break;
      case 'right': selection.alignRight(); break;
      case 'top': selection.alignTop(); break;
      case 'bottom': selection.alignBottom(); break;
      case 'center-h': selection.alignCenterH(); break;
      case 'center-v': selection.alignCenterV(); break;
      case 'dist-h': selection.distributeH(); break;
      case 'dist-v': selection.distributeV(); break;
    }
  });
});

// ── Sub-circuit creation ────────────────────────────────────
document.getElementById('btn-create-block')?.addEventListener('click', () => {
  const ids = [...selection.selected];
  if (ids.length < 2) { alert('Select at least 2 nodes.'); return; }

  const name = prompt('Sub-circuit name:');
  if (!name || !name.trim()) return;
  const trimName = name.trim();

  if (subRegistry.get(trimName)) {
    if (!confirm('A sub-circuit named "' + trimName + '" already exists. Overwrite?')) return;
  }

  // Collect selected nodes and internal wires
  const selectedSet = new Set(ids);
  const selectedNodes = ids.map(id => scene.getNode(id)).filter(Boolean);
  const internalWires = scene.wires.filter(w => selectedSet.has(w.sourceId) && selectedSet.has(w.targetId));

  // Must have at least one INPUT and one OUTPUT
  const hasInput = selectedNodes.some(n => n.type === 'INPUT');
  const hasOutput = selectedNodes.some(n => n.type === 'OUTPUT');
  if (!hasInput || !hasOutput) {
    alert('Selection must contain at least one INPUT and one OUTPUT node.\nINPUT nodes become the block inputs, OUTPUT nodes become the block outputs.');
    return;
  }

  // Define the sub-circuit
  subRegistry.define(trimName, selectedNodes, internalWires);

  // Add to BLOCKS palette dynamically
  _addSubCircuitToPalette(trimName);

  // Remove selected nodes from canvas and replace with a SUB_CIRCUIT block
  const cx = selectedNodes.reduce((s, n) => s + n.x, 0) / selectedNodes.length;
  const cy = selectedNodes.reduce((s, n) => s + n.y, 0) / selectedNodes.length;

  // Remove external wires first, then nodes
  const externalWires = scene.wires.filter(w =>
    (selectedSet.has(w.sourceId) || selectedSet.has(w.targetId)) &&
    !(selectedSet.has(w.sourceId) && selectedSet.has(w.targetId))
  );
  for (const w of externalWires) scene.removeWire(w.id);
  for (const w of internalWires) scene.removeWire(w.id);
  for (const id of ids) scene.removeNode(id);

  // Place instance
  const instance = subRegistry.createInstance(trimName, cx, cy, undefined);
  scene.addNode(instance);
  state.selectedNodeId = instance.id;
  selection.clearSelection();

  alert('Sub-circuit "' + trimName + '" created! It is now available in the BLOCKS tab.');
});

function _addSubCircuitToPalette(name) {
  const blocksPanel = document.querySelector('.palette-panel[data-panel="blocks"]');
  if (!blocksPanel) return;
  // Check if already exists
  if (blocksPanel.querySelector('[data-tool="place-sub-' + name + '"]')) return;
  const chip = document.createElement('span');
  chip.className = 'palette-chip palette-block';
  chip.dataset.tool = 'place-sub-' + name;
  chip.draggable = true;
  chip.textContent = name;
  chip.style.borderColor = '#00d4ff';
  chip.style.color = '#00d4ff';
  blocksPanel.appendChild(chip);
}

// Handle placement of sub-circuit instances
bus.on('palette:tool', (tool) => {
  if (tool.startsWith('place-sub-')) {
    const subName = tool.replace('place-sub-', '');
    // Store in state so InputHandler can use it
    state._pendingSubCircuit = subName;
  }
});

// Copy/paste keyboard shortcuts
window.addEventListener('keydown', (e) => {
  const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
  if (isTyping) return;

  if (e.ctrlKey && e.code === 'KeyC') { e.preventDefault(); selection.copy(); }
  if (e.ctrlKey && e.code === 'KeyV') { e.preventDefault(); selection.paste(); }
  if (e.ctrlKey && e.code === 'KeyA') { e.preventDefault(); selection.selectAll(); }
});

// ── Project Save/Load ───────────────────────────────────────
const projectNameDisplay = document.getElementById('project-name-display');
const projectListOverlay = document.getElementById('project-list-overlay');
const projectListContent = document.getElementById('project-list-content');

document.getElementById('btn-project-save')?.addEventListener('click', async () => {
  const name = prompt('Project name:', _currentProjectId ? '' : 'My Circuit');
  if (!name) return;

  const project = {
    id: _currentProjectId || undefined,
    name,
    circuit: scene.serialize(),
    annotations: annotations.serialize(),
    metadata: { stepCount: state.stepCount },
  };

  const saved = await projectStore.save(project);
  _currentProjectId = saved.id;
  if (projectNameDisplay) projectNameDisplay.textContent = name;
});

document.getElementById('btn-project-load')?.addEventListener('click', () => {
  const json = prompt('Paste project JSON:');
  if (!json) return;
  try {
    const project = projectStore.importJSON(json);
    scene.deserialize(project.circuit);
    annotations.deserialize(project.annotations);
    state.resetSequentialState(scene.nodes);
    simCtrl.reset();
    commands.clear();
    _currentProjectId = project.id;
    if (projectNameDisplay) projectNameDisplay.textContent = project.name || 'Imported';
  } catch (err) {
    alert('Invalid project file: ' + err.message);
  }
});

document.getElementById('btn-project-list')?.addEventListener('click', async () => {
  const projects = await projectStore.list();
  if (projectListContent) {
    if (projects.length === 0) {
      projectListContent.innerHTML = '<div style="color:#4a6080;padding:8px">No saved projects yet.</div>';
    } else {
      projectListContent.innerHTML = projects.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #1a2a3a">
          <div>
            <div style="color:#c8d8f0;font-size:11px">${p.name}</div>
            <div style="color:#4a6080;font-size:9px">${p.nodeCount} nodes, ${p.wireCount} wires — ${new Date(p.modified).toLocaleString()}</div>
          </div>
          <div style="display:flex;gap:4px">
            <button class="proj-load-btn design-action" data-id="${p.id}" style="font-size:9px">LOAD</button>
            <button class="proj-del-btn design-action design-action-danger" data-id="${p.id}" style="font-size:9px">DEL</button>
          </div>
        </div>
      `).join('');

      projectListContent.querySelectorAll('.proj-load-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const project = await projectStore.load(btn.dataset.id);
          scene.deserialize(project.circuit);
          if (project.annotations) annotations.deserialize(project.annotations);
          state.resetSequentialState(scene.nodes);
          simCtrl.reset();
          commands.clear();
          _currentProjectId = project.id;
          if (projectNameDisplay) projectNameDisplay.textContent = project.name;
          projectListOverlay.classList.add('hidden');
        });
      });

      projectListContent.querySelectorAll('.proj-del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this project?')) return;
          await projectStore.delete(btn.dataset.id);
          btn.closest('div[style]').remove();
        });
      });
    }
  }
  projectListOverlay?.classList.remove('hidden');
});

document.getElementById('btn-project-list-close')?.addEventListener('click', () => {
  projectListOverlay?.classList.add('hidden');
});

projectListOverlay?.addEventListener('click', (e) => {
  if (e.target === projectListOverlay) projectListOverlay.classList.add('hidden');
});

// ── Export Buttons ───────────────────────────────────────────
document.getElementById('btn-export-png')?.addEventListener('click', () => {
  document.getElementById('btn-design-share')?.click();
});

document.getElementById('btn-export-json')?.addEventListener('click', () => {
  const project = {
    name: 'Circuit Export',
    circuit: scene.serialize(),
    annotations: annotations.serialize(),
    exported: new Date().toISOString(),
  };
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'circuit-project.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-export-svg')?.addEventListener('click', () => {
  // Simple SVG export — creates an SVG from the current canvas
  const w = canvas.width, h = canvas.height;
  const dataUrl = canvas.toDataURL('image/png');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <image href="${dataUrl}" width="${w}" height="${h}"/>
  </svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'circuit.svg';
  a.click();
  URL.revokeObjectURL(url);
});

// ── Zoom to Fit ─────────────────────────────────────────────
document.getElementById('btn-zoom-fit')?.addEventListener('click', () => {
  Renderer.zoomToFit(scene.nodes);
});

// ── ROM Editor ──────────────────────────────────────────────
const romOverlay = document.getElementById('rom-editor-overlay');
const romBody    = document.getElementById('rom-editor-body');
let _romEditorNode = null;
let _romEditorData = {}; // addr → value

function _openRomEditor(node) {
  _romEditorNode = node;
  _romEditorData = node.memory ? { ...node.memory } : {};
  _initRomBuilderDropdowns();
  _renderRomTable();
  romOverlay?.classList.remove('hidden');
}

function _initRomBuilderDropdowns() {
  const opSel  = document.getElementById('rom-builder-op');
  const rdSel  = document.getElementById('rom-builder-rd');
  const rs1Sel = document.getElementById('rom-builder-rs1');
  const rs2Sel = document.getElementById('rom-builder-rs2');
  if (!opSel) return;

  opSel.innerHTML = getOpcodeNames().map(n => `<option value="${n}">${n}</option>`).join('');
  for (const sel of [rdSel, rs1Sel, rs2Sel]) {
    sel.innerHTML = '';
    for (let r = 0; r < 16; r++) sel.innerHTML += `<option value="R${r}">R${r}</option>`;
  }

  // Update visibility based on opcode format
  opSel.onchange = () => {
    const fmt = getOpcodeFormat(opSel.value);
    rdSel.style.display  = fmt >= 2 ? '' : 'none';
    rs1Sel.style.display = fmt >= 2 ? '' : 'none';
    rs2Sel.style.display = fmt >= 3 ? '' : 'none';
    if (fmt === 1) { rdSel.style.display = ''; rdSel.innerHTML = ''; for (let i = 0; i < 16; i++) rdSel.innerHTML += `<option value="${i}">${i}</option>`; }
  };
  opSel.onchange();
}

function _renderRomTable() {
  if (!romBody || !_romEditorNode) return;
  const addrCount = 1 << (_romEditorNode.addrBits || 3);
  let html = '';
  for (let a = 0; a < addrCount; a++) {
    const val = _romEditorData[a] ?? 0;
    const hex = '0x' + val.toString(16).toUpperCase().padStart(4, '0');
    const asm = disassemble(val);
    html += `<tr>
      <td class="rom-addr">${a}</td>
      <td><input class="rom-hex-input" data-addr="${a}" value="${hex}" /></td>
      <td><input class="rom-asm-input" data-addr="${a}" value="${asm}" /></td>
      <td><button class="rom-del-btn" data-addr="${a}">CLR</button></td>
    </tr>`;
  }
  romBody.innerHTML = html;

  // Hex input → update asm
  romBody.querySelectorAll('.rom-hex-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const addr = parseInt(inp.dataset.addr);
      let val = parseInt(inp.value, 16);
      if (isNaN(val)) val = 0;
      val = val & 0xFFFF;
      _romEditorData[addr] = val;
      inp.value = '0x' + val.toString(16).toUpperCase().padStart(4, '0');
      const asmInp = romBody.querySelector(`.rom-asm-input[data-addr="${addr}"]`);
      if (asmInp) asmInp.value = disassemble(val);
    });
  });

  // Asm input → update hex
  romBody.querySelectorAll('.rom-asm-input').forEach(inp => {
    // Auto-uppercase while typing
    inp.addEventListener('input', () => {
      const pos = inp.selectionStart;
      inp.value = inp.value.toUpperCase();
      inp.setSelectionRange(pos, pos);
    });
    inp.addEventListener('change', () => {
      const addr = parseInt(inp.dataset.addr);
      const val = assemble(inp.value);
      _romEditorData[addr] = val;
      const hexInp = romBody.querySelector(`.rom-hex-input[data-addr="${addr}"]`);
      if (hexInp) hexInp.value = '0x' + val.toString(16).toUpperCase().padStart(4, '0');
      inp.value = disassemble(val);
    });
  });

  // Clear button
  romBody.querySelectorAll('.rom-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const addr = parseInt(btn.dataset.addr);
      _romEditorData[addr] = 0;
      _renderRomTable();
    });
  });
}

// INSERT button — build instruction from dropdowns
document.getElementById('btn-rom-insert')?.addEventListener('click', () => {
  const op  = document.getElementById('rom-builder-op').value;
  const fmt = getOpcodeFormat(op);
  let line = op;
  if (fmt === 1) {
    line += ' ' + document.getElementById('rom-builder-rd').value;
  } else if (fmt === 2) {
    line += ' ' + document.getElementById('rom-builder-rd').value + ', ' + document.getElementById('rom-builder-rs1').value;
  } else if (fmt === 3) {
    line += ' ' + document.getElementById('rom-builder-rd').value + ', ' + document.getElementById('rom-builder-rs1').value + ', ' + document.getElementById('rom-builder-rs2').value;
  }

  const val = assemble(line);
  // Find first empty slot
  const addrCount = 1 << (_romEditorNode?.addrBits || 3);
  let addr = -1;
  for (let a = 0; a < addrCount; a++) {
    if (!_romEditorData[a]) { addr = a; break; }
  }
  if (addr === -1) addr = addrCount - 1; // overwrite last
  _romEditorData[addr] = val;
  _renderRomTable();
});

// SAVE button
document.getElementById('btn-rom-save')?.addEventListener('click', () => {
  if (!_romEditorNode) return;
  commands.execute(new SetNodePropsCommand(scene, _romEditorNode.id, { memory: { ..._romEditorData } }));
  state.ffStates.delete(_romEditorNode.id);
  romOverlay?.classList.add('hidden');
  _romEditorNode = null;
});

// CLOSE button
document.getElementById('btn-rom-close')?.addEventListener('click', () => {
  romOverlay?.classList.add('hidden');
  _romEditorNode = null;
});

romOverlay?.addEventListener('click', (e) => {
  if (e.target === romOverlay) { romOverlay.classList.add('hidden'); _romEditorNode = null; }
});

// Expose for InputHandler double-click
bus.on('rom:edit', (node) => { _openRomEditor(node); });

// ── Examples System ─────────────────────────────────────────
const EXAMPLES = [
  {
    id: '4bit-counter',
    title: '4-Bit Counter',
    desc: 'A simple 4-bit counter driven by a clock. Press Play to see it count up from 0 to 15.',
    tags: ['beginner', 'Counter', 'CLK'],
    file: 'examples/4bit-counter.json',
  },
  {
    id: 'alu-calculator',
    title: 'ALU Calculator',
    desc: 'An 8-bit ALU performing ADD on two immediate values. Double-click the IMM nodes to change values and operation.',
    tags: ['beginner', 'ALU', 'IMM'],
    file: 'examples/alu-calculator.json',
  },
  {
    id: 'register-load',
    title: 'Register Load/Read',
    desc: 'Load a value into an 8-bit register on a clock edge, then read it back. Toggle EN to enable/disable loading.',
    tags: ['beginner', 'Register', 'CLK'],
    file: 'examples/register-load.json',
  },
  {
    id: 'ram-readwrite',
    title: 'RAM Read/Write',
    desc: 'Write a value to a specific RAM address, then read it back. Change ADDR and DATA to experiment.',
    tags: ['intermediate', 'RAM'],
    file: 'examples/ram-readwrite.json',
  },
  {
    id: 'fifo-pipeline',
    title: 'FIFO Queue',
    desc: 'A 4-deep FIFO buffer. Toggle WR to push data, toggle RD to pop. Watch FULL and EMPTY flags.',
    tags: ['intermediate', 'FIFO'],
    file: 'examples/fifo-pipeline.json',
  },
  {
    id: 'instruction-decoder',
    title: 'Instruction Decoder',
    desc: 'An IR decodes a 16-bit instruction into opcode, RD, RS1, RS2 fields. The CU generates control signals from the opcode.',
    tags: ['advanced', 'IR', 'CU'],
    file: 'examples/instruction-decoder.json',
  },
  {
    id: 'simple-cpu',
    title: 'Simple CPU — Countdown',
    desc: 'A complete CPU with Register File. Counts down R1 from 10 to 0 using SUB R1,R1,R2 each cycle. Watch R1 decrease in real-time until HALT.',
    tags: ['advanced', 'PC', 'ROM', 'IR', 'CU', 'ALU', 'RF'],
    file: 'examples/simple-cpu.json',
  },
];

const examplesOverlay = document.getElementById('examples-overlay');
const examplesList = document.getElementById('examples-list');

function _showExamples() {
  examplesList.innerHTML = EXAMPLES.map(ex => {
    const tagHtml = ex.tags.map(t => {
      const level = t === 'beginner' ? 'beginner' : t === 'intermediate' ? 'intermediate' : t === 'advanced' ? 'advanced' : 'component';
      return `<span class="example-tag example-tag-${level}">${t.toUpperCase()}</span>`;
    }).join('');
    return `<div class="example-card" data-file="${ex.file}">
      <div class="example-card-title">${ex.title}</div>
      <div class="example-card-desc">${ex.desc}</div>
      <div class="example-card-tags">${tagHtml}</div>
    </div>`;
  }).join('');

  examplesList.querySelectorAll('.example-card').forEach(card => {
    card.addEventListener('click', async () => {
      const file = card.dataset.file;
      try {
        const resp = await fetch(file);
        if (!resp.ok) throw new Error('Failed to load');
        const data = await resp.json();
        if (data.nodes && data.wires) {
          scene.deserialize(data);
          state.selectedNodeId = null;
          commands.clear();
          state.resetSequentialState(scene.nodes);
          Renderer.zoomToFit(scene.nodes);
        }
      } catch (e) {
        alert('Failed to load example: ' + e.message);
      }
      examplesOverlay.classList.add('hidden');
    });
  });

  examplesOverlay.classList.remove('hidden');
}

document.getElementById('btn-examples')?.addEventListener('click', _showExamples);
document.getElementById('btn-examples-close')?.addEventListener('click', () => {
  examplesOverlay.classList.add('hidden');
});
examplesOverlay?.addEventListener('click', (e) => {
  if (e.target === examplesOverlay) examplesOverlay.classList.add('hidden');
});

// ── Initialize ──────────────────────────────────────────────
function start() {
  // Init renderer
  Renderer.init(canvas);
  window.addEventListener('resize', () => {
    Renderer.resize();
    if (Waveform.isVisible()) Waveform.render();
  });

  // Init waveform
  Waveform.init(document.getElementById('waveform-canvas'));

  // Init input handler
  // Expose sub-circuit registry to InputHandler via state
  state._subRegistry = subRegistry;

  Input.init(canvas, scene, state, commands);

  // Load saved design
  const saved = localStorage.getItem('circuit_designer_pro');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      scene.deserialize(data);
      state.resetSequentialState(scene.nodes);
    } catch (_) {
      // ignore corrupt data
    }
  }

  // Initialize waveform signals
  Waveform.setSignals(scene.nodes);

  // Update UI
  _updateDesignToolActive('select');
  _updateSequentialUI();
  _updateStepCount();

  // Start render loop
  _rafId = requestAnimationFrame(tick);

  console.log('[Circuit Designer Pro] initialized');
}

start();
