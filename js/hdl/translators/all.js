// Translator barrel. Imported once (typically by VerilogExporter) so
// every translator module's `registerTranslator(...)` runs at load time.
// Adding a new family: drop a `<family>.js` next to this file and add
// one import line below.

import './logic-gates.js';
