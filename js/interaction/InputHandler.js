/**
 * InputHandler — Mouse and keyboard interaction.
 * Handles canvas clicks, dragging, panning, zooming,
 * palette chip drag-and-drop, and wire drawing.
 */
import { bus } from '../core/EventBus.js';
import * as Renderer from '../rendering/CanvasRenderer.js';
import { createComponent, createWire, COMPONENT_TYPES, MEMORY_TYPE_SET } from '../components/Component.js';
import { AddNodeCommand, RemoveNodeCommand, AddWireCommand, RemoveWireCommand, SetGateCommand, SetFfTypeCommand, SetNodePropsCommand } from '../components/CircuitCommands.js';

let _shortcuts = null;
export function setShortcutManager(sm) { _shortcuts = sm; }

let _canvas;
let _scene;
let _state;
let _commands;
let _selection;

// Drag state
let _dragNode = null;
let _dragOffset = { x: 0, y: 0 };
let _dragStartPos = null;
let _panning = false;
let _panStart = { x: 0, y: 0 };

// Wire waypoint dragging
let _dragWaypoint = null; // { wire, segmentIndex, originalWaypoints }

// Wire drawing state
let _wireSource = null;
let _wireSourceOutputIdx = 0;
let _mouseWorld = { x: 0, y: 0 };
let _mouseCanvas = { x: 0, y: 0 };

// Palette drag
let _dragged = null;
let _dragGhost = null;

// Tool-to-component mapping
// Simple placements (type only)
const TOOL_TYPE_MAP = {
  'place-input':  COMPONENT_TYPES.INPUT,
  'place-output': COMPONENT_TYPES.OUTPUT,
  'place-clock':  COMPONENT_TYPES.CLOCK,
  'place-mux':    COMPONENT_TYPES.MUX_SELECT,
  'place-7seg':   COMPONENT_TYPES.DISPLAY_7SEG,
  'place-mux-block':     COMPONENT_TYPES.MUX,
  'place-demux-block':   COMPONENT_TYPES.DEMUX,
  'place-decoder-block': COMPONENT_TYPES.DECODER,
  'place-encoder-block': COMPONENT_TYPES.ENCODER,
  'place-halfadder':     COMPONENT_TYPES.HALF_ADDER,
  'place-fulladder':     COMPONENT_TYPES.FULL_ADDER,
  'place-comparator':    COMPONENT_TYPES.COMPARATOR,
  // Memory components
  'place-register':      COMPONENT_TYPES.REGISTER,
  'place-shiftreg':      COMPONENT_TYPES.SHIFT_REG,
  'place-counter':       COMPONENT_TYPES.COUNTER,
  'place-ram':           COMPONENT_TYPES.RAM,
  'place-rom':           COMPONENT_TYPES.ROM,
  'place-regfile':       COMPONENT_TYPES.REG_FILE,
  'place-fifo':          COMPONENT_TYPES.FIFO,
  'place-stack':         COMPONENT_TYPES.STACK,
  'place-pc':            COMPONENT_TYPES.PC,
  'place-alu':           COMPONENT_TYPES.ALU,
  'place-ir':            COMPONENT_TYPES.IR,
  'place-cu':            COMPONENT_TYPES.CU,
  'place-bus':           COMPONENT_TYPES.BUS,
  'place-imm':           COMPONENT_TYPES.IMM,
  'place-busmux':        COMPONENT_TYPES.BUS_MUX,
  'place-signext':       COMPONENT_TYPES.SIGN_EXT,
  'place-pipereg':       COMPONENT_TYPES.PIPE_REG,
  'place-regfiledp':     COMPONENT_TYPES.REG_FILE_DP,
};

// Direct gate placements (type + gate preset)
const TOOL_GATE_MAP = {
  'place-and':    'AND',
  'place-or':     'OR',
  'place-xor':    'XOR',
  'place-nand':   'NAND',
  'place-nor':    'NOR',
  'place-xnor':   'XNOR',
  'place-not':    'NOT',
  'place-buf':    'BUF',
  'place-tribuf': 'TRIBUF',
};

// Direct flip-flop placements (type + ffType preset)
const TOOL_FF_MAP = {
  'place-dff':  'D',
  'place-tff':  'T',
  'place-srff': 'SR',
  'place-jkff': 'JK',
};

// Direct latch placements
const TOOL_LATCH_MAP = {
  'place-dlatch':  'D_LATCH',
  'place-srlatch': 'SR_LATCH',
};

