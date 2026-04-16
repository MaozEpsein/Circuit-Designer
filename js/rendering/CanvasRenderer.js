/**
 * CanvasRenderer — Canvas drawing engine.
 * Renders all circuit components, wires, tooltips, and overlays.
 * Migrated from renderer.js — full drawing logic preserved.
 */
import { C, NODE } from './Theme.js';
import { FF_TYPE_SET, MEMORY_TYPE_SET } from '../components/Component.js';
import { computeRoute, detectJunctions, computeChannelOffset, simplifyPath } from '../routing/WireRouter.js';

let canvas, ctx;
let W, H;

// ── Transform state ─────────────────────────────────────────
let _offsetX = 0, _offsetY = 0;
let _userPanned = false;
let _userZoom = 1;
let _scale = 1;

// ── Render state ────────────────────────────────────────────
let _stepCount = 0;

export function init(canvasEl) {
  canvas = canvasEl;
  ctx    = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

export function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
}

// ── Initial offset (design mode — no auto-center) ───────────
let _initialized = false;

function _ensureInitialOffset() {
  if (_initialized) return;
  _initialized = true;
  _scale = 1;
  _offsetX = 0;
  _offsetY = 0;
  _userPanned = true; // Prevent any auto-centering
}

/**
 * Zoom-to-fit: center the view on all nodes.
 * Only called explicitly by the user (not every frame).
 */
export function zoomToFit(nodes) {
  if (!nodes || nodes.length === 0) {
    _scale = 1;
    _userZoom = 1;
    _offsetX = 0;
    _offsetY = 0;
    return;
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  });
  const pad = 120;
  const levelW = (maxX - minX) + pad * 2;
  const levelH = (maxY - minY) + pad * 2;
  const availH = H - 56;
  const baseScale = Math.min(1, W / levelW, availH / levelH);
  const levelCX = (minX + maxX) / 2;
  const levelCY = (minY + maxY) / 2;
  _userZoom = 1;
  _scale = baseScale;
  _offsetX = W / 2 - levelCX * _scale;
  _offsetY = (56 + H) / 2 - levelCY * _scale;
  _userPanned = true;
}

// ── Main Render ─────────────────────────────────────────────
/**
 * @param {object[]} nodes
 * @param {object[]} wires
 * @param {Map} nodeValues
 * @param {Map} wireValues
 * @param {Map} ffStates
 * @param {string|null} hoveredNodeId
 * @param {string|null} selectedNodeId
 * @param {number} stepCount
 * @param {object|null} wirePreview - { source, mouseWorld, hoveredNode, isInvalid }
 */
export function render(nodes, wires, nodeValues, wireValues, ffStates, hoveredNodeId, selectedNodeId, stepCount, wirePreview, activeTool) {
  _stepCount = stepCount || 0;
  if (!ctx) return;

  ctx.clearRect(0, 0, W, H);
  _drawBackground();
  _drawGrid();

  _ensureInitialOffset();

  ctx.save();
  ctx.translate(_offsetX, _offsetY);
  if (_scale !== 1) ctx.scale(_scale, _scale);

  _drawWires(nodes, wires, wireValues);
  _drawPulses(nodes, wires, wireValues);
  _drawNodes(nodes, nodeValues, ffStates, hoveredNodeId, selectedNodeId);

  // Wire mode: show anchor dots on hovered node (before source is picked)
  if (activeTool === 'wire' && !wirePreview && hoveredNodeId) {
    const hNode = nodes.find(n => n.id === hoveredNodeId);
    if (hNode) _drawNodeAnchors(hNode);
  }

  // Wire preview while connecting (source picked, drawing to target)
  if (wirePreview) {
    _drawWirePreview(wirePreview, nodes, wires);
  }

  ctx.restore();

  // Tooltips
  if (hoveredNodeId && activeTool !== 'wire') {
    _drawNodeTooltip(nodes, hoveredNodeId, nodeValues);
  }
}

// ── Background ──────────────────────────────────────────────
function _drawBackground() {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
}

// ── Dot Grid ────────────────────────────────────────────────
function _drawGrid() {
  const spacing = 40;
  const offsetX = (W % spacing) / 2;
  const offsetY = (H % spacing) / 2;
  ctx.save();
  for (let x = offsetX; x < W; x += spacing) {
    for (let y = offsetY; y < H; y += spacing) {
      const isMajor = (Math.round((x - offsetX) / spacing) % 4 === 0) &&
                      (Math.round((y - offsetY) / spacing) % 4 === 0);
      ctx.fillStyle = isMajor ? C.gridAccent : C.grid;
      ctx.beginPath();
      ctx.arc(x, y, isMajor ? 1.5 : 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ── Wires (Manhattan Routing) ───────────────────────────────
// Cache computed wire paths for the current frame
let _wirePaths = new Map(); // wireId → [{x,y}, ...]

function _drawWires(nodes, wires, wireValues) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  _wirePaths = new Map();

  // Compute all routes first
  wires.forEach(wire => {
    const src = nodeMap.get(wire.sourceId);
    const dst = nodeMap.get(wire.targetId);
    if (!src || !dst) return;

    const srcPt = _nodeOutputAnchor(src, wire.sourceOutputIndex || 0);
    const dstPt = _nodeInputAnchor(src, dst, wire.targetInputIndex, wire.isClockWire);

    // Build obstacle list (all nodes except source and target)
    const obstacles = nodes.filter(n => n.id !== wire.sourceId && n.id !== wire.targetId);

    // Compute channel offset for parallel wires
    const channelOff = computeChannelOffset(wire, wires);

    // Compute Manhattan route
    const path = simplifyPath(
      computeRoute(srcPt, dstPt, wire.waypoints, obstacles, channelOff)
    );
    _wirePaths.set(wire.id, path);
  });

  // Detect junctions (where wires share points)
  const junctions = detectJunctions(_wirePaths);

  // Draw all wires
  wires.forEach(wire => {
    const path = _wirePaths.get(wire.id);
    if (!path || path.length < 2) return;

    const val   = wireValues.get(wire.id);
    const isCLK = wire.isClockWire;
    const { color, glow, width, isBus } = _wireStyle(val, isCLK, wire.colorGroup);

    ctx.save();

    // Glow layer
    if (val !== null || isCLK) {
      ctx.strokeStyle = glow;
      ctx.lineWidth   = width + 6;
      ctx.lineCap     = 'round';
      ctx.shadowColor = glow;
      ctx.shadowBlur  = isCLK ? 14 : (val === 1 ? 18 : 8);
      ctx.globalAlpha = isCLK ? 0.5 : 0.4;
      _drawManhattanPath(path);
      ctx.stroke();
    }

    if (isCLK) {
      ctx.setLineDash([8, 5]);
      ctx.lineDashOffset = (Date.now() / 60) % 13;
    }

    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    _drawManhattanPath(path);
    ctx.stroke();

    if (isCLK) ctx.setLineDash([]);

    // Signal dot at source
    _drawSignalDot(path[0].x, path[0].y, val, width, isCLK);

    ctx.restore();

    // Bus value label
    if (isBus && path.length >= 2) {
      _drawBusValueLabel(path, val);
    }

    // Net name label
    if (wire.netName) {
      _drawNetLabel(path, wire.netName, color);
    }
  });

  // Draw junction dots
  _drawJunctions(junctions, wireValues, wires);
}

// ── Color groups for wires ──────────────────────────────────
const COLOR_GROUPS = {
  red:    { color: '#ff4444', glow: 'rgba(255,68,68,0.4)' },
  green:  { color: '#39ff14', glow: 'rgba(57,255,20,0.4)' },
  blue:   { color: '#4a8fff', glow: 'rgba(74,143,255,0.4)' },
  yellow: { color: '#ffcc00', glow: 'rgba(255,204,0,0.4)' },
  purple: { color: '#a060ff', glow: 'rgba(160,96,255,0.4)' },
  orange: { color: '#ff9933', glow: 'rgba(255,153,51,0.4)' },
  cyan:   { color: '#00d4ff', glow: 'rgba(0,212,255,0.4)' },
  pink:   { color: '#ff69b4', glow: 'rgba(255,105,180,0.4)' },
};

function _isBusValue(val) {
  return val !== null && val !== undefined && val !== 0 && val !== 1;
}

function _wireStyle(val, isCLK, colorGroup) {
  // Color group override
  if (colorGroup && COLOR_GROUPS[colorGroup]) {
    const g = COLOR_GROUPS[colorGroup];
    return { color: g.color, glow: g.glow, width: 2, isBus: false };
  }
  if (isCLK) return { color: C.wireClock, glow: C.wireClockGlow, width: 2, isBus: false };
  // Multi-bit bus wire (value > 1)
  if (_isBusValue(val)) return { color: '#e0a030', glow: 'rgba(224,160,48,0.35)', width: 4, isBus: true };
  if (val === 1) return { color: C.wireHigh, glow: C.wireHighGlow, width: 2.5, isBus: false };
  if (val === 0) return { color: C.wireLow,  glow: C.wireLowGlow,  width: 2,   isBus: false };
  return               { color: C.wireNull, glow: C.wireNull,     width: 1.5, isBus: false };
}

/**
 * Draw a Manhattan (orthogonal) path through an array of points.
 */
function _drawManhattanPath(path) {
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i].x, path[i].y);
  }
}

function _drawBusValueLabel(path, val) {
  // Find the midpoint of the longest segment
  let bestLen = 0, bestMidX = 0, bestMidY = 0, bestAngle = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i+1].x - path[i].x;
    const dy = path[i+1].y - path[i].y;
    const len = Math.abs(dx) + Math.abs(dy);
    if (len > bestLen) {
      bestLen = len;
      bestMidX = (path[i].x + path[i+1].x) / 2;
      bestMidY = (path[i].y + path[i+1].y) / 2;
      bestAngle = Math.abs(dx) > Math.abs(dy) ? 0 : -Math.PI / 2;
    }
  }
  if (bestLen < 30) return; // too short for label

  const label = '0x' + (val >>> 0).toString(16).toUpperCase();

  ctx.save();
  ctx.translate(bestMidX, bestMidY);
  if (bestAngle) ctx.rotate(bestAngle);

  // Background pill
  ctx.font = 'bold 8px JetBrains Mono, monospace';
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(10,14,20,0.85)';
  ctx.beginPath();
  const pw = tw + 6, ph = 12;
  _roundRect(ctx, -pw/2, -ph/2, pw, ph, 3);
  ctx.fill();
  ctx.strokeStyle = '#8a6020';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Text
  ctx.fillStyle = '#e0a030';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

