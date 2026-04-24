/**
 * app.js — Circuit Designer Pro — Application Bootstrap
 * Wires together all modules and starts the app loop.
 */
import { bus } from './core/EventBus.js';
import { StateManager } from './core/StateManager.js';
import { CommandManager } from './core/CommandManager.js';
import { SceneGraph } from './core/SceneGraph.js';
import * as Renderer from './rendering/CanvasRenderer.js';
import * as Waveform from './waveform/WaveformController.js';
import * as Input from './interaction/InputHandler.js';
import { MEMORY_TYPE_SET, COMPONENT_TYPES, createComponent, createWire } from './components/Component.js';
import { SetNodePropsCommand, RemoveNodeCommand, AddNodeCommand, AddWireCommand } from './components/CircuitCommands.js';
import { assemble, disassemble, decompileRomToC, getOpcodeNames, getOpcodeFormat } from './cpu/Assembler.js';
import { compileCToROM } from './cpu/compiler/CCompiler.js';
import { SubCircuitRegistry } from './core/SubCircuitRegistry.js';
import { ShortcutManager } from './core/ShortcutManager.js';
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
import { exportCircuit as exportVerilog } from './hdl/VerilogExporter.js';
import { PipelineAnalyzer } from './pipeline/PipelineAnalyzer.js';
import { PipelinePanel } from './pipeline/ui/PipelinePanel.js';
import * as PipelineTelemetry from './pipeline/Telemetry.js';
import { StageOverlay } from './pipeline/ui/StageOverlay.js';
import { suggestRetime } from './pipeline/Retimer.js';
import { RetimeCommand } from './pipeline/commands/RetimeCommand.js';
import { verifyRetiming } from './pipeline/RetimeVerifier.js';
import { setRetimePreview, setStagePalette, getStagePalette } from './rendering/CanvasRenderer.js';

// ── Singletons ──────────────────────────────────────────────
const scene    = new SceneGraph();
const subRegistry = new SubCircuitRegistry();
const shortcuts = new ShortcutManager();
const state    = new StateManager();
const commands = new CommandManager(100);
const simCtrl  = new SimulationController();
const pipelineAnalyzer = new PipelineAnalyzer(scene);
const pipelinePanel    = new PipelinePanel(pipelineAnalyzer);
const stageOverlay     = new StageOverlay(pipelineAnalyzer);

function _toggleStageView() {
  stageOverlay.toggle();
  const on = stageOverlay.isEnabled();
  const btn = document.getElementById('btn-stageview-toggle');
  if (btn) btn.classList.toggle('active', on);
  _showRomNotification(on ? 'Stage View: ON' : 'Stage View: OFF');
}
document.getElementById('btn-stageview-toggle')?.addEventListener('click', _toggleStageView);
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

// ── Context Menu ────────────────────────────────────────────
const ctxMenu = document.getElementById('context-menu');
let _ctxNodeId = null;

function _showContextMenu(x, y, nodeId) {
  _ctxNodeId = nodeId;
  state.selectedNodeId = nodeId;

  // Show/hide block-only items
  const node = scene.getNode(nodeId);
  const isBlock = node?.type === 'SUB_CIRCUIT';
  ctxMenu.querySelectorAll('.ctx-block-only').forEach(el => {
    el.classList.toggle('hidden', !isBlock);
  });

  // Position menu (keep on screen)
  const menuW = 160, menuH = 280;
  const posX = Math.min(x, window.innerWidth - menuW);
  const posY = Math.min(y, window.innerHeight - menuH);
  ctxMenu.style.left = posX + 'px';
  ctxMenu.style.top = posY + 'px';
  ctxMenu.classList.remove('hidden');
}

function _hideContextMenu() {
  ctxMenu?.classList.add('hidden');
  _ctxNodeId = null;
}

// Right-click on canvas
canvas?.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const node = Renderer.getNodeAtPoint(px, py, scene.nodes);

  if (node) {
    _showContextMenu(e.clientX, e.clientY, node.id);
  } else {
    _hideContextMenu();
  }
});

// Close on click outside or ESC
document.addEventListener('click', (e) => {
  if (!ctxMenu?.contains(e.target)) _hideContextMenu();
});
bus.on('overlay:close', _hideContextMenu);

// Handle menu actions
ctxMenu?.addEventListener('click', (e) => {
  const action = e.target.dataset?.action;
  if (!action) return;
  const node = _ctxNodeId ? scene.getNode(_ctxNodeId) : null;

  switch (action) {
    case 'delete':
      if (_ctxNodeId) {
        commands.execute(new RemoveNodeCommand(scene, _ctxNodeId));
        state.selectedNodeId = null;
      }
      break;

    case 'duplicate':
      if (node) {
        const copy = { ...node, id: undefined, x: node.x + 40, y: node.y + 40 };
        if (copy.subCircuit) copy.subCircuit = JSON.parse(JSON.stringify(copy.subCircuit));
        if (copy.memory) copy.memory = { ...copy.memory };
        if (copy.initialRegs) copy.initialRegs = [...copy.initialRegs];
        scene.addNode(copy);
        state.selectedNodeId = copy.id;
      }
      break;

    case 'properties':
      if (node) {
        const off = Renderer.getOffset();
        const sx = node.x * off.scale + off.x + canvas.getBoundingClientRect().left;
        const sy = node.y * off.scale + off.y + canvas.getBoundingClientRect().top;
        if (node.type === 'ROM') {
          bus.emit('rom:edit', node);
        } else if (node.type === 'CU') {
          bus.emit('cu:edit', node);
        } else {
          bus.emit('node:dblclick', { node, screenX: sx, screenY: sy });
        }
      }
      break;

    case 'watch':
      if (_ctxNodeId) {
        watchList.add(_ctxNodeId, node?.label || _ctxNodeId);
        if (!_debugPanelVisible) _toggleDebugPanel();
      }
      break;

    case 'copy':
      if (_ctxNodeId) {
        selection.select(_ctxNodeId);
        selection.copy();
      }
      break;

    case 'paste':
      selection.paste();
      break;

    case 'center':
      if (node) Renderer.zoomToNode(node);
      break;

    case 'disconnect':
      if (_ctxNodeId) {
        const wires = scene.getWiresForNode(_ctxNodeId);
        const allWires = [...wires.incoming, ...wires.outgoing];
        if (allWires.length > 0) {
          const before = scene.snapshot();
          for (const w of allWires) scene.removeWire(w.id);
          const after = scene.snapshot();
          commands._undoStack.push({
            description: 'Disconnect All',
            execute() {},
            undo: () => scene.restoreSnapshot(before),
          });
          commands._redoStack = [];
        }
      }
      break;

    case 'bringfront':
      if (_ctxNodeId) {
        const nodes = scene.nodes;
        const idx = nodes.findIndex(n => n.id === _ctxNodeId);
        if (idx >= 0 && idx < nodes.length - 1) {
          const n = nodes.splice(idx, 1)[0];
          nodes.push(n);
          scene.deserialize({ nodes, wires: scene.wires });
        }
      }
      break;

    case 'sendback':
      if (_ctxNodeId) {
        const nodes = scene.nodes;
        const idx = nodes.findIndex(n => n.id === _ctxNodeId);
        if (idx > 0) {
          const n = nodes.splice(idx, 1)[0];
          nodes.unshift(n);
          scene.deserialize({ nodes, wires: scene.wires });
        }
      }
      break;

    case 'expandblock':
      if (node?.type === 'SUB_CIRCUIT' && node.subCircuit) {
        const before = scene.snapshot();
        const sc = node.subCircuit;
        const cx = node.x, cy = node.y;
        // Remove the block
        scene.removeNode(_ctxNodeId);
        // Add back internal nodes with offset
        const idMap = new Map();
        for (const n of (sc.nodes || [])) {
          const newId = scene.addNode({ ...n, x: n.x + cx, y: n.y + cy });
          idMap.set(n.id, newId);
        }
        // Add back internal wires
        for (const w of (sc.wires || [])) {
          const newSrc = idMap.get(w.sourceId);
          const newTgt = idMap.get(w.targetId);
          if (newSrc && newTgt) {
            scene.addWire({ ...w, id: undefined, sourceId: newSrc, targetId: newTgt });
          }
        }
        // Undo support
        commands._undoStack.push({ description: 'Expand Block', execute() {}, undo: () => scene.restoreSnapshot(before) });
        commands._redoStack = [];
        state.selectedNodeId = null;
      }
      break;

    case 'viewblock':
      if (node?.type === 'SUB_CIRCUIT' && node.subCircuit) {
        _showBlockViewer(node);
      }
      break;
  }

  _hideContextMenu();
});

// ── Block Internals Viewer ──────────────────────────────────

function _showBlockViewer(node) {
  const sc = node.subCircuit;
  if (!sc || !sc.nodes) return;

  // Open in a new popup window
  const popup = window.open('', 'BlockViewer', 'width=900,height=650,menubar=no,toolbar=no,status=no');
  if (!popup) { alert('Popup blocked. Please allow popups for this site.'); return; }

  const title = node.subName || node.label || 'BLOCK';
  const nodesJSON = JSON.stringify(sc.nodes);
  const wiresJSON = JSON.stringify(sc.wires || []);

  popup.document.write(`<!DOCTYPE html>
<html><head>
<title>Block: ${title}</title>
<style>
  body { margin:0; background:#080c12; overflow:hidden; font-family:'JetBrains Mono',monospace; }
  #header { padding:10px 16px; background:#0d1320; border-bottom:2px solid #00d4ff; color:#00d4ff;
    font-size:14px; font-weight:bold; letter-spacing:1px; display:flex; justify-content:space-between; align-items:center; }
  canvas { display:block; }
</style>
</head><body>
<div id="header">
  <span>BLOCK: ${title}</span>
  <span style="color:#4a6080;font-size:10px">Read-only view</span>
</div>
<canvas id="cv"></canvas>
<script>
const nodes = ${nodesJSON};
const wires = ${wiresJSON};
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
cv.width = window.innerWidth;
cv.height = window.innerHeight - 42;
window.addEventListener('resize', () => { cv.width = window.innerWidth; cv.height = window.innerHeight - 42; draw(); });

function draw() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (nodes.length === 0) return;

  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  nodes.forEach(n => { minX=Math.min(minX,n.x); maxX=Math.max(maxX,n.x); minY=Math.min(minY,n.y); maxY=Math.max(maxY,n.y); });
  const pad = 100;
  const bw = (maxX-minX)+pad*2, bh = (maxY-minY)+pad*2;
  const scale = Math.min(2, cv.width/bw, cv.height/bh);
  const offX = cv.width/2 - ((minX+maxX)/2)*scale;
  const offY = cv.height/2 - ((minY+maxY)/2)*scale;

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Wires
  wires.forEach(w => {
    const src = nodeMap.get(w.sourceId), dst = nodeMap.get(w.targetId);
    if (!src || !dst) return;
    ctx.strokeStyle = w.isClockWire ? '#00bcd4' : '#2a5070';
    ctx.lineWidth = w.isClockWire ? 1.5 : 2;
    if (w.isClockWire) ctx.setLineDash([6,4]); else ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(src.x, src.y); ctx.lineTo(dst.x, dst.y); ctx.stroke();
    ctx.setLineDash([]);
  });

  // Nodes
  nodes.forEach(n => {
    const isIn = n.type==='INPUT', isOut = n.type==='OUTPUT', isCLK = n.type==='CLOCK';
    const colors = {
      INPUT:['rgba(57,255,20,0.15)','#39ff14'], OUTPUT:['rgba(255,60,60,0.15)','#ff4444'],
      CLOCK:['rgba(0,188,212,0.15)','#00bcd4'], GATE_SLOT:['rgba(0,212,255,0.1)','#00d4ff'],
      ALU:['rgba(255,160,40,0.12)','#ffa028'], CU:['rgba(255,160,40,0.12)','#ffa028'],
      IR:['rgba(255,160,40,0.12)','#ffa028'],
    };
    const [fill, stroke] = colors[n.type] || ['rgba(128,90,213,0.12)','#a078e0'];
    const w = 70, h = 40;

    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(n.x-w/2, n.y-h/2, w, h, 6);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = stroke;
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(n.label || n.type, n.x, n.y - 4);

    ctx.fillStyle = '#4a6080';
    ctx.font = '8px JetBrains Mono, monospace';
    ctx.fillText(n.type, n.x, n.y + 10);
  });

  ctx.restore();
}
draw();
</`+`script>
</body></html>`);
  popup.document.close();
}