export function init(canvasEl, scene, stateManager, commandManager, selectionManager) {
  _canvas   = canvasEl;
  _scene    = scene;
  _state    = stateManager;
  _commands = commandManager;
  _selection = selectionManager;
  _dragGhost = document.getElementById('drag-ghost');

  // Palette chips
  document.querySelectorAll('.gate-chip').forEach(_attachChipDrag);

  _canvas.addEventListener('dragover',   _onCanvasDragOver);
  _canvas.addEventListener('drop',       _onCanvasDrop);
  document.addEventListener('drag', (e) => {
    if (!_dragged || !e.clientX) return;
    if (_dragGhost) {
      _dragGhost.style.left = e.clientX + 'px';
      _dragGhost.style.top = e.clientY + 'px';
    }
  });
  _canvas.addEventListener('mousemove',  _onMouseMove);
  _canvas.addEventListener('mouseleave', _onMouseLeave);
  _canvas.addEventListener('click',      _onCanvasClick);
  _canvas.addEventListener('dblclick',   _onCanvasDblClick);
  _canvas.addEventListener('mousedown',  _onMouseDown);
  _canvas.addEventListener('mouseup',    _onMouseUp);
  _canvas.addEventListener('wheel',      _onWheel, { passive: false });

  _initKeyboard();

  // Context menu → properties
  bus.on('node:dblclick', ({ node, screenX, screenY }) => {
    const RESIZABLE = new Set(['MUX', 'DEMUX', 'DECODER', 'ENCODER', 'REG_FILE', 'ALU', 'IR', 'BUS', 'IMM', 'BUS_MUX', 'SIGN_EXT', 'PIPE_REG']);
    if (MEMORY_TYPE_SET.has(node.type) || RESIZABLE.has(node.type)) {
      _showComponentPropsPopup(node, screenX, screenY);
    } else {
      _showInlineRename(node, screenX, screenY);
    }
  });
}

export function refreshChips() {
  document.querySelectorAll('.gate-chip').forEach(chip => {
    chip.removeEventListener('dragstart', _onChipDragStart);
    chip.removeEventListener('dragend',   _onChipDragEnd);
    _attachChipDrag(chip);
  });
}

export function getWirePreview() {
  if (!_wireSource || _state.tool !== 'wire') return null;
  const hoveredNode = _state.hoveredNodeId ? _scene.getNode(_state.hoveredNodeId) : null;
  const isInvalid = hoveredNode && (
    hoveredNode.id === _wireSource.id ||
    _scene.wires.some(w => w.sourceId === _wireSource.id && w.targetId === hoveredNode.id)
  );

  // Find closest input anchor on hovered target node
  let closestAnchorIdx = -1;
  let inputAnchors = null;
  if (hoveredNode && !isInvalid) {
    inputAnchors = Renderer.getInputAnchors(hoveredNode);
    closestAnchorIdx = Renderer.getClosestInputIndex(hoveredNode, _mouseWorld.x, _mouseWorld.y);
  }

  return {
    source: _wireSource,
    mouseWorld: _mouseWorld,
    hoveredNode,
    isInvalid,
    inputAnchors,
    closestAnchorIdx,
  };
}

// ── Wheel ───────────────────────────────────────────────────
function _onWheel(e) {
  e.preventDefault();
  const { x, y } = _getCanvasPoint(e);
  Renderer.zoomAt(x, y, e.deltaY);
}

// ── Mouse Down ──────────────────────────────────────────────
function _onMouseDown(e) {
  const canvasPoint = _getCanvasPoint(e);
  const node = Renderer.getNodeAtPoint(canvasPoint.x, canvasPoint.y, _scene.nodes);

  if (_state.tool === 'multiselect') {
    if (node) {
      // Click on node: toggle in selection
      if (_selection) _selection.toggleSelect(node.id);
    } else {
      // Drag on empty: rubber-band
      if (_selection) {
        const world = Renderer.canvasToWorld(canvasPoint.x, canvasPoint.y);
        _selection.startRubberBand(world.x, world.y);
      }
    }
    return;
  }

  if (_state.tool === 'select') {
    if (node) {
      const world = Renderer.canvasToWorld(canvasPoint.x, canvasPoint.y);
      _dragNode = node;
      _dragOffset = { x: world.x - node.x, y: world.y - node.y };
      _dragStartPos = { x: node.x, y: node.y };
      _state.selectedNodeId = node.id;
    } else {
      // Check if clicking a wire waypoint (bend point) for drag-to-reroute
      const wpHandle = Renderer.getWaypointHandle(canvasPoint.x, canvasPoint.y, _scene.wires);
      if (wpHandle) {
        _dragWaypoint = {
          wire: wpHandle.wire,
          segmentIndex: wpHandle.segmentIndex,
          originalWaypoints: JSON.parse(JSON.stringify(wpHandle.wire.waypoints || [])),
        };
        // Ensure the wire has a waypoints array
        if (!wpHandle.wire.waypoints) wpHandle.wire.waypoints = [];
        // Add the bend point as a waypoint if it isn't one already
        if (wpHandle.wire.waypoints.length === 0) {
          wpHandle.wire.waypoints.push({ x: wpHandle.point.x, y: wpHandle.point.y });
        }
      } else {
        if (e.shiftKey && _selection) {
          // Shift+drag on empty space: rubber-band selection
          const world = Renderer.canvasToWorld(canvasPoint.x, canvasPoint.y);
          _selection.startRubberBand(world.x, world.y);
        } else {
          // Normal drag on empty space: pan
          _panning = true;
          _panStart = { x: e.clientX, y: e.clientY };
        }
      }
    }
  } else if (!_state.tool.startsWith('place-') && _state.tool !== 'wire' && _state.tool !== 'delete') {
    if (!node) {
      _panning = true;
      _panStart = { x: e.clientX, y: e.clientY };
    }
  }
}