function _drawSignalDot(x, y, val, wireW, isCLK) {
  if (val === null && !isCLK) return;
  ctx.save();
  const isBus = _isBusValue(val);
  ctx.fillStyle   = isCLK ? C.wireClock : isBus ? '#e0a030' : (val === 1 ? C.wireHigh : C.wireLow);
  ctx.shadowColor = isCLK ? C.wireClockGlow : isBus ? 'rgba(224,160,48,0.5)' : (val === 1 ? C.wireHighGlow : C.wireLowGlow);
  ctx.shadowBlur  = 10;
  ctx.beginPath();
  ctx.arc(x, y, wireW + 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw junction dots where wires meet.
 */
function _drawJunctions(junctions, wireValues, wires) {
  if (junctions.length === 0) return;
  ctx.save();
  junctions.forEach(j => {
    ctx.beginPath();
    ctx.arc(j.x, j.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = C.wireHigh;
    ctx.shadowColor = C.wireHighGlow;
    ctx.shadowBlur = 6;
    ctx.fill();
  });
  ctx.restore();
}

/**
 * Draw a net name label at the midpoint of a wire path.
 */
function _drawNetLabel(path, name, color) {
  if (path.length < 2) return;
  // Find midpoint segment
  const midIdx = Math.floor(path.length / 2) - 1;
  const a = path[Math.max(0, midIdx)];
  const b = path[Math.min(path.length - 1, midIdx + 1)];
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const isHorizontal = a.y === b.y;

  ctx.save();
  ctx.font = 'bold 9px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = isHorizontal ? 'bottom' : 'middle';

  // Background
  const tw = ctx.measureText(name).width + 6;
  const th = 12;
  const bx = mx - tw / 2;
  const by = isHorizontal ? my - th - 2 : my - th / 2;
  ctx.fillStyle = 'rgba(10, 14, 20, 0.85)';
  ctx.fillRect(bx, by, tw, th);
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(bx, by, tw, th);

  // Text
  ctx.fillStyle = color;
  ctx.fillText(name, mx, isHorizontal ? my - 3 : my + 1);
  ctx.restore();
}

/**
 * Get the computed path for a wire (for use in pulse animation and hit testing).
 */
export function getWirePath(wireId) {
  return _wirePaths.get(wireId) || null;
}

// ── Pulse Animation ─────────────────────────────────────────
let _pulseStart = 0;
const PULSE_MS = 700;

export function startPulse() { _pulseStart = Date.now(); }

function _drawPulses(nodes, wires, wireValues) {
  const elapsed = Date.now() - _pulseStart;
  if (elapsed > PULSE_MS || !_pulseStart) return;
  const t = elapsed / PULSE_MS;

  wires.forEach(wire => {
    const path = _wirePaths.get(wire.id);
    if (!path || path.length < 2) return;
    const val = wireValues.get(wire.id) ?? null;

    // Compute total path length
    let total = 0;
    const segLengths = [];
    for (let i = 0; i < path.length - 1; i++) {
      const d = Math.abs(path[i + 1].x - path[i].x) + Math.abs(path[i + 1].y - path[i].y);
      segLengths.push(d);
      total += d;
    }
    if (total === 0) return;

    // Find position along path at time t
    let pos = t * total;
    let px = path[0].x, py = path[0].y;
    for (let i = 0; i < segLengths.length; i++) {
      if (pos <= segLengths[i]) {
        const s = segLengths[i] > 0 ? pos / segLengths[i] : 0;
        px = path[i].x + (path[i + 1].x - path[i].x) * s;
        py = path[i].y + (path[i + 1].y - path[i].y) * s;
        break;
      }
      pos -= segLengths[i];
    }

    const pulseColor = wire.isClockWire ? '#ffcc00' : (val === 1 ? '#39ff14' : (val === 0 ? '#ff4444' : '#555'));
    const alpha = 1 - t * 0.4;
    const r = 8 + (1 - t) * 5;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pulseColor;
    ctx.shadowColor = pulseColor;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ── Node Anchors ────────────────────────────────────────────
function _muxNodeSize(node) {
  let n;
  if (node.type === 'DECODER') n = 1 << (node.inputBits || 2); // output count
  else if (node.type === 'ENCODER') n = node.inputLines || 4;   // input count
  else n = node.inputCount || node.outputCount || 2;
  const h = Math.max(60, n * 22 + 20);
  return { w: 70, h };
}

function _nodeOutputAnchor(node, outputIndex) {
  outputIndex = outputIndex || 0;
  if (node.type === 'PIPE_REG') {
    const ch = node.channels || 4;
    const h = Math.max(60, ch * 20 + 20);
    const spread = (h - 16) / Math.max(1, ch - 1);
    const startY = node.y - (h - 16) / 2;
    return { x: node.x + 50, y: ch === 1 ? node.y : startY + outputIndex * spread };
  }
  if (node.type === 'SIGN_EXT') {
    return { x: node.x + 45, y: node.y };
  }
  if (node.type === 'INPUT' || node.type === 'CLOCK' || node.type === 'IMM') {
    return { x: node.x + NODE.inputR, y: node.y };
  }
  if (node.type === 'GATE_SLOT') {
    return { x: node.x + NODE.gateW / 2, y: node.y };
  }
  if (node.type === 'MUX') {
    const { w } = _muxNodeSize(node);
    return { x: node.x + w / 2, y: node.y };
  }
  if (node.type === 'DEMUX' || node.type === 'DECODER') {
    const { w, h } = _muxNodeSize(node);
    const n = node.type === 'DECODER' ? (1 << (node.inputBits || 2)) : (node.outputCount || 2);
    const spread = (h - 20) / Math.max(1, n - 1);
    const startY = node.y - (h - 20) / 2;
    return { x: node.x + w / 2, y: startY + outputIndex * spread };
  }
  if (node.type === 'ENCODER') {
    const { w } = _muxNodeSize(node);
    const outBits = Math.ceil(Math.log2(node.inputLines || 4));
    const total = outBits + 1;
    const spread = 18;
    const startY = node.y - (total - 1) * spread / 2;
    return { x: node.x + w / 2, y: startY + outputIndex * spread };
  }
  if (node.type === 'HALF_ADDER' || node.type === 'FULL_ADDER') {
    const hw = 45;
    const yOff = outputIndex === 0 ? -12 : 12; // Sum top, Carry bottom
    return { x: node.x + hw, y: node.y + yOff };
  }
  if (node.type === 'COMPARATOR') {
    const hw = 45;
    const spread = 16;
    const startY = node.y - spread; // EQ, GT, LT
    return { x: node.x + hw, y: startY + outputIndex * spread };
  }
  if (node.type === 'BUS_MUX') {
    return { x: node.x + 45, y: node.y };
  }
  if (node.type === 'SUB_CIRCUIT') {
    const outs = node.subOutputs || [];
    const ins = node.subInputs || [];
    const maxPins = Math.max(ins.length, outs.length, 1);
    const w = 120, h = Math.max(60, maxPins * 20 + 20);
    const spread = (h - 16) / Math.max(1, outs.length - 1);
    const startY = node.y - (h - 16) / 2;
    return { x: node.x + w / 2, y: outs.length === 1 ? node.y : startY + outputIndex * spread };
  }
  if (node.type === 'BUS') {
    const hw = 50;
    return { x: node.x + hw, y: node.y + (outputIndex === 0 ? -10 : 10) };
  }
  if (node.type === 'CU') {
    const hw = 60;
    const h = 110;
    const spread = (h - 20) / 5;
    const startY = node.y - (h - 20) / 2;
    return { x: node.x + hw, y: startY + outputIndex * spread };
  }
  if (node.type === 'ALU') {
    const hw = 55;
    const spread = 18;
    const startY = node.y - spread;
    return { x: node.x + hw, y: startY + outputIndex * spread };
  }
  if (node.type === 'IR') {
    const w = 110, h = 80;
    const spread = (h - 20) / 3;
    const startY = node.y - (h - 20) / 2;
    return { x: node.x + w / 2, y: startY + outputIndex * spread };
  }
  if (MEMORY_TYPE_SET.has(node.type)) {
    const { w } = _memoryNodeSize(node);
    if ((node.type === 'FIFO' || node.type === 'STACK') && outputIndex >= 1) {
      const yOff = outputIndex === 1 ? 18 : 36; // FULL, EMPTY
      return { x: node.x + w / 2, y: node.y - 18 + yOff };
    }
    if (node.type === 'COUNTER' && outputIndex === 1) {
      return { x: node.x + w / 2, y: node.y + 18 }; // TC
    }
    return { x: node.x + w / 2, y: node.y - (node.type === 'FIFO' || node.type === 'STACK' ? 18 : 0) }; // Q
  }
  if (FF_TYPE_SET.has(node.type)) {
    const hw = NODE.ffW / 2;
    const yOff = outputIndex === 1 ? 18 : -18;
    return { x: node.x + hw, y: node.y + yOff };
  }
  return { x: node.x + 36, y: node.y };
}

function _nodeInputAnchor(_src, node, inputIndex, isClockWire) {
  if (node.type === 'OUTPUT') {
    return { x: node.x - 36, y: node.y };
  }
  if (node.type === 'MUX') {
    const { w, h } = _muxNodeSize(node);
    const n = node.inputCount || 2;
    const selCount = Math.ceil(Math.log2(n));
    if (inputIndex >= n) {
      // Select inputs — bottom
      const selIdx = inputIndex - n;
      const selSpread = 18;
      const selStartX = node.x - (selCount - 1) * selSpread / 2;
      return { x: selStartX + selIdx * selSpread, y: node.y + h / 2 };
    }
    // Data inputs — left side
    const spread = (h - 20) / Math.max(1, n - 1);
    const startY = node.y - (h - 20) / 2;
    return { x: node.x - w / 2, y: startY + inputIndex * spread };
  }
  if (node.type === 'DEMUX') {
    const { w, h } = _muxNodeSize(node);
    const outCount = node.outputCount || 2;
    const selCount = Math.ceil(Math.log2(outCount));
    if (inputIndex === 0) {
      return { x: node.x - w / 2, y: node.y };
    }
    const selIdx = inputIndex - 1;
    const selSpread = 18;
    const selStartX = node.x - (selCount - 1) * selSpread / 2;
    return { x: selStartX + selIdx * selSpread, y: node.y + h / 2 };
  }
  if (node.type === 'DECODER') {
    const { w, h } = _muxNodeSize(node);
    const n = node.inputBits || 2;
    const spread = 22;
    const startY = node.y - (n - 1) * spread / 2;
    return { x: node.x - w / 2, y: startY + inputIndex * spread };
  }
  if (node.type === 'ENCODER') {
    const { w, h } = _muxNodeSize(node);
    const n = node.inputLines || 4;
    const spread = (h - 20) / Math.max(1, n - 1);
    const startY = node.y - (h - 20) / 2;
    return { x: node.x - w / 2, y: startY + inputIndex * spread };
  }
  if (node.type === 'HALF_ADDER') {
    const hw = 45;
    const yOff = inputIndex === 0 ? -12 : 12;
    return { x: node.x - hw, y: node.y + yOff };
  }
  if (node.type === 'FULL_ADDER') {
    const hw = 45;
    const spread = 16;
    const startY = node.y - spread;
    return { x: node.x - hw, y: startY + inputIndex * spread };
  }
  if (node.type === 'COMPARATOR') {
    const hw = 45;
    const yOff = inputIndex === 0 ? -12 : 12;
    return { x: node.x - hw, y: node.y + yOff };
  }
  if (node.type === 'PIPE_REG') {
    const ch = node.channels || 4;
    const totalIn = ch + 3; // D0..Dn-1, STALL, FLUSH, CLK
    const h = Math.max(60, ch * 20 + 20);
    if (inputIndex === totalIn - 1) return { x: node.x, y: node.y + h / 2 }; // CLK at bottom
    const dataCount = totalIn - 1;
    const spread = (h - 16) / Math.max(1, dataCount - 1);
    const startY = node.y - (h - 16) / 2;
    return { x: node.x - 50, y: dataCount === 1 ? node.y : startY + inputIndex * spread };
  }
  if (node.type === 'SIGN_EXT') {
    return { x: node.x - 45, y: node.y };
  }
  if (node.type === 'BUS_MUX') {
    const n = node.inputCount || 2;
    const h = Math.max(50, n * 22 + 10);
    if (inputIndex === n) {
      // SEL at bottom
      return { x: node.x, y: node.y + h / 2 };
    }
    const spread = (h - 14) / Math.max(1, n - 1);
    const startY = node.y - (h - 14) / 2;
    return { x: node.x - 45, y: n === 1 ? node.y : startY + inputIndex * spread };
  }
  if (node.type === 'SUB_CIRCUIT') {
    const ins = node.subInputs || [];
    const outs = node.subOutputs || [];
    const maxPins = Math.max(ins.length, outs.length, 1);
    const w = 120, h = Math.max(60, maxPins * 20 + 20);
    const spread = (h - 16) / Math.max(1, ins.length - 1);
    const startY = node.y - (h - 16) / 2;
    return { x: node.x - w / 2, y: ins.length === 1 ? node.y : startY + inputIndex * spread };
  }
  if (node.type === 'BUS') {
    const hw = 50;
    const srcCount = node.sourceCount || 3;
    const inCount = srcCount * 2;
    const h = Math.max(60, srcCount * 28 + 10);
    const spread = (h - 14) / Math.max(1, inCount - 1);
    const startY = node.y - (h - 14) / 2;
    return { x: node.x - hw, y: startY + inputIndex * spread };
  }
  if (node.type === 'CU') {
    const hw = 60;
    const spread = 22;
    const startY = node.y - spread;
    return { x: node.x - hw, y: startY + inputIndex * spread };
  }
  if (node.type === 'ALU') {
    const hw = 55;
    const spread = 18;
    const startY = node.y - spread;
    return { x: node.x - hw, y: startY + inputIndex * spread };
  }
  if (node.type === 'IR') {
    const w = 110, h = 80;
    if (inputIndex === 2) return { x: node.x, y: node.y + h / 2 }; // CLK at bottom
    const spread = 22;
    const startY = node.y - spread / 2;
    return { x: node.x - w / 2, y: startY + inputIndex * spread };
  }
  if (MEMORY_TYPE_SET.has(node.type)) {
    const { w, h } = _memoryNodeSize(node);
    const inCount = _getNodeInputCount(node);
    // CLK input at bottom center
    if (inputIndex === inCount - 1) {
      return { x: node.x, y: node.y + h / 2 };
    }
    const dataCount = inCount - 1;
    const spread = (h - 20) / Math.max(1, dataCount - 1);
    const startY = node.y - (h - 20) / 2;
    return { x: node.x - w / 2, y: dataCount === 1 ? node.y : startY + inputIndex * spread };
  }
  if (node.type === 'GATE_SLOT') {
    const spread  = 18;
    const offsetY = (inputIndex - 0.5) * spread;
    return { x: node.x - NODE.gateW / 2, y: node.y + offsetY };
  }
  if (FF_TYPE_SET.has(node.type)) {
    const hw = NODE.ffW / 2;
    if (isClockWire) {
      return { x: node.x - hw, y: node.y + 22 };
    }
    const ffInputCount = _ffDataInputCount(node);
    const spread = 20;
    const totalH = (ffInputCount - 1) * spread;
    const offsetY = inputIndex * spread - totalH / 2;
    return { x: node.x - hw, y: node.y + offsetY - 10 };
  }
  return { x: node.x - NODE.inputR, y: node.y };
}

function _ffDataInputCount(node) {
  if (node.type === 'FF_SLOT') {
    return (node.ffType === 'SR' || node.ffType === 'JK') ? 2 : 1;
  }
  if (node.type === 'LATCH_SLOT') {
    return node.latchType === 'SR_LATCH' ? 3 : 2; // SR: S,R,EN  D: D,EN
  }
  return { FLIPFLOP_D: 1, FLIPFLOP_T: 1, FLIPFLOP_SR: 2, FLIPFLOP_JK: 2 }[node.type] || 1;
}

// ── Nodes ───────────────────────────────────────────────────
function _drawNodes(nodes, nodeValues, ffStates, hoveredNodeId, selectedNodeId) {
  nodes.forEach(node => {
    const val     = nodeValues ? (nodeValues.get(node.id) ?? null) : null;
    const hovered = node.id === hoveredNodeId;

    if (node.type === 'INPUT')            _drawInputNode(node, val, hovered);
    else if (node.type === 'CLOCK')       _drawClockNode(node, val, hovered);
    else if (node.type === 'GATE_SLOT')   _drawGateNode(node, val, hovered);
    else if (node.type === 'MUX_SELECT')  _drawMuxSelectNode(node, val, hovered);
    else if (node.type === 'DISPLAY_7SEG') _draw7SegNode(node, hovered);
    else if (node.type === 'OUTPUT')      _drawOutputNode(node, val, hovered);
    else if (node.type === 'MUX')         _drawMuxNode(node, val, hovered);
    else if (node.type === 'DEMUX')       _drawDemuxNode(node, val, hovered);
    else if (node.type === 'DECODER')     _drawDecoderNode(node, val, hovered);
    else if (node.type === 'ENCODER')     _drawEncoderNode(node, val, hovered);
    else if (node.type === 'HALF_ADDER')  _drawAdderNode(node, val, hovered, false);
    else if (node.type === 'FULL_ADDER')  _drawAdderNode(node, val, hovered, true);
    else if (node.type === 'COMPARATOR')  _drawComparatorNode(node, val, hovered);
    else if (node.type === 'ALU')        _drawAluNode(node, val, hovered);
    else if (node.type === 'IR')         _drawIrNode(node, val, hovered, ffStates);
    else if (node.type === 'CU')         _drawCuNode(node, val, hovered);
    else if (node.type === 'BUS')        _drawBusNode(node, val, hovered);
    else if (node.type === 'IMM')        _drawImmNode(node, val, hovered);
    else if (node.type === 'PIPE_REG')  _drawPipeRegNode(node, val, hovered, ffStates);
    else if (node.type === 'SIGN_EXT')  _drawSignExtNode(node, val, hovered);
    else if (node.type === 'BUS_MUX')   _drawBusMuxNode(node, val, hovered);
    else if (node.type === 'SUB_CIRCUIT') _drawSubCircuitNode(node, val, hovered);
    else if (MEMORY_TYPE_SET.has(node.type)) _drawMemoryNode(node, val, hovered, ffStates);
    else if (node.type === 'LATCH_SLOT') {
      const ffState = ffStates.get(node.id) || { q: 0, qNot: 1 };
      _drawLatchNode(node, ffState, hovered);
    }
    else if (node.type === 'FF_SLOT') {
      const ffState = ffStates.get(node.id) || { q: 0, qNot: 1 };
      _drawFfSlotNode(node, ffState, hovered);
    }
    else if (FF_TYPE_SET.has(node.type)) {
      const ffState = ffStates.get(node.id) || { q: 0, qNot: 1 };
      _drawFlipFlopNode(node, ffState, hovered);
    }

    // Selection highlight
    if (selectedNodeId === node.id) {
      ctx.save();
      ctx.strokeStyle = '#a060ff';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = (Date.now() / 60) % 10;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  });
}

// ── INPUT node ──────────────────────────────────────────────
function _drawInputNode(node, val, hovered) {
  const r = NODE.inputR;
  ctx.save();
  if (val === 1) { ctx.shadowColor = C.wireHighGlow; ctx.shadowBlur = 20; }

  if (node.stepValues && node.stepValues.length > 1) {
    const steps = node.stepValues;
    const n = steps.length;
    const activeIdx = Math.min(_stepCount, n) - 1;
    const miniR = 8;
    const spacing = miniR * 2.5;
    const totalW = (n - 1) * spacing;
    const startX = node.x - totalW / 2;

    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,16,24,0.85)';
    ctx.fill();
    ctx.strokeStyle = val === 1 ? '#1a8a1a' : '#6a1a1a';
    ctx.lineWidth   = hovered ? 2.5 : 1.5;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    for (let i = 0; i < n; i++) {
      if (i === activeIdx) continue;
      const cx = startX + i * spacing;
      const sv = steps[i];
      ctx.beginPath();
      ctx.arc(cx, node.y, miniR, 0, Math.PI * 2);
      ctx.fillStyle = sv === 1 ? 'rgba(40,180,15,0.45)' : 'rgba(200,50,50,0.4)';
      ctx.fill();
      ctx.strokeStyle = sv === 1 ? 'rgba(57,255,20,0.7)' : 'rgba(255,60,60,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(240,240,240,0.8)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sv.toString(), cx, node.y);
    }

    if (activeIdx >= 0) {
      const acx = startX + activeIdx * spacing;
      const sv = steps[activeIdx];
      ctx.beginPath();
      ctx.arc(acx, node.y, miniR + 1, 0, Math.PI * 2);
      ctx.fillStyle = sv === 1 ? 'rgba(57,255,20,0.75)' : 'rgba(255,60,60,0.65)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sv.toString(), acx, node.y);
    }
  } else {
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = val === 1 ? 'rgba(10,60,10,0.95)' : 'rgba(30,10,10,0.95)';
    ctx.fill();
    ctx.strokeStyle = val === 1 ? '#1a8a1a' : '#6a1a1a';
    ctx.lineWidth   = hovered ? 2.5 : 1.5;
    ctx.stroke();
    ctx.shadowBlur  = 0;
    ctx.fillStyle    = val === 1 ? C.textHigh : C.textLow;
    ctx.font         = 'bold 18px JetBrains Mono, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(val !== null ? val.toString() : '?', node.x, node.y);
  }

  ctx.fillStyle    = C.textDim;
  ctx.font         = 'bold 15px JetBrains Mono, monospace';
  ctx.fillText(node.label || '', node.x, node.y - r - 12);
  ctx.restore();
}

// ── CLOCK node ──────────────────────────────────────────────
function _drawClockNode(node, val, hovered) {
  const r   = NODE.clockR;
  const isH = val === 1;
  ctx.save();

  if (isH) { ctx.shadowColor = C.wireClockGlow; ctx.shadowBlur = 22; }

  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fillStyle = isH ? 'rgba(0,40,60,0.96)' : 'rgba(5,15,25,0.96)';
  ctx.fill();
  ctx.strokeStyle = isH ? C.clockBorderHigh : C.clockBorder;
  ctx.lineWidth   = hovered ? 2.5 : 1.8;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  ctx.strokeStyle = isH ? C.wireClock : 'rgba(0,150,190,0.5)';
  ctx.lineWidth   = 2;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  const bx = node.x - 14, by = node.y + 4, sw = 10, sh = 12;
  ctx.moveTo(bx,        by);
  ctx.lineTo(bx,        by - sh);
  ctx.lineTo(bx + sw,   by - sh);
  ctx.lineTo(bx + sw,   by);
  ctx.lineTo(bx + sw*2, by);
  ctx.stroke();

  ctx.fillStyle    = C.textDim;
  ctx.font         = '10px JetBrains Mono, monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('CLK', node.x, node.y - r - 10);

  ctx.fillStyle    = isH ? C.wireClock : C.textLow;
  ctx.font         = 'bold 14px JetBrains Mono, monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(val !== null ? val.toString() : '0', node.x, node.y - 6);

  ctx.restore();
}

// ── 7-SEGMENT DISPLAY node ──────────────────────────────────
function _draw7SegNode(node, hovered) {
  const w = 80, h = 120;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  const segs = node._segments || [0,0,0,0,0,0,0];
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(0,212,255,0.4)'; ctx.shadowBlur = 15; }
  ctx.fillStyle = '#0a0a0a';
  _roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = hovered ? '#00d4ff' : '#333';
  ctx.lineWidth = 2;
  _roundRect(ctx, x, y, w, h, 8);
  ctx.stroke();
  ctx.shadowBlur = 0;

  const cx = node.x, cy = node.y;
  const onColor = '#ff1a1a';
  const offColor = 'rgba(60,20,20,0.3)';
  const glowColor = 'rgba(255,26,26,0.4)';

  function drawHSeg(sx, sy, on) {
    ctx.fillStyle = on ? onColor : offColor;
    if (on) { ctx.shadowColor = glowColor; ctx.shadowBlur = 8; }
    ctx.fillRect(sx - 14, sy - 2.5, 28, 5);
    ctx.shadowBlur = 0;
  }
  function drawVSeg(sx, sy, on) {
    ctx.fillStyle = on ? onColor : offColor;
    if (on) { ctx.shadowColor = glowColor; ctx.shadowBlur = 8; }
    ctx.fillRect(sx - 2.5, sy, 5, 22);
    ctx.shadowBlur = 0;
  }

  const topY = cy - 28, midY = cy - 2, botY = cy + 24;
  const leftX = cx - 16, rightX = cx + 16;

  drawHSeg(cx, topY, segs[0]);
  drawVSeg(rightX, topY + 2, segs[1]);
  drawVSeg(rightX, midY + 2, segs[2]);
  drawHSeg(cx, botY, segs[3]);
  drawVSeg(leftX, midY + 2, segs[4]);
  drawVSeg(leftX, topY + 2, segs[5]);
  drawHSeg(cx, midY, segs[6]);

  ctx.fillStyle = '#555';
  ctx.font = '9px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(node.label || '7-SEG', node.x, y + h + 4);

  ctx.restore();
}

// ── MUX_SELECT node ─────────────────────────────────────────
function _drawMuxSelectNode(node, val, hovered) {
  const w = 50, h = 30, r = 6;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  const isOn = val === 1;
  ctx.save();

  ctx.fillStyle = isOn ? 'rgba(57,255,20,0.15)' : 'rgba(40,20,20,0.3)';
  if (hovered) { ctx.shadowColor = 'rgba(0,212,255,0.5)'; ctx.shadowBlur = 15; }
  _roundRect(ctx, x, y, w, h, r);
  ctx.fill();

  ctx.strokeStyle = hovered ? '#00d4ff' : (isOn ? '#39ff14' : '#6a1a1a');
  ctx.lineWidth = hovered ? 2.5 : 2;
  _roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.shadowBlur = 0;

  const sliderX = isOn ? node.x + 8 : node.x - 8;
  ctx.beginPath();
  ctx.arc(sliderX, node.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = isOn ? '#39ff14' : '#ff4444';
  ctx.fill();
  ctx.strokeStyle = isOn ? '#2a8a2a' : '#8a2a2a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isOn ? '1' : '0', sliderX, node.y);

  ctx.fillStyle = isOn ? '#39ff14' : '#ff4444';
  ctx.font = 'bold 10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 6);

  if (hovered) {
    ctx.fillStyle = '#00d4ff';
    ctx.font = '7px JetBrains Mono, monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('CLICK TO TOGGLE', node.x, y + h + 4);
  }

  ctx.restore();
}

// ── GATE_SLOT node ──────────────────────────────────────────
function _drawGateNode(node, val, hovered) {
  const { gateW: w, gateH: h, gateR: r } = NODE;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  const isEmpty = node.gate == null;
  if (hovered) { ctx.shadowColor = 'rgba(0,212,255,0.5)'; ctx.shadowBlur = 20; }

  ctx.fillStyle = isEmpty ? 'rgba(10,20,35,0.92)' : 'rgba(14,31,51,0.96)';
  _roundRect(ctx, x, y, w, h, r);
  ctx.fill();

  ctx.strokeStyle = hovered ? '#00d4ff' : (isEmpty ? '#3a5a7a' : '#2a5a90');
  ctx.lineWidth   = hovered ? 2 : 1.5;
  _roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.shadowBlur  = 0;

  if (isEmpty) {
    ctx.strokeStyle    = 'rgba(0,212,255,0.3)';
    ctx.lineWidth      = 1;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = (Date.now() / 80) % 12;
    _roundRect(ctx, x + 3, y + 3, w - 6, h - 6, r - 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle    = 'rgba(0,212,255,0.35)';
    ctx.font         = 'bold 20px JetBrains Mono, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', node.x, node.y);
  } else {
    ctx.fillStyle    = C.textGate;
    ctx.font         = 'bold 13px JetBrains Mono, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.gate, node.x, node.y - 7);

    if (val !== null) {
      ctx.fillStyle = val === 1 ? C.textHigh : C.textLow;
      ctx.font      = 'bold 11px JetBrains Mono, monospace';
      ctx.fillText(`= ${val}`, node.x, node.y + 10);
    }
  }

  if (isEmpty && hovered) {
    ctx.fillStyle    = '#00d4ff';
    ctx.font         = '8px JetBrains Mono, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('DROP GATE HERE', node.x, y + h + 6);
  }

  ctx.restore();
}

// ── OUTPUT node ─────────────────────────────────────────────
function _drawOutputNode(node, val, hovered) {
  const r = 36;
  ctx.save();

  const isSandbox = !!node.sandbox;

  const isBusVal = val !== null && val !== undefined && val !== 0 && val !== 1;
  if (isSandbox && val === 1) { ctx.shadowColor = C.wireHighGlow; ctx.shadowBlur = 15; }
  if (isSandbox && isBusVal)  { ctx.shadowColor = 'rgba(224,160,48,0.5)'; ctx.shadowBlur = 15; }

  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fillStyle = val === null ? 'rgba(10,14,20,0.96)' :
                  isBusVal ? 'rgba(30,20,5,0.96)' :
                  (val === 1 ? 'rgba(10,50,10,0.96)' : 'rgba(40,10,10,0.96)');
  ctx.fill();

  ctx.strokeStyle = hovered ? '#00d4ff' : '#1e3a50';
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // Step targets display
  if (node.stepTargets && node.stepTargets.length > 1) {
    const steps = node.stepTargets;
    const n = steps.length;
    const activeIdx = Math.min(_stepCount, n) - 1;
    const miniR = 8;
    const spacing = miniR * 2.5;
    const totalW = (n - 1) * spacing;
    const startX = node.x - totalW / 2;

    for (let i = 0; i < n; i++) {
      if (i === activeIdx) continue;
      const cx = startX + i * spacing;
      const sv = steps[i];
      ctx.beginPath();
      ctx.arc(cx, node.y, miniR, 0, Math.PI * 2);
      ctx.fillStyle = sv === 1 ? 'rgba(40,180,15,0.45)' : 'rgba(200,50,50,0.4)';
      ctx.fill();
      ctx.strokeStyle = sv === 1 ? 'rgba(57,255,20,0.7)' : 'rgba(255,60,60,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(240,240,240,0.8)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sv.toString(), cx, node.y);
    }
    if (activeIdx >= 0) {
      const acx = startX + activeIdx * spacing;
      const sv = steps[activeIdx];
      ctx.beginPath();
      ctx.arc(acx, node.y, miniR + 1, 0, Math.PI * 2);
      ctx.fillStyle = sv === 1 ? 'rgba(57,255,20,0.75)' : 'rgba(255,60,60,0.65)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sv.toString(), acx, node.y);
    }
  } else {
    ctx.fillStyle    = val === null ? C.wireNull : isBusVal ? '#e0a030' : (val === 1 ? C.textHigh : C.textLow);
    ctx.font         = isBusVal ? 'bold 18px JetBrains Mono, monospace' : 'bold 26px JetBrains Mono, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(val !== null ? val.toString() : '?', node.x, node.y);
  }

  ctx.fillStyle    = C.textDim;
  ctx.font         = 'bold 16px JetBrains Mono, monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, node.y - r - 12);

  ctx.restore();
}

// ── FF_SLOT node ────────────────────────────────────────────
function _drawFfSlotNode(node, ffState, hovered) {
  const { ffW: w, ffH: h, ffR: r } = NODE;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  const isEmpty = !node.ffType;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(160,96,255,0.5)'; ctx.shadowBlur = 22; }

  ctx.fillStyle = isEmpty ? 'rgba(14,8,28,0.94)' : 'rgba(18,13,34,0.97)';
  _roundRect(ctx, x, y, w, h, r);
  ctx.fill();

  ctx.strokeStyle = hovered ? '#a060ff' : (isEmpty ? '#3a1a6a' : '#5a2a9a');
  ctx.lineWidth   = hovered ? 2 : 1.5;
  _roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.shadowBlur  = 0;

  if (isEmpty) {
    ctx.strokeStyle    = 'rgba(160,96,255,0.35)';
    ctx.lineWidth      = 1;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = (Date.now() / 80) % 12;
    _roundRect(ctx, x + 3, y + 3, w - 6, h - 6, r - 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle    = 'rgba(160,96,255,0.4)';
    ctx.font         = 'bold 18px JetBrains Mono, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FF?', node.x, node.initialQ != null ? node.y - 10 : node.y);

    if (node.initialQ != null) {
      ctx.fillStyle = node.initialQ === 1 ? '#39ff14' : '#ff4444';
      ctx.font      = 'bold 12px JetBrains Mono, monospace';
      ctx.fillText('Q\u2080=' + node.initialQ, node.x, node.y + 12);
    }

    if (hovered) {
      ctx.fillStyle    = '#a060ff';
      ctx.font         = '8px JetBrains Mono, monospace';
      ctx.textBaseline = 'top';
      ctx.fillText('DROP FF HERE', node.x, y + h + 6);
    }
  } else {
    _drawFlipFlopNode(node, ffState, false);

    if (node.initialQ != null && _stepCount === 0) {
      ctx.fillStyle = node.initialQ === 1 ? '#39ff14' : '#ff4444';
      ctx.font      = 'bold 12px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('Q\u2080=' + node.initialQ, node.x, y + h + 6);
    }
  }

  ctx.restore();
}

// ── MUX node ────────────────────────────────────────────────
function _drawMuxNode(node, val, hovered) {
  const { w, h } = _muxNodeSize(node);
  const n = node.inputCount || 2;
  const selCount = Math.ceil(Math.log2(n));
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(32,212,160,0.5)'; ctx.shadowBlur = 18; }

  // Trapezoid shape (wide left, narrow right)
  ctx.fillStyle = 'rgba(10,26,26,0.96)';
  ctx.beginPath();
  ctx.moveTo(x,     y);          // top-left
  ctx.lineTo(x + w, y + 12);    // top-right (narrower)
  ctx.lineTo(x + w, y + h - 12);// bottom-right
  ctx.lineTo(x,     y + h);     // bottom-left
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = hovered ? C.blockBorderHover : C.blockBorder;
  ctx.lineWidth = hovered ? 2 : 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Label
  ctx.fillStyle = C.blockText;
  ctx.font = 'bold 11px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MUX', node.x, node.y - 6);

  // Size label
  ctx.fillStyle = '#4a6080';
  ctx.font = '9px JetBrains Mono, monospace';
  ctx.fillText(n + ':1', node.x, node.y + 8);

  // Input labels on left
  const spread = (h - 20) / Math.max(1, n - 1);
  const startY = node.y - (h - 20) / 2;
  ctx.fillStyle = '#4a6080';
  ctx.font = '7px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i < n; i++) {
    ctx.fillText(i.toString(), x + 10, startY + i * spread + 1);
  }

  // Select label at bottom
  ctx.textAlign = 'center';
  ctx.fillText('SEL', node.x, y + h + 10);

  // Output value
  if (val !== null) {
    ctx.fillStyle = val === 1 ? C.textHigh : C.textLow;
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(val.toString(), x + w + 4, node.y + 1);
  }

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 8);

  ctx.restore();
}

// ── DEMUX node ──────────────────────────────────────────────
function _drawDemuxNode(node, val, hovered) {
  const { w, h } = _muxNodeSize(node);
  const outCount = node.outputCount || 2;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(32,212,160,0.5)'; ctx.shadowBlur = 18; }

  // Trapezoid shape (narrow left, wide right — opposite of MUX)
  ctx.fillStyle = 'rgba(10,26,26,0.96)';
  ctx.beginPath();
  ctx.moveTo(x,     y + 12);    // top-left (narrower)
  ctx.lineTo(x + w, y);          // top-right
  ctx.lineTo(x + w, y + h);     // bottom-right
  ctx.lineTo(x,     y + h - 12);// bottom-left
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = hovered ? C.blockBorderHover : C.blockBorder;
  ctx.lineWidth = hovered ? 2 : 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Label
  ctx.fillStyle = C.blockText;
  ctx.font = 'bold 10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DEMUX', node.x, node.y - 6);

  // Size label
  ctx.fillStyle = '#4a6080';
  ctx.font = '9px JetBrains Mono, monospace';
  ctx.fillText('1:' + outCount, node.x, node.y + 8);

  // Output labels on right
  const spread = (h - 20) / Math.max(1, outCount - 1);
  const startY = node.y - (h - 20) / 2;
  ctx.fillStyle = '#4a6080';
  ctx.font = '7px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  for (let i = 0; i < outCount; i++) {
    ctx.fillText(i.toString(), x + w - 10, startY + i * spread + 1);
  }

  // Select label at bottom
  ctx.textAlign = 'center';
  ctx.fillText('SEL', node.x, y + h + 10);

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 8);

  ctx.restore();
}

// ── Node Anchor Dots (shown in wire mode) ───────────────────
function _drawNodeAnchors(node) {
  ctx.save();

  // Output anchors — green
  const outAnchors = getOutputAnchors(node);
  for (const a of outAnchors) {
    ctx.beginPath();
    ctx.arc(a.x, a.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(57,255,20,0.5)';
    ctx.fill();
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#39ff14';
    ctx.font = 'bold 7px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(a.label, a.x + 8, a.y);
  }

  // Input anchors — cyan
  const inAnchors = getInputAnchors(node);
  for (const a of inAnchors) {
    ctx.beginPath();
    ctx.arc(a.x, a.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,212,255,0.5)';
    ctx.fill();
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 7px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(a.label, a.x - 8, a.y);
  }

  ctx.restore();
}

// ── ADDER node (Half / Full) ─────────────────────────────────
function _drawAdderNode(node, val, hovered, isFull) {
  const w = 90, h = 56;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(32,212,160,0.5)'; ctx.shadowBlur = 18; }

  ctx.fillStyle = 'rgba(10,26,26,0.96)';
  _roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = hovered ? C.blockBorderHover : C.blockBorder;
  ctx.lineWidth = hovered ? 2 : 1.5;
  _roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // "+" symbol
  ctx.fillStyle = C.blockText;
  ctx.font = 'bold 20px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('+', node.x - 10, node.y);

  // Label
  ctx.font = 'bold 9px JetBrains Mono, monospace';
  ctx.fillText(isFull ? 'FA' : 'HA', node.x + 18, node.y);

  // Input labels
  ctx.fillStyle = '#4a6080';
  ctx.font = '7px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  ctx.fillText('A', x + 10, node.y - 12);
  ctx.fillText('B', x + 10, node.y + 12);
  if (isFull) ctx.fillText('Cin', x + 14, node.y);

  // Output labels
  ctx.textAlign = 'left';
  ctx.fillText('S', x + w - 10, node.y - 12);
  ctx.fillText('C', x + w - 10, node.y + 12);

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 8);

  ctx.restore();
}

// ── COMPARATOR node ─────────────────────────────────────────
function _drawComparatorNode(node, val, hovered) {
  const w = 90, h = 56;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(32,212,160,0.5)'; ctx.shadowBlur = 18; }

  ctx.fillStyle = 'rgba(10,26,26,0.96)';
  _roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = hovered ? C.blockBorderHover : C.blockBorder;
  ctx.lineWidth = hovered ? 2 : 1.5;
  _roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // "=" symbol
  ctx.fillStyle = C.blockText;
  ctx.font = 'bold 16px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CMP', node.x - 6, node.y);

  // Input labels
  ctx.fillStyle = '#4a6080';
  ctx.font = '7px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  ctx.fillText('A', x + 10, node.y - 12);
  ctx.fillText('B', x + 10, node.y + 12);

  // Output labels
  ctx.textAlign = 'left';
  ctx.fillText('EQ', x + w - 14, node.y - 16);
  ctx.fillText('GT', x + w - 14, node.y);
  ctx.fillText('LT', x + w - 14, node.y + 16);

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 8);

  ctx.restore();
}