// ── Keyboard Shortcuts Panel ────────────────────────────────
const shortcutsOverlay = document.getElementById('shortcuts-overlay');
const shortcutsBody = document.getElementById('shortcuts-body');

let _scEditingId = null;

function _showShortcuts() {
  const grouped = shortcuts.getGrouped();
  let html = '';

  // Non-keyboard shortcuts (always shown, not editable)
  const extras = [
    { group: 'Mouse', items: [['Pan', 'Drag empty area'], ['Rename', 'Double-click'], ['Properties', 'Dbl-click (blocks)'], ['Multi-Select Add', 'Shift+Click'], ['Rubber-band', 'Q + Drag'], ['Context Menu', 'Right-click']] },
    { group: 'Waveform', items: [
      ['Zoom',                    'Ctrl+Wheel  or  + / −'],
      ['Horizontal pan',          'Drag data / Shift+Wheel / Wheel / h / l'],
      ['Vertical scroll',         'Wheel (when overflow) / Drag scrollbar'],
      ['Fit to window',           'F'],
      ['Full-screen panel',       'Shift+F  (Esc exits)'],
      ['Next edge (active sig)',  '→'],
      ['Prev edge (active sig)',  '←'],
      ['Step cursor ± 1',         'h / l'],
      ['Next / prev signal',      'k / j'],
      ['First / last cycle',      'Home / End'],
      ['Add bookmark',            'B'],
      ['Place marker A / B',      'Click / Shift+Click'],
      ['Clear both markers',      'Double-click data area'],
      ['Signal options menu',     'Right-click row'],
      ['Reorder signals',         'Drag label up/down'],
      ['Toggle panel',            'W'],
      ['Cycle radix',             'DEC button in header'],
    ]},
  ];

  for (const [groupName, items] of Object.entries(grouped)) {
    html += `<div class="sc-group-title">${groupName}</div>`;
    for (const sc of items) {
      const displayKey = ShortcutManager.formatKey(sc.key);
      const editBtn = `<button class="sc-edit-btn" data-scid="${sc.id}" title="Click to rebind">edit</button>`;
      const resetBtn = sc.isDefault ? '' : `<button class="sc-reset-btn" data-scid="${sc.id}" title="Reset to default">reset</button>`;
      html += `<div class="sc-row">
        <span class="sc-action">${sc.label}</span>
        <span style="display:flex;gap:4px;align-items:center">
          ${resetBtn}
          <span class="sc-key" id="sc-key-${sc.id}">${displayKey}</span>
          ${editBtn}
        </span>
      </div>`;
    }
  }

  for (const extra of extras) {
    html += `<div class="sc-group-title">${extra.group}</div>`;
    for (const [action, key] of extra.items) {
      html += `<div class="sc-row"><span class="sc-action">${action}</span><span class="sc-key">${key}</span></div>`;
    }
  }

  html += `<div style="margin-top:12px;text-align:center"><button id="btn-sc-resetall" style="font:10px 'JetBrains Mono',monospace;padding:4px 12px;background:#2a1010;border:1px solid #4a2020;color:#ff6666;border-radius:3px;cursor:pointer">Reset All to Defaults</button></div>`;

  shortcutsBody.innerHTML = html;

  // Edit buttons
  shortcutsBody.querySelectorAll('.sc-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.scid;
      _scEditingId = id;
      const keyEl = document.getElementById('sc-key-' + id);
      if (keyEl) {
        keyEl.textContent = 'Press key...';
        keyEl.style.borderColor = '#ffa028';
        keyEl.style.color = '#ffa028';
      }
    });
  });

  // Reset buttons
  shortcutsBody.querySelectorAll('.sc-reset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      shortcuts.resetKey(btn.dataset.scid);
      _showShortcuts();
    });
  });

  // Reset all
  document.getElementById('btn-sc-resetall')?.addEventListener('click', () => {
    if (confirm('Reset all shortcuts to defaults?')) {
      shortcuts.resetAll();
      _showShortcuts();
    }
  });

  shortcutsOverlay?.classList.remove('hidden');
}

// Capture key when editing a shortcut
window.addEventListener('keydown', (e) => {
  if (!_scEditingId) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') { _scEditingId = null; _showShortcuts(); return; }
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return; // wait for actual key
  const keyStr = ShortcutManager.eventToKeyStr(e);
  shortcuts.setKey(_scEditingId, keyStr);
  _scEditingId = null;
  _showShortcuts();
}, true);

document.getElementById('btn-shortcuts')?.addEventListener('click', _showShortcuts);
document.getElementById('btn-shortcuts-close')?.addEventListener('click', () => shortcutsOverlay?.classList.add('hidden'));
shortcutsOverlay?.addEventListener('click', (e) => { if (e.target === shortcutsOverlay) shortcutsOverlay.classList.add('hidden'); });

// Also open with ? key
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
    e.preventDefault();
    if (shortcutsOverlay?.classList.contains('hidden')) _showShortcuts();
    else shortcutsOverlay?.classList.add('hidden');
  }
});

// ── ROM Notification ────────────────────────────────────────
function _showRomNotification(msg) {
  let el = document.getElementById('rom-notification');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rom-notification';
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:600;background:#0d1320;border:1px solid #39ff14;border-radius:6px;padding:8px 16px;font:12px "JetBrains Mono",monospace;color:#39ff14;pointer-events:none;opacity:0;transition:opacity 0.3s';
    document.body.appendChild(el);
  }
  el.textContent = '✓ ' + msg;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 3000);
}

// ── Wire Tooltip ────────────────────────────────────────────
const wireTooltipEl = document.getElementById('wire-tooltip');
function _updateWireTooltip() {
  if (!wireTooltipEl) return;
  const wid = state.hoveredWireId;
  if (!wid) { wireTooltipEl.classList.add('hidden'); return; }

  // Check for CU pin warning
  const wire = scene.getWire(wid);
  if (wire?._warningMsg) {
    wireTooltipEl.textContent = '\u26A0 ' + wire._warningMsg;
    wireTooltipEl.style.borderColor = '#ffa028';
    wireTooltipEl.style.color = '#ffa028';
    wireTooltipEl.style.left = (state._mouseScreenX + 14) + 'px';
    wireTooltipEl.style.top = (state._mouseScreenY - 20) + 'px';
    wireTooltipEl.classList.remove('hidden');
    return;
  }

  const val = _lastWireValues.get(wid);
  if (val === null || val === undefined) { wireTooltipEl.classList.add('hidden'); return; }

  let text;
  if (val === 0) text = '0';
  else if (val === 1) text = '1';
  else text = val + ' (0x' + (val >>> 0).toString(16).toUpperCase() + ')';

  wireTooltipEl.textContent = text;
  wireTooltipEl.style.borderColor = '#e0a030';
  wireTooltipEl.style.color = '#e0a030';
  wireTooltipEl.style.left = (state._mouseScreenX + 14) + 'px';
  wireTooltipEl.style.top = (state._mouseScreenY - 20) + 'px';
  wireTooltipEl.classList.remove('hidden');
}

// ── Core: Evaluate + Render Loop ────────────────────────────
let _rafId = null;
let _lastNodeValues = new Map();
let _lastWireValues = new Map();
let _frameCount = 0;

function tick() {
  try {
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
    state.stepCount, wirePreview, state.tool,
    selection.rubberBandRect, selection.selected
  );

  // Wire tooltip
  _updateWireTooltip();

  // Record waveform data
  if (result.nodeValues) {
    Waveform.record(state.stepCount, result.nodeValues, scene.wires);
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

  } catch (err) { console.error('tick error:', err); }
  _rafId = requestAnimationFrame(tick);
}

