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

**שתי גרסאות נפוצות:**

**גרסה א — input אסינכרוני (קלאסי, FF אחד):**

- **\`D-FF\`** — דוגם את ה-input ב-\`clk rising edge\` ושומר אותו כ-\`Q\`.
- **\`NOT\`** — מהפך את ה-input הנוכחי ל-\`¬input\`.
- **\`AND\`** — פולט 1 רק כש-\`Q = 1\` ו-\`input = 0\`.

ביטוי: \`output = Q ∧ ¬input\`

זה עובד כי ה-input משתנה **בין** קצות שעון, ולכן ב-rising edge ה-FF
דוגם את הערך הישן. בחלון הזמן שבין השינוי לקצה הבא, \`Q\` מחזיק עוד
את הערך הקודם בעוד \`input\` כבר נמוך → \`Q ∧ ¬input = 1\`.

**גרסה ב — input סינכרוני לאותו clock (שני FFים):**

כשה-input כבר דגום באותו clock domain (וזה גם מה שקורה בסימולטור
הזה עם \`stepValues\`), שני ה-FFים יידגמו באותו edge ו-\`Q\` ייצא שווה
ל-\`input\` — הפולס לא ייווצר. הפתרון: רושמים את ה-input קודם דרך FF
חיץ:

- **\`FF1\`** — דוגם את ה-input → \`curr\` (הנוכחי).
- **\`FF2\`** — דוגם את \`FF1.Q\` → \`prev\` (הקודם, באיחור מחזור נוסף).
- **\`NOT(curr) ∧ AND(prev, ¬curr)\`** — מזהה ש-\`prev = 1\` ו-\`curr = 0\`.

ביטוי: \`output = prev ∧ ¬curr\` = \`FF2.Q ∧ ¬FF1.Q\`

זו הגרסה שטעונה על הקנבס למעלה, ומשתמשת בשני FFים + NOT + AND.

**טבלת אמת (גרסה ב, על הערכים הדגומים):**

| prev (FF2) | curr (FF1) | output | מצב |
|---|---|---|---|
| 0 | 0 | 0 | אין קצה |
| 0 | 1 | 0 | קצה עולה |
| 1 | 0 | **1** | **קצה יורד!** |
| 1 | 1 | 0 | אין קצה |

**רוחב הפולס:** מחזור שעון אחד.

**הערה למראיין:** אם הקלט כבר מסונכרן לאותו שעון (FF output), הגרסה
המינימלית עם FF יחיד **לא תעבוד** כי \`Q ≡ D\` באותו edge — מצב שתופס
הרבה מועמדים בלי לב. גרסה ב היא הבטוחה. גרסה עם 3 FFים מוסיפה שלב
סנכרון נוסף נגד מטא-יציבות עבור קלטים אסינכרוניים אמיתיים.`,
        expectedAnswers: [
          'falling', 'falling edge', 'falling-edge', 'negative edge',
          'קצה יורד', 'גלאי קצה יורד', 'detector',
        ],
      },
      {
        label: 'ב',
        editor: 'verilog',
        starterCode:
`module falling_edge_detector (
    input  wire clk,
    input  wire rst_n,    // async reset, active-low
    input  wire d_in,
    output wire pulse
);

    // TODO: declare the two register stages

    // TODO: clocked block for the FF chain
    always @(posedge clk or negedge rst_n) begin

    end

    // TODO: combinational pulse assignment

endmodule
`,
        question: `איך תיישם את המעגל מסעיף א (גרסת שני ה-FFים) ב-Verilog?
כתוב מודול סינכרוני עם reset אסינכרוני אקטיבי-נמוך.`,
        hints: [
          'מבנה D-FF ב-Verilog: \`always @(posedge clk or negedge rst_n)\` עם \`q <= d\`.',
          'יש שני FFים בטור: ה-\`curr\` דוגם את הקלט, ה-\`prev\` דוגם את \`curr\`. שניהם ב-\`always\` אחד.',
          'הפלט הוא \`assign pulse = prev & ~curr\` — שילוב קומבינטורי של שתי הדגימות.',
        ],
        answer:
`\`\`\`verilog
module falling_edge_detector (
    input  wire clk,
    input  wire rst_n,     // async reset, active-low
    input  wire d_in,
    output wire pulse
);

    reg curr;   // d_in sampled this cycle
    reg prev;   // curr from the previous cycle

    // Two-stage register chain. Both FFs sample at the same posedge;
    // non-blocking (<=) ensures \`prev\` latches the OLD \`curr\`, not
    // the value being assigned to it this cycle.
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            curr <= 1'b0;
            prev <= 1'b0;
        end else begin
            curr <= d_in;
            prev <= curr;
        end
    end

    // Pulse when the sampled input fell between cycles:
    //   prev = 1 (sampled HIGH one cycle ago)
    //   curr = 0 (sampled LOW now)
    assign pulse = prev & ~curr;

endmodule
\`\`\`

**הסבר שורה-שורה:**

- \`reg curr, prev\` — שני ה-FFים. \`curr\` שומר את \`d_in\` שנדגם בקצה
  הזה, \`prev\` שומר את \`curr\` מהקצה הקודם.
- \`always @(posedge clk or negedge rst_n)\` — שני ה-FFים באותו בלוק;
  שניהם מתאפסים אסינכרונית כש-\`rst_n\` יורד.
- \`curr <= d_in; prev <= curr;\` — שני ה-assignments הם **non-blocking**
  (\`<=\`), כך ש-\`prev\` לוקח את הערך **הישן** של \`curr\`, לא את החדש
  שמוקצה לו עכשיו. זה הסוד שהופך את הצמד לשרשרת רגיסטרים אמיתית.
- \`assign pulse = prev & ~curr\` — קומבינטוריקה: פולס כש-\`prev=1\` ו-\`curr=0\`,
  בדיוק כמו ב-AND/NOT של המעגל.

**טיפים שמראיינים מצפים שתזכיר:**

- **\`<=\` ולא \`=\` בתוך \`always @(posedge ...)\`** — non-blocking assignment
  הוא הסטנדרט ל-FFs. עם \`=\` (blocking), \`prev = curr\` היה לוקח את
  הערך החדש של \`curr\` ולא הקודם — שרשרת ה-FFים הייתה קורסת ל-FF יחיד.
- **רוחב bit אחד** ל-\`d_in\` ו-\`pulse\`. אם רוצים גלאי על אות רב-ביטי,
  צריך להחליט: detect any change? detect specific transition?
- **למה לא FF אחד?** במעגל סינכרוני שבו ה-\`d_in\` עצמו דגום באותו שעון,
  FF יחיד היה נותן \`q ≡ d_in\` תמיד; הצורך בשני FFים מבטיח שיש לנו
  גם "נוכחי" וגם "קודם" שניתן להשוות. ראה את ההסבר בסעיף א.`,
        expectedAnswers: [
          'always', 'posedge', 'reg', 'assign',
          'prev & ~curr', 'prev&~curr', 'prev & !curr',
          'curr <= d_in', 'prev <= curr', '<=',
        ],
      },
    ],
    source: 'מאגר ראיונות — תכנן מעגל לפי דיאגרמת גלים',
    tags: ['ff', 'edge-detector', 'falling-edge', 'sequential', 'design', 'verilog'],
    circuit: () => build(() => {
      // input → FF1 → "current sampled" ─┬─→ NOT → ~curr ─┐
      //                                   │                ├─→ AND → output
      //                                   └→ FF2 → "previous sampled" ─┘
      //
      // Two FFs (not one): with `stepValues` the simulator applies the
      // new input value BEFORE the rising clock edge, so a 1-FF design
      // would sample the new value and `Q & ~input` would always be 0.
      // Adding FF1 as an input buffer guarantees FF2 holds the value
      // from one cycle earlier than FF1 — exactly the "previous vs
      // current" relationship the detector needs.
      const inp   = h.input(140, 220, 'input');
      const clk   = h.clock(140, 540);
      const ffCur = h.ffD(380, 220, 'FF_curr');   // current sampled
      const ffPrv = h.ffD(700, 220, 'FF_prev');   // previous sampled
      const inv   = h.gate('NOT', 700, 400);
      const and_  = h.gate('AND', 980, 320);
      const out   = h.output(1220, 320, 'output');
      inp.fixedValue = 0;
      // Mirror the question's waveform: LOW → HIGH (one wide pulse) → LOW.
      // The detector's pulse appears two clocks after the falling edge
      // (FF1 buffer + FF2 prev), i.e. around step 8.
      inp.stepValues = [0, 1, 1, 1, 1, 1, 0, 0, 0, 0];
      return {
        nodes: [inp, clk, ffCur, ffPrv, inv, and_, out],
        wires: [
          h.wire(inp.id,   ffCur.id, 0),   // input → FF1.D
          h.wire(clk.id,   ffCur.id, 1),   // clk   → FF1.CLK
          h.wire(ffCur.id, ffPrv.id, 0),   // FF1.Q → FF2.D
          h.wire(clk.id,   ffPrv.id, 1),   // clk   → FF2.CLK
          h.wire(ffCur.id, inv.id,   0),   // FF1.Q → NOT
          h.wire(ffPrv.id, and_.id,  0),   // FF2.Q → AND.in0  (previous)
          h.wire(inv.id,   and_.id,  1),   // ¬curr → AND.in1
          h.wire(and_.id,  out.id,   0),   // AND   → output
        ],
      };
    }),
  },
];