// ── PIPE_REG node ───────────────────────────────────────────
function _drawPipeRegNode(node, val, hovered, ffStates) {
  const ch = node.channels || 4;
  const w = 100, h = Math.max(60, ch * 20 + 20);
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(128,90,213,0.5)'; ctx.shadowBlur = 18; }

  ctx.fillStyle = 'rgba(16,12,28,0.96)';
  _roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  // Double vertical lines to indicate pipeline stage boundary
  ctx.strokeStyle = hovered ? '#a078e0' : '#5a3d8a';
  ctx.lineWidth = hovered ? 2 : 1.5;
  _roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(node.x, y + 4);
  ctx.lineTo(node.x, y + h - 4);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Title
  ctx.fillStyle = '#c0a0f0';
  ctx.font = 'bold 9px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PIPE', node.x, y + 10);
  ctx.fillStyle = '#6a5090';
  ctx.font = '7px JetBrains Mono, monospace';
  ctx.fillText(ch + 'ch', node.x, y + 20);

  // Channel values
  const ms = ffStates?.get(node.id);
  const chData = ms?.channels || [];
  const spread = (h - 16) / Math.max(1, ch - 1);
  const startY = node.y - (h - 16) / 2;
  ctx.font = '7px JetBrains Mono, monospace';
  for (let i = 0; i < ch; i++) {
    const py = ch === 1 ? node.y : startY + i * spread;
    // Input label
    ctx.fillStyle = '#6a5090';
    ctx.textAlign = 'right';
    ctx.fillText('D' + i, x + 14, py + 1);
    // Output label + value
    ctx.textAlign = 'left';
    ctx.fillText('Q' + i, x + w - 14, py + 1);
    const v = chData[i] ?? 0;
    if (v !== 0) {
      ctx.fillStyle = '#39ff14';
      ctx.fillText(v.toString(), x + w - 26, py + 1);
    }
  }

  // CLK triangle at bottom
  ctx.strokeStyle = '#6a5090';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(node.x - 5, y + h - 2);
  ctx.lineTo(node.x, y + h - 8);
  ctx.lineTo(node.x + 5, y + h - 2);
  ctx.stroke();

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 8);

  ctx.restore();
}