// ── Auto-save ───────────────────────────────────────────────
let _designSaveTimer = null;
function _saveDesignNow() {
  localStorage.setItem('circuit_designer_pro', JSON.stringify(scene.serialize()));
  try { localStorage.setItem('circuit_designer_waveform_view', JSON.stringify(Waveform.saveViewState())); } catch (_) {}
}
function _scheduleDesignSave() {
  if (_designSaveTimer) return;
  _designSaveTimer = setTimeout(() => {
    _designSaveTimer = null;
    if (scene.nodeCount > 0) _saveDesignNow();
  }, 2000);
}
bus.on('action:save', () => {
  if (_designSaveTimer) { clearTimeout(_designSaveTimer); _designSaveTimer = null; }
  _saveDesignNow();
  _showRomNotification('Project saved');
});

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

  // PIPE control buttons — only shown when a PIPE_REG is selected.
  const propPipeCtrlRow = document.getElementById('prop-pipe-ctrl-row');
  if (node.type === 'PIPE_REG' && propPipeCtrlRow) {
    propPipeCtrlRow.style.display = '';
    const ch = node.channels || 4;
    const stallWired = scene.wires.some(w => w.targetId === node.id && w.targetInputIndex === ch);
    const flushWired = scene.wires.some(w => w.targetId === node.id && w.targetInputIndex === ch + 1);
    const stallBtn = document.getElementById('btn-prop-add-stall');
    const flushBtn = document.getElementById('btn-prop-add-flush');
    if (stallBtn) { stallBtn.disabled = stallWired; stallBtn.textContent = stallWired ? 'STALL ✓' : '+ STALL'; }
    if (flushBtn) { flushBtn.disabled = flushWired; flushBtn.textContent = flushWired ? 'FLUSH ✓' : '+ FLUSH'; }
  } else if (propPipeCtrlRow) {
    propPipeCtrlRow.style.display = 'none';
  }

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
  } else if (node.type === 'REG_FILE' || node.type === 'REG_FILE_DP' || node.type === 'FIFO' || node.type === 'STACK') {
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
  if (node.type === 'RAM' || node.type === 'ROM' || node.type === 'REG_FILE' || node.type === 'REG_FILE_DP' || node.type === 'FIFO' || node.type === 'STACK') {
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

// RESET — return the simulation to step 0 without touching the design.
// Clears all sequential state (FFs, RAM/ROM working copies, RF contents,
// PC, counters) and resets the step counter, waveform, and sim controller.
document.getElementById('btn-reset')?.addEventListener('click', () => {
  state.ffStates.clear();
  state.resetSequentialState(scene.nodes);
  simCtrl.reset();
  // Clear recorded history but keep the user's tracked signals — RESET is a
  // simulation reset, not a waveform re-setup, so the signals the user added
  // to the wave view should stay there, ready for the next run.
  Waveform.clearHistory();
  _updateStepCount();
});

// ── Toolbar Actions ─────────────────────────────────────────
document.getElementById('btn-design-clear')?.addEventListener('click', () => {
  if (scene.nodeCount === 0) return;
  if (!confirm('Clear the entire canvas? This will reset everything.')) return;
  scene.clear();
  state.selectedNodeId = null;
  state.ffStates.clear();
  selection.clearSelection();
  commands.clear();
  simCtrl.reset();
  localStorage.removeItem('circuit_designer_pro');
  Renderer.zoomToFit([]);
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
    // Refresh the Signal Picker so its list reflects the current scene —
    // without this, the first time the panel opens the picker would show
    // whatever state it captured at module-load time (usually empty).
    if (typeof _renderPicker === 'function') _renderPicker();
  }
}

btnWaveform?.addEventListener('click', toggleWaveform);
document.getElementById('btn-waveform-close')?.addEventListener('click', toggleWaveform);
document.getElementById('btn-waveform-fit')?.addEventListener('click', () => Waveform.fitToWindow());
document.getElementById('btn-waveform-radix')?.addEventListener('click', (e) => {
  const next = Waveform.cycleRadix();
  e.target.textContent = next.toUpperCase();
});
document.getElementById('btn-waveform-bmk') ?.addEventListener('click', () => Waveform.addBookmarkAtCursor());
document.getElementById('btn-waveform-fullscreen')?.addEventListener('click', (e) => {
  const on = Waveform.toggleFullscreen();
  e.currentTarget.classList.toggle('active', on);
  e.currentTarget.textContent = on ? '⛶ EXIT' : '⛶ FULL';
});

// ── Signal Picker ─────────────────────────────────────────────────
const pickerBtn    = document.getElementById('btn-waveform-picker');
const pickerPanel  = document.getElementById('waveform-panel');
const pickerList   = document.getElementById('waveform-picker-list');
const pickerSearch = document.getElementById('waveform-picker-search');
let _pickerFilter = '';

// Components start collapsed by default. The set tracks which ones the user
// has *explicitly expanded* — anything not in here is closed.
const _pickerExpanded = new Set();

function _renderPicker() {
  if (!pickerList) return;
  const sigs = Waveform.allSignals();
  const q = _pickerFilter.trim().toLowerCase();

  const matchesQuery = (s) => {
    if (!q) return true;
    return (s.label || '').toLowerCase().includes(q) ||
           (s.parentLabel || '').toLowerCase().includes(q) ||
           (s.pin || '').toLowerCase().includes(q);
  };

  // Group signals by their parent component. Preserve the order in which each
  // parent first appears in state.signals (no category-based re-sorting).
  const groups = new Map(); // parentId -> { label, type, signals: [] }
  for (const s of sigs) {
    if (!matchesQuery(s)) continue;
    if (!groups.has(s.parentId)) {
      groups.set(s.parentId, { label: s.parentLabel, type: s.type, signals: [] });
    }
    groups.get(s.parentId).signals.push(s);
  }

  // Separate top-level IO (rendered under a collapsible "RECOMMENDED"
   // banner) from internal components (rendered as their own collapsibles).
  const recommendedSignals = [];
  const componentEntries = [];
  for (const [pid, comp] of groups) {
    const isClock = comp.type === 'clock';
    const isLeafOnly = isClock || (comp.signals.length === 1 && comp.signals[0].label === comp.label);
    if (isLeafOnly) recommendedSignals.push(comp.signals[0]);
    else            componentEntries.push([pid, comp]);
  }

  let html = '';
  if (recommendedSignals.length > 0) {
    const recPid = '__recommended__';
    const collapsed = !_pickerExpanded.has(recPid);
    const shownCount = recommendedSignals.filter(s => Waveform.isSignalShown(s.id)).length;
    const tri = collapsed ? '▶' : '▼';
    html += `<div class="wf-pick-comp wf-pick-comp-recommended" data-comp="${recPid}">
      <span class="wf-pick-tri">${tri}</span>
      <span class="wf-pick-comp-label">RECOMMENDED</span>
      <span class="wf-pick-comp-count">${shownCount}/${recommendedSignals.length}</span>
    </div>`;
    if (!collapsed) {
      for (const s of recommendedSignals) {
        const checked = Waveform.isSignalShown(s.id) ? 'checked' : '';
        html += `<label class="wf-pick-row wf-pick-child" data-sigid="${s.id}">
          <input type="checkbox" ${checked} />
          <span class="wf-pick-label" style="color:${s.color}">${s.label}</span>
        </label>`;
      }
    }
  }

  for (const [pid, comp] of componentEntries) {

    // Hierarchical component — collapsible header + inputs / outputs sub-groups.
    const collapsed = !_pickerExpanded.has(pid);
    const shown = comp.signals.filter(s => Waveform.isSignalShown(s.id)).length;
    const total = comp.signals.length;
    const tri = collapsed ? '▶' : '▼';
    html += `<div class="wf-pick-comp" data-comp="${pid}">
      <span class="wf-pick-tri">${tri}</span>
      <span class="wf-pick-comp-label">${comp.label}</span>
      <span class="wf-pick-comp-count">${shown}/${total}</span>
    </div>`;
    if (!collapsed) {
      const outputs = comp.signals.filter(s => s.direction !== 'in');
      const inputs  = comp.signals.filter(s => s.direction === 'in');
      const renderGroup = (title, rows) => {
        if (rows.length === 0) return '';
        let out = `<div class="wf-pick-subhead">${title}</div>`;
        for (const s of rows) {
          const checked = Waveform.isSignalShown(s.id) ? 'checked' : '';
          out += `<label class="wf-pick-row wf-pick-child" data-sigid="${s.id}">
            <input type="checkbox" ${checked} />
            <span class="wf-pick-label" style="color:${s.color}">${s.pin}</span>
          </label>`;
        }
        return out;
      };
      html += renderGroup('inputs',  inputs);
      html += renderGroup('outputs', outputs);
    }
  }
  if (!html) html = '<div style="padding:16px;color:#4a6080;font:10px JetBrains Mono,monospace">No signals match.</div>';
  pickerList.innerHTML = html;

  // Wire component header clicks → collapse/expand.
  pickerList.querySelectorAll('.wf-pick-comp').forEach(el => {
    el.addEventListener('click', () => {
      const pid = el.dataset.comp;
      if (_pickerExpanded.has(pid)) _pickerExpanded.delete(pid);
      else _pickerExpanded.add(pid);
      _renderPicker();
    });
  });

  // Wire signal row clicks → toggle visibility.
  pickerList.querySelectorAll('.wf-pick-row').forEach(row => {
    const sigId = row.dataset.sigid;
    const cb = row.querySelector('input[type="checkbox"]');
    row.addEventListener('click', (ev) => {
      if (ev.target !== cb) cb.checked = !cb.checked;
      Waveform.setSignalVisible(sigId, cb.checked);
    });
  });
}

pickerBtn?.addEventListener('click', () => {
  const open = !pickerPanel.classList.contains('picker-open');
  pickerPanel.classList.toggle('picker-open', open);
  pickerBtn.classList.toggle('picker-on', open);
  if (open) _renderPicker();
});

pickerSearch?.addEventListener('input', () => {
  _pickerFilter = pickerSearch.value;
  _renderPicker();
});

document.getElementById('btn-picker-recommended')?.addEventListener('click', () => {
  Waveform.restoreRecommended();
  _renderPicker();
});
document.getElementById('btn-picker-clear')?.addEventListener('click', () => {
  if (!window.confirm('Clear every signal from the waveform except the clock?\n\nThis only hides them from the view — you can re-enable any signal from the picker.')) return;
  Waveform.clearAllButClock();
  _renderPicker();
});
// Signal Picker is open by default when the Waveform panel is first shown.
(function _pickerOpenByDefault() {
  if (!pickerPanel || !pickerBtn) return;
  pickerPanel.classList.add('picker-open');
  pickerBtn.classList.add('picker-on');
  _renderPicker();
})();

// Refresh picker rows whenever the scene / sim changes in a way that could
// affect the signal list.
bus.on('scene:loaded', () => _renderPicker());
bus.on('node:added',   () => _renderPicker());
bus.on('node:removed', () => _renderPicker());

// Pattern search: Enter to run, N/P inside the input navigates matches.
const wfSearchInp = document.getElementById('waveform-search');
wfSearchInp?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const count = Waveform.search(wfSearchInp.value);
    wfSearchInp.title = count + ' match' + (count === 1 ? '' : 'es');
  } else if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
    // N / Shift+N (inside search box) cycles matches
    if (e.shiftKey) { e.preventDefault(); Waveform.searchPrevMatch(); }
    // Otherwise allow typing 'n' as part of the expression
  }
});
wfSearchInp?.addEventListener('blur', () => {
  // Clear search highlight when user leaves the box if query went empty.
  if (!wfSearchInp.value.trim()) Waveform.search('');
});

// Trigger mode toggle — prompts for a condition on arm.
// The button also polls state to flip to "FIRED" once the condition matches
// (so the user knows their trigger actually caught something).
const trigBtn = document.getElementById('btn-waveform-trigger');
trigBtn?.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  if (btn.classList.contains('active')) {
    Waveform.disarmTrigger();
    btn.classList.remove('active');
    btn.classList.remove('fired');
    btn.textContent = 'TRIG';
  } else {
    const expr = window.prompt(
      'Trigger: new incoming steps are SKIPPED until this condition becomes true.\n' +
      'Once it fires, a "TRIG" bookmark is dropped at that cycle and recording continues.\n\n' +
      'Examples:\n  CLK              (rising edge)\n  PC == 10\n  R1 > 0\n  RegWrite == 1',
      'CLK'
    );
    if (expr && expr.trim()) {
      Waveform.armTrigger(expr.trim());
      btn.classList.add('active');
      btn.textContent = 'TRIG ● ' + expr.trim();
    }
  }
});
// Poll trigger state once per second — flip the button to "FIRED" once it hits.
setInterval(() => {
  if (!trigBtn) return;
  const t = Waveform.getTriggerState?.();
  if (!t) return;
  if (t.armed && t.fired && !trigBtn.classList.contains('fired')) {
    trigBtn.classList.add('fired');
    trigBtn.classList.remove('active');
    trigBtn.textContent = 'TRIG ✓ FIRED';
  }
}, 500);

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

// ── Palette Search ──────────────────────────────────────────
const paletteSearch = document.getElementById('palette-search');
paletteSearch?.addEventListener('input', () => {
  const q = paletteSearch.value.trim().toLowerCase();
  if (!q) {
    // Show all, restore active tab
    document.querySelectorAll('.palette-chip').forEach(c => c.style.display = '');
    document.querySelectorAll('.palette-sep').forEach(s => s.style.display = '');
    document.querySelectorAll('.palette-panel').forEach(p => {
      p.classList.toggle('active', p.dataset.panel === document.querySelector('.palette-tab.active')?.dataset.tab);
    });
    return;
  }
  // Show all panels, filter chips
  document.querySelectorAll('.palette-panel').forEach(p => p.classList.add('active'));
  document.querySelectorAll('.palette-sep').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.palette-chip').forEach(chip => {
    const text = chip.textContent.toLowerCase();
    const tool = (chip.dataset.tool || '').toLowerCase();
    chip.style.display = (text.includes(q) || tool.includes(q)) ? '' : 'none';
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

// Waveform — import an external .vcd file (from any HDL simulator).
document.getElementById('btn-waveform-import')?.addEventListener('click', () => {
  document.getElementById('waveform-import-input')?.click();
});
document.getElementById('waveform-import-input')?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const { signalCount, cycleCount } = Waveform.importVCD(reader.result);
      alert('Imported ' + signalCount + ' signal' + (signalCount === 1 ? '' : 's') +
            ' over ' + cycleCount + ' cycle' + (cycleCount === 1 ? '' : 's') + '.');
    } catch (err) {
      alert('Failed to parse VCD: ' + err.message);
    }
  };
  reader.onerror = () => alert('Could not read the file.');
  reader.readAsText(file);
  e.target.value = ''; // allow re-importing the same file
});

