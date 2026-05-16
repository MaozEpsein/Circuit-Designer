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
];