// ── SIGN_EXT node ───────────────────────────────────────────
function _drawSignExtNode(node, val, hovered) {
  const w = 90, h = 44;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(32,212,160,0.5)'; ctx.shadowBlur = 18; }

  // Trapezoid: narrow left, wide right (expanding)
  ctx.fillStyle = 'rgba(10,26,26,0.96)';
  ctx.beginPath();
  ctx.moveTo(x,     y + 8);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x,     y + h - 8);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = hovered ? C.blockBorderHover : C.blockBorder;
  ctx.lineWidth = hovered ? 2 : 1.5;
  ctx.beginPath();
  ctx.moveTo(x,     y + 8);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x,     y + h - 8);
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Label
  ctx.fillStyle = C.blockText;
  ctx.font = 'bold 9px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SEXT', node.x, node.y - 6);

  // Size label
  ctx.fillStyle = '#4a6080';
  ctx.font = '8px JetBrains Mono, monospace';
  ctx.fillText((node.inBits || 4) + '→' + (node.outBits || 8), node.x, node.y + 7);

  // Value
  if (val !== null && val !== undefined) {
    ctx.fillStyle = '#39ff14';
    ctx.font = 'bold 8px JetBrains Mono, monospace';
    ctx.fillText('0x' + (val >>> 0).toString(16).toUpperCase(), node.x, node.y + 18);
  }

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 8);

  ctx.restore();
}

