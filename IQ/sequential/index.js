/**
 * IQ — Sequential questions.
 *
 * Static import target: js/interview/questions.js will `import { QUESTIONS }`
 * from this file.
 */

import { build, h } from '../../js/interview/circuitHelpers.js';

// Inline waveform diagram — clk + input + output. Authored from scratch.
// Timing: input rises at x=125 (low→high), falls at x=375 (high→low);
// output is high for one clock period (x=375..400) right after input falls.
const FALLING_EDGE_SVG = `
<svg viewBox="0 0 480 200" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="clk, input, and output waveforms">
  <!-- t=0 start-of-time marker -->
  <text x="36" y="12" fill="#f0d080" font-size="10" font-weight="bold">t=0</text>
  <line x1="50" y1="16" x2="50" y2="190" stroke="#806040" stroke-width="0.6" stroke-dasharray="2 3"/>
  <polygon points="50,22 46,14 54,14" fill="#f0d080"/>

  <text x="0" y="34" fill="#c8d8f0">clk</text>
  <path d="M 50 46 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25"
        stroke="#f0d080" stroke-width="1.6" fill="none"/>

  <text x="0" y="100" fill="#c8d8f0">input</text>
  <path d="M 50 110 h 75 v -22 h 250 v 22 h 85"
        stroke="#80b0e0" stroke-width="1.6" fill="none"/>

  <text x="0" y="166" fill="#c8d8f0">output</text>
  <path d="M 50 178 h 325 v -22 h 25 v 22 h 85"
        stroke="#80f0a0" stroke-width="1.6" fill="none"/>
</svg>
`;

