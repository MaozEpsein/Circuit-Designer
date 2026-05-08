// Layer 0 — DFT panel scaffold smoke test.
//
// Asserts the bare-minimum contract:
//   1. The DFTPanel class is exportable from js/dft/ui/DFTPanel.js.
//   2. It instantiates without error in a Node-like environment
//      that provides a minimal `document` mock.
//   3. show() / hide() / toggle() flip an internal _visible flag and
//      add/remove the 'hidden' class on the panel element.
//
// We mock `document` because Node has no DOM. The mock is intentionally
// minimal — getElementById returns a stub element with classList.add
// and classList.remove. The real UI integration is verified manually
// in the browser.
//
// Run:  node examples/tests/test-dft-panel-scaffold.mjs

let failed = 0;
function check(label, cond, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failed++;
  console.log(`  [${mark}] ${label}${detail ? ' — ' + detail : ''}`);
}

// Mock the DOM.
const stubElement = () => {
  const el = {
    classList: {
      _set: new Set(),
      add(c)    { el.classList._set.add(c); },
      remove(c) { el.classList._set.delete(c); },
      contains(c) { return el.classList._set.has(c); },
      toggle(c) { el.classList._set.has(c) ? el.classList._set.delete(c) : el.classList._set.add(c); },
    },
    addEventListener() {},
    appendChild() {},
    insertBefore() {},
    parentNode: null,
    querySelector() { return null; },
    querySelectorAll() { return []; },
    dataset: {},
    innerHTML: '',
    nextSibling: null,
  };
  return el;
};

const mockEls = new Map();
globalThis.document = {
  getElementById(id) {
    if (!mockEls.has(id)) mockEls.set(id, stubElement());
    return mockEls.get(id);
  },
  createElement() { return stubElement(); },
};

const { DFTPanel } = await import('../../js/dft/ui/DFTPanel.js');

console.log('\n-- DFT panel scaffold --');
check('DFTPanel class exported', typeof DFTPanel === 'function');

let panel;
try {
  panel = new DFTPanel();
  check('DFTPanel instantiates without error', true);
} catch (e) {
  check('DFTPanel instantiates without error', false, e.message);
  process.exit(1);
}

check('starts hidden (visible=false)', panel._visible === false);

panel.show();
check('show() sets visible=true', panel._visible === true);
const dftEl = mockEls.get('dft-panel');
check('show() removes hidden class', !dftEl.classList.contains('hidden'));

panel.hide();
check('hide() sets visible=false', panel._visible === false);
check('hide() adds hidden class', dftEl.classList.contains('hidden'));

panel.toggle();
check('toggle() from hidden → visible', panel._visible === true);
panel.toggle();
check('toggle() from visible → hidden', panel._visible === false);

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