// ── BUS_MUX node ────────────────────────────────────────────
function _drawBusMuxNode(node, val, hovered) {
  const n = node.inputCount || 2;
  const w = 90, h = Math.max(50, n * 22 + 10);
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(224,160,48,0.5)'; ctx.shadowBlur = 18; }

  // Trapezoid shape (wide left, narrow right)
  ctx.fillStyle = 'rgba(20,14,8,0.96)';
  ctx.beginPath();
  ctx.moveTo(x,     y);           // top-left
  ctx.lineTo(x + w, y + 12);      // top-right (narrower)
  ctx.lineTo(x + w, y + h - 12);  // bottom-right
  ctx.lineTo(x,     y + h);       // bottom-left (wider)
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = hovered ? '#e0a030' : '#8a6020';
  ctx.lineWidth = hovered ? 2 : 1.5;
  ctx.beginPath();
  ctx.moveTo(x,     y);
  ctx.lineTo(x + w, y + 12);
  ctx.lineTo(x + w, y + h - 12);
  ctx.lineTo(x,     y + h);
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Label
  ctx.fillStyle = '#e0a030';
  ctx.font = 'bold 10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BUS', node.x - 4, node.y - 8);
  ctx.fillText('MUX', node.x - 4, node.y + 4);

  // Input labels
  ctx.fillStyle = '#6a5030';
  ctx.font = '7px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  const spread = (h - 14) / Math.max(1, n - 1);
  const startY = node.y - (h - 14) / 2;
  for (let i = 0; i < n; i++) {
    const py = n === 1 ? node.y : startY + i * spread;
    ctx.fillText(String.fromCharCode(65 + i), x + 14, py + 1);
  }

  // SEL label at bottom
  ctx.textAlign = 'center';
  ctx.fillText('SEL', node.x, y + h + 10);

  // Output label
  ctx.textAlign = 'left';
  ctx.fillText('Y', x + w - 14, node.y + 1);

  // Show value
  if (val !== null && val !== undefined) {
    ctx.fillStyle = '#39ff14';
    ctx.font = 'bold 8px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0x' + (val >>> 0).toString(16).toUpperCase(), node.x - 4, node.y + 16);
  }

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 8);

  ctx.restore();
}

// ── SUB_CIRCUIT node ────────────────────────────────────────
function _drawSubCircuitNode(node, val, hovered) {
  const ins = node.subInputs || [];
  const outs = node.subOutputs || [];
  const maxPins = Math.max(ins.length, outs.length, 1);
  const w = 120, h = Math.max(60, maxPins * 20 + 20);
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(0,212,255,0.4)'; ctx.shadowBlur = 18; }

  // Double-border box
  ctx.fillStyle = 'rgba(8,14,24,0.96)';
  _roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = hovered ? '#00d4ff' : '#2a6080';
  ctx.lineWidth = 2;
  _roundRect(ctx, x, y, w, h, 8);
  ctx.stroke();
  // Inner border
  ctx.strokeStyle = hovered ? 'rgba(0,212,255,0.3)' : 'rgba(42,96,128,0.3)';
  ctx.lineWidth = 1;
  _roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 6);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Title
  ctx.fillStyle = '#00d4ff';
  ctx.font = 'bold 11px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(node.subName || node.label || 'BLOCK', node.x, node.y - 6);

  // Pin count label
  ctx.fillStyle = '#2a5070';
  ctx.font = '8px JetBrains Mono, monospace';
  ctx.fillText(ins.length + ' in / ' + outs.length + ' out', node.x, node.y + 8);

  // Input labels
  const inSpread = (h - 16) / Math.max(1, ins.length - 1);
  const inStartY = node.y - (h - 16) / 2;
  ctx.fillStyle = '#2a5070';
  ctx.font = '7px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i < ins.length; i++) {
    const py = ins.length === 1 ? node.y : inStartY + i * inSpread;
    ctx.fillText(ins[i].label, x + 18, py + 1);
  }

  // Output labels
  const outSpread = (h - 16) / Math.max(1, outs.length - 1);
  const outStartY = node.y - (h - 16) / 2;
  ctx.textAlign = 'left';
  for (let i = 0; i < outs.length; i++) {
    const py = outs.length === 1 ? node.y : outStartY + i * outSpread;
    ctx.fillText(outs[i].label, x + w - 18, py + 1);
  }

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 8);

  ctx.restore();
}

// ── IMM (Immediate/Constant) node ───────────────────────────
function _drawImmNode(node, val, hovered) {
  const r = NODE.inputR;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(255,160,40,0.5)'; ctx.shadowBlur = 18; }

  // Diamond shape
  ctx.fillStyle = 'rgba(20,14,8,0.96)';
  ctx.beginPath();
  ctx.moveTo(node.x, node.y - r);
  ctx.lineTo(node.x + r, node.y);
  ctx.lineTo(node.x, node.y + r);
  ctx.lineTo(node.x - r, node.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hovered ? '#ffa028' : '#8a6020';
  ctx.lineWidth = hovered ? 2 : 1.5;
  ctx.beginPath();
  ctx.moveTo(node.x, node.y - r);
  ctx.lineTo(node.x + r, node.y);
  ctx.lineTo(node.x, node.y + r);
  ctx.lineTo(node.x - r, node.y);
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Value
  const bits = node.bitWidth || 8;
  const v = (node.value ?? 0) & ((1 << bits) - 1);
  ctx.fillStyle = '#ffa028';
  ctx.font = 'bold 10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('0x' + v.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0'), node.x, node.y);

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, node.y - r - 6);

  ctx.restore();
}

// ── BUS node ────────────────────────────────────────────────
function _drawBusNode(node, val, hovered) {
  const srcCount = node.sourceCount || 3;
  const w = 100, h = Math.max(60, srcCount * 28 + 10);
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(255,160,40,0.5)'; ctx.shadowBlur = 18; }

  ctx.fillStyle = 'rgba(20,14,8,0.96)';
  _roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = hovered ? '#ffa028' : '#8a6020';
  ctx.lineWidth = hovered ? 2 : 1.5;
  _roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Title
  ctx.fillStyle = '#ffa028';
  ctx.font = 'bold 12px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BUS', node.x, node.y - 8);

  // Value
  ctx.fillStyle = val === null ? '#4a3020' : '#39ff14';
  ctx.font = 'bold 10px JetBrains Mono, monospace';
  ctx.fillText(val === null ? 'Hi-Z' : '0x' + (val >>> 0).toString(16).toUpperCase(), node.x, node.y + 6);

  // Source count
  ctx.fillStyle = '#6a5030';
  ctx.font = '8px JetBrains Mono, monospace';
  ctx.fillText(srcCount + ' src', node.x, node.y + 18);

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 6);

  ctx.restore();
}

// ── CU (Control Unit) node ──────────────────────────────────
function _drawCuNode(node, val, hovered) {
  const w = 120, h = 110;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(255,160,40,0.5)'; ctx.shadowBlur = 18; }

  ctx.fillStyle = 'rgba(20,14,8,0.96)';
  _roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = hovered ? '#ffa028' : '#8a6020';
  ctx.lineWidth = hovered ? 2 : 1.5;
  _roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Title
  ctx.fillStyle = '#ffa028';
  ctx.font = 'bold 13px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CONTROL', node.x, node.y - 14);
  ctx.fillText('UNIT', node.x, node.y);

  // Opcode names for reference
  const opNames = ['ADD','SUB','AND','OR','XOR','SHL','SHR','CMP','LD','ST','JMP','JZ','JC','MOV','NOP','HLT'];
  ctx.fillStyle = '#6a5030';
  ctx.font = '7px JetBrains Mono, monospace';
  ctx.fillText(opNames[val & 0xF] || '?', node.x, node.y + 16);

  // Input labels
  ctx.textAlign = 'right';
  const inSpread = 22;
  const inStartY = node.y - inSpread;
  ctx.fillText('OP', x + 14, inStartY + 1);
  ctx.fillText('Z', x + 12, inStartY + inSpread + 1);
  ctx.fillText('C', x + 12, inStartY + inSpread * 2 + 1);

  // Output labels
  const outLabels = ['ALU_OP', 'RG_WE', 'MM_WE', 'MM_RE', 'JMP', 'HALT'];
  const outSpread = (h - 20) / 5;
  const outStartY = node.y - (h - 20) / 2;
  ctx.textAlign = 'left';
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = '#6a5030';
    ctx.fillText(outLabels[i], x + w - 38, outStartY + i * outSpread + 1);
  }

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 6);

  ctx.restore();
}

// ── IR (Instruction Register) node ──────────────────────────
function _drawIrNode(node, val, hovered, ffStates) {
  const w = 110, h = 80;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(255,160,40,0.5)'; ctx.shadowBlur = 18; }

  ctx.fillStyle = 'rgba(20,14,8,0.96)';
  _roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = hovered ? '#ffa028' : '#8a6020';
  ctx.lineWidth = hovered ? 2 : 1.5;
  _roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Title
  ctx.fillStyle = '#ffa028';
  ctx.font = 'bold 12px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('IR', node.x, y + 12);

  // Show stored instruction hex
  const ms = ffStates?.get(node.id);
  const instr = ms ? (ms.q ?? 0) : 0;
  const iWidth = node.instrWidth || 16;
  ctx.fillStyle = '#39ff14';
  ctx.font = 'bold 9px JetBrains Mono, monospace';
  ctx.fillText('0x' + instr.toString(16).toUpperCase().padStart(Math.ceil(iWidth / 4), '0'), node.x, y + 24);

  // Decoded fields
  const opBits = node.opBits || 4, rdBits = node.rdBits || 4, rs1Bits = node.rs1Bits || 4, rs2Bits = node.rs2Bits || 4;
  const opVal  = (instr >> (rs2Bits + rs1Bits + rdBits)) & ((1 << opBits) - 1);
  const rdVal  = (instr >> (rs2Bits + rs1Bits))          & ((1 << rdBits) - 1);
  const rs1Val = (instr >> rs2Bits)                       & ((1 << rs1Bits) - 1);
  const rs2Val = instr                                    & ((1 << rs2Bits) - 1);

  // Output labels with values
  const spread = (h - 20) / 3;
  const startY = node.y - (h - 20) / 2;
  const fields = [
    { label: 'OP', val: opVal },
    { label: 'RD', val: rdVal },
    { label: 'RS1', val: rs1Val },
    { label: 'RS2', val: rs2Val },
  ];
  ctx.font = '7px JetBrains Mono, monospace';
  for (let i = 0; i < fields.length; i++) {
    const fy = startY + i * spread;
    ctx.fillStyle = '#6a5030';
    ctx.textAlign = 'left';
    ctx.fillText(fields[i].label, x + w - 28, fy + 1);
    ctx.fillStyle = '#aaa';
    ctx.fillText(fields[i].val.toString(), x + w - 10, fy + 1);
  }

  // Input labels
  ctx.fillStyle = '#6a5030';
  ctx.textAlign = 'right';
  ctx.fillText('INSTR', x + 20, node.y - 11 + 1);
  ctx.fillText('LD', x + 14, node.y + 11 + 1);

  // CLK triangle
  ctx.strokeStyle = '#6a5030';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(node.x - 5, y + h - 2);
  ctx.lineTo(node.x, y + h - 8);
  ctx.lineTo(node.x + 5, y + h - 2);
  ctx.stroke();

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 6);

  ctx.restore();
}