// ── Mouse Up ────────────────────────────────────────────────
function _onMouseUp(e) {
  // Finish rubber-band selection
  if (_selection && _selection.rubberBanding) {
    _selection.finishRubberBand();
    _canvas.style.cursor = 'default';
  }

  // If we dragged a node, create a move command
  if (_dragNode && _dragStartPos) {
    const dx = _dragNode.x - _dragStartPos.x;
    const dy = _dragNode.y - _dragStartPos.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      const nodeId = _dragNode.id;
      const startX = _dragStartPos.x, startY = _dragStartPos.y;
      const endX = _dragNode.x, endY = _dragNode.y;
      _commands._undoStack.push({
        description: 'Move node',
        execute() {
          const n = _scene.getNode(nodeId);
          if (n) { n.x = endX; n.y = endY; }
        },
        undo() {
          const n = _scene.getNode(nodeId);
          if (n) { n.x = startX; n.y = startY; }
        }
      });
      _commands._redoStack = [];
      bus.emit('history:changed', { canUndo: _commands.canUndo, canRedo: _commands.canRedo });
    }
  }

  // If we dragged a waypoint, create an undo command
  if (_dragWaypoint) {
    const wire = _dragWaypoint.wire;
    const oldWP = _dragWaypoint.originalWaypoints;
    const newWP = JSON.parse(JSON.stringify(wire.waypoints || []));
    const wireId = wire.id;
    _commands._undoStack.push({
      description: 'Reroute wire',
      execute() {
        const w = _scene.getWire(wireId);
        if (w) w.waypoints = JSON.parse(JSON.stringify(newWP));
      },
      undo() {
        const w = _scene.getWire(wireId);
        if (w) w.waypoints = JSON.parse(JSON.stringify(oldWP));
      }
    });
    _commands._redoStack = [];
    bus.emit('history:changed', { canUndo: _commands.canUndo, canRedo: _commands.canRedo });
    _dragWaypoint = null;
  }

  _dragNode = null;
  _dragStartPos = null;
  _panning = false;
}

