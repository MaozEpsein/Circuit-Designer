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
import { state as waveformState } from './waveform/WaveformState.js';
import { sanitizeIdentifier as sanitizeIdent } from './hdl/core/identifiers.js';
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
import { evaluate as evaluatePipeline } from './pipeline/StageEvaluator.js';
import { PipelinePanel } from './pipeline/ui/PipelinePanel.js';
import { DFTPanel } from './dft/ui/DFTPanel.js';
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
// Expose `state` on window so the DFT panel (and other UI modules
// that aren't in the import graph from app.js) can read engine state
// like ffStates without an explicit pass-through. Read-only contract:
// nothing should *mutate* state via window — that path stays through
// commands.execute() / bus events.
if (typeof window !== 'undefined') window.state = state;
const commands = new CommandManager(100);
const simCtrl  = new SimulationController();
const pipelineAnalyzer = new PipelineAnalyzer(scene);
const pipelinePanel    = new PipelinePanel(pipelineAnalyzer);
const dftPanel         = new DFTPanel(scene);
const stageOverlay     = new StageOverlay(pipelineAnalyzer);

// Pipeline panel asks to mutate a CU's props (e.g. branchPredictor dropdown);
// route through the command stack so the change is undoable.
bus.on('pipeline:set-cu-prop', ({ nodeId, props }) => {
  commands.execute(new SetNodePropsCommand(scene, nodeId, props));
});

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
const wireStuckAt       = document.getElementById('wire-stuckat');
const wireOpenToggle    = document.getElementById('wire-open-toggle');
const wireBridge        = document.getElementById('wire-bridge');
const wireBridgeMode    = document.getElementById('wire-bridge-mode');
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

    case 'copy-verilog':
      // Export just this node + the wires touching it as a one-block
      // Verilog snippet, then copy to clipboard. Useful for grabbing
      // a single component's translator output without scanning the
      // whole module. Inputs/outputs that the node connects to become
      // ad-hoc INPUT/OUTPUT ports so the snippet is a valid module.
      if (node) {
        const wires = scene.wires.filter(
          w => w.sourceId === node.id || w.targetId === node.id,
        );
        const portStubs = [];
        const seen = new Set([node.id]);
        for (const w of wires) {
          for (const otherId of [w.sourceId, w.targetId]) {
            if (seen.has(otherId)) continue;
            seen.add(otherId);
            const other = scene.getNode(otherId);
            if (!other) continue;
            const isUpstream = (otherId === w.sourceId);
            portStubs.push({
              id: otherId,
              type: isUpstream ? 'INPUT' : 'OUTPUT',
              label: other.label || otherId,
              bitWidth: other.bitWidth || 1,
              x: other.x, y: other.y,
            });
          }
        }
        const subCircuit = {
          nodes: [node, ...portStubs],
          wires,
        };
        const snippet = exportVerilog(subCircuit, {
          topName: (node.label || node.type || 'block').toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          header: false,
        });
        navigator.clipboard?.writeText(snippet).then(() => {
          bus.emit('toast:show', { text: 'Verilog snippet copied to clipboard', kind: 'ok' });
        }).catch(() => {
          bus.emit('toast:show', { text: 'Clipboard write failed', kind: 'err' });
        });
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

  const rawTitle = node.subName || node.label || 'BLOCK';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const title = esc(rawTitle);
  // Escape `<` inside JSON literals so an embedded `</script>` cannot break out of the inline script tag.
  const safeJSON = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  const nodesJSON = safeJSON(sc.nodes);
  const wiresJSON = safeJSON(sc.wires || []);

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

  // Surface the engine's live branch-flush log so the Pipeline Performance
  // panel can show "Branch flushes (live): N — at PC=…". Always emit so a
  // post-reset empty log clears the previous render.
  bus.emit('runtime:branch-flushes', state.ffStates.get('__branch_flushes__') || []);

  // Surface live CACHE stats (one snapshot per cache instance in scene)
  // for the Pipeline panel's CACHE section. Same shape as the branch-
  // flush relay: read from ffStates, normalise to an array, emit.
  const cacheMap = state.ffStates.get('__cache_stats__');
  const cacheArr = cacheMap
    ? [...cacheMap.entries()].map(([id, s]) => ({ id, label: s.label, hits: s.hits, misses: s.misses, recent: [...s.recent], miss3C: { ...(s.miss3C || { compulsory: 0, capacity: 0, conflict: 0 }) } }))
    : [];
  bus.emit('runtime:cache-stats', cacheArr);

  // Per-tick poke for the DFT panel — its SIGNATURE COMPACTORS section
  // reads MISR state straight off ffStates, but the panel only
  // re-renders on scene mutations. Emitting this every tick lets the
  // live signature track the simulation in real time. The payload is
  // empty because the panel reads ffStates directly.
  bus.emit('runtime:dft-data', null);

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
  if (node.type === 'CACHE') {
    propsType.innerHTML = `CACHE <button id="prop-cache-info-btn" title="What do these props mean?" style="margin-left:8px;background:#1a4a7a;color:#fff;border:1px solid #4a90e2;border-radius:50%;width:18px;height:18px;font-size:11px;font-family:serif;font-style:italic;text-transform:lowercase;cursor:pointer;padding:0;line-height:1;vertical-align:middle">i</button>`;
    // Direct click binding — delegation through document was unreliable
    // because some upstream handler swallowed the event.
    setTimeout(() => {
      const btn = document.getElementById('prop-cache-info-btn');
      if (btn) btn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); _openCacheInfoModal(); };
    }, 0);
  } else {
    propsType.textContent = node.type;
  }

  propLabelRow.style.display = '';
  propValueRow.style.display = (node.type === 'INPUT' || node.type === 'MUX_SELECT') ? '' : 'none';
  propStepsRow.style.display = node.type === 'INPUT' ? '' : 'none';
  propTargetRow.style.display = node.type === 'OUTPUT' ? '' : 'none';
  propStepTargetsRow.style.display = node.type === 'OUTPUT' ? '' : 'none';
  propInitQRow.style.display = (node.type === 'FF_SLOT' || node.type === 'SCAN_FF') ? '' : 'none';

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
  } else if (node.type === 'CACHE') {
    // CACHE shares the data-bits/addr-bits rows with RAM. Defaults are
    // bigger because cache lessons need 256-cell address space (8 bits).
    propMembitRow.style.display = '';
    document.getElementById('prop-membit-label').textContent = 'Data Bits';
    propMembitSel.value = node.dataBits || 8;
    propMemaddrRow.style.display = '';
    propMemaddrSel.value = node.addrBits || 8;
    const linesRow = document.getElementById('prop-cache-lines-row');
    const linesInp = document.getElementById('prop-cache-lines-input');
    const mapRow   = document.getElementById('prop-cache-mapping-row');
    const mapSel   = document.getElementById('prop-cache-mapping-select');
    const waysRow  = document.getElementById('prop-cache-ways-row');
    const waysInp  = document.getElementById('prop-cache-ways-input');
    if (linesRow && linesInp) {
      linesRow.style.display = 'flex';
      linesInp.value = String(node.lines || 4);
    }
    if (mapRow && mapSel) {
      mapRow.style.display = '';
      // Migrate legacy 'set-assoc-2' literal to the canonical (mapping, ways) pair.
      const m = node.mapping === 'set-assoc-2' ? 'set-assoc' : (node.mapping || 'direct');
      mapSel.value = m;
      if (waysRow && waysInp) {
        waysRow.style.display = (m === 'set-assoc') ? '' : 'none';
        waysInp.max = String(node.lines || 4);
        waysInp.value = String(node.ways || 2);
      }
    }
    const wpRow = document.getElementById('prop-cache-wp-row');
    const wpSel = document.getElementById('prop-cache-wp-select');
    if (wpRow && wpSel) {
      wpRow.style.display = 'flex';
      wpSel.value = node.writePolicy || 'write-through';
    }
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
  // LFSR / MISR rows: seed + taps. Both share the same fields.
  // MISR also gets an extra GOLDEN row below.
  const lfsrSeedRow  = document.getElementById('prop-lfsr-seed-row');
  const lfsrSeedInp  = document.getElementById('prop-lfsr-seed-input');
  const lfsrTapsRow  = document.getElementById('prop-lfsr-taps-row');
  const lfsrTapsInp  = document.getElementById('prop-lfsr-taps-input');
  const misrGoldRow  = document.getElementById('prop-misr-golden-row');
  const misrGoldInp  = document.getElementById('prop-misr-golden-input');
  if (node.type === 'LFSR' || node.type === 'MISR') {
    if (lfsrSeedRow) lfsrSeedRow.style.display = '';
    if (lfsrTapsRow) lfsrTapsRow.style.display = '';
    if (lfsrSeedInp) lfsrSeedInp.value = String(node.seed ?? (node.type === 'MISR' ? 0 : 1));
    if (lfsrTapsInp) lfsrTapsInp.value = (node.taps || []).join(', ');
  } else {
    if (lfsrSeedRow) lfsrSeedRow.style.display = 'none';
    if (lfsrTapsRow) lfsrTapsRow.style.display = 'none';
  }
  if (node.type === 'MISR') {
    if (misrGoldRow) misrGoldRow.style.display = '';
    if (misrGoldInp) {
      misrGoldInp.value = (typeof node.goldenSig === 'number')
        ? '0x' + (node.goldenSig >>> 0).toString(16) : '';
    }
  } else {
    if (misrGoldRow) misrGoldRow.style.display = 'none';
  }
  // BIST_CONTROLLER properties: runLength, sigBits, goldenSig.
  const bistRunRow  = document.getElementById('prop-bist-runlen-row');
  const bistRunInp  = document.getElementById('prop-bist-runlen-input');
  const bistSigRow  = document.getElementById('prop-bist-sigbits-row');
  const bistSigSel  = document.getElementById('prop-bist-sigbits-select');
  const bistGoldRow = document.getElementById('prop-bist-golden-row');
  const bistGoldInp = document.getElementById('prop-bist-golden-input');
  if (node.type === 'BIST_CONTROLLER') {
    if (bistRunRow)  bistRunRow.style.display  = '';
    if (bistSigRow)  bistSigRow.style.display  = '';
    if (bistGoldRow) bistGoldRow.style.display = '';
    if (bistRunInp)  bistRunInp.value  = String(node.runLength ?? 16);
    if (bistSigSel)  bistSigSel.value  = String(node.sigBits ?? 4);
    if (bistGoldInp) bistGoldInp.value = '0x' + ((node.goldenSig | 0) >>> 0).toString(16);
  } else {
    if (bistRunRow)  bistRunRow.style.display  = 'none';
    if (bistSigRow)  bistSigRow.style.display  = 'none';
    if (bistGoldRow) bistGoldRow.style.display = 'none';
  }
  // JTAG_TAP properties: irBits, idcode.
  const jtagIrRow  = document.getElementById('prop-jtag-irbits-row');
  const jtagIrSel  = document.getElementById('prop-jtag-irbits-select');
  const jtagIdRow  = document.getElementById('prop-jtag-idcode-row');
  const jtagIdInp  = document.getElementById('prop-jtag-idcode-input');
  if (node.type === 'JTAG_TAP') {
    if (jtagIrRow) jtagIrRow.style.display = '';
    if (jtagIdRow) jtagIdRow.style.display = '';
    if (jtagIrSel) jtagIrSel.value = String(node.irBits ?? 4);
    if (jtagIdInp) jtagIdInp.value = '0x' + ((node.idcode | 0) >>> 0).toString(16);
  } else {
    if (jtagIrRow) jtagIrRow.style.display = 'none';
    if (jtagIdRow) jtagIdRow.style.display = 'none';
  }
  if (node.type !== 'CACHE') {
    const linesRow = document.getElementById('prop-cache-lines-row');
    const mapRow   = document.getElementById('prop-cache-mapping-row');
    const waysRow  = document.getElementById('prop-cache-ways-row');
    const wpRow    = document.getElementById('prop-cache-wp-row');
    if (linesRow) linesRow.style.display = 'none';
    if (mapRow)   mapRow.style.display   = 'none';
    if (waysRow)  waysRow.style.display  = 'none';
    if (wpRow)    wpRow.style.display    = 'none';
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
  if (node.type === 'FF_SLOT' || node.type === 'SCAN_FF') propInitQToggle.textContent = node.initialQ ?? 0;
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

// CACHE mapping change — switching mapping rebuilds cache state on next eval
// because Phase 2b initializes either ms.lines or ms.sets based on the prop.
// Mapping + ways are kept as separate node props (matching how the engine's
// _cacheWays helper reads them). The Ways row is only meaningful for
// set-associative; show/hide it manually here to avoid relying on a panel
// re-render after the props command.
document.getElementById('prop-cache-mapping-select')?.addEventListener('change', () => {
  const node = _getSelectedNode();
  if (!node || node.type !== 'CACHE') return;
  const val = document.getElementById('prop-cache-mapping-select').value;
  state.ffStates?.delete(node.id);
  commands.execute(new SetNodePropsCommand(scene, node.id, { mapping: val }));
  const waysRow = document.getElementById('prop-cache-ways-row');
  const waysInp = document.getElementById('prop-cache-ways-input');
  if (waysRow) waysRow.style.display = (val === 'set-assoc') ? 'flex' : 'none';
  if (waysInp && val === 'set-assoc') waysInp.value = String(node.ways || 2);
});

// Info modal explaining Lines / Mapping / Ways. Opened by the (i) button
// next to the CACHE properties header (binding done in _updatePropsPanel
// because the button gets re-rendered on every panel refresh).
function _openCacheInfoModal() {
  if (document.getElementById('cache-info-modal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'cache-info-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;font-family:"JetBrains Mono",monospace';
  overlay.innerHTML = `
    <div style="background:#1a1a1a;border:1px solid #444;border-radius:8px;max-width:640px;width:90%;max-height:80vh;overflow:auto;padding:20px;color:#ccc;font-size:12px;line-height:1.6">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h2 style="margin:0;color:#9cf;font-size:14px">CACHE — Lines / Mapping / Ways</h2>
        <button id="cache-info-close" style="background:#333;color:#ccc;border:1px solid #555;border-radius:4px;padding:2px 10px;cursor:pointer">✕</button>
      </div>
      <p style="margin-bottom:6px"><b style="color:#9cf">Each property in the panel:</b></p>
      <ul style="margin:0 0 14px 18px;padding:0">
        <li><b style="color:#9cf">Data Bits</b> — width of each value stored in a line (e.g. 8 → bytes).</li>
        <li><b style="color:#9cf">Addr Bits</b> — width of the address bus connecting CPU↔cache↔RAM.</li>
        <li><b style="color:#9cf">Lines</b> — total number of cache slots (capacity).</li>
        <li><b style="color:#9cf">Mapping</b> — how addresses are assigned to slots: <code>direct</code>, <code>set-associative</code>, or <code>fully-associative</code>.</li>
        <li><b style="color:#9cf">Ways</b> — only for set-associative: how many slots each address can land in.</li>
        <li><b style="color:#9cf">Write Policy</b> — <code>write-through</code>: every CPU write goes to cache + RAM together. <code>write-back</code>: writes stay in the cache (line marked <span style="color:#f88">D</span>irty); RAM is only updated when a dirty line is evicted. Write-back saves bus traffic on write-heavy workloads.</li>
      </ul>
      <p style="margin-top:14px;color:#9cf"><b>Example with Lines = 16:</b></p>
      <table style="width:100%;border-collapse:collapse;margin-top:6px">
        <thead>
          <tr style="background:#222;color:#9cf">
            <th style="padding:6px;border:1px solid #444;text-align:left">Mapping</th>
            <th style="padding:6px;border:1px solid #444;text-align:left">Ways</th>
            <th style="padding:6px;border:1px solid #444;text-align:left">Sets</th>
            <th style="padding:6px;border:1px solid #444;text-align:left">Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:6px;border:1px solid #444">direct</td><td style="padding:6px;border:1px solid #444">—</td><td style="padding:6px;border:1px solid #444">16 × 1</td><td style="padding:6px;border:1px solid #444">each address maps to exactly one slot</td></tr>
          <tr><td style="padding:6px;border:1px solid #444">set-assoc</td><td style="padding:6px;border:1px solid #444">2</td><td style="padding:6px;border:1px solid #444">8 × 2</td><td style="padding:6px;border:1px solid #444">each address has 2 candidate slots</td></tr>
          <tr><td style="padding:6px;border:1px solid #444">set-assoc</td><td style="padding:6px;border:1px solid #444">4</td><td style="padding:6px;border:1px solid #444">4 × 4</td><td style="padding:6px;border:1px solid #444">more flexibility, fewer conflicts</td></tr>
          <tr><td style="padding:6px;border:1px solid #444">set-assoc</td><td style="padding:6px;border:1px solid #444">16</td><td style="padding:6px;border:1px solid #444">1 × 16</td><td style="padding:6px;border:1px solid #444">equivalent to fully-associative</td></tr>
          <tr><td style="padding:6px;border:1px solid #444">fully-assoc</td><td style="padding:6px;border:1px solid #444">—</td><td style="padding:6px;border:1px solid #444">1 × 16</td><td style="padding:6px;border:1px solid #444">any address can live in any slot</td></tr>
        </tbody>
      </table>
      <p style="margin-top:14px;color:#888;font-size:11px"><b>Real-world:</b> a typical L1 data cache is 32KB ÷ 64-byte lines = <b>512 lines</b>, organized as 8-way set-associative (64 sets × 8 ways).</p>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
  document.getElementById('cache-info-close').addEventListener('click', close);
  document.addEventListener('keydown', function esc(ev) {
    if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

document.getElementById('prop-cache-lines-input')?.addEventListener('change', () => {
  const node = _getSelectedNode();
  if (!node || node.type !== 'CACHE') return;
  const inp = document.getElementById('prop-cache-lines-input');
  let v = parseInt(inp.value);
  if (!Number.isFinite(v) || v < 1) v = 1;
  inp.value = String(v);
  state.ffStates?.delete(node.id);
  // If shrinking lines below current ways, clamp ways too.
  const props = { lines: v };
  if ((node.ways || 2) > v && (node.mapping === 'set-assoc')) props.ways = v;
  commands.execute(new SetNodePropsCommand(scene, node.id, props));
  // Refresh the Ways input's max attribute live.
  const waysInp = document.getElementById('prop-cache-ways-input');
  if (waysInp) waysInp.setAttribute('max', String(v));
});

document.getElementById('prop-cache-wp-select')?.addEventListener('change', () => {
  const node = _getSelectedNode();
  if (!node || node.type !== 'CACHE') return;
  const val = document.getElementById('prop-cache-wp-select').value;
  state.ffStates?.delete(node.id);
  commands.execute(new SetNodePropsCommand(scene, node.id, { writePolicy: val }));
});

document.getElementById('prop-cache-ways-input')?.addEventListener('change', () => {
  const node = _getSelectedNode();
  if (!node || node.type !== 'CACHE') return;
  const inp = document.getElementById('prop-cache-ways-input');
  let v = parseInt(inp.value);
  if (!Number.isFinite(v) || v < 2) v = 2;
  const maxLines = node.lines || 4;
  if (v > maxLines) v = maxLines;
  inp.value = String(v);
  state.ffStates?.delete(node.id);
  commands.execute(new SetNodePropsCommand(scene, node.id, { ways: v }));
});

// Memory bit width / data bits change
document.getElementById('prop-membit-select')?.addEventListener('change', () => {
  const node = _getSelectedNode();
  if (!node) return;
  const val = parseInt(document.getElementById('prop-membit-select').value);
  const props = {};
  if (node.type === 'RAM' || node.type === 'ROM' || node.type === 'CACHE' || node.type === 'REG_FILE' || node.type === 'REG_FILE_DP' || node.type === 'FIFO' || node.type === 'STACK') {
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
  if (!node || (node.type !== 'RAM' && node.type !== 'ROM' && node.type !== 'CACHE')) return;
  commands.execute(new SetNodePropsCommand(scene, node.id, { addrBits: parseInt(document.getElementById('prop-memaddr-select').value) }));
  state.ffStates.delete(node.id);
});

// LFSR seed input — accepts decimal (`1`), hex (`0x0F`), or binary (`0b0001`).
// Resets the running register so the new seed takes effect immediately.
document.getElementById('prop-lfsr-seed-input')?.addEventListener('change', (e) => {
  const node = _getSelectedNode();
  if (!node || (node.type !== 'LFSR' && node.type !== 'MISR')) return;
  const raw = String(e.target.value || '').trim();
  let val = NaN;
  if (raw.startsWith('0x') || raw.startsWith('0X')) val = parseInt(raw.slice(2), 16);
  else if (raw.startsWith('0b') || raw.startsWith('0B')) val = parseInt(raw.slice(2), 2);
  else val = parseInt(raw, 10);
  if (!Number.isFinite(val) || val < 0) return;
  commands.execute(new SetNodePropsCommand(scene, node.id, { seed: val }));
  state.ffStates.delete(node.id);
});

// LFSR / MISR taps input — comma- or space-separated bit indices.
document.getElementById('prop-lfsr-taps-input')?.addEventListener('change', (e) => {
  const node = _getSelectedNode();
  if (!node || (node.type !== 'LFSR' && node.type !== 'MISR')) return;
  const sz = node.bitWidth || 4;
  const taps = String(e.target.value || '')
    .split(/[\s,]+/)
    .map(s => parseInt(s, 10))
    .filter(n => Number.isFinite(n) && n >= 0 && n < sz);
  if (taps.length === 0) return;
  commands.execute(new SetNodePropsCommand(scene, node.id, { taps }));
  state.ffStates.delete(node.id);
});

// MISR golden signature — accepts dec / 0xHEX / 0bBIN. Blank clears.
document.getElementById('prop-misr-golden-input')?.addEventListener('change', (e) => {
  const node = _getSelectedNode();
  if (!node || node.type !== 'MISR') return;
  const raw = String(e.target.value || '').trim();
  if (raw === '') {
    commands.execute(new SetNodePropsCommand(scene, node.id, { goldenSig: null }));
    return;
  }
  let val = NaN;
  if (raw.startsWith('0x') || raw.startsWith('0X')) val = parseInt(raw.slice(2), 16);
  else if (raw.startsWith('0b') || raw.startsWith('0B')) val = parseInt(raw.slice(2), 2);
  else val = parseInt(raw, 10);
  if (!Number.isFinite(val) || val < 0) return;
  const masked = val & ((1 << (node.bitWidth || 4)) - 1);
  commands.execute(new SetNodePropsCommand(scene, node.id, { goldenSig: masked }));
});

// BIST_CONTROLLER properties.
document.getElementById('prop-bist-runlen-input')?.addEventListener('change', (e) => {
  const node = _getSelectedNode();
  if (!node || node.type !== 'BIST_CONTROLLER') return;
  let v = parseInt(e.target.value, 10);
  if (!Number.isFinite(v) || v < 1) v = 1;
  if (v > 65535) v = 65535;
  e.target.value = String(v);
  commands.execute(new SetNodePropsCommand(scene, node.id, { runLength: v }));
  state.ffStates?.delete(node.id);
});
document.getElementById('prop-bist-sigbits-select')?.addEventListener('change', (e) => {
  const node = _getSelectedNode();
  if (!node || node.type !== 'BIST_CONTROLLER') return;
  const v = parseInt(e.target.value, 10);
  commands.execute(new SetNodePropsCommand(scene, node.id, { sigBits: v }));
  state.ffStates?.delete(node.id);
});
document.getElementById('prop-jtag-irbits-select')?.addEventListener('change', (e) => {
  const node = _getSelectedNode();
  if (!node || node.type !== 'JTAG_TAP') return;
  const v = parseInt(e.target.value, 10);
  if (!Number.isFinite(v) || v < 1) return;
  commands.execute(new SetNodePropsCommand(scene, node.id, { irBits: v }));
  state.ffStates?.delete(node.id);
});
document.getElementById('prop-jtag-idcode-input')?.addEventListener('change', (e) => {
  const node = _getSelectedNode();
  if (!node || node.type !== 'JTAG_TAP') return;
  const raw = String(e.target.value || '').trim();
  let v = NaN;
  if (raw.startsWith('0x') || raw.startsWith('0X')) v = parseInt(raw.slice(2), 16);
  else if (raw.startsWith('0b') || raw.startsWith('0B')) v = parseInt(raw.slice(2), 2);
  else v = parseInt(raw, 10);
  if (!Number.isFinite(v) || v < 0) return;
  commands.execute(new SetNodePropsCommand(scene, node.id, { idcode: v >>> 0 }));
});
document.getElementById('prop-bist-golden-input')?.addEventListener('change', (e) => {
  const node = _getSelectedNode();
  if (!node || node.type !== 'BIST_CONTROLLER') return;
  const raw = String(e.target.value || '').trim();
  let val = NaN;
  if (raw.startsWith('0x') || raw.startsWith('0X')) val = parseInt(raw.slice(2), 16);
  else if (raw.startsWith('0b') || raw.startsWith('0B')) val = parseInt(raw.slice(2), 2);
  else val = parseInt(raw, 10);
  if (!Number.isFinite(val) || val < 0) return;
  const masked = val & ((1 << (node.sigBits || 4)) - 1);
  commands.execute(new SetNodePropsCommand(scene, node.id, { goldenSig: masked }));
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
  if (!node || (node.type !== 'FF_SLOT' && node.type !== 'SCAN_FF')) return;
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
  if (wireStuckAt) wireStuckAt.value = (wire.stuckAt === 0 || wire.stuckAt === 1) ? String(wire.stuckAt) : '';
  if (wireOpenToggle) wireOpenToggle.textContent = wire.open ? 'ON' : 'OFF';
  // Populate Bridge target dropdown with every OTHER wire in the scene.
  if (wireBridge) {
    const others = scene.wires.filter(w => w.id !== wire.id);
    wireBridge.innerHTML =
      '<option value="">none</option>' +
      others.map(w => `<option value="${w.id}">${w.id || (w.sourceId + '→' + w.targetId)}</option>`).join('');
    wireBridge.value = wire.bridgedWith || '';
  }
  if (wireBridgeMode) wireBridgeMode.value = wire.bridgeMode || 'or';
}

// Wire selection: when clicking a wire in select mode, show wire props
bus.on('wire:selected', ({ wireId }) => {
  _selectedWireId = wireId;
  state.selectedNodeId = null;
  Renderer.setSelectedWire(wireId);
  _updateWirePropsPanel();
});

bus.on('selection:changed', () => {
  if (state.selectedNodeId) {
    _selectedWireId = null;
    Renderer.setSelectedWire(null);
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

wireStuckAt?.addEventListener('change', () => {
  const wire = _getSelectedWire();
  if (!wire) return;
  const v = wireStuckAt.value;
  wire.stuckAt = (v === '0' || v === '1') ? Number(v) : null;
  bus.emit('node:props-changed');
});

wireOpenToggle?.addEventListener('click', () => {
  const wire = _getSelectedWire();
  if (!wire) return;
  wire.open = !wire.open;
  wireOpenToggle.textContent = wire.open ? 'ON' : 'OFF';
  bus.emit('node:props-changed');
});

wireBridge?.addEventListener('change', () => {
  const wire = _getSelectedWire();
  if (!wire) return;
  wire.bridgedWith = wireBridge.value || null;
  bus.emit('node:props-changed');
});

wireBridgeMode?.addEventListener('change', () => {
  const wire = _getSelectedWire();
  if (!wire) return;
  wire.bridgeMode = wireBridgeMode.value;
  bus.emit('node:props-changed');
});

wireClearWaypoints?.addEventListener('click', () => {
  const wire = _getSelectedWire();
  if (!wire) return;
  wire.waypoints = [];
  // Emit so any cached panel re-renders, and flash the button so the user
  // sees the click registered even when the wire was already auto-routed.
  bus.emit('node:props-changed');
  wireClearWaypoints.style.background = '#003a4a';
  setTimeout(() => { wireClearWaypoints.style.background = ''; }, 180);
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

// Share (screenshot) — bound to PNG button in the bottom toolbar.
document.getElementById('btn-export-png')?.addEventListener('click', () => {
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
  // Show the top control bar whenever the canvas has ANY component, not
  // just a CLOCK / FF. Combinational-only demos (e.g. DFT stuck-at tour)
  // still benefit from the toolbar (sim speed slider, run/reset, etc.).
  const isSeq = scene.hasSequentialElements() || scene.nodes.length > 0;
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

// DFT panel resize grip — mirrors the Pipeline panel handler verbatim.
(function initDftResize() {
  const grip  = document.getElementById('dft-resize-grip');
  const panel = document.getElementById('dft-panel');
  if (!grip || !panel) return;

  function _applyDftFontTier(height) {
    let base;
    if (height < 300)       base = 12;
    else if (height < 550)  base = 14;
    else                    base = 16;
    panel.style.fontSize = base + 'px';
  }
  panel.style.top = '';
  _applyDftFontTier(panel.getBoundingClientRect().height);

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
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const newW = Math.max(220, Math.min(window.innerWidth  * 0.95, startW + dx));
    const newH = Math.max(150, Math.min(window.innerHeight * 0.95, startH - dy));
    panel.style.width  = newW + 'px';
    panel.style.height = newH + 'px';
    _applyDftFontTier(newH);
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
    n.type === 'RAM' || n.type === 'ROM' || n.type === 'CACHE' || n.type === 'REG_FILE' || n.type === 'REG_FILE_DP' ||
    n.type === 'FIFO' || n.type === 'STACK' || n.type === 'PC' || n.type === 'PIPE_REG' ||
    n.type === 'LFSR' || n.type === 'MISR' || n.type === 'BIST_CONTROLLER' ||
    n.type === 'JTAG_TAP' || n.type === 'BOUNDARY_SCAN_CELL'
  );

  if (memNodes.length === 0) {
    memBody.innerHTML = '<div class="mem-empty">No memory components in circuit</div>';
    return;
  }

  const typeLabels = { REGISTER: 'REG', SHIFT_REG: 'SHREG', COUNTER: 'CNT', RAM: 'RAM', ROM: 'ROM', CACHE: 'CACHE', REG_FILE: 'RF', REG_FILE_DP: 'RF-DP', FIFO: 'FIFO', STACK: 'STACK', PC: 'PC', PIPE_REG: 'PIPE', LFSR: 'LFSR', MISR: 'MISR', BIST_CONTROLLER: 'BIST', JTAG_TAP: 'JTAG', BOUNDARY_SCAN_CELL: 'BSC' };
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

    // CACHE: show line state (idx | tag | valid | data) plus a one-line
    // hits/misses summary. The lines array is allocated by the engine
    // on first eval; tag stays null until Layer 1 fills it on a real miss.
    if (node.type === 'CACHE' && (ms?.lines || ms?.sets)) {
      const stats = ms.stats || { hits: 0, misses: 0 };
      const total = stats.hits + stats.misses;
      const rate  = total > 0 ? Math.round(100 * stats.hits / total) : 0;
      html += `<div class="mem-ram-table" style="grid-column:1/-1;">`;
      html += `<div class="mem-ram-cell" style="grid-column:1/-1;font-size:11px;">hits ${stats.hits} · misses ${stats.misses} · hit-rate ${rate}%</div>`;
      if (ms.sets) {
        for (let s = 0; s < ms.sets.length; s++) {
          for (let w = 0; w < ms.sets[s].length; w++) {
            const ln = ms.sets[s][w];
            const tag = ln.tag === null ? '—' : ln.tag;
            const data = _formatMemValue(ln.data ?? 0, bits);
            const active = ln.valid ? ' mem-ram-cell-active' : '';
            const dirty = ln.dirty ? ' <span style="color:#f88">D</span>' : '';
            html += `<div class="mem-ram-cell${active}"><span class="mem-ram-addr">S${s}W${w}</span>tag=${tag} v=${ln.valid?1:0}${dirty} d=${data} lru=${ln.lru||0}</div>`;
          }
        }
      } else {
        for (let i = 0; i < ms.lines.length; i++) {
          const ln = ms.lines[i];
          const tag = ln.tag === null ? '—' : ln.tag;
          const data = _formatMemValue(ln.data ?? 0, bits);
          const active = ln.valid ? ' mem-ram-cell-active' : '';
          const dirty = ln.dirty ? ' <span style="color:#f88">D</span>' : '';
          html += `<div class="mem-ram-cell${active}"><span class="mem-ram-addr">L${i}</span>tag=${tag} v=${ln.valid?1:0}${dirty} d=${data}</div>`;
        }
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
    case 'export': document.getElementById('btn-export-json')?.click(); break;
    case 'import': document.getElementById('btn-project-load')?.click(); break;
    case 'screenshot': document.getElementById('btn-export-png')?.click(); break;
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
    case 'toggle-dft-panel':      dftPanel.toggle(); break;
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
  if (match === 'dft-panel-toggle') {
    e.preventDefault();
    bus.emit('palette:action', 'toggle-dft-panel');
    return;
  }
  if (match === 'dft-run-fault-sim') {
    e.preventDefault();
    document.getElementById('btn-dft-run')?.click();
    return;
  }
  if (match === 'dft-gen-random') {
    e.preventDefault();
    document.getElementById('btn-dft-gen-random')?.click();
    return;
  }
  if (match === 'tutorial-toggle') {
    e.preventDefault();
    document.getElementById('btn-tutorial')?.click();
    return;
  }
  if (match === 'tutorial-show-solution') {
    e.preventDefault();
    // Trigger the panel's existing "Show solution" button — only present
    // when LEARN is open on a lesson view (catalog has no such button).
    // Falls through silently if the button isn't visible.
    const btn = document.querySelector('#tutorial-panel [data-act="show-solution"]');
    if (btn) btn.click();
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

// Project bar collapse/expand. Persisted across sessions so users
// who prefer it open keep it open.
(function initProjectBarToggle() {
  const bar    = document.getElementById('project-bar');
  const toggle = document.getElementById('btn-project-bar-toggle');
  if (!bar || !toggle) return;
  const KEY = 'project-bar-open';
  const setOpen = (open) => {
    bar.classList.toggle('hidden', !open);
    toggle.textContent = open ? '▾' : '▴';
    try { localStorage.setItem(KEY, open ? '1' : '0'); } catch (_) {}
  };
  let saved = '0';
  try { saved = localStorage.getItem(KEY) || '0'; } catch (_) {}
  setOpen(saved === '1');
  toggle.addEventListener('click', () => setOpen(bar.classList.contains('hidden')));
})();

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
  const json = prompt('Paste project or circuit JSON:');
  if (!json) return;
  // Smart loader: try the full project format first (wraps circuit +
  // annotations + waveform). If that fails OR if the parsed JSON looks
  // like a bare circuit ({ nodes, wires }), fall back to importing it
  // as just a circuit so demo/sample JSONs work from the same button.
  let parsed;
  try { parsed = JSON.parse(json); }
  catch (err) { alert('Not valid JSON: ' + err.message); return; }

  const looksLikeBareCircuit = parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.wires);
  if (looksLikeBareCircuit) {
    try {
      scene.deserialize(parsed);
      state.selectedNodeId = null;
      state.resetSequentialState(scene.nodes);
      simCtrl.reset();
      commands.clear();
      _currentProjectId = null;
      if (projectNameDisplay) projectNameDisplay.textContent = 'Imported circuit';
    } catch (err) {
      alert('Failed to load circuit: ' + err.message);
    }
    return;
  }

  // Otherwise treat as full project payload.
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

// Verilog export — opens a preview modal with syntax-highlit output,
// at-a-glance stats, header toggle, copy / download actions, and a
// command hint for verifying with iverilog. Phase-7 of the HDL plan.
(function initVerilogPreview() {
  const btnOpen     = document.getElementById('btn-export-verilog');
  const overlay     = document.getElementById('verilog-preview-overlay');
  const body        = document.getElementById('verilog-preview-body');
  const btnCopy     = document.getElementById('btn-verilog-copy');
  const btnDownload = document.getElementById('btn-verilog-download');
  const btnClose    = document.getElementById('btn-verilog-close');
  const btnTB       = document.getElementById('btn-verilog-tb');
  const btnZip      = document.getElementById('btn-verilog-zip');
  const warnEl      = document.getElementById('verilog-preview-warnings');
  const violEl      = document.getElementById('verilog-preview-violations');
  const tabsEl      = document.getElementById('verilog-preview-tabs');
  const progEl      = document.getElementById('verilog-preview-progress');
  const progFill    = progEl?.querySelector('.vp-progress-fill');
  const progLabel   = document.getElementById('vp-progress-label');
  // "force anyway" gate state — when true, export proceeds despite
  // pipeline violations and the Verilog gets a WARNING comment header
  // listing every offending wire. Reset on each modal open so the user
  // explicitly opts in for each session.
  let _forceViolations = false;
  const chkHeader   = document.getElementById('chk-verilog-header');
  const txtTopName  = document.getElementById('txt-verilog-topname');
  const fnameEl     = document.getElementById('vp-filename');
  if (!btnOpen || !overlay || !body) return;

  // Sanitize the user-typed top-name to a legal Verilog identifier:
  //   • starts with letter or underscore
  //   • body contains [A-Za-z0-9_$]
  //   • blank input → fall back to "top"
  const sanitizeTop = (s) => {
    let v = (s || '').trim().replace(/[^A-Za-z0-9_$]/g, '_');
    if (!v) return 'top';
    if (!/^[A-Za-z_]/.test(v)) v = '_' + v;
    return v;
  };

  // Reserved Verilog-2001 keywords we care to highlight. Split into
  // structural keywords (kw) and net/data types (ty) so the eye can
  // skim by category. Anything not in either set stays default colour.
  const KW = new Set([
    'module','endmodule','begin','end','if','else','case','endcase',
    'default','assign','always','initial','posedge','negedge','or',
    'parameter','localparam','generate','endgenerate','for','while',
    'function','endfunction','task','endtask','return',
  ]);
  const TY = new Set([
    'wire','reg','input','output','inout','integer','genvar','tri',
    'tri0','tri1','wand','wor','supply0','supply1',
  ]);

  // Tiny streaming tokenizer. Emits HTML strings with token classes
  // so we don't depend on a syntax-highlight library. Order of tests
  // matters: comments before operators, numbers before identifiers.
  function highlightVerilog(src) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const out = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      // Line comment
      if (c === '/' && src[i + 1] === '/') {
        const nl = src.indexOf('\n', i);
        const end = nl < 0 ? src.length : nl;
        const text = src.slice(i, end);
        const isTodo = /TODO/.test(text);
        out.push(`<span class="tok-cmt${isTodo ? ' tok-todo' : ''}">${esc(text)}</span>`);
        i = end;
        continue;
      }
      // Block comment
      if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        const stop = end < 0 ? src.length : end + 2;
        out.push(`<span class="tok-cmt">${esc(src.slice(i, stop))}</span>`);
        i = stop;
        continue;
      }
      // Sized literal: `4'h0`, `8'b1010`, `1'bz`. Match width-prime-base-digits
      // so Verilog's primary numeric form stays distinct from operators.
      const litMatch = src.slice(i).match(/^\d+'[bdohBDOH][0-9a-fA-FxzXZ?_]+/);
      if (litMatch) {
        out.push(`<span class="tok-num">${esc(litMatch[0])}</span>`);
        i += litMatch[0].length;
        continue;
      }
      // Bare decimal
      if (/[0-9]/.test(c)) {
        const m = src.slice(i).match(/^[0-9_]+/)[0];
        out.push(`<span class="tok-num">${esc(m)}</span>`);
        i += m.length;
        continue;
      }
      // Identifier / keyword
      if (/[A-Za-z_]/.test(c)) {
        const m = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/)[0];
        const cls = KW.has(m) ? 'tok-kw' : TY.has(m) ? 'tok-ty' : null;
        out.push(cls ? `<span class="${cls}">${m}</span>` : esc(m));
        i += m.length;
        continue;
      }
      // System tasks like $dumpfile / $monitor / $finish — TB-flavoured
      // Verilog uses these heavily; without a class they'd render as
      // plain text and the testbench tab loses its visual distinction.
      if (c === '$' && /[A-Za-z_]/.test(src[i + 1] || '')) {
        const m = src.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*/)[0];
        out.push(`<span class="tok-sys">${esc(m)}</span>`);
        i += m.length;
        continue;
      }
      // Operator-ish punctuation we want to tint subtly
      if ('=<>!&|^+-*/?:'.includes(c)) {
        out.push(`<span class="tok-op">${esc(c)}</span>`);
        i++;
        continue;
      }
      // Anything else (whitespace, parens, brackets) — emit as-is.
      out.push(esc(c));
      i++;
    }
    return out.join('');
  }

  // Quick pattern-based stats from the rendered Verilog text. Keeping
  // the count source = the same string the user is reading avoids
  // surprises ("the modal says 5 nets but I counted 6").
  function statsOf(src) {
    const lines = src.split('\n').length;
    // Module port lines: the first contiguous run of "input "/"output "
    // declarations after `module`. A simpler over-counter would also
    // catch port declarations elsewhere; this is the minimal proxy.
    const ports   = (src.match(/^\s*(input|output|inout)\s/gm) || []).length;
    const nets    = (src.match(/^\s*(wire|reg|tri)\s/gm) || []).length;
    const assigns = (src.match(/^\s*assign\s/gm) || []).length;
    const alwBlks = (src.match(/^\s*always\s/gm) || []).length
                  + (src.match(/^\s*initial\s/gm) || []).length;
    const mem     = (src.match(/^\s*reg\s+(\[[^\]]*\]\s*)?\w+\s+\[/gm) || []).length;
    const todos   = (src.match(/\/\/\s*TODO/g) || []).length;
    return { lines, ports, nets, assigns, alwBlks, mem, todos };
  }

  // Wrap each line of highlighted HTML in a <span class="vp-line"> so
  // CSS counters can render line numbers in the gutter without us
  // having to compute them in JS. Splitting on '\n' is safe because
  // tokens never span multi-line — comments stop at end-of-line and
  // block comments are emitted whole into the output stream.
  function withLineNumbers(html) {
    return html.split('\n').map(l => `<span class="vp-line">${l}</span>`).join('\n');
  }

  // Pull the top module's port list out of the rendered Verilog header.
  // Expected lines look like `  input  [3:0] op,` or `  output halt`.
  // Returns: [{ dir, width, name }, ...] preserving declaration order.
  function parseTopPorts(src) {
    const ports = [];
    const re = /^\s*(input|output|inout)\s+(?:\[(\d+):(\d+)\]\s+)?([A-Za-z_][A-Za-z0-9_$]*)/gm;
    let m;
    while ((m = re.exec(src))) {
      const dir = m[1];
      const width = m[2] ? Math.abs(+m[2] - +m[3]) + 1 : 1;
      ports.push({ dir, width, name: m[4] });
    }
    return ports;
  }

  // Build a self-contained testbench. Heuristics:
  //   • clk / clock (case-insensitive, 1-bit input) becomes the clock
  //     driven by `always #5 ... = ~...;`
  //   • All other inputs are zeroed in `initial`. The user is expected
  //     to edit the stimulus block — we add a TODO marker pointing at it.
  //   • $dumpfile / $dumpvars wraps the whole module so VCD viewers
  //     (GTKWave, surfer-circuit) load it without extra config.
  //   • Run for 200 simulation time units (~20 clock cycles at #5 toggle)
  //     before $finish. Plenty for a smoke test; trivial to extend.
  function generateTestbench(verilog, topName) {
    const ports = parseTopPorts(verilog);
    const inputs  = ports.filter(p => p.dir === 'input');
    const outputs = ports.filter(p => p.dir !== 'input');
    const clkPort = inputs.find(p => /^(clk|clock)$/i.test(p.name) && p.width === 1);

    const declLine = (p, kind) => {
      const w = p.width > 1 ? `[${p.width - 1}:0] ` : '';
      return `  ${kind} ${w}${p.name};`;
    };
    const lines = [];
    const haveHistory = (waveformState?.history?.length || 0) > 1;
    lines.push(`// Auto-generated testbench for module \`${topName}\`.`);
    if (haveHistory) {
      lines.push(`// Stimulus block was REPLAYED from the session waveform —`);
      lines.push(`// values reproduce the canvas simulation cycle-by-cycle.`);
    } else {
      lines.push(`// Edit the stimulus block below to drive the design.`);
    }
    lines.push(`// Run with:  iverilog -g2005 -o sim ${topName}.v ${topName}_tb.v && vvp sim`);
    lines.push(``);
    lines.push(`\`timescale 1ns/1ps`);
    lines.push(``);
    lines.push(`module ${topName}_tb;`);
    for (const p of inputs)  lines.push(declLine(p, 'reg'));
    for (const p of outputs) lines.push(declLine(p, 'wire'));
    lines.push(``);
    lines.push(`  ${topName} dut (`);
    lines.push(ports.map(p => `    .${p.name}(${p.name})`).join(',\n'));
    lines.push(`  );`);
    lines.push(``);
    if (clkPort) {
      lines.push(`  // Clock: 100 MHz (period 10 ns).`);
      lines.push(`  initial ${clkPort.name} = 0;`);
      lines.push(`  always #5 ${clkPort.name} = ~${clkPort.name};`);
      lines.push(``);
    }

    // Stimulus: replay the recorded waveform if the user has run the
    // simulation in this session, otherwise fall back to the zeroed
    // skeleton so the TB still compiles. Replay maps each TB input
    // port back to its scene node by label-sanitisation, then walks
    // state.history per step. We sample on the negative clock edge
    // (#10 between samples → just after the rising edge in the always
    // block above), keeping setup time generous and avoiding races.
    const stimInputs = inputs.filter(p => p !== clkPort);
    const history = waveformState?.history || [];
    const sigById = new Map((waveformState?.signals || []).map(s => [s.parentId, s]));
    let replayed = false;
    const replayLines = [];
    if (history.length > 1 && stimInputs.length) {
      // Build TB-port-name → scene-node map for input ports.
      const portToNode = new Map();
      const used = new Set();
      for (const n of (scene?.nodes || [])) {
        if (n.type !== 'INPUT' && n.type !== 'CLOCK') continue;
        const candidate = sanitizeIdent(n.label || n.id);
        // Don't overwrite a previous match; first match by declaration
        // order wins (mirrors fromCircuit's uniqueIdentifier behaviour
        // for unique labels). Collisions silently lose the second;
        // those ports just stay zeroed in the stimulus.
        if (!used.has(candidate)) {
          portToNode.set(candidate, n);
          used.add(candidate);
        }
      }
      const tracked = stimInputs
        .map(p => ({ port: p, node: portToNode.get(p.name) }))
        .filter(x => x.node && sigById.has(x.node.id));
      if (tracked.length) {
        replayed = true;
        // Cap replay length so a long recording doesn't bloat the TB.
        const MAX = 200;
        const steps = Math.min(history.length, MAX);
        replayLines.push(`    // Stimulus replay — captured from the session waveform`);
        replayLines.push(`    // (${history.length} step(s) recorded${steps < history.length ? `, first ${steps} replayed` : ''}).`);
        for (let i = 0; i < steps; i++) {
          const sample = history[i].signals;
          const assigns = [];
          for (const t of tracked) {
            const sig = sigById.get(t.node.id);
            const v = sample.get(sig.id);
            if (v == null) continue;
            const hex = (Number(v) >>> 0).toString(16);
            assigns.push(`${t.port.name} = ${t.port.width}'h${hex};`);
          }
          if (assigns.length) replayLines.push(`    #10 ${assigns.join(' ')}`);
        }
      }
    }

    lines.push(`  initial begin`);
    lines.push(`    $dumpfile("${topName}.vcd");`);
    lines.push(`    $dumpvars(0, ${topName}_tb);`);
    if (replayed) {
      // Initialise everything to 0 first, so any input we couldn't map
      // back to a recorded signal still drives a defined value.
      for (const p of stimInputs) lines.push(`    ${p.name} = ${p.width}'h0;`);
      lines.push(...replayLines);
      lines.push(`    #20 $finish;`);
    } else {
      if (stimInputs.length) {
        lines.push(`    // Initial stimulus — TODO: replace with real test vectors.`);
        for (const p of stimInputs) lines.push(`    ${p.name} = ${p.width}'h0;`);
      }
      if (outputs.length) {
        const fmt = outputs.map(p => p.width > 1 ? `${p.name}=%h` : `${p.name}=%b`).join(' ');
        const args = outputs.map(p => p.name).join(', ');
        lines.push(`    $monitor("[%0t] ${fmt}", $time, ${args});`);
      }
      lines.push(`    #200 $finish;`);
    }
    lines.push(`  end`);
    lines.push(`endmodule`);
    lines.push(``);
    return lines.join('\n');
  }

  let _lastVerilog = '';
  let _lastTop = 'top';
  // File model for the tabbed preview. Each entry: { name, lang, content }.
  // lang ∈ {'verilog','tb','markdown'} drives the highlighter choice.
  // Active file is keyed by name, not index, so it survives top-name
  // changes (which rename every entry simultaneously).
  let _files = [];
  let _activeFileLang = 'verilog';      // sticky across refreshes

  // README body shared between the tab view and the .zip bundle so
  // both render the same prose. Kept here as a function (not a const)
  // because the top name is interpolated.
  function getActiveFile() {
    return _files.find(f => f.lang === _activeFileLang) || _files[0];
  }
  // Render the body for whichever file is active. Verilog and TB go
  // through the syntax highlighter; README is shown as plain text
  // (HTML-escaped) — markdown rendering would require either a heavy
  // dep or a hand-rolled subset, neither earns its keep for a 12-line
  // build/run note.
  function renderActiveBody() {
    const f = getActiveFile();
    if (!f) return;
    if (fnameEl) fnameEl.textContent = f.name;
    if (f.lang === 'markdown') {
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      body.innerHTML = withLineNumbers(esc(f.content));
    } else {
      body.innerHTML = withLineNumbers(highlightVerilog(f.content));
    }
  }
  function renderTabs() {
    if (!tabsEl) return;
    if (!_files.length) { tabsEl.innerHTML = ''; return; }
    if (!_files.find(f => f.lang === _activeFileLang)) _activeFileLang = _files[0].lang;
    tabsEl.innerHTML = _files.map(f =>
      `<div class="vp-tab${f.lang === _activeFileLang ? ' active' : ''}" data-lang="${f.lang}">` +
      `<span class="vp-tab-icon"></span>${f.name}</div>`
    ).join('');
    tabsEl.querySelectorAll('.vp-tab').forEach(el => {
      el.addEventListener('click', () => {
        _activeFileLang = el.dataset.lang;
        renderTabs();          // restyle active marker
        renderActiveBody();
      });
    });
  }

  function makeReadme(top) {
    const replayed = (waveformState?.history?.length || 0) > 1;
    const tbDesc = replayed
      ? 'replays the recorded session waveform'
      : 'skeleton — fill in stimulus';
    return [
      `# ${top} — Verilog export`,
      ``,
      `Auto-generated by Circuit Designer.`,
      ``,
      `## Files`,
      `- \`${top}.v\` — the design under test.`,
      `- \`${top}_tb.v\` — testbench (${tbDesc}).`,
      ``,
      `## Run`,
      `\`\`\``,
      `iverilog -g2005 -o sim ${top}.v ${top}_tb.v`,
      `vvp sim`,
      `gtkwave ${top}.vcd     # optional waveform viewer`,
      `\`\`\``,
    ].join('\n');
  }

  // Render the violations gate. Returns true when export is BLOCKED
  // (violations present AND user has not checked "force anyway").
  const renderViolations = () => {
    if (!violEl) return false;
    let result;
    try { result = evaluatePipeline(scene); }
    catch (_e) { violEl.classList.add('hidden'); return false; }
    const v = result?.violations || [];
    if (v.length === 0) {
      violEl.classList.add('hidden');
      violEl.innerHTML = '';
      return false;
    }
    const items = v.slice(0, 30).map(x =>
      `<li>wire <code>${x.wireId}</code>: <code>${x.srcId}</code> (stage ${x.srcStage}) → <code>${x.dstId}</code> (stage ${x.dstStage}) — needs ${x.missing} pipeline reg(s)</li>`
    ).join('');
    const more = v.length > 30 ? `<li>… ${v.length - 30} more</li>` : '';
    violEl.classList.remove('hidden');
    violEl.innerHTML =
      `<span class="vp-viol-title">⛔ ${v.length} pipeline violation(s) detected — export blocked.</span>` +
      `<ul>${items}${more}</ul>` +
      `<label><input type="checkbox" id="chk-force-violations"${_forceViolations ? ' checked' : ''}> ` +
      `force export anyway (Verilog will be tagged with <code>// WARNING</code> comments)</label>`;
    const chkForce = violEl.querySelector('#chk-force-violations');
    chkForce?.addEventListener('change', () => {
      _forceViolations = !!chkForce.checked;
      refresh();
    });
    // Stash for the export path to attach WARNING comments when forced.
    violEl._violations = v;
    return !_forceViolations;
  };

  // Yield to the browser between phases of work so it can paint the
  // progress overlay. requestAnimationFrame is the right primitive
  // here — paints land on a frame boundary, not a microtask.
  const _yield = () => new Promise(r => requestAnimationFrame(() => r()));
  // Show the progress bar only for designs big enough that the user
  // actually has time to see it. The threshold is intentionally
  // conservative — at <500 nodes the export takes <30 ms and the
  // overlay would just flicker.
  const PROGRESS_THRESHOLD = 500;
  const setProg = (pct, label) => {
    if (!progEl) return;
    if (progFill) progFill.style.width = `${pct}%`;
    if (progLabel && label) progLabel.textContent = label;
  };

  // Re-entrancy guard: if the user types fast in the top-name input,
  // a second refresh shouldn't fight the first. We tag every refresh
  // with a serial number; only the latest is allowed to commit DOM
  // updates after a yield. Stale refreshes drop out silently.
  let _refreshSeq = 0;
  const refresh = async () => {
    const mySeq = ++_refreshSeq;
    const includeHeader = !!chkHeader?.checked;
    const top = sanitizeTop(txtTopName?.value);
    _lastTop = top;
    if (txtTopName && txtTopName.value !== top) txtTopName.value = top;
    if (fnameEl) fnameEl.textContent = `${top}.v`;

    const nodeCount = scene?.nodes?.length || 0;
    const showProg = nodeCount >= PROGRESS_THRESHOLD;
    if (showProg && progEl) {
      progEl.classList.remove('hidden');
      setProg(5, `Analyzing ${nodeCount} components…`);
      await _yield();
      if (mySeq !== _refreshSeq) return;
    }

    const blocked = renderViolations();
    if (showProg) { setProg(20, 'Pipeline analysis complete…'); await _yield();
                    if (mySeq !== _refreshSeq) return; }
    if (blocked) {
      // Don't run the exporter at all — show a placeholder body. Stats
      // and warnings panels are also cleared so they don't show stale
      // numbers from a previous (passing) circuit.
      _lastVerilog = `// Export blocked — fix pipeline violations or check\n// "force export anyway" to override.\n`;
      _files = [{ name: `${top}.v`, lang: 'verilog', content: _lastVerilog }];
      renderTabs();
      renderActiveBody();
      if (warnEl) { warnEl.classList.add('hidden'); warnEl.innerHTML = ''; }
      ['lines','ports','nets','assigns','always','mem'].forEach(k =>
        document.getElementById('vp-stat-'+k).textContent = '—');
      document.getElementById('vp-stat-todo').classList.add('hidden');
      if (showProg && progEl) progEl.classList.add('hidden');
      return;
    }

    if (showProg) { setProg(40, 'Generating Verilog…'); await _yield();
                    if (mySeq !== _refreshSeq) return; }
    _lastVerilog = exportVerilog(scene.serialize(), {
      topName: top,
      header: includeHeader,
    });
    if (showProg) { setProg(80, 'Highlighting…'); await _yield();
                    if (mySeq !== _refreshSeq) return; }
    // Build the file list for the tab view + ZIP bundle. Order matters
    // — left-to-right tabs are: design, testbench, readme.
    _files = [
      { name: `${top}.v`,    lang: 'verilog',  content: _lastVerilog },
      { name: `${top}_tb.v`, lang: 'tb',       content: generateTestbench(_lastVerilog, top) },
      { name: `README.md`,   lang: 'markdown', content: makeReadme(top) },
    ];
    renderTabs();
    // When forced past violations, prepend a WARNING comment block so
    // the exported file itself records what was overridden. Listing
    // wireIds keeps the tag stable across re-exports of the same scene.
    const v = violEl?._violations || [];
    if (_forceViolations && v.length) {
      const banner = [
        '// ============================================================',
        `// WARNING: pipeline violation export forced (${v.length} wire(s)).`,
        '//   The following wires cross stage boundaries without a',
        '//   PIPE_REG. Synthesised behaviour will not match the canvas',
        '//   pipelining analyzer\'s assumptions.',
        ...v.map(x => `//   - ${x.wireId}: ${x.srcId} (s${x.srcStage}) → ${x.dstId} (s${x.dstStage})`),
        '// ============================================================',
        '',
      ].join('\n');
      _lastVerilog = banner + _lastVerilog;
      // Replace the design file content too, so the rendered tab shows
      // the same banner the downloaded .v will carry.
      const vf = _files.find(f => f.lang === 'verilog');
      if (vf) vf.content = _lastVerilog;
    }
    renderActiveBody();
    const s = statsOf(_lastVerilog);
    document.getElementById('vp-stat-lines').textContent   = s.lines;
    document.getElementById('vp-stat-ports').textContent   = s.ports;
    document.getElementById('vp-stat-nets').textContent    = s.nets;
    document.getElementById('vp-stat-assigns').textContent = s.assigns;
    document.getElementById('vp-stat-always').textContent  = s.alwBlks;
    document.getElementById('vp-stat-mem').textContent     = s.mem;
    const todoEl = document.getElementById('vp-stat-todo');
    if (s.todos > 0) {
      todoEl.classList.remove('hidden');
      todoEl.querySelector('b').textContent = s.todos;
    } else {
      todoEl.classList.add('hidden');
    }
    // Error surface — list every unmapped component the exporter
    // flagged with a `// TODO: translator for X (id) ...` line. Each
    // entry shows the component type, its node id, and the line
    // number in the preview, so the user can locate it instantly.
    if (warnEl) {
      const todoLines = [];
      _lastVerilog.split('\n').forEach((line, i) => {
        const m = line.match(/\/\/\s*TODO:\s*translator for (\S+)\s+\((\S+)\)/);
        if (m) todoLines.push({ type: m[1], id: m[2], line: i + 1 });
      });
      if (todoLines.length === 0) {
        warnEl.classList.add('hidden');
        warnEl.innerHTML = '';
      } else {
        warnEl.classList.remove('hidden');
        const items = todoLines.map(t =>
          `<li><code>${t.type}</code> (id <code>${t.id}</code>) — line ${t.line}</li>`
        ).join('');
        warnEl.innerHTML =
          `<span class="vp-warn-title">⚠ ${todoLines.length} component(s) lack a translator:</span>` +
          `<ul>${items}</ul>`;
      }
    }
    // Hide progress when this is still the live refresh — a stale one
    // shouldn't flash the bar after the latest already cleared it.
    if (mySeq === _refreshSeq && progEl && !progEl.classList.contains('hidden')) {
      setProg(100, 'Done.');
      setTimeout(() => {
        if (mySeq === _refreshSeq) progEl.classList.add('hidden');
      }, 150);
    }
  };

  const openPreview = () => {
    _forceViolations = false;   // re-arm the gate every time the modal opens
    refresh();
    overlay.classList.remove('hidden');
  };
  const closePreview = () => overlay.classList.add('hidden');

  btnOpen.addEventListener('click', openPreview);
  btnClose?.addEventListener('click', closePreview);
  chkHeader?.addEventListener('change', refresh);
  // Live update on top-name edit. Don't sanitize on every keystroke —
  // wait for blur — so the user can finish typing without the cursor
  // jumping. But still refresh the preview so they see the effect.
  txtTopName?.addEventListener('input', () => {
    // Re-run the full refresh path so all three tabs (and the file
    // names baked into the README) get re-generated atomically.
    refresh();
  });
  txtTopName?.addEventListener('blur', () => {
    txtTopName.value = sanitizeTop(txtTopName.value);
  });

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closePreview();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closePreview();
  });

  btnCopy?.addEventListener('click', () => {
    const f = getActiveFile();
    if (!f) return;
    navigator.clipboard?.writeText(f.content).then(() => {
      const orig = btnCopy.textContent;
      btnCopy.textContent = 'COPIED ✓';
      setTimeout(() => { btnCopy.textContent = orig; }, 1200);
    });
  });

  btnDownload?.addEventListener('click', () => {
    const f = getActiveFile();
    if (!f) return;
    const blob = new Blob([f.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Minimal store-mode (no compression) ZIP writer. Builds a valid
  // PKZip archive byte-by-byte: per file a Local File Header + raw
  // bytes, then a Central Directory at the end. CRC-32 is required
  // by the format. Compression is intentionally skipped (method=0)
  // to avoid pulling in a deflate library — text payloads are tiny.
  function makeZip(files) {
    const enc = new TextEncoder();
    const crcTable = (() => {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
      }
      return t;
    })();
    const crc32 = (bytes) => {
      let c = 0xffffffff;
      for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
    const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
    const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

    const local = []; const central = []; let offset = 0;
    for (const { name, content } of files) {
      const data = typeof content === 'string' ? enc.encode(content) : content;
      const nameBytes = enc.encode(name);
      const crc = crc32(data);
      const size = data.length;
      // Local file header (signature 0x04034b50)
      const lfh = [
        ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0),                           // mod time/date — unused
        ...u32(crc), ...u32(size), ...u32(size),        // crc + comp + uncomp size
        ...u16(nameBytes.length), ...u16(0),
        ...nameBytes,
      ];
      local.push(...lfh, ...data);
      // Central directory entry (signature 0x02014b50)
      const cdh = [
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0),
        ...u32(crc), ...u32(size), ...u32(size),
        ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(offset),
        ...nameBytes,
      ];
      central.push(...cdh);
      offset += lfh.length + data.length;
    }
    // End of central directory (signature 0x06054b50)
    const cdSize = central.length;
    const eocd = [
      ...u32(0x06054b50), ...u16(0), ...u16(0),
      ...u16(files.length), ...u16(files.length),
      ...u32(cdSize), ...u32(offset),
      ...u16(0),
    ];
    return new Uint8Array([...local, ...central, ...eocd]);
  }

  btnZip?.addEventListener('click', () => {
    // The tab view already built every file; reuse the same content
    // so the zip and the on-screen preview can never drift.
    const zip = makeZip(_files.map(f => ({ name: f.name, content: f.content })));
    const blob = new Blob([zip], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${_lastTop}_project.zip`;
    a.click();
    URL.revokeObjectURL(url);
  });

  btnTB?.addEventListener('click', () => {
    const tb = generateTestbench(_lastVerilog, _lastTop);
    const blob = new Blob([tb], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${_lastTop}_tb.v`;
    a.click();
    URL.revokeObjectURL(url);
  });
})();

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
  const propMap = new Map((proposal.nodePropEdits || []).map(e => [e.nodeId, e]));
  const afterSnap = {
    nodes: scene.nodes.map(n => {
      let next = { ...n };
      const pos = posMap.get(n.id);
      if (pos) { next.x = pos.newX; next.y = pos.newY; }
      const props = propMap.get(n.id);
      if (props) Object.assign(next, props.props);
      return next;
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

  // Update visibility based on opcode format. 'br' = BEQ/BNE (Rs1, Rs2, addr).
  opSel.onchange = () => {
    const fmt = getOpcodeFormat(opSel.value);
    const isBr = fmt === 'br';
    rdSel.style.display  = (fmt >= 2 || isBr) ? '' : 'none';
    rs1Sel.style.display = (fmt >= 2 || isBr) ? '' : 'none';
    rs2Sel.style.display = (fmt >= 3 || isBr) ? '' : 'none';
    if (fmt === 1 || isBr) {
      rdSel.style.display = '';
      rdSel.innerHTML = '';
      for (let i = 0; i < 16; i++) rdSel.innerHTML += `<option value="${i}">${i}</option>`;
    } else {
      rdSel.innerHTML = '';
      for (let r = 0; r < 16; r++) rdSel.innerHTML += `<option value="R${r}">R${r}</option>`;
    }
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
  } else if (fmt === 'br') {
    line += ' ' + document.getElementById('rom-builder-rs1').value + ', ' + document.getElementById('rom-builder-rs2').value + ', ' + document.getElementById('rom-builder-rd').value;
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
  { name: 'BEQ',   aluOp: 7, regWe: 0, memWe: 0, memRe: 0, jmp: -1, halt: 0 }, // atomic: aluOp=7 → CMP runs in same cycle as the conditional jump
  { name: 'BNE',   aluOp: 7, regWe: 0, memWe: 0, memRe: 0, jmp: -3, halt: 0 }, // atomic: aluOp=7 → CMP runs in same cycle as the conditional jump
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
  // Sync branch-predictor dropdown to the CU node's stored value.
  const bpSel = document.getElementById('cu-branch-pred-select');
  if (bpSel) bpSel.value = node.branchPredictor || 'static-nt';
  _renderCuTable();
  cuOverlay?.classList.remove('hidden');
}

// Branch predictor — read directly from the dropdown on SAVE (no buffering).

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
  const bpSel = document.getElementById('cu-branch-pred-select');
  const newPredictor = bpSel?.value || 'static-nt';
  const props = {
    controlTable:    JSON.parse(JSON.stringify(_cuEditorTable)),
    branchPredictor: newPredictor,
  };
  commands.execute(new SetNodePropsCommand(scene, _cuEditorNode.id, props));
  // Belt & braces — nudge the analyzer so the panel definitely re-renders
  // even if the EventBus listeners somehow get out of order on this tick.
  pipelineAnalyzer.invalidate();
  pipelineAnalyzer.analyze({ force: true });
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
  // ── Beginner tab — 5 demos, numbered 1 → 5, progressing from pure I/O
  // to combinational to clocked sequential logic.
  {
    id: 'seven-seg-demo',
    title: '1. Logic & 7-Segment Display',
    desc: 'Seven toggle inputs (labelled a–g) wired directly to the 7 segment pins of a DISPLAY_7SEG. Flip individual inputs to light specific segments — all 1s displays an "8". Introduces INPUT nodes, OUTPUT-style display components, and the simplest possible combinational wiring.',
    tags: ['beginner', 'I/O', '7-Segment', 'Input'],
    file: 'examples/circuits/seven-seg-demo.json',
  },
  {
    id: '4bit-counter',
    title: '2. 4-Bit Counter',
    desc: 'A 4-bit COUNTER driven by a CLOCK. Press Play to watch it count 0 → 15 and wrap. Toggle EN to pause. Demonstrates the simplest synchronous building block — edge-triggered state advancing once per rising clock edge.',
    tags: ['beginner', 'Counter', 'CLK'],
    file: 'examples/circuits/4bit-counter.json',
  },
  {
    id: 'register-load',
    title: '3. Register Load / Read',
    desc: 'An 8-bit REGISTER: capture DATA on rising CLK when EN is high. Shows the fundamental difference between combinational inputs (re-sampled each tick) and stored state (latched on edge). Toggle EN to enable/disable loading.',
    tags: ['beginner', 'Register', 'CLK', 'EN'],
    file: 'examples/circuits/register-load.json',
  },
  {
    id: 'ff-compared',
    title: '4. Flip-Flops Compared (D / T / SR / JK)',
    desc: 'All four canonical flip-flop types (D, T, SR, JK) instantiated as FF_SLOT nodes sharing one CLOCK, each with its own data inputs and Q output. Press Play and toggle the data inputs to see the characteristic behaviour of each: D copies, T toggles, SR sets/resets, JK toggles on (1,1). Canonical teaching demo.',
    tags: ['beginner', 'Flip-Flop', 'FF_SLOT', 'CLK'],
    file: 'examples/circuits/ff-compared.json',
  },
  {
    id: 'alu-calculator',
    title: '5. ALU Calculator',
    desc: 'An 8-bit ALU performing ADD on two IMM (immediate) values. Double-click an IMM node to change its value; change the ALU operation to see SUB / AND / OR / XOR / SHL / SHR / CMP. Introduces multi-bit bus wires (thick golden lines with hex labels).',
    tags: ['beginner', 'ALU', 'IMM', 'Bus'],
    file: 'examples/circuits/alu-calculator.json',
  },
  // ── Intermediate tab — 2 demos covering the two main memory primitives.
  {
    id: 'ram-readwrite',
    title: '1. RAM — Read / Write',
    desc: 'An 8×4 RAM with separate WE (write) and RE (read) strobes and an async-read datapath. Set ADDR and DATA, pulse WE to store, change ADDR, assert RE to read back. Double-click the RAM to inspect its contents in the Memory Inspector.',
    tags: ['intermediate', 'RAM', 'Memory', 'Inspector'],
    file: 'examples/circuits/ram-readwrite.json',
  },
  {
    id: 'fifo-pipeline',
    title: '2. FIFO Queue',
    desc: 'A 4-deep FIFO buffer with WR / RD strobes and FULL / EMPTY flags. Push values by toggling WR, pop them by toggling RD — the queue preserves first-in first-out order. Watch FULL assert when the buffer fills and EMPTY when it drains.',
    tags: ['intermediate', 'FIFO', 'Memory', 'Queue'],
    file: 'examples/circuits/fifo-pipeline.json',
  },
  // ── Advanced tab — 2 full CPU demos, single-cycle, running ROM programs.
  {
    id: 'simple-cpu',
    title: '1. Simple CPU — Countdown',
    desc: 'A complete single-cycle CPU (PC + ROM + IR + CU + ALU + REG_FILE) running a 4-instruction program: counts R1 down from 10 to 0 via SUB R1,R1,R2 and halts. Demonstrates the full fetch → decode → execute → write-back feedback loop with live register values.',
    tags: ['advanced', 'CPU', 'PC', 'ROM', 'IR', 'CU', 'ALU', 'RF'],
    file: 'examples/circuits/simple-cpu.json',
  },
  // ── Pipeline tab — curated set of 6 demos, each covering several features.
  // Additional pipeline scenes exist on disk under examples/circuits/ (used
  // by the test suite) but are intentionally omitted from the menu to keep
  // it focused. Keep cards in numeric title order (1 → 6).
  {
    id: 'pipeline-demo-retime',
    title: '1. Pipelined 3-bit Adder — stages, balance & retime',
    desc: 'A real 3-bit ripple-carry adder pipelined into 3 stages, INTENTIONALLY imbalanced: stage 0 = FA0 (150 ps), stage 1 = FA1 → FA2 chained via the carry (300 ps — bottleneck), stage 2 = pure PIPE2 routing (~0 ps). Balance ≈ 33%. Click RETIME in the PIP panel header — the analyzer suggests pulling PIPE2 backward across FA2: the 4-channel pipe absorbs FA2\'s 3 inputs + 2 passthroughs (becoming a 5-channel pipe), splitting the carry chain so every stage holds one FA = 150 ps, Balance 100%, f_max raised by 2×. Inputs A=(A2,A1,A0) and B=(B2,B1,B0) step through 6 operand pairs (0+0, 1+1, 3+2, 7+1, 5+3, 4+4); with the 2-cycle pipeline latency, sums land at the OUTPUTs starting cycle 3 with II=1 throughput. Shortcuts: P to open the panel, Ctrl+Shift+R to retime.',
    tags: ['pipeline', 'stages', 'balance', 'retime', 'adder', 'datapath', 'f_max'],
    file: 'examples/circuits/pipeline-demo-adder.json',
  },
  {
    id: 'mips-5stage-forwarding-demo',
    title: '2. MIPS 5-Stage — Hazards, Forwarding & Gantt ⭐',
    desc: 'Showcase for every ISA-level analysis layer. Classical 5-stage MIPS datapath with EX→EX forwarding MUXes and a 6-instruction program. The PIPE panel reports: PROGRAM HAZARDS (RAW / load-use) with 3 of 4 RAWs marked ✓ resolved by forwarding; FORWARDING PATHS + coverage (EX→EX ✓ · MEM→EX ✗ · WB→EX ✗); PERFORMANCE (CPI, IPC, throughput, forwarding speedup); and the PIPELINE DIAGRAM (instruction × cycle Gantt with colour-coded IF/ID/EX/MEM/WB cells, ** for load-use stalls, ✗ for flushed IF slots).',
    tags: ['pipeline', 'mips', 'forwarding', 'program', 'diagram', 'performance', 'RAW', 'load-use', '5-stage'],
    file: 'examples/circuits/mips-5stage-forwarding-demo.json',
  },
  {
    id: 'pipeline-demo-elastic',
    title: '3. Elastic Pipeline — valid/ready + LIP',
    desc: 'Two-stage pipeline with HANDSHAKE components wiring valid/ready into each PIPE_REG STALL pin. The 7-cycle stepped script walks through every elastic situation: c1-2 normal flow (V=1, R=1), c3-4 upstream BUBBLE (V=0 \u2014 no data offered), c5 downstream STALL (R=0 \u2014 sink full), c6-7 back to flow. The FIRED output (= V AND R) lights only on cycles where a real transfer happens \u2014 gaps in its waveform mark every bubble and stall. The PIPE panel flags both stages as elastic (yellow E badge), shows S (stall) status live, and runs the LIP checker.',
    tags: ['pipeline', 'elastic', 'HANDSHAKE', 'LIP', 'stall', 'back-pressure'],
    file: 'examples/circuits/pipeline-demo-elastic.json',
  },
  {
    id: 'pipeline-demo-cdc',
    title: '4. Multi-Clock + CDC',
    desc: 'Two CLOCK sources (clkA, clkB) and a toggling data input. The same value crosses to clkB via two paths: BAD = single flop on clkB (rcvB), GOOD = 2-flop synchronizer (sync1 → sync2). The DIFFER output (= Q_bad XOR Q_ok) lights every cycle the two paths disagree — visual proof that the unsynced path drifts off the synchronized one. The CDC CROSSINGS section also reports both crossings with sync-depth badges. NOTE: this is a logical simulator and does not model true metastability — what you see is the structural NEED for the 2-flop synchronizer (eliminating cross-domain skew), not the physical metastability event.',
    tags: ['pipeline', 'cdc', 'clock-domain', 'synchronizer', 'multi-clock'],
    file: 'examples/circuits/pipeline-demo-cdc.json',
  },
  {
    id: 'mips-5stage-complete',
    title: '5. MIPS 5-Stage — HDU + FWD Complete Pipeline ⭐',
    desc: 'Full textbook 5-stage MIPS pipeline that wires HDU and FWD as discrete components driving real control. Three PIPE_REGs (ID/EX, EX/MEM, MEM/WB) carry data and control between stages. HDU detects load-use and asserts PCWrite=0, IFIDWrite=0, Bubble=1 — freezing PC + IR and flushing ID/EX. FWD outputs are bit-split and drive 4:1 forwarding MUXes before each ALU input, with EX/MEM priority over MEM/WB. The 4-instruction program: c1 LW R5; c2 stall (HDU fires); c3 ADD R6,R5,R3 with MEM/WB forward of R5; c5 ADD R6,R8,R8 (re-write R6); c6 SUB R7,R6,R5 with EX/MEM forward of R6.',
    tags: ['pipeline', 'mips', '5-stage', 'HDU', 'FWD', 'load-use', 'forwarding'],
    file: 'examples/circuits/mips-5stage-complete.json',
  },
  {
    id: 'mips-5stage-cache-hierarchy',
    title: '6. MIPS 5-Stage + L1/L2 Cache Hierarchy + Write-Back ⭐',
    desc: 'Full 5-stage MIPS pipeline (HDU + FWD + IF/ID flush) with the DMEM path replaced by a cache hierarchy: pipe_exmem → L1 (4 lines, direct, write-through) → L2 (8 lines, fully-associative, write-back) → RAM. The 36-instruction program runs three STORE+LOAD pairs to addresses 7, 3, and 11 — chosen so all three map to the SAME L1 line (since 7&3 = 3&3 = 11&3 = 3). Each fresh STORE conflicts with the previous one and evicts it from L1; the LOAD that follows each STORE always hits in L1. Final registers: R3=99 (mem[7]), R6=50 (mem[3]), R9=25 (mem[11]). Open the Pipeline panel CACHE (LIVE) to watch L1 thrash (3 conflict misses) and L2 absorb every store as a dirty line — RAM stays empty because the write-back L2 has not yet evicted anything. The L1_HIT/L1_MISS/L2_HIT/L2_MISS LEDs show every cycle live.',
    tags: ['pipeline', 'mips', '5-stage', 'cache', 'L1', 'L2', 'write-back', 'hierarchy'],
    file: 'examples/circuits/mips-5stage-cache-hierarchy.json',
  },
  // ── Branch Predictor tab — phased demos for the predictor visualizer.
  // Phase 1 (read-only state): observe a predictor's evolving FSM/state
  // table over a synthesized outcome trace. Schedule unchanged from Pipeline
  // tab equivalents; switch predictors in the dropdown to see the table react.
  {
    id: 'branch-predictor-01-loop',
    title: '1. Predictor State — Backward Loop (Phase 1)',
    desc: 'Demo for the BRANCH PREDICTOR section in the PIP panel. The program has one backward BEQ at 0x03 → 0x00; the loop body unrolls 6 iterations (5 × taken + 1 × not-taken). Open the PIP panel, scroll to BRANCH PREDICTOR, and switch between Static-NT / Static-BTFN / 1-bit / 2-bit. Watch the State column converge for 2-bit (Strongly T) and the per-row hit/miss badges (✓/✗) flip as you switch. Phase 1 focus is the read-only state table.',
    tags: ['predictor', 'branch', 'loop', '2-bit', 'state-table'],
    file: 'examples/circuits/branch-predictor-01-loop.json',
  },
  {
    id: 'branch-predictor-02-loop6',
    title: '2. Loop Unroll & Mispredict Flush (Phase 2)',
    desc: 'Same loop circuit, but now the Gantt itself is driven by the chosen predictor. The loop body unrolls into 6 separate iteration rows (badge "#N/6"). Each back-edge BEQ shows ✓ (HIT) or ✗ (MISS) — on a MISS, two FLUSH cells appear in hot pink-red ("MISPRED" tooltip). Switch predictors in the dropdown: Static-NT mispredicts every taken iter (5 misses); 2-bit converges after one bad guess and only mispredicts at the loop exit (2 misses total). Cycle count drops visibly with a smarter predictor.',
    tags: ['predictor', 'branch', 'loop', 'mispredict', 'unroll', 'gantt'],
    file: 'examples/circuits/branch-predictor-02-loop6.json',
  },
  {
    id: 'branch-predictor-03-compare',
    title: '3. Compare All Predictors — Cycles & Hit Rate (Phase 3)',
    desc: 'Open the PIP panel and click the COMPARE button in the BRANCH PREDICTOR section to score all four predictors against the current program in one shot. Results are sorted by cycles ascending; the winner is marked 🏆. On this 5×6 loop, Static-BTFN ties or beats the dynamic predictors because every branch is backward-taken — exactly the case BTFN was designed for. The Δ column shows cycles saved versus the Static-Not-Taken baseline. PERFORMANCE panel also gains "Predictor / Branches / Flush penalty" lines that update with the selected predictor.',
    tags: ['predictor', 'compare', 'metrics', 'cpi', 'hit-rate'],
    file: 'examples/circuits/branch-predictor-03-compare.json',
  },
  {
    id: 'cpu-detailed',
    title: '2. Harvard CPU — Full 14-op Datapath ⭐',
    desc: '8-bit Harvard single-cycle CPU with separate instruction / data memories (IMEM 256×16, DMEM 256×8), a 14-opcode Control Unit, an 8×8 Register File, 6→8 sign-extend, ALU-B MUX, 3-way write-back MUX (ALU / DMEM / SLTI), and a halt-gated cycle counter. Pre-loaded with a 20-instruction program (init + loop with SW + post-loop LW / ADD / SUB / SW). The most complete single-cycle CPU shipped with the tool.',
    tags: ['advanced', 'CPU', 'Harvard', 'SLTI', 'Loop', 'Store', 'Load'],
    file: 'examples/circuits/cpu-detailed.json',
  },
  {
    id: 'cache-3c-miss-types',
    title: '1. Cache — mapping comparison + 3C miss breakdown',
    desc: 'Four caches sharing one trace, organized to expose every mapping strategy AND the Hill (1989) 3C miss taxonomy in a single view: 4-line direct-mapped, 4-line 2-way set-associative, 4-line fully-associative, and 8-line fully-associative. The trace begins with a 0,4 thrash (where 2-way crushes direct because both fit into set 0), then expands to a 5-address working set (0,4,8,12,16) that overflows the 4-line caches. Open the Pipeline panel CACHE (LIVE) to watch each cache\'s hit rate AND its 3C breakdown: direct → mostly CONFLICT, 2-way → conflict drops once the working set fits its sets, fully-4 → bottlenecked by CAPACITY, fully-8 → only the unavoidable COMPULSORY cold-start misses.',
    tags: ['cache', 'CACHE', 'mapping', 'set-associative', 'fully-associative', '3C', 'compulsory', 'capacity', 'conflict'],
    file: 'examples/circuits/cache-3c-miss-types.json',
  },
  {
    id: 'cache-l1-l2-hierarchy',
    title: '2. Cache — L1 + L2 hierarchy (two-level memory)',
    desc: 'Two CACHE components nested in series: a small fast L1 (4 lines, direct-mapped) and a larger L2 (16 lines, fully-associative) sitting between L1 and RAM. Trace cycles 6 distinct addresses repeatedly. L1 thrashes (every access is a miss in 4 lines), but L2 absorbs the working set after the first 6 compulsory misses, so RAM is barely touched. Open the Pipeline panel CACHE (LIVE) to compare the L1 vs L2 hit rates side by side.',
    tags: ['cache', 'advanced', 'CACHE', 'hierarchy', 'L1', 'L2'],
    file: 'examples/circuits/cache-l1-l2-hierarchy.json',
  },
  {
    id: 'cache-write-back-vs-through',
    title: '3. Cache — write-back vs write-through',
    desc: 'Two caches sharing the same write-heavy trace: WT (write-through) and WB (write-back). The trace writes 8 different values to address 0 in succession. With write-through, every CPU write also drives MEM_WE so RAM stays in sync each cycle. With write-back, the writes stay in the cache (line marked Dirty in Memory Inspector); RAM is only updated when a future eviction needs to spill the dirty line. Watch the WT_MEM_WE / WB_MEM_WE LEDs on the canvas — WT pulses every cycle, WB stays low.',
    tags: ['cache', 'advanced', 'CACHE', 'write-back', 'write-through', 'dirty'],
    file: 'examples/circuits/cache-write-back-vs-through.json',
  },
  // ── Test & DFT tab — one demo per layer of the DFT track.
  {
    id: 'dft-faults-tour',
    title: '1. DFT — wire fault models tour',
    desc: 'Side-by-side tour of all four wire-level fault models. Five parallel paths, each INPUT → BUF → OUTPUT, every path demonstrating one fault in isolation:\n  • A=1 → s-a-0 (orange) → OUT shows 0  (the wire is "stuck at 0")\n  • B=0 → s-a-1 (orange) → OUT shows 1  (stuck at 1)\n  • C=1 → open (red dashed) → OUT shows null  (broken / floating)\n  • D=0 ⟷ E=1 bridged (purple dotted link) → OUT_D shows 1  (wired-OR of both sources)\n  • E=1 → reference path → OUT shows 1\n\nOpen the DFT panel (T) to see the FAULT LIST: each wire enumerated, columns for s-a-0 / s-a-1 / open / bridge, the four injected sites highlighted with coloured pills, the rest dim. The "Injected" line in TESTABILITY OVERVIEW breaks them down by type. Select any orange/red/purple wire and toggle its fault off in the wire-properties panel — propagation resumes.',
    tags: ['dft', 'stuck-at', 'open', 'bridge', 'fault'],
    file: 'examples/circuits/dft-faults-tour.json',
  },
  {
    id: 'dft-fault-coverage',
    title: '2. DFT — fault coverage simulation',
    desc: '3-input AND-OR network: Y = (A & B) | C. Five wires × 2 stuck-at + 5 open = 15 fault candidates total. The demo ships 4 carefully-chosen test vectors (000, 110, 001, 100). Open the DFT panel (T), click RUN FAULT SIM in the header, and watch the FAULT COVERAGE bar fill — each per-wire row in the FAULT LIST gains a "detected by" annotation showing which vectors caught each fault. Some faults will read "UND" (undetected) — those are the gaps a real ATPG tool would close with extra targeted vectors.',
    tags: ['dft', 'fault-coverage', 'fault-sim'],
    file: 'examples/circuits/dft-fault-coverage.json',
  },
  {
    id: 'dft-random-vs-targeted',
    title: '2.5 DFT — random vs targeted (3-bit equality comparator)',
    desc: 'Larger combinational scene: 3-bit equality comparator (EQ = A == B) with 6 INPUTs, 3 XNORs, 2 ANDs, 11 wires → 33 fault candidates over a 64-pattern input space. Ships 10 hand-crafted vectors achieving 100% coverage (green bar). Click GEN RANDOM (purple) to replace them with 16 random vectors — coverage typically lands in the 79-97% range and BOUNCES between runs (random testing is non-deterministic; ATPG isn\'t). Click GEN RANDOM five times in a row and watch the bar move. That variability is exactly why production DFT uses ATPG (TetraMAX, Modus) for crafted, deterministic vectors. Hover the [random] / [compaction?] tags in the coverage row for the production-flow context.',
    tags: ['dft', 'random', 'atpg', 'compaction', 'comparator'],
    file: 'examples/circuits/dft-random-vs-targeted.json',
  },
  {
    id: 'dft-scan-chain-3',
    title: '3. DFT — scan chain (3 SCAN-FFs)',
    desc: 'Three SCAN-FFs chained for scan-based testing. Each has D, TI (test input), TE (test enable), CLK. With TE=0, each behaves like a normal D flip-flop fed from its own D input. With TE=1, each loads from TI = the previous SCAN-FF\'s Q — so a value injected at SCAN_IN shifts through the chain on every clock edge and emerges at SCAN_OUT after 3 cycles. Open the DFT panel (T) to see the SCAN CHAINS section auto-detect the chain: ff_a → ff_b → ff_c. Toggle TE in the input panel and step the clock to watch the shift in action.',
    tags: ['dft', 'scan', 'scan-ff', 'sequential'],
    file: 'examples/circuits/dft-scan-chain-3.json',
  },
  {
    id: 'dft-jtag-boundary-scan',
    title: '8. DFT — JTAG TAP + boundary-scan ring',
    desc: 'IEEE 1149.1 in action. A JTAG_TAP runs the 16-state Test-Logic FSM driven by TMS on posedge TCK; toggle TMS in the input panel and STEP to walk it (5×TMS=1 always lands you in Test-Logic-Reset). Four BOUNDARY_SCAN_CELLs form a scan ring around four "core" inputs core0..core3 — SI of each cell chains to SO of the previous one, so a value driven into the ring shifts cell-to-cell on every clock when SHIFT=1. With MODE=0 each pad output po_i passes core_i through transparently; MODE=1 swaps to the latched test bit captured during the last update. The DFT panel\'s JTAG TAPS section shows the TAP state name (Test-Logic-Reset, Shift-DR, Update-IR, …), live IR + DR, and the IDCODE. Open the side panel to edit IR width / IDCODE inline.',
    tags: ['dft', 'jtag', 'boundary-scan', 'fsm', 'verilog'],
    file: 'examples/circuits/dft-jtag-boundary-scan.json',
  },
  {
    id: 'dft-bist-integration',
    title: '7. DFT — BIST integration (LFSR + DUT + MISR + BIST_CTRL)',
    desc: 'End-to-end Built-In Self-Test loop. A BIST_CONTROLLER orchestrates an 8-cycle test run: it monitors START, walks IDLE → SETUP → RUN → COMPARE → DONE/FAIL, and drives TEST_MODE high during the active phases. An LFSR generates a serial pattern bit per cycle; four XOR gates mix it with manual inputs d0..d3 to form the DUT response; a 4-bit MISR compacts those responses into a signature that feeds the BIST controller as SIG_IN. To run: open the DFT panel and scroll to BIST CONTROLLERS, hit RUN, and pulse START — watch state advance and the cycle counter tick up to 8. The default goldenSig=0 will trigger FAIL (red pill) — click ✎ to capture the live MISR signature, RESET, START again, observe DONE-PASS (green).',
    tags: ['dft', 'bist', 'lfsr', 'misr', 'integration', 'fsm', 'verilog'],
    file: 'examples/circuits/dft-bist-integration.json',
  },
  {
    id: 'dft-misr-signature',
    title: '6. DFT — MISR zoo (5 cases, widths 4 → 32)',
    desc: 'Five MISRs in one canvas, covering every state of the SIGNATURE COMPACTORS panel and every interesting width. MISR_match (4-bit, all pins to GND, golden=0x0) → permanent green "match". MISR_mismatch (4-bit, same wiring, golden=0xF) → permanent red "mismatch". MISR_unconfig (4-bit, manual D0..D3, no golden) → amber "no golden" for live experimentation. MISR_wide (8-bit, manual wd0..wd7) → aliasing 1/256 instead of 1/16. MISR_xl (32-bit, taps [31,21,1,0] = CRC-32 reciprocal polynomial, 32 manual inputs xd0..xd31) → production-grade scale, aliasing ≈ 1 in 4 billion. All five share one CLOCK; STEP advances every signature together. Switch the DISPLAY pill to HEX or DEC for easier reading of MISR_xl.',
    tags: ['dft', 'misr', 'bist', 'signature'],
    file: 'examples/circuits/dft-misr-signature.json',
  },
  {
    id: 'dft-complex-showcase',
    title: '5. DFT — complex showcase (5 chains, 2 clocks, 17 component types)',
    desc: 'Stress test for the SCAN CHAINS section. Five chains in one canvas, each in a different state of health: chain_0 healthy on CLK_FAST, chain_1 healthy on CLK_SLOW with a second TE source (TE_BIST), chain_2 with split TE (each cell has its own driver — visible as a dashed amber bar), chain_3 with floating scan-out (response unobservable — red dashed pad), chain_4 a single SCAN_FF orphan with nothing wired. Around the scan logic sits a dense datapath — ALU, COUNTER, LFSR, ROM, RAM, REGISTER, COMPARATOR, MUX_2, FULL_ADDER, DECODER, ENCODER, FF_SLOT, four GATE_SLOT flavours (AND/OR/XOR/NOT) plus the two CLOCKs and the I/O pads — to make the canvas read like a real subsystem rather than a scan island.',
    tags: ['dft', 'scan', 'scan-ff', 'showcase', 'complex'],
    file: 'examples/circuits/dft-complex-showcase.json',
  },
  {
    id: 'dft-lfsr-prng',
    title: '4. DFT — LFSR zoo (4 widths, 4 polynomial qualities)',
    desc: 'Four LFSRs that cover every status the DFT panel\'s PATTERN GENERATORS section knows how to render. LFSR_3 (3-bit, taps [2,0]) — primitive but Q is wired to nothing → amber "unused". LFSR_4 (4-bit, taps [3,0]) — primitive AND drives a SCAN_FF\'s TI → green "BIST source". LFSR_6 (6-bit, taps [5,3]) — non-primitive polynomial, period 14 of 63 → amber "sub-max". LFSR_8 (8-bit, taps [7,5,4,3], CRC-8 lineage) — primitive, period 255, drives a scan-in → green "BIST source". Open the DFT panel, scroll to PATTERN GENERATORS, and click the ✎ next to any field to edit. Try changing LFSR_6\'s taps to [5,4] and watch the period jump from 14 to 63 — that\'s why primitive-polynomial tables exist.',
    tags: ['dft', 'lfsr', 'prng', 'bist', 'polynomial'],
    file: 'examples/circuits/dft-lfsr-prng.json',
  },
  // ── VERILOG tab — one demo per HDL phase (Phase 3+ each ship one). ──
  {
    id: 'verilog-phase2-empty-module',
    title: '2. VERILOG — empty module skeleton',
    desc: 'Phase-2 retroactive seed for the VERILOG tab. Loads an empty scene; click VERILOG in the bottom toolbar to download circuit.v. The export pipeline (validate → fromCircuit → toVerilog) produces a clean empty `module top();` — the foundation that Phases 3+ extend with combinational, sequential, memory, and CPU translators.',
    tags: ['verilog', 'phase2', 'skeleton'],
    file: 'examples/circuits/verilog-phase2-empty-module.json',
  },
  {
    id: 'verilog-phase3a-gates',
    title: '3a. VERILOG — logic-gate menagerie',
    desc: 'Phase-3a demo: every Verilog logic primitive in one scene. Two shared inputs (a, b) feed eight separate gates — AND, OR, XOR, NAND, NOR, XNOR, NOT, BUF — plus a 1-bit COMPARATOR. Click VERILOG to see every gate emerge as a real Verilog primitive (`and g_and(...);`, `or g_or(...);`, with positional ports), plus three `assign` lines from the comparator (==, >, <). NOT and BUF emit the unary form (two args, no second input).',
    tags: ['verilog', 'phase3', 'phase3a', 'gates'],
    file: 'examples/circuits/verilog-phase3a-gates.json',
  },
  {
    id: 'verilog-phase3b-adder',
    title: '3b. VERILOG — 4-bit ripple-carry adder',
    desc: 'Phase-3b demo: a 4-bit ripple-carry adder built out of one HALF_ADDER (LSB) and three FULL_ADDERs chained through their carry pins. Click VERILOG in the bottom toolbar — every gate-level component lowers to continuous assignments: `a ^ b` for sums, `(a & b) | (b & cin) | (a & cin)` for the carry-out chain. Exercises the arithmetic translators end-to-end with multi-output components (carry chain pulls `sourceOutputIndex: 1` from each adder).',
    tags: ['verilog', 'phase3', 'phase3b', 'arithmetic', 'adder'],
    file: 'examples/circuits/verilog-phase3b-adder.json',
  },
  {
    id: 'verilog-phase3c-mux',
    title: '3c. VERILOG — multiplexers (2:1 and 4:1)',
    desc: 'Phase-3c demo: two MUXes side by side. The 2:1 form lowers to a clean ternary `assign y = sel ? d1 : d0;`; the 4:1 form builds a 2-bit select via concat (`{s1, s0}`) and a nested-ternary chain. Both are synthesisable and parse cleanly with iverilog. Wider muxes follow the same pattern; a follow-up substep adds `case`-based emission via IRAlways for designs that prefer it.',
    tags: ['verilog', 'phase3', 'phase3c', 'mux'],
    file: 'examples/circuits/verilog-phase3c-mux.json',
  },
  {
    id: 'verilog-phase3d-demux-dec-enc',
    title: '3d. VERILOG — demux, decoder, encoder',
    desc: 'Phase-3d demo: DEMUX, DECODER, and ENCODER side by side. Each is pure continuous-assignment form: DEMUX routes the data input to one of N outputs via `(sel == k) ? data : 0`; DECODER produces a one-hot vector via `(addr == k)`; ENCODER (priority) is a nested-ternary chain where the highest active input wins. No `always` blocks, no procedural code — all three lower to a handful of `assign` lines.',
    tags: ['verilog', 'phase3', 'phase3d', 'demux', 'decoder', 'encoder'],
    file: 'examples/circuits/verilog-phase3d-demux-dec-enc.json',
  },
  {
    id: 'verilog-phase3e-bus-display',
    title: '3e. VERILOG — width-changers + 7-segment display',
    desc: 'Phase-3e demo: SIGN_EXT (4→8 sign-extension via `{{4{in[3]}}, in}`), BUS_MUX 2:1 over 8-bit buses (clean ternary), and DISPLAY_7SEG (seven 1-bit input pins packed MSB-first into a 7-bit output port `seg7[6:0] = {g, f, e, d, c, b, a}`). All three lower without `always` blocks. Closes the combinational set for Phase 3 — only TRIBUF (Phase 5, BUS path) and Yosys L3/L4 still pending.',
    tags: ['verilog', 'phase3', 'phase3e', 'sign-ext', 'bus-mux', 'display'],
    file: 'examples/circuits/verilog-phase3e-bus-display.json',
  },
  {
    id: 'verilog-phase4a-flip-flops',
    title: '4a. VERILOG — flip-flops (D, T, SR, JK)',
    desc: 'Phase-4a demo: the first sequential output the toolchain produces. Four FFs sharing one clock — D, T, SR, JK — each lowering to its own `always @(posedge clk)` block driving a `reg` net. The next-state expression is the FF type\'s truth table compiled to a ternary chain: D = `d`; T = `t ? ~q : q`; SR = `(s & ~r) ? 1 : (~s & r) ? 0 : q`; JK = `(j & ~k) ? 1 : (~j & k) ? 0 : (j & k) ? ~q : q`. iverilog parses without warnings.',
    tags: ['verilog', 'phase4', 'phase4a', 'flip-flop', 'sequential'],
    file: 'examples/circuits/verilog-phase4a-flip-flops.json',
  },
  {
    id: 'verilog-phase4b-latches',
    title: '4b. VERILOG — latches (D, SR)',
    desc: 'Phase-4b demo: D-latch and SR-latch, the level-sensitive cousins of the flip-flops in 4a. Click VERILOG to see the differences: sensitivity is `@(*)` instead of `@(posedge clk)` (transparent while EN is high, holds otherwise), and the body wraps in `if (en) begin ... end` so no assignment fires when EN is low. SR-latch nests a second if/else inside the EN gate to choose between set / reset / hold based on (s & ~r) / (~s & r). No CLOCK component needed — EN takes its place.',
    tags: ['verilog', 'phase4', 'phase4b', 'latch', 'sequential'],
    file: 'examples/circuits/verilog-phase4b-latches.json',
  },
  {
    id: 'verilog-phase4c-registers',
    title: '4c. VERILOG — registers, counter, shift register',
    desc: 'Phase-4c demo: REGISTER (8-bit) + COUNTER (4-bit) + SHIFT_REG (4-bit, bidirectional) side by side. Each lowers to a single `always @(posedge clk)` block whose body is a priority chain: CLR > LOAD > EN. The COUNTER uses `(count + 4\'h1)` for increment and emits `assign tc = (&count);` (Verilog reduction-AND of all bits) for terminal-count. The SHIFT_REG\'s direction is picked by `if (dir) ... else ...` inside the EN gate using slice + concat: `{q[N-2:0], din}` for left-shift, `{din, q[N-1:1]}` for right-shift.',
    tags: ['verilog', 'phase4', 'phase4c', 'register', 'counter', 'shift', 'sequential'],
    file: 'examples/circuits/verilog-phase4c-registers.json',
  },
  {
    id: 'verilog-phase4d-pipe-reg',
    title: '4d. VERILOG — pipeline register (3-channel, stall/flush)',
    desc: 'Phase-4d demo: a 3-channel pipeline register with STALL and FLUSH. Click VERILOG to see how it lowers — every channel becomes its own `reg [W-1:0]` net, all driven from a single `always @(posedge clk)` block whose body is a priority chain: `if (flush) → every channel cleared`, `else if (!stall) → every channel latches its data input`, else hold. This is the engine\'s runtime behaviour ported to RTL. The translator degrades gracefully when STALL or FLUSH pins are unconnected — only the wired control signals appear in the guards.',
    tags: ['verilog', 'phase4', 'phase4d', 'pipe-reg', 'pipeline', 'sequential'],
    file: 'examples/circuits/verilog-phase4d-pipe-reg.json',
  },
  {
    id: 'verilog-phase4e-dft',
    title: '4e. VERILOG — SCAN-FF + LFSR (DFT)',
    desc: 'Phase-4e demo: the two DFT primitives we built on the simulator side now have Verilog translators. SCAN-FF lowers to a D-FF with a 2:1 mux on its input gated by TE (`q <= te ? ti : d`). LFSR adds three idioms Phase 4 hasn\'t shown yet: an internal `reg [N-1:0]` net not tied to any canvas wire, a Verilog `initial begin ... end` block to seed the register at sim start, and a slice-XOR shift expression `{state[N-2:0], state[t1] ^ state[t0]}` for the next state. Click VERILOG to see both forms, both parsing cleanly with iverilog.',
    tags: ['verilog', 'phase4', 'phase4e', 'dft', 'scan-ff', 'lfsr'],
    file: 'examples/circuits/verilog-phase4e-dft.json',
  },
  {
    id: 'verilog-phase5a-imm-pc',
    title: '5a. VERILOG — IMM constant + PC counter',
    desc: 'Phase-5a demo: the first two CPU components export to Verilog. IMM is purely combinational — one `assign net = 8\'h2a;` and that\'s it, no clock and no state. PC is a clocked register with a CLR > JUMP > EN priority chain: CLR resets to 0; JUMP loads JUMP_ADDR; EN increments. The pcRelative variant (when set on the node) replaces the JUMP branch with `pc + 1 + offset` for the canonical PC-relative form. Click VERILOG to see both side by side.',
    tags: ['verilog', 'phase5', 'phase5a', 'imm', 'pc', 'cpu'],
    file: 'examples/circuits/verilog-phase5a-imm-pc.json',
  },
  {
    id: 'verilog-phase6-hierarchy',
    title: '6. VERILOG — sub-circuits & hierarchy',
    desc: 'Phase-6 demo: two instances of a 2:1 mux sub-circuit feed an XOR. Click VERILOG to see one `module mux2(...)` definition emitted above the top, instantiated twice with named ports — content-hash de-duplication collapses identical sub-circuits to a single module shared across all instantiations. Definition order is dependency-correct (sub before top). Try `cpu-detailed` next: it uses a CU sub-circuit which now lifts to its own module instead of the previous `// TODO: SUB_CIRCUIT` stub.',
    tags: ['verilog', 'phase6', 'hierarchy', 'sub-circuit'],
    file: 'examples/circuits/verilog-phase6-hierarchy.json',
  },
  {
    id: 'verilog-phase9-elaborate',
    title: '9. VERILOG — elaboration & widths',
    desc: 'Phase-9 demo: a tiny 8-bit register that exercises the AST → IR lowering. Click VERILOG to see the exported text. Behind the scenes the same text now feeds the Phase-8 parser → Phase-9 elaborator round-trip: every demo (Phases 1-8, 21 files) is exported, parsed, elaborated, and the resulting IR matches the original IR for ports, nets, memories, and instance types. Run `node examples/tests/test-hdl-elaborate.mjs` (30 unit checks) or `node examples/tests/test-hdl-elaborate-l1-gate.mjs` (21/21 end-to-end) to see proof.',
    tags: ['verilog', 'phase9', 'elaborate', 'ir', 'widths'],
    file: 'examples/circuits/verilog-phase9-elaborate.json',
  },
  {
    id: 'verilog-phase8-parser',
    title: '8. VERILOG — hand-written parser exercise',
    desc: 'Phase-8 demo: a small 2:1 MUX with a registered output. The companion file at `examples/hdl-corpus/phase8-mux2-handwritten.v` is the SAME design written by hand in Verilog — exercising parameter, `(* keep *)` attribute, case statement, async-reset always block, and `$display`. Both texts (this scene\'s exporter output AND the hand-written sidecar) round-trip cleanly through the parser → AST → re-print → AST with structural equality. Run `node examples/tests/test-hdl-parser-l1-gate.mjs` to see all 20 Phase 1-7 demos pass the same gate.',
    tags: ['verilog', 'phase8', 'parser', 'lexer', 'ast'],
    file: 'examples/circuits/verilog-phase8-parser.json',
  },
  {
    id: 'verilog-phase7-export-ux',
    title: '7. VERILOG — export UX showcase',
    desc: 'Phase-7 demo: small mixed circuit (counter → XOR-mask → register → adder) tagged with `stage` attributes so the export shows the new `// ─── Stage N ───` dividers. Use it to exercise the full export modal: line-numbered syntax-highlit preview, live top-name editing, stats bar, header toggle, error-surface warnings panel, TESTBENCH download (clock + VCD dump skeleton), PROJECT .ZIP bundle (.v + _tb.v + README, ready for `iverilog -g2005`), and right-click → Copy as Verilog on any block to grab a single-component snippet.',
    tags: ['verilog', 'phase7', 'export', 'ux'],
    file: 'examples/circuits/verilog-phase7-export-ux.json',
  },
  {
    id: 'verilog-phase5f-fifo-stack',
    title: '5f. VERILOG — FIFO + STACK',
    desc: 'Phase-5f demo: synchronous FIFO and LIFO stack. FIFO lowers to a `reg [W-1:0] mem [0:DEPTH-1]` plus head/tail/count regs — reads are destructive (Q latches mem[head]; head advances), FULL/EMPTY are continuous comparisons, and pointer wrap uses `(p+1==DEPTH) ? 0 : p+1` so non-power-of-2 depths work. STACK uses a single SP pointer (0=empty, DEPTH=full): PUSH writes mem[sp] then sp++; POP latches Q from mem[sp-1] then sp--. Both honour synchronous CLR with priority and parse cleanly through iverilog. As a bonus, this commit refactors CU from seven 16-deep nested ternary chains into a single `always @(*) case (op)` block — synth-equivalent but human-readable.',
    tags: ['verilog', 'phase5', 'phase5f', 'fifo', 'stack', 'memory'],
    file: 'examples/circuits/verilog-phase5f-fifo-stack.json',
  },
  {
    id: 'verilog-phase5e2-cu-bus',
    title: '5e². VERILOG — Control Unit + Bus',
    desc: 'Phase-5e (part 2) demo: CU + BUS. CU is a pure-combinational decoder over OP — one nested-ternary chain per output drives ALU_OP / RG_WE / MM_WE / MM_RE / JMP / HALT / IMM. BEQ gates JMP on Z; BNE on ~Z. The default 16-op ISA is hardcoded but `node.controlTable` overrides it. BUS lowers a multi-driver tri-state to a priority-MUX (en0 > en1 > en2 > 1\'bz) — no internal multi-driver tri-state, just one assign. ERR flags conflicts via zero-extended pop-count.',
    tags: ['verilog', 'phase5', 'phase5e', 'cu', 'bus', 'cpu'],
    file: 'examples/circuits/verilog-phase5e2-cu-bus.json',
  },
  {
    id: 'verilog-phase5e-rom-tribuf',
    title: '5e. VERILOG — ROM + TRIBUF',
    desc: 'Phase-5e demo (part 1): ROM (16×8 with five pre-loaded cells) and TRIBUF. ROM reuses the memory-array machinery from RAM minus the write port. TRIBUF lowers to `assign y = en ? a : 1\'bz;` via a new Literal-IR `_verilog` override that lets translators emit non-numeric Verilog literals like `1\'bz` / `1\'bx`. Closes the Phase-3 TRIBUF defer; CU and BUS — the harder CPU pieces — land in the next substep.',
    tags: ['verilog', 'phase5', 'phase5e', 'rom', 'tribuf'],
    file: 'examples/circuits/verilog-phase5e-rom-tribuf.json',
  },
  {
    id: 'verilog-phase5d-ram',
    title: '5d. VERILOG — RAM (sync write, async read, pre-load)',
    desc: 'Phase-5d demo: a 16×8 RAM with sync write, RE-gated async read, and three pre-loaded cells. Click VERILOG to see the canonical memory pattern: a `reg [7:0] mem [0:15]` declaration, an `always @(posedge clk) if (we) mem[addr] <= data;` write port, an `assign rd = re ? mem[addr] : 8\'h0;` async read, and an `initial begin` block populating cells 0..4 with the demo values. iverilog and FPGA toolchains honour the initial; ASIC users replace it with $readmemh or a reset path.',
    tags: ['verilog', 'phase5', 'phase5d', 'ram', 'memory'],
    file: 'examples/circuits/verilog-phase5d-ram.json',
  },
  {
    id: 'verilog-phase5c-reg-files',
    title: '5c. VERILOG — register files (single-port + dual-port)',
    desc: 'Phase-5c demo: REG_FILE and REG_FILE_DP, the first translators that emit a Verilog memory array. Click VERILOG to see one `reg [W-1:0] regs [0:DEPTH-1];` per register file plus async-read assigns (`rd_data = regs[rd_addr]`) and a synchronous write inside `always @(posedge clk) if (we) regs[wr_addr] <= wr_data;`. The IR gained two new primitives — `Index` (the `name[idx]` expression) and the existing `Memory` IR node + `out.memories` translator return field — so future RAM, ROM, FIFO, and STACK translators can reuse the same machinery.',
    tags: ['verilog', 'phase5', 'phase5c', 'reg-file', 'cpu'],
    file: 'examples/circuits/verilog-phase5c-reg-files.json',
  },
  {
    id: 'verilog-phase5b-alu-ir',
    title: '5b. VERILOG — ALU + IR (instruction register)',
    desc: 'Phase-5b demo: ALU and IR. ALU is pure combinational — R is a nested-ternary chain over a 3-bit OP encoding (ADD / SUB / AND / OR / XOR / SHL / SHR / CMP), Z = (R == 0), and C uses an extra (W+1)-bit `addext = {1\'b0,a} + {1\'b0,b}` so its top bit can be sliced as the ADD carry. IR is clocked: the full instruction word lives in an internal `reg [15:0]` not tied to any canvas wire (translator-supplied via `out.nets`); on rising clock + LD it latches INSTR; the OP / RD / RS1 / RS2 outputs are continuous slices of the reg.',
    tags: ['verilog', 'phase5', 'phase5b', 'alu', 'ir', 'cpu'],
    file: 'examples/circuits/verilog-phase5b-alu-ir.json',
  },
];

const examplesOverlay = document.getElementById('examples-overlay');
const examplesList = document.getElementById('examples-list');

const EXAMPLES_CATEGORIES = [
  { id: 'beginner',     label: 'Logic & FSM'      },
  { id: 'advanced',     label: 'CPU'              },
  { id: 'pipeline',     label: 'Pipeline'         },
  { id: 'predictor',    label: 'Branch Predictor' },
  { id: 'cache',        label: 'Cache & Memory'   },
  { id: 'dft',          label: 'Test & DFT'       },
  { id: 'verilog',      label: 'VERILOG'          },
];
let _examplesActiveTab = 'beginner';

function _categoryOf(ex) {
  // Category is the first tag that matches a known category id.
  // Legacy 'intermediate' tag folds into the Logic & FSM bucket.
  for (const t of (ex.tags || [])) {
    if (t === 'intermediate') return 'beginner';
    if (EXAMPLES_CATEGORIES.some(c => c.id === t)) return t;
  }
  return 'beginner';   // fallback bucket for un-categorized examples
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

// ── Tutorial / Learn Mode (lazy-loaded on first click) ─────
let _tutorial = null;
async function _ensureTutorial() {
  if (_tutorial) return _tutorial;
  const mod = await import('./tutorial/index.js');
  _tutorial = mod.createTutorial({
    scene,
    state,
    commands,
    renderer: { zoomToFit: Renderer.zoomToFit },
  });
  return _tutorial;
}
document.getElementById('btn-tutorial')?.addEventListener('click', async () => {
  try {
    const t = await _ensureTutorial();
    t.panel.toggle();
  } catch (err) {
    console.error('[tutorial] failed to open:', err);
    alert('Tutorial failed to load: ' + (err?.message || err));
  }
});
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