// ── ALU node ────────────────────────────────────────────────
function _drawAluNode(node, val, hovered) {
  const w = 110, h = 76;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(255,160,40,0.5)'; ctx.shadowBlur = 18; }

  // ALU trapezoid shape
  ctx.fillStyle = 'rgba(20,14,8,0.96)';
  ctx.beginPath();
  ctx.moveTo(x,     y + 8);        // top-left
  ctx.lineTo(x + w, y + 16);       // top-right (narrower)
  ctx.lineTo(x + w, y + h - 16);   // bottom-right
  ctx.lineTo(x,     y + h - 8);    // bottom-left (wider)
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = hovered ? '#ffa028' : '#8a6020';
  ctx.lineWidth = hovered ? 2 : 1.5;
  ctx.beginPath();
  ctx.moveTo(x,     y + 8);
  ctx.lineTo(x + w, y + 16);
  ctx.lineTo(x + w, y + h - 16);
  ctx.lineTo(x,     y + h - 8);
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // "ALU" label
  ctx.fillStyle = '#ffa028';
  ctx.font = 'bold 14px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ALU', node.x - 8, node.y - 8);

  // Operation names
  const opNames = ['ADD', 'SUB', 'AND', 'OR', 'XOR', 'SHL', 'SHR', 'CMP'];
  const bits = node.bitWidth || 8;
  ctx.fillStyle = '#6a5030';
  ctx.font = '8px JetBrains Mono, monospace';
  ctx.fillText(bits + '-bit', node.x - 8, node.y + 6);

  // Show current result
  if (val !== null && val !== undefined) {
    ctx.fillStyle = '#39ff14';
    ctx.font = 'bold 9px JetBrains Mono, monospace';
    ctx.fillText('0x' + (val >>> 0).toString(16).toUpperCase().padStart(Math.ceil(bits/4), '0'), node.x - 8, node.y + 18);
  }

  // Input labels
  ctx.fillStyle = '#6a5030';
  ctx.font = '7px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  ctx.fillText('A', x + 12, node.y - 18 + 1);
  ctx.fillText('B', x + 12, node.y + 1);
  ctx.fillText('OP', x + 14, node.y + 18 + 1);

  // Output labels
  ctx.textAlign = 'left';
  ctx.fillText('R', x + w - 12, node.y - 18 + 1);
  ctx.fillText('Z', x + w - 10, node.y + 1);
  ctx.fillText('C', x + w - 10, node.y + 18 + 1);

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 2);

  ctx.restore();
}

function _memoryInputLabel(node, i) {
  if (node.type === 'REGISTER')  return ['DATA', 'EN', 'CLR', 'CLK'][i] || '';
  if (node.type === 'SHIFT_REG') return ['DIN', 'DIR', 'EN', 'CLR', 'CLK'][i] || '';
  if (node.type === 'COUNTER')   return ['EN', 'LOAD', 'DATA', 'CLR', 'CLK'][i] || '';
  if (node.type === 'RAM')       return ['ADDR', 'DATA', 'WE', 'RE', 'CLK'][i] || '';
  if (node.type === 'ROM')       return ['ADDR', 'RE', 'CLK'][i] || '';
  if (node.type === 'REG_FILE') return ['RD_A', 'WR_A', 'WR_D', 'WE', 'CLK'][i] || '';
  if (node.type === 'FIFO')     return ['DATA', 'WR', 'RD', 'CLR', 'CLK'][i] || '';
  if (node.type === 'STACK')    return ['DATA', 'PUSH', 'POP', 'CLR', 'CLK'][i] || '';
  if (node.type === 'PC')       return ['JMP_A', 'JMP', 'EN', 'CLR', 'CLK'][i] || '';
  if (node.type === 'IR')       return ['INSTR', 'LD', 'CLK'][i] || '';
  return i.toString();
}

function _memoryNodeSize(node) {
  const inCount = _getNodeInputCount(node);
  const outCount = (node.type === 'FIFO' || node.type === 'STACK') ? 3 : node.type === 'COUNTER' ? 2 : 1;
  const maxPins = Math.max(inCount, outCount);
  const w = 100;
  const h = Math.max(60, maxPins * 18 + 16);
  return { w, h };
}

// ── MEMORY node (Register, Shift Reg, Counter, RAM, ROM) ────
function _drawMemoryNode(node, val, hovered, ffStates) {
  const { w, h } = _memoryNodeSize(node);
  const bits = node.bitWidth || node.dataBits || 4;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(128,90,213,0.5)'; ctx.shadowBlur = 18; }

  // Body
  ctx.fillStyle = 'rgba(16,12,28,0.96)';
  _roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = hovered ? '#a078e0' : '#5a3d8a';
  ctx.lineWidth = hovered ? 2 : 1.5;
  _roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Type label
  const typeLabels = { REGISTER: 'REG', SHIFT_REG: 'SHREG', COUNTER: 'CNT', RAM: 'RAM', ROM: 'ROM', REG_FILE: 'REG FILE', FIFO: 'FIFO', STACK: 'STACK', PC: 'PC' };
  ctx.fillStyle = '#c0a0f0';
  ctx.font = 'bold 11px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(typeLabels[node.type] || node.type, node.x, node.y - 10);

  // Bit width + current value
  const ms = ffStates?.get(node.id);
  const qVal = ms ? (ms.q ?? 0) : 0;
  ctx.fillStyle = '#6a5090';
  ctx.font = '8px JetBrains Mono, monospace';
  ctx.fillText(bits + '-bit', node.x, node.y + 2);

  // Show current value in hex
  ctx.fillStyle = '#39ff14';
  ctx.font = 'bold 10px JetBrains Mono, monospace';
  ctx.fillText('0x' + qVal.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0'), node.x, node.y + 14);

  // FIFO/STACK: show fill level
  if (node.type === 'FIFO' || node.type === 'STACK') {
    const depth = node.depth || 8;
    const bufLen = ms ? (ms.buffer?.length ?? 0) : 0;
    ctx.fillStyle = '#6a5090';
    ctx.font = '8px JetBrains Mono, monospace';
    ctx.fillText(bufLen + '/' + depth, node.x, node.y + 24);
  }

  // Input labels on left
  const inCount = _getNodeInputCount(node);
  const inDataCount = inCount - 1; // exclude CLK
  const inSpread = (h - 20) / Math.max(1, inDataCount - 1);
  const inStartY = node.y - (h - 20) / 2;
  ctx.fillStyle = '#6a5090';
  ctx.font = '7px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i < inDataCount; i++) {
    const pinY = inDataCount === 1 ? node.y : inStartY + i * inSpread;
    ctx.fillText(_memoryInputLabel(node, i), x + 14, pinY + 1);
  }

  // Output label on right
  ctx.textAlign = 'left';
  ctx.fillStyle = '#6a5090';
  ctx.fillText('Q', x + w - 12, node.y + 1);
  if (node.type === 'COUNTER') {
    ctx.fillText('TC', x + w - 14, node.y + 18);
  }

  // CLK triangle at bottom-left
  ctx.strokeStyle = '#6a5090';
  ctx.lineWidth = 1;
  const clkX = node.x;
  const clkY = y + h;
  ctx.beginPath();
  ctx.moveTo(clkX - 5, clkY - 2);
  ctx.lineTo(clkX, clkY - 8);
  ctx.lineTo(clkX + 5, clkY - 2);
  ctx.stroke();

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 8);

  ctx.restore();
}

// ── DECODER node ────────────────────────────────────────────
function _drawDecoderNode(node, val, hovered) {
  const { w, h } = _muxNodeSize(node);
  const n = node.inputBits || 2;
  const outCount = 1 << n;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(32,212,160,0.5)'; ctx.shadowBlur = 18; }

  // Rectangle shape
  ctx.fillStyle = 'rgba(10,26,26,0.96)';
  _roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = hovered ? C.blockBorderHover : C.blockBorder;
  ctx.lineWidth = hovered ? 2 : 1.5;
  _roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Label
  ctx.fillStyle = C.blockText;
  ctx.font = 'bold 10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DECODE', node.x, node.y - 6);
  ctx.fillStyle = '#4a6080';
  ctx.font = '9px JetBrains Mono, monospace';
  ctx.fillText(n + ':' + outCount, node.x, node.y + 8);

  // Input labels
  const inSpread = 22;
  const inStartY = node.y - (n - 1) * inSpread / 2;
  ctx.fillStyle = '#4a6080';
  ctx.font = '7px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i < n; i++) {
    ctx.fillText('A' + i, x + 10, inStartY + i * inSpread + 1);
  }

  // Output labels
  const outSpread = (h - 20) / Math.max(1, outCount - 1);
  const outStartY = node.y - (h - 20) / 2;
  ctx.textAlign = 'left';
  for (let i = 0; i < outCount; i++) {
    ctx.fillText('Y' + i, x + w - 12, outStartY + i * outSpread + 1);
  }

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 8);

  ctx.restore();
}

// ── ENCODER node ────────────────────────────────────────────
function _drawEncoderNode(node, val, hovered) {
  const { w, h } = _muxNodeSize(node);
  const inLines = node.inputLines || 4;
  const outBits = Math.ceil(Math.log2(inLines));
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(32,212,160,0.5)'; ctx.shadowBlur = 18; }

  // Rectangle shape
  ctx.fillStyle = 'rgba(10,26,26,0.96)';
  _roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = hovered ? C.blockBorderHover : C.blockBorder;
  ctx.lineWidth = hovered ? 2 : 1.5;
  _roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Label
  ctx.fillStyle = C.blockText;
  ctx.font = 'bold 10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ENCODE', node.x, node.y - 6);
  ctx.fillStyle = '#4a6080';
  ctx.font = '9px JetBrains Mono, monospace';
  ctx.fillText(inLines + ':' + outBits, node.x, node.y + 8);

  // Input labels
  const inSpread = (h - 20) / Math.max(1, inLines - 1);
  const inStartY = node.y - (h - 20) / 2;
  ctx.fillStyle = '#4a6080';
  ctx.font = '7px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i < inLines; i++) {
    ctx.fillText('I' + i, x + 10, inStartY + i * inSpread + 1);
  }

  // Output labels
  const outTotal = outBits + 1; // bits + valid
  const outSpread = 18;
  const outStartY = node.y - (outTotal - 1) * outSpread / 2;
  ctx.textAlign = 'left';
  for (let b = 0; b < outBits; b++) {
    ctx.fillText('B' + b, x + w - 12, outStartY + b * outSpread + 1);
  }
  ctx.fillText('V', x + w - 12, outStartY + outBits * outSpread + 1);

  // Node label above
  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 8);

  ctx.restore();
}