// ── Canvas Click ────────────────────────────────────────────
function _onCanvasClick(e) {
  const canvasPoint = _getCanvasPoint(e);
  const node = Renderer.getNodeAtPoint(canvasPoint.x, canvasPoint.y, _scene.nodes);
  const tool = _state.tool;
  const world = Renderer.canvasToWorld(canvasPoint.x, canvasPoint.y);

  // Multi-select tool: toggle node selection
  if (tool === 'multiselect') {
    if (node && _selection) {
      _selection.toggleSelect(node.id);
    }
    return;
  }

  // Place sub-circuit instance
  if (_state._pendingSubCircuit && _state._subRegistry) {
    const instance = _state._subRegistry.createInstance(_state._pendingSubCircuit, world.x, world.y, undefined);
    if (instance) {
      const cmd = new AddNodeCommand(_scene, instance);
      _commands.execute(cmd);
      _state.selectedNodeId = cmd.nodeId;
    }
    _state._pendingSubCircuit = null;
    return;
  }

  // Place node tools (simple I/O components)
  const componentType = TOOL_TYPE_MAP[tool];
  if (componentType) {
    const newNode = createComponent(componentType, world.x, world.y);
    const cmd = new AddNodeCommand(_scene, newNode);
    _commands.execute(cmd);
    _state.selectedNodeId = cmd.nodeId;
    return;
  }

  // Place gate directly (AND, OR, XOR, NAND, NOR, NOT)
  const gateType = TOOL_GATE_MAP[tool];
  if (gateType) {
    const newNode = createComponent(COMPONENT_TYPES.GATE_SLOT, world.x, world.y);
    newNode.gate = gateType;
    newNode.label = gateType;
    const cmd = new AddNodeCommand(_scene, newNode);
    _commands.execute(cmd);
    _state.selectedNodeId = cmd.nodeId;
    return;
  }

  // Place flip-flop directly (D, T, SR, JK)
  const ffType = TOOL_FF_MAP[tool];
  if (ffType) {
    const newNode = createComponent(COMPONENT_TYPES.FF_SLOT, world.x, world.y);
    newNode.ffType = ffType;
    newNode.label = ffType + '-FF';
    const cmd = new AddNodeCommand(_scene, newNode);
    _commands.execute(cmd);
    _state.selectedNodeId = cmd.nodeId;
    // Initialize FF state
    _state.ensureFfState(cmd.nodeId, newNode.initialQ ?? 0);
    return;
  }

  // Place latch directly (D_LATCH, SR_LATCH)
  const latchType = TOOL_LATCH_MAP[tool];
  if (latchType) {
    const newNode = createComponent(COMPONENT_TYPES.LATCH_SLOT, world.x, world.y);
    newNode.latchType = latchType;
    newNode.label = latchType.replace('_', '-');
    const cmd = new AddNodeCommand(_scene, newNode);
    _commands.execute(cmd);
    _state.selectedNodeId = cmd.nodeId;
    _state.ensureFfState(cmd.nodeId, newNode.initialQ ?? 0);
    return;
  }

  // Select tool
  if (tool === 'select') {
    if (node) {
      if (e.shiftKey && _selection) {
        // Shift+click: toggle in multi-selection
        _selection.toggleSelect(node.id);
      } else {
        // Normal click: single select
        if (_selection) _selection.clearSelection();
        _state.selectedNodeId = node.id;
        // Toggle MUX on click
        if (node.type === 'MUX_SELECT') {
          node.value = (node.value ?? 0) ^ 1;
        }
      }
    } else {
      _state.selectedNodeId = null;
      if (_selection) _selection.clearSelection();
      // Check if clicking on a wire
      const wire = Renderer.getWireAtPoint(canvasPoint.x, canvasPoint.y, _scene.nodes, _scene.wires);
      if (wire) {
        bus.emit('wire:selected', { wireId: wire.id });
      }
    }
    return;
  }

  // Delete tool
  if (tool === 'delete') {
    if (node) {
      const cmd = new RemoveNodeCommand(_scene, node.id);
      _commands.execute(cmd);
    } else {
      const wire = Renderer.getWireAtPoint(canvasPoint.x, canvasPoint.y, _scene.nodes, _scene.wires);
      if (wire) {
        const cmd = new RemoveWireCommand(_scene, wire.id);
        _commands.execute(cmd);
      }
    }
    return;
  }

  // Wire tool
  if (tool === 'wire') {
    if (node) {
      if (!_wireSource) {
        // First click: pick source node
        // If it has multiple outputs (DEMUX, FF), pick closest output
        const outAnchors = Renderer.getOutputAnchors(node);
        if (outAnchors.length > 1) {
          let bestIdx = 0, bestDist = Infinity;
          for (const a of outAnchors) {
            const dx = _mouseWorld.x - a.x, dy = _mouseWorld.y - a.y;
            if (dx * dx + dy * dy < bestDist) { bestDist = dx * dx + dy * dy; bestIdx = a.index; }
          }
          _wireSourceOutputIdx = bestIdx;
        } else {
          _wireSourceOutputIdx = 0;
        }
        _wireSource = node;
      } else if (node.id !== _wireSource.id) {
        // Second click: pick target node + closest input anchor
        const targetIdx = Renderer.getClosestInputIndex(node, _mouseWorld.x, _mouseWorld.y);
        const duplicate = _scene.wires.some(w =>
          w.sourceId === _wireSource.id && w.targetId === node.id &&
          w.targetInputIndex === targetIdx
        );
        if (!duplicate) {
          const wire = createWire(_wireSource.id, node.id, targetIdx, _wireSourceOutputIdx || 0);
          const cmd = new AddWireCommand(_scene, wire);
          _commands.execute(cmd);
        }
        _wireSource = null;
        _wireSourceOutputIdx = 0;
      }
    } else {
      _wireSource = null;
      _wireSourceOutputIdx = 0;
    }
    return;
  }
}

