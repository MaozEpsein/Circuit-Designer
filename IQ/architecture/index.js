/**
 * IQ — architecture questions. See IQ/README.md and IQ/timing-cdc/index.js
 * for the shape. Add entries to QUESTIONS and they appear in the panel
 * automatically.
 */

export const QUESTIONS = [
  {
    id: 'multiply-with-inc-dec-jz-jnz',
    difficulty: 'medium',
    title: 'כפל ב-inc/dec/jz/jnz בלבד',
    intro:
`התחלה: \`r1=a, r2=b, r3=0, r4=0\`. פקודות זמינות: \`jz, jnz, inc, dec\`. ממש \`r4 = r1·r2\`.`,
    parts: [
      {
        label: 'א',
        editor: 'verilog',
        editorLabel: 'Assembly',
        editorHint: 'כתוב את קטע הקוד בעורך למטה. השתמש רק ב-inc/dec/jz/jnz.',
        starterCode:
`; r1 = a, r2 = b, r3 = 0, r4 = 0
; goal: r4 = r1 * r2 using only inc/dec/jz/jnz

loop_outer:
    ; TODO: terminate when r2 reaches 0

    ; TODO: phase1 — add r1 to r4, copy r1 into r3 in the process

    ; TODO: phase2 — restore r1 from r3

end_mul:
`,
        question: 'כתוב את הקוד. איזה רג\' משמש כמונה? איך משחזרים את r1?',
        hints: [
          'לולאה חיצונית עם r2 (יורד עד 0).',
          'phase1: dec r1, inc r3, inc r4 — מעביר r1 ל-r3 ומוסיף ל-r4.',
          'phase2: שחזר r1 מ-r3. "קפיצה לא-מותנית" = \`jz\` על רג\' שאתה יודע שהוא 0.',
        ],
        answer:
`\`\`\`
loop_outer:
    jz  r2, end_mul
    dec r2
phase1:                ; r4 += r1, copy r1 → r3
    jz  r1, phase2
    dec r1
    inc r3
    inc r4
    jnz r1, phase1
phase2:                ; restore r1 from r3
    jz  r3, loop_outer
    dec r3
    inc r1
    jnz r3, phase2
end_mul:
\`\`\`

**סוף:** \`r1=a, r2=0, r3=0, r4=a·b\`. סיבוכיות \`Θ(ab)\`.

**טריק:** "קפיצה לא-מותנית" ל-\`loop_outer\` מושגת ע"י \`jz r3\` בנקודה שבה r3=0 בוודאות.`,
        interviewerMindset:
`שתי נקודות שמועמדים מפספסים — והמראיין מחכה:

1. **"קפיצה לא-מותנית" בלי הוראה כזו** — לבנות את הזרימה כך שתגיע ל-\`jz\` עם רגיסטר באפס מובטח. זה ה"אהה" של השאלה.
2. **r2 ייצרך — וזה לגיטימי.** הרבה ינסו "לשמור" את r2 במשתנה נוסף. אסור (אין mov). יש להגיד מפורש: "אני מוותר על r2, זה התכן הנכון".

**בונוס:** להזכיר ש-phase1 ו-phase2 פועלות יחד גם כהעתקה (r1→r3) וגם כצבירה (r4 += a) — שתי משימות במכה אחת.`,
        expectedAnswers: [
          'jz r2', 'dec r2', 'jnz r1', 'inc r3', 'inc r4',
          'jz r3', 'inc r1', 'jnz r3',
          'phase1', 'phase2', 'loop_outer',
        ],
      },
    ],
    source: 'מאגר ראיונות — תכנות ברמת ISA עם מערך פקודות מוגבל',
    tags: ['isa', 'assembly', 'control-flow', 'puzzle', 'architecture'],
  },

  // ───────────────────────────────────────────────────────────────
  // #3001 — MIPS 5-stage pipeline (slide 12)
  // ───────────────────────────────────────────────────────────────
  {
    id: 'mips-5stage-pipeline',
    difficulty: 'medium',
    title: 'MIPS 5-stage pipeline — תרשים והעקרונות',
    intro:
`MIPS Classic הוא מעבד RISC עם **5 שלבי pipeline**. זוהי הארכיטקטורה הקלאסית
שמלמדת באוניברסיטה ושנשאלת ברוב ראיונות החומרה. תפקידכם: לתאר את 5 השלבים,
להסביר אילו pipeline registers מפרידים ביניהם, ולנתח את 3 סוגי ה-hazards
ואיך מטפלים בהם.`,
    schematic: `
<svg viewBox="0 0 980 360" xmlns="http://www.w3.org/2000/svg" direction="ltr"
     font-family="'JetBrains Mono', monospace" font-size="12"
     role="img" aria-label="MIPS 5-stage pipeline: IF, ID, EX, MEM, WB">
  <defs>
    <linearGradient id="mipsStage" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#143049"/><stop offset="1" stop-color="#0a1825"/>
    </linearGradient>
    <linearGradient id="mipsPipeReg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a2818"/><stop offset="1" stop-color="#1a1408"/>
    </linearGradient>
  </defs>

  <!-- Title -->
  <rect x="0" y="0" width="980" height="44" fill="#0c1a28"/>
  <text direction="ltr" x="490" y="28" text-anchor="middle" fill="#80d4ff" font-weight="bold" font-size="15">
    MIPS 5-Stage Pipeline:  IF  →  ID  →  EX  →  MEM  →  WB
  </text>

  <!-- 5 stage boxes -->
  ${[
    { name: 'IF',  color: '#80d4ff', x:  40, fullName: 'Instruction Fetch' },
    { name: 'ID',  color: '#80f0a0', x: 220, fullName: 'Decode + Reg Read' },
    { name: 'EX',  color: '#f0d080', x: 400, fullName: 'Execute / ALU' },
    { name: 'MEM', color: '#ff8060', x: 580, fullName: 'Memory Access' },
    { name: 'WB',  color: '#c080ff', x: 760, fullName: 'Write Back' },
  ].map(({ name, color, x, fullName }) => `
    <rect x="${x}" y="100" width="120" height="160" rx="10" fill="url(#mipsStage)" stroke="${color}" stroke-width="2"/>
    <text direction="ltr" x="${x + 60}" y="138" text-anchor="middle" fill="${color}" font-weight="bold" font-size="22">${name}</text>
    <text direction="ltr" x="${x + 60}" y="162" text-anchor="middle" fill="#a0c0e0" font-size="11">${fullName}</text>
  `).join('')}

  <!-- Stage roles (inside boxes) -->
  <text direction="ltr" x="100" y="190" text-anchor="middle" fill="#80a0c0" font-size="10">read PC</text>
  <text direction="ltr" x="100" y="206" text-anchor="middle" fill="#80a0c0" font-size="10">fetch instr</text>
  <text direction="ltr" x="100" y="222" text-anchor="middle" fill="#80a0c0" font-size="10">PC += 4</text>

  <text direction="ltr" x="280" y="190" text-anchor="middle" fill="#80a0c0" font-size="10">decode op</text>
  <text direction="ltr" x="280" y="206" text-anchor="middle" fill="#80a0c0" font-size="10">read rs, rt</text>
  <text direction="ltr" x="280" y="222" text-anchor="middle" fill="#80a0c0" font-size="10">sign-extend imm</text>

  <text direction="ltr" x="460" y="190" text-anchor="middle" fill="#80a0c0" font-size="10">ALU compute</text>
  <text direction="ltr" x="460" y="206" text-anchor="middle" fill="#80a0c0" font-size="10">branch target</text>
  <text direction="ltr" x="460" y="222" text-anchor="middle" fill="#80a0c0" font-size="10">addr for ld/st</text>

  <text direction="ltr" x="640" y="190" text-anchor="middle" fill="#80a0c0" font-size="10">DMEM read</text>
  <text direction="ltr" x="640" y="206" text-anchor="middle" fill="#80a0c0" font-size="10">DMEM write</text>
  <text direction="ltr" x="640" y="222" text-anchor="middle" fill="#80a0c0" font-size="10">(if ld/st)</text>

  <text direction="ltr" x="820" y="190" text-anchor="middle" fill="#80a0c0" font-size="10">write rd</text>
  <text direction="ltr" x="820" y="206" text-anchor="middle" fill="#80a0c0" font-size="10">in reg file</text>

  <!-- Pipeline registers (between stages) -->
  ${[
    { x: 165, label: 'IF/ID' },
    { x: 345, label: 'ID/EX' },
    { x: 525, label: 'EX/MEM' },
    { x: 705, label: 'MEM/WB' },
  ].map(({ x, label }) => `
    <rect x="${x}" y="120" width="50" height="120" rx="4" fill="url(#mipsPipeReg)" stroke="#f0d080" stroke-width="1.6"/>
    <text direction="ltr" x="${x + 25}" y="180" text-anchor="middle" fill="#f0d080" font-weight="bold" font-size="10">${label}</text>
    <text direction="ltr" x="${x + 25}" y="194" text-anchor="middle" fill="#a08040" font-size="9">latch</text>
  `).join('')}

  <!-- Footer note -->
  <text direction="ltr" x="490" y="304" text-anchor="middle" fill="#a0a0c0" font-size="11" font-style="italic">
    pipeline registers (IF/ID, ID/EX, EX/MEM, MEM/WB) capture stage outputs on every rising clk edge
  </text>
  <text direction="ltr" x="490" y="324" text-anchor="middle" fill="#80f0a0" font-size="11" font-weight="bold">
    Ideal throughput:  1 instruction / cycle  •  Latency per instr:  5 cycles
  </text>
  <text direction="ltr" x="490" y="342" text-anchor="middle" fill="#ff8060" font-size="11">
    Hazards (RAW data, control, structural) reduce real throughput &lt; 1 IPC unless mitigated.
  </text>
</svg>`,
    parts: [
      {
        label: 'א',
        question: 'הסבר על העקרונות של MIPS 5-stage pipeline.',
        hints: [
          '5 שלבים: IF (fetch) → ID (decode + reg read) → EX (ALU) → MEM (load/store) → WB (writeback).',
          'בין כל שני שלבים יש pipeline register שלוכד את הנתונים בקצה עולה של ה-clock.',
          '3 סוגי hazards: Data (RAW), Control (branch), Structural (משאב משותף).',
          'פתרונות: Forwarding ל-data, Predict+flush או delay-slot ל-control, Harvard (IMEM/DMEM נפרדים) ל-structural.',
          'Throughput אידיאלי = 1 IPC; latency של הוראה בודדת = 5 cycles.',
        ],
        answer:
`### 5 שלבי ה-pipeline

| שלב | שם מלא | מה עושים |
|-----|--------|----------|
| **IF**  | Instruction Fetch | קוראים את ההוראה מ-IMEM לפי \`PC\`; \`PC ← PC + 4\` |
| **ID**  | Instruction Decode + Reg Read | מפענחים opcode, קוראים את \`rs\` ו-\`rt\` מ-Register File, sign-extend ל-immediate |
| **EX**  | Execute / Address Calc | ALU: או פעולה אריתמטית, או כתובת branch (\`PC+offset\`), או כתובת load/store (\`rs+imm\`) |
| **MEM** | Memory Access | load/store: קריאה/כתיבה ל-DMEM. הוראות אחרות "נחות" שלב. |
| **WB**  | Write Back | כותבים תוצאה (מ-ALU או DMEM) לרגיסטר היעד \`rd\` ב-Register File |

**Pipeline registers** (\`IF/ID\`, \`ID/EX\`, \`EX/MEM\`, \`MEM/WB\`) מפרידים בין השלבים — בכל קצה עולה של clock לוכדים את הביניים, וכל שלב עובד על ההוראה הבאה במקביל.

**Throughput אידיאלי:** \`1 IPC\` (instruction per cycle). **Latency** של הוראה בודדת = 5 cycles. במציאות, hazards מורידים את ה-throughput.

### 3 סוגי Hazards

**1. Data Hazard (RAW = Read After Write).** הוראה משתמשת ב-rs/rt שעוד לא נכתב ע"י הוראה קודמת.
- **Forwarding (Bypassing):** מעבירים תוצאה ישירות מ-EX/MEM או MEM/WB חזרה לכניסת ALU.
- **Stall:** אם forwarding לא מספיק (load-use), מכניסים bubble של 1 cycle.

**2. Control Hazard (Branch).** \`beq\` מחושב ב-EX → IF/ID כבר התחילו עם 2 הוראות הבאות. אם branch נלקח, הן פסולות.
- **Pipeline Flush** (מחיקת 2 הוראות, עלות 2 cycles).
- **Branch Prediction** (predict-not-taken, 2-bit saturating counter, BTB).
- **Branch Delay Slot** (MIPS Classic): המהדר מבטיח שההוראה שמיד אחרי branch תמיד מבוצעת.

**3. Structural Hazard.** שני שלבים מתחרים על אותו משאב.
- **Harvard architecture:** IMEM ל-instructions, DMEM ל-data, נפרדים. זה הסטנדרט ב-MIPS.

### סיכום

| Hazard | סיבה | פתרון עיקרי |
|--------|------|--------------|
| Data (RAW)   | תלות נתונים בין הוראות קרובות | Forwarding + stall ל-load-use |
| Control      | branch מחושב מאוחר          | Predict + flush (או delay slot) |
| Structural   | תחרות על משאב             | Split resources (IMEM/DMEM) |

**שאלות המשך נפוצות:** "כמה הוראות פעילות במקביל?" (5, אחת לכל שלב). "כמה bubbles עלות misprediction?" (2 ב-MIPS Classic, 15-20 ב-CPU מודרני). "מה אם branch מחושב ב-ID במקום ב-EX?" (1 bubble במקום 2, אבל ID נעשה מאריך).`,
        interviewerMindset:
`שאלה open-ended שמוכיחה אם המועמד **באמת** מכיר את ה-MIPS pipeline או רק שמע עליו.

**מה המראיין מקשיב לזה?**
1. **שמות 5 השלבים בסדר נכון** — אם המועמד מתחיל מ-decode במקום fetch, זה דגל אדום.
2. **Pipeline registers כדבר נפרד** — לא רק "השלבים נעים" אלא "ה-registers לוכדים".
3. **3 סוגי hazards בשם הנכון** — Data/Control/Structural. רוב המועמדים זוכרים שניים, שוכחים structural.
4. **שמסביר למה כל פתרון עובד** — לא רק "forwarding" אלא "מעבירים את ה-EX/MEM register output חזרה ל-ALU input".

**שאלת המשך אהובה:** "תן דוגמה של load-use hazard ולמה forwarding לא פותר אותה." — ה-data עדיין מגיע מ-DMEM ב-MEM stage, מאוחר מדי. חייב לחכות. סיגנל לעומק אמיתי.`,
        expectedAnswers: [
          'IF', 'ID', 'EX', 'MEM', 'WB',
          'fetch', 'decode', 'execute', 'memory', 'write back', 'writeback',
          'pc', 'alu', 'register file', 'reg file',
          'imem', 'dmem', 'sign extend', 'sign-extend',
          'pipeline register',
          'data hazard', 'raw', 'read after write',
          'control hazard', 'branch hazard',
          'structural hazard',
          'forwarding', 'bypass', 'bypassing',
          'stall', 'bubble',
          'flush', 'predict', 'prediction',
          'delay slot',
          'harvard',
        ],
      },
    ],
    source: 'IQ/PP — מצגת שאלות מעגלים, שקף 12 (MIPS 5-stage)',
    tags: ['mips', 'pipeline', '5-stage', 'hazards', 'forwarding', 'branch', 'architecture'],
  },
];
