/**
 * SceneGraph — Manages all circuit components and wires.
 * Replaces flat node/wire arrays with a structured container
 * that supports spatial queries, ID lookup, and serialization.
 */
import { bus } from './EventBus.js';

let _idCounter = 0;

export function generateId(prefix = 'n') {
  return `${prefix}_${_idCounter++}`;
}

export function setIdCounter(value) {
  _idCounter = value;
}

export function getIdCounter() {
  return _idCounter;
}

export class SceneGraph {
  constructor() {
    /** @type {Map<string, object>} */
    this._nodes = new Map();
    /** @type {Map<string, object>} */
    this._wires = new Map();
  }

  // ── Node Operations ───────────────────────────────────────

  addNode(node) {
    if (!node.id) node.id = generateId('n');
    this._nodes.set(node.id, node);
    bus.emit('node:added', node);
    return node.id;
  }

  removeNode(id) {
    const node = this._nodes.get(id);
    if (!node) return;
    this._nodes.delete(id);
    // Remove all wires connected to this node
    const wiresToRemove = [];
    for (const [wid, wire] of this._wires) {
      if (wire.sourceId === id || wire.targetId === id) {
        wiresToRemove.push(wid);
      }
    }
    for (const wid of wiresToRemove) {
      this._wires.delete(wid);
      bus.emit('wire:removed', { id: wid });
    }
    bus.emit('node:removed', node);
  }

  getNode(id) {
    return this._nodes.get(id) || null;
  }

  get nodes() {
    return [...this._nodes.values()];
  }

  get nodeCount() {
    return this._nodes.size;
  }

  // ── Wire Operations ───────────────────────────────────────

  addWire(wire) {
    // Validate
    if (wire.sourceId === wire.targetId) return null;
    // A target input PIN can only host one wire — you can't drive a single
    // input from two sources. But two outputs of one source can fan out to
    // separate inputs of one target (e.g. FULL_ADDER's Sum and Cout both
    // wired into the same multi-channel PIPE_REG), so identify duplicates
    // by the (target, inputIndex) pair, not by (source, target) alone.
    const dup = [...this._wires.values()].some(
      w => w.targetId === wire.targetId && w.targetInputIndex === wire.targetInputIndex
    );
    if (dup) return null;

    if (!wire.id) wire.id = generateId('w');
    this._wires.set(wire.id, wire);
    bus.emit('wire:added', wire);
    return wire.id;
  }

  removeWire(id) {
    const wire = this._wires.get(id);
    if (!wire) return;
    this._wires.delete(id);
    bus.emit('wire:removed', wire);
  }

  getWire(id) {
    return this._wires.get(id) || null;
  }

  get wires() {
    return [...this._wires.values()];
  }

  /**
   * Get wires connected to a node.
   */
  getWiresForNode(nodeId) {
    const result = { incoming: [], outgoing: [] };
    for (const wire of this._wires.values()) {
      if (wire.sourceId === nodeId) result.outgoing.push(wire);
      if (wire.targetId === nodeId) result.incoming.push(wire);
    }
    return result;
  }

  /**
   * Count how many input wires a node has (for determining next targetInputIndex).
   */
  getInputWireCount(nodeId) {
    let count = 0;
    for (const wire of this._wires.values()) {
      if (wire.targetId === nodeId) count++;
    }
    return count;
  }

  // ── Queries ───────────────────────────────────────────────

  getNodesByType(type) {
    return this.nodes.filter(n => n.type === type);
  }

  /**
   * Check if the scene contains sequential elements.
   */
  hasSequentialElements() {
    for (const node of this._nodes.values()) {
      if (node.type === 'CLOCK' || node.type === 'FF_SLOT' ||
          node.type === 'FLIPFLOP_D' || node.type === 'FLIPFLOP_SR' ||
          node.type === 'FLIPFLOP_JK' || node.type === 'FLIPFLOP_T') {
        return true;
      }
    }
    return false;
  }

  // ── Serialization ─────────────────────────────────────────

  serialize() {
    return {
      nodes: this.nodes.map(n => ({ ...n })),
      wires: this.wires.map(w => ({ ...w })),
    };
  }

  deserialize(data) {
    this.clear();
    let maxId = 0;
    for (const node of (data.nodes || [])) {
      this._nodes.set(node.id, { ...node });
      const m = String(node.id).match(/(\d+)$/);
      if (m) maxId = Math.max(maxId, parseInt(m[1]));
    }
    for (const wire of (data.wires || [])) {
      this._wires.set(wire.id, { ...wire });
      const m = String(wire.id).match(/(\d+)$/);
      if (m) maxId = Math.max(maxId, parseInt(m[1]));
    }
    setIdCounter(maxId + 1);
    // Preserve scene-level extension fields. _dft carries the test
    // vectors + fault-sim metadata used by Layer 2 of the DFT track.
    this._dft = data._dft || null;
    bus.emit('scene:loaded', data);
  }

  clear() {
    this._nodes.clear();
    this._wires.clear();
    this._dft = null;
    bus.emit('scene:cleared');
  }

  /**
   * Deep clone the entire scene state (for undo snapshots).
   */
  snapshot() {
    return JSON.parse(JSON.stringify(this.serialize()));
  }

  /**
   * Restore from a snapshot.
   */
  restoreSnapshot(snap) {
    this.deserialize(snap);
  }
}