// ── Mouse Move ──────────────────────────────────────────────
function _onMouseMove(e) {
  const { x, y } = _getCanvasPoint(e);
  const node = Renderer.getNodeAtPoint(x, y, _scene.nodes);

  _mouseCanvas = { x, y };
  _mouseWorld = Renderer.canvasToWorld(x, y);

  // Panning
  if (_panning) {
    const dx = e.clientX - _panStart.x;
    const dy = e.clientY - _panStart.y;
    _panStart = { x: e.clientX, y: e.clientY };
    Renderer.panBy(dx, dy);
    _canvas.style.cursor = 'grabbing';
    return;
  }

  // Rubber-band selection (only in multiselect tool)
  if (_selection && _selection.rubberBanding) {
    if (_state.tool === 'multiselect') {
      _selection.updateRubberBand(_mouseWorld.x, _mouseWorld.y);
      _canvas.style.cursor = 'crosshair';
      return;
    } else {
      _selection.finishRubberBand();
    }
  }

  // Waypoint dragging
  if (_dragWaypoint) {
    const SNAP = 10;
    const snappedX = Math.round(_mouseWorld.x / SNAP) * SNAP;
    const snappedY = Math.round(_mouseWorld.y / SNAP) * SNAP;
    // Update the first waypoint (for now we support single-waypoint drag)
    if (_dragWaypoint.wire.waypoints.length > 0) {
      _dragWaypoint.wire.waypoints[0] = { x: snappedX, y: snappedY };
    }
    _canvas.style.cursor = 'crosshair';
    return;
  }

  // Node dragging
  if (_dragNode && _state.tool === 'select') {
    _dragNode.x = _mouseWorld.x - _dragOffset.x;
    _dragNode.y = _mouseWorld.y - _dragOffset.y;
    _canvas.style.cursor = 'grabbing';
    return;
  }

  // Cursor
  const tool = _state.tool;
  const isPlaceTool = tool && (tool.startsWith('place-') || TOOL_GATE_MAP[tool] || TOOL_FF_MAP[tool] || TOOL_LATCH_MAP[tool]);
  if (tool === 'multiselect') {
    _canvas.style.cursor = node ? 'pointer' : 'crosshair';
  } else if (isPlaceTool) {
    _canvas.style.cursor = 'crosshair';
  } else if (tool === 'wire') {
    _canvas.style.cursor = node ? 'cell' : 'crosshair';
  } else if (tool === 'delete') {
    const wire = !node ? Renderer.getWireAtPoint(x, y, _scene.nodes, _scene.wires) : null;
    _canvas.style.cursor = (node || wire) ? 'not-allowed' : 'default';
  } else {
    _canvas.style.cursor = node ? 'move' : 'default';
  }

  // Hover node
  const hoverId = node ? node.id : null;
  if (hoverId !== _state.hoveredNodeId) {
    _state.hoveredNodeId = hoverId;
  }

  // Hover wire (only when no node hovered)
  if (!node) {
    const wire = Renderer.getWireAtPoint(_mouseCanvas.x, _mouseCanvas.y, _scene.nodes, _scene.wires);
    _state.hoveredWireId = wire ? wire.id : null;
  } else {
    _state.hoveredWireId = null;
  }
  _state._mouseScreenX = e.clientX;
  _state._mouseScreenY = e.clientY;
}

function _onMouseLeave() {
  if (!_dragged) _canvas.style.cursor = 'default';
  if (_state.hoveredNodeId !== null) {
    _state.hoveredNodeId = null;
  }
}

// ── Palette Chip Drag ───────────────────────────────────────
function _attachChipDrag(chip) {
  chip.draggable = true;
  chip.addEventListener('dragstart', _onChipDragStart);
  chip.addEventListener('dragend',   _onChipDragEnd);
}

function _onChipDragStart(e) {
  const gate = e.currentTarget.dataset.gate;
  const ff   = e.currentTarget.dataset.ff;

  if (gate) _dragged = { kind: 'gate', value: gate };
  else if (ff) _dragged = { kind: 'ff', value: ff };
  else { _dragged = null; return; }

  e.currentTarget.classList.add('dragging');
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', JSON.stringify(_dragged));
    const emptyImg = new Image();
    emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(emptyImg, 0, 0);
  }

  if (_dragGhost) {
    _dragGhost.textContent = _dragged.value + (_dragged.kind === 'ff' ? '-FF' : '');
    _dragGhost.className = _dragged.kind === 'ff' ? 'ff-ghost' : '';
    _dragGhost.style.left = e.clientX + 'px';
    _dragGhost.style.top = e.clientY + 'px';
  }
  _canvas.style.cursor = 'copy';
}

function _onChipDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  _dragged = null;
  if (_dragGhost) _dragGhost.classList.add('hidden');
  _canvas.style.cursor = 'default';
}

function _onCanvasDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  _canvas.style.cursor = 'copy';

  if (_dragGhost) {
    _dragGhost.style.left = e.clientX + 'px';
    _dragGhost.style.top = e.clientY + 'px';
  }
}

function _onCanvasDrop(e) {
  e.preventDefault();

  // Get the tool name from dataTransfer (palette drag)
  let toolName = null;
  if (e.dataTransfer) {
    toolName = e.dataTransfer.getData('text/plain');
  }

  if (!toolName) return;

  const { x, y } = _getCanvasPoint(e);
  const world = Renderer.canvasToWorld(x, y);

  // Place the component at the drop position
  const componentType = TOOL_TYPE_MAP[toolName];
  if (componentType) {
    const newNode = createComponent(componentType, world.x, world.y);
    const cmd = new AddNodeCommand(_scene, newNode);
    _commands.execute(cmd);
    _state.selectedNodeId = cmd.nodeId;
  }

  const gateType = TOOL_GATE_MAP[toolName];
  if (gateType) {
    const newNode = createComponent(COMPONENT_TYPES.GATE_SLOT, world.x, world.y);
    newNode.gate = gateType;
    newNode.label = gateType;
    const cmd = new AddNodeCommand(_scene, newNode);
    _commands.execute(cmd);
    _state.selectedNodeId = cmd.nodeId;
  }

  const ffType = TOOL_FF_MAP[toolName];
  if (ffType) {
    const newNode = createComponent(COMPONENT_TYPES.FF_SLOT, world.x, world.y);
    newNode.ffType = ffType;
    newNode.label = ffType + '-FF';
    const cmd = new AddNodeCommand(_scene, newNode);
    _commands.execute(cmd);
    _state.selectedNodeId = cmd.nodeId;
    _state.ensureFfState(cmd.nodeId, newNode.initialQ ?? 0);
  }

  const latchType = TOOL_LATCH_MAP[toolName];
  if (latchType) {
    const newNode = createComponent(COMPONENT_TYPES.LATCH_SLOT, world.x, world.y);
    newNode.latchType = latchType;
    newNode.label = latchType.replace('_', '-');
    const cmd = new AddNodeCommand(_scene, newNode);
    _commands.execute(cmd);
    _state.selectedNodeId = cmd.nodeId;
    _state.ensureFfState(cmd.nodeId, newNode.initialQ ?? 0);
  }

  if (_dragGhost) _dragGhost.classList.add('hidden');
  _canvas.style.cursor = 'default';
}