// Waveform — export recorded history as a VCD file (industry standard).
document.getElementById('btn-waveform-vcd')?.addEventListener('click', () => {
  const vcd = Waveform.exportVCD();
  if (!vcd) { alert('Nothing to export — run some STEP cycles first.'); return; }
  const blob = new Blob([vcd], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'circuit-designer-' + Date.now() + '.vcd';
  a.click();
  URL.revokeObjectURL(url);
});

// Waveform export — PNG
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
  if (shortcuts.matches(e, 'sys-debug')) {
    e.preventDefault();
    _toggleDebugPanel();
  }
});

// ── Memory Inspector Panel ──────────────────────────────────
const memInspector = document.getElementById('mem-inspector');
const memBody = document.getElementById('mem-inspector-body');
let _memInspectorVisible = false;
let _memFormat = 'dec'; // 'hex', 'bin', 'dec'
Renderer.setValueFormat(_memFormat); // sync canvas value format with inspector

function _toggleMemInspector() {
  _memInspectorVisible = !_memInspectorVisible;
  memInspector?.classList.toggle('hidden', !_memInspectorVisible);
  if (_memInspectorVisible) _refreshMemInspector();
}

document.getElementById('btn-mem-toggle')?.addEventListener('click', _toggleMemInspector);
document.getElementById('btn-mem-close')?.addEventListener('click', _toggleMemInspector);

