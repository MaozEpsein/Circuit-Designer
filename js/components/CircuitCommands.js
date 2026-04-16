/**
 * CircuitCommands — Command objects for all circuit modification actions.
 * Each command captures enough state to undo/redo the action.
 */
import { Command } from '../core/CommandManager.js';

/**
 * Add a node to the scene.
 */
export class AddNodeCommand extends Command {
  constructor(scene, node) {
    super('Add node');
    this._scene = scene;
    this._node = { ...node };
    this._id = null;
  }

  execute() {
    this._id = this._scene.addNode({ ...this._node });
    this._node.id = this._id;
  }

  undo() {
    this._scene.removeNode(this._id);
  }

  get nodeId() { return this._id; }
}

/**
 * Remove a node (and its connected wires) from the scene.
 */
export class RemoveNodeCommand extends Command {
  constructor(scene, nodeId) {
    super('Remove node');
    this._scene = scene;
    this._nodeId = nodeId;
    this._node = null;
    this._removedWires = [];
  }

  execute() {
    this._node = { ...this._scene.getNode(this._nodeId) };
    // Capture wires that will be removed
    const { incoming, outgoing } = this._scene.getWiresForNode(this._nodeId);
    this._removedWires = [...incoming, ...outgoing].map(w => ({ ...w }));
    this._scene.removeNode(this._nodeId);
  }

  undo() {
    this._scene.addNode({ ...this._node });
    for (const wire of this._removedWires) {
      this._scene.addWire({ ...wire });
    }
  }
}

/**
 * Add a wire between two nodes.
 */
export class AddWireCommand extends Command {
  constructor(scene, wire) {
    super('Add wire');
    this._scene = scene;
    this._wire = { ...wire };
    this._id = null;
  }

  execute() {
    this._id = this._scene.addWire({ ...this._wire });
    if (this._id) this._wire.id = this._id;
  }

  undo() {
    if (this._id) this._scene.removeWire(this._id);
  }

  get wireId() { return this._id; }
}

/**
 * Remove a wire.
 */
export class RemoveWireCommand extends Command {
  constructor(scene, wireId) {
    super('Remove wire');
    this._scene = scene;
    this._wireId = wireId;
    this._wire = null;
  }

  execute() {
    this._wire = { ...this._scene.getWire(this._wireId) };
    this._scene.removeWire(this._wireId);
  }

  undo() {
    this._scene.addWire({ ...this._wire });
  }
}

/**
 * Move a node to a new position.
 */
export class MoveNodeCommand extends Command {
  constructor(scene, nodeId, newX, newY) {
    super('Move node');
    this._scene = scene;
    this._nodeId = nodeId;
    this._newX = newX;
    this._newY = newY;
    this._oldX = 0;
    this._oldY = 0;
  }

  execute() {
    const node = this._scene.getNode(this._nodeId);
    if (!node) return;
    this._oldX = node.x;
    this._oldY = node.y;
    node.x = this._newX;
    node.y = this._newY;
  }

  undo() {
    const node = this._scene.getNode(this._nodeId);
    if (!node) return;
    node.x = this._oldX;
    node.y = this._oldY;
  }
}

/**
 * Set a gate type on a GATE_SLOT node.
 */
export class SetGateCommand extends Command {
  constructor(scene, nodeId, gateType) {
    super('Set gate');
    this._scene = scene;
    this._nodeId = nodeId;
    this._gateType = gateType;
    this._prevGate = null;
  }

  execute() {
    const node = this._scene.getNode(this._nodeId);
    if (!node) return;
    this._prevGate = node.gate;
    node.gate = this._gateType;
  }

  undo() {
    const node = this._scene.getNode(this._nodeId);
    if (!node) return;
    node.gate = this._prevGate;
  }
}

/**
 * Set a flip-flop type on an FF_SLOT node.
 */
export class SetFfTypeCommand extends Command {
  constructor(scene, stateManager, nodeId, ffType) {
    super('Set flip-flop type');
    this._scene = scene;
    this._state = stateManager;
    this._nodeId = nodeId;
    this._ffType = ffType;
    this._prevType = null;
  }

  execute() {
    const node = this._scene.getNode(this._nodeId);
    if (!node) return;
    this._prevType = node.ffType;
    node.ffType = this._ffType || null;
    if (this._ffType) {
      this._state.ensureFfState(this._nodeId, node.initialQ ?? 0);
    } else {
      this._state.ffStates.delete(this._nodeId);
    }
  }

  undo() {
    const node = this._scene.getNode(this._nodeId);
    if (!node) return;
    node.ffType = this._prevType;
    if (this._prevType) {
      this._state.ensureFfState(this._nodeId, node.initialQ ?? 0);
    } else {
      this._state.ffStates.delete(this._nodeId);
    }
  }
}

/**
 * Set one or more properties on a node with undo support.
 * @param {object} scene - SceneGraph
 * @param {string} nodeId - Node ID
 * @param {object} newProps - { key: newValue, ... }
 */
export class SetNodePropsCommand extends Command {
  constructor(scene, nodeId, newProps) {
    super('Set properties');
    this._scene = scene;
    this._nodeId = nodeId;
    this._newProps = newProps;
    this._oldProps = {};
  }

  execute() {
    const node = this._scene.getNode(this._nodeId);
    if (!node) return;
    for (const [key, val] of Object.entries(this._newProps)) {
      this._oldProps[key] = node[key];
      node[key] = val;
    }
  }

  undo() {
    const node = this._scene.getNode(this._nodeId);
    if (!node) return;
    for (const [key, val] of Object.entries(this._oldProps)) {
      node[key] = val;
    }
  }
}

/**
 * Snapshot-based command for bulk or complex operations.
 * Captures the entire scene state before and after.
 */
export class SnapshotCommand extends Command {
  constructor(scene, description, action) {
    super(description);
    this._scene = scene;
    this._action = action;
    this._before = null;
    this._after = null;
  }

  execute() {
    this._before = this._scene.snapshot();
    this._action();
    this._after = this._scene.snapshot();
  }

  undo() {
    if (this._before) this._scene.restoreSnapshot(this._before);
  }
}