// ── Double-click to rename ───────────────────────────────────
let _renameInput = null;

function _onCanvasDblClick(e) {
  const canvasPoint = _getCanvasPoint(e);
  const node = Renderer.getNodeAtPoint(canvasPoint.x, canvasPoint.y, _scene.nodes);
  if (!node) return;

  const rect = _canvas.getBoundingClientRect();
  const screenX = rect.left + canvasPoint.x;
  const screenY = rect.top + canvasPoint.y;

  // ROM: open ROM Editor instead of properties popup
  if (node.type === 'ROM') {
    bus.emit('rom:edit', node);
    return;
  }

  // CU: open CU Editor
  if (node.type === 'CU') {
    bus.emit('cu:edit', node);
    return;
  }

  const RESIZABLE_BLOCKS = new Set(['MUX', 'DEMUX', 'DECODER', 'ENCODER', 'REG_FILE', 'ALU', 'IR', 'BUS', 'IMM', 'BUS_MUX', 'SIGN_EXT', 'PIPE_REG']);
  if (MEMORY_TYPE_SET.has(node.type) || RESIZABLE_BLOCKS.has(node.type)) {
    _showComponentPropsPopup(node, screenX, screenY);
    return;
  }

  _showInlineRename(node, screenX, screenY);
}

function _showInlineRename(node, screenX, screenY) {
  // Remove existing rename input if any
  if (_renameInput) _renameInput.remove();

  const input = document.createElement('input');
  input.type = 'text';
  input.value = node.label || '';
  input.maxLength = 12;
  input.style.cssText = `
    position: fixed;
    left: ${screenX - 50}px;
    top: ${screenY - 45}px;
    width: 100px;
    padding: 4px 8px;
    background: #0d1320;
    border: 2px solid #00d4ff;
    border-radius: 4px;
    color: #c8d8f0;
    font: bold 12px 'JetBrains Mono', monospace;
    text-align: center;
    z-index: 1000;
    outline: none;
    box-shadow: 0 0 12px rgba(0,212,255,0.3);
  `;

  document.body.appendChild(input);
  input.focus();
  input.select();
  _renameInput = input;

  function commit() {
    const newLabel = input.value.trim();
    if (newLabel !== '' && newLabel !== node.label) {
      const cmd = new SetNodePropsCommand(_scene, node.id, { label: newLabel });
      _commands.execute(cmd);
    }
    input.remove();
    _renameInput = null;
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { input.remove(); _renameInput = null; }
    e.stopPropagation();
  });

  input.addEventListener('blur', commit);
}

// ── Component properties popup (memory + resizable blocks) ──
let _compPropsPopup = null;