// Custom resize grip (top-right corner of Memory Inspector).
// The grip lives in the upper-right of the panel, so:
//   drag right → widen (left stays pinned)
//   drag up    → panel grows upward (top moves up, bottom stays)
//   drag down  → panel shrinks from the top
(function initMemResize() {
  const grip  = document.getElementById('mem-resize-grip');
  const panel = document.getElementById('mem-inspector');
  if (!grip || !panel) return;

  // Tiered font-size: child elements use em units, so changing the panel's
  // base font-size scales the whole readout. Three breakpoints with
  // noticeable jumps between them:
  //   compact   (< 300px):  10px base
  //   normal    (300–550):  12px base
  //   spacious  (> 550px):  14px base
  function _applyFontTier(height) {
    let base;
    if (height < 300)       base = 10;
    else if (height < 550)  base = 12;
    else                    base = 14;
    panel.style.fontSize = base + 'px';
  }
  _applyFontTier(panel.getBoundingClientRect().height);

  let dragging = false, startX = 0, startY = 0, startW = 0, startH = 0, startTop = 0;
  grip.addEventListener('mousedown', (e) => {
    dragging = true;
    const r = panel.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startW = r.width;   startH = r.height;
    startTop = r.top;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nesw-resize';
    e.preventDefault();
    e.stopPropagation();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;     // dragging up → dy negative → height grows
    const bottom = startTop + startH;  // pinned edge — stays constant
    const newW = Math.max(220, Math.min(window.innerWidth  * 0.95, startW + dx));
    let   newH = Math.max(150, Math.min(window.innerHeight * 0.95, startH - dy));
    let   newTop = bottom - newH;
    if (newTop < 0) { newTop = 0; newH = bottom; }
    panel.style.width  = newW + 'px';
    panel.style.height = newH + 'px';
    panel.style.top    = newTop + 'px';
    _applyFontTier(newH);
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
})();

// Pipeline panel resize grip (top-left corner, bottom-right panel).
//   drag left  → widen (right pinned)
//   drag up    → grow up (bottom pinned)
//   drag right → narrower
//   drag down  → shrink from the top
(function initPipelineResize() {
  const grip  = document.getElementById('pipeline-resize-grip');
  const panel = document.getElementById('pipeline-panel');
  if (!grip || !panel) return;

  function _applyPipelineFontTier(height) {
    let base;
    if (height < 300)       base = 12;
    else if (height < 550)  base = 14;
    else                    base = 16;
    panel.style.fontSize = base + 'px';
  }
  // Clear any stale inline `top` from older sessions — it would fight the
  // CSS `bottom: 0` and leave a gap at the viewport's bottom.
  panel.style.top = '';
  _applyPipelineFontTier(panel.getBoundingClientRect().height);

  let dragging = false, startX = 0, startY = 0, startW = 0, startH = 0;
  grip.addEventListener('mousedown', (e) => {
    dragging = true;
    const r = panel.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startW = r.width;   startH = r.height;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
    e.preventDefault();
    e.stopPropagation();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;      // drag left → dx negative → widen
    const dy = e.clientY - startY;      // drag up   → dy negative → grow
    const newW = Math.max(220, Math.min(window.innerWidth  * 0.95, startW - dx));
    const newH = Math.max(150, Math.min(window.innerHeight * 0.95, startH - dy));
    panel.style.width  = newW + 'px';
    panel.style.height = newH + 'px';
    // Do NOT set `top` — the CSS `bottom: 0` anchors the panel to the
    // viewport's bottom. The browser computes top from (innerHeight - height),
    // which auto-tracks the viewport on window resize.
    _applyPipelineFontTier(newH);
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
})();

document.getElementById('btn-mem-format')?.addEventListener('click', () => {
  const btn = document.getElementById('btn-mem-format');
  if (_memFormat === 'hex') { _memFormat = 'bin'; btn.textContent = 'BIN'; }
  else if (_memFormat === 'bin') { _memFormat = 'dec'; btn.textContent = 'DEC'; }
  else { _memFormat = 'hex'; btn.textContent = 'HEX'; }
  Renderer.setValueFormat(_memFormat);
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
    n.type === 'RAM' || n.type === 'ROM' || n.type === 'REG_FILE' || n.type === 'REG_FILE_DP' ||
    n.type === 'FIFO' || n.type === 'STACK' || n.type === 'PC' || n.type === 'PIPE_REG'
  );

  if (memNodes.length === 0) {
    memBody.innerHTML = '<div class="mem-empty">No memory components in circuit</div>';
    return;
  }

  const typeLabels = { REGISTER: 'REG', SHIFT_REG: 'SHREG', COUNTER: 'CNT', RAM: 'RAM', ROM: 'ROM', REG_FILE: 'RF', REG_FILE_DP: 'RF-DP', FIFO: 'FIFO', STACK: 'STACK', PC: 'PC', PIPE_REG: 'PIPE' };
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
    if ((node.type === 'REG_FILE' || node.type === 'REG_FILE_DP') && ms?.regs) {
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
    case 'toggle-stageview': _toggleStageView(); break;
    case 'analyze-pipeline': {
      const r = pipelineAnalyzer.analyze({ force: true });
      console.group('[Pipeline] analyze');
      console.log(`cycles (latency) = ${r.cycles}`);
      console.log(`bottleneck stage = ${r.bottleneck} (depth ${r.stages[r.bottleneck]?.depth ?? 0})`);
      if (r.hasCycle) console.warn('feedback loop detected — stages may be incomplete');
      console.table(r.stages.map(s => ({ stage: s.idx, depth: s.depth, nodes: s.nodes.length, ids: s.nodes.join(',') })));
      console.groupEnd();
      pipelinePanel.show();
      break;
    }
    case 'toggle-pipeline-panel': pipelinePanel.toggle(); break;
    case 'insert-stall': _insertPipeControl('stall'); break;
    case 'insert-flush': _insertPipeControl('flush'); break;
    case 'suggest-retime': _showRetimeSuggestion(); break;
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

  const match = shortcuts.findMatch(e);

  if (match === 'sys-reset') {
    e.preventDefault();
    if (confirm('Reset everything? This will clear the canvas and saved state.')) {
      scene.clear(); state.selectedNodeId = null; state.ffStates.clear();
      selection.clearSelection(); localStorage.removeItem('circuit_designer_pro');
      commands.clear(); Renderer.zoomToFit([]);
    }
    return;
  }
  if (match === 'action-copy') {
    e.preventDefault();
    if (selection.count === 0 && state.selectedNodeId) selection.select(state.selectedNodeId);
    selection.copy();
  }
  if (match === 'action-paste') { e.preventDefault(); selection.paste(); }
  if (match === 'action-selectall') { e.preventDefault(); selection.selectAll(); }
  if (match === 'nav-zoomsel') {
    e.preventDefault();
    const node = state.selectedNodeId ? scene.getNode(state.selectedNodeId) : null;
    if (node) Renderer.zoomToNode(node);
  }
  if (match === 'pipe-panel-toggle') {
    e.preventDefault();
    bus.emit('palette:action', 'toggle-pipeline-panel');
    return;
  }
  if (match === 'pipe-stageview-toggle') {
    e.preventDefault();
    bus.emit('palette:action', 'toggle-stageview');
    return;
  }
  if (match === 'pipe-retime-suggest') {
    e.preventDefault();
    bus.emit('palette:action', 'suggest-retime');
    return;
  }
  if (match === 'edit-delete' || match === 'edit-delete2') {
    // Multi-select delete
    if (selection.count > 0) {
      const before = scene.snapshot();
      for (const id of [...selection.selected]) scene.removeNode(id);
      const after = scene.snapshot();
      commands._undoStack.push({ description: 'Delete selected', execute() {}, undo: () => scene.restoreSnapshot(before) });
      commands._redoStack = [];
      selection.clearSelection();
      state.selectedNodeId = null;
    } else if (state.selectedNodeId) {
      const cmd = new RemoveNodeCommand(scene, state.selectedNodeId);
      commands.execute(cmd);
      state.selectedNodeId = null;
    }
  }
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
    waveformView: Waveform.saveViewState(),
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
    if (project.waveformView) Waveform.loadViewState(project.waveformView);
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
    waveformView: Waveform.saveViewState(),
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

document.getElementById('btn-export-verilog')?.addEventListener('click', () => {
  const verilog = exportVerilog(scene.serialize(), { topName: 'top' });
  const blob = new Blob([verilog], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'circuit.v';
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
bus.on('nav:zoomfit', () => Renderer.zoomToFit(scene.nodes));
bus.on('pipeline:jump-to-wire', ({ srcId, dstId }) => {
  const s = scene.getNode(srcId), d = scene.getNode(dstId);
  if (s && d) Renderer.zoomToFit([s, d]);
});
bus.on('pipeline:auto-wired-clk', ({ nodeId }) => {
  const n = scene.getNode(nodeId);
  const label = n ? (n.label || n.type) : 'component';
  _showRomNotification(`Auto-wired CLK → ${label}`);
});

// Phase 13: colorblind-palette toggle for the Stage Overlay. Persists
// across sessions via localStorage (handled inside CanvasRenderer).
bus.on('pipeline:toggle-palette', () => {
  const next = getStagePalette() === 'colorblind' ? 'default' : 'colorblind';
  setStagePalette(next);
  PipelineTelemetry.bump({ paletteToggles: 1 });
  _showRomNotification(`Stage palette: ${next === 'colorblind' ? 'colorblind-friendly' : 'default'}`);
});

// Insert an INPUT node wired to the STALL (kind='stall') or FLUSH (kind='flush')
// pin of the currently selected PIPE_REG. No-op with a toast if selection is
// missing or not a PIPE.
function _insertPipeControl(kind) {
  const pipe = scene.getNode(state.selectedNodeId);
  if (!pipe || pipe.type !== 'PIPE_REG') {
    _showRomNotification('Select a PIPE register first');
    return;
  }
  const ch = pipe.channels || 4;
  const pinIdx = kind === 'stall' ? ch : ch + 1;
  // Reject if already wired
  const already = scene.wires.some(w => w.targetId === pipe.id && w.targetInputIndex === pinIdx);
  if (already) { _showRomNotification(`${kind.toUpperCase()} already wired`); return; }
  // Place the new input to the left of the PIPE, vertically offset for visibility.
  const offsetY = kind === 'stall' ? -12 : 12;
  const inputNode = createComponent(COMPONENT_TYPES.INPUT, pipe.x - 140, pipe.y + offsetY);
  inputNode.label = kind === 'stall' ? 'STALL' : 'FLUSH';
  inputNode.fixedValue = 0;
  const addCmd = new AddNodeCommand(scene, inputNode);
  commands.execute(addCmd);
  const wire = createWire(addCmd.nodeId, pipe.id, pinIdx, 0);
  commands.execute(new AddWireCommand(scene, wire));
  _showRomNotification(`${kind.toUpperCase()} wired to ${pipe.label || pipe.id}`);
  _updatePropsPanel();
}
document.getElementById('btn-prop-add-stall')?.addEventListener('click', () => _insertPipeControl('stall'));
document.getElementById('btn-prop-add-flush')?.addEventListener('click', () => _insertPipeControl('flush'));
bus.on('nav:meminspector', _toggleMemInspector);

// ── Retime Suggestion (Phase 10b) ───────────────────────────
// The palette command fires this. We pull a single best move from the
// greedy retimer, render a preview on the canvas (red dashed = wires to
// remove, green dashed = wires to add), and show a banner with the
// metric delta + Accept / Reject. Accept applies a `RetimeCommand` so
// the change is one atomic undo step.
let _pendingRetime = null;
const _retimeBanner     = () => document.getElementById('retime-banner');
const _retimeBannerBody = () => document.getElementById('retime-banner-body');

function _showRetimeSuggestion() {
  _clearRetimePreview();
  const proposal = suggestRetime({ nodes: scene.nodes, wires: scene.wires });
  if (!proposal) {
    _showRomNotification('Pipeline already balanced — no retime suggestion.');
    return;
  }
  _pendingRetime = proposal;
  setRetimePreview({
    removeWireIds: new Set(proposal.wireEdits.remove),
    addWires:      proposal.wireEdits.add,
    nodeEdits:     proposal.nodeEdits || [],
  });
  const body = _retimeBannerBody();
  if (body) {
    body.innerHTML = `
      <div class="r-desc">${proposal.description}</div>
      <div>
        Max stage delay:
        <span class="r-before">${proposal.before.maxDelayPs} ps</span>
        <span class="r-arrow">\u2192</span>
        <span class="r-metric">${proposal.after.maxDelayPs} ps</span>
        &nbsp;(\u2212${proposal.improvementPs} ps)
      </div>`;
  }
  _retimeBanner()?.classList.remove('hidden');
}

function _clearRetimePreview() {
  _pendingRetime = null;
  setRetimePreview(null);
  _retimeBanner()?.classList.add('hidden');
}

document.getElementById('btn-retime-accept')?.addEventListener('click', () => {
  if (!_pendingRetime) return;
  const proposal = _pendingRetime;

  // Differential simulation: drive both (pre-move) and (post-move) scenes with
  // identical random inputs for a handful of vectors and confirm every OUTPUT
  // matches cycle-by-cycle. If the retime secretly broke semantics, we refuse
  // to commit and surface the divergence.
  const beforeSnap = {
    nodes: scene.nodes.map(n => ({ ...n })),
    wires: scene.wires.map(w => ({ ...w })),
  };
  const removed = new Set(proposal.wireEdits.remove);
  const posMap  = new Map((proposal.nodeEdits || []).map(e => [e.nodeId, e]));
  const afterSnap = {
    nodes: scene.nodes.map(n => {
      const e = posMap.get(n.id);
      return e ? { ...n, x: e.newX, y: e.newY } : { ...n };
    }),
    wires: scene.wires.filter(w => !removed.has(w.id))
      .map(w => ({ ...w }))
      .concat(proposal.wireEdits.add.map(w => ({ ...w }))),
  };

  const check = verifyRetiming(beforeSnap, afterSnap);
  if (!check.ok) {
    _clearRetimePreview();
    _showRetimeFailed(check.reason || 'simulation diff failed');
    return;
  }

  commands.execute(new RetimeCommand(scene, proposal));
  const imp   = proposal.improvementPs;
  const after = proposal.after.maxDelayPs;
  const b       = check.budget || {};
  const est     = b.estimate || null;
  const vMsg    = b.runCycles
    ? `${b.vectorCount}\u00A0vectors \u00D7 ${b.runCycles}\u00A0cycles`
    : '6 random vectors';
  const estMsg  = (est && est.confidence && est.confidence !== 'unknown')
    ? ` (${est.confidence}-confidence run-length estimate)`
    : '';
  _clearRetimePreview();
  _showRetimeApplied(`Pipeline balanced — every stage now ${after} ps (\u2212${imp} ps). Verified on ${vMsg}${estMsg}.`);
});

// Prominent success banner shown bottom-center after a retime is applied.
// Auto-fades after 4 seconds; click-through is disabled so it never blocks
// the canvas.
let _retimeAppliedTimer = null;
function _showRetimeApplied(msg) {
  const el  = document.getElementById('retime-applied-banner');
  const txt = document.getElementById('retime-applied-msg');
  if (!el || !txt) return;
  txt.classList.remove('failed');
  txt.textContent = msg;
  el.classList.remove('failed');
  el.classList.add('visible');
  if (_retimeAppliedTimer) clearTimeout(_retimeAppliedTimer);
  _retimeAppliedTimer = setTimeout(() => el.classList.remove('visible'), 4000);
}

/** Fail variant — reused DOM, red styling, no commit landed. */
function _showRetimeFailed(reason) {
  const el  = document.getElementById('retime-applied-banner');
  const txt = document.getElementById('retime-applied-msg');
  if (!el || !txt) return;
  txt.textContent = `Retime reverted \u2014 ${reason}`;
  el.classList.add('failed');
  el.classList.add('visible');
  if (_retimeAppliedTimer) clearTimeout(_retimeAppliedTimer);
  _retimeAppliedTimer = setTimeout(() => el.classList.remove('visible'), 6000);
}
document.getElementById('btn-retime-reject')?.addEventListener('click', _clearRetimePreview);
document.getElementById('btn-pipeline-retime')?.addEventListener('click', _showRetimeSuggestion);

// Bind shortcut from Command Palette (Ctrl+Enter)
bus.on('shortcut:bind', ({ actionId, keyStr, label }) => {
  // Create or update shortcut
  const allSc = shortcuts.getAll();
  if (allSc[actionId]) {
    // Update existing
    shortcuts.setKey(actionId, keyStr);
  } else {
    // Add new — register in ShortcutManager
    allSc[actionId] = { key: keyStr, label, group: 'Custom' };
    shortcuts.setKey(actionId, keyStr);
  }
  const display = ShortcutManager.formatKey(keyStr);
  alert(`Shortcut set: ${label} → ${display}`);
});

// ── ROM Editor ──────────────────────────────────────────────
const romOverlay = document.getElementById('rom-editor-overlay');
const romBody    = document.getElementById('rom-editor-body');
let _romEditorNode = null;
let _romEditorData = {}; // addr → value

let _romViewMode = 'c'; // 'c', 'asm', or 'table'
let _romCSource = '';   // stores C source separately
let _romAsmSource = ''; // stores the raw ASM text exactly as the user typed it
// Which view the user has actually edited since opening the ROM editor.
// null = no edits yet; otherwise 'c' | 'asm' | 'table'. Prevents stale views
// from overwriting memory on tab-switch / save.
let _romEditedMode = null;

function _openRomEditor(node) {
  _romEditorNode = node;
  _romEditorData = node.memory ? { ...node.memory } : {};
  _romCSource = node._cSource || '';
  _romAsmSource = node._asmSource || '';
  _initRomBuilderDropdowns();
  _romEditedMode = null;
  _romViewMode = node._sourceView
    || (_romAsmSource ? 'asm'
    : (Object.values(_romEditorData).some(v => v) && !_romCSource ? 'asm' : 'c'));
  _updateRomView();
  romOverlay?.classList.remove('hidden');
}

function _updateRomView() {
  const codeView = document.getElementById('rom-code-view');
  const tableWrap = document.getElementById('rom-editor-table-wrap');

  // Update tab active state
  document.querySelectorAll('.rom-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.romview === _romViewMode);
  });

  // Hide builder in C mode
  const builder = document.getElementById('rom-editor-builder');
  if (builder) builder.style.display = _romViewMode === 'c' ? 'none' : '';
  // Hide error bar when not in C mode
  const errorBar = document.getElementById('rom-error-bar');
  if (errorBar && _romViewMode !== 'c') errorBar.classList.add('hidden');

  if (_romViewMode === 'c') {
    codeView?.classList.remove('hidden');
    tableWrap?.classList.add('hidden');
    if (codeView) {
      if (!_romCSource) {
        _romCSource = 'R3 = R1 + R2;\nhalt;\n';
      }
      codeView.value = _romCSource;
      codeView.style.color = '#c8d8f0';
    }
  } else if (_romViewMode === 'asm') {
    codeView?.classList.remove('hidden');
    tableWrap?.classList.add('hidden');
    _renderAsmView();
    if (codeView) codeView.style.color = '#c8d8f0';
  } else {
    codeView?.classList.add('hidden');
    tableWrap?.classList.remove('hidden');
    _renderRomTable();
  }
}

function _renderAsmView() {
  const codeView = document.getElementById('rom-code-view');
  if (!codeView || !_romEditorNode) return;
  // If we have the verbatim ASM the user last saved, show it exactly —
  // don't round-trip through disassemble (which drops formatting and can
  // mask save/reload bugs). Fall back to disassembly for legacy ROMs.
  if (_romAsmSource) {
    codeView.value = _romAsmSource;
    return;
  }
  const addrCount = 1 << (_romEditorNode.addrBits || 3);
  const lines = [];
  for (let a = 0; a < addrCount; a++) {
    const val = _romEditorData[a] ?? 0;
    if (val === 0 && a > 0) {
      let hasMore = false;
      for (let b = a; b < addrCount; b++) {
        if (_romEditorData[b]) { hasMore = true; break; }
      }
      if (!hasMore) break;
    }
    lines.push(disassemble(val));
  }
  codeView.value = lines.join('\n');
}

function _syncCodeViewToData(force = false) {
  const codeView = document.getElementById('rom-code-view');
  if (!codeView || !_romEditorNode) return;
  // On tab-switch, only push this view's text into memory if the user
  // actually edited it — otherwise a fresh-opened view would clobber memory
  // with stale/derived text. On explicit SAVE (`force`), always sync.
  if (!force && _romEditedMode !== _romViewMode) return;
  const addrCount = 1 << (_romEditorNode.addrBits || 3);

  if (_romViewMode === 'c') {
    // Save C source
    _romCSource = codeView.value;
    // Only compile if C source is non-empty
    if (_romCSource.trim()) {
    // Compile C to ROM
    const { memory, errors, constants } = compileCToROM(codeView.value);
    for (let a = 0; a < addrCount; a++) _romEditorData[a] = 0;
    for (const [addr, val] of Object.entries(memory)) {
      _romEditorData[parseInt(addr)] = val;
    }
    if (_romEditorNode) _romEditorNode._lastConstants = constants;
    // Show errors inline
    const errorBar = document.getElementById('rom-error-bar');
    if (errorBar) {
      if (errors.length > 0) {
        errorBar.textContent = errors.map(e => '⚠ ' + e).join('\n');
        errorBar.classList.remove('hidden');
      } else {
        errorBar.classList.add('hidden');
      }
    }
    } // end if (_romCSource.trim())
  } else if (_romViewMode === 'asm') {
    // Remember the raw text so we can show it verbatim next time the editor opens.
    _romAsmSource = codeView.value;
    const lines = codeView.value.split('\n');
    console.log('[ASM SYNC] lines:', lines);
    for (let a = 0; a < addrCount; a++) _romEditorData[a] = 0;
    let addr = 0;
    for (let i = 0; i < lines.length && addr < addrCount; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith(';') || line.startsWith('//')) continue;
      const assembled = assemble(line);
      console.log(`[ASM] addr=${addr} "${line}" → 0x${assembled.toString(16)} (${assembled})`);
      _romEditorData[addr] = assembled;
      addr++;
    }
  }
  // table mode syncs via inline inputs
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
      _romEditedMode = 'table';
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
      _romEditedMode = 'table';
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
      _romEditedMode = 'table';
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
  _romEditedMode = 'table';
  _renderRomTable();
});

// SAVE button
// ROM file loading
document.getElementById('btn-rom-load')?.addEventListener('click', () => {
  document.getElementById('rom-file-input')?.click();
});

document.getElementById('rom-file-input')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file || !_romEditorNode) return;

  const reader = new FileReader();
  const isBin = file.name.endsWith('.bin');
  const isCFile = file.name.endsWith('.c');

  reader.onload = () => {
    const addrCount = 1 << (_romEditorNode.addrBits || 3);

    if (isBin) {
      // Binary: read as ArrayBuffer, 2 bytes per instruction (16-bit)
      const view = new DataView(reader.result);
      for (let i = 0; i < Math.min(view.byteLength / 2, addrCount); i++) {
        _romEditorData[i] = view.getUint16(i * 2, false); // big-endian
      }
    } else if (isCFile) {
      // C-like source: compile to ROM
      const text = reader.result.trim();
      const { memory, errors } = compileCToROM(text);
      for (let a = 0; a < addrCount; a++) _romEditorData[a] = 0;
      for (const [addr, val] of Object.entries(memory)) {
        _romEditorData[parseInt(addr)] = val;
      }
      if (errors.length > 0) alert('Compilation errors:\n' + errors.join('\n'));
      // Switch to C tab
      _romCSource = text;
      _romViewMode = 'c';
      _updateRomView();
    } else {
      // Text: asm, hex, or json
      const text = reader.result.trim();

      // Try JSON first
      if (text.startsWith('{')) {
        try {
          const obj = JSON.parse(text);
          for (const [addr, val] of Object.entries(obj)) {
            _romEditorData[parseInt(addr)] = typeof val === 'number' ? val : parseInt(val, 16);
          }
        } catch (_) {
          alert('Invalid JSON file.');
          return;
        }
      } else {
        // Line-by-line: detect asm vs hex
        const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//') && !l.startsWith(';'));
        // Check if first non-empty line looks like assembly (contains letters beyond hex digits)
        const isAsm = lines.length > 0 && /[g-zG-Z]/.test(lines[0]);

        for (let i = 0; i < Math.min(lines.length, addrCount); i++) {
          if (isAsm) {
            _romEditorData[i] = assemble(lines[i]);
          } else {
            // Hex: strip 0x prefix if present
            const hex = lines[i].replace(/^0x/i, '');
            _romEditorData[i] = parseInt(hex, 16) || 0;
          }
        }
      }
    }

    // Switch to ASM view for non-C files, and invalidate any cached C source
    // so the two views can't diverge after a binary/hex/asm import.
    if (!isCFile) {
      _romViewMode = 'asm';
      _romCSource = '';
      _romEditedMode = 'asm';
    } else {
      _romEditedMode = 'c';
    }
    _updateRomView();
  };

  if (isBin) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }

  // Reset file input so same file can be loaded again
  e.target.value = '';
});

// Mark the active view as "edited" whenever the user types in the code textarea.
document.getElementById('rom-code-view')?.addEventListener('input', () => {
  _romEditedMode = _romViewMode;
});

// ROM view tab switching
document.querySelectorAll('.rom-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // Sync current view before switching (only syncs if user actually edited it)
    _syncCodeViewToData();
    // Save C source if leaving C tab
    if (_romViewMode === 'c') {
      const codeView = document.getElementById('rom-code-view');
      if (codeView) _romCSource = codeView.value;
    }
    const newMode = tab.dataset.romview;
    // Entering C after edits in ASM/table: regenerate the C source from the
    // current memory so the C view mirrors the ASM the user just wrote.
    if (newMode === 'c' && _romEditedMode && _romEditedMode !== 'c' && _romEditorNode) {
      const addrCount = 1 << (_romEditorNode.addrBits || 3);
      _romCSource = decompileRomToC(_romEditorData, addrCount);
    }
    _romViewMode = newMode;
    _updateRomView();
  });
});

