/**
 * IQ — Timing & CDC questions.
 *
 * Static import target: js/interview/questions.js will `import { QUESTIONS }`
 * from this file. Add new entries to the QUESTIONS array; the engine picks
 * them up automatically.
 *
 * Question shape — see IQ/README.md. Notable optional fields:
 *   schematic        — raw SVG/HTML string rendered above the prompt (we
 *                      author every byte of it, so direct innerHTML is safe).
 *   parts[].expectedAnswers — array of accepted strings; if present the UI
 *                      shows an answer-input + "בדוק" button. Match is
 *                      case-insensitive substring against the trimmed input.
 *   circuit          — () => ({ nodes, wires }). Builds a working circuit
 *                      that matches the schematic. The panel exposes a
 *                      "טען על הקנבס" button; the engine snapshots the
 *                      user's scene first so their work is restorable.
 */

import { build, h } from '../../js/interview/circuitHelpers.js';

// Inline SVG of a 3-stage shift register + CLK/INPUT waveforms. Authored
// from scratch; no copyright concern. Colours pull from the panel palette.
const SHIFT_REG_SVG = `
<svg viewBox="0 0 480 240" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', monospace" font-size="11" role="img" aria-label="Three-stage shift register with clock and input waveforms">
  <defs>
    <marker id="ivArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#c8d8f0"/>
    </marker>
    <marker id="ivArrowRed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#f08080"/>
    </marker>
  </defs>

  <!-- CLK waveform: 7 square pulses -->
  <text x="0" y="22" fill="#c8d8f0">clk</text>
  <path d="M 40 30 v -12 h 20 v 12 h 20 v -12 h 20 v 12 h 20 v -12 h 20 v 12 h 20 v -12 h 20 v 12 h 20 v -12 h 20 v 12 h 20 v -12 h 20 v 12 h 20 v -12 h 20 v 12 h 20"
        fill="none" stroke="#f0d080" stroke-width="1.6"/>

  <!-- INPUT waveform: low until mid-stream, then rises and stays high -->
  <text x="0" y="68" fill="#c8d8f0">input</text>
  <path d="M 40 80 h 160 v -16 h 240" fill="none" stroke="#80b0e0" stroke-width="1.6"/>

  <!-- "התחלה" marker — placed in the empty band BELOW the input
       waveform; arrow points up at the bottom of the rising edge. -->
  <g>
    <line x1="252" y1="105" x2="206" y2="84" stroke="#f08080" stroke-width="1.5" marker-end="url(#ivArrowRed)"/>
    <text x="258" y="110" fill="#f08080" font-size="11" font-weight="bold">התחלה</text>
  </g>

  <!-- Schematic: input → DFF → DFF → DFF → out, all sharing clk -->
  <g transform="translate(0, 130)">
    <text x="0" y="35" fill="#c8d8f0">input</text>
    <line x1="40" y1="32" x2="78" y2="32" stroke="#c8d8f0" stroke-width="1.4" marker-end="url(#ivArrow)"/>

    <!-- DFF 1 -->
    <rect x="78" y="10" width="80" height="50" fill="#0a1520" stroke="#80f0a0" stroke-width="1.6" rx="3"/>
    <text x="118" y="35" text-anchor="middle" fill="#80f0a0" font-weight="bold">DFF</text>
    <text x="86"  y="22" fill="#80a0c0" font-size="9">D</text>
    <text x="148" y="22" text-anchor="end" fill="#80a0c0" font-size="9">Q</text>
    <text x="118" y="56" text-anchor="middle" fill="#80a0c0" font-size="9">clk</text>

    <!-- Q1 -> D2 -->
    <line x1="158" y1="32" x2="200" y2="32" stroke="#c8d8f0" stroke-width="1.4" marker-end="url(#ivArrow)"/>

    <!-- DFF 2 -->
    <rect x="200" y="10" width="80" height="50" fill="#0a1520" stroke="#80f0a0" stroke-width="1.6" rx="3"/>
    <text x="240" y="35" text-anchor="middle" fill="#80f0a0" font-weight="bold">DFF</text>
    <text x="208" y="22" fill="#80a0c0" font-size="9">D</text>
    <text x="270" y="22" text-anchor="end" fill="#80a0c0" font-size="9">Q</text>
    <text x="240" y="56" text-anchor="middle" fill="#80a0c0" font-size="9">clk</text>

    <!-- Q2 -> D3 -->
    <line x1="280" y1="32" x2="322" y2="32" stroke="#c8d8f0" stroke-width="1.4" marker-end="url(#ivArrow)"/>

    <!-- DFF 3 -->
    <rect x="322" y="10" width="80" height="50" fill="#0a1520" stroke="#80f0a0" stroke-width="1.6" rx="3"/>
    <text x="362" y="35" text-anchor="middle" fill="#80f0a0" font-weight="bold">DFF</text>
    <text x="330" y="22" fill="#80a0c0" font-size="9">D</text>
    <text x="392" y="22" text-anchor="end" fill="#80a0c0" font-size="9">Q</text>
    <text x="362" y="56" text-anchor="middle" fill="#80a0c0" font-size="9">clk</text>

    <!-- Out -->
    <line x1="402" y1="32" x2="448" y2="32" stroke="#c8d8f0" stroke-width="1.4" marker-end="url(#ivArrow)"/>
    <text x="455" y="35" fill="#c8d8f0">out</text>

    <!-- Shared clk bus -->
    <line x1="118" y1="60" x2="118" y2="78" stroke="#f0d080" stroke-width="1.2"/>
    <line x1="240" y1="60" x2="240" y2="78" stroke="#f0d080" stroke-width="1.2"/>
    <line x1="362" y1="60" x2="362" y2="78" stroke="#f0d080" stroke-width="1.2"/>
    <line x1="118" y1="78" x2="362" y2="78" stroke="#f0d080" stroke-width="1.2"/>
    <text x="370" y="82" fill="#f0d080" font-size="10">clk</text>
  </g>
</svg>
`;