function _getComponentFields(node) {
  switch (node.type) {
    case 'MUX':     return [{ key: 'inputCount',  label: 'Inputs',      min: 2, max: 16,   val: node.inputCount || 2 }];
    case 'DEMUX':   return [{ key: 'outputCount', label: 'Outputs',     min: 2, max: 16,   val: node.outputCount || 2 }];
    case 'DECODER': return [{ key: 'inputBits',   label: 'Input Bits',  min: 1, max: 8,    val: node.inputBits || 2 }];
    case 'ENCODER': return [{ key: 'inputLines',  label: 'Input Lines', min: 2, max: 64,   val: node.inputLines || 4 }];
    case 'RAM':
    case 'ROM':
      return [
        { key: 'addrBits', label: 'Address Bits', min: 1, max: 24,        val: node.addrBits || 3 },
        { key: 'dataBits', label: 'Data Bits',    min: 1, max: 64,        val: node.dataBits || 4 },
      ];
    case 'REGISTER':
    case 'SHIFT_REG':
    case 'COUNTER':
    case 'PC':
      return [{ key: 'bitWidth', label: 'Bit Width', min: 1, max: 64, val: node.bitWidth || 4 }];
    case 'REG_FILE':
    case 'REG_FILE_DP':
      return [
        { key: 'regCount', label: 'Registers', min: 2, max: 256,          val: node.regCount || 8 },
        { key: 'dataBits', label: 'Data Bits',  min: 1, max: 64,          val: node.dataBits || 8 },
      ];
    case 'ALU':
      return [{ key: 'bitWidth', label: 'Bit Width', min: 1, max: 64, val: node.bitWidth || 8 }];
    case 'PIPE_REG':
      return [{ key: 'channels', label: 'Channels', min: 1, max: 32, val: node.channels || 4 }];
    case 'SIGN_EXT':
      return [
        { key: 'inBits',  label: 'Input Bits',  min: 1, max: 64,          val: node.inBits || 4 },
        { key: 'outBits', label: 'Output Bits', min: 2, max: 64,          val: node.outBits || 8 },
      ];
    case 'BUS_MUX':
      return [{ key: 'inputCount', label: 'Inputs', min: 2, max: 16, val: node.inputCount || 2 }];
    case 'IMM':
      return [
        { key: 'value',    label: 'Value',     min: 0, max: 4294967295,   val: node.value || 0 },
        { key: 'bitWidth', label: 'Bit Width',  min: 1, max: 64,          val: node.bitWidth || 8 },
      ];
    case 'BUS':
      return [{ key: 'sourceCount', label: 'Sources', min: 2, max: 16, val: node.sourceCount || 3 }];
    case 'IR':
      return [
        { key: 'instrWidth', label: 'Instr Width', min: 8,  max: 64,      val: node.instrWidth || 16 },
        { key: 'opBits',     label: 'Opcode Bits',  min: 2,  max: 16,     val: node.opBits || 4 },
        { key: 'rdBits',     label: 'RD Bits',      min: 2,  max: 16,     val: node.rdBits || 4 },
        { key: 'rs1Bits',    label: 'RS1 Bits',     min: 2,  max: 16,     val: node.rs1Bits || 4 },
        { key: 'rs2Bits',    label: 'RS2 Bits',     min: 2,  max: 16,     val: node.rs2Bits || 4 },
      ];
    case 'FIFO':
    case 'STACK':
      return [
        { key: 'depth',    label: 'Depth',     min: 2,  max: 1024,        val: node.depth || 8 },
        { key: 'dataBits', label: 'Data Bits',  min: 1,  max: 64,         val: node.dataBits || 8 },
      ];
    default: return [];
  }
}

function _getPopupColor(node) {
  if (MEMORY_TYPE_SET.has(node.type)) return { border: '#a078e0', title: '#c0a0f0', shadow: 'rgba(128,90,213,0.4)', btn: '#a078e0' };
  return { border: '#20d4a0', title: '#20d4a0', shadow: 'rgba(32,212,160,0.4)', btn: '#1a9a78' };
}

function _showComponentPropsPopup(node, screenX, screenY) {
  if (_compPropsPopup) _compPropsPopup.remove();

  const fields = _getComponentFields(node);
  const clr = _getPopupColor(node);

  const popup = document.createElement('div');
  popup.style.cssText = `
    position: fixed;
    left: ${screenX - 80}px;
    top: ${screenY - 30}px;
    min-width: 180px;
    padding: 10px 14px;
    background: #0d1320;
    border: 2px solid ${clr.border};
    border-radius: 6px;
    color: #c8d8f0;
    font: 11px 'JetBrains Mono', monospace;
    z-index: 1000;
    box-shadow: 0 0 16px ${clr.shadow};
    display: flex;
    flex-direction: column;
    gap: 6px;
  `;

  const title = document.createElement('div');
  title.textContent = node.label || node.type;
  title.style.cssText = `font-weight: bold; color: ${clr.title}; margin-bottom: 4px; font-size: 12px;`;
  popup.appendChild(title);

  // Size fields
  const inputEls = {};
  for (const f of fields) {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 8px;';
    const label = document.createElement('span');
    label.textContent = f.label;
    label.style.color = '#8090a8';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = f.min;
    inp.max = f.max;
    inp.value = f.val;
    inp.style.cssText = `
      width: 48px; padding: 2px 6px;
      background: #161e2e; border: 1px solid #3a4a60; border-radius: 3px;
      color: #c8d8f0; font: 11px 'JetBrains Mono', monospace; text-align: center;
    `;
    inputEls[f.key] = inp;
    row.appendChild(label);
    row.appendChild(inp);
    popup.appendChild(row);
  }

  // Label field
  const labelRow = document.createElement('div');
  labelRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 8px;';
  const labelLabel = document.createElement('span');
  labelLabel.textContent = 'Label';
  labelLabel.style.color = '#8090a8';
  const labelInp = document.createElement('input');
  labelInp.type = 'text';
  labelInp.value = node.label || '';
  labelInp.maxLength = 12;
  labelInp.style.cssText = `
    width: 70px; padding: 2px 6px;
    background: #161e2e; border: 1px solid #3a4a60; border-radius: 3px;
    color: #c8d8f0; font: 11px 'JetBrains Mono', monospace; text-align: center;
  `;
  labelRow.appendChild(labelLabel);
  labelRow.appendChild(labelInp);
  popup.appendChild(labelRow);

  // Buttons
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display: flex; gap: 6px; margin-top: 4px;';
  const btnOk = document.createElement('button');
  btnOk.textContent = 'Apply';
  btnOk.style.cssText = `
    flex: 1; padding: 4px; background: ${clr.btn}; border: none; border-radius: 3px;
    color: #fff; font: bold 11px 'JetBrains Mono', monospace; cursor: pointer;
  `;
  const btnCancel = document.createElement('button');
  btnCancel.textContent = 'Cancel';
  btnCancel.style.cssText = `
    flex: 1; padding: 4px; background: #2a3040; border: 1px solid #3a4a60; border-radius: 3px;
    color: #8090a8; font: 11px 'JetBrains Mono', monospace; cursor: pointer;
  `;
  btnRow.appendChild(btnOk);
  btnRow.appendChild(btnCancel);
  popup.appendChild(btnRow);

  document.body.appendChild(popup);
  _compPropsPopup = popup;

  const firstInput = Object.values(inputEls)[0];
  if (firstInput) { firstInput.focus(); firstInput.select(); }

  function apply() {
    const props = {};
    for (const f of fields) {
      const raw = parseInt(inputEls[f.key].value, 10);
      props[f.key] = Math.max(f.min, Math.min(f.max, isNaN(raw) ? f.val : raw));
    }
    const newLabel = labelInp.value.trim();
    if (newLabel && newLabel !== node.label) props.label = newLabel;
    if (Object.keys(props).length) {
      const cmd = new SetNodePropsCommand(_scene, node.id, props);
      _commands.execute(cmd);
    }
    // Reset memory state on resize
    if (MEMORY_TYPE_SET.has(node.type) && _state.ffStates) _state.ffStates.delete(node.id);
    close();
  }

  function close() {
    popup.remove();
    _compPropsPopup = null;
  }

  btnOk.addEventListener('click', apply);
  btnCancel.addEventListener('click', close);
  popup.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); apply(); }
    if (e.key === 'Escape') close();
    e.stopPropagation();
  });
}