document.getElementById('btn-rom-save')?.addEventListener('click', () => {
  const codeView = document.getElementById('rom-code-view');
  console.log('[ROM SAVE] click — viewMode:', _romViewMode, 'editedMode:', _romEditedMode, 'text:', JSON.stringify(codeView?.value));
  // Force-sync: user clicked SAVE, they want whatever is in the view persisted,
  // even if the input event never fired (paste, programmatic fill, etc).
  if (_romEditedMode === null) _romEditedMode = _romViewMode;
  _syncCodeViewToData(true);
  if (!_romEditorNode) return;
  // DEBUG: verify ROM save
  console.log('[ROM SAVE] viewMode:', _romViewMode, 'data:', JSON.stringify(_romEditorData));
  const foundNode = scene.getNode(_romEditorNode.id);
  console.log('[ROM SAVE] node found:', !!foundNode, 'nodeId:', _romEditorNode.id);
  console.log('[ROM SAVE] node.memory BEFORE:', JSON.stringify(foundNode?.memory));
  // Whichever view was last edited becomes the authoritative source.
  // If the user ended in ASM/table, regenerate the C view from memory so
  // both tabs always show the same program (no divergence between C and ASM).
  const authView = _romEditedMode || _romViewMode;
  _romEditorNode._sourceView = authView;
  if (authView !== 'c') {
    const addrCount = 1 << (_romEditorNode.addrBits || 3);
    _romCSource = decompileRomToC(_romEditorData, addrCount);
  } else {
    // C is authoritative — invalidate any cached ASM text so next open in ASM
    // derives fresh from the compiled memory.
    _romAsmSource = '';
  }
  _romEditorNode._cSource = _romCSource;
  _romEditorNode._asmSource = _romAsmSource;
  commands.execute(new SetNodePropsCommand(scene, _romEditorNode.id, { memory: { ..._romEditorData } }));
  console.log('[ROM SAVE] node.memory AFTER:', JSON.stringify(foundNode?.memory));
  state.ffStates.delete(_romEditorNode.id);

  // Auto-load constants into connected Register Files
  if (_romViewMode === 'c' && _romEditorNode._lastConstants) {
    const constants = _romEditorNode._lastConstants;
    if (Object.keys(constants).length > 0) {
      // Find all RF/RF-DP nodes in the scene
      const rfNodes = scene.nodes.filter(n => n.type === 'REG_FILE' || n.type === 'REG_FILE_DP');
      for (const rf of rfNodes) {
        const regCount = rf.regCount || 8;
        if (!rf.initialRegs) rf.initialRegs = new Array(regCount).fill(0);
        for (const [regStr, val] of Object.entries(constants)) {
          const reg = parseInt(regStr);
          if (reg < regCount) rf.initialRegs[reg] = val;
        }
        state.ffStates.delete(rf.id); // Reset RF to pick up new values
      }
      // Show info about pre-loaded constants
      const constList = Object.entries(constants).map(([r, v]) => `R${r} = ${v}`).join(',  ');
      _showRomNotification('Registers pre-loaded: ' + constList);
    }
  }

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

// ── CU Editor ───────────────────────────────────────────────
const DEFAULT_CONTROL_TABLE = [
  { name: 'ADD',   aluOp: 0, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0 },
  { name: 'SUB',   aluOp: 1, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0 },
  { name: 'AND',   aluOp: 2, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0 },
  { name: 'OR',    aluOp: 3, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0 },
  { name: 'XOR',   aluOp: 4, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0 },
  { name: 'SHL',   aluOp: 5, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0 },
  { name: 'SHR',   aluOp: 6, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0 },
  { name: 'CMP',   aluOp: 7, regWe: 0, memWe: 0, memRe: 0, jmp: 0, halt: 0 },
  { name: 'LOAD',  aluOp: 0, regWe: 1, memWe: 0, memRe: 1, jmp: 0, halt: 0 },
  { name: 'STORE', aluOp: 0, regWe: 0, memWe: 1, memRe: 0, jmp: 0, halt: 0 },
  { name: 'JMP',   aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: 1, halt: 0 },
  { name: 'JZ',    aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: -1, halt: 0 }, // -1 = conditional Z
  { name: 'JC',    aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: -2, halt: 0 }, // -2 = conditional C
  { name: 'LI',    aluOp: 0, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0, immSel: 1 },
  { name: 'NOP',   aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: 0, halt: 0 },
  { name: 'HALT',  aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: 0, halt: 1 },
  // Extended opcodes (16-31) — immediate versions + extras
  { name: 'ADDI',  aluOp: 0, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0, immSel: 1 },
  { name: 'SUBI',  aluOp: 1, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0, immSel: 1 },
  { name: 'ANDI',  aluOp: 2, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0, immSel: 1 },
  { name: 'ORI',   aluOp: 3, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0, immSel: 1 },
  { name: 'XORI',  aluOp: 4, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0, immSel: 1 },
  { name: 'SHLI',  aluOp: 5, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0, immSel: 1 },
  { name: 'SHRI',  aluOp: 6, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0, immSel: 1 },
  { name: 'CMPI',  aluOp: 7, regWe: 0, memWe: 0, memRe: 0, jmp: 0, halt: 0, immSel: 1 },
  { name: 'LI',    aluOp: 0, regWe: 1, memWe: 0, memRe: 0, jmp: 0, halt: 0, immSel: 1 },
  { name: 'JNZ',   aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: -3, halt: 0 },
  { name: 'JNC',   aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: -4, halt: 0 },
  { name: '',      aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: 0, halt: 0 },
  { name: '',      aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: 0, halt: 0 },
  { name: '',      aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: 0, halt: 0 },
  { name: '',      aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: 0, halt: 0 },
  { name: '',      aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: 0, halt: 0 },
];

const cuOverlay = document.getElementById('cu-editor-overlay');
const cuBody    = document.getElementById('cu-editor-body');
let _cuEditorNode = null;
let _cuEditorTable = [];

function _getCuTable(node) {
  if (node.controlTable) return JSON.parse(JSON.stringify(node.controlTable));
  // Start with default 16, extend if needed
  const table = JSON.parse(JSON.stringify(DEFAULT_CONTROL_TABLE));
  // If node has more opcode capacity, pad with empty rows
  const opCount = node._opCount || 16;
  while (table.length < opCount) {
    table.push({ name: '', aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: 0, halt: 0 });
  }
  return table;
}

function _openCuEditor(node) {
  _cuEditorNode = node;
  if (!node._opCount) node._opCount = 16;
  const fullTable = _getCuTable(node);
  _cuFullTable = JSON.parse(JSON.stringify(fullTable));
  // Trim to current opCount for display
  _cuEditorTable = fullTable.slice(0, node._opCount);
  // Set dropdown
  const opSel = document.getElementById('cu-opcount-select');
  if (opSel) opSel.value = node._opCount;
  _renderCuTable();
  cuOverlay?.classList.remove('hidden');
}

let _cuFullTable = []; // stores all rows even when view is trimmed

document.getElementById('cu-opcount-select')?.addEventListener('change', () => {
  const newCount = parseInt(document.getElementById('cu-opcount-select').value);
  if (!_cuEditorNode || !newCount) return;
  _cuEditorNode._opCount = newCount;
  // Save current edits back to full table
  for (let i = 0; i < _cuEditorTable.length; i++) {
    _cuFullTable[i] = _cuEditorTable[i];
  }
  // Build new table from full table, filling defaults for missing rows
  _cuEditorTable = [];
  for (let i = 0; i < newCount; i++) {
    if (_cuFullTable[i]) {
      _cuEditorTable.push(_cuFullTable[i]);
    } else if (DEFAULT_CONTROL_TABLE[i]) {
      _cuEditorTable.push(JSON.parse(JSON.stringify(DEFAULT_CONTROL_TABLE[i])));
    } else {
      _cuEditorTable.push({ name: '', aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: 0, halt: 0 });
    }
  }
  _renderCuTable();
});

function _cuRowHex(row) {
  // Pack: aluOp(3bit) | regWe | memWe | memRe | jmp(2bit) | halt
  const j = row.jmp < 0 ? (row.jmp === -1 ? 2 : 3) : (row.jmp ? 1 : 0);
  const v = ((row.aluOp & 7) << 5) | ((row.regWe ? 1 : 0) << 4) | ((row.memWe ? 1 : 0) << 3) |
            ((row.memRe ? 1 : 0) << 2) | ((j & 3) << 1) | (row.halt ? 1 : 0);
  return '0x' + v.toString(16).toUpperCase().padStart(2, '0');
}

function _renderCuTable() {
  if (!cuBody) return;
  const rowCount = _cuEditorTable.length || 16;
  let html = '';
  for (let i = 0; i < rowCount; i++) {
    const row = _cuEditorTable[i] || { name: '', aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: 0, halt: 0 };
    const jmpChecked = row.jmp !== 0;
    const jmpLabel = row.jmp === -1 ? 'Z' : row.jmp === -2 ? 'C' : row.jmp ? '1' : '';
    html += `<tr draggable="true" data-row="${i}">
      <td class="cu-op"><span class="cu-drag-handle" title="Drag to reorder">&#9776;</span> ${i}</td>
      <td><input class="cu-name-input" data-row="${i}" data-field="name" value="${row.name}" /></td>
      <td><input class="cu-aluop-input" type="number" min="0" max="7" data-row="${i}" data-field="aluOp" value="${row.aluOp}" /></td>
      <td><input class="cu-check" type="checkbox" data-row="${i}" data-field="regWe" ${row.regWe ? 'checked' : ''} /></td>
      <td><input class="cu-check" type="checkbox" data-row="${i}" data-field="memWe" ${row.memWe ? 'checked' : ''} /></td>
      <td><input class="cu-check" type="checkbox" data-row="${i}" data-field="memRe" ${row.memRe ? 'checked' : ''} /></td>
      <td><select class="cu-aluop-input" data-row="${i}" data-field="jmp" style="width:42px">
        <option value="0" ${row.jmp === 0 ? 'selected' : ''}>—</option>
        <option value="1" ${row.jmp === 1 ? 'selected' : ''}>1</option>
        <option value="-1" ${row.jmp === -1 ? 'selected' : ''}>Z</option>
        <option value="-2" ${row.jmp === -2 ? 'selected' : ''}>C</option>
        <option value="-3" ${row.jmp === -3 ? 'selected' : ''}>!Z</option>
        <option value="-4" ${row.jmp === -4 ? 'selected' : ''}>!C</option>
      </select></td>
      <td><input class="cu-check" type="checkbox" data-row="${i}" data-field="halt" ${row.halt ? 'checked' : ''} /></td>
      <td><input class="cu-check" type="checkbox" data-row="${i}" data-field="immSel" ${row.immSel ? 'checked' : ''} /></td>
      <td class="cu-hex">${_cuRowHex(row)}</td>
    </tr>`;
  }
  cuBody.innerHTML = html;

  // Bind change handlers
  cuBody.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('change', () => {
      const r = parseInt(el.dataset.row);
      const f = el.dataset.field;
      const row = _cuEditorTable[r];
      if (!row) return;
      if (el.type === 'checkbox') row[f] = el.checked ? 1 : 0;
      else if (f === 'aluOp') row[f] = parseInt(el.value) || 0;
      else if (f === 'jmp') row[f] = parseInt(el.value);
      else if (f === 'name') { row[f] = el.value.toUpperCase(); el.value = row[f]; }
      // Update hex
      const hexCell = el.closest('tr').querySelector('.cu-hex');
      if (hexCell) hexCell.textContent = _cuRowHex(row);
    });
  });

  // Drag & drop row reorder
  let _cuDragRow = null;
  cuBody.querySelectorAll('tr[draggable]').forEach(tr => {
    tr.addEventListener('dragstart', (e) => {
      _cuDragRow = parseInt(tr.dataset.row);
      tr.classList.add('cu-row-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    tr.addEventListener('dragend', () => {
      tr.classList.remove('cu-row-dragging');
      cuBody.querySelectorAll('.cu-row-dragover').forEach(el => el.classList.remove('cu-row-dragover'));
      _cuDragRow = null;
    });
    tr.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      cuBody.querySelectorAll('.cu-row-dragover').forEach(el => el.classList.remove('cu-row-dragover'));
      tr.classList.add('cu-row-dragover');
    });
    tr.addEventListener('dragleave', () => {
      tr.classList.remove('cu-row-dragover');
    });
    tr.addEventListener('drop', (e) => {
      e.preventDefault();
      const dropRow = parseInt(tr.dataset.row);
      if (_cuDragRow === null || _cuDragRow === dropRow) return;
      // Move the dragged row to the drop position
      const [moved] = _cuEditorTable.splice(_cuDragRow, 1);
      _cuEditorTable.splice(dropRow, 0, moved);
      _renderCuTable();
    });
  });
}

