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
  // #2002 — sequence detector "101" (Moore, fault-detection framing)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'sequence-detector-101',
    difficulty: 'medium',
    title: 'מזהה רצף חכם — "101" (Moore vs Mealy)',
    intro:
`**הקשר:** אנחנו בונים שבב שאמור לזהות תקלות בקו תקשורת.

**המשימה:** תכנן מעגל שמקבל בכל מחזור שעון ביט אחד (\`X\`). המעגל צריך להוציא '1' לוגי ביציאה (\`Y\`) רק אם זיהה את הרצף **"101"**.`,
    parts: [
      {
        label: 'א',
        question: 'תכנון המכונה: צייר דיאגרמת מצבים. האם תבחר במימוש Moore או Mealy? הסבר מדוע (רמז: תחשוב על מהירות התגובה לעומת יציבות האות).',
        hints: [
          'Mealy: \`Y = f(state, X)\` — מגיב באותו cycle. תגובה מהירה אבל \`Y\` קומבינטורי וחשוף ל-glitches.',
          'Moore: \`Y = f(state)\` בלבד — דורש cycle נוסף לזהות, אבל \`Y\` רשום ויציב.',
          'בהקשר של "זיהוי תקלה בקו תקשורת": אות יציב חשוב יותר מ-cycle אחד של עיכוב. **Moore עדיף.**',
          'Moore דורש מצב נוסף (\`S3\` = "זיהיתי 101") כדי שהפלט יבוא ממצב, לא מצירוף state+input.',
        ],
        answer:
`**בחירה: Moore.** הסיבה: בקו תקשורת רועש, ה-\`Y\` של Mealy עלול לקפוץ במהלך ה-cycle בגלל glitches על \`X\` (כל שינוי על \`X\` משפיע מיד על \`Y\`). Moore מקבל \`Y\` ישירות מ-FF — אות נקי ויציב, סנכרון מובטח, מחיר: cycle אחד של latency.

**4 מצבים** (Moore דורש מצב ייעודי לפלט):

- \`S0\` — מצב התחלה / "לא ראיתי כלום שימושי". פלט Y=0.
- \`S1\` — "ראיתי 1". פלט Y=0.
- \`S2\` — "ראיתי 10". פלט Y=0.
- \`S3\` — "ראיתי 101" — **הצלחה!** פלט Y=1.

**טבלת מעברים:**

| ממצב | X=0 → | X=1 → |
|------|-------|-------|
| S0   | S0    | S1    |
| S1   | S2    | S1    |
| S2   | S0    | S3    |
| S3   | S2    | S1    | ← חפיפה: אחרי "101", ה-"1" האחרון הופך ל-S1 חדש

**חפיפה (overlap):** מ-\`S3\` עם \`X=1\` עוברים ל-\`S1\` (ולא ל-\`S0\`) כי ה-"1" של "101" הוא גם תחילת רצף חדש. עם \`X=0\` מ-\`S3\` עוברים ל-\`S2\` (כי "10" כבר ראינו).`,
        answerSchematic: `
<svg viewBox="0 0 560 320" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="Moore FSM state diagram for 101 detector">
  <text x="280" y="20" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">Moore FSM — "101" Detector</text>
  <g stroke="#80b0e0" stroke-width="1.8" fill="#0a1520">
    <circle cx="80"  cy="180" r="34"/>
    <circle cx="220" cy="180" r="34"/>
    <circle cx="360" cy="180" r="34"/>
    <circle cx="500" cy="180" r="34"/>
    <circle cx="500" cy="180" r="40" fill="none" stroke="#39ff80" stroke-width="1.4"/>
  </g>
  <g fill="#c8d8f0" text-anchor="middle" font-weight="bold" font-size="12">
    <text x="80"  y="178">S0</text><text x="220" y="178">S1</text>
    <text x="360" y="178">S2</text><text x="500" y="178">S3</text>
  </g>
  <g fill="#80b0e0" text-anchor="middle" font-size="10">
    <text x="80"  y="194">Y=0</text><text x="220" y="194">Y=0</text>
    <text x="360" y="194">Y=0</text><text x="500" y="194" fill="#39ff80" font-weight="bold">Y=1</text>
  </g>
  <path d="M 114 180 L 186 180" stroke="#c8d8f0" fill="none" marker-end="url(#arr)"/>
  <text x="150" y="172" text-anchor="middle" fill="#c8d8f0">X=1</text>
  <path d="M 254 180 L 326 180" stroke="#c8d8f0" fill="none" marker-end="url(#arr)"/>
  <text x="290" y="172" text-anchor="middle" fill="#c8d8f0">X=0</text>
  <path d="M 394 180 L 460 180" stroke="#39ff80" fill="none" marker-end="url(#arr-g)"/>
  <text x="427" y="172" text-anchor="middle" fill="#39ff80" font-weight="bold">X=1</text>
  <path d="M 60 152 C 30 100, 100 100, 80 146" stroke="#c8d8f0" fill="none" marker-end="url(#arr)"/>
  <text x="50" y="100" text-anchor="middle" fill="#c8d8f0">X=0</text>
  <path d="M 200 152 C 170 100, 240 100, 220 146" stroke="#c8d8f0" fill="none" marker-end="url(#arr)"/>
  <text x="210" y="100" text-anchor="middle" fill="#c8d8f0">X=1</text>
  <path d="M 332 208 C 240 280, 130 280, 100 212" stroke="#c8d8f0" fill="none" marker-end="url(#arr)"/>
  <text x="220" y="278" text-anchor="middle" fill="#c8d8f0">X=0</text>
  <path d="M 478 152 C 380 80, 260 80, 240 148" stroke="#c8d8f0" fill="none" marker-end="url(#arr)"/>
  <text x="360" y="82" text-anchor="middle" fill="#c8d8f0">X=1 (overlap)</text>
  <path d="M 472 168 C 440 132, 388 132, 372 156" stroke="#c8d8f0" fill="none" marker-end="url(#arr)"/>
  <text x="430" y="130" text-anchor="middle" fill="#c8d8f0">X=0</text>
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#c8d8f0"/>
    </marker>
    <marker id="arr-g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#39ff80"/>
    </marker>
  </defs>
  <text x="280" y="305" text-anchor="middle" fill="#c8d8f0" font-size="10">המעבר S2→S3 (ירוק) הוא הרגע שבו רצף "101" הושלם → Y=1 ב-cycle הבא.</text>
</svg>
`,
        interviewerMindset:
`**הראיין רוצה לשמוע "Moore" — אבל עם נימוק שמתחבר ל-context** (קו תקשורת = יציבות > מהירות). אם אתה עונה "Mealy כי מהיר יותר" בלי לחבר ליציבות, הפסדת את הניקוד המרכזי.

**מקפיץ לטובה:**
- להזכיר חפיפה (overlap) ביוזמתך.
- לציין ש-Mealy חוסך מצב (3 לעומת 4) — מראה שהבנת את שתי האופציות.
- להוסיף "Moore הוא ברירת מחדל ב-ASIC ל-control paths כי STA פשוטה יותר — \`Y\` יוצא מ-FF, לא מ-cone של לוגיקה."`,
        expectedAnswers: [
          'moore', 'mealy', '4', 'four', 'ארבעה',
          's0', 's1', 's2', 's3',
          'overlap', 'חפיפה', 'glitch', 'יציב', 'יציבות',
          'state', 'מצבים',
        ],
      },
      {
        label: 'ב',
        question: 'מימוש לוגי: נניח שבחרת ב-Moore. כמה פליפ-פלופים תצטרך כדי לייצג את המצבים? איך תקודד אותם?',
        hints: [
          'מספר ה-FFs ב-binary encoding: \`⌈log₂(N)⌉\` כש-N = מספר המצבים.',
          '4 מצבים → \`⌈log₂4⌉ = 2\` FFs.',
          'קידוד אפשרי: S0=00, S1=01, S2=10, S3=11. (one-hot היה דורש 4 FFs — בזבזני כאן.)',
          'אלטרנטיבה: Gray code לקידוד (00,01,11,10) — בין מצבים סמוכים משתנה רק ביט אחד → פחות צריכת חשמל ופחות סיכון ל-metastability.',
        ],
        answer:
`**2 פליפ-פלופים** (Q1, Q0) — מספיק ל-4 מצבים: \`⌈log₂4⌉ = 2\`.

**קידוד בינארי טריוויאלי:**

| מצב | Q1 Q0 |
|-----|-------|
| S0  | 0 0   |
| S1  | 0 1   |
| S2  | 1 0   |
| S3  | 1 1   |

**טבלת next-state (D1, D0 = הקלטים ל-FFs):**

| Q1 Q0 | X | D1 D0 | (מצב→) |
|-------|---|-------|--------|
| 00    | 0 | 00    | S0→S0  |
| 00    | 1 | 01    | S0→S1  |
| 01    | 0 | 10    | S1→S2  |
| 01    | 1 | 01    | S1→S1  |
| 10    | 0 | 00    | S2→S0  |
| 10    | 1 | 11    | S2→S3  |
| 11    | 0 | 10    | S3→S2  |
| 11    | 1 | 01    | S3→S1  |

**מ-K-maps מקבלים:**
- \`D1 = Q0·¬X + Q1·¬X\` = \`¬X · (Q0 + Q1)\`
- \`D0 = ¬Q1·X + ¬Q0·X + Q1·Q0·X\` = \`X\` (אחרי פישוט — \`D0=X\` כי בכל מצב הוא תמיד עוקב אחרי X! בדוק את הטבלה — נכון.)

**שיקולי קידוד מתקדמים:**
- **Gray code** (00,01,11,10): מעבר state↔state משנה ביט יחיד → פחות simultaneous switching, פחות גליצ'ים, פחות צריכה.
- **One-hot** (4 FFs): מהיר יותר ל-decode (\`Y = Q3\` ישיר) אבל יקר ב-area.
- **Binary** (כאן): פשרה — קומפקטי אבל ה-Y דורש AND קטן.`,
        expectedAnswers: [
          '2', 'two', 'שניים', 'שתי',
          'log', 'log2', 'binary', 'בינארי',
          'q1', 'q0', 'd1', 'd0',
          'one-hot', 'one hot', 'gray',
          'encoding', 'קידוד',
        ],
      },
      {
        label: 'ג',
        question: 'האתגר הצירופי: איך תיראה הלוגיקה הצירופית שקובעת את \`Y\`? האם היא תלויה רק בערך שנמצא בתוך הפליפ-פלופים, או גם בביט \`X\` שנכנס באותו רגע?',
        hints: [
          'בהגדרה של Moore — \`Y\` תלוי **רק במצב** (ב-FFs), לא ב-X.',
          'הצב את הקידוד שלנו: S3 = Q1 Q0 = 11. \`Y\` דולק רק ב-S3.',
          '\`Y = Q1 · Q0\` — שער AND אחד בלבד. אין \`X\` בביטוי.',
          'השווה ל-Mealy: שם \`Y = Q1·¬Q0·X\` — נכנס X לביטוי → 3 קלטים → חשוף לגליץ\' מ-X.',
        ],
        answer:
`\`\`\`
Y = Q1 · Q0
\`\`\`

**תלוי רק ב-FFs — \`X\` לא נכנס לביטוי.** זו עצם ההגדרה של Moore: \`Y = f(state)\` בלבד. הקידוד שלנו (S3 = 11) הופך את זה לשער AND יחיד.

**למה זה חשוב מבחינת תכנון VLSI:**
1. **STA פשוטה:** ה-cone של \`Y\` הוא Q1 → AND → port. אורך נתיב קצר וקבוע — אין input-to-output path שצריך לאפיין.
2. **יציבות:** Q1, Q0 משתנים רק על קצה השעון → \`Y\` יכול לזוז רק פעם אחת לכל cycle, ואחרי \`t_pd\` של AND יחיד הוא יציב לשארית ה-cycle.
3. **גליצ\' של \`X\`** (רעש בקו התקשורת!) **לא משפיע על \`Y\` בכלל**. הוא ישפיע רק על \`D0, D1\` — שיינתנו ל-FFs בקצה השעון הבא. ה-FFs "מסננים" את הרעש.

**השוואה ל-Mealy של אותה משימה:** \`Y_mealy = Q1·¬Q0·X\` — קלט \`X\` נכנס ישירות לפלט. כל glitch על \`X\` (spike של 100ps באמצע cycle) יופיע על \`Y\`. בקו רועש זה אסון.

**זו בדיוק הסיבה שבחרנו Moore בסעיף א'** — והנה הראיה הקונקרטית במשוואת הפלט.`,
        interviewerMindset:
`הסעיף הזה בודק שאתה באמת מבין את ההבדל Moore↔Mealy, לא רק שינון. **התשובה הנכונה היא לא רק "Y=Q1·Q0" אלא "Y תלוי רק במצב, ולכן הוא יציב לכל ה-cycle, ולכן בחרנו Moore."** הסגירה למה שאמרת בסעיף א' היא מה שמבדיל מועמד בינוני ממועמד מצוין.

**מקפיץ לטובה:** להזכיר ש-Moore נותן "registered output" שמתנהג כאילו יש לך FF נוסף על הפלט — ולכן setup/hold לכל מי שמקבל את Y מוגדרים היטב.`,
        expectedAnswers: [
          'q1', 'q0', 'q1·q0', 'q1*q0', 'q1 & q0', 'q1q0', 'and',
          'only state', 'רק במצב', 'רק על המצב', 'רק מצב',
          'not x', 'לא תלוי ב-x', 'לא תלוי בx', 'ללא x', 'בלי x',
          'moore', 'registered', 'יציב',
        ],
        circuitRevealsAnswer: true,
        circuit: () => build(() => {
          const X   = h.input(120, 200, 'X');
          const clk = h.clock(120, 600);
          X.fixedValue = 1;

          const ff1 = h.ffD(720, 280, 'FF1 (Q1)');
          const ff0 = h.ffD(720, 460, 'FF0 (Q0)');

          const notX = h.gate('NOT', 320, 200);
          const orQ  = h.gate('OR',  320, 360);
          const andD1 = h.gate('AND', 500, 280);

          const andY = h.gate('AND', 960, 370);
          const Y    = h.output(1180, 370, 'Y');

          return {
            nodes: [X, clk, notX, orQ, andD1, ff1, ff0, andY, Y],
            wires: [
              h.wire(X.id, notX.id, 0),
              h.wire(X.id, ff0.id,  0),
              h.wire(ff1.id, orQ.id, 0),
              h.wire(ff0.id, orQ.id, 1),
              h.wire(notX.id, andD1.id, 0),
              h.wire(orQ.id,  andD1.id, 1),
              h.wire(andD1.id, ff1.id,  0),
              h.wire(clk.id, ff1.id, 1),
              h.wire(clk.id, ff0.id, 1),
              h.wire(ff1.id, andY.id, 0),
              h.wire(ff0.id, andY.id, 1),
              h.wire(andY.id, Y.id, 0),
            ],
          };
        }),
      },
    ],
    source: 'מאגר ראיונות — FSM קלאסי, גלאי רצף "101" (Moore)',
    tags: ['fsm', 'moore', 'mealy', 'sequence-detector', '101', 'sequential', 'state-diagram'],
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

  // ─────────────────────────────────────────────────────────────
  // #2007 — Mealy "11" overlapping detector (low-latency framing)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'mealy-11-detector-lowlat',
    difficulty: 'medium',
    title: 'גלאי "11" כ-Mealy — חתימת פרוטוקול בזרם מהיר',
    intro:
`**הקשר:** מתכננים יחידה שמזהה "חתימה" של פרוטוקול תקשורת בזרם נתונים מהיר. כל cycle של latency עולה לנו ב-throughput.

**המשימה:** מעגל שמקבל בכל פעימת שעון ביט אחד (\`X\`), ומוציא \`Y=1\` בכל פעם שזוהה הרצף **"11"**. הזיהוי **חופף**: רצף "111" יפיק שתי אינדיקציות רצופות של \`Y=1\`.`,
    parts: [
      {
        label: 'א',
        question: 'ממש כמכונת Mealy. הסבר מדוע בחרת Mealy ולא Moore בהקשר של latency.',
        hints: [
          'Mealy: \`Y = f(state, X)\` — תגובה **באותו cycle** שבו הגיע הביט המסיים את הרצף.',
          'Moore: \`Y = f(state)\` בלבד — דורש cycle נוסף כדי שהמצב "ראיתי 11" יתעדכן ב-FF, ורק אז Y עולה.',
          'בזרם נתונים מהיר latency של cycle אחד = עיכוב של כל הצינור. Mealy חוסך את ה-cycle הזה.',
          'המחיר של Mealy: \`Y\` קומבינטורי → חשוף ל-glitches על \`X\`. בהקשר של "throughput קודם" — מקובל.',
        ],
        answer:
`**בחירה: Mealy.** ה-Y נקבע כפונקציה של (מצב נוכחי, X נוכחי), ולכן ברגע שמגיע ה-"1" השני, ה-Y כבר עולה **באותו cycle**.

ב-Moore, היינו צריכים מצב ייעודי "ראיתי 11" — ה-FF צריך לעבור אליו בקצה השעון, ורק ב-cycle שאחרי כן Y יעלה. עיכוב של cycle שלם בכל זיהוי = פגיעה ב-throughput של הצינור.

**ב-streaming protocol detection**: latency הוא שיקול עליון. Mealy חוסך 1 cycle בכל אירוע — אם יש זיהוי כל ~10 cycles, זה 10% throughput.

**המחיר של Mealy:** \`Y\` קומבינטורי = חשוף ל-glitches על \`X\`. בקונטקסט שלנו זה סביר כי הצד הצורך את Y הוא לרוב FF סינכרוני שדוגם רק על קצה השעון — glitches בין הקצוות לא משנים.`,
        interviewerMindset:
`הראיין רוצה לראות שאתה מקשר Mealy↔latency ו-Moore↔glitch-free. **התשובה "כי Mealy יותר מהיר" בלי הסבר למה — חלקית.** התשובה המלאה: "Mealy משתף את ה-X הנכנס עם החישוב של ה-Y, לכן אין צורך לחכות לקצה שעון נוסף — וזה קריטי ב-streaming."

**מקפיץ לטובה:** להזכיר שמועמד טוב בוחר Mealy אם הצרכן הוא FF, ו-Moore אם הצרכן הוא לוגיקה אסינכרונית או דרישה ל-glitch-free.`,
        expectedAnswers: [
          'mealy', 'moore', 'latency',
          'same cycle', 'אותו cycle', 'אותו מחזור',
          'throughput', 'streaming', 'מהירות תגובה',
          'glitch', 'קומבינטורי',
        ],
      },
      {
        label: 'ב',
        question: 'צייר את דיאגרמת המצבים במינימום מצבים. כמה מצבים צריך?',
        hints: [
          '"מה אני צריך לזכור?" → רק את הביט הקודם. שני מצבים: \`S0\`="הביט הקודם היה 0" ו-\`S1\`="הביט הקודם היה 1".',
          'מעבר: \`S0 --X=1--> S1\` (Y=0) ; \`S1 --X=1--> S1\` (Y=**1**, חפיפה!).',
          'מעבר אפס: כל מצב עם X=0 → \`S0\`, Y=0.',
          'ב-Moore היו צריכים 3 מצבים (גם "ראיתי 11"); ב-Mealy שניים מספיקים — זה הניצחון המבני של Mealy.',
        ],
        answer:
`**2 מצבים** — מינימום מוחלט.

- \`S0\` — "הביט האחרון היה 0" (או מצב התחלה).
- \`S1\` — "הביט האחרון היה 1".

**מעברים** (פורמט Mealy: \`X / Y\`):

| ממצב | X=0 / Y | X=1 / Y |
|------|---------|---------|
| S0   | S0 / 0  | S1 / 0  |
| S1   | S0 / 0  | S1 / **1** ← זיהוי! חופף |

**למה רק 2?** ב-Mealy ה-Y "חי על החץ", לא במצב — אז לא צריך מצב נפרד שמייצג "זה הרגע של הזיהוי". המידע היחיד שצריך לזכור הוא: האם הביט הקודם היה 1.

**חפיפה (overlap):** מ-\`S1\` עם X=1 חוזרים ל-\`S1\` (לא מאופסים ל-S0) — ולכן רצף "111" נותן Y=1 בשני ה-cycles האחרונים. ב-S1 כל "1" נוסף מייד מפיק זיהוי.`,
        answerSchematic: `
<svg viewBox="0 0 420 260" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="Mealy FSM state diagram for 11 detector">
  <text x="210" y="20" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">Mealy FSM — "11" Detector</text>
  <g stroke="#80b0e0" stroke-width="1.8" fill="#0a1520">
    <circle cx="120" cy="140" r="36"/>
    <circle cx="300" cy="140" r="36"/>
  </g>
  <g fill="#c8d8f0" text-anchor="middle" font-weight="bold" font-size="13">
    <text x="120" y="145">S0</text>
    <text x="300" y="145">S1</text>
  </g>

  <!-- S0 -> S1  on X=1 / Y=0 -->
  <path d="M 156 132 L 264 132" stroke="#c8d8f0" fill="none" marker-end="url(#m-arr)"/>
  <text x="210" y="124" text-anchor="middle" fill="#c8d8f0">X=1 / Y=0</text>
  <!-- S1 -> S0  on X=0 / Y=0 (lower curve) -->
  <path d="M 264 152 L 156 152" stroke="#c8d8f0" fill="none" marker-end="url(#m-arr)"/>
  <text x="210" y="170" text-anchor="middle" fill="#c8d8f0">X=0 / Y=0</text>

  <!-- S0 self loop X=0 / Y=0 -->
  <path d="M 96 112 C 60 60, 140 60, 120 104" stroke="#c8d8f0" fill="none" marker-end="url(#m-arr)"/>
  <text x="98" y="50" text-anchor="middle" fill="#c8d8f0">X=0 / Y=0</text>

  <!-- S1 self loop X=1 / Y=1 — green, highlighted -->
  <path d="M 276 112 C 240 60, 360 60, 324 104" stroke="#39ff80" stroke-width="2" fill="none" marker-end="url(#m-arr-g)"/>
  <text x="300" y="50" text-anchor="middle" fill="#39ff80" font-weight="bold">X=1 / Y=1</text>

  <defs>
    <marker id="m-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#c8d8f0"/>
    </marker>
    <marker id="m-arr-g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#39ff80"/>
    </marker>
  </defs>

  <text x="210" y="220" text-anchor="middle" fill="#c8d8f0" font-size="10">החץ הירוק (S1→S1, X=1) הוא הרגע שבו רצף "11" מזוהה.</text>
  <text x="210" y="238" text-anchor="middle" fill="#c8d8f0" font-size="10">בגלל החפיפה — נשארים ב-S1, ולכן "111" → 2 זיהויים רצופים.</text>
</svg>
`,
        expectedAnswers: [
          '2', 'two', 'שניים', 'שתי', 'שני מצבים',
          's0', 's1', 'overlap', 'חפיפה',
          'last bit', 'הביט הקודם', 'הביט האחרון',
        ],
      },
      {
        label: 'ג',
        question: 'כמה רכיבי Flip-Flop נדרשים למימוש בקידוד בינארי?',
        hints: [
          'מספר ה-FFs ב-binary encoding: \`⌈log₂(N)⌉\` כש-N = מספר המצבים.',
          '2 מצבים → \`⌈log₂2⌉ = 1\` FF.',
          'קידוד: \`S0 = 0\`, \`S1 = 1\`. ה-FF היחיד שומר את "האם הביט הקודם היה 1".',
          'משוואת ה-FF: \`D = X\` — המצב הבא הוא פשוט הביט הנכנס. (FF יחיד הופך לפועל יוצא מהמבנה.)',
        ],
        answer:
`**FF יחיד** (Q).

קידוד: \`S0 ⇔ Q=0\`, \`S1 ⇔ Q=1\`. אז \`Q\` בעצם **"זוכר את הביט הקודם"** — בדיוק מה שצריך לגלאי "11".

**משוואת המצב הבא:**

\`\`\`
D = X
\`\`\`

המצב הבא = הביט הנכנס. אין כאן בכלל לוגיקה צירופית למצב — \`X\` זורם ישירות ל-\`D\`. ב-cycle הבא \`Q\` יחזיק את הביט הזה, ויהיה זמין כאינדיקציה "הביט הקודם היה 1".

**מבני זה אומר:** ה-FF היחיד הוא בעצם **delay line של ביט אחד** — והגלאי כולו = "AND בין הביט הנוכחי לביט הקודם". זה גם מסביר אינטואיטיבית את התשובה לסעיף ד'.

**השוואה ל-Moore (#2006):** שם צריך 3 מצבים → 2 FFs. החיסכון של Mealy: חצי משאבי שמירה.`,
        expectedAnswers: [
          '1', 'one', 'אחד', 'ff יחיד', 'ff אחד',
          'd = x', 'd=x',
          'log', 'log2', 'binary',
          'q', 'delay',
        ],
      },
      {
        label: 'ד',
        question: 'חלץ את המשוואה הלוגית של \`Y\`. האם הוא תלוי רק במצב הנוכחי?',
        hints: [
          'מהטבלת המעברים: \`Y=1\` רק כש-(state=S1) **וגם** (X=1).',
          'בקידוד שלנו: \`Y = Q · X\`.',
          'תלוי **גם** ב-X — זוהי בדיוק ההגדרה של Mealy: \`Y = f(state, input)\`.',
          'השווה ל-Moore: שם \`Y = Q1·¬Q0\` (תלוי רק במצב). זה ה-trade-off המבני.',
        ],
        answer:
`\`\`\`
Y = Q · X
\`\`\`

**לא — Y תלוי גם ב-X (הביט הנכנס באותו cycle), לא רק במצב הנוכחי \`Q\`.** זו ההגדרה המדויקת של Mealy.

**ניתוח אינטואיטיבי:** ה-Y עולה ⟺ "הביט הקודם היה 1" (\`Q=1\`) **וגם** "הביט הנוכחי 1" (\`X=1\`). שניהם נחוצים — וזה בדיוק ה-AND.

**המעגל הכולל — מינימלי לקיצוניות:**

| רכיב           | תפקיד                |
|----------------|----------------------|
| 1 × D-FF       | זוכר את הביט הקודם   |
| חוט: \`D ← X\`  | אין לוגיקה למצב הבא  |
| 1 × AND        | \`Y = Q · X\`         |

**Latency:** ברגע ש-X עולה (וכבר היה Q=1 מ-cycle קודם) — Y עולה אחרי t_pd של שער AND אחד בלבד. **באותו cycle.** זה בדיוק היתרון של Mealy ש-justified-ho בסעיף א'.

**גליצ'ים:** glitch על X → glitch על Y. בקונטקסט שלנו (הצרכן הוא FF סינכרוני שדוגם בקצה השעון) — לא מפריע.`,
        interviewerMindset:
`התשובה הנכונה היא לא רק "\`Y = Q·X\`" אלא **"Y תלוי גם ב-X — וזה בדיוק מה שעושה אותו Mealy."** סגירה מודעת למה שאמרת בסעיף א' (\`Y = f(state, input)\`) מבדילה מועמד טוב ממצוין.

**מקפיץ לטובה:** לציין את ההשלכה הפרקטית — "ה-Y יוצא ממש מהר (\`t_pd\` של AND אחד), אבל **תזמון Y תלוי בנתיב מ-X לפלט** — לא רק בנתיב מ-FF לפלט כמו ב-Moore. ב-STA זה אומר שצריך לאפיין input-to-output path."`,
        expectedAnswers: [
          'q · x', 'q*x', 'q & x', 'qx', 'q and x', 'and',
          'גם ב-x', 'גם בx', 'תלוי ב-x', 'תלוי בx',
          'mealy', 'state and input', 'state, input',
          'לא רק', 'not only',
        ],
        circuitRevealsAnswer: true,
        circuit: () => build(() => {
          const X   = h.input(120, 200, 'X');
          const clk = h.clock(120, 500);
          X.fixedValue = 1;

          const ffQ = h.ffD(480, 280, 'Q');

          const andY = h.gate('AND', 760, 250);
          const Y    = h.output(1000, 250, 'Y');

          return {
            nodes: [X, clk, ffQ, andY, Y],
            wires: [
              // D ← X (next state = current bit)
              h.wire(X.id, ffQ.id, 0),
              h.wire(clk.id, ffQ.id, 1),
              // Y = Q · X
              h.wire(ffQ.id, andY.id, 0),
              h.wire(X.id,   andY.id, 1),
              h.wire(andY.id, Y.id, 0),
            ],
          };
        }),
      },
    ],
    source: 'מאגר ראיונות — Mealy "11" detector בהקשר protocol-signature',
    tags: ['fsm', 'mealy', '11-detector', 'overlap', 'low-latency', 'sequential'],
  },

  // ─────────────────────────────────────────────────────────────
  // #2008 — "1011" detector — min-state + setup-time driven Moore/Mealy choice
  // ─────────────────────────────────────────────────────────────
  {
    id: 'detector-1011-setup-driven',
    difficulty: 'hard',
    title: 'גלאי "1011" — מינימום מצבים + Setup-Time מכתיב Moore/Mealy',
    intro:
`תכנן מעגל שמזהה את הרצף **"1011"** עם **חפיפה (Overlapping)**. לדוגמה, עבור הקלט \`1011011\` המעגל צריך להוציא \`1\` **פעמיים**.

האתגר:
1. ממש את המכונה ב**מינימום המצבים האפשרי**.
2. נתון: ה-\`X\` שלך מגיע ממעגל צירופי **ארוך ואיטי**, ומתייצב ממש רגע לפני עליית השעון. החלט Moore או Mealy תוך התייחסות ל-**setup time** של ה-FF הצרכן את \`Y\`.`,
    parts: [
      {
        label: 'א',
        question: 'בנה את המכונה במינימום מצבים. כמה מצבים? כמה FFs בקידוד בינארי? צייר את הדיאגרמה.',
        hints: [
          'הטריק לחפיפה: מצב \`Si\` = "ה-suffix הארוך ביותר של הקלט עד כה שהוא prefix של \`1011\`".',
          'Prefixes של "1011": \`""\`, \`"1"\`, \`"10"\`, \`"101"\`, \`"1011"\`. כל אחד הופך למצב.',
          '**ב-Mealy:** מצב "1011" אינו נחוץ — \`Y=1\` יוצא **על המעבר** מ-\`S3\` (=\`"101"\`) עם \`X=1\`. ⇒ **4 מצבים** בלבד.',
          'ב-Moore היו צריכים מצב "match" נוסף = 5 מצבים. Mealy חוסך מצב — וזה המינימום.',
          '4 מצבים → \`⌈log₂4⌉ = 2\` FFs.',
          'מעבר מ-\`S3\` עם X=1 חוזרים ל-\`S1\` (לא ל-\`S0\`!) — אחרי "1011" יש "1" שיכול להתחיל רצף חדש.',
        ],
        answer:
`**מינימום: 4 מצבים** (Mealy). מבוסס על "כמה אותיות מ-\`1011\` ראיתי כ-suffix":

| מצב | משמעות         |
|-----|----------------|
| \`S0\` | לא ראיתי כלום שימושי |
| \`S1\` | ראיתי "1"      |
| \`S2\` | ראיתי "10"     |
| \`S3\` | ראיתי "101"    |

**אין מצב \`S4\`="1011"** כי ב-Mealy ה-\`Y=1\` נפלט **על המעבר** מ-\`S3\` (\`X=1\`) — לא צריך מצב נפרד.

**טבלת מעברים (Mealy: \`X / Y\`):**

| ממצב | X=0 / Y    | X=1 / Y       |
|------|------------|---------------|
| S0   | S0 / 0     | S1 / 0        |
| S1   | S2 / 0     | S1 / 0        |
| S2   | S0 / 0     | S3 / 0        |
| S3   | S2 / 0     | **S1 / 1** ← זיהוי! |

**הסבר מעברי החפיפה הקריטיים:**
- מ-\`S3\` (=\`"101"\`) עם \`X=1\` → קלט מצטבר \`"1011"\`. ה-suffix הארוך ביותר שהוא prefix של "1011" = \`"1"\` ⇒ \`S1\`. *לא* חוזרים ל-S0!
- מ-\`S3\` עם \`X=0\` → \`"1010"\`. ה-suffix הארוך = \`"10"\` ⇒ \`S2\`.
- מ-\`S1\` עם \`X=1\` → \`"11"\`. Suffix = \`"1"\` ⇒ נשארים ב-\`S1\`.

**הוכחה שעבדנו על המקרה הדורש זיהוי כפול: \`1011011\`**
- t=0: S0 →(1)→ S1 (Y=0)
- t=1: S1 →(0)→ S2 (Y=0)
- t=2: S2 →(1)→ S3 (Y=0)
- t=3: S3 →(1)→ S1 (**Y=1**) ← זיהוי ראשון
- t=4: S1 →(0)→ S2 (Y=0)
- t=5: S2 →(1)→ S3 (Y=0)
- t=6: S3 →(1)→ S1 (**Y=1**) ← זיהוי שני ✓

**מספר FFs:** \`⌈log₂4⌉ = 2\`. קידוד נוח: \`S0=00, S1=01, S2=10, S3=11\`.`,
        answerSchematic: `
<svg viewBox="0 0 600 360" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="Mealy FSM state diagram for 1011 detector">
  <text x="300" y="22" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">Mealy FSM — "1011" Detector (4 states)</text>

  <g stroke="#80b0e0" stroke-width="1.8" fill="#0a1520">
    <circle cx="80"  cy="200" r="34"/>
    <circle cx="220" cy="200" r="34"/>
    <circle cx="380" cy="200" r="34"/>
    <circle cx="520" cy="200" r="34"/>
  </g>
  <g fill="#c8d8f0" text-anchor="middle" font-weight="bold" font-size="12">
    <text x="80"  y="198">S0</text>
    <text x="220" y="198">S1</text>
    <text x="380" y="198">S2</text>
    <text x="520" y="198">S3</text>
  </g>
  <g fill="#80b0e0" text-anchor="middle" font-size="9">
    <text x="80"  y="212">""</text>
    <text x="220" y="212">"1"</text>
    <text x="380" y="212">"10"</text>
    <text x="520" y="212">"101"</text>
  </g>

  <!-- Forward path S0 -1/0-> S1 -0/0-> S2 -1/0-> S3 -->
  <path d="M 114 200 L 186 200" stroke="#c8d8f0" fill="none" marker-end="url(#d-arr)"/>
  <text x="150" y="192" text-anchor="middle" fill="#c8d8f0">1 / 0</text>
  <path d="M 254 200 L 346 200" stroke="#c8d8f0" fill="none" marker-end="url(#d-arr)"/>
  <text x="300" y="192" text-anchor="middle" fill="#c8d8f0">0 / 0</text>
  <path d="M 414 200 L 486 200" stroke="#c8d8f0" fill="none" marker-end="url(#d-arr)"/>
  <text x="450" y="192" text-anchor="middle" fill="#c8d8f0">1 / 0</text>

  <!-- S3 -1/1-> S1 (green, big curve overhead — detection!) -->
  <path d="M 500 168 C 460 100, 280 100, 240 170" stroke="#39ff80" stroke-width="2.2" fill="none" marker-end="url(#d-arr-g)"/>
  <text x="370" y="95" text-anchor="middle" fill="#39ff80" font-weight="bold">X=1 / Y=1  ← זיהוי</text>

  <!-- S3 -0/0-> S2 (small back-arrow) -->
  <path d="M 488 220 C 460 248, 410 248, 396 226" stroke="#c8d8f0" fill="none" marker-end="url(#d-arr)"/>
  <text x="442" y="262" text-anchor="middle" fill="#c8d8f0">0 / 0</text>

  <!-- S2 -0/0-> S0 (long curve below) -->
  <path d="M 350 232 C 240 310, 120 310, 90 232" stroke="#c8d8f0" fill="none" marker-end="url(#d-arr)"/>
  <text x="220" y="312" text-anchor="middle" fill="#c8d8f0">0 / 0</text>

  <!-- S0 self loop X=0 -->
  <path d="M 60 172 C 24 120, 100 116, 80 166" stroke="#c8d8f0" fill="none" marker-end="url(#d-arr)"/>
  <text x="40" y="118" text-anchor="middle" fill="#c8d8f0">0 / 0</text>

  <!-- S1 self loop X=1 -->
  <path d="M 200 172 C 168 122, 240 122, 220 166" stroke="#c8d8f0" fill="none" marker-end="url(#d-arr)"/>
  <text x="210" y="120" text-anchor="middle" fill="#c8d8f0">1 / 0</text>

  <defs>
    <marker id="d-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#c8d8f0"/>
    </marker>
    <marker id="d-arr-g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#39ff80"/>
    </marker>
  </defs>

  <text x="300" y="340" text-anchor="middle" fill="#c8d8f0" font-size="10">החץ הירוק (S3 → S1, X=1) הוא הרגע שבו "1011" זוהה — וחוזרים ל-S1 (לא S0!) כי ה-"1" האחרון מתחיל רצף חדש.</text>
</svg>
`,
        interviewerMindset:
`הראיין רוצה לראות שאתה מבין את **עיקרון ה-suffix-prefix** — לא רק לזכור את התשובה "4 מצבים". מי שאומר "5 מצבים: S0,S1,S2,S3,S4=match" — בנה Moore, לא Mealy. **המינימום האמיתי הוא 4** (Mealy), כי ה-Y יוצא על המעבר ולא דורש מצב.

**מקפיץ לטובה:**
- לבנות את המעברים שיטתית מ"מה ה-suffix הארוך ביותר של הקלט שהוא prefix של 1011".
- להזכיר ש-Moore היה דורש 5 מצבים (\`⌈log₂5⌉ = 3\` FFs) — Mealy חוסך FF שלם.
- לרוץ מעבר על \`1011011\` ולהראות 2 זיהויים.`,
        expectedAnswers: [
          '4', 'ארבעה', 'ארבע', 'four',
          's0', 's1', 's2', 's3',
          'overlap', 'חפיפה', 'suffix', 'prefix',
          '2 ff', '2 flip', 'log2',
        ],
      },
      {
        label: 'ב',
        question: 'נתח את ה-Critical Path של המעגל. מה מסלול ההתפשטות הארוך ביותר ב-cycle, ומה כל "צרכן" של אות צריך לקיים?',
        hints: [
          'בכל FSM סינכרוני יש שני "סינקים" שצריכים לעמוד ב-setup: (1) ה-FFs של המצב, (2) ה-FF הבא שדוגם את ה-Y.',
          'Path 1 — **state path:** \`Q → next-state logic → D\`. מבוסס על Q (יציב מהקצה הקודם) + X.',
          'Path 2 — **output path:** מ-\`Y\` ל-FF הצרכן. **כאן ההבדל בין Moore ל-Mealy מתבטא:**',
          '   • Moore: \`Q → output logic → Y\`. \`X\` לא בנתיב הזה.',
          '   • Mealy: \`Q + X → output logic → Y\`. ⚠️ \`X\` בנתיב!',
          'כש-X איטי, הוספתו לנתיב Y הופכת אותו לקריטי. בלי X = יש שפע slack.',
        ],
        answer:
`**שני נתיבים קריטיים פוטנציאליים בכל cycle:**

**Path 1 — State Path** (Q ← next-state logic):
\`Q[n−1]\` (יציב מקצה קודם) + \`X\` (איטי, מתייצב מאוחר) → לוגיקה צירופית → \`D\` של ה-FFs של המצב.
דרישה: \`t_X_setup + t_combinational ≤ t_clk − t_setup,FSM\` של ה-FF של ה-FSM עצמו.

**Path 2 — Output Path** (\`Y\` → FF צרכן חיצוני):
- **ב-Moore:** \`Q[n−1] → output_logic → Y\`. \`Y\` תלוי **רק במצב**, שהוא יציב מקצה השעון הקודם.
  \`t_clk-to-Q + t_Y_logic\` — קצר, **\`X\` לא נכנס לחישוב**.
- **ב-Mealy:** \`(Q[n−1], X) → output_logic → Y\`. \`Y\` תלוי **גם ב-X**.
  \`max(t_clk-to-Q, t_X_arrival) + t_Y_logic\`.
  ⚠️ ה-\`X\` (האיטי!) שורשר ישירות לחישוב \`Y\`.

**הצרכן של \`Y\`** (FF חיצוני שדוגם בקצה הבא) דורש:
\`\`\`
t_Y_arrival + t_setup,downstream ≤ t_clk
\`\`\`

ב-Mealy, \`t_Y_arrival\` כולל את ה-\`t_X_arrival\` האיטי + לוגיקת Y. ב-Moore, רק \`t_clk-to-Q + t_Y_logic\` (X לא משתתף).

**זו תמצית ה-trade-off:** Mealy חוסך מצב/FF אבל גורר את X לתוך Y. כש-X איטי, זה הורג את ה-timing של downstream.`,
        expectedAnswers: [
          'critical path', 'נתיב קריטי',
          'setup', 'setup time', 'זמן הקמה',
          'clk-to-q', 'tco', 'tcq',
          'output path', 'state path',
          'combinational', 'צירופית',
        ],
      },
      {
        label: 'ג',
        question: 'בהינתן שה-\`X\` מתייצב ממש רגע לפני עליית השעון — האם תבחר Moore או Mealy? נמק תוך התייחסות ל-setup time של ה-FF הצרכן.',
        hints: [
          'Mealy: Y = f(state, X). ה-X האיטי נכנס לחישוב Y → ה-Y מתעדכן רק אחרי ש-X התייצב + delay של לוגיקת Y.',
          'הצרכן של Y צריך \`t_setup\` לפני קצה השעון. אם \`Y\` מתאחר → setup violation.',
          'Moore: Y = f(state) בלבד. ה-Q יציב מאז קצה השעון הקודם. \`Y\` ערוך הרבה לפני הקצה הבא — בלי קשר ל-X.',
          'המחיר: Moore דורש 5 מצבים (\`⌈log₂5⌉ = 3\` FFs), עוד מצב ועוד FF. אבל timing-wise — שווה את זה.',
          'כלל אצבע: כש-X על הגבול של ה-setup, אסור לשרשר אותו לעוד נתיב. Moore "מנקה" את נתיב Y מ-X.',
        ],
        answer:
`**בחירה: Moore.** הסיבה — **setup time של ה-FF הצרכן**.

**ניתוח Mealy (הבעיה):**

\`X\` מגיע ב-\`t_clk − ε\` (רק רגע לפני הקצה). ב-Mealy:
\`\`\`
t_Y_arrival = t_X_arrival + t_Y_combinational
            ≈ (t_clk − ε) + t_Y_logic
\`\`\`
דרישה ל-setup של ה-FF הצרכן:
\`\`\`
t_Y_arrival + t_setup,downstream ≤ t_clk
⟹ (t_clk − ε) + t_Y_logic + t_setup ≤ t_clk
⟹ t_Y_logic + t_setup ≤ ε
\`\`\`
\`ε\` הוא זעיר ⇒ **setup violation כמעט מובטח**. ב-Mealy ה-\`X\` האיטי "נספג" לתוך נתיב הפלט — ופותח חזית timing שניה שצריכה להיגמר באותו cycle.

**ניתוח Moore (הפתרון):**

\`Y = f(Q)\` בלבד. \`Q\` יציב מאז \`t_clk-to-Q\` של הקצה הקודם — כלומר זמין בערך \`t_clk-to-Q\` אחרי תחילת ה-cycle (\`≈ 100ps\` בטכנולוגיה מודרנית, מתוך \`t_clk\` של ננו-שניות).
\`\`\`
t_Y_arrival = t_clk-to-Q + t_Y_logic   ← זעיר ביחס ל-t_clk
\`\`\`
ה-\`X\` האיטי משפיע רק על \`D\` של ה-FFs של ה-FSM עצמו — וזו חזית timing **נפרדת** שצריכה לעמוד רק ב-setup של ה-FF של ה-FSM, לא של ה-downstream. הצרכן של \`Y\` מקבל אות **רגוע ויציב** עם שפע slack.

**המחיר של Moore כאן:** מצב נוסף (\`S4\`=match) → \`⌈log₂5⌉ = 3\` FFs במקום 2. עוד FF בודד וקצת לוגיקה — **מחיר זניח** לעומת רווח של setup margin על כל הצרכנים של Y.

**העיקרון הכללי לזכור לראיון:**
> "כשקלט מגיע על הסף של ה-setup, אסור לחבר אותו לנתיב פלט ארוך. Moore 'מבודד' את ה-X מ-Y דרך ה-FFs של המצב — וזה הופך את ה-Y לנקי ומהיר ביחס לקצה השעון הבא."

**Trade-off כללי שצריך לאלף עצמך:**

| תרחיש                          | בחירה   | למה                       |
|--------------------------------|---------|---------------------------|
| X איטי, latency פחות חשוב      | Moore   | מבודד X מ-Y                |
| X מהיר, latency קריטי          | Mealy   | חוסך cycle, מצב, FF        |
| Y מוזן ל-FF סינכרוני           | שניהם תקפים | תזמון מכריע        |
| Y מוזן ללוגיקה אסינכרונית/IO   | Moore   | אין glitches               |`,
        interviewerMindset:
`זה השאלה המרכזית בראיון — כל מי שזרק "Mealy כי פחות מצבים" בלי לחשב את ה-setup **הפסיד**. הראיין רוצה לראות שאתה:
1. מזהה ש-X נמצא ב-critical path.
2. **מחשב במשוואה** — לא רק "Moore יותר טוב"; אלא "\`t_Y_logic + t_setup ≤ ε\` שזה בלתי אפשרי".
3. מנמק שהמחיר (FF נוסף) זניח לעומת הרווח (margin על כל הצרכנים של Y).

**מקפיץ לטובה:**
- להזכיר את ה-trade-off הכללי: Mealy חוסך אזור/FFs, Moore חוסך timing slack.
- להציע פתרון hybrid: Mealy + register-the-output (\`Y_reg\` יוצא מ-FF נוסף) — מקבל את היתרונות של שניהם במחיר cycle latency. זו טכניקה נפוצה ב-pipelined designs.
- לציין שזה בדיוק העניין מאחורי "registered outputs" כ-best practice ב-ASIC.

**מי שזורק "Mealy" כאן — חוטף נוק-אאוט.** השאלה כתובה בכוונה כדי לחשוף את זה.`,
        expectedAnswers: [
          'moore',
          'setup', 'setup time', 'זמן הקמה',
          'critical path', 'נתיב קריטי',
          'register', 'registered output',
          't_co', 'tcq', 'clk-to-q', 'clk to q',
          'slack', 'margin',
        ],
        circuitRevealsAnswer: true,
        circuit: () => build(() => {
          // Moore "1011" detector — 5 states, 3 FFs.
          //   S0=000, S1=001, S2=010, S3=011, S4=100 (match → Y=1)
          // Transitions:
          //   S0: 0→S0(000), 1→S1(001)
          //   S1: 0→S2(010), 1→S1(001)
          //   S2: 0→S0(000), 1→S3(011)
          //   S3: 0→S2(010), 1→S4(100)
          //   S4: 0→S2(010), 1→S1(001)
          //
          // Minimized next-state equations (K-map with don't-cares on m10..m15):
          //   D2 = Q1 · Q0 · X
          //   D1 = ¬X·(Q0 + Q2) + Q1·¬Q0·X
          //   D0 = X · ¬(Q1·Q0)               = X·¬Q1 + X·¬Q0
          // Moore output:
          //   Y = Q2
          const X   = h.input(80, 280, 'X');
          const clk = h.clock(80, 820);
          X.fixedValue = 1;

          const ff2 = h.ffD(1100, 220, 'Q2');
          const ff1 = h.ffD(1100, 460, 'Q1');
          const ff0 = h.ffD(1100, 700, 'Q0');

          // Shared inverters
          const notX  = h.gate('NOT', 240, 280);
          const notQ0 = h.gate('NOT', 320, 760);

          // === D2 = Q1 · Q0 · X ============================================
          const andQ1Q0 = h.gate('AND', 540, 540);   // Q1·Q0
          const andD2   = h.gate('AND', 760, 320);   // (Q1·Q0)·X

          // === D1 = ¬X·(Q0 + Q2) + Q1·¬Q0·X ================================
          const orQ0Q2  = h.gate('OR',  540, 380);   // Q0 + Q2
          const andT1   = h.gate('AND', 760, 460);   // ¬X · (Q0+Q2)
          const andNQ0X = h.gate('AND', 540, 680);   // ¬Q0 · X
          const andT2   = h.gate('AND', 760, 580);   // Q1 · (¬Q0·X)
          const orD1    = h.gate('OR',  920, 520);   // T1 + T2

          // === D0 = X · ¬(Q1·Q0)  -- reuse andQ1Q0, just invert it =========
          const notQ1Q0 = h.gate('NOT', 760, 760);   // ¬(Q1·Q0)
          const andD0   = h.gate('AND', 920, 720);   // X · ¬(Q1·Q0)

          // Moore output: Y = Q2 (depends only on state)
          const Y = h.output(1380, 220, 'Y = Q2');

          return {
            nodes: [
              X, clk,
              notX, notQ0,
              andQ1Q0, andD2,
              orQ0Q2, andT1, andNQ0X, andT2, orD1,
              notQ1Q0, andD0,
              ff2, ff1, ff0,
              Y,
            ],
            wires: [
              // Inverters
              h.wire(X.id,    notX.id,  0),
              h.wire(ff0.id,  notQ0.id, 0),

              // Q1·Q0 — feeds both D2 (via AND with X) and D0 (via NOT)
              h.wire(ff1.id, andQ1Q0.id, 0),
              h.wire(ff0.id, andQ1Q0.id, 1),

              // D2 = (Q1·Q0) · X
              h.wire(andQ1Q0.id, andD2.id, 0),
              h.wire(X.id,       andD2.id, 1),
              h.wire(andD2.id,   ff2.id,   0),

              // D1 — term 1: ¬X · (Q0 + Q2)
              h.wire(ff0.id, orQ0Q2.id, 0),
              h.wire(ff2.id, orQ0Q2.id, 1),
              h.wire(notX.id,   andT1.id, 0),
              h.wire(orQ0Q2.id, andT1.id, 1),

              // D1 — term 2: Q1 · (¬Q0 · X)
              h.wire(notQ0.id, andNQ0X.id, 0),
              h.wire(X.id,     andNQ0X.id, 1),
              h.wire(ff1.id,   andT2.id, 0),
              h.wire(andNQ0X.id, andT2.id, 1),

              // D1 = T1 + T2
              h.wire(andT1.id, orD1.id, 0),
              h.wire(andT2.id, orD1.id, 1),
              h.wire(orD1.id,  ff1.id, 0),

              // D0 = X · ¬(Q1·Q0)
              h.wire(andQ1Q0.id, notQ1Q0.id, 0),
              h.wire(X.id,       andD0.id,   0),
              h.wire(notQ1Q0.id, andD0.id,   1),
              h.wire(andD0.id,   ff0.id,     0),

              // Clocks
              h.wire(clk.id, ff2.id, 1),
              h.wire(clk.id, ff1.id, 1),
              h.wire(clk.id, ff0.id, 1),

              // Moore output Y = Q2  ← תלוי רק במצב, לא ב-X!
              h.wire(ff2.id, Y.id, 0),
            ],
          };
        }),
      },
    ],
    source: 'מאגר ראיונות — "1011" detector + setup-time / critical-path reasoning',
    tags: ['fsm', 'mealy', 'moore', 'sequence-detector', '1011', 'setup-time', 'critical-path', 'sequential'],
  },

  // ─────────────────────────────────────────────────────────────
  // #2009 — Room occupancy monitor (men vs women) from a 4-bit
  //          one-hot sensor. Source slide: IQ/PP/slides/circuits_s01_1.png
  //          (מעגלים שקף 1).
  // NOTE: numbered 2009 to keep slide-order consistent in the panel
  // (slide 1 → 2009, slide 2 → 2010, slide 3 → 1005 in logic). Tabs
  // place questions in array order, not by serial.
  // ─────────────────────────────────────────────────────────────
  {
    id: 'room-ratio-monitor',
    difficulty: 'medium',
    title: 'מוניטור יחס גברים/נשים בחדר (גלאי 4-ביט)',
    intro:
`גלאי בחדר מוציא בכל מחזור שעון קוד **4-ביט one-hot** המתאר אירוע יחיד:

| קוד  | אירוע |
|------|-------|
| \`1000\` | גבר נכנס לחדר (Min) |
| \`0100\` | גבר יוצא מהחדר (Mout) |
| \`0010\` | אישה נכנסת לחדר (Fin) |
| \`0001\` | אישה יוצאת מהחדר (Fout) |
| \`0000\` | אין תנועה |

תכנן מערכת שמדליקה אחת מ-3 נורות לפי **היחס בין גברים לנשים בחדר**:

- **Red** — יותר נשים מגברים.
- **Yellow** — מספר שווה.
- **Green** — יותר גברים מנשים.

ההנחות: בהדלקה החדר ריק (0 גברים, 0 נשים). הגלאי מבטיח שביט אחד לכל היותר דולק בכל ציקל (one-hot או אפס).`,
    parts: [
      {
        label: 'א',
        question: 'תכנון מושגי: איזה מצב המעגל צריך לשמור, ואיך מחשבים ממנו את 3 הנורות?',
        hints: [
          'הדרך הישירה: **שני מונים נפרדים** — `cnt_M` סופר גברים בחדר, `cnt_F` סופר נשים.',
          '`cnt_M` עולה ב-Min ויורד ב-Mout. `cnt_F` עולה ב-Fin ויורד ב-Fout.',
          '**Comparator** יחיד מחזיר את 3 הסיגנלים: EQ (Yellow), GT (Green = M > F), LT (Red = M < F).',
          'אופציה אופטימלית: לאחד את שני המונים לרגיסטר חתום אחד `diff = M − F` (state-collapse). מצומצם, אבל פחות אינטואיטיבי — נדון בו בסוף.',
        ],
        answer:
`**הארכיטקטורה הישירה: 2 מונים + comparator יחיד.**

\`\`\`
cnt_M ← מונה אנשים מסוג גבר בחדר        (עולה ב-Min, יורד ב-Mout)
cnt_F ← מונה אנשים מסוג אישה בחדר        (עולה ב-Fin, יורד ב-Fout)
\`\`\`

**Mapping אירוע → פעולה על המונים:**

| אירוע    | קוד (b3 b2 b1 b0) | cnt_M | cnt_F |
|----------|-------------------|-------|-------|
| Min      | \`1000\`            | **+1** | —     |
| Mout     | \`0100\`            | **−1** | —     |
| Fin      | \`0010\`            | —     | **+1** |
| Fout     | \`0001\`            | —     | **−1** |
| no-event | \`0000\`            | —     | —     |

**Comparator יחיד** (\`cnt_M\` מול \`cnt_F\`) מחזיר 3 פלטים:

\`\`\`
EQ  = (cnt_M == cnt_F)   →  Yellow
GT  = (cnt_M >  cnt_F)   →  Green   (יותר גברים)
LT  = (cnt_M <  cnt_F)   →  Red     (יותר נשים)
\`\`\`

**Reset:** שני המונים מתחילים ב-0 (החדר ריק → EQ → Yellow).

**רוחב המונים:** ⌈log₂(K+1)⌉ ביטים לקיבולת חדר \`K\`. לחדר של 16 → 4 ביטים מספיקים. אין צורך ב-signed כי המונים אי-שליליים.

---

**אופטימיזציה (state-collapse) — לסיום הראיון:**
3 הנורות תלויות **רק** בסימן של \`M − F\`, אז ניתן להחליף את שני המונים ברגיסטר חתום אחד \`diff = M − F\`. עליות ב-Min ו-Fout, ירידות ב-Mout ו-Fin. Yellow=\`diff==0\`, Red=\`diff[MSB]\`, Green=\`¬Red ∧ ¬Yellow\`. חוסך כ-N ביטי FFs + comparator → במחיר adder signed יחיד. **גרסת ה-canvas שלמטה משתמשת בגרסת 2-המונים** כי היא קריאה יותר.`,
        answerSchematic: `
<svg viewBox="0 0 900 440" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="13" role="img" aria-label="Block diagram: two counters + comparator">
  <text x="450" y="28" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="17">בלוק-דיאגרמה: 2 מונים + COMPARATOR</text>

  <!-- ─── Inputs (left column) ─────────────────────────────── -->
  <g font-weight="bold" font-size="13">
    <text x="50" y="110" fill="#80b0e0">Min</text>
    <text x="50" y="170" fill="#80b0e0">Mout</text>
    <text x="50" y="290" fill="#80b0e0">Fin</text>
    <text x="50" y="350" fill="#80b0e0">Fout</text>
  </g>

  <!-- ─── cnt_M block (top) ────────────────────────────────── -->
  <rect x="200" y="80"  width="180" height="120" rx="4"
        fill="#0a1520" stroke="#80f0a0" stroke-width="2.4"/>
  <text x="290" y="125" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="16">cnt_M</text>
  <text x="290" y="150" text-anchor="middle" fill="#c8d8f0" font-size="12">N-bit up/down counter</text>
  <text x="290" y="172" text-anchor="middle" fill="#c8d8f0" font-size="12">reset: 0</text>
  <text x="290" y="192" text-anchor="middle" fill="#80b0e0" font-size="11">+1 on Min, −1 on Mout</text>

  <!-- Wires Min → cnt_M (UP), Mout → cnt_M (DOWN) -->
  <line x1="90"  y1="106" x2="200" y2="106" stroke="#39ff80" stroke-width="1.8"/>
  <text x="155" y="100" fill="#39ff80" font-size="11">UP</text>
  <line x1="90"  y1="166" x2="200" y2="166" stroke="#ff7070" stroke-width="1.8"/>
  <text x="145" y="160" fill="#ff7070" font-size="11">DOWN</text>

  <!-- ─── cnt_F block (bottom) ─────────────────────────────── -->
  <rect x="200" y="260" width="180" height="120" rx="4"
        fill="#0a1520" stroke="#80f0a0" stroke-width="2.4"/>
  <text x="290" y="305" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="16">cnt_F</text>
  <text x="290" y="330" text-anchor="middle" fill="#c8d8f0" font-size="12">N-bit up/down counter</text>
  <text x="290" y="352" text-anchor="middle" fill="#c8d8f0" font-size="12">reset: 0</text>
  <text x="290" y="372" text-anchor="middle" fill="#80b0e0" font-size="11">+1 on Fin, −1 on Fout</text>

  <!-- Wires Fin → cnt_F (UP), Fout → cnt_F (DOWN) -->
  <line x1="90"  y1="286" x2="200" y2="286" stroke="#39ff80" stroke-width="1.8"/>
  <text x="155" y="280" fill="#39ff80" font-size="11">UP</text>
  <line x1="90"  y1="346" x2="200" y2="346" stroke="#ff7070" stroke-width="1.8"/>
  <text x="145" y="340" fill="#ff7070" font-size="11">DOWN</text>

  <!-- ─── Comparator block (middle-right) ──────────────────── -->
  <rect x="510" y="160" width="180" height="160" rx="4"
        fill="#0a1520" stroke="#f0d080" stroke-width="2.4"/>
  <text x="600" y="200" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="16">COMPARATOR</text>
  <text x="600" y="225" text-anchor="middle" fill="#c8d8f0" font-size="12">A vs B → EQ / GT / LT</text>
  <text x="530" y="260" fill="#c8d8f0" font-size="12" font-weight="bold">A</text>
  <text x="530" y="300" fill="#c8d8f0" font-size="12" font-weight="bold">B</text>

  <!-- cnt_M output → CMP.A -->
  <line x1="380" y1="140" x2="445" y2="140" stroke="#80c8ff" stroke-width="2"/>
  <line x1="445" y1="140" x2="445" y2="255" stroke="#80c8ff" stroke-width="2"/>
  <line x1="445" y1="255" x2="510" y2="255" stroke="#80c8ff" stroke-width="2"/>
  <text x="395" y="132" fill="#80c8ff" font-size="11" font-weight="bold">M</text>

  <!-- cnt_F output → CMP.B -->
  <line x1="380" y1="320" x2="445" y2="320" stroke="#80c8ff" stroke-width="2"/>
  <line x1="445" y1="320" x2="445" y2="295" stroke="#80c8ff" stroke-width="2"/>
  <line x1="445" y1="295" x2="510" y2="295" stroke="#80c8ff" stroke-width="2"/>
  <text x="395" y="314" fill="#80c8ff" font-size="11" font-weight="bold">F</text>

  <!-- ─── Three lamps (right) ──────────────────────────────── -->
  <g font-size="13" font-weight="bold">
    <!-- GT → Green -->
    <line x1="690" y1="195" x2="770" y2="195" stroke="#39ff80" stroke-width="2"/>
    <text x="700" y="187" fill="#39ff80" font-size="11">GT</text>
    <circle cx="800" cy="195" r="20" fill="#39ff80" stroke="#c8d8f0" stroke-width="1.4"/>
    <text x="830" y="200" fill="#39ff80">Green</text>
    <text x="830" y="216" fill="#80b0e0" font-size="11">M &gt; F</text>

    <!-- EQ → Yellow -->
    <line x1="690" y1="240" x2="770" y2="240" stroke="#f0d050" stroke-width="2"/>
    <text x="700" y="232" fill="#f0d050" font-size="11">EQ</text>
    <circle cx="800" cy="240" r="20" fill="#f0d050" stroke="#c8d8f0" stroke-width="1.4"/>
    <text x="830" y="245" fill="#f0d050">Yellow</text>
    <text x="830" y="261" fill="#80b0e0" font-size="11">M = F</text>

    <!-- LT → Red -->
    <line x1="690" y1="285" x2="770" y2="285" stroke="#ff5555" stroke-width="2"/>
    <text x="700" y="277" fill="#ff5555" font-size="11">LT</text>
    <circle cx="800" cy="285" r="20" fill="#ff5555" stroke="#c8d8f0" stroke-width="1.4"/>
    <text x="830" y="290" fill="#ff5555">Red</text>
    <text x="830" y="306" fill="#80b0e0" font-size="11">M &lt; F</text>
  </g>

  <text x="450" y="420" text-anchor="middle" fill="#c8d8f0" font-size="12">
    שני מונים בלתי-תלויים (M, F) → comparator יחיד מפיק את 3 הסיגנלים EQ / GT / LT → 3 נורות.
  </text>
</svg>
`,
        interviewerMindset:
`הראיין רוצה לראות שאתה מתחיל מהפתרון הישיר (**2 מונים + comparator**) — מיפוי 1:1 לבעיה. זו התשובה ה"בטוחה" שמראה שהבנת את הבעיה.

**מקפיץ לטובה:**
- להציע ביוזמתך אופטימיזציה ל-**רגיסטר חתום אחד** (state-collapse) ולנמק: הנורות תלויות רק בסימן ההפרש.
- לשאול "מה קיבולת החדר?" לפני קביעת רוחב המונים.
- להזכיר שעם comparator יחיד 3 הפלטים (EQ/GT/LT) הם הדדית-בלעדיים אוטומטית — אין צורך באזעקה של "more than one lamp".

**מלכודת נפוצה:** לבנות counter "up-only" ולנסות "לפצות" באלגוריתם. במציאות צריך up/down counter (REG + ALU עם delta ∈ {−1,0,+1}). זה רכיב סטנדרטי, לא להסתבך.`,
        expectedAnswers: [
          'counter', 'מונה', 'cnt_m', 'cnt_f',
          'comparator', 'cmp', 'משווה',
          'eq', 'gt', 'lt',
          'up/down', 'up-down',
          'diff', 'state-collapse', 'collapse',
        ],
      },
      {
        label: 'ב',
        question: 'מימוש פיזי: בחר רוחב למונים, הראה את חיווט ה-up/down counter ופלטי המשווה. מה קורה אם counter תחתון/עליון נחרג?',
        hints: [
          'רוחב 4-bit unsigned (0..15) מספיק לחדר עד 15 אנשים מכל מין. הרחב לפי קיבולת.',
          'Up/down counter: על כל ציקל עולה ב-`+1` ב-event UP, יורד ב-`−1` ב-event DOWN, אחרת מחזיק. שני events לעולם לא דולקים יחד בגלל ה-one-hot.',
          'מימוש פיזי: REG + ALU. delta = UP ? +1 : (DOWN ? −1 : 0). enable = UP | DOWN.',
          'COMPARATOR מבטא בו-זמנית את 3 ההשוואות: EQ → Yellow, GT → Green, LT → Red. אין צורך בלוגיקה חיצונית.',
          'חריגה: cnt_M = 15 + Min → גלישה ל-0. בלתי אפשרי פיזית (אדם 17 לא נכנס לחדר של 16). אם הספציפיקציה לא מבטיחה את זה — הוסף saturation: אם cnt = MAX ו-UP=1 → לא לעדכן.',
        ],
        answer:
`**רוחב: 4-bit unsigned** (0..15) לחדר קטן. בלי signed — שני המונים אי-שליליים בהגדרה.

**Up/Down counter (זהה ל-cnt_M ול-cnt_F):**
\`\`\`
delta     = up ? 4'b0001
          : down ? 4'b1111  // = −1 ב-2'sC, הוספה רגילה תיתן cnt−1
                 : 4'b0000

cnt_next  = cnt + delta     // adder יחיד, אין צורך ב-subtract
enable    = up | down       // לא לכתוב לרגיסטר בציקלים שקטים
\`\`\`

**Mapping signals → counters:**
\`\`\`
M.up   = sensor[3]    (Min)
M.down = sensor[2]    (Mout)
F.up   = sensor[1]    (Fin)
F.down = sensor[0]    (Fout)
\`\`\`

**Output decode מ-Comparator יחיד:**
\`\`\`
{green, yellow, red} = CMP(cnt_M, cnt_F)
   yellow ← EQ        (cnt_M == cnt_F)
   green  ← GT        (cnt_M >  cnt_F)
   red    ← LT        (cnt_M <  cnt_F)
\`\`\`

**Saturation trap:**

1. **Underflow:** אם cnt_M = 0 ו-Mout מגיע → wrap ל-15. נורת Green תקפוץ מ-Yellow ל-Green בטעות. בלתי אפשרי פיזית, אבל הספציפיקציה צריכה לאשר. הגנה: בלוק את ה-DOWN כש-cnt=0.
2. **Overflow:** סימטרי, אם cnt = MAX ו-UP=1. הגנה: בלוק את ה-UP.
3. **Wider register:** 8-bit (0..255) מספיק לכל אולם נורמלי, פשוט יותר מהוספת saturation logic.

**בראיון:** הזכר שזו "saturating up/down counter", רכיב סטנדרטי בכל ספריית design.`,
        editor: 'verilog',
        starterCode:
`module room_ratio_monitor (
    input  wire       clk,
    input  wire       rst_n,        // async, active-low
    input  wire [3:0] sensor,       // {Min, Mout, Fin, Fout}
    output wire       red,
    output wire       yellow,
    output wire       green
);

    // TODO: split sensor into per-counter up/down events

    // TODO: cnt_M — up/down counter for men in room

    // TODO: cnt_F — up/down counter for women in room

    // TODO: single comparator → red / yellow / green

endmodule
`,
        answerVerilog:
`module room_ratio_monitor #(
    parameter N = 4                            // counter width
) (
    input  wire             clk,
    input  wire             rst_n,
    input  wire       [3:0] sensor,            // {Min, Mout, Fin, Fout}
    output wire             red,
    output wire             yellow,
    output wire             green
);
    wire min  = sensor[3];
    wire mout = sensor[2];
    wire fin  = sensor[1];
    wire fout = sensor[0];

    reg [N-1:0] cnt_m;
    reg [N-1:0] cnt_f;

    // ── cnt_M: up on Min, down on Mout ──────────────────────
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)               cnt_m <= 0;
        else if (min  && !mout)   cnt_m <= cnt_m + 1;
        else if (mout && !min)    cnt_m <= cnt_m - 1;
    end

    // ── cnt_F: up on Fin, down on Fout ──────────────────────
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)               cnt_f <= 0;
        else if (fin  && !fout)   cnt_f <= cnt_f + 1;
        else if (fout && !fin)    cnt_f <= cnt_f - 1;
    end

    // ── Single comparator → three mutually-exclusive lamps ──
    assign green  = (cnt_m >  cnt_f);
    assign yellow = (cnt_m == cnt_f);
    assign red    = (cnt_m <  cnt_f);
endmodule
`,
        expectedAnswers: [
          'cnt_m', 'cnt_f', 'counter', 'מונה',
          'up', 'down', 'up/down', 'up-down',
          'comparator', 'cmp', 'משווה',
          'eq', 'gt', 'lt', '==', '>', '<',
          'always', 'posedge', 'reg', 'assign',
          'saturat',
        ],
      },
      {
        label: 'ג',
        question: 'איך תאמת את המעגל בסימולציה? בנה רצף קצר של 6 אירועי גלאי ומסור איזו נורה תידלק בכל ציקל.',
        hints: [
          'התחל מ-`cnt_M=0`, `cnt_F=0` → EQ → Yellow.',
          'ציקל 1: Min (1000) → `cnt_M=1, cnt_F=0` → GT → Green.',
          'ציקל 2: Fin (0010) → `cnt_M=1, cnt_F=1` → EQ → Yellow.',
          'ציקל 3: Fin (0010) → `cnt_M=1, cnt_F=2` → LT → Red.',
          'ציקל 4: no-event → ללא שינוי → Red.',
          'ציקל 5: Fout (0001) → `cnt_M=1, cnt_F=1` → EQ → Yellow.',
          'ציקל 6: Min (1000) → `cnt_M=2, cnt_F=1` → GT → Green.',
        ],
        answer:
`**Trace 6 ציקלים** (תואם במדויק את המעגל שעל הקנבס):

| t | sensor | אירוע    | cnt_M | cnt_F | CMP | נורה |
|---|--------|----------|:-----:|:-----:|:---:|:----:|
| 0 | —      | reset    | 0 | 0 | EQ | **Yellow** |
| 1 | 1000   | Min      | 1 | 0 | GT | **Green** |
| 2 | 0010   | Fin      | 1 | 1 | EQ | **Yellow** |
| 3 | 0010   | Fin      | 1 | 2 | LT | **Red** |
| 4 | 0000   | no-event | 1 | 2 | LT | **Red** |
| 5 | 0001   | Fout     | 1 | 1 | EQ | **Yellow** |
| 6 | 1000   | Min      | 2 | 1 | GT | **Green** |

**מה לבדוק בסימולציה:**
- **State coverage:** Red, Yellow, Green נדלקות לפחות פעם אחת — בטראס הזה כולן ✓.
- **One-hot lamp:** ה-Comparator מבטיח אוטומטית ש-\`green + yellow + red == 1\` (EQ/GT/LT הדדית-בלעדיות).
- **Reset:** אחרי \`rst_n=0\` קצר, שני המונים = 0, EQ דולק → Yellow.
- **No-event idempotency:** רצף \`0000 0000 0000\` לא משנה אף מונה — הנורה נשמרת (ציקל 4).
- **Underflow trap:** הזן Mout כאשר \`cnt_M=0\` — המונה יעבור ל-15 (gross wrap-around). הוסף לוגיקת saturation ב-spec הדורש זאת.
- **Overflow trap:** הזן 16 Min רצופים עם N=4 — המונה יעבור מ-15 ל-0. סימטרית.`,
        expectedAnswers: [
          'red', 'yellow', 'green', 'אדום', 'צהוב', 'ירוק',
          'cnt_m', 'cnt_f', 'eq', 'gt', 'lt',
          'trace', 'simulation', 'סימולציה',
          'reset', 'one-hot', 'assertion',
          'underflow', 'overflow', 'saturat',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 1 (מוניטור גלאי 4-ביט יחס גברים/נשים)',
    tags: ['counter', 'up-down', 'comparator', 'sub-circuit', 'sequential', 'verilog'],
    circuitRevealsAnswer: true,
    circuit: () => build(() => {
      // The canvas mirrors the part-א architecture exactly:
      //   2 up/down counter blocks + 1 COMPARATOR + 3 lamps.
      // Each counter is a SUB_CIRCUIT named "U/D Counter" that wraps the
      // REG + ALU + delta-MUX detail away from the top-level view.

      // Fresh inner scene for each counter instance (each SUB_CIRCUIT must
      // own its own node objects — the engine mutates internal INPUT
      // fixedValues per cycle, so sharing would race).
      const _udInner = () => ({
        nodes: [
          { type: 'INPUT',    id: 'up',     label: 'up',   x: -320, y: -60, fixedValue: 0 },
          { type: 'INPUT',    id: 'down',   label: 'down', x: -320, y:   0, fixedValue: 0 },
          { type: 'INPUT',    id: 'clk',    label: 'clk',  x: -320, y:  60, fixedValue: 0 },
          { type: 'IMM',      id: 'imm_p1', label: '+1',   x: -160, y: 120, value:  1, bitWidth: 4 },
          { type: 'IMM',      id: 'imm_m1', label: '−1',   x: -160, y: 160, value: 15, bitWidth: 4 },
          { type: 'IMM',      id: 'imm_z0', label: '0',    x: -160, y: 200, value:  0, bitWidth: 4 },
          { type: 'IMM',      id: 'imm_op', label: 'OP',   x: -160, y: 240, value:  0, bitWidth: 4 },
          { type: 'IMM',      id: 'imm_clr',label: 'CLR',  x: -160, y: 280, value:  0, bitWidth: 1 },
          { type: 'GATE_SLOT',id: 'or_any', label: 'EN',   x:    0, y: -30, gate: 'OR' },
          { type: 'BUS_MUX',  id: 'mux_s',  label: '±1',   x:  120, y:  60, inputCount: 2 },
          { type: 'BUS_MUX',  id: 'mux_d',  label: 'Δ',    x:  240, y: 130, inputCount: 2 },
          { type: 'ALU',      id: 'alu',    label: 'ADD',  x:  380, y:  60, bitWidth: 4 },
          { type: 'REGISTER', id: 'reg',    label: 'cnt',  x:  520, y:  60, bitWidth: 4 },
          { type: 'OUTPUT',   id: 'count',  label: 'count',x:  680, y:  60 },
        ],
        wires: [
          { id: 'iw01', sourceId: 'up',     targetId: 'or_any', targetInputIndex: 0, sourceOutputIndex: 0 },
          { id: 'iw02', sourceId: 'down',   targetId: 'or_any', targetInputIndex: 1, sourceOutputIndex: 0 },
          { id: 'iw03', sourceId: 'imm_m1', targetId: 'mux_s',  targetInputIndex: 0, sourceOutputIndex: 0 },
          { id: 'iw04', sourceId: 'imm_p1', targetId: 'mux_s',  targetInputIndex: 1, sourceOutputIndex: 0 },
          { id: 'iw05', sourceId: 'up',     targetId: 'mux_s',  targetInputIndex: 2, sourceOutputIndex: 0 },
          { id: 'iw06', sourceId: 'imm_z0', targetId: 'mux_d',  targetInputIndex: 0, sourceOutputIndex: 0 },
          { id: 'iw07', sourceId: 'mux_s',  targetId: 'mux_d',  targetInputIndex: 1, sourceOutputIndex: 0 },
          { id: 'iw08', sourceId: 'or_any', targetId: 'mux_d',  targetInputIndex: 2, sourceOutputIndex: 0 },
          { id: 'iw09', sourceId: 'reg',    targetId: 'alu',    targetInputIndex: 0, sourceOutputIndex: 0 },
          { id: 'iw10', sourceId: 'mux_d',  targetId: 'alu',    targetInputIndex: 1, sourceOutputIndex: 0 },
          { id: 'iw11', sourceId: 'imm_op', targetId: 'alu',    targetInputIndex: 2, sourceOutputIndex: 0 },
          { id: 'iw12', sourceId: 'alu',    targetId: 'reg',    targetInputIndex: 0, sourceOutputIndex: 0 },
          { id: 'iw13', sourceId: 'or_any', targetId: 'reg',    targetInputIndex: 1, sourceOutputIndex: 0 },
          { id: 'iw14', sourceId: 'imm_clr',targetId: 'reg',    targetInputIndex: 2, sourceOutputIndex: 0 },
          { id: 'iw15', sourceId: 'clk',    targetId: 'reg',    targetInputIndex: 3, sourceOutputIndex: 0, isClockWire: true },
          { id: 'iw16', sourceId: 'reg',    targetId: 'count',  targetInputIndex: 0, sourceOutputIndex: 0 },
        ],
      });

      // ── Top-level scene ──────────────────────────────────────
      const B3  = h.input(80,  120, 'Min');   // up  for cnt_M
      const B2  = h.input(80,  200, 'Mout');  // down for cnt_M
      const B1  = h.input(80,  420, 'Fin');   // up  for cnt_F
      const B0  = h.input(80,  500, 'Fout');  // down for cnt_F
      const clk = h.clock(80, 700);

      // 6-cycle trace: Min, Fin, Fin, no-event, Fout, Min.
      B3.fixedValue = 0; B3.stepValues = [1, 0, 0, 0, 0, 1, 0, 0];
      B2.fixedValue = 0; B2.stepValues = [0, 0, 0, 0, 0, 0, 0, 0];
      B1.fixedValue = 0; B1.stepValues = [0, 1, 1, 0, 0, 0, 0, 0];
      B0.fixedValue = 0; B0.stepValues = [0, 0, 0, 0, 1, 0, 0, 0];

      const cntM = h.block('SUB_CIRCUIT', 360, 160, {
        subName: 'ud_counter',
        label: 'cnt_M  (U/D Counter)',
        subInputs:  [{ id: 'up' }, { id: 'down' }, { id: 'clk' }],
        subOutputs: [{ id: 'count' }],
        subCircuit: _udInner(),
      });
      const cntF = h.block('SUB_CIRCUIT', 360, 460, {
        subName: 'ud_counter',
        label: 'cnt_F  (U/D Counter)',
        subInputs:  [{ id: 'up' }, { id: 'down' }, { id: 'clk' }],
        subOutputs: [{ id: 'count' }],
        subCircuit: _udInner(),
      });

      const cmp = h.block('COMPARATOR', 680, 310, { label: 'CMP' });

      const cntMOut = h.output(560, 100, 'cnt_M');
      const cntFOut = h.output(560, 540, 'cnt_F');
      const green   = h.output(900, 230, 'Green');
      const yellow  = h.output(900, 310, 'Yellow');
      const red     = h.output(900, 390, 'Red');

      return {
        nodes: [B3, B2, B1, B0, clk, cntM, cntF, cmp, cntMOut, cntFOut, green, yellow, red],
        wires: [
          // cnt_M ports: up=0, down=1, clk=2.
          h.wire(B3.id,  cntM.id, 0),
          h.wire(B2.id,  cntM.id, 1),
          h.wire(clk.id, cntM.id, 2),
          // cnt_F ports.
          h.wire(B1.id,  cntF.id, 0),
          h.wire(B0.id,  cntF.id, 1),
          h.wire(clk.id, cntF.id, 2),

          // Counter outputs → monitors + comparator.
          h.wire(cntM.id, cntMOut.id, 0),
          h.wire(cntF.id, cntFOut.id, 0),
          h.wire(cntM.id, cmp.id, 0),
          h.wire(cntF.id, cmp.id, 1),

          // Comparator outputs: 0=EQ→Yellow, 1=GT→Green, 2=LT→Red.
          h.wire(cmp.id, yellow.id, 0, 0),
          h.wire(cmp.id, green.id,  0, 1),
          h.wire(cmp.id, red.id,    0, 2),
        ],
      };
    }),
  },

  // ─────────────────────────────────────────────────────────────
  // #2010 — FSM divisibility by 3 (serial bit stream, MSB first)
  // Source slide: IQ/PP/slides/circuits_s02_1.png (מעגלים שקף 2).
  // ─────────────────────────────────────────────────────────────
  {
    id: 'fsm-divisible-by-3',
    difficulty: 'medium',
    title: 'FSM — האם מספר בינארי מתחלק ב-3?',
    intro:
`אתה מקבל זרם סדרתי של \`N\` ביטים (\`N\` לא ידוע מראש), **MSB ראשון**. בכל קצה שעון נכנס ביט אחד \`X\`. בסוף הזרם המעגל צריך להוציא \`Y=1\` אם המספר שמיוצג ע"י כל הביטים מתחלק ב-3, אחרת \`Y=0\`.

דוגמאות:
- \`00011011\` = 27 → \`Y=1\` (27 = 3·9 ✓)
- \`1000\` = 8 → \`Y=0\` (8 mod 3 = 2 ✗)
- \`110\` = 6 → \`Y=1\`

**אילוץ:** המעגל סינכרוני, חד-ביט-לפר-ציקל, אינו יודע מתי הזרם מסתיים — \`Y\` חייב להיות תקין בכל ציקל (מצב התקבולת = השארית מודולו 3).`,
    parts: [
      {
        label: 'א',
        question: 'תכנון: כמה מצבים נדרשים? תאר את הסמנטיקה של כל מצב ובנה את טבלת המעברים.',
        hints: [
          'אחרי קליטת ביט נוסף MSB-first, הערך המספרי הוא `value = 2·value_old + X`.',
          'אנחנו לא צריכים לשמור את כל ה-value (יכול להיות עצום) — מספיק לשמור את **השארית מודולו 3** של מה שראינו עד כה.',
          'שארית אפשרית: 0, 1, 2 → **3 מצבים בלבד**: `S0` (mod=0), `S1` (mod=1), `S2` (mod=2).',
          'מעבר: `new_state = (2 · old_state + X) mod 3`.',
          'פלט Moore: `Y = 1 ⇔ state == S0`.',
        ],
        answer:
`**3 מצבים** מספיקים — מצב = השארית מודולו 3 של הזרם שנקלט עד כה:

| מצב | משמעות (mod 3) | Y |
|-----|-----------------|---|
| \`S0\` | 0 | **1** |
| \`S1\` | 1 | 0 |
| \`S2\` | 2 | 0 |

**הגיוון של המעבר** מ-MSB-first:
ערך חדש \`= 2·value_old + X\`. לכן \`new_mod = (2·old_mod + X) mod 3\`.

| ממצב | X=0 → | X=1 → |
|------|-------|-------|
| S0 (mod 0) | 2·0+0=0 → **S0** | 2·0+1=1 → **S1** |
| S1 (mod 1) | 2·1+0=2 → **S2** | 2·1+1=3=0 → **S0** |
| S2 (mod 2) | 2·2+0=4=1 → **S1** | 2·2+1=5=2 → **S2** |

**מצב התחלה:** \`S0\` (ערך ריק = 0, מתחלק ב-3 טריוויאלית).

**מעקב על \`00011011\` (=27):**
S0→(0)→S0→(0)→S0→(0)→S0→(1)→S1→(1)→S0→(0)→S1→(1)→S0→(1)→**S1**.
חכה — קיבלנו S1, לא S0! בואו נספור שוב MSB-first של "00011011":
- ערך אחרי כל ביט: 0, 0, 0, 1, 3, 6, 13, 27.
- mod 3 של כל אחד: 0, 0, 0, 1, 0, 0, 1, 0. סוף = **0** → \`Y=1\` ✓.
- שגיאתי במעבר. נריץ שוב: S0→0→S0→0→S0→0→S0→1→S1→1→**S0** (mod=3=0)→0→S1 (mod=6→0? לא: 2·0+0=0 → **S0**, mod=0). תיקון: \`S0→(0)→S0\`. כלומר אחרי "000110" אנחנו ב-S0 (mod 0). ממשיכים: \`S0→(1)→S1\`, \`S1→(1)→S0\`. סוף: **S0 → Y=1** ✓.`,
        answerSchematic: `
<svg viewBox="0 0 560 320" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="Moore FSM state diagram for divisibility-by-3">
  <text x="280" y="20" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">Moore FSM — Divisible by 3</text>

  <g stroke="#80b0e0" stroke-width="1.8" fill="#0a1520">
    <circle cx="100" cy="180" r="40"/>
    <circle cx="100" cy="180" r="46" fill="none" stroke="#39ff80" stroke-width="1.2"/>
    <circle cx="280" cy="180" r="40"/>
    <circle cx="460" cy="180" r="40"/>
  </g>
  <g fill="#c8d8f0" text-anchor="middle" font-weight="bold" font-size="13">
    <text x="100" y="178">S0</text>
    <text x="280" y="178">S1</text>
    <text x="460" y="178">S2</text>
  </g>
  <g fill="#80b0e0" text-anchor="middle" font-size="10">
    <text x="100" y="195">mod=0</text>
    <text x="280" y="195">mod=1</text>
    <text x="460" y="195">mod=2</text>
  </g>
  <g text-anchor="middle" font-size="10">
    <text x="100" y="212" fill="#39ff80" font-weight="bold">Y=1</text>
    <text x="280" y="212" fill="#c8d8f0">Y=0</text>
    <text x="460" y="212" fill="#c8d8f0">Y=0</text>
  </g>

  <!-- S0 self-loop, X=0 -->
  <path d="M 80 148 C 50 100, 130 100, 120 146" stroke="#c8d8f0" fill="none" marker-end="url(#m-arr)"/>
  <text x="60"  y="92"  text-anchor="middle" fill="#c8d8f0">X=0</text>

  <!-- S0 → S1, X=1 -->
  <path d="M 140 180 L 240 180" stroke="#c8d8f0" fill="none" marker-end="url(#m-arr)"/>
  <text x="190" y="172" text-anchor="middle" fill="#c8d8f0">X=1</text>

  <!-- S1 → S0, X=1 (top curve) -->
  <path d="M 256 148 C 220 90, 140 90, 110 146" stroke="#39ff80" fill="none" marker-end="url(#m-arr-g)"/>
  <text x="180" y="80" text-anchor="middle" fill="#39ff80" font-weight="bold">X=1</text>

  <!-- S1 → S2, X=0 -->
  <path d="M 320 180 L 420 180" stroke="#c8d8f0" fill="none" marker-end="url(#m-arr)"/>
  <text x="370" y="172" text-anchor="middle" fill="#c8d8f0">X=0</text>

  <!-- S2 → S1, X=0 (bottom curve) -->
  <path d="M 440 212 C 400 268, 320 268, 300 218" stroke="#c8d8f0" fill="none" marker-end="url(#m-arr)"/>
  <text x="370" y="280" text-anchor="middle" fill="#c8d8f0">X=0</text>

  <!-- S2 self-loop, X=1 -->
  <path d="M 480 148 C 510 100, 440 100, 440 146" stroke="#c8d8f0" fill="none" marker-end="url(#m-arr)"/>
  <text x="500" y="92" text-anchor="middle" fill="#c8d8f0">X=1</text>

  <defs>
    <marker id="m-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#c8d8f0"/>
    </marker>
    <marker id="m-arr-g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#39ff80"/>
    </marker>
  </defs>

  <text x="280" y="308" text-anchor="middle" fill="#c8d8f0" font-size="10">חוק המעבר אחיד: new_mod = (2·old_mod + X) mod 3.</text>
</svg>
`,
        interviewerMindset:
`הראיין רוצה לראות **תובנת ה-state-collapse**: \`value\` יכול לגדול ללא גבול, אבל \`value mod 3\` מצומצם ל-3 ערכים בלבד. מי שמנסה לבנות מונה רחב או לאחסן את הקלט כולו — לא הבין את ה-FSM.

**מקפיץ לטובה:**
- לנמק את המעבר עם \`2·s + X\` ולא לזכור טבלה.
- להזכיר שהמצב ההתחלתי \`S0\` נכון לאפס המתמטי (אפס מתחלק ב-3).
- לציין שאותה גישה (state = remainder) עובדת לכל \`mod k\` קבוע.`,
        expectedAnswers: [
          '3', 'שלושה', 'שלוש', 'three',
          's0', 's1', 's2',
          'mod', 'modulo', 'שארית', 'remainder',
          '2*s', '2s+x', '2·s', 'msb',
          'moore',
        ],
      },
      {
        label: 'ב',
        question: 'קידוד פיזי: כמה FFs? בחר קידוד והפק את משוואות ה-Next-State וה-Output.',
        hints: [
          '3 מצבים → `⌈log₂3⌉ = 2` FFs. קידוד: `S0=00, S1=01, S2=10`. (קוד `11` בלתי-מוגדר — אפשר לטפל בו כ-don\'t-care.)',
          'נסמן Q1Q0 = מצב נוכחי, X = ביט נכנס, D1D0 = Next-State.',
          'כתוב את כל 6 השורות החוקיות + 2 don\'t-care של `11`, ועשה K-map או פישוט אלגברי.',
          'תפיק: `D1 = Q0·¬X + Q1·X`, `D0 = ¬Q1·¬Q0·X + Q0·¬X`, `Y = ¬Q1·¬Q0`.',
        ],
        answer:
`**2 פליפ-פלופים** (Q1, Q0) — קידוד \`S0=00, S1=01, S2=10\` (קוד \`11\` = don't-care).

**טבלת Next-State (Q1 Q0 X → D1 D0):**

| Q1 Q0 | X | D1 D0 | (מצב→) |
|-------|---|-------|--------|
| 0 0   | 0 | 0 0   | S0→S0  |
| 0 0   | 1 | 0 1   | S0→S1  |
| 0 1   | 0 | 1 0   | S1→S2  |
| 0 1   | 1 | 0 0   | S1→S0  |
| 1 0   | 0 | 0 1   | S2→S1  |
| 1 0   | 1 | 1 0   | S2→S2  |
| 1 1   | * | – –   | don't-care |

**אחרי פישוט (K-map):**

\`\`\`
D1 = ¬Q1·Q0·¬X  +  Q1·¬Q0·X
D0 = ¬Q1·¬Q0·X  +  Q0·¬X
Y  = ¬Q1·¬Q0          (אקטיבי במצב S0 בלבד)
\`\`\`

**צירופי שערים:** 2 ANDs + OR לכל אחד מה-Ds + AND קטן ל-Y. סה"כ ~5 שערים + 2 FFs — מעגל קצר וקומפקטי.`,
        editor: 'verilog',
        starterCode:
`module div_by_3 (
    input  wire clk,
    input  wire rst_n,    // async reset, active-low
    input  wire x,        // serial bit, MSB-first
    output wire y         // 1 ⇔ accumulated value mod 3 == 0
);

    // TODO: encode 3 states (S0=00, S1=01, S2=10)

    // TODO: state register

    // TODO: next-state logic (new_state = (2*state + x) mod 3)

    // TODO: Moore output

endmodule
`,
        answerVerilog:
`module div_by_3 (
    input  wire clk,
    input  wire rst_n,
    input  wire x,
    output wire y
);
    // 3 states. Encoding S0=00, S1=01, S2=10.
    reg [1:0] state, nstate;

    always @(*) begin
        case (state)
            2'b00:   nstate = x ? 2'b01 : 2'b00;   // S0
            2'b01:   nstate = x ? 2'b00 : 2'b10;   // S1
            2'b10:   nstate = x ? 2'b10 : 2'b01;   // S2
            default: nstate = 2'b00;               // illegal '11 → recover
        endcase
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) state <= 2'b00;
        else        state <= nstate;
    end

    assign y = (state == 2'b00);
endmodule
`,
        expectedAnswers: [
          '2', 'שני', 'two', 'log2',
          'q1', 'q0', 'd1', 'd0',
          's0', 's1', 's2',
          'case', 'always', 'posedge', 'reg', 'assign',
          '00', '01', '10',
        ],
      },
      {
        label: 'ג',
        question: 'מה צריך לקרות בריסט? ומה יקרה אם בטעות נאתחל ל-S2 (mod=2) במקום S0 (mod=0)?',
        hints: [
          'ריסט סינכרוני / אסינכרוני שמחזיר את ה-FSM ל-S0 (mod=0).',
          'אם נאתחל ל-S2 בטעות, הזרם "0" יוצא Y=0 כל הזמן עד שהמצב במקרה יחזור ל-S0 — שגיאה בכל הספירה.',
          'במכונה הזו השארית "נדבקת" — אין מעבר אוטומטי ל-S0 ללא קלט נכון.',
        ],
        answer:
`**ריסט:** חייב להחזיר ל-\`S0\` (00). זה ה-mod של ערך ריק (=0).

**אם נאתחל ל-S2 בטעות:** המעגל מתחיל לספור מ-mod=2 במקום mod=0. הזרם "0000…" יוביל:
S2 →(0)→ S1 →(0)→ S2 →(0)→ S1 → … — תקוע באוסילציה בין S1↔S2, Y לעולם לא יקפוץ ל-1 גם כשהערך האמיתי הוא 0 (מתחלק ב-3 טריוויאלית).

**הלקח:** במכונת שאריות, מצב ההתחלה הוא חלק מהמפרט. ריסט שגוי = שגיאה מתמשכת לכל הזרם, לא ניתן להתאושש "בעצמו".`,
        expectedAnswers: [
          'reset', 'ריסט', 'rst', 's0', '00',
          'initial', 'התחלה', 'אתחול',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 2 (מתחלק ב-3 FSM)',
    tags: ['fsm', 'moore', 'divisibility', 'modulo', 'sequential', 'verilog'],
    circuitRevealsAnswer: true,
    circuit: () => build(() => {
      // Direct gate-level realisation of the equations from part ב:
      //   D1 = ¬Q1·Q0·¬X  +  Q1·¬Q0·X
      //   D0 = ¬Q1·¬Q0·X  +  Q0·¬X
      //   Y  = ¬Q1·¬Q0
      const X     = h.input(120, 200, 'X');
      const clk   = h.clock(120, 540);
      const ff0   = h.ffD(820,  280, 'FF_Q0');
      const ff1   = h.ffD(820,  140, 'FF_Q1');
      const notX  = h.gate('NOT', 280, 200);
      const notQ0 = h.gate('NOT', 480, 360);
      const notQ1 = h.gate('NOT', 480, 60);
      // D1 = ¬Q1·Q0·¬X + Q1·¬Q0·X  → use 2 AND3 (synthesized as cascaded ANDs) + OR
      const a1 = h.gate('AND', 600, 100);   // ¬Q1·Q0   (intermediate)
      const a2 = h.gate('AND', 700, 130);   // (¬Q1·Q0)·¬X
      const a3 = h.gate('AND', 600, 180);   // Q1·¬Q0   (intermediate)
      const a4 = h.gate('AND', 700, 210);   // (Q1·¬Q0)·X
      const orD1 = h.gate('OR', 780, 170);
      // D0 = ¬Q1·¬Q0·X + Q0·¬X
      const b1 = h.gate('AND', 600, 320);   // ¬Q1·¬Q0
      const b2 = h.gate('AND', 700, 350);   // (¬Q1·¬Q0)·X
      const b3 = h.gate('AND', 700, 410);   // Q0·¬X
      const orD0 = h.gate('OR', 780, 380);
      // Y = ¬Q1·¬Q0   (reuse b1)
      const Y = h.output(1020, 460, 'Y');
      return {
        nodes: [X, clk, ff0, ff1, notX, notQ0, notQ1, a1, a2, a3, a4, orD1, b1, b2, b3, orD0, Y],
        wires: [
          h.wire(X.id,  notX.id, 0),
          h.wire(ff0.id, notQ0.id, 0),
          h.wire(ff1.id, notQ1.id, 0),

          // a1 = ¬Q1 · Q0
          h.wire(notQ1.id, a1.id, 0),
          h.wire(ff0.id,   a1.id, 1),
          // a2 = a1 · ¬X
          h.wire(a1.id,    a2.id, 0),
          h.wire(notX.id,  a2.id, 1),

          // a3 = Q1 · ¬Q0
          h.wire(ff1.id,   a3.id, 0),
          h.wire(notQ0.id, a3.id, 1),
          // a4 = a3 · X
          h.wire(a3.id,    a4.id, 0),
          h.wire(X.id,     a4.id, 1),

          // D1 = a2 + a4
          h.wire(a2.id, orD1.id, 0),
          h.wire(a4.id, orD1.id, 1),
          h.wire(orD1.id, ff1.id, 0),

          // b1 = ¬Q1 · ¬Q0
          h.wire(notQ1.id, b1.id, 0),
          h.wire(notQ0.id, b1.id, 1),
          // b2 = b1 · X
          h.wire(b1.id, b2.id, 0),
          h.wire(X.id,  b2.id, 1),
          // b3 = Q0 · ¬X
          h.wire(ff0.id, b3.id, 0),
          h.wire(notX.id, b3.id, 1),
          // D0 = b2 + b3
          h.wire(b2.id, orD0.id, 0),
          h.wire(b3.id, orD0.id, 1),
          h.wire(orD0.id, ff0.id, 0),

          // Clocks
          h.wire(clk.id, ff0.id, 1),
          h.wire(clk.id, ff1.id, 1),

          // Output Y = ¬Q1·¬Q0 = b1
          h.wire(b1.id, Y.id, 0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #2011 — Rising-edge detector (slide 4)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'rising-edge-detector',
    difficulty: 'medium',
    title: 'גלאי קצה עולה לפי דיאגרמת גלים',
    intro:
`לפי הגלים: \`output\` נשאר 0 חוץ מפולס ב-1 שמופיע **מיד אחרי קצה עולה** של \`input\`.

אחות-תאומה של \`falling-edge-detector\` (2001), הפעם הצד השני של ה-edge.`,
    schematic: `
<svg viewBox="0 0 480 200" xmlns="http://www.w3.org/2000/svg" direction="ltr" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="clk, input, output (rising-edge detector)">
  <text x="36" y="12" fill="#f0d080" font-size="10" font-weight="bold">t=0</text>
  <line x1="50" y1="16" x2="50" y2="190" stroke="#806040" stroke-width="0.6" stroke-dasharray="2 3"/>
  <polygon points="50,22 46,14 54,14" fill="#f0d080"/>

  <text x="0" y="34" fill="#c8d8f0">clk</text>
  <path d="M 50 46 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25 v -16 h 25 v 16 h 25"
        stroke="#f0d080" stroke-width="1.6" fill="none"/>

  <text x="0" y="100" fill="#c8d8f0">input</text>
  <path d="M 50 110 h 125 v -22 h 200 v 22 h 85"
        stroke="#80b0e0" stroke-width="1.6" fill="none"/>

  <text x="0" y="166" fill="#c8d8f0">output</text>
  <path d="M 50 178 h 125 v -22 h 25 v 22 h 285"
        stroke="#80f0a0" stroke-width="1.6" fill="none"/>
</svg>`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'תכנן את המעגל. רכיבים מינימליים + ביטוי בוליאני.',
        hints: [
          'output קופץ ל-1 בקצה עולה של input → rising-edge detector.',
          'צריך לזכור את הערך הקודם — D-FF.',
          '\\\`output = ¬Q ∧ input\\\` (FF יחיד) — או \\\`output = curr ∧ ¬prev\\\` (שני FFים, סינכרוני נקי).',
        ],
        answer:
`**Rising-edge detector.** \`output = curr ∧ ¬prev\`.

**FF יחיד** (קלט אסינכרוני): D-FF + NOT + AND.

**שני FFים** (קלט סינכרוני, גרסת הקנבס):
- FF1 דוגם את \`input\` → \`curr\`
- FF2 דוגם את \`curr\` → \`prev\` (cycle אחורה)
- \`output = curr ∧ ¬prev\`

\`output\` עולה לקלוק יחיד מיד אחרי שה-input מתחלף מ-0 ל-1.

**הבדל מ-falling:** רק NOT עובר מ-input ל-prev (או הפוך). הסכמה זהה במספר הרכיבים.`,
        interviewerMindset:
`בודק שאתה מבחין בין **אסינכרוני** ל-**סינכרוני**.

**סיגנל חזק:** לשאול "האם d_in סינכרוני לאותו clk?" לפני שאתה מתחיל. אם **לא**, יש להוסיף שני FFים-סינכרוניזטור לפני הגלאי, אחרת אתה צפוי לפולסים פסולים בגלל metastability.

**שאלת המשך:** "ומה אם רוצים גלאי על **שני** הקצוות (rising + falling) — toggle detector?" → \`output = curr ⊕ prev\`.`,
        expectedAnswers: [
          'rising', 'rising edge', 'rising-edge', 'positive edge',
          'קצה עולה', 'גלאי קצה עולה', 'detector',
          'curr & ~prev', 'curr ∧ ¬prev',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 4 (גלאי קצה עולה)',
    tags: ['ff', 'edge-detector', 'rising-edge', 'sequential', 'design', 'verilog'],
    circuit: () => build(() => {
      const inp   = h.input(140, 220, 'input');
      const clk   = h.clock(140, 540);
      const ffCur = h.ffD(380, 220, 'FF_curr');
      const ffPrv = h.ffD(700, 220, 'FF_prev');
      const inv   = h.gate('NOT', 700, 400);   // ¬prev
      const and_  = h.gate('AND', 980, 320);
      const out   = h.output(1220, 320, 'output');
      inp.fixedValue = 0;
      // Mirror the waveform: LOW → HIGH (held) → LOW. Pulse appears
      // one clock after the rising edge (FF1 buffer delay) at the AND.
      inp.stepValues = [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0];
      return {
        nodes: [inp, clk, ffCur, ffPrv, inv, and_, out],
        wires: [
          h.wire(inp.id,   ffCur.id, 0),
          h.wire(clk.id,   ffCur.id, 1),
          h.wire(ffCur.id, ffPrv.id, 0),
          h.wire(clk.id,   ffPrv.id, 1),
          h.wire(ffPrv.id, inv.id,   0),    // ¬prev
          h.wire(ffCur.id, and_.id,  0),    // curr
          h.wire(inv.id,   and_.id,  1),    // ¬prev
          h.wire(and_.id,  out.id,   0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #2012 — Divide clock frequency by 2 (slide 5)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'clock-divide-by-2',
    difficulty: 'easy',
    title: 'מחלק תדר ב-2 — D-FF עם feedback',
    intro:
`נתון שעון בעל תדר כלשהו. בנו רכיב — באמצעות **D-FF** ושערים לוגיים — שמייצר שעון חדש בעל **חצי מהתדר** ו-**50% duty cycle**.`,
    schematic: `
<svg viewBox="0 0 480 160" xmlns="http://www.w3.org/2000/svg" direction="ltr" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="clk_in and clk_out waveforms (clock divided by 2)">
  <text x="36" y="14" fill="#f0d080" font-size="10" font-weight="bold">t=0</text>
  <line x1="50" y1="18" x2="50" y2="150" stroke="#806040" stroke-width="0.6" stroke-dasharray="2 3"/>
  <polygon points="50,24 46,16 54,16" fill="#f0d080"/>

  <text x="0" y="50" fill="#c8d8f0">clk_in</text>
  <path d="M 50 62 v -20 h 25 v 20 h 25 v -20 h 25 v 20 h 25 v -20 h 25 v 20 h 25 v -20 h 25 v 20 h 25 v -20 h 25 v 20 h 25 v -20 h 25 v 20 h 25 v -20 h 25 v 20 h 25 v -20 h 25 v 20 h 25"
        stroke="#f0d080" stroke-width="1.6" fill="none"/>
  <text x="410" y="50" fill="#c8a060" font-size="10">תדר f</text>

  <text x="0" y="110" fill="#c8d8f0">clk_out</text>
  <path d="M 50 122 v -20 h 50 v 20 h 50 v -20 h 50 v 20 h 50 v -20 h 50 v 20 h 50 v -20 h 50 v 20 h 30"
        stroke="#80f0a0" stroke-width="1.6" fill="none"/>
  <text x="410" y="110" fill="#80f0a0" font-size="10">תדר f/2</text>

  <!-- marker lines showing each clk_out period spans 2 clk_in periods -->
  <line x1="100" y1="76" x2="100" y2="100" stroke="#a0a0c0" stroke-width="0.5" stroke-dasharray="1 2"/>
  <line x1="200" y1="76" x2="200" y2="100" stroke="#a0a0c0" stroke-width="0.5" stroke-dasharray="1 2"/>
  <line x1="300" y1="76" x2="300" y2="100" stroke="#a0a0c0" stroke-width="0.5" stroke-dasharray="1 2"/>
  <line x1="400" y1="76" x2="400" y2="100" stroke="#a0a0c0" stroke-width="0.5" stroke-dasharray="1 2"/>
</svg>`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'תכנן את המעגל. כמה D-FFים וכמה שערים צריך?',
        hints: [
          'אם ה-Q של ה-FF "מתהפך" כל קצה עולה של ה-clock המקורי, אז הוא משתנה פעם אחת לכל שני clocks → תדר חצי.',
          'איך גורמים ל-Q להתהפך? \\\`D = ¬Q\\\` (= \\\`Q\'\\\` שכבר יש ל-FF). חבר את \\\`Q\'\\\` חזרה ל-\\\`D\\\`.',
          'התוצאה: D-FF אחד, אפס שערים נוספים (ה-\\\`Q\'\\\` הוא יציאה מובנית של ה-FF). אם אין \\\`Q\'\\\` — NOT אחד.',
        ],
        answerSchematic: `
<svg viewBox="0 0 720 400" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', 'Consolas', monospace" font-size="13"
     role="img" aria-label="D-FF with Q-bar feedback to D: clk divider by 2">
  <defs>
    <linearGradient id="dffBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#143049"/>
      <stop offset="1" stop-color="#0a1825"/>
    </linearGradient>
    <marker id="dffArrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/>
    </marker>
    <marker id="dffArrY" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#f0d080"/>
    </marker>
    <marker id="dffArrO" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff8060"/>
    </marker>
  </defs>

  <!-- Title banner -->
  <rect x="0" y="0" width="720" height="46" fill="#0c1a28"/>
  <text direction="ltr" x="360" y="29" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    D = ¬Q  ⇒  Q toggles every clk_in edge  ⇒  clk_out has half the frequency
  </text>

  <!-- D-FF body -->
  <rect x="280" y="120" width="220" height="180" rx="10" fill="url(#dffBody)" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="390" y="110" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="16">D-FF</text>

  <!-- Pin labels inside the box (LTR-safe) -->
  <text direction="ltr" x="295" y="174" fill="#c8d8f0" font-weight="bold">D</text>
  <text direction="ltr" x="295" y="264" fill="#c8d8f0" font-weight="bold">CLK</text>
  <text direction="ltr" x="485" y="174" text-anchor="end" fill="#c8d8f0" font-weight="bold">Q</text>
  <text direction="ltr" x="485" y="264" text-anchor="end" fill="#c8d8f0" font-weight="bold">Q'</text>

  <!-- Triangle on CLK pin (edge-trigger marker) -->
  <polygon points="280,256 290,260 280,264" fill="#0a1825" stroke="#80d4ff" stroke-width="1.4"/>

  <!-- ── clk_in → CLK ── -->
  <text direction="ltr" x="100" y="256" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="14">clk_in</text>
  <line x1="160" y1="260" x2="278" y2="260" stroke="#f0d080" stroke-width="1.8" marker-end="url(#dffArrY)"/>

  <!-- ── Q → clk_out ── -->
  <line x1="500" y1="170" x2="610" y2="170" stroke="#80f0a0" stroke-width="1.8" marker-end="url(#dffArrG)"/>
  <text direction="ltr" x="660" y="166" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">clk_out</text>
  <text direction="ltr" x="660" y="182" text-anchor="middle" fill="#80a080" font-size="10">(= Q)</text>

  <!-- ── Feedback path: Q' → down → left → up → D ──
       Q' at (500,260) → right (560,260) → down (560,350) →
       left (220,350)  → up   (220,170)  → right → D at (280,170)
  -->
  <line x1="500" y1="260" x2="560" y2="260" stroke="#ff8060" stroke-width="1.8"/>
  <line x1="560" y1="260" x2="560" y2="350" stroke="#ff8060" stroke-width="1.8"/>
  <line x1="560" y1="350" x2="220" y2="350" stroke="#ff8060" stroke-width="1.8"/>
  <line x1="220" y1="350" x2="220" y2="170" stroke="#ff8060" stroke-width="1.8"/>
  <line x1="220" y1="170" x2="278" y2="170" stroke="#ff8060" stroke-width="1.8" marker-end="url(#dffArrO)"/>

  <!-- Feedback callout -->
  <text direction="ltr" x="390" y="378" text-anchor="middle" fill="#ff8060" font-weight="bold" font-size="13">
    feedback wire:  Q'  →  D
  </text>
</svg>`,
        answer:
`**D-FF יחיד עם feedback מ-\`Q\'\` ל-\`D\`** (ראה הסכמה למעלה).

**איך זה עובד:**
- כל קצה עולה של \`clk_in\`, ה-FF דוגם את \`D\`, שמחובר ל-\`Q\'\`.
- \`Q\` הופך לערך ההפוך שלו: 0→1→0→1...
- בקצה כל \`clk_in\` (2 קצוות = period שלם של \`clk_out\`), \`Q\` עשה toggle אחד.
- ⇒ \`clk_out\` משלים period אחד כל **שני** \`clk_in\` periods.
- ⇒ תדר \`clk_out\` = \`f / 2\`, duty cycle = 50%.

**רכיבים:** 1 D-FF (משתמש ב-\`Q\'\` כפלט המובנה). אם ה-FF שלך לא מספק \`Q\'\` → 1 NOT.

**הכללה — \`f / 2^k\`:** שרשור של \`k\` FF-toggleים, כל אחד דוגם את ה-\`Q\` של הקודם כ-clock. אבל זה דורש שכל FF משתמש ב-\`Q\` של קודמו כ-CLK (ripple counter) — לא toggleing על אותו clock.

**הערה חשובה:** ב-Verilog/חומרה אמיתית כדאי לעשות זאת **סינכרוני** עם ספירת bits של מונה, לא ripple, כדי להימנע מ-skew בין FFים.`,
        interviewerMindset:
`שאלת אבטחה. סינון מהיר.

1. **המועמד שיודע**: עונה תוך 10 שניות, "D=Q\', זה toggle" — מספיק.
2. **המועמד שמסבך**: מצייר 2 FFים + ספירה. **שאלת המשך**: "אתה יכול ב-FF יחיד?"
3. **הכשל הנפוץ**: שכחה של \`Q\'\` כפלט מובנה ב-FF.

**שאלת המשך טובה:** "ובלי \`Q\'\`?" — תשובה: NOT אחד מ-\`Q\` חזרה ל-\`D\`. זה אותו עיקרון, פעם אחת מבוטא חיצונית.

**שאלת אסיפה (asynchronous):** "אם נחבר רק \`D=1\` קבוע?" — אז \`Q\` יהיה 1 לעולם אחרי הקצה הראשון. לא יוצר toggle. ה-trick הוא ש-\`D\` חייב להיות **תלוי ב-\`Q\` הקודם**.`,
        expectedAnswers: [
          'q\'', 'qnot', 'q bar', 'not q', '~q', '¬q',
          'd-ff', 'd ff', 'd_ff', 'flip-flop',
          'toggle', 'feedback', 'משוב',
          '1', 'one', 'אחד',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 5 (מחלק תדר ב-2)',
    tags: ['ff', 'clock-divider', 'toggle', 'sequential', 'verilog'],
    circuit: () => build(() => {
      // D-FF with Q' fed back to D, producing clk/2 on Q.
      // The FF_SLOT in this engine exposes both Q (out0) and ~Q (qNot) but
      // wiring uses the dedicated NOT gate so the schematic is explicit.
      const clk    = h.clock(120, 280);
      const ff     = h.ffD(380, 280, 'FF');
      const inv    = h.gate('NOT', 620, 380);   // ¬Q
      const oQ     = h.output(620, 220, 'clk_out (Q)');
      const oQnot  = h.output(840, 380, 'Q\' (= ¬Q)');
      return {
        nodes: [clk, ff, inv, oQ, oQnot],
        wires: [
          h.wire(clk.id, ff.id, 1, 0, { isClockWire: true }),
          h.wire(ff.id,  inv.id, 0),       // Q → NOT
          h.wire(inv.id, ff.id,  0),       // ¬Q → D (feedback)
          h.wire(ff.id,  oQ.id,  0),
          h.wire(inv.id, oQnot.id, 0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #2013 — Counter modulo 5 (from generic counter-to-7) (slide 6)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'counter-mod5-from-mod8',
    difficulty: 'easy',
    title: 'מונה עד 5 ממונה עד 7 + שערים',
    intro:
`באמצעות **\`counter\`** שסופר עד 7 (3 ביטים: 0..7), רכיבי זיכרון ושערים לוגיים — ממשו **\`counter\` עד 5** (0,1,2,3,4 → חזרה ל-0).

הרעיון: לאתר ידנית כשהמונה מגיע ל-5 ולדחוף אותו חזרה לאפס לפני שהוא ימשיך הלאה.`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'תכנן את המעגל. אילו ביטים של המונה צריך לבדוק כדי לזהות "מגיע ל-5"? מתי לאפס?',
        hints: [
          'הערך 5 ב-3 ביטים = \\\`101\\\` = \\\`Q2 Q1 Q0\\\`. נסמן זאת באמצעות AND/NOT.',
          'אבל אם נמתין שהמונה ייתן 5 ואז נאפס "בקלוק הבא" — אז יראה ספירה 0,1,2,3,4,**5**,0,1... והערך 5 הופיע. **לא רצוי.**',
          'הפתרון: לזהות \\\`Q == 4\\\` (= \\\`100\\\`), שזה הערך **לפני** 5. בקצה הבא, במקום \\\`+1\\\`, נאפס.',
          'במונה סינכרוני עם LOAD: כש-Q==4, אסרט \\\`LOAD\\\` ו-\\\`DATA=0\\\`. בקצה הבא הוא יטען 0.',
          'במונה סינכרוני עם CLR: כש-Q==4, אסרט \\\`CLR\\\`. אבל לא לרוב המונים יש sync CLR — תלוי במימוש.',
        ],
        answer:
`**זיהוי + מנגנון איפוס סינכרוני.**

\`\`\`
detect = Q2 ∧ ¬Q1 ∧ ¬Q0       (Q == 4 = 100)
\`\`\`

כש-\`detect = 1\`, נטען 0 לתוך המונה בקצה הבא במקום להגדיל. הפלט שיוצא: \`0,1,2,3,4,0,1,2,3,4,...\` בדיוק.

**למה לזהות 4 ולא 5?**
- מונה רגיל עושה \`Q_next = Q + 1\` בכל clock.
- אם נזהה \`Q == 5\` ואז נאפס — הערך 5 כבר היה בפלט לקלוק שלם. הספירה הופכת ל-\`0,1,2,3,4,5,0,1,...\`. **שגוי** (יש 6 ערכים).
- זיהוי \`Q == 4\` והחלפת התוספה באיפוס: ה-Q הבא הוא 0, לא 5. **נכון**.

**רכיבים:**
- 1 \`counter\` (3-bit).
- 1 AND (Q2 ∧ ¬Q1 ∧ ¬Q0) — או \`Q2 ∧ NOR(Q1, Q0)\`.
- 2 NOT (ל-\`¬Q1\` ו-\`¬Q0\`).
- חיבור ל-\`LOAD\` של המונה עם \`DATA = 0\`.

**שאלת המשך:** "מונה עד **N**"? אותו רעיון — זיהוי \`Q == N-1\` (השלב אחרי האחרון התקין) ⇒ load 0.`,
        interviewerMindset:
`שאלה קלאסית, בעיקר לבדיקה של "off-by-one" — האם המועמד יודע לזהות \`Q == N-1\` (לא \`Q == N\`)?

**הסיגנל החזק:** מועמד שמסביר "אסור שערך N יופיע בפלט; אם נזהה N ואז נאפס, הספירה תהיה ארוכה ב-1 מהרצוי". זה ניתוח אינוואריאנטים בסיסי.

**שאלת המשך:** "ומה אם המונה הוא **אסינכרוני** (async CLR)?" — אז זיהוי \`Q == N\` שמיד מאפס באסינכרוני עובד, כי ה-spike של N הוא glitch קצר (לא יציב לקלוק). אבל זה רע ל-STA — מועדף הסינכרוני.`,
        expectedAnswers: [
          '101', '100', 'Q == 4', 'Q==4', 'q2', 'q1', 'q0',
          'load', 'CLR', 'clear', 'איפוס',
          'detect', 'זיהוי', '4', '5',
          'sync', 'סינכרוני',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 6 (מונה mod 5)',
    tags: ['counter', 'modulo', 'sequential', 'verilog', 'off-by-one'],
    circuit: () => build(() => {
      // 3-bit COUNTER with synchronous CLR triggered when q == 4 (=100).
      // detect = Q2 ∧ ¬Q1 ∧ ¬Q0   → drives CLR.
      const clk    = h.clock(140, 460);
      const enOne  = h.input(140, 200, 'EN=1');  enOne.fixedValue = 1;
      const cnt    = h.block('COUNTER', 460, 280, { bitWidth: 3, label: 'CNT (mod 5)' });
      // Bit slices of Q for the detect logic.
      const split  = h.block('SPLIT', 680, 280, {
        inBits: 3, slicesSpec: '0, 1, 2', label: 'SPLIT Q',
      });
      const notQ1  = h.gate('NOT', 880, 320);
      const notQ0  = h.gate('NOT', 880, 380);
      // detect = Q2 ∧ ¬Q1 ∧ ¬Q0 (cascaded ANDs)
      const a1     = h.gate('AND', 1040, 320);   // ¬Q1 ∧ ¬Q0
      const detect = h.gate('AND', 1180, 280);   // Q2 ∧ (¬Q1 ∧ ¬Q0)
      const oQ     = h.output(900, 160, 'Q (count)');
      const oDet   = h.output(1340, 280, 'detect (=4)');
      return {
        nodes: [clk, enOne, cnt, split, notQ1, notQ0, a1, detect, oQ, oDet],
        wires: [
          // COUNTER pins: EN(0), LOAD(1), DATA(2), CLR(3), CLK(4)
          h.wire(enOne.id, cnt.id, 0),                                     // EN
          h.wire(detect.id, cnt.id, 3),                                    // CLR
          h.wire(clk.id, cnt.id, 4, 0, { isClockWire: true }),             // CLK
          // Q → SPLIT
          h.wire(cnt.id, split.id, 0),
          // Q2 → AND(detect)  (split out2 = bit 2)
          h.wire(split.id, detect.id, 0, 2),
          // Q1 → NOT
          h.wire(split.id, notQ1.id, 0, 1),
          // Q0 → NOT
          h.wire(split.id, notQ0.id, 0, 0),
          // ¬Q1 ∧ ¬Q0
          h.wire(notQ1.id, a1.id, 0),
          h.wire(notQ0.id, a1.id, 1),
          // detect = Q2 ∧ (¬Q1 ∧ ¬Q0)
          h.wire(a1.id, detect.id, 1),
          // Observability
          h.wire(cnt.id, oQ.id, 0),
          h.wire(detect.id, oDet.id, 0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #2014 — XOR + D-FF self-feedback (slide 10)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'xor-dff-self-feedback',
    difficulty: 'medium',
    title: 'XOR + D-FF עם משוב עצמי — מה הפלט?',
    intro:
`נתון המעגל הבא: ה-XOR מקבל את הקלט \`a\` ואת ה-\`Q\` של ה-D-FF, והפלט שלו חוזר חזרה ל-\`D\`. כלומר \`D = a ⊕ Q\` (ראה הסכמה).

**א.** מה יקרה עבור \`a = 1\`?
**ב.** מה יקרה עבור \`a = 0\`?
**ג.** מה יקרה אם יהיה רכיב **דיליי** במוצא?`,
    schematic: `
<svg viewBox="0 0 640 280" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="12"
     role="img" aria-label="XOR + D-FF circuit with self-feedback: D = a XOR Q">
  <defs>
    <linearGradient id="fbBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#143049"/><stop offset="1" stop-color="#0a1825"/>
    </linearGradient>
    <marker id="fbArrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
    <marker id="fbArrB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80d4ff"/></marker>
    <marker id="fbArrO" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff8060"/></marker>
  </defs>

  <!-- a input -->
  <text direction="ltr" x="40" y="86" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="14">a</text>
  <line x1="60" y1="90" x2="160" y2="90" stroke="#f0d080" stroke-width="1.8" marker-end="url(#fbArrB)"/>

  <!-- XOR gate (D-shape, AND with bulge + curve) -->
  <path d="M 155 50 Q 175 90 155 130" stroke="#80d4ff" stroke-width="1.6" fill="none"/>
  <path d="M 165 50 Q 205 65 240 90 Q 205 115 165 130 Q 188 90 165 50 Z"
        fill="url(#fbBody)" stroke="#80d4ff" stroke-width="1.6"/>
  <text direction="ltr" x="194" y="96" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">⊕</text>

  <!-- XOR output → D-FF.D -->
  <line x1="240" y1="90" x2="340" y2="90" stroke="#80d4ff" stroke-width="1.8" marker-end="url(#fbArrB)"/>
  <text direction="ltr" x="290" y="84" text-anchor="middle" fill="#80d4ff" font-size="10">D</text>

  <!-- D-FF body -->
  <rect x="340" y="50" width="140" height="120" rx="8" fill="url(#fbBody)" stroke="#80d4ff" stroke-width="1.8"/>
  <text direction="ltr" x="410" y="38" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">D-FF</text>
  <text direction="ltr" x="354" y="96" fill="#c8d8f0" font-weight="bold">D</text>
  <text direction="ltr" x="354" y="146" fill="#c8d8f0" font-weight="bold">CLK</text>
  <text direction="ltr" x="466" y="96" text-anchor="end" fill="#c8d8f0" font-weight="bold">Q</text>
  <polygon points="340,140 348,144 340,148" fill="#0a1825" stroke="#80d4ff" stroke-width="1.4"/>

  <!-- Q → output -->
  <line x1="480" y1="90" x2="580" y2="90" stroke="#80f0a0" stroke-width="1.8" marker-end="url(#fbArrG)"/>
  <text direction="ltr" x="610" y="86" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">Q</text>

  <!-- clk input -->
  <text direction="ltr" x="340" y="220" text-anchor="middle" fill="#f0d080" font-weight="bold">clk</text>
  <line x1="360" y1="216" x2="360" y2="170" stroke="#f0d080" stroke-width="1.6"/>

  <!-- Feedback loop: Q → down → left → up → XOR (in1) -->
  <line x1="500" y1="90" x2="500" y2="240" stroke="#ff8060" stroke-width="1.8"/>
  <line x1="500" y1="240" x2="140" y2="240" stroke="#ff8060" stroke-width="1.8"/>
  <line x1="140" y1="240" x2="140" y2="110" stroke="#ff8060" stroke-width="1.8"/>
  <line x1="140" y1="110" x2="160" y2="110" stroke="#ff8060" stroke-width="1.8" marker-end="url(#fbArrO)"/>
  <text direction="ltr" x="320" y="258" text-anchor="middle" fill="#ff8060" font-size="11" font-weight="bold">feedback: Q → XOR.in1</text>

  <!-- "D = a XOR Q" annotation -->
  <text direction="ltr" x="290" y="22" text-anchor="middle" fill="#a0c0e0" font-size="11" font-style="italic">D = a ⊕ Q</text>
</svg>`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'מה קורה כש-\\\`a = 1\\\`? כיצד מתפתח \\\`Q\\\` בקלוקים עוקבים?',
        hints: [
          'בכל קצה עולה: \\\`Q_new = a ⊕ Q_old\\\`. עם \\\`a=1\\\` → \\\`Q_new = ¬Q_old\\\`.',
          'זהו מעגל **toggle** — Q מתחלף כל קלוק: 0 → 1 → 0 → 1 → ...',
          'תדר ה-Q הוא **חצי** מתדר ה-clk → זה למעשה מחלק תדר ב-2.',
          'מעגל זה זהה לגרסה החליפית של 2012 (clk-div-by-2 עם NOT) — XOR עם \\\`a=1\\\` שקול ל-NOT.',
        ],
        answer:
`**עם \`a = 1\` → המעגל הוא toggle/clk-div-by-2.**

| קלוק | Q (לפני edge) | D = 1 ⊕ Q | Q (אחרי edge) |
|-------|---------------|-----------|----------------|
| init  | 0             | 1         | —              |
| 1     | 0             | 1         | **1**          |
| 2     | 1             | 0         | **0**          |
| 3     | 0             | 1         | **1**          |
| 4     | 1             | 0         | **0**          |

\`Q\` מתחלף כל קלוק → תדר \`Q = f_clk / 2\`, 50% duty cycle.

**זה בעצם הפתרון של 2012**, רק שמומש כאן עם XOR במקום NOT. הסיבה: \`x ⊕ 1 = ¬x\` (כלל בסיסי של XOR). אז \`D = Q ⊕ 1 = ¬Q\` — בדיוק הפידבק של מחלק תדר ב-2.

**שאלת המשך טבעית:** מה אם \`a\` משתנה תוך כדי? — \`Q\` ינוע בהתאם, כי \`D\` משתנה. למשל אם \`a = 1010...\` (מתחלף), \`Q\` ייעצר ויתחיל לסירוגין.`,
        expectedAnswers: [
          'toggle', 'מתחלף', 'מתהפך', 'divide', 'מחלק',
          'divide by 2', 'div 2', 'חצי', 'half',
          '0,1,0,1', '1,0,1,0', 'oscillate',
          'q toggles', 'q flips',
        ],
      },
      {
        label: 'ב',
        question: 'מה קורה כש-\\\`a = 0\\\`? מה הערך של \\\`Q\\\` לאורך זמן?',
        hints: [
          'עם \\\`a = 0\\\`: \\\`D = 0 ⊕ Q = Q\\\` (XOR עם 0 משאיר את הקלט).',
          '⇒ \\\`Q_new = Q_old\\\` בכל קלוק. הערך **לא משתנה**.',
          'אם \\\`Q\\\` התחיל כ-0, יישאר 0. אם הצלחת להעלות אותו ל-1 פעם (למשל ע"י reset-set), יישאר 1.',
        ],
        answer:
`**עם \`a = 0\` → \`Q\` "נדבק" בערכו האחרון.**

\`D = 0 ⊕ Q = Q\` (XOR עם אפס הוא identity). אז כל קלוק: \`Q_new = Q\`.

**התנהגות:**
- אם Q התחיל ב-0 → יישאר 0 לעולם.
- אם Q היה 1 (למשל מאיתחול קודם) → יישאר 1 לעולם.

**זוהי "תאית זיכרון" יעילה** — שומרת ביט. דומה ל-D-FF עם enable=0, אבל ע"י משוב במקום פין EN נפרד.

**שאלת המשך:** "ואם נחלף בין \`a=0\` ל-\`a=1\`?" — נקבל את "T-FF": \`a=1\` יוצר toggle, \`a=0\` משמר. זוהי בעצם הגדרת T-FF (Toggle FF) — מעגל קלאסי.

\`\`\`
    a       Q (התנהגות)
   ─────   ─────────────
    1      toggle
    0      hold
\`\`\``,
        expectedAnswers: [
          'stays', 'נשאר', 'hold', 'hold value',
          'q = q', 'q stays', 'q remains',
          'memory', 'זיכרון',
          'no change', 'לא משתנה',
          't-ff', 't ff', 'toggle ff',
        ],
      },
      {
        label: 'ג',
        question: 'מה קורה אם יהיה רכיב **דיליי** (combinational delay) במוצא — בין ה-Q לפידבק?',
        hints: [
          'דיליי קומבינטורי במשוב מאריך את ה-setup-time של ה-D-FF.',
          'כשעולה ה-edge הבא, ה-D עוד לא הסתדר (Q_new = a ⊕ Q_old_delayed) → setup violation אם הדיליי גדול מ-(t_clk - t_setup - t_clk-to-Q).',
          'אם הדיליי קטן — אין בעיה, המעגל עובד כרגיל.',
          'אם הדיליי גדול — metastability, שגיאות פלט. ייתכן ש-Q לא יתעדכן בכלל באותו edge.',
          'התובנה: **מעגלים עם פידבק עצמי רגישים מאוד לעיכובים**. זוהי הסיבה ל-static-timing-analysis ולמכפיל setup-time גדול במעגלים מורכבים.',
        ],
        answer:
`**הדיליי מצמצם את ה-timing margin.**

זמן מינימלי בין שני קצוות עולים של ה-clk:
\`t_clk ≥ t_clk-to-Q + t_delay + t_XOR + t_setup\`

אם הדיליי קטן → המעגל עובד בלי שינוי. \`Q\` עדיין יתחלף בכל קלוק (עבור \`a=1\`).

אם הדיליי גדול מ-\`t_clk - t_clk-to-Q - t_XOR - t_setup\`:
- **setup violation** — ה-D לא יציב מספיק זמן לפני הקצה.
- ה-FF ייכנס למצב **metastability** (יוצא חצי-1, חצי-0, לבסוף יתייצב באקראי).
- ייתכן שהמעגל יספיק רק חלק מהקלוקים. הספירה שלו תיהרג.

**תובנה לרמת מערכת:**
- מעגלים עם **פידבק עצמי קומבינטורי** (Q → לוגיקה → D) רגישים מאוד לעיכובים פנימיים.
- STA (Static Timing Analysis) דורש לחשב את הנתיב הקריטי — כאן זה הנתיב \`Q → XOR → D\`.
- בתכן מעשי: דיליי גדול במוצא = **להוריד את התדר** או **לחתוך את הלוגיקה ל-pipeline** (D-FF נוסף באמצע).

**שאלת המשך אהובה למראיין:** "ומה ב-zero-delay model (Verilog ללא #X)?" — שם הדיליי הוא 0 אידיאלי, אז המעגל תמיד עובד. אבל בחומרה אמיתית הדיליי שונה מ-0 ויש להתחשב בו.`,
        expectedAnswers: [
          'setup', 'hold',
          'timing', 'תזמון',
          'violation', 'הפרה',
          'metastability', 'מטאיציבות',
          'critical path', 'נתיב קריטי',
          'sta', 'static timing analysis',
          'frequency', 'תדר',
          'pipeline',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 10 (XOR + D-FF self-feedback)',
    tags: ['ff', 'feedback', 'toggle', 't-ff', 'xor', 'metastability', 'timing', 'sequential'],
    circuit: () => build(() => {
      // a → XOR.in0
      // Q → XOR.in1 (feedback)
      // XOR → D-FF.D
      // clk → D-FF.CLK
      // D-FF.Q → output
      const clk = h.clock(140, 360);
      const a   = h.input(140, 200, 'a');  a.fixedValue = 1;   // default toggle
      const xor = h.gate('XOR', 360, 240);
      const ff  = h.ffD(580, 240, 'D-FF');
      const out = h.output(820, 200, 'Q');
      return {
        nodes: [clk, a, xor, ff, out],
        wires: [
          // a → XOR.in0
          h.wire(a.id, xor.id, 0),
          // Q (feedback) → XOR.in1
          h.wire(ff.id, xor.id, 1),
          // XOR → D
          h.wire(xor.id, ff.id, 0),
          // clk → CLK
          h.wire(clk.id, ff.id, 1, 0, { isClockWire: true }),
          // Q → output
          h.wire(ff.id, out.id, 0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #2015 — mod-8 counter from a given mod-6 counter (slide 15)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'counter-mod8-from-mod6',
    difficulty: 'medium',
    title: 'מונה עד 7 מתוך מונה עד 5',
    intro:
`באמצעות \`counter\` שסופר עד 5 (mod-6 — מחזיר ל-0 אחרי 5), ובאמצעות שערים לוגיים
ורכיבי זיכרון נוספים, ממש \`counter\` שסופר עד 7 (mod-8 — 0,1,...,7,0,1,...).

המפתח: שטח המצבים של mod-6 הוא 6 ערכים בלבד — חסרים 6 ו-7. צריך להוסיף סיבית
חיצונית שמרחיבה את המרחב ל-12 מצבים, מהם בוחרים 8 בסדר הנכון.`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'תכנן את המעגל. כמה רכיבי זיכרון נוספים? איזו לוגיקה?',
        hints: [
          'מצב מורחב: (E, c) כאשר E הוא D-FF נוסף וc הוא הפלט של mod-6.',
          'מיפוי: (E=0, c=0..5) → Y=0..5, (E=1, c=0..1) → Y=6..7. סך הכל 8 מצבים.',
          'מתי E מתחלף? כאשר c=5 ב-E=0 (עוברים ל-6), וכאשר c=1 ב-E=1 (חוזרים ל-0).',
          'מתי לאלץ את ה-mod-6 לאפס (CLR)? **באותם** המצבים: \\\`force_clr = (c==5 ∧ ¬E) ∨ (c==1 ∧ E)\\\`. אחרת ה-mod-6 ימשיך טבעית.',
          'פלט: \\\`Y[0] = c[0]\\\`, \\\`Y[1] = c[1] ∨ E\\\`, \\\`Y[2] = c[2] ∨ E\\\`. ראה הסכמה.',
        ],
        answerSchematic: `
<svg viewBox="0 0 1080 700" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="12" role="img" aria-label="mod-8 counter built from mod-6 + extra D-FF — gate-level diagram + state cycle table">
  <defs>
    <linearGradient id="m8Body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#143049"/><stop offset="1" stop-color="#0a1825"/>
    </linearGradient>
    <linearGradient id="m8GateGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a2438"/><stop offset="1" stop-color="#0a1420"/>
    </linearGradient>
    <marker id="m8ArrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
    <marker id="m8ArrB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80d4ff"/></marker>
    <marker id="m8ArrO" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff8060"/></marker>
  </defs>

  <!-- ─── Title ─── -->
  <rect x="0" y="0" width="1080" height="44" fill="#0c1a28"/>
  <text direction="ltr" x="540" y="28" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    mod-8  =  mod-6 (given)  +  1 D-FF (E)  +  detect &amp; force-clear logic
  </text>

  <!-- ──────────── mod-6 box (top-left) ──────────── -->
  <rect x="60" y="80" width="160" height="110" rx="10" fill="url(#m8Body)" stroke="#80d4ff" stroke-width="2"/>
  <text direction="ltr" x="140" y="120" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="16">mod-6</text>
  <text direction="ltr" x="140" y="140" text-anchor="middle" fill="#a0c0e0" font-size="11">counter (given)</text>
  <text direction="ltr" x="140" y="160" text-anchor="middle" fill="#a0c0e0" font-size="10">3-bit  Q = c[2:0]</text>
  <text direction="ltr" x="140" y="180" text-anchor="middle" fill="#ff8060" font-size="10">CLR ← force_clr</text>

  <!-- Three explicit c[i] output wires -->
  <!-- c[2] -->
  <line x1="220" y1="100" x2="380" y2="100" stroke="#80d4ff" stroke-width="1.6"/>
  <text direction="ltr" x="240" y="94" fill="#80d4ff" font-size="11" font-weight="bold">c[2]</text>
  <circle cx="380" cy="100" r="3.5" fill="#80d4ff"/>
  <!-- c[1] -->
  <line x1="220" y1="135" x2="380" y2="135" stroke="#80d4ff" stroke-width="1.6"/>
  <text direction="ltr" x="240" y="129" fill="#80d4ff" font-size="11" font-weight="bold">c[1]</text>
  <circle cx="380" cy="135" r="3.5" fill="#80d4ff"/>
  <!-- c[0] -->
  <line x1="220" y1="170" x2="380" y2="170" stroke="#80d4ff" stroke-width="1.6"/>
  <text direction="ltr" x="240" y="164" fill="#80d4ff" font-size="11" font-weight="bold">c[0]</text>
  <circle cx="380" cy="170" r="3.5" fill="#80d4ff"/>

  <!-- ──────────── E (D-FF) box (middle-left) ──────────── -->
  <rect x="60" y="260" width="160" height="80" rx="10" fill="url(#m8Body)" stroke="#ff8060" stroke-width="2"/>
  <text direction="ltr" x="140" y="294" text-anchor="middle" fill="#ff8060" font-weight="bold" font-size="16">E (D-FF)</text>
  <text direction="ltr" x="140" y="316" text-anchor="middle" fill="#806040" font-size="10">extra MSB-like state</text>

  <!-- E output -->
  <line x1="220" y1="290" x2="380" y2="290" stroke="#ff8060" stroke-width="1.8"/>
  <text direction="ltr" x="240" y="284" fill="#ff8060" font-size="12" font-weight="bold">E</text>
  <circle cx="380" cy="290" r="4" fill="#ff8060"/>

  <!-- ──────────── DETECT BLOCK (explicit gates) ──────────── -->
  <!-- c==5 detector: AND of c[2], ¬c[1], c[0] -->
  <text direction="ltr" x="440" y="76" text-anchor="middle" fill="#a0c0e0" font-size="11" font-weight="bold">c == 5</text>
  <text direction="ltr" x="440" y="90" text-anchor="middle" fill="#80a0c0" font-size="10">(101)</text>
  <!-- NOT bubble on c[1] for "c==5" detector -->
  <line x1="380" y1="135" x2="404" y2="135" stroke="#80d4ff" stroke-width="1.4"/>
  <circle cx="410" cy="135" r="5" fill="#0a1420" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="415" y1="135" x2="430" y2="135" stroke="#80d4ff" stroke-width="1.4"/>
  <!-- AND gate -->
  <path d="M 430 100 L 460 100 Q 490 100 490 135 Q 490 170 460 170 L 430 170 Z"
        fill="url(#m8GateGrad)" stroke="#80d4ff" stroke-width="1.6"/>
  <text direction="ltr" x="455" y="139" text-anchor="middle" fill="#80d4ff" font-size="10" font-weight="bold">AND</text>
  <!-- c[2] going into AND -->
  <line x1="380" y1="100" x2="430" y2="100" stroke="#80d4ff" stroke-width="1.4"/>
  <!-- c[0] going into AND -->
  <line x1="380" y1="170" x2="430" y2="170" stroke="#80d4ff" stroke-width="1.4"/>
  <!-- AND output → "is5" -->
  <line x1="490" y1="135" x2="540" y2="135" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="510" y="129" fill="#80d4ff" font-size="10">is5</text>

  <!-- c==1 detector: AND of ¬c[2], ¬c[1], c[0] (tap c[2] and c[1] further right) -->
  <text direction="ltr" x="440" y="216" text-anchor="middle" fill="#a0c0e0" font-size="11" font-weight="bold">c == 1</text>
  <text direction="ltr" x="440" y="230" text-anchor="middle" fill="#80a0c0" font-size="10">(001)</text>

  <!-- c[2] tap going DOWN to c==1 detector -->
  <line x1="380" y1="100" x2="380" y2="220" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="380" y1="220" x2="404" y2="220" stroke="#80d4ff" stroke-width="1.4"/>
  <circle cx="410" cy="220" r="5" fill="#0a1420" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="415" y1="220" x2="430" y2="220" stroke="#80d4ff" stroke-width="1.4"/>

  <!-- AND gate for c==1 -->
  <path d="M 430 220 L 460 220 Q 490 220 490 235 Q 490 250 460 250 L 430 250 Z"
        fill="url(#m8GateGrad)" stroke="#80d4ff" stroke-width="1.6"/>
  <text direction="ltr" x="455" y="240" text-anchor="middle" fill="#80d4ff" font-size="10" font-weight="bold">AND</text>

  <!-- c[1] tap to NOT bubble for c==1 -->
  <line x1="380" y1="135" x2="380" y2="235" stroke="#80d4ff" stroke-width="1.4"/>
  <circle cx="380" cy="135" r="3.5" fill="#80d4ff"/>
  <line x1="380" y1="235" x2="404" y2="235" stroke="#80d4ff" stroke-width="1.4"/>
  <circle cx="410" cy="235" r="5" fill="#0a1420" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="415" y1="235" x2="430" y2="235" stroke="#80d4ff" stroke-width="1.4"/>

  <!-- c[0] tap to c==1 AND -->
  <line x1="380" y1="170" x2="380" y2="250" stroke="#80d4ff" stroke-width="1.4"/>
  <line x1="380" y1="250" x2="430" y2="250" stroke="#80d4ff" stroke-width="1.4"/>

  <!-- c==1 AND output → "is1" -->
  <line x1="490" y1="235" x2="540" y2="235" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="510" y="229" fill="#80d4ff" font-size="10">is1</text>

  <!-- ── a = is5 ∧ ¬E (AND gate at x=600 y=160) ── -->
  <line x1="540" y1="135" x2="560" y2="135" stroke="#80d4ff" stroke-width="1.4"/>
  <!-- ¬E for a (tap E and invert) -->
  <line x1="380" y1="290" x2="380" y2="175" stroke="#ff8060" stroke-width="1.4"/>
  <line x1="380" y1="175" x2="554" y2="175" stroke="#ff8060" stroke-width="1.4"/>
  <circle cx="560" cy="175" r="5" fill="#0a1420" stroke="#ff8060" stroke-width="1.4"/>
  <line x1="565" y1="175" x2="565" y2="155" stroke="#ff8060" stroke-width="1.4"/>
  <!-- AND for a -->
  <path d="M 560 130 L 590 130 Q 620 130 620 155 Q 620 180 590 180 L 560 180 Z"
        fill="url(#m8GateGrad)" stroke="#ff8060" stroke-width="1.6"/>
  <text direction="ltr" x="585" y="158" text-anchor="middle" fill="#ff8060" font-size="10" font-weight="bold">a</text>
  <!-- a output -->
  <line x1="620" y1="155" x2="680" y2="155" stroke="#ff8060" stroke-width="1.4"/>
  <text direction="ltr" x="640" y="149" fill="#ff8060" font-size="10">a</text>

  <!-- ── b = is1 ∧ E (AND gate) ── -->
  <line x1="540" y1="235" x2="560" y2="235" stroke="#80d4ff" stroke-width="1.4"/>
  <!-- E tap (no inversion) for b -->
  <line x1="380" y1="290" x2="554" y2="290" stroke="#ff8060" stroke-width="1.4"/>
  <line x1="554" y1="290" x2="554" y2="260" stroke="#ff8060" stroke-width="1.4"/>
  <line x1="554" y1="260" x2="560" y2="260" stroke="#ff8060" stroke-width="1.4"/>
  <!-- AND for b -->
  <path d="M 560 220 L 590 220 Q 620 220 620 245 Q 620 270 590 270 L 560 270 Z"
        fill="url(#m8GateGrad)" stroke="#ff8060" stroke-width="1.6"/>
  <text direction="ltr" x="585" y="248" text-anchor="middle" fill="#ff8060" font-size="10" font-weight="bold">b</text>
  <!-- b output -->
  <line x1="620" y1="245" x2="680" y2="245" stroke="#ff8060" stroke-width="1.4"/>
  <text direction="ltr" x="640" y="259" fill="#ff8060" font-size="10">b</text>

  <!-- ── OR: force_clr = a ∨ b ── -->
  <path d="M 680 130 Q 705 200 680 270 Q 700 270 720 250 Q 740 200 720 150 Q 700 130 680 130 Z"
        fill="url(#m8GateGrad)" stroke="#ff8060" stroke-width="1.6"/>
  <text direction="ltr" x="708" y="204" text-anchor="middle" fill="#ff8060" font-weight="bold" font-size="11">OR</text>
  <line x1="680" y1="155" x2="688" y2="155" stroke="#ff8060" stroke-width="1.4"/>
  <line x1="680" y1="245" x2="688" y2="245" stroke="#ff8060" stroke-width="1.4"/>

  <!-- force_clr output -->
  <line x1="740" y1="200" x2="810" y2="200" stroke="#ff8060" stroke-width="2" marker-end="url(#m8ArrO)"/>
  <text direction="ltr" x="775" y="194" text-anchor="middle" fill="#ff8060" font-size="11" font-weight="bold">force_clr</text>

  <!-- ── force_clr feedback loop → mod-6.CLR ── -->
  <line x1="775" y1="200" x2="775" y2="60" stroke="#ff8060" stroke-width="1.4" stroke-dasharray="6 3"/>
  <line x1="775" y1="60" x2="30" y2="60" stroke="#ff8060" stroke-width="1.4" stroke-dasharray="6 3"/>
  <line x1="30" y1="60" x2="30" y2="180" stroke="#ff8060" stroke-width="1.4" stroke-dasharray="6 3"/>
  <line x1="30" y1="180" x2="60" y2="180" stroke="#ff8060" stroke-width="1.4" stroke-dasharray="6 3" marker-end="url(#m8ArrO)"/>
  <text direction="ltr" x="400" y="54" text-anchor="middle" fill="#ff8060" font-size="11" font-weight="bold">force_clr → mod-6.CLR</text>

  <!-- ── XOR: E_next = E ⊕ force_clr ── -->
  <!-- E tap for XOR -->
  <line x1="380" y1="290" x2="380" y2="350" stroke="#ff8060" stroke-width="1.4"/>
  <line x1="380" y1="350" x2="780" y2="350" stroke="#ff8060" stroke-width="1.4"/>
  <line x1="780" y1="350" x2="780" y2="320" stroke="#ff8060" stroke-width="1.4"/>
  <!-- XOR gate (D-shape with extra curve) -->
  <path d="M 778 280 Q 798 320 778 360" fill="none" stroke="#ff8060" stroke-width="1.4"/>
  <path d="M 786 280 Q 818 300 838 320 Q 818 340 786 360 Q 806 320 786 280 Z"
        fill="url(#m8GateGrad)" stroke="#ff8060" stroke-width="1.6"/>
  <text direction="ltr" x="810" y="326" text-anchor="middle" fill="#ff8060" font-weight="bold" font-size="12">⊕</text>
  <!-- force_clr tap (from force_clr line) into XOR -->
  <circle cx="775" cy="280" r="4" fill="#ff8060"/>
  <line x1="775" y1="280" x2="786" y2="280" stroke="#ff8060" stroke-width="1.4"/>
  <!-- XOR output: E_next → loops back to E.D -->
  <line x1="838" y1="320" x2="870" y2="320" stroke="#ff8060" stroke-width="2"/>
  <text direction="ltr" x="855" y="314" text-anchor="middle" fill="#ff8060" font-size="11" font-weight="bold">E_next</text>
  <!-- E_next loop -->
  <line x1="870" y1="320" x2="870" y2="400" stroke="#ff8060" stroke-width="1.4" stroke-dasharray="6 3"/>
  <line x1="870" y1="400" x2="30" y2="400" stroke="#ff8060" stroke-width="1.4" stroke-dasharray="6 3"/>
  <line x1="30" y1="400" x2="30" y2="290" stroke="#ff8060" stroke-width="1.4" stroke-dasharray="6 3"/>
  <line x1="30" y1="290" x2="60" y2="290" stroke="#ff8060" stroke-width="1.4" stroke-dasharray="6 3" marker-end="url(#m8ArrO)"/>
  <text direction="ltr" x="440" y="416" text-anchor="middle" fill="#ff8060" font-size="11" font-weight="bold">E_next → E.D</text>

  <!-- ──────────── OUTPUT COMBINE — explicit OR gates ──────────── -->
  <text direction="ltr" x="970" y="78" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">output combine</text>

  <!-- Y[0] = c[0] direct -->
  <line x1="380" y1="170" x2="900" y2="170" stroke="#80f0a0" stroke-width="1.8" marker-end="url(#m8ArrG)"/>
  <text direction="ltr" x="930" y="166" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">Y[0]</text>

  <!-- Y[1] = c[1] ∨ E -->
  <!-- OR gate for Y[1] -->
  <path d="M 820 100 Q 845 130 820 160 Q 840 160 855 145 Q 875 130 855 115 Q 840 100 820 100 Z"
        fill="url(#m8GateGrad)" stroke="#80f0a0" stroke-width="1.6"/>
  <text direction="ltr" x="848" y="135" text-anchor="middle" fill="#80f0a0" font-size="11" font-weight="bold">OR</text>
  <!-- c[1] → OR.in0 (tap from c[1] line at x=380) -->
  <circle cx="380" cy="135" r="0" fill="#80d4ff"/>
  <line x1="380" y1="135" x2="800" y2="135" stroke="#80d4ff" stroke-width="1.4" stroke-dasharray="4 2"/>
  <line x1="800" y1="135" x2="800" y2="115" stroke="#80d4ff" stroke-width="1.4" stroke-dasharray="4 2"/>
  <line x1="800" y1="115" x2="820" y2="115" stroke="#80d4ff" stroke-width="1.4"/>
  <!-- E → OR.in1 (tap from E line) -->
  <line x1="380" y1="290" x2="800" y2="290" stroke="#ff8060" stroke-width="1.4" stroke-dasharray="4 2"/>
  <line x1="800" y1="290" x2="800" y2="145" stroke="#ff8060" stroke-width="1.4" stroke-dasharray="4 2"/>
  <line x1="800" y1="145" x2="820" y2="145" stroke="#ff8060" stroke-width="1.4"/>
  <!-- OR output → Y[1] -->
  <line x1="875" y1="130" x2="900" y2="130" stroke="#80f0a0" stroke-width="1.8" marker-end="url(#m8ArrG)"/>
  <text direction="ltr" x="930" y="126" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">Y[1]</text>

  <!-- Y[2] = c[2] ∨ E (OR gate higher up) -->
  <path d="M 820 80 Q 845 105 820 130 Q 840 130 855 115 Q 875 100 855 88 Q 840 80 820 80 Z"
        fill="url(#m8GateGrad)" stroke="#80f0a0" stroke-width="1.6"/>
  <!-- c[2] → OR.in0 -->
  <line x1="380" y1="100" x2="800" y2="100" stroke="#80d4ff" stroke-width="1.4" stroke-dasharray="4 2"/>
  <line x1="800" y1="100" x2="800" y2="92" stroke="#80d4ff" stroke-width="1.4" stroke-dasharray="4 2"/>
  <line x1="800" y1="92" x2="820" y2="92" stroke="#80d4ff" stroke-width="1.4"/>
  <!-- E → OR.in1 (re-use E rail) — actually different tap height -->
  <line x1="800" y1="290" x2="800" y2="115" stroke="#ff8060" stroke-width="0"/>
  <line x1="804" y1="115" x2="820" y2="115" stroke="#ff8060" stroke-width="1.4"/>
  <line x1="804" y1="115" x2="804" y2="290" stroke="#ff8060" stroke-width="1.4" stroke-dasharray="4 2"/>
  <!-- OR output → Y[2] -->
  <line x1="875" y1="103" x2="900" y2="103" stroke="#80f0a0" stroke-width="1.8" marker-end="url(#m8ArrG)"/>
  <text direction="ltr" x="930" y="100" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">Y[2]</text>

  <!-- ──────────── STATE CYCLE TABLE ──────────── -->
  <text direction="ltr" x="540" y="460" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="13">
    state cycle:  8 unique configurations of (E, c) → Y
  </text>

  <!-- Table header -->
  <rect x="80" y="476" width="920" height="32" fill="#0c1a28" stroke="#3a5575" stroke-width="1"/>
  ${['step','E','c[2]','c[1]','c[0]','c (dec)','Y','transition'].map((h, i) => {
    const x = [120, 220, 290, 350, 410, 490, 580, 760][i];
    return `<text direction="ltr" x="${x}" y="498" text-anchor="middle" fill="#80d4ff" font-size="11" font-weight="bold">${h}</text>`;
  }).join('')}

  <!-- Table rows -->
  ${[
    { step: 0, E: 0, c2: 0, c1: 0, c0: 0, dec: 0, Y: 0, trans: 'init' },
    { step: 1, E: 0, c2: 0, c1: 0, c0: 1, dec: 1, Y: 1, trans: 'count up' },
    { step: 2, E: 0, c2: 0, c1: 1, c0: 0, dec: 2, Y: 2, trans: 'count up' },
    { step: 3, E: 0, c2: 0, c1: 1, c0: 1, dec: 3, Y: 3, trans: 'count up' },
    { step: 4, E: 0, c2: 1, c1: 0, c0: 0, dec: 4, Y: 4, trans: 'count up' },
    { step: 5, E: 0, c2: 1, c1: 0, c0: 1, dec: 5, Y: 5, trans: 'count up — c==5 detected!' },
    { step: 6, E: 1, c2: 0, c1: 0, c0: 0, dec: 0, Y: 6, trans: 'force_clr fired, E toggled', hl: '#ff8060' },
    { step: 7, E: 1, c2: 0, c1: 0, c0: 1, dec: 1, Y: 7, trans: 'count up — c==1 detected!' },
    { step: 0, E: 0, c2: 0, c1: 0, c0: 0, dec: 0, Y: 0, trans: 'force_clr fired, E back to 0', hl: '#ff8060' },
  ].map((r, i) => {
    const y = 522 + i * 19;
    const isWrap = r.hl;
    const fill = isWrap ? '#1a1410' : (i % 2 ? '#0a1420' : '#0a1825');
    const Yhl = r.Y === 6 || r.Y === 7;
    return `
      <rect x="80" y="${y - 14}" width="920" height="19" fill="${fill}" opacity="0.7"/>
      <text direction="ltr" x="120" y="${y}" text-anchor="middle" fill="#a0c0e0" font-size="11">${r.step}</text>
      <text direction="ltr" x="220" y="${y}" text-anchor="middle" fill="${r.E === 1 ? '#ff8060' : '#80a0c0'}" font-size="11" font-weight="${r.E === 1 ? 'bold' : 'normal'}">${r.E}</text>
      <text direction="ltr" x="290" y="${y}" text-anchor="middle" fill="#80a0c0" font-size="11">${r.c2}</text>
      <text direction="ltr" x="350" y="${y}" text-anchor="middle" fill="#80a0c0" font-size="11">${r.c1}</text>
      <text direction="ltr" x="410" y="${y}" text-anchor="middle" fill="#80a0c0" font-size="11">${r.c0}</text>
      <text direction="ltr" x="490" y="${y}" text-anchor="middle" fill="#80a0c0" font-size="11">${r.dec}</text>
      <text direction="ltr" x="580" y="${y}" text-anchor="middle" fill="${Yhl ? '#ffd060' : '#80f0a0'}" font-size="13" font-weight="bold">${r.Y}</text>
      <text direction="ltr" x="760" y="${y}" text-anchor="middle" fill="${isWrap ? '#ff8060' : '#a0a0c0'}" font-size="10" font-style="italic">${r.trans}</text>
    `;
  }).join('')}

  <!-- Footer -->
  <text direction="ltr" x="540" y="688" text-anchor="middle" fill="#80f0a0" font-size="11" font-weight="bold">
    Total extra components beyond mod-6:  1 D-FF (E)  +  ~8 gates  (2 detect ANDs, 2 inner ANDs, 1 OR, 1 XOR, 2 OR for Y[1]/Y[2])
  </text>
</svg>`,
        answer:
`**הרעיון:** ה-mod-6 לבדו מגביל אותנו ל-6 ערכים (0..5). כדי להגיע ל-8, נוסיף **רכיב זיכרון אחד נוסף** (D-FF) שמרחיב את שטח המצבים ל-12, ובוחרים 8 מהם.

**מיפוי המצבים (E, c) → Y:**

| E | c | Y (mod-8) |
|---|---|-----------|
| 0 | 0..5 | 0..5 |
| 1 | 0 | 6 |
| 1 | 1 | 7 |

**מתי לעבור?**
- (E=0, c=5) → next: (E=1, c=0) — סופרים 5,**6**.
- (E=1, c=1) → next: (E=0, c=0) — סופרים 7,**0**.

ה-mod-6 ימשיך טבעית 5→0, אז המעבר הראשון מתבצע "חינם". המעבר השני דורש איפוס מאולץ (CLR) — ב-(E=1, c=1) ה-mod-6 בלי התערבות יילך ל-c=2.

**אותות בקרה:**
\`\`\`
detect_5 = c[2] · ¬c[1] · c[0]              (= c == 5 = 101)
detect_1 = ¬c[2] · ¬c[1] · c[0]             (= c == 1 = 001)
force_clr = (detect_5 · ¬E) ∨ (detect_1 · E)
E_next   = E ⊕ force_clr                    (toggle בדיוק במעברי המצבים האלה)
\`\`\`

\`force_clr\` מחובר ל-CLR של ה-mod-6. \`E_next\` מחובר ל-D של ה-E D-FF.

**פלט Y (3-bit):**
\`\`\`
Y[0] = c[0]                                  (תמיד שווה ל-LSB של c)
Y[1] = c[1] ∨ E                              (לערכים 6,7 מקבל 1 מ-E)
Y[2] = c[2] ∨ E                              (לערכים 6,7 מקבל 1 מ-E)
\`\`\`

**אימות בערכים בודדים:**
- (E=0, c=4 = 100) → Y = (1·0=0, 0·0=0... wait Y[2] = c[2] OR E = 1∨0 = 1, Y[1]=0∨0=0, Y[0]=0 → Y=100=4 ✓
- (E=1, c=0 = 000) → Y[2]=0∨1=1, Y[1]=0∨1=1, Y[0]=0 → Y=110=6 ✓
- (E=1, c=1 = 001) → Y[2]=1, Y[1]=1, Y[0]=1 → Y=111=7 ✓

**ספירה:** 1 D-FF (E) + ~6 שערים (3 NOT, 2 AND-3, 1 AND, 1 OR, 1 XOR + 2 OR לפלט). ~7-8 שערים נוספים מעבר ל-mod-6 הנתון.

**הסבר אינטואיטיבי:** מצרפים סיבית "מצב גבוה" (E) ל-counter קיים. כש-E=1, מודיעים לעולם "אנחנו בקטע 6-7", והפלט מקבל +6 בעזרת ה-OR עם c[1], c[2].`,
        interviewerMindset:
`שאלה פדגוגית מתחה. המראיין רוצה לראות:

1. **שאתה מבחין שאי-אפשר להוסיף 2 מצבים בלי FF נוסף.** מועמד שניסה להוסיף "רק שערים" טועה — אי-אפשר להחזיק יותר מ-6 מצבים ב-3 D-FFים אם הם מוגבלים ל-mod-6.
2. **שאתה ממפה את 12 המצבים ל-8** בלי כפל. (E,c) → Y חד-חד-ערכי על 8 הצירופים שאתה מקיים.
3. **שאתה זוכר את ה-CLR.** מועמד שמטפל ב-E_next אבל לא ב-force_clr → המעגל ייפול במחזור (E=1, c=2) שהוא לא בכוונה.

**שאלת המשך:** "ולמה לא פשוט להחליף את ה-mod-6 ב-mod-8 רגיל?" → במכשירים אמיתיים זה לא תמיד אפשר (כשרכיב מוגדר חיצונית). השאלה בודקת **אבסטרקציה: שימוש ברכיב נתון** בלי לפתוח אותו.`,
        expectedAnswers: [
          '1 d-ff', 'one d-ff', 'd-ff נוסף', 'rף נוסף',
          'extra', 'נוסף',
          'force', 'clr', 'clear', 'איפוס',
          'e', 'msb', 'state',
          'c == 5', 'c=5', 'c == 1', 'c=1',
          'or', 'xor',
          '12 states', '12 מצבים',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 15 (mod-8 from mod-6)',
    tags: ['counter', 'modulo', 'state-extension', 'sequential', 'ff'],
  },

  // ───────────────────────────────────────────────────────────────
  // #2016 — DFA: divisibility by 5 (slide 22)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'dfa-divisibility-by-5',
    difficulty: 'medium',
    title: 'אוטומט סופי דטרמיניסטי — בדיקת חלוקה ב-5',
    intro:
`כתוב אוטומט סופי דטרמיניסטי (מכונת מצבים) שמקבל כקלט מספר בינארי מהספרה הגדולה ביותר
לספרה הקטנה ביותר (MSB-first), ובודק אם המספר מתחלק ב-\`5\`.

הצורה: המצב הוא השארית של המספר שנקרא עד כה ב-mod 5. ייתכן ב-{0, 1, 2, 3, 4} = 5 מצבים.
הפלט \`Y = 1\` ⇔ המצב הנוכחי הוא 0 (כלומר הזרם הנוכחי מתחלק ב-5).`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'תכנן את ה-FSM. כמה מצבים? איך המעבר?',
        hints: [
          '**5 מצבים** (S0..S4) — אחד לכל שארית אפשרית mod 5.',
          'הוספת ביט \\\`x\\\` מימין: \\\`new_value = 2·value + x\\\`. השארית: \\\`new_state = (2·state + x) mod 5\\\`.',
          'המעבר זהה לחלוטין למבנה של חלוקה ב-3 (שאלה 2010), רק עם 5 מצבים במקום 3.',
          'הפלט (Moore): \\\`Y = (state == 0)\\\`. כאשר נתקבלים ביטים מצטברים והשארית התאפסה.',
          '5 מצבים דורשים **3 D-FFים** (לקידוד \\\`⌈log₂(5)⌉ = 3\\\`). יש 3 מצבים "לא חוקיים" (101, 110, 111) שמטופלים בהגנת recovery.',
        ],
        answerSchematic: `
<svg viewBox="0 0 720 460" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="12" role="img" aria-label="DFA divisibility-by-5 state diagram, 5 states">
  <defs>
    <marker id="d5arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80d4ff"/>
    </marker>
    <marker id="d5self" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80d4ff"/>
    </marker>
  </defs>

  <!-- Title -->
  <rect x="0" y="0" width="720" height="40" fill="#0c1a28"/>
  <text direction="ltr" x="360" y="26" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    DFA mod-5:  new_state = (2 · state + bit) mod 5
  </text>

  <!-- 5 states in pentagon layout -->
  <!-- S0 at top -->
  <circle cx="360" cy="110" r="36" fill="#143830" stroke="#80f0a0" stroke-width="2.4"/>
  <circle cx="360" cy="110" r="30" fill="none" stroke="#80f0a0" stroke-width="1"/>
  <text direction="ltr" x="360" y="106" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="16">S0</text>
  <text direction="ltr" x="360" y="124" text-anchor="middle" fill="#80f0a0" font-size="10">Y=1</text>

  <!-- S1 top-right -->
  <circle cx="560" cy="200" r="34" fill="#143049" stroke="#80d4ff" stroke-width="2"/>
  <text direction="ltr" x="560" y="206" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">S1</text>

  <!-- S2 bottom-right -->
  <circle cx="490" cy="370" r="34" fill="#143049" stroke="#80d4ff" stroke-width="2"/>
  <text direction="ltr" x="490" y="376" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">S2</text>

  <!-- S3 bottom-left -->
  <circle cx="230" cy="370" r="34" fill="#143049" stroke="#80d4ff" stroke-width="2"/>
  <text direction="ltr" x="230" y="376" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">S3</text>

  <!-- S4 top-left -->
  <circle cx="160" cy="200" r="34" fill="#143049" stroke="#80d4ff" stroke-width="2"/>
  <text direction="ltr" x="160" y="206" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">S4</text>

  <!-- start arrow into S0 -->
  <line x1="360" y1="40" x2="360" y2="72" stroke="#f0d080" stroke-width="2" marker-end="url(#d5arrow)"/>
  <text direction="ltr" x="380" y="56" fill="#f0d080" font-size="10">start</text>

  <!-- Self-loop on S0: x=0 → S0 -->
  <path d="M 340 80 Q 320 50 340 70 Q 360 80 340 80" fill="none" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#d5self)"/>
  <text direction="ltr" x="316" y="62" fill="#80d4ff" font-size="11" font-weight="bold">0</text>

  <!-- S0 → S1 (x=1) -->
  <path d="M 394 122 Q 480 150 530 188" fill="none" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#d5arrow)"/>
  <text direction="ltr" x="470" y="148" fill="#80d4ff" font-size="11" font-weight="bold">1</text>

  <!-- S1 → S2 (x=1: (2+1)%5=3 — wait, S1 = 1, x=1 → (2*1+1)=3 mod5 = 3 = S3. Let me re-verify.
       S1=1, x=0 → (2*1+0)%5 = 2 = S2.
       S1=1, x=1 → (2*1+1)%5 = 3 = S3. -->

  <!-- S1 → S2 (bit=0): 1 → 2 -->
  <path d="M 555 234 Q 540 320 510 340" fill="none" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#d5arrow)"/>
  <text direction="ltr" x="560" y="290" fill="#80d4ff" font-size="11" font-weight="bold">0</text>

  <!-- S1 → S3 (bit=1): 1 → 3 -->
  <path d="M 532 215 Q 380 280 256 360" fill="none" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#d5arrow)"/>
  <text direction="ltr" x="380" y="280" fill="#80d4ff" font-size="11" font-weight="bold">1</text>

  <!-- S2 → S4 (bit=0): (2*2+0)%5 = 4 -->
  <path d="M 460 360 Q 280 320 188 218" fill="none" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#d5arrow)"/>
  <text direction="ltr" x="280" y="310" fill="#80d4ff" font-size="11" font-weight="bold">0</text>

  <!-- S2 → S0 (bit=1): (2*2+1)%5 = 0 -->
  <path d="M 484 336 Q 430 220 386 138" fill="none" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#d5arrow)"/>
  <text direction="ltr" x="450" y="244" fill="#80d4ff" font-size="11" font-weight="bold">1</text>

  <!-- S3 → S1 (bit=0): (2*3+0)%5 = 1 -->
  <path d="M 254 348 Q 420 220 530 215" fill="none" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#d5arrow)"/>
  <text direction="ltr" x="376" y="252" fill="#80d4ff" font-size="11" font-weight="bold">0</text>

  <!-- S3 → S2 (bit=1): (2*3+1)%5 = 2 -->
  <path d="M 264 370 Q 360 380 458 370" fill="none" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#d5arrow)"/>
  <text direction="ltr" x="360" y="396" fill="#80d4ff" font-size="11" font-weight="bold">1</text>

  <!-- S4 → S3 (bit=0): (2*4+0)%5 = 3 -->
  <path d="M 175 232 Q 170 320 200 350" fill="none" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#d5arrow)"/>
  <text direction="ltr" x="150" y="288" fill="#80d4ff" font-size="11" font-weight="bold">0</text>

  <!-- S4 → S4 self-loop (bit=1): (2*4+1)%5 = 4 -->
  <path d="M 140 178 Q 100 150 130 178 Q 160 200 140 178" fill="none" stroke="#80d4ff" stroke-width="1.4" marker-end="url(#d5self)"/>
  <text direction="ltr" x="100" y="170" fill="#80d4ff" font-size="11" font-weight="bold">1</text>

  <!-- Legend -->
  <text direction="ltr" x="360" y="436" text-anchor="middle" fill="#a0a0c0" font-size="11" font-style="italic">
    S0 = accepting (mod 5 == 0).  Transitions labeled by input bit (0 or 1).
  </text>
</svg>`,
        answer:
`**5 מצבים + 3 D-FFים. Y = (state == 0).**

### טבלת המעברים

| מצב נוכחי | bit=0 | bit=1 |
|----------|-------|-------|
| **S0 (=0)** | S0 (=(2·0+0)%5=0) | S1 (=1) |
| **S1 (=1)** | S2 (=2) | S3 (=3) |
| **S2 (=2)** | S4 (=4) | S0 (=(4+1)%5=0) |
| **S3 (=3)** | S1 (=(6+0)%5=1) | S2 (=(6+1)%5=2) |
| **S4 (=4)** | S3 (=(8+0)%5=3) | S4 (=(8+1)%5=4) |

### קידוד מצבים (3 D-FFים)

| מצב | Q2 Q1 Q0 |
|-----|----------|
| S0 | 000 |
| S1 | 001 |
| S2 | 010 |
| S3 | 011 |
| S4 | 100 |

3 צירופים (101, 110, 111) לא חוקיים. ב-design רציני — מתחזים אותם כ-don't-cares ב-K-map, או מטפלים בהם ב-recovery (\`if state > 4: state = 0\`).

### פלט (Moore)

\`\`\`
Y = ¬Q2 · ¬Q1 · ¬Q0           (= state == S0 == 000)
\`\`\`

### לוגיקת המעבר (K-map)

מה-טבלה לעיל, ניתן לחלץ את \`D2, D1, D0\` כפונקציה של \`Q2 Q1 Q0 x\`:

\`\`\`
D2 = Q1·¬Q0·¬x  +  Q2·x                                (3 שערים)
D1 = ¬Q2·¬Q1·Q0  +  ¬Q2·Q1·Q0·x  +  Q2·¬Q1·¬Q0·¬x      (~6 שערים)
D0 = ¬Q2·¬Q1·x   +  ¬Q2·Q1·Q0·¬x  +  Q2·¬Q1·¬Q0·¬x     (~6 שערים)
\`\`\`

**סך הכל:** 3 D-FFים + ~15 שערים + AND לפלט = ~17 שערים בסיסיים.

### ריסט

חייב להחזיר ל-\`S0 (000)\` כדי שהמשמעות "מה שספרתי עד כה ≡ 0 mod 5" תהיה נכונה.

### השוואה ל-mod-3 (שאלה 2010)

| תכונה | mod-3 | mod-5 |
|-------|-------|-------|
| מספר מצבים | 3 | 5 |
| D-FFים | 2 (4 צירופים, 1 לא חוקי) | 3 (8 צירופים, 3 לא חוקיים) |
| מעבר | (2·s + x) mod 3 | (2·s + x) mod 5 |
| שערים | ~5 | ~15 |
| פלט | \`¬Q1·¬Q0\` | \`¬Q2·¬Q1·¬Q0\` |

**הכללה ל-mod-N:** \`⌈log₂N⌉\` D-FFים + לוגיקה של \`(2·s + x) mod N\`. ככל ש-N עולה, מספר השערים גדל ליניארית.

**שאלת המשך מתבקשת:** "ולמה לא מימוש פשוט עם COUNTER שמתחלק ב-5?" — תשובה: זה רק עובד אם הזרם הוא **שמתחלקים אותו ב-5** כספרות חד-חד-ערכיות. כאן יש זרם בינארי — צריך באמת FSM שעוקב אחר השארית.`,
        interviewerMindset:
`שאלת FSM קלאסית, וריאנט של mod-3. המראיין מחפש:

1. **שאתה מבחין שזה אותו תבנית כמו mod-3** ולא ממציא את הגלגל מחדש.
2. **שאתה מסביר את הנוסחה \`(2·s + x) mod 5\`** מאיפה היא באה — \`new_value = 2·old + bit\`, ואז mod.
3. **שאתה מטפל ב-3 מצבים לא חוקיים** — recovery או don't-cares.

**שאלת המשך:** "ומה אם זרם הביטים הוא LSB-first ולא MSB-first?" → ה-FSM שונה לגמרי. נתון x_LSB → \`new_value = (2^k)·bit + old\` כאשר \`k\` גדל. מצבי השארית הופכים תלויים בעומק הזרם. הרבה יותר מסובך — דורש שמירת \`2^k mod 5\` נוסף.

**שאלת המשך עמוקה:** "כמה מצבים מינימליים לזיהוי שמתחלק ב-N?" → \`N\` מצבים (חוצה הוכחת מינימיזציה). הוכחה: שתי קלטים שונים מ-mod שונה צריכים להיות במצבים שונים, אחרת אי-אפשר להבחין ביניהם בהמשך.`,
        expectedAnswers: [
          '5', 'five', 'חמש',
          's0', 's1', 's2', 's3', 's4',
          '3 ff', 'three ff', 'שלושה',
          '(2 · s + x) % 5', '(2*s+x) mod 5',
          'moore',
          'state', 'מצב',
          'reset', 'ריסט',
          'log2', 'log 2',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 22 (DFA mod 5)',
    tags: ['fsm', 'dfa', 'moore', 'divisibility', 'mod-5', 'sequential'],
  },

  // ───────────────────────────────────────────────────────────────
  // #2017 — Marathon priority latch (first winner) (slide 24)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'marathon-priority-latch',
    difficulty: 'medium',
    title: 'מרוץ עם 3 רצים — נעילה על המנצח הראשון',
    intro:
`מתקיים מרוץ עם 3 אנשים. בסוף מסלול הריצה יש כפתור שלחיצה עליו מוציאה לוגי \`1\` לחזור מחזור שעון.
ממשו רכיב לוגי שמקבל את מוצאי הלחצנים (\`b₁, b₂, b₃\`) ובנוסף כניסה \`rest\`. הרכיב צריך להוציא
את **מספר הזוכה** במרוץ — והפלט נשאר נעול גם אם הרצים שלאחריו ילחצו.

\`\`\`
Output encoding:
  00  →  אף אחד לא לחץ עדיין (init / after rest)
  01  →  רץ 1 ניצח
  10  →  רץ 2 ניצח
  11  →  רץ 3 ניצח
\`\`\`

הכניסה \`rest\` מאפסת את הרכיב לסטטוס "אין מנצח".`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'תכנן את המעגל. כמה רכיבי זיכרון? איך מוודאים שרק הראשון נתפס?',
        hints: [
          'נדרש "latch" לכל רץ — D-FF שנשאר \\\`1\\\` ברגע שכפתור הרץ נלחץ.',
          'אבל פשוט "FF נעול" לכל רץ לא מספיק — אם 2 לוחצים בו-זמנית, **שניהם** ינעלו. צריך priority.',
          'הפתרון: \\\`F_i.D = F_i.Q ∨ (b_i ∧ ¬(F_j ∨ F_k))\\\` — נועלים רק אם **אף FF אחר** לא נעול כבר.',
          'אחרי שאחד נעל, F_i.Q = 1 וכל F.D נשאר 1 → לעולם לא יוצא מ-\\\`1\\\`.',
          'פלט הקידוד: \\\`y[1] = F₂ ∨ F₃\\\`, \\\`y[0] = F₁ ∨ F₃\\\`. שני שערי OR.',
          'אחזקה ב-rest: כל FF.D = ... ∧ ¬rest, או דרך פין ה-CLR.',
        ],
        answerSchematic: `
<svg viewBox="0 0 1000 540" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="12" role="img" aria-label="Marathon priority latch with explicit gates and visible wires">
  <defs>
    <linearGradient id="ml2FF" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#143049"/><stop offset="1" stop-color="#0a1825"/>
    </linearGradient>
    <linearGradient id="ml2Gate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a2438"/><stop offset="1" stop-color="#0a1420"/>
    </linearGradient>
    <marker id="ml2Arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
  </defs>

  <!-- Title -->
  <rect x="0" y="0" width="1000" height="44" fill="#0c1a28"/>
  <text direction="ltr" x="500" y="28" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    F_i.D = F_i.Q ∨ (b_i ∧ ¬F_j.Q ∧ ¬F_k.Q)   ⇒   only the first press latches
  </text>

  <!-- ── 3 rows for F1, F2, F3 ── -->
  <!-- helper: each row = b_i input + AND-3 guard + OR with F_i.Q + D-FF + Q output -->
  ${[
    { y: 100, name: 'F₁', color: '#ff8060', b: 'b₁' },
    { y: 240, name: 'F₂', color: '#f0d080', b: 'b₂' },
    { y: 380, name: 'F₃', color: '#80f0a0', b: 'b₃' },
  ].map(({ y, name, color, b }) => `
    <!-- Row background -->
    <rect x="0" y="${y - 50}" width="1000" height="100" fill="#0a1420" opacity="0.4"/>

    <!-- b_i input -->
    <text direction="ltr" x="40" y="${y + 4}" text-anchor="middle" fill="${color}" font-weight="bold" font-size="14">${b}</text>
    <line x1="60" y1="${y}" x2="240" y2="${y}" stroke="${color}" stroke-width="1.6"/>
    <circle cx="240" cy="${y}" r="3" fill="${color}"/>

    <!-- AND-3 gate: b_i ∧ ¬F_j ∧ ¬F_k -->
    <path d="M 240 ${y - 25} L 280 ${y - 25} Q 320 ${y - 25} 320 ${y} Q 320 ${y + 25} 280 ${y + 25} L 240 ${y + 25} Z"
          fill="url(#ml2Gate)" stroke="${color}" stroke-width="1.6"/>
    <text direction="ltr" x="280" y="${y + 4}" text-anchor="middle" fill="${color}" font-size="11" font-weight="bold">AND</text>
    <text direction="ltr" x="280" y="${y - 32}" text-anchor="middle" fill="${color}" font-size="9">b_i ∧ ¬F_j ∧ ¬F_k</text>

    <!-- OR-2: F_i.Q ∨ (AND output) -->
    <path d="M 360 ${y - 25} Q 380 ${y} 360 ${y + 25} Q 380 ${y + 25} 405 ${y + 12} Q 420 ${y} 405 ${y - 12} Q 380 ${y - 25} 360 ${y - 25} Z"
          fill="url(#ml2Gate)" stroke="${color}" stroke-width="1.6"/>
    <text direction="ltr" x="385" y="${y + 4}" text-anchor="middle" fill="${color}" font-size="11" font-weight="bold">OR</text>
    <line x1="320" y1="${y}" x2="358" y2="${y}" stroke="${color}" stroke-width="1.4"/>

    <!-- D-FF -->
    <rect x="460" y="${y - 30}" width="100" height="60" rx="6" fill="url(#ml2FF)" stroke="${color}" stroke-width="1.8"/>
    <text direction="ltr" x="510" y="${y - 6}" text-anchor="middle" fill="${color}" font-weight="bold" font-size="14">${name}</text>
    <text direction="ltr" x="510" y="${y + 14}" text-anchor="middle" fill="#a0c0e0" font-size="9">D-FF</text>
    <line x1="420" y1="${y}" x2="460" y2="${y}" stroke="${color}" stroke-width="1.4"/>
    <text direction="ltr" x="440" y="${y - 6}" text-anchor="middle" fill="${color}" font-size="9">D</text>

    <!-- F_i.Q output -->
    <line x1="560" y1="${y}" x2="640" y2="${y}" stroke="${color}" stroke-width="1.8"/>
    <text direction="ltr" x="600" y="${y - 6}" text-anchor="middle" fill="${color}" font-size="11" font-weight="bold">${name}.Q</text>
    <circle cx="640" cy="${y}" r="4" fill="${color}"/>

    <!-- Self-latch loop: F.Q → OR.in0 (loops up and back) -->
    <line x1="640" y1="${y}" x2="640" y2="${y - 42}" stroke="${color}" stroke-width="1.2" stroke-dasharray="3 2"/>
    <line x1="640" y1="${y - 42}" x2="340" y2="${y - 42}" stroke="${color}" stroke-width="1.2" stroke-dasharray="3 2"/>
    <line x1="340" y1="${y - 42}" x2="340" y2="${y - 25}" stroke="${color}" stroke-width="1.2" stroke-dasharray="3 2"/>
  `).join('')}

  <!-- ── Encoder (right side): 2 explicit OR gates ── -->
  <!-- y[1] = F₂ ∨ F₃ -->
  <path d="M 740 90 Q 770 140 740 190 Q 770 190 800 165 Q 820 140 800 115 Q 770 90 740 90 Z"
        fill="url(#ml2Gate)" stroke="#80f0a0" stroke-width="1.8"/>
  <text direction="ltr" x="772" y="144" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="11">OR</text>
  <!-- F2.Q wire to OR -->
  <line x1="640" y1="240" x2="700" y2="240" stroke="#f0d080" stroke-width="1.2" stroke-dasharray="3 2"/>
  <line x1="700" y1="240" x2="700" y2="125" stroke="#f0d080" stroke-width="1.2" stroke-dasharray="3 2"/>
  <line x1="700" y1="125" x2="740" y2="125" stroke="#f0d080" stroke-width="1.2"/>
  <!-- F3.Q wire to OR -->
  <line x1="640" y1="380" x2="720" y2="380" stroke="#80f0a0" stroke-width="1.2" stroke-dasharray="3 2"/>
  <line x1="720" y1="380" x2="720" y2="155" stroke="#80f0a0" stroke-width="1.2" stroke-dasharray="3 2"/>
  <line x1="720" y1="155" x2="740" y2="155" stroke="#80f0a0" stroke-width="1.2"/>
  <!-- y[1] output -->
  <line x1="820" y1="140" x2="900" y2="140" stroke="#80f0a0" stroke-width="2" marker-end="url(#ml2Arr)"/>
  <text direction="ltr" x="940" y="144" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">y[1]</text>
  <text direction="ltr" x="850" y="125" text-anchor="middle" fill="#80f0a0" font-size="9">= F₂ ∨ F₃</text>

  <!-- y[0] = F₁ ∨ F₃ -->
  <path d="M 740 290 Q 770 340 740 390 Q 770 390 800 365 Q 820 340 800 315 Q 770 290 740 290 Z"
        fill="url(#ml2Gate)" stroke="#80f0a0" stroke-width="1.8"/>
  <text direction="ltr" x="772" y="344" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="11">OR</text>
  <!-- F1.Q wire to OR -->
  <line x1="640" y1="100" x2="680" y2="100" stroke="#ff8060" stroke-width="1.2" stroke-dasharray="3 2"/>
  <line x1="680" y1="100" x2="680" y2="325" stroke="#ff8060" stroke-width="1.2" stroke-dasharray="3 2"/>
  <line x1="680" y1="325" x2="740" y2="325" stroke="#ff8060" stroke-width="1.2"/>
  <!-- F3.Q wire to OR (already going down — share rail) -->
  <line x1="720" y1="380" x2="720" y2="355" stroke="#80f0a0" stroke-width="1.2"/>
  <line x1="720" y1="355" x2="740" y2="355" stroke="#80f0a0" stroke-width="1.2"/>
  <!-- y[0] output -->
  <line x1="820" y1="340" x2="900" y2="340" stroke="#80f0a0" stroke-width="2" marker-end="url(#ml2Arr)"/>
  <text direction="ltr" x="940" y="344" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">y[0]</text>
  <text direction="ltr" x="850" y="325" text-anchor="middle" fill="#80f0a0" font-size="9">= F₁ ∨ F₃</text>

  <!-- rest input + CLR rail -->
  <text direction="ltr" x="40" y="490" text-anchor="middle" fill="#80a0c0" font-weight="bold" font-size="13">rest</text>
  <line x1="60" y1="486" x2="500" y2="486" stroke="#80a0c0" stroke-width="1.4"/>
  <line x1="500" y1="486" x2="500" y2="80" stroke="#80a0c0" stroke-width="1.4" stroke-dasharray="6 3"/>
  <text direction="ltr" x="280" y="482" fill="#80a0c0" font-size="11" font-style="italic">rest → CLR of all 3 D-FFs</text>

  <!-- Footer -->
  <text direction="ltr" x="500" y="524" text-anchor="middle" fill="#a0a0c0" font-size="11" font-style="italic">
    Per F_i:  AND-3 + OR-2 + D-FF.  Total: 3 D-FFs + 3 AND + 3 OR + 2 OR (encoder) = 11 components.
  </text>
</svg>`,
        answer:
`**3 D-FFים עם נעילה הדדית + 2-bit encoder.**

### לוגיקת ה-latch

לכל \`F_i\` (i ∈ {1, 2, 3}):
\`\`\`
F_i_next = F_i.Q  ∨  ( b_i  ∧  ¬F_j.Q  ∧  ¬F_k.Q )    (j ≠ i, k ≠ i)
\`\`\`

**איך זה עובד:**
- אם \`F_i\` כבר נעול → ה-OR שומר אותו על \`1\`.
- אם \`F_i\` עוד לא נעול אבל \`b_i\` נלחץ ו**אף F אחר לא נעול** → נועלים.
- אם \`F_j\` או \`F_k\` כבר נעולים → ה-AND מתאפס, \`F_i\` לא נועל (גם אם \`b_i\` נלחץ באותו cycle).

**עקרון:** ה"guard" \`¬F_j ∧ ¬F_k\` מבטיח שרק ה-FF הראשון שמתחיל את הנעילה זוכה. גם אם 2 לוחצים בו-זמנית — אם הם נכנסים בו-זמנית, יש race condition (אבל בפועל באמצעות propagation delay, אחד יקודם בקצה משהו), והשני "ייחסם".

### Reset

\`\`\`
F_i.CLR = rest
\`\`\`

באסרציה של \`rest\`, כל ה-FFים מתאפסים → המצב חוזר ל"אין מנצח" (\`y = 00\`).

### Encoder (לוגי 2-ביט)

\`\`\`
y[1] = F₂ ∨ F₃          (high bit = 1 if F2 or F3 won)
y[0] = F₁ ∨ F₃          (low bit = 1 if F1 or F3 won)
\`\`\`

**אימות:**
- F₁=1, F₂=F₃=0: y = (0, 1) = 01 = 1 ✓
- F₂=1, F₁=F₃=0: y = (1, 0) = 10 = 2 ✓
- F₃=1, F₁=F₂=0: y = (1, 1) = 11 = 3 ✓
- כולם 0 (אחרי rest): y = (0, 0) = 00 ✓

### ספירת רכיבים

| רכיב | כמות |
|------|------|
| D-FF | 3 |
| AND-3 (b_i ∧ ¬F_j ∧ ¬F_k) | 3 |
| NOT (לפינים ¬F_j, ¬F_k) | 0 — לוקחים מ-\`Q\'\` המובנה |
| OR-2 (self-latch + new-trigger) | 3 |
| OR-2 (encoder) | 2 |
| **סה"כ** | **3 FFים + 8 שערים** |

### שאלת המשך נפוצה

"מה אם 2 רצים לוחצים בדיוק באותו clock cycle?" — race condition. הרכיב אינו דטרמיניסטי במקרה זה. בחומרה אמיתית, propagation delay קטן יוצר אסימטריה, ואחד "מקדים" את השני בכמה ננו-שניות → הוא נעל. ב-Verilog/סימולציה: התוצאה תלויה ב-statement order. הפתרון הקלאסי לחיזוק: arbiter עם priority מובנה.`,
        interviewerMindset:
`שאלת priority/latch קלאסית. המראיין מחפש:

1. **שאתה מבחין בצורך ב-mutual exclusion.** מועמד שכותב \`F_i.D = b_i + F_i.Q\` (פשוט) — מפספס שכל ה-FFים ינעלו במקביל אם כולם לחוצים.
2. **שאתה זוכר את ה-rest.** מועמד ששוכח לאפס — שאלה ראשונה: "ואחרי שיש מנצח, איך מתחילים סבב חדש?"
3. **שאתה מבין race condition** במקרה של לחיצה סימולטנית.

**שאלת המשך:** "ולמערכת priority שלמה — מי הראשון? מי השני? מי השלישי?" — דורש 3 ספרי תאריך, או פשוט: רגיסטר 4-bit שמתאריך בכל clock כשמישהו לוחץ. הופך לבעיית "tournament scheduling."`,
        expectedAnswers: [
          '3 d-ff', '3 ff', 'three',
          'priority', 'mutual exclusion', 'הדדי',
          'latch', 'self-latch', 'feedback',
          'rest', 'clr', 'reset',
          'encoder',
          'f1', 'f2', 'f3',
          'and', 'or',
          'y[1]', 'y[0]',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 24 (Marathon priority latch)',
    tags: ['priority', 'latch', 'mutual-exclusion', 'arbiter', 'encoder', 'sequential'],
    // Canvas: 3 SCAN_FFs (D-FF with sync reset via TE=rest, TI=0) with full
    // mutex-latch logic:  F_i.D = F_i.Q ∨ (b_i ∧ ¬F_j.Q ∧ ¬F_k.Q).
    // Default: runner #2 presses first at step 3 → F2 latches, b1/b3 later
    // are blocked by the guard → y[1:0] stays at 10 (winner = 2).
    circuit: () => build(() => {
      const clk  = h.clock(80, 760);
      const rest = h.input(80, 80,  'rest'); rest.fixedValue = 0;
      const zero = h.input(80, 160, '0');    zero.fixedValue = 0;   // TI feed
      // Button pulses — only one fires first.
      const b1 = h.input(80, 240, 'b1'); b1.fixedValue = 0;
      b1.stepValues = [0, 0, 0, 0, 0, 1, 0, 0, 0, 0];   // runner 1 too late
      const b2 = h.input(80, 380, 'b2'); b2.fixedValue = 0;
      b2.stepValues = [0, 0, 0, 1, 0, 0, 0, 0, 0, 0];   // runner 2 wins
      const b3 = h.input(80, 520, 'b3'); b3.fixedValue = 0;
      b3.stepValues = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0];   // runner 3 too late

      // 3 SCAN_FFs (TE=rest, TI=0 → sync reset when rest=1; otherwise D-FF)
      const f1 = h.block('SCAN_FF', 780, 240, { label: 'F1', initialQ: 0 });
      const f2 = h.block('SCAN_FF', 780, 380, { label: 'F2', initialQ: 0 });
      const f3 = h.block('SCAN_FF', 780, 520, { label: 'F3', initialQ: 0 });

      // Per-FF NOT gates (used by the OTHER two FFs' guard logic)
      const nf1 = h.gate('NOT', 240, 280);
      const nf2 = h.gate('NOT', 240, 420);
      const nf3 = h.gate('NOT', 240, 560);

      // Per-FF "inner" AND (¬F_j ∧ ¬F_k)
      const inner1 = h.gate('AND', 380, 240);   // ¬F2 ∧ ¬F3 for F1
      const inner2 = h.gate('AND', 380, 380);   // ¬F1 ∧ ¬F3 for F2
      const inner3 = h.gate('AND', 380, 520);   // ¬F1 ∧ ¬F2 for F3

      // Per-FF "guard" AND (b_i ∧ inner_i)
      const guard1 = h.gate('AND', 520, 240);
      const guard2 = h.gate('AND', 520, 380);
      const guard3 = h.gate('AND', 520, 520);

      // Per-FF "or-latch" (F_i.Q ∨ guard_i) → D input
      const or1 = h.gate('OR', 660, 240);
      const or2 = h.gate('OR', 660, 380);
      const or3 = h.gate('OR', 660, 520);

      // Encoder
      const orY1 = h.gate('OR', 980, 320);   // y[1] = F2 ∨ F3
      const orY0 = h.gate('OR', 980, 460);   // y[0] = F1 ∨ F3

      // Outputs
      const yhi = h.output(1140, 320, 'y[1]');
      const ylo = h.output(1140, 460, 'y[0]');

      return {
        nodes: [clk, rest, zero, b1, b2, b3,
                f1, f2, f3,
                nf1, nf2, nf3,
                inner1, inner2, inner3,
                guard1, guard2, guard3,
                or1, or2, or3,
                orY1, orY0,
                yhi, ylo],
        wires: [
          // NOT(F_i.Q) per FF
          h.wire(f1.id, nf1.id, 0),
          h.wire(f2.id, nf2.id, 0),
          h.wire(f3.id, nf3.id, 0),

          // inner_i = ¬F_j ∧ ¬F_k
          h.wire(nf2.id, inner1.id, 0), h.wire(nf3.id, inner1.id, 1),
          h.wire(nf1.id, inner2.id, 0), h.wire(nf3.id, inner2.id, 1),
          h.wire(nf1.id, inner3.id, 0), h.wire(nf2.id, inner3.id, 1),

          // guard_i = b_i ∧ inner_i
          h.wire(b1.id, guard1.id, 0), h.wire(inner1.id, guard1.id, 1),
          h.wire(b2.id, guard2.id, 0), h.wire(inner2.id, guard2.id, 1),
          h.wire(b3.id, guard3.id, 0), h.wire(inner3.id, guard3.id, 1),

          // or_latch_i = F_i.Q ∨ guard_i
          h.wire(f1.id, or1.id, 0), h.wire(guard1.id, or1.id, 1),
          h.wire(f2.id, or2.id, 0), h.wire(guard2.id, or2.id, 1),
          h.wire(f3.id, or3.id, 0), h.wire(guard3.id, or3.id, 1),

          // SCAN_FF: D=or_latch, TI=0, TE=rest, CLK
          h.wire(or1.id,  f1.id, 0), h.wire(zero.id, f1.id, 1), h.wire(rest.id, f1.id, 2),
          h.wire(clk.id,  f1.id, 3, 0, { isClockWire: true }),
          h.wire(or2.id,  f2.id, 0), h.wire(zero.id, f2.id, 1), h.wire(rest.id, f2.id, 2),
          h.wire(clk.id,  f2.id, 3, 0, { isClockWire: true }),
          h.wire(or3.id,  f3.id, 0), h.wire(zero.id, f3.id, 1), h.wire(rest.id, f3.id, 2),
          h.wire(clk.id,  f3.id, 3, 0, { isClockWire: true }),

          // Encoder y[1] = F2 ∨ F3
          h.wire(f2.id, orY1.id, 0), h.wire(f3.id, orY1.id, 1),
          h.wire(orY1.id, yhi.id, 0),
          // y[0] = F1 ∨ F3
          h.wire(f1.id, orY0.id, 0), h.wire(f3.id, orY0.id, 1),
          h.wire(orY0.id, ylo.id, 0),
        ],
      };
    }),
  },

  // ───────────────────────────────────────────────────────────────
  // #2018 — People counter with 2 sensors (slide 26)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'people-counter-two-sensors',
    difficulty: 'medium',
    title: 'מונה אנשים בחדר — שני חיישני תנועה',
    intro:
`תכננו מערכת שמונה את מספר האנשים הנמצאים בכל רגע נתון בחדר מסויים. לרשותך **2 חיישני תנועה**:
\`detector_A\` בצד **חוץ** של הדלת ו-\`detector_B\` בצד **פנים**. כשהחיישן מזהה תנועה הוא מעלה
לוגי \`1\`, כשאין תנועה — \`0\`.

**הנחה:** כל אדם שנכנס או יוצא מהחדר עובר דרך **שני** החיישנים.
- כניסה: \`A → B\` (חוץ אז פנים) → counter++
- יציאה: \`B → A\` (פנים אז חוץ) → counter--`,
    schematic: `
<svg viewBox="0 0 540 240" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="13" role="img" aria-label="2 sensors A, B + room">
  <rect x="260" y="60" width="220" height="160" rx="8" fill="#0a1825" stroke="#80d4ff" stroke-width="2"/>
  <text direction="ltr" x="370" y="150" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="22">ROOM</text>

  <text direction="ltr" x="160" y="90" text-anchor="middle" fill="#f0d080" font-weight="bold">detector A</text>
  <text direction="ltr" x="160" y="106" text-anchor="middle" fill="#806040" font-size="10">(outside)</text>
  <line x1="200" y1="80" x2="260" y2="80" stroke="#f0d080" stroke-width="1.4" stroke-dasharray="3 3"/>

  <text direction="ltr" x="160" y="190" text-anchor="middle" fill="#80f0a0" font-weight="bold">detector B</text>
  <text direction="ltr" x="160" y="206" text-anchor="middle" fill="#608060" font-size="10">(inside, at door)</text>
  <line x1="200" y1="180" x2="260" y2="180" stroke="#80f0a0" stroke-width="1.4" stroke-dasharray="3 3"/>

  <!-- arrows showing direction logic -->
  <text direction="ltr" x="100" y="140" text-anchor="middle" fill="#a0c0e0" font-size="11">A→B = enter (++)</text>
  <text direction="ltr" x="100" y="156" text-anchor="middle" fill="#a0c0e0" font-size="11">B→A = exit  (−−)</text>
</svg>`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'תכנן את ה-FSM. כמה מצבים? איך מבדיל כניסה ויציאה?',
        hints: [
          'FSM זוכר את "הצד שהתחיל לראות תנועה ראשון."',
          '4 מצבים: \\\`IDLE\\\`, \\\`SAW_A\\\` (זיהינו A, מחכים ל-B), \\\`SAW_B\\\` (זיהינו B, מחכים ל-A), ו-\\\`DONE\\\` (לא חובה — אפשר לחזור ישר ל-IDLE).',
          'מעבר: IDLE + A=1 → SAW_A. IDLE + B=1 → SAW_B.',
          'SAW_A + B=1 → counter++, חזור ל-IDLE. SAW_B + A=1 → counter−−, חזור ל-IDLE.',
          'הפלט הוא ערך COUNTER (לא משתנה state) — מונה רגיל עם enable מותנה.',
        ],
        answerSchematic: `
<svg viewBox="0 0 900 600" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="12" role="img" aria-label="People counter FSM with clear state transitions">
  <defs>
    <marker id="pc2Arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80d4ff"/></marker>
    <marker id="pc2ArrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
    <marker id="pc2ArrR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff8060"/></marker>
    <filter id="pc2Glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feFlood flood-color="#80d4ff" flood-opacity="0.4"/>
      <feComposite in2="SourceAlpha" operator="in" result="g"/>
      <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Title -->
  <rect x="0" y="0" width="900" height="44" fill="#0c1a28"/>
  <text direction="ltr" x="450" y="28" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    FSM:  3 states  •  Direction inferred from order of A and B pulses
  </text>

  <!-- ─── 3 state circles with EXTERNAL labels for clarity ─── -->
  <!-- SAW_A — top-left -->
  <circle cx="180" cy="180" r="60" fill="#143824" stroke="#f0d080" stroke-width="2.4" filter="url(#pc2Glow)"/>
  <text direction="ltr" x="180" y="186" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="18">SAW_A</text>
  <text direction="ltr" x="180" y="98" text-anchor="middle" fill="#a09060" font-size="11" font-style="italic">"saw A first, waiting for B"</text>

  <!-- IDLE — center -->
  <circle cx="450" cy="320" r="60" fill="#143049" stroke="#80d4ff" stroke-width="2.4" filter="url(#pc2Glow)"/>
  <text direction="ltr" x="450" y="326" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="20">IDLE</text>
  <text direction="ltr" x="450" y="408" text-anchor="middle" fill="#80a0c0" font-size="11" font-style="italic">"no activity, ready to detect"</text>

  <!-- SAW_B — top-right -->
  <circle cx="720" cy="180" r="60" fill="#142824" stroke="#80f0a0" stroke-width="2.4" filter="url(#pc2Glow)"/>
  <text direction="ltr" x="720" y="186" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="18">SAW_B</text>
  <text direction="ltr" x="720" y="98" text-anchor="middle" fill="#608060" font-size="11" font-style="italic">"saw B first, waiting for A"</text>

  <!-- Start arrow into IDLE from below -->
  <line x1="450" y1="450" x2="450" y2="384" stroke="#80d4ff" stroke-width="2" marker-end="url(#pc2Arr)"/>
  <text direction="ltr" x="478" y="438" fill="#80d4ff" font-size="11">start</text>

  <!-- ─── 4 transitions, clearly labeled ─── -->

  <!-- IDLE → SAW_A on A=1 -->
  <path d="M 396 286 Q 280 250 230 220" fill="none" stroke="#80d4ff" stroke-width="1.8" marker-end="url(#pc2Arr)"/>
  <text direction="ltr" x="290" y="244" text-anchor="middle" fill="#80d4ff" font-size="12" font-weight="bold">A=1</text>

  <!-- IDLE → SAW_B on B=1 -->
  <path d="M 504 286 Q 620 250 670 220" fill="none" stroke="#80d4ff" stroke-width="1.8" marker-end="url(#pc2Arr)"/>
  <text direction="ltr" x="610" y="244" text-anchor="middle" fill="#80d4ff" font-size="12" font-weight="bold">B=1</text>

  <!-- SAW_A → IDLE on B=1, count++ (GREEN) -->
  <path d="M 222 224 Q 320 300 396 326" fill="none" stroke="#80f0a0" stroke-width="2.4" marker-end="url(#pc2ArrG)"/>
  <text direction="ltr" x="270" y="290" text-anchor="middle" fill="#80f0a0" font-size="13" font-weight="bold">B=1  ⟹  count++</text>

  <!-- SAW_B → IDLE on A=1, count-- (RED) -->
  <path d="M 678 224 Q 580 300 504 326" fill="none" stroke="#ff8060" stroke-width="2.4" marker-end="url(#pc2ArrR)"/>
  <text direction="ltr" x="640" y="290" text-anchor="middle" fill="#ff8060" font-size="13" font-weight="bold">A=1  ⟹  count−−</text>

  <!-- ─── COUNTER block below (separated cleanly) ─── -->
  <rect x="200" y="480" width="500" height="90" rx="10" fill="#0a1825" stroke="#f0d080" stroke-width="2"/>
  <text direction="ltr" x="450" y="504" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="15">UP/DOWN COUNTER</text>
  <text direction="ltr" x="240" y="528" fill="#80f0a0" font-size="12">UP   = (state == SAW_A) ∧ B</text>
  <text direction="ltr" x="240" y="546" fill="#ff8060" font-size="12">DOWN = (state == SAW_B) ∧ A</text>
  <text direction="ltr" x="450" y="566" text-anchor="middle" fill="#80f0a0" font-size="12" font-weight="bold">Q = people currently in room</text>

  <!-- Legend at right -->
  <rect x="740" y="320" width="150" height="160" rx="8" fill="#0c1a28" stroke="#5a7090" stroke-width="1"/>
  <text direction="ltr" x="815" y="340" text-anchor="middle" fill="#80a0c0" font-size="11" font-weight="bold">legend</text>
  <line x1="752" y1="356" x2="780" y2="356" stroke="#80d4ff" stroke-width="2"/>
  <text direction="ltr" x="790" y="360" fill="#80d4ff" font-size="11">state transition</text>
  <line x1="752" y1="378" x2="780" y2="378" stroke="#80f0a0" stroke-width="2"/>
  <text direction="ltr" x="790" y="382" fill="#80f0a0" font-size="11">+1 (entry)</text>
  <line x1="752" y1="400" x2="780" y2="400" stroke="#ff8060" stroke-width="2"/>
  <text direction="ltr" x="790" y="404" fill="#ff8060" font-size="11">−1 (exit)</text>
  <text direction="ltr" x="815" y="436" text-anchor="middle" fill="#a0a0c0" font-size="10" font-style="italic">2 D-FFs +</text>
  <text direction="ltr" x="815" y="452" text-anchor="middle" fill="#a0a0c0" font-size="10" font-style="italic">UP/DOWN cnt</text>
  <text direction="ltr" x="815" y="468" text-anchor="middle" fill="#a0a0c0" font-size="10" font-style="italic">+ next-state logic</text>
</svg>`,
        answer:
`**FSM 3-מצבים + UP/DOWN counter.**

### 3 מצבים

| מצב | משמעות |
|------|---------|
| **IDLE** | אין תנועה. כל החיישנים שקטים. |
| **SAW_A** | זיהינו תנועה ב-A (חוץ) ראשון. מחכים ל-B (כניסה). |
| **SAW_B** | זיהינו תנועה ב-B (פנים) ראשון. מחכים ל-A (יציאה). |

### טבלת מעברים

| מצב נוכחי | A | B | מצב הבא | פעולה |
|----------|---|---|---------|--------|
| IDLE | 1 | 0 | SAW_A | — |
| IDLE | 0 | 1 | SAW_B | — |
| IDLE | 0 | 0 | IDLE | — |
| IDLE | 1 | 1 | IDLE | (race — תעלם) |
| SAW_A | 0 | 1 | IDLE | **count++** |
| SAW_A | 1 | 0 | SAW_A | — (עוד ב-A) |
| SAW_A | 0 | 0 | IDLE | (הלכו אחורה? פותחים) |
| SAW_B | 1 | 0 | IDLE | **count−−** |
| SAW_B | 0 | 1 | SAW_B | — (עוד ב-B) |
| SAW_B | 0 | 0 | IDLE | (התחרטו) |

### Counter

\`\`\`
UP_signal   = (state == SAW_A) ∧ B    ← כניסה הושלמה
DOWN_signal = (state == SAW_B) ∧ A    ← יציאה הושלמה
\`\`\`

UP/DOWN counter (למשל 4-bit signed או 8-bit unsigned) מתעדכן בקצה הקלוק:
- אם UP=1: \`Q += 1\`.
- אם DOWN=1: \`Q -= 1\`.
- אחרת: שומר.

### קידוד מצבים (2 D-FFs)

\`\`\`
S0 (IDLE)  = 00
S1 (SAW_A) = 01
S2 (SAW_B) = 10
S3 (לא חוקי, recovery → IDLE) = 11
\`\`\`

### מקרי קצה

1. **\`A = B = 1\` בו-זמנית:** מקרה לא טבעי (אדם לא יכול להיות בשני חיישנים בו-זמנית — אלא אם החיישנים חופפים). במקרה זה, ה-FSM נשאר ב-IDLE (race ignored).

2. **אדם נכנס למסדרון ואז חוזר אחורה (A → no-B → no-A):** ה-FSM יחזור ל-IDLE בלי לעדכן counter (התחזית "התחילה כניסה" אבל לא הסתיימה). מצב בטוח, אך אם החיישנים לא מטופלים נכון יכולה להיות בעיה — סוגית "חיישנים רועשים."

3. **רעש או תנועה חלקית:** בחיישנים אמיתיים נדרש debouncing — פילטר שמחייב שהאות יהיה יציב לפחות N קלוקים לפני שהשמיע 1. זה לא בהיקף השאלה אבל חיוני בפרקטיקה.

### ספירת רכיבים

- 2 D-FFים (FSM state)
- ~6 שערים (next-state logic)
- 1 COUNTER (4-bit או יותר, עם UP/DOWN)
- שערים ל-UP/DOWN: ~4 (2 AND + 1 NOT לזיהוי מצב)`,
        interviewerMindset:
`שאלת FSM קלאסית לבדיקת direction. המראיין מחפש:

1. **מצב ביניים בלתי-מובן** — מועמד שכותב רק 2 מצבים (IDLE / NOT_IDLE) מפספס שצריך **לזכור את הסדר**.
2. **טיפול בחזרה לאחור** (אדם פתח דלת אבל לא נכנס). מועמד שמתעלם — לא לוקח בחשבון real-world.
3. **debouncing** — מועמד בכיר יזכיר שחיישנים אמיתיים זקוקים לסינון רעש.

**שאלת המשך נפוצה:** "ומה אם 2 אנשים נכנסים במקביל זה אחרי זה?" — תלוי במהירות התנועה ו-clock rate. בחלון \`A → B\`, אם השני נכנס מיד אחרי הראשון, ה-FSM יחזור ל-IDLE → SAW_A → counter++ → תקין. אבל אם הם נכנסים מקבילית (overlapping), בעיה. דורש 2+ FSMs פרללים.

**שאלת המשך מתקדמת:** "ולהבחין בין 2 אנשים שנכנסים לאחד שנכנס ויוצא?" — דורש מדידת **משך זמן** של הפעלות החיישנים, לא רק סדר. שאלת FPGA אמיתית.`,
        expectedAnswers: [
          'idle', 'saw_a', 'saw_b',
          '3 states', '3 מצבים',
          'counter', 'מונה',
          'up', 'down',
          'fsm', 'מכונת מצבים',
          'sequence', 'order',
          'a → b', 'b → a',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 26 (People counter)',
    tags: ['fsm', 'direction-detection', 'counter', 'sensors', 'sequential'],
  },

  // ───────────────────────────────────────────────────────────────
  // #2019 — Stream of squares, no MUX (slide 30)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'squares-stream-no-mux',
    difficulty: 'medium',
    title: 'זרם של ריבועי מספרים — בלי MUX',
    intro:
`ממש רכיב לוגי המוציא ברצף את ריבועי המספרים לפי הסדר, **ללא שימוש ב-Multiplexer**.

\`\`\`
Input:  1, 2, 3, 4, 5, 6, ..., 10, ...
Output: 1, 4, 9, 16, 25, 36, ..., 100, ...
\`\`\`

הקלט הוא רצף שלמים סדורים (מקדם clock). הפלט הוא הריבוע של כל קלט בו-זמני.`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'תכנן את המעגל. רמז: יש זהות חישובית פשוטה בין ריבועים עוקבים.',
        hints: [
          'הזהות הקסומה: \\\`(k+1)² - k² = 2k + 1\\\`. ⇒ אם אנחנו יודעים את \\\`k²\\\`, ההפרש לריבוע הבא הוא \\\`2k + 1\\\`.',
          'נחזיק שני רגיסטרים: \\\`k\\\` (counter רגיל) ו-\\\`S\\\` (=k², הפלט).',
          'בכל קצה clock: \\\`S_new = S + 2k + 1\\\`, \\\`k_new = k + 1\\\`.',
          'איך מחשבים \\\`2k\\\` בלי MUX? **shift left by 1 = wire shift** (פשוט מחברים חזרה את הביטים, כל ביט עולה שלב אחד). או \\\`k + k\\\` (יותר יקר).',
          'איך מחשבים \\\`S + 2k + 1\\\`? Adder עם carry-in = 1 (כל adder עם carry-in פשוט מוסיף 1 חינם!).',
          'אתחול: \\\`k = 1\\\`, \\\`S = 1\\\`. אחרי clock 1: \\\`k = 2\\\`, \\\`S = 1 + 2·1 + 1 = 4\\\` ✓.',
        ],
        answerSchematic: `
<svg viewBox="0 0 1080 520" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="12" role="img" aria-label="Stream of squares: 3 ALU pipeline implementing S_new = S + 2k + 1">
  <defs>
    <linearGradient id="sqBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#143049"/><stop offset="1" stop-color="#0a1825"/>
    </linearGradient>
    <marker id="sqArrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
    <marker id="sqArrB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80d4ff"/></marker>
    <marker id="sqArrY" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#f0d080"/></marker>
  </defs>

  <!-- Title -->
  <rect x="0" y="0" width="1080" height="50" fill="#0c1a28"/>
  <text direction="ltr" x="540" y="22" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    Identity:  (k+1)² − k² = 2k + 1   ⇒   S_new = S + 2k + 1
  </text>
  <text direction="ltr" x="540" y="40" text-anchor="middle" fill="#80a0c0" font-size="11">
    Implementation:  3 ALU stages (because ALU has 2 operands; the "+1" is its own stage)
  </text>

  <!-- ── COUNTER k (top-left) ── -->
  <rect x="80" y="100" width="140" height="80" rx="8" fill="url(#sqBody)" stroke="#f0d080" stroke-width="2"/>
  <text direction="ltr" x="150" y="136" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="14">COUNTER k</text>
  <text direction="ltr" x="150" y="156" text-anchor="middle" fill="#a08040" font-size="10">EN=1, auto +1</text>
  <text direction="ltr" x="150" y="172" text-anchor="middle" fill="#a08040" font-size="10">init = 1</text>

  <!-- k output going right -->
  <line x1="220" y1="140" x2="310" y2="140" stroke="#f0d080" stroke-width="1.6" marker-end="url(#sqArrY)"/>
  <text direction="ltr" x="265" y="132" text-anchor="middle" fill="#f0d080" font-size="11" font-weight="bold">k</text>

  <!-- ── ALU stage 1: SHL (k << 1 = 2k) ── -->
  <rect x="310" y="100" width="140" height="80" rx="8" fill="url(#sqBody)" stroke="#80d4ff" stroke-width="2"/>
  <text direction="ltr" x="380" y="130" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="13">ALU SHL</text>
  <text direction="ltr" x="380" y="150" text-anchor="middle" fill="#a0c0e0" font-size="10">A=k, B=1</text>
  <text direction="ltr" x="380" y="166" text-anchor="middle" fill="#a0c0e0" font-size="10">OP=SHL → k&lt;&lt;1</text>

  <!-- 2k output -->
  <line x1="450" y1="140" x2="540" y2="140" stroke="#80d4ff" stroke-width="1.6" marker-end="url(#sqArrB)"/>
  <text direction="ltr" x="495" y="132" text-anchor="middle" fill="#80d4ff" font-size="11" font-weight="bold">2k</text>

  <!-- ── ALU stage 2: ADD (2k + 1) ── -->
  <rect x="540" y="100" width="140" height="80" rx="8" fill="url(#sqBody)" stroke="#80d4ff" stroke-width="2"/>
  <text direction="ltr" x="610" y="130" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="13">ALU ADD</text>
  <text direction="ltr" x="610" y="150" text-anchor="middle" fill="#a0c0e0" font-size="10">A=2k, B=1</text>
  <text direction="ltr" x="610" y="166" text-anchor="middle" fill="#a0c0e0" font-size="10">OP=ADD → 2k+1</text>

  <!-- 2k+1 output -->
  <line x1="680" y1="140" x2="780" y2="140" stroke="#80d4ff" stroke-width="1.6"/>
  <text direction="ltr" x="730" y="132" text-anchor="middle" fill="#80d4ff" font-size="11" font-weight="bold">2k+1</text>
  <line x1="780" y1="140" x2="780" y2="240" stroke="#80d4ff" stroke-width="1.6"/>
  <line x1="780" y1="240" x2="800" y2="240" stroke="#80d4ff" stroke-width="1.6" marker-end="url(#sqArrB)"/>

  <!-- ── ALU stage 3: ADD (S + (2k+1)) ── -->
  <rect x="800" y="200" width="160" height="80" rx="8" fill="url(#sqBody)" stroke="#80f0a0" stroke-width="2"/>
  <text direction="ltr" x="880" y="230" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="13">ALU ADD</text>
  <text direction="ltr" x="880" y="250" text-anchor="middle" fill="#a0c0e0" font-size="10">A=S, B=2k+1</text>
  <text direction="ltr" x="880" y="266" text-anchor="middle" fill="#a0c0e0" font-size="10">OP=ADD → S_new</text>

  <!-- S input to stage 3 (from REGISTER S) -->
  <line x1="280" y1="360" x2="800" y2="280" stroke="#80f0a0" stroke-width="1.6"/>
  <text direction="ltr" x="500" y="324" fill="#80f0a0" font-size="11" font-weight="bold">S</text>

  <!-- ── REGISTER S (bottom-left) ── -->
  <rect x="200" y="320" width="160" height="80" rx="8" fill="url(#sqBody)" stroke="#80f0a0" stroke-width="2"/>
  <text direction="ltr" x="280" y="356" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="14">REGISTER S</text>
  <text direction="ltr" x="280" y="378" text-anchor="middle" fill="#608060" font-size="10">init = 1, EN=1</text>

  <!-- S_new feedback loop: ALU3.out → REG.D -->
  <line x1="960" y1="240" x2="1010" y2="240" stroke="#80f0a0" stroke-width="1.6"/>
  <text direction="ltr" x="985" y="232" text-anchor="middle" fill="#80f0a0" font-size="10" font-weight="bold">S_new</text>
  <line x1="1010" y1="240" x2="1010" y2="440" stroke="#80f0a0" stroke-width="1.6" stroke-dasharray="6 3"/>
  <line x1="1010" y1="440" x2="280" y2="440" stroke="#80f0a0" stroke-width="1.6" stroke-dasharray="6 3"/>
  <line x1="280" y1="440" x2="280" y2="400" stroke="#80f0a0" stroke-width="1.6" stroke-dasharray="6 3" marker-end="url(#sqArrG)"/>

  <!-- S → output Y -->
  <circle cx="360" cy="360" r="4" fill="#80f0a0"/>
  <line x1="360" y1="360" x2="960" y2="360" stroke="#80f0a0" stroke-width="2" marker-end="url(#sqArrG)"/>
  <text direction="ltr" x="1010" y="356" text-anchor="middle" fill="#80f0a0" font-weight="bold" font-size="16">Y = k²</text>

  <!-- Sequence example -->
  <text direction="ltr" x="540" y="476" text-anchor="middle" fill="#80d4ff" font-size="12" font-weight="bold">Sequence after each clock:</text>
  <text direction="ltr" x="540" y="496" text-anchor="middle" fill="#a0c0e0" font-size="11" font-family="monospace">
    k:   1    2    3    4    5    6    7    8    9    10
  </text>
  <text direction="ltr" x="540" y="514" text-anchor="middle" fill="#80f0a0" font-size="11" font-family="monospace">
    S:   1    4    9   16   25   36   49   64   81   100
  </text>
</svg>`,
        answer:
`**אלגוריתם דיפרנציאלי — \`S_new = S + 2k + 1\`.**

### העיקרון

מתמטית: \`(k+1)² = k² + 2k + 1\`. אז אם נשמור את \`S = k²\` ברגיסטר, נוכל לעדכן אותו בכל קלוק בלי לחשב את הריבוע מחדש — רק להוסיף \`2k + 1\`.

### רכיבים

| רכיב | תיאור |
|------|---------|
| **COUNTER k** | רגיסטר מונה, אתחול 1, מתעדכן \`k_new = k + 1\` |
| **\`<<1\`** | שיפט-שמאל = הזזת ה-wires (לא רכיב אמיתי) → מחשב \`2k\` |
| **Adder** | מחשב \`S + 2k + 1\` — ה-+1 מגיע מ-\`Cin = 1\` בקצה הנמוך |
| **REGISTER S** | רגיסטר \`k²\`, אתחול 1, מתעדכן \`S_new = ADDER.out\` |

### למה אין צורך ב-MUX

- ההזזה ב-1 ימינה (\`<<1\`) היא **חיווט בלבד** — לא רכיב לוגי. בעצם, מחברים את ביט i של k אל ביט i+1 של אות חדש.
- ה-+1 הוא **\`Cin = 1\`** למחבר — כל מחבר תומך בזה inherently, ללא MUX.
- אין צורך לבחור בין מקורות נתונים → אין MUX.

### אתחול

\`\`\`
k_init = 1, S_init = 1
\`\`\`

אחרי קלוק 1:
\`\`\`
k = 2
S_new = 1 + 2·1 + 1 = 4   ✓  (= 2²)
\`\`\`

אחרי קלוק 2:
\`\`\`
k = 3
S_new = 4 + 2·2 + 1 = 9   ✓  (= 3²)
\`\`\`

### יתרון על "חישוב ישיר"

חישוב ישיר: \`Y = k · k\` דורש **מכפיל** — רכיב יקר (O(N²) שערים).

האלגוריתם הדיפרנציאלי: **מחבר** + שיפט (=חיווט) — \`O(N)\` שערים. **חיסכון משמעותי בשטח.**

### הכללה — \`k³\` בזרם

\`(k+1)³ - k³ = 3k² + 3k + 1\`. אבל \`3k²\` עצמו דורש מכפיל. אלא אם נשמור גם \`3k²\` ברגיסטר ונעדכן אותו בנפרד: \`3(k+1)² = 3k² + 6k + 3\`. עוד adder + שיפט. אפשרי לבנות **רגיסטרים מקושרים** שיוצרים כל פולינום בעלות לינארית. זוהי **שיטת ההפרשים הסופיים** (finite differences) — מבוססת רגיסטרים בלבד.`,
        interviewerMindset:
`שאלה אהובה לבדיקת **חשיבה מבנית**. המראיין מחפש:

1. **שאתה זוכר/מגלה את הזהות \`(k+1)² - k² = 2k + 1\`** — מעבר מ"חשב את הריבוע" ל"עדכן את הריבוע."
2. **שאתה מבחין שאין צורך ב-MUX** — שיפט = חיווט, +1 = Cin.
3. **שאתה רואה את הקשר ל-finite differences** — בונוס גדול. זו שיטה קלאסית במיכון של חישובים סדרתיים.

**שאלת המשך:** "ומה אם הקלט הוא \`k\` עצמו (לא מתחילים מ-1)?" — אז צריך לחשב את \`k²\` "מאפס" כדי לאתחל את \`S\`. מכפיל פעם אחת באתחול, ואז שמירה על האלגוריתם הדיפרנציאלי.

**שאלת bonus:** "ומה ההגבלה של overflow?" — אחרי \`N = 65\` קלוקים, \`k² = 4225\` > 12 ביטים. צריך adder + register רחבים מספיק כדי להחזיק את הטווח הרצוי. או wrap-around — תלוי בדרישה.`,
        expectedAnswers: [
          '(k+1)² - k² = 2k + 1',
          '2k + 1', '2k+1',
          's + 2k + 1',
          'shift', 'שיפט',
          'cin', 'carry in',
          'adder', 'מחבר',
          'register', 'רגיסטר',
          'k², s',
          'differential', 'finite differences',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 30 (Squares stream, no MUX)',
    tags: ['stream', 'incremental', 'finite-differences', 'adder', 'sequential'],
    // Canvas: incremental squares using COUNTER k + REGISTER S + ALU (ADD).
    // Each clock: S_new = S + 2k + 1.  Output Y = S.
    //
    // Default init: k = 1, S = 1.  After ticks: S = 4, 9, 16, 25, 36, ...
    circuit: () => build(() => {
      const clk = h.clock(80, 460);
      // Constants
      const enOne = h.input(80, 120, 'EN=1');   enOne.fixedValue = 1;
      const one   = h.input(80, 280, 'B=1');    one.fixedValue = 1;   // for "+1" via Cin alt: B operand
      const opAdd = h.input(80, 360, 'OP=ADD'); opAdd.fixedValue = 0; // ALU op 0 = ADD
      // COUNTER k (3-bit for demo, counts 0,1,2,...,7 then wraps; init handled in engine separately)
      const cntK = h.block('COUNTER', 260, 120, { bitWidth: 4, label: 'CNT k' });
      // Left-shift k by 1 → 2k. We can achieve this without a dedicated shifter
      // by using ALU SHL: A=k, B=1, OP=SHL(5).
      const opShl = h.input(80, 200, 'OP=SHL'); opShl.fixedValue = 5;
      const aluShl = h.block('ALU', 460, 160, { bitWidth: 8, label: 'ALU 2k = k<<1' });
      // ALU_add: result = (2k) + S + Cin(1).  Use ADD with B=S and feed in (2k).
      // Wait — ALU has 2 operands. We want (2k + 1) + S = three terms.
      // Approach: two ALU stages.
      //   Stage 1: A = 2k, B = 1, OP = ADD → outputs (2k + 1).
      //   Stage 2: A = (2k+1), B = S, OP = ADD → outputs S_new.
      const aluAdd1 = h.block('ALU', 640, 240, { bitWidth: 8, label: 'ALU 2k+1' });
      const aluAdd2 = h.block('ALU', 820, 320, { bitWidth: 8, label: 'ALU S+(2k+1)' });
      // S register (8-bit)
      const regS = h.block('REGISTER', 460, 360, { bitWidth: 8, label: 'REG S=k²' });
      // Outputs
      const oY = h.output(1040, 320, 'Y = S = k²');
      const oK = h.output(460, 60,  'k');
      return {
        nodes: [clk, enOne, one, opAdd, opShl,
                cntK, aluShl, aluAdd1, aluAdd2, regS,
                oY, oK],
        wires: [
          // CNT k: EN=1, CLK
          h.wire(enOne.id, cntK.id, 0),
          h.wire(clk.id, cntK.id, 4, 0, { isClockWire: true }),
          // ALU SHL: A=k, B=1, OP=SHL → 2k
          h.wire(cntK.id, aluShl.id, 0),
          h.wire(one.id,  aluShl.id, 1),
          h.wire(opShl.id, aluShl.id, 2),
          // ALU ADD1: A=2k, B=1, OP=ADD → 2k+1
          h.wire(aluShl.id, aluAdd1.id, 0),
          h.wire(one.id,    aluAdd1.id, 1),
          h.wire(opAdd.id,  aluAdd1.id, 2),
          // ALU ADD2: A=S, B=2k+1, OP=ADD → S_new
          h.wire(regS.id,    aluAdd2.id, 0),
          h.wire(aluAdd1.id, aluAdd2.id, 1),
          h.wire(opAdd.id,   aluAdd2.id, 2),
          // S register: DATA=ALU_ADD2.out, EN=1, CLK
          h.wire(aluAdd2.id, regS.id, 0),
          h.wire(enOne.id,   regS.id, 1),
          h.wire(clk.id, regS.id, 3, 0, { isClockWire: true }),
          // Outputs
          h.wire(regS.id, oY.id, 0),
          h.wire(cntK.id, oK.id, 0),
        ],
      };
    }),
  },
];
