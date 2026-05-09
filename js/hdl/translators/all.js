// Translator barrel. Imported once (typically by VerilogExporter) so
// every translator module's `registerTranslator(...)` runs at load time.
// Adding a new family: drop a `<family>.js` next to this file and add
// one import line below.

import './logic-gates.js';
import './arithmetic.js';
import './muxing.js';
import './width-changers.js';
import './flip-flops.js';
import './registers.js';
import './dft.js';
import './cpu.js';
import './hierarchy.js';
import './display.js';
