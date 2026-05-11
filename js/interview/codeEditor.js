/**
 * codeEditor.js — lazy CodeMirror 6 wrapper for the INTERVIEW panel.
 *
 * Why lazy: CodeMirror is only relevant for the handful of Verilog
 * questions. We import it dynamically (from esm.sh) the first time a
 * Verilog editor is requested, so users who never open a Verilog
 * question pay zero bytes for the editor.
 *
 * Public API:
 *   await createVerilogEditor({ container, initialDoc, onChange })
 *     → { getValue, setValue, destroy, dom, focus }
 */

const ESM = 'https://esm.sh';

let _libPromise = null;
function _loadLib() {
  if (_libPromise) return _libPromise;
  _libPromise = (async () => {
    const [cmMod, stateMod, viewMod, langMod, cmdMod, vlogMod, themeMod] = await Promise.all([
      import(`${ESM}/codemirror@6.0.1`),
      import(`${ESM}/@codemirror/state@6`),
      import(`${ESM}/@codemirror/view@6`),
      import(`${ESM}/@codemirror/language@6`),
      import(`${ESM}/@codemirror/commands@6`),
      import(`${ESM}/@codemirror/legacy-modes@6/mode/verilog`),
      import(`${ESM}/@codemirror/theme-one-dark@6`),
    ]);
    return {
      EditorView:    cmMod.EditorView,
      basicSetup:    cmMod.basicSetup,
      EditorState:   stateMod.EditorState,
      keymap:        viewMod.keymap,
      StreamLanguage: langMod.StreamLanguage,
      indentWithTab: cmdMod.indentWithTab,
      verilog:       vlogMod.verilog,
      oneDark:       themeMod.oneDark,
    };
  })();
  return _libPromise;
}

/**
 * Mount a Verilog editor into `container`. Returns a thin handle so
 * the caller doesn't need to know about CodeMirror's `view.state.doc`
 * etc.
 *
 * `onChange(value)` fires on every doc edit — used by the panel to
 * keep its cached typed-answer in sync so the value survives renders
 * that detach/reattach the editor.
 */
export async function createVerilogEditor({ container, initialDoc = '', onChange } = {}) {
  const lib = await _loadLib();

  const themeExt = lib.EditorView.theme({
    '&': {
      height: '320px',
      fontSize: '13px',
      borderRadius: '4px',
    },
    '.cm-scroller': {
      fontFamily: "'JetBrains Mono', 'Consolas', monospace",
      lineHeight: '1.5',
    },
    '.cm-gutters': {
      backgroundColor: '#10131a',
      borderRight: '1px solid #2a4060',
    },
  }, { dark: true });

  const updateExt = lib.EditorView.updateListener.of((update) => {
    if (update.docChanged && typeof onChange === 'function') {
      onChange(update.state.doc.toString());
    }
  });

  const view = new lib.EditorView({
    doc: initialDoc,
    parent: container,
    extensions: [
      // `keymap.of([indentWithTab])` makes Tab insert indentation and
      // Shift+Tab outdent — overriding CM6's default a11y behaviour
      // (Tab moves focus). Listed BEFORE basicSetup so its bindings
      // take precedence.
      lib.keymap.of([lib.indentWithTab]),
      lib.basicSetup,
      lib.StreamLanguage.define(lib.verilog),
      // Soft-wrap long lines so the user doesn't get horizontal scroll
      // inside the narrow interview panel.
      lib.EditorView.lineWrapping,
      lib.oneDark,
      themeExt,
      updateExt,
    ],
  });

  // Stop key events from bubbling up to global shortcut handlers
  // (window-level Ctrl+D, Z, S, ⟂ "?" overlay, etc.) — they fire on
  // bubble and would otherwise trigger while the user is typing code.
  // CodeMirror's own keymap handles its keys in capture phase, so by
  // the time we cancel propagation, undo/redo/indent already worked.
  // We let Escape through so users can still close the panel.
  const _swallow = (e) => {
    if (e.key === 'Escape') return;
    e.stopPropagation();
  };
  view.dom.addEventListener('keydown', _swallow);
  view.dom.addEventListener('keyup',   _swallow);
  view.dom.addEventListener('keypress', _swallow);

  return {
    getValue: () => view.state.doc.toString(),
    setValue: (v) => view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: String(v ?? '') },
    }),
    destroy: () => view.destroy(),
    focus:   () => view.focus(),
    dom:     view.dom,
  };
}