document.getElementById('btn-cu-save')?.addEventListener('click', () => {
  if (!_cuEditorNode) return;
  commands.execute(new SetNodePropsCommand(scene, _cuEditorNode.id, {
    controlTable: JSON.parse(JSON.stringify(_cuEditorTable))
  }));
  cuOverlay?.classList.add('hidden');
  _cuEditorNode = null;
});

document.getElementById('btn-cu-reset')?.addEventListener('click', () => {
  if (!confirm('Reset all opcodes to default? This will overwrite your changes.')) return;
  const count = _cuEditorNode?._opCount || _cuEditorTable.length || 16;
  _cuEditorTable = JSON.parse(JSON.stringify(DEFAULT_CONTROL_TABLE));
  // Keep the current opcode count
  while (_cuEditorTable.length < count) {
    _cuEditorTable.push({ name: '', aluOp: 0, regWe: 0, memWe: 0, memRe: 0, jmp: 0, halt: 0 });
  }
  _cuEditorTable.length = count;
  _renderCuTable();
});

document.getElementById('btn-cu-close')?.addEventListener('click', () => {
  cuOverlay?.classList.add('hidden');
  _cuEditorNode = null;
});

cuOverlay?.addEventListener('click', (e) => {
  if (e.target === cuOverlay) { cuOverlay.classList.add('hidden'); _cuEditorNode = null; }
});

bus.on('cu:edit', (node) => { _openCuEditor(node); });