export const QUESTIONS = [
  {
    id: 'falling-edge-detector',
    difficulty: 'medium',
    title: 'תכנן מעגל ספרתי שמקיים דיאגרמת גלים נתונה',
    intro:
`נתונים שלושה אותות סינכרוניים: \`clk\`, \`input\`, ו-\`output\`. ה-\`output\`
נשאר \`0\` לאורך כל הזמן, חוץ מפולס קצר ב-\`1\` שמופיע **בדיוק אחרי
שה-input יורד מ-1 ל-0**.`,
    // The waveform IS the question — show it up front.
    schematic: FALLING_EDGE_SVG,
    // The circuit IS the answer — don't expose the "load on canvas" bar
    // until the user reveals the solution.
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: `תכנן מעגל ספרתי שמקיים את ההתנהגות הזו: זהה את הפונקציה,
פרט את הרכיבים המינימליים שצריך, וכתוב את הביטוי הבוליאני לפלט.`,
        hints: [
          'הסתכל על ה-output: מתי הוא הופך גבוה? באיזה סוג של אירוע ב-input הוא תלוי?',
          'ה-output קופץ ל-1 בדיוק על הקצה ה**יורד** של ה-input (חצייה מ-1 ל-0). זהו \`falling-edge detector\`.',
          'כדי לזהות שינוי, צריך לזכור את הערך **הקודם** של ה-input. איזה רכיב סדרתי מספק זיכרון של מחזור אחד?',
          '\`D-FF\` דוגם את ה-input ב-\`clk rising edge\` ושומר אותו כ-\`Q\`. עכשיו צריך לבדוק "Q היה 1 ו-input הנוכחי הוא 0" — איזה צירוף של שערים בודק את זה?',
          'שלושה רכיבים: \`D-FF\`, \`NOT\` (inverter על input), ו-\`AND\`. הביטוי: \`output = Q ∧ ¬input\`.',
        ],
        answer:
`**\`falling-edge detector\`** (גלאי קצה יורד).

המעגל מזהה את הרגע שבו ה-input חוצה מ-1 ל-0 ופולט פולס באורך מחזור
שעון אחד.

**הרכיבים (3 בלבד):**

- **\`D-FF\`** — דוגם את ה-input ב-\`clk rising edge\` ושומר אותו כ-\`Q\`.
  זה הזיכרון של הערך הקודם.
- **\`NOT\`** — מהפך את ה-input הנוכחי ל-\`¬input\`.
- **\`AND\`** — פולט 1 רק כש-\`Q = 1\` ו-\`input = 0\`.

**ביטוי הפלט:**

\`output = Q ∧ ¬input\`

**טבלת אמת:**

| Q | input | output | מצב |
|---|---|---|---|
| 0 | 0 | 0 | input היה 0 ועדיין 0 — אין קצה |
| 0 | 1 | 0 | input קם מ-0 ל-1 — קצה עולה (לא רלוונטי) |
| 1 | 0 | **1** | input ירד מ-1 ל-0 — **קצה יורד!** |
| 1 | 1 | 0 | input היה 1 ועדיין 1 — אין קצה |

**רוחב הפולס:** מחזור שעון אחד. הרגע ה-input ירד, \`¬input = 1\` ו-\`Q\`
עדיין שווה ל-1 → \`output = 1\`. ב-\`clk rising edge\` הבא, ה-D-FF דוגם
את הערך החדש (0), \`Q\` מתעדכן ל-0, ו-\`output\` חוזר ל-0.`,
        expectedAnswers: [
          'falling', 'falling edge', 'falling-edge', 'negative edge',
          'קצה יורד', 'גלאי קצה יורד', 'detector',
        ],
      },
      {
        label: 'ב',
        question: `איך תיישם את המעגל בפועל ב-Verilog? כתוב מודול סינכרוני
עם reset אסינכרוני אקטיבי-נמוך.`,
        hints: [
          'כל אחד משלושת הרכיבים (D-FF, NOT, AND) הוא ביטוי בודד ב-Verilog. מה הפרדיגמה לכל אחד?',
          'ה-D-FF נכתב ב-\`always @(posedge clk)\` עם \`q <= d\`. ה-NOT וה-AND הם \`assign\` עם \`~\` ו-\`&\`.',
          'תכלל reset אסינכרוני בתוך ה-sensitivity list של ה-always block: \`always @(posedge clk or negedge rst_n)\`.',
        ],
        answer:
`\`\`\`verilog
module falling_edge_detector (
    input  wire clk,
    input  wire rst_n,    // async reset, active-low
    input  wire d_in,
    output wire pulse
);

    reg q;

    // D-FF: samples d_in on the rising edge of clk; cleared by rst_n.
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) q <= 1'b0;
        else        q <= d_in;
    end

    // Combinational glue: pulse when previous=1 AND current=0.
    assign pulse = q & ~d_in;

endmodule
\`\`\`

**הסבר שורה-שורה:**

- \`reg q\` — היציאה של ה-D-FF (הערך של \`d_in\` ב-edge הקודם).
- \`always @(posedge clk or negedge rst_n)\` — מבנה סטנדרטי ל-D-FF
  עם reset אסינכרוני. ה-FF נדגם בכל \`clk rising edge\`, ומאופס מיידית
  כש-\`rst_n\` יורד ל-0.
- \`assign pulse = q & ~d_in\` — הביטוי הבוליאני שלנו, מתורגם 1:1 ל-Verilog.

**טיפים שמראיינים מצפים שתזכיר:**

- **\`<=\` ולא \`=\` בתוך \`always @(posedge ...)\`** — non-blocking assignment
  הוא הסטנדרט ל-FFs. \`=\` (blocking) יוצר race conditions בין FFs.
- **רוחב bit אחד** ל-\`d_in\` ו-\`pulse\`. אם רוצים גלאי על אות רב-ביטי,
  צריך להחליט: detect any change? detect specific transition?
- **חתימה לתעשייה:** רוב הצוותים דורשים גם \`(* keep *)\` או comment על
  ה-FF כדי שהסינתסייזר לא יבטל אותו אם נתיב הפלט לא מחובר.`,
        expectedAnswers: [
          'always', 'posedge', 'reg', 'assign', 'q & ~d_in', 'q & ~in',
          'q <= d_in', 'q <= in', 'q<=d_in', '<=',
        ],
      },
    ],
    source: 'מאגר ראיונות — תכנן מעגל לפי דיאגרמת גלים',
    tags: ['ff', 'edge-detector', 'falling-edge', 'sequential', 'design', 'verilog'],
    circuit: () => build(() => {
      // input → DFF → Q                ┐
      //                                 ├─→ AND → output
      // input → NOT → ~input ───────────┘
      const inp  = h.input(140, 220, 'input');
      const clk  = h.clock(140, 460);
      const dff  = h.ffD(420, 220, 'DFF');
      const inv  = h.gate('NOT', 420, 380);
      const and_ = h.gate('AND', 700, 300);
      const out  = h.output(940, 300, 'output');
      // Drive the input through a falling-edge sequence so the user can
      // STEP through and watch input toggle (matching the question's
      // waveform): LOW → HIGH for a few cycles → LOW → HIGH → LOW.
      inp.fixedValue = 0;
      inp.stepValues = [0, 1, 1, 1, 0, 0, 1, 1, 0, 0];
      return {
        nodes: [inp, clk, dff, inv, and_, out],
        wires: [
          h.wire(inp.id, dff.id, 0),    // input → DFF.D
          h.wire(clk.id, dff.id, 1),    // clk   → DFF.CLK
          h.wire(inp.id, inv.id, 0),    // input → NOT
          h.wire(dff.id, and_.id, 0),   // Q     → AND.in0
          h.wire(inv.id, and_.id, 1),   // ¬input → AND.in1
          h.wire(and_.id, out.id, 0),   // AND   → output
        ],
      };
    }),
  },
];