// ── LATCH node ──────────────────────────────────────────────
function _drawLatchNode(node, ffState, hovered) {
  const { ffW: w, ffH: h, ffR: r } = NODE;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  const { q, qNot } = ffState;
  const isEmpty = !node.latchType;
  ctx.save();

  if (hovered) { ctx.shadowColor = 'rgba(255,153,51,0.5)'; ctx.shadowBlur = 22; }
  else if (q === 1) { ctx.shadowColor = 'rgba(255,153,51,0.4)'; ctx.shadowBlur = 16; }

  // Background
  ctx.fillStyle = isEmpty ? 'rgba(20,14,8,0.94)' : 'rgba(28,18,8,0.97)';
  _roundRect(ctx, x, y, w, h, r);
  ctx.fill();

  // Border — orange tint to distinguish from FF (purple)
  ctx.strokeStyle = hovered ? '#ff9933' : (isEmpty ? '#5a3a1a' : '#9a6a2a');
  ctx.lineWidth   = hovered ? 2 : 1.5;
  _roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.shadowBlur  = 0;

  if (isEmpty) {
    ctx.fillStyle    = 'rgba(255,153,51,0.4)';
    ctx.font         = 'bold 16px JetBrains Mono, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LATCH?', node.x, node.y);
  } else {
    // Divider
    const divX = node.x + 14;
    ctx.strokeStyle = 'rgba(154,106,42,0.5)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(divX, y + 8);
    ctx.lineTo(divX, y + h - 8);
    ctx.stroke();

    // Latch type label
    const label = node.latchType.replace('_', '-');
    ctx.fillStyle    = '#ff9933';
    ctx.font         = 'bold 13px JetBrains Mono, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, node.x - 20, node.y);

    // Q output
    const qColor = q === 1 ? C.ffQhigh : C.ffQlow;
    ctx.fillStyle    = 'rgba(200,200,200,0.5)';
    ctx.font         = '9px JetBrains Mono, monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Q', divX + 5, node.y - 18);
    ctx.fillStyle    = qColor;
    ctx.font         = 'bold 14px JetBrains Mono, monospace';
    ctx.fillText(q.toString(), divX + 22, node.y - 18);

    // QNot output
    const qnColor = qNot === 1 ? C.ffQhigh : C.ffQlow;
    ctx.fillStyle    = 'rgba(200,200,200,0.5)';
    ctx.font         = '9px JetBrains Mono, monospace';
    ctx.fillText('Q\u0304', divX + 5, node.y + 18);
    ctx.fillStyle    = qnColor;
    ctx.font         = 'bold 14px JetBrains Mono, monospace';
    ctx.fillText(qNot.toString(), divX + 22, node.y + 18);

    // Level-sensitive indicator (no triangle like FF — use bar instead)
    ctx.fillStyle  = '#ff9933';
    ctx.fillRect(x + 3, node.y + 10, 8, 3);
  }

  // Label above
  ctx.fillStyle    = C.textDim;
  ctx.font         = '10px JetBrains Mono, monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 10);

  ctx.restore();
}