// ── Examples System ─────────────────────────────────────────
const EXAMPLES = [
  {
    id: '4bit-counter',
    title: '4-Bit Counter',
    desc: 'A simple 4-bit counter driven by a clock. Press Play to see it count up from 0 to 15.',
    tags: ['beginner', 'Counter', 'CLK'],
    file: 'examples/circuits/4bit-counter.json',
  },
  {
    id: 'alu-calculator',
    title: 'ALU Calculator',
    desc: 'An 8-bit ALU performing ADD on two immediate values. Double-click the IMM nodes to change values and operation.',
    tags: ['beginner', 'ALU', 'IMM'],
    file: 'examples/circuits/alu-calculator.json',
  },
  {
    id: 'register-load',
    title: 'Register Load/Read',
    desc: 'Load a value into an 8-bit register on a clock edge, then read it back. Toggle EN to enable/disable loading.',
    tags: ['beginner', 'Register', 'CLK'],
    file: 'examples/circuits/register-load.json',
  },
  {
    id: 'ram-readwrite',
    title: 'RAM Read/Write',
    desc: 'Write a value to a specific RAM address, then read it back. Change ADDR and DATA to experiment.',
    tags: ['intermediate', 'RAM'],
    file: 'examples/circuits/ram-readwrite.json',
  },
  {
    id: 'fifo-pipeline',
    title: 'FIFO Queue',
    desc: 'A 4-deep FIFO buffer. Toggle WR to push data, toggle RD to pop. Watch FULL and EMPTY flags.',
    tags: ['intermediate', 'FIFO'],
    file: 'examples/circuits/fifo-pipeline.json',
  },
  {
    id: 'instruction-decoder',
    title: 'Instruction Decoder',
    desc: 'An IR decodes a 16-bit instruction into opcode, RD, RS1, RS2 fields. The CU generates control signals from the opcode.',
    tags: ['advanced', 'IR', 'CU'],
    file: 'examples/circuits/instruction-decoder.json',
  },
  {
    id: 'simple-cpu',
    title: 'Simple CPU — Countdown',
    desc: 'A complete CPU with Register File. Counts down R1 from 10 to 0 using SUB R1,R1,R2 each cycle. Watch R1 decrease in real-time until HALT.',
    tags: ['advanced', 'PC', 'ROM', 'IR', 'CU', 'ALU', 'RF'],
    file: 'examples/circuits/simple-cpu.json',
  },
  {
    id: 'pipeline-demo',
    title: 'Pipeline Demo (3-stage)',
    desc: 'Evolving pipelining reference: AND → PIPE1 → fan-out to (NOT, OR+C) → PIPE2/PIPE3 → XOR → Q. Run "Analyze Pipeline" (Ctrl+K) to see 3 stages.',
    tags: ['pipeline', 'PIPE', 'CLK'],
    file: 'examples/circuits/pipeline-demo.json',
  },
  {
    id: 'pipeline-demo-bad',
    title: 'Pipeline Demo — Bad Wire (validation)',
    desc: 'Same circuit as the Pipeline Demo but with a shortcut wire (A → XOR) that skips PIPE. The validator flags it and highlights it red on the canvas.',
    tags: ['pipeline', 'validation', 'error'],
    file: 'examples/circuits/pipeline-demo-bad.json',
  },
  {
    id: 'pipeline-demo-hazard',
    title: 'Pipeline Demo — RAW Hazard (feedback)',
    desc: 'Two-PIPE pipeline with a feedback arc from PIPE2 back to XOR. The Hazards section flags it as a RAW data hazard and suggests a forwarding mux or latching PIPE.',
    tags: ['pipeline', 'hazard', 'RAW', 'feedback'],
    file: 'examples/circuits/pipeline-demo-hazard.json',
  },
  {
    id: 'pipeline-demo-hazard-all',
    title: 'Pipeline Demo — All Hazards (RAW/WAR/WAW/LOOP)',
    desc: 'Four isolated lanes, one hazard per lane: (top) RAW feedback through two PIPEs, (upper-mid) a pure combinational NAND loop, (lower-mid) a WAR feedback into a 2-channel PIPE, (bottom) a WAW collision with two PIPEs writing the same XOR pin. Open the Pipeline panel to see all four classified.',
    tags: ['pipeline', 'hazard', 'RAW', 'WAR', 'WAW', 'LOOP'],
    file: 'examples/circuits/pipeline-demo-hazard-all.json',
  },
  {
    id: 'pipeline-demo-program',
    title: 'Pipeline Demo — Program Hazards (RAW + load-use)',
    desc: 'Minimal MIPS-style datapath with a 6-instruction ROM. Program sequence: ADD R2,R1,R2 / SUB R3,R2,R3 / LOAD R4,[R4] / ADD R5,R4,R4 / CMP R1,R5 / HALT. Open the Pipeline panel to see RAW on R2 (1→2), a classic load-use between LOAD and the next ADD, and a RAW on R5 between ADD and CMP.',
    tags: ['pipeline', 'program', 'RAW', 'load-use'],
    file: 'examples/circuits/pipeline-demo-program.json',
  },
  {
    id: 'pipeline-demo-program-rich',
    title: 'Pipeline Demo — Program Hazards (rich, 8 dependencies)',
    desc: 'Textbook 9-instruction sequence producing 8 distinct hazards: fan-out of ADD R1 feeding SUB/AND/OR/XOR (4 RAW on R1 with decreasing bubble counts), a chained RAW on R4, then a LOAD followed by two consumers (LOAD-USE + RAW on R11), and a final RAW on R13 between ADD and SUB. Open the Pipeline panel to see every dependency labeled with the exact instruction and required bubble count.',
    tags: ['pipeline', 'program', 'RAW', 'load-use', 'chain', 'fan-out'],
    file: 'examples/circuits/pipeline-demo-program-rich.json',
  },
  {
    id: 'pipeline-demo-elastic',
    title: 'Pipeline Demo — Elastic (valid/ready back-pressure)',
    desc: 'Two-stage pipeline with HANDSHAKE components wiring valid/ready into each PIPE_REG\u2019s STALL pin. Toggle VALID and READY inputs to pause or release the pipeline. The Pipeline panel flags both stages as elastic (yellow E badge) and shows their S (stall) status live. Canonical demonstration of back-pressure in a pipelined datapath.',
    tags: ['pipeline', 'elastic', 'HANDSHAKE', 'stall', 'back-pressure'],
    file: 'examples/circuits/pipeline-demo-elastic.json',
  },
  {
    id: 'pipeline-demo-retime',
    title: 'Pipeline Demo — Imbalanced 3-stage (for retiming)',
    desc: '3-stage pipeline with 6 inverters arranged as 3 / 1 / 2 across two PIPE_REGs. Pipeline panel reports stage delays of 150 / 50 / 100 ps — Balance 33%, Bottleneck S0. The Phase 10a engine pinpoints the right move (pull PIPE1 backward across INV3) that rebalances every stage to exactly 100 ps, raising f_max by 50%. The UI button for applying the suggestion lands in Phase 10b.',
    tags: ['pipeline', 'retime', 'imbalanced', 'PIPE'],
    file: 'examples/circuits/pipeline-demo-retime.json',
  },
  {
    id: 'pipeline-demo-program-all',
    title: 'Pipeline Demo — Program Hazards (all types: RAW/WAR/WAW/load-use)',
    desc: '7-instruction sequence that exercises every program-hazard classification: RAW (ADD→SUB on R1), WAR (ADD reads R2 → AND writes R2), WAW (ADD writes R1 → OR writes R1 again), a second WAR (SUB reads R1 → OR writes R1), and a LOAD-USE RAW (LOAD R10 → ADD reads R10). In-order 5-stage pipelines handle WAR/WAW for free; they are reported for OOO/register-renaming awareness.',
    tags: ['pipeline', 'program', 'RAW', 'WAR', 'WAW', 'load-use'],
    file: 'examples/circuits/pipeline-demo-program-all.json',
  },
  {
    id: 'pipeline-demo-loop',
    title: 'Pipeline Demo — Induction-Variable Loop (steady-state hazard)',
    desc: '5-instruction ROM with a backward JZ at 0x03 → 0x00. The LOOPS panel reports one loop of 4 body instructions with R1 as the induction variable (self-update ADD R1, R1, R2). PROGRAM HAZARDS includes a RAW tagged STEADY — R1 is written at 0x01 and read by 0x00 of the next iteration across the back-edge.',
    tags: ['pipeline', 'loop', 'induction-variable', 'steady-state', 'RAW'],
    file: 'examples/circuits/pipeline-demo-loop.json',
  },
  {
    id: 'pipeline-demo-cdc',
    title: 'Pipeline Demo — Clock-Domain Crossing (CDC)',
    desc: 'Two CLOCK sources (clkA, clkB) feeding stateful flops in separate domains. A source PIPE on clkA fans out to two receivers on clkB: one single flop (WARN — depth 1) and one 2-flop synchronizer chain (OK — depth 2). The CDC CROSSINGS section in the Pipeline panel reports both with sync-depth badges.',
    tags: ['pipeline', 'cdc', 'clock-domain', 'synchronizer', 'multi-clock'],
    file: 'examples/circuits/pipeline-demo-cdc.json',
  },
  {
    id: 'mips-5stage-forwarding-demo',
    title: 'Pipeline Demo — MIPS 5-stage + EX→EX forwarding',
    desc: 'The no-forwarding MIPS demo extended with two 2:1 forwarding MUXes on the ALU.A/B paths. Each MUX selects between the normal ID/EX read and the latched EX/MEM.alu_result, gated by an EQ comparator between ID/EX.rs{1,2}_field and EX/MEM.rd plus an AND with EX/MEM.regWe. The same 6-instruction program runs: 3 of the 4 RAW hazards are now marked ✓ resolved by forwarding; only the LOAD→ADD load-use remains with its full bubble cost. The canonical demo for Phase 14b detection on a real pipelined CPU.',
    tags: ['pipeline', 'mips', 'forwarding', 'hazard', 'RAW', 'load-use', '5-stage'],
    file: 'examples/circuits/mips-5stage-forwarding-demo.json',
  },
  {
    id: 'mips-5stage-demo',
    title: 'Pipeline Demo — MIPS 5-stage (no forwarding)',
    desc: 'Classical 5-stage MIPS datapath: IF (PC→ROM→IR) · ID (CU+RF reads) · EX (ALU) · MEM (DMEM) · WB (MUX→RF.wdata). IR serves as the IF/ID latch, so the panel shows 4 visible stages. The ROM runs a 6-instruction program exercising back-to-back RAW, 2-apart RAW, and a classic load-use hazard (LOAD R7 → ADD using R7). No forwarding is wired — every RAW reports its full bubble cost. Intended as the canonical pipelined-MIPS reference and the benchmark for a future forwarding-enabled variant.',
    tags: ['pipeline', 'mips', 'hazard', 'RAW', 'load-use', '5-stage'],
    file: 'examples/circuits/mips-5stage-demo.json',
  },
  {
    id: 'pipeline-forwarding-demo',
    title: 'Pipeline Demo — Forwarding (EX→EX bypass)',
    desc: '2-stage datapath: REG_FILE_DP → 2× forwarding MUX → ALU → PIPE_REG(EX/WB) → back to MUX.in1 + RF write-data. Two COMPARATORs drive the MUX select, comparing IR.rs1/rs2 against the latched destination register. The ROM runs a textbook load-use sequence: LOAD R1, ADD R2 = R1+R3, ADD R4 = R2+R3, SUB, HALT. The Pipeline panel flags both RAWs; only the LOAD→ADD one requires a bubble — the ADD→ADD RAW is marked ✓ resolved by forwarding.',
    tags: ['pipeline', 'forwarding', 'bypass', 'hazard', 'load-use'],
    file: 'examples/circuits/pipeline-forwarding-demo.json',
  },
  {
    id: 'mips-gcd',
    title: 'MIPS Datapath — Euclid GCD',
    desc: 'Single-cycle CPU laid out in 5 MIPS stages (Fetch/Decode/Execute/Memory/WB). Runs Euclid\u2019s GCD algorithm: gcd(12,8). Watch R1 converge to 4, then HALT.',
    tags: ['advanced', 'MIPS', 'GCD', 'Branch', 'Jump'],
    file: 'examples/circuits/mips-gcd.json',
  },
  {
    id: 'cpu-detailed',
    title: 'Harvard CPU — Detailed (CIRCUIT_DETAILS.md)',
    desc: '8-bit Harvard single-cycle CPU with PC, IMEM (256x16), IR, CU (14-op controlTable), RegFile 8x8, ALU, DMEM (256x8), 6→8 sign-extend, ALU-B MUX, 3-way Write-back MUX (ALU/DMEM/SLTI), opcode decoder driving USE_IMM / MEM_TO_REG / IS_SLTI, and a halt-gated cycle counter. Pre-loaded with a 20-instruction demo (init + loop with SW + post-loop LW/ADD/SUB/SW).',
    tags: ['advanced', 'CPU', 'Harvard', 'SLTI', 'Loop', 'Store', 'Load'],
    file: 'examples/circuits/cpu-detailed.json',
  },
];

const examplesOverlay = document.getElementById('examples-overlay');
const examplesList = document.getElementById('examples-list');

const EXAMPLES_CATEGORIES = [
  { id: 'beginner',     label: 'Beginner'     },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced',     label: 'Advanced'     },
  { id: 'pipeline',     label: 'Pipeline'     },
];
let _examplesActiveTab = 'beginner';

function _categoryOf(ex) {
  // Category is the first tag that matches a known category id.
  for (const t of (ex.tags || [])) {
    if (EXAMPLES_CATEGORIES.some(c => c.id === t)) return t;
  }
  return 'advanced';   // fallback bucket for un-categorized examples
}

function _renderExamplesCards(category) {
  const cards = EXAMPLES.filter(ex => _categoryOf(ex) === category).map(ex => {
    const tagHtml = ex.tags.map(t => {
      const level = EXAMPLES_CATEGORIES.some(c => c.id === t) ? t : 'component';
      return `<span class="example-tag example-tag-${level}">${t.toUpperCase()}</span>`;
    }).join('');
    return `<div class="example-card" data-file="${ex.file}">
      <div class="example-card-title">${ex.title}</div>
      <div class="example-card-desc">${ex.desc}</div>
      <div class="example-card-tags">${tagHtml}</div>
    </div>`;
  }).join('');
  const container = examplesList.querySelector('.examples-cards');
  container.innerHTML = cards || '<div class="examples-empty">No examples in this category yet.</div>';
  container.querySelectorAll('.example-card').forEach(card => {
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
          setTimeout(() => Renderer.zoomToFit(scene.nodes), 100);
        }
      } catch (e) {
        alert('Failed to load example: ' + e.message);
      }
      examplesOverlay.classList.add('hidden');
    });
  });
}

function _showExamples() {
  const counts = {};
  for (const c of EXAMPLES_CATEGORIES) counts[c.id] = 0;
  for (const ex of EXAMPLES) counts[_categoryOf(ex)]++;

  const tabsHtml = EXAMPLES_CATEGORIES.map(c =>
    `<button class="examples-tab${c.id === _examplesActiveTab ? ' active' : ''}" data-cat="${c.id}">
       ${c.label}<span class="examples-tab-count">${counts[c.id]}</span>
     </button>`
  ).join('');

  examplesList.innerHTML = `
    <div class="examples-tabs">${tabsHtml}</div>
    <div class="examples-cards"></div>
  `;

  examplesList.querySelectorAll('.examples-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _examplesActiveTab = btn.dataset.cat;
      examplesList.querySelectorAll('.examples-tab').forEach(b => b.classList.toggle('active', b.dataset.cat === _examplesActiveTab));
      _renderExamplesCards(_examplesActiveTab);
    });
  });

  _renderExamplesCards(_examplesActiveTab);
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

  Input.init(canvas, scene, state, commands, selection);
  Input.setShortcutManager(shortcuts);

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

  // Restore waveform view state if one was persisted alongside the design.
  try {
    const wfSaved = localStorage.getItem('circuit_designer_waveform_view');
    if (wfSaved) Waveform.loadViewState(JSON.parse(wfSaved));
  } catch (_) { /* ignore */ }

  // Initialize waveform signals
  Waveform.setSignals(scene.nodes);

  // Update UI
  _updateDesignToolActive('select');
  _updateSequentialUI();
  _updateStepCount();

  // Start render loop
  _rafId = requestAnimationFrame(tick);

  // Expose handles for pipeline debugging via DevTools console.
  window.pipeline = {
    analyzer: pipelineAnalyzer,
    analyze:   () => pipelineAnalyzer.analyze({ force: true }),
    scene,
    // Phase 13 — local telemetry inspection from DevTools.
    telemetry: () => PipelineTelemetry.snapshot(),
    resetTelemetry: () => PipelineTelemetry.reset(),
  };

  console.log('[Circuit Designer Pro] initialized');
}

start();
