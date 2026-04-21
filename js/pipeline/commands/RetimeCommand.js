/**
 * RetimeCommand — apply a retime proposal as an undoable scene edit.
 * Wraps `wireEdits: { remove, add }` from `suggestRetime(scene)` into the
 * project's standard Command interface (see core/CommandManager.js).
 *
 * On execute: removes the listed wires, adds the listed wires.
 * On undo:    reverses both operations, restoring the exact original wires
 *             (including original ids and waypoints).
 */
import { Command } from '../../core/CommandManager.js';

export class RetimeCommand extends Command {
  /**
   * @param {SceneGraph} scene
   * @param {object} proposal  output of `suggestRetime(scene)` (must be non-null)
   */
  constructor(scene, proposal) {
    super(proposal?.description || 'Retime PIPE');
    this._scene    = scene;
    this._proposal = proposal;
    this._removedWireSnapshots = [];
    this._addedWireIds         = [];
  }

  execute() {
    // Snapshot wires we're about to remove so undo can restore them verbatim.
    this._removedWireSnapshots = [];
    for (const wid of this._proposal.wireEdits.remove) {
      const w = this._scene.getWire(wid);
      if (w) this._removedWireSnapshots.push({ ...w });
    }
    // Remove old wires.
    for (const wid of this._proposal.wireEdits.remove) this._scene.removeWire(wid);
    // Add new wires — SceneGraph.addWire emits wire:added and keeps the id
    // we provided (it only auto-assigns when none was set).
    this._addedWireIds = [];
    for (const w of this._proposal.wireEdits.add) {
      const id = this._scene.addWire({ ...w });
      if (id) this._addedWireIds.push(id);
    }
    // Apply canvas-position edits (PIPE ↔ past-node swap). Snapshot the old
    // coordinates so undo can restore them alongside the wires.
    this._positionSnapshots = [];
    for (const e of (this._proposal.nodeEdits || [])) {
      const n = this._scene.getNode(e.nodeId);
      if (!n) continue;
      this._positionSnapshots.push({ nodeId: e.nodeId, oldX: n.x, oldY: n.y });
      n.x = e.newX;
      n.y = e.newY;
    }
  }

  undo() {
    // Restore node positions first.
    for (const s of (this._positionSnapshots || [])) {
      const n = this._scene.getNode(s.nodeId);
      if (!n) continue;
      n.x = s.oldX;
      n.y = s.oldY;
    }
    this._positionSnapshots = [];
    // Remove the wires we added.
    for (const wid of this._addedWireIds) this._scene.removeWire(wid);
    this._addedWireIds = [];
    // Restore the originals (same ids).
    for (const w of this._removedWireSnapshots) this._scene.addWire({ ...w });
    this._removedWireSnapshots = [];
  }
}
