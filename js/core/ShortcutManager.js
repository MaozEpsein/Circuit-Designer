/**
 * ShortcutManager — Centralized, customizable keyboard shortcuts.
 * All shortcuts are defined here and can be remapped by the user.
 * Saves custom mappings to localStorage.
 */
import { bus } from './EventBus.js';

const STORAGE_KEY = 'circuit_designer_shortcuts';

// Default shortcut definitions
// key format: "ctrl+shift+KeyZ", "KeyS", "Space", "Delete", etc.
const DEFAULT_SHORTCUTS = {
  // Tools
  'tool-select':      { key: 'KeyS',    label: 'Select',           group: 'Tools' },
  'tool-multiselect': { key: 'KeyQ',    label: 'Multi-Select',     group: 'Tools' },
  'tool-wire':        { key: 'KeyW',    label: 'Wire',             group: 'Tools' },
  'tool-delete':      { key: 'KeyD',    label: 'Delete Tool',      group: 'Tools' },
  'tool-input':       { key: 'KeyI',    label: 'Place Input',      group: 'Tools' },
  'tool-output':      { key: 'KeyO',    label: 'Place Output',     group: 'Tools' },
  'tool-clock':       { key: 'KeyC',    label: 'Place Clock',      group: 'Tools' },
  // Actions
  'action-undo':      { key: 'ctrl+KeyZ',       label: 'Undo',            group: 'Actions' },
  'action-redo':      { key: 'ctrl+KeyY',        label: 'Redo',            group: 'Actions' },
  'action-copy':      { key: 'ctrl+KeyC',        label: 'Copy',            group: 'Actions' },
  'action-paste':     { key: 'ctrl+KeyV',        label: 'Paste',           group: 'Actions' },
  'action-selectall': { key: 'ctrl+KeyA',        label: 'Select All',      group: 'Actions' },
  'action-palette':   { key: 'ctrl+KeyK',        label: 'Command Palette', group: 'Actions' },
  // Navigation
  'nav-zoomsel':      { key: 'ctrl+KeyF',        label: 'Zoom to Selection', group: 'Navigation' },
  'nav-zoomfit':      { key: 'KeyF',              label: 'Zoom to Fit',       group: 'Navigation' },
  'nav-stepclock':    { key: 'Space',             label: 'Step Clock',        group: 'Navigation' },
  'nav-meminspector': { key: 'KeyM',              label: 'Memory Inspector',  group: 'Navigation' },
  // Editing
  'edit-delete':      { key: 'Delete',            label: 'Delete Selected',   group: 'Editing' },
  'edit-delete2':     { key: 'Backspace',         label: 'Delete Selected',   group: 'Editing' },
  // System
  'sys-reset':        { key: 'ctrl+shift+KeyX',   label: 'Reset Everything',  group: 'System' },
  'sys-debug':        { key: 'ctrl+KeyD',         label: 'Toggle Debug',      group: 'System' },
  'sys-shortcuts':    { key: 'Slash',             label: 'Shortcuts',         group: 'System' },
};

export class ShortcutManager {
  constructor() {
    this._shortcuts = {};
    this._load();
  }

  _load() {
    // Start with defaults
    this._shortcuts = {};
    for (const [id, def] of Object.entries(DEFAULT_SHORTCUTS)) {
      this._shortcuts[id] = { ...def };
    }
    // Override with user customizations
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const custom = JSON.parse(saved);
        for (const [id, keyStr] of Object.entries(custom)) {
          if (this._shortcuts[id]) {
            this._shortcuts[id].key = keyStr;
          }
        }
      }
    } catch (_) {}
  }

  _save() {
    const custom = {};
    for (const [id, sc] of Object.entries(this._shortcuts)) {
      if (DEFAULT_SHORTCUTS[id] && sc.key !== DEFAULT_SHORTCUTS[id].key) {
        custom[id] = sc.key;
      }
    }
    if (Object.keys(custom).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  /**
   * Set a new key for a shortcut.
   */
  setKey(id, keyStr) {
    if (this._shortcuts[id]) {
      this._shortcuts[id].key = keyStr;
      this._save();
    }
  }

  /**
   * Reset a shortcut to default.
   */
  resetKey(id) {
    if (this._shortcuts[id] && DEFAULT_SHORTCUTS[id]) {
      this._shortcuts[id].key = DEFAULT_SHORTCUTS[id].key;
      this._save();
    }
  }

  /**
   * Reset all shortcuts to defaults.
   */
  resetAll() {
    for (const [id, def] of Object.entries(DEFAULT_SHORTCUTS)) {
      this._shortcuts[id].key = def.key;
    }
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Get all shortcuts grouped.
   */
  getAll() {
    return this._shortcuts;
  }

  /**
   * Get grouped list for display.
   */
  getGrouped() {
    const groups = {};
    for (const [id, sc] of Object.entries(this._shortcuts)) {
      if (!groups[sc.group]) groups[sc.group] = [];
      groups[sc.group].push({ id, ...sc, isDefault: DEFAULT_SHORTCUTS[id]?.key === sc.key });
    }
    return groups;
  }

  /**
   * Convert a KeyboardEvent to our key string format.
   */
  static eventToKeyStr(e) {
    let parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    // Don't include modifier keys themselves
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      parts.push(e.code);
    }
    return parts.join('+');
  }

  /**
   * Format a key string for display.
   */
  static formatKey(keyStr) {
    return keyStr
      .replace('ctrl+', 'Ctrl+')
      .replace('shift+', 'Shift+')
      .replace('alt+', 'Alt+')
      .replace('Key', '')
      .replace('Digit', '')
      .replace('Slash', '/')
      .replace('Space', 'Space')
      .replace('Delete', 'Del')
      .replace('Backspace', 'Bksp');
  }

  /**
   * Check if a keyboard event matches a shortcut ID.
   */
  matches(e, id) {
    const sc = this._shortcuts[id];
    if (!sc) return false;
    return ShortcutManager.eventToKeyStr(e) === sc.key;
  }

  /**
   * Find which shortcut ID matches a keyboard event.
   * Returns the ID or null.
   */
  findMatch(e) {
    const keyStr = ShortcutManager.eventToKeyStr(e);
    for (const [id, sc] of Object.entries(this._shortcuts)) {
      if (sc.key === keyStr) return id;
    }
    return null;
  }
}