// ── Keyboard ────────────────────────────────────────────────
function _initKeyboard() {
  window.addEventListener('keydown', (e) => {
    const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
    if (isTyping && e.key !== 'Escape') return;

    // Use ShortcutManager if available
    if (_shortcuts) {
      const match = _shortcuts.findMatch(e);
      if (match) {
        e.preventDefault();
        const toolMap = {
          'tool-select': 'select', 'tool-multiselect': 'multiselect',
          'tool-wire': 'wire', 'tool-delete': 'delete',
          'tool-input': 'place-input', 'tool-output': 'place-output',
          'tool-clock': 'place-clock',
        };
        if (toolMap[match]) { _state.tool = toolMap[match]; return; }
        if (match === 'action-undo') { _commands.undo(); return; }
        if (match === 'action-redo') { _commands.redo(); return; }
        if (match === 'nav-stepclock') { bus.emit('clock:step'); return; }
        if (match === 'nav-zoomfit') { bus.emit('nav:zoomfit'); return; }
        if (match === 'nav-meminspector') { bus.emit('nav:meminspector'); return; }
        // Custom bound shortcuts — emit as palette tool
        if (match.startsWith('place-') || match.startsWith('tool-')) {
          bus.emit('palette:tool', match.startsWith('tool-') ? match.replace('tool-', '') : match);
          return;
        }
        if ((match === 'edit-delete' || match === 'edit-delete2') && _state.selectedNodeId) {
          const cmd = new RemoveNodeCommand(_scene, _state.selectedNodeId);
          _commands.execute(cmd);
          _state.selectedNodeId = null;
          return;
        }
      }
    } else {
      // Fallback hardcoded shortcuts
      if (e.ctrlKey && !e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); _commands.undo(); return; }
      if ((e.ctrlKey && e.code === 'KeyY') || (e.ctrlKey && e.shiftKey && e.code === 'KeyZ')) { e.preventDefault(); _commands.redo(); return; }
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        const sc = {'KeyS':'select','KeyQ':'multiselect','KeyI':'place-input','KeyO':'place-output','KeyC':'place-clock','KeyW':'wire','KeyD':'delete'}[e.code];
        if (sc) { e.preventDefault(); _state.tool = sc; return; }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && _state.selectedNodeId) {
        e.preventDefault(); _commands.execute(new RemoveNodeCommand(_scene, _state.selectedNodeId)); _state.selectedNodeId = null; return;
      }
      if (e.code === 'Space') { e.preventDefault(); bus.emit('clock:step'); return; }
    }

    if (e.key === 'Escape') {
      _wireSource = null;
      _state._pendingSubCircuit = null;
      // If using any tool other than select, revert to select
      if (_state.tool !== 'select') {
        _state.tool = 'select';
      } else {
        // Already on select — deselect everything
        _state.selectedNodeId = null;
      }
      bus.emit('overlay:close');
    }
  });
}

// ── Helpers ─────────────────────────────────────────────────
function _getCanvasPoint(e) {
  const rect = _canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