// ── FLIPFLOP node ───────────────────────────────────────────
function _drawFlipFlopNode(node, ffState, hovered) {
  const { ffW: w, ffH: h, ffR: r } = NODE;
  const x = node.x - w / 2;
  const y = node.y - h / 2;
  const { q, qNot } = ffState;
  ctx.save();

  if (q === 1) { ctx.shadowColor = 'rgba(160,96,255,0.5)'; ctx.shadowBlur = 20; }
  if (hovered) { ctx.shadowColor = 'rgba(0,212,255,0.5)';  ctx.shadowBlur = 22; }

  ctx.fillStyle = 'rgba(18,13,34,0.97)';
  _roundRect(ctx, x, y, w, h, r);
  ctx.fill();

  ctx.strokeStyle = hovered ? C.accentCyan : (q === 1 ? C.ffBorderActive : C.ffBorder);
  ctx.lineWidth   = hovered ? 2 : 1.8;
  _roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.shadowBlur  = 0;

  const divX = node.x + 14;
  ctx.strokeStyle = 'rgba(90,42,154,0.5)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(divX, y + 8);
  ctx.lineTo(divX, y + h - 8);
  ctx.stroke();

  const ffLabel = node.ffType ||
    ({ FLIPFLOP_D: 'D', FLIPFLOP_SR: 'SR', FLIPFLOP_JK: 'JK', FLIPFLOP_T: 'T' }[node.type]) || '?';
  ctx.fillStyle    = '#c080ff';
  ctx.font         = 'bold 16px JetBrains Mono, monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ffLabel, node.x - 20, node.y);

  const qColor = q === 1 ? C.ffQhigh : C.ffQlow;
  ctx.fillStyle    = 'rgba(200,200,200,0.5)';
  ctx.font         = '9px JetBrains Mono, monospace';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Q', divX + 5, node.y - 18);
  ctx.fillStyle    = qColor;
  ctx.font         = 'bold 14px JetBrains Mono, monospace';
  ctx.fillText(q.toString(), divX + 22, node.y - 18);

  const qnColor = qNot === 1 ? C.ffQhigh : C.ffQlow;
  ctx.fillStyle    = 'rgba(200,200,200,0.5)';
  ctx.font         = '9px JetBrains Mono, monospace';
  ctx.fillText('Q\u0304', divX + 5, node.y + 18);
  ctx.fillStyle    = qnColor;
  ctx.font         = 'bold 14px JetBrains Mono, monospace';
  ctx.fillText(qNot.toString(), divX + 22, node.y + 18);

  ctx.fillStyle  = C.ffClkAccent;
  ctx.beginPath();
  const tx = x + 4, ty = node.y + 14;
  ctx.moveTo(tx,      ty - 6);
  ctx.lineTo(tx + 10, ty);
  ctx.lineTo(tx,      ty + 6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle    = C.textDim;
  ctx.font         = '10px JetBrains Mono, monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(node.label || '', node.x, y - 10);

  ctx.restore();
}

// ── Wire Preview ────────────────────────────────────────────
function _drawWirePreview(preview, nodes, wires) {
  const { source, mouseWorld, hoveredNode, isInvalid, inputAnchors, closestAnchorIdx } = preview;
  let wireColor = '#a060ff';
  if (hoveredNode) {
    wireColor = isInvalid ? '#ff4444' : '#39ff14';
  }

  ctx.save();

  // Wire line from source to mouse
  ctx.shadowColor = wireColor;
  ctx.shadowBlur = isInvalid ? 20 : 10;
  ctx.strokeStyle = wireColor;
  ctx.lineWidth = isInvalid ? 4 : 2;
  ctx.setLineDash(isInvalid ? [8, 6] : [6, 4]);
  ctx.beginPath();
  ctx.moveTo(source.x, source.y);
  ctx.lineTo(mouseWorld.x, mouseWorld.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Source node highlight ring
  ctx.beginPath();
  ctx.arc(source.x, source.y, 22, 0, Math.PI * 2);
  ctx.strokeStyle = wireColor;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Invalid target: X mark
  if (isInvalid && hoveredNode) {
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 25;
    ctx.beginPath();
    ctx.arc(hoveredNode.x, hoveredNode.y, 30, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hoveredNode.x - 10, hoveredNode.y - 10);
    ctx.lineTo(hoveredNode.x + 10, hoveredNode.y + 10);
    ctx.moveTo(hoveredNode.x + 10, hoveredNode.y - 10);
    ctx.lineTo(hoveredNode.x - 10, hoveredNode.y + 10);
    ctx.stroke();
  }

  // Valid target: show all input anchors as dots with labels
  if (hoveredNode && !isInvalid && inputAnchors && inputAnchors.length > 0) {
    ctx.shadowBlur = 0;

    for (const anchor of inputAnchors) {
      const isClosest = anchor.index === closestAnchorIdx;
      const r = isClosest ? 6 : 4;

      // Anchor dot
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isClosest ? '#39ff14' : 'rgba(57,255,20,0.3)';
      ctx.fill();
      if (isClosest) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Glow on closest
        ctx.shadowColor = '#39ff14';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, r + 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#39ff14';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Label
      ctx.fillStyle = isClosest ? '#fff' : 'rgba(200,200,200,0.6)';
      ctx.font = `${isClosest ? 'bold ' : ''}8px JetBrains Mono, monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(anchor.label, anchor.x - r - 3, anchor.y);
    }
  }

  ctx.restore();
}

// ── Node Tooltip ────────────────────────────────────────────
function _drawNodeTooltip(nodes, hoveredId, nodeValues) {
  const node = nodes.find(n => n.id === hoveredId);
  if (!node) return;

  const lines = [];
  const val = nodeValues.get(node.id) ?? null;

  if (node.type === 'INPUT') {
    lines.push(node.label || node.id);
    lines.push('Value: ' + (val !== null ? val : '?'));
    if (node.stepValues) lines.push('Steps: ' + node.stepValues.join(','));
  } else if (node.type === 'OUTPUT') {
    lines.push(node.label || node.id);
    lines.push('Current: ' + (val !== null ? val : '?'));
  } else if (node.type === 'GATE_SLOT') {
    lines.push(node.label || node.id);
    lines.push(node.gate ? node.gate + ' gate' : 'Empty \u2014 drag a gate');
    if (val !== null) lines.push('Output: ' + val);
  } else if (node.type === 'FF_SLOT') {
    lines.push(node.label || node.id);
    lines.push(node.ffType ? node.ffType + '-FF' : 'Empty \u2014 drag a FF');
  } else if (node.type === 'CLOCK') {
    lines.push('CLOCK');
    lines.push('Step: ' + (_stepCount || 0));
  } else if (node.type === 'MUX_SELECT') {
    lines.push(node.label || 'SWITCH');
    lines.push('Value: ' + (node.value ?? 0));
  }

  if (lines.length === 0) return;

  const sx = node.x * _scale + _offsetX;
  const sy = node.y * _scale + _offsetY;

  ctx.save();
  ctx.font = 'bold 11px JetBrains Mono, monospace';
  const lineH = 16;
  const pad = 8;
  let maxW = 0;
  lines.forEach(l => { maxW = Math.max(maxW, ctx.measureText(l).width); });
  const boxW = maxW + pad * 2;
  const boxH = lines.length * lineH + pad * 2;

  let tx = sx - boxW / 2;
  let ty = sy - 55 * _scale - boxH;
  if (tx < 4) tx = 4;
  if (tx + boxW > W - 4) tx = W - 4 - boxW;
  if (ty < 4) ty = sy + 50 * _scale + 8;

  ctx.fillStyle = 'rgba(10, 14, 20, 0.94)';
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(tx, ty, boxW, boxH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? '#00d4ff' : '#c8d8f0';
    ctx.fillText(line, tx + pad, ty + pad + i * lineH);
  });
  ctx.restore();
}

// ── Hit Testing ─────────────────────────────────────────────
export function getNodeAtPoint(px, py, nodes) {
  const x = (px - _offsetX) / _scale;
  const y = (py - _offsetY) / _scale;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.type === 'DISPLAY_7SEG') {
      const hw = 40 + 6, hh = 60 + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else if (n.type === 'PIPE_REG') {
      const ch = n.channels || 4;
      const hw = 50 + 6, hh = Math.max(30, ch * 10 + 10) + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else if (n.type === 'SIGN_EXT') {
      const hw = 45 + 6, hh = 22 + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else if (n.type === 'BUS_MUX') {
      const nn = n.inputCount || 2;
      const hw = 45 + 6, hh = Math.max(25, nn * 11 + 5) + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else if (n.type === 'SUB_CIRCUIT') {
      const maxPins = Math.max((n.subInputs||[]).length, (n.subOutputs||[]).length, 1);
      const hw = 60 + 6, hh = Math.max(30, maxPins * 10 + 10) + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else if (n.type === 'BUS') {
      const srcCount = n.sourceCount || 3;
      const hw = 50 + 6, hh = Math.max(30, srcCount * 14 + 5) + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else if (n.type === 'CU') {
      const hw = 60 + 6, hh = 55 + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else if (n.type === 'ALU') {
      const hw = 55 + 6, hh = 38 + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else if (n.type === 'IR') {
      const hw = 55 + 6, hh = 40 + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else if (n.type === 'HALF_ADDER' || n.type === 'FULL_ADDER' || n.type === 'COMPARATOR') {
      const hw = 45 + 6, hh = 30 + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else if (MEMORY_TYPE_SET.has(n.type)) {
      const sz = _memoryNodeSize(n);
      const hw = sz.w / 2 + 6, hh = sz.h / 2 + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else if (n.type === 'MUX' || n.type === 'DEMUX' || n.type === 'DECODER' || n.type === 'ENCODER') {
      const sz = _muxNodeSize(n);
      const hw = sz.w / 2 + 6, hh = sz.h / 2 + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else if (n.type === 'MUX_SELECT') {
      const hw = 25 + 6, hh = 15 + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else if (n.type === 'GATE_SLOT') {
      const hw = NODE.gateW / 2 + 6;
      const hh = NODE.gateH / 2 + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else if (n.type === 'FF_SLOT' || FF_TYPE_SET.has(n.type)) {
      const hw = NODE.ffW / 2 + 6;
      const hh = NODE.ffH / 2 + 6;
      if (x >= n.x - hw && x <= n.x + hw && y >= n.y - hh && y <= n.y + hh) return n;
    } else {
      const r  = NODE.inputR + 6;
      const dx = x - n.x, dy = y - n.y;
      if (dx*dx + dy*dy <= r*r) return n;
    }
  }
  return null;
}

export function getWireAtPoint(px, py, nodes, wires) {
  const wx = (px - _offsetX) / _scale;
  const wy = (py - _offsetY) / _scale;
  let closest = null;
  let closestDist = 15;

  wires.forEach(wire => {
    const path = _wirePaths.get(wire.id);
    if (!path || path.length < 2) return;

    // Check distance to each segment of the Manhattan path
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      let t = ((wx - a.x) * dx + (wy - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px2 = a.x + t * dx, py2 = a.y + t * dy;
      const dist = Math.sqrt((wx - px2) * (wx - px2) + (wy - py2) * (wy - py2));
      if (dist < closestDist) {
        closestDist = dist;
        closest = wire;
      }
    }
  });
  return closest;
}

/**
 * Find the closest waypoint handle on a wire path (for drag-to-reroute).
 * Returns { wire, segmentIndex, point } or null.
 */
export function getWaypointHandle(px, py, wires) {
  const wx = (px - _offsetX) / _scale;
  const wy = (py - _offsetY) / _scale;
  let closest = null;
  let closestDist = 20;

  wires.forEach(wire => {
    const path = _wirePaths.get(wire.id);
    if (!path || path.length < 3) return;

    // Check bend points (skip first and last — those are anchored to nodes)
    for (let i = 1; i < path.length - 1; i++) {
      const p = path[i];
      const dist = Math.sqrt((wx - p.x) * (wx - p.x) + (wy - p.y) * (wy - p.y));
      if (dist < closestDist) {
        closestDist = dist;
        closest = { wire, segmentIndex: i, point: { x: p.x, y: p.y } };
      }
    }
  });
  return closest;
}

/**
 * Find the closest input anchor index on a node to a world-space point.
 * Returns the inputIndex that should be used for the wire connection.
 */
export function getClosestInputIndex(node, worldX, worldY) {
  const count = _getNodeInputCount(node);
  if (count <= 1) return 0;

  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < count; i++) {
    const isClk = _isClockInput(node, i);
    const anchor = _nodeInputAnchor(null, node, i, isClk);
    const dx = worldX - anchor.x;
    const dy = worldY - anchor.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Get the total number of input anchors for a node.
 */
function _getNodeInputCount(node) {
  if (node.type === 'GATE_SLOT') {
    return node.gate === 'NOT' || node.gate === 'BUF' ? 1 : 2;
  }
  if (node.type === 'FF_SLOT') {
    const dataCount = (node.ffType === 'SR' || node.ffType === 'JK') ? 2 : 1;
    return dataCount + 1; // + clock
  }
  if (node.type === 'LATCH_SLOT') {
    return node.latchType === 'SR_LATCH' ? 3 : 2;
  }
  if (node.type === 'MUX') {
    const n = node.inputCount || 2;
    return n + Math.ceil(Math.log2(n)); // data + select
  }
  if (node.type === 'DEMUX') {
    const outCount = node.outputCount || 2;
    return 1 + Math.ceil(Math.log2(outCount));
  }
  if (node.type === 'DECODER') {
    return node.inputBits || 2;
  }
  if (node.type === 'ENCODER') {
    return node.inputLines || 4;
  }
  if (node.type === 'HALF_ADDER') return 2;   // A, B
  if (node.type === 'FULL_ADDER') return 3;   // A, B, Cin
  if (node.type === 'COMPARATOR') return 2;    // A, B
  if (node.type === 'SUB_CIRCUIT') return (node.subInputs || []).length;
  if (node.type === 'PIPE_REG') return (node.channels || 4) + 3; // D0..Dn-1, STALL, FLUSH, CLK
  if (node.type === 'SIGN_EXT') return 1;      // IN
  if (node.type === 'BUS_MUX') return (node.inputCount || 2) + 1; // D0..Dn-1, SEL
  if (node.type === 'ALU') return 3;           // A, B, OP
  if (node.type === 'CU') return 3;            // OP, Z, C
  if (node.type === 'BUS') return (node.sourceCount || 3) * 2; // D0,EN0,D1,EN1,...
  // Memory components (bus-style: packed integer per wire)
  if (node.type === 'REGISTER') return 4;   // DATA, EN, CLR, CLK
  if (node.type === 'SHIFT_REG') return 5;  // DIN, DIR, EN, CLR, CLK
  if (node.type === 'COUNTER') return 5;    // EN, LOAD, DATA, CLR, CLK
  if (node.type === 'RAM') return 5;        // ADDR, DATA, WE, RE, CLK
  if (node.type === 'ROM') return 3;        // ADDR, RE, CLK
  if (node.type === 'REG_FILE') return 5;  // RD_ADDR, WR_ADDR, WR_DATA, WE, CLK
  if (node.type === 'FIFO') return 5;     // DATA, WR, RD, CLR, CLK
  if (node.type === 'STACK') return 5;    // DATA, PUSH, POP, CLR, CLK
  if (node.type === 'PC') return 5;       // JUMP_ADDR, JUMP, EN, CLR, CLK
  if (node.type === 'IR') return 3;       // INSTR, LD, CLK
  if (node.type === 'OUTPUT') return 1;
  if (node.type === 'DISPLAY_7SEG') return 7;
  return 1;
}

/**
 * Check if an input index is a clock input for FF nodes.
 */
function _isClockInput(node, inputIndex) {
  if (node.type === 'FF_SLOT' || node.type?.startsWith('FLIPFLOP_')) {
    const dataCount = _ffDataInputCount(node);
    return inputIndex >= dataCount;
  }
  if (MEMORY_TYPE_SET.has(node.type)) {
    return inputIndex === _getNodeInputCount(node) - 1;
  }
  return false;
}

/**
 * Get all input anchor positions for a node (for visual feedback).
 * Returns array of { x, y, index, label }.
 */
export function getInputAnchors(node) {
  const count = _getNodeInputCount(node);
  const anchors = [];
  for (let i = 0; i < count; i++) {
    const isClk = _isClockInput(node, i);
    const pos = _nodeInputAnchor(null, node, i, isClk);
    let label = i.toString();
    // Better labels for specific types
    if (node.type === 'MUX') {
      const n = node.inputCount || 2;
      label = i < n ? 'D' + i : 'S' + (i - n);
    } else if (node.type === 'DEMUX') {
      label = i === 0 ? 'IN' : 'S' + (i - 1);
    } else if (node.type === 'DECODER') {
      label = 'A' + i;
    } else if (node.type === 'ENCODER') {
      label = 'I' + i;
    } else if (node.type === 'BUS') {
      const srcIdx = Math.floor(i / 2);
      label = i % 2 === 0 ? 'D' + srcIdx : 'EN' + srcIdx;
    } else if (node.type === 'PIPE_REG') {
      const ch = node.channels || 4;
      label = i < ch ? 'D' + i : ['STALL', 'FLUSH', 'CLK'][i - ch] || '';
    } else if (node.type === 'SIGN_EXT') {
      label = 'IN';
    } else if (node.type === 'BUS_MUX') {
      const n = node.inputCount || 2;
      label = i < n ? String.fromCharCode(65 + i) : 'SEL'; // A, B, C... SEL
    } else if (node.type === 'SUB_CIRCUIT') {
      label = (node.subInputs && node.subInputs[i]) ? node.subInputs[i].label : 'I' + i;
    } else if (node.type === 'CU') {
      label = ['OP', 'Z', 'C'][i] || '';
    } else if (node.type === 'ALU') {
      label = ['A', 'B', 'OP'][i] || '';
    } else if (node.type === 'HALF_ADDER' || node.type === 'COMPARATOR') {
      label = i === 0 ? 'A' : 'B';
    } else if (node.type === 'FULL_ADDER') {
      label = ['A', 'B', 'Cin'][i] || i.toString();
    } else if (MEMORY_TYPE_SET.has(node.type)) {
      label = _memoryInputLabel(node, i);
    } else if (node.type === 'FF_SLOT' && isClk) {
      label = 'CLK';
    } else if (node.type === 'GATE_SLOT') {
      label = String.fromCharCode(65 + i); // A, B
    }
    anchors.push({ ...pos, index: i, label });
  }
  return anchors;
}

/**
 * Get all output anchor positions for a node.
 */
export function getOutputAnchors(node) {
  const anchors = [];
  if (node.type === 'DEMUX') {
    const n = node.outputCount || 2;
    for (let i = 0; i < n; i++) {
      anchors.push({ ..._nodeOutputAnchor(node, i), index: i, label: 'Y' + i });
    }
  } else if (node.type === 'DECODER') {
    const n = 1 << (node.inputBits || 2);
    for (let i = 0; i < n; i++) {
      anchors.push({ ..._nodeOutputAnchor(node, i), index: i, label: 'Y' + i });
    }
  } else if (node.type === 'ENCODER') {
    const outBits = Math.ceil(Math.log2(node.inputLines || 4));
    for (let b = 0; b < outBits; b++) {
      anchors.push({ ..._nodeOutputAnchor(node, b), index: b, label: 'B' + b });
    }
    anchors.push({ ..._nodeOutputAnchor(node, outBits), index: outBits, label: 'V' });
  } else if (node.type === 'HALF_ADDER' || node.type === 'FULL_ADDER') {
    anchors.push({ ..._nodeOutputAnchor(node, 0), index: 0, label: 'S' });
    anchors.push({ ..._nodeOutputAnchor(node, 1), index: 1, label: 'C' });
  } else if (node.type === 'COMPARATOR') {
    anchors.push({ ..._nodeOutputAnchor(node, 0), index: 0, label: 'EQ' });
    anchors.push({ ..._nodeOutputAnchor(node, 1), index: 1, label: 'GT' });
    anchors.push({ ..._nodeOutputAnchor(node, 2), index: 2, label: 'LT' });
  } else if (node.type === 'BUS') {
    anchors.push({ ..._nodeOutputAnchor(node, 0), index: 0, label: 'OUT' });
    anchors.push({ ..._nodeOutputAnchor(node, 1), index: 1, label: 'ERR' });
  } else if (node.type === 'PIPE_REG') {
    const ch = node.channels || 4;
    for (let i = 0; i < ch; i++) {
      anchors.push({ ..._nodeOutputAnchor(node, i), index: i, label: 'Q' + i });
    }
  } else if (node.type === 'SIGN_EXT') {
    anchors.push({ ..._nodeOutputAnchor(node, 0), index: 0, label: 'OUT' });
  } else if (node.type === 'BUS_MUX') {
    anchors.push({ ..._nodeOutputAnchor(node, 0), index: 0, label: 'Y' });
  } else if (node.type === 'SUB_CIRCUIT') {
    const outs = node.subOutputs || [];
    for (let i = 0; i < outs.length; i++) {
      anchors.push({ ..._nodeOutputAnchor(node, i), index: i, label: outs[i].label || 'O' + i });
    }
  } else if (node.type === 'CU') {
    const labels = ['ALU_OP', 'RG_WE', 'MM_WE', 'MM_RE', 'JMP', 'HALT'];
    for (let i = 0; i < 6; i++) {
      anchors.push({ ..._nodeOutputAnchor(node, i), index: i, label: labels[i] });
    }
  } else if (node.type === 'ALU') {
    anchors.push({ ..._nodeOutputAnchor(node, 0), index: 0, label: 'R' });
    anchors.push({ ..._nodeOutputAnchor(node, 1), index: 1, label: 'Z' });
    anchors.push({ ..._nodeOutputAnchor(node, 2), index: 2, label: 'C' });
  } else if (node.type === 'IR') {
    anchors.push({ ..._nodeOutputAnchor(node, 0), index: 0, label: 'OP' });
    anchors.push({ ..._nodeOutputAnchor(node, 1), index: 1, label: 'RD' });
    anchors.push({ ..._nodeOutputAnchor(node, 2), index: 2, label: 'RS1' });
    anchors.push({ ..._nodeOutputAnchor(node, 3), index: 3, label: 'RS2' });
  } else if (MEMORY_TYPE_SET.has(node.type)) {
    anchors.push({ ..._nodeOutputAnchor(node, 0), index: 0, label: 'Q' });
    if (node.type === 'COUNTER') {
      anchors.push({ ..._nodeOutputAnchor(node, 1), index: 1, label: 'TC' });
    }
    if (node.type === 'FIFO' || node.type === 'STACK') {
      anchors.push({ ..._nodeOutputAnchor(node, 1), index: 1, label: 'FULL' });
      anchors.push({ ..._nodeOutputAnchor(node, 2), index: 2, label: 'EMPT' });
    }
  } else if (FF_TYPE_SET.has(node.type)) {
    anchors.push({ ..._nodeOutputAnchor(node, 0), index: 0, label: 'Q' });
    anchors.push({ ..._nodeOutputAnchor(node, 1), index: 1, label: 'Q\u0304' });
  } else {
    anchors.push({ ..._nodeOutputAnchor(node, 0), index: 0, label: 'Y' });
  }
  return anchors;
}

export function canvasToWorld(px, py) {
  return {
    x: Math.round((px - _offsetX) / _scale),
    y: Math.round((py - _offsetY) / _scale),
  };
}

export function panBy(dx, dy) {
  _offsetX += dx;
  _offsetY += dy;
  _userPanned = true;
}

export function zoomAt(px, py, delta) {
  const oldScale = _scale;
  const factor = delta > 0 ? 0.9 : 1.1;
  _userZoom = Math.max(0.3, Math.min(4, _userZoom * factor));
  const newScale = oldScale * factor;
  _offsetX = px - (px - _offsetX) * (newScale / oldScale);
  _offsetY = py - (py - _offsetY) * (newScale / oldScale);
  _scale = newScale;
  _userPanned = true;
}

export function resetPan() {
  _userZoom = 1;
  _scale = 1;
  _offsetX = 0;
  _offsetY = 0;
  _userPanned = true;
}

// ── Helpers ─────────────────────────────────────────────────
function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
