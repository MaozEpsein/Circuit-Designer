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
    title: 'מעגל לדיאגרמת גלים נתונה',
    intro:
`לפי הגלים: \`output\` נשאר 0 חוץ מפולס ב-1 שמופיע מיד אחרי קצה יורד של \`input\`.`,
    // The waveform IS the question — show it up front.
    schematic: FALLING_EDGE_SVG,
    // The circuit IS the answer — don't expose the "load on canvas" bar
    // until the user reveals the solution.
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'תכנן את המעגל. רכיבים מינימליים + ביטוי בוליאני.',
        hints: [
          'output קופץ ל-1 בקצה יורד של input → falling-edge detector.',
          'צריך לזכור את הערך הקודם — D-FF.',
          '\`output = Q ∧ ¬input\` (קלאסי, FF יחיד).',
        ],
        answer:
`**Falling-edge detector.** \`output = Q ∧ ¬input\`.

**FF יחיד** (קלט אסינכרוני): D-FF + NOT + AND. עובד כי input משתנה בין edges.

**שני FFים** (קלט סינכרוני, כמו בסימולטור): FF1 → curr, FF2 → prev. \`output = prev ∧ ¬curr\`. זו הגרסה על הקנבס.

(3 FFים = הוספת סינכרוניזטור מטא-יציבות.)`,
        interviewerMindset:
`רוצה לבדוק אם אתה מבחין בין **קלט אסינכרוני** ל-**סינכרוני**. הרבה מועמדים זורקים "FF + AND" ועוצרים — נכון בחומרה אבל לא בכל הקשר.

**מקפיץ אותך לטובה:**
- לשאול "האם d_in סינכרוני לאותו clk?" לפני שאתה מתחיל לתכנן.
- להזכיר ש-non-blocking ב-Verilog הוא הסיבה שהשרשרת עובדת.

**מקפיץ אותך לרעה:** לכתוב \`q = d\` במקום \`q <= d\`. שום תכן מתקדם לא יסתיר את זה.`,
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
        question: 'ממש ב-Verilog (גרסת 2 FFים) עם reset אסינכרוני אקטיבי-נמוך.',
        hints: [
          '\`always @(posedge clk or negedge rst_n)\` עם \`q <= d\`.',
          'שניהם באותו always: \`curr <= d_in; prev <= curr;\` (non-blocking).',
        ],
        answer:
`\`\`\`verilog
module falling_edge_detector (
    input  wire clk, rst_n, d_in,
    output wire pulse
);
    reg curr, prev;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) {curr, prev} <= 2'b00;
        else        begin curr <= d_in; prev <= curr; end
    end
    assign pulse = prev & ~curr;
endmodule
\`\`\`

**מפתח:** \`<=\` (non-blocking) ב-prev לוקח את ה-curr **הישן**, לא החדש.`,
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

  // ─────────────────────────────────────────────────────────────
  // #2002 — sequence detector "101" (Mealy + Moore)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'sequence-detector-101',
    difficulty: 'medium',
    title: 'גלאי "101" עם חפיפה — Mealy/Moore',
    intro: 'תזהה את הרצף "1,0,1" באות סדרתי \`x\`. חפיפה מותרת.',
    parts: [
      {
        label: 'א',
        question: 'ממש כ-Mealy FSM. כמה מצבים מינימלית?',
        hints: [
          'Mealy: פלט = f(state, input). 3 מצבים מספיקים.',
          'S0=התחלה, S1=ראיתי 1, S2=ראיתי 10. ב-S2+x=1 → y=1 ועוברים ל-S1 (חפיפה).',
        ],
        answer:
`**3 מצבים** (S0, S1=״1״, S2=״10״). קידוד 00/01/10.

\`D0 = x\` , \`D1 = ¬Q1·Q0·¬x\` , \`y = Q1·¬Q0·x\`.

\`y\` קומבינטורי → תגובה באותו cycle אבל חשוף ל-glitches.`,
        interviewerMindset:
`רוצה לראות שאתה יודע לבנות FSM מינימלי. הטעות הקלאסית — מדברים על 4 מצבים בלי לחשוב למה. **3 מספיק ב-Mealy, ולא ב-Moore — וזה ההבדל המהותי בין השתיים.**

**בונוס:** הזכרת חפיפה (overlap) מיוזמתך — לפני שמרמזים לך.`,
        circuitRevealsAnswer: true,
        circuit: () => build(() => {
          // Inputs
          const x   = h.input(120, 220, 'x');
          const clk = h.clock(120, 560);
          // Drive x through a stream with two overlapping "101" patterns.
          // Sequence: 1,0,1,0,1,1,0,1 → expect Mealy y high on cycles 3, 5, 8.
          x.fixedValue = 0;
          x.stepValues = [1, 0, 1, 0, 1, 1, 0, 1, 0, 0];

          // Two D-FFs: Q1 (high state bit), Q0 (low state bit).
          const ff0 = h.ffD(440, 380, 'Q0');
          const ff1 = h.ffD(440, 180, 'Q1');

          // Inverters
          const invX  = h.gate('NOT', 280, 260);
          const invQ1 = h.gate('NOT', 700, 100);
          const invQ0 = h.gate('NOT', 700, 480);

          // D1 = ¬Q1 · (Q0 · ¬x) — chain of two 2-input ANDs.
          const tQ0nx = h.gate('AND', 640, 340);
          const tD1   = h.gate('AND', 820, 200);
          // y = (Q1 · ¬Q0) · x — chain of two 2-input ANDs.
          const andY1 = h.gate('AND', 900, 280);
          const andY2 = h.gate('AND', 1080, 320);

          const y = h.output(1260, 320, 'y');

          return {
            nodes: [
              x, clk, ff0, ff1,
              invX, invQ1, invQ0,
              tQ0nx, tD1, andY1, andY2,
              y,
            ],
            wires: [
              // Clock to both FFs
              h.wire(clk.id, ff0.id, 1),
              h.wire(clk.id, ff1.id, 1),
              // D0 ← x
              h.wire(x.id,   ff0.id, 0),
              // Inverters
              h.wire(x.id,   invX.id,  0),
              h.wire(ff1.id, invQ1.id, 0),
              h.wire(ff0.id, invQ0.id, 0),
              // t1 = Q0 · ¬x
              h.wire(ff0.id, tQ0nx.id, 0),
              h.wire(invX.id, tQ0nx.id, 1),
              // D1 = ¬Q1 · t1
              h.wire(invQ1.id, tD1.id, 0),
              h.wire(tQ0nx.id, tD1.id, 1),
              h.wire(tD1.id,   ff1.id, 0),    // D1 → FF1.D
              // y = (Q1 · ¬Q0) · x
              h.wire(ff1.id,  andY1.id, 0),
              h.wire(invQ0.id, andY1.id, 1),
              h.wire(andY1.id, andY2.id, 0),
              h.wire(x.id,     andY2.id, 1),
              h.wire(andY2.id, y.id, 0),
            ],
          };
        }),
        expectedAnswers: [
          'mealy', '3', 'שלושה', 'שלוש',
          's0', 's1', 's2',
          'q1 · ¬q0 · x', 'q1 & ~q0 & x', 'q1*!q0*x',
          'y = q1 · ¬q0 · x', 'output combinational',
        ],
      },
      {
        label: 'ב',
        question: 'ממש כ-Moore FSM. למה צריך עוד מצב?',
        hints: [
          'Moore: פלט = f(state) בלבד. צריך מצב ייעודי "ראיתי 101".',
          '4 מצבים. S3=״101״, \`y = Q1·Q0\`.',
        ],
        answer:
`**4 מצבים** (S0..S3). קידוד 00/01/10/11.

\`D0 = x\` , \`D1 = (Q0·¬x) + (Q1·¬Q0·x)\` , \`y = Q1·Q0\`.

\`y\` יוצא מ-FFים → ללא glitches, אבל מופיע **מחזור מאוחר יותר** מ-Mealy.`,
        interviewerMindset:
`השאלה האמיתית היא **"מה תבחר ולמה"**. מועמד טוב יודע את המבנים; מועמד מצוין יודע מתי לבחור איזה.

**תשובה רצויה:** "אם הלקוח של y דוגם ב-clk הבא ויש סיכון ל-glitches — Moore. אם אני צריך תגובה באותו cycle (control signal לכניסה ל-stage הבא ב-pipeline) — Mealy."`,
        circuitRevealsAnswer: true,
        circuit: () => build(() => {
          const x   = h.input(120, 220, 'x');
          const clk = h.clock(120, 640);
          x.fixedValue = 0;
          x.stepValues = [1, 0, 1, 0, 1, 1, 0, 1, 0, 0];

          const ff0 = h.ffD(540, 420, 'Q0');
          const ff1 = h.ffD(540, 200, 'Q1');

          const invX  = h.gate('NOT', 280, 280);
          const invQ0 = h.gate('NOT', 800, 540);

          // D1 = (Q0 · ¬x) + (Q1 · ¬Q0 · x)
          const t_q0nx   = h.gate('AND', 320, 100);     // Q0 · ¬x
          const t_q1nq0  = h.gate('AND', 280, 540);     // Q1 · ¬Q0
          const t_pq1nq0 = h.gate('AND', 460, 600);     // (Q1 · ¬Q0) · x
          const orD1     = h.gate('OR',  680, 320);     // D1
          // y = Q1 · Q0
          const andY = h.gate('AND', 800, 320);

          const y = h.output(1100, 320, 'y');

          return {
            nodes: [
              x, clk, ff0, ff1,
              invX, invQ0,
              t_q0nx, t_q1nq0, t_pq1nq0, orD1, andY,
              y,
            ],
            wires: [
              // Clock
              h.wire(clk.id, ff0.id, 1),
              h.wire(clk.id, ff1.id, 1),
              // D0 ← x
              h.wire(x.id, ff0.id, 0),
              // Inverters
              h.wire(x.id, invX.id, 0),
              h.wire(ff0.id, invQ0.id, 0),
              // Q0 · ¬x
              h.wire(ff0.id, t_q0nx.id, 0),
              h.wire(invX.id, t_q0nx.id, 1),
              // Q1 · ¬Q0
              h.wire(ff1.id,  t_q1nq0.id, 0),
              h.wire(invQ0.id, t_q1nq0.id, 1),
              // (Q1 · ¬Q0) · x
              h.wire(t_q1nq0.id, t_pq1nq0.id, 0),
              h.wire(x.id,       t_pq1nq0.id, 1),
              // OR → D1
              h.wire(t_q0nx.id,   orD1.id, 0),
              h.wire(t_pq1nq0.id, orD1.id, 1),
              h.wire(orD1.id,     ff1.id, 0),
              // y = Q1 · Q0
              h.wire(ff1.id, andY.id, 0),
              h.wire(ff0.id, andY.id, 1),
              h.wire(andY.id, y.id, 0),
            ],
          };
        }),
        expectedAnswers: [
          'moore', '4', 'ארבעה', 'ארבע',
          's0', 's1', 's2', 's3',
          'q1 · q0', 'q1 & q0', 'q1*q0',
          'y = q1 · q0', 'one cycle later', 'cycle delay',
        ],
      },
    ],
    source: 'מאגר ראיונות — FSM קלאסי, Mealy מול Moore',
    tags: ['fsm', 'mealy', 'moore', 'sequence-detector', 'sequential'],
  },

  // ─────────────────────────────────────────────────────────────
  // #2003 — D-FF with enable from a plain D-FF
  // ─────────────────────────────────────────────────────────────
  {
    id: 'd-ff-with-enable',
    difficulty: 'easy',
    title: 'בנה D-FF עם enable מ-D-FF רגיל',
    intro: 'נתון D-FF סטנדרטי (clk, data, Q). הוסף קלט \`enable\` באמצעות לוגיקה נוספת.',
    parts: [
      {
        label: null,
        question: 'מה התשובה הנכונה — ולמה לא לעשות gating על השעון?',
        hints: [
          'הפתרון הנאיבי: AND(clk, enable) → FF.clk. **שגוי** — clock gating פתוח לגליצ׳ים ובעיות timing.',
          'הפתרון הנכון: השאר את ה-clk נקי. שלוט ב-**D** במקום: כש-en=0, החזר את Q לעצמו.',
          'MUX 2:1 על D: \`D_FF = enable ? data : Q\`. גם בלי MUX: \`(en·data) + (¬en·Q)\`.',
        ],
        answer:
`**MUX על ה-D**, לא gating על השעון:

\`D_FF = enable ? data : Q\`

כש-\`enable=1\`: נכנס \`data\` רגיל. כש-\`enable=0\`: ה-FF דוגם את הערך **שלו עצמו** → Q לא משתנה.

**למה לא gating על ה-clk?** \`AND(clk, enable)\` יוצר גליצ׳ים אם enable משתנה בזמן clk גבוה, מפר timing constraints, ולא ניתן לסינתוז בצורה בטוחה. תמיד עדיף לתפוס נתונים עם clk נקי ולשלוט באמצעות D או דרך feedback.`,
        interviewerMindset:
`כל מועמד שני נכשל פה. הם זורקים "AND על השעון" כי זה הפתרון "האינטואיטיבי" — והמראיין מחכה לזה.

**מה לומר:** "ראשית, אני **לא** עושה clock gating כי זה יוצר glitches ו-skew. אני שולט ב-D עם MUX שמרגיש את enable, או עם feedback מ-Q לעצמו."

**נוקאאוט:** להזכיר ש-clock gating "אמיתי" (Integrated Clock Gating cell) קיים בספריות, אבל אסור לבנות ידנית עם AND.`,
        expectedAnswers: [
          'mux', 'feedback', 'enable ? data : q', 'enable ? d : q',
          'd = en', 'd_ff', 'gating', 'clock gating',
          'enable*data', '!enable*q', 'בריקבק', 'אנייבל',
        ],
        circuitRevealsAnswer: true,
        circuit: () => build(() => {
          const data = h.input(120, 160, 'data');
          const en   = h.input(120, 280, 'enable');
          const clk  = h.clock(120, 480);
          data.fixedValue = 0;
          en.fixedValue   = 1;
          data.stepValues = [0, 1, 1, 0, 1, 1, 0, 0, 1, 0];
          en.stepValues   = [1, 1, 0, 0, 0, 1, 1, 0, 0, 1];

          const mux = h.mux(400, 200, 'MUX');     // d0=0 (when sel=0), d1=1 (when sel=1)
          const ff  = h.ffD(700, 200, 'D-FF');
          const q   = h.output(960, 200, 'Q');

          return {
            nodes: [data, en, clk, mux, ff, q],
            wires: [
              h.wire(data.id, mux.id, 1),  // data → MUX.d1 (selected when enable=1)
              h.wire(ff.id,   mux.id, 0),  // Q → MUX.d0 (selected when enable=0; feedback)
              h.wire(en.id,   mux.id, 2),  // enable → MUX.sel
              h.wire(mux.id,  ff.id,  0),  // MUX out → FF.D
              h.wire(clk.id,  ff.id,  1),  // clk → FF.CLK
              h.wire(ff.id,   q.id,   0),
            ],
          };
        }),
      },
    ],
    source: 'מאגר ראיונות — תכן סינכרוני בסיסי',
    tags: ['d-ff', 'enable', 'clock-gating', 'mux', 'sequential'],
  },

  // ─────────────────────────────────────────────────────────────
  // #2004 — generate squares 1,4,9,16,... without multiplier or MUX
  // ─────────────────────────────────────────────────────────────
  {
    id: 'squares-without-mux',
    difficulty: 'medium',
    title: 'סדרת ריבועים ברצף — בלי MUX',
    intro:
`ממש רכיב שמוציא ברצף את ריבועי המספרים, ללא שימוש ב-MUX.

\`\`\`
Input:   1, 2, 3, 4,  5,  6, ..., 10, ...
Output:  1, 4, 9, 16, 25, 36, ..., 100, ...
\`\`\``,
    parts: [
      {
        label: null,
        question: 'איך לחשב את הריבוע הבא בלי לכפול?',
        hints: [
          'יש זהות מתמטית פשוטה ש-(n+1)² ניתן לחשב מתוך n². מצא אותה.',
          '\`(n+1)² = n² + 2n + 1\`. כלומר: הריבוע הבא = הקודם + מספר אי-זוגי.',
          'הסדרה: 1, 4, 9, 16, 25... ההפרשים: 3, 5, 7, 9... — מספרים אי-זוגיים עוקבים.',
          'חומרה: מונה \`n\`, חישוב \`2n+1\` (n מוסט שמאלה + LSB=1, רק חוטים), מחבר (ADDER), ורגיסטר צובר.',
        ],
        answer:
`**זהות:** \`(n+1)² = n² + 2n + 1\`. הריבוע הבא = הקודם + מספר אי-זוגי.

**אדריכלות (3 רכיבים):**

1. **COUNTER \`n\`** (סופר 0, 1, 2, ...) — מספק את \`n\` בכל cycle.
2. **wire trick** ל-\`2n+1\`: \`n\` מוסט שמאלה ביט אחד (concat עם 0), ה-LSB חוטית ל-1. **חישוב ללא שערים** — רק wires.
3. **ADDER + REGISTER (Q)**: \`Q ← Q + (2n+1)\`. בכל clock edge מתעדכן.

**זרימה:** \`Q\` מתחיל ב-0. cycle 1: \`Q = 0+1 = 1\`. cycle 2: \`Q = 1+3 = 4\`. cycle 3: \`Q = 4+5 = 9\`. וכן הלאה.

**רכיבים על הקנבס:** COUNTER (n), 3 ALUs (n+n, +1, +Q), REGISTER (Q). לחץ STEP — \`Q\` עוקב אחרי 1, 4, 9, 16, 25, ...`,
        interviewerMindset:
`המלכודת: לקפוץ ישר לחומרה לפני הזיהוי המתמטי. רוצה לשמוע **"רגע, יש זהות: (n+1)² = n² + 2n + 1"** לפני שאתה שולף counter ו-adder.

**מה מבחין מועמד טוב ממצוין:** טוב יגיד "אצבור הפרשים אי-זוגיים". מצוין יוסיף "ההפרשים = הסדרה אי-זוגית, ואני יכול לבנות אותה מ-\`2n+1\` בלי כפל ובלי MUX — רק wires + adder".`,
        circuitRevealsAnswer: true,
        circuit: () => build(() => {
          const clk  = h.clock(100, 720);
          // OP = 0 (ADD) for all three ALUs.
          const op   = h.input(320, 60, 'OP=0');  op.fixedValue = 0;
          // Constant 1 for the "+1" stage.
          const one  = h.input(580, 60, '1');     one.fixedValue = 1;

          const cnt  = h.block('COUNTER',  320, 240, { bitWidth: 4, label: 'CNT n' });
          const alu1 = h.block('ALU',      580, 240, { bitWidth: 8, label: 'ALU 2n' });
          const alu2 = h.block('ALU',      840, 340, { bitWidth: 8, label: 'ALU +1' });
          const alu3 = h.block('ALU',     1100, 460, { bitWidth: 8, label: 'ALU +Q' });
          const reg  = h.block('REGISTER',1360, 460, { bitWidth: 8, label: 'Q (n²)' });
          const out  = h.output(1620, 460, 'Q = n²');

          return {
            nodes: [clk, op, one, cnt, alu1, alu2, alu3, reg, out],
            wires: [
              // Clocks
              h.wire(clk.id, cnt.id, 4, 0, { isClockWire: true }),
              h.wire(clk.id, reg.id, 3, 0, { isClockWire: true }),
              // ALU1: A=n, B=n, OP=ADD → 2n
              h.wire(cnt.id, alu1.id, 0, 0),
              h.wire(cnt.id, alu1.id, 1, 0),
              h.wire(op.id,  alu1.id, 2),
              // ALU2: A=2n, B=1, OP=ADD → 2n+1
              h.wire(alu1.id, alu2.id, 0, 0),
              h.wire(one.id,  alu2.id, 1),
              h.wire(op.id,   alu2.id, 2),
              // ALU3: A=(2n+1), B=Q, OP=ADD → Q+2n+1
              h.wire(alu2.id, alu3.id, 0, 0),
              h.wire(reg.id,  alu3.id, 1, 0),
              h.wire(op.id,   alu3.id, 2),
              // Register: D ← ALU3.out
              h.wire(alu3.id, reg.id, 0, 0),
              // Output
              h.wire(reg.id, out.id, 0, 0),
            ],
          };
        }),
        expectedAnswers: [
          '(n+1)', 'n² + 2n', '2n+1', 'odd', 'אי-זוגי',
          'counter', 'accumulator', 'מונה', 'צובר', 'register',
          'shift', 'הסטה', 'הזחה',
        ],
      },
    ],
    source: 'מאגר ראיונות — תכן ספרתי יצירתי בלי כפל/MUX',
    tags: ['squares', 'accumulator', 'counter', 'no-mux', 'sequential'],
  },

  // ─────────────────────────────────────────────────────────────
  // #2005 — divide-by-3 clock with 50% duty cycle
  // ─────────────────────────────────────────────────────────────
  {
    id: 'div-by-3-50-duty',
    difficulty: 'medium',
    title: 'מחלק תדר ב-3 עם duty cycle 50%',
    intro:
`תכנן מעגל שמייצר \`clk_out\` בתדר \`clk_in / 3\` עם **50% duty cycle**
(זמן גבוה = זמן נמוך = 1.5 מחזורי שעון בכניסה).`,
    parts: [
      {
        label: null,
        question: 'מה הטריק עם N אי-זוגי?',
        hints: [
          'עם posedge בלבד — מעברים רק בכפולות שלמות של מחזור. אז 1.5 מחזורים בלתי אפשרי.',
          'הפתרון: השתמש גם ב-posedge וגם ב-negedge. שני מחלקים ב-3 (אחד posedge, אחד negedge) מוזזים בחצי מחזור.',
          'OR בין שני המחלקים → פלט שמופיע פעם אחת לכל 3 מחזורים, באורך 1.5 מחזורים.',
        ],
        answer:
`**הטריק:** שלוב posedge ו-negedge. מחלק רגיל מ-N עם N אי-זוגי לא יכול לתת 50% duty רק עם posedge (הזמנים מתחלקים בקפיצות של מחזור שלם).

**מבנה (3 FFים):**

\`\`\`verilog
reg [1:0] p;   // posedge state: 00 → 01 → 10 → 00
reg       n;   // negedge sampler

always @(posedge clk) begin
    case (p)
        2'b00: p <= 2'b01;
        2'b01: p <= 2'b10;
        2'b10: p <= 2'b00;
    endcase
end

wire pos_high = (p == 2'b10);   // high one full cycle out of 3

always @(negedge clk) n <= pos_high;

assign clk_out = pos_high | n;  // 1.5 cycles high, 1.5 cycles low
\`\`\`

**למה זה עובד:**
- \`pos_high\` גבוה למחזור שלם (cycle 1 מתוך כל 3 בקבוצה).
- \`n\` הוא אותו אות מדגום בנגדג׳ → גבוה למחזור שלם, מוזז ב-½ מחזור.
- OR ביניהם → גבוה ל-1.5 מחזורים רצופים, אז נמוך ל-1.5. **duty = 50% ✓**

**כלל אצבע:** לחלוקה ב-N אי-זוגי עם 50% duty תמיד נדרשים גם posedge וגם negedge FFים.`,
        interviewerMindset:
`רוצה לראות שאתה מבין שהגבלת ה-resolution של posedge בלבד = מחזור שלם. **N אי-זוגי + 50% duty = חצי מחזור = שתי קצוות חובה.**

**ההבחנה הגדולה:** מועמדים זריזים מנסים לחשב מתי לעלות/לרדת בלי לחשוב על resolution. לומר מראש "צריך גם negedge" — חותך 5 דקות של תקיעות.

**הערה לסינתוז:** בצוותים מסוימים פוסלים negedge FFים. הפתרון אז: שעון פנימי מהיר פי 2 + פוס בלבד.`,
        expectedAnswers: [
          'posedge', 'negedge', 'both edges', 'שני קצוות',
          '50%', 'duty', '1.5', 'הזחה', 'shift',
          'or', 'p1·¬p2', 'pos_high',
        ],
        circuitRevealsAnswer: true,
        circuit: () => build(() => {
          const clk = h.clock(100, 600);
          const invClk = h.gate('NOT', 280, 600);

          const andD1 = h.gate('AND', 460, 220);   // ¬p1 · p2 → FF1.D
          const andD2 = h.gate('AND', 460, 400);   // ¬p1 · ¬p2 → FF2.D

          const ff1 = h.ffD(720, 220, 'p1');       // posedge
          const ff2 = h.ffD(720, 400, 'p2');       // posedge

          const notP1 = h.gate('NOT', 940, 280);
          const notP2 = h.gate('NOT', 940, 460);

          const andDec = h.gate('AND', 1180, 360); // p1 · ¬p2  (state == 10)

          const ff3 = h.ffD(1440, 600, 'n');       // negedge sampler

          const orOut = h.gate('OR', 1680, 540);
          const out   = h.output(1920, 540, 'clk/3');

          return {
            nodes: [
              clk, invClk,
              andD1, andD2,
              ff1, ff2,
              notP1, notP2,
              andDec, ff3,
              orOut, out,
            ],
            wires: [
              // Clocks
              h.wire(clk.id, ff1.id, 1, 0, { isClockWire: true }),
              h.wire(clk.id, ff2.id, 1, 0, { isClockWire: true }),
              h.wire(clk.id, invClk.id, 0),
              h.wire(invClk.id, ff3.id, 1, 0, { isClockWire: true }),
              // FF outputs → inverters
              h.wire(ff1.id, notP1.id, 0),
              h.wire(ff2.id, notP2.id, 0),
              // D1 = ¬p1 · p2
              h.wire(notP1.id, andD1.id, 0),
              h.wire(ff2.id,   andD1.id, 1),
              h.wire(andD1.id, ff1.id,   0),
              // D2 = ¬p1 · ¬p2
              h.wire(notP1.id, andD2.id, 0),
              h.wire(notP2.id, andD2.id, 1),
              h.wire(andD2.id, ff2.id,   0),
              // decode = p1 · ¬p2
              h.wire(ff1.id,   andDec.id, 0),
              h.wire(notP2.id, andDec.id, 1),
              // FF3 (n) samples decode on negedge
              h.wire(andDec.id, ff3.id, 0),
              // Final OR
              h.wire(andDec.id, orOut.id, 0),
              h.wire(ff3.id,    orOut.id, 1),
              h.wire(orOut.id,  out.id,   0),
            ],
          };
        }),
      },
    ],
    source: 'מאגר ראיונות — מחלק תדר אי-זוגי 50% duty (שאלה קלאסית)',
    tags: ['clock-divider', 'div-by-3', 'duty-cycle', 'negedge', 'sequential'],
  },

  // ─────────────────────────────────────────────────────────────
  // #2006 — FSM "11" detector — full flow with K-map minimization
  // ─────────────────────────────────────────────────────────────
  {
    id: 'fsm-11-detector-kmap',
    difficulty: 'medium',
    title: 'גלאי "11" — מהמפרט עד השערים',
    intro:
`תכנן FSM **סינכרוני (Moore)** שמדליק \`y=1\` כאשר שני הקלטים האחרונים
היו \`1,1\`. חפיפה מותרת (1,1,1 → 2 זיהויים).

עבור את כל הפלואו: דיאגרמת מצבים → טבלת מעבר → K-maps → שערים.`,
    parts: [
      {
        label: null,
        question: 'כמה מצבים צריך? מה הביטויים המינימליים ל-D1, D0, y?',
        hints: [
          'Moore עם 3 מצבים: S0 (אין), S1 (ראיתי 1), S2 (ראיתי 11). 2 FFים → מצב 11 don\'t-care.',
          'בנה טבלת מעבר 8 שורות (Q1, Q0, x). השאר 2 שורות של don\'t-care.',
          'K-map עם don\'t-cares: לרוב חוסכת כמה literals. שווה לנצל.',
        ],
        answer:
`**3 מצבים** | קידוד: S0=00, S1=01, S2=10 | מצב 11 = **don't-care**.

**טבלת מעבר:**

| Q1 | Q0 | x | D1 | D0 | y |
|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 | 0 |
| 0 | 0 | 1 | 0 | 1 | 0 |
| 0 | 1 | 0 | 0 | 0 | 0 |
| 0 | 1 | 1 | 1 | 0 | 0 |
| 1 | 0 | 0 | 0 | 0 | 1 |
| 1 | 0 | 1 | 1 | 0 | 1 |
| 1 | 1 | x | X | X | X |

**K-maps (עם ניצול don't-cares):**

\`D1 = x · (Q1 + Q0)\`
\`D0 = ¬Q1 · ¬Q0 · x\`
\`y  = Q1\`

**ללא don't-cares היה יוצא:** \`D1 = ¬Q1·Q0·x + Q1·¬Q0·x\` (6 literals במקום 3). חיסכון משמעותי.

**שערים:** 2 NOT, 2 AND-2, 1 AND-3, 1 OR-2 (פלוס 2 D-FFים).`,
        answerSchematic: `
<svg viewBox="0 0 720 380" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="State diagram and K-maps for 11 detector FSM">
  <!-- State diagram -->
  <text x="120" y="20" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="12">State Diagram</text>

  <!-- S0 -->
  <circle cx="60" cy="120" r="28" fill="#0a1520" stroke="#80f0a0" stroke-width="1.8"/>
  <text x="60" y="118" text-anchor="middle" fill="#80f0a0" font-weight="bold">S0</text>
  <text x="60" y="132" text-anchor="middle" fill="#80f0a0" font-size="9">y=0</text>

  <!-- S1 -->
  <circle cx="180" cy="120" r="28" fill="#0a1520" stroke="#80f0a0" stroke-width="1.8"/>
  <text x="180" y="118" text-anchor="middle" fill="#80f0a0" font-weight="bold">S1</text>
  <text x="180" y="132" text-anchor="middle" fill="#80f0a0" font-size="9">y=0</text>

  <!-- S2 -->
  <circle cx="180" cy="240" r="28" fill="#0a1520" stroke="#f0a040" stroke-width="2"/>
  <text x="180" y="238" text-anchor="middle" fill="#f0a040" font-weight="bold">S2</text>
  <text x="180" y="252" text-anchor="middle" fill="#f0a040" font-size="9">y=1</text>

  <!-- Transitions -->
  <!-- S0 -> S1, x=1 -->
  <path d="M 92 115 Q 120 100 152 115" fill="none" stroke="#c8d8f0" stroke-width="1.4" marker-end="url(#arrowEnd)"/>
  <text x="120" y="92" text-anchor="middle" fill="#c8d8f0" font-size="10">x=1</text>

  <!-- S1 -> S0, x=0 -->
  <path d="M 152 130 Q 120 145 92 130" fill="none" stroke="#c8d8f0" stroke-width="1.4" marker-end="url(#arrowEnd)"/>
  <text x="120" y="158" text-anchor="middle" fill="#c8d8f0" font-size="10">x=0</text>

  <!-- S1 -> S2, x=1 -->
  <path d="M 180 148 L 180 212" fill="none" stroke="#c8d8f0" stroke-width="1.4" marker-end="url(#arrowEnd)"/>
  <text x="190" y="184" fill="#c8d8f0" font-size="10">x=1</text>

  <!-- S2 -> S0, x=0 -->
  <path d="M 156 230 Q 100 200 60 152" fill="none" stroke="#c8d8f0" stroke-width="1.4" marker-end="url(#arrowEnd)"/>
  <text x="86" y="195" fill="#c8d8f0" font-size="10">x=0</text>

  <!-- S2 -> S2, x=1 (self-loop) -->
  <path d="M 200 268 Q 240 280 230 250 Q 220 224 200 240" fill="none" stroke="#c8d8f0" stroke-width="1.4" marker-end="url(#arrowEnd)"/>
  <text x="240" y="265" fill="#c8d8f0" font-size="10">x=1</text>

  <!-- S0 self-loop, x=0 -->
  <path d="M 40 95 Q 8 75 18 110 Q 28 145 50 145" fill="none" stroke="#c8d8f0" stroke-width="1.4" marker-end="url(#arrowEnd)"/>
  <text x="0" y="100" fill="#c8d8f0" font-size="10">x=0</text>

  <!-- Arrow marker -->
  <defs>
    <marker id="arrowEnd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#c8d8f0"/>
    </marker>
  </defs>

  <!-- K-maps -->
  <text x="500" y="20" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="12">K-maps</text>

  <!-- D1 K-map -->
  <text x="380" y="55" fill="#80f0a0" font-weight="bold">D1 = x·(Q1+Q0)</text>
  <text x="430" y="78" text-anchor="middle" fill="#80b0e0" font-size="10">x</text>
  <text x="395" y="98" text-anchor="middle" fill="#80b0e0" font-size="9">Q1Q0</text>
  <g fill="#c8d8f0" font-size="10" text-anchor="middle">
    <text x="425" y="95">0</text>
    <text x="455" y="95">1</text>
    <text x="395" y="115">00</text>
    <text x="425" y="115">0</text>
    <text x="455" y="115">0</text>
    <text x="395" y="135">01</text>
    <text x="425" y="135">0</text>
    <text x="455" y="135" fill="#80f0a0" font-weight="bold">1</text>
    <text x="395" y="155">11</text>
    <text x="425" y="155" fill="#f0a040">X</text>
    <text x="455" y="155" fill="#f0a040">X</text>
    <text x="395" y="175">10</text>
    <text x="425" y="175">0</text>
    <text x="455" y="175" fill="#80f0a0" font-weight="bold">1</text>
  </g>
  <!-- Group on right column rows 01,11,10 -->
  <rect x="442" y="125" width="28" height="60" rx="10" fill="none" stroke="#39ff80" stroke-width="2"/>

  <!-- D0 K-map -->
  <text x="510" y="220" fill="#80f0a0" font-weight="bold">D0 = ¬Q1·¬Q0·x</text>
  <text x="430" y="245" text-anchor="middle" fill="#80b0e0" font-size="10">x</text>
  <g fill="#c8d8f0" font-size="10" text-anchor="middle">
    <text x="425" y="262">0</text>
    <text x="455" y="262">1</text>
    <text x="395" y="282">00</text>
    <text x="425" y="282">0</text>
    <text x="455" y="282" fill="#80f0a0" font-weight="bold">1</text>
    <text x="395" y="302">01</text>
    <text x="425" y="302">0</text>
    <text x="455" y="302">0</text>
    <text x="395" y="322">11</text>
    <text x="425" y="322" fill="#f0a040">X</text>
    <text x="455" y="322" fill="#f0a040">X</text>
    <text x="395" y="342">10</text>
    <text x="425" y="342">0</text>
    <text x="455" y="342">0</text>
  </g>
  <circle cx="455" cy="278" r="11" fill="none" stroke="#39ff80" stroke-width="2"/>

  <!-- y K-map -->
  <text x="640" y="55" fill="#80f0a0" font-weight="bold">y = Q1</text>
  <text x="640" y="78" text-anchor="middle" fill="#80b0e0" font-size="10">x</text>
  <text x="610" y="98" text-anchor="middle" fill="#80b0e0" font-size="9">Q1Q0</text>
  <g fill="#c8d8f0" font-size="10" text-anchor="middle">
    <text x="635" y="95">0</text>
    <text x="665" y="95">1</text>
    <text x="610" y="115">00</text>
    <text x="635" y="115">0</text>
    <text x="665" y="115">0</text>
    <text x="610" y="135">01</text>
    <text x="635" y="135">0</text>
    <text x="665" y="135">0</text>
    <text x="610" y="155">11</text>
    <text x="635" y="155" fill="#f0a040">X</text>
    <text x="665" y="155" fill="#f0a040">X</text>
    <text x="610" y="175">10</text>
    <text x="635" y="175" fill="#80f0a0" font-weight="bold">1</text>
    <text x="665" y="175" fill="#80f0a0" font-weight="bold">1</text>
  </g>
  <!-- Group: rows 10,11 (both columns) -->
  <rect x="622" y="148" width="58" height="38" rx="14" fill="none" stroke="#39ff80" stroke-width="2"/>
</svg>
`,
        interviewerMindset:
`רוצה לראות שאתה גוזר את הביטויים, לא מעתיק. שני דברים שמפרידים junior טוב מטוב מאוד:

1. **לזהות שמצב 11 הוא don't-care** ולנצל אותו ב-K-map. אם תרשום הכל בלי X-ים — אתה מאבד 50% מהחיסכון.
2. **קידוד חכם של מצבים.** הקצאה רגילה (00, 01, 10) פותחת את הדלת ל-y = Q1 בלי שום שער. הקצאה שונה (00, 01, 11) הייתה הופכת את y ל-AND/OR.`,
        circuitRevealsAnswer: true,
        circuit: () => build(() => {
          const x   = h.input(120, 220, 'x');
          const clk = h.clock(120, 600);
          x.fixedValue = 0;
          x.stepValues = [0, 1, 1, 0, 1, 1, 1, 0, 1, 1];

          const ff1 = h.ffD(900, 200, 'Q1');
          const ff0 = h.ffD(900, 440, 'Q0');

          const invQ1 = h.gate('NOT', 1120, 240);
          const invQ0 = h.gate('NOT', 1120, 480);

          // D1 = x · (Q1 + Q0)
          const orD1  = h.gate('OR',  440, 180);
          const andD1 = h.gate('AND', 660, 200);

          // D0 = ¬Q1 · ¬Q0 · x  → split into two 2-input ANDs
          // First: ¬Q1 · ¬Q0  (need wires back from inverters — chain through)
          // Since the inverters live to the RIGHT of the FFs, route their
          // outputs back left into the D0 logic.
          const andNQ = h.gate('AND', 440, 480);  // ¬Q1 · ¬Q0
          const andD0 = h.gate('AND', 660, 440);  // (¬Q1·¬Q0) · x

          const y = h.output(1340, 200, 'y');

          return {
            nodes: [
              x, clk, ff1, ff0, invQ1, invQ0,
              orD1, andD1, andNQ, andD0, y,
            ],
            wires: [
              // Clocks
              h.wire(clk.id, ff1.id, 1, 0, { isClockWire: true }),
              h.wire(clk.id, ff0.id, 1, 0, { isClockWire: true }),
              // FF outputs → inverters
              h.wire(ff1.id, invQ1.id, 0),
              h.wire(ff0.id, invQ0.id, 0),
              // D1 = x · (Q1 + Q0)
              h.wire(ff1.id, orD1.id, 0),
              h.wire(ff0.id, orD1.id, 1),
              h.wire(x.id,   andD1.id, 0),
              h.wire(orD1.id, andD1.id, 1),
              h.wire(andD1.id, ff1.id, 0),
              // D0 = ¬Q1 · ¬Q0 · x
              h.wire(invQ1.id, andNQ.id, 0),
              h.wire(invQ0.id, andNQ.id, 1),
              h.wire(andNQ.id, andD0.id, 0),
              h.wire(x.id,     andD0.id, 1),
              h.wire(andD0.id, ff0.id, 0),
              // y = Q1
              h.wire(ff1.id, y.id, 0),
            ],
          };
        }),
        expectedAnswers: [
          '3', 'שלושה', 'three',
          "d1 = x", "x·(q1+q0)", 'q1+q0',
          "d0 =", "¬q1·¬q0·x",
          "y = q1", 'q1',
          "don't care", 'דונט קר', 'דונט-קר', "don't-care",
          'kmap', 'k-map', 'מפת קרנו',
        ],
      },
    ],
    source: 'מאגר ראיונות junior — FSM + K-map + שערים',
    tags: ['fsm', '11-detector', 'kmap', 'dont-cares', 'state-encoding', 'sequential'],
  },
];
