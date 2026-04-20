/**
 * CommandPalette — Ctrl+K style quick-action search palette.
 *
 * Provides fuzzy search across:
 *   - Component placement (INPUT, GATE, FF, etc.)
 *   - Tools (select, wire, delete)
 *   - Actions (undo, redo, clear, export, import)
 *   - Circuit nodes (jump to a specific node by label)
 */
import { bus } from '../core/EventBus.js';
import { COMPONENT_TYPES, GATE_TYPES, FF_TYPES_LIST } from '../components/Component.js';

/**
 * @typedef {object} PaletteItem
 * @property {string} id
 * @property {string} label
 * @property {string} category
 * @property {string} [shortcut]
 * @property {Function} action
 */

export class CommandPalette {
  constructor() {
    this._visible = false;
    this._items = [];
    this._filteredItems = [];
    this._selectedIndex = 0;
    this._query = '';

    // DOM
    this._overlay = null;
    this._input = null;
    this._list = null;

    this._buildDOM();
    this._registerDefaultItems();
    this._bindKeys();
  }

  _buildDOM() {
    // Overlay
    this._overlay = document.createElement('div');
    this._overlay.id = 'command-palette-overlay';
    this._overlay.className = 'hidden';
    this._overlay.innerHTML = `
      <div id="command-palette-box">
        <input id="command-palette-input" type="text" placeholder="Type a command or node name..." autocomplete="off" spellcheck="false" />
        <div id="command-palette-list"></div>
        <div style="padding:4px 12px;color:#3a5070;font-size:8px;border-top:1px solid #1e3a50">Enter = execute &nbsp; Ctrl+Enter = bind shortcut key</div>
      </div>
    `;
    document.body.appendChild(this._overlay);

    this._input = document.getElementById('command-palette-input');
    this._list = document.getElementById('command-palette-list');

    // Close on backdrop click
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this.hide();
    });

    // Input handling
    this._input.addEventListener('input', () => {
      this._query = this._input.value.trim().toLowerCase();
      this._filter();
      this._render();
    });

    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._selectedIndex = Math.min(this._selectedIndex + 1, this._filteredItems.length - 1);
        this._render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
        this._render();
      } else if (e.key === 'Enter' && e.ctrlKey) {
        // Ctrl+Enter: bind shortcut to selected action
        e.preventDefault();
        this._bindShortcutToSelected();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this._executeSelected();
      } else if (e.key === 'Escape') {
        this.hide();
      }
    });
  }

  _registerDefaultItems() {
    // Tools
    const tools = [
      { id: 'tool-select', label: 'Select Tool', category: 'Tool', shortcut: 'S', action: () => bus.emit('palette:tool', 'select') },
      { id: 'tool-wire', label: 'Wire Tool', category: 'Tool', shortcut: 'W', action: () => bus.emit('palette:tool', 'wire') },
      { id: 'tool-delete', label: 'Delete Tool', category: 'Tool', shortcut: 'D', action: () => bus.emit('palette:tool', 'delete') },
    ];

    // Place components
    const components = [
      { id: 'place-input', label: 'Place Input', category: 'I/O', shortcut: 'I', action: () => bus.emit('palette:tool', 'place-input') },
      { id: 'place-output', label: 'Place Output', category: 'I/O', shortcut: 'O', action: () => bus.emit('palette:tool', 'place-output') },
      { id: 'place-clock', label: 'Place Clock', category: 'I/O', shortcut: 'C', action: () => bus.emit('palette:tool', 'place-clock') },
      { id: 'place-mux', label: 'Place MUX Switch', category: 'I/O', shortcut: 'M', action: () => bus.emit('palette:tool', 'place-mux') },
      { id: 'place-7seg', label: 'Place 7-Segment Display', category: 'I/O', shortcut: '7', action: () => bus.emit('palette:tool', 'place-7seg') },
      // Gates — direct placement
      { id: 'place-and', label: 'Place AND Gate', category: 'Gate', action: () => bus.emit('palette:tool', 'place-and') },
      { id: 'place-or', label: 'Place OR Gate', category: 'Gate', action: () => bus.emit('palette:tool', 'place-or') },
      { id: 'place-xor', label: 'Place XOR Gate', category: 'Gate', action: () => bus.emit('palette:tool', 'place-xor') },
      { id: 'place-nand', label: 'Place NAND Gate', category: 'Gate', action: () => bus.emit('palette:tool', 'place-nand') },
      { id: 'place-nor', label: 'Place NOR Gate', category: 'Gate', action: () => bus.emit('palette:tool', 'place-nor') },
      { id: 'place-not', label: 'Place NOT Gate', category: 'Gate', action: () => bus.emit('palette:tool', 'place-not') },
      // Memory components
      { id: 'place-register', label: 'Place Register', category: 'Memory', action: () => bus.emit('palette:tool', 'place-register') },
      { id: 'place-shiftreg', label: 'Place Shift Register', category: 'Memory', action: () => bus.emit('palette:tool', 'place-shiftreg') },
      { id: 'place-counter', label: 'Place Counter', category: 'Memory', action: () => bus.emit('palette:tool', 'place-counter') },
      { id: 'place-ram', label: 'Place RAM', category: 'Memory', action: () => bus.emit('palette:tool', 'place-ram') },
      { id: 'place-rom', label: 'Place ROM', category: 'Memory', action: () => bus.emit('palette:tool', 'place-rom') },
      { id: 'place-regfile', label: 'Place Register File', category: 'Memory', action: () => bus.emit('palette:tool', 'place-regfile') },
      { id: 'place-regfiledp', label: 'Place Dual-Port Register File', category: 'Memory', action: () => bus.emit('palette:tool', 'place-regfiledp') },
      { id: 'place-fifo', label: 'Place FIFO', category: 'Memory', action: () => bus.emit('palette:tool', 'place-fifo') },
      { id: 'place-stack', label: 'Place Stack', category: 'Memory', action: () => bus.emit('palette:tool', 'place-stack') },
      { id: 'place-pc', label: 'Place Program Counter', category: 'Memory', action: () => bus.emit('palette:tool', 'place-pc') },
      // CPU components
      { id: 'place-alu', label: 'Place ALU', category: 'CPU', action: () => bus.emit('palette:tool', 'place-alu') },
      { id: 'place-ir', label: 'Place Instruction Register', category: 'CPU', action: () => bus.emit('palette:tool', 'place-ir') },
      { id: 'place-cu', label: 'Place Control Unit', category: 'CPU', action: () => bus.emit('palette:tool', 'place-cu') },
      { id: 'place-bus', label: 'Place Bus', category: 'CPU', action: () => bus.emit('palette:tool', 'place-bus') },
      { id: 'place-imm', label: 'Place Immediate', category: 'CPU', action: () => bus.emit('palette:tool', 'place-imm') },
      { id: 'place-busmux', label: 'Place Bus MUX', category: 'CPU', action: () => bus.emit('palette:tool', 'place-busmux') },
      { id: 'place-signext', label: 'Place Sign Extender', category: 'Block', action: () => bus.emit('palette:tool', 'place-signext') },
      { id: 'place-pipereg', label: 'Place Pipeline Register', category: 'CPU', action: () => bus.emit('palette:tool', 'place-pipereg') },
      // Flip-Flops — direct placement
      { id: 'place-dff', label: 'Place D Flip-Flop', category: 'Flip-Flop', action: () => bus.emit('palette:tool', 'place-dff') },
      { id: 'place-tff', label: 'Place T Flip-Flop', category: 'Flip-Flop', action: () => bus.emit('palette:tool', 'place-tff') },
      { id: 'place-srff', label: 'Place SR Flip-Flop', category: 'Flip-Flop', action: () => bus.emit('palette:tool', 'place-srff') },
      { id: 'place-jkff', label: 'Place JK Flip-Flop', category: 'Flip-Flop', action: () => bus.emit('palette:tool', 'place-jkff') },
    ];

    // Actions
    const actions = [
      { id: 'action-undo', label: 'Undo', category: 'Action', shortcut: 'Ctrl+Z', action: () => bus.emit('palette:action', 'undo') },
      { id: 'action-redo', label: 'Redo', category: 'Action', shortcut: 'Ctrl+Y', action: () => bus.emit('palette:action', 'redo') },
      { id: 'action-clear', label: 'Clear All', category: 'Action', action: () => bus.emit('palette:action', 'clear') },
      { id: 'action-export', label: 'Export JSON', category: 'Action', shortcut: 'E', action: () => bus.emit('palette:action', 'export') },
      { id: 'action-import', label: 'Import JSON', category: 'Action', shortcut: 'P', action: () => bus.emit('palette:action', 'import') },
      { id: 'action-screenshot', label: 'Screenshot', category: 'Action', shortcut: 'R', action: () => bus.emit('palette:action', 'screenshot') },
      { id: 'action-zoomfit', label: 'Zoom to Fit', category: 'View', action: () => bus.emit('palette:action', 'zoom-fit') },
      { id: 'action-debug', label: 'Toggle Debug Panel', category: 'View', shortcut: 'Ctrl+D', action: () => bus.emit('palette:action', 'toggle-debug') },
      { id: 'action-waveform', label: 'Toggle Waveform', category: 'View', action: () => bus.emit('palette:action', 'toggle-waveform') },
      { id: 'action-truthtable', label: 'Generate Truth Table', category: 'Debug', action: () => bus.emit('palette:action', 'gen-truthtable') },
      { id: 'action-stageview', label: 'Toggle Stage View', category: 'Pipeline', action: () => bus.emit('palette:action', 'toggle-stageview') },
      { id: 'action-analyze-pipeline', label: 'Analyze Pipeline', category: 'Pipeline', action: () => bus.emit('palette:action', 'analyze-pipeline') },
      { id: 'action-pipeline-panel', label: 'Toggle Pipeline Panel', category: 'Pipeline', action: () => bus.emit('palette:action', 'toggle-pipeline-panel') },
      { id: 'action-insert-stall', label: 'Insert Stall Input → Selected PIPE', category: 'Pipeline', action: () => bus.emit('palette:action', 'insert-stall') },
      { id: 'action-insert-flush', label: 'Insert Flush Input → Selected PIPE', category: 'Pipeline', action: () => bus.emit('palette:action', 'insert-flush') },
    ];

    this._items = [...tools, ...components, ...actions];
    this._filteredItems = [...this._items];
  }

  /**
   * Add circuit nodes as searchable items.
   */
  updateNodeItems(nodes) {
    // Remove old node items
    this._items = this._items.filter(i => !i.id.startsWith('node-'));
    // Add current nodes
    for (const node of nodes) {
      this._items.push({
        id: 'node-' + node.id,
        label: `${node.label || node.id} (${node.type})`,
        category: 'Node',
        action: () => bus.emit('palette:select-node', node.id),
      });
    }
  }

  _filter() {
    if (!this._query) {
      this._filteredItems = [...this._items];
    } else {
      this._filteredItems = this._items.filter(item => {
        const haystack = (item.label + ' ' + item.category).toLowerCase();
        return this._query.split(' ').every(word => haystack.includes(word));
      });
    }
    this._selectedIndex = 0;
  }

  _render() {
    if (!this._list) return;
    if (this._filteredItems.length === 0) {
      this._list.innerHTML = '<div class="cp-empty">No results</div>';
      return;
    }

    this._list.innerHTML = this._filteredItems.map((item, i) => {
      const selected = i === this._selectedIndex ? ' cp-selected' : '';
      const shortcut = item.shortcut ? `<span class="cp-shortcut">${item.shortcut}</span>` : '';
      return `<div class="cp-item${selected}" data-idx="${i}">
        <span class="cp-category">${item.category}</span>
        <span class="cp-label">${item.label}</span>
        ${shortcut}
      </div>`;
    }).join('');

    // Click handler
    this._list.querySelectorAll('.cp-item').forEach(el => {
      el.addEventListener('click', () => {
        this._selectedIndex = parseInt(el.dataset.idx);
        this._executeSelected();
      });
    });

    // Scroll selected into view
    const selectedEl = this._list.querySelector('.cp-selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
  }

  _executeSelected() {
    const item = this._filteredItems[this._selectedIndex];
    if (item) {
      this.hide();
      item.action();
    }
  }

  _bindShortcutToSelected() {
    const item = this._filteredItems[this._selectedIndex];
    if (!item) return;

    this._input.value = '';
    this._input.placeholder = `Press key for "${item.label}"... (ESC to cancel)`;
    this._input.style.borderColor = '#ffa028';

    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        cleanup();
        return;
      }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      // Build key string
      let parts = [];
      if (e.ctrlKey || e.metaKey) parts.push('ctrl');
      if (e.shiftKey) parts.push('shift');
      if (e.altKey) parts.push('alt');
      parts.push(e.code);
      const keyStr = parts.join('+');

      // Emit bind event
      bus.emit('shortcut:bind', { actionId: item.id, keyStr, label: item.label });
      cleanup();
    };

    const cleanup = () => {
      this._input.removeEventListener('keydown', handler, true);
      this._input.placeholder = 'Type a command or node name...';
      this._input.style.borderColor = '';
      this.hide();
    };

    this._input.addEventListener('keydown', handler, true);
  }

  show() {
    this._visible = true;
    this._query = '';
    this._selectedIndex = 0;
    this._filter();
    this._render();
    this._overlay.classList.remove('hidden');
    this._input.value = '';
    this._input.focus();
  }

  hide() {
    this._visible = false;
    this._overlay.classList.add('hidden');
  }

  toggle() {
    if (this._visible) this.hide();
    else this.show();
  }

  get visible() { return this._visible; }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault();
        this.toggle();
      }
    });
  }
}