export const QUESTIONS = [
  {
    id: 'shift-register-setup-hold',
    difficulty: 'medium',
    title: 'שרשרת D-FFs: זיהוי הפרת setup / hold לפי הזמן שבו הפלט מגיב',
    intro:
`נתון מעגל של שלוש D-flip-flops בשרשרת (shift register באורך 3).
כולן דוגמות באותו \`clk\`. ה-input מתחיל ב-0 ועולה ל-1 באמצע הריצה,
וה-clk רץ ברציפות. ב-3 הסעיפים נחקור את הפלט במצב נומינלי, ובשני
תרחישים שבהם זמן התגובה שונה מהמצופה.`,
    schematic: SHIFT_REG_SVG,
    parts: [
      {
        label: 'א',
        question: 'מה יהיה הפלט (\`out\`) לאחר 3 מחזורי שעון?',
        hints: [
          'בכל clock edge, הערך של ה-input "זז" שלב אחד קדימה לאורך ה-shift register.',
          'ספור את מספר ה-D-FFs בין ה-input ל-out — בדיוק אותו מספר מחזורים נדרש כדי שערך חדש יגיע מהקלט לפלט.',
        ],
        answer:
`**\`out = 1\` לאחר 3 מחזורי שעון** — התנהגות נומינלית, ללא הפרת אילוצים.

ערך חדש על ה-input זקוק ל-3 clock edges כדי לעבור את 3 ה-FFs:

- **edge 1:** \`Q1 = 1\`
- **edge 2:** \`Q2 = 1\`
- **edge 3:** \`Q3 = out = 1\``,
        expectedAnswers: ['1', 'one', 'high', 'גבוה', 'אחד'],
      },
      {
        label: 'ב',
        question:
`נצפה במדידה ש-\`out\` עולה לאחר **2 מחזורי שעון** בלבד (מהר מהצפוי).
איזה אילוץ תזמון הופר?`,
        hints: [
          'פלט מהיר מהצפוי = ה-data חצה שלב נוסף באותו clock edge. איזו הפרה גורמת לזה?',
          'נזכר ש-**hold time** הוא הזמן שאחרי clock edge שבו ה-D חייב להישאר יציב.',
          'אם \`tCQ(FF1) + tWire < tHold(FF2)\`, ה-D של FF2 משתנה לפני שחלון ה-hold שלו נסגר — race-through.',
        ],
        answer:
`**הפרת \`hold time\`** — תופעה: race-through.

ב-edge מסוים, FF1 דוגם 1, ועד שהזמן של FF2 לסיים את חלון ה-hold שלו —
ה-D של FF2 כבר השתנה ל-1, אז גם FF2 דוגם את הערך החדש באותו edge.
שלב מדלג, ולכן \`out = 1\` כבר אחרי 2 מחזורים.

**סיבה נפוצה:** clock skew, או נתיב קצר מדי בין FFs (מעט buffering).`,
        expectedAnswers: ['hold', 'hold time', 'thold', 'הפרת hold', 'אילוץ hold'],
      },
      {
        label: 'ג',
        question:
`איך נתקן את הבעיה מסעיף ב' (race-through בין ה-FFs)?
איזה רכיב או שיטה היו מוסיפים לעיצוב?`,
        hints: [
          'אם הבעיה היא ש-data "רץ" מהר מדי בין FFs, מה צריך *להאט* את הנתיב?',
          'בנתיב הנתונים בין שני FFs צמודים, איזה רכיב פסיבי מוסיף השהיה ידועה?',
          'הפתרון התעשייתי הסטנדרטי: הוספת \`buffer / delay cells\` בנתיב ה-data, ובמקביל איזון של ה-clock tree.',
        ],
        answer:
`**הוספת \`buffer\` (insertion delay) בנתיב ה-data** + איזון \`clock tree\`.

- בין FF1 ל-FF2 משרשרים buffer cells שמוסיפים השהיה מבוקרת. זה
  מבטיח ש-\`tCQ(FF1) + tWire + tBuf > tHold(FF2)\` — חלון ה-hold
  של FF2 נסגר לפני שה-D שלו משתנה.
- במקביל מאזנים את ה-clock tree (CTS — clock tree synthesis) כך
  שה-skew בין FF1 ל-FF2 מינימלי.

**איך זה מזוהה בעיצוב:** Static Timing Analysis (STA) מדווח על hold
slack שלילי. בשלב hold-fix אחרי placement, הכלים מוסיפים אוטומטית
buffer cells לכל path עם slack שלילי, עד שכולם חיוביים.`,
        expectedAnswers: ['buffer', 'בופר', 'delay', 'השהיה', 'insertion delay', 'cts', 'clock tree'],
      },
      {
        label: 'ד',
        question:
`במדידה אחרת \`out\` עולה לאחר **4 מחזורי שעון** (איטי מהצפוי).
איזה אילוץ תזמון הופר כעת?`,
        hints: [
          'פלט איטי מהצפוי = ה-data התעכב מחזור נוסף. איזו הפרה גורמת ל-FF לפספס edge?',
          'נזכר ש-**setup time** הוא הזמן *לפני* ה-edge שבו ה-D חייב להיות יציב.',
          'אם ה-input משתנה קרוב מדי ל-edge, FF1 דוגם את הערך הישן (0) ובעדיף הבא רק אז דוגם 1.',
        ],
        answer:
`**הפרת \`setup time\`** — תופעה: שלב פוספס, פלט מתעכב מחזור.

השינוי ב-input קרה פחות מ-\`tSetup\` לפני ה-edge. FF1 דוגם את הערך
הישן (0); רק ב-edge הבא הוא דוגם 1. לכן \`out = 1\` רק אחרי 4 מחזורים.

**במקרה גרוע:** FF1 נכנס ל-metastability — \`Q\` לא מוגדר למשך זמן,
והפלט יכול להיות "זבל" למחזור.

**סיבות נפוצות:** logic depth גדול מדי בין FFs, תדר שעון גבוה מדי,
או אות אסינכרוני שנכנס לקלוקל סינכרוני בלי שכבת סנכרון.`,
        expectedAnswers: ['setup', 'setup time', 'tsetup', 'הפרת setup', 'אילוץ setup'],
      },
      {
        label: 'ה',
        question:
`איך נתקן את הבעיה מסעיף ד' (פספוס edge עקב חוסר זמן setup)?
שלוש שיטות שונות, לפי סוג המקור.`,
        hints: [
          'אם הבעיה היא נתיב לוגי ארוך מדי בין FFs, איך אפשר לחתוך אותו לחלקים קצרים יותר?',
          'מה קורה אם נוריד את תדר השעון? איך זה משפיע על אילוץ ה-setup?',
          'אם הבעיה היא שה-input אסינכרוני (לא מהשעון שלנו), נדרש מבנה ספציפי לפני שהוא נכנס למעגל הסינכרוני.',
        ],
        answer:
`שלושה תיקונים, לפי האבחנה:

- **logic depth גדול מדי בין FFs:** הוספת \`pipeline register\` באמצע
  ה-combinational path. זה חוצה את הנתיב לשני שלבים קצרים יותר —
  כל שלב עומד ב-\`tSetup\` עם slack חיובי.
- **תדר שעון גבוה מדי:** הורדת ה-clock frequency (\`tCycle\` גדל,
  ולכן \`tCycle - tSetup - tCQ\` הופך לחיובי). פתרון תקף, אבל
  מקריב throughput.
- **אות אסינכרוני (CDC):** הוספת \`2-FF synchronizer\` על clock היעד —
  שתי D-FFs רצופות מקטינות באקספוננציאליות את ההסתברות
  ל-metastability שתתפשט לעיצוב הסינכרוני.

**איך זה מזוהה בעיצוב:** Static Timing Analysis (STA) מדווח על setup
slack שלילי לכל path בעייתי. הכלי מציע אוטומטית "where to retime"
ב-Synopsys / Cadence flows. עבור CDC, נדרש כלי נפרד (CDC checker)
שמאתר אותות שחוצים clock domains בלי synchronizer.

**טבלת השוואה — שני סוגי ההפרות והתיקונים שלהן:**

| | hold violation (ב, ג) | setup violation (ד, ה) |
|---|---|---|
| **תופעה** | מהר מדי | איטי מדי |
| **שלבים** | מדלג שלב | מתעכב שלב |
| **סיבה** | clock skew, נתיב קצר | logic ארוך, תדר גבוה, async |
| **תיקון** | buffer + clock balance | pipeline reg, ↓ תדר, 2-FF sync |
| **שלב flow** | hold-fix אחרי placement | retiming + CDC review |`,
        expectedAnswers: ['pipeline', 'pipeline register', 'synchronizer', '2-ff', 'two flip', 'תדר', 'frequency', 'retiming'],
      },
    ],
    source: 'מאגר ראיונות — שאלה רב-סעיפית',
    tags: ['ff', 'timing', 'setup-hold', 'shift-register', 'metastability', 'cdc'],
    circuitRevealsAnswer: true,
    circuit: () => build(() => {
      // input → DFF1 → DFF2 → DFF3 → out, all sharing the same clock.
      const inp  = h.input(140, 200, 'input');
      const clk  = h.clock(140, 460);
      const ff1  = h.ffD(380, 200, 'DFF1');
      const ff2  = h.ffD(620, 200, 'DFF2');
      const ff3  = h.ffD(860, 200, 'DFF3');
      const out  = h.output(1100, 200, 'out');
      inp.fixedValue = 1;  // matches the "input rises to 1" state in the waveform —
                           // STEP three times and the 1 propagates ff1→ff2→ff3→out.
      return {
        nodes: [inp, clk, ff1, ff2, ff3, out],
        wires: [
          h.wire(inp.id, ff1.id, 0),    // input → DFF1.D
          h.wire(clk.id, ff1.id, 1),    // clk   → DFF1.CLK
          h.wire(ff1.id, ff2.id, 0),    // Q1    → DFF2.D
          h.wire(clk.id, ff2.id, 1),    // clk   → DFF2.CLK
          h.wire(ff2.id, ff3.id, 0),    // Q2    → DFF3.D
          h.wire(clk.id, ff3.id, 1),    // clk   → DFF3.CLK
          h.wire(ff3.id, out.id, 0),    // Q3    → out
        ],
      };
    }),
  },

  // ─────────────────────────────────────────────────────────────
  // #5002 — 2-FF synchronizer + metastability + MTBF
  // ─────────────────────────────────────────────────────────────
  {
    id: 'two-ff-synchronizer',
    difficulty: 'medium',
    title: 'סנכרון אות אסינכרוני: 2-FF synchronizer + MTBF',
    intro:
`אות \`async_in\` מגיע מ-clock domain אחר (או מכפתור אסינכרוני).
תכנן מבנה לסנכרון לכניסה ל-domain שלך \`clk\`.
מהי **metastability**, ומה ה-**MTBF**?`,
    parts: [
      {
        label: null,
        question: 'מה המבנה המומלץ, ולמה דווקא 2 FFים?',
        hints: [
          'אם FF דוגם אות שמשתנה ב-±tsetup/thold סביב ה-edge — Q יכול להישאר במצב לא מוגדר זמן-מה (metastable).',
          'הפתרון: עוד FF אחרי הראשון. אם הראשון נתקע ב-meta, יש לו מחזור שלם להירגע לפני שהשני דוגם.',
          'MTBF גדל **אקספוננציאלית** עם הזמן לפני הדגימה הבאה. 2 FFים בדרך כלל מספיקים לתדרים נמוכים; קצבי GHz דורשים 3.',
        ],
        answer:
`**Metastability:** FF שדוגם אות שמשתנה בתוך \`tsetup/thold\` עלול לפלוט \`Q\` במצב ביניים (לא 0 ולא 1) לזמן \`tmet\`. אם \`tmet\` גדול מ-clock period הבא — הערך המטא-יציב מתפשט במעגל ויוצר תקלות.

**הפתרון — 2-FF synchronizer:**

\`\`\`
async_in ──→ [FF1] ──→ [FF2] ──→ sync_out
                ↑          ↑
                clk        clk
\`\`\`

FF1 עלול להיכנס ל-meta, אבל יש לו **clock period שלם** להתייצב לפני ש-FF2 דוגם.

**נוסחת MTBF:**

\`\`\`
MTBF = exp(t_met / τ) / (T_w · f_clk · f_data)
\`\`\`

- \`t_met\` = הזמן שניתן ל-FF להתייצב (≈ clock period פחות tsetup).
- \`τ\` = קבוע הזמן של ה-FF (תהליך-תלוי, ~30 ps לטכנולוגיה מודרנית).
- \`T_w\` = רוחב חלון ה-metastability.

**העיקרון החשוב:** MTBF גדל **אקספוננציאלית** עם t_met. כל FF נוסף בשרשרת מכפיל את t_met → מקטין הסתברות ל-meta בסדרי גודל.

**מתי 3-FF במקום 2?** ב-clk מהיר במיוחד (>1 GHz) או ב-aerospace/medical, שבהם MTBF נדרש להיות שנים-עשרות שנים.

**אזהרה:** סנכרון רק לאות חד-ביטי. עבור bus רב-ביטי דרושה שיטה כמו handshake או Gray code (אחרת ביטים שונים עלולים להגיע ב-cycles שונים).`,
        interviewerMindset:
`השאלה הזו היא **הליטמוס טסט של ראיון ASIC**. אם תיתקע פה — נגמר. רוצה לראות:

1. **מבדיל בין "מה זה metastability" ל-"איך פותרים":** הרבה מועמדים יודעים תיאוריה ולא פתרון.
2. **יודע למה 2 ולא 1:** "כי תוסיף עוד time slot להתייצבות, וההסתברות אקספוננציאלית בזמן."
3. **לא מצמיד סינכרוניזטור ל-bus רב-ביטי:** Gray code, handshake, async FIFO — כולם פתרונות תקפים לפי ההקשר.

**שאלה שמראיין אוהב לזרוק:** "האם 2-FF תופס את הכל?" התשובה: לא. הוא רק מפחית את ההסתברות. \`MTBF\` אינסופי לא קיים. בטכנולוגיה מודרנית, 2-FF נותן MTBF של מאות שנים — לרוב מספיק. ל-aerospace, מוסיפים שלישי.`,
        expectedAnswers: [
          '2', 'two', 'שני', 'שתי',
          'metastability', 'מטא', 'meta',
          'mtbf', 'exponential', 'אקספוננציאלי',
          'gray', 'handshake', 'bus', 'τ', 'tau',
        ],
        circuitRevealsAnswer: true,
        circuit: () => build(() => {
          const async_in = h.input(140, 220, 'async_in');
          const clk      = h.clock(140, 460);
          const ff1      = h.ffD(420, 220, 'FF1');
          const ff2      = h.ffD(700, 220, 'FF2');
          const out      = h.output(960, 220, 'sync_out');
          // Async-style toggling: pretend each STEP is a random arrival.
          async_in.fixedValue = 0;
          async_in.stepValues = [0, 1, 1, 0, 0, 1, 0, 1, 1, 0];
          return {
            nodes: [async_in, clk, ff1, ff2, out],
            wires: [
              h.wire(async_in.id, ff1.id, 0),
              h.wire(clk.id,      ff1.id, 1),
              h.wire(ff1.id,      ff2.id, 0),
              h.wire(clk.id,      ff2.id, 1),
              h.wire(ff2.id,      out.id, 0),
            ],
          };
        }),
      },
    ],
    source: 'מאגר ראיונות — הקלאסיק של CDC (asked everywhere)',
    tags: ['cdc', 'metastability', 'synchronizer', 'mtbf', 'timing'],
  },

  // ───────────────────────────────────────────────────────────────
  // #4001 — 3 D-FF chain: timing analysis (slide 31)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'three-dff-chain-setup-hold',
    difficulty: 'medium',
    title: 'שרשרת 3 D-FFs — ניתוח setup/hold',
    intro:
`נתון המעגל הבא: \`input → DFF₁ → DFF₂ → DFF₃ → out\` — שלושה D-FFים בשרשרת חולקים את אותו clock.

3 חלקים:
- **א.** מה תצפה לראות בפלט \`out\` לאחר 3 מחזורי שעון? (assumes input rises at t=0)
- **ב.** היציאה עולה ל-\`1\` אחרי **שני** מחזורי שעון בלבד (לא 3) — איזה תנאי **לא** התקיים: \`setup\` או \`hold\`?
- **ג.** היציאה עולה ל-\`1\` אחרי **ארבעה** מחזורי שעון (לא 3) — איזה תנאי **לא** התקיים?`,
    schematic: `
<svg viewBox="0 0 660 240" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="13" role="img" aria-label="3 D-FF chain with shared clock">
  <defs>
    <linearGradient id="tdBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#143049"/><stop offset="1" stop-color="#0a1825"/>
    </linearGradient>
    <marker id="tdArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#80f0a0"/></marker>
  </defs>

  <!-- 3 D-FFs -->
  ${[1, 2, 3].map(i => `
    <rect x="${100 + (i - 1) * 160}" y="60" width="110" height="100" rx="8" fill="url(#tdBody)" stroke="#80d4ff" stroke-width="1.8"/>
    <text direction="ltr" x="${155 + (i - 1) * 160}" y="100" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">DFF${i}</text>
    <text direction="ltr" x="${155 + (i - 1) * 160}" y="120" text-anchor="middle" fill="#a0c0e0" font-size="10">D    Q</text>
    <text direction="ltr" x="${155 + (i - 1) * 160}" y="148" text-anchor="middle" fill="#80d4ff" font-size="10">↑ clk</text>
  `).join('')}

  <!-- Input arrow -->
  <text direction="ltr" x="40" y="116" text-anchor="middle" fill="#f0d080" font-weight="bold">input</text>
  <line x1="78" y1="112" x2="100" y2="112" stroke="#f0d080" stroke-width="1.6"/>
  <polygon points="100,112 94,108 94,116" fill="#f0d080"/>

  <!-- Q1 → DFF2.D -->
  <line x1="210" y1="112" x2="260" y2="112" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="235" y="106" text-anchor="middle" fill="#80d4ff" font-size="10">Q1</text>
  <polygon points="260,112 254,108 254,116" fill="#80d4ff"/>

  <!-- Q2 → DFF3.D -->
  <line x1="370" y1="112" x2="420" y2="112" stroke="#80d4ff" stroke-width="1.4"/>
  <text direction="ltr" x="395" y="106" text-anchor="middle" fill="#80d4ff" font-size="10">Q2</text>
  <polygon points="420,112 414,108 414,116" fill="#80d4ff"/>

  <!-- Q3 → out -->
  <line x1="530" y1="112" x2="600" y2="112" stroke="#80f0a0" stroke-width="2" marker-end="url(#tdArr)"/>
  <text direction="ltr" x="630" y="116" text-anchor="middle" fill="#80f0a0" font-weight="bold">out</text>

  <!-- Shared clock -->
  <text direction="ltr" x="330" y="200" text-anchor="middle" fill="#f0d080" font-weight="bold">clk (shared)</text>
  <line x1="330" y1="184" x2="330" y2="160" stroke="#f0d080" stroke-width="1.4"/>
</svg>`,
    circuitRevealsAnswer: true,
    parts: [
      {
        label: 'א',
        question: 'מה תצפה לראות ב-\\\`out\\\` לאחר 3 מחזורי שעון? (assumes input is asserted at start)',
        hints: [
          'כל D-FF "מאחר" את הסיגנל ב-cycle אחד.',
          '3 D-FFs בשרשרת → הסיגנל מתאחר ב-3 cycles.',
          'אם \\\`input = 1\\\` משעה \\\`t=0\\\`, אז \\\`out = 1\\\` משעה \\\`t = 3T_clk\\\` (T_clk = תקופה).',
        ],
        answer:
`**out יעלה ל-\`1\` בדיוק לאחר 3 מחזורי שעון** מהקצה העולה הראשון של ה-clock לאחר ה-\`input = 1\`.

### למה?

כל D-FF "מאחר" את הסיגנל ב-cycle אחד:
- אחרי clock 1: \`Q1 = input\` (input הועתק ל-DFF1)
- אחרי clock 2: \`Q2 = Q1 = input\` (התקדם ל-DFF2)
- אחרי clock 3: \`Q3 = Q2 = input\` ← \`out = 1\` ✓

זוהי **שרשרת shift register** — כל קצה clock מקדם את הסיגנל ב-stage אחד. עומק 3 = שלושה stages = 3 cycles delay (ראה תרשים הזמן מתחת).

זה השימוש הקלאסי של shift register כ-**delay line**.`,
        answerSchematic: `
<svg viewBox="0 0 720 380" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="12" role="img" aria-label="3-DFF chain timing diagram showing 3-cycle delay">
  <!-- Title -->
  <rect x="0" y="0" width="720" height="40" fill="#0c1a28"/>
  <text direction="ltr" x="360" y="26" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="14">
    3-DFF chain: each clock advances the signal one stage → 3-cycle delay
  </text>

  <!-- t=0 marker -->
  <text direction="ltr" x="106" y="64" fill="#f0d080" font-size="10" font-weight="bold">t=0</text>
  <line x1="120" y1="68" x2="120" y2="360" stroke="#806040" stroke-width="0.6" stroke-dasharray="2 3"/>
  <polygon points="120,74 116,66 124,66" fill="#f0d080"/>

  <!-- Clock edge markers + labels -->
  ${[1, 2, 3, 4].map((n, i) => {
    const x = 180 + i * 100;
    return `
      <line x1="${x}" y1="86" x2="${x}" y2="360" stroke="#806040" stroke-width="0.5" stroke-dasharray="2 4"/>
      <text direction="ltr" x="${x}" y="80" text-anchor="middle" fill="#ff8060" font-size="11" font-weight="bold">${n}</text>
      <text direction="ltr" x="${x}" y="68" text-anchor="middle" fill="#ff8060" font-size="10">↑</text>
    `;
  }).join('')}

  <!-- clk waveform -->
  <text direction="ltr" x="60" y="120" text-anchor="end" fill="#c8d8f0" font-weight="bold">clk</text>
  <path d="M 120 130 v -20 h 50 v 20 h 50 v -20 h 50 v 20 h 50 v -20 h 50 v 20 h 50 v -20 h 50 v 20 h 50 v -20 h 50 v 20 h 50 v -20 h 50 v 20"
        stroke="#f0d080" stroke-width="1.6" fill="none"/>

  <!-- input waveform: high from t=0 -->
  <text direction="ltr" x="60" y="180" text-anchor="end" fill="#c8d8f0" font-weight="bold">input</text>
  <path d="M 120 190 v -22 h 530"
        stroke="#80b0e0" stroke-width="1.8" fill="none"/>
  <text direction="ltr" x="680" y="174" text-anchor="middle" fill="#80b0e0" font-size="10" font-style="italic">high from t=0</text>

  <!-- Q1 waveform: rises after clk 1 (x=180) -->
  <text direction="ltr" x="60" y="230" text-anchor="end" fill="#c8d8f0" font-weight="bold">Q1</text>
  <path d="M 120 240 h 60 v -22 h 470"
        stroke="#80f0a0" stroke-width="1.8" fill="none"/>
  <text direction="ltr" x="680" y="224" text-anchor="middle" fill="#80f0a0" font-size="10" font-style="italic">↑ at clk 1</text>

  <!-- Q2 waveform: rises after clk 2 (x=280) -->
  <text direction="ltr" x="60" y="280" text-anchor="end" fill="#c8d8f0" font-weight="bold">Q2</text>
  <path d="M 120 290 h 160 v -22 h 370"
        stroke="#80f0a0" stroke-width="1.8" fill="none"/>
  <text direction="ltr" x="680" y="274" text-anchor="middle" fill="#80f0a0" font-size="10" font-style="italic">↑ at clk 2</text>

  <!-- Q3=out waveform: rises after clk 3 (x=380) -->
  <text direction="ltr" x="60" y="330" text-anchor="end" fill="#ffd060" font-weight="bold">Q3=out</text>
  <path d="M 120 340 h 260 v -22 h 270"
        stroke="#ffd060" stroke-width="2.2" fill="none"/>
  <text direction="ltr" x="680" y="324" text-anchor="middle" fill="#ffd060" font-size="10" font-style="italic">↑ at clk 3</text>
</svg>`,
        expectedAnswers: [
          '3', 'three', 'שלושה',
          'cycle', 'מחזור',
          'shift register', 'shift-reg',
          'delay',
        ],
      },
      {
        label: 'ב',
        question: 'הפלט עולה אחרי **2** מחזורי שעון בלבד — איזה תנאי לא התקיים, setup או hold?',
        hints: [
          '**Hold violation:** הנתון משתנה **מהר מדי** אחרי הקצה — לפני שה-D-FF הספיק "לאחוז" בערך הישן.',
          'בשרשרת \\\`DFF1 → DFF2\\\`: אם \\\`Q1\\\` משתנה (מתעדכן ל-input) ובאותו קלוק \\\`DFF2.D\\\` (= Q1) הצליח להעביר את הערך החדש ל-\\\`DFF2\\\` — זה Hold violation.',
          'תוצאה: 2 ה-FFים "התעדכנו בו-זמנית" — הסיגנל "דילג" שלב. במקום 3 cycles, רק 2.',
          'הסיבה: Q1 שינתה ערך **לפני** ש-DFF2 הספיק לסיים את ה-hold time שלה אחרי הקצה הקודם.',
        ],
        answer:
`**הפר תנאי \`hold\`** (Hold time violation).

### הסבר מדויק

תנאי **hold** דורש שהנתון יישאר יציב על D **למשך זמן \`t_hold\` אחרי הקצה העולה של ה-clock**. אם הנתון משתנה מוקדם מדי (לפני שעבר \`t_hold\`), ה-FF עלול לתפוס את **הערך החדש** במקום הישן.

### בשרשרת DFF1 → DFF2

- בקצה k: DFF1 מעדכן את Q1 לערך חדש (= input).
- אם clk-to-Q של DFF1 + propagation < hold time של DFF2 → ה-Q1 (החדש) מגיע ל-DFF2.D לפני שעבר t_hold → **DFF2 תופס את הערך החדש באותו קצה**.
- ⇒ הסיגנל "דילג" stage אחד: 3 cycles → 2 cycles.

### תרשים זמן עם Hold violation

\`\`\`
clk: ‾|_|‾|_|‾
       ↑ k=1
input rises just before clk[1]
Q1 should: rise after clk[1] (after t_clk-to-Q)
Q1 actual: rises VERY fast → reaches DFF2.D before hold time elapses
Q2 (DFF2.D=Q1): captured the NEW value at clk[1] instead of OLD
              ⇒ Q2 rises at clk[1], not clk[2]
Q3 (DFF3): captures Q2 at clk[2], so out=1 at clk[2]   ← 2 cycles, not 3!
\`\`\`

### הסיבה בפועל

Hold violations בדרך כלל נגרמות מ:
- **clk-to-Q time קצר מדי** (DFF1 מהיר מדי).
- **Propagation delay בין DFFים קטן מדי** (קו קצר).
- **Clock skew בעיתי**.

### תיקון בעיצוב

מוסיפים **buffer/delay** בין DFF1 ל-DFF2 כדי להאריך את ה-propagation והבטיח \`t_hold\` של DFF2.`,
        expectedAnswers: [
          'hold', 'hold time', 'hold violation',
          'hold לא מתקיים', 'hold violation',
          'נתון משתנה', 'מהר מדי',
          'clk-to-q', 'propagation',
          'skip', 'דילוג',
        ],
      },
      {
        label: 'ג',
        question: 'הפלט עולה אחרי **4** מחזורי שעון (איחור של 1) — איזה תנאי לא התקיים?',
        hints: [
          '**Setup violation:** הנתון לא הגיע ליציבות **בזמן** לפני הקצה — ה-D-FF מפספס את הקצה.',
          'בשרשרת \\\`DFF1 → DFF2\\\`: אם \\\`Q1\\\` עוד לא יציב כש-clk עולה ב-DFF2 → DFF2 שומר את הערך הישן (לא קולט).',
          'בקצה הבא הוא יקלוט (כשהנתון כבר יציב) → איחור של cycle אחד.',
          '⇒ 3 cycles הופכים ל-4.',
        ],
        answer:
`**הפר תנאי \`setup\`** (Setup time violation).

### הסבר מדויק

תנאי **setup** דורש שהנתון יהיה יציב על D **למשך זמן \`t_setup\` לפני הקצה העולה של ה-clock**. אם הנתון משתנה מאוחר מדי (פחות מ-\`t_setup\` לפני הקצה), ה-FF עלול לפספס את הקצה ולשמור את הערך הישן.

### בשרשרת DFF1 → DFF2

- בקצה k: DFF1 מעדכן את Q1 לערך חדש (= input).
- ה-propagation מ-DFF1 ל-DFF2 + clk-to-Q של DFF1 גדול מדי → Q1 מגיע ל-DFF2.D **אחרי** ש-t_setup של הקצה הבא (k+1) כבר התחיל.
- ⇒ DFF2 מפספס את הקצה k+1 ושומר את הערך הישן. רק בקצה k+2 הוא יקלוט.
- ⇒ הסיגנל הוסיף stage אחד למסלולו: 3 cycles → 4 cycles.

### תרשים זמן עם Setup violation

\`\`\`
clk:   ‾|_|‾|_|‾|_|‾|_|‾
        ↑ k   k+1  k+2  k+3
input: ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
Q1:    rises just BEFORE clk[k+1], but propagation is slow
Q2 should: rise at clk[k+1] (capture Q1)
Q2 actual: Q1 not stable enough → DFF2 misses → Q2 still 0 at clk[k+1]
Q2:    rises at clk[k+2] instead   ← 1 cycle late
Q3=out: rises at clk[k+3]          ← 4 cycles total, not 3!
\`\`\`

### הסיבה בפועל

Setup violations נגרמות מ:
- **תדר clock גבוה מדי** (לא נשאר זמן בין קצוות).
- **Combinational delay גדול בין FFים** (נתיב לוגי מסובך).
- **Process variation** (chip ייצור איטי).

### תיקון בעיצוב

1. **להוריד את תדר ה-clock** — מאריך את t_clk → יש זמן לנתון להיות יציב.
2. **לחתוך את הלוגיקה ל-pipeline** — DFF נוסף באמצע נתיב ארוך מקטין את ה-combinational depth.
3. **Retiming** — להעביר logic מצד אחד של FF לצד שני (Synopsys/Vivado עושים את זה אוטומטית).

### סיכום: setup vs hold

| תנאי | משמעות | תופעה | תיקון |
|------|---------|--------|---------|
| **Setup** | Data must be stable **before** edge | Output **late** | ↓ frequency, retiming, pipeline |
| **Hold**  | Data must be stable **after** edge | Output **early** / skip | Insert buffer/delay |

זה בדיוק **STA — Static Timing Analysis** — הניתוח שכל chip עובר לפני tape-out.`,
        expectedAnswers: [
          'setup', 'setup time', 'setup violation',
          'setup לא מתקיים', 'setup violation',
          'late', 'איחור', 'מאוחר',
          'frequency', 'תדר',
          'pipeline', 'retiming',
          'sta',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 31 (3-DFF setup/hold)',
    tags: ['setup', 'hold', 'timing', 'sta', 'metastability', 'cdc'],
    // Canvas: 3 D-FFs in series sharing one clock. The simulator gives
    // visual confirmation: input rises, then Q1, Q2, Q3 rise on successive
    // clocks — a clean shift register / 3-cycle delay line.
    circuit: () => build(() => {
      const clk = h.clock(120, 340);
      const inp = h.input(120, 200, 'input'); inp.fixedValue = 0;
      inp.stepValues = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1];   // rises after step 1
      const ff1 = h.ffD(320, 200, 'DFF1');
      const ff2 = h.ffD(520, 200, 'DFF2');
      const ff3 = h.ffD(720, 200, 'DFF3');
      const out = h.output(960, 200, 'out');
      return {
        nodes: [clk, inp, ff1, ff2, ff3, out],
        wires: [
          // Chain
          h.wire(inp.id, ff1.id, 0),
          h.wire(ff1.id, ff2.id, 0),
          h.wire(ff2.id, ff3.id, 0),
          h.wire(ff3.id, out.id, 0),
          // Shared clock
          h.wire(clk.id, ff1.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, ff2.id, 1, 0, { isClockWire: true }),
          h.wire(clk.id, ff3.id, 1, 0, { isClockWire: true }),
        ],
      };
    }),
  },
];
